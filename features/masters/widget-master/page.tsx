"use client";
import { useCallback, useMemo, useState } from "react";
import type { ERPDynamicModalField } from "@/components/design-system/ui/dynamic-modal-form";
import CrudMasterPage, { type CrudMasterTableRow } from "@/components/master/crud-master-page";
import type { ReusableTableColumn } from "@/components/ui/table";
import {
  getFirstDefinedValue,
  toDisplayValue,
  toNonNegativeInteger,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
} from "@/features/masters/shared";
import baseStyles from "@/app/master/state-master/page.module.scss";
import styles from "./page.module.scss";
import type { VisibilityFilter, WidgetPlatform, WidgetTypeFilter } from "./type";
const API_ENDPOINTS = {
  list: "/widget-masters/list",
  getById: "/widget-masters/get",
  create: "/widget-masters/create",
  delete: "/widget-masters/delete",
} as const;
const LOOKUP_KEYS = {
  id: ["widgetNo", "widget_no", "id", "_id"],
  code: ["widgetGuiName", "widget_gui_name", "guiName", "gui_name"],
  name: ["widgetName", "widget_name", "name"],
  short: ["widgetSecondaryText", "widget_secondary_text", "secondaryText", "secondary_text"],
  alias: ["widgetType", "widget_type", "type"],
  active: ["widgetVisibility", "widget_visibility", "visible", "isVisible"],
  position: ["widgetPosition", "widget_position", "position", "sort"],
  description: ["widgetSecondaryText", "widget_secondary_text", "secondaryText", "secondary_text"],
  array: ["data", "items", "results", "rows", "list", "widgets"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "widgetNo",
  name: "widgetName",
  alias: "widgetGuiName",
  short: "widgetSecondaryText",
  description: "widgetSecondaryText",
  sort: "widgetPosition",
} as const;
const WIDGET_GROUP_ID_KEYS = ["widgetGroupId", "widget_group_id", "groupId", "group_id"] as const;
const WIDGET_GUI_NAME_KEYS = ["widgetGuiName", "widget_gui_name", "guiName", "gui_name"] as const;
const WIDGET_TYPE_KEYS = ["widgetType", "widget_type", "type"] as const;
const WIDGET_VISIBILITY_KEYS = ["widgetVisibility", "widget_visibility", "visible", "isVisible"] as const;
const WIDGET_SECONDARY_TEXT_KEYS = [
  "widgetSecondaryText",
  "widget_secondary_text",
  "secondaryText",
  "secondary_text",
] as const;
const WIDGET_NUMBER_KEYS = ["widgetNo", "widget_no", "id", "_id"] as const;
const WIDGET_PLATFORM_OPTIONS: Array<{ label: string; value: WidgetPlatform }> = [
  { label: "Desktop", value: "desktop" },
  { label: "Mobile", value: "mobile" },
  { label: "Web", value: "web" },
];
const FILTER_PLATFORM_OPTIONS: Array<{ label: string; value: WidgetTypeFilter }> = [
  { label: "All Platforms", value: "all" },
  ...WIDGET_PLATFORM_OPTIONS,
];
const FILTER_VISIBILITY_OPTIONS: Array<{ label: string; value: VisibilityFilter }> = [
  { label: "All States", value: "all" },
  { label: "Visible Only", value: "visible" },
  { label: "Hidden Only", value: "hidden" },
];
function toWidgetPlatform(value: unknown, fallback: WidgetPlatform = "desktop"): WidgetPlatform {
  const normalized = toDisplayValue(value).toLowerCase();
  if (normalized === "mobile" || normalized === "desktop" || normalized === "web") {
    return normalized;
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
function getSourceValue(row: CrudMasterTableRow, keys: readonly string[]): unknown {
  if (!row.__source) {
    return undefined;
  }
  return getFirstDefinedValue(row.__source, keys);
}
function getWidgetNumber(row: CrudMasterTableRow): number {
  return toNonNegativeInteger(toDisplayValue(getSourceValue(row, WIDGET_NUMBER_KEYS) ?? row.masterId), 0);
}
function getWidgetGroupId(row: CrudMasterTableRow): number {
  return toNonNegativeInteger(
    toDisplayValue(getSourceValue(row, WIDGET_GROUP_ID_KEYS)),
    0,
  );
}
function getWidgetGuiName(row: CrudMasterTableRow): string {
  return toDisplayValue(getSourceValue(row, WIDGET_GUI_NAME_KEYS)) || row.masterCode;
}
function getWidgetType(row: CrudMasterTableRow): WidgetPlatform {
  return toWidgetPlatform(getSourceValue(row, WIDGET_TYPE_KEYS) ?? row.masterAlias);
}
function getWidgetVisibility(row: CrudMasterTableRow): boolean {
  return toBoolean(getSourceValue(row, WIDGET_VISIBILITY_KEYS) ?? row.masterActive, true);
}
function getWidgetSecondaryText(row: CrudMasterTableRow): string {
  return toDisplayValue(getSourceValue(row, WIDGET_SECONDARY_TEXT_KEYS));
}
function getPlatformClassName(widgetType: WidgetPlatform): string {
  if (widgetType === "mobile") {
    return styles.platformMobile;
  }
  if (widgetType === "web") {
    return styles.platformWeb;
  }
  return styles.platformDesktop;
}
function getVisibilityClassName(widgetVisibility: boolean): string {
  return widgetVisibility ? styles.visibilityVisible : styles.visibilityHidden;
}
function buildCreateDefaults(
  widgetTypeFilter: WidgetTypeFilter,
  visibilityFilter: VisibilityFilter,
): Record<string, string> {
  return {
    widgetGroupId: "",
    widgetGuiName: "",
    widgetName: "",
    widgetPosition: "0",
    widgetSecondaryText: "",
    widgetType: widgetTypeFilter === "all" ? "desktop" : widgetTypeFilter,
    widgetVisibility:
      visibilityFilter === "hidden"
        ? "false"
        : "true",
  };
}
export default function WidgetMasterPage() {
  const [widgetTypeFilter, setWidgetTypeFilter] = useState<WidgetTypeFilter>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all");
  const widgetFormFields = useMemo<ERPDynamicModalField[]>(
    () => [
      {
        name: "widgetName",
        label: "Widget Name",
        colSpan: 2,
        validation: {
          minLength: 2,
          minLengthMessage: "Widget Name must be at least 2 characters.",
        },
      },
      {
        name: "widgetGuiName",
        label: "Widget GUI Name",
        colSpan: 2,
        helperText: "Optional internal GUI identifier.",
      },
      {
        name: "widgetGroupId",
        label: "Widget Group Id",
        type: "number",
        min: 0,
        step: 1,
        validation: {
          minMessage: "Widget Group Id must be 0 or greater.",
        },
      },
      {
        name: "widgetPosition",
        label: "Widget Position",
        type: "number",
        min: 0,
        step: 1,
        validation: {
          minMessage: "Widget Position must be 0 or greater.",
        },
      },
      {
        name: "widgetType",
        label: "Widget Platform",
        type: "select",
        required: true,
        options: WIDGET_PLATFORM_OPTIONS,
      },
     
      {
        name: "widgetSecondaryText",
        label: "Secondary Text",
        colSpan: 2,
        rows: 3,
        helperText: "Optional supporting line shown under the main widget label.",
      },
       {
        name: "widgetVisibility",
        label: "Visible in UI",
        type: "checkbox",
        helperText: "Unchecked widgets stay saved but hidden from the interface.",
      },
    ],
    [],
  );
  const createInitialValues = useMemo(
    () => buildCreateDefaults(widgetTypeFilter, visibilityFilter),
    [visibilityFilter, widgetTypeFilter],
  );
  const filterSummary = useMemo(() => {
    const platformLabel =
      FILTER_PLATFORM_OPTIONS.find((option) => option.value === widgetTypeFilter)?.label ??
      "All Platforms";
    const visibilityLabel =
      FILTER_VISIBILITY_OPTIONS.find((option) => option.value === visibilityFilter)?.label ??
      "All States";
    return `${platformLabel} • ${visibilityLabel}`;
  }, [visibilityFilter, widgetTypeFilter]);
  const toolbarContent = useMemo(
    () => (
      <div className={styles.filterToolbar}>
        <div className={styles.filterGroup}>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Platform</span>
            <select
              className={styles.filterSelect}
              value={widgetTypeFilter}
              onChange={(event) => setWidgetTypeFilter(event.target.value as WidgetTypeFilter)}
            >
              {FILTER_PLATFORM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Visibility</span>
            <select
              className={styles.filterSelect}
              value={visibilityFilter}
              onChange={(event) => setVisibilityFilter(event.target.value as VisibilityFilter)}
            >
              {FILTER_VISIBILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={styles.summaryPane}>
          <span className={styles.summaryBadge}>{filterSummary}</span>
          <span className={styles.summaryMeta}>
            Detail fetches reuse the widget type filter when available.
          </span>
        </div>
      </div>
    ),
    [filterSummary, visibilityFilter, widgetTypeFilter],
  );
  const customTableColumns = useMemo<ReusableTableColumn<CrudMasterTableRow>[]>(
    () => [
      {
        key: "serialNo",
        header: "S.No",
        accessor: "serialNo",
        width: "12px",
        sortable: false,
      },
      {
        key: "widgetNo",
        header: "Widget No",
        width: "96px",
        render: (row) => getWidgetNumber(row),
        sortAccessor: (row) => getWidgetNumber(row),
      },
      {
        key: "widgetName",
        header: "Widget Name",
        accessor: "masterName",
        width: "240px",
      },
      {
        key: "widgetType",
        header: "Platform",
        width: "118px",
        render: (row) => {
          const widgetType = getWidgetType(row);

          return (
            <span className={`${styles.platformChip} ${getPlatformClassName(widgetType)}`}>
              {widgetType}
            </span>
          );
        },
        sortAccessor: (row) => getWidgetType(row),
        searchAccessor: (row) => getWidgetType(row),
      },
      {
        key: "widgetGroupId",
        header: "Group Id",
        width: "100px",
        render: (row) => getWidgetGroupId(row),
        sortAccessor: (row) => getWidgetGroupId(row),
      },
      {
        key: "widgetGuiName",
        header: "GUI Name",
        width: "220px",
        render: (row) => getWidgetGuiName(row) || "-",
        sortAccessor: (row) => getWidgetGuiName(row),
        searchAccessor: (row) => getWidgetGuiName(row),
      },
      {
        key: "widgetPosition",
        header: "Position",
        accessor: "position",
        width: "96px",
        sortAccessor: (row) => toNonNegativeInteger(row.position, 0),
      },
      {
        key: "widgetVisibility",
        header: "Visibility",
        width: "120px",
        render: (row) => {
          const widgetVisibility = getWidgetVisibility(row);

          return (
            <span
              className={`${styles.visibilityChip} ${getVisibilityClassName(widgetVisibility)}`}
            >
              {widgetVisibility ? "Visible" : "Hidden"}
            </span>
          );
        },
        sortAccessor: (row) => (getWidgetVisibility(row) ? 1 : 0),
        searchAccessor: (row) => (getWidgetVisibility(row) ? "Visible" : "Hidden"),
      },
      {
        key: "widgetSecondaryText",
        header: "Secondary Text",
        width: "240px",
        render: (row) => {
          const secondaryText = getWidgetSecondaryText(row);

          return (
            <span className={styles.secondaryText} title={secondaryText}>
              {secondaryText || "-"}
            </span>
          );
        },
        sortAccessor: (row) => getWidgetSecondaryText(row),
        searchAccessor: (row) => getWidgetSecondaryText(row),
      },
    ],
    [],
  );
  const buildListQuery = useCallback(
    ({
      searchTerm,
      currentPage,
      pageSize,
    }: {
      searchTerm: string;
      currentPage: number;
      pageSize: number;
    }) => ({
      page: String(currentPage),
      limit: String(pageSize),
      ...(searchTerm ? { search: searchTerm } : {}),
      ...(widgetTypeFilter !== "all" ? { widgetType: widgetTypeFilter } : {}),
      ...(visibilityFilter !== "all"
        ? { widgetVisibility: visibilityFilter === "visible" ? "true" : "false" }
        : {}),
    }),
    [visibilityFilter, widgetTypeFilter],
  );
  const buildGetByIdRequest = useCallback(
    ({
      recordId,
      rowSource,
    }: {
      recordId: string | number;
      action: "view" | "update";
      rowSource: Record<string, unknown> | null;
    }) => {
      const widgetType =
        rowSource !== null
          ? toWidgetPlatform(getFirstDefinedValue(rowSource, WIDGET_TYPE_KEYS), "desktop")
          : widgetTypeFilter !== "all"
            ? widgetTypeFilter
            : null;
      return {
        query: {
          widgetNo: String(recordId),
          ...(widgetType ? { widgetType } : {}),
        },
      };
    },
    [widgetTypeFilter],
  );
  return (
    <CrudMasterPage
      title="Widget Master"
      entityLabel="widget"
      entityLabelPlural="widgets"
      apiEndpoints={API_ENDPOINTS}
      listResponseStyleArrayKey=""
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={baseStyles}
      listTitle="Widget List"
      createLabel="Add Widget"
      formTitle="Widget Form"
      formDescription="Create and update widgets."
      customFields={widgetFormFields}
      createInitialValues={createInitialValues}
      customTableColumns={customTableColumns}
      toolbarContent={toolbarContent}
      buildListQuery={buildListQuery}
      listStateResetKey={`${widgetTypeFilter}:${visibilityFilter}`}
      buildGetByIdRequest={buildGetByIdRequest}
      mapFormValues={({ source }) => {
        const rowSource = source ?? {};
        return {
          widgetGroupId:
            toDisplayValue(getFirstDefinedValue(rowSource, WIDGET_GROUP_ID_KEYS)) || "",
          widgetGuiName:
            toDisplayValue(getFirstDefinedValue(rowSource, WIDGET_GUI_NAME_KEYS)) || "",
          widgetName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || "",
          widgetPosition:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) || "0",
          widgetSecondaryText:
            toDisplayValue(getFirstDefinedValue(rowSource, WIDGET_SECONDARY_TEXT_KEYS)) || "",
          widgetType: toWidgetPlatform(
            getFirstDefinedValue(rowSource, WIDGET_TYPE_KEYS),
            widgetTypeFilter === "all" ? "desktop" : widgetTypeFilter,
          ),
          widgetVisibility: toSelectBoolean(
            getFirstDefinedValue(rowSource, WIDGET_VISIBILITY_KEYS),
            "true",
          ),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => ({
        widgetGroupId: toNonNegativeInteger(values.widgetGroupId ?? "", 0),
        widgetGuiName: toNullableString(values.widgetGuiName ?? ""),
        widgetName: (values.widgetName ?? "").trim(),
        widgetPosition: toNonNegativeInteger(values.widgetPosition ?? "0", 0),
        widgetSecondaryText: toNullableString(values.widgetSecondaryText ?? ""),
        widgetType: toWidgetPlatform(values.widgetType, "desktop"),
        widgetVisibility: (values.widgetVisibility ?? "true") === "true",
        ...(shouldUpdate ? { widgetNo: toUpdateId(editingItemId) } : {}),
      })}
    />
  );
}