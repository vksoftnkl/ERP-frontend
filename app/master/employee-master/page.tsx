"use client";

import { useEffect, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import styles from "../state-master/page.module.scss";
import {
  buildLookupOptions,
  getFirstDefinedValue,
  toDisplayValue,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
  toUpper,
  DEFAULT_LOOKUP_ARRAY_KEYS,
} from "../_shared/crud-utils";

const API_ENDPOINTS = {
  list: "/employee-masters/list",
  getById: "/employee-masters/get",
  create: "/employee-masters/create",
  delete: "/employee-masters/delete",
} as const;

const GRID_TABLE_NAME = "emp_master";

const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";

const LOOKUP_QUERY_COMPANIES = {
  module: "companies",
  limit: "20",
} as const;

const LOOKUP_QUERY_BRANCHES = {
  module: "branches",
  limit: "20",
} as const;

const LOOKUP_QUERY_DESIGNATIONS = {
  module: "employeeDesignations",
  limit: "20",
} as const;

const LOOKUP_KEYS = {
  id: ["empId", "emp_id", "id", "_id"],
  code: ["empCode", "emp_code", "code"],
  name: ["empName", "emp_name", "name"],
  short: ["empMobile1", "emp_mobile1", "mobile"],
  alias: ["empAlias", "emp_alias", "alias"],
  active: ["empIsActive", "emp_is_active", "isActive", "is_active", "status"],
  position: ["position", "sort"],
  description: ["empRemarks", "emp_remarks", "description", "remarks"],
  array: ["data", "items", "results", "rows", "list", "employees", "employee_masters"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "empId",
  name: "empName",
  alias: "empAlias",
  short: "empCode",
  description: "empRemarks",
  sort: "position",
} as const;

const EMP_COMPANY_ID_KEYS = ["empCompanyId", "emp_company_id", "companyId", "company_id"] as const;
const EMP_BRANCH_ID_KEYS = ["empBranchId", "emp_branch_id", "branchId", "branch_id"] as const;
const EMP_DESIGNATION_ID_KEYS = [
  "empDesignationId",
  "emp_designation_id",
  "designationId",
  "designation_id",
] as const;
const EMP_SALARY_TYPE_KEYS = ["empSalaryType", "emp_salary_type", "salaryType", "salary_type"] as const;
const EMP_SALARY_AMOUNT_KEYS = ["empSalaryAmount", "emp_salary_amount", "salaryAmount", "salary_amount"] as const;
const EMP_MOBILE_KEYS = ["empMobile1", "emp_mobile1", "mobile"] as const;
const EMP_EMAIL_KEYS = ["empEmail", "emp_email", "email"] as const;
const EMP_IS_ACTIVE_KEYS = ["empIsActive", "emp_is_active", "isActive", "is_active", "status"] as const;

const DEFAULT_COMPANY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Company",
};

const DEFAULT_BRANCH_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};

const DEFAULT_DESIGNATION_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};

const EMPLOYEE_INITIAL_FORM_VALUES = {
  masterName: "",
  empCode: "",
  masterAlias: "",
  empCompanyId: "",
  empBranchId: "",
  empDesignationId: "",
  empSalaryType: "MONTHLY",
  empSalaryAmount: "0",
  empMobile1: "",
  empEmail: "",
  empIsActive: "true",
  masterDescription: "",
} as const;

function toOptionalNonNegativeNumber(value: string): number | undefined {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
}

function buildEmployeeFormFields(
  companyOptions: ERPDynamicSelectOption[],
  branchOptions: ERPDynamicSelectOption[],
  designationOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "Employee Name",
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Employee Name must be at least 2 characters.",
      },
    },
    {
      name: "empCode",
      label: "Employee Code",
    },
    {
      name: "masterAlias",
      label: "Alias",
    },
    {
      name: "empCompanyId",
      label: "Company",
      type: "select",
      searchable: true,
      required: true,
      options: companyOptions,
      validation: {
        requiredMessage: "Company is required.",
      },
    },
    {
      name: "empBranchId",
      label: "Branch",
      type: "select",
      searchable: true,
      options: branchOptions,
    },
    {
      name: "empDesignationId",
      label: "Designation",
      type: "select",
      searchable: true,
      options: designationOptions,
    },
    {
      name: "empSalaryType",
      label: "Salary Type",
      required: true,
      placeholder: "MONTHLY",
      validation: {
        requiredMessage: "Salary Type is required.",
        maxLength: 10,
        maxLengthMessage: "Salary Type must be at most 10 characters.",
      },
    },
    {
      name: "empSalaryAmount",
      label: "Salary Amount",
      type: "number",
      min: 0,
      step: "0.01",
      validation: {
        minMessage: "Salary Amount must be 0 or greater.",
      },
    },
    {
      name: "empMobile1",
      label: "Mobile",
      type: "tel",
    },
    {
      name: "empEmail",
      label: "Email",
      type: "email",
    },
    {
      name: "empIsActive",
      label: "Status",
      type: "checkbox",
      options: [
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
    },
    {
      name: "masterDescription",
      label: "Remarks",
      type: "textarea",
      colSpan: 2,
    },
  ];
}

