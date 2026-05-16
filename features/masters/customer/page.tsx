"use client";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import InlineRelatedMasterModal from "@/features/masters/shared/inline-related-master";
import { toast } from "react-toastify";
import type {
  ERPDynamicFieldValidation,
  ERPDynamicFieldValueChangeHandler,
  ERPDynamicModalController,
  ERPDynamicModalSubmitPayload,
  ERPDynamicModalVariant,
  ERPDynamicModalField,
  ERPDynamicSearchQueryChangeHandler,
  ERPDynamicSearchShortcutPayload,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  buildLookupOptions,
  DEFAULT_LOOKUP_ARRAY_KEYS,
  extractRows,
  getFirstDefinedValue,
  toDateInputValue,
  toDisplayValue,
  toNonNegativeInteger,
  toNonNegativeNumber,
  toNullableDate,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
  toUpper,
} from "@/app/master/_shared/crud-utils";
import { COLLECTION_DAY_OPTIONS } from "@/utils/constant";
import { validateGstin, validateOptionalGstin } from "@/utils/validation";
import {
  API_ENDPOINTS,
  GRID_TABLE_NAME,
  STATE_LOOKUP_ENDPOINT,
  STATE_GET_ENDPOINT,
  STATE_UPSERT_ENDPOINT,
  AREA_LOOKUP_ENDPOINT,
  AREA_GET_ENDPOINT,
  AREA_UPSERT_ENDPOINT,
  CUSTOMER_GROUP_LOOKUP_ENDPOINT,
  CUSTOMER_GROUP_GET_ENDPOINT,
  CUSTOMER_GROUP_UPSERT_ENDPOINT,
  COMPANY_LOOKUP_ENDPOINT,
  BRANCH_LOOKUP_ENDPOINT,
  PRICE_LEVEL_LOOKUP_ENDPOINT,
  CITY_LOOKUP_ENDPOINT,
  CUSTOMER_GROUP_LOOKUP_QUERY,
  CUSTOMER_GROUP_SEARCH_DEBOUNCE_MS,
  AREA_LOOKUP_REQUEST_QUERY,
  STATE_LOOKUP_REQUEST_QUERY,
  CITY_LOOKUP_REQUEST_QUERY,
  BRANCH_LOOKUP_REQUEST_QUERY,
  COMPANY_LOOKUP_REQUEST_QUERY,
  PRICE_LEVEL_LOOKUP_REQUEST_QUERY,
  GST_LOOKUP_ENDPOINT,
  GST_LOOKUP_PATTERN,
  GST_LOOKUP_HELPER_TEXT,
  LOOKUP_KEYS,
  REQUEST_PAYLOAD_KEYS,
  STATE_LOOKUP_KEYS,
  CITY_LOOKUP_KEYS,
  STATE_DETAIL_ARRAY_KEYS,
  STATE_DETAIL_KEYS,
  AREA_DETAIL_ARRAY_KEYS,
  AREA_DETAIL_KEYS,
  GROUP_DETAIL_ARRAY_KEYS,
  GROUP_DETAIL_KEYS,
  DEFAULT_STATE_OPTION,
  DEFAULT_AREA_OPTION,
  DEFAULT_CITY_OPTION,
  DEFAULT_GROUP_OPTION,
  DEFAULT_BRANCH_OPTION,
  DEFAULT_COMPANY_OPTION,
  ALL_COMPANY_OPTION_VALUE,
  ALL_BRANCH_OPTION_VALUE,
  ALL_COMPANY_OPTION,
  ALL_BRANCH_OPTION,
  DEFAULT_PRICE_LEVEL_OPTION,
  AREA_MODAL_PANEL_STYLE,
  STATE_MODAL_PANEL_STYLE,
  GROUP_MODAL_PANEL_STYLE,
  GST_TYPE_OPTIONS,
  GST_TYPE_VALUES,
  GST_LOOKUP_SOURCE_KEYS,
  GST_LEGAL_NAME_KEYS,
  GST_TRADE_NAME_KEYS,
  GST_REGISTRATION_TYPE_KEYS,
  GST_PRIMARY_ADDRESS_KEYS,
  GST_ADDRESS_KEYS,
  GST_ADDRESS_BUILDING_KEYS,
  GST_ADDRESS_LOCALITY_KEYS,
  GST_ADDRESS_DISTRICT_KEYS,
  GST_ADDRESS_CITY_KEYS,
  GST_ADDRESS_STATE_KEYS,
  GST_ADDRESS_PIN_KEYS,
  CUSTOMER_BOOLEAN_FIELD_NAMES,
  CUSTOMER_DATE_FIELD_NAMES,
  CUSTOMER_TEXT_FIELD_NAMES,
  CUSTOMER_INITIAL_FORM_VALUES,
  AREA_MODAL_INITIAL_VALUES,
  STATE_MODAL_INITIAL_VALUES,
  GROUP_MODAL_INITIAL_VALUES,
  CUSTOMER_MODAL_PANEL_STYLE,
  CUSTOMER_PHONE_PATTERN,
  CUSTOMER_BASIC_VALIDATIONS,
} from "./customer-master.constants";
function withCustomerBasicValidation(field: ERPDynamicModalField): ERPDynamicModalField {
  const basicValidation = CUSTOMER_BASIC_VALIDATIONS[field.name];
  if (!basicValidation) {
    return field;
  }
  return {
    ...field,
    validation: {
      ...basicValidation,
      ...(field.validation ?? {}),
    },
  };
}

