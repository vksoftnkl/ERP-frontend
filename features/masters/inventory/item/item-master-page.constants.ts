import type { CSSProperties } from "react";
import type { ERPDynamicSelectOption } from "@/components/design-system/ui/dynamic-modal-form";
import { DEFAULT_LOOKUP_ARRAY_KEYS } from "@/features/masters/shared/normalizers";
import { toDisplayValue } from "@/features/masters/shared/value-mappers";

export const API_ENDPOINTS = {
list: "/configured-grid-sql/run?grid_id=1",
  getById: "/items/get",
  create: "/items/create",
  delete: "/items/delete",
} as const;
export const GRID_TABLE_NAME = "item_master";
export const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
export const TAX_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
export const COMPANY_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
export const BRANCH_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
export const ITEM_GROUP_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
export const ITEM_CATEGORY_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
export const ITEM_BRAND_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
export const ITEM_SECTION_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
export const UNIT_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
export const GODOWN_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
export const HSN_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
export const UI_TABLE_COLUMNS_ENDPOINT = "/ui-table-masters/get";
export const UI_TABLE_COLUMNS_CREATE_ENDPOINT = "/ui-table-masters/create";
export const WIDGET_MASTER_LIST_ENDPOINT = "/widget-masters/get";
export const ITEM_TAX_MASTER_LIST_ENDPOINT = "/configured-grid-sql/run?grid_id=5";
export const ITEM_WIDGET_QUERY_LIMIT = "100";
export const ITEM_GROUP_SEARCH_DEBOUNCE_MS = 250;
export const ITEM_REORDER_TABLE_UI_ID = "2";
export const ITEM_PRICE_TABLE_UI_ID = "3";
export const ITEM_EAN_TABLE_UI_ID = "4";
export const ITEM_MASTER_WIDGET_GROUP_ID = "5";
// Item Master screen's menu id (fixed.menu_master). Selects this screen's
// configured widget sections/fields from GET /widget-masters/get.
export const ITEM_MASTER_WIDGET_SECTION_MENU_ID = "29";
// Platform filter for widget sections. Must match the server's WidgetPlatform
// enum (Mobile | Desktop | Web) exactly — it is validated case-sensitively.
export const ITEM_MASTER_WIDGET_TYPE = "Web";
export const UUID_PATTERN = "^[0-9a-fA-F-]{36}$";
export const ITEM_PRICE_ROWS_FIELD_NAME = "item_price_rows_json";
export const ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME = "item_unit_conversion_rows_json";
export const ITEM_REORDER_ROWS_FIELD_NAME = "item_reorder_rows_json";
export const ITEM_EAN_ROWS_FIELD_NAME = "item_ean_rows_json";
export const COMPANY_LOOKUP_QUERY = {
  module: "companies",
  limit: "100",
} as const;
export const BRANCH_LOOKUP_QUERY = {
  module: "branches",
  limit: "100",
} as const;
export const ITEM_GROUP_LOOKUP_QUERY = {
  module: "itemGroups",
  search: " speakers",
} as const;
export const ITEM_CATEGORY_LOOKUP_QUERY = {
  module: "itemCategories",
  limit: "100",
} as const;
export const ITEM_BRAND_LOOKUP_QUERY = {
  module: "itemBrands",
  limit: "100",
} as const;
export const ITEM_SECTION_LOOKUP_QUERY = {
  module: "itemSections",
  limit: "100",
} as const;
export const UNIT_LOOKUP_QUERY = {
  module: "units",
  limit: "100",
} as const;
export const GODOWN_LOOKUP_QUERY = {
  module: "godownLocations",
  limit: "100",
} as const;
export const UI_TABLE_COLUMNS_QUERY = {
  uiTableId: ITEM_PRICE_TABLE_UI_ID,
} as const;
export const UI_REORDER_TABLE_COLUMNS_QUERY = {
  uiTableId: ITEM_REORDER_TABLE_UI_ID,
} as const;
export const UI_EAN_TABLE_COLUMNS_QUERY = {
  uiTableId: ITEM_EAN_TABLE_UI_ID,
} as const;
// GET /widget-masters/get is filtered by section menu id + platform (see the
// server's ListWidgetQueryDto). The legacy page/limit/widgetGroupId/widgetType
// params are rejected by the endpoint's whitelist validation.
export const ITEM_MASTER_WIDGET_QUERY = {
  sectionMenuId: ITEM_MASTER_WIDGET_SECTION_MENU_ID,
  sectionPlatform: ITEM_MASTER_WIDGET_TYPE,
} as const;
export const LOOKUP_QUERY_ITEM_TAXES = {
  module: "itemTaxes",
} as const;
export const ITEM_TAX_LIST_QUERY = {
  page: "1",
  limit: "100",
  // grid 5's stored SQL filters on a `wantdelete` placeholder token; bind it to
  // false so only non-deleted taxes are returned. Without it the unbound token
  // reaches Postgres as a column reference and the query 500s.
  grid_param: JSON.stringify({ wantdelete: false }),
} as const;
export const LOOKUP_QUERY_SUPPLIERS = {
  module: "suppliers",
  limit: "50",
} as const;
export const LOOKUP_QUERY_CUSTOMER_GROUPS = {
  module: "customerGroups",
  limit: "50",
} as const;
export const LOOKUP_QUERY_ITEMS = {
  module: "items",
  limit: "50",
} as const;
export const HSN_LOOKUP_QUERY = {
  module: "hsnCodes",
  limit: "100",
} as const;
export const COMPANY_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "companies", "companys"],
  idKeys: ["compId", "comp_id", "company_id", "companyId", "id", "_id", "value"],
  labelKeys: ["compName", "comp_name", "company_name", "companyName", "name", "label"],
} as const;
export const BRANCH_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "branches", "branch_masters"],
  idKeys: ["brId", "br_id", "branch_id", "branchId", "id", "_id", "value"],
  labelKeys: ["brName", "br_name", "branch_name", "branchName", "name", "label"],
} as const;
export const GROUP_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "groups", "itemGroups"],
  idKeys: ["group_id", "groupId", "itg_id", "item_group_id", "itemGroupId", "id", "_id", "value"],
  labelKeys: ["group_name", "groupName", "itg_name", "item_group_name", "itemGroupName", "name", "label"],
} as const;
export const CATEGORY_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "categories", "itemCategories", "item_categories"],
  idKeys: ["category_id", "categoryId", "item_category_id", "itemCategoryId", "id", "_id", "value"],
  labelKeys: ["category_name", "categoryName", "item_category_name", "itemCategoryName", "name", "label"],
} as const;
export const BRAND_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "brands", "itemBrands"],
  idKeys: ["brand_id", "brandId", "item_brand_id", "itemBrandId", "id", "_id", "value"],
  labelKeys: ["brand_name", "brandName", "item_brand_name", "itemBrandName", "name", "label"],
} as const;
export const SECTION_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "sections", "itemSections", "item_sections"],
  idKeys: ["sec_id", "secId", "section_id", "sectionId", "item_section_id", "itemSectionId", "id", "_id", "value"],
  labelKeys: ["sec_name", "secName", "section_name", "sectionName", "item_section_name", "itemSectionName", "name", "label"],
} as const;
export const UNIT_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "units", "itemUnits"],
  idKeys: ["unit_id", "unitId", "item_unit_id", "itemUnitId", "uom_id", "id", "_id", "value"],
  labelKeys: ["unit_name", "unitName", "item_unit_name", "itemUnitName", "uom_name", "name", "label"],
} as const;
export const GODOWN_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "godowns", "godown_locations"],
  idKeys: [
    "gdl_id",
    "gdlId",
    "gdl_location_id",
    "godown_id",
    "godownId",
    "id",
    "_id",
    "value",
  ],
  labelKeys: [
    "gdl_name",
    "gdlName",
    "godown_name",
    "godownName",
    "name",
    "label",
  ],
} as const;
export const LOOKUP_KEYS = {
  id: ["item_id", "itemId", "id", "_id"],
  code: ["item_code", "itemCode", "item_sku", "itemSku", "code"],
  name: ["item_name_en", "itemNameEn", "name"],
  short: ["item_alias", "itemAlias", "alias"],
  alias: ["item_stock_type", "itemStockType", "stockType"],
  active: ["item_is_active", "itemIsActive", "isActive", "is_active", "status"],
  position: ["item_sort_order", "itemSortOrder", "position", "sort"],
  description: ["item_notes", "itemNotes", "description", "notes"],
  array: ["data", "items", "results", "rows", "list", "item_masters", "items"],
} as const;
export const REQUEST_PAYLOAD_KEYS = {
  id: "item_id",
  name: "item_name_en",
  alias: "item_stock_type",
  short: "item_code",
  description: "item_notes",
  sort: "item_sort_order",
} as const;
export const DEFAULT_COMPANY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Company",
};
export const DEFAULT_BRANCH_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
export const DEFAULT_GROUP_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Item Group",
};
export const DEFAULT_CATEGORY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
export const DEFAULT_BRAND_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
export const DEFAULT_SECTION_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
export const DEFAULT_UNIT_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Base Unit",
};
export const DEFAULT_GODOWN_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Global Price",
};
export const DEFAULT_TAX_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
export const TAX_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "itemTaxes"],
  idKeys: ["taxId", "tax_id", "id", "_id", "value"],
  labelKeys: ["taxName", "tax_name", "name", "label"],
} as const;
export const DEFAULT_SUPPLIER_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
export const DEFAULT_HSN_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select HSN Code",
};
export const DEFAULT_CUSTOMER_GROUP_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
export const DEFAULT_PACKING_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
export const ITEM_BATCH_CONFIG_NONE_VALUE = "0";
export const ITEM_BATCH_CONFIG_MRP_VALUE = "1";
export const ITEM_BATCH_CONFIG_BATCH_VALUE = "2";
export const BATCH_CONFIG_OPTIONS: ERPDynamicSelectOption[] = [
  { value: ITEM_BATCH_CONFIG_NONE_VALUE, label: "NONE" },
  { value: ITEM_BATCH_CONFIG_MRP_VALUE, label: "MRP" },
  { value: ITEM_BATCH_CONFIG_BATCH_VALUE, label: "BATCH" },
];
export const ITEM_PRICE_DEFAULT_PROFIT_TYPE = "BY_PERCENT";
export const ITEM_PRICE_PROFIT_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "BY_PERCENT", label: "BY %" },
  { value: "BY_AMOUNT", label: "BY Rs " },
  { value: "MANUAL", label: "BY User" },
];
export const ITEM_PRICE_ROUND_OFF_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "0.01", label: "0.01" },
  { value: "0.5", label: "0.5" },
  { value: "1", label: "1" },
  { value: "5", label: "5" },
  { value: "10", label: "10" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
];
export const ITEM_REORDER_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "purchase", label: "Purchase" },
  { value: "production", label: "Production" },
  { value: "repack", label: "Repack" },
  { value: "transfer", label: "Transfer" },
];
export const ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS = [
  {
    marginFieldName: "ipm_price_a_markup_perc",
    saleFieldName: "ipm_sales_price_a",
    saleWotFieldName: "ipm_price_a_wot",
  },
  {
    marginFieldName: "ipm_price_b_markup_perc",
    saleFieldName: "ipm_sales_price_b",
    saleWotFieldName: "ipm_price_b_wot",
  },
  {
    marginFieldName: "ipm_price_c_markup_perc",
    saleFieldName: "ipm_sales_price_c",
    saleWotFieldName: "ipm_price_c_wot",
  },
  {
    marginFieldName: "ipm_price_d_markup_perc",
    saleFieldName: "ipm_sales_price_d",
    saleWotFieldName: "ipm_price_d_wot",
  },
] as const;
export const ITEM_PRICE_TABLE_COLUMN_NAME_TO_KEY = {
  unit: "ipm_unit_id",
  unitfactor: "ipm_unit_factor",
  godown: "ipm_godown_id",
  default: "ipm_is_default_unit",
  isdefault: "ipm_is_default_unit",
  base: "ipm_is_base_unit",
  isbase: "ipm_is_base_unit",
  costwot: "ipm_cost_wot",
  cost: "ipm_cost_price",
  costremarks: "ipm_cost_remarks",
  profittype: "ipm_profit_type",
  roundoff: "ipm_round_off",
  amargin: "ipm_price_a_markup_perc",
  salea: "ipm_sales_price_a",
  bmargin: "ipm_price_b_markup_perc",
  saleb: "ipm_sales_price_b",
  cmargin: "ipm_price_c_markup_perc",
  salec: "ipm_sales_price_c",
  dmargin: "ipm_price_d_markup_perc",
  saled: "ipm_sales_price_d",
  max: "ipm_max_price",
  min: "ipm_min_price",
  disc: "ipm_disc_perc",
  discqty: "ipm_disc_qty",
  conv: "ipm_to_base_factor",
  conversionfactor: "ipm_to_base_factor",
  cess: "ipm_addl_cess",
  loading: "ipm_loading_charge",
  freight: "ipm_freight_charge",
  bigunit: "ipm_is_big_unit",
  remarks: "ipm_uom_remarks",
  points: "ipm_loyalty_points",
} as const;
export const ITEM_REORDER_TABLE_COLUMN_NAME_TO_KEY = {
  minlevel: "ir_min_level",
  maxlevel: "ir_max_level",
  reorderlevel: "ir_reorder_level",
  reorderqty: "ir_reorder_qty",
  reordertype: "ir_reorder_type",
} as const;
export const ITEM_EAN_TABLE_COLUMN_NAME_TO_KEY = {
  ean: "ean_code",
  eancode: "ean_code",
  barcode: "ean_code",
  unit: "ean_unit_id",
  unitcode: "ean_unit_id",
  godown: "ean_godown_id",
  default: "ean_is_default",
  isdefault: "ean_is_default",
  active: "ean_is_active",
  isactive: "ean_is_active",
  status: "ean_is_active",
  remark: "ean_remarks",
  remarks: "ean_remarks",
} as const;
export const ITEM_PRICE_INITIAL_FORM_VALUES: Record<string, string> = {
  ipm_id: "",
  ipm_unit_id: "",
  ipm_godown_id: "",
  ipm_unit_slno: "",
  ipm_to_base_factor: "1",
  ipm_unit_factor: "1",
  ipm_cost_price: "",
  ipm_cost_wot: "",
  ipm_sales_price_a: "",
  ipm_sales_price_b: "",
  ipm_sales_price_c: "",
  ipm_sales_price_d: "",
  ipm_price_a_wot: "",
  ipm_price_b_wot: "",
  ipm_price_c_wot: "",
  ipm_price_d_wot: "",
  ipm_price_a_markup_perc: "",
  ipm_price_b_markup_perc: "",
  ipm_price_c_markup_perc: "",
  ipm_price_d_markup_perc: "",
  ipm_max_price: "",
  ipm_min_price: "",
  ipm_disc_perc: "",
  ipm_disc_qty: "",
  ipm_addl_cess: "",
  ipm_profit_type: "",
  ipm_round_off: "",
  ipm_is_default_unit: "false",
  ipm_is_base_unit: "false",
  ipm_is_big_unit: "false",
  ipm_loading_charge: "",
  ipm_freight_charge: "",
  ipm_loyalty_points: "",
  ipm_uom_remarks: "",
  ipm_cost_remarks: "",
  ipm_is_active: "true",
};
export const ITEM_REORDER_INITIAL_FORM_VALUES: Record<string, string> = {
  ir_id: "",
  ir_unit_id: "",
  ir_min_level: "",
  ir_max_level: "",
  ir_reorder_level: "",
  ir_reorder_qty: "",
  ir_lead_time_days: "",
  ir_review_cycle_days: "",
  ir_reorder_days: "",
  ir_expiry_buffer_days: "",
  ir_reorder_type: "",
  ir_remarks: "",
  ir_is_active: "true",
};
export const ITEM_EAN_INITIAL_FORM_VALUES: Record<string, string> = {
  ean_id: "",
  ean_unit_id: "",
  ean_code: "",
  ean_godown_id: "",
  ean_remarks: "",
  ean_is_default: "false",
  ean_is_active: "true",
};
export const ITEM_UNIT_CONVERSION_INITIAL_FORM_VALUES: Record<string, string> = {
  iuc_id: "",
  iuc_unit_id: "",
  iuc_unit_slno: "",
  iuc_to_base_factor: "1",
  iuc_unit_factor: "1",
  iuc_is_default_unit: "false",
  iuc_is_base_unit: "false",
  iuc_is_big_unit: "false",
  iuc_uom_weight: "0",
  iuc_uom_remarks: "",
  iuc_is_active: "true",
};
export const ITEM_INITIAL_FORM_VALUES: Record<string, string> = {
  item_name_en: "",
  item_name_ta: "",
  item_code: "",
  item_sku: "",
  item_alias: "",
  item_stock_type: "FG",
  item_default_barcode: "",
  item_company_id: "",
  item_branch_id: "",
  item_group_id: "",
  item_category_id: "",
  item_brand_id: "",
  item_section_id: "",
  item_base_unit_id: "",
  item_default_tax_id: "",
  item_supplier_id: "",
  item_cust_group: "",
  item_company_category_id: "",
  item_packing_item_ids: "",
  ir_id: "",
  ir_unit_id: "",
  ir_min_level: "",
  ir_max_level: "",
  ir_reorder_level: "",
  ir_reorder_qty: "",
  ir_lead_time_days: "",
  ir_review_cycle_days: "",
  ir_reorder_days: "",
  ir_expiry_buffer_days: "",
  ir_reorder_type: "",
  ir_remarks: "",
  ean_id: "",
  ean_unit_id: "",
  ean_code: "",
  ean_godown_id: "",
  ean_remarks: "",
  item_hsn_code: "",
  item_batch_config: "",
  item_sort_order: "",
  item_storage_location: "",
  item_notes: "",
  item_image_url: "",
  item_photo_file: "",
  [ITEM_PRICE_ROWS_FIELD_NAME]: "",
  [ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME]: "",
  [ITEM_REORDER_ROWS_FIELD_NAME]: "",
  [ITEM_EAN_ROWS_FIELD_NAME]: "",
  item_is_service: "false",
  item_is_batch_based: "false",
  item_is_expiry_item: "false",
  item_expiry_days: "",
  item_intimate_before_days: "",
  item_allow_sales: "true",
  item_allow_sales_return: "true",
  item_allow_purchase: "true",
  item_allow_po: "true",
  item_allow_so: "true",
  item_allow_neg_stock: "true",
  item_allow_negative_so: "true",
  item_price_list: "false",
  item_weigh_scale: "false",
  item_retail_item: "true",
  item_is_kit: "false",
  item_auto_break: "false",
  item_auto_make: "false",
  item_allow_loyalty: "false",
  item_allow_promo: "false",
  item_has_offer: "false",
  item_damagable_product: "false",
  item_is_demand: "false",
  item_allow_loading: "false",
  item_allow_freight: "false",
  item_random_stock: "false",
  item_barcode_sticker: "false",
  ir_is_active: "true",
  ean_is_default: "false",
  ean_is_active: "true",
  item_is_active: "true",
  ...ITEM_PRICE_INITIAL_FORM_VALUES,
};
export const ITEM_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(84vw, 88rem)",
  height: "80vh",
  maxHeight: "80vh",
};
export type UiTableColumnLayoutItem = {
  uiTblClmId?: string;
  uiTblClmNo?: string;
  uiTblClmName: string;
  uiTblClmTableId: string | null;
  uiTblClmColumnWidth: number | null;
  uiTblClmColumnVisibility: boolean;
  uiTblClmColumnFocus: boolean;
  uiTblClmColumnPosition: number;
  uiTblClmColumnNecessity: boolean;
  uiTblClmNextColumn: number | null;
  uiTblClmPreviousColumn: number | null;
  uiTblClmIsActive: boolean;
};
export type SaveUiTableColumnLayoutRequest = {
  uiTblId: string;
  uiTblColumns: UiTableColumnLayoutItem[];
};
export function normalizeItemBatchConfigValue(value: unknown): string {
  const normalized = toDisplayValue(value).trim().toUpperCase();
  if (!normalized) {
    return "";
  }
  if (normalized === ITEM_BATCH_CONFIG_NONE_VALUE || normalized === "NONE") {
    return ITEM_BATCH_CONFIG_NONE_VALUE;
  }
  if (normalized === ITEM_BATCH_CONFIG_MRP_VALUE || normalized === "MRP") {
    return ITEM_BATCH_CONFIG_MRP_VALUE;
  }
  if (normalized === ITEM_BATCH_CONFIG_BATCH_VALUE || normalized === "BATCH") {
    return ITEM_BATCH_CONFIG_BATCH_VALUE;
  }
  return "";
}
export const ITEM_INLINE_SECTION_HEADING_STYLE: CSSProperties = {
  gridColumn: "1 / -1",
  marginTop: "0.35rem",
  paddingTop: "0.65rem",
  borderTop: "1px solid #e2e8f0",
  color: "#475569",
  fontSize: "0.78rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};
export const ITEM_CHECKBOX_CONTROL_STYLE: CSSProperties = {
  width: "14px",
  height: "14px",
};
export const ITEM_TEXT_FIELD_NAMES = [
  "item_name_en",
  "item_name_ta",
  "item_code",
  "item_sku",
  "item_alias",
  "item_stock_type",
  "item_default_barcode",
  "item_company_id",
  "item_branch_id",
  "item_group_id",
  "item_category_id",
  "item_brand_id",
  "item_section_id",
  "item_base_unit_id",
  "item_default_tax_id",
  "item_supplier_id",
  "item_cust_group",
  "item_company_category_id",
  "ir_id",
  "ir_unit_id",
  "ir_min_level",
  "ir_max_level",
  "ir_reorder_level",
  "ir_reorder_qty",
  "ir_lead_time_days",
  "ir_review_cycle_days",
  "ir_reorder_days",
  "ir_expiry_buffer_days",
  "ir_reorder_type",
  "ir_remarks",
  "ean_id",
  "ean_unit_id",
  "ean_code",
  "ean_godown_id",
  "ean_remarks",
  "item_hsn_code",
  "item_storage_location",
  "item_notes",
  "item_image_url",
  ITEM_PRICE_ROWS_FIELD_NAME,
  ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME,
  ITEM_REORDER_ROWS_FIELD_NAME,
  ITEM_EAN_ROWS_FIELD_NAME,
] as const;
export const ITEM_BOOLEAN_FIELD_NAMES = [
  "item_is_service",
  "item_is_batch_based",
  "item_is_expiry_item",
  "item_allow_sales",
  "item_allow_sales_return",
  "item_allow_purchase",
  "item_allow_po",
  "item_allow_so",
  "item_allow_neg_stock",
  "item_allow_negative_so",
  "item_price_list",
  "item_weigh_scale",
  "item_retail_item",
  "item_is_kit",
  "item_auto_break",
  "item_auto_make",
  "item_allow_loyalty",
  "item_allow_promo",
  "item_has_offer",
  "item_damagable_product",
  "item_is_demand",
  "item_allow_loading",
  "item_allow_freight",
  "item_random_stock",
  "item_barcode_sticker",
  "ir_is_active",
  "ean_is_default",
  "ean_is_active",
  "item_is_active",
] as const;
export const ITEM_PRICE_TEXT_FIELD_NAMES = [
  "ipm_id",
  "ipm_unit_id",
  "ipm_godown_id",
  "ipm_unit_slno",
  "ipm_to_base_factor",
  "ipm_unit_factor",
  "ipm_cost_price",
  "ipm_cost_wot",
  "ipm_sales_price_a",
  "ipm_sales_price_b",
  "ipm_sales_price_c",
  "ipm_sales_price_d",
  "ipm_price_a_wot",
  "ipm_price_b_wot",
  "ipm_price_c_wot",
  "ipm_price_d_wot",
  "ipm_price_a_markup_perc",
  "ipm_price_b_markup_perc",
  "ipm_price_c_markup_perc",
  "ipm_price_d_markup_perc",
  "ipm_max_price",
  "ipm_min_price",
  "ipm_disc_perc",
  "ipm_disc_qty",
  "ipm_addl_cess",
  "ipm_profit_type",
  "ipm_round_off",
  "ipm_loading_charge",
  "ipm_freight_charge",
  "ipm_loyalty_points",
  "ipm_uom_remarks",
  "ipm_cost_remarks",
] as const;
export const ITEM_PRICE_BOOLEAN_FIELD_NAMES = [
  "ipm_is_default_unit",
  "ipm_is_base_unit",
  "ipm_is_big_unit",
  "ipm_is_active",
] as const;
export const ITEM_PRICE_SYNC_FIELD_NAMES = [
  ...ITEM_PRICE_TEXT_FIELD_NAMES,
  ...ITEM_PRICE_BOOLEAN_FIELD_NAMES,
  ITEM_PRICE_ROWS_FIELD_NAME,
] as const;
export const ITEM_UNIT_CONVERSION_ROW_TEXT_FIELD_NAMES = [
  "iuc_id",
  "iuc_unit_id",
  "iuc_unit_slno",
  "iuc_to_base_factor",
  "iuc_unit_factor",
  "iuc_uom_weight",
  "iuc_uom_remarks",
] as const;
export const ITEM_UNIT_CONVERSION_ROW_BOOLEAN_FIELD_NAMES = [
  "iuc_is_default_unit",
  "iuc_is_base_unit",
  "iuc_is_big_unit",
  "iuc_is_active",
] as const;
export const ITEM_REORDER_ROW_TEXT_FIELD_NAMES = [
  "ir_id",
  "ir_unit_id",
  "ir_min_level",
  "ir_max_level",
  "ir_reorder_level",
  "ir_reorder_qty",
  "ir_lead_time_days",
  "ir_review_cycle_days",
  "ir_reorder_days",
  "ir_expiry_buffer_days",
  "ir_reorder_type",
  "ir_remarks",
] as const;
export const ITEM_REORDER_ROW_BOOLEAN_FIELD_NAMES = ["ir_is_active"] as const;
export const ITEM_EAN_ROW_TEXT_FIELD_NAMES = [
  "ean_id",
  "ean_unit_id",
  "ean_code",
  "ean_godown_id",
  "ean_remarks",
] as const;
export const ITEM_EAN_ROW_BOOLEAN_FIELD_NAMES = ["ean_is_default", "ean_is_active"] as const;
export const ITEM_PRICE_CONTENT_FIELD_NAMES = ITEM_PRICE_TEXT_FIELD_NAMES.filter(
  (fieldName) => fieldName !== "ipm_id",
);
export const ITEM_PRICE_SUBMISSION_FIELD_NAMES = [
  "ipm_godown_id",
  "ipm_cost_price",
  "ipm_cost_wot",
  "ipm_sales_price_a",
  "ipm_sales_price_b",
  "ipm_sales_price_c",
  "ipm_sales_price_d",
  "ipm_price_a_wot",
  "ipm_price_b_wot",
  "ipm_price_c_wot",
  "ipm_price_d_wot",
  "ipm_price_a_markup_perc",
  "ipm_price_b_markup_perc",
  "ipm_price_c_markup_perc",
  "ipm_price_d_markup_perc",
  "ipm_max_price",
  "ipm_min_price",
  "ipm_disc_perc",
  "ipm_disc_qty",
  "ipm_addl_cess",
  "ipm_round_off",
  "ipm_loading_charge",
  "ipm_freight_charge",
  "ipm_loyalty_points",
  "ipm_uom_remarks",
  "ipm_cost_remarks",
] as const;
export const ITEM_UNIT_CONVERSION_CONTENT_FIELD_NAMES = ["iuc_unit_id"] as const;
export const ITEM_REORDER_CONTENT_FIELD_NAMES = [
  "ir_min_level",
  "ir_max_level",
  "ir_reorder_level",
  "ir_reorder_qty",
  "ir_reorder_type",
] as const;
export const ITEM_EAN_CONTENT_FIELD_NAMES = ["ean_code", "ean_godown_id", "ean_remarks"] as const;
export const WIDGET_NUMBER_KEYS = ["widgetNo", "widget_no", "id", "_id"] as const;
export const WIDGET_GROUP_ID_KEYS = ["widgetGroupId", "widget_group_id", "groupId", "group_id"] as const;
export const WIDGET_NAME_KEYS = ["widgetName", "widget_name", "name"] as const;
export const WIDGET_POSITION_KEYS = ["widgetPosition", "widget_position", "position", "sort"] as const;
export const WIDGET_VISIBILITY_KEYS = [
  "widgetVisibility",
  "widget_visibility",
  "visible",
  "isVisible",
] as const;
export const WIDGET_GUI_NAME_KEYS = ["widgetGuiName", "widget_gui_name", "guiName", "gui_name"] as const;
export const WIDGET_SECONDARY_TEXT_KEYS = [
  "widgetSecondaryText",
  "widget_secondary_text",
  "secondaryText",
  "secondary_text",
] as const;