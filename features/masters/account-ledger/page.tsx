"use client";
import {
  Fragment,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import ReusableTable, { type ReusableTableColumn } from "@/components/ui/table";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchGridColumns,
  selectGridColumns,
  selectGridColumnsError,
  selectGridColumnsLoading,
  selectGridColumnsRequested,
  type GridColumnConfig,
} from "@/store/slices/gridColumnsSlice";
import styles from "@/app/master/state-master/page.module.scss";
import dynamicFormStyles from "@/components/library/ui/dynamic-modal-form.module.scss";
const API_ENDPOINTS = {
  list: "/account-ledger-masters/list",
  getById: "/account-ledger-masters/get",
  create: "/account-ledger-masters/create",
  delete: "/account-ledger-masters/delete",
} as const;
const DEBOUNCE_MS = 300;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const GRID_DETAILS_ENDPOINT = "/grid-details/list";
const STATE_CODE_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const ACCOUNT_LEDGER_TABLE_NAME = "acc_ledger_master";
const ACCOUNT_LEDGER_TABLE_NAME_ALIASES = [
  ACCOUNT_LEDGER_TABLE_NAME,
  "account_ledger_master",
  "account_ledgers",
] as const;
const GRID_DETAILS_QUERY = {
  grid_status: "true",
  search: ACCOUNT_LEDGER_TABLE_NAME,
  page: "1",
  limit: "20",
} as const;
const GRID_COLUMNS_PAGE = 1;
const GRID_COLUMNS_LIMIT = 20;
const LOOKUP_QUERY_COMPANIES = {
  module: "companies",
  limit: "20",
} as const;
const LOOKUP_QUERY_BRANCHES = {
  module: "branches",
  limit: "20",
} as const;
const LOOKUP_QUERY_ACCOUNT_GROUPS = {
  module: "accountGroups",
  limit: "20",
} as const;
const LOOKUP_QUERY_STATE_CODES = {
  module: "stateCodes",
  limit: "100",
} as const;
const STATE_NAME_SEARCH_FIELD_NAMES = new Set<string>([
  "ledStateName",
  "ledRegionStateName",
]);

