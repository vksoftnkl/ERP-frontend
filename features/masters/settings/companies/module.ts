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
} from "@/components/design-system/ui/dynamic-modal-form";
import { useApi } from "@/hooks/useApi";
import {
  useLazyConfiguredDropdown,
  type LazyDropdownHandlers,
} from "@/features/masters/shared/use-lazy-configured-dropdown";
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
   list: "/configured-grid-sql/run?grid_id=12",
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
// The State select is a lazy, server-side searchable configured dropdown
// (fixed.dropdown_details 9 -> state_code/state_name). The field value is the state NAME
// (compState), so options map state_name -> state_name. The full code<->name maps below
// still load eagerly because GSTIN auto-fill and submit code-derivation need every state.
const STATE_DROPDOWN_CONFIG = {
  dropdownId: "9",
  idKeys: ["state_name", "stateName"] as const,
  labelKeys: ["state_name", "stateName"] as const,
  defaultOption: DEFAULT_STATE_OPTION,
} as const;
const DEFAULT_BANK_LEDGER_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Bank Ledger",
};
const STATE_LOOKUP_ARRAY_KEYS = [
  "items",
  "data",
  "results",
  "rows",
  "list",
  "stateCodes",
  "state_codes",
  "states",
] as const;
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
  "compTanNo",
  "compCinNo",
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
  "compRegionName",
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
  "compAuthorizeSignature",
  "compNegStkApl",
  "compDefault",
  "compIsActive",
] as const;
const COMPANY_DATE_FIELD_NAMES = [
  "compFinYearFrom",
  "compFinYearTo",
  "compBooksBeginFrom",
  "compBooksLockDate",
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
  compTanNo: "",
  compCinNo: "",
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
  compRegionName: "",
  compTel: "",
  compPhone: "",
  compMail: "",
  compSupportEmail: "",
  compSupportPhone: "",
  compWebsiteName: "",
  compFinYearFrom: "",
  compFinYearTo: "",
  compBooksBeginFrom: "",
  compBooksLockDate: "",
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
  compAuthorizeSignature: "",
} as const;
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
  stateHandlers,
  onCompanyGstinValueChange,
}: {
  bankOptions: ERPDynamicSelectOption[];
  stateOptions: ERPDynamicSelectOption[];
  stateHandlers: LazyDropdownHandlers;
  onCompanyGstinValueChange: ERPDynamicFieldValueChangeHandler;
}): ERPDynamicModalField[] {
  return [
    {
      name: "__heading_identity",
      label: "Identity",
      type: "heading",
    },
    {
      name: "compGstinNo",
      label: "GSTIN No",
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
      name: "compName",
      label: "Company Name",
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Company Name must be at least 2 characters.",
      },
    },
    {
      name: "compShort",
      label: "Short Code",
    },
    {
      name: "compLegalName",
      label: "Legal Name",
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
      name: "__subheading_address",
      label: "Address",
      type: "subheading",
    },
    {
      name: "compAddr1",
      label: "Address Line 1",
    },
    {
      name: "compAddr2",
      label: "Address Line 2",
    },
    {
      name: "compAddr3",
      label: "Address Line 3",
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
      name: "compDistrict",
      label: "District",
      required: true,
      validation: {
        maxLength: 100,
        maxLengthMessage: "District must be at most 100 characters.",
      },
    },
    {
      name: "compState",
      label: "State",
      type: "select",
      searchable: true,
      serverSearch: true,
      required: true,
      options: stateOptions,
      onSearchOpenChange: stateHandlers.onSearchOpenChange,
      onSearchQueryChange: stateHandlers.onSearchQueryChange,
      onValueChange: stateHandlers.onValueChange,
      validation: {
        requiredMessage: "State is required.",
      },
    },
    {
      name: "compPin",
      label: "Pin Code",
      type: "number",
      required: true,
      min: 0,
      step: 1,
      inputMode: "numeric",
      validation: {
        minMessage: "Pin Code must be 0 or greater.",
      },
    },
    {
      name: "compCountry",
      label: "Country",
      disabled: true,
    },
    {
      name: "__subheading_contact",
      label: "Contact",
      type: "subheading",
    },
    {
      name: "compPhone",
      label: "Mobile / Phone",
      type: "tel",
    },
    {
      name: "compTel",
      label: "Telephone",
      type: "tel",
    },
    {
      name: "compMail",
      label: "Mail ID",
      type: "email",
    },
    {
      name: "compWebsiteName",
      label: "Website",
      type: "url",
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
      name: "__heading_tax",
      label: "Tax and Compliance",
      type: "heading",
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
      name: "compTanNo",
      label: "TAN No",
    },
    {
      name: "compCinNo",
      label: "CIN No",
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
      name: "compDrugLicenseNo",
      label: "Drug License No",
      validation: {
        maxLength: 20,
        maxLengthMessage: "Drug License No must be at most 20 characters.",
      },
    },
    {
      name: "compGstApplicable",
      label: "GST Applicable",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "compTcsApplicable",
      label: "TCS/TDS Applicable",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "compSmsApplicable",
      label: "Send SMS",
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
      name: "__subheading_einvoicing",
      label: "e-Invoicing",
      type: "subheading",
    },
    {
      name: "compEinvoiceApplicable",
      label: "e-Invoicing Applicable",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "compEinvoiceDate",
      label: "e-Invoice From",
      type: "date",
    },
    {
      name: "compEinvoiceInclEway",
      label: "Send e-Way details with e-Invoice",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "__subheading_eway",
      label: "e-Way Bill",
      type: "subheading",
    },
    {
      name: "compEwayApplicable",
      label: "e-Way Bill Applicable",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "compEwayDate",
      label: "e-Way From",
      type: "date",
    },
    {
      name: "compEwayInterLimit",
      label: "Other State Limit",
      type: "number",
      min: 0,
      step: "0.01",
      validation: {
        minMessage: "Other State Limit must be 0 or greater.",
      },
    },
    {
      name: "compEwayIntraApl",
      label: "Applicable for Own State",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "compEwayIntraLimit",
      label: "Own State Limit",
      type: "number",
      min: 0,
      step: "0.01",
      validation: {
        minMessage: "Own State Limit must be 0 or greater.",
      },
    },
    {
      name: "__heading_preferences",
      label: "Preferences",
      type: "heading",
    },
    {
      name: "compStylesheetId",
      label: "Stylesheet",
      type: "color",
      required: true,
      validation: {
        requiredMessage: "Stylesheet is required.",
      },
    },
    {
      name: "compBankId",
      label: "Bank",
      type: "select",
      options: bankOptions,
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
      name: "compCurrencyCode",
      label: "Currency Code",
    },
    {
      name: "compCurrencySymbol",
      label: "Currency Symbol",
    },
    {
      name: "compBillGreeting",
      label: "Bill Greeting",
      type: "textarea",
      rows: 3,
      colSpan: 2,
    },
    {
      name: "compRemarks",
      label: "Remarks",
      type: "textarea",
      rows: 3,
      colSpan: 2,
    },
    {
      name: "compAuthorizeSignature",
      label: "Authorized Signature",
      type: "textarea",
      rows: 2,
      colSpan: 2,
    },
    {
      name: "__subheading_financial",
      label: "Financial Year & Books",
      type: "subheading",
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
      name: "compBooksLockDate",
      label: "Books Lock Date",
      type: "date",
    },
    {
      name: "__heading_regional",
      label: "Regional Details",
      type: "heading",
    },
    {
      name: "compRegionName",
      label: "Regional Name",
    },
    {
      name: "compRegionAddr1",
      label: "Regional Addr 1",
    },
    {
      name: "compRegionAddr2",
      label: "Regional Addr 2",
    },
    {
      name: "compRegionAddr3",
      label: "Regional Addr 3",
    },
    {
      name: "compRegionCity",
      label: "Regional City",
      validation: {
        maxLength: 100,
        maxLengthMessage: "Regional City must be at most 100 characters.",
      },
    },
    {
      name: "compRegionDistrict",
      label: "Regional District",
      validation: {
        maxLength: 100,
        maxLengthMessage: "Regional District must be at most 100 characters.",
      },
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
  // The State select itself is a lazy server-side dropdown (configured dropdown 9).
  const state = useLazyConfiguredDropdown(STATE_DROPDOWN_CONFIG);
  const [bankOptions, setBankOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_BANK_LEDGER_OPTION,
  ]);
  // Full code<->name maps are still loaded eagerly: GSTIN auto-fill derives the state
  // name from the GSTIN's leading code, and submit derives the code from the picked name.
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
        setStateCodeByName(buildStateCodeByName(payload));
        setStateNameByCode(buildStateNameByCode(payload));
      } else {
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
          // Pin the auto-filled state so the lazy dropdown can display it.
          if (cachedValues.compState) {
            state.seedSelected(cachedValues.compState, cachedValues.compState);
          }
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
          // Pin the auto-filled state so the lazy dropdown can display it.
          if (resolvedValues.compState) {
            state.seedSelected(resolvedValues.compState, resolvedValues.compState);
          }
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
      [stateNameByCode, state.seedSelected],
    );
  const companyFormFields = useMemo(
    () =>
      buildCompanyFormFields({
        bankOptions,
        stateOptions: state.options,
        stateHandlers: state.handlers,
        onCompanyGstinValueChange: handleCompanyGstinValueChange,
      }),
    [bankOptions, handleCompanyGstinValueChange, state.options, state.handlers],
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
        gridDetailId: 12,
        listResponseStyleArrayKey: "",
        lookupKeys: LOOKUP_KEYS,
        requestPayloadKeys: REQUEST_PAYLOAD_KEYS,
        styles,
        listTitle: "Company List",
        listTitleOverride: "Company List",
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
         createModalTitle:"Company Entry",
      editModalTitle:"Edit Company Entry",
        modalFormGridColumns: 2,
        modalFormDenseGrid: false,
        modalStackLabels: false,
        modalSectionNavigationMode: "tabs",
        modalHideFieldHelperText: true,
        modalHideFieldErrorText: true,
        modalFocusFirstInvalidFieldOnValidationError: true,
        modalEnableArrowKeyFieldNavigation: true,
        onModalOpenChange: (open, variantKey) => {
          // Clear the lazy State dropdown when the create modal opens so no stale
          // selection from a previously edited company lingers (it reloads on open).
          if (open && variantKey === "master-create") {
            state.seedSelected("", "");
          }
        },
        mapFormValues: ({ source, defaults }) => {
          const rowSource = source ?? {};
          // Seed the lazy State dropdown so the trigger shows the state name on
          // edit/view. The field value is the name; fall back to deriving it from the
          // saved code via the eager code->name map.
          const stateName =
            toDisplayValue(getCompanyFieldValue(rowSource, "compState")) ||
            stateNameByCode[
              toDisplayValue(getCompanyFieldValue(rowSource, "compStateCode")).toUpperCase()
            ] ||
            "";
          state.seedSelected(stateName, stateName);
          return mapCompanyFormValues(source, defaults, stateNameByCode);
        },
        buildRequestPayload: ({ values, shouldUpdate, editingItemId }) => {
          const isEwayApplicable =
            (values.compEwayApplicable ?? "false") === "true";
          const isEinvoiceApplicable =
            (values.compEinvoiceApplicable ?? "false") === "true";
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
            compTanNo: toUpperNullable(values.compTanNo ?? ""),
            compCinNo: toUpperNullable(values.compCinNo ?? ""),
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
            compRegionName: toNullableString(values.compRegionName ?? ""),
            compTel: toNullableString(values.compTel ?? ""),
            compPhone: toNullableString(values.compPhone ?? ""),
            compMail: toNullableString(values.compMail ?? ""),
            compSupportEmail: toNullableString(values.compSupportEmail ?? ""),
            compSupportPhone: toNullableString(values.compSupportPhone ?? ""),
            compWebsiteName: toNullableString(values.compWebsiteName ?? ""),
            compFinYearFrom: toNullableDate(values.compFinYearFrom ?? ""),
            compFinYearTo: toNullableDate(values.compFinYearTo ?? ""),
            compBooksBeginFrom: toNullableDate(values.compBooksBeginFrom ?? ""),
            compBooksLockDate: toNullableDate(values.compBooksLockDate ?? ""),
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
            compCurrencyCode: (values.compCurrencyCode ?? "").trim() || "INR",
            compCurrencySymbol: toNullableString(values.compCurrencySymbol ?? ""),
            compLocaleCode:"en-IN",
            compRemarks: toNullableString(values.compRemarks ?? ""),
            compAuthorizeSignature: toNullableString(
              values.compAuthorizeSignature ?? "",
            ),
          };
          if (shouldUpdate && editingItemId !== null) {
            payload.compId = toUpdateId(editingItemId);
          }
          return payload;
        },
      }),
    [companyFormFields, stateCodeByName, stateNameByCode, state.seedSelected],
  );
}
