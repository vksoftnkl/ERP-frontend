"use client";
import { useCallback, useMemo } from "react";
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
const GRID_DETAIL_ID = 35;
const API_ENDPOINTS = {
  list: `/configured-grid-sql/run?grid_id=${GRID_DETAIL_ID}`,
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
  id: ["ui_tbl_id", "uiTblId", "id", "_id"],
  code: ["ui_tbl_id", "uiTblId"],
  name: ["ui_tbl_name", "uiTblName", "name"],
  short: ["ui_tbl_device_type", "uiTblDeviceType"],
  // Editable intentionally has no alias lookup so the configured grid column
  // falls through to the columnRenderOverrides Yes/No render below.
  alias: [],
  active: ["ui_tbl_is_active", "uiTblIsActive", "status"],
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
const UI_TBL_NAME_KEYS = ["uiTblName", "ui_tbl_name"] as const;
const UI_TBL_DEVICE_TYPE_KEYS = ["uiTblDeviceType", "ui_tbl_device_type"] as const;
const UI_TBL_EDITABLE_KEYS = ["uiTblEditable", "ui_tbl_editable"] as const;
const UI_TBL_IS_ACTIVE_KEYS = ["uiTblIsActive", "ui_tbl_is_active"] as const;
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
export default function UiTableMasterPage() {
  const router = useRouter();
  const openDesignerForRow = useCallback(
    (row: CrudMasterTableRow) => {
      const uiTableId = row.masterId.trim();
      router.push(
        uiTableId
          ? `/master/ui-table-designer/${encodeURIComponent(uiTableId)}`
          : "/master/ui-table-designer",
      );
    },
    [router],
  );
  const openDesignerForCreate = useCallback(() => {
    router.push("/master/ui-table-designer?mode=new");
  }, [router]);
  const designerColumns = useMemo<ReusableTableColumn<CrudMasterTableRow>[]>(
    () => [
      {
        key: "uiTblDesigner",
        header: "Designer",
        width: "100px",
        align: "center",
        sortable: false,
        render: (row) => (
          <button
            type="button"
            style={{ cursor: "pointer", background: "none", border: "none", color: "var(--erp-link-color, #2563eb)", textDecoration: "underline", font: "inherit" }}
            onClick={(event) => {
              event.stopPropagation();
              openDesignerForRow(row);
            }}
          >
            Open
          </button>
        ),
      },
    ],
    [openDesignerForRow],
  );
  return (
    <CrudMasterPage
      title="UI Table Master"
      auditHistory={{ screenName: "UI Table Master" }}
      entityLabel="UI table"
      entityLabelPlural="UI tables"
      apiEndpoints={API_ENDPOINTS}
      gridDetailId={GRID_DETAIL_ID}
      listResponseStyleArrayKey=""
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
      appendTableColumns={designerColumns}
      onCreateAction={openDesignerForCreate}
      onEditAction={openDesignerForRow}
      columnRenderOverrides={{
        ui_tbl_editable: (row) => {
          const value = getFirstDefinedValue(
            (row.__source ?? {}) as Record<string, unknown>,
            UI_TBL_EDITABLE_KEYS,
          );
          return value === true || value === "true" ? "Yes" : "No";
        },
      }}
      createInitialValues={INITIAL_FORM_VALUES}
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