function validateCustomerGstin(
  value: string,
  values: Record<string, string>,
): string | null {
  const normalized = value.trim();
  const gstType = toGstTypeValue(values.cusGstType ?? "");

  if (!normalized) {
    return gstType === "REGULAR"
      ? "GST No is required when GST Type is Regular."
      : null;
  }

  return validateGstin(normalized);
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
function toCustomerLookupGstType(value: string): string {
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

function buildCustomerLookupValues(
  gstin: string,
  payload: Record<string, unknown>,
): Record<string, string> {
  const address = extractGstAddress(payload);
  const legalName = toDisplayValue(getFirstDefinedValue(payload, GST_LEGAL_NAME_KEYS));
  const tradeName = toDisplayValue(getFirstDefinedValue(payload, GST_TRADE_NAME_KEYS));
  const city = toDisplayValue(getFirstDefinedValue(address, GST_ADDRESS_CITY_KEYS));
  const district =
    toDisplayValue(getFirstDefinedValue(address, GST_ADDRESS_DISTRICT_KEYS)) || city;
  const stateCode = gstin.slice(0, 2);
  const values: Record<string, string> = {
    cusGstNo: gstin,
    cusPanNo: gstin.slice(2, 12),
    cusCountry: "India",
  };

  setFieldValueIfPresent(values, "cusName", tradeName || legalName);
  setFieldValueIfPresent(
    values,
    "cusGstType",
    toCustomerLookupGstType(
      toDisplayValue(getFirstDefinedValue(payload, GST_REGISTRATION_TYPE_KEYS)),
    ),
  );
  setFieldValueIfPresent(
    values,
    "cusAddr1",
    joinDisplayValues(
      GST_ADDRESS_BUILDING_KEYS.map((key) => getFirstDefinedValue(address, [key])),
    ),
  );
  setFieldValueIfPresent(
    values,
    "cusAddr2",
    joinDisplayValues(
      GST_ADDRESS_LOCALITY_KEYS.map((key) => getFirstDefinedValue(address, [key])),
    ),
  );
  setFieldValueIfPresent(
    values,
    "cusAddr3",
    joinDisplayValues([
      getFirstDefinedValue(address, GST_ADDRESS_DISTRICT_KEYS),
      getFirstDefinedValue(address, GST_ADDRESS_CITY_KEYS),
    ]),
  );
  setFieldValueIfPresent(values, "cusCity", city);
  setFieldValueIfPresent(values, "cusDistrict", district);
  setFieldValueIfPresent(values, "cusStateCode", stateCode);
  setFieldValueIfPresent(
    values,
    "cusPin",
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

function buildCustomerFormFields(
  stateOptions: ERPDynamicSelectOption[],
  regionStateOptions: ERPDynamicSelectOption[],
  areaOptions: ERPDynamicSelectOption[],
  groupOptions: ERPDynamicSelectOption[],
  companyOptions: ERPDynamicSelectOption[],
  branchOptions: ERPDynamicSelectOption[],
  priceLevelOptions: ERPDynamicSelectOption[],
  onStateCreateShortcut: (payload: ERPDynamicSearchShortcutPayload) => void | Promise<void>,
  onStateEditShortcut: (payload: ERPDynamicSearchShortcutPayload) => void | Promise<void>,
  onAreaCreateShortcut: (payload: ERPDynamicSearchShortcutPayload) => void | Promise<void>,
  onAreaEditShortcut: (payload: ERPDynamicSearchShortcutPayload) => void | Promise<void>,
  onGroupSearchQueryChange: ERPDynamicSearchQueryChangeHandler,
  onGroupCreateShortcut: (payload: ERPDynamicSearchShortcutPayload) => void | Promise<void>,
  onGroupEditShortcut: (payload: ERPDynamicSearchShortcutPayload) => void | Promise<void>,
  onCustomerGstinValueChange: ERPDynamicFieldValueChangeHandler,
): ERPDynamicModalField[] {
  const fields: ERPDynamicModalField[] = [
    {
      name: "scopeHeadingPrimary",
      label: "Primary details",
      type: "heading",
    },   
    {
      name: "cusCompanyId",
      label: "Company",
      type: "select",
      searchable: true,
      options: companyOptions,
    },
    {
      name: "cusAreaId",
      label: "Area",
      type: "select",
      searchable: true,
      required: true,
      options: areaOptions,
      onSearchCreateShortcut: onAreaCreateShortcut,
      onSearchEditShortcut: onAreaEditShortcut,
      validation: {
        requiredMessage: "Area is required.",
      },
    },  {
      name: "cusDefaultSalesman",
      label: "Salesman ",
      validation: {
        pattern: "^[0-9a-fA-F-]{36}$",
        patternMessage: "Default Salesman Id must be a valid UUID.",
      },
    },            
    {
      name: "cusBranchId",
      label: "Branch",
      type: "select",
      searchable: true,
      options: branchOptions,
    },{
      name: "cusGroupId",
      label: "Customer Group",
      type: "select",
      searchable: true,
      required: true,
      options: groupOptions,
      onSearchQueryChange: onGroupSearchQueryChange,
      onSearchCreateShortcut: onGroupCreateShortcut,
      onSearchEditShortcut: onGroupEditShortcut,
      validation: {
        requiredMessage: "Customer Group is required.",
      },
    },
    {
      name: "cusCollectionDays",
      label: "Collection Days",
      type: "select",
      searchable: true,
      multiple: true,
      options: COLLECTION_DAY_OPTIONS,
    },
    {
      name: "scopeHeadingBasic",
      label: "Basic details",
      type: "heading",
    },
    {
      name: "cusName",
      label: "Customer Name",
      gridColumnStart: 1,
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Customer Name must be at least 2 characters.",
      },
    },
    {
      name: "cusCity",
      label: "City",
      gridColumnStart: 2,
    },
    {
      name: "cusPhone1",
      label: "Phone 1",
      type: "tel",
      gridColumnStart: 3,
    },
    {
      name: "cusCode",
      label: "Customer Code",
      gridColumnStart: 1,
    },

    {
      name: "cusDistrict",
      label: "District",
      gridColumnStart: 2,
    },
    
    {
      name: "cusPhone2",
      label: "Phone 2",
      type: "tel",
      gridColumnStart: 3,
    },
    {
      name: "cusShort",
      label: "Short Name",
      gridColumnStart: 1,
    },
    {
      name: "cusStateCode",
      label: "State",
      type: "select",
      searchable: true,
      required: true,
      options: stateOptions,
      gridColumnStart: 2,
      onSearchCreateShortcut: onStateCreateShortcut,
      onSearchEditShortcut: onStateEditShortcut,
      validation: {
        requiredMessage: "State is required.",
      },
    },
    {
      name: "cusTel",
      label: "Tel",
      type: "tel",
      gridColumnStart: 3,
    },
    {
      name: "cusPriceLevelId",
      label: "Price Level",
      type: "select",
      searchable: true,
      required: true,
      options: priceLevelOptions,
      gridColumnStart: 1,
      validation: {
        requiredMessage: "Price Level is required.",
      },
    },
    {
      name: "cusPin",
      label: "PIN",
      gridColumnStart: 2,
    },
    {
      name: "cusWhatsappNo",
      label: "WhatsApp No",
      type: "tel",
      gridColumnStart: 3,
    },
    {
      name: "cusAddr1",
      label: "Address Line 1",
      gridColumnStart: 1,
    },
    {
      name: "cusLandmark",
      label: "Landmark",
      gridColumnStart: 2,
    },
    {
      name: "cusEmail",
      label: "Email",
      type: "email",
      gridColumnStart: 3,
    },
    {
      name: "cusAddr2",
      label: "Address Line 2",
      gridColumnStart: 1,
    },
    {
      name: "cusTransportName",
      label: "Transport Name",
      gridColumnStart: 2,
    },
    {
      name: "cusSortOrder",
      label: "Sort Order",
      type: "number",
      gridColumnStart: 3,
      colSpan: 1,
      min: 0,
      step: 1,
      validation: {
        minMessage: "Sort Order must be 0 or greater.",
      },
    },
    {
      name: "cusAddr3",
      label: "Address Line 3",
      gridColumnStart: 1,
    },
    // {
    //   name: "cusCountry",
    //   label: "Country",
    // },
    // {
    //   name: "cusGeoLocation",
    //   label: "Geo Location",
    // },
    {
      name: "creditHeading",
      label: "Credit Details",
      type: "heading",
    },
    {
      name: "cusCreditDays",
      label: "Credit Days",
      type: "number",
      gridColumnStart: 1,
      min: 0,
      step: 1,
      validation: {
        minMessage: "Credit Days must be 0 or greater.",
      },
    },
    {
      name: "cusCreditAmtLimit",
      label: "Credit Amount Limit",
      type: "number",
      gridColumnStart: 2,
      min: 0,
      step: "0.01",
      validation: {
        minMessage: "Credit Amount Limit must be 0 or greater.",
      },
    },
    {
      name: "cusDebitBalance",
      label: "Debit Balance",
      type: "number",
      gridColumnStart: 3,
      min: 0,
      step: "0.01",
      validation: {
        minMessage: "Debit Balance must be 0 or greater.",
      },
    },
    {
      name: "cusCreditBillLimit",
      label: "Credit Bill Limit",
      type: "number",
      gridColumnStart: 1,
      min: 0,
      step: 1,
      validation: {
        minMessage: "Credit Bill Limit must be 0 or greater.",
      },
    },
    {
      name: "cusDebitGraceDays",
      label: "Debit Grace Days",
      type: "number",
      gridColumnStart: 2,
      min: 0,
      step: 1,
      validation: {
        minMessage: "Debit Grace Days must be 0 or greater.",
      },
    },
    {
      name: "taxHeading",
      label: "Tax Details",
      type: "heading",
    },
    {
      name: "cusGstType",
      label: "GST Type",
      type: "select",
      searchable: true,
      options: GST_TYPE_OPTIONS,
      gridColumnStart: 1,
    },
    {
      name: "cusPanNo",
      label: "PAN No",
      gridColumnStart: 2,
      validation: {
        pattern: "^[A-Z]{5}[0-9]{4}[A-Z]{1}$",
        patternMessage: "PAN must be 10 characters (e.g., ABCDE1234F).",
      },
    },
    {
      name: "cusEcommerceGstin",
      label: "Ecommerce GSTIN",
      gridColumnStart: 3,
      validation: {
        custom: (value) => validateOptionalGstin(value),
      },
    },
    {
      name: "cusGstNo",
      label: "GST No",
      gridColumnStart: 1,
      placeholder: "24ABCDE1234F1Z5",
      helperText: GST_LOOKUP_HELPER_TEXT,
      onValueChange: onCustomerGstinValueChange,
      validation: {
        custom: (value, values) => validateCustomerGstin(value, values),
      },
    },
    {
      name: "cusAadharNo",
      label: "Aadhar No",
      gridColumnStart: 2,
      validation: {
        pattern: "^[0-9]{12}$",
        patternMessage: "Aadhar must be 12 digits.",
      },
    },
    {
      name: "cusDistanceKm",
      label: "Distance (Km)",
      type: "number",
      gridColumnStart: 3,
      min: 0,
      step: 1,
      validation: {
        minMessage: "Distance must be 0 or greater.",
      },
    },
    {
      name: "regionHeading",
      label: "Region Details",
      type: "heading",
      defaultExpanded: false,
    },
    {
      name: "cusRegionName",
      label: "Region Name",
    },
    {
      name: "cusRegionAddr1",
      label: "Region Address 1",
    },
    {
      name: "cusRegionAddr2",
      label: "Region Address 2",
    },
    {
      name: "cusRegionAddr3",
      label: "Region Address 3",
    },
    {
      name: "cusRegionCity",
      label: "Region City",
    },
    {
      name: "cusRegionDistrict",
      label: "Region District",
    },
    {
      name: "cusRegionStateName",
      label: "Region State Name",
      type: "select",
      searchable: true,
      options: regionStateOptions,
    },
    {
      name: "cusRegionCountry",
      label: "Region Country",
    },
    {
      name: "statusHeading",
      label: "Status and Notes",
      type: "heading",
    },
    {
      name: "cusDiscPerc",
      label: "Discount %",
      type: "number",
      gridColumnStart: 1,
      min: 0,
      step: "0.001",
      validation: {
        minMessage: "Discount % must be 0 or greater.",
      },
    },
    {
      name: "cusBirthDate",
      label: "Birth Date",
      type: "date",
      gridColumnStart: 2,
    },
    {
      name: "cusMarriageDate",
      label: "Anniversary Date",
      type: "date",
      gridColumnStart: 3,
    },
    {
      name: "cusEnableSms",
      label: "Enable SMS",
      type: "checkbox",
      gridColumnStart: 1,
    },
    {
      name: "cusOverdueSms",
      label: "Overdue SMS",
      type: "checkbox",
      gridColumnStart: 2,
    },
    {
      name: "cusOverdueBilling",
      label: "Overdue Billing",
      type: "checkbox",
      gridColumnStart: 3,
    },
    {
      name: "cusAllowPromotion",
      label: "Allow Promotion",
      type: "checkbox",
      gridColumnStart: 1,
    },
    {
      name: "cusAllowLoyalty",
      label: "Allow Loyalty",
      type: "checkbox",
      gridColumnStart: 2,
    },
    {
      name: "cusAllowDiscount",
      label: "Allow Discount",
      type: "checkbox",
      gridColumnStart: 3,
    },
    {
      name: "cusTcsApplicable",
      label: "TCS Allowable",
      type: "checkbox",
      gridColumnStart: 1,
    },
    {
      name: "cusItcollExempted",
      label: "IT Collection Exempted",
      type: "checkbox",
      gridColumnStart: 2,
    },
    {
      name: "cusFreightCharge",
      label: "Freight Charge",
      type: "checkbox",
      gridColumnStart: 3,
    },
    {
      name: "cusLoadingCharge",
      label: "Loading Charge",
      type: "checkbox",
      gridColumnStart: 1,
    },
    {
      name: "cusUnloadingCharge",
      label: "Unloading Charge",
      type: "checkbox",
      gridColumnStart: 2,
    },
    {
      name: "cusIsActive",
      label: "Active",
      type: "checkbox",
      gridColumnStart: 3,
    },
    {
      name: "cusNotes",
      label: "Notes",
      colSpan: 2,
      rows: 3,
    },
  ];
  return fields.map(withCustomerBasicValidation);
}
function toSnakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}
function getFieldValue(source: Record<string, unknown>, fieldName: string): unknown {
  return getFirstDefinedValue(source, [fieldName, toSnakeCase(fieldName)]);
}
function toNullableInteger(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}
function toUpperNullable(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized.toUpperCase() : null;
}
function toNullableScopeId(value: string, allOptionValue: string): string | null {
  const normalized = value.trim();
  if (!normalized || normalized === allOptionValue) {
    return null;
  }
  return normalized;
}
function parseCollectionDays(value: string): number[] {
  const normalized = value.trim();
  if (!normalized) {
    return [];
  }
  const parsedValues = normalized
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => Number.parseInt(entry, 10))
    .filter((entry) => Number.isInteger(entry) && entry >= 1 && entry <= 7);
  return Array.from(new Set(parsedValues));
}
function toCollectionDaysInput(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }
  const normalized = value
    .map((entry) => (typeof entry === "number" ? entry : Number(entry)))
    .filter((entry) => Number.isInteger(entry) && entry >= 1 && entry <= 7)
    .map((entry) => String(entry));
  return Array.from(new Set(normalized)).join(",");
}

