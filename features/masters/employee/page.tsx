"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  buildLookupOptions,
  getFirstDefinedValue,
  toDateInputValue,
  toDisplayValue,
  toNonNegativeNumber,
  toNullableDate,
  toNullableNumber,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
  toUpper,
  DEFAULT_LOOKUP_ARRAY_KEYS,
} from "@/app/master/_shared/crud-utils";

const API_ENDPOINTS = {
  list: "/employee-masters/list",
  getById: "/employee-masters/get",
  create: "/employee-masters/create",
  delete: "/employee-masters/delete",
} as const;
const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const STATE_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const UUID_PATTERN = "^[0-9a-fA-F-]{36}$";

const EMPLOYEE_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(92vw, 62rem)",
  height: "75vh",
  maxHeight: "75vh",
};
const FILE_CONSTRAINTS = {
  MAX_UPLOAD_IMAGE_BYTES: 5 * 1024 * 1024,
  ALLOWED_MIME_TYPES: ["image/jpeg", "image/png", "image/webp", "image/gif"],
} as const;
const LOOKUP_QUERY_COMPANIES = {
  module: "companies",
  limit: "20",
} as const;
const LOOKUP_QUERY_BRANCHES = {
  module: "branches",
  limit: "20",
} as const;
const LOOKUP_QUERY_DEPARTMENTS = {
  module: "employeeDepartments",
  limit: "20",
} as const;
const LOOKUP_QUERY_DESIGNATIONS = {
  module: "employeeDesignations",
  limit: "20",
} as const;
const LOOKUP_QUERY_LOAN_LEDGERS = {
  module: "accountLedgers",
  limit: "20",
} as const;
const LOOKUP_QUERY_STATES = {
  module: "states",
  limit: "100",
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
const STATE_LOOKUP_KEYS = {
  name: ["stmName", "stm_name", "state_name", "stateName", "name", "label"],
  array: ["data", "items", "results", "rows", "list", "states"],
} as const;
const BOOLEAN_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Yes", value: "true" },
  { label: "No", value: "false" },
];
const ACTIVE_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Active", value: "true" },
  { label: "Inactive", value: "false" },
];
const GENDER_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Male", value: "MALE" },
  { label: "Female", value: "FEMALE" },
  { label: "Other", value: "OTHER" },
];
const MARITAL_STATUS_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Single", value: "SINGLE" },
  { label: "Married", value: "MARRIED" },
  { label: "Divorced", value: "DIVORCED" },
  { label: "Widowed", value: "WIDOWED" },
];
const BLOOD_GROUP_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "A+", value: "A+" },
  { label: "A-", value: "A-" },
  { label: "B+", value: "B+" },
  { label: "B-", value: "B-" },
  { label: "AB+", value: "AB+" },
  { label: "AB-", value: "AB-" },
  { label: "O+", value: "O+" },
  { label: "O-", value: "O-" },
];
const EMPLOYEE_TEXT_FIELD_NAMES = [
  "empName",
  "empCode",
  "empAlias",
  "empCompanyId",
  "empBranchId",
  "empDesignationId",
  "empDepartmentId",
  "empMobile1",
  "empMobile2",
  "empEmail",
  "empAddr1",
  "empAddr2",
  "empAddr3",
  "empCity",
  "empDistrict",
  "empState",
  "empPincode",
  "empGender",
  "empMaritalStatus",
  "empBloodGroup",
  "empEmploymentType",
  "empStatus",
  "empShiftId",
  "empAttConstraintId",
  "empHolidayGroupId",
  "empCommissionType",
  "empCommissionValue",
  "empSalaryType",
  "empSalaryAmount",
  "empBataAmount",
  "empKmBataAmount",
  "empPanNo",
  "empAadharNo",
  "empPfNo",
  "empEsiNo",
  "empLoanLedgerId",
  "empPhotoUrl",
  "empRemarks",
] as const;

const EMPLOYEE_DATE_FIELD_NAMES = [
  "empDob",
  "empJoinedOn",
  "empProbationEndOn",
  "empConfirmationOn",
  "empLeftOn",
] as const;

const EMPLOYEE_BOOLEAN_FIELD_NAMES = [
  "empOvertimeAllowed",
  "empHasCommission",
  "empIsActive",
] as const;

