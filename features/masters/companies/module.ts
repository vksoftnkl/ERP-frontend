"use client";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ERPDynamicFieldValueChangeHandler,
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import { useApi } from "@/hooks/useApi";
import styles from "@/app/master/state-master/page.module.scss";
import {
  buildLookupOptions,
  defineMasterModule,
  extractRows,
  getFirstDefinedValue,
  toDateInputValue,
  toDisplayValue,
  toNonNegativeNumber,
  toNullableDate,
  toNullableInteger,
  toNullableNumber,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
  toUpper,
  toUpperNullable,
} from "@/features/masters/shared";
import { GST_TYPE_OPTIONS } from "@/utils/constant";
import { validateGstin } from "@/utils/validation";
const API_ENDPOINTS = {
  list: "/company-masters/list",
  getById: "/company-masters/get",
  create: "/company-masters/create",
  delete: "/company-masters/delete",
} as const;
const GRID_TABLE_NAME = "companys";
const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const STATE_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const STATE_LOOKUP_QUERY = {
  module: "stateCodes",
  limit: "100",
} as const;
const BANK_LEDGER_LOOKUP_QUERY = {
  module: "accountLedgers",
  limit: "100",
} as const;
const LOOKUP_KEYS = {
  id: ["compId", "comp_id", "id", "_id"],
  code: ["compCode", "comp_code", "code"],
  name: ["compName", "comp_name", "name"],
  short: ["compShort", "comp_short", "short", "short_name", "shortName"],
  alias: ["compLegalName", "comp_legal_name", "alias", "legal_name"],
  active: ["compIsActive", "comp_is_active", "isActive", "is_active", "status"],
  position: ["compStylesheetId", "comp_stylesheet_id", "position", "sort"],
  description: ["compRemarks", "comp_remarks", "description", "remarks"],
  array: ["data", "items", "results", "rows", "list", "companies"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "compId",
  name: "compName",
  alias: "compLegalName",
  short: "compShort",
  description: "compRemarks",
  sort: "compStylesheetId",
} as const;
const DEFAULT_STATE_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select State",
};
const DEFAULT_BANK_LEDGER_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Bank Ledger",
};
const EWAY_SETTINGS_SECTION_NAME = "__heading_eway_settings";
const EINVOICE_SETTINGS_SECTION_NAME = "__heading_einvoice_settings";
const STATE_LOOKUP_ARRAY_KEYS = ["items", "data", "results", "rows", "list"] as const;
const STATE_LOOKUP_NAME_KEYS = ["stateName", "state_name", "name", "label"] as const;
const STATE_LOOKUP_CODE_KEYS = ["id", "value", "stateCode", "state_code", "code"] as const;
const GST_LOOKUP_ENDPOINT = "/api/gst/search";
const GST_LOOKUP_PATTERN = /^[0-9A-Z]{15}$/;
const GST_LOOKUP_HELPER_TEXT =
  "Type a 15-character GSTIN to load company details automatically.";
