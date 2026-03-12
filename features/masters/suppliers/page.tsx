"use client";

import {
  CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import InlineRelatedMasterModal from "@/features/masters/shared/inline-related-master";
import { toast } from "react-toastify";
import {
  type ERPDynamicFieldValueChangeHandler,
  type ERPDynamicModalController,
  type ERPDynamicModalSubmitPayload,
  type ERPDynamicModalVariant,
} from "@/components/library/ui/dynamic-modal-form";
import type {
  ERPDynamicModalField,
  ERPDynamicSearchShortcutPayload,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  buildLookupOptions,
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
  DEFAULT_LOOKUP_ARRAY_KEYS,
} from "@/app/master/_shared/crud-utils";
import { COLLECTION_DAY_OPTIONS, GST_TYPE_OPTIONS } from "@/utils/constant";
import { validateGstin } from "@/utils/validation";

const API_ENDPOINTS = {
  list: "/suppliers/list",
  getById: "/suppliers/get",
  create: "/suppliers/create",
  delete: "/suppliers/delete",
} as const;

const GRID_TABLE_NAME = "suppliers";
const CUSTOMER_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(62vw, 62rem)",
  maxHeight: "75vh",
};
const SUPPLIER_GROUP_LOOKUP_ENDPOINT = "/supplier-groups/list";
const SUPPLIER_GROUP_GET_ENDPOINT = "/supplier-groups/get";
const SUPPLIER_GROUP_CREATE_ENDPOINT = "/supplier-groups/create";
const COMPANY_LOOKUP_ENDPOINT = "/company-masters/list";
const BRANCH_LOOKUP_ENDPOINT = "/branch-masters/list";
const STATE_LOOKUP_ENDPOINT = "/state-code-masters/list";
const STATE_GET_ENDPOINT = "/state-code-masters/get";
const STATE_CREATE_ENDPOINT = "/state-code-masters/create";
const SUPPLIER_GROUP_LOOKUP_QUERY = {
  page: "1",
  limit: "20",
  spgIsActive: "true",
} as const;
const COMPANY_LOOKUP_QUERY = {
  page: "1",
  limit: "100",
  compIsActive: "true",
} as const;
const BRANCH_LOOKUP_QUERY = {
  page: "1",
  limit: "100",
  brIsActive: "true",
} as const;
const STATE_LOOKUP_QUERY = {
  page: "1",
  limit: "100",
  isActive: "true",
} as const;
const GST_LOOKUP_ENDPOINT = "/api/gst/search";
const GST_LOOKUP_PATTERN = /^[0-9A-Z]{15}$/;
const GST_LOOKUP_HELPER_TEXT =
  "Type a 15-character GSTIN to load supplier details automatically.";
const STATE_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(34vw, 34rem)",
  maxHeight: "75vh",
};
const SUPPLIER_GROUP_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(42vw, 42rem)",
  maxHeight: "75vh",
};

const LOOKUP_KEYS = {
  id: ["supId", "sup_id", "supplier_id", "supplierId", "id", "_id"],
  code: ["supPurchaseType", "sup_purchase_type", "supGstNo", "sup_gst_no", "code"],
  name: ["supName", "sup_name", "supplier_name", "supplierName", "name"],
  short: ["supShort", "sup_short", "short_name", "shortName", "short"],
  alias: ["supPurchaseType", "sup_purchase_type", "supGroupName", "sup_group_name", "alias"],
  active: ["supIsActive", "sup_is_active", "isActive", "is_active", "status"],
  position: ["supSortOrder", "sup_sort_order", "position", "sort"],
  description: ["supNotes", "sup_notes", "notes", "description", "desc"],
  array: ["data", "items", "results", "rows", "list", "suppliers"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "supId",
  name: "supName",
  alias: "supPurchaseType",
  short: "supShort",
  description: "supNotes",
  sort: "supSortOrder",
} as const;

const SUPPLIER_IS_ACTIVE_KEYS = [
  "supIsActive",
  "sup_is_active",
  "isActive",
  "is_active",
  "status",
] as const;

const DEFAULT_LOOKUP_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "",
};
const PURCHASE_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "Goods Supplier", label: "Goods Supplier" },
];
const SUPPLIER_GROUP_LOOKUP_ARRAY_KEYS = [
  ...DEFAULT_LOOKUP_ARRAY_KEYS,
  "supplierGroups",
  "supplier_groups",
] as const;
const SUPPLIER_GROUP_ID_KEYS = [
  "spgId",
  "spg_id",
  "id",
  "_id",
  "value",
] as const;
const SUPPLIER_GROUP_NAME_KEYS = [
  "spgName",
  "spg_name",
  "name",
  "label",
] as const;
const STATE_LOOKUP_ARRAY_KEYS = [
  ...DEFAULT_LOOKUP_ARRAY_KEYS,
  "stateCodes",
  "state_codes",
  "states",
] as const;
const STATE_LOOKUP_NAME_KEYS = [
  "stateName",
  "state_name",
  "name",
  "label",
] as const;
const STATE_LOOKUP_CODE_KEYS = [
  "stateCode",
  "state_code",
  "code",
] as const;
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
const STATE_DETAIL_KEYS = {
  code: ["stateCode", "state_code", "code"],
  name: ["stateName", "state_name", "name", "label"],
  stateUt: ["stateUt", "state_ut", "state_ut_flag"],
  tinCode: ["tinCode", "tin_code", "tin"],
  active: ["isActive", "is_active", "active", "status"],
} as const;
const SUPPLIER_GROUP_DETAIL_KEYS = {
  id: ["spgId", "spg_id", "id", "_id"],
  name: ["spgName", "spg_name", "name", "label"],
  short: ["spgShort", "spg_short", "short", "shortName"],
  description: ["spgDesc", "spg_desc", "description", "desc"],
  active: ["spgIsActive", "spg_is_active", "isActive", "is_active", "status"],
} as const;
const GST_TYPE_VALUES = new Set(GST_TYPE_OPTIONS.map((option) => option.value));
const STATE_MODAL_INITIAL_VALUES = {
  stateCode: "",
  stateName: "",
  stateUt: "false",
  tinCode: "",
  isActive: "true",
} as const;
const SUPPLIER_GROUP_MODAL_INITIAL_VALUES = {
  spgName: "",
  spgShort: "",
  spgDesc: "",
  spgIsActive: "true",
} as const;