const EMPLOYEE_INITIAL_FORM_VALUES: Record<string, string> = {
  empName: "",
  empCode: "",
  empAlias: "",
  empCompanyId: "",
  empBranchId: "",
  empDesignationId: "",
  empDepartmentId: "",
  empMobile1: "",
  empMobile2: "",
  empEmail: "",
  empAddr1: "",
  empAddr2: "",
  empAddr3: "",
  empCity: "",
  empDistrict: "",
  empState: "",
  empPincode: "",
  empGender: "",
  empMaritalStatus: "",
  empBloodGroup: "",
  empDob: "",
  empEmploymentType: "",
  empStatus: "",
  empJoinedOn: "",
  empProbationEndOn: "",
  empConfirmationOn: "",
  empLeftOn: "",
  empShiftId: "",
  empAttConstraintId: "",
  empHolidayGroupId: "",
  empOvertimeAllowed: "false",
  empHasCommission: "false",
  empCommissionType: "",
  empCommissionValue: "",
  empSalaryType: "MONTHLY",
  empSalaryAmount: "0",
  empBataAmount: "0",
  empKmBataAmount: "0",
  empPanNo: "",
  empAadharNo: "",
  empPfNo: "",
  empEsiNo: "",
  empLoanLedgerId: "",
  empPhotoUrl: "",
  empRemarks: "",
  empIsActive: "true",
};
function toSnakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}
function getEmployeeFieldValue(
  source: Record<string, unknown>,
  fieldName: string,
): unknown {
  return getFirstDefinedValue(source, [fieldName, toSnakeCase(fieldName)]);
}
function toUpperNullable(value: string): string | null {
  const normalized = toUpper(value);
  return normalized ? normalized : null;
}
function toLookupOptions(
  payload: unknown,
): ERPDynamicSelectOption[] {
  return buildLookupOptions(payload, { value: "", label: "" }, {
    arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
    idKeys: ["id", "value"],
    labelKeys: ["name", "label"],
  }).filter((option) => option.value.trim().length > 0);
}
function toStateOptions(payload: unknown): ERPDynamicSelectOption[] {
  return buildLookupOptions(payload, { value: "", label: "" }, {
    arrayKeys: STATE_LOOKUP_KEYS.array,
    idKeys: STATE_LOOKUP_KEYS.name,
    labelKeys: STATE_LOOKUP_KEYS.name,
  }).filter((option) => option.value.trim().length > 0);
}
function buildUuidTextField(
  name: string,
  label: string,
  helperText?: string,
): ERPDynamicModalField {
  return {
    name,
    label,
    placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    helperText,
    validation: {
      pattern: UUID_PATTERN,
      patternMessage: `${label} must be a valid UUID.`,
    },
  };
}
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read selected image."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("Unable to read selected image."));
    reader.readAsDataURL(file);
  });
}
function getBase64FromDataUrl(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}
const EMPLOYMENT_STATUS_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Working", value: "WORKING" },
  { label: "Resigned", value: "RESIGNED" },
];
const SALARY_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Monthly", value: "MONTHLY" },
  { label: "Daily", value: "DAILY" },
  { label: "Hourly", value: "HOURLY" },
  { label: "Weekly", value: "WEEKLY" },
];
function isResignedStatus(value: string): boolean {
  return toUpper(value) === "RESIGNED";
}
function buildEmployeeFormFields(
  companyOptions: ERPDynamicSelectOption[],
  branchOptions: ERPDynamicSelectOption[],
  departmentOptions: ERPDynamicSelectOption[],
  designationOptions: ERPDynamicSelectOption[],
  stateOptions: ERPDynamicSelectOption[],
  employmentStatusOptions: ERPDynamicSelectOption[],
  salaryTypeOptions: ERPDynamicSelectOption[],
  loanLedgerOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "__heading_primary",
      label: "Primary Details",
      type: "heading",
    },
    {
      name: "empName",
      label: "Employee Name",
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Employee Name must be at least 2 characters.",
      },
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
      name: "empDob",
      label: "Date of Birth",
      type: "date",
    },
    {
      name: "empAlias",
      label: "Alias",
    },
    {
      name: "empBranchId",
      label: "Branch",
      type: "select",
      searchable: true,
      options: branchOptions,
    },
    {
      name: "empMaritalStatus",
      label: "Marital Status",
      type: "select",
      options: MARITAL_STATUS_OPTIONS,
    },
    {
      name: "empCode",
      label: "Employee Code",
    },
    {
      name: "empDepartmentId",
      label: "Department",
      type: "select",
      searchable: true,
      options: departmentOptions,
      placeholder: "Select department",
    },
    {
      name: "empBloodGroup",
      label: "Blood Group",
      type: "select",
      options: BLOOD_GROUP_OPTIONS,
    },
    {
      name: "empGender",
      label: "Gender",
      type: "select",
      options: GENDER_OPTIONS,
    },
    {
      name: "empDesignationId",
      label: "Designation",
      type: "select",
      searchable: true,
      options: designationOptions,
    },
    {
      name: "__heading_contact",
      label: "Contact & Address",
      type: "heading",
    },
    {
      name: "empAddr1",
      label: "Address Line 1",
    },
    {
      name: "empDistrict",
      label: "District",
    },
    {
      name: "empEmail",
      label: "Email",
      type: "email",
    },
    {
      name: "empAddr2",
      label: "Address Line 2",
    },
    {
      name: "empState",
      label: "State",
      type: "select",
      searchable: true,
      options: stateOptions,
      placeholder: "Search state",
    },
    {
      name: "empMobile1",
      label: "Mobile 1",
      type: "tel",
    },
    {
      name: "empAddr3",
      label: "Address Line 3",
    },
    {
      name: "empPincode",
      label: "Pincode",
      inputMode: "numeric",
    },
    {
      name: "empMobile2",
      label: "Mobile 2",
      type: "tel",
    },
    {
      name: "empCity",
      label: "City",
    },
    {
      name: "__heading_employment",
      label: "Employment Details",
      type: "heading",
    },   
    {
      name: "empStatus",
      label: "Employment Status",
      searchable: false,
      type: "select",
      options: employmentStatusOptions,
      onValueChange: ({ values }) => ({
        errors: {
          empLeftOn:
            isResignedStatus(values.empStatus ?? "") &&
            (values.empLeftOn ?? "").trim().length === 0
              ? "Left On is required when Employment Status is Resigned."
              : null,
        },
      }),
    },
    {
      name: "empJoinedOn",
      label: "Joined On",
      type: "date",
    },
    {
      name: "empProbationEndOn",
      label: "Probation End On",
      type: "date",
    },
    {
      name: "empConfirmationOn",
      label: "Confirmation On",
      type: "date",
    },
    {
      name: "empLeftOn",
      label: "Left On",
      type: "date",
      validation: {
        custom: (value, values) =>
          isResignedStatus(values.empStatus ?? "") && value.trim().length === 0
            ? "Left On is required when Employment Status is Resigned."
            : null,
      },
    },
    {
      name: "__heading_attendance",
      label: "Attendance Setup",
      type: "heading",
      defaultExpanded: false,
    },
    buildUuidTextField(
      "empShiftId",
      "Shift Id",
      "Enter a shift UUID until a shift lookup is available.",
    ),
    buildUuidTextField(
      "empAttConstraintId",
      "Attendance Constraint Id",
      "Enter an attendance-constraint UUID until a lookup is available.",
    ),
    buildUuidTextField(
      "empHolidayGroupId",
      "Holiday Group Id",
      "Enter a holiday-group UUID until a lookup is available.",
    ),
    {
      name: "empOvertimeAllowed",
      label: "Overtime Allowed",
      type: "checkbox",
      options: BOOLEAN_OPTIONS,
    },
    {
      name: "__heading_payroll",
      label: "Commission & Payroll",
      type: "heading",
    },
    {
      name: "empHasCommission",
      label: "Has Commission",
      type: "checkbox",
      options: BOOLEAN_OPTIONS,
    },
    {
      name: "empCommissionType",
      label: "Commission Type",
      placeholder: "PERCENT / AMOUNT",
      visibleWhen: (values) => (values.empHasCommission ?? "false") === "true",
    },
    {
      name: "empCommissionValue",
      label: "Commission Value",
      type: "number",
      min: 0,
      step: "0.001",
      visibleWhen: (values) => (values.empHasCommission ?? "false") === "true",
      validation: {
        minMessage: "Commission Value must be 0 or greater.",
      },
    },
    {
      name: "empSalaryType",
      label: "Salary Type",
      required: true,
      type: "select",
      options: salaryTypeOptions,
      searchable: false,
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
      name: "empBataAmount",
      label: "Bata Amount",
      type: "number",
      min: 0,
      step: "0.01",
      validation: {
        minMessage: "Bata Amount must be 0 or greater.",
      },
    },
    {
      name: "empKmBataAmount",
      label: "KM Bata Amount",
      type: "number",
      min: 0,
      step: "0.01",
      validation: {
        minMessage: "KM Bata Amount must be 0 or greater.",
      },
    },
    {
      name: "__heading_statutory",
      label: "Statutory & Accounting",
      type: "heading",
    },
    {
      name: "empPanNo",
      label: "PAN No",
    },
    {
      name: "empAadharNo",
      label: "Aadhar No",
      inputMode: "numeric",
    },
    {
      name: "empPfNo",
      label: "PF No",
    },
    {
      name: "empEsiNo",
      label: "ESI No",
    },
    {
      name: "__heading_photo",
      label: "Photo & Notes",
      type: "heading",
    },    
    {
      name: "empPhotoFile",
      label: "Upload Photo",
      type: "file",
      accept: FILE_CONSTRAINTS.ALLOWED_MIME_TYPES.join(","),
      maxFileSizeBytes: FILE_CONSTRAINTS.MAX_UPLOAD_IMAGE_BYTES,
      allowedMimeTypes: [...FILE_CONSTRAINTS.ALLOWED_MIME_TYPES],
      helperText: "Accepted: JPG, PNG, WEBP, GIF. Max size 5 MB.",
    },
    {
      name: "empRemarks",
      label: "Remarks",
      rows: 3,
      colSpan: 2,
    },
    {
      name: "empIsActive",
      label: "Record Active",
      type: "checkbox",
      options: ACTIVE_OPTIONS,
    },
  ];
}
function mapEmployeeFormValues(
  source: Record<string, unknown> | null,
  defaults: Record<string, string>,
): Record<string, string> {
  const rowSource = source ?? {};
  const mergedDefaults: Record<string, string> = {
    ...EMPLOYEE_INITIAL_FORM_VALUES,
    ...defaults,
  };
  const values: Record<string, string> = { ...mergedDefaults };

  for (const fieldName of EMPLOYEE_TEXT_FIELD_NAMES) {
    const resolvedValue = toDisplayValue(getEmployeeFieldValue(rowSource, fieldName));
    values[fieldName] = resolvedValue || mergedDefaults[fieldName] || "";
  }
  for (const fieldName of EMPLOYEE_DATE_FIELD_NAMES) {
    const resolvedValue = toDateInputValue(getEmployeeFieldValue(rowSource, fieldName));
    values[fieldName] = resolvedValue || mergedDefaults[fieldName] || "";
  }
  for (const fieldName of EMPLOYEE_BOOLEAN_FIELD_NAMES) {
    const fallback = mergedDefaults[fieldName] === "false" ? "false" : "true";
    values[fieldName] = toSelectBoolean(
      getEmployeeFieldValue(rowSource, fieldName),
      fallback,
    );
  }
  values.empName =
    toDisplayValue(getEmployeeFieldValue(rowSource, "empName")) ||
    toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) ||
    mergedDefaults.empName;
  values.empCode =
    toDisplayValue(getEmployeeFieldValue(rowSource, "empCode")) ||
    toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.code)) ||
    mergedDefaults.empCode;
  values.empAlias =
    toDisplayValue(getEmployeeFieldValue(rowSource, "empAlias")) ||
    toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) ||
    mergedDefaults.empAlias;
  values.empRemarks =
    toDisplayValue(getEmployeeFieldValue(rowSource, "empRemarks")) ||
    toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
    mergedDefaults.empRemarks;
  values.empIsActive = toSelectBoolean(
    getEmployeeFieldValue(rowSource, "empIsActive") ??
      getFirstDefinedValue(rowSource, LOOKUP_KEYS.active),
    mergedDefaults.empIsActive === "false" ? "false" : "true",
  );
  return values;
}
export default function EmployeeMasterPage() {
  const { getAll: getCompanyLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getBranchLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getDepartmentLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getDesignationLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getStateLookup } = useApi<unknown>(STATE_LOOKUP_ENDPOINT);
  const { getAll: getLoanLedgerLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const [companyOptions, setCompanyOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [branchOptions, setBranchOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [designationOptions, setDesignationOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [stateOptions, setStateOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [loanLedgerOptions, setLoanLedgerOptions] = useState<ERPDynamicSelectOption[]>([]);
  
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [
        companiesPayload,
        branchesPayload,
        departmentsPayload,
        designationsPayload,
        statesPayload,
        loanLedgersPayload,
      ] = await Promise.allSettled([
        getCompanyLookup(LOOKUP_QUERY_COMPANIES),
        getBranchLookup(LOOKUP_QUERY_BRANCHES),
        getDepartmentLookup(LOOKUP_QUERY_DEPARTMENTS),
        getDesignationLookup(LOOKUP_QUERY_DESIGNATIONS),
        getStateLookup(LOOKUP_QUERY_STATES),
        getLoanLedgerLookup(LOOKUP_QUERY_LOAN_LEDGERS),
      ]);
      if (!mounted) {
        return;
      }
      setCompanyOptions(
        companiesPayload.status === "fulfilled"
          ? toLookupOptions(companiesPayload.value)
          : [],
      );
      setBranchOptions(
        branchesPayload.status === "fulfilled"
          ? toLookupOptions(branchesPayload.value)
          : [],
      );
      setDepartmentOptions(
        departmentsPayload.status === "fulfilled"
          ? toLookupOptions(departmentsPayload.value)
          : [],
      );
      setDesignationOptions(
        designationsPayload.status === "fulfilled"
          ? toLookupOptions(designationsPayload.value)
          : [],
      );
      setStateOptions(
        statesPayload.status === "fulfilled"
          ? toStateOptions(statesPayload.value)
          : [],
      );
      setLoanLedgerOptions(
        loanLedgersPayload.status === "fulfilled"
          ? toLookupOptions(loanLedgersPayload.value)
          : [],
      );
    })();
    return () => {
      mounted = false;
    };
  }, [
    getBranchLookup,
    getCompanyLookup,
    getDepartmentLookup,
    getDesignationLookup,
    getStateLookup,
    getLoanLedgerLookup,
  ]);
  const employeeFormFields = useMemo(
    () =>
      buildEmployeeFormFields(
        companyOptions,
        branchOptions,
        departmentOptions,
        designationOptions,
        stateOptions,
        EMPLOYMENT_STATUS_OPTIONS,
        SALARY_TYPE_OPTIONS,
        loanLedgerOptions,
      ),
    [
      branchOptions,
      companyOptions,
      departmentOptions,
      designationOptions,
      loanLedgerOptions,
      stateOptions,
    ],
  );
  return (
    <CrudMasterPage
      title="Employee"
      auditHistory={{ screenName: "Employee Master" }}
      entityLabel="employee"
      entityLabelPlural="employees"
      apiEndpoints={API_ENDPOINTS}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Employee List"
      createLabel="Add Employee"
      codeColumnHeader="Employee Code"
      nameColumnHeader="Employee Name"
      listResponseStyleArrayKey="styles"
      nameFieldLabel="Employee Name"
      nameFieldPlaceholder="Ravi Shah"
      formTitle="Employee Form"
      formDescription="Create and update employees."
      customFields={employeeFormFields}
      createInitialValues={EMPLOYEE_INITIAL_FORM_VALUES}
      modalPanelStyle={EMPLOYEE_MODAL_PANEL_STYLE}
      modalFormGridColumns={3}
      modalFormDenseGrid={false}
      modalStackLabels
      modalSectionNavigationMode="tabs"
      modalHideFieldHelperText
      modalHideFieldErrorText
      modalFocusFirstInvalidFieldOnValidationError
      modalEnableArrowKeyFieldNavigation
      mapFormValues={({ source, defaults }) =>
        mapEmployeeFormValues(source, defaults)
      }
      buildRequestPayload={async ({ values, shouldUpdate, editingItemId, files }) => {
        const payload: Record<string, unknown> = {
          empCompanyId: (values.empCompanyId ?? "").trim(),
          empBranchId: toNullableString(values.empBranchId ?? ""),
          empCode: toNullableString(values.empCode ?? ""),
          empName: (values.empName ?? "").trim(),
          empAlias: toNullableString(values.empAlias ?? ""),
          empMobile1: toNullableString(values.empMobile1 ?? ""),
          empMobile2: toNullableString(values.empMobile2 ?? ""),
          empEmail: toNullableString(values.empEmail ?? ""),
          empAddr1: toNullableString(values.empAddr1 ?? ""),
          empAddr2: toNullableString(values.empAddr2 ?? ""),
          empAddr3: toNullableString(values.empAddr3 ?? ""),
          empCity: toNullableString(values.empCity ?? ""),
          empDistrict: toNullableString(values.empDistrict ?? ""),
          empState: toNullableString(values.empState ?? ""),
          empPincode: toNullableString(values.empPincode ?? ""),
          empGender: toUpperNullable(values.empGender ?? ""),
          empMaritalStatus: toUpperNullable(values.empMaritalStatus ?? ""),
          empBloodGroup: toUpperNullable(values.empBloodGroup ?? ""),
          empDob: toNullableDate(values.empDob ?? ""),
          empDepartmentId: toNullableString(values.empDepartmentId ?? ""),
          empDesignationId: toNullableString(values.empDesignationId ?? ""),
          empEmploymentType: toUpperNullable(values.empEmploymentType ?? ""),
          empStatus: toUpperNullable(values.empStatus ?? ""),
          empJoinedOn: toNullableDate(values.empJoinedOn ?? ""),
          empProbationEndOn: toNullableDate(values.empProbationEndOn ?? ""),
          empConfirmationOn: toNullableDate(values.empConfirmationOn ?? ""),
          empLeftOn: toNullableDate(values.empLeftOn ?? ""),
          empShiftId: toNullableString(values.empShiftId ?? ""),
          empAttConstraintId: toNullableString(values.empAttConstraintId ?? ""),
          empHolidayGroupId: toNullableString(values.empHolidayGroupId ?? ""),
          empOvertimeAllowed: (values.empOvertimeAllowed ?? "false") === "true",
          empHasCommission: (values.empHasCommission ?? "false") === "true",
          empCommissionType:
            (values.empHasCommission ?? "false") === "true"
              ? toUpperNullable(values.empCommissionType ?? "")
              : null,
          empCommissionValue:
            (values.empHasCommission ?? "false") === "true"
              ? toNullableNumber(values.empCommissionValue ?? "")
              : null,
          empSalaryType: toUpper(values.empSalaryType ?? ""),
          empSalaryAmount: toNonNegativeNumber(values.empSalaryAmount ?? "0", 0),
          empBataAmount: toNonNegativeNumber(values.empBataAmount ?? "0", 0),
          empKmBataAmount: toNonNegativeNumber(values.empKmBataAmount ?? "0", 0),
          empPanNo: toUpperNullable(values.empPanNo ?? ""),
          empAadharNo: toNullableString(values.empAadharNo ?? ""),
          empPfNo: toNullableString(values.empPfNo ?? ""),
          empEsiNo: toNullableString(values.empEsiNo ?? ""),
          empLoanLedgerId: toNullableString(values.empLoanLedgerId ?? ""),
          empPhotoUrl: toNullableString(values.empPhotoUrl ?? ""),
          empRemarks: toNullableString(values.empRemarks ?? ""),
          empIsActive: (values.empIsActive ?? "true") === "true",
        };
        const uploadedPhoto = files.empPhotoFile;
        if (uploadedPhoto) {
          payload.empPhoto = getBase64FromDataUrl(
            await readFileAsDataUrl(uploadedPhoto),
          );
        }
        if (shouldUpdate && editingItemId !== null) {
          payload.empId = toUpdateId(editingItemId);
        }
        return payload;
      }}
    />
  );
}
