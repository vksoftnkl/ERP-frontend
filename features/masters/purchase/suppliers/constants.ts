import type { CSSProperties } from "react";
import type { ERPDynamicSelectOption } from "@/components/design-system/ui/dynamic-modal-form";
import { COLLECTION_DAY_OPTIONS, GST_TYPE_OPTIONS } from "@/utils/constant";
// API Endpoints
export const API_ENDPOINTS = {
 list: "/configured-grid-sql/run?grid_id=17",
  getById: "/suppliers/get",
  create: "/suppliers/create",
  delete: "/suppliers/delete",
} as const;
// Grid/Table Configuration
export const GRID_TABLE_NAME = "suppliers";
// Modal Panel Styles
export const CUSTOMER_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(62vw, 62rem)",
  height: "75vh",
  maxHeight: "75vh",
};
export const STATE_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(34vw, 34rem)",
  maxHeight: "75vh",
};
export const SUPPLIER_GROUP_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(42vw, 42rem)",
  maxHeight: "75vh",
};
// Related Master Endpoints
export const SUPPLIER_GROUP_LOOKUP_ENDPOINT =
  "/master-lookups/name-id/all-accounts-and-masters";
export const SUPPLIER_GROUP_GET_ENDPOINT = "/supplier-groups/get";
export const SUPPLIER_GROUP_CREATE_ENDPOINT = "/supplier-groups/create";
export const COMPANY_LOOKUP_ENDPOINT =
  "/master-lookups/name-id/all-accounts-and-masters";
export const BRANCH_LOOKUP_ENDPOINT =
  "/master-lookups/name-id/all-accounts-and-masters";
export const STATE_LOOKUP_ENDPOINT =
  "/master-lookups/name-id/all-accounts-and-masters";
export const STATE_GET_ENDPOINT = "/state-code-masters/get";
export const STATE_CREATE_ENDPOINT = "/state-code-masters/create";
// Lookup Queries
export const SUPPLIER_GROUP_LOOKUP_QUERY = {
  module: "supplierGroups",
  limit: "20",
} as const;
export const COMPANY_LOOKUP_QUERY = {
  module: "companies",
  limit: "100",
} as const;
export const BRANCH_LOOKUP_QUERY = {
  module: "branches",
  limit: "100",
} as const;
export const STATE_LOOKUP_QUERY = {
  module: "stateCodes",
  limit: "100",
} as const;
// GST Lookup Configuration
export const GST_LOOKUP_ENDPOINT = "/api/gst/search";
export const GST_LOOKUP_PATTERN = /^[0-9A-Z]{15}$/;
export const GST_LOOKUP_HELPER_TEXT =
  "Type a 15-character GSTIN to load supplier details automatically.";