export default function EmployeeMasterPage() {
  const { getAll: getCompanyLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getBranchLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getDesignationLookup } = useApi<unknown>(LOOKUP_ENDPOINT);

  const [companyOptions, setCompanyOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_COMPANY_OPTION,
  ]);
  const [branchOptions, setBranchOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_BRANCH_OPTION,
  ]);
  const [designationOptions, setDesignationOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_DESIGNATION_OPTION,
  ]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const [companiesPayload, branchesPayload, designationsPayload] = await Promise.all([
          getCompanyLookup(LOOKUP_QUERY_COMPANIES),
          getBranchLookup(LOOKUP_QUERY_BRANCHES),
          getDesignationLookup(LOOKUP_QUERY_DESIGNATIONS),
        ]);

        if (!mounted) {
          return;
        }

        setCompanyOptions(
          buildLookupOptions(companiesPayload, DEFAULT_COMPANY_OPTION, {
            arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
            idKeys: ["id", "value"],
            labelKeys: ["name", "label"],
          }),
        );
        setBranchOptions(
          buildLookupOptions(branchesPayload, DEFAULT_BRANCH_OPTION, {
            arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
            idKeys: ["id", "value"],
            labelKeys: ["name", "label"],
          }),
        );
        setDesignationOptions(
          buildLookupOptions(designationsPayload, DEFAULT_DESIGNATION_OPTION, {
            arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
            idKeys: ["id", "value"],
            labelKeys: ["name", "label"],
          }),
        );
      } catch {
        if (!mounted) {
          return;
        }

        setCompanyOptions([DEFAULT_COMPANY_OPTION]);
        setBranchOptions([DEFAULT_BRANCH_OPTION]);
        setDesignationOptions([DEFAULT_DESIGNATION_OPTION]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [getBranchLookup, getCompanyLookup, getDesignationLookup]);

  const employeeFormFields = useMemo(
    () => buildEmployeeFormFields(companyOptions, branchOptions, designationOptions),
    [branchOptions, companyOptions, designationOptions],
  );

  return (
    <CrudMasterPage
      title="Employee"
      entityLabel="employee"
      entityLabelPlural="employees"
      apiEndpoints={API_ENDPOINTS}
      gridTableName={GRID_TABLE_NAME}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Employee List"
      createLabel="Add Employee"
      codeColumnHeader="Employee Code"
      nameColumnHeader="Employee Name"
      nameFieldLabel="Employee Name"
      nameFieldPlaceholder="Ravi Shah"
      formTitle="Employee Form"
      formDescription="Create and update employees."
      customFields={employeeFormFields}
      createInitialValues={EMPLOYEE_INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mergedDefaults = { ...EMPLOYEE_INITIAL_FORM_VALUES, ...defaults };

        return {
          ...EMPLOYEE_INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || mergedDefaults.masterName,
          empCode: toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.code)) || mergedDefaults.empCode,
          masterAlias:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) || mergedDefaults.masterAlias,
          empCompanyId:
            toDisplayValue(getFirstDefinedValue(rowSource, EMP_COMPANY_ID_KEYS)) ||
            mergedDefaults.empCompanyId,
          empBranchId:
            toDisplayValue(getFirstDefinedValue(rowSource, EMP_BRANCH_ID_KEYS)) ||
            mergedDefaults.empBranchId,
          empDesignationId:
            toDisplayValue(getFirstDefinedValue(rowSource, EMP_DESIGNATION_ID_KEYS)) ||
            mergedDefaults.empDesignationId,
          empSalaryType:
            toDisplayValue(getFirstDefinedValue(rowSource, EMP_SALARY_TYPE_KEYS)) ||
            mergedDefaults.empSalaryType,
          empSalaryAmount:
            toDisplayValue(getFirstDefinedValue(rowSource, EMP_SALARY_AMOUNT_KEYS)) ||
            mergedDefaults.empSalaryAmount,
          empMobile1:
            toDisplayValue(getFirstDefinedValue(rowSource, EMP_MOBILE_KEYS)) || mergedDefaults.empMobile1,
          empEmail:
            toDisplayValue(getFirstDefinedValue(rowSource, EMP_EMAIL_KEYS)) || mergedDefaults.empEmail,
          empIsActive: toSelectBoolean(getFirstDefinedValue(rowSource, EMP_IS_ACTIVE_KEYS), "true"),
          masterDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
            mergedDefaults.masterDescription,
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          empCompanyId: (values.empCompanyId ?? "").trim(),
          empBranchId: toNullableString(values.empBranchId ?? ""),
          empCode: toNullableString(values.empCode ?? ""),
          empName: (values.masterName ?? "").trim(),
          empAlias: toNullableString(values.masterAlias ?? ""),
          empMobile1: toNullableString(values.empMobile1 ?? ""),
          empEmail: toNullableString(values.empEmail ?? ""),
          empDesignationId: toNullableString(values.empDesignationId ?? ""),
          empSalaryType: toUpper(values.empSalaryType ?? ""),
          empSalaryAmount: toOptionalNonNegativeNumber(values.empSalaryAmount ?? ""),
          empIsActive: (values.empIsActive ?? "true") === "true",
          empRemarks: toNullableString(values.masterDescription ?? ""),
        };

        if (shouldUpdate && editingItemId !== null) {
          payload.empId = toUpdateId(editingItemId);
        }

        return payload;
      }}
    />
  );
}