const GST_LOOKUP_SOURCE_KEYS = ["data", "taxpayer", "result"] as const;
const GST_LEGAL_NAME_KEYS = ["lgnm", "legalName", "legal_name"] as const;
const GST_TRADE_NAME_KEYS = ["tradeNam", "tradeName", "trade_name"] as const;
const GST_REGISTRATION_TYPE_KEYS = [
  "dty",
  "gstType",
  "gst_type",
  "registrationType",
  "registration_type",
] as const;
const GST_PRIMARY_ADDRESS_KEYS = [
  "pradr",
  "principalAddress",
  "primaryAddress",
  "primary_address",
] as const;
const GST_ADDRESS_KEYS = ["addr", "address"] as const;
const GST_ADDRESS_BUILDING_KEYS = ["bno", "flno", "bnm"] as const;
const GST_ADDRESS_LOCALITY_KEYS = ["st", "loc"] as const;
const GST_ADDRESS_DISTRICT_KEYS = ["dst", "district"] as const;
const GST_ADDRESS_CITY_KEYS = ["city", "loc"] as const;
const GST_ADDRESS_STATE_KEYS = ["stcd", "state", "stateName", "state_name"] as const;
const GST_ADDRESS_PIN_KEYS = ["pncd", "pin", "pincode"] as const;
const PRICE_FIXING_OPTIONS: ERPDynamicSelectOption[] = [
  {
    value: "Do not Update When Purchase",
    label: "Do not Update When Purchase",
  },
  {
    value: "Update Sales Price When Purchase",
    label: "Update Sales Price When Purchase",
  },
  {
    label:"Update Only Cost Price When Purchase",
    value:"Update Only Cost Price When Purchase",
  },
  {
    label:"Open Change Selling when Purchase",
    value:"Open Change Selling when Purchase",
  }
];
const APPLICABILITY_CHECKBOX_FIELD_STYLE: CSSProperties = {
  marginBlock: "0.5rem",
};
const COMPANY_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(92vw, 70rem)",
  height: "86vh",
  maxHeight: "86vh",
};
const COMPANY_STANDARD_FIELD_NAMES = [
  "compName",
  "compCode",
  "compShort",
  "compLegalName",
  "compGstinNo",
  "compGstRegType",
  "compPanNo",
  "compFssaiNo",
  "compDrugLicenseNo",
  "compAddr1",
  "compAddr2",
  "compAddr3",
  "compCity",
  "compDistrict",
  "compState",
  "compStateCode",
  "compPin",
  "compCountry",
  "compRegionAddr1",
  "compRegionAddr2",
  "compRegionAddr3",
  "compRegionCity",
  "compRegionDistrict",
  "compRegionState",
  "compRegionCountry",
  "compTel",
  "compPhone",
  "compMail",
  "compSupportEmail",
  "compSupportPhone",
  "compWebsiteName",
  "compEwayInterLimit",
  "compEwayIntraLimit",
  "compStylesheetId",
  "compBankId",
  "compPriceFixing",
  "compPrefixCode",
  "compBillGreeting",
  "compCurrencyCode",
  "compCurrencySymbol",
  "compLocaleCode",
  "compRemarks",
  "compNegStkApl",
  "compDefault",
  "compIsActive",
] as const;
const COMPANY_DATE_FIELD_NAMES = [
  "compFinYearFrom",
  "compFinYearTo",
  "compBooksBeginFrom",
  "compEwayDate",
  "compEinvoiceDate",
] as const;
const COMPANY_BOOLEAN_FIELD_NAMES = [
  "compGstApplicable",
  "compTcsApplicable",
  "compSmsApplicable",
  "compEinvoiceApplicable",
  "compEwayApplicable",
  "compEwayIntraApl",
  "compEinvoiceInclEway",
  "compNegStkApl",
  "compDefault",
  "compIsActive",
] as const;
const COMPANY_INITIAL_FORM_VALUES = {
  compName: "",
  compCode: "",
  compShort: "",
  compLegalName: "",
  compGstinNo: "",
  compGstRegType: "",
  compPanNo: "",
  compFssaiNo: "",
  compDrugLicenseNo: "",
  compAddr1: "",
  compAddr2: "",
  compAddr3: "",
  compCity: "",
  compDistrict: "",
  compState: "",
  compStateCode: "",
  compPin: "",
  compCountry: "India",
  compRegionAddr1: "",
  compRegionAddr2: "",
  compRegionAddr3: "",
  compRegionCity: "",
  compRegionDistrict: "",
  compRegionState: "",
  compRegionCountry: "India",
  compTel: "",
  compPhone: "",
  compMail: "",
  compSupportEmail: "",
  compSupportPhone: "",
  compWebsiteName: "",
  compFinYearFrom: "",
  compFinYearTo: "",
  compBooksBeginFrom: "",
  compGstApplicable: "true",
  compTcsApplicable: "false",
  compSmsApplicable: "false",
  compEinvoiceApplicable: "false",
  compEwayApplicable: "false",
  compEwayDate: "",
  compEwayInterLimit: "",
  compEwayIntraApl: "false",
  compEwayIntraLimit: "0",
  compEinvoiceDate: "",
  compEinvoiceInclEway: "false",
  compStylesheetId: "",
  compBankId: "",
  compPriceFixing: "",
  compPrefixCode: "",
  compBillGreeting: "",
  compNegStkApl: "true",
  compDefault: "false",
  compIsActive: "true",
  compCurrencyCode: "INR",
  compCurrencySymbol: "",
  compLocaleCode: "en-IN",
  compRemarks: "",
} as const;
function removeEmptyOptions(
  options: ERPDynamicSelectOption[],
): ERPDynamicSelectOption[] {
  return options.filter((option) => option.value.trim().length > 0);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function getObjectValue(
  source: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> | null {
  const candidate = getFirstDefinedValue(source, keys);
  return isRecord(candidate) ? candidate : null;
}
function joinDisplayValues(parts: unknown[]): string {
  return parts
    .map((part) => toDisplayValue(part))
    .filter(Boolean)
    .join(", ");
}
function toCompanyGstRegType(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return "REGULAR";
  }
  if (normalized.includes("COMPOSITION")) {
    return "COMPOSITION";
  }
  return "REGULAR";
}
function extractGstLookupSource(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) {
    return null;
  }
  return getObjectValue(payload, GST_LOOKUP_SOURCE_KEYS) ?? payload;
}
function extractGstAddress(source: Record<string, unknown>): Record<string, unknown> {
  const primaryAddress = getObjectValue(source, GST_PRIMARY_ADDRESS_KEYS);
  if (!primaryAddress) {
    return {};
  }
  return getObjectValue(primaryAddress, GST_ADDRESS_KEYS) ?? primaryAddress;
}
function setFieldValueIfPresent(
  target: Record<string, string>,
  fieldName: string,
  value: string,
): void {
  const normalized = value.trim();
  if (!normalized) {
    return;
  }
  target[fieldName] = normalized;
}
function buildCompanyLookupValues(
  gstin: string,
  payload: Record<string, unknown>,
  stateNameByCode: Record<string, string>,
): Record<string, string> {
  const address = extractGstAddress(payload);
  const legalName = toDisplayValue(getFirstDefinedValue(payload, GST_LEGAL_NAME_KEYS));
  const tradeName = toDisplayValue(getFirstDefinedValue(payload, GST_TRADE_NAME_KEYS));
  const city = toDisplayValue(getFirstDefinedValue(address, GST_ADDRESS_CITY_KEYS));
  const district =
    toDisplayValue(getFirstDefinedValue(address, GST_ADDRESS_DISTRICT_KEYS)) || city;
  const stateCode = gstin.slice(0, 2);
  const stateName =
    stateNameByCode[stateCode] ||
    toDisplayValue(getFirstDefinedValue(address, GST_ADDRESS_STATE_KEYS));
  const values: Record<string, string> = {
    compGstinNo: gstin,
    compPanNo: gstin.slice(2, 12),
    compGstApplicable: "true",
    compCountry: "India",
  };
  setFieldValueIfPresent(values, "compName", tradeName || legalName);
  setFieldValueIfPresent(values, "compLegalName", legalName);
  setFieldValueIfPresent(
    values,
    "compGstRegType",
    toCompanyGstRegType(
      toDisplayValue(getFirstDefinedValue(payload, GST_REGISTRATION_TYPE_KEYS)),
    ),
  );
  setFieldValueIfPresent(
    values,
    "compAddr1",
    joinDisplayValues(
      GST_ADDRESS_BUILDING_KEYS.map((key) => getFirstDefinedValue(address, [key])),
    ),
  );
  setFieldValueIfPresent(
    values,
    "compAddr2",
    joinDisplayValues(
      GST_ADDRESS_LOCALITY_KEYS.map((key) => getFirstDefinedValue(address, [key])),
    ),
  );
  setFieldValueIfPresent(
    values,
    "compAddr3",
    joinDisplayValues([
      getFirstDefinedValue(address, GST_ADDRESS_DISTRICT_KEYS),
      getFirstDefinedValue(address, GST_ADDRESS_CITY_KEYS),
    ]),
  );
  setFieldValueIfPresent(values, "compCity", city);
  setFieldValueIfPresent(values, "compDistrict", district);
  setFieldValueIfPresent(values, "compState", stateName);
  setFieldValueIfPresent(values, "compStateCode", stateCode);
  setFieldValueIfPresent(
    values,
    "compPin",
    toDisplayValue(getFirstDefinedValue(address, GST_ADDRESS_PIN_KEYS)),
  );
  return values;
}
function getLookupErrorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) {
    return fallback;
  }
  return (
    toDisplayValue(getFirstDefinedValue(payload, ["message", "error", "detail"])) ||
    fallback
  );
}
function buildStateNameOptions(payload: unknown): ERPDynamicSelectOption[] {
  const rows = extractRows(payload, STATE_LOOKUP_ARRAY_KEYS);
  const seenNames = new Set<string>();
  const options: ERPDynamicSelectOption[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const stateName = toDisplayValue(
      getFirstDefinedValue(source, STATE_LOOKUP_NAME_KEYS),
    );
    if (!stateName || seenNames.has(stateName)) {
      continue;
    }
    seenNames.add(stateName);
    options.push({
      value: stateName,
      label: stateName,
    });
  }
  options.sort((left, right) => left.label.localeCompare(right.label));
  return [DEFAULT_STATE_OPTION, ...removeEmptyOptions(options)];
}
function buildStateCodeByName(payload: unknown): Record<string, string> {
  const codeByName = new Map<string, string>();
  const rows = extractRows(payload, STATE_LOOKUP_ARRAY_KEYS);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const stateName = toDisplayValue(
      getFirstDefinedValue(source, STATE_LOOKUP_NAME_KEYS),
    );
    const stateCode = toDisplayValue(
      getFirstDefinedValue(source, STATE_LOOKUP_CODE_KEYS),
    ).toUpperCase();
    if (!stateName || !stateCode || codeByName.has(stateName)) {
      continue;
    }
    codeByName.set(stateName, stateCode);
  }
  return Object.fromEntries(codeByName.entries());
}
function buildStateNameByCode(payload: unknown): Record<string, string> {
  const nameByCode = new Map<string, string>();
  const rows = extractRows(payload, STATE_LOOKUP_ARRAY_KEYS);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const stateName = toDisplayValue(
      getFirstDefinedValue(source, STATE_LOOKUP_NAME_KEYS),
    );
    const stateCode = toDisplayValue(
      getFirstDefinedValue(source, STATE_LOOKUP_CODE_KEYS),
    ).toUpperCase();
    if (!stateName || !stateCode || nameByCode.has(stateCode)) {
      continue;
    }
    nameByCode.set(stateCode, stateName);
  }
  return Object.fromEntries(nameByCode.entries());
}
function buildCompanyFormFields({
  bankOptions,
  stateOptions,
  onCompanyGstinValueChange,
}: {
  bankOptions: ERPDynamicSelectOption[];
  stateOptions: ERPDynamicSelectOption[];
  onCompanyGstinValueChange: ERPDynamicFieldValueChangeHandler;
}): ERPDynamicModalField[] {
  return [
    {
      name: "__heading_identity",
      label: "Identity & Registration",
      type: "heading",
    },
    {
      name: "compGstinNo",
      label: "GSTIN",
      placeholder: "24ABCDE1234F1Z5",
      helperText: GST_LOOKUP_HELPER_TEXT,
      onValueChange: onCompanyGstinValueChange,
      validation: {
        custom: (value) => validateGstin(value),
      },
    },
    {
      name: "compGstRegType",
      label: "GST Reg Type",
      type: "select",
      searchable: true,
      options: GST_TYPE_OPTIONS,
      validation: {
        maxLength: 30,
        maxLengthMessage: "GST Reg Type must be at most 30 characters.",
      },
    },
    {
      name: "compLegalName",
      label: "Legal Name",
    },
    {
      name: "compFssaiNo",
      label: "FSSAI No",
      validation: {
        maxLength: 20,
        maxLengthMessage: "FSSAI No must be at most 20 characters.",
      },
    },
    {
      name: "compName",
      label: "Company Name",
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Company Name must be at least 2 characters.",
      },
    },
    {
      name: "compPrefixCode",
      label: "Prefix Code",
      validation: {
        maxLength: 20,
        maxLengthMessage: "Prefix Code must be at most 20 characters.",
      },
    },
    {
      name: "compDrugLicenseNo",
      label: "Drug License No",
      validation: {
        maxLength: 20,
        maxLengthMessage: "Drug License No must be at most 20 characters.",
      },
    },
    {
      name: "compShort",
      label: "Short Name",
    },
    {
      name: "compPanNo",
      label: "PAN No",
      placeholder: "ABCDE1234F",
      validation: {
        minLength: 10,
        maxLength: 10,
        minLengthMessage: "PAN No must be exactly 10 characters.",
        maxLengthMessage: "PAN No must be exactly 10 characters.",
        pattern: "^[A-Za-z]{5}[0-9]{4}[A-Za-z]$",
        patternMessage: "PAN No must match the standard PAN format.",
      },
    },
    {
      name: "__heading_mailing_address",
      label: "Mailing Address",
      type: "heading",
    },
    {
      name: "compAddr1",
      label: "Address Line 1",
    },
    {
      name: "compCity",
      label: "City",
      required: true,
      validation: {
        maxLength: 100,
        maxLengthMessage: "City must be at most 100 characters.",
      },
    },
    {
      name: "compState",
      label: "State",
      type: "select",
      searchable: true,
      required: true,
      options: stateOptions,
      validation: {
        requiredMessage: "State is required.",
      },
    },
    {
      name: "compAddr2",
      label: "Address Line 2",
    },
    {
      name: "compDistrict",
      label: "District",
      required: true,
      validation: {
        maxLength: 100,
        maxLengthMessage: "District must be at most 100 characters.",
      },
    },
    {
      name: "compPin",
      label: "Pincode",
      type: "number",
      required: true,
      min: 0,
      step: 1,
      inputMode: "numeric",
      validation: {
        minMessage: "Pincode must be 0 or greater.",
      },
    },
    {
      name: "compAddr3",
      label: "Address Line 3",
    },
    
    {
      name: "__heading_contact",
      label: "Contact",
      type: "heading",
    },
    {
      name: "compTel",
      label: "Telephone",
      type: "tel",
    },
    {
      name: "compPhone",
      label: "Phone",
      type: "tel",
    },
    {
      name: "compMail",
      label: "Email",
      type: "email",
    },
    {
      name: "compSupportEmail",
      label: "Support Email",
      type: "email",
    },
    {
      name: "compSupportPhone",
      label: "Support Phone",
      type: "tel",
    },
    {
      name: "compWebsiteName",
      label: "Website",
      type: "url",
    },
    {
      name: "__heading_fiscal",
      label: "Fiscal Year & Books",
      type: "heading",
    },
    {
      name: "compFinYearFrom",
      label: "Financial Year From",
      type: "date",
    },
    {
      name: "compFinYearTo",
      label: "Financial Year To",
      type: "date",
    },
    {
      name: "compBooksBeginFrom",
      label: "Books Begin From",
      type: "date",
    },   
    {
      name: EWAY_SETTINGS_SECTION_NAME,
      label: "E-Way Settings",
      type: "heading",
      defaultExpanded: false,
      defaultExpandedWhen: (values) =>
        (values.compEwayApplicable ?? "false") === "true",
    },
    {
      name: "compEwayDate",
      label: "E-Way Effective Date",
      type: "date",
    },
    {
      name: "compEwayInterLimit",
      label: "E-Way Inter Limit",
      type: "number",
      min: 0,
      step: "0.01",
      validation: {
        minMessage: "E-Way Inter Limit must be 0 or greater.",
      },
    },
    {
      name: "compEwayIntraApl",
      label: "Intra-State E-Way Applicable",
      type: "checkbox",
    },
    {
      name: "compEwayIntraLimit",
      label: "E-Way Intra Limit",
      type: "number",
      min: 0,
      step: "0.01",
      validation: {
        minMessage: "E-Way Intra Limit must be 0 or greater.",
      },
    },
    {
      name: EINVOICE_SETTINGS_SECTION_NAME,
      label: "E-Invoice Settings",
      type: "heading",
      defaultExpanded: false,
      defaultExpandedWhen: (values) =>
        (values.compEinvoiceApplicable ?? "false") === "true",
    },
    {
      name: "compEinvoiceDate",
      label: "E-Invoice Effective Date",
      type: "date",
    },
    {
      name: "compEinvoiceInclEway",
      label: "Include E-Way With E-Invoice",
      type: "checkbox",
    },
    {
      name: "__heading_system",
      label: "System Settings",
      type: "heading",
      defaultExpanded: false,
    },
    {
      name: "compStylesheetId",
      label: "Stylesheet Id",
      type:"color",
      required: true,
      validation: {
        requiredMessage: "Stylesheet Id is required.",
      },
    },
    {
      name: "compBankId",
      label: "Bank Id",
      type: "select",
      options: bankOptions,
    },
    {
      name: "compPriceFixing",
      label: "Price Fixing",
      type: "select",
      options: PRICE_FIXING_OPTIONS,
      validation: {
        maxLength: 50,
        maxLengthMessage: "Price Fixing must be at most 50 characters.",
      },
    },
    {
      name: "compBillGreeting",
      label: "Bill Greeting",
      rows: 3,
      colSpan: 2,
    },   
    {
      name: "__heading_region_address",
      label: "Region Address",
      type: "heading",
      defaultExpanded: false,
    },
    {
      name: "compRegionAddr1",
      label: "Region Address Line 1",
    },
    {
      name: "compRegionAddr3",
      label: "Region Address Line 3",
    },
    {
      name: "compRegionDistrict",
      label: "Region District",
      validation: {
        maxLength: 100,
        maxLengthMessage: "Region District must be at most 100 characters.",
      },
    },
    {
      name: "compRegionAddr2",
      label: "Region Address Line 2",
    },
    {
      name: "compRegionCity",
      label: "Region City",
      validation: {
        maxLength: 100,
        maxLengthMessage: "Region City must be at most 100 characters.",
      },
    },
    {
      name: "__heading_applicability",
      label: "Applicability Flags",
      type: "heading",
    },
    {
      name: "compGstApplicable",
      label: "GST Applicable",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "compTcsApplicable",
      label: "TCS Applicable",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
     {
      name: "compNegStkApl",
      label: "Allow Negative Stock",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "compDefault",
      label: "Default Company",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "compIsActive",
      label: "Active",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "compSmsApplicable",
      label: "SMS Applicable",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
  ];
}
function toSnakeCaseKey(value: string): string {
  return value.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}
function getCompanyFieldValue(
  source: Record<string, unknown>,
  fieldName: string,
): unknown {
  return getFirstDefinedValue(source, [fieldName, toSnakeCaseKey(fieldName)]);
}
function mapCompanyFormValues(
  source: Record<string, unknown> | null,
  defaults: Record<string, string>,
  stateNameByCode: Record<string, string>,
): Record<string, string> {
  const rowSource = source ?? {};
  const mergedDefaults: Record<string, string> = {
    ...COMPANY_INITIAL_FORM_VALUES,
    ...defaults,
  };
  const values: Record<string, string> = { ...mergedDefaults };
  for (const fieldName of COMPANY_STANDARD_FIELD_NAMES) {
    const resolvedValue = toDisplayValue(getCompanyFieldValue(rowSource, fieldName));
    values[fieldName] = resolvedValue || mergedDefaults[fieldName] || "";
  }
  for (const fieldName of COMPANY_DATE_FIELD_NAMES) {
    const resolvedValue = toDateInputValue(getCompanyFieldValue(rowSource, fieldName));
    values[fieldName] = resolvedValue || mergedDefaults[fieldName] || "";
  }
  for (const fieldName of COMPANY_BOOLEAN_FIELD_NAMES) {
    const fallback = mergedDefaults[fieldName] === "false" ? "false" : "true";
    values[fieldName] = toSelectBoolean(
      getCompanyFieldValue(rowSource, fieldName),
      fallback,
    );
  }
  const existingStateCode = toDisplayValue(
    getCompanyFieldValue(rowSource, "compStateCode"),
  ).toUpperCase();
  if (!values.compState && existingStateCode) {
    values.compState = stateNameByCode[existingStateCode] ?? mergedDefaults.compState;
  }
  values.compStateCode = existingStateCode || mergedDefaults.compStateCode || "";
  return values;
}
export function useCompaniesModule() {
  const { getAll: getBankLedgerLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getStateLookup } = useApi<unknown>(STATE_LOOKUP_ENDPOINT);
  const [bankOptions, setBankOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_BANK_LEDGER_OPTION,
  ]);
  const [stateOptions, setStateOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_STATE_OPTION,
  ]);
  const [stateCodeByName, setStateCodeByName] = useState<Record<string, string>>({});
  const [stateNameByCode, setStateNameByCode] = useState<Record<string, string>>({});
  const gstLookupCacheRef = useRef<Record<string, Record<string, string>>>({});
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [stateLookupResult, bankLedgerLookupResult] = await Promise.allSettled([
        getStateLookup(STATE_LOOKUP_QUERY),
        getBankLedgerLookup(BANK_LEDGER_LOOKUP_QUERY),
      ]);
      if (!mounted) {
        return;
      }
      if (stateLookupResult.status === "fulfilled") {
        const payload = stateLookupResult.value;
        setStateOptions(buildStateNameOptions(payload));
        setStateCodeByName(buildStateCodeByName(payload));
        setStateNameByCode(buildStateNameByCode(payload));
      } else {
        setStateOptions([DEFAULT_STATE_OPTION]);
        setStateCodeByName({});
        setStateNameByCode({});
      }
      if (bankLedgerLookupResult.status === "fulfilled") {
        setBankOptions(
          buildLookupOptions(bankLedgerLookupResult.value, DEFAULT_BANK_LEDGER_OPTION),
        );
      } else {
        setBankOptions([DEFAULT_BANK_LEDGER_OPTION]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getBankLedgerLookup, getStateLookup]);
  const handleCompanyGstinValueChange =
    useCallback<ERPDynamicFieldValueChangeHandler>(
      async ({ value }) => {
        const normalizedGstin = value.trim().toUpperCase();
        const normalizedValuePatch =
          normalizedGstin && normalizedGstin !== value
            ? { compGstinNo: normalizedGstin }
            : undefined;

        if (!GST_LOOKUP_PATTERN.test(normalizedGstin)) {
          return {
            ...(normalizedValuePatch ? { values: normalizedValuePatch } : {}),
            errors: { compGstinNo: null },
          };
        }
        const cachedValues = gstLookupCacheRef.current[normalizedGstin];
        if (cachedValues) {
          return {
            values: cachedValues,
            errors: { compGstinNo: null },
          };
        }
        try {
          const response = await fetch(
            `${GST_LOOKUP_ENDPOINT}?gstin=${encodeURIComponent(normalizedGstin)}`,
            {
              method: "GET",
              cache: "no-store",
              headers: {
                Accept: "application/json",
              },
            },
          );
          const payload = (await response.json().catch(() => null)) as unknown;
          if (!response.ok) {
            return {
              ...(normalizedValuePatch ? { values: normalizedValuePatch } : {}),
              errors: {
                compGstinNo: getLookupErrorMessage(
                  payload,
                  "Unable to load GST details for this GSTIN.",
                ),
              },
            };
          }
          const lookupSource = extractGstLookupSource(payload);
          if (!lookupSource) {
            return {
              ...(normalizedValuePatch ? { values: normalizedValuePatch } : {}),
              errors: {
                compGstinNo: "GST details were not available for this GSTIN.",
              },
            };
          }
          const resolvedValues = buildCompanyLookupValues(
            normalizedGstin,
            lookupSource,
            stateNameByCode,
          );
          gstLookupCacheRef.current[normalizedGstin] = resolvedValues;
          return {
            values: resolvedValues,
            errors: { compGstinNo: null },
          };
        } catch {
          return {
            ...(normalizedValuePatch ? { values: normalizedValuePatch } : {}),
            errors: {
              compGstinNo:
                "Unable to load GST details right now. Please try again.",
            },
          };
        }
      },
      [stateNameByCode],
    );
  const companyFormFields = useMemo(
    () =>
      buildCompanyFormFields({
        bankOptions,
        stateOptions,
        onCompanyGstinValueChange: handleCompanyGstinValueChange,
      }),
    [bankOptions, handleCompanyGstinValueChange, stateOptions],
  );
  return useMemo(
    () =>
      defineMasterModule({
        title: "Company",
        auditHistory: { screenName: "Company Master" },
        entityLabel: "company",
        entityLabelPlural: "companies",
        apiEndpoints: API_ENDPOINTS,
        gridTableName: GRID_TABLE_NAME,
        useResponseTableColumns: true,
        lookupKeys: LOOKUP_KEYS,
        requestPayloadKeys: REQUEST_PAYLOAD_KEYS,
        styles,
        listTitle: "Company List",
        createLabel: "Add Company",
        codeColumnHeader: "Company Code",
        nameColumnHeader: "Company Name",
        nameFieldLabel: "Company Name",
        nameFieldPlaceholder: "ABC Traders Pvt Ltd",
        formTitle: "Company Form",
        formDescription:
          "Create and update companies with statutory, contact, fiscal, and system settings.",
        customFields: companyFormFields,
        createInitialValues: COMPANY_INITIAL_FORM_VALUES,
        modalPanelStyle: COMPANY_MODAL_PANEL_STYLE,
        modalFormGridColumns: 3,
        modalFormDenseGrid: false,
        modalStackLabels: true,
        modalSectionNavigationMode: "tabs",
        modalHideFieldHelperText: true,
        modalHideFieldErrorText: true,
        modalFocusFirstInvalidFieldOnValidationError: true,
        modalEnableArrowKeyFieldNavigation: true,
        mapFormValues: ({ source, defaults }) =>
          mapCompanyFormValues(source, defaults, stateNameByCode),
        buildRequestPayload: ({
          values,
          shouldUpdate,
          editingItemId,
          sectionExpandedState,
        }) => {
          const isEwayApplicable =
            sectionExpandedState[EWAY_SETTINGS_SECTION_NAME] ??
            ((values.compEwayApplicable ?? "false") === "true");
          const isEinvoiceApplicable =
            sectionExpandedState[EINVOICE_SETTINGS_SECTION_NAME] ??
            ((values.compEinvoiceApplicable ?? "false") === "true");
          const isEwayIntraApplicable =
            isEwayApplicable && (values.compEwayIntraApl ?? "false") === "true";
          const normalizedState = (values.compState ?? "").trim();
          const derivedStateCode =
            stateCodeByName[normalizedState] ??
            (values.compStateCode ?? "").trim().toUpperCase();
          const payload: Record<string, unknown> = {
            compName: (values.compName ?? "").trim(),
            compCode: toNullableString(values.compCode ?? ""),
            compShort: toNullableString(values.compShort ?? ""),
            compLegalName: toNullableString(values.compLegalName ?? ""),
            compGstinNo: toUpperNullable(values.compGstinNo ?? ""),
            compGstRegType: toNullableString(values.compGstRegType ?? ""),
            compPanNo: toUpperNullable(values.compPanNo ?? ""),
            compFssaiNo: toNullableString(values.compFssaiNo ?? ""),
            compDrugLicenseNo: toNullableString(values.compDrugLicenseNo ?? ""),
            compAddr1: toNullableString(values.compAddr1 ?? ""),
            compAddr2: toNullableString(values.compAddr2 ?? ""),
            compAddr3: toNullableString(values.compAddr3 ?? ""),
            compCity: toNullableString(values.compCity ?? ""),
            compDistrict: toNullableString(values.compDistrict ?? ""),
            compState: toNullableString(values.compState ?? ""),
            compStateCode: toUpper(derivedStateCode),
            compPin: toNullableInteger(values.compPin ?? ""),
            compCountry:"India",
            compRegionAddr1: toNullableString(values.compRegionAddr1 ?? ""),
            compRegionAddr2: toNullableString(values.compRegionAddr2 ?? ""),
            compRegionAddr3: toNullableString(values.compRegionAddr3 ?? ""),
            compRegionCity: toNullableString(values.compRegionCity ?? ""),
            compRegionDistrict: toNullableString(values.compRegionDistrict ?? ""),
            compRegionState:toNullableString(values.compState ?? ""),
            compRegionCountry:"India",
            compTel: toNullableString(values.compTel ?? ""),
            compPhone: toNullableString(values.compPhone ?? ""),
            compMail: toNullableString(values.compMail ?? ""),
            compSupportEmail: toNullableString(values.compSupportEmail ?? ""),
            compSupportPhone: toNullableString(values.compSupportPhone ?? ""),
            compWebsiteName: toNullableString(values.compWebsiteName ?? ""),
            compFinYearFrom: toNullableDate(values.compFinYearFrom ?? ""),
            compFinYearTo: toNullableDate(values.compFinYearTo ?? ""),
            compBooksBeginFrom: toNullableDate(values.compBooksBeginFrom ?? ""),
            compGstApplicable: (values.compGstApplicable ?? "false") === "true",
            compTcsApplicable: (values.compTcsApplicable ?? "false") === "true",
            compSmsApplicable: (values.compSmsApplicable ?? "false") === "true",
            compEinvoiceApplicable: isEinvoiceApplicable,
            compEwayApplicable: isEwayApplicable,
            compEwayDate: isEwayApplicable
              ? toNullableDate(values.compEwayDate ?? "")
              : null,
            compEwayInterLimit: isEwayApplicable
              ? toNullableNumber(values.compEwayInterLimit ?? "")
              : null,
            compEwayIntraApl: isEwayIntraApplicable,
            compEwayIntraLimit: isEwayIntraApplicable
              ? toNonNegativeNumber(values.compEwayIntraLimit ?? "0", 0)
              : 0,
            compEinvoiceDate: isEinvoiceApplicable
              ? toNullableDate(values.compEinvoiceDate ?? "")
              : null,
            compEinvoiceInclEway: isEinvoiceApplicable
              ? (values.compEinvoiceInclEway ?? "false") === "true"
              : false,
            compStylesheetId: toNullableString(values.compStylesheetId ?? ""),
            compBankId: toNullableString(values.compBankId ?? ""),
            compPriceFixing: toNullableString(values.compPriceFixing ?? ""),
            compPrefixCode: toNullableString(values.compPrefixCode ?? ""),
            compBillGreeting: toNullableString(values.compBillGreeting ?? ""),
            compNegStkApl: (values.compNegStkApl ?? "false") === "true",
            compDefault: (values.compDefault ?? "false") === "true",
            compIsActive: (values.compIsActive ?? "false") === "true",
            compCurrencyCode:  "INR",
            compCurrencySymbol: toNullableString(values.compCurrencySymbol ?? ""),
            compLocaleCode:"en-IN",
            compRemarks: toNullableString(values.compRemarks ?? ""),
          };
          if (shouldUpdate && editingItemId !== null) {
            payload.compId = toUpdateId(editingItemId);
          }
          return payload;
        },
      }),
    [companyFormFields, stateCodeByName, stateNameByCode],
  );
}