// Default Lookup Options
export const DEFAULT_LOOKUP_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "",
};
export const PURCHASE_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "Goods Supplier", label: "Goods Supplier" },
];
// Lookup Keys for Data Extraction
export const LOOKUP_KEYS = {
  id: ["supId", "sup_id", "supplier_id", "supplierId", "id", "_id"],
  code: ["supPurchaseType", "sup_purchase_type", "supGstNo", "sup_gst_no", "code"],
  name: ["supName", "sup_name", "supplier_name", "supplierName", "name"],
  short: ["supShort", "sup_short", "short_name", "shortName", "short"],
  alias: [
    "supPurchaseType",
    "sup_purchase_type",
    "supGroupName",
    "sup_group_name",
    "alias",
  ],
  active: ["supIsActive", "sup_is_active", "isActive", "is_active", "status"],
  position: ["supSortOrder", "sup_sort_order", "position", "sort"],
  description: ["supNotes", "sup_notes", "notes", "description", "desc"],
  array: ["data", "items", "results", "rows", "list", "suppliers"],
} as const;
// Request Payload Keys for API Submission
export const REQUEST_PAYLOAD_KEYS = {
  id: "supId",
  name: "supName",
  alias: "supPurchaseType",
  short: "supShort",
  description: "supNotes",
  sort: "supSortOrder",
} as const;
export const SUPPLIER_IS_ACTIVE_KEYS = [
  "supIsActive",
  "sup_is_active",
  "isActive",
  "is_active",
  "status",
] as const;
// Supplier Group Lookup Keys
export const SUPPLIER_GROUP_LOOKUP_ARRAY_KEYS = [
  "data",
  "items",
  "results",
  "rows",
  "list",
  "supplierGroups",
  "supplier_groups",
] as const;
export const SUPPLIER_GROUP_ID_KEYS = [
  "spgId",
  "spg_id",
  "id",
  "_id",
  "value",
] as const;
export const SUPPLIER_GROUP_NAME_KEYS = [
  "spgName",
  "spg_name",
  "name",
  "label",
] as const;
// State Lookup Keys
export const STATE_LOOKUP_ARRAY_KEYS = [
  "data",
  "items",
  "results",
  "rows",
  "list",
  "stateCodes",
  "state_codes",
  "states",
] as const;
export const STATE_LOOKUP_NAME_KEYS = [
  "stateName",
  "state_name",
  "name",
  "label",
] as const;
export const STATE_LOOKUP_CODE_KEYS = [
  "id",
  "value",
  "stateCode",
  "state_code",
  "code",
] as const;
// GST Lookup Keys
export const GST_LOOKUP_SOURCE_KEYS = ["data", "taxpayer", "result"] as const;
export const GST_LEGAL_NAME_KEYS = ["lgnm", "legalName", "legal_name"] as const;
export const GST_TRADE_NAME_KEYS = ["tradeNam", "tradeName", "trade_name"] as const;
export const GST_REGISTRATION_TYPE_KEYS = [
  "dty",
  "gstType",
  "gst_type",
  "registrationType",
  "registration_type",
] as const;
export const GST_PRIMARY_ADDRESS_KEYS = [
  "pradr",
  "principalAddress",
  "primaryAddress",
  "primary_address",
] as const;
export const GST_ADDRESS_KEYS = ["addr", "address"] as const;
export const GST_ADDRESS_BUILDING_KEYS = ["bno", "flno", "bnm"] as const;
export const GST_ADDRESS_LOCALITY_KEYS = ["st", "loc"] as const;
export const GST_ADDRESS_DISTRICT_KEYS = ["dst", "district"] as const;
export const GST_ADDRESS_CITY_KEYS = ["city", "loc"] as const;
export const GST_ADDRESS_STATE_KEYS = [
  "stcd",
  "state",
  "stateName",
  "state_name",
] as const;
export const GST_ADDRESS_PIN_KEYS = ["pncd", "pin", "pincode"] as const;
// State Modal Detail Keys
export const STATE_DETAIL_KEYS = {
  code: ["stateCode", "state_code", "code"],
  name: ["stateName", "state_name", "name", "label"],
  stateUt: ["stateUt", "state_ut", "state_ut_flag"],
  tinCode: ["tinCode", "tin_code", "tin"],
  active: ["isActive", "is_active", "active", "status"],
} as const;
// Supplier Group Modal Detail Keys
export const SUPPLIER_GROUP_DETAIL_KEYS = {
  id: ["spgId", "spg_id", "id", "_id"],
  name: ["spgName", "spg_name", "name", "label"],
  short: ["spgShort", "spg_short", "short", "shortName"],
  description: ["spgDesc", "spg_desc", "description", "desc"],
  active: ["spgIsActive", "spg_is_active", "isActive", "is_active", "status"],
} as const;

// GST Type Values
export const GST_TYPE_VALUES = new Set(GST_TYPE_OPTIONS.map((option) => option.value));

// Modal Initial Form Values
export const STATE_MODAL_INITIAL_VALUES = {
  stateCode: "",
  stateName: "",
  stateUt: "false",
  tinCode: "",
  isActive: "true",
} as const;

export const SUPPLIER_GROUP_MODAL_INITIAL_VALUES = {
  spgName: "",
  spgShort: "",
  spgDesc: "",
  spgIsActive: "true",
} as const;

// Supplier Form Initial Values
export const SUPPLIER_INITIAL_FORM_VALUES = {
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
  supCreatedBy: "",
  supModifiedBy: "",
} as const;

// Re-export shared constants
export { COLLECTION_DAY_OPTIONS, GST_TYPE_OPTIONS };