const LOOKUP_KEYS = {
  id: ["ledId", "led_id", "id", "_id"],
  code: ["ledAlias", "led_alias", "ledShort", "led_short", "code"],
  name: ["ledName", "led_name", "name"],
  short: ["ledShort", "led_short", "short", "short_name", "shortName"],
  alias: ["ledAlias", "led_alias", "alias"],
  active: ["ledIsActive", "led_is_active", "isActive", "is_active", "status"],
  position: ["position", "sort", "ledSort", "led_sort"],
  description: ["ledRemarks", "led_remarks", "description", "desc"],
  array: [
    "data",
    "items",
    "results",
    "rows",
    "list",
    "accountLedgers",
    "account_ledgers",
  ],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "ledId",
  name: "ledName",
  alias: "ledAlias",
  short: "ledShort",
  description: "ledRemarks",
  sort: "ledSort",
} as const;
const LEDGER_COMPANY_NAME_KEYS = [
  "companyName",
  "company_name",
  "ledCompanyName",
  "led_company_name",
] as const;
const LEDGER_BRANCH_NAME_KEYS = [
  "branchName",
  "branch_name",
  "ledBranchName",
  "led_branch_name",
] as const;
const LEDGER_GROUP_NAME_KEYS = [
  "groupName",
  "group_name",
  "ledGroupName",
  "led_group_name",
  "accGroupName",
  "acc_group_name",
] as const;
const GRID_DETAIL_ID_KEYS = ["grid_id", "gridId", "id"] as const;
const GRID_DETAIL_SQL_KEYS = ["grid_sql", "gridSql", "sql"] as const;
const GRID_DETAIL_NAME_KEYS = ["grid_name", "gridName", "name"] as const;
const LOOKUP_ARRAY_KEYS = ["items", "data", "results", "rows", "list"] as const;
const PAGINATION_CONTAINER_KEYS = [
  "meta",
  "pagination",
  "pageInfo",
  "pager",
] as const;
const TOTAL_ENTRIES_KEYS = [
  "total",
  "totalCount",
  "total_count",
  "totalRecords",
  "total_records",
  "count",
  "recordsTotal",
  "totalItems",
  "total_items",
] as const;
const CURRENT_PAGE_KEYS = [
  "page",
  "currentPage",
  "current_page",
  "pageNo",
  "page_no",
] as const;
const PAGE_SIZE_KEYS = [
  "limit",
  "pageSize",
  "page_size",
  "perPage",
  "per_page",
] as const;
const STATE_CODE_LOOKUP_CODE_KEYS = [
  "id",
  "value",
  "stateCode",
  "state_code",
  "code",
] as const;
const STATE_CODE_LOOKUP_NAME_KEYS = [
  "stateName",
  "state_name",
  "name",
  "label",
] as const;
const DEFAULT_SELECT_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "",
};
const BOOLEAN_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Enable", value: "true" },
  { label: "Disable", value: "false" },
];
const STATUS_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Active", value: "true" },
  { label: "Inactive", value: "false" },
];
const OB_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Dr", value: "DR" },
  { label: "Cr", value: "CR" },
];
const GST_PARTY_REG_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Regular", value: "REGULAR" },
  { label: "Composition", value: "COMPOSITION" },
  { label: "Unregistered", value: "UNREGISTERED" },
];
const LEDGER_INITIAL_FORM_VALUES = {
  masterName: "",
  masterAlias: "",
  masterShortName: "",
  ledCompanyId: "",
  ledBranchId: "",
  ledGroupId: "",
  ledTallyName: "",
  ledTallyGroupName: "",
  ledTallyGuid: "",
  ledCategory: "GENERAL",
  ledIsBillByBill: "false",
  ledIsCostCenterReq: "false",
  ledIsInterestApplicable: "false",
  ledInterestRate: "0",
  ledContactPerson: "",
  ledEmail: "",
  ledTel: "",
  ledPhone1: "",
  ledPhone2: "",
  ledWhatsappNo: "",
  ledAddr1: "",
  ledAddr2: "",
  ledAddr3: "",
  ledCity: "",
  ledDistrict: "",
  ledStateName: "",
  ledStateCode: "",
  ledPin: "",
  ledCountry: "",
  ledRegionName: "",
  ledRegionAddr1: "",
  ledRegionAddr2: "",
  ledRegionAddr3: "",
  ledRegionCity: "",
  ledRegionDistrict: "",
  ledRegionStateName: "",
  ledRegionCountry: "",
  ledGstPartyRegType: "REGULAR",
  ledGstinNo: "",
  ledPanNo: "",
  ledAadharNo: "",
  ledEcommerceGstin: "",
  ledIsSez: "false",
  ledChequeName: "",
  ledBankName: "",
  ledBankBranch: "",
  ledBankAcNo: "",
  ledBankIfsc: "",
  ledUpiId: "",
  ledObAmount: "0",
  ledObType: "DR",
  ledObAsOn: "",
  ledTotalDr: "0",
  ledTotalCr: "0",
  ledTotalBalance: "0",
  ledIsActive: "true",
  ledAllowEdit: "false",
  ledIsEntry: "false",
  ledAllowSms: "false",
  masterDescription: "",
} as const;
function buildLedgerFormFields(
  companyOptions: ERPDynamicSelectOption[],
  branchOptions: ERPDynamicSelectOption[],
  accountGroupOptions: ERPDynamicSelectOption[],
  stateNameOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "Ledger Name",
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Ledger Name must be at least 2 characters.",
      },
    },     
      {
      name: "masterAlias",
      label: "Ledger Alias",
    },
    {
      name: "masterShortName",
      label: "Ledger Short",
    },
    {
      name: "ledCompanyId",
      label: "Company",
      type: "select",
      searchable: true,
      required: true,
      options: companyOptions,
    },  
    {
      name: "ledBranchId",
      label: "Branch",
      type: "select",
      searchable: true,
      required: true,
      options: branchOptions,
    },
    {
      name: "ledGroupId",
      label: "Account Group",
      type: "select",
      searchable: true,
      required: true,
      options: accountGroupOptions,
    },
     {
      name: "__heading_statutory",
      label: "GST & Statutory",
      type: "heading",
    },
    {
      name: "ledGstinNo",
      label: "GSTIN",
    },
    {
      name: "ledGstPartyRegType",
      label: "GST Party Reg Type",
      type: "select",
      options: GST_PARTY_REG_TYPE_OPTIONS,
    },
    {
      name: "ledEcommerceGstin",
      label: "Ecommerce GSTIN",
    },
    {
      name: "ledPanNo",
      label: "PAN",
      validation: {
        pattern: "^[A-Z]{5}[0-9]{4}[A-Z]{1}$",
        patternMessage: "PAN must be 10 characters (e.g., ABCDE1234F).",
        minLength: 10,
        minLengthMessage: "PAN must be 10 characters.",
        maxLength: 10,
        maxLengthMessage: "PAN must be 10 characters.",
      },
    },
    {
      name: "ledAadharNo",
      label: "Aadhar No",
      validation: {
        pattern: "^[0-9]{12}$",
        patternMessage: "Aadhar must be 12 digits.",
        minLength: 12,
        minLengthMessage: "Aadhar must be 12 digits.",
        maxLength: 12,
        maxLengthMessage: "Aadhar must be 12 digits.",
      },
    },
    // {
    //   name: "__heading_behavior",
    //   label: "Classification & Behavior",
    //   type: "heading",
    // },
    // {
    //   name: "ledCategory",
    //   label: "Category",
    //   placeholder: "GENERAL",
    // },
    // {
    //   name: "ledIsCostCenterReq",
    //   label: "Cost Center Required",
    //   type: "checkbox",
    // },
    // {
    //   name: "ledIsInterestApplicable",
    //   label: "Interest Applicable",
    //   type: "checkbox",
    // },
    // {
    //   name: "ledInterestRate",
    //   label: "Interest Rate %",
    //   type: "number",
    //   step: "0.01",
    //   min: 0,
    // },
    {
      name: "__heading_contact",
      label: "Contact Details",
      type: "heading",
    },
    {
      name: "ledContactPerson",
      label: "Contact Person",
    },
    {
      name: "ledAddr1",
      label: "Address 1",
    },
    {
      name: "ledDistrict",
      label: "district",
    },
    {
      name: "ledEmail",
      label: "Email",
      type: "email",
    },
    {
      name: "ledAddr2",
      label: "Address 2",
    },
    {
      name: "ledPin",
      label: "pin",
    },
    {
      name: "ledTel",
      label: "Tel",
      type: "tel",
    },
    {
      name: "ledAddr3",
      label: "Address 3",
    },
    {
      name: "ledStateName",
      label: "state",
      type: "select",
      searchable: true,
      options: stateNameOptions,
      placeholder: "Search state",
    },
    {
      name: "ledPhone1",
      label: "Phone 1",
      type: "tel",
    },
    {
      name: "ledCity",
      label: "City",
    },
    {
      name: "ledCountry",
      label: "country",
    },
    {
      name: "ledPhone2",
      label: "Phone 2",
      type: "tel",
    },
    {
      name: "__heading_region",
      label: "Regional Address",
      type: "heading",
    },
    {
      name: "ledRegionName",
      label: "Region Name",
    },
    {
      name: "ledRegionAddr3",
      label: "Region Address 3",
    },
    {
      name: "ledRegionStateName",
      label: "Region state",
      type: "select",
      searchable: true,
      options: stateNameOptions,
      placeholder: "Search state",
    },
    {
      name: "ledRegionAddr1",
      label: "Region Address 1",
    },
    {
      name: "ledRegionCity",
      label: "Region city",
    },
    {
      name: "ledRegionCountry",
      label: "Region country",
    },
    {
      name: "ledRegionAddr2",
      label: "Region Address 2",
    },
    {
      name: "ledRegionDistrict",
      label: "Region district",
    },
    {
      name: "__heading_bank",
      label: "Bank & Payment",
      type: "heading",
    },
    {
      name: "ledChequeName",
      label: "Account Holder Name",
    },
    {
      name: "ledBankBranch",
      label: "Bank Branch",
    },
    {
      name: "ledBankIfsc",
      label: "Bank IFSC",
    },
    {
      name: "ledBankName",
      label: "Bank Name",
    },
    {
      name: "ledBankAcNo",
      label: "Bank A/C No",
    },
    {
      name: "ledUpiId",
      label: "UPI ID",
    },
    {
      name: "__heading_opening",
      label: "Opening Balance",
      type: "heading",
    },
    {
      name: "ledObAmount",
      label: "Opening Amount",
      type: "number",
      step: "0.01",
      colSpan: 1,
      min: 0,
    },
    {
      name: "ledObType",
      label: "Opening Type",
      type: "select",
      colSpan: 1,
      options: OB_TYPE_OPTIONS,
    },
    {
      name: "__heading_control",
      label: "Status & Controls",
      type: "heading",
    },
    {
      name: "ledIsActive",
      label: "Is Active",
      type: "checkbox",
      colSpan: 1,
      options: STATUS_OPTIONS,
    },

    {
      name: "ledIsBillByBill",
      label: "Bill By Bill",
      type: "checkbox",
    },
    {
      name: "ledAllowSms",
      label: "Allow SMS",
      type: "checkbox",
      colSpan: 1,
      options: BOOLEAN_OPTIONS,
    },
    {
      name: "masterDescription",
      label: "Remarks",
    },
  ];
}
function getFirstDefinedValue(
  source: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
}
function toDisplayValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "object") {
    const nested = value as Record<string, unknown>;
    const fallback =
      nested.value ?? nested.id ?? nested.code ?? nested.name ?? nested.label;
    if (
      typeof fallback === "string" ||
      typeof fallback === "number" ||
      typeof fallback === "bigint" ||
      typeof fallback === "boolean"
    ) {
      return String(fallback);
    }
  }
  return "";
}
function toSnakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}
function getFieldValue(
  source: Record<string, unknown>,
  fieldName: string,
): unknown {
  return getFirstDefinedValue(source, [fieldName, toSnakeCase(fieldName)]);
}
function toSelectBoolean(
  value: unknown,
  defaultValue: string,
): "true" | "false" {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  const normalized = toDisplayValue(value).toLowerCase();
  if (["1", "true", "yes", "active"].includes(normalized)) {
    return "true";
  }
  if (["0", "false", "no", "inactive"].includes(normalized)) {
    return "false";
  }
  const normalizedDefaultValue = defaultValue.trim().toLowerCase();
  return ["1", "true", "yes", "active"].includes(normalizedDefaultValue)
    ? "true"
    : "false";
}
function toNumber(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}
function toNullableString(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}
function toUpperNullable(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized.toUpperCase() : null;
}
function toNullableDate(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}
function toDateInputValue(value: unknown): string {
  const normalized = toDisplayValue(value);
  if (!normalized) {
    return "";
  }
  const matched = normalized.match(/^\d{4}-\d{2}-\d{2}/);
  return matched ? matched[0] : normalized;
}
function normalizeGstPartyRegType(
  value: string,
): "REGULAR" | "COMPOSITION" | "UNREGISTERED" | null {
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "REGULAR" ||
    normalized === "COMPOSITION" ||
    normalized === "UNREGISTERED"
  ) {
    return normalized;
  }
  return null;
}
function normalizeObType(value: string): "DR" | "CR" {
  return value.trim().toUpperCase() === "CR" ? "CR" : "DR";
}
function extractRows(
  payload: unknown,
  arrayKeys: readonly string[],
): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const objectPayload = payload as Record<string, unknown>;
  for (const key of arrayKeys) {
    const value = objectPayload[key];
    if (Array.isArray(value)) {
      return value;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nestedObject = value as Record<string, unknown>;
      for (const nestedKey of arrayKeys) {
        const nestedValue = nestedObject[nestedKey];
        if (Array.isArray(nestedValue)) {
          return nestedValue;
        }
      }
    }
  }
  const firstArray = Object.values(objectPayload).find((value) =>
    Array.isArray(value),
  );
  return Array.isArray(firstArray) ? firstArray : [];
}
function buildLookupOptions(
  payload: unknown,
  includeEmptyOption = true,
): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, LOOKUP_ARRAY_KEYS);

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const id = toDisplayValue(getFirstDefinedValue(source, ["id", "value"]));
    if (!id) {
      continue;
    }
    const name = toDisplayValue(
      getFirstDefinedValue(source, ["name", "label"]),
    );
    const label = name || id;
    if (!optionMap.has(id)) {
      optionMap.set(id, label);
    }
  }
  const options = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
  if (!includeEmptyOption) {
    return options;
  }
  return [DEFAULT_SELECT_OPTION, ...options];
}
function buildStateNameOptions(payload: unknown): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, LOOKUP_ARRAY_KEYS);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const stateName = toDisplayValue(
      getFirstDefinedValue(source, STATE_CODE_LOOKUP_NAME_KEYS),
    );
    const stateCode = toDisplayValue(
      getFirstDefinedValue(source, STATE_CODE_LOOKUP_CODE_KEYS),
    ).toUpperCase();
    if (!stateName) {
      continue;
    }
    const label = stateCode ? `${stateName} (${stateCode})` : stateName;
    if (!optionMap.has(stateName)) {
      optionMap.set(stateName, label);
    }
  }
  const options = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
  return [DEFAULT_SELECT_OPTION, ...options];
}
function buildStateCodeByName(payload: unknown): Record<string, string> {
  const codeMap = new Map<string, string>();
  const rows = extractRows(payload, LOOKUP_ARRAY_KEYS);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const stateName = toDisplayValue(
      getFirstDefinedValue(source, STATE_CODE_LOOKUP_NAME_KEYS),
    );
    const stateCode = toDisplayValue(
      getFirstDefinedValue(source, STATE_CODE_LOOKUP_CODE_KEYS),
    ).toUpperCase();
    if (!stateName || !stateCode) {
      continue;
    }
    if (!codeMap.has(stateName)) {
      codeMap.set(stateName, stateCode);
    }
  }
  return Object.fromEntries(codeMap.entries());
}
type LedgerFormFieldName = keyof typeof LEDGER_INITIAL_FORM_VALUES;
type LedgerFormValues = Record<LedgerFormFieldName, string>;
type LedgerFormSection = {
  key: string;
  title: string;
  helperText?: string;
  fields: ERPDynamicModalField[];
};
type ModalMode = "create" | "update" | "view";
type LedgerTableRow = {
  __rowId: string | number;
  __recordId: string | number;
  __source: Record<string, unknown> | null;
  serialNo: number;
  ledgerId: string;
  ledgerCode: string;
  ledgerName: string;
  ledgerShort: string;
  ledgerStatus: string;
  companyName: string;
  branchName: string;
  groupName: string;
};
type PaginationInfo = {
  totalEntries: number | null;
  currentPage: number | null;
  pageSize: number | null;
};
type LedgerColumnAccessor = keyof Pick<
  LedgerTableRow,
  | "serialNo"
  | "ledgerId"
  | "ledgerCode"
  | "ledgerName"
  | "ledgerShort"
  | "ledgerStatus"
  | "companyName"
  | "branchName"
  | "groupName"