function toGstTypeValue(value: string): string {
  const normalized = value.trim().toUpperCase();
  return GST_TYPE_VALUES.has(normalized) ? normalized : "";
}

function removeEmptyOptions(
  options: ERPDynamicSelectOption[],
): ERPDynamicSelectOption[] {
  return options.filter((option) => option.value.trim().length > 0);
}

function buildStateLookupData(payload: unknown): {
  options: ERPDynamicSelectOption[];
  regionStateOptions: ERPDynamicSelectOption[];
  stateNameByCode: Record<string, string>;
  stateCodeByName: Record<string, string>;
} {
  const codeToName = new Map<string, string>();
  const rows = extractRows(payload, STATE_LOOKUP_KEYS.array);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const stateCode = toDisplayValue(getFirstDefinedValue(source, STATE_LOOKUP_KEYS.code))
      .trim()
      .toUpperCase();
    const stateName = toDisplayValue(getFirstDefinedValue(source, STATE_LOOKUP_KEYS.name));
    if (!stateCode || !stateName) {
      continue;
    }
    if (!codeToName.has(stateCode)) {
      codeToName.set(stateCode, stateName);
    }
  }
  const options = Array.from(codeToName.entries())
    .map(([value, name]) => ({
      value,
      label: `${name} (${value})`,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const regionStateOptions = Array.from(new Set(codeToName.values()))
    .map((name) => ({
      value: name,
      label: name,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const stateNameByCode: Record<string, string> = {};
  const stateCodeByName: Record<string, string> = {};
  for (const [code, name] of codeToName.entries()) {
    stateNameByCode[code] = name;
    if (!(name in stateCodeByName)) {
      stateCodeByName[name] = code;
    }
  }
  return {
    options,
    regionStateOptions,
    stateNameByCode,
    stateCodeByName,
  };
}
function extractStateCodeDetailSource(payload: unknown): Record<string, unknown> | null {
  const rows = extractRows(payload, STATE_DETAIL_ARRAY_KEYS);
  if (rows.length > 0) {
    const firstRow = rows[0];
    if (firstRow && typeof firstRow === "object" && !Array.isArray(firstRow)) {
      return firstRow as Record<string, unknown>;
    }
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const objectPayload = payload as Record<string, unknown>;
  const nestedData = objectPayload.data;
  if (nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)) {
    return nestedData as Record<string, unknown>;
  }

  return objectPayload;
}
function mapStateCodeDetailToFormValues(source: Record<string, unknown>): Record<string, string> {
  return {
    ...STATE_MODAL_INITIAL_VALUES,
    stateCode:
      toUpper(toDisplayValue(getFirstDefinedValue(source, STATE_DETAIL_KEYS.code))) ||
      STATE_MODAL_INITIAL_VALUES.stateCode,
    stateName:
      toDisplayValue(getFirstDefinedValue(source, STATE_DETAIL_KEYS.name)) ||
      STATE_MODAL_INITIAL_VALUES.stateName,
    stateUt: toSelectBoolean(
      getFirstDefinedValue(source, STATE_DETAIL_KEYS.stateUt),
      STATE_MODAL_INITIAL_VALUES.stateUt === "true" ? "true" : "false",
    ),
    tinCode:
      toUpper(toDisplayValue(getFirstDefinedValue(source, STATE_DETAIL_KEYS.tinCode))) ||
      STATE_MODAL_INITIAL_VALUES.tinCode,
    isActive: toSelectBoolean(
      getFirstDefinedValue(source, STATE_DETAIL_KEYS.active),
      STATE_MODAL_INITIAL_VALUES.isActive === "true" ? "true" : "false",
    ),
  };
}
function buildStateCodeModalFields(disableStateCode: boolean): ERPDynamicModalField[] {
  return [
    {
      name: "stateCode",
      label: "State Code",
      required: true,
      disabled: disableStateCode,
      placeholder: "MH",
      helperText: "Two-character code.",
      validation: {
        pattern: "^[A-Za-z]{2}$",
        patternMessage: "State Code must be exactly 2 letters.",
      },
    },
    {
      name: "stateName",
      label: "State Name",
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "State Name must be at least 2 characters.",
      },
    },
    {
      name: "stateUt",
      label: "State / UT",
      type: "checkbox",
    },
    {
      name: "tinCode",
      label: "TIN Code",
      placeholder: "27",
      helperText: "Optional 2-character TIN code.",
      validation: {
        pattern: "^[A-Za-z0-9]{0,2}$",
        patternMessage: "TIN Code can be up to 2 letters/numbers.",
      },
    },
    {
      name: "isActive",
      label: "Is Active",
      type: "checkbox",
    },
  ];
}
function buildAreaOptions(payload: unknown): ERPDynamicSelectOption[] {
  return removeEmptyOptions(
    buildLookupOptions(payload, DEFAULT_AREA_OPTION, {
      arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "areas"],
      idKeys: ["armId", "arm_id", "area_id", "areaId", "id", "_id", "value"],
      labelKeys: ["armName", "arm_name", "area_name", "areaName", "name", "label"],
    }),
  );
}
function buildCityOptions(payload: unknown): ERPDynamicSelectOption[] {
  return removeEmptyOptions(
    buildLookupOptions(payload, DEFAULT_CITY_OPTION, {
      arrayKeys: CITY_LOOKUP_KEYS.array,
      idKeys: CITY_LOOKUP_KEYS.id,
      labelKeys: CITY_LOOKUP_KEYS.label,
    }),
  );
}
function extractAreaDetailSource(payload: unknown): Record<string, unknown> | null {
  const rows = extractRows(payload, AREA_DETAIL_ARRAY_KEYS);
  if (rows.length > 0) {
    const firstRow = rows[0];
    if (firstRow && typeof firstRow === "object" && !Array.isArray(firstRow)) {
      return firstRow as Record<string, unknown>;
    }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const objectPayload = payload as Record<string, unknown>;
  const nestedData = objectPayload.data;
  if (nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)) {
    return nestedData as Record<string, unknown>;
  }
  return objectPayload;
}
function mapAreaDetailToFormValues(source: Record<string, unknown>): Record<string, string> {
  return {
    ...AREA_MODAL_INITIAL_VALUES,
    armName:
      toDisplayValue(getFirstDefinedValue(source, AREA_DETAIL_KEYS.name)) ||
      AREA_MODAL_INITIAL_VALUES.armName,
    armAlias:
      toDisplayValue(getFirstDefinedValue(source, AREA_DETAIL_KEYS.alias)) ||
      AREA_MODAL_INITIAL_VALUES.armAlias,
    armShort:
      toDisplayValue(getFirstDefinedValue(source, AREA_DETAIL_KEYS.short)) ||
      AREA_MODAL_INITIAL_VALUES.armShort,
    armCityId:
      toDisplayValue(getFirstDefinedValue(source, AREA_DETAIL_KEYS.cityId)) ||
      AREA_MODAL_INITIAL_VALUES.armCityId,
    armDistanceKm:
      toDisplayValue(getFirstDefinedValue(source, AREA_DETAIL_KEYS.distance)) ||
      AREA_MODAL_INITIAL_VALUES.armDistanceKm,
    armCollectionDays:
      toCollectionDaysInput(getFirstDefinedValue(source, AREA_DETAIL_KEYS.collectionDays)) ||
      AREA_MODAL_INITIAL_VALUES.armCollectionDays,
    armSort:
      toDisplayValue(getFirstDefinedValue(source, AREA_DETAIL_KEYS.sort)) ||
      AREA_MODAL_INITIAL_VALUES.armSort,
    armIsActive: toSelectBoolean(
      getFirstDefinedValue(source, AREA_DETAIL_KEYS.active),
      AREA_MODAL_INITIAL_VALUES.armIsActive === "true" ? "true" : "false",
    ),
  };
}
function buildAreaModalFields(cityOptions: ERPDynamicSelectOption[]): ERPDynamicModalField[] {
  return [
    {
      name: "armName",
      label: "Area Name",
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Area Name must be at least 2 characters.",
      },
    },
    {
      name: "armAlias",
      label: "Alias",
    },
    {
      name: "armShort",
      label: "Short Name",
    },
    {
      name: "armCityId",
      label: "City",
      type: "select",
      searchable: true,
      required: true,
      options: cityOptions,
      validation: {
        requiredMessage: "City is required.",
      },
    },
    {
      name: "armDistanceKm",
      label: "Distance (KM)",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Distance must be 0 or greater.",
      },
    },
    {
      name: "armCollectionDays",
      label: "Collection Days",
      type: "select",
      searchable: true,
      multiple: true,
      options: COLLECTION_DAY_OPTIONS,
    },
    {
      name: "armSort",
      label: "Sort",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Sort must be 0 or greater.",
      },
    },
    {
      name: "armIsActive",
      label: "Active",
      type: "checkbox",
    },
  ];
}

