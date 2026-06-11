"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import CrudMasterPage, { type CrudMasterTableRow } from "@/components/master/crud-master-page";
import type { ReusableTableColumn } from "@/components/ui/table";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  getFirstDefinedValue,
  toDisplayValue,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
} from "@/app/master/_shared/crud-utils";
const API_ENDPOINTS = {
  list: "/configured-grid-sql/run?grid_id=33",
  getById: "/grid-details/get",
  create: "/grid-details/create",
  delete: "/grid-details/delete",
} as const;
const DEVICE_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "desktop", label: "Desktop" },
  { value: "web", label: "Web" },
  { value: "mobile", label: "Mobile" },
];
const SORT_ORDER_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "", label: "Select Sort Order" },
  { value: "Ascending", label: "Ascending" },
  { value: "Descending", label: "Descending" },
];
const LOOKUP_KEYS = {
  id: ["grid_id", "gridId", "id", "_id"],
  code: ["grid_id", "gridId"],
  name: ["grid_name", "gridName", "name"],
  short: ["grid_device_type", "gridDeviceType"],
  alias: ["grid_sort_column", "gridSortColumn"],
  active: ["grid_status", "gridStatus", "status"],
  description: ["grid_description", "gridDescription", "description"],
  array: ["data", "items", "results", "rows", "list"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "grid_id",
  name: "grid_name",
  alias: "grid_sort_column",
  short: "grid_device_type",
  description: "grid_description",
  sort: "grid_sort_order",
} as const;
const GRID_NAME_KEYS = ["grid_name", "gridName"] as const;
const GRID_DESCRIPTION_KEYS = ["grid_description", "gridDescription"] as const;
const GRID_SORT_COLUMN_KEYS = ["grid_sort_column", "gridSortColumn"] as const;
const GRID_SORT_ORDER_KEYS = ["grid_sort_order", "gridSortOrder"] as const;
const GRID_SQL_KEYS = ["grid_sql", "gridSql"] as const;
const GRID_STATUS_KEYS = ["grid_status", "gridStatus"] as const;
const GRID_DEVICE_TYPE_KEYS = ["grid_device_type", "gridDeviceType"] as const;
const INITIAL_FORM_VALUES = {
  gridName: "",
  gridDescription: "",
  gridSortColumn: "",
  gridSortOrder: "",
  gridSql: "",
  gridDeviceType: "desktop",
  gridStatus: "true",
} as const;
const FORM_FIELDS: ERPDynamicModalField[] = [
  {
    name: "gridName",
    label: "Grid Name",
    required: true,
    colSpan: 2,
    placeholder: "e.g. Item Master Grid",
    validation: {
      minLength: 2,
      minLengthMessage: "Grid Name must be at least 2 characters.",
      requiredMessage: "Grid Name is required.",
    },
  },
  {
    name: "gridDeviceType",
    label: "Device Type",
    type: "select",
    colSpan: 2,
    required: true,
    options: DEVICE_TYPE_OPTIONS,
    searchable: false,
    validation: {
      requiredMessage: "Device Type is required.",
    },
  },
  {
    name: "gridSortColumn",
    label: "Sort Column",
    colSpan: 2,
    placeholder: "e.g. item_name",
  },
  {
    name: "gridSortOrder",
    label: "Sort Order",
    type: "select",
    colSpan: 2,
    options: SORT_ORDER_OPTIONS,
    searchable: false,
  },
  {
    name: "gridDescription",
    label: "Description",
    colSpan: 2,
    placeholder: "Describe what this grid displays",
  },
  {
    name: "gridSql",
    label: "Grid SQL",
    type: "textarea",
    colSpan: 2,
    placeholder: "SELECT ... FROM ...",
  },
  {
    name: "gridStatus",
    label: "Status",
    type: "checkbox",
    options: [
      { label: "Active", value: "true" },
      { label: "Inactive", value: "false" },
    ],
  },
];
function normalizeSortOrder(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "descending" || normalized === "desc") {
    return "Descending";
  }
  if (normalized === "ascending" || normalized === "asc") {
    return "Ascending";
  }
  return "";
}
function getSourceValue(row: CrudMasterTableRow, keys: readonly string[]): unknown {
  if (!row.__source) return undefined;
  return getFirstDefinedValue(row.__source as Record<string, unknown>, keys);
}
function getColumnCount(row: CrudMasterTableRow): number | null {
  const columns = row.__source?.columns;
  return Array.isArray(columns) ? columns.length : null;
}
export default function GridMasterPage() {
  const router = useRouter();
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
        key: "gridId",
        header: "Grid ID",
        accessor: "masterCode",
        width: "80px",
      },
      {
        key: "gridName",
        header: "Grid Name",
        accessor: "masterName",
        width: "220px",
      },
      {
        key: "gridDescription",
        header: "Description",
        accessor: "masterDescription",
        width: "240px",
      },
      {
        key: "gridDeviceType",
        header: "Device Type",
        width: "110px",
        render: (row) => toDisplayValue(getSourceValue(row, GRID_DEVICE_TYPE_KEYS)) || "-",
        sortAccessor: (row) => toDisplayValue(getSourceValue(row, GRID_DEVICE_TYPE_KEYS)),
        searchAccessor: (row) => toDisplayValue(getSourceValue(row, GRID_DEVICE_TYPE_KEYS)),
      },
      {
        key: "gridSortColumn",
        header: "Sort Column",
        width: "140px",
        render: (row) => toDisplayValue(getSourceValue(row, GRID_SORT_COLUMN_KEYS)) || "-",
        sortAccessor: (row) => toDisplayValue(getSourceValue(row, GRID_SORT_COLUMN_KEYS)),
        searchAccessor: (row) => toDisplayValue(getSourceValue(row, GRID_SORT_COLUMN_KEYS)),
      },
      {
        key: "gridSortOrder",
        header: "Sort Order",
        width: "110px",
        render: (row) =>
          normalizeSortOrder(toDisplayValue(getSourceValue(row, GRID_SORT_ORDER_KEYS))) || "-",
        sortAccessor: (row) =>
          normalizeSortOrder(toDisplayValue(getSourceValue(row, GRID_SORT_ORDER_KEYS))),
      },
      {
        key: "gridColumnCount",
        header: "Columns",
        width: "90px",
        align: "center",
        render: (row) => {
          const count = getColumnCount(row);
          return count === null ? "-" : String(count);
        },
        sortAccessor: (row) => String(getColumnCount(row) ?? -1).padStart(6, "0"),
      },
      {
        key: "gridStatus",
        header: "Status",
        width: "90px",
        render: (row) => {
          const value = getSourceValue(row, GRID_STATUS_KEYS);
          return value === true || value === "true" ? "Active" : "Inactive";
        },
        sortAccessor: (row) => {
          const value = getSourceValue(row, GRID_STATUS_KEYS);
          return value === true || value === "true" ? "1" : "0";
        },
        searchAccessor: (row) => {
          const value = getSourceValue(row, GRID_STATUS_KEYS);
          return value === true || value === "true" ? "active" : "inactive";
        },
      },
      {
        key: "gridDesigner",
        header: "Designer",
        width: "100px",
        align: "center",
        sortable: false,
        render: (row) => (
          <button
            type="button"
            className={styles.masterLinkButton ?? undefined}
            style={{ cursor: "pointer", background: "none", border: "none", color: "var(--erp-link-color, #2563eb)", textDecoration: "underline", font: "inherit" }}
            onClick={(event) => {
              event.stopPropagation();
              router.push(`/master/grid-designer/${row.masterId}`);
            }}
          >
            Open
          </button>
        ),
      },
    ],
    [router],
  );
  return (
    <CrudMasterPage
      title="Grid Master"
      auditHistory={{ screenName: "Grid Details" }}
      entityLabel="grid"
      entityLabelPlural="grids"
      apiEndpoints={API_ENDPOINTS}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Grid List"
      createLabel="Add Grid"
      codeColumnHeader="Grid ID"
      nameColumnHeader="Grid Name"
      nameFieldLabel="Grid Name"
      nameFieldPlaceholder="e.g. Item Master Grid"
      formTitle="Grid Form"
      formDescription="Create and manage grid configurations. Use the designer to edit columns."
      customFields={FORM_FIELDS}
      customTableColumns={customTableColumns}
      createInitialValues={INITIAL_FORM_VALUES}
      buildListQuery={({ searchTerm }): Record<string, string> =>
        searchTerm ? { search: searchTerm } : {}
      }
      augmentDetailSource={({ source }) => {
        const data = source?.data;
        if (Array.isArray(data)) {
          const first = data[0];
          return first && typeof first === "object"
            ? (first as Record<string, unknown>)
            : null;
        }
        return null;
      }}
      mapFormValues={({ source }) => {
        const rowSource = source ?? {};
        return {
          ...INITIAL_FORM_VALUES,
          gridName:
            toDisplayValue(getFirstDefinedValue(rowSource, GRID_NAME_KEYS)) ||
            INITIAL_FORM_VALUES.gridName,
          gridDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, GRID_DESCRIPTION_KEYS)) ||
            INITIAL_FORM_VALUES.gridDescription,
          gridSortColumn:
            toDisplayValue(getFirstDefinedValue(rowSource, GRID_SORT_COLUMN_KEYS)) ||
            INITIAL_FORM_VALUES.gridSortColumn,
          gridSortOrder: normalizeSortOrder(
            toDisplayValue(getFirstDefinedValue(rowSource, GRID_SORT_ORDER_KEYS)),
          ),
          gridSql:
            toDisplayValue(getFirstDefinedValue(rowSource, GRID_SQL_KEYS)) ||
            INITIAL_FORM_VALUES.gridSql,
          gridDeviceType:
            toDisplayValue(getFirstDefinedValue(rowSource, GRID_DEVICE_TYPE_KEYS)) ||
            INITIAL_FORM_VALUES.gridDeviceType,
          gridStatus: toSelectBoolean(
            getFirstDefinedValue(rowSource, GRID_STATUS_KEYS),
            "true",
          ),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          grid_name: (values.gridName ?? "").trim(),
          grid_description: toNullableString(values.gridDescription ?? ""),
          grid_sort_column: toNullableString(values.gridSortColumn ?? ""),
          grid_sort_order: toNullableString(values.gridSortOrder ?? ""),
          grid_sql: toNullableString(values.gridSql ?? ""),
          grid_status: (values.gridStatus ?? "true") === "true",
          grid_device_type: (values.gridDeviceType ?? "desktop").trim(),
        };
        if (shouldUpdate && editingItemId !== null) {
          payload.grid_id = String(toUpdateId(editingItemId));
        }
        return payload;
      }}
    />
  );
}