>;
const DEFAULT_LEDGER_SERIAL_COLUMN: ReusableTableColumn<LedgerTableRow> = {
  key: "serialNo",
  header: "S.No",
  accessor: "serialNo",
  width: "56px",
  sortable: false,
};
const DEFAULT_LEDGER_COLUMNS: ReusableTableColumn<LedgerTableRow>[] = [
  DEFAULT_LEDGER_SERIAL_COLUMN,
  {
    key: "ledgerCode",
    header: "Ledger Code",
    accessor: "ledgerCode",
    width: "220px",
  },
  {
    key: "ledgerName",
    header: "Ledger Name",
    accessor: "ledgerName",
    width: "320px",
  },
  {
    key: "ledgerShort",
    header: "Short Name",
    accessor: "ledgerShort",
    width: "180px",
  },
  {
    key: "ledgerStatus",
    header: "Status",
    accessor: "ledgerStatus",
    width: "120px",
  },
];
const LEDGER_COLUMN_ACCESSOR_MAP: Record<string, LedgerColumnAccessor> = {
  sno: "serialNo",
  srno: "serialNo",
  serialno: "serialNo",
  serialnumber: "serialNo",
  code: "ledgerCode",
  ledgercode: "ledgerCode",
  ledgeralias: "ledgerCode",
  ledger_alias: "ledgerCode",
  ledalias: "ledgerCode",
  led_alias: "ledgerCode",
  alias: "ledgerCode",
  name: "ledgerName",
  ledgername: "ledgerName",
  ledgernames: "ledgerName",
  ledger_names: "ledgerName",
  ledname: "ledgerName",
  led_name: "ledgerName",
  short: "ledgerShort",
  shortname: "ledgerShort",
  ledgershort: "ledgerShort",
  ledger_short: "ledgerShort",
  ledshort: "ledgerShort",
  led_short: "ledgerShort",
  status: "ledgerStatus",
  active: "ledgerStatus",
  isactive: "ledgerStatus",
  is_active: "ledgerStatus",
  ledisactive: "ledgerStatus",
  led_is_active: "ledgerStatus",
  id: "ledgerId",
  ledgerid: "ledgerId",
  ledid: "ledgerId",
  led_id: "ledgerId",
  companyname: "companyName",
  company_name: "companyName",
  branchname: "branchName",
  branch_name: "branchName",
  groupname: "groupName",
  group_name: "groupName",
};
const LEDGER_FIELD_NAME_SET = new Set<string>(
  Object.keys(LEDGER_INITIAL_FORM_VALUES),
);
const LEDGER_ASIDE_SECTION_KEYS = new Set<string>(["__heading_control"]);
function isLedgerFieldName(value: string): value is LedgerFormFieldName {
  return LEDGER_FIELD_NAME_SET.has(value);
}
function createInitialLedgerFormValues(): LedgerFormValues {
  return {
    ...LEDGER_INITIAL_FORM_VALUES,
  };
}
function toLedgerFormValues(source: Record<string, unknown> | null): LedgerFormValues {
  const rowSource = source ?? {};
  const defaults = createInitialLedgerFormValues();
  const gstPartyType = normalizeGstPartyRegType(
    toDisplayValue(getFieldValue(rowSource, "ledGstPartyRegType")),
  );
  return {
    ...defaults,
    masterName:
      toDisplayValue(getFieldValue(rowSource, "ledName")) || defaults.masterName,
    masterAlias:
      toDisplayValue(getFieldValue(rowSource, "ledAlias")) || defaults.masterAlias,
    masterShortName:
      toDisplayValue(getFieldValue(rowSource, "ledShort")) || defaults.masterShortName,
    ledCompanyId:
      toDisplayValue(getFieldValue(rowSource, "ledCompanyId")) || defaults.ledCompanyId,
    ledBranchId:
      toDisplayValue(getFieldValue(rowSource, "ledBranchId")) || defaults.ledBranchId,
    ledGroupId:
      toDisplayValue(getFieldValue(rowSource, "ledGroupId")) || defaults.ledGroupId,
    ledTallyName: toDisplayValue(getFieldValue(rowSource, "ledTallyName")),
    ledTallyGroupName: toDisplayValue(getFieldValue(rowSource, "ledTallyGroupName")),
    ledTallyGuid: toDisplayValue(getFieldValue(rowSource, "ledTallyGuid")),
    ledCategory:
      toDisplayValue(getFieldValue(rowSource, "ledCategory")) || defaults.ledCategory,
    ledIsBillByBill: toSelectBoolean(getFieldValue(rowSource, "ledIsBillByBill"), "false"),
    ledIsCostCenterReq: toSelectBoolean(
      getFieldValue(rowSource, "ledIsCostCenterReq"),
      "false",
    ),
    ledIsInterestApplicable: toSelectBoolean(
      getFieldValue(rowSource, "ledIsInterestApplicable"),
      "false",
    ),
    ledInterestRate:
      toDisplayValue(getFieldValue(rowSource, "ledInterestRate")) || defaults.ledInterestRate,
    ledContactPerson: toDisplayValue(getFieldValue(rowSource, "ledContactPerson")),
    ledEmail: toDisplayValue(getFieldValue(rowSource, "ledEmail")),
    ledTel: toDisplayValue(getFieldValue(rowSource, "ledTel")),
    ledPhone1: toDisplayValue(getFieldValue(rowSource, "ledPhone1")),
    ledPhone2: toDisplayValue(getFieldValue(rowSource, "ledPhone2")),
    ledWhatsappNo: toDisplayValue(getFieldValue(rowSource, "ledWhatsappNo")),
    ledAddr1: toDisplayValue(getFieldValue(rowSource, "ledAddr1")),
    ledAddr2: toDisplayValue(getFieldValue(rowSource, "ledAddr2")),
    ledAddr3: toDisplayValue(getFieldValue(rowSource, "ledAddr3")),
    ledCity: toDisplayValue(getFieldValue(rowSource, "ledCity")),
    ledDistrict: toDisplayValue(getFieldValue(rowSource, "ledDistrict")),
    ledStateName: toDisplayValue(getFieldValue(rowSource, "ledStateName")),
    ledStateCode: toDisplayValue(getFieldValue(rowSource, "ledStateCode")),
    ledPin: toDisplayValue(getFieldValue(rowSource, "ledPin")),
    ledCountry: toDisplayValue(getFieldValue(rowSource, "ledCountry")),
    ledRegionName: toDisplayValue(getFieldValue(rowSource, "ledRegionName")),
    ledRegionAddr1: toDisplayValue(getFieldValue(rowSource, "ledRegionAddr1")),
    ledRegionAddr2: toDisplayValue(getFieldValue(rowSource, "ledRegionAddr2")),
    ledRegionAddr3: toDisplayValue(getFieldValue(rowSource, "ledRegionAddr3")),
    ledRegionCity: toDisplayValue(getFieldValue(rowSource, "ledRegionCity")),
    ledRegionDistrict: toDisplayValue(getFieldValue(rowSource, "ledRegionDistrict")),
    ledRegionStateName: toDisplayValue(getFieldValue(rowSource, "ledRegionStateName")),
    ledRegionCountry: toDisplayValue(getFieldValue(rowSource, "ledRegionCountry")),
    ledGstPartyRegType: gstPartyType ?? defaults.ledGstPartyRegType,
    ledGstinNo: toDisplayValue(getFieldValue(rowSource, "ledGstinNo")),
    ledPanNo: toDisplayValue(getFieldValue(rowSource, "ledPanNo")),
    ledAadharNo: toDisplayValue(getFieldValue(rowSource, "ledAadharNo")),
    ledEcommerceGstin: toDisplayValue(getFieldValue(rowSource, "ledEcommerceGstin")),
    ledIsSez: toSelectBoolean(getFieldValue(rowSource, "ledIsSez"), "false"),
    ledChequeName: toDisplayValue(getFieldValue(rowSource, "ledChequeName")),
    ledBankName: toDisplayValue(getFieldValue(rowSource, "ledBankName")),
    ledBankBranch: toDisplayValue(getFieldValue(rowSource, "ledBankBranch")),
    ledBankAcNo: toDisplayValue(getFieldValue(rowSource, "ledBankAcNo")),
    ledBankIfsc: toDisplayValue(getFieldValue(rowSource, "ledBankIfsc")),
    ledUpiId: toDisplayValue(getFieldValue(rowSource, "ledUpiId")),
    ledObAmount:
      toDisplayValue(getFieldValue(rowSource, "ledObAmount")) || defaults.ledObAmount,
    ledObType: normalizeObType(toDisplayValue(getFieldValue(rowSource, "ledObType"))),
    ledObAsOn: toDateInputValue(getFieldValue(rowSource, "ledObAsOn")),
    ledTotalDr: toDisplayValue(getFieldValue(rowSource, "ledTotalDr")) || defaults.ledTotalDr,
    ledTotalCr: toDisplayValue(getFieldValue(rowSource, "ledTotalCr")) || defaults.ledTotalCr,
    ledTotalBalance:
      toDisplayValue(getFieldValue(rowSource, "ledTotalBalance")) || defaults.ledTotalBalance,
    ledIsActive: toSelectBoolean(getFieldValue(rowSource, "ledIsActive"), "true"),
    ledAllowEdit: toSelectBoolean(getFieldValue(rowSource, "ledAllowEdit"), "false"),
    ledIsEntry: toSelectBoolean(getFieldValue(rowSource, "ledIsEntry"), "false"),
    ledAllowSms: toSelectBoolean(getFieldValue(rowSource, "ledAllowSms"), "false"),
    masterDescription:
      toDisplayValue(getFieldValue(rowSource, "ledRemarks")) || defaults.masterDescription,
  };
}
function buildLedgerRequestPayload(
  values: LedgerFormValues,
  shouldUpdate: boolean,
  editingItemId: string | number | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ledCompanyId: (values.ledCompanyId ?? "").trim(),
    ledBranchId: (values.ledBranchId ?? "").trim(),
    ledGroupId: (values.ledGroupId ?? "").trim(),
    ledName: (values.masterName ?? "").trim(),
    ledAlias: toNullableString(values.masterAlias ?? ""),
    ledShort: toNullableString(values.masterShortName ?? ""),
    ledTallyName: toNullableString(values.ledTallyName ?? ""),
    ledTallyGroupName: toNullableString(values.ledTallyGroupName ?? ""),
    ledTallyGuid: toNullableString(values.ledTallyGuid ?? ""),
    ledCategory: (values.ledCategory ?? "").trim() || "GENERAL",
    ledIsBillByBill: (values.ledIsBillByBill ?? "false") === "true",
    ledIsCostCenterReq: (values.ledIsCostCenterReq ?? "false") === "true",
    ledIsInterestApplicable: (values.ledIsInterestApplicable ?? "false") === "true",
    ledInterestRate: Math.max(0, toNumber(values.ledInterestRate ?? "0", 0)),
    ledContactPerson: toNullableString(values.ledContactPerson ?? ""),
    ledEmail: toNullableString(values.ledEmail ?? ""),
    ledTel: toNullableString(values.ledTel ?? ""),
    ledPhone1: toNullableString(values.ledPhone1 ?? ""),
    ledPhone2: toNullableString(values.ledPhone2 ?? ""),
    ledWhatsappNo: toNullableString(values.ledWhatsappNo ?? ""),
    ledAddr1: toNullableString(values.ledAddr1 ?? ""),
    ledAddr2: toNullableString(values.ledAddr2 ?? ""),
    ledAddr3: toNullableString(values.ledAddr3 ?? ""),
    ledCity: toNullableString(values.ledCity ?? ""),
    ledDistrict: toNullableString(values.ledDistrict ?? ""),
    ledStateName: toNullableString(values.ledStateName ?? ""),
    ledStateCode: toUpperNullable(values.ledStateCode ?? ""),
    ledPin: toNullableString(values.ledPin ?? ""),
    ledCountry: toNullableString(values.ledCountry ?? ""),
    ledRegionName: toNullableString(values.ledRegionName ?? ""),
    ledRegionAddr1: toNullableString(values.ledRegionAddr1 ?? ""),
    ledRegionAddr2: toNullableString(values.ledRegionAddr2 ?? ""),
    ledRegionAddr3: toNullableString(values.ledRegionAddr3 ?? ""),
    ledRegionCity: toNullableString(values.ledRegionCity ?? ""),
    ledRegionDistrict: toNullableString(values.ledRegionDistrict ?? ""),
    ledRegionStateName: toNullableString(values.ledRegionStateName ?? ""),
    ledRegionCountry: toNullableString(values.ledRegionCountry ?? ""),
    ledGstPartyRegType: normalizeGstPartyRegType(values.ledGstPartyRegType ?? ""),
    ledGstinNo: toUpperNullable(values.ledGstinNo ?? ""),
    ledPanNo: toUpperNullable(values.ledPanNo ?? ""),
    ledAadharNo: toNullableString(values.ledAadharNo ?? ""),
    ledEcommerceGstin: toUpperNullable(values.ledEcommerceGstin ?? ""),
    ledIsSez: (values.ledIsSez ?? "false") === "true",
    ledChequeName: toNullableString(values.ledChequeName ?? ""),
    ledBankName: toNullableString(values.ledBankName ?? ""),
    ledBankBranch: toNullableString(values.ledBankBranch ?? ""),
    ledBankAcNo: toNullableString(values.ledBankAcNo ?? ""),
    ledBankIfsc: toUpperNullable(values.ledBankIfsc ?? ""),
    ledUpiId: toNullableString(values.ledUpiId ?? ""),
    ledObAmount: Math.max(0, toNumber(values.ledObAmount ?? "0", 0)),
    ledObType: normalizeObType(values.ledObType ?? "DR"),
    ledObAsOn: toNullableDate(values.ledObAsOn ?? ""),
    ledTotalDr: toNumber(values.ledTotalDr ?? "0", 0),
    ledTotalCr: toNumber(values.ledTotalCr ?? "0", 0),
    ledTotalBalance: toNumber(values.ledTotalBalance ?? "0", 0),
    ledIsActive: (values.ledIsActive ?? "true") === "true",
    ledAllowEdit: (values.ledAllowEdit ?? "false") === "true",
    ledIsEntry: (values.ledIsEntry ?? "false") === "true",
    ledAllowSms: (values.ledAllowSms ?? "false") === "true",
    ledRemarks: toNullableString(values.masterDescription ?? ""),
  };
  if (shouldUpdate && editingItemId !== null) {
    payload.ledId = String(editingItemId);
  }
  return payload;
}
function toLedgerFormSections(fields: ERPDynamicModalField[]): LedgerFormSection[] {
  const sections: LedgerFormSection[] = [];
  let currentSection: LedgerFormSection = {
    key: "general",
    title: "General",
    fields: [],
  };
  for (const field of fields) {
    if ((field.type ?? "text") === "heading") {
      if (currentSection.fields.length > 0) {
        sections.push(currentSection);
      }
      currentSection = {
        key: field.name,
        title: field.label,
        helperText: field.helperText,
        fields: [],
      };
      continue;
    }
    currentSection.fields.push(field);
  }
  if (currentSection.fields.length > 0) {
    sections.push(currentSection);
  }
  return sections;
}

