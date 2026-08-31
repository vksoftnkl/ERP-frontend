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
export const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-masters";
export const TAX_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-masters";
export const BRANCH_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-masters";
// Company-scoped branch list (id/name), used to auto-select/filter Branch when
// the Company field changes. Path param, not query-string based.
export const BRANCH_BY_COMPANY_ENDPOINT = "/master-lookups/branches/by-company";
export const UNIT_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-masters";
export const GODOWN_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-masters";
export const HSN_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-masters";
export const UI_TABLE_COLUMNS_ENDPOINT = "/ui-table-masters/get";
export const UI_TABLE_COLUMNS_CREATE_ENDPOINT = "/ui-table-masters/create";
export const WIDGET_MASTER_LIST_ENDPOINT = "/widget-masters/get";
// Right-clicking inside the open item create/update modal opens a tree popup of
// this menu's configured sections/fields (GET /widget-masters/config?menu_id=…);
// ticking a field toggles its live visibility in the form. Edits are persisted
// with a PATCH to /widget-masters/visibility.
export const WIDGET_CONFIG_TREE_ENDPOINT = "/widget-masters/config";
export const WIDGET_VISIBILITY_ENDPOINT = "/widget-masters/visibility";
export const ITEM_TAX_MASTER_LIST_ENDPOINT = "/configured-grid-sql/run?grid_id=5";
export const ITEM_REORDER_TABLE_UI_ID = "2";
export const ITEM_PRICE_TABLE_UI_ID = "3";
export const ITEM_EAN_TABLE_UI_ID = "4";
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
export const BRANCH_LOOKUP_QUERY = {
  module: "branches",
} as const;
// Eager, full company list for the price row table's Company column. Unlike
// the header Company field (a lazy, server-searched configured dropdown that
// only ever holds a handful of recently fetched/selected companies — see
// COMPANY_DROPDOWN_CONFIG), each price row can carry its own company id
// (item_price_master.ipm_company_id is independent of item_company_id), and
// the row's plain in-table select only ever filters client-side over
// whatever options it's given. A lazy, near-empty option list left that
// dropdown showing just the current selection (or the raw id when it wasn't
// even loaded yet) with nothing else to pick. Companies are few, so loading
// them all upfront (like Branch/Unit/Godown/HSN already do) is cheap.
export const COMPANY_LOOKUP_QUERY = {
  module: "companies",
} as const;
export const UNIT_LOOKUP_QUERY = {
  module: "units",
} as const;
export const GODOWN_LOOKUP_QUERY = {
  module: "godownLocations",
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
// The `name` of each tab heading field in the item form (`type: "heading"`, which
// the modal renders as its tabs). Kept here because the Visible Settings popup has
// to be able to name a whole tab — see ITEM_FORM_FIELD_NAMES_BY_TAB_HEADING.
export const ITEM_CORE_TAB_HEADING_FIELD_NAME = "itemHeadingCore";
export const ITEM_EAN_TABLE_TAB_HEADING_FIELD_NAME = "itemHeadingEanTable";
export const ITEM_INVENTORY_TAB_HEADING_FIELD_NAME = "itemHeadingInventory";
// Bridges each hardcoded item form field `name` to the backend `field_name` it is
// configured under on menu 29's "Web" sections (fixed.form_field). This is what lets
// the widget-masters config re-label, re-order, and show/hide the item form fields —
// a field that binds nothing is left untouched, and it is omitted from the Visible
// Settings popup.
//
// Each entry lists EVERY name the field has been configured under, because menu 29 is
// named differently from database to database and both spellings are live somewhere:
//
//   1. the label ("Item Name", "Allow Sales") — what the widget-master ADMIN UI writes.
//      This DB's menu 29 was re-authored there as Web sections 69 "Item Master-Core" /
//      70 "Item Master-Ean Table" / 71 "Item Master-Inventory&Notes" (50 fields, 1:1
//      with the form), and it is what prisma/seed/Form_Section.sql + Form_Field.sql
//      now export, so it is a new deployment's config too.
//   2. the form's binding key ("item_name", "item_allow_sales") — what the older
//      prisma/seed/Item_Master_Widget_Config_Menu29.sql provisions (sections 55–58).
//      Still what a site that ran that seed has.
//   3. a few label-derived spellings an early admin-UI pass produced that the old seed
//      normalized away ("item_Retail Item", "item_weigh-scale", "item_image_URL") — a
//      site that got the first without the second still has them.
//
// resolveWidgetFieldNameMap picks, per field, whichever of these the fetched config
// actually contains, so the same build binds on any of them. Hardcoding one spelling
// does not: it binds nothing on a site running another (which is exactly how this
// broke) — the Visible Settings popup then comes up empty, since it lists only fields
// that bind. Add to a list rather than replacing an entry.
//
// Split per tab so ITEM_FORM_FIELD_NAMES_BY_TAB_HEADING below can be derived from the
// same lists instead of repeating all 50 field names.
// Tab "Core Details" — the form's Core Details + Reference Links (the legacy
// config split these across sections 55 "Core Details" and 56 "Reference Links")
const CORE_TAB_WIDGET_FIELD_NAME_ALIASES: Record<string, readonly string[]> = {
  item_name_en:         ["Item Name", "item_name"],
  item_sku:             ["Sku"],
  item_name_ta:         ["Item Name (Local)", "item_local"],
  item_code:            ["Item Code", "item_code"],
  item_alias:           ["Alias", "item_alias"],
  item_default_barcode: ["Default Barcode", "item_barcode"],
  item_batch_config:    ["Batch Config", "item_batch_config"],
  item_hsn_code:        ["Hsn Code", "item_hsn"],
  item_default_tax_id:  ["Default Tax", "item_default_tax"],
  item_sort_order:      ["Sort Order", "item_sort_order"],
  item_is_active:       ["Is Active", "item_is_active"],
  item_company_id:      ["Company", "item_company"],
  item_branch_id:       ["Branch", "item_branch"],
  item_group_id:        ["Item Group", "item_group"],
  item_category_id:     ["Item Category", "Item_category"],
  item_section_id:      ["Item Section", "Item_Section"],
  item_brand_id:        ["Item Brand", "Item_Brand"],
  item_supplier_id:     ["Default Supplier", "item_default_supplier"],
  item_cust_group:      ["Item Customer Group", "Item_customer_group"],
};
// Tab "Ean Table" — the Rules & Status checkboxes + the two expiry number fields
const EAN_TABLE_TAB_WIDGET_FIELD_NAME_ALIASES: Record<string, readonly string[]> = {
  item_retail_item:          ["Retail Item", "item_retail_item", "item_Retail Item"],
  item_allow_sales:          ["Allow Sales", "item_allow_sales"],
  item_allow_loading:        ["Allow Loading", "item_allow_loading"],
  item_damagable_product:    ["Damagable Product", "item_damagable_product"],
  item_allow_neg_stock:      ["Allow Negative Stock", "item_allow_neg_stock", "item_allow_negative_stock"],
  item_allow_promo:          ["Allow Promo", "item_allow_promo"],
  item_price_list:           ["Price List", "item_price_list"],
  item_allow_sales_return:   ["Allow Sales Return", "item_allow_sales_return"],
  item_allow_freight:        ["Allow Freight", "item_allow_freight"],
  item_is_kit:               ["Is Kit", "item_is_kit"],
  item_allow_negative_so:    ["Allow Negative So", "item_allow_negative_so"],
  item_allow_loyalty:        ["Allow Loyalty", "item_allow_loyalty"],
  item_is_batch_based:       ["Batch Based", "item_is_batch_based", "item_batch_based"],
  item_allow_purchase:       ["Allow Purchase", "item_allow_purchase"],
  item_auto_break:           ["Auto Break", "item_auto_break"],
  item_is_demand:            ["Is Demand", "item_is_demand"],
  item_has_offer:            ["Has Offer", "item_has_offer"],
  item_barcode_sticker:      ["Barcode Sticker", "item_barcode_sticker"],
  item_is_service:           ["Service Item", "item_is_service", "item_service_item"],
  item_allow_po:             ["Allow Po", "item_allow_po"],
  item_auto_make:            ["Auto Make", "item_auto_make"],
  item_is_expiry_item:       ["Expiry Item", "item_is_expiry_item", "item_expiry_item"],
  item_random_stock:         ["Random Stock", "item_random_stock"],
  item_allow_so:             ["Allow So", "item_allow_so"],
  item_weigh_scale:          ["Weigh Scale", "item_weigh_scale", "item_weigh-scale"],
  item_expiry_days:          ["Expiry Days", "item_expiry_days"],
  item_intimate_before_days: ["Intimate Before Days", "item_intimate_before_days"],
};
// Tab "Inventory&Notes"
const INVENTORY_TAB_WIDGET_FIELD_NAME_ALIASES: Record<string, readonly string[]> = {
  item_storage_location: ["Storage Location", "item_storage_location"],
  item_image_url:        ["Image Url", "item_image_url", "item_image_URL"],
  item_photo_file:       ["Photo File", "item_photo_file"],
  item_notes:            ["Notes", "item_notes"],
};
export const WIDGET_FIELD_NAME_ALIASES: Record<string, readonly string[]> = {
  ...CORE_TAB_WIDGET_FIELD_NAME_ALIASES,
  ...EAN_TABLE_TAB_WIDGET_FIELD_NAME_ALIASES,
  ...INVENTORY_TAB_WIDGET_FIELD_NAME_ALIASES,
};
// Which form fields render under each tab. Visible Settings lists SECTIONS, not
// tabs, so a section is attributed to a tab by looking at where the fields it
// configures actually render — that keeps working whether the deployment's menu 29
// carries one section per tab (69/70/71) or the legacy split (55–58), and needs no
// section-name aliases of its own.
export const ITEM_FORM_FIELD_NAMES_BY_TAB_HEADING: Record<string, readonly string[]> = {
  [ITEM_CORE_TAB_HEADING_FIELD_NAME]: Object.keys(CORE_TAB_WIDGET_FIELD_NAME_ALIASES),
  [ITEM_EAN_TABLE_TAB_HEADING_FIELD_NAME]: Object.keys(EAN_TABLE_TAB_WIDGET_FIELD_NAME_ALIASES),
  [ITEM_INVENTORY_TAB_HEADING_FIELD_NAME]: Object.keys(INVENTORY_TAB_WIDGET_FIELD_NAME_ALIASES),
};
export const LOOKUP_QUERY_ITEM_TAXES = {
  module: "itemTaxes",
} as const;
export const ITEM_TAX_LIST_QUERY = {
  page: "1",
  // grid 5's stored SQL filters on a `wantdelete` placeholder token; bind it to
  // false so only non-deleted taxes are returned. Without it the unbound token
  // reaches Postgres as a column reference and the query 500s.
  grid_param: JSON.stringify({ wantdelete: false }),
} as const;
export const LOOKUP_QUERY_ITEMS = {
  module: "items",
} as const;
export const HSN_LOOKUP_QUERY = {
  module: "hsnCodes",
} as const;
export const BRANCH_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "branches", "branch_masters"],
  idKeys: ["brId", "br_id", "branch_id", "branchId", "id", "_id", "value"],
  labelKeys: ["brName", "br_name", "branch_name", "branchName", "name", "label"],
} as const;
export const COMPANY_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "companies", "company_masters"],
  idKeys: ["comp_id", "compId", "company_id", "companyId", "id", "_id", "value"],
  labelKeys: ["comp_name", "compName", "company_name", "companyName", "name", "label"],
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
// A price row's profit type stays unset until its unit is picked; the lazy
// default the legacy form applies at that moment is "By User" (operator-typed
// prices, markup unused).
export const ITEM_PRICE_DEFAULT_PROFIT_TYPE = "By User";
export const ITEM_PRICE_PROFIT_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "By %", label: "BY %" },
  { value: "By Rs", label: "BY Rs" },
  { value: "By User", label: "BY User" },
];
// Round Off is a fixed four-choice combo. It is saved as a number, so values
// read back from the server ("0.5", "1") are reformatted onto these canonical
// strings via normalizeItemPriceRoundOffValue before they reach the combo.
export const ITEM_PRICE_DEFAULT_ROUND_OFF = "0.01";
export const ITEM_PRICE_ROUND_OFF_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "0.01", label: "0.01" },
  { value: "0.50", label: "0.50" },
  { value: "1.00", label: "1.00" },
  { value: "5.00", label: "5.00" },
];
export const ITEM_REORDER_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "purchase", label: "Purchase" },
  { value: "production", label: "Production" },
  { value: "repack", label: "Repack" },
  { value: "transfer", label: "Transfer" },
];
// Company-level settings the legacy AppSession supplied. The server has no
// config endpoint for them yet, so they sit here with the legacy defaults;
// wire them to the real config source when one exists.
export const ITEM_PRICE_SKIP_MRP_VALIDATION = false;
export type ItemPriceBelowCostSetting = "restrict" | "warning" | "allow";
export const ITEM_PRICE_BELOW_COST_SETTING: ItemPriceBelowCostSetting = "warning";
// 0 disables the minimum-length rule for the selected HSN code.
export const ITEM_HSN_MIN_LENGTH = 0;
// Upper bound on price tiers (A-D); the effective count comes from the
// configured price levels fetched from /price-level-masters/get.
export const ITEM_PRICE_MAX_LEVEL_COUNT = 4;
export const PRICE_LEVEL_MASTERS_ENDPOINT = "/price-level-masters/get";
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
  awot: "ipm_price_a_wot",
  priceawot: "ipm_price_a_wot",
  bmargin: "ipm_price_b_markup_perc",
  saleb: "ipm_sales_price_b",
  bwot: "ipm_price_b_wot",
  pricebwot: "ipm_price_b_wot",
  cmargin: "ipm_price_c_markup_perc",
  salec: "ipm_sales_price_c",
  cwot: "ipm_price_c_wot",
  pricecwot: "ipm_price_c_wot",
  dmargin: "ipm_price_d_markup_perc",
  saled: "ipm_sales_price_d",
  dwot: "ipm_price_d_wot",
  pricedwot: "ipm_price_d_wot",
  max: "ipm_max_price",
  min: "ipm_min_price",
  disc: "ipm_disc_perc",
  discqty: "ipm_disc_qty",
  cess: "ipm_addl_cess",
  loading: "ipm_loading_charge",
  freight: "ipm_freight_charge",
  bigunit: "ipm_is_big_unit",
  remarks: "ipm_uom_remarks",
  points: "ipm_loyalty_points",
} as const;
export const ITEM_REORDER_TABLE_COLUMN_NAME_TO_KEY = {
  branch: "ir_branch_id",
  unit: "ir_unit_id",
  unitcode: "ir_unit_id",
  godown: "ir_godown_id",
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
  ipm_company_id: "",
  ipm_branch_id: "",
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
  ipm_cost_is_derived: "false",
};
export const ITEM_REORDER_INITIAL_FORM_VALUES: Record<string, string> = {
  ir_id: "",
  ir_branch_id: "",
  ir_unit_id: "",
  ir_godown_id: "",
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
  ir_branch_id: "",
  ir_unit_id: "",
  ir_godown_id: "",
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
  item_retail_item: "false",
  item_is_kit: "false",
  item_auto_break: "false",
  item_auto_make: "false",
  item_allow_loyalty: "true",
  item_allow_promo: "true",
  item_has_offer: "false",
  item_damagable_product: "true",
  item_is_demand: "false",
  item_allow_loading: "true",
  item_allow_freight: "true",
  item_random_stock: "true",
  item_barcode_sticker: "true",
  ir_is_active: "true",
  ean_is_default: "false",
  ean_is_active: "true",
  item_is_active: "true",
  ...ITEM_PRICE_INITIAL_FORM_VALUES,
};
export const ITEM_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(calc(84vw/var(--erp-ui-scale)), 88rem)",
  height: "calc(80vh/var(--erp-ui-scale))",
  maxHeight: "calc(80vh/var(--erp-ui-scale))",
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
// A banded group title, matching `.erp-ms-modal-band` in the global master
// skin. It stays an inline style (rather than that class) only because the
// grid placement below has to travel with the element.
export const ITEM_INLINE_SECTION_HEADING_STYLE: CSSProperties = {
  gridColumn: "1 / -1",
  margin: "10px 0 0",
  padding: "5px 10px",
  border: "1px solid var(--erp-ms-line-soft, #e3e3e3)",
  background: "var(--erp-ms-head, #ededed)",
  color: "var(--erp-ms-ink-soft, #555)",
  fontSize: "12px",
  fontWeight: 600,
  letterSpacing: "0.04em",
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
  "ir_branch_id",
  "ir_unit_id",
  "ir_godown_id",
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
  "ipm_company_id",
  "ipm_branch_id",
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
  "ipm_cost_is_derived",
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
  "ir_branch_id",
  "ir_unit_id",
  "ir_godown_id",
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
  "ean_remarks",
] as const;
export const ITEM_EAN_ROW_BOOLEAN_FIELD_NAMES = ["ean_is_default", "ean_is_active"] as const;
// A new price row is created with these already filled in, so they say nothing
// about whether the user has actually used the row. Only the remaining fields
// make a row count as a real one for validation and submission.
const ITEM_PRICE_PREFILLED_FIELD_NAMES: readonly string[] = [
  "ipm_id",
  "ipm_to_base_factor",
  "ipm_unit_factor",
  "ipm_profit_type",
];
export const ITEM_PRICE_CONTENT_FIELD_NAMES = ITEM_PRICE_TEXT_FIELD_NAMES.filter(
  (fieldName) => !ITEM_PRICE_PREFILLED_FIELD_NAMES.includes(fieldName),
);
export const ITEM_PRICE_SUBMISSION_FIELD_NAMES = [
  "ipm_company_id",
  "ipm_branch_id",
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
  "ir_branch_id",
  "ir_unit_id",
  "ir_godown_id",
  "ir_min_level",
  "ir_max_level",
  "ir_reorder_level",
  "ir_reorder_qty",
  "ir_reorder_type",
] as const;
export const ITEM_EAN_CONTENT_FIELD_NAMES = ["ean_code", "ean_remarks"] as const;