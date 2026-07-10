"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FiTruck } from "react-icons/fi";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import InlineRelatedMasterModal from "@/features/masters/shared/inline-related-master";
import { toast } from "react-toastify";
import type {
  ERPDynamicFieldValueChangeHandler,
  ERPDynamicFieldValueChangePayload,
  ERPDynamicModalController,
  ERPDynamicModalSubmitPayload,
  ERPDynamicModalVariant,
  ERPDynamicModalField,
  ERPDynamicSearchQueryChangeHandler,
  ERPDynamicSearchShortcutPayload,
  ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import { ERPDynamicModalForm } from "@/components/design-system/ui/dynamic-modal-form";
import WidgetVisibilityTree, {
  type WidgetTreeSectionView,
} from "@/features/masters/shared/widget-visibility-tree";
import {
  applyWidgetFieldConfig,
  buildControllableFieldNames,
  buildWidgetFieldConfig,
  type ResolvedFieldConfig,
  type WidgetMasterSectionConfig,
  type WidgetMastersResponse,
} from "@/features/masters/shared/widget-config";
import styles from "@/app/master/state-master/page.module.scss";
import {
  buildLookupOptions,
  DEFAULT_LOOKUP_ARRAY_KEYS,
  extractRows,
} from "@/features/masters/shared/normalizers";
import {
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
} from "@/features/masters/shared/value-mappers";
import { COLLECTION_DAY_OPTIONS } from "@/utils/constant";
import { validateGstin, validateOptionalGstin } from "@/utils/validation";
import {
  API_ENDPOINTS,
  GRID_TABLE_NAME,
  STATE_GET_ENDPOINT,
  STATE_UPSERT_ENDPOINT,
  AREA_GET_ENDPOINT,
  AREA_UPSERT_ENDPOINT,
  CUSTOMER_GROUP_GET_ENDPOINT,
  CUSTOMER_GROUP_UPSERT_ENDPOINT,
  PRICE_LEVEL_LOOKUP_ENDPOINT,
  CITY_LOOKUP_ENDPOINT,
  CITY_LOOKUP_REQUEST_QUERY,
  PRICE_LEVEL_LOOKUP_REQUEST_QUERY,
  GST_LOOKUP_ENDPOINT,
  GST_LOOKUP_PATTERN,
  GST_LOOKUP_HELPER_TEXT,
  LOOKUP_KEYS,
  REQUEST_PAYLOAD_KEYS,
  CITY_LOOKUP_KEYS,
  STATE_DETAIL_ARRAY_KEYS,
  STATE_DETAIL_KEYS,
  AREA_DETAIL_ARRAY_KEYS,
  AREA_DETAIL_KEYS,
  GROUP_DETAIL_ARRAY_KEYS,
  GROUP_DETAIL_KEYS,
  DEFAULT_CITY_OPTION,
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
  GST_ADDRESS_PIN_KEYS,
  CUSTOMER_BOOLEAN_FIELD_NAMES,
  CUSTOMER_DATE_FIELD_NAMES,
  CUSTOMER_TEXT_FIELD_NAMES,
  CUSTOMER_INITIAL_FORM_VALUES,
  AREA_MODAL_INITIAL_VALUES,
  STATE_MODAL_INITIAL_VALUES,
  GROUP_MODAL_INITIAL_VALUES,
  CUSTOMER_MODAL_PANEL_STYLE,
  CUSTOMER_BASIC_VALIDATIONS,
  CUSTOMER_TEMPLATE_CONFIG_ENDPOINT,
  CUSTOMER_TEMPLATE_CONFIG_ID,
} from "./customer-master.constants";
import {
  DROPDOWN_RUN_ENDPOINT,
  DROPDOWN_SEARCH_DEBOUNCE_MS,
  CUSTOMER_DROPDOWN_CONFIG,
  type CustomerDropdownKind,
  type CustomerTemplateDefault,
  type CustomerTemplateDefaults,
  buildDropdownRunQuery,
  buildDropdownOptions,
  buildStateDropdownData,
  withPinnedOption,
  parseCustomerTemplateConfig,
  EMPTY_CUSTOMER_TEMPLATE_DEFAULTS,
} from "./customer-dropdowns";
// The customer form fields below are re-labelled, re-ordered, and shown/hidden
// from the backend widget-masters config (fixed.form_section / form_field) for
// this screen's menu id (10). Only those three properties come from the API —
// validation, state shape, and submit logic stay defined locally.
const WIDGET_CONFIG_ENDPOINT = "/widget-masters/get";
const WIDGET_SECTION_MENU_ID = 10;
// Matches the section_platform stored for this menu (case-sensitive equality on
// the server), so the config actually resolves rather than silently no-opping.
const WIDGET_SECTION_PLATFORM = "Web";
// Bridge each hardcoded form field `name` (camelCase aliases used by form state
// and the submit payload) to the backend `fieldName` it is configured under
// (comp_*/cus_* column-style keys, matched case-insensitively). Form fields with
// no mapping — or no matching response entry — keep their hardcoded label and
// render after all configured fields.
const WIDGET_FIELD_NAME_BY_FORM_FIELD: Record<string, string> = {
  cusCompanyId: "comp_name",
  cusAreaId: "comp_area",
  cusDefaultSalesman: "comp_salesman",
  cusBranchId: "comp_branch",
  cusGroupId: "comp_cus_group",
  cusCollectionDays: "comp_collection_days",
  cusName: "cus_name",
  cusCity: "cus_city",
  cusPhone1: "cus_phone",
  cusPhone2: "cus_phone2",
  cusCode: "cus_code",
  cusDistrict: "cus_district",
  cusShort: "cus_short",
  cusStateCode: "cus_state",
  cusPin: "cus_pin",
  cusWhatsappNo: "cus_whatsapp",
  cusAddr1: "cus_address1",
  cusLandmark: "cus_landmark",
  cusTel: "cus_tel",
  cusEmail: "cus_email",
  cusAddr2: "cus_address",
  cusTransportName: "cus_transport",
  cusSortOrder: "cus_sort",
  cusAddr3: "cus_address3",
  cusPriceLevelId: "cus_price_level",
  cusCreditDays: "cus_credit_days",
  cusCreditAmtLimit: "cus_credit_amount_limit",
  cusDebitBalance: "cus_debit_balance",
  cusCreditBillLimit: "cus_credit_bill_limit",
  cusDebitGraceDays: "cus_debit_grace_days",
  cusGstType: "cus_gst_type",
  cusPanNo: "cus_pan_no",
  cusEcommerceGstin: "cus_ecommerce_gstin",
  cusGstNo: "cus_gst_no",
  cusAadharNo: "cus_aadhar_no",
  cusDistanceKm: "cus_distance",
  cusRegionName: "cus_region_name",
  cusRegionAddr1: "cus_region_addr1",
  cusRegionAddr2: "cus_region_addr2",
  cusRegionAddr3: "cus_region_addr3",
  cusRegionCity: "cus_region_city",
  cusRegionDistrict: "cus_region_district",
  cusRegionStateName: "cus_region_state",
  cusRegionCountry: "cus_region_country",
  cusDiscPerc: "cus_discount",
  // "cus_birt_date" matches the (misspelled) seeded field_name in fixed.form_field.
  cusBirthDate: "cus_birt_date",
  cusMarriageDate: "cus_anniversary_date",
  cusEnableSms: "cus_enable_sms",
  cusOverdueSms: "cus_overdue_sms",
  cusOverdueBilling: "cus_overdue_billing",
  cusAllowPromotion: "cus_allow_promotion",
  cusAllowLoyalty: "cus_allow_loyalty",
  cusAllowDiscount: "cus_allow_discount",
  cusTcsApplicable: "cus_tcs_allowable",
  cusItcollExempted: "cus_it_collection_exempted",
  cusFreightCharge: "cus_freight_charge",
  cusLoadingCharge: "cus_loading_charge",
  cusUnloadingCharge: "cus_unloading_charge",
  cusIsActive: "cus_active",
  cusNotes: "cus_notes",
};
// Right-clicking inside the open create/update modal opens a tree popup of this
// menu's configured sections/fields (GET /widget-masters/config?menu_id=…).
// Ticking a field toggles its live visibility in the form via the same config map.
const WIDGET_CONFIG_TREE_ENDPOINT = "/widget-masters/config";
// Persists the tree's section/field visibility back to the server (PATCH).
const WIDGET_VISIBILITY_ENDPOINT = "/widget-masters/visibility";
// Backend fieldNames (lowercased) that map to a real form field, so their popup
// checkbox can actually show/hide something. Others render read-only ("not on form").
const WIDGET_CONTROLLABLE_FIELD_NAMES = buildControllableFieldNames(WIDGET_FIELD_NAME_BY_FORM_FIELD);
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
type LazyDropdownFieldHandlers = {
  onSearchOpenChange: (open: boolean) => void;
  onSearchQueryChange: ERPDynamicSearchQueryChangeHandler;
  onValueChange: ERPDynamicFieldValueChangeHandler;
};
type CustomerLazyDropdownHandlers = Record<
  | "cusCompanyId"
  | "cusBranchId"
  | "cusAreaId"
  | "cusGroupId"
  | "cusStateCode"
  | "cusRegionStateName",
  LazyDropdownFieldHandlers
>;
function buildCustomerFormFields(
  stateOptions: ERPDynamicSelectOption[],
  regionStateOptions: ERPDynamicSelectOption[],
  areaOptions: ERPDynamicSelectOption[],
  groupOptions: ERPDynamicSelectOption[],
  companyOptions: ERPDynamicSelectOption[],
  branchOptions: ERPDynamicSelectOption[],
  priceLevelOptions: ERPDynamicSelectOption[],
  lazy: CustomerLazyDropdownHandlers,
  onStateCreateShortcut: (payload: ERPDynamicSearchShortcutPayload) => void | Promise<void>,
  onStateEditShortcut: (payload: ERPDynamicSearchShortcutPayload) => void | Promise<void>,
  onAreaCreateShortcut: (payload: ERPDynamicSearchShortcutPayload) => void | Promise<void>,
  onAreaEditShortcut: (payload: ERPDynamicSearchShortcutPayload) => void | Promise<void>,
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
      serverSearch: true,
      options: companyOptions,
      onSearchOpenChange: lazy.cusCompanyId.onSearchOpenChange,
      onSearchQueryChange: lazy.cusCompanyId.onSearchQueryChange,
      onValueChange: lazy.cusCompanyId.onValueChange,
    },
    {
      name: "cusAreaId",
      label: "Area",
      type: "select",
      searchable: true,
      serverSearch: true,
      required: true,
      options: areaOptions,
      onSearchOpenChange: lazy.cusAreaId.onSearchOpenChange,
      onSearchQueryChange: lazy.cusAreaId.onSearchQueryChange,
      onValueChange: lazy.cusAreaId.onValueChange,
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
      serverSearch: true,
      options: branchOptions,
      onSearchOpenChange: lazy.cusBranchId.onSearchOpenChange,
      onSearchQueryChange: lazy.cusBranchId.onSearchQueryChange,
      onValueChange: lazy.cusBranchId.onValueChange,
    },{
      name: "cusGroupId",
      label: "Customer Group",
      type: "select",
      searchable: true,
      serverSearch: true,
      required: true,
      options: groupOptions,
      onSearchOpenChange: lazy.cusGroupId.onSearchOpenChange,
      onSearchQueryChange: lazy.cusGroupId.onSearchQueryChange,
      onValueChange: lazy.cusGroupId.onValueChange,
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
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Customer Name must be at least 2 characters.",
      },
    },
    {
      name: "cusCity",
      label: "City",
    },
    {
      name: "cusPhone1",
      label: "Phone 1",
      type: "tel",
    },
    {
      name: "cusCode",
      label: "Customer Code",
    },

    {
      name: "cusDistrict",
      label: "District",
    },
    
    {
      name: "cusPhone2",
      label: "Phone 2",
      type: "tel",
    },
    {
      name: "cusShort",
      label: "Short Name",
    },
    {
      name: "cusStateCode",
      label: "State",
      type: "select",
      searchable: true,
      serverSearch: true,
      required: true,
      options: stateOptions,
      onSearchOpenChange: lazy.cusStateCode.onSearchOpenChange,
      onSearchQueryChange: lazy.cusStateCode.onSearchQueryChange,
      onValueChange: lazy.cusStateCode.onValueChange,
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
    },
    {
      name: "cusPriceLevelId",
      label: "Price Level",
      type: "select",
      searchable: true,
      required: true,
      options: priceLevelOptions,
      validation: {
        requiredMessage: "Price Level is required.",
      },
    },
    {
      name: "cusPin",
      label: "PIN",
    },
    {
      name: "cusWhatsappNo",
      label: "WhatsApp No",
      type: "tel",
    },
    {
      name: "cusAddr1",
      label: "Address Line 1",
    },
    {
      name: "cusLandmark",
      label: "Landmark",
    },
    {
      name: "cusEmail",
      label: "Email",
      type: "email",
    },
    {
      name: "cusAddr2",
      label: "Address Line 2",
    },
    {
      name: "cusTransportName",
      label: "Transport Name",
    },
    {
      name: "cusSortOrder",
      label: "Sort Order",
      type: "number",
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
    },
    {
      name: "cusPanNo",
      label: "PAN No",
      validation: {
        pattern: "^[A-Z]{5}[0-9]{4}[A-Z]{1}$",
        patternMessage: "PAN must be 10 characters (e.g., ABCDE1234F).",
      },
    },
    {
      name: "cusEcommerceGstin",
      label: "Ecommerce GSTIN",
      validation: {
        custom: (value) => validateOptionalGstin(value),
      },
    },
    {
      name: "cusGstNo",
      label: "GST No",
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
      validation: {
        pattern: "^[0-9]{12}$",
        patternMessage: "Aadhar must be 12 digits.",
      },
    },
    {
      name: "cusDistanceKm",
      label: "Distance (Km)",
      type: "number",
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
      serverSearch: true,
      options: regionStateOptions,
      onSearchOpenChange: lazy.cusRegionStateName.onSearchOpenChange,
      onSearchQueryChange: lazy.cusRegionStateName.onSearchQueryChange,
      onValueChange: lazy.cusRegionStateName.onValueChange,
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
    },
    {
      name: "cusMarriageDate",
      label: "Anniversary Date",
      type: "date",
    },
    {
      name: "cusEnableSms",
      label: "Enable SMS",
      type: "checkbox",
    },
    {
      name: "cusOverdueSms",
      label: "Overdue SMS",
      type: "checkbox",
    },
    {
      name: "cusOverdueBilling",
      label: "Overdue Billing",
      type: "checkbox",
    },
    {
      name: "cusAllowPromotion",
      label: "Allow Promotion",
      type: "checkbox",
    },
    {
      name: "cusAllowLoyalty",
      label: "Allow Loyalty",
      type: "checkbox",
    },
    {
      name: "cusAllowDiscount",
      label: "Allow Discount",
      type: "checkbox",
    },
    {
      name: "cusTcsApplicable",
      label: "TCS Allowable",
      type: "checkbox",
    },
    {
      name: "cusItcollExempted",
      label: "IT Collection Exempted",
      type: "checkbox",
    },
    {
      name: "cusFreightCharge",
      label: "Freight Charge",
      type: "checkbox",
    },
    {
      name: "cusLoadingCharge",
      label: "Loading Charge",
      type: "checkbox",
    },
    {
      name: "cusUnloadingCharge",
      label: "Unloading Charge",
      type: "checkbox",
    },
    {
      name: "cusIsActive",
      label: "Active",
      type: "checkbox",
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
  const router = useRouter();
  const stateModalControllerRef = useRef<ERPDynamicModalController | null>(null);
  const areaModalControllerRef = useRef<ERPDynamicModalController | null>(null);
  const groupModalControllerRef = useRef<ERPDynamicModalController | null>(null);
  // Lazy configured-dropdown runners (fixed.dropdown_details via /dropdown-details/run).
  // One hook per kind so each fetch has an independent abort/loading lifecycle. Errors
  // are not toasted — a failed dropdown fetch should not interrupt the form. Nothing is
  // fetched up front; options load when a field opens and on debounced server-side search.
  const { run: runCompanyDropdown } = useApi<unknown>(DROPDOWN_RUN_ENDPOINT, {
    toast: { error: false },
  });
  const { run: runBranchDropdown } = useApi<unknown>(DROPDOWN_RUN_ENDPOINT, {
    toast: { error: false },
  });
  const { run: runAreaDropdown } = useApi<unknown>(DROPDOWN_RUN_ENDPOINT, {
    toast: { error: false },
  });
  const { run: runGroupDropdown } = useApi<unknown>(DROPDOWN_RUN_ENDPOINT, {
    toast: { error: false },
  });
  const { run: runStateDropdown } = useApi<unknown>(DROPDOWN_RUN_ENDPOINT, {
    toast: { error: false },
  });
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
  const { getAll: getPriceLevelLookup } = useApi<unknown>(PRICE_LEVEL_LOOKUP_ENDPOINT);
  // Customer_template config: seeds the create form's Company/Area/Customer Group
  // defaults. A failed fetch just leaves those dropdowns blank, so don't toast errors.
  const { getAll: getCustomerTemplateConfig } = useApi<unknown>(
    CUSTOMER_TEMPLATE_CONFIG_ENDPOINT,
    { toast: { error: false } },
  );
  const [stateOptions, setStateOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [regionStateOptions, setRegionStateOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [areaOptions, setAreaOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [cityOptions, setCityOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [companyOptions, setCompanyOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [branchOptions, setBranchOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [priceLevelOptions, setPriceLevelOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [templateDefaults, setTemplateDefaults] = useState<CustomerTemplateDefaults>(
    EMPTY_CUSTOMER_TEMPLATE_DEFAULTS,
  );
  const [stateNameByCode, setStateNameByCode] = useState<Record<string, string>>({});
  const [stateCodeByName, setStateCodeByName] = useState<Record<string, string>>({});
  const [editingStateCode, setEditingStateCode] = useState<string | null>(null);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const gstLookupCacheRef = useRef<Record<string, Record<string, string>>>({});
  // Debounce handles per lazy field name (server-side search typing).
  const dropdownSearchTimeoutsRef = useRef<Record<string, number | null>>({});
  // Latest options shown for each lazy field, mirrored so the selection handler can
  // resolve a picked value's label without a stale closure.
  const dropdownOptionsRef = useRef<Record<string, ERPDynamicSelectOption[]>>({});
  // Currently-selected option pinned per field so it stays visible (keeping its label)
  // after a fetch replaces the option list with a fresh server page.
  const pinnedDropdownOptionRef = useRef<Record<string, ERPDynamicSelectOption | null>>({});
  // Only city + price level remain eagerly loaded; the company/branch/area/group/state
  // dropdowns are lazy (loaded on open + debounced search via /dropdown-details/run).
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const [cityPayload, priceLevelPayload] = await Promise.all([
          getCityLookup(CITY_LOOKUP_REQUEST_QUERY),
          getPriceLevelLookup(PRICE_LEVEL_LOOKUP_REQUEST_QUERY),
        ]);
        if (!mounted) {
          return;
        }
        setCityOptions(buildCityOptions(cityPayload));
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
        setCityOptions([]);
        setPriceLevelOptions([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getCityLookup, getPriceLevelLookup]);
  // Fetch the customer_template config once so the create form can default its
  // Company/Area/Customer Group dropdowns. A failed/malformed fetch keeps the empty
  // defaults, so the form still opens normally with blank dropdowns.
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const payload = await getCustomerTemplateConfig({
          configId: CUSTOMER_TEMPLATE_CONFIG_ID,
        });
        if (!mounted) {
          return;
        }
        setTemplateDefaults(parseCustomerTemplateConfig(payload));
      } catch {
        if (mounted) {
          setTemplateDefaults(EMPTY_CUSTOMER_TEMPLATE_DEFAULTS);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getCustomerTemplateConfig]);
  // Silent progressive enhancement: a failed config fetch leaves the form on its
  // hardcoded labels/order (empty map), so don't nag the user with an error toast.
  const { getAll: getWidgetConfig } = useApi<WidgetMastersResponse>(WIDGET_CONFIG_ENDPOINT, {
    toast: { error: false },
  });
  const [widgetFieldConfig, setWidgetFieldConfig] = useState<Map<string, ResolvedFieldConfig>>(
    () => new Map(),
  );
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const payload = await getWidgetConfig({
          sectionMenuId: String(WIDGET_SECTION_MENU_ID),
          sectionPlatform: WIDGET_SECTION_PLATFORM,
        });
        if (!mounted) {
          return;
        }
        setWidgetFieldConfig(buildWidgetFieldConfig(payload ?? null));
      } catch {
        if (mounted) {
          setWidgetFieldConfig(new Map());
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getWidgetConfig]);
  // Push freshly built options into both the matching state setter and the mirror ref.
  const applyDropdownOptions = useCallback(
    (fieldName: string, options: ERPDynamicSelectOption[]) => {
      dropdownOptionsRef.current[fieldName] = options;
      switch (fieldName) {
        case "cusCompanyId":
          setCompanyOptions(options);
          break;
        case "cusBranchId":
          setBranchOptions(options);
          break;
        case "cusAreaId":
          setAreaOptions(options);
          break;
        case "cusGroupId":
          setGroupOptions(options);
          break;
        case "cusStateCode":
          setStateOptions(options);
          break;
        case "cusRegionStateName":
          setRegionStateOptions(options);
          break;
      }
    },
    [],
  );
  // Lazily fetch a configured dropdown's first page (open) or search results (typing)
  // from /dropdown-details/run. A superseded/aborted request returns undefined and is
  // skipped so it never wipes the options the latest request set.
  const fetchDropdown = useCallback(
    async (kind: CustomerDropdownKind, search: string) => {
      const config = CUSTOMER_DROPDOWN_CONFIG[kind];
      const query = buildDropdownRunQuery(config.dropdownId, search);
      try {
        switch (kind) {
          case "company": {
            const payload = await runCompanyDropdown({ query });
            if (payload === undefined) return;
            const options = [
              ALL_COMPANY_OPTION,
              ...buildDropdownOptions(payload, config.idKeys, config.labelKeys, false),
            ];
            applyDropdownOptions(
              "cusCompanyId",
              withPinnedOption(options, pinnedDropdownOptionRef.current.cusCompanyId),
            );
            break;
          }
          case "branch": {
            const payload = await runBranchDropdown({ query });
            if (payload === undefined) return;
            const options = [
              ALL_BRANCH_OPTION,
              ...buildDropdownOptions(payload, config.idKeys, config.labelKeys, false),
            ];
            applyDropdownOptions(
              "cusBranchId",
              withPinnedOption(options, pinnedDropdownOptionRef.current.cusBranchId),
            );
            break;
          }
          case "area": {
            const payload = await runAreaDropdown({ query });
            if (payload === undefined) return;
            applyDropdownOptions(
              "cusAreaId",
              withPinnedOption(
                buildDropdownOptions(payload, config.idKeys, config.labelKeys),
                pinnedDropdownOptionRef.current.cusAreaId,
              ),
            );
            break;
          }
          case "group": {
            const payload = await runGroupDropdown({ query });
            if (payload === undefined) return;
            applyDropdownOptions(
              "cusGroupId",
              withPinnedOption(
                buildDropdownOptions(payload, config.idKeys, config.labelKeys),
                pinnedDropdownOptionRef.current.cusGroupId,
              ),
            );
            break;
          }
          case "state": {
            const payload = await runStateDropdown({ query });
            if (payload === undefined) return;
            const data = buildStateDropdownData(payload);
            applyDropdownOptions(
              "cusStateCode",
              withPinnedOption(data.options, pinnedDropdownOptionRef.current.cusStateCode),
            );
            applyDropdownOptions(
              "cusRegionStateName",
              withPinnedOption(
                data.regionStateOptions,
                pinnedDropdownOptionRef.current.cusRegionStateName,
              ),
            );
            // Merge so a previously seeded selected state's code mapping survives.
            setStateNameByCode((prev) => ({ ...prev, ...data.stateNameByCode }));
            setStateCodeByName((prev) => ({ ...prev, ...data.stateCodeByName }));
            break;
          }
        }
      } catch {
        // Keep whatever options are currently shown (e.g. the seeded selection).
      }
    },
    [
      applyDropdownOptions,
      runAreaDropdown,
      runBranchDropdown,
      runCompanyDropdown,
      runGroupDropdown,
      runStateDropdown,
    ],
  );
  // Per-field handlers wiring the form's searchable selects to the lazy fetch:
  // fetch on open (immediate), on debounced typing, and pin the chosen option.
  const lazyDropdownHandlers = useMemo(() => {
    const build = (fieldName: string, kind: CustomerDropdownKind) => ({
      onSearchOpenChange: (open: boolean) => {
        const pending = dropdownSearchTimeoutsRef.current[fieldName];
        if (pending != null) {
          window.clearTimeout(pending);
          dropdownSearchTimeoutsRef.current[fieldName] = null;
        }
        if (open) {
          void fetchDropdown(kind, "");
        }
      },
      onSearchQueryChange: ((query: string) => {
        const pending = dropdownSearchTimeoutsRef.current[fieldName];
        if (pending != null) {
          window.clearTimeout(pending);
        }
        const delay = query.trim() ? DROPDOWN_SEARCH_DEBOUNCE_MS : 0;
        dropdownSearchTimeoutsRef.current[fieldName] = window.setTimeout(() => {
          dropdownSearchTimeoutsRef.current[fieldName] = null;
          void fetchDropdown(kind, query);
        }, delay);
      }) as ERPDynamicSearchQueryChangeHandler,
      onValueChange: ((payload: ERPDynamicFieldValueChangePayload) => {
        const option = dropdownOptionsRef.current[fieldName]?.find(
          (item) => item.value === payload.value,
        );
        pinnedDropdownOptionRef.current[fieldName] =
          option && payload.value ? option : null;
      }) as ERPDynamicFieldValueChangeHandler,
    });
    return {
      cusCompanyId: build("cusCompanyId", "company"),
      cusBranchId: build("cusBranchId", "branch"),
      cusAreaId: build("cusAreaId", "area"),
      cusGroupId: build("cusGroupId", "group"),
      cusStateCode: build("cusStateCode", "state"),
      cusRegionStateName: build("cusRegionStateName", "state"),
    };
  }, [fetchDropdown]);
  // Seed each lazy dropdown with just its currently-selected option (from the loaded
  // record) so the trigger shows the saved name on edit/view before the user opens it.
  const seedDropdownSelections = useCallback(
    (source: Record<string, unknown>, values: Record<string, string>) => {
      const blank: ERPDynamicSelectOption = { value: "", label: "" };
      const nameFrom = (keys: readonly string[]) =>
        toDisplayValue(getFirstDefinedValue(source, keys));
      const seedOne = (
        fieldName: string,
        rawValue: string,
        label: string,
        head: ERPDynamicSelectOption,
      ) => {
        const value = (rawValue ?? "").trim();
        if (!value) {
          pinnedDropdownOptionRef.current[fieldName] = null;
          applyDropdownOptions(fieldName, [head]);
          return;
        }
        const option: ERPDynamicSelectOption = { value, label: label || value };
        pinnedDropdownOptionRef.current[fieldName] = option;
        applyDropdownOptions(fieldName, [head, option]);
      };
      seedOne(
        "cusCompanyId",
        values.cusCompanyId,
        nameFrom(["cusCompanyName", "cus_company_name"]),
        ALL_COMPANY_OPTION,
      );
      seedOne(
        "cusBranchId",
        values.cusBranchId,
        nameFrom(["cusBranchName", "cus_branch_name"]),
        ALL_BRANCH_OPTION,
      );
      seedOne(
        "cusAreaId",
        values.cusAreaId,
        nameFrom(["cusAreaName", "cus_area_name"]),
        blank,
      );
      seedOne(
        "cusGroupId",
        values.cusGroupId,
        nameFrom(["cusGroupName", "cus_group_name"]),
        blank,
      );
      // Main State field: value = code, label = "State Name (CODE)".
      const stateCode = (values.cusStateCode ?? "").trim().toUpperCase();
      const stateName =
        nameFrom(["cusStateName", "cus_state_name"]) || stateNameByCode[stateCode] || "";
      if (stateCode) {
        const stateOption: ERPDynamicSelectOption = {
          value: stateCode,
          label: stateName ? `${stateName} (${stateCode})` : stateCode,
        };
        pinnedDropdownOptionRef.current.cusStateCode = stateOption;
        applyDropdownOptions("cusStateCode", [blank, stateOption]);
        if (stateName) {
          setStateNameByCode((prev) => ({ ...prev, [stateCode]: stateName }));
          setStateCodeByName((prev) => ({ ...prev, [stateName]: stateCode }));
        }
      } else {
        pinnedDropdownOptionRef.current.cusStateCode = null;
        applyDropdownOptions("cusStateCode", [blank]);
      }
      // Region State field: value = state name.
      const regionStateName = (values.cusRegionStateName ?? "").trim();
      seedOne("cusRegionStateName", regionStateName, regionStateName, blank);
    },
    [applyDropdownOptions, stateNameByCode],
  );
  // Reset every lazy dropdown to just its empty/All head so no stale list from a
  // previous record lingers (used when the create modal opens).
  const resetDropdownSelections = useCallback(() => {
    const blank: ERPDynamicSelectOption = { value: "", label: "" };
    pinnedDropdownOptionRef.current = {};
    applyDropdownOptions("cusCompanyId", [ALL_COMPANY_OPTION]);
    applyDropdownOptions("cusBranchId", [ALL_BRANCH_OPTION]);
    applyDropdownOptions("cusAreaId", [blank]);
    applyDropdownOptions("cusGroupId", [blank]);
    applyDropdownOptions("cusStateCode", [blank]);
    applyDropdownOptions("cusRegionStateName", [blank]);
  }, [applyDropdownOptions]);
  // Seed the create form's lazy dropdowns from the customer_template config: the
  // Company/Area/Customer Group selections and the State select. Each is pinned (so its
  // label survives a later lazy fetch) and shown as the only extra option beside the
  // field's blank/All head, mirroring how a saved record's selection is seeded on edit.
  // The State seed also feeds stateNameByCode/stateCodeByName so the submit payload can
  // resolve cusStateName without the user opening the field. Fields the config omits
  // keep whatever resetDropdownSelections left them at.
  const seedTemplateDropdownDefaults = useCallback(() => {
    const blank: ERPDynamicSelectOption = { value: "", label: "" };
    const seedOne = (
      fieldName: "cusCompanyId" | "cusAreaId" | "cusGroupId",
      head: ERPDynamicSelectOption,
      def: CustomerTemplateDefault | null,
    ) => {
      if (!def || !def.id) {
        return;
      }
      const option: ERPDynamicSelectOption = { value: def.id, label: def.label || def.id };
      pinnedDropdownOptionRef.current[fieldName] = option;
      applyDropdownOptions(fieldName, [head, option]);
    };
    seedOne("cusCompanyId", ALL_COMPANY_OPTION, templateDefaults.company);
    seedOne("cusAreaId", blank, templateDefaults.area);
    seedOne("cusGroupId", blank, templateDefaults.group);
    const state = templateDefaults.state;
    if (state?.code) {
      const stateOption: ERPDynamicSelectOption = {
        value: state.code,
        label: state.name ? `${state.name} (${state.code})` : state.code,
      };
      pinnedDropdownOptionRef.current.cusStateCode = stateOption;
      applyDropdownOptions("cusStateCode", [blank, stateOption]);
      if (state.name) {
        setStateNameByCode((prev) => ({ ...prev, [state.code]: state.name }));
        setStateCodeByName((prev) => ({ ...prev, [state.name]: state.code }));
      }
    }
  }, [applyDropdownOptions, templateDefaults]);
  // Clear any pending dropdown search debounces on unmount.
  useEffect(() => {
    return () => {
      for (const handle of Object.values(dropdownSearchTimeoutsRef.current)) {
        if (handle != null) {
          window.clearTimeout(handle);
        }
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
    await fetchDropdown("state", "");
  }, [fetchDropdown]);
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
    await fetchDropdown("area", "");
  }, [fetchDropdown]);
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
    await fetchDropdown("group", "");
  }, [fetchDropdown]);
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
      applyWidgetFieldConfig(
        buildCustomerFormFields(
          stateOptions,
          regionStateOptions,
          areaOptions,
          groupOptions,
          companyOptions,
          branchOptions,
          priceLevelOptions,
          lazyDropdownHandlers,
          handleStateCreateShortcut,
          handleStateEditShortcut,
          handleAreaCreateShortcut,
          handleAreaEditShortcut,
          handleGroupCreateShortcut,
          handleGroupEditShortcut,
          handleCustomerGstinValueChange,
        ),
        widgetFieldConfig,
        WIDGET_FIELD_NAME_BY_FORM_FIELD,
      ),
    [
      areaOptions,
      branchOptions,
      companyOptions,
      groupOptions,
      lazyDropdownHandlers,
      handleAreaCreateShortcut,
      handleAreaEditShortcut,
      handleCustomerGstinValueChange,
      handleGroupCreateShortcut,
      handleGroupEditShortcut,
      handleStateCreateShortcut,
      handleStateEditShortcut,
      priceLevelOptions,
      regionStateOptions,
      stateOptions,
      widgetFieldConfig,
    ],
  );
  // Create-modal initial values: the blank base, then the whole customer_template
  // config overlaid — every primitive cus* field (fieldValues) plus the three dropdown
  // ids. cusStateCode arrives via fieldValues; the dropdown/state option labels are
  // seeded separately (seedTemplateDropdownDefaults) when the create modal opens.
  const customerCreateInitialValues = useMemo<Record<string, string>>(() => {
    const values = { ...CUSTOMER_INITIAL_FORM_VALUES, ...templateDefaults.fieldValues };
    if (templateDefaults.company?.id) {
      values.cusCompanyId = templateDefaults.company.id;
    }
    if (templateDefaults.area?.id) {
      values.cusAreaId = templateDefaults.area.id;
    }
    if (templateDefaults.group?.id) {
      values.cusGroupId = templateDefaults.group.id;
    }
    return values;
  }, [templateDefaults]);
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted customers. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 8's stored SQL; keys with no matching token are ignored. `wantdelete` is
  // driven by the "Show deleted records" checkbox beside the list search input.
  const buildListQuery = useCallback(
    ({
      searchTerm,
      currentPage,
      pageSize,
    }: {
      searchTerm: string;
      currentPage: number;
      pageSize: number;
    }): Record<string, string> => ({
      page: String(currentPage),
      limit: String(pageSize),
      ...(searchTerm ? { search: searchTerm } : {}),
      grid_param: JSON.stringify({ wantdelete: wantDelete }),
    }),
    [wantDelete],
  );
  const handleNavigateToShippingAddress = useCallback(() => {
    router.push("/master/ledger-shipping-address-master");
  }, [router]);

  // Right-click config tree popup over the create/update modal.
  const { getAll: getWidgetConfigTree } = useApi<WidgetMastersResponse>(
    WIDGET_CONFIG_TREE_ENDPOINT,
    { toast: { error: false } },
  );
  const { run: saveVisibility, loading: savingVisibility } = useApi(WIDGET_VISIBILITY_ENDPOINT, {
    method: "PATCH",
  });
  const [configSections, setConfigSections] = useState<WidgetMasterSectionConfig[]>([]);
  // Section-level visibility overrides keyed by sectionId; falls back to the
  // fetched sectionVisibility until the user toggles a section.
  const [sectionVisibility, setSectionVisibility] = useState<Map<number, boolean>>(() => new Map());
  // Edited secondary text keyed by fieldId; falls back to the fetched value.
  const [secondaryTextById, setSecondaryTextById] = useState<Map<number, string>>(() => new Map());
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const treeLoadedRef = useRef(false);
  const visibilityControllerRef = useRef<ERPDynamicModalController | null>(null);

  // Fetched lazily the first time the popup is opened, then cached.
  const loadConfigTree = useCallback(async () => {
    if (treeLoadedRef.current) {
      return;
    }
    treeLoadedRef.current = true;
    setTreeLoading(true);
    setTreeError(null);
    try {
      const payload = await getWidgetConfigTree({ menu_id: String(WIDGET_SECTION_MENU_ID) });
      setConfigSections(Array.isArray(payload?.data) ? payload.data : []);
    } catch {
      treeLoadedRef.current = false;
      setTreeError("Unable to load field configuration.");
    } finally {
      setTreeLoading(false);
    }
  }, [getWidgetConfigTree]);

  // Hijack right-clicks that land inside the open create/update modal only; clicks
  // elsewhere keep the browser's native context menu. Opens the Visible Settings
  // modal (an ERPDynamicModalForm) on top via its controller.
  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[role="dialog"][aria-modal="true"]')) {
        return;
      }
      event.preventDefault();
      void loadConfigTree();
      visibilityControllerRef.current?.openModal("visibility");
    };
    window.addEventListener("contextmenu", handleContextMenu);
    return () => window.removeEventListener("contextmenu", handleContextMenu);
  }, [loadConfigTree]);

  const handleToggleField = useCallback((backendName: string, checked: boolean) => {
    const key = backendName.toLowerCase();
    setWidgetFieldConfig((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      next.set(
        key,
        existing
          ? { ...existing, visible: checked }
          : { label: "", secondaryText: "", order: Number.MAX_SAFE_INTEGER, visible: checked },
      );
      return next;
    });
  }, []);

  const handleToggleSection = useCallback((sectionId: number, checked: boolean) => {
    setSectionVisibility((prev) => {
      const next = new Map(prev);
      next.set(sectionId, checked);
      return next;
    });
  }, []);

  const handleChangeSecondaryText = useCallback(
    (fieldId: number, value: string) => {
      setSecondaryTextById((prev) => {
        const next = new Map(prev);
        next.set(fieldId, value);
        return next;
      });
      // Mirror the edit into the live form config (keyed by backend fieldName)
      // so the matching input's label updates immediately, like the visibility
      // toggles do. A non-empty secondary text wins over fieldGuiName as label.
      const fieldName = configSections
        .flatMap((section) => (Array.isArray(section.fields) ? section.fields : []))
        .find((field) => field.fieldId === fieldId)?.fieldName;
      const key = (fieldName ?? "").trim().toLowerCase();
      if (!key) {
        return;
      }
      setWidgetFieldConfig((prev) => {
        const existing = prev.get(key);
        if (!existing) {
          return prev;
        }
        const next = new Map(prev);
        next.set(key, { ...existing, secondaryText: value.trim() });
        return next;
      });
    },
    [configSections],
  );

  // Build the tree view from the /config payload, deriving each checkbox from the
  // live form visibility map so the popup and the rendered form stay in sync.
  const treeSections = useMemo<WidgetTreeSectionView[]>(
    () =>
      configSections.map((section) => ({
        sectionId: section.sectionId,
        label: section.sectionGuiName?.trim() || section.sectionName || "Section",
        visible: sectionVisibility.get(section.sectionId) ?? section.sectionVisibility !== false,
        fields: (Array.isArray(section.fields) ? section.fields : []).map((field) => {
          const key = (field.fieldName ?? "").trim().toLowerCase();
          const configEntry = widgetFieldConfig.get(key);
          return {
            fieldId: field.fieldId,
            fieldName: field.fieldName,
            label: (field.fieldGuiName ?? "").trim() || field.fieldName,
            secondaryText: secondaryTextById.get(field.fieldId) ?? (field.fieldSecondaryText ?? ""),
            checked: configEntry ? configEntry.visible : field.fieldVisibility !== false,
            controllable: WIDGET_CONTROLLABLE_FIELD_NAMES.has(key),
          };
        }),
      })),
    [configSections, sectionVisibility, secondaryTextById, widgetFieldConfig],
  );

  // PATCH the current section/field visibility for every configured field back to
  // the server in the documented { data: [{ sectionId, sectionGuiName,
  // sectionVisibility, fields: [{ fieldId, fieldSecondaryText, fieldVisibility }] }] }
  // shape. Throws on failure so the hosting modal stays open (useApi toasts the error);
  // on success it resolves and the modal closes itself. sectionGuiName and
  // fieldSecondaryText are coerced to non-null strings — the server DTO requires a
  // string (sectionGuiName is also @IsNotEmpty) and rejects the null an unset config
  // value carries.
  const handleVisibilitySubmit = useCallback(async () => {
    const payload = {
      data: configSections.map((section) => ({
        sectionId: section.sectionId,
        sectionGuiName: section.sectionGuiName?.trim() || section.sectionName || "Section",
        sectionVisibility: sectionVisibility.get(section.sectionId) ?? section.sectionVisibility !== false,
        fields: (Array.isArray(section.fields) ? section.fields : []).map((field) => {
          const key = (field.fieldName ?? "").trim().toLowerCase();
          const configEntry = widgetFieldConfig.get(key);
          return {
            fieldId: field.fieldId,
            fieldSecondaryText: secondaryTextById.get(field.fieldId) ?? field.fieldSecondaryText ?? "",
            fieldVisibility: configEntry ? configEntry.visible : field.fieldVisibility !== false,
          };
        }),
      })),
    };
    await saveVisibility({ body: payload });
  }, [configSections, sectionVisibility, secondaryTextById, widgetFieldConfig, saveVisibility]);

  // While the Visible Settings modal is open, intercept Escape/F5 in the capture
  // phase so they act on it alone — without this, the underlying create/update
  // modal's window-level Escape would also fire and close both. F5 mirrors the
  // legacy "Save (F5)" shortcut.
  useEffect(() => {
    if (!visibilityModalOpen) {
      return;
    }
    const handleKeyDownCapture = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        visibilityControllerRef.current?.closeModal();
      } else if (event.key === "F5") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!savingVisibility) {
          void handleVisibilitySubmit()
            .then(() => visibilityControllerRef.current?.closeModal())
            .catch(() => {
              // Error toast handled by useApi; keep the modal open to retry.
            });
        }
      }
    };
    window.addEventListener("keydown", handleKeyDownCapture, true);
    return () => window.removeEventListener("keydown", handleKeyDownCapture, true);
  }, [visibilityModalOpen, savingVisibility, handleVisibilitySubmit]);

  // The Visible Settings modal hosts the whole tree as a single custom field so it
  // reuses the standard ERP modal chrome (header, backdrop, Save/Cancel footer).
  const visibilityVariant = useMemo<ERPDynamicModalVariant>(
    () => ({
      key: "visibility",
      cardTitle: "Visible Settings",
      cardDescription: "",
      cardButtonLabel: "Open",
      modalTitle: "Visible Settings",
      submitLabel: "Save (F5)",
      fields: [
        {
          name: "visibilityTree",
          label: "",
          type: "custom",
          colSpan: 2,
          render: () => (
            <WidgetVisibilityTree
              sections={treeSections}
              loading={treeLoading}
              error={treeError}
              disabled={savingVisibility}
              onToggleSection={handleToggleSection}
              onToggleField={handleToggleField}
              onChangeSecondaryText={handleChangeSecondaryText}
            />
          ),
        },
      ],
    }),
    [
      treeSections,
      treeLoading,
      treeError,
      savingVisibility,
      handleToggleSection,
      handleToggleField,
      handleChangeSecondaryText,
    ],
  );
  return (
    <>
      <CrudMasterPage
        title="Customer"
        iconName="customer_master"
        auditHistory={{ screenName: "Customer Master" }}
        entityLabel="customer"
        entityLabelPlural="customers"
        apiEndpoints={API_ENDPOINTS}
        buildListQuery={buildListQuery}
        toolbarContent={
          <div className={styles.filterCheckGroup}>
            <label className={styles.filterCheckLabel}>
              <input
                type="checkbox"
                checked={wantDelete}
                onChange={(event) => setWantDelete(event.target.checked)}
              />
              Show deleted records
            </label>
          </div>
        }
        toolbarActions={
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.iconBtnShipping}`}
            onClick={handleNavigateToShippingAddress}
            title="Ledger Shipping Address"
          >
            <span className={styles.iconBtnBox}><FiTruck aria-hidden="true" /></span>
            <span>Shipping Address</span>
          </button>
        }
        gridTableName={GRID_TABLE_NAME}
        gridDetailId={8}
        listResponseStyleArrayKey=""
        lookupKeys={LOOKUP_KEYS}
        requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
        styles={styles}
        listTitle="Customer List"
        createLabel="Add Customer"
        codeColumnHeader="Customer Code"
        nameColumnHeader="Customer Name"
        formTitle="Customer Form"
        formDescription="Create and update customers."
        createModalTitle="Customer Entry"
        editModalTitle="Edit Customer Entry"
        listSubtitleOverride="Manage customers"
        customFields={customerFormFields}
        createInitialValues={customerCreateInitialValues}
        modalPanelStyle={CUSTOMER_MODAL_PANEL_STYLE}
        modalFormGridColumns={2}
        modalFormDenseGrid={false}
        modalSectionNavigationMode="tabs"
        modalHideFieldHelperText
        modalHideFieldErrorText
        modalFocusFirstInvalidFieldOnValidationError
        modalEnableArrowKeyFieldNavigation
        onModalOpenChange={(open, variantKey) => {
          // Clear the lazy dropdowns when the create modal opens so no stale list
          // from a previously edited record lingers (they reload on open), then seed
          // the Company/Area/Customer Group defaults from the customer_template config.
          if (open && variantKey === "master-create") {
            resetDropdownSelections();
            seedTemplateDropdownDefaults();
          }
        }}
        augmentDetailSource={async ({ source }) => {
          // getById doesn't return the customer group's name, so resolve it here to
          // seed the Customer Group trigger with a readable label (not the raw id).
          const detail = source ?? {};
          const groupId = toDisplayValue(
            getFirstDefinedValue(detail, ["cusGroupId", "cus_group_id"]),
          );
          const existingName = toDisplayValue(
            getFirstDefinedValue(detail, ["cusGroupName", "cus_group_name"]),
          );
          if (!groupId || existingName) {
            return null;
          }
          try {
            const detailPayload = await getCustomerGroupById({ cgrId: groupId });
            const detailSource = extractGroupDetailSource(detailPayload);
            const groupName = detailSource
              ? toDisplayValue(getFirstDefinedValue(detailSource, GROUP_DETAIL_KEYS.name))
              : "";
            return groupName ? { cusGroupName: groupName } : null;
          } catch {
            return null;
          }
        }}
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
          // Seed the lazy dropdowns with the saved selection so each trigger shows the
          // resolved name on edit/view before the field is opened (and lazily loaded).
          seedDropdownSelections(rowSource, mappedValues);
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
      <ERPDynamicModalForm
        title="Visible Settings"
        variants={[visibilityVariant]}
        showDefaultCards={false}
        hideSectionHeader
        resetOnSubmit={false}
        panelStyle={{ width: "min(680px, calc(100vw - 2rem))", maxHeight: "min(82vh, 620px)" }}
        onControllerReady={(controller) => {
          visibilityControllerRef.current = controller;
        }}
        onOpenChange={(open) => setVisibilityModalOpen(open)}
        onSubmit={() => handleVisibilitySubmit()}
      />
    </>
  );
}