function buildSectionExpandedState(
  sections: LedgerFormSection[],
): Record<string, boolean> {
  return sections.reduce<Record<string, boolean>>((state, section) => {
    state[section.key] = section.key !== "__heading_region";
    return state;
  }, {});
}
function normalizeColumnToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, "");
}
function normalizeGridColumnColor(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}
function resolveLedgerAccessor(
  ...candidates: Array<string | undefined>
): LedgerColumnAccessor | null {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const normalized = normalizeColumnToken(candidate);
    const mapped = LEDGER_COLUMN_ACCESSOR_MAP[normalized];
    if (mapped) {
      return mapped;
    }

    const compact = normalized.replace(/_/g, "");
    const compactMapped = LEDGER_COLUMN_ACCESSOR_MAP[compact];
    if (compactMapped) {
      return compactMapped;
    }
  }

  return null;
}
function resolveNumericId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  return null;
}
type ResolvedGridDetails = {
  gridId: number | null;
  gridName: string | null;
};

function resolveAccountLedgerGridDetails(payload: unknown): ResolvedGridDetails {
  const rows = extractRows(payload, LOOKUP_ARRAY_KEYS);

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }

    const source = row as Record<string, unknown>;
    const gridId = resolveNumericId(getFirstDefinedValue(source, GRID_DETAIL_ID_KEYS));
    if (gridId === null) {
      continue;
    }

    const gridSql = toDisplayValue(getFirstDefinedValue(source, GRID_DETAIL_SQL_KEYS)).toLowerCase();
    if (
      !gridSql ||
      ACCOUNT_LEDGER_TABLE_NAME_ALIASES.some((tableName) => gridSql.includes(tableName))
    ) {
      const gridName = toDisplayValue(
        getFirstDefinedValue(source, GRID_DETAIL_NAME_KEYS),
      );
      return {
        gridId,
        gridName: gridName || null,
      };
    }
  }

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }

    const source = row as Record<string, unknown>;
    const gridId = resolveNumericId(getFirstDefinedValue(source, GRID_DETAIL_ID_KEYS));
    if (gridId !== null) {
      const gridName = toDisplayValue(
        getFirstDefinedValue(source, GRID_DETAIL_NAME_KEYS),
      );
      return {
        gridId,
        gridName: gridName || null,
      };
    }
  }

  return {
    gridId: null,
    gridName: null,
  };
}
function buildColumnsFromGridColumns(
  gridColumns: GridColumnConfig[],
): ReusableTableColumn<LedgerTableRow>[] {
  const columns: ReusableTableColumn<LedgerTableRow>[] = [];
  const seenColumnKeys = new Set<string>();

  const visibleColumns = gridColumns
    .filter((column) => column.visible)
    .sort((left, right) => left.order - right.order);

  for (const gridColumn of visibleColumns) {
    const accessor = resolveLedgerAccessor(
      gridColumn.accessorKey,
      gridColumn.key,
      gridColumn.header,
    );
    if (!accessor) {
      continue;
    }

    const keyBase =
      normalizeColumnToken(gridColumn.key || gridColumn.accessorKey || gridColumn.header || accessor) ||
      accessor;
    const uniqueKey = seenColumnKeys.has(keyBase)
      ? `${keyBase}-${columns.length + 1}`
      : keyBase;
    seenColumnKeys.add(uniqueKey);

    const columnColor = normalizeGridColumnColor(gridColumn.color);
    const tableColumn: ReusableTableColumn<LedgerTableRow> = {
      key: uniqueKey,
      header: gridColumn.header,
      accessor,
      align: gridColumn.align ?? "left",
      width: gridColumn.width ?? (accessor === "serialNo" ? "56px" : undefined),
      sortable: gridColumn.sortable ?? accessor !== "serialNo",
      headerStyle: columnColor ? { backgroundColor: columnColor } : undefined,
      cellStyle: columnColor ? { backgroundColor: columnColor } : undefined,
    };

    columns.push(tableColumn);
  }

  if (columns.length === 0) {
    return DEFAULT_LEDGER_COLUMNS;
  }

  const serialColumnIndex = columns.findIndex((column) => column.accessor === "serialNo");
  if (serialColumnIndex < 0) {
    columns.unshift({ ...DEFAULT_LEDGER_SERIAL_COLUMN });
    return columns;
  }

  if (serialColumnIndex > 0) {
    const [serialColumn] = columns.splice(serialColumnIndex, 1);
    columns.unshift({
      ...serialColumn,
      accessor: "serialNo",
      sortable: false,
    });
  }

  return columns;
}
function extractDetailSource(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const objectPayload = payload as Record<string, unknown>;
  const nestedData = objectPayload.data;
  if (
    nestedData &&
    typeof nestedData === "object" &&
    !Array.isArray(nestedData)
  ) {
    return nestedData as Record<string, unknown>;
  }
  return objectPayload;
}
function toNonNegativeInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.floor(value);
    return normalized >= 0 ? normalized : null;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return null;
}
function toPositiveInt(value: unknown): number | null {
  const normalized = toNonNegativeInt(value);
  if (normalized === null || normalized < 1) {
    return null;
  }
  return normalized;
}
function findPaginationNumber(
  candidates: Record<string, unknown>[],
  keys: readonly string[],
  allowZero: boolean,
): number | null {
  for (const candidate of candidates) {
    for (const key of keys) {
      const value = candidate[key];
      const normalized = allowZero
        ? toNonNegativeInt(value)
        : toPositiveInt(value);
      if (normalized !== null) {
        return normalized;
      }
    }
  }
  return null;
}
function extractPaginationInfo(payload: unknown): PaginationInfo {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      totalEntries: null,
      currentPage: null,
      pageSize: null,
    };
  }
  const root = payload as Record<string, unknown>;
  const candidates: Record<string, unknown>[] = [root];
  for (const key of PAGINATION_CONTAINER_KEYS) {
    const value = root[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      candidates.push(value as Record<string, unknown>);
    }
  }
  if (root.data && typeof root.data === "object" && !Array.isArray(root.data)) {
    candidates.push(root.data as Record<string, unknown>);
  }
  return {
    totalEntries: findPaginationNumber(candidates, TOTAL_ENTRIES_KEYS, true),
    currentPage: findPaginationNumber(candidates, CURRENT_PAGE_KEYS, false),
    pageSize: findPaginationNumber(candidates, PAGE_SIZE_KEYS, false),
  };
}
function buildLedgerRows(payload: unknown, serialOffset: number): LedgerTableRow[] {
  return extractRows(payload, LOOKUP_KEYS.array).map((item, index) => {
    const serialNo = serialOffset + index + 1;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const row = item as Record<string, unknown>;
      const idValue = getFirstDefinedValue(row, LOOKUP_KEYS.id);
      const codeValue = getFirstDefinedValue(row, LOOKUP_KEYS.code);
      const nameValue = getFirstDefinedValue(row, LOOKUP_KEYS.name);
      const shortValue = getFirstDefinedValue(row, LOOKUP_KEYS.short);
      const activeValue = getFirstDefinedValue(row, LOOKUP_KEYS.active);
      const companyNameValue = getFirstDefinedValue(row, LEDGER_COMPANY_NAME_KEYS);
      const branchNameValue = getFirstDefinedValue(row, LEDGER_BRANCH_NAME_KEYS);
      const groupNameValue = getFirstDefinedValue(row, LEDGER_GROUP_NAME_KEYS);
      const preferredKey = idValue ?? row.id ?? row._id ?? row.code ?? serialNo;
      const rowId =
        typeof preferredKey === "string" || typeof preferredKey === "number"
          ? preferredKey
          : serialNo;
      return {
        __rowId: rowId,
        __recordId: rowId,
        __source: row,
        serialNo,
        ledgerId: toDisplayValue(idValue) || String(serialNo),
        ledgerCode: toDisplayValue(codeValue),
        ledgerName: toDisplayValue(nameValue),
        ledgerShort: toDisplayValue(shortValue),
        ledgerStatus: toDisplayValue(activeValue),
        companyName: toDisplayValue(companyNameValue),
        branchName: toDisplayValue(branchNameValue),
        groupName: toDisplayValue(groupNameValue),
      };
    }
    return {
      __rowId: serialNo,
      __recordId: serialNo,
      __source: null,
      serialNo,
      ledgerId: String(serialNo),
      ledgerCode: "",
      ledgerName: toDisplayValue(item),
      ledgerShort: "",
      ledgerStatus: "",
      companyName: "",
      branchName: "",
      groupName: "",
    };
  });
}
function resolveLedgerRecordId(row: LedgerTableRow): string | number {
  if (row.__source) {
    const sourceId = getFirstDefinedValue(row.__source, LOOKUP_KEYS.id);
    if (typeof sourceId === "string" || typeof sourceId === "number") {
      return sourceId;
    }
  }
  return row.__recordId;
}
function toSafePageNumber(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PAGE;
}
function toSafePageSize(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PAGE_SIZE;
}
function validateLedgerForm(values: LedgerFormValues): string | null {
  if (!(values.masterName ?? "").trim()) {
    return "Ledger Name is required.";
  }
  if (!(values.ledCompanyId ?? "").trim()) {
    return "Company is required.";
  }
  if (!(values.ledBranchId ?? "").trim()) {
    return "Branch is required.";
  }
  if (!(values.ledGroupId ?? "").trim()) {
    return "Account Group is required.";
  }
  return null;
}
export default function AccountLedgerMasterPage() {
  const dispatch = useAppDispatch();
  const { data, error, loading, getAll } = useApi<unknown>(API_ENDPOINTS.list);
  const { getAll: getGridDetails } = useApi<unknown>(GRID_DETAILS_ENDPOINT);
  const {
    run: getById,
    loading: detailsLoading,
    error: detailsError,
    reset: resetDetailsState,
  } = useApi<unknown, Record<string, unknown>>(API_ENDPOINTS.getById, {
    method: "GET",
    toast: {
      success: false,
    },
  });
  const {
    run: upsertRecord,
    loading: saveLoading,
    error: saveError,
    reset: resetSaveState,
  } = useApi<unknown, Record<string, unknown>>(API_ENDPOINTS.create, {
    method: "POST",
  });
  const {
    run: deleteRecord,
    loading: deleteLoading,
    error: deleteError,
  } = useApi<unknown>(API_ENDPOINTS.delete, { method: "DELETE" });
  const { getAll: getCompanyLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getBranchLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getAccountGroupLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getStateCodeLookup } = useApi<unknown>(STATE_CODE_LOOKUP_ENDPOINT);
  const [companyOptions, setCompanyOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_SELECT_OPTION,
  ]);
  const [branchOptions, setBranchOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_SELECT_OPTION,
  ]);
  const [accountGroupOptions, setAccountGroupOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_SELECT_OPTION,
  ]);
  const [stateNameOptions, setStateNameOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_SELECT_OPTION,
  ]);
  const [stateCodeByName, setStateCodeByName] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(DEFAULT_PAGE);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalEntries, setTotalEntries] = useState(0);
  const [accountLedgerGridId, setAccountLedgerGridId] = useState<number | null>(null);
  const [accountLedgerGridName, setAccountLedgerGridName] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | number | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | number | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [formValues, setFormValues] = useState<LedgerFormValues>(
    createInitialLedgerFormValues,
  );
  const [modalError, setModalError] = useState<string | null>(null);
  const [openSearchField, setOpenSearchField] = useState<string | null>(null);
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [searchActiveOptionIndex, setSearchActiveOptionIndex] = useState<
    Record<string, number>
  >({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [pendingDeleteRow, setPendingDeleteRow] = useState<LedgerTableRow | null>(null);
  const selectedGridId = accountLedgerGridId ?? -1;
  const gridColumns = useAppSelector((state) => selectGridColumns(state, selectedGridId));
  const gridColumnsLoading = useAppSelector((state) =>
    selectGridColumnsLoading(state, selectedGridId),
  );
  const gridColumnsRequested = useAppSelector((state) =>
    selectGridColumnsRequested(state, selectedGridId),
  );
  const gridColumnsError = useAppSelector((state) =>
    selectGridColumnsError(state, selectedGridId),
  );

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const payload = await getGridDetails(GRID_DETAILS_QUERY);
        if (!mounted) {
          return;
        }
        const resolvedGrid = resolveAccountLedgerGridDetails(payload);
        setAccountLedgerGridId(resolvedGrid.gridId);
        setAccountLedgerGridName(resolvedGrid.gridName);
      } catch {
        if (mounted) {
          setAccountLedgerGridId(null);
          setAccountLedgerGridName(null);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [getGridDetails]);

  const effectiveTitle = useMemo(() => {
    const normalized = accountLedgerGridName?.trim();
    return normalized || "Account Ledger";
  }, [accountLedgerGridName]);

  useEffect(() => {
    if (
      accountLedgerGridId === null ||
      gridColumnsRequested ||
      gridColumnsLoading
    ) {
      return;
    }

    void dispatch(
      fetchGridColumns({
        gridId: accountLedgerGridId,
        page: GRID_COLUMNS_PAGE,
        limit: GRID_COLUMNS_LIMIT,
      }),
    );
  }, [accountLedgerGridId, dispatch, gridColumnsLoading, gridColumnsRequested]);

  useEffect(() => {
    if (openSearchField === null) {
      return;
    }
    const activeField = openSearchField;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-ledger-search-select-root="true"]')) {
        return;
      }
      setOpenSearchField(null);
      setSearchActiveOptionIndex((current) => {
        if (!(activeField in current)) {
          return current;
        }
        const nextState = { ...current };
        delete nextState[activeField];
        return nextState;
      });
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenSearchField(null);
        setSearchActiveOptionIndex((current) => {
          if (!(activeField in current)) {
            return current;
          }
          const nextState = { ...current };
          delete nextState[activeField];
          return nextState;
        });
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [openSearchField]);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const [
          companiesPayload,
          branchesPayload,
          accountGroupsPayload,
          stateCodesPayload,
        ] = await Promise.all([
          getCompanyLookup(LOOKUP_QUERY_COMPANIES),
          getBranchLookup(LOOKUP_QUERY_BRANCHES),
          getAccountGroupLookup(LOOKUP_QUERY_ACCOUNT_GROUPS),
          getStateCodeLookup(LOOKUP_QUERY_STATE_CODES),
        ]);
        if (!mounted) {
          return;
        }
        setCompanyOptions(buildLookupOptions(companiesPayload, true));
        setBranchOptions(buildLookupOptions(branchesPayload, true));
        setAccountGroupOptions(buildLookupOptions(accountGroupsPayload, true));
        setStateNameOptions(buildStateNameOptions(stateCodesPayload));
        setStateCodeByName(buildStateCodeByName(stateCodesPayload));
      } catch {
        if (!mounted) {
          return;
        }
        setCompanyOptions([DEFAULT_SELECT_OPTION]);
        setBranchOptions([DEFAULT_SELECT_OPTION]);
        setAccountGroupOptions([DEFAULT_SELECT_OPTION]);
        setStateNameOptions([DEFAULT_SELECT_OPTION]);
        setStateCodeByName({});
      }
    })();
    return () => {
      mounted = false;
    };
  }, [
    getAccountGroupLookup,
    getBranchLookup,
    getCompanyLookup,
    getStateCodeLookup,
  ]);
  useEffect(() => {
    const activeField = openSearchField;
    if (!activeField) {
      return;
    }
    const query = (searchQueries[activeField] ?? "").trim();
    const shouldSearchStates = STATE_NAME_SEARCH_FIELD_NAMES.has(activeField);
    if (!shouldSearchStates) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          if (shouldSearchStates) {
            const payload = await getStateCodeLookup({
              ...LOOKUP_QUERY_STATE_CODES,
              ...(query ? { search: query } : {}),
            });
            setStateNameOptions(buildStateNameOptions(payload));
            setStateCodeByName(buildStateCodeByName(payload));
          }
        } catch {
          // Keep existing options if lookup search fails.
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [getStateCodeLookup, openSearchField, searchQueries]);
  const ledgerFormFields = useMemo(
    () =>
      buildLedgerFormFields(
        companyOptions,
        branchOptions,
        accountGroupOptions,
        stateNameOptions,
      ),
    [
      accountGroupOptions,
      branchOptions,
      companyOptions,
      stateNameOptions,
    ],
  );
  const ledgerFormSections = useMemo(
    () => toLedgerFormSections(ledgerFormFields),
    [ledgerFormFields],
  );
  const mainSections = useMemo(
    () =>
      ledgerFormSections.filter(
        (section) => !LEDGER_ASIDE_SECTION_KEYS.has(section.key),
      ),
    [ledgerFormSections],
  );
  const asideSections = useMemo(
    () =>
      ledgerFormSections.filter((section) =>
        LEDGER_ASIDE_SECTION_KEYS.has(section.key),
      ),
    [ledgerFormSections],
  );
  const loadRecords = useCallback(
    async (term: string, page: number, limit: number) => {
      const normalizedTerm = term.trim();
      const query: Record<string, string> = {
        page: String(Math.max(1, page)),
        limit: String(Math.max(1, limit)),
      };
      if (normalizedTerm) {
        query.search = normalizedTerm;
      }
      const payload = await getAll(query);
      const paginationInfo = extractPaginationInfo(payload);
      const fallbackTotal = extractRows(payload, LOOKUP_KEYS.array).length;
      const resolvedTotal = paginationInfo.totalEntries ?? fallbackTotal;
      setTotalEntries(Math.max(0, resolvedTotal));
      if (paginationInfo.currentPage !== null) {
        const nextPage = paginationInfo.currentPage;
        setCurrentPage((existingPage) =>
          existingPage === nextPage ? existingPage : toSafePageNumber(nextPage),
        );
      }
      if (paginationInfo.pageSize !== null) {
        const nextPageSize = paginationInfo.pageSize;
        setPageSize((existingPageSize) =>
          existingPageSize === nextPageSize
            ? existingPageSize
            : toSafePageSize(nextPageSize),
        );
      }
    },
    [getAll],
  );
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadRecords(searchTerm, currentPage, pageSize);
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentPage, loadRecords, pageSize, searchTerm]);
  const serialOffset = Math.max(0, (currentPage - 1) * pageSize);
  const rows = useMemo(
    () => buildLedgerRows(data, serialOffset),
    [data, serialOffset],
  );
  useEffect(() => {
    if (selectedRowId === null) {
      return;
    }
    if (!rows.some((row) => row.__rowId === selectedRowId)) {
      setSelectedRowId(null);
    }
  }, [rows, selectedRowId]);
  const columns = useMemo<ReusableTableColumn<LedgerTableRow>[]>(
    () => buildColumnsFromGridColumns(gridColumns),
    [gridColumns],
  );
  const openCreateModal = useCallback(() => {
    resetSaveState();
    resetDetailsState();
    setModalError(null);
    setOpenSearchField(null);
    setSearchQueries({});
    setSearchActiveOptionIndex({});
    setExpandedSections(buildSectionExpandedState(ledgerFormSections));
    setModalMode("create");
    setEditingItemId(null);
    setFormValues(createInitialLedgerFormValues());
    setIsFormModalOpen(true);
  }, [ledgerFormSections, resetDetailsState, resetSaveState]);
  const openExistingModal = useCallback(
    async (row: LedgerTableRow, mode: Exclude<ModalMode, "create">) => {
      resetSaveState();
      resetDetailsState();
      setModalError(null);
      setOpenSearchField(null);
      setSearchQueries({});
      setSearchActiveOptionIndex({});
      setExpandedSections(buildSectionExpandedState(ledgerFormSections));
      setModalMode(mode);
      setFormValues(createInitialLedgerFormValues());
      setIsFormModalOpen(true);
      setSelectedRowId(row.__rowId);
      const recordId = resolveLedgerRecordId(row);
      setEditingItemId(mode === "update" ? recordId : null);
      try {
        const payload = await getById({
          query: {
            [REQUEST_PAYLOAD_KEYS.id]: String(recordId),
          },
        });
        const detailSource = extractDetailSource(payload) ?? row.__source;
        setFormValues(toLedgerFormValues(detailSource));
        if (mode === "update" && detailSource) {
          const detailId = getFirstDefinedValue(detailSource, LOOKUP_KEYS.id);
          if (typeof detailId === "string" || typeof detailId === "number") {
            setEditingItemId(detailId);
          }
        }
      } catch {
        setModalError("Unable to load selected account ledger details.");
      }
    },
    [getById, ledgerFormSections, resetDetailsState, resetSaveState],
  );
  const closeModal = useCallback(() => {
    if (saveLoading) {
      return;
    }
    setIsFormModalOpen(false);
    setModalError(null);
    setEditingItemId(null);
    setOpenSearchField(null);
    setSearchQueries({});
    setSearchActiveOptionIndex({});
    setExpandedSections({});
  }, [saveLoading]);
  const handleFieldChange = useCallback(
    (fieldName: LedgerFormFieldName, value: string) => {
      setFormValues((current) => ({
        ...current,
        [fieldName]: value,
      }));
    },
    [],
  );
  const handleSearchableOptionSelect = useCallback(
    (fieldName: LedgerFormFieldName, option: ERPDynamicSelectOption) => {
      if (fieldName === "ledStateName") {
        const nextStateName = option.value;
        const nextStateCode = nextStateName
          ? stateCodeByName[nextStateName] ?? ""
          : "";
        setFormValues((current) => ({
          ...current,
          ledStateName: nextStateName,
          ledStateCode: nextStateCode,
        }));
      } else {
        handleFieldChange(fieldName, option.value);
      }

      setSearchQueries((current) => ({
        ...current,
        [fieldName]: option.label,
      }));
      setOpenSearchField(null);
      setSearchActiveOptionIndex((current) => {
        if (!(fieldName in current)) {
          return current;
        }
        const nextState = { ...current };
        delete nextState[fieldName];
        return nextState;
      });
    },
    [handleFieldChange, stateCodeByName],
  );
  const handleSearchableFieldKeyDown = useCallback(
    (
      fieldName: LedgerFormFieldName,
      event: ReactKeyboardEvent<HTMLInputElement>,
      filteredOptions: ERPDynamicSelectOption[],
      fieldValue: string,
    ) => {
      const isSearchOpen = openSearchField === fieldName;
      const optionCount = filteredOptions.length;
      const currentIndex =
        searchActiveOptionIndex[fieldName] !== undefined
          ? searchActiveOptionIndex[fieldName]
          : -1;

      const clearActiveIndex = () => {
        setSearchActiveOptionIndex((current) => {
          if (!(fieldName in current)) {
            return current;
          }
          const nextState = { ...current };
          delete nextState[fieldName];
          return nextState;
        });
      };

      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Home" ||
        event.key === "End"
      ) {
        event.preventDefault();
        if (!isSearchOpen) {
          setOpenSearchField(fieldName);
        }
        if (optionCount === 0) {
          clearActiveIndex();
          return;
        }

        const selectedIndex = filteredOptions.findIndex(
          (option) => option.value === fieldValue,
        );
        const baseIndex =
          currentIndex >= 0 && currentIndex < optionCount
            ? currentIndex
            : selectedIndex;
        let nextIndex = baseIndex;
        if (event.key === "ArrowDown") {
          nextIndex = baseIndex + 1;
        } else if (event.key === "ArrowUp") {
          nextIndex = baseIndex - 1;
        } else if (event.key === "Home") {
          nextIndex = 0;
        } else if (event.key === "End") {
          nextIndex = optionCount - 1;
        }

        if (nextIndex < 0) {
          nextIndex = optionCount - 1;
        } else if (nextIndex >= optionCount) {
          nextIndex = 0;
        }

        setSearchActiveOptionIndex((current) => ({
          ...current,
          [fieldName]: nextIndex,
        }));
        return;
      }

      if (event.key === "Enter") {
        if (!isSearchOpen) {
          return;
        }
        event.preventDefault();
        if (optionCount === 0) {
          return;
        }
        const selectedIndex = filteredOptions.findIndex(
          (option) => option.value === fieldValue,
        );
        const resolvedIndex =
          currentIndex >= 0 && currentIndex < optionCount
            ? currentIndex
            : selectedIndex >= 0
              ? selectedIndex
              : 0;
        const nextOption = filteredOptions[resolvedIndex];
        if (nextOption) {
          handleSearchableOptionSelect(fieldName, nextOption);
        }
        return;
      }

      if (event.key === "Escape" && isSearchOpen) {
        event.preventDefault();
        setOpenSearchField(null);
        clearActiveIndex();
        return;
      }

      if (event.key === "Tab" && isSearchOpen) {
        clearActiveIndex();
      }
    },
    [
      handleSearchableOptionSelect,
      openSearchField,
      searchActiveOptionIndex,
    ],
  );
  const handleModalSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (modalMode === "view") {
        closeModal();
        return;
      }
      const validationError = validateLedgerForm(formValues);
      if (validationError) {
        setModalError(validationError);
        return;
      }
      const shouldUpdate = modalMode === "update";
      const payload = buildLedgerRequestPayload(
        formValues,
        shouldUpdate,
        editingItemId,
      );
      void (async () => {
        try {
          await upsertRecord({ body: payload });
          setIsFormModalOpen(false);
          setModalError(null);
          setEditingItemId(null);
          await loadRecords(searchTerm, currentPage, pageSize);
        } catch {
          setModalError("Unable to save account ledger.");
        }
      })();
    },
    [
      closeModal,
      currentPage,
      editingItemId,
      formValues,
      loadRecords,
      modalMode,
      pageSize,
      searchTerm,
      upsertRecord,
    ],
  );
  const handleDeleteRow = useCallback(
    (row: LedgerTableRow) => {
      if (deleteLoading || saveLoading || detailsLoading) {
        return;
      }
      setPendingDeleteRow(row);
    },
    [deleteLoading, detailsLoading, saveLoading],
  );
  const handleDeleteCancel = useCallback(() => {
    if (deleteLoading) {
      return;
    }
    setPendingDeleteRow(null);
  }, [deleteLoading]);
  const handleDeleteConfirm = useCallback(() => {
    if (!pendingDeleteRow || deleteLoading || saveLoading || detailsLoading) {
      return;
    }
    void (async () => {
      try {
        const row = pendingDeleteRow;
        const deleteId = resolveLedgerRecordId(row);
        await deleteRecord({
          query: {
            [REQUEST_PAYLOAD_KEYS.id]: String(deleteId),
          },
        });
        setPendingDeleteRow(null);
        setSelectedRowId((current) => (current === row.__rowId ? null : current));
        if (editingItemId === deleteId) {
          setEditingItemId(null);
          setIsFormModalOpen(false);
        }
        await loadRecords(searchTerm, currentPage, pageSize);
      } catch {
        // Error UI is driven by deleteError.
      }
    })();
  }, [
    currentPage,
    deleteLoading,
    deleteRecord,
    detailsLoading,
    editingItemId,
    loadRecords,
    pageSize,
    pendingDeleteRow,
    saveLoading,
    searchTerm,
  ]);
  const handleSearchChange = useCallback((query: string) => {
    setCurrentPage(DEFAULT_PAGE);
    setSearchTerm(query);
  }, []);
  const handlePageSizeChange = useCallback((nextPageSize: number) => {
    setCurrentPage(DEFAULT_PAGE);
    setPageSize(nextPageSize);
  }, []);
  const pendingDeleteLabel = useMemo(() => {
    if (!pendingDeleteRow) {
      return "";
    }
    return (
      pendingDeleteRow.ledgerName ||
      pendingDeleteRow.ledgerCode ||
      pendingDeleteRow.ledgerId
    );
  }, [pendingDeleteRow]);
  const isReadOnlyMode = modalMode === "view";
  const effectiveModalError = modalError ?? saveError ?? detailsError;
  const modalTitle =
    modalMode === "create"
      ? `New ${effectiveTitle}`
      : modalMode === "update"
        ? `Edit ${effectiveTitle}`
        : `${effectiveTitle} Details`;

  const modalStyle = {
    "--erp-modal-accent": "#2563eb",
    "--erp-modal-accent-soft-ring": "#2563eb33",
    "--erp-modal-border": "#cfdae6",
    "--erp-modal-surface": "#ffffff",
  } as CSSProperties;

  const modalPanelStyle = {
    width: "min(62vw,62rem)",
    maxHeight: "75vh",
  } as CSSProperties;

  const modalFormId = "account-ledger-master-form";
  const renderLedgerField = useCallback(
    (field: ERPDynamicModalField, forceSingleColumn = false) => {
      if (!isLedgerFieldName(field.name)) {
        return null;
      }
      const fieldName = field.name;
      const inputType = field.type ?? "text";
      const fieldValue = formValues[fieldName] ?? "";
      const disabled = isReadOnlyMode || detailsLoading || saveLoading;
      const wrapperClassName = dynamicFormStyles.field;
      const wrapperInlineStyle: CSSProperties = {
        gridTemplateColumns: "1fr",
        rowGap: "0.35rem",
        gridColumn:
          !forceSingleColumn && field.colSpan && field.colSpan > 1
            ? `span ${Math.min(3, field.colSpan)}`
            : undefined,
      };
      const labelInlineStyle: CSSProperties = {
        paddingTop: 0,
      };
      const controlInlineStyle: CSSProperties = {
        gridColumn: "1",
      };

      if (inputType === "checkbox") {
        const isChecked = fieldValue === "true";

        return (
          <div
            key={field.name}
            className={wrapperClassName}
            style={wrapperInlineStyle}
          >
            <label
              className={dynamicFormStyles.checkboxWrapper}
              htmlFor={field.name}
              style={{
                ...controlInlineStyle,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "flex-start",
                width: "100%",
              }}
            >
              <input
                id={field.name}
                className={dynamicFormStyles.checkboxControl}
                type="checkbox"
                autoComplete="off"
                checked={isChecked}
                disabled={disabled}
                style={{
                  marginRight: "4px",
                  width: "14px",
                  height: "14px",
                }}
                onChange={(event) =>
                  handleFieldChange(fieldName, event.target.checked ? "true" : "false")
                }
              />
              <span className={dynamicFormStyles.label} style={labelInlineStyle}>
                {field.label}
                {field.required ? (
                  <span className={dynamicFormStyles.requiredMark}>*</span>
                ) : null}
              </span>
            </label>
          </div>
        );
      }
      if (inputType === "select" && field.searchable) {
        const options = field.options ?? [];
        const selectedOption = options.find((option) => option.value === fieldValue);
        const isSearchOpen = openSearchField === fieldName;
        const typedQuery = searchQueries[fieldName] ?? "";
        const selectedLabel = fieldValue ? selectedOption?.label ?? "" : "";
        const inputValue = isSearchOpen ? typedQuery : selectedLabel;
        const normalizedQuery = typedQuery.trim().toLowerCase();
        const filteredOptions = options.filter((option) => {
          if (!normalizedQuery) {
            return true;
          }
          return (
            option.label.toLowerCase().includes(normalizedQuery) ||
            option.value.toLowerCase().includes(normalizedQuery)
          );
        });
        const highlightedOptionIndexRaw = searchActiveOptionIndex[fieldName];
        const highlightedOptionIndex =
          highlightedOptionIndexRaw !== undefined &&
          highlightedOptionIndexRaw >= 0 &&
          highlightedOptionIndexRaw < filteredOptions.length
            ? highlightedOptionIndexRaw
            : -1;
        const activeDescendantId =
          isSearchOpen && highlightedOptionIndex >= 0
            ? `${field.name}-search-option-${highlightedOptionIndex}`
            : undefined;
        return (
          <div
            key={field.name}
            className={wrapperClassName}
            style={wrapperInlineStyle}
          >
            <label
              className={dynamicFormStyles.label}
              htmlFor={field.name}
              style={labelInlineStyle}
            >
              {field.label}
              {field.required ? (
                <span className={dynamicFormStyles.requiredMark}>*</span>
              ) : null}
            </label>
            <div
              className={dynamicFormStyles.searchSelect}
              data-ledger-search-select-root="true"
              style={controlInlineStyle}
            >
              <input
                id={field.name}
                type="text"
                className={dynamicFormStyles.control}
                value={inputValue}
                required={field.required}
                disabled={disabled}
                placeholder={field.placeholder ?? `Search ${field.label}`}
                style={controlInlineStyle}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={isSearchOpen}
                aria-controls={`${field.name}-search-list`}
                aria-activedescendant={activeDescendantId}
                autoComplete="off"
                onFocus={() => {
                  setOpenSearchField(fieldName);
                  setSearchQueries((current) => ({
                    ...current,
                    [fieldName]: selectedOption?.label ?? "",
                  }));
                }}
                onBlur={() => {
                  window.setTimeout(() => {
                    setOpenSearchField((current) => {
                      if (current !== fieldName) {
                        return current;
                      }
                      setSearchActiveOptionIndex((state) => {
                        if (!(fieldName in state)) {
                          return state;
                        }
                        const nextState = { ...state };
                        delete nextState[fieldName];
                        return nextState;
                      });
                      return null;
                    });
                  }, 100);
                }}
                onKeyDown={(event) =>
                  handleSearchableFieldKeyDown(
                    fieldName,
                    event,
                    filteredOptions,
                    fieldValue,
                  )
                }
                onChange={(event) => {
                  setOpenSearchField(fieldName);
                  setSearchQueries((current) => ({
                    ...current,
                    [fieldName]: event.target.value,
                  }));
                  setSearchActiveOptionIndex((current) => {
                    if (!(fieldName in current)) {
                      return current;
                    }
                    const nextState = { ...current };
                    delete nextState[fieldName];
                    return nextState;
                  });
                }}
              />
              <button
                type="button"
                className={dynamicFormStyles.searchSelectToggle}
                aria-label={`Toggle ${field.label} options`}
                aria-expanded={isSearchOpen}
                aria-controls={`${field.name}-search-list`}
                disabled={disabled}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setOpenSearchField((current) => {
                    const nextField = current === fieldName ? null : fieldName;
                    if (nextField === null) {
                      setSearchActiveOptionIndex((state) => {
                        if (!(fieldName in state)) {
                          return state;
                        }
                        const nextState = { ...state };
                        delete nextState[fieldName];
                        return nextState;
                      });
                    }
                    return nextField;
                  });
                  setSearchQueries((current) => ({
                    ...current,
                    [fieldName]: isSearchOpen ? "" : typedQuery,
                  }));
                }}
              >
                <svg
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                  className={`${dynamicFormStyles.searchSelectChevron} ${
                    isSearchOpen ? dynamicFormStyles.searchSelectChevronOpen : ""
                  }`}
                >
                  <path
                    d="M5 7.5 10 12.5 15 7.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {isSearchOpen && !disabled && filteredOptions.length ? (
                <ul
                  id={`${field.name}-search-list`}
                  className={dynamicFormStyles.searchSelectList}
                  role="listbox"
                >
                  {filteredOptions.map((option, optionIndex) => (
                    <li
                      id={`${field.name}-search-option-${optionIndex}`}
                      key={`${fieldName}-${option.value}`}
                      className={`${dynamicFormStyles.searchSelectOption} ${
                        option.value === fieldValue ||
                        optionIndex === highlightedOptionIndex
                          ? dynamicFormStyles.searchSelectOptionActive
                          : ""
                      }`}
                      role="option"
                      aria-selected={option.value === fieldValue}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        handleSearchableOptionSelect(fieldName, option);
                      }}
                      onMouseEnter={() =>
                        setSearchActiveOptionIndex((current) => ({
                          ...current,
                          [fieldName]: optionIndex,
                        }))
                      }
                    >
                      {option.label}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        );
      }
      if (inputType === "textarea") {
        return (
          <div
            key={field.name}
            className={wrapperClassName}
            style={wrapperInlineStyle}
          >
            <label
              className={dynamicFormStyles.label}
              htmlFor={field.name}
              style={labelInlineStyle}
            >
              {field.label}
              {field.required ? (
                <span className={dynamicFormStyles.requiredMark}>*</span>
              ) : null}
            </label>
            <textarea
              id={field.name}
              className={`${dynamicFormStyles.control} ${dynamicFormStyles.textarea}`}
              style={controlInlineStyle}
              autoComplete="off"
              value={fieldValue}
              required={field.required}
              disabled={disabled}
              rows={4}
              onChange={(event) => handleFieldChange(fieldName, event.target.value)}
            />
          </div>
        );
      }
      if (inputType === "select") {
        const options = field.options ?? [];
        return (
          <div
            key={field.name}
            className={wrapperClassName}
            style={wrapperInlineStyle}
          >
            <label
              className={dynamicFormStyles.label}
              htmlFor={field.name}
              style={labelInlineStyle}
            >
              {field.label}
              {field.required ? (
                <span className={dynamicFormStyles.requiredMark}>*</span>
              ) : null}
            </label>
            <select
              id={field.name}
              className={dynamicFormStyles.control}
              style={controlInlineStyle}
              value={fieldValue}
              required={field.required}
              disabled={disabled}
              onChange={(event) => handleFieldChange(fieldName, event.target.value)}
            >
              <option value="">{field.placeholder ?? `Select ${field.label}`}</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        );
      }
      return (
        <div
          key={field.name}
          className={wrapperClassName}
          style={wrapperInlineStyle}
        >
          <label
            className={dynamicFormStyles.label}
            htmlFor={field.name}
            style={labelInlineStyle}
          >
            {field.label}
            {field.required ? (
              <span className={dynamicFormStyles.requiredMark}>*</span>
            ) : null}
          </label>
          <input
            id={field.name}
            className={dynamicFormStyles.control}
            style={controlInlineStyle}
            type={inputType}
            autoComplete="off"
            value={fieldValue}
            required={field.required}
            disabled={disabled}
            min={field.min}
            max={field.max}
            step={field.step}
            onChange={(event) => handleFieldChange(fieldName, event.target.value)}
          />
        </div>
      );
    },
    [
      detailsLoading,
      expandedSections,
      formValues,
      handleFieldChange,
      handleSearchableFieldKeyDown,
      handleSearchableOptionSelect,
      isReadOnlyMode,
      openSearchField,
      saveLoading,
      searchActiveOptionIndex,
      searchQueries,
    ],
  );
  return (
    <main className={styles.page}>
      <div className={styles.viewport}>
        <div className={styles.board}>
          <section className={styles.content}>
            {error ? (
              <div className={styles.errorBox}>
                <p className={styles.errorText}>
                  Unable to load account ledger data: {error}
                </p>
                <button
                  type="button"
                  className={styles.retryButton}
                  onClick={() =>
                    void loadRecords(searchTerm, currentPage, pageSize)
                  }
                >
                  Retry
                </button>
              </div>
            ) : null}
            {deleteError ? (
              <div className={styles.errorBox}>
                <p className={styles.errorText}>
                  Unable to delete selected account ledger: {deleteError}
                </p>
              </div>
            ) : null}
            {gridColumnsError ? (
              <div className={styles.errorBox}>
                <p className={styles.errorText}>
                  Unable to load table headers: {gridColumnsError}. Showing
                  default headers.
                </p>
                <button
                  type="button"
                  className={styles.retryButton}
                  onClick={() => {
                    if (accountLedgerGridId === null) {
                      return;
                    }

                    void dispatch(
                      fetchGridColumns({
                        gridId: accountLedgerGridId,
                        page: GRID_COLUMNS_PAGE,
                        limit: GRID_COLUMNS_LIMIT,
                      }),
                    );
                  }}
                  disabled={gridColumnsLoading || accountLedgerGridId === null}
                >
                  {gridColumnsLoading ? "Loading..." : "Retry Headers"}
                </button>
              </div>
            ) : null}
            <ReusableTable
              columns={columns}
              rows={rows}
              rowKey="__rowId"
              title={`${effectiveTitle} List`}
              minWidth="980px"
              activeRowKey={selectedRowId}
              onRowClick={(row) => setSelectedRowId(row.__rowId)}
              onCreate={openCreateModal}
              createLabel={`Add `}
              onView={(row) => {
                void openExistingModal(row, "view");
              }}
              onUpdate={(row) => {
                void openExistingModal(row, "update");
              }}
              onDelete={handleDeleteRow}
              isViewDisabled={() => saveLoading || detailsLoading}
              isUpdateDisabled={() => saveLoading || detailsLoading}
              isDeleteDisabled={() =>
                deleteLoading || saveLoading || detailsLoading
              }
              actionsAsIcons
              updateLabel="Update"
              deleteLabel={deleteLoading ? "Deleting..." : "Delete"}
              searchable
              searchQuery={searchTerm}
              onSearchQueryChange={handleSearchChange}
              searchPlaceholder="Search..."
              sortable
              paginated
              manualPagination
              totalEntries={totalEntries}
              currentPage={currentPage}
              onCurrentPageChange={setCurrentPage}
              pageSize={pageSize}
              onPageSizeChange={handlePageSizeChange}
              pageSizeOptions={[10, 20, 25, 50]}
              fullViewHeight={false}
              stickyHeader
              emptyText={
                loading
                  ? "Loading account ledger data..."
                  : "No account ledger data found"
              }
            />
          </section>
        </div>
      </div>
      {isFormModalOpen ? (
        <div className={dynamicFormStyles.overlay} style={modalStyle}>
          <div
            className={dynamicFormStyles.backdrop}
            onClick={saveLoading ? undefined : closeModal}
            aria-hidden
          />
          <div
            className={dynamicFormStyles.panel}
            role="dialog"
            aria-modal="true"
            style={modalPanelStyle}
          >
            <header className={dynamicFormStyles.header}>
              <div className={dynamicFormStyles.headerRow}>
                <h2 className={dynamicFormStyles.headerTitle}>{modalTitle}</h2>
                <button
                  type="button"
                  className={dynamicFormStyles.closeButton}
                  onClick={closeModal}
                  disabled={saveLoading}
                  aria-label="Close modal"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                    <path
                      d="M6 18 18 6M6 6l12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            </header>            <div className={dynamicFormStyles.scrollArea}>
              <form
                id={modalFormId}
                className={dynamicFormStyles.formGrid}
                onSubmit={handleModalSubmit}
                autoComplete="off"
                style={{
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  rowGap: "0.75rem",
                  columnGap: "2rem",
                }}
              >
                {mainSections.map((section) => {
                  const isExpanded =
                    expandedSections[section.key] ?? section.key !== "__heading_region";
                  const toggleId = `${modalFormId}-${section.key}-toggle`;
                  return (
                    <Fragment key={section.key}>
                      {section.key !== "general" ? (
                        <div
                          className={`${dynamicFormStyles.field} ${dynamicFormStyles.fieldWide} ${dynamicFormStyles.sectionHeadingField}`}
                          style={{ marginBottom: "0.5rem" }}
                        >
                          <label
                            className={dynamicFormStyles.sectionToggle}
                            htmlFor={toggleId}
                          >
                            <input
                              id={toggleId}
                              type="checkbox"
                              autoComplete="off"
                              className={dynamicFormStyles.sectionToggleInput}
                              checked={isExpanded}
                              disabled={saveLoading || detailsLoading}
                              onChange={() =>
                                setExpandedSections((current) => ({
                                  ...current,
                                  [section.key]: !(current[section.key] ?? true),
                                }))
                              }
                            />
                            <span className={dynamicFormStyles.sectionHeading}>
                              {section.title}
                            </span>
                          </label>
                          {section.helperText ? (
                            <p className={dynamicFormStyles.sectionHeadingDescription}>
                              {section.helperText}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {isExpanded
                        ? section.fields.map((field) => renderLedgerField(field))
                        : null}
                    </Fragment>
                  );
                })}
                {asideSections.map((section) => {
                  const isExpanded =
                    expandedSections[section.key] ?? section.key !== "__heading_region";
                  const toggleId = `${modalFormId}-${section.key}-toggle`;
                  return (
                    <Fragment key={section.key}>
                      {section.key !== "general" ? (
                        <div
                          className={`${dynamicFormStyles.field} ${dynamicFormStyles.fieldWide} ${dynamicFormStyles.sectionHeadingField}`}
                          style={{ marginBottom: "0.5rem" }}
                        >
                          <label
                            className={dynamicFormStyles.sectionToggle}
                            htmlFor={toggleId}
                          >
                            <input
                              id={toggleId}
                              type="checkbox"
                              autoComplete="off"
                              className={dynamicFormStyles.sectionToggleInput}
                              checked={isExpanded}
                              disabled={saveLoading || detailsLoading}
                              onChange={() =>
                                setExpandedSections((current) => ({
                                  ...current,
                                  [section.key]: !(current[section.key] ?? true),
                                }))
                              }
                            />
                            <span className={dynamicFormStyles.sectionHeading}>
                              {section.title}
                            </span>
                          </label>
                          {section.helperText ? (
                            <p className={dynamicFormStyles.sectionHeadingDescription}>
                              {section.helperText}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {isExpanded
                        ? section.fields.map((field) =>
                            renderLedgerField(field, true),
                          )
                        : null}
                    </Fragment>
                  );
                })}
              {effectiveModalError ? (
                <p className={dynamicFormStyles.submitError} role="alert">
                  {effectiveModalError}
                </p>
              ) : null}
            </form>
            </div>
            <footer className={dynamicFormStyles.footer}>
              <button
                type="button"
                className={dynamicFormStyles.cancelButton}
                onClick={closeModal}
                disabled={saveLoading}
              >
                {isReadOnlyMode ? "Close" : "Cancel"}
              </button>
              {!isReadOnlyMode ? (
                <button
                  type="submit"
                  form={modalFormId}
                  className={dynamicFormStyles.submitButton}
                  disabled={saveLoading || detailsLoading}
                >
                  {saveLoading
                    ? modalMode === "update"
                      ? "Updating..."
                      : "Saving..."
                    : modalMode === "update"
                      ? "Update"
                      : "Save"}
                </button>
              ) : null}
            </footer>
          </div>
        </div>
      ) : null}
      <DeleteConfirmModal
        isOpen={pendingDeleteRow !== null}
        itemName={pendingDeleteLabel}
        title={`Delete ${effectiveTitle}?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={deleteLoading}
        loadingLabel="Deleting..."
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </main>
  );
}
