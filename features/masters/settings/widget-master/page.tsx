"use client";
import { useCallback, useMemo, useState } from "react";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import { SearchableSelect } from "@/components/design-system/ui/searchable-select";
import CrudMasterPage from "@/components/master/crud-master-page";
import {
  getFirstDefinedValue,
  toDisplayValue,
  toNonNegativeInteger,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
  useMasterOptions,
} from "@/features/masters/shared";
import { useApi } from "@/hooks/useApi";
import baseStyles from "@/app/master/state-master/page.module.scss";
import styles from "./page.module.scss";
import FieldsEditor, { parseFieldDrafts, serializeFieldDrafts } from "./fields-editor";
import type { WidgetFieldDraft, WidgetPlatform, WidgetTypeFilter } from "./type";
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
const SECTION_ID_KEYS = ["sectionId", "section_id", "id", "_id"] as const;
const SECTION_MENU_ID_KEYS = ["sectionMenuId", "section_menu_id", "menuId", "menu_id"] as const;
const SECTION_NAME_KEYS = ["sectionName", "section_name", "name"] as const;
const SECTION_GUI_NAME_KEYS = ["sectionGuiName", "section_gui_name", "guiName"] as const;
const  SECTION_PLATFORM_KEYS = ["sectionPlatform", "section_platform", "platform", "type"] as const;
const SECTION_VISIBILITY_KEYS = [
  "sectionVisibility",
  "section_visibility",
  "visible",
  "isVisible",
] as const;
const SECTION_POSITION_KEYS = ["sectionPosition", "section_position", "position", "sort"] as const;
const SECTION_FIELDS_KEYS = ["fields", "field", "sectionFields"] as const;
const RESPONSE_ARRAY_KEYS = ["data", "items", "results", "rows", "list", "sections"] as const;
const WIDGET_PLATFORM_OPTIONS: Array<{ label: string; value: WidgetPlatform }> = [
  { label: "Desktop", value: "Desktop" },
  { label: "Mobile", value: "Mobile" },
  { label: "Web", value: "Web" },
];
const FILTER_PLATFORM_OPTIONS: Array<{ label: string; value: WidgetTypeFilter }> = [
  { label: "All Platforms", value: "all" },
  ...WIDGET_PLATFORM_OPTIONS,
];
// `sectionMenuId` is a FK to a menu/screen. The menu list is fetched and shown
// as a searchable dropdown: the label is the menu name, the stored value is the
// menu id. The endpoint returns a nested tree, so the rows are flattened first.
const MENU_ENDPOINT = "/menu-masters/get";
const MENU_ID_KEYS = ["menuId", "menu_id", "id"] as const;
const MENU_NAME_KEYS = ["menuName", "menu_name", "name"] as const;
const MENU_CHILDREN_KEYS = ["children", "items", "subMenus"] as const;
const DEFAULT_MENU_OPTION: ERPDynamicSelectOption = { value: "", label: "Select menu" };
const MENU_LOOKUP_QUERY = { activeOnly: "true" } as const;
const MENU_LOOKUP_DEFINITION = {
  query: MENU_LOOKUP_QUERY,
  defaultOption: DEFAULT_MENU_OPTION,
  idKeys: MENU_ID_KEYS,
  labelKeys: MENU_NAME_KEYS,
} as const;
/** Walk the nested menu payload into a flat list so every menu (parent + leaf) is selectable. */
function flattenMenuRecords(payload: unknown): Record<string, unknown>[] {
  const root =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).data ?? payload
      : payload;
  const flat: Record<string, unknown>[] = [];
  const walk = (nodes: unknown): void => {
    if (!Array.isArray(nodes)) {
      return;
    }
    for (const node of nodes) {
      if (!node || typeof node !== "object" || Array.isArray(node)) {
        continue;
      }
      const record = node as Record<string, unknown>;
      flat.push(record);
      for (const key of MENU_CHILDREN_KEYS) {
        walk(record[key]);
      }
    }
  };
  walk(root);
  return flat;
}
function toWidgetPlatform(value: unknown, fallback: WidgetPlatform = "Desktop"): WidgetPlatform {
  const normalized = toDisplayValue(value).trim().toLowerCase();
  if (normalized === "mobile") {
    return "Mobile";
  }
  if (normalized === "desktop") {
    return "Desktop";
  }
  if (normalized === "web") {
    return "Web";
  }
  return fallback;
}
function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value > 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on", "visible"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "n", "off", "hidden"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}
function getSectionFields(source: Record<string, unknown> | null | undefined): Record<string, unknown>[] {
  if (!source) {
    return [];
  }
  const value = getFirstDefinedValue(source, SECTION_FIELDS_KEYS);
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}
function extractSectionsArray(source: Record<string, unknown> | null): Record<string, unknown>[] {
  if (!source) {
    return [];
  }
  const value = getFirstDefinedValue(source, RESPONSE_ARRAY_KEYS);
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}
function fieldPayloadToDraft(field: Record<string, unknown>): WidgetFieldDraft {
  const rawId = getFirstDefinedValue(field, ["fieldId", "field_id", "id"]);
  const fieldId =
    typeof rawId === "number"
      ? rawId
      : typeof rawId === "string" && rawId.trim() !== "" && Number.isFinite(Number(rawId))
        ? Number(rawId)
        : undefined;
  return {
    ...(fieldId !== undefined ? { fieldId } : {}),
    fieldName: toDisplayValue(getFirstDefinedValue(field, ["fieldName", "field_name", "name"])),
    fieldGuiName: toDisplayValue(getFirstDefinedValue(field, ["fieldGuiName", "field_gui_name", "guiName"])),
    fieldSecondaryText: toDisplayValue(
      getFirstDefinedValue(field, ["fieldSecondaryText", "field_secondary_text", "secondaryText"]),
    ),
    fieldPosition: toDisplayValue(getFirstDefinedValue(field, ["fieldPosition", "field_position", "position"])) || "0",
    fieldVisibility: toBoolean(
      getFirstDefinedValue(field, ["fieldVisibility", "field_visibility", "visible"]),
      true,
    ),
  };
}
function buildCreateDefaults(
  platformFilter: WidgetTypeFilter,
  menuIdFilter: string,
): Record<string, string> {
  return {
    sectionName: "",
    sectionGuiName: "",
    sectionMenuId: menuIdFilter || "",
    sectionPosition: "0",
    sectionPlatform: platformFilter === "all" ? "Desktop" : platformFilter,
    sectionVisibility: "true",
    fields: serializeFieldDrafts([]),
  };
}
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
          custom: (rawValue) => {
            const namelessRow = parseFieldDrafts(rawValue).some(
              (draft) =>
                draft.fieldName.trim().length === 0 &&
                [draft.fieldGuiName, draft.fieldSecondaryText].some(
                  (column) => (column ?? "").trim().length > 0,
                ),
            );
            return namelessRow
              ? "Each field needs a Field Name (the internal key, e.g. item_name). Fill it in or remove the row."
              : null;
          },
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
  // be bound on every list request via the `grid_param` query field — an unbound
  // token is what makes the run 500. The filters supply the values; an empty menu
  // falls back to "0" so section_menu_id (integer) stays valid and simply matches
  // nothing, and "All Platforms" sends "" for the same reason.
  const buildListQuery = useCallback(
    ({
      searchTerm,
      currentPage,
      pageSize,
    }: {
      searchTerm: string;
      currentPage: number;
      pageSize: number;
    }): Record<string, string> => ({
      page: String(currentPage),
      limit: String(pageSize),
      ...(searchTerm ? { search: searchTerm } : {}),
      grid_param: JSON.stringify({
        menuid: menuIdFilter.trim() || "0",
        platform: platformFilter === "all" ? "" : platformFilter,
      }),
    }),
    [menuIdFilter, platformFilter],
  );
  const filterSummary = useMemo(() => {
    const platformLabel =
      FILTER_PLATFORM_OPTIONS.find((option) => option.value === platformFilter)?.label ??
      "All Platforms";
    const menuLabel = menuIdFilter
      ? menuFilterOptions.find((option) => option.value === menuIdFilter)?.label ??
        `Menu #${menuIdFilter}`
      : "All Menus";
    return `${platformLabel} • ${menuLabel}`;
  }, [menuFilterOptions, menuIdFilter, platformFilter]);
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
    ({ rowSource }: { recordId: string | number; action: "view" | "update"; rowSource: Record<string, unknown> | null }) => {
      const sectionMenuId = rowSource
        ? toDisplayValue(getFirstDefinedValue(rowSource, SECTION_MENU_ID_KEYS))
        : menuIdFilter;
      const platform = rowSource
        ? toWidgetPlatform(
            getFirstDefinedValue(rowSource, SECTION_PLATFORM_KEYS),
            platformFilter === "all" ? "Desktop" : platformFilter,
          )
        : platformFilter !== "all"
          ? platformFilter
          : null;
      return {
        query: {
          ...(sectionMenuId ? { sectionMenuId } : {}),
          ...(platform ? { sectionPlatform: platform } : {}),
        },
      };
    },
    [menuIdFilter, platformFilter],
  );
  return (
    <CrudMasterPage
      title="Widget Master"
      entityLabel="section"
      entityLabelPlural="sections"
      apiEndpoints={API_ENDPOINTS}
      buildListQuery={buildListQuery}
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
      customFields={widgetFormFields}
      createInitialValues={createInitialValues}
      gridTableName={GRID_TABLE_NAME}
      gridDetailId={GRID_DETAIL_ID}
      toolbarContent={toolbarContent}
      listStateResetKey={`${platformFilter}:${menuIdFilter}`}
      buildGetByIdRequest={buildGetByIdRequest}
      augmentDetailSource={({ recordId, source, rowSource }) => {
        // `source` is the GET /get envelope ({ data: Section[] }); match by id.
        const sections = extractSectionsArray(source);
        const match = sections.find(
          (section) =>
            String(getFirstDefinedValue(section, SECTION_ID_KEYS)) === String(recordId),
        );
        return match ?? rowSource ?? null;
      }}
      mapFormValues={({ source }) => {
        const rowSource = source ?? {};
        const drafts = getSectionFields(rowSource).map(fieldPayloadToDraft);
        return {
          sectionName: toDisplayValue(getFirstDefinedValue(rowSource, SECTION_NAME_KEYS)) || "",
          sectionGuiName:
            toDisplayValue(getFirstDefinedValue(rowSource, SECTION_GUI_NAME_KEYS)) || "",
          sectionMenuId:
            toDisplayValue(getFirstDefinedValue(rowSource, SECTION_MENU_ID_KEYS)) || "",
          sectionPosition:
            toDisplayValue(getFirstDefinedValue(rowSource, SECTION_POSITION_KEYS)) || "0",
          sectionPlatform: toWidgetPlatform(
            getFirstDefinedValue(rowSource, SECTION_PLATFORM_KEYS),
            platformFilter === "all" ? "Desktop" : platformFilter,
          ),
          sectionVisibility: toSelectBoolean(
            getFirstDefinedValue(rowSource, SECTION_VISIBILITY_KEYS),
            "true",
          ),
          fields: serializeFieldDrafts(drafts),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const fields = parseFieldDrafts(values.fields)
          .map((draft) => ({
            ...(draft.fieldId !== undefined ? { fieldId: draft.fieldId } : {}),
            fieldName: draft.fieldName.trim(),
            fieldGuiName: toNullableString(draft.fieldGuiName ?? ""),
            fieldSecondaryText: toNullableString(draft.fieldSecondaryText ?? ""),
            fieldPosition: toNonNegativeInteger(draft.fieldPosition ?? "0", 0),
            fieldVisibility: (draft.fieldVisibility ?? true) !== false,
          }))
          .filter((field) => field.fieldName.length > 0);
        return {
          sectionMenuId: toNonNegativeInteger(values.sectionMenuId ?? "", 0),
          sectionName: (values.sectionName ?? "").trim(),
          sectionGuiName: (values.sectionGuiName ?? "").trim(),
          sectionPosition: toNonNegativeInteger(values.sectionPosition ?? "0", 0),
          sectionVisibility: (values.sectionVisibility ?? "true") === "true",
          sectionPlatform: toWidgetPlatform(values.sectionPlatform),
          fields,
          ...(shouldUpdate ? { sectionId: toUpdateId(editingItemId) } : {}),
        };
      }}
    />
  );
}