import { type CSSProperties } from "react";
import type {
  ERPDynamicFieldValidation,
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import { DEFAULT_LOOKUP_ARRAY_KEYS } from "@/app/master/_shared/crud-utils";

export const API_ENDPOINTS = {
  list: "/customers/list",
  getById: "/customers/get",
  create: "/customers/create",
  delete: "/customers/delete",
} as const;
export const GRID_TABLE_NAME = "customers";
export const STATE_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
export const STATE_GET_ENDPOINT = "/state-code-masters/get";
export const STATE_UPSERT_ENDPOINT = "/state-code-masters/create";
export const AREA_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
export const AREA_GET_ENDPOINT = "/areas/get";
export const AREA_UPSERT_ENDPOINT = "/areas/create";
export const CUSTOMER_GROUP_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
export const CUSTOMER_GROUP_GET_ENDPOINT = "/customer-groups/get";
export const CUSTOMER_GROUP_UPSERT_ENDPOINT = "/customer-groups/create";
export const COMPANY_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
export const BRANCH_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
export const PRICE_LEVEL_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
export const CITY_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
export const CUSTOMER_GROUP_LOOKUP_QUERY = {
  module: "customerGroups",
} as const;
export const CUSTOMER_GROUP_SEARCH_DEBOUNCE_MS = 250;
export const AREA_LOOKUP_REQUEST_QUERY = {
  module: "areas",
  limit: "20",
} as const;
export const STATE_LOOKUP_REQUEST_QUERY = {
  module: "stateCodes",
  limit: "100",
} as const;
export const CITY_LOOKUP_REQUEST_QUERY = {
  module: "cities",
  limit: "20",
} as const;
export const BRANCH_LOOKUP_REQUEST_QUERY = {
  module: "branches",
  limit: "100",
} as const;
export const COMPANY_LOOKUP_REQUEST_QUERY = {
  module: "companies",
  limit: "100",
} as const;
export const PRICE_LEVEL_LOOKUP_REQUEST_QUERY = {
  module: "priceLevels",
  limit: "100",
} as const;
export const GST_LOOKUP_ENDPOINT = "/api/gst/search";
export const GST_LOOKUP_PATTERN = /^[0-9A-Z]{15}$/;
export const GST_LOOKUP_HELPER_TEXT =
  "Type a 15-character GSTIN to load customer details automatically.";
export const LOOKUP_KEYS = {
  id: ["cusId", "cus_id", "customer_id", "customerId", "id", "_id"],
  code: ["cusCode", "cus_code", "customer_code", "customerCode", "code"],
  name: ["cusName", "cus_name", "customer_name", "customerName", "name"],
  short: ["cusShort", "cus_short", "customer_short", "short_name", "shortName", "short"],
  alias: ["cusTitle", "cus_title", "customer_title", "alias", "cusCode", "cus_code"],
  active: ["cusIsActive", "cus_is_active", "active", "is_active", "isActive", "status"],
  position: ["cusSortOrder", "cus_sort_order", "sort", "position"],
  description: ["cusNotes", "cus_notes", "notes", "description", "desc"],
  array: ["data", "items", "results", "rows", "list", "customers"],
} as const;
export const REQUEST_PAYLOAD_KEYS = {
  id: "cusId",
  name: "cusName",
  alias: "cusTitle",
  short: "cusShort",
  description: "cusNotes",
  sort: "cusSortOrder",
} as const;
export const STATE_LOOKUP_KEYS = {
  code: ["id", "value", "stateCode", "state_code", "code"],
  name: ["stateName", "state_name", "name", "label"],
  array: [...DEFAULT_LOOKUP_ARRAY_KEYS, "stateCodes", "state_codes", "states"],
} as const;
export const CITY_LOOKUP_KEYS = {
  array: [...DEFAULT_LOOKUP_ARRAY_KEYS, "cities"],
  id: ["ctmId", "ctm_id", "city_id", "cityId", "id", "_id", "value"],
  label: ["ctmName", "ctm_name", "city_name", "cityName", "name", "label"],
} as const;
export const STATE_DETAIL_ARRAY_KEYS = [...DEFAULT_LOOKUP_ARRAY_KEYS, "stateCodes", "state_codes", "states"] as const;
export const STATE_DETAIL_KEYS = {
  code: ["stateCode", "state_code", "code"],
  name: ["stateName", "state_name", "name", "label"],
  stateUt: ["stateUt", "state_ut", "state_ut_flag"],
  tinCode: ["tinCode", "tin_code", "tin"],
  active: ["isActive", "is_active", "active", "status"],
} as const;
export const AREA_DETAIL_ARRAY_KEYS = [...DEFAULT_LOOKUP_ARRAY_KEYS, "areas"] as const;
export const AREA_DETAIL_KEYS = {
  id: ["armId", "arm_id", "area_id", "areaId", "id", "_id"],
  name: ["armName", "arm_name", "area_name", "areaName", "name"],
  alias: ["armAlias", "arm_alias", "area_alias", "alias"],
  short: ["armShort", "arm_short", "area_short", "short_name", "shortName", "short"],
  cityId: ["armCityId", "arm_city_id", "city_id", "cityId"],
  distance: ["armDistanceKm", "arm_distance_km", "distance_km", "distanceKm"],
  collectionDays: ["armCollectionDays", "arm_collection_days", "collection_days", "collectionDays"],
  sort: ["armSort", "arm_sort", "position", "sort"],
  active: ["armIsActive", "arm_is_active", "isActive", "is_active", "status"],
} as const;
export const GROUP_DETAIL_ARRAY_KEYS = [
  ...DEFAULT_LOOKUP_ARRAY_KEYS,
  "customerGroups",
  "customer_groups",
] as const;
export const GROUP_DETAIL_KEYS = {
  id: ["cgrId", "cgr_id", "id", "_id"],
  name: ["cgrName", "cgr_name", "group_name", "groupName", "name"],
  alias: ["cgrAlias", "cgr_alias", "group_alias", "alias"],
  short: ["cgrShort", "cgr_short", "short", "shortName"],
  narration: ["cgrNarration", "cgr_narration", "narration", "description", "desc"],
  order: ["cgrOrder", "cgr_order", "order", "position", "sort"],
  discPerc: ["cgrDiscPerc", "cgr_disc_perc", "discPerc", "discount"],
  collectionDays: ["cgrCollectionDays", "cgr_collection_days", "collectionDays"],
  debitAllowed: ["cgrDebitAllowed", "cgr_debit_allowed", "debitAllowed"],
  debitDays: ["cgrDebitDays", "cgr_debit_days", "debitDays"],
  debitLimit: ["cgrDebitLimit", "cgr_debit_limit", "debitLimit"],
  billsLimit: ["cgrBillsLimit", "cgr_bills_limit", "billsLimit"],
  overdueBilling: ["cgrOverdueBilling", "cgr_overdue_billing", "overdueBilling"],
  active: ["cgrIsActive", "cgr_is_active", "isActive", "is_active", "status"],
} as const;
export const DEFAULT_STATE_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select State",
};
export const DEFAULT_AREA_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Area",
};
export const DEFAULT_CITY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select City",
};
export const DEFAULT_GROUP_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Customer Group",
};
export const DEFAULT_BRANCH_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Branch",
};
export const DEFAULT_COMPANY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Company",
};
export const ALL_COMPANY_OPTION_VALUE = "__ALL_COMPANY__";
export const ALL_BRANCH_OPTION_VALUE = "__ALL_BRANCH__";
export const ALL_COMPANY_OPTION: ERPDynamicSelectOption = {
  value: ALL_COMPANY_OPTION_VALUE,
  label: "All Company",
};
export const ALL_BRANCH_OPTION: ERPDynamicSelectOption = {
  value: ALL_BRANCH_OPTION_VALUE,
  label: "All Branch",
};
export const DEFAULT_PRICE_LEVEL_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Price Level",
};
export const AREA_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(42vw, 42rem)",
  maxHeight: "75vh",
};
export const STATE_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(34vw, 34rem)",
  maxHeight: "75vh",
};
export const GROUP_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(42vw, 42rem)",
  maxHeight: "75vh",
};
export const GST_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "REGULAR", label: "Regular" },
  { value: "COMPOSITION", label: "Composition" },
  { value: "UNREGISTERED", label: "Unregistered" },
];
export const GST_TYPE_VALUES = new Set(GST_TYPE_OPTIONS.map((option) => option.value));
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
export const GST_ADDRESS_STATE_KEYS = ["stcd", "state", "stateName", "state_name"] as const;
export const GST_ADDRESS_PIN_KEYS = ["pncd", "pin", "pincode"] as const;
export const CUSTOMER_BOOLEAN_FIELD_NAMES = [
  "cusCreditAllowed",
  "cusEnableSms",
  "cusOverdueSms",
  "cusOverdueBilling",
  "cusAllowPromotion",
  "cusAllowLoyalty",
  "cusAllowDiscount",
  "cusFreightCharge",
  "cusLoadingCharge",
  "cusUnloadingCharge",
  "cusTcsApplicable",
  "cusItcollExempted",
  "cusIsActive",
] as const;
export const CUSTOMER_DATE_FIELD_NAMES = [
  "cusBirthDate",
  "cusMarriageDate",
  "cusBilledDate",
] as const;
export const CUSTOMER_TEXT_FIELD_NAMES = [
  "cusTitle",
  "cusShort",
  "cusCode",
  "cusName",
  "cusAddr1",
  "cusAddr2",
  "cusAddr3",
  "cusCity",
  "cusDistrict",
  "cusCountry",
  "cusLandmark",
  "cusPin",
  "cusTel",
  "cusPhone1",
  "cusPhone2",
  "cusWhatsappNo",
  "cusEmail",
  "cusAadharNo",
  "cusContactPerson",
  "cusDistanceKm",
  "cusCreditBillLimit",
  "cusCreditAmtLimit",
  "cusCreditDays",
  "cusDebitBalance",
  "cusDiscPerc",
  "cusDebitGraceDays",
  "cusSortOrder",
  "cusRegionName",
  "cusRegionAddr1",
  "cusRegionAddr2",
  "cusRegionAddr3",
  "cusRegionCity",
  "cusRegionDistrict",
  "cusRegionStateName",
  "cusRegionCountry",
  "cusTransportName",
  "cusGstNo",
  "cusPanNo",
  "cusGstType",
  "cusEcommerceGstin",
  "cusItcollType",
  "cusGeoLocation",
  "cusDefaultSalesman",
  "cusPriceLevelId",
  "cusCompanyId",
  "cusBilledCount",
  "cusNotes",
  "cusBranchId",
  "cusAreaId",
  "cusGroupId",
] as const;
export const CUSTOMER_INITIAL_FORM_VALUES: Record<string, string> = {
  cusName: "",
  cusCode: "",
  cusShort: "",
  cusTitle: "",
  cusAreaId: "",
  cusGroupId: "",
  cusStateCode: "",
  cusPriceLevelId: "",
  cusCompanyId: "",
  cusBranchId: "",
  cusDefaultSalesman: "",
  cusContactPerson: "",
  cusPhone1: "",
  cusPhone2: "",
  cusTel: "",
  cusWhatsappNo: "",
  cusEmail: "",
  cusAadharNo: "",
  cusDistanceKm: "0",
  cusAddr1: "",
  cusAddr2: "",
  cusAddr3: "",
  cusCity: "",
  cusDistrict: "",
  cusCountry: "India",
  cusLandmark: "",
  cusPin: "",
  cusGeoLocation: "",
  cusCreditAllowed: "false",
  cusCreditBillLimit: "0",
  cusCreditAmtLimit: "0",
  cusCreditDays: "0",
  cusDebitBalance: "0",
  cusDiscPerc: "0",
  cusDebitGraceDays: "0",
  cusEnableSms: "false",
  cusOverdueSms: "false",
  cusOverdueBilling: "false",
  cusAllowPromotion: "false",
  cusAllowLoyalty: "false",
  cusAllowDiscount: "true",
  cusCollectionDays: "",
  cusGstNo: "",
  cusPanNo: "",
  cusGstType: "",
  cusEcommerceGstin: "",
  cusTcsApplicable: "false",
  cusItcollExempted: "false",
  cusItcollType: "",
  cusRegionName: "",
  cusRegionAddr1: "",
  cusRegionAddr2: "",
  cusRegionAddr3: "",
  cusRegionCity: "",
  cusRegionDistrict: "",
  cusRegionStateName: "",
  cusRegionCountry: "India",
  cusBirthDate: "",
  cusMarriageDate: "",
  cusBilledDate: "",
  cusBilledCount: "0",
  cusTransportName: "",
  cusFreightCharge: "false",
  cusLoadingCharge: "false",
  cusUnloadingCharge: "false",
  cusSortOrder: "0",
  cusIsActive: "true",
  cusNotes: "",
};
export const AREA_MODAL_INITIAL_VALUES: Record<string, string> = {
  armName: "",
  armAlias: "",
  armShort: "",
  armCityId: "",
  armDistanceKm: "",
  armCollectionDays: "",
  armSort: "0",
  armIsActive: "true",
};
export const STATE_MODAL_INITIAL_VALUES: Record<string, string> = {
  stateCode: "",
  stateName: "",
  stateUt: "false",
  tinCode: "",
  isActive: "true",
};
export const GROUP_MODAL_INITIAL_VALUES: Record<string, string> = {
  cgrName: "",
  cgrAlias: "",
  cgrShort: "",
  cgrNarration: "",
  cgrOrder: "0",
  cgrDiscPerc: "0",
  cgrCollectionDays: "",
  cgrDebitAllowed: "false",
  cgrDebitDays: "0",
  cgrDebitLimit: "0",
  cgrBillsLimit: "0",
  cgrOverdueBilling: "false",
  cgrIsActive: "true",
};
export const CUSTOMER_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(62vw, 62rem)",
  height: "75vh",
  maxHeight: "75vh",
};
export const CUSTOMER_PHONE_PATTERN = "^[0-9+()\\-\\s]{0,20}$";
export const CUSTOMER_BASIC_VALIDATIONS: Record<string, ERPDynamicFieldValidation> = {
  cusName: {
    maxLength: 200,
    maxLengthMessage: "Customer Name must be at most 200 characters.",
  },
  cusCode: {
    maxLength: 50,
    maxLengthMessage: "Customer Code must be at most 50 characters.",
  },
  cusShort: {
    maxLength: 50,
    maxLengthMessage: "Short Name must be at most 50 characters.",
  },
  cusAddr1: {
    maxLength: 250,
    maxLengthMessage: "Address Line 1 must be at most 250 characters.",
  },
  cusAddr2: {
    maxLength: 250,
    maxLengthMessage: "Address Line 2 must be at most 250 characters.",
  },
  cusAddr3: {
    maxLength: 250,
    maxLengthMessage: "Address Line 3 must be at most 250 characters.",
  },
  cusCity: {
    maxLength: 250,
    maxLengthMessage: "City must be at most 250 characters.",
  },
  cusDistrict: {
    maxLength: 250,
    maxLengthMessage: "District must be at most 250 characters.",
  },
  cusLandmark: {
    maxLength: 200,
    maxLengthMessage: "Landmark must be at most 200 characters.",
  },
  cusPin: {
    maxLength: 10,
    maxLengthMessage: "PIN must be at most 10 digits.",
    pattern: "^[0-9]{0,10}$",
    patternMessage: "PIN can contain digits only.",
  },
  cusTel: {
    maxLength: 20,
    maxLengthMessage: "Tel must be at most 20 characters.",
    pattern: CUSTOMER_PHONE_PATTERN,
    patternMessage: "Tel can contain digits, spaces, +, -, and parentheses only.",
  },
  cusPhone1: {
    maxLength: 20,
    maxLengthMessage: "Phone 1 must be at most 20 characters.",
    pattern: CUSTOMER_PHONE_PATTERN,
    patternMessage: "Phone 1 can contain digits, spaces, +, -, and parentheses only.",
  },
  cusPhone2: {
    maxLength: 20,
    maxLengthMessage: "Phone 2 must be at most 20 characters.",
    pattern: CUSTOMER_PHONE_PATTERN,
    patternMessage: "Phone 2 can contain digits, spaces, +, -, and parentheses only.",
  },
  cusWhatsappNo: {
    maxLength: 20,
    maxLengthMessage: "WhatsApp No must be at most 20 characters.",
    pattern: CUSTOMER_PHONE_PATTERN,
    patternMessage: "WhatsApp No can contain digits, spaces, +, -, and parentheses only.",
  },
  cusEmail: {
    maxLength: 120,
    maxLengthMessage: "Email must be at most 120 characters.",
  },
  cusTransportName: {
    maxLength: 200,
    maxLengthMessage: "Transport Name must be at most 200 characters.",
  },
  cusRegionName: {
    maxLength: 200,
    maxLengthMessage: "Region Name must be at most 200 characters.",
  },
  cusRegionAddr1: {
    maxLength: 250,
    maxLengthMessage: "Region Address 1 must be at most 250 characters.",
  },
  cusRegionAddr2: {
    maxLength: 250,
    maxLengthMessage: "Region Address 2 must be at most 250 characters.",
  },
  cusRegionAddr3: {
    maxLength: 250,
    maxLengthMessage: "Region Address 3 must be at most 250 characters.",
  },
  cusRegionCity: {
    maxLength: 250,
    maxLengthMessage: "Region City must be at most 250 characters.",
  },
  cusRegionDistrict: {
    maxLength: 250,
    maxLengthMessage: "Region District must be at most 250 characters.",
  },
  cusRegionCountry: {
    maxLength: 60,
    maxLengthMessage: "Region Country must be at most 60 characters.",
  },
  cusNotes: {
    maxLength: 250,
    maxLengthMessage: "Notes must be at most 250 characters.",
  },
};