function buildGroupOptions(payload: unknown): ERPDynamicSelectOption[] {
  return removeEmptyOptions(
    buildLookupOptions(payload, DEFAULT_GROUP_OPTION, {
      arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "customerGroups", "customer_groups"],
      idKeys: ["cgrId", "cgr_id", "group_id", "groupId", "id", "_id", "value"],
      labelKeys: ["cgrName", "cgr_name", "group_name", "groupName", "name", "label"],
    }),
  );
}

function mergeLookupOptions(
  currentOptions: ERPDynamicSelectOption[],
  nextOptions: ERPDynamicSelectOption[],
): ERPDynamicSelectOption[] {
  const merged = new Map<string, ERPDynamicSelectOption>();
  for (const option of currentOptions) {
    if (!option.value.trim()) {
      continue;
    }
    merged.set(option.value, option);
  }
  for (const option of nextOptions) {
    if (!option.value.trim()) {
      continue;
    }
    merged.set(option.value, option);
  }
  return Array.from(merged.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function parseGroupCollectionDays(value: string): number[] {
  const normalized = value.trim();
  if (!normalized) {
    return [];
  }

  const parsed = normalized
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => Number.parseInt(token, 10))
    .filter((token) => Number.isInteger(token) && token >= 0);

  return Array.from(new Set(parsed));
}

function toGroupCollectionDaysInput(value: unknown): string {
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => (typeof entry === "number" ? entry : Number(entry)))
      .filter((entry) => Number.isInteger(entry) && entry >= 0)
      .map((entry) => String(entry));
    return Array.from(new Set(normalized)).join(",");
  }

  if (typeof value === "string") {
    return parseGroupCollectionDays(value)
      .map((entry) => String(entry))
      .join(",");
  }

  return "";
}

function extractGroupDetailSource(payload: unknown): Record<string, unknown> | null {
  const rows = extractRows(payload, GROUP_DETAIL_ARRAY_KEYS);
  if (rows.length > 0) {
    const firstRow = rows[0];
    if (firstRow && typeof firstRow === "object" && !Array.isArray(firstRow)) {
      return firstRow as Record<string, unknown>;
    }
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const objectPayload = payload as Record<string, unknown>;
  const nestedData = objectPayload.data;
  if (nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)) {
    return nestedData as Record<string, unknown>;
  }

  return objectPayload;
}

function mapGroupDetailToFormValues(source: Record<string, unknown>): Record<string, string> {
  return {
    ...GROUP_MODAL_INITIAL_VALUES,
    cgrName:
      toDisplayValue(getFirstDefinedValue(source, GROUP_DETAIL_KEYS.name)) ||
      GROUP_MODAL_INITIAL_VALUES.cgrName,
    cgrAlias:
      toDisplayValue(getFirstDefinedValue(source, GROUP_DETAIL_KEYS.alias)) ||
      GROUP_MODAL_INITIAL_VALUES.cgrAlias,
    cgrShort:
      toDisplayValue(getFirstDefinedValue(source, GROUP_DETAIL_KEYS.short)) ||
      GROUP_MODAL_INITIAL_VALUES.cgrShort,
    cgrNarration:
      toDisplayValue(getFirstDefinedValue(source, GROUP_DETAIL_KEYS.narration)) ||
      GROUP_MODAL_INITIAL_VALUES.cgrNarration,
    cgrOrder:
      toDisplayValue(getFirstDefinedValue(source, GROUP_DETAIL_KEYS.order)) ||
      GROUP_MODAL_INITIAL_VALUES.cgrOrder,
    cgrDiscPerc:
      toDisplayValue(getFirstDefinedValue(source, GROUP_DETAIL_KEYS.discPerc)) ||
      GROUP_MODAL_INITIAL_VALUES.cgrDiscPerc,
    cgrCollectionDays:
      toGroupCollectionDaysInput(getFirstDefinedValue(source, GROUP_DETAIL_KEYS.collectionDays)) ||
      GROUP_MODAL_INITIAL_VALUES.cgrCollectionDays,
    cgrDebitAllowed: toSelectBoolean(
      getFirstDefinedValue(source, GROUP_DETAIL_KEYS.debitAllowed),
      GROUP_MODAL_INITIAL_VALUES.cgrDebitAllowed === "true" ? "true" : "false",
    ),
    cgrDebitDays:
      toDisplayValue(getFirstDefinedValue(source, GROUP_DETAIL_KEYS.debitDays)) ||
      GROUP_MODAL_INITIAL_VALUES.cgrDebitDays,
    cgrDebitLimit:
      toDisplayValue(getFirstDefinedValue(source, GROUP_DETAIL_KEYS.debitLimit)) ||
      GROUP_MODAL_INITIAL_VALUES.cgrDebitLimit,
    cgrBillsLimit:
      toDisplayValue(getFirstDefinedValue(source, GROUP_DETAIL_KEYS.billsLimit)) ||
      GROUP_MODAL_INITIAL_VALUES.cgrBillsLimit,
    cgrOverdueBilling: toSelectBoolean(
      getFirstDefinedValue(source, GROUP_DETAIL_KEYS.overdueBilling),
      GROUP_MODAL_INITIAL_VALUES.cgrOverdueBilling === "true" ? "true" : "false",
    ),
    cgrIsActive: toSelectBoolean(
      getFirstDefinedValue(source, GROUP_DETAIL_KEYS.active),
      GROUP_MODAL_INITIAL_VALUES.cgrIsActive === "true" ? "true" : "false",
    ),
  };
}

function buildGroupModalFields(): ERPDynamicModalField[] {
  return [
    {
      name: "cgrName",
      label: "Group Name",
      required: true,
      colSpan: 2,
      validation: {
        minLength: 2,
        minLengthMessage: "Group Name must be at least 2 characters.",
      },
    },
    {
      name: "cgrShort",
      label: "Short Name",
      colSpan: 2,
    },
    {
      name: "cgrOrder",
      label: "Sort Order",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Sort Order must be 0 or greater.",
      },
    },
    {
      name: "cgrDiscPerc",
      label: "Discount %",
      type: "number",
      min: 0,
      step: "0.001",
      validation: {
        minMessage: "Discount % must be 0 or greater.",
      },
    },
    {
      name: "cgrCollectionDays",
      label: "Collection Days",
      colSpan: 2,
      placeholder: "1,7,15",
      helperText: "Comma-separated day numbers.",
    },
    {
      name: "cgrDebitDays",
      label: "Debit Days",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Debit Days must be 0 or greater.",
      },
    },
    {
      name: "cgrDebitLimit",
      label: "Debit Limit",
      type: "number",
      min: 0,
      step: "0.01",
      validation: {
        minMessage: "Debit Limit must be 0 or greater.",
      },
    },
    {
      name: "cgrBillsLimit",
      label: "Bills Limit",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Bills Limit must be 0 or greater.",
      },
    },
    {
      name: "cgrDebitAllowed",
      label: "Debit Allowed",
      type: "checkbox",
    },
    {
      name: "cgrOverdueBilling",
      label: "Overdue Billing",
      type: "checkbox",
    },
    {
      name: "cgrIsActive",
      label: "Is Active",
      type: "checkbox",
    },
    {
      name: "cgrNarration",
      label: "Narration",
      colSpan: 2,
    },
  ];
}

