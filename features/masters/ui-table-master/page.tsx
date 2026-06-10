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
  list: "/ui-table-masters/get",
  getById: "/ui-table-masters/get",
  create: "/ui-table-masters/create",
  delete: "/ui-table-masters/delete",
} as const;
const DEVICE_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "web", label: "Web" },
  { value: "mobile", label: "Mobile" },
  { value: "desktop", label: "Desktop" },
];
const LOOKUP_KEYS = {
  id: ["uiTblId", "id", "_id"],
  code: ["uiTblId"],
  name: ["uiTblName", "name"],
  short: ["uiTblDeviceType"],
  alias: ["uiTblEditable"],
  active: ["uiTblIsActive", "status"],
  array: ["data", "items", "results", "rows", "list"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "uiTblId",
  name: "uiTblName",
  alias: "uiTblEditable",
  short: "uiTblDeviceType",
  description: "uiTblName",
  sort: "uiTblId",
} as const;
const UI_TBL_NAME_KEYS = ["uiTblName"] as const;
const UI_TBL_DEVICE_TYPE_KEYS = ["uiTblDeviceType"] as const;
const UI_TBL_EDITABLE_KEYS = ["uiTblEditable"] as const;
const UI_TBL_IS_ACTIVE_KEYS = ["uiTblIsActive"] as const;
const INITIAL_FORM_VALUES = {
  uiTblName: "",
  uiTblDeviceType: "web",
  uiTblEditable: "false",
  uiTblIsActive: "true",
} as const;
const FORM_FIELDS: ERPDynamicModalField[] = [
  {
    name: "uiTblName",
    label: "Table Name",
    required: true,
    colSpan: 2,
    placeholder: "e.g. Item Master Grid",
    validation: {
      minLength: 2,
      minLengthMessage: "Table Name must be at least 2 characters.",
      requiredMessage: "Table Name is required.",
    },
  },
  {
    name: "uiTblDeviceType",
    label: "Device Type",
    type: "select",
    colSpan: 2,
    options: DEVICE_TYPE_OPTIONS,
    searchable: false,
  },
  {
    name: "uiTblEditable",
    label: "Editable",
    type: "checkbox",
    options: [
      { label: "Editable", value: "true" },
      { label: "Read-only", value: "false" },
    ],
  },
  {
    name: "uiTblIsActive",
    label: "Status",
    type: "checkbox",
    options: [
      { label: "Active", value: "true" },
      { label: "Inactive", value: "false" },
    ],
  },
];
function getSourceValue(row: CrudMasterTableRow, keys: readonly string[]): unknown {
  if (!row.__source) return undefined;
  return getFirstDefinedValue(row.__source as Record<string, unknown>, keys);
}
function getColumnCount(row: CrudMasterTableRow): number | null {
  const columns = row.__source?.columns;
  return Array.isArray(columns) ? columns.length : null;
}
export default function UiTableMasterPage() {
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
        key: "uiTblId",
        header: "Table ID",
        accessor: "masterCode",
        width: "80px",
      },
      {
        key: "uiTblName",
        header: "Table Name",
        accessor: "masterName",
        width: "260px",
      },
      {
        key: "uiTblDeviceType",
        header: "Device Type",
        width: "110px",
        render: (row) => toDisplayValue(getSourceValue(row, UI_TBL_DEVICE_TYPE_KEYS)) || "-",
        sortAccessor: (row) => toDisplayValue(getSourceValue(row, UI_TBL_DEVICE_TYPE_KEYS)),
        searchAccessor: (row) => toDisplayValue(getSourceValue(row, UI_TBL_DEVICE_TYPE_KEYS)),
      },
      {
        key: "uiTblEditable",
        header: "Editable",
        width: "90px",
        align: "center",
        render: (row) => {
          const value = getSourceValue(row, UI_TBL_EDITABLE_KEYS);
          return value === true || value === "true" ? "Yes" : "No";
        },
        sortAccessor: (row) => {
          const value = getSourceValue(row, UI_TBL_EDITABLE_KEYS);
          return value === true || value === "true" ? "1" : "0";
        },
        searchAccessor: (row) => {
          const value = getSourceValue(row, UI_TBL_EDITABLE_KEYS);
          return value === true || value === "true" ? "editable yes" : "read-only no";
        },
      },
      {
        key: "uiTblColumnCount",
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
        key: "uiTblIsActive",
        header: "Status",
        width: "90px",
        render: (row) => {
          const value = getSourceValue(row, UI_TBL_IS_ACTIVE_KEYS);
          return value === true || value === "true" ? "Active" : "Inactive";
        },
        sortAccessor: (row) => {
          const value = getSourceValue(row, UI_TBL_IS_ACTIVE_KEYS);
          return value === true || value === "true" ? "1" : "0";
        },
        searchAccessor: (row) => {
          const value = getSourceValue(row, UI_TBL_IS_ACTIVE_KEYS);
          return value === true || value === "true" ? "active" : "inactive";
        },
      },
      {
        key: "uiTblDesigner",
        header: "Designer",
        width: "100px",
        align: "center",
        sortable: false,
        render: () => (
          <button
            type="button"
            style={{ cursor: "pointer", background: "none", border: "none", color: "var(--erp-link-color, #2563eb)", textDecoration: "underline", font: "inherit" }}
            onClick={(event) => {
              event.stopPropagation();
              router.push("/master/ui-table-designer");
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
      title="UI Table Master"
      auditHistory={{ screenName: "UI Table Master" }}
      entityLabel="UI table"
      entityLabelPlural="UI tables"
      apiEndpoints={API_ENDPOINTS}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="UI Table List"
      createLabel="Add UI Table"
      codeColumnHeader="Table ID"
      nameColumnHeader="Table Name"
      nameFieldLabel="Table Name"
      nameFieldPlaceholder="e.g. Item Master Grid"
      formTitle="UI Table Form"
      formDescription="Create and manage UI tables. Use the designer to edit columns."
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
          uiTblName:
            toDisplayValue(getFirstDefinedValue(rowSource, UI_TBL_NAME_KEYS)) ||
            INITIAL_FORM_VALUES.uiTblName,
          uiTblDeviceType:
            toDisplayValue(getFirstDefinedValue(rowSource, UI_TBL_DEVICE_TYPE_KEYS)) ||
            INITIAL_FORM_VALUES.uiTblDeviceType,
          uiTblEditable: toSelectBoolean(
            getFirstDefinedValue(rowSource, UI_TBL_EDITABLE_KEYS),
            "false",
          ),
          uiTblIsActive: toSelectBoolean(
            getFirstDefinedValue(rowSource, UI_TBL_IS_ACTIVE_KEYS),
            "true",
          ),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          uiTblName: (values.uiTblName ?? "").trim(),
          uiTblDeviceType: toNullableString(values.uiTblDeviceType ?? ""),
          uiTblEditable: (values.uiTblEditable ?? "false") === "true",
          uiTblIsActive: (values.uiTblIsActive ?? "true") === "true",
        };
        if (shouldUpdate && editingItemId !== null) {
          payload.uiTblId = String(toUpdateId(editingItemId));
        }
        return payload;
      }}
    />
  );
}