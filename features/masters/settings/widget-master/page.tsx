"use client";
import { useCallback, useMemo, useState } from "react";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import { SearchableSelect } from "@/components/design-system/ui/searchable-select";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useMasterOptions } from "@/features/masters/shared";
import { useApi } from "@/hooks/useApi";
import baseStyles from "@/app/master/state-master/page.module.scss";
import styles from "./page.module.scss";
import FieldsEditor from "./fields-editor";
import {
  FILTER_PLATFORM_OPTIONS,
  WIDGET_PLATFORM_OPTIONS,
  buildCreateDefaults,
  buildFilterSummary,
  buildListEmptyText,
  buildWidgetGetByIdQuery,
  buildWidgetListQuery,
  buildWidgetRequestPayload,
  fieldsValidationMessage,
  flattenMenuRecords,
  mapWidgetFormValues,
  pickDetailSection,
} from "./widget-master";
import type { WidgetTypeFilter } from "./type";
const API_ENDPOINTS = {
  // List rows + table columns/visibility/grid-settings come from the configured
  // grid (grid_id 46 → SELECT … FROM fixed.form_section). The edit flow still
  // re-fetches GET /widget-masters/get (which nests each section's fields) and
  // matches the section client-side; create/delete keep their own endpoints.
  list: "/configured-grid-sql/run?grid_id=46",
  getById: "/widget-masters/get",
  create: "/widget-masters/create",
  delete: "/widget-masters/delete",
} as const;
// Drives the configured-grid columns query (GET /configured-grid-sql/columns?grid_id=46)
// and grid-settings menu. The numeric id is authoritative via `gridDetailId`.
const GRID_DETAIL_ID = 46;
const GRID_TABLE_NAME = "form_section";
const LOOKUP_KEYS = {
  id: ["sectionId", "section_id", "id", "_id"],
  code: ["sectionName", "section_name", "name"],
  name: ["sectionName", "section_name", "name"],
  short: ["sectionPlatform", "section_platform", "platform"],
  alias: ["sectionPlatform", "section_platform", "platform"],
  active: ["sectionVisibility", "section_visibility", "visible", "isVisible"],
  position: ["sectionPosition", "section_position", "position", "sort"],
  description: ["sectionName", "section_name"],
  array: ["data", "items", "results", "rows", "list", "sections"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "sectionId",
  name: "sectionName",
  alias: "sectionPlatform",
  short: "sectionPlatform",
  description: "sectionName",
  sort: "sectionPosition",
} as const;
// `sectionMenuId` is a FK to a menu/screen. The menu list is fetched and shown
// as a searchable dropdown: the label is the menu name, the stored value is the
// menu id. The endpoint returns a nested tree, so the rows are flattened first.
const MENU_ENDPOINT = "/menu-masters/get";
const MENU_ID_KEYS = ["menuId", "menu_id", "id"] as const;
const MENU_NAME_KEYS = ["menuName", "menu_name", "name"] as const;
const DEFAULT_MENU_OPTION: ERPDynamicSelectOption = { value: "", label: "Select menu" };
// GET /menu-masters/get only whitelists `visibleOnly` (GetMenuQueryDto). The server's
// global ValidationPipe runs with forbidNonWhitelisted, so any other param (previously
// `activeOnly`) 400s — the lookup then swallows the error and the dropdown shows no menus.
const MENU_LOOKUP_QUERY = { visibleOnly: "true" } as const;
const MENU_LOOKUP_DEFINITION = {
  query: MENU_LOOKUP_QUERY,
  defaultOption: DEFAULT_MENU_OPTION,
  idKeys: MENU_ID_KEYS,
  labelKeys: MENU_NAME_KEYS,
} as const;
export default function WidgetMasterPage() {
  const [platformFilter, setPlatformFilter] = useState<WidgetTypeFilter>("all");
  const [menuIdFilter, setMenuIdFilter] = useState<string>("");
  const { getAll: getMenus } = useApi<unknown>(MENU_ENDPOINT);
  // Flatten the nested menu tree before useMasterOptions maps it to {label, value}.
  const loadMenuOptions = useCallback(
    async (query?: Record<string, string>) => ({
      data: flattenMenuRecords(await getMenus(query)),
    }),
    [getMenus],
  );
  const { options: menuOptions, loading: menusLoading } = useMasterOptions({
    definition: MENU_LOOKUP_DEFINITION,
    load: loadMenuOptions,
  });
  // The toolbar filter reuses the form's menu list, minus the empty "Select menu"
  // placeholder so an unset filter renders as "All Menus" rather than a blank pick.
  const menuFilterOptions = useMemo(
    () => menuOptions.filter((option) => option.value !== ""),
    [menuOptions],
  );
  const widgetFormFields = useMemo<ERPDynamicModalField[]>(
    () => [
      {
        name: "sectionName",
        label: "Section Name",
        colSpan: 2,
        required: true,
        validation: {
          minLength: 2,
          minLengthMessage: "Section Name must be at least 2 characters.",
        },
      },
      {
        name: "sectionGuiName",
        label: "GUI Name",
        colSpan: 2,
        required: true,
        helperText: "Display name shown in the Widget column.",
        validation: {
          minLength: 2,
          minLengthMessage: "GUI Name must be at least 2 characters.",
        },
      },
      {
        name: "sectionMenuId",
        label: "Menu",
        type: "select",
        searchable: true,
        required: true,
        // Shows the menu name; the selected option's value (the menu id) is what
        // is stored in form state and sent to the API.
        options: menuOptions,
        disabled: menusLoading,
        placeholder: menusLoading ? "Loading menus…" : "Search menu",
        helperText: "Screen this section belongs to.",
        validation: {
          requiredMessage: "Select a menu.",
        },
      },
      {
        name: "sectionPlatform",
        label: "Platform",
        type: "select",
        required: true,
        options: WIDGET_PLATFORM_OPTIONS,
      },
      {
        name: "sectionPosition",
        label: "Position",
        type: "number",
        min: 0,
        step: 1,
        validation: {
          minMessage: "Position must be 0 or greater.",
        },
      },
      {
        name: "sectionVisibility",
        label: "Visible in UI",
        type: "checkbox",
        helperText: "Unchecked sections stay saved but hidden from the interface.",
      },
      {
        name: "fields",
        label: "Fields",
        type: "custom",
        colSpan: 2,
        helperText: "Fields under this section. Sent as fields[] on save.",
        validation: {
          // Rows whose Field Name is blank are dropped from the payload on save
          // (the server requires fieldName). Block the save and explain why so
          // the user does not silently end up sending fields: [].
          custom: (rawValue) => fieldsValidationMessage(rawValue),
        },
        render: ({ value, setValue, disabled }) => (
          <FieldsEditor value={value} onChange={setValue} disabled={disabled} />
        ),
      },
    ],
    [menuOptions, menusLoading],
  );
  const createInitialValues = useMemo(
    () => buildCreateDefaults(platformFilter, menuIdFilter),
    [menuIdFilter, platformFilter],
  );
  // grid 46's stored SQL filters strictly on its `menuid` and `platform` tokens
  // (`… where section_menu_id=menuid and section_platform=platform`), so both must
  // be bound on every list request via the `grid_param` query field — omitting
  // either key leaves a bare identifier in the SQL and the run 400s ("column
  // \"menuid\" does not exist"). Both values come from the toolbar filters, and
  // until BOTH are picked there is no request worth sending: the tokens are plain
  // equality with no match-all escape, so a placeholder menuid "0" / platform ""
  // could only ever return zero rows. Returning null skips the fetch entirely.
  const buildListQuery = useCallback(
    ({
      searchTerm,
      currentPage,
      pageSize,
    }: {
      searchTerm: string;
      currentPage: number;
      pageSize: number;
    }): Record<string, string> | null =>
      buildWidgetListQuery({ searchTerm, currentPage, pageSize, menuIdFilter, platformFilter }),
    [menuIdFilter, platformFilter],
  );
  // Explains the empty table while the filters are incomplete, so it does not
  // read as "this menu has no sections".
  const listEmptyText = useMemo(
    () => buildListEmptyText(menuIdFilter, platformFilter),
    [menuIdFilter, platformFilter],
  );
  const filterSummary = useMemo(
    () => buildFilterSummary(platformFilter, menuIdFilter, menuFilterOptions),
    [menuFilterOptions, menuIdFilter, platformFilter],
  );
  const toolbarContent = useMemo(
    () => (
      <div className={styles.filterToolbar}>
        <div className={styles.filterGroup}>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Platform</span>
            <select
              className={styles.filterSelect}
              value={platformFilter}
              onChange={(event) => setPlatformFilter(event.target.value as WidgetTypeFilter)}
            >
              {FILTER_PLATFORM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.filterField}>
            <span className={styles.filterLabel}>Menu</span>
            <SearchableSelect
              value={menuIdFilter}
              options={menuFilterOptions}
              onChange={setMenuIdFilter}
              disabled={menusLoading}
              placeholder={menusLoading ? "Loading menus…" : "All Menus"}
              searchPlaceholder="Search menu"
              emptyText="No menus found."
            />
          </div>
        </div>
        <div className={styles.summaryPane}>
          <span className={styles.summaryBadge}>{filterSummary}</span>
          <span className={styles.summaryMeta}>
            Search matches section names and any field name.
          </span>
        </div>
      </div>
    ),
    [filterSummary, menuFilterOptions, menuIdFilter, menusLoading, platformFilter],
  );
  const buildGetByIdRequest = useCallback(
    ({ rowSource }: { recordId: string | number; action: "view" | "update"; rowSource: Record<string, unknown> | null }) =>
      buildWidgetGetByIdQuery({ rowSource, menuIdFilter, platformFilter }),
    [menuIdFilter, platformFilter],
  );
  return (
    <CrudMasterPage
      modalDraftKey="widget-master"
      title="Widget Master"
      entityLabel="section"
      entityLabelPlural="sections"
      apiEndpoints={API_ENDPOINTS}
      buildListQuery={buildListQuery}
      listEmptyText={listEmptyText}
      listResponseStyleArrayKey=""
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={baseStyles}
      listTitle="Widget Sections"
      createLabel="Add Section"
      formTitle="Widget Section Form"
      formDescription="Create and update widget sections and their fields."
      createModalTitle="Widget Section Entry"
      editModalTitle="Edit Widget Section Entry"
      // Widen the modal (default is 64rem) so the Fields editor table has room.
      modalPanelStyle={{ width: "min(80rem, calc(calc(100vw/var(--erp-ui-scale)) - 2.4rem))" }}
      customFields={widgetFormFields}
      createInitialValues={createInitialValues}
      gridTableName={GRID_TABLE_NAME}
      gridDetailId={GRID_DETAIL_ID}
      toolbarContent={toolbarContent}
      listStateResetKey={`${platformFilter}:${menuIdFilter}`}
      buildGetByIdRequest={buildGetByIdRequest}
      augmentDetailSource={pickDetailSection}
      mapFormValues={({ source }) => mapWidgetFormValues({ source, platformFilter })}
      buildRequestPayload={buildWidgetRequestPayload}
    />
  );
}