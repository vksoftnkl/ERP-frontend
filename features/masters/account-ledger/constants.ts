export const API_ENDPOINTS = {
  list: "/configured-grid-sql/run?grid_id=26",
  getById: "/account-ledger-masters/get",
  create: "/account-ledger-masters/create",
  delete: "/account-ledger-masters/delete",
} as const;

export const DEBOUNCE_MS = 300;
export const SEARCHABLE_SELECT_OPTIONS_MAX_HEIGHT = 220;
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;

export const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
export const GRID_DETAILS_ENDPOINT = "/grid-details/list";
export const GRID_COLUMNS_CREATE_ENDPOINT = "/grid-columns/create";
export const STATE_CODE_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";

export const ACCOUNT_LEDGER_TABLE_NAME = "acc_ledger_master";
export const ACCOUNT_LEDGER_TABLE_NAME_ALIASES = [
  ACCOUNT_LEDGER_TABLE_NAME,
  "account_ledger_master",
  "account_ledgers",
] as const;

export const GRID_DETAILS_QUERY = {
  grid_status: "true",
  search: ACCOUNT_LEDGER_TABLE_NAME,
  page: "1",
  limit: "20",
} as const;

export const LOOKUP_QUERY_COMPANIES = {
  module: "companies",
  limit: "20",
} as const;

export const LOOKUP_QUERY_BRANCHES = {
  module: "branches",
  limit: "20",
} as const;

export const LOOKUP_QUERY_ACCOUNT_GROUPS = {
  module: "accountGroups",
  limit: "20",
} as const;

export const LOOKUP_QUERY_STATE_CODES = {
  module: "stateCodes",
  limit: "100",
} as const;

export const STATE_NAME_SEARCH_FIELD_NAMES = new Set<string>([
  "ledStateName",
  "ledRegionStateName",
]);

export const LOOKUP_KEYS = {
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

export const REQUEST_PAYLOAD_KEYS = {
  id: "ledId",
  name: "ledName",
  alias: "ledAlias",
  short: "ledShort",
  description: "ledRemarks",
  sort: "ledSort",
} as const;

export const LEDGER_COMPANY_NAME_KEYS = [
  "companyName",
  "company_name",
  "ledCompanyName",
  "led_company_name",
] as const;

export const LEDGER_BRANCH_NAME_KEYS = [
  "branchName",
  "branch_name",
  "ledBranchName",
  "led_branch_name",
] as const;

export const LEDGER_GROUP_NAME_KEYS = [
  "groupName",
  "group_name",
  "ledGroupName",
  "led_group_name",
  "accGroupName",
  "acc_group_name",
] as const;

export const GRID_DETAIL_ID_KEYS = ["grid_id", "gridId", "id"] as const;
export const GRID_DETAIL_SQL_KEYS = ["grid_sql", "gridSql", "sql"] as const;
export const GRID_DETAIL_NAME_KEYS = ["grid_name", "gridName", "name"] as const;

export const LOOKUP_ARRAY_KEYS = ["items", "data", "results", "rows", "list"] as const;

export const PAGINATION_CONTAINER_KEYS = [
  "meta",
  "pagination",
  "pageInfo",
  "pager",
] as const;

export const TOTAL_ENTRIES_KEYS = [
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

export const CURRENT_PAGE_KEYS = [
  "page",
  "currentPage",
  "current_page",
  "pageNo",
  "page_no",
] as const;

export const PAGE_SIZE_KEYS = [
  "limit",
  "pageSize",
  "page_size",
  "perPage",
  "per_page",
] as const;

export const STATE_CODE_LOOKUP_CODE_KEYS = [
  "id",
  "value",
  "stateCode",
  "state_code",
  "code",
] as const;

export const STATE_CODE_LOOKUP_NAME_KEYS = [
  "stateName",
  "state_name",
  "name",
  "label",
] as const;

export const GST_LOOKUP_ENDPOINT = "/api/gst/search";
export const GST_LOOKUP_PATTERN = /^[0-9A-Z]{15}$/;
export const GST_LOOKUP_HELPER_TEXT =
  "Type a 15-character GSTIN to load ledger details automatically.";

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

export const LEDGER_FIELD_CONTAINER_SELECTOR = "[data-ledger-modal-field-name]";
export const LEDGER_PRIMARY_FIELD_CONTROL_SELECTOR =
  '[data-ledger-modal-field-control="true"]';

export const LEDGER_ASIDE_SECTION_KEYS = new Set<string>(["__heading_control"]);