export default function CustomerPage() {
  const stateModalControllerRef = useRef<ERPDynamicModalController | null>(null);
  const areaModalControllerRef = useRef<ERPDynamicModalController | null>(null);
  const groupModalControllerRef = useRef<ERPDynamicModalController | null>(null);
  const { getAll: getStateLookup } = useApi<unknown>(STATE_LOOKUP_ENDPOINT);
  const {
    getAll: getStateByCode,
    loading: stateDetailsLoading,
    error: stateDetailsError,
    reset: resetStateDetailsState,
  } = useApi<unknown>(STATE_GET_ENDPOINT, {
    toast: {
      success: false,
    },
  });
  const {
    run: upsertStateCode,
    loading: stateSaveLoading,
    error: stateSaveError,
    reset: resetStateSaveState,
  } = useApi<unknown, Record<string, unknown>>(STATE_UPSERT_ENDPOINT, {
    method: "POST",
  });
  const { getAll: getAreaLookup } = useApi<unknown>(AREA_LOOKUP_ENDPOINT);
  const {
    getAll: getAreaById,
    loading: areaDetailsLoading,
    error: areaDetailsError,
    reset: resetAreaDetailsState,
  } = useApi<unknown>(AREA_GET_ENDPOINT, {
    toast: {
      success: false,
    },
  });
  const {
    run: upsertArea,
    loading: areaSaveLoading,
    error: areaSaveError,
    reset: resetAreaSaveState,
  } = useApi<unknown, Record<string, unknown>>(AREA_UPSERT_ENDPOINT, {
    method: "POST",
  });
  const { getAll: getCityLookup } = useApi<unknown>(CITY_LOOKUP_ENDPOINT);
  const { getAll: getCustomerGroupLookup } = useApi<unknown>(CUSTOMER_GROUP_LOOKUP_ENDPOINT);
  const {
    getAll: getCustomerGroupById,
    loading: groupDetailsLoading,
    error: groupDetailsError,
    reset: resetGroupDetailsState,
  } = useApi<unknown>(CUSTOMER_GROUP_GET_ENDPOINT, {
    toast: {
      success: false,
    },
  });
  const {
    run: upsertCustomerGroup,
    loading: groupSaveLoading,
    error: groupSaveError,
    reset: resetGroupSaveState,
  } = useApi<unknown, Record<string, unknown>>(CUSTOMER_GROUP_UPSERT_ENDPOINT, {
    method: "POST",
  });
  const { getAll: getCompanyLookup } = useApi<unknown>(COMPANY_LOOKUP_ENDPOINT);
  const { getAll: getBranchLookup } = useApi<unknown>(BRANCH_LOOKUP_ENDPOINT);
  const { getAll: getPriceLevelLookup } = useApi<unknown>(PRICE_LEVEL_LOOKUP_ENDPOINT);
  const [stateOptions, setStateOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [regionStateOptions, setRegionStateOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [areaOptions, setAreaOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [cityOptions, setCityOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [companyOptions, setCompanyOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [branchOptions, setBranchOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [priceLevelOptions, setPriceLevelOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [stateNameByCode, setStateNameByCode] = useState<Record<string, string>>({});
  const [stateCodeByName, setStateCodeByName] = useState<Record<string, string>>({});
  const [editingStateCode, setEditingStateCode] = useState<string | null>(null);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const gstLookupCacheRef = useRef<Record<string, Record<string, string>>>({});
  const customerGroupSearchTimeoutRef = useRef<number | null>(null);
  const customerGroupSearchRequestRef = useRef(0);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const [statePayload, areaPayload, cityPayload, groupPayload, companyPayload, branchPayload, priceLevelPayload] =
          await Promise.all([
            getStateLookup(STATE_LOOKUP_REQUEST_QUERY),
            getAreaLookup(AREA_LOOKUP_REQUEST_QUERY),
            getCityLookup(CITY_LOOKUP_REQUEST_QUERY),
            getCustomerGroupLookup(CUSTOMER_GROUP_LOOKUP_QUERY),
            getCompanyLookup(COMPANY_LOOKUP_REQUEST_QUERY),
            getBranchLookup(BRANCH_LOOKUP_REQUEST_QUERY),
            getPriceLevelLookup(PRICE_LEVEL_LOOKUP_REQUEST_QUERY),
          ]);
        if (!mounted) {
          return;
        }
        const stateLookupData = buildStateLookupData(statePayload);
        setStateOptions(stateLookupData.options);
        setRegionStateOptions(stateLookupData.regionStateOptions);
        setStateNameByCode(stateLookupData.stateNameByCode);
        setStateCodeByName(stateLookupData.stateCodeByName);
        setAreaOptions(buildAreaOptions(areaPayload));
        setCityOptions(buildCityOptions(cityPayload));
        setGroupOptions(buildGroupOptions(groupPayload));
        const companyLookupOptions = removeEmptyOptions(
          buildLookupOptions(companyPayload, DEFAULT_COMPANY_OPTION, {
            arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "companies", "companys"],
            idKeys: ["compId", "comp_id", "company_id", "companyId", "id", "_id", "value"],
            labelKeys: ["compName", "comp_name", "company_name", "companyName", "name", "label"],
          }),
        );
        setCompanyOptions([ALL_COMPANY_OPTION, ...companyLookupOptions]);
        const branchLookupOptions = removeEmptyOptions(
          buildLookupOptions(branchPayload, DEFAULT_BRANCH_OPTION, {
            arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "branches", "branch_masters"],
            idKeys: ["brId", "br_id", "branch_id", "branchId", "id", "_id", "value"],
            labelKeys: ["brName", "br_name", "branch_name", "branchName", "name", "label"],
          }),
        );
        setBranchOptions([ALL_BRANCH_OPTION, ...branchLookupOptions]);
        setPriceLevelOptions(
          removeEmptyOptions(
            buildLookupOptions(priceLevelPayload, DEFAULT_PRICE_LEVEL_OPTION, {
              arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "priceLevels", "price_levels"],
              idKeys: ["priceLvlId", "price_lvl_id", "id", "value"],
              labelKeys: ["priceLvlName", "price_lvl_name", "name", "label"],
            }),
          ),
        );
      } catch {
        if (!mounted) {
          return;
        }
        setStateOptions([]);
        setRegionStateOptions([]);
        setStateNameByCode({});
        setStateCodeByName({});
        setAreaOptions([]);
        setCityOptions([]);
        setGroupOptions([]);
        setCompanyOptions([]);
        setBranchOptions([]);
        setPriceLevelOptions([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [
    getAreaLookup,
    getBranchLookup,
    getCityLookup,
    getCompanyLookup,
    getCustomerGroupLookup,
    getPriceLevelLookup,
    getStateLookup,
  ]);
  const loadCustomerGroupOptions = useCallback(
    async (search = "") => {
      const normalizedSearch = search.trim();
      const payload = await getCustomerGroupLookup(
        normalizedSearch
          ? {
              ...CUSTOMER_GROUP_LOOKUP_QUERY,
              search: normalizedSearch,
            }
          : CUSTOMER_GROUP_LOOKUP_QUERY,
      );
      return buildGroupOptions(payload);
    },
    [getCustomerGroupLookup],
  );
  const handleCustomerGroupSearchChange = useCallback<ERPDynamicSearchQueryChangeHandler>(
    (query) => {
      const normalizedQuery = query.trim();
      if (customerGroupSearchTimeoutRef.current !== null) {
        window.clearTimeout(customerGroupSearchTimeoutRef.current);
      }
      if (!normalizedQuery) {
        return;
      }
      const requestId = customerGroupSearchRequestRef.current + 1;
      customerGroupSearchRequestRef.current = requestId;
      customerGroupSearchTimeoutRef.current = window.setTimeout(() => {
        void (async () => {
          try {
            const searchedOptions = await loadCustomerGroupOptions(normalizedQuery);
            if (customerGroupSearchRequestRef.current !== requestId) {
              return;
            }
            setGroupOptions((current) => mergeLookupOptions(current, searchedOptions));
          } catch {
            // Keep current options if live lookup search fails.
          }
        })();
      }, CUSTOMER_GROUP_SEARCH_DEBOUNCE_MS);
    },
    [loadCustomerGroupOptions],
  );
  useEffect(() => {
    return () => {
      if (customerGroupSearchTimeoutRef.current !== null) {
        window.clearTimeout(customerGroupSearchTimeoutRef.current);
      }
    };
  }, []);
  const stateCreateModalFields = useMemo(() => buildStateCodeModalFields(false), []);
  const stateUpdateModalFields = useMemo(() => buildStateCodeModalFields(true), []);
  const stateModalVariants = useMemo<ERPDynamicModalVariant[]>(
    () => [
      {
        key: "state-create",
        cardTitle: "Create State",
        cardDescription: "Create a new state code.",
        cardButtonLabel: "Create",
        modalTitle: "New State",
        modalDescription: "Create state from customer form.",
        submitLabel: stateSaveLoading ? "Saving..." : "Save",
        accent: "blue",
        fields: stateCreateModalFields,
      },
      {
        key: "state-update",
        cardTitle: "Update State",
        cardDescription: "Update existing state code.",
        cardButtonLabel: "Update",
        modalTitle: "Edit State",
        modalDescription: "Update state from customer form.",
        submitLabel: stateSaveLoading ? "Updating..." : "Update",
        accent: "emerald",
        fields: stateUpdateModalFields,
      },
    ],
    [stateCreateModalFields, stateSaveLoading, stateUpdateModalFields],
  );
  const refreshStateOptions = useCallback(async () => {
    const statePayload = await getStateLookup(STATE_LOOKUP_REQUEST_QUERY);
    const stateLookupData = buildStateLookupData(statePayload);
    setStateOptions(stateLookupData.options);
    setRegionStateOptions(stateLookupData.regionStateOptions);
    setStateNameByCode(stateLookupData.stateNameByCode);
    setStateCodeByName(stateLookupData.stateCodeByName);
  }, [getStateLookup]);
  const resolveStateOptionFromShortcut = useCallback(
    (payload: ERPDynamicSearchShortcutPayload): ERPDynamicSelectOption | null => {
      const selectedValue = payload.value.trim().toUpperCase();
      if (selectedValue) {
        const selectedOption = stateOptions.find((option) => option.value === selectedValue);
        if (selectedOption) {
          return selectedOption;
        }
      }
      const normalizedQuery = payload.query.trim().toLowerCase();
      if (!normalizedQuery) {
        return null;
      }
      const exactMatch = stateOptions.find((option) => {
        const label = option.label.trim().toLowerCase();
        const value = option.value.trim().toLowerCase();
        return label === normalizedQuery || value === normalizedQuery;
      });
      if (exactMatch) {
        return exactMatch;
      }
      const startsWithMatch = stateOptions.find((option) =>
        option.label.trim().toLowerCase().startsWith(normalizedQuery),
      );
      if (startsWithMatch) {
        return startsWithMatch;
      }
      return (
        stateOptions.find((option) =>
          option.label.trim().toLowerCase().includes(normalizedQuery),
        ) ?? null
      );
    },
    [stateOptions],
  );
  const handleStateCreateShortcut = useCallback(
    (payload: ERPDynamicSearchShortcutPayload) => {
      const query = payload.query.trim();
      const compactQuery = query.replace(/\s+/g, "");
      resetStateSaveState();
      resetStateDetailsState();
      setEditingStateCode(null);
      stateModalControllerRef.current?.openModal("state-create", {
        values: {
          ...STATE_MODAL_INITIAL_VALUES,
          stateCode: compactQuery.length === 2 ? toUpper(compactQuery) : "",
          stateName: query,
        },
      });
    },
    [resetStateDetailsState, resetStateSaveState],
  );
  const handleStateEditShortcut = useCallback(
    async (payload: ERPDynamicSearchShortcutPayload) => {
      const matchedOption = resolveStateOptionFromShortcut(payload);
      if (!matchedOption) {
        toast.info("Type/select an existing state, then press Alt+A.");
        return;
      }
      const matchedStateCode = matchedOption.value.trim().toUpperCase();
      if (!matchedStateCode) {
        toast.info("Select an existing state to edit.");
        return;
      }
      resetStateSaveState();
      resetStateDetailsState();
      setEditingStateCode(matchedStateCode);
      try {
        const detailPayload = await getStateByCode({
          stateCode: matchedStateCode,
        });
        const detailSource = extractStateCodeDetailSource(detailPayload);
        stateModalControllerRef.current?.openModal("state-update", {
          values: detailSource
            ? mapStateCodeDetailToFormValues(detailSource)
            : {
                ...STATE_MODAL_INITIAL_VALUES,
                stateCode: matchedStateCode,
                stateName: stateNameByCode[matchedStateCode] ?? matchedOption.label,
              },
        });
      } catch {
        // Error UI is handled by useApi.
      }
    },
    [
      getStateByCode,
      resetStateDetailsState,
      resetStateSaveState,
      resolveStateOptionFromShortcut,
      stateNameByCode,
    ],
  );
  const handleStateModalSubmit = useCallback(
    async ({ variantKey, values }: ERPDynamicModalSubmitPayload) => {
      const isUpdate = variantKey === "state-update";
      const requestedStateCode = toUpper(values.stateCode ?? "");
      const stateCode = isUpdate && editingStateCode ? editingStateCode : requestedStateCode;
      const payload: Record<string, unknown> = {
        stateCode,
        stateName: (values.stateName ?? "").trim(),
        stateUt: (values.stateUt ?? "false") === "true",
        tinCode: toUpperNullable(values.tinCode ?? ""),
        isActive: (values.isActive ?? "true") === "true",
      };
      await upsertStateCode({ body: payload });
      setEditingStateCode(null);
      await refreshStateOptions();
    },
    [editingStateCode, refreshStateOptions, upsertStateCode],
  );
  const handleStateModalCancel = useCallback(() => {
    if (stateSaveLoading || stateDetailsLoading) {
      return;
    }
    resetStateSaveState();
    resetStateDetailsState();
    setEditingStateCode(null);
  }, [resetStateDetailsState, resetStateSaveState, stateDetailsLoading, stateSaveLoading]);
  const areaModalFields = useMemo(
    () => buildAreaModalFields(cityOptions),
    [cityOptions],
  );
  const areaModalVariants = useMemo<ERPDynamicModalVariant[]>(
    () => [
      {
        key: "area-create",
        cardTitle: "Create Area",
        cardDescription: "Create a new area.",
        cardButtonLabel: "Create",
        modalTitle: "New Area",
        modalDescription: "Create area from customer form.",
        submitLabel: areaSaveLoading ? "Saving..." : "Save",
        accent: "blue",
        fields: areaModalFields,
      },
      {
        key: "area-update",
        cardTitle: "Update Area",
        cardDescription: "Update existing area.",
        cardButtonLabel: "Update",
        modalTitle: "Edit Area",
        modalDescription: "Update area from customer form.",
        submitLabel: areaSaveLoading ? "Updating..." : "Update",
        accent: "emerald",
        fields: areaModalFields,
      },
    ],
    [areaModalFields, areaSaveLoading],
  );
  const refreshAreaOptions = useCallback(async () => {
    const payload = await getAreaLookup(AREA_LOOKUP_REQUEST_QUERY);
    setAreaOptions(buildAreaOptions(payload));
  }, [getAreaLookup]);
  const resolveAreaOptionFromShortcut = useCallback(
    (payload: ERPDynamicSearchShortcutPayload): ERPDynamicSelectOption | null => {
      const selectedValue = payload.value.trim();
      if (selectedValue) {
        const selectedOption = areaOptions.find((option) => option.value === selectedValue);
        if (selectedOption) {
          return selectedOption;
        }
      }
      const normalizedQuery = payload.query.trim().toLowerCase();
      if (!normalizedQuery) {
        return null;
      }
      const exactMatch = areaOptions.find((option) => {
        const label = option.label.trim().toLowerCase();
        const value = option.value.trim().toLowerCase();
        return label === normalizedQuery || value === normalizedQuery;
      });
      if (exactMatch) {
        return exactMatch;
      }
      const startsWithMatch = areaOptions.find((option) =>
        option.label.trim().toLowerCase().startsWith(normalizedQuery),
      );
      if (startsWithMatch) {
        return startsWithMatch;
      }
      return (
        areaOptions.find((option) =>
          option.label.trim().toLowerCase().includes(normalizedQuery),
        ) ?? null
      );
    },
    [areaOptions],
  );
  const handleAreaCreateShortcut = useCallback(
    (payload: ERPDynamicSearchShortcutPayload) => {
      resetAreaSaveState();
      resetAreaDetailsState();
      setEditingAreaId(null);
      areaModalControllerRef.current?.openModal("area-create", {
        values: {
          ...AREA_MODAL_INITIAL_VALUES,
          armName: payload.query.trim(),
        },
      });
    },
    [resetAreaDetailsState, resetAreaSaveState],
  );
  const handleAreaEditShortcut = useCallback(
    async (payload: ERPDynamicSearchShortcutPayload) => {
      const matchedOption = resolveAreaOptionFromShortcut(payload);
      if (!matchedOption) {
        toast.info("Type/select an existing area, then press Alt+A.");
        return;
      }
      const matchedAreaId = matchedOption.value.trim();
      if (!matchedAreaId) {
        toast.info("Select an existing area to edit.");
        return;
      }
      resetAreaSaveState();
      resetAreaDetailsState();
      setEditingAreaId(matchedAreaId);
      try {
        const detailPayload = await getAreaById({
          armId: matchedAreaId,
        });
        const detailSource = extractAreaDetailSource(detailPayload);
        areaModalControllerRef.current?.openModal("area-update", {
          values: detailSource
            ? mapAreaDetailToFormValues(detailSource)
            : {
                ...AREA_MODAL_INITIAL_VALUES,
                armName: matchedOption.label,
              },
        });
      } catch {
        // Error UI is handled by useApi.
      }
    },
    [
      getAreaById,
      resetAreaDetailsState,
      resetAreaSaveState,
      resolveAreaOptionFromShortcut,
    ],
  );
  const handleAreaModalSubmit = useCallback(
    async ({ variantKey, values }: ERPDynamicModalSubmitPayload) => {
      const isUpdate = variantKey === "area-update";
      const armName = (values.armName ?? "").trim();
      const armAlias = (values.armAlias ?? "").trim();
      const armShort = (values.armShort ?? "").trim();
      const armCityId = (values.armCityId ?? "").trim();
      const armSort = toNonNegativeInteger(values.armSort ?? "0", 0);
      const armDistanceKm = toNullableInteger(values.armDistanceKm ?? "");
      const armCollectionDays = parseCollectionDays(values.armCollectionDays ?? "");
      const armIsActive = (values.armIsActive ?? "true") === "true";
      const payload: Record<string, unknown> = {
        armName,
        armAlias: toNullableString(armAlias),
        armShort: toNullableString(armShort),
        armCityId,
        armSort,
        armDistanceKm,
        armCollectionDays,
        armIsActive,
      };
      if (isUpdate) {
        if (!editingAreaId) {
          return;
        }
        payload.armId = editingAreaId;
      }
      await upsertArea({ body: payload });
      setEditingAreaId(null);
      await refreshAreaOptions();
    },
    [editingAreaId, refreshAreaOptions, upsertArea],
  );
  const handleAreaModalCancel = useCallback(() => {
    if (areaSaveLoading || areaDetailsLoading) {
      return;
    }
    resetAreaSaveState();
    resetAreaDetailsState();
    setEditingAreaId(null);
  }, [areaDetailsLoading, areaSaveLoading, resetAreaDetailsState, resetAreaSaveState]);
  const groupModalFields = useMemo(() => buildGroupModalFields(), []);
  const groupModalVariants = useMemo<ERPDynamicModalVariant[]>(
    () => [
      {
        key: "group-create",
        cardTitle: "Create Customer Group",
        cardDescription: "Create a new customer group.",
        cardButtonLabel: "Create",
        modalTitle: "New Customer Group",
        modalDescription: "Create customer group from customer form.",
        submitLabel: groupSaveLoading ? "Saving..." : "Save",
        accent: "blue",
        fields: groupModalFields,
      },
      {
        key: "group-update",
        cardTitle: "Update Customer Group",
        cardDescription: "Update existing customer group.",
        cardButtonLabel: "Update",
        modalTitle: "Edit Customer Group",
        modalDescription: "Update customer group from customer form.",
        submitLabel: groupSaveLoading ? "Updating..." : "Update",
        accent: "emerald",
        fields: groupModalFields,
      },
    ],
    [groupModalFields, groupSaveLoading],
  );
  const refreshGroupOptions = useCallback(async () => {
    const payload = await getCustomerGroupLookup(CUSTOMER_GROUP_LOOKUP_QUERY);
    setGroupOptions(buildGroupOptions(payload));
  }, [getCustomerGroupLookup]);
  const resolveGroupOptionFromShortcut = useCallback(
    (payload: ERPDynamicSearchShortcutPayload): ERPDynamicSelectOption | null => {
      const selectedValue = payload.value.trim();
      if (selectedValue) {
        const selectedOption = groupOptions.find((option) => option.value === selectedValue);
        if (selectedOption) {
          return selectedOption;
        }
      }
      const normalizedQuery = payload.query.trim().toLowerCase();
      if (!normalizedQuery) {
        return null;
      }
      const exactMatch = groupOptions.find((option) => {
        const label = option.label.trim().toLowerCase();
        const value = option.value.trim().toLowerCase();
        return label === normalizedQuery || value === normalizedQuery;
      });
      if (exactMatch) {
        return exactMatch;
      }
      const startsWithMatch = groupOptions.find((option) =>
        option.label.trim().toLowerCase().startsWith(normalizedQuery),
      );
      if (startsWithMatch) {
        return startsWithMatch;
      }
      return (
        groupOptions.find((option) =>
          option.label.trim().toLowerCase().includes(normalizedQuery),
        ) ?? null
      );
    },
    [groupOptions],
  );
  const handleGroupCreateShortcut = useCallback(
    (payload: ERPDynamicSearchShortcutPayload) => {
      resetGroupSaveState();
      resetGroupDetailsState();
      setEditingGroupId(null);
      groupModalControllerRef.current?.openModal("group-create", {
        values: {
          ...GROUP_MODAL_INITIAL_VALUES,
          cgrName: payload.query.trim(),
        },
      });
    },
    [resetGroupDetailsState, resetGroupSaveState],
  );
  const handleGroupEditShortcut = useCallback(
    async (payload: ERPDynamicSearchShortcutPayload) => {
      const matchedOption = resolveGroupOptionFromShortcut(payload);
      if (!matchedOption) {
        toast.info("Type/select an existing customer group, then press Alt+A.");
        return;
      }
      const matchedGroupId = matchedOption.value.trim();
      if (!matchedGroupId) {
        toast.info("Select an existing customer group to edit.");
        return;
      }
      resetGroupSaveState();
      resetGroupDetailsState();
      setEditingGroupId(matchedGroupId);
      try {
        const detailPayload = await getCustomerGroupById({
          cgrId: matchedGroupId,
        });
        const detailSource = extractGroupDetailSource(detailPayload);
        groupModalControllerRef.current?.openModal("group-update", {
          values: detailSource
            ? mapGroupDetailToFormValues(detailSource)
            : {
                ...GROUP_MODAL_INITIAL_VALUES,
                cgrName: matchedOption.label,
              },
        });
      } catch {
        // Error UI is handled by useApi.
      }
    },
    [
      getCustomerGroupById,
      resetGroupDetailsState,
      resetGroupSaveState,
      resolveGroupOptionFromShortcut,
    ],
  );
  const handleGroupModalSubmit = useCallback(
    async ({ variantKey, values }: ERPDynamicModalSubmitPayload) => {
      const isUpdate = variantKey === "group-update";
      const payload: Record<string, unknown> = {
        cgrName: (values.cgrName ?? "").trim(),
        cgrAlias: toNullableString(values.cgrAlias ?? ""),
        cgrShort: toNullableString(values.cgrShort ?? ""),
        cgrNarration: toNullableString(values.cgrNarration ?? ""),
        cgrOrder: toNonNegativeNumber(values.cgrOrder ?? "0", 0),
        cgrDiscPerc: toNonNegativeNumber(values.cgrDiscPerc ?? "0", 0),
        cgrCollectionDays: parseGroupCollectionDays(values.cgrCollectionDays ?? ""),
        cgrDebitAllowed: (values.cgrDebitAllowed ?? "false") === "true",
        cgrDebitDays: toNonNegativeInteger(values.cgrDebitDays ?? "0", 0),
        cgrDebitLimit: toNonNegativeNumber(values.cgrDebitLimit ?? "0", 0),
        cgrBillsLimit: toNonNegativeInteger(values.cgrBillsLimit ?? "0", 0),
        cgrOverdueBilling: (values.cgrOverdueBilling ?? "false") === "true",
        cgrIsActive: (values.cgrIsActive ?? "true") === "true",
      };
      if (isUpdate) {
        if (!editingGroupId) {
          return;
        }
        payload.cgrId = editingGroupId;
      }
      await upsertCustomerGroup({ body: payload });
      setEditingGroupId(null);
      await refreshGroupOptions();
    },
    [editingGroupId, refreshGroupOptions, upsertCustomerGroup],
  );
  const handleGroupModalCancel = useCallback(() => {
    if (groupSaveLoading || groupDetailsLoading) {
      return;
    }
    resetGroupSaveState();
    resetGroupDetailsState();
    setEditingGroupId(null);
  }, [groupDetailsLoading, groupSaveLoading, resetGroupDetailsState, resetGroupSaveState]);
  const handleCustomerGstinValueChange =
    useCallback<ERPDynamicFieldValueChangeHandler>(
      async ({ value }) => {
        const normalizedGstin = value.trim().toUpperCase();
        const normalizedValuePatch =
          normalizedGstin && normalizedGstin !== value
            ? { cusGstNo: normalizedGstin }
            : undefined;

        if (!GST_LOOKUP_PATTERN.test(normalizedGstin)) {
          return {
            ...(normalizedValuePatch ? { values: normalizedValuePatch } : {}),
            errors: { cusGstNo: null },
          };
        }

        const cachedValues = gstLookupCacheRef.current[normalizedGstin];
        if (cachedValues) {
          return {
            values: cachedValues,
            errors: { cusGstNo: null },
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
                cusGstNo: getLookupErrorMessage(
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
                cusGstNo: "GST details were not available for this GSTIN.",
              },
            };
          }

          const resolvedValues = buildCustomerLookupValues(
            normalizedGstin,
            lookupSource,
          );
          gstLookupCacheRef.current[normalizedGstin] = resolvedValues;
          return {
            values: resolvedValues,
            errors: { cusGstNo: null },
          };
        } catch {
          return {
            ...(normalizedValuePatch ? { values: normalizedValuePatch } : {}),
            errors: {
              cusGstNo:
                "Unable to load GST details right now. Please try again.",
            },
          };
        }
      },
      [],
    );
  const customerFormFields = useMemo(
    () =>
      buildCustomerFormFields(
        stateOptions,
        regionStateOptions,
        areaOptions,
        groupOptions,
        companyOptions,
        branchOptions,
        priceLevelOptions,
        handleStateCreateShortcut,
        handleStateEditShortcut,
        handleAreaCreateShortcut,
        handleAreaEditShortcut,
        handleCustomerGroupSearchChange,
        handleGroupCreateShortcut,
        handleGroupEditShortcut,
        handleCustomerGstinValueChange,
      ),
    [
      areaOptions,
      branchOptions,
      companyOptions,
      groupOptions,
      handleAreaCreateShortcut,
      handleAreaEditShortcut,
      handleCustomerGroupSearchChange,
      handleCustomerGstinValueChange,
      handleGroupCreateShortcut,
      handleGroupEditShortcut,
      handleStateCreateShortcut,
      handleStateEditShortcut,
      priceLevelOptions,
      regionStateOptions,
      stateOptions,
    ],
  );
  return (
    <>
      <CrudMasterPage
        title="Customer"
        auditHistory={{ screenName: "Customer Master" }}
        entityLabel="customer"
        entityLabelPlural="customers"
        apiEndpoints={API_ENDPOINTS}
        gridTableName={GRID_TABLE_NAME}
        useResponseTableColumns
        lookupKeys={LOOKUP_KEYS}
        requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
        styles={styles}
        listTitle="Customer List"
        createLabel="Add Customer"
        codeColumnHeader="Customer Code"
        nameColumnHeader="Customer Name"
        formTitle="Customer Form"
        formDescription="Create and update customers."
        customFields={customerFormFields}
        createInitialValues={CUSTOMER_INITIAL_FORM_VALUES}
        modalPanelStyle={CUSTOMER_MODAL_PANEL_STYLE}
        modalFormGridColumns={3}
        modalFormDenseGrid={false}
        modalStackLabels
        modalSectionNavigationMode="tabs"
        modalHideFieldHelperText
        modalHideFieldErrorText
        modalFocusFirstInvalidFieldOnValidationError
        modalEnableArrowKeyFieldNavigation
        mapFormValues={({ source, defaults }) => {
          const rowSource = source ?? {};
          const mappedValues: Record<string, string> = {
            ...CUSTOMER_INITIAL_FORM_VALUES,
          };
          for (const fieldName of CUSTOMER_TEXT_FIELD_NAMES) {
            const value = toDisplayValue(getFieldValue(rowSource, fieldName));
            mappedValues[fieldName] = value || CUSTOMER_INITIAL_FORM_VALUES[fieldName];
          }
          for (const fieldName of CUSTOMER_BOOLEAN_FIELD_NAMES) {
            const fallback =
              CUSTOMER_INITIAL_FORM_VALUES[fieldName] === "true" ? "true" : "false";
            mappedValues[fieldName] = toSelectBoolean(
              getFieldValue(rowSource, fieldName),
              fallback,
            );
          }
          for (const fieldName of CUSTOMER_DATE_FIELD_NAMES) {
            mappedValues[fieldName] = toDateInputValue(getFieldValue(rowSource, fieldName));
          }
          const stateCode = toUpper(
            toDisplayValue(getFieldValue(rowSource, "cusStateCode")),
          );
          const stateName = toDisplayValue(getFieldValue(rowSource, "cusStateName"));
          mappedValues.cusStateCode =
            stateCode || stateCodeByName[stateName] || CUSTOMER_INITIAL_FORM_VALUES.cusStateCode;
          mappedValues.cusCollectionDays = toCollectionDaysInput(
            getFieldValue(rowSource, "cusCollectionDays"),
          );
          mappedValues.cusGstType =
            toGstTypeValue(toDisplayValue(getFieldValue(rowSource, "cusGstType"))) ||
            CUSTOMER_INITIAL_FORM_VALUES.cusGstType;
          mappedValues.cusName =
            toDisplayValue(getFieldValue(rowSource, "cusName")) ||
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) ||
            defaults.masterName ||
            CUSTOMER_INITIAL_FORM_VALUES.cusName;
          mappedValues.cusCode =
            toDisplayValue(getFieldValue(rowSource, "cusCode")) ||
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.code)) ||
            defaults.searchCode ||
            CUSTOMER_INITIAL_FORM_VALUES.cusCode;
          mappedValues.cusShort =
            toDisplayValue(getFieldValue(rowSource, "cusShort")) ||
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) ||
            defaults.masterShortName ||
            CUSTOMER_INITIAL_FORM_VALUES.cusShort;
          mappedValues.cusSortOrder =
            toDisplayValue(getFieldValue(rowSource, "cusSortOrder")) ||
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) ||
            defaults.position ||
            CUSTOMER_INITIAL_FORM_VALUES.cusSortOrder;
          mappedValues.cusCompanyId =
            toDisplayValue(getFieldValue(rowSource, "cusCompanyId")) ||
            ALL_COMPANY_OPTION_VALUE;
          mappedValues.cusBranchId =
            toDisplayValue(getFieldValue(rowSource, "cusBranchId")) ||
            ALL_BRANCH_OPTION_VALUE;
          mappedValues.cusNotes =
            toDisplayValue(getFieldValue(rowSource, "cusNotes")) ||
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
            defaults.masterDescription ||
            CUSTOMER_INITIAL_FORM_VALUES.cusNotes;
          return mappedValues;
        }}
        buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
          const cusStateCode = toUpper(values.cusStateCode ?? "");
          const cusStateName = stateNameByCode[cusStateCode] ?? "";
          const cusGstType = toGstTypeValue(values.cusGstType ?? "");
          const cusCreditBillLimit = toNonNegativeInteger(values.cusCreditBillLimit ?? "0", 0);
          const cusCreditAmtLimit = toNonNegativeNumber(values.cusCreditAmtLimit ?? "0", 0);
          const cusCreditDays = toNonNegativeInteger(values.cusCreditDays ?? "0", 0);
          const cusDebitBalance = toNonNegativeNumber(values.cusDebitBalance ?? "0", 0);
          const cusDiscPerc = toNonNegativeNumber(values.cusDiscPerc ?? "0", 0);
          const cusDebitGraceDays = toNonNegativeInteger(values.cusDebitGraceDays ?? "0", 0);
          const cusCreditAllowed =
            cusCreditBillLimit > 0 || cusCreditAmtLimit > 0 || cusCreditDays > 0;
          const payload: Record<string, unknown> = {
            cusTitle: toNullableString(values.cusTitle ?? ""),
            cusShort: toNullableString(values.cusShort ?? ""),
            cusCode: toNullableString(values.cusCode ?? ""),
            cusName: toNullableString(values.cusName ?? ""),
            cusAddr1: toNullableString(values.cusAddr1 ?? ""),
            cusAddr2: toNullableString(values.cusAddr2 ?? ""),
            cusAddr3: toNullableString(values.cusAddr3 ?? ""),
            cusCity: toNullableString(values.cusCity ?? ""),
            cusDistrict: toNullableString(values.cusDistrict ?? ""),
            cusStateName,
            cusCountry: toNullableString(values.cusCountry ?? ""),
            cusStateCode,
            cusLandmark: toNullableString(values.cusLandmark ?? ""),
            cusPin: toNullableString(values.cusPin ?? ""),
            cusTel: toNullableString(values.cusTel ?? ""),
            cusPhone1: toNullableString(values.cusPhone1 ?? ""),
            cusPhone2: toNullableString(values.cusPhone2 ?? ""),
            cusWhatsappNo: toNullableString(values.cusWhatsappNo ?? ""),
            cusEmail: toNullableString(values.cusEmail ?? ""),
            cusAadharNo: toNullableString(values.cusAadharNo ?? ""),
            cusContactPerson: toNullableString(values.cusContactPerson ?? ""),
            cusDistanceKm: toNullableInteger(values.cusDistanceKm ?? ""),
            cusCreditAllowed,
            cusCreditBillLimit,
            cusCreditAmtLimit,
            cusCreditDays,
            cusDebitBalance,
            cusDiscPerc,
            cusDebitGraceDays,
            cusEnableSms: (values.cusEnableSms ?? "false") === "true",
            cusOverdueSms: (values.cusOverdueSms ?? "false") === "true",
            cusOverdueBilling: (values.cusOverdueBilling ?? "false") === "true",
            cusAllowPromotion: (values.cusAllowPromotion ?? "false") === "true",
            cusAllowLoyalty: (values.cusAllowLoyalty ?? "false") === "true",
            cusAllowDiscount: (values.cusAllowDiscount ?? "true") === "true",
            cusSortOrder: toNonNegativeInteger(values.cusSortOrder ?? "0", 0),
            cusRegionName: toNullableString(values.cusRegionName ?? ""),
            cusRegionAddr1: toNullableString(values.cusRegionAddr1 ?? ""),
            cusRegionAddr2: toNullableString(values.cusRegionAddr2 ?? ""),
            cusRegionAddr3: toNullableString(values.cusRegionAddr3 ?? ""),
            cusRegionCity: toNullableString(values.cusRegionCity ?? ""),
            cusRegionDistrict: toNullableString(values.cusRegionDistrict ?? ""),
            cusRegionStateName: toNullableString(values.cusRegionStateName ?? ""),
            cusRegionCountry: toNullableString(values.cusRegionCountry ?? ""),
            cusBirthDate: toNullableDate(values.cusBirthDate ?? ""),
            cusMarriageDate: toNullableDate(values.cusMarriageDate ?? ""),
            cusTransportName: toNullableString(values.cusTransportName ?? ""),
            cusFreightCharge: (values.cusFreightCharge ?? "false") === "true",
            cusLoadingCharge: (values.cusLoadingCharge ?? "false") === "true",
            cusUnloadingCharge: (values.cusUnloadingCharge ?? "false") === "true",
            cusGstNo: toUpperNullable(values.cusGstNo ?? ""),
            cusPanNo: toUpperNullable(values.cusPanNo ?? ""),
            cusGstType: toNullableString(cusGstType),
            cusEcommerceGstin: toUpperNullable(values.cusEcommerceGstin ?? ""),
            cusTcsApplicable: (values.cusTcsApplicable ?? "false") === "true",
            cusItcollExempted: (values.cusItcollExempted ?? "false") === "true",
            cusItcollType: toNullableString(values.cusItcollType ?? ""),
            cusGeoLocation: toNullableString(values.cusGeoLocation ?? ""),
            cusCollectionDays: parseCollectionDays(values.cusCollectionDays ?? ""),
            cusDefaultSalesman: toNullableString(values.cusDefaultSalesman ?? ""),
            cusPriceLevelId: toNonNegativeInteger(values.cusPriceLevelId ?? "0", 0),
            cusBilledDate: toNullableDate(values.cusBilledDate ?? ""),
            cusBilledCount: toNonNegativeInteger(values.cusBilledCount ?? "0", 0),
            cusNotes: toNullableString(values.cusNotes ?? ""),
            cusCompanyId: toNullableScopeId(
              values.cusCompanyId ?? "",
              ALL_COMPANY_OPTION_VALUE,
            ),
            cusBranchId: toNullableScopeId(
              values.cusBranchId ?? "",
              ALL_BRANCH_OPTION_VALUE,
            ),
            cusAreaId: (values.cusAreaId ?? "").trim(),
            cusGroupId: (values.cusGroupId ?? "").trim(),
            cusIsActive: (values.cusIsActive ?? "true") === "true",
          };
          if (shouldUpdate && editingItemId !== null) {
            payload.cusId = toUpdateId(editingItemId);
          }
          return payload;
        }}
      />
      <InlineRelatedMasterModal
        title="State Form"
        description="Create and update states."
        variants={stateModalVariants}
        submitError={stateSaveError || stateDetailsError}
        panelStyle={STATE_MODAL_PANEL_STYLE}
        controllerRef={stateModalControllerRef}
        onSubmit={handleStateModalSubmit}
        onCancel={handleStateModalCancel}
      />
      <InlineRelatedMasterModal
        title="Area Form"
        description="Create and update areas."
        variants={areaModalVariants}
        submitError={areaSaveError || areaDetailsError}
        panelStyle={AREA_MODAL_PANEL_STYLE}
        controllerRef={areaModalControllerRef}
        onSubmit={handleAreaModalSubmit}
        onCancel={handleAreaModalCancel}
      />
      <InlineRelatedMasterModal
        title="Customer Group Form"
        description="Create and update customer groups."
        variants={groupModalVariants}
        submitError={groupSaveError || groupDetailsError}
        panelStyle={GROUP_MODAL_PANEL_STYLE}
        controllerRef={groupModalControllerRef}
        onSubmit={handleGroupModalSubmit}
        onCancel={handleGroupModalCancel}
      />
    </>
  );
}
