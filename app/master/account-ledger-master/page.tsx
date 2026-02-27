"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import ReusableTable, { type ReusableTableColumn } from "@/components/ui/table";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import styles from "./page.module.scss";

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
const CITY_LOOKUP_ENDPOINT = "/cities/list";
const STATE_CODE_LOOKUP_ENDPOINT = "/state-code-masters/list";

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

const LOOKUP_QUERY_CITIES = {
  page: "1",
  limit: "20",
} as const;

const LOOKUP_QUERY_STATE_CODES = {
  page: "1",
  limit: "20",
} as const;

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
const CITY_LOOKUP_NAME_KEYS = [
  "ctmName",
  "ctm_name",
  "city_name",
  "cityName",
  "name",
  "label",
] as const;
const STATE_CODE_LOOKUP_CODE_KEYS = [
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
  label: "None",
};
const BOOLEAN_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Yes", value: "true" },
  { label: "No", value: "false" },
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
  cityOptions: ERPDynamicSelectOption[],
  stateNameOptions: ERPDynamicSelectOption[],
  stateCodeOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "__heading_core",
      label: "Primary Details",
      type: "heading",
      helperText: "Main identifiers and required account references.",
    },
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
      name: "__heading_behavior",
      label: "Classification & Behavior",
      type: "heading",
      helperText: "Category and accounting behavior flags.",
    },
    {
      name: "ledCategory",
      label: "Category",
      placeholder: "GENERAL",
    },
    {
      name: "ledIsBillByBill",
      label: "Bill By Bill",
      type: "checkbox",
    },
    {
      name: "ledIsCostCenterReq",
      label: "Cost Center Required",
      type: "checkbox",
    },
    {
      name: "ledIsInterestApplicable",
      label: "Interest Applicable",
      type: "checkbox",
    },
    {
      name: "ledInterestRate",
      label: "Interest Rate",
      type: "number",
      step: "0.01",
      min: 0,
    },
    {
      name: "__heading_contact",
      label: "Contact & Mailing Address",
      type: "heading",
    },
    {
      name: "ledContactPerson",
      label: "Contact Person",
    },
    {
      name: "ledEmail",
      label: "Email",
      type: "email",
    },
    {
      name: "ledTel",
      label: "Tel",
      type: "tel",
    },
    {
      name: "ledPhone1",
      label: "Phone 1",
      type: "tel",
    },
    {
      name: "ledPhone2",
      label: "Phone 2",
      type: "tel",
    },
    {
      name: "ledWhatsappNo",
      label: "Whatsapp No",
      type: "tel",
    },
    {
      name: "ledAddr1",
      label: "Address 1",
    },
    {
      name: "ledAddr2",
      label: "Address 2",
    },
    {
      name: "ledAddr3",
      label: "Address 3",
    },
    {
      name: "ledCity",
      label: "City",
      type: "select",
      searchable: true,
      options: cityOptions,
      placeholder: "Search city",
    },
    {
      name: "ledDistrict",
      label: "District",
    },
    {
      name: "ledStateName",
      label: "State Name",
      type: "select",
      searchable: true,
      options: stateNameOptions,
      placeholder: "Search state",
    },
    {
      name: "ledStateCode",
      label: "State Code",
      type: "select",
      searchable: true,
      options: stateCodeOptions,
      placeholder: "Search state code",
    },
    {
      name: "ledPin",
      label: "PIN",
    },
    {
      name: "ledCountry",
      label: "Country",
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
      name: "ledRegionAddr1",
      label: "Region Address 1",
    },
    {
      name: "ledRegionAddr2",
      label: "Region Address 2",
    },
    {
      name: "ledRegionAddr3",
      label: "Region Address 3",
    },
    {
      name: "ledRegionCity",
      label: "Region City",
    },
    {
      name: "ledRegionDistrict",
      label: "Region District",
    },
    {
      name: "ledRegionStateName",
      label: "Region State Name",
    },
    {
      name: "ledRegionCountry",
      label: "Region Country",
    },
    {
      name: "__heading_statutory",
      label: "GST & Statutory",
      type: "heading",
    },
    {
      name: "ledGstPartyRegType",
      label: "GST Party Reg Type",
      type: "select",
      options: GST_PARTY_REG_TYPE_OPTIONS,
    },
    {
      name: "ledGstinNo",
      label: "GSTIN",
    },
    {
      name: "ledPanNo",
      label: "PAN",
    },
    {
      name: "ledAadharNo",
      label: "Aadhar No",
    },
    {
      name: "ledEcommerceGstin",
      label: "Ecommerce GSTIN",
    },
    {
      name: "ledIsSez",
      label: "Is SEZ",
      type: "checkbox",
      options: BOOLEAN_OPTIONS,
    },
    {
      name: "__heading_bank",
      label: "Bank & Payment",
      type: "heading",
    },
    {
      name: "ledChequeName",
      label: "Cheque Name",
    },
    {
      name: "ledBankName",
      label: "Bank Name",
    },
    {
      name: "ledBankBranch",
      label: "Bank Branch",
    },
    {
      name: "ledBankAcNo",
      label: "Bank A/C No",
    },
    {
      name: "ledBankIfsc",
      label: "Bank IFSC",
    },
    {
      name: "ledUpiId",
      label: "UPI ID",
    },
    {
      name: "__heading_opening",
      label: "Opening & Running Balance",
      type: "heading",
    },
    {
      name: "ledObAmount",
      label: "Opening Amount",
      type: "number",
      step: "0.01",
      min: 0,
    },
    {
      name: "ledObType",
      label: "Opening Type",
      type: "select",
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
      options: STATUS_OPTIONS,
    },
    {
      name: "ledAllowSms",
      label: "Allow SMS",
      type: "checkbox",
      options: BOOLEAN_OPTIONS,
    },
    {
      name: "masterDescription",
      label: "Remarks",
      colSpan: 2,
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
  defaultValue: "true" | "false",
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
  return defaultValue;
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
  includeEmptyOption = false,
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
function buildCityOptions(payload: unknown): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, LOOKUP_ARRAY_KEYS);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const cityName = toDisplayValue(
      getFirstDefinedValue(source, CITY_LOOKUP_NAME_KEYS),
    );
    if (!cityName) {
      continue;
    }
    if (!optionMap.has(cityName)) {
      optionMap.set(cityName, cityName);
    }
  }
  const options = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));

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
function buildStateCodeOptions(payload: unknown): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, LOOKUP_ARRAY_KEYS);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const stateCode = toDisplayValue(
      getFirstDefinedValue(source, STATE_CODE_LOOKUP_CODE_KEYS),
    ).toUpperCase();
    const stateName = toDisplayValue(
      getFirstDefinedValue(source, STATE_CODE_LOOKUP_NAME_KEYS),
    );
    if (!stateCode) {
      continue;
    }
    const label = stateName ? `${stateCode} - ${stateName}` : stateCode;
    if (!optionMap.has(stateCode)) {
      optionMap.set(stateCode, label);
    }
  }
  const options = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));

  return [DEFAULT_SELECT_OPTION, ...options];
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
};
type PaginationInfo = {
  totalEntries: number | null;
  currentPage: number | null;
  pageSize: number | null;
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
  const { data, error, loading, getAll } = useApi<unknown>(API_ENDPOINTS.list);
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
  const { getAll: getCityLookup } = useApi<unknown>(CITY_LOOKUP_ENDPOINT);
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
  const [cityOptions, setCityOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_SELECT_OPTION,
  ]);
  const [stateNameOptions, setStateNameOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_SELECT_OPTION,
  ]);
  const [stateCodeOptions, setStateCodeOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_SELECT_OPTION,
  ]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(DEFAULT_PAGE);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalEntries, setTotalEntries] = useState(0);
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
  const [pendingDeleteRow, setPendingDeleteRow] = useState<LedgerTableRow | null>(null);

  useEffect(() => {
    if (openSearchField === null) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-ledger-search-select-root="true"]')) {
        return;
      }
      setOpenSearchField(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenSearchField(null);
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
          citiesPayload,
          stateCodesPayload,
        ] = await Promise.all([
          getCompanyLookup(LOOKUP_QUERY_COMPANIES),
          getBranchLookup(LOOKUP_QUERY_BRANCHES),
          getAccountGroupLookup(LOOKUP_QUERY_ACCOUNT_GROUPS),
          getCityLookup(LOOKUP_QUERY_CITIES),
          getStateCodeLookup(LOOKUP_QUERY_STATE_CODES),
        ]);
        if (!mounted) {
          return;
        }
        setCompanyOptions(buildLookupOptions(companiesPayload, true));
        setBranchOptions(buildLookupOptions(branchesPayload, true));
        setAccountGroupOptions(buildLookupOptions(accountGroupsPayload, true));
        setCityOptions(buildCityOptions(citiesPayload));
        setStateNameOptions(buildStateNameOptions(stateCodesPayload));
        setStateCodeOptions(buildStateCodeOptions(stateCodesPayload));
      } catch {
        if (!mounted) {
          return;
        }
        setCompanyOptions([DEFAULT_SELECT_OPTION]);
        setBranchOptions([DEFAULT_SELECT_OPTION]);
        setAccountGroupOptions([DEFAULT_SELECT_OPTION]);
        setCityOptions([DEFAULT_SELECT_OPTION]);
        setStateNameOptions([DEFAULT_SELECT_OPTION]);
        setStateCodeOptions([DEFAULT_SELECT_OPTION]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [
    getAccountGroupLookup,
    getBranchLookup,
    getCityLookup,
    getCompanyLookup,
    getStateCodeLookup,
  ]);
  const ledgerFormFields = useMemo(
    () =>
      buildLedgerFormFields(
        companyOptions,
        branchOptions,
        accountGroupOptions,
        cityOptions,
        stateNameOptions,
        stateCodeOptions,
      ),
    [
      accountGroupOptions,
      branchOptions,
      cityOptions,
      companyOptions,
      stateCodeOptions,
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
    () => [
      {
        key: "serialNo",
        header: "S.No",
        accessor: "serialNo",
        width: "56px",
        sortable: false,
      },
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
    ],
    [],
  );
  const openCreateModal = useCallback(() => {
    resetSaveState();
    resetDetailsState();
    setModalError(null);
    setOpenSearchField(null);
    setSearchQueries({});
    setModalMode("create");
    setEditingItemId(null);
    setFormValues(createInitialLedgerFormValues());
    setIsFormModalOpen(true);
  }, [resetDetailsState, resetSaveState]);
  const openExistingModal = useCallback(
    async (row: LedgerTableRow, mode: Exclude<ModalMode, "create">) => {
      resetSaveState();
      resetDetailsState();
      setModalError(null);
      setOpenSearchField(null);
      setSearchQueries({});
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
    [getById, resetDetailsState, resetSaveState],
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
      ? "New Account Ledger"
      : modalMode === "update"
        ? "Edit Account Ledger"
        : "Account Ledger Details";

  const modalSubtitle =
    modalMode === "create"
      ? "Create a new ledger entry."
      : modalMode === "update"
        ? "Update selected ledger details."
        : "Read-only view of selected ledger.";

  const renderLedgerField = useCallback(
    (field: ERPDynamicModalField, forceSingleColumn = false) => {
      if (!isLedgerFieldName(field.name)) {
        return null;
      }

      const fieldName = field.name;
      const inputType = field.type ?? "text";
      const fieldValue = formValues[fieldName] ?? "";
      const disabled = isReadOnlyMode || detailsLoading || saveLoading;
      const wrapperStyle =
        !forceSingleColumn && field.colSpan === 2
          ? { gridColumn: "1 / -1" }
          : undefined;

      if (inputType === "checkbox") {
        const checkboxOptions = field.options ?? BOOLEAN_OPTIONS;
        const activeLabel =
          checkboxOptions.find((option) => option.value === "true")?.label ?? "Yes";
        const inactiveLabel =
          checkboxOptions.find((option) => option.value === "false")?.label ?? "No";
        const isChecked = fieldValue === "true";

        return (
          <div key={field.name} className={styles.field} style={wrapperStyle}>
            <label className={styles.fieldLabel} htmlFor={field.name}>
              {field.label}
              {field.required ? <span className={styles.requiredMark}> *</span> : null}
            </label>
            <label className={styles.checkboxControlWrapper} htmlFor={field.name}>
              <input
                id={field.name}
                className={styles.checkboxControl}
                type="checkbox"
                checked={isChecked}
                disabled={disabled}
                onChange={(event) =>
                  handleFieldChange(fieldName, event.target.checked ? "true" : "false")
                }
              />
              <span className={styles.checkboxValueLabel}>
                {isChecked ? activeLabel : inactiveLabel}
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
        const inputValue = isSearchOpen ? typedQuery : selectedOption?.label ?? "";
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

        return (
          <div key={field.name} className={styles.field} style={wrapperStyle}>
            <label className={styles.fieldLabel} htmlFor={field.name}>
              {field.label}
              {field.required ? <span className={styles.requiredMark}> *</span> : null}
            </label>
            <div className={styles.searchableSelect} data-ledger-search-select-root="true">
              <input
                id={field.name}
                type="text"
                className={styles.textInput}
                value={inputValue}
                required={field.required}
                disabled={disabled}
                placeholder={field.placeholder ?? `Search ${field.label}`}
                onFocus={() => {
                  setOpenSearchField(fieldName);
                  setSearchQueries((current) => ({
                    ...current,
                    [fieldName]: selectedOption?.label ?? "",
                  }));
                }}
                onChange={(event) => {
                  setOpenSearchField(fieldName);
                  setSearchQueries((current) => ({
                    ...current,
                    [fieldName]: event.target.value,
                  }));
                }}
              />
              {isSearchOpen && !disabled ? (
                <ul className={styles.searchableSelectList} role="listbox">
                  {filteredOptions.length ? (
                    filteredOptions.map((option) => (
                      <li
                        key={`${fieldName}-${option.value}`}
                        className={`${styles.searchableSelectOption} ${
                          option.value === fieldValue
                            ? styles.searchableSelectOptionActive
                            : ""
                        }`}
                        role="option"
                        aria-selected={option.value === fieldValue}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          handleFieldChange(fieldName, option.value);
                          setSearchQueries((current) => ({
                            ...current,
                            [fieldName]: option.label,
                          }));
                          setOpenSearchField(null);
                        }}
                      >
                        {option.label}
                      </li>
                    ))
                  ) : (
                    <li className={styles.searchableSelectEmpty} aria-disabled>
                      No matching options
                    </li>
                  )}
                </ul>
              ) : null}
            </div>
          </div>
        );
      }

      if (inputType === "textarea") {
        return (
          <div key={field.name} className={styles.field} style={wrapperStyle}>
            <label className={styles.fieldLabel} htmlFor={field.name}>
              {field.label}
              {field.required ? <span className={styles.requiredMark}> *</span> : null}
            </label>
            <textarea
              id={field.name}
              className={styles.textareaInput}
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
          <div key={field.name} className={styles.field} style={wrapperStyle}>
            <label className={styles.fieldLabel} htmlFor={field.name}>
              {field.label}
              {field.required ? <span className={styles.requiredMark}> *</span> : null}
            </label>
            <select
              id={field.name}
              className={styles.textInput}
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
        <div key={field.name} className={styles.field} style={wrapperStyle}>
          <label className={styles.fieldLabel} htmlFor={field.name}>
            {field.label}
            {field.required ? <span className={styles.requiredMark}> *</span> : null}
          </label>
          <input
            id={field.name}
            className={styles.textInput}
            type={inputType}
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
      formValues,
      handleFieldChange,
      isReadOnlyMode,
      openSearchField,
      saveLoading,
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

            <section className={styles.tableSection}>
              <ReusableTable
                columns={columns}
                rows={rows}
                rowKey="__rowId"
                title="Account Ledger List"
                minWidth="980px"
                wrapperClassName={styles.tableWrapper}
                tableClassName={styles.listTable}
                activeRowKey={selectedRowId}
                onRowClick={(row) => setSelectedRowId(row.__rowId)}
                onCreate={openCreateModal}
                createLabel="Add"
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
          </section>
        </div>
      </div>

      {isFormModalOpen ? (
        <div className={styles.modalBackdrop}>
          <div className={styles.createModal} role="dialog" aria-modal="true">
            <header className={styles.modalHeader}>
              <div className={styles.modalTitleBlock}>
                <h2 className={styles.modalTitle}>{modalTitle}</h2>
                <p className={styles.modalSubtitle}>{modalSubtitle}</p>
              </div>
              <div className={styles.windowActionGroup}>
                <button
                  type="button"
                  className={styles.windowAction}
                  onClick={closeModal}
                  disabled={saveLoading}
                  aria-label="Close modal"
                >
                  ×
                </button>
              </div>
            </header>

            <form className={styles.modalBody} onSubmit={handleModalSubmit}>
              <div className={styles.formLayout}>
                <div className={styles.formMain}>
                  {mainSections.map((section) => (
                    <section key={section.key} className={styles.formSection}>
                      <h3 className={styles.sectionTitle}>{section.title}</h3>
                      {section.helperText ? (
                        <p className={styles.modalSubtitle}>{section.helperText}</p>
                      ) : null}
                      <div className={styles.fieldRow}>
                        {section.fields.map((field) => renderLedgerField(field))}
                      </div>
                    </section>
                  ))}
                </div>

                <aside className={styles.formAside}>
                  {asideSections.map((section) => (
                    <section key={section.key} className={styles.formSection}>
                      <h3 className={styles.sectionTitle}>{section.title}</h3>
                      {section.helperText ? (
                        <p className={styles.modalSubtitle}>{section.helperText}</p>
                      ) : null}
                      <div className={styles.fieldRow}>
                        {section.fields.map((field) => renderLedgerField(field, true))}
                      </div>
                    </section>
                  ))}
                </aside>
              </div>

              {effectiveModalError ? (
                <p className={styles.modalError}>{effectiveModalError}</p>
              ) : null}

              <div className={styles.footerActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={closeModal}
                  disabled={saveLoading}
                >
                  <span className={`${styles.buttonIcon} ${styles.cancelIcon}`}>×</span>
                  {isReadOnlyMode ? "Close" : "Cancel"}
                </button>
                {!isReadOnlyMode ? (
                  <button
                    type="submit"
                    className={styles.saveButton}
                    disabled={saveLoading || detailsLoading}
                  >
                    <span className={`${styles.buttonIcon} ${styles.saveIcon}`}>✓</span>
                    {saveLoading
                      ? modalMode === "update"
                        ? "Updating..."
                        : "Saving..."
                      : modalMode === "update"
                        ? "Update"
                        : "Save"}
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <DeleteConfirmModal
        isOpen={pendingDeleteRow !== null}
        itemName={pendingDeleteLabel}
        title="Delete Account Ledger?"
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