const SUPPLIER_INITIAL_FORM_VALUES = {
  supCompanyId: "",
  supBranchId: "",
  supGroupId: "",
  supPurchaseType: "",
  supName: "",
  supShort: "",
  supAddr1: "",
  supAddr2: "",
  supAddr3: "",
  supCity: "",
  supDistrict: "",
  supStateName: "",
  supCountry: "India",
  supPincode: "",
  supTel: "",
  supPhone: "",
  supMailId: "",
  supWhatsappNo: "",
  supWebsiteAddress: "",
  supChequePreName: "",
  supNotes: "",
  supCreditDays: "0",
  supCashDiscPerc: "0",
  supCollectionDays: "",
  supGstNo: "",
  supStateCode: "",
  supPanNo: "",
  supGstType: "",
  supSupCst: "",
  supDrugLiscenceNo: "",
  supRegionName: "",
  supRegionAddr1: "",
  supRegionAddr2: "",
  supRegionAddr3: "",
  supRegionCity: "",
  supRegionDistrict: "",
  supRegionStateName: "",
  supRegionCountry: "India",
  supBilledDate: "",
  supSortOrder: "0",
  supIsActive: "true",
  supStateId: "",
} as const;

function buildSupplierFormFields(
  supplierGroupOptions: ERPDynamicSelectOption[],
  companyOptions: ERPDynamicSelectOption[],
  branchOptions: ERPDynamicSelectOption[],
  stateOptions: ERPDynamicSelectOption[],
  onSupplierGroupCreateShortcut: (
    payload: ERPDynamicSearchShortcutPayload,
  ) => void | Promise<void>,
  onSupplierGroupEditShortcut: (
    payload: ERPDynamicSearchShortcutPayload,
  ) => void | Promise<void>,
  onStateCreateShortcut: (
    payload: ERPDynamicSearchShortcutPayload,
  ) => void | Promise<void>,
  onStateEditShortcut: (
    payload: ERPDynamicSearchShortcutPayload,
  ) => void | Promise<void>,
  onSupplierStateValueChange: ERPDynamicFieldValueChangeHandler,
  onSupplierGstinValueChange: ERPDynamicFieldValueChangeHandler,
): ERPDynamicModalField[] {
  return [
  {
    name: "scopeHeading",
    label: "Primary Details",
    type: "heading",
    gridColumnStart: 1,
    gridRowStart: 1,
  },
  {
    name: "supGstNo",
    label: "GST No",
    gridColumnStart: 1,
    gridRowStart: 2,
    placeholder: "24ABCDE1234F1Z5",
    helperText: GST_LOOKUP_HELPER_TEXT,
    onValueChange: onSupplierGstinValueChange,
    validation: {
      custom: (value, values) => validateSupplierGstin(value, values),
    },
  },
  {
    name: "supGstType",
    label: "GST Type",
    type: "select",
    gridColumnStart: 1,
    gridRowStart: 3,
    searchable: true,
    options: GST_TYPE_OPTIONS,
    required: true,
    validation: {
      requiredMessage: "GST Type is required.",
    },
  },
  {
    name: "supName",
    label: "Supplier Name",
    gridColumnStart: 2,
    gridRowStart: 2,
    required: true,
    validation: {
      minLength: 2,
      maxLength: 200,
      minLengthMessage: "Supplier Name must be at least 2 characters.",
      maxLengthMessage: "Supplier Name must be at most 200 characters.",
    },
  },
  {
    name: "supGroupId",
    label: "Supplier Group",
    type: "select",
    gridColumnStart: 2,
    gridRowStart: 3,
    searchable: true,
    required: true,
    options: supplierGroupOptions,
    onSearchCreateShortcut: onSupplierGroupCreateShortcut,
    onSearchEditShortcut: onSupplierGroupEditShortcut,
    validation: {
      requiredMessage: "Supplier Group is required.",
    },
  },
  {
    name: "supCompanyId",
    label: "Company",
    type: "select",
    gridColumnStart: 3,
    gridRowStart: 2,
    searchable: true,
    options: companyOptions,
  },
  {
    name: "supShort",
    label: "Short Name",
    gridColumnStart: 2,
    gridRowStart: 5,
    validation: {
      maxLength: 50,
      maxLengthMessage: "Short Name must be at most 50 characters.",
    },
  },
  {
    name: "supPurchaseType",
    label: "Purchase Type",
    type: "select",
    gridColumnStart: 2,
    gridRowStart: 4,
    searchable: false,
    required: true,
    options: PURCHASE_TYPE_OPTIONS,
    validation: {
      requiredMessage: "Purchase Type is required.",
    },
  },
  {
    name: "supBranchId",
    label: "Branch",
    type: "select",
    gridColumnStart: 3,
    gridRowStart: 3,
    searchable: true,
    options: branchOptions,
  },
  {
    name: "supPanNo",
    label: "PAN No",
    gridColumnStart: 1,
    gridRowStart: 4,
    validation: {
      custom: (value) => validateSupplierPan(value),
    },
  },
  {
    name: "supDrugLiscenceNo",
    label: "Drug Licence No",
    gridColumnStart: 1,
    gridRowStart: 5,
    validation: {
      maxLength: 100,
      maxLengthMessage: "Drug Licence No must be at most 100 characters.",
    },
  },
  {
    name: "contactHeading",
    label: "Address & Contact Details",
    type: "heading",
    gridColumnStart: 1,
    gridRowStart: 6,
  },
  {
    name: "supAddr1",
    label: "Address Line 1",
    gridColumnStart: 1,
    gridRowStart: 7,
    validation: {
      maxLength: 250,
      maxLengthMessage: "Address Line 1 must be at most 250 characters.",
    },
  },
  {
    name: "supDistrict",
    label: "District",
    gridColumnStart: 2,
    gridRowStart: 7,
    validation: {
      maxLength: 250,
      maxLengthMessage: "District must be at most 250 characters.",
    },
  },
  {
    name: "supPhone",
    label: "Phone",
    type: "tel",
    gridColumnStart: 3,
    gridRowStart: 7,
    validation: {
      maxLength: 20,
      maxLengthMessage: "Phone must be at most 20 characters.",
    },
  },
  {
    name: "supAddr2",
    label: "Address Line 2",
    gridColumnStart: 1,
    gridRowStart: 8,
    validation: {
      maxLength: 250,
      maxLengthMessage: "Address Line 2 must be at most 250 characters.",
    },
  },
  {
    name: "supStateName",
    label: "State",
    type: "select",
    gridColumnStart: 2,
    gridRowStart: 8,
    searchable: true,
    required: true,
    options: stateOptions,
    onSearchCreateShortcut: onStateCreateShortcut,
    onSearchEditShortcut: onStateEditShortcut,
    onValueChange: onSupplierStateValueChange,
    validation: {
      requiredMessage: "State is required.",
    },
  },
  {
    name: "supWhatsappNo",
    label: "WhatsApp No",
    type: "tel",
    gridColumnStart: 3,
    gridRowStart: 8,
    validation: {
      maxLength: 20,
      maxLengthMessage: "WhatsApp No must be at most 20 characters.",
    },
  },
  {
    name: "supAddr3",
    label: "Address Line 3",
    gridColumnStart: 1,
    gridRowStart: 9,
    validation: {
      maxLength: 250,
      maxLengthMessage: "Address Line 3 must be at most 250 characters.",
    },
  },
  {
    name: "supPincode",
    label: "PIN No",
    gridColumnStart: 2,
    gridRowStart: 9,
    validation: {
      maxLength: 10,
      maxLengthMessage: "PIN No must be at most 10 characters.",
    },
  },
  {
    name: "supTel",
    label: "Telephone",
    type: "tel",
    gridColumnStart: 3,
    gridRowStart: 9,
    validation: {
      maxLength: 20,
      maxLengthMessage: "Telephone must be at most 20 characters.",
    },
  },
  {
    name: "supCity",
    label: "City",
    gridColumnStart: 1,
    gridRowStart: 10,
    validation: {
      maxLength: 250,
      maxLengthMessage: "City must be at most 250 characters.",
    },
  },
  {
    name: "supWebsiteAddress",
    label: "Website",
    type: "url",
    gridColumnStart: 2,
    gridRowStart: 10,
    validation: {
      maxLength: 200,
      maxLengthMessage: "Website must be at most 200 characters.",
    },
  },
  {
    name: "supMailId",
    label: "Email",
    type: "email",
    gridColumnStart: 3,
    gridRowStart: 10,
    validation: {
      maxLength: 120,
      maxLengthMessage: "Email must be at most 120 characters.",
    },
  },
  {
    name: "creditHeading",
    label: "Credit Details",
    type: "heading",
    gridColumnStart: 1,
    gridRowStart: 11,
  },
  {
    name: "supCreditDays",
    label: "Credit Days",
    type: "number",
    gridColumnStart: 1,
    gridRowStart: 12,
    min: 0,
    step: 1,
    validation: {
      minMessage: "Credit Days must be 0 or greater.",
    },
  },
  {
    name: "supCashDiscPerc",
    label: "Cash Discount %",
    type: "number",
    gridColumnStart: 2,
    gridRowStart: 12,
    min: 0,
    step: 0.001,
    validation: {
      minMessage: "Cash Discount % must be 0 or greater.",
    },
  },
  {
    name: "supCollectionDays",
    label: "Collection Days",
    placeholder: "Select Days",
    type: "select",
    gridColumnStart: 3,
    gridRowStart: 12,
    searchable: true,
    multiple: true,
    options: COLLECTION_DAY_OPTIONS,
  },
  {
    name: "regionHeading",
    label: "Region Details",
    type: "heading",
    gridColumnStart: 1,
    gridRowStart: 13,
  },
  {
    name: "supRegionName",
    label: "Region Name",
    gridColumnStart: 1,
    gridRowStart: 14,
    validation: {
      maxLength: 200,
      maxLengthMessage: "Region Name must be at most 200 characters.",
    },
  },
  {
    name: "supRegionAddr3",
    label: "Region Address 3",
    gridColumnStart: 2,
    gridRowStart: 14,
    validation: {
      maxLength: 250,
      maxLengthMessage: "Region Address 3 must be at most 250 characters.",
    },
  },
  {
    name: "supRegionCountry",
    label: "Region Country",
    disabled: true,
    gridColumnStart: 3,
    gridRowStart: 14,
    validation: {
      maxLength: 60,
      maxLengthMessage: "Region Country must be at most 60 characters.",
    },
  },
  {
    name: "supRegionAddr1",
    label: "Region Address 1",
    gridColumnStart: 1,
    gridRowStart: 15,
    validation: {
      maxLength: 250,
      maxLengthMessage: "Region Address 1 must be at most 250 characters.",
    },
  },
  {
    name: "supRegionCity",
    label: "Region City",
    gridColumnStart: 2,
    gridRowStart: 15,
    validation: {
      maxLength: 250,
      maxLengthMessage: "Region City must be at most 250 characters.",
    },
  },
  {
    name: "supRegionAddr2",
    label: "Region Address 2",
    gridColumnStart: 1,
    gridRowStart: 16,
    validation: {
      maxLength: 250,
      maxLengthMessage: "Region Address 2 must be at most 250 characters.",
    },
  },
  {
    name: "statusHeading",
    label: "Status & Notes",
    type: "heading",
    gridColumnStart: 1,
    gridRowStart: 17,
  },
  {
    name: "supChequePreName",
    label: "Cheque  Name",
    gridColumnStart: 1,
    gridRowStart: 18,
    validation: {
      maxLength: 200,
      maxLengthMessage: "Cheque Prefix Name must be at most 200 characters.",
    },
  },
  {
    name: "supSortOrder",
    label: "Sort Order",
    type: "number",
    gridColumnStart: 2,
    gridRowStart: 18,
    step: 1,
    min: 0,
    validation: {
      minMessage: "Sort Order must be 0 or greater.",
    },
  },
  {
    name: "supIsActive",
    label: "Status",
    type: "checkbox",
    gridColumnStart: 3,
    gridRowStart: 18,
    options: [
      { label: "Active", value: "true" },
      { label: "Inactive", value: "false" },
    ],
  },
  {
    name: "supNotes",
    label: "Notes",
    gridColumnStart: 1,
    gridRowStart: 19,
    colSpan: 2,
    validation: {
      maxLength: 250,
      maxLengthMessage: "Notes must be at most 250 characters.",
    },
  },
];
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
function toSupplierLookupGstType(value: string): string {
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
function buildSupplierLookupValues(
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
    supGstNo: gstin,
    supPanNo: gstin.slice(2, 12),
    supCountry: "India",
  };

  setFieldValueIfPresent(values, "supName", tradeName || legalName);
  setFieldValueIfPresent(
    values,
    "supGstType",
    toSupplierLookupGstType(
      toDisplayValue(getFirstDefinedValue(payload, GST_REGISTRATION_TYPE_KEYS)),
    ),
  );
  setFieldValueIfPresent(
    values,
    "supAddr1",
    joinDisplayValues(
      GST_ADDRESS_BUILDING_KEYS.map((key) => getFirstDefinedValue(address, [key])),
    ),
  );
  setFieldValueIfPresent(
    values,
    "supAddr2",
    joinDisplayValues(
      GST_ADDRESS_LOCALITY_KEYS.map((key) => getFirstDefinedValue(address, [key])),
    ),
  );
  setFieldValueIfPresent(
    values,
    "supAddr3",
    joinDisplayValues([
      getFirstDefinedValue(address, GST_ADDRESS_DISTRICT_KEYS),
      getFirstDefinedValue(address, GST_ADDRESS_CITY_KEYS),
    ]),
  );
  setFieldValueIfPresent(values, "supCity", city);
  setFieldValueIfPresent(values, "supDistrict", district);
  setFieldValueIfPresent(values, "supStateCode", stateCode);
  setFieldValueIfPresent(values, "supStateName", stateName);
  setFieldValueIfPresent(values, "supRegionStateName", stateName);
  setFieldValueIfPresent(
    values,
    "supPincode",
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
function removeEmptyOptions(
  options: ERPDynamicSelectOption[],
): ERPDynamicSelectOption[] {
  return options.filter((option) => option.value.trim().length > 0);
}
function buildSupplierGroupOptions(payload: unknown): ERPDynamicSelectOption[] {
  return removeEmptyOptions(
    buildLookupOptions(payload, DEFAULT_LOOKUP_OPTION, {
      arrayKeys: SUPPLIER_GROUP_LOOKUP_ARRAY_KEYS,
      idKeys: SUPPLIER_GROUP_ID_KEYS,
      labelKeys: SUPPLIER_GROUP_NAME_KEYS,
    }),
  );
}
function buildStateNameOptions(payload: unknown): ERPDynamicSelectOption[] {
  return removeEmptyOptions(
    buildLookupOptions(payload, DEFAULT_LOOKUP_OPTION, {
      arrayKeys: STATE_LOOKUP_ARRAY_KEYS,
      idKeys: STATE_LOOKUP_NAME_KEYS,
      labelKeys: STATE_LOOKUP_NAME_KEYS,
    }),
  );
}
function buildCompanyOptions(payload: unknown): ERPDynamicSelectOption[] {
  return removeEmptyOptions(
    buildLookupOptions(payload, DEFAULT_LOOKUP_OPTION, {
      arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "companies", "companys"],
      idKeys: ["compId", "comp_id", "company_id", "companyId", "id", "_id", "value"],
      labelKeys: ["compName", "comp_name", "company_name", "companyName", "name", "label"],
    }),
  );
}
function buildBranchOptions(payload: unknown): ERPDynamicSelectOption[] {
  return removeEmptyOptions(
    buildLookupOptions(payload, DEFAULT_LOOKUP_OPTION, {
      arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "branches", "branch_masters"],
      idKeys: ["brId", "br_id", "branch_id", "branchId", "id", "_id", "value"],
      labelKeys: ["brName", "br_name", "branch_name", "branchName", "name", "label"],
    }),
  );
}
function toNullableLookupSelection(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  return normalized;
}
function resolveOptionFromShortcut(
  payload: ERPDynamicSearchShortcutPayload,
  options: ERPDynamicSelectOption[],
): ERPDynamicSelectOption | null {
  const selectedValue = payload.value.trim();
  if (selectedValue) {
    const selectedOption = options.find((option) => option.value === selectedValue);
    if (selectedOption) {
      return selectedOption;
    }
  }
  const normalizedQuery = payload.query.trim().toLowerCase();
  if (!normalizedQuery) {
    return null;
  }
  const exactMatch = options.find((option) => {
    const label = option.label.trim().toLowerCase();
    const value = option.value.trim().toLowerCase();
    return label === normalizedQuery || value === normalizedQuery;
  });
  if (exactMatch) {
    return exactMatch;
  }
  const startsWithMatch = options.find((option) =>
    option.label.trim().toLowerCase().startsWith(normalizedQuery),
  );
  if (startsWithMatch) {
    return startsWithMatch;
  }
  return (
    options.find((option) =>
      option.label.trim().toLowerCase().includes(normalizedQuery),
    ) ?? null
  );
}
function extractDetailSource(
  payload: unknown,
  arrayKeys: readonly string[],
): Record<string, unknown> | null {
  const rows = extractRows(payload, arrayKeys);
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
function mapStateDetailToFormValues(source: Record<string, unknown>): Record<string, string> {
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
      STATE_MODAL_INITIAL_VALUES.stateUt,
    ),
    tinCode:
      toUpper(toDisplayValue(getFirstDefinedValue(source, STATE_DETAIL_KEYS.tinCode))) ||
      STATE_MODAL_INITIAL_VALUES.tinCode,
    isActive: toSelectBoolean(
      getFirstDefinedValue(source, STATE_DETAIL_KEYS.active),
      STATE_MODAL_INITIAL_VALUES.isActive,
    ),
  };
}
function buildStateModalFields(disableStateCode: boolean): ERPDynamicModalField[] {
  return [
    {
      name: "stateCode",
      label: "State Code",
      required: true,
      disabled: disableStateCode,
      helperText: "Two-character state code.",
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
function mapSupplierGroupDetailToFormValues(
  source: Record<string, unknown>,
): Record<string, string> {
  return {
    ...SUPPLIER_GROUP_MODAL_INITIAL_VALUES,
    spgName:
      toDisplayValue(getFirstDefinedValue(source, SUPPLIER_GROUP_DETAIL_KEYS.name)) ||
      SUPPLIER_GROUP_MODAL_INITIAL_VALUES.spgName,
    spgShort:
      toDisplayValue(getFirstDefinedValue(source, SUPPLIER_GROUP_DETAIL_KEYS.short)) ||
      SUPPLIER_GROUP_MODAL_INITIAL_VALUES.spgShort,
    spgDesc:
      toDisplayValue(getFirstDefinedValue(source, SUPPLIER_GROUP_DETAIL_KEYS.description)) ||
      SUPPLIER_GROUP_MODAL_INITIAL_VALUES.spgDesc,
    spgIsActive: toSelectBoolean(
      getFirstDefinedValue(source, SUPPLIER_GROUP_DETAIL_KEYS.active),
      SUPPLIER_GROUP_MODAL_INITIAL_VALUES.spgIsActive,
    ),
  };
}

function buildSupplierGroupModalFields(): ERPDynamicModalField[] {
  return [
    {
      name: "spgName",
      label: "Group Name",
      colSpan: 2,
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Group Name must be at least 2 characters.",
      },
    },
    {
      name: "spgShort",
      label: "Short Name",
      colSpan: 2,
    },
    {
      name: "spgDesc",
      label: "Description",
      colSpan: 2,
    },
    {
      name: "spgIsActive",
      label: "Is Active",
      type: "checkbox",
    },
  ];
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
    .filter((entry) => Number.isInteger(entry) && entry >= 0);

  return Array.from(new Set(parsedValues));
}
function toCollectionDaysInput(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }
  const normalized = value
    .map((entry) => (typeof entry === "number" ? entry : Number(entry)))
    .filter((entry) => Number.isInteger(entry) && entry >= 0)
    .map((entry) => String(entry));
  return Array.from(new Set(normalized)).join(",");
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
function toGstTypeValue(value: string): string {
  const normalized = value.trim().toUpperCase();
  return GST_TYPE_VALUES.has(normalized) ? normalized : "";
}
function validateSupplierGstin(
  value: string,
  values: Record<string, string>,
): string | null {
  const normalized = value.trim();
  const gstType = toGstTypeValue(values.supGstType ?? "");
  if (!normalized) {
    return gstType === "REGULAR"
      ? "GST No is required when GST Type is Regular."
      : null;
  }
  return validateGstin(normalized);
}
function validateSupplierPan(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalized)
    ? null
    : "PAN No must be 10 characters (e.g., ABCDE1234F).";
}
export default function SuppliersMasterPage() {
  const stateModalControllerRef = useRef<ERPDynamicModalController | null>(null);
  const supplierGroupModalControllerRef =
    useRef<ERPDynamicModalController | null>(null);
  const { getAll: getSupplierGroupLookup } = useApi<unknown>(SUPPLIER_GROUP_LOOKUP_ENDPOINT);
  const {
    getAll: getSupplierGroupById,
    loading: supplierGroupDetailsLoading,
    error: supplierGroupDetailsError,
    reset: resetSupplierGroupDetailsState,
  } = useApi<unknown>(SUPPLIER_GROUP_GET_ENDPOINT, {
    toast: {
      success: false,
    },
  });
  const {
    run: upsertSupplierGroup,
    loading: supplierGroupSaveLoading,
    error: supplierGroupSaveError,
    reset: resetSupplierGroupSaveState,
  } = useApi<unknown, Record<string, unknown>>(SUPPLIER_GROUP_CREATE_ENDPOINT, {
    method: "POST",
  });
  const { getAll: getCompanyLookup } = useApi<unknown>(COMPANY_LOOKUP_ENDPOINT);
  const { getAll: getBranchLookup } = useApi<unknown>(BRANCH_LOOKUP_ENDPOINT);
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
  } = useApi<unknown, Record<string, unknown>>(STATE_CREATE_ENDPOINT, {
    method: "POST",
  });
  const [supplierGroupOptions, setSupplierGroupOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [companyOptions, setCompanyOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [branchOptions, setBranchOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [stateOptions, setStateOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [stateCodeByName, setStateCodeByName] = useState<Record<string, string>>({});
  const [stateNameByCode, setStateNameByCode] = useState<Record<string, string>>({});
  const [editingStateCode, setEditingStateCode] = useState<string | null>(null);
  const [editingSupplierGroupId, setEditingSupplierGroupId] = useState<string | null>(
    null,
  );
  const gstLookupCacheRef = useRef<Record<string, Record<string, string>>>({});
  const refreshSupplierGroupOptions = useCallback(async () => {
    const payload = await getSupplierGroupLookup(SUPPLIER_GROUP_LOOKUP_QUERY);
    setSupplierGroupOptions(buildSupplierGroupOptions(payload));
  }, [getSupplierGroupLookup]);
  const refreshStateOptions = useCallback(async () => {
    const payload = await getStateLookup(STATE_LOOKUP_QUERY);
    setStateOptions(buildStateNameOptions(payload));
    setStateCodeByName(buildStateCodeByName(payload));
    setStateNameByCode(buildStateNameByCode(payload));
  }, [getStateLookup]);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const [supplierGroupPayload, companyPayload, branchPayload, statePayload] =
          await Promise.all([
            getSupplierGroupLookup(SUPPLIER_GROUP_LOOKUP_QUERY),
            getCompanyLookup(COMPANY_LOOKUP_QUERY),
            getBranchLookup(BRANCH_LOOKUP_QUERY),
            getStateLookup(STATE_LOOKUP_QUERY),
          ]);
        if (!mounted) {
          return;
        }
        setSupplierGroupOptions(buildSupplierGroupOptions(supplierGroupPayload));
        setCompanyOptions(buildCompanyOptions(companyPayload));
        setBranchOptions(buildBranchOptions(branchPayload));
        setStateOptions(buildStateNameOptions(statePayload));
        setStateCodeByName(buildStateCodeByName(statePayload));
        setStateNameByCode(buildStateNameByCode(statePayload));
      } catch {
        if (mounted) {
          setSupplierGroupOptions([]);
          setCompanyOptions([]);
          setBranchOptions([]);
          setStateOptions([]);
          setStateCodeByName({});
          setStateNameByCode({});
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getBranchLookup, getCompanyLookup, getStateLookup, getSupplierGroupLookup]);
  const stateCreateModalFields = useMemo(() => buildStateModalFields(false), []);
  const stateUpdateModalFields = useMemo(() => buildStateModalFields(true), []);
  const stateModalVariants = useMemo<ERPDynamicModalVariant[]>(
    () => [
      {
        key: "state-create",
        cardTitle: "Create State",
        cardDescription: "Create a new state code.",
        cardButtonLabel: "Create",
        modalTitle: "New State",
        modalDescription: "Create state from supplier form.",
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
        modalDescription: "Update state from supplier form.",
        submitLabel: stateSaveLoading ? "Updating..." : "Update",
        accent: "emerald",
        fields: stateUpdateModalFields,
      },
    ],
    [stateCreateModalFields, stateSaveLoading, stateUpdateModalFields],
  );
  const supplierGroupModalFields = useMemo(
    () => buildSupplierGroupModalFields(),
    [],
  );
  const supplierGroupModalVariants = useMemo<ERPDynamicModalVariant[]>(
    () => [
      {
        key: "supplier-group-create",
        cardTitle: "Create Supplier Group",
        cardDescription: "Create a new supplier group.",
        cardButtonLabel: "Create",
        modalTitle: "New Supplier Group",
        modalDescription: "Create supplier group from supplier form.",
        submitLabel: supplierGroupSaveLoading ? "Saving..." : "Save",
        accent: "blue",
        fields: supplierGroupModalFields,
      },
      {
        key: "supplier-group-update",
        cardTitle: "Update Supplier Group",
        cardDescription: "Update existing supplier group.",
        cardButtonLabel: "Update",
        modalTitle: "Edit Supplier Group",
        modalDescription: "Update supplier group from supplier form.",
        submitLabel: supplierGroupSaveLoading ? "Updating..." : "Update",
        accent: "emerald",
        fields: supplierGroupModalFields,
      },
    ],
    [supplierGroupModalFields, supplierGroupSaveLoading],
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
      const matchedOption = resolveOptionFromShortcut(payload, stateOptions);
      if (!matchedOption) {
        toast.info("Type/select an existing state, then press Alt+A.");
        return;
      }
      const matchedStateName = matchedOption.value.trim();
      const matchedStateCode = stateCodeByName[matchedStateName]?.trim().toUpperCase() ?? "";
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
        const detailSource = extractDetailSource(detailPayload, STATE_LOOKUP_ARRAY_KEYS);
        stateModalControllerRef.current?.openModal("state-update", {
          values: detailSource
            ? mapStateDetailToFormValues(detailSource)
            : {
                ...STATE_MODAL_INITIAL_VALUES,
                stateCode: matchedStateCode,
                stateName: matchedStateName,
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
      stateCodeByName,
      stateOptions,
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
        tinCode: toNullableString(toUpper(values.tinCode ?? "")),
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

  const handleSupplierGroupCreateShortcut = useCallback(
    (payload: ERPDynamicSearchShortcutPayload) => {
      resetSupplierGroupSaveState();
      resetSupplierGroupDetailsState();
      setEditingSupplierGroupId(null);
      supplierGroupModalControllerRef.current?.openModal("supplier-group-create", {
        values: {
          ...SUPPLIER_GROUP_MODAL_INITIAL_VALUES,
          spgName: payload.query.trim(),
        },
      });
    },
    [resetSupplierGroupDetailsState, resetSupplierGroupSaveState],
  );

  const handleSupplierGroupEditShortcut = useCallback(
    async (payload: ERPDynamicSearchShortcutPayload) => {
      const selectedGroupId = payload.value.trim();
      if (!selectedGroupId) {
        toast.info("Select an existing supplier group to edit.");
        return;
      }
      const matchedOption = supplierGroupOptions.find(
        (option) => option.value.trim() === selectedGroupId,
      );
      if (!matchedOption) {
        toast.info("Select an existing supplier group to edit.");
        return;
      }
      const matchedGroupId = matchedOption.value.trim();
      resetSupplierGroupSaveState();
      resetSupplierGroupDetailsState();
      setEditingSupplierGroupId(matchedGroupId);
      try {
        const detailPayload = await getSupplierGroupById({
          spgId: matchedGroupId,
        });
        const detailSource = extractDetailSource(
          detailPayload,
          SUPPLIER_GROUP_LOOKUP_ARRAY_KEYS,
        );
        supplierGroupModalControllerRef.current?.openModal("supplier-group-update", {
          values: detailSource
            ? mapSupplierGroupDetailToFormValues(detailSource)
            : {
                ...SUPPLIER_GROUP_MODAL_INITIAL_VALUES,
                spgName: matchedOption.label,
              },
        });
      } catch {
        // Error UI is handled by useApi.
      }
    },
    [
      getSupplierGroupById,
      resetSupplierGroupDetailsState,
      resetSupplierGroupSaveState,
      supplierGroupOptions,
    ],
  );

  const handleSupplierGroupModalSubmit = useCallback(
    async ({ variantKey, values }: ERPDynamicModalSubmitPayload) => {
      const isUpdate = variantKey === "supplier-group-update";
      const payload: Record<string, unknown> = {
        spgName: (values.spgName ?? "").trim(),
        spgShort: toNullableString(values.spgShort ?? ""),
        spgDesc: toNullableString(values.spgDesc ?? ""),
        spgIsActive: (values.spgIsActive ?? "true") === "true",
      };
      if (isUpdate) {
        if (!editingSupplierGroupId) {
          return;
        }
        payload.spgId = editingSupplierGroupId;
      }
      await upsertSupplierGroup({ body: payload });
      setEditingSupplierGroupId(null);
      await refreshSupplierGroupOptions();
    },
    [editingSupplierGroupId, refreshSupplierGroupOptions, upsertSupplierGroup],
  );

  const handleSupplierGroupModalCancel = useCallback(() => {
    if (supplierGroupSaveLoading || supplierGroupDetailsLoading) {
      return;
    }
    resetSupplierGroupSaveState();
    resetSupplierGroupDetailsState();
    setEditingSupplierGroupId(null);
  }, [
    resetSupplierGroupDetailsState,
    resetSupplierGroupSaveState,
    supplierGroupDetailsLoading,
    supplierGroupSaveLoading,
  ]);

  const handleSupplierGstinValueChange =
    useCallback<ERPDynamicFieldValueChangeHandler>(
      async ({ value }) => {
        const normalizedGstin = value.trim().toUpperCase();
        const normalizedValuePatch =
          normalizedGstin && normalizedGstin !== value
            ? { supGstNo: normalizedGstin }
            : undefined;

        if (!GST_LOOKUP_PATTERN.test(normalizedGstin)) {
          return {
            ...(normalizedValuePatch ? { values: normalizedValuePatch } : {}),
            errors: { supGstNo: null },
          };
        }

        const cachedValues = gstLookupCacheRef.current[normalizedGstin];
        if (cachedValues) {
          return {
            values: cachedValues,
            errors: { supGstNo: null },
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
                supGstNo: getLookupErrorMessage(
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
                supGstNo: "GST details were not available for this GSTIN.",
              },
            };
          }

          const resolvedValues = buildSupplierLookupValues(
            normalizedGstin,
            lookupSource,
            stateNameByCode,
          );
          gstLookupCacheRef.current[normalizedGstin] = resolvedValues;
          return {
            values: resolvedValues,
            errors: { supGstNo: null },
          };
        } catch {
          return {
            ...(normalizedValuePatch ? { values: normalizedValuePatch } : {}),
            errors: {
              supGstNo:
                "Unable to load GST details right now. Please try again.",
            },
          };
        }
      },
      [stateNameByCode],
    );
  const handleSupplierStateValueChange =
    useCallback<ERPDynamicFieldValueChangeHandler>(({ value }) => ({
      values: {
        supRegionStateName: value.trim(),
      },
    }), []);

  const supplierFormFields = useMemo(
    () =>
      buildSupplierFormFields(
        supplierGroupOptions,
        companyOptions,
        branchOptions,
        stateOptions,
        handleSupplierGroupCreateShortcut,
        handleSupplierGroupEditShortcut,
        handleStateCreateShortcut,
        handleStateEditShortcut,
        handleSupplierStateValueChange,
        handleSupplierGstinValueChange,
      ),
    [
      branchOptions,
      companyOptions,
      handleSupplierGstinValueChange,
      handleSupplierStateValueChange,
      handleStateCreateShortcut,
      handleStateEditShortcut,
      handleSupplierGroupCreateShortcut,
      handleSupplierGroupEditShortcut,
      stateOptions,
      supplierGroupOptions,
    ],
  );
  return (
    <>
      <CrudMasterPage
        title="Supplier"
        entityLabel="supplier"
        entityLabelPlural="suppliers"
        apiEndpoints={API_ENDPOINTS}
        gridTableName={GRID_TABLE_NAME}
        lookupKeys={LOOKUP_KEYS}
        requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
        styles={styles}
        listTitle="Supplier List"
        createLabel="Add Supplier"
        codeColumnHeader="Purchase Type"
        nameColumnHeader="Supplier Name"
        nameFieldLabel="Supplier Name"
        nameFieldPlaceholder="ABC Distributors"
        modalPanelStyle={CUSTOMER_MODAL_PANEL_STYLE}
        modalFormGridColumns={3}
        modalStackLabels
        formTitle="Supplier Form"
        formDescription="Create and update suppliers."
        customFields={supplierFormFields}
        createInitialValues={SUPPLIER_INITIAL_FORM_VALUES}
        mapFormValues={({ source, defaults }) => {
          const rowSource = source ?? {};
          const mappedStateName = toDisplayValue(rowSource.supStateName);
          return {
            ...SUPPLIER_INITIAL_FORM_VALUES,
            supCompanyId: toDisplayValue(rowSource.supCompanyId),
            supBranchId: toDisplayValue(rowSource.supBranchId),
            supGroupId: toDisplayValue(rowSource.supGroupId),
            supPurchaseType:
              toDisplayValue(
                rowSource.supPurchaseType ?? getFirstDefinedValue(rowSource, LOOKUP_KEYS.code),
              ) ||
              defaults.searchCode ||
              SUPPLIER_INITIAL_FORM_VALUES.supPurchaseType,
            supName:
              toDisplayValue(rowSource.supName ?? getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) ||
              defaults.masterName ||
              SUPPLIER_INITIAL_FORM_VALUES.supName,
            supShort:
              toDisplayValue(rowSource.supShort ?? getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) ||
              defaults.masterShortName ||
              SUPPLIER_INITIAL_FORM_VALUES.supShort,
            supAddr1: toDisplayValue(rowSource.supAddr1),
            supAddr2: toDisplayValue(rowSource.supAddr2),
            supAddr3: toDisplayValue(rowSource.supAddr3),
            supCity: toDisplayValue(rowSource.supCity),
            supDistrict: toDisplayValue(rowSource.supDistrict),
            supStateName: mappedStateName,
            supCountry:
              toDisplayValue(rowSource.supCountry) || SUPPLIER_INITIAL_FORM_VALUES.supCountry,
            supPincode: toDisplayValue(rowSource.supPincode),
            supTel: toDisplayValue(rowSource.supTel),
            supPhone: toDisplayValue(rowSource.supPhone),
            supMailId: toDisplayValue(rowSource.supMailId),
            supWhatsappNo: toDisplayValue(rowSource.supWhatsappNo),
            supWebsiteAddress: toDisplayValue(rowSource.supWebsiteAddress),
            supChequePreName: toDisplayValue(rowSource.supChequePreName),
            supNotes:
              toDisplayValue(
                rowSource.supNotes ?? getFirstDefinedValue(rowSource, LOOKUP_KEYS.description),
              ) ||
              defaults.masterDescription ||
              SUPPLIER_INITIAL_FORM_VALUES.supNotes,
            supCreditDays:
              toDisplayValue(rowSource.supCreditDays) || SUPPLIER_INITIAL_FORM_VALUES.supCreditDays,
            supCashDiscPerc:
              toDisplayValue(rowSource.supCashDiscPerc) ||
              SUPPLIER_INITIAL_FORM_VALUES.supCashDiscPerc,
            supCollectionDays: toCollectionDaysInput(rowSource.supCollectionDays),
            supGstNo: toDisplayValue(rowSource.supGstNo),
            supStateCode:
              stateCodeByName[mappedStateName] || toDisplayValue(rowSource.supStateCode),
            supPanNo: toDisplayValue(rowSource.supPanNo),
            supGstType:
              toGstTypeValue(toDisplayValue(rowSource.supGstType)) ||
              SUPPLIER_INITIAL_FORM_VALUES.supGstType,
            supSupCst: toDisplayValue(rowSource.supSupCst),
            supDrugLiscenceNo: toDisplayValue(rowSource.supDrugLiscenceNo),
            supRegionName: toDisplayValue(rowSource.supRegionName),
            supRegionAddr1: toDisplayValue(rowSource.supRegionAddr1),
            supRegionAddr2: toDisplayValue(rowSource.supRegionAddr2),
            supRegionAddr3: toDisplayValue(rowSource.supRegionAddr3),
            supRegionCity: toDisplayValue(rowSource.supRegionCity),
            supRegionDistrict: toDisplayValue(rowSource.supRegionDistrict),
            supRegionStateName:
              mappedStateName || toDisplayValue(rowSource.supRegionStateName),
            supRegionCountry:
              toDisplayValue(rowSource.supRegionCountry) ||
              SUPPLIER_INITIAL_FORM_VALUES.supRegionCountry,
            supBilledDate: toDateInputValue(rowSource.supBilledDate),
            supSortOrder:
              toDisplayValue(
                rowSource.supSortOrder ?? getFirstDefinedValue(rowSource, LOOKUP_KEYS.position),
              ) ||
              defaults.position ||
              SUPPLIER_INITIAL_FORM_VALUES.supSortOrder,
            supIsActive: toSelectBoolean(
              rowSource.supIsActive ?? getFirstDefinedValue(rowSource, SUPPLIER_IS_ACTIVE_KEYS),
              "true",
            ),
            supStateId: toDisplayValue(rowSource.supStateId),
            supCreatedBy: toDisplayValue(rowSource.supCreatedBy),
            supModifiedBy: toDisplayValue(rowSource.supModifiedBy),
          };
        }}
        buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
          const selectedStateName = (values.supStateName ?? "").trim();
          const resolvedStateCode =
            stateCodeByName[selectedStateName] ?? toUpper(values.supStateCode ?? "");
          const resolvedRegionStateName =
            selectedStateName || (values.supRegionStateName ?? "").trim();

          const payload: Record<string, unknown> = {
            supCompanyId: toNullableLookupSelection(values.supCompanyId ?? ""),
            supBranchId: toNullableLookupSelection(values.supBranchId ?? ""),
            supGroupId: (values.supGroupId ?? "").trim(),
            supPurchaseType: (values.supPurchaseType ?? "").trim(),
            supName: (values.supName ?? "").trim(),
            supShort: toNullableString(values.supShort ?? ""),
            supAddr1: toNullableString(values.supAddr1 ?? ""),
            supAddr2: toNullableString(values.supAddr2 ?? ""),
            supAddr3: toNullableString(values.supAddr3 ?? ""),
            supCity: toNullableString(values.supCity ?? ""),
            supDistrict: toNullableString(values.supDistrict ?? ""),
            supStateName: selectedStateName,
            supCountry: toNullableString(values.supCountry ?? ""),
            supPincode: toNullableString(values.supPincode ?? ""),
            supTel: toNullableString(values.supTel ?? ""),
            supPhone: toNullableString(values.supPhone ?? ""),
            supMailId: toNullableString(values.supMailId ?? ""),
            supWhatsappNo: toNullableString(values.supWhatsappNo ?? ""),
            supWebsiteAddress: toNullableString(values.supWebsiteAddress ?? ""),
            supChequePreName: toNullableString(values.supChequePreName ?? ""),
            supNotes: toNullableString(values.supNotes ?? ""),
            supCreditDays: toNonNegativeInteger(values.supCreditDays ?? "0", 0),
            supCashDiscPerc: toNonNegativeNumber(values.supCashDiscPerc ?? "0", 0),
            supCollectionDays: parseCollectionDays(values.supCollectionDays ?? ""),
            supGstNo: toNullableString(toUpper(values.supGstNo ?? "")),
            supStateCode: resolvedStateCode,
            supPanNo: toNullableString(toUpper(values.supPanNo ?? "")),
            supGstType: toGstTypeValue(values.supGstType ?? ""),
            supSupCst: toNullableString(values.supSupCst ?? ""),
            supDrugLiscenceNo: toNullableString(values.supDrugLiscenceNo ?? ""),
            supRegionName: toNullableString(values.supRegionName ?? ""),
            supRegionAddr1: toNullableString(values.supRegionAddr1 ?? ""),
            supRegionAddr2: toNullableString(values.supRegionAddr2 ?? ""),
            supRegionAddr3: toNullableString(values.supRegionAddr3 ?? ""),
            supRegionCity: toNullableString(values.supRegionCity ?? ""),
            supRegionDistrict: toNullableString(values.supRegionDistrict ?? ""),
            supRegionStateName: toNullableString(resolvedRegionStateName),
            supRegionCountry: toNullableString(values.supRegionCountry ?? ""),
            supBilledDate: toNullableDate(values.supBilledDate ?? ""),
            supSortOrder: toNullableInteger(values.supSortOrder ?? ""),
            supIsActive: (values.supIsActive ?? "true") === "true",
            supStateId: toNullableString(values.supStateId ?? ""),
            supCreatedBy: toNullableString(values.supCreatedBy ?? ""),
            supModifiedBy: toNullableString(values.supModifiedBy ?? ""),
          };
          if (shouldUpdate && editingItemId !== null) {
            payload.supId = toUpdateId(editingItemId);
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
        title="Supplier Group Form"
        description="Create and update supplier groups."
        variants={supplierGroupModalVariants}
        submitError={supplierGroupSaveError || supplierGroupDetailsError}
        panelStyle={SUPPLIER_GROUP_MODAL_PANEL_STYLE}
        controllerRef={supplierGroupModalControllerRef}
        onSubmit={handleSupplierGroupModalSubmit}
        onCancel={handleSupplierGroupModalCancel}
      />
    </>
  );
}
