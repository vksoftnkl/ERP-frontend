"use client";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { ERPDynamicModalField } from "@/components/design-system/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  getFirstDefinedValue,
  toDisplayValue,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
} from "@/app/master/_shared/crud-utils";
const API_ENDPOINTS = {
  list: "/configured-grid-sql/run?grid_id=24",
  getById: "/employee-designation-masters/get",
  create: "/employee-designation-masters/create",
  delete: "/employee-designation-masters/delete",
} as const;
const GRID_TABLE_NAME = "employee_designations";
const LOOKUP_KEYS = {
  id: ["edId", "ed_id", "id", "_id"],
  code: ["edCode", "ed_code", "code"],
  name: ["edName", "ed_name", "name"],
  short: ["edCode", "ed_code", "short", "shortName"],
  alias: ["edName", "ed_name", "alias"],
  active: ["edIsActive", "ed_is_active", "isActive", "is_active", "status"],
  position: ["position", "sort"],
  description: ["edRemarks", "ed_remarks", "description", "remarks"],
  array: [
    "data",
    "items",
    "results",
    "rows",
    "list",
    "employeeDesignations",
    "employee_designation_masters",
  ],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "edId",
  name: "edName",
  alias: "edName",
  short: "edCode",
  description: "edRemarks",
  sort: "position",
} as const;
const DESIGNATION_CODE_KEYS = ["edCode", "ed_code", "code"] as const;
const DESIGNATION_IS_DEFAULT_KEYS = ["edIsDefault", "ed_is_default", "isDefault", "is_default"] as const;
const DESIGNATION_IS_ACTIVE_KEYS = ["edIsActive", "ed_is_active", "isActive", "is_active", "status"] as const;
const INITIAL_FORM_VALUES = {
  masterName: "",
  edCode: "",
  edIsDefault: "false",
  edIsActive: "true",
  masterDescription: "",
} as const;
const DESIGNATION_FORM_FIELDS: ERPDynamicModalField[] = [
  {
    name: "masterName",
    label: "Designation Name",
    required: true,
    colSpan: 2,
    validation: {
      minLength: 2,
      minLengthMessage: "Designation Name must be at least 2 characters.",
    },
  },
  {
    name: "edCode",
    label: "Designation Code",
     colSpan: 2,
  },
  {
    name: "masterDescription",
    label: "Remarks",
    colSpan: 2,
  },
  {
    name: "edIsDefault",
    label: "Default",
    type: "checkbox",
    options: [
      { label: "Yes", value: "true" },
      { label: "No", value: "false" },
    ],
  },
  {
    name: "edIsActive",
    label: "Status",
    type: "checkbox",
    options: [
      { label: "Active", value: "true" },
      { label: "Inactive", value: "false" },
    ],
  },
  ];
export default function EmployeeDesignationMasterPage() {
  return (
    <CrudMasterPage
      title="Designation"
      auditHistory={{ screenName: "Employee Designation Master" }}
      entityLabel=" designation"
      entityLabelPlural="designations"
      apiEndpoints={API_ENDPOINTS}
      gridTableName={GRID_TABLE_NAME}
      useResponseTableColumns
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Designation List"
      createLabel="Add Employee Designation"
      codeColumnHeader="Designation Code"
      nameColumnHeader="Designation Name"
      nameFieldLabel="Designation Name"
      nameFieldPlaceholder="Sales Executive"
      formTitle="Employee Designation Form"
      formDescription="Create and update employee designations."
      customFields={DESIGNATION_FORM_FIELDS}
      createInitialValues={INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mergedDefaults = { ...INITIAL_FORM_VALUES, ...defaults };
        return {
          ...INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || mergedDefaults.masterName,
          edCode:
            toDisplayValue(getFirstDefinedValue(rowSource, DESIGNATION_CODE_KEYS)) || mergedDefaults.edCode,
          edIsDefault: toSelectBoolean(
            getFirstDefinedValue(rowSource, DESIGNATION_IS_DEFAULT_KEYS),
            "false",
          ),
          edIsActive: toSelectBoolean(
            getFirstDefinedValue(rowSource, DESIGNATION_IS_ACTIVE_KEYS),
            "true",
          ),
          masterDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
            mergedDefaults.masterDescription,
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          edName: (values.masterName ?? "").trim(),
          edCode: toNullableString(values.edCode ?? ""),
          edIsDefault: (values.edIsDefault ?? "false") === "true",
          edIsActive: (values.edIsActive ?? "true") === "true",
          edRemarks: toNullableString(values.masterDescription ?? ""),
        };
        if (shouldUpdate && editingItemId !== null) {
          payload.edId = toUpdateId(editingItemId);
        }
        return payload;
      }}
    />
  );
}
