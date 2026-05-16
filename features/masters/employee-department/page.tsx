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
  list: "/employee-department-masters/list",
  getById: "/employee-department-masters/get",
  create: "/employee-department-masters/create",
  delete: "/employee-department-masters/delete",
} as const;

const GRID_TABLE_NAME = "employee_departments";

const LOOKUP_KEYS = {
  id: ["edptId", "edpt_id", "id", "_id"],
  code: ["edptCode", "edpt_code", "code"],
  name: ["edptName", "edpt_name", "name"],
  short: ["edptAlias", "edpt_alias", "alias", "short", "shortName"],
  alias: ["edptAlias", "edpt_alias", "alias"],
  active: ["edptIsActive", "edpt_is_active", "isActive", "is_active", "status"],
  position: ["position", "sort"],
  description: ["edptRemarks", "edpt_remarks", "description", "remarks"],
  array: [
    "data",
    "items",
    "results",
    "rows",
    "list",
    "employeeDepartments",
    "employee_department_masters",
  ],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "edptId",
  name: "edptName",
  alias: "edptAlias",
  short: "edptCode",
  description: "edptRemarks",
  sort: "position",
} as const;

const DEPARTMENT_CODE_KEYS = ["edptCode", "edpt_code", "code"] as const;
const DEPARTMENT_ALIAS_KEYS = ["edptAlias", "edpt_alias", "alias"] as const;
const DEPARTMENT_IS_ACTIVE_KEYS = [
  "edptIsActive",
  "edpt_is_active",
  "isActive",
  "is_active",
  "status",
] as const;

const INITIAL_FORM_VALUES = {
  masterName: "",
  edptCode: "",
  edptAlias: "",
  edptIsActive: "true",
  masterDescription: "",
} as const;

const DEPARTMENT_FORM_FIELDS: ERPDynamicModalField[] = [
  {
    name: "masterName",
    label: "Department Name",
    required: true,
    colSpan: 2,
    validation: {
      minLength: 2,
      minLengthMessage: "Department Name must be at least 2 characters.",
    },
  },
  {
    name: "edptCode",
    label: "Department Code",
    colSpan: 1,
  },
  {
    name: "edptAlias",
    label: "Alias",
    colSpan: 1,
  },
  {
    name: "masterDescription",
    label: "Remarks",
    colSpan: 2,
  },
  {
    name: "edptIsActive",
    label: "Status",
    type: "checkbox",
    options: [
      { label: "Active", value: "true" },
      { label: "Inactive", value: "false" },
    ],
  },
];

export default function EmployeeDepartmentMasterPage() {
  return (
    <CrudMasterPage
      title="Employee Department"
      auditHistory={{ screenName: "Employee Department Master" }}
      entityLabel="employee department"
      entityLabelPlural="employee departments"
      apiEndpoints={API_ENDPOINTS}
      gridTableName={GRID_TABLE_NAME}
      useResponseTableColumns
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Department List"
      createLabel="Add Employee Department"
      codeColumnHeader="Department Code"
      nameColumnHeader="Department Name"
      nameFieldLabel="Department Name"
      nameFieldPlaceholder="Human Resources"
      formTitle="Employee Department Form"
      formDescription="Create and update employee departments."
      customFields={DEPARTMENT_FORM_FIELDS}
      createInitialValues={INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mergedDefaults = { ...INITIAL_FORM_VALUES, ...defaults };

        return {
          ...INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) ||
            mergedDefaults.masterName,
          edptCode:
            toDisplayValue(getFirstDefinedValue(rowSource, DEPARTMENT_CODE_KEYS)) ||
            mergedDefaults.edptCode,
          edptAlias:
            toDisplayValue(getFirstDefinedValue(rowSource, DEPARTMENT_ALIAS_KEYS)) ||
            mergedDefaults.edptAlias,
          edptIsActive: toSelectBoolean(
            getFirstDefinedValue(rowSource, DEPARTMENT_IS_ACTIVE_KEYS),
            "true",
          ),
          masterDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
            mergedDefaults.masterDescription,
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          edptName: (values.masterName ?? "").trim(),
          edptCode: toNullableString(values.edptCode ?? ""),
          edptAlias: toNullableString(values.edptAlias ?? ""),
          edptIsActive: (values.edptIsActive ?? "true") === "true",
          edptRemarks: toNullableString(values.masterDescription ?? ""),
        };

        if (shouldUpdate && editingItemId !== null) {
          payload.edptId = toUpdateId(editingItemId);
        }

        return payload;
      }}
    />
  );
}
