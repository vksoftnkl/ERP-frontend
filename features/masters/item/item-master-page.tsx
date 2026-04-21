"use client";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage, {
  type CrudMasterPageController,
} from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicCustomFieldRenderProps,
  ERPDynamicFieldValueChangeResult,
  ERPDynamicModalField,
  ERPDynamicSearchQueryChangeHandler,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  getFirstDefinedValue,
  toCsvFromArray,
  toDisplayValue,
  toNonNegativeInteger,
  toNullableString,
  toSelectBoolean,
  toUniqueStringArrayFromCsv,
  toUpdateId,
  toUpper,
  DEFAULT_LOOKUP_ARRAY_KEYS,
} from "@/app/master/_shared/crud-utils";
import ItemLinkedRecordsEditor, {
  parseLinkedRecordRows,
  serializeLinkedRecordRows,
  type LinkedRecordColumn,
  type LinkedRecordRow,
} from "./item-linked-records-editor";
import { normalizeItemPriceRowsForRules } from "./item-price-row-rules";
import {
  applyConfiguredLinkedTableColumnConfig,
  assignBooleanFieldsFromSource,
  assignTextFieldsFromSource,
  extractArrayRecords,
  extractResponseRecord,
  extractUiTableColumnConfigRecords,
  fileToBase64,
  getFieldValue,
  hasLinkedRows,
  mergeLookupOptionSets,
  toHsnOptions,
  toLookupOptions,
  toOptionalNonNegativeInteger,
  toOptionalNonNegativeNumber,
  toTrimmedOrUndefined,
  toUpperNullable,
} from "./item-master-page.utils";
import type {
  BuildItemRequestPayloadArgs,
  ItemFormDefaults,
  ItemPriceTaxContext,
} from "./type";
const API_ENDPOINTS = {
  list: "/items/list",
  getById: "/items/get",
  create: "/items/create",
  delete: "/items/delete",
} as const;
const ITEM_PRICE_API_ENDPOINTS = {
  list: "/item-prices/list",
  create: "/item-prices/create",
  delete: "/item-prices/delete",
} as const;
// Item unit conversion CRUD is handled by the item price master endpoints.
// The request payload shape differs, but the URLs are the same.
const ITEM_REORDER_API_ENDPOINTS = {
  list: "/item-reorders/list",
  create: "/item-reorders/create",
  delete: "/item-reorders/delete",
} as const;
const ITEM_EAN_CODE_API_ENDPOINTS = {
  list: "/item-ean-codes/list",
  create: "/item-ean-codes/create",
  delete: "/item-ean-codes/delete",
} as const;
const GRID_TABLE_NAME = "item_master";
const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const TAX_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const COMPANY_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const BRANCH_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const ITEM_GROUP_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const ITEM_CATEGORY_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const ITEM_BRAND_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const ITEM_SECTION_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const UNIT_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const GODOWN_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const HSN_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const UI_TABLE_COLUMNS_ENDPOINT = "/ui-table-columns/list";
const WIDGET_MASTER_LIST_ENDPOINT = "/widget-masters/list";
const ITEM_TAX_MASTER_LIST_ENDPOINT = "/item-taxes/list";
const ITEM_PRICE_QUERY_LIMIT = "100";
const ITEM_UNIT_CONVERSION_QUERY_LIMIT = "100";
const ITEM_REORDER_QUERY_LIMIT = "100";
const ITEM_EAN_CODE_QUERY_LIMIT = "100";
const UI_TABLE_COLUMNS_QUERY_LIMIT = "100";
const ITEM_WIDGET_QUERY_LIMIT = "100";
const ITEM_GROUP_SEARCH_DEBOUNCE_MS = 250;
const ITEM_REORDER_TABLE_UI_ID = "2";
const ITEM_PRICE_TABLE_UI_ID = "3";
const ITEM_EAN_TABLE_UI_ID = "4";
const ITEM_MASTER_WIDGET_GROUP_ID = "5";
const ITEM_MASTER_WIDGET_TYPE = "web";
const UUID_PATTERN = "^[0-9a-fA-F-]{36}$";
const ITEM_PRICE_ROWS_FIELD_NAME = "item_price_rows_json";
const ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME = "item_unit_conversion_rows_json";
const ITEM_REORDER_ROWS_FIELD_NAME = "item_reorder_rows_json";
const ITEM_EAN_ROWS_FIELD_NAME = "item_ean_rows_json";
const COMPANY_LOOKUP_QUERY = {
  module: "companies",
  limit: "100",
} as const;
const BRANCH_LOOKUP_QUERY = {
  module: "branches",
  limit: "100",
} as const;
const ITEM_GROUP_LOOKUP_QUERY = {
  module: "itemGroups",
  search: " speakers",
} as const;
const ITEM_CATEGORY_LOOKUP_QUERY = {
  module: "itemCategories",
  limit: "100",
} as const;
const ITEM_BRAND_LOOKUP_QUERY = {
  module: "itemBrands",
  limit: "100",
} as const;
const ITEM_SECTION_LOOKUP_QUERY = {
  module: "itemSections",
  limit: "100",
} as const;
const UNIT_LOOKUP_QUERY = {
  module: "units",
  limit: "100",
} as const;
const GODOWN_LOOKUP_QUERY = {
  module: "godownLocations",
  limit: "100",
} as const;
const UI_TABLE_COLUMNS_QUERY = {
  page: "1",
  limit: UI_TABLE_COLUMNS_QUERY_LIMIT,
  uiTblClmTableId: ITEM_PRICE_TABLE_UI_ID,
  uiTblClmIsActive: "true",
} as const;
const UI_REORDER_TABLE_COLUMNS_QUERY = {
  page: "1",
  limit: UI_TABLE_COLUMNS_QUERY_LIMIT,
  uiTblClmTableId: ITEM_REORDER_TABLE_UI_ID,
  uiTblClmIsActive: "true",
} as const;
const UI_EAN_TABLE_COLUMNS_QUERY = {
  page: "1",
  limit: UI_TABLE_COLUMNS_QUERY_LIMIT,
  uiTblClmTableId: ITEM_EAN_TABLE_UI_ID,
  uiTblClmIsActive: "true",
} as const;
const ITEM_MASTER_WIDGET_QUERY = {
  page: "1",
  limit: ITEM_WIDGET_QUERY_LIMIT,
  widgetGroupId: ITEM_MASTER_WIDGET_GROUP_ID,
  widgetType: ITEM_MASTER_WIDGET_TYPE,
} as const;
const LOOKUP_QUERY_ITEM_TAXES = {
  module: "itemTaxes",
} as const;
const ITEM_TAX_LIST_QUERY = {
  page: "1",
  limit: "100",
  tax_is_active: "true",
} as const;
const LOOKUP_QUERY_SUPPLIERS = {
  module: "suppliers",
  limit: "50",
} as const;
const LOOKUP_QUERY_CUSTOMER_GROUPS = {
  module: "customerGroups",
  limit: "50",
} as const;
const LOOKUP_QUERY_ITEMS = {
  module: "items",
  limit: "50",
} as const;
const HSN_LOOKUP_QUERY = {
  module: "hsnCodes",
  limit: "100",
} as const;
const COMPANY_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "companies", "companys"],
  idKeys: ["compId", "comp_id", "company_id", "companyId", "id", "_id", "value"],
  labelKeys: ["compName", "comp_name", "company_name", "companyName", "name", "label"],
} as const;
const BRANCH_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "branches", "branch_masters"],
  idKeys: ["brId", "br_id", "branch_id", "branchId", "id", "_id", "value"],
  labelKeys: ["brName", "br_name", "branch_name", "branchName", "name", "label"],
} as const;
const GROUP_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "groups", "itemGroups"],
  idKeys: ["group_id", "groupId", "itg_id", "item_group_id", "itemGroupId", "id", "_id", "value"],
  labelKeys: ["group_name", "groupName", "itg_name", "item_group_name", "itemGroupName", "name", "label"],
} as const;
const CATEGORY_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "categories", "itemCategories", "item_categories"],
  idKeys: ["category_id", "categoryId", "item_category_id", "itemCategoryId", "id", "_id", "value"],
  labelKeys: ["category_name", "categoryName", "item_category_name", "itemCategoryName", "name", "label"],
} as const;
const BRAND_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "brands", "itemBrands"],
  idKeys: ["brand_id", "brandId", "item_brand_id", "itemBrandId", "id", "_id", "value"],
  labelKeys: ["brand_name", "brandName", "item_brand_name", "itemBrandName", "name", "label"],
} as const;
const SECTION_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "sections", "itemSections", "item_sections"],
  idKeys: ["sec_id", "secId", "section_id", "sectionId", "item_section_id", "itemSectionId", "id", "_id", "value"],
  labelKeys: ["sec_name", "secName", "section_name", "sectionName", "item_section_name", "itemSectionName", "name", "label"],
} as const;
const UNIT_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "units", "itemUnits"],
  idKeys: ["unit_id", "unitId", "item_unit_id", "itemUnitId", "uom_id", "id", "_id", "value"],
  labelKeys: ["unit_name", "unitName", "item_unit_name", "itemUnitName", "uom_name", "name", "label"],
} as const;
const GODOWN_LOOKUP_KEYS = {
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
const LOOKUP_KEYS = {
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
const REQUEST_PAYLOAD_KEYS = {
  id: "item_id",
  name: "item_name_en",
  alias: "item_stock_type",
  short: "item_code",
  description: "item_notes",
  sort: "item_sort_order",
} as const;
const DEFAULT_COMPANY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Company",
};
const DEFAULT_BRANCH_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
const DEFAULT_GROUP_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Item Group",
};
const DEFAULT_CATEGORY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
const DEFAULT_BRAND_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
const DEFAULT_SECTION_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
const DEFAULT_UNIT_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Base Unit",
};
const DEFAULT_GODOWN_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Global Price",
};
const DEFAULT_TAX_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
const TAX_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "itemTaxes"],
  idKeys: ["taxId", "tax_id", "id", "_id", "value"],
  labelKeys: ["taxName", "tax_name", "name", "label"],
} as const;
const DEFAULT_SUPPLIER_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
const DEFAULT_HSN_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select HSN Code",
};
const DEFAULT_CUSTOMER_GROUP_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
const DEFAULT_PACKING_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
const ITEM_BATCH_CONFIG_NONE_VALUE = "0";
const ITEM_BATCH_CONFIG_MRP_VALUE = "1";
const ITEM_BATCH_CONFIG_BATCH_VALUE = "2";
const BATCH_CONFIG_OPTIONS: ERPDynamicSelectOption[] = [
  { value: ITEM_BATCH_CONFIG_NONE_VALUE, label: "NONE" },
  { value: ITEM_BATCH_CONFIG_MRP_VALUE, label: "MRP" },
  { value: ITEM_BATCH_CONFIG_BATCH_VALUE, label: "BATCH" },
];
const ITEM_PRICE_DEFAULT_PROFIT_TYPE = "BY_PERCENT";
const ITEM_PRICE_PROFIT_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "BY_PERCENT", label: "BY %" },
  { value: "BY_AMOUNT", label: "BY Rs " },
  { value: "MANUAL", label: "BY User" },
];
const ITEM_PRICE_ROUND_OFF_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "0.01", label: "0.01" },
  { value: "0.5", label: "0.5" },
  { value: "1", label: "1" },
  { value: "5", label: "5" },
  { value: "10", label: "10" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
];
const ITEM_REORDER_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "purchase", label: "Purchase" },
  { value: "production", label: "Production" },
  { value: "repack", label: "Repack" },
  { value: "transfer", label: "Transfer" },
];
const ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS = [
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
const ITEM_PRICE_TABLE_COLUMN_NAME_TO_KEY = {
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
const ITEM_REORDER_TABLE_COLUMN_NAME_TO_KEY = {
  minlevel: "ir_min_level",
  maxlevel: "ir_max_level",
  reorderlevel: "ir_reorder_level",
  reorderqty: "ir_reorder_qty",
  reordertype: "ir_reorder_type",
} as const;
const ITEM_EAN_TABLE_COLUMN_NAME_TO_KEY = {
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
const ITEM_PRICE_INITIAL_FORM_VALUES: Record<string, string> = {
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
const ITEM_REORDER_INITIAL_FORM_VALUES: Record<string, string> = {
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
const ITEM_EAN_INITIAL_FORM_VALUES: Record<string, string> = {
  ean_id: "",
  ean_unit_id: "",
  ean_code: "",
  ean_godown_id: "",
  ean_remarks: "",
  ean_is_default: "false",
  ean_is_active: "true",
};
const ITEM_UNIT_CONVERSION_INITIAL_FORM_VALUES: Record<string, string> = {
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
const ITEM_INITIAL_FORM_VALUES: Record<string, string> = {
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
const ITEM_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(84vw, 88rem)",
  height: "80vh",
  maxHeight: "80vh",
};

function normalizeItemBatchConfigValue(value: unknown): string {
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
const ITEM_INLINE_SECTION_HEADING_STYLE: CSSProperties = {
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
const ITEM_CHECKBOX_CONTROL_STYLE: CSSProperties = {
  width: "14px",
  height: "14px",
};
const ITEM_TEXT_FIELD_NAMES = [
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
const ITEM_BOOLEAN_FIELD_NAMES = [
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
const ITEM_PRICE_TEXT_FIELD_NAMES = [
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
const ITEM_PRICE_BOOLEAN_FIELD_NAMES = [
  "ipm_is_default_unit",
  "ipm_is_base_unit",
  "ipm_is_big_unit",
  "ipm_is_active",
] as const;
const ITEM_PRICE_SYNC_FIELD_NAMES = [
  ...ITEM_PRICE_TEXT_FIELD_NAMES,
  ...ITEM_PRICE_BOOLEAN_FIELD_NAMES,
  ITEM_PRICE_ROWS_FIELD_NAME,
] as const;
const ITEM_UNIT_CONVERSION_ROW_TEXT_FIELD_NAMES = [
  "iuc_id",
  "iuc_unit_id",
  "iuc_unit_slno",
  "iuc_to_base_factor",
  "iuc_unit_factor",
  "iuc_uom_weight",
  "iuc_uom_remarks",
] as const;
const ITEM_UNIT_CONVERSION_ROW_BOOLEAN_FIELD_NAMES = [
  "iuc_is_default_unit",
  "iuc_is_base_unit",
  "iuc_is_big_unit",
  "iuc_is_active",
] as const;
const ITEM_REORDER_ROW_TEXT_FIELD_NAMES = [
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
const ITEM_REORDER_ROW_BOOLEAN_FIELD_NAMES = ["ir_is_active"] as const;
const ITEM_EAN_ROW_TEXT_FIELD_NAMES = [
  "ean_id",
  "ean_unit_id",
  "ean_code",
  "ean_godown_id",
  "ean_remarks",
] as const;
const ITEM_EAN_ROW_BOOLEAN_FIELD_NAMES = ["ean_is_default", "ean_is_active"] as const;
const ITEM_PRICE_CONTENT_FIELD_NAMES = ITEM_PRICE_TEXT_FIELD_NAMES.filter(
  (fieldName) => fieldName !== "ipm_id",
);
const ITEM_PRICE_SUBMISSION_FIELD_NAMES = [
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
const ITEM_UNIT_CONVERSION_CONTENT_FIELD_NAMES = ["iuc_unit_id"] as const;
const ITEM_REORDER_CONTENT_FIELD_NAMES = [
  "ir_min_level",
  "ir_max_level",
  "ir_reorder_level",
  "ir_reorder_qty",
  "ir_reorder_type",
] as const;
const ITEM_EAN_CONTENT_FIELD_NAMES = ["ean_code", "ean_godown_id", "ean_remarks"] as const;
const WIDGET_NUMBER_KEYS = ["widgetNo", "widget_no", "id", "_id"] as const;
const WIDGET_GROUP_ID_KEYS = ["widgetGroupId", "widget_group_id", "groupId", "group_id"] as const;
const WIDGET_NAME_KEYS = ["widgetName", "widget_name", "name"] as const;
const WIDGET_POSITION_KEYS = ["widgetPosition", "widget_position", "position", "sort"] as const;
const WIDGET_VISIBILITY_KEYS = [
  "widgetVisibility",
  "widget_visibility",
  "visible",
  "isVisible",
] as const;
const WIDGET_GUI_NAME_KEYS = ["widgetGuiName", "widget_gui_name", "guiName", "gui_name"] as const;
const WIDGET_SECONDARY_TEXT_KEYS = [
  "widgetSecondaryText",
  "widget_secondary_text",
  "secondaryText",
  "secondary_text",
] as const;

type ItemWidgetConfigRecord = {
  widgetNo: string;
  widgetGroupId: string;
  widgetName: string;
  widgetPosition: number;
  widgetVisibility: boolean;
  widgetGuiName: string;
  widgetSecondaryText: string;
};

type ItemMasterPageContentProps = {
  inlineModalOnly?: boolean;
  onCrudControllerReady?: (controller: CrudMasterPageController | null) => void;
  onModalOpenChange?: (open: boolean, variantKey: string | null) => void;
  onItemSaved?: (params: {
    itemId: string;
    shouldUpdate: boolean;
    values: Record<string, string>;
  }) => void | Promise<void>;
};

type ItemFormSection = {
  heading: ERPDynamicModalField | null;
  fields: ERPDynamicModalField[];
};
function parseOptionalItemPriceNumber(value: string | undefined): number | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    return null;
  }
  const parsedValue = Number(normalized);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}
function roundDerivedItemPriceValue(
  value: number,
  roundOffValue: string | undefined,
): number {
  const roundOffStep = parseOptionalItemPriceNumber(roundOffValue);
  if (roundOffStep === null || roundOffStep <= 0) {
    return value;
  }
  return Number(
    (Math.round((value + Number.EPSILON) / roundOffStep) * roundOffStep).toFixed(
      4,
    ),
  );
}
function formatDerivedItemPriceNumber(value: number): string {
  const normalized = value.toFixed(4).replace(/\.?0+$/, "");
  return normalized === "-0" ? "0" : normalized;
}
function normalizeItemPriceProfitType(value: string | undefined): string {
  const normalized = (value ?? "").trim();
  if (normalized === "BY %" || normalized === "BY_PERCENT") {
    return "BY_PERCENT";
  }
  if (normalized === "BY RS" || normalized === "BY_AMOUNT") {
    return "BY_AMOUNT";
  }
  if (normalized === "BY USER" || normalized === "MANUAL") {
    return "MANUAL";
  }
  return ITEM_PRICE_DEFAULT_PROFIT_TYPE;
}
function toDerivedItemPriceString(value: number | null): string {
  return value === null ? "" : formatDerivedItemPriceNumber(value);
}
function toItemPriceNumberFromUnknown(value: unknown): number {
  return parseOptionalItemPriceNumber(toDisplayValue(value)) ?? 0;
}
function resolveItemPriceTaxContext(
  values: Record<string, string>,
  itemTaxRecordsById: ReadonlyMap<string, Record<string, unknown>>,
): ItemPriceTaxContext {
  const taxId = (values.item_default_tax_id ?? "").trim();
  const taxRecord = taxId ? itemTaxRecordsById.get(taxId) : undefined;
  if (!taxRecord) {
    return {
      cessPerc: 0,
      cessQty: 0,
      gstPerc: 0,
    };
  }
  const purchaseIgst = toItemPriceNumberFromUnknown(
    getFieldValue(taxRecord, "tax_igst_pur_perc"),
  );
  const purchaseCgst = toItemPriceNumberFromUnknown(
    getFieldValue(taxRecord, "tax_cgst_pur_perc"),
  );
  const purchaseSgst = toItemPriceNumberFromUnknown(
    getFieldValue(taxRecord, "tax_sgst_pur_perc"),
  );
  const standardIgst = toItemPriceNumberFromUnknown(
    getFieldValue(taxRecord, "tax_igst_perc"),
  );
  const standardCgst = toItemPriceNumberFromUnknown(
    getFieldValue(taxRecord, "tax_cgst_perc"),
  );
  const standardSgst = toItemPriceNumberFromUnknown(
    getFieldValue(taxRecord, "tax_sgst_perc"),
  );
  const gstPerc =
    purchaseIgst > 0
      ? purchaseIgst
      : purchaseCgst > 0 || purchaseSgst > 0
        ? purchaseCgst + purchaseSgst
        : standardIgst > 0
          ? standardIgst
          : standardCgst + standardSgst;
  const purchaseCessPerc = toItemPriceNumberFromUnknown(
    getFieldValue(taxRecord, "tax_cess_pur_perc"),
  );
  const purchaseCessQty = toItemPriceNumberFromUnknown(
    getFieldValue(taxRecord, "tax_cess_pur_unit"),
  );
  return {
    cessPerc:
      purchaseCessPerc ||
      toItemPriceNumberFromUnknown(getFieldValue(taxRecord, "tax_cess_perc")),
    cessQty:
      purchaseCessQty ||
      toItemPriceNumberFromUnknown(getFieldValue(taxRecord, "tax_cess_unit")),
    gstPerc,
  };
}
function calculateItemPriceCostWithTax(
  costWot: number,
  taxContext: ItemPriceTaxContext,
): number {
  return (
    costWot +
    (costWot * (taxContext.gstPerc + taxContext.cessPerc)) / 100 +
    taxContext.cessQty
  );
}
function calculateItemPriceCostWithoutTax(
  cost: number,
  taxContext: ItemPriceTaxContext,
): number {
  const divisor = 1 + (taxContext.gstPerc + taxContext.cessPerc) / 100;
  if (divisor <= 0) {
    return Math.max(0, cost - taxContext.cessQty);
  }
  return (cost - taxContext.cessQty) / divisor;
}
function cloneItemPriceRows(rows: LinkedRecordRow[]): LinkedRecordRow[] {
  return rows.map((row) => ({ ...row }));
}
function setItemPriceRowValue(
  row: LinkedRecordRow,
  fieldName: keyof LinkedRecordRow,
  nextValue: string,
): void {
  row[fieldName] = nextValue;
}
function setDerivedItemPriceRowValue(
  row: LinkedRecordRow,
  fieldName: keyof LinkedRecordRow,
  nextValue: number | null,
): void {
  setItemPriceRowValue(row, fieldName, toDerivedItemPriceString(nextValue));
}
function resolveMirroredFactorValue(
  conversionValue: string | undefined,
  factorValue: string | undefined,
): string {
  return (factorValue ?? "").trim() || (conversionValue ?? "").trim();
}
function resolveMirroredConversionValue(
  conversionValue: string | undefined,
  factorValue: string | undefined,
): string {
  return (conversionValue ?? "").trim() || (factorValue ?? "").trim();
}
function resolveItemPriceUnitFactorValue(row: LinkedRecordRow): string {
  return resolveMirroredFactorValue(row.ipm_to_base_factor, row.ipm_unit_factor);
}
function resolveItemPriceToBaseFactorValue(row: LinkedRecordRow): string {
  return resolveMirroredConversionValue(row.ipm_to_base_factor, row.ipm_unit_factor);
}
function resolveItemUnitConversionUnitFactorValue(row: LinkedRecordRow): string {
  return resolveMirroredFactorValue(row.iuc_to_base_factor, row.iuc_unit_factor);
}
function resolveItemUnitConversionToBaseFactorValue(row: LinkedRecordRow): string {
  return resolveMirroredConversionValue(row.iuc_to_base_factor, row.iuc_unit_factor);
}
function syncItemPriceRowSaleWotValues(
  row: LinkedRecordRow,
  taxContext: ItemPriceTaxContext,
): LinkedRecordRow {
  const nextRow = { ...row };
  for (const { saleFieldName, saleWotFieldName } of ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS) {
    const saleValue = parseOptionalItemPriceNumber(nextRow[saleFieldName]);
    setDerivedItemPriceRowValue(
      nextRow,
      saleWotFieldName,
      saleValue === null
        ? null
        : calculateItemPriceCostWithoutTax(saleValue, taxContext),
    );
  }
  return nextRow;
}
function syncItemPriceRowFromProfitInputs(
  row: LinkedRecordRow,
  taxContext: ItemPriceTaxContext,
): LinkedRecordRow {
  let nextRow = { ...row };
  const normalizedProfitType = normalizeItemPriceProfitType(nextRow.ipm_profit_type);
  setItemPriceRowValue(nextRow, "ipm_profit_type", normalizedProfitType);
  if (normalizedProfitType !== "MANUAL") {
    const costPriceValue = parseOptionalItemPriceNumber(nextRow.ipm_cost_price);
    for (const { marginFieldName, saleFieldName } of ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS) {
      const marginValue = parseOptionalItemPriceNumber(nextRow[marginFieldName]) ?? 0;
      const nextSaleValue =
        costPriceValue === null
          ? null
          : roundDerivedItemPriceValue(
            normalizedProfitType === "BY_AMOUNT"
              ? costPriceValue + marginValue
              : costPriceValue + (costPriceValue * marginValue) / 100,
            nextRow.ipm_round_off,
          );

      setDerivedItemPriceRowValue(nextRow, saleFieldName, nextSaleValue);
    }
  }
  return syncItemPriceRowSaleWotValues(nextRow, taxContext);
}
function syncItemPriceRowFromSaleInputs(
  row: LinkedRecordRow,
  taxContext: ItemPriceTaxContext,
): LinkedRecordRow {
  let nextRow = syncItemPriceRowSaleWotValues(row, taxContext);
  const normalizedProfitType = normalizeItemPriceProfitType(nextRow.ipm_profit_type);
  setItemPriceRowValue(nextRow, "ipm_profit_type", normalizedProfitType);
  if (normalizedProfitType === "MANUAL") {
    return nextRow;
  }
  const costPriceValue = parseOptionalItemPriceNumber(nextRow.ipm_cost_price);
  if (costPriceValue === null) {
    return nextRow;
  }
  nextRow = { ...nextRow };
  for (const { marginFieldName, saleFieldName } of ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS) {
    const saleValue = parseOptionalItemPriceNumber(nextRow[saleFieldName]);
    const nextMarginValue =
      saleValue === null
        ? null
        : normalizedProfitType === "BY_AMOUNT"
          ? saleValue - costPriceValue
          : costPriceValue > 0
            ? ((saleValue - costPriceValue) / costPriceValue) * 100
            : 0;
    setDerivedItemPriceRowValue(nextRow, marginFieldName, nextMarginValue);
  }
  return nextRow;
}
function recalculateItemPriceRowsFromCostWot(
  rows: LinkedRecordRow[],
  rowIndex: number,
  taxContext: ItemPriceTaxContext,
): LinkedRecordRow[] {
  const nextRows = cloneItemPriceRows(rows);
  for (let index = rowIndex - 1; index >= 0; index -= 1) {
    const nextCostWot = parseOptionalItemPriceNumber(nextRows[index + 1]?.ipm_cost_wot);
    const conversionFactor = parseOptionalItemPriceNumber(
      nextRows[index + 1]?.ipm_unit_factor,
    );
    setDerivedItemPriceRowValue(
      nextRows[index],
      "ipm_cost_wot",
      nextCostWot === null || conversionFactor === null
        ? null
        : nextCostWot * conversionFactor,
    );
  }
  for (let index = rowIndex + 1; index < nextRows.length; index += 1) {
    const previousCostWot = parseOptionalItemPriceNumber(nextRows[index - 1]?.ipm_cost_wot);
    const conversionFactor = parseOptionalItemPriceNumber(
      nextRows[index]?.ipm_unit_factor,
    );
    setDerivedItemPriceRowValue(
      nextRows[index],
      "ipm_cost_wot",
      previousCostWot === null || conversionFactor === null || conversionFactor <= 0
        ? null
        : previousCostWot / conversionFactor,
    );
  }
  return nextRows.map((row) => {
    const nextRow = { ...row };
    const costWotValue = parseOptionalItemPriceNumber(nextRow.ipm_cost_wot);
    setDerivedItemPriceRowValue(
      nextRow,
      "ipm_cost_price",
      costWotValue === null
        ? null
        : calculateItemPriceCostWithTax(costWotValue, taxContext),
    );
    return syncItemPriceRowFromProfitInputs(nextRow, taxContext);
  });
}
function recalculateItemPriceRowsFromCostPrice(
  rows: LinkedRecordRow[],
  rowIndex: number,
  taxContext: ItemPriceTaxContext,
): LinkedRecordRow[] {
  const nextRows = cloneItemPriceRows(rows);
  for (let index = rowIndex - 1; index >= 0; index -= 1) {
    const nextCost = parseOptionalItemPriceNumber(nextRows[index + 1]?.ipm_cost_price);
    const conversionFactor = parseOptionalItemPriceNumber(
      nextRows[index + 1]?.ipm_to_base_factor,
    );
    setDerivedItemPriceRowValue(
      nextRows[index],
      "ipm_cost_price",
      nextCost === null || conversionFactor === null ? null : nextCost * conversionFactor,
    );
  }
  for (let index = rowIndex + 1; index < nextRows.length; index += 1) {
    const previousCost = parseOptionalItemPriceNumber(nextRows[index - 1]?.ipm_cost_price);
    const conversionFactor = parseOptionalItemPriceNumber(
      nextRows[index]?.ipm_to_base_factor,
    );
    setDerivedItemPriceRowValue(
      nextRows[index],
      "ipm_cost_price",
      previousCost === null || conversionFactor === null || conversionFactor <= 0
        ? null
        : previousCost / conversionFactor,
    );
  }
  return nextRows.map((row) => {
    const nextRow = { ...row };
    const costPriceValue = parseOptionalItemPriceNumber(nextRow.ipm_cost_price);
    setDerivedItemPriceRowValue(
      nextRow,
      "ipm_cost_wot",
      costPriceValue === null
        ? null
        : calculateItemPriceCostWithoutTax(costPriceValue, taxContext),
    );
    return syncItemPriceRowFromProfitInputs(nextRow, taxContext);
  });
}
function recalculateItemPriceRowsFromConversion(
  rows: LinkedRecordRow[],
  rowIndex: number,
  taxContext: ItemPriceTaxContext,
): LinkedRecordRow[] {
  const nextRows = cloneItemPriceRows(rows);
  for (let index = Math.max(rowIndex, 1); index < nextRows.length; index += 1) {
    const previousCost = parseOptionalItemPriceNumber(nextRows[index - 1]?.ipm_cost_price);
    const previousCostWot = parseOptionalItemPriceNumber(nextRows[index - 1]?.ipm_cost_wot);
    const conversionFactor = parseOptionalItemPriceNumber(
      nextRows[index]?.ipm_unit_factor,
    );
    setDerivedItemPriceRowValue(
      nextRows[index],
      "ipm_cost_price",
      previousCost === null || conversionFactor === null || conversionFactor <= 0
        ? null
        : previousCost / conversionFactor,
    );
    setDerivedItemPriceRowValue(
      nextRows[index],
      "ipm_cost_wot",
      previousCostWot === null || conversionFactor === null || conversionFactor <= 0
        ? null
        : previousCostWot / conversionFactor,
    );
    nextRows[index] = syncItemPriceRowFromProfitInputs(nextRows[index], taxContext);
  }
  return nextRows;
}
function recalculateAllItemPriceRowsForTaxContext(
  rows: LinkedRecordRow[],
  taxContext: ItemPriceTaxContext,
): LinkedRecordRow[] {
  return rows.map((row) => {
    const nextRow = { ...row };
    const costWotValue = parseOptionalItemPriceNumber(nextRow.ipm_cost_wot);
    const costPriceValue = parseOptionalItemPriceNumber(nextRow.ipm_cost_price);
    if (costPriceValue !== null) {
      setDerivedItemPriceRowValue(
        nextRow,
        "ipm_cost_wot",
        calculateItemPriceCostWithoutTax(costPriceValue, taxContext),
      );
    } else if (costWotValue !== null) {
      setDerivedItemPriceRowValue(
        nextRow,
        "ipm_cost_price",
        calculateItemPriceCostWithTax(costWotValue, taxContext),
      );
    }
    return syncItemPriceRowFromProfitInputs(nextRow, taxContext);
  });
}
function normalizeItemPriceRows(
  rows: LinkedRecordRow[],
): LinkedRecordRow[] {
  let hasChanges = false;
  const nextRows = rows.map((row) => {
    const normalizedProfitType = normalizeItemPriceProfitType(row.ipm_profit_type);
    const normalizedFactor = resolveItemPriceUnitFactorValue(row);
    if (
      (row.ipm_profit_type ?? "") === normalizedProfitType &&
      (row.ipm_to_base_factor ?? "") === normalizedFactor &&
      (row.ipm_unit_factor ?? "") === normalizedFactor
    ) {
      return row;
    }
    hasChanges = true;
    return {
      ...row,
      ipm_profit_type: normalizedProfitType,
      ipm_to_base_factor: normalizedFactor,
      ipm_unit_factor: normalizedFactor,
    };
  });
  return hasChanges ? nextRows : rows;
}
function detectChangedItemPriceField(
  previousRows: LinkedRecordRow[],
  nextRows: LinkedRecordRow[],
): { fieldName: string; rowIndex: number } | null {
  if (previousRows.length !== nextRows.length) {
    return null;
  }
  const rowFieldNames = [...ITEM_PRICE_TEXT_FIELD_NAMES, ...ITEM_PRICE_BOOLEAN_FIELD_NAMES];
  for (let rowIndex = 0; rowIndex < nextRows.length; rowIndex += 1) {
    const previousRow = previousRows[rowIndex] ?? {};
    const nextRow = nextRows[rowIndex] ?? {};
    for (const fieldName of rowFieldNames) {
      if ((previousRow[fieldName] ?? "") !== (nextRow[fieldName] ?? "")) {
        return {
          fieldName,
          rowIndex,
        };
      }
    }
  }
  return null;
}
function buildEmptyItemPriceRow(
  baseUnitId: string,
  options: {
    isBaseUnit?: boolean;
    isDefaultUnit?: boolean;
  } = {},
): LinkedRecordRow {
  const normalizedBaseUnitId = baseUnitId.trim();
  return {
    ...ITEM_PRICE_INITIAL_FORM_VALUES,
    ipm_id: "",
    ipm_unit_id: normalizedBaseUnitId,
    ipm_to_base_factor: "1",
    ipm_unit_factor: "1",
    ipm_profit_type: ITEM_PRICE_DEFAULT_PROFIT_TYPE,
    ipm_is_default_unit: options.isDefaultUnit ? "true" : "false",
    ipm_is_base_unit: options.isBaseUnit ? "true" : "false",
    ipm_is_active: ITEM_PRICE_INITIAL_FORM_VALUES.ipm_is_active,
  };
}
function buildDefaultBaseItemUnitConversionRow(baseUnitId: string): LinkedRecordRow {
  return {
    ...ITEM_UNIT_CONVERSION_INITIAL_FORM_VALUES,
    iuc_unit_id: baseUnitId.trim(),
    iuc_unit_slno: "1",
    iuc_to_base_factor: "1",
    iuc_unit_factor: "1",
    iuc_is_default_unit: "true",
    iuc_is_base_unit: "true",
    iuc_is_active: ITEM_UNIT_CONVERSION_INITIAL_FORM_VALUES.iuc_is_active,
  };
}
function buildEmptyItemUnitConversionRow(
  baseUnitId: string,
  nextUnitSlno = 1,
): LinkedRecordRow {
  return {
    ...ITEM_UNIT_CONVERSION_INITIAL_FORM_VALUES,
    iuc_unit_slno: String(nextUnitSlno),
    iuc_to_base_factor: "1",
    iuc_unit_factor: "1",
    iuc_uom_weight: ITEM_UNIT_CONVERSION_INITIAL_FORM_VALUES.iuc_uom_weight,
    iuc_is_active: ITEM_UNIT_CONVERSION_INITIAL_FORM_VALUES.iuc_is_active,
    ...(nextUnitSlno <= 1 ? buildDefaultBaseItemUnitConversionRow(baseUnitId) : {}),
  };
}
function buildItemUnitConversionRowsByUnitId(
  values: Record<string, string>,
): Map<string, LinkedRecordRow> {
  return new Map(
    buildManagedItemUnitConversionRows(values)
      .filter((row) => (row.iuc_is_active ?? "true") === "true")
      .map((row) => [(row.iuc_unit_id ?? "").trim(), row] as const)
      .filter(([unitId]) => Boolean(unitId)),
  );
}
function resolveLinkedBaseUnitId(
  values: Record<string, string>,
  options: {
    priceRows?: LinkedRecordRow[];
    unitConversionRows?: LinkedRecordRow[];
  } = {},
): string {
  const priceRows =
    options.priceRows ??
    parseLinkedRecordRows(values[ITEM_PRICE_ROWS_FIELD_NAME] ?? "");
  for (const row of priceRows) {
    if ((row.ipm_is_base_unit ?? "false") !== "true") {
      continue;
    }
    const unitId = (row.ipm_unit_id ?? "").trim();
    if (unitId) {
      return unitId;
    }
  }
  const unitConversionRows =
    options.unitConversionRows ??
    parseLinkedRecordRows(values[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME] ?? "");
  for (const row of unitConversionRows) {
    if ((row.iuc_is_base_unit ?? "false") !== "true") {
      continue;
    }
    const unitId = (row.iuc_unit_id ?? "").trim();
    if (unitId) {
      return unitId;
    }
  }
  return (values.item_base_unit_id ?? "").trim();
}
function syncSerializedItemUnitConversionRowsFromPriceRows(
  serializedItemUnitConversionRows: string,
  serializedPriceRows: string,
  values: Record<string, string>,
): string {
  const priceRows = parseLinkedRecordRows(serializedPriceRows).filter(
    (row) =>
      Boolean((row.ipm_unit_id ?? "").trim()) ||
      hasLinkedRowContent(row, ITEM_PRICE_CONTENT_FIELD_NAMES),
  );
  const baseUnitId = resolveLinkedBaseUnitId(values, {
    priceRows,
  });
  if (!baseUnitId) {
    return serializedItemUnitConversionRows;
  }
  if (priceRows.length === 0) {
    return syncSerializedItemUnitConversionRows(
      serializedItemUnitConversionRows,
      values,
    );
  }
  const existingRows = parseLinkedRecordRows(serializedItemUnitConversionRows);
  const existingRowsByUnitId = new Map(
    existingRows
      .map((row) => [(row.iuc_unit_id ?? "").trim(), row] as const)
      .filter(([unitId]) => Boolean(unitId)),
  );
  const priceRowUnitIds = new Set<string>();
  const nextRows: LinkedRecordRow[] = [];
  for (const [index, row] of priceRows.entries()) {
    const unitId = (row.ipm_unit_id ?? "").trim();
    if (!unitId || priceRowUnitIds.has(unitId)) {
      continue;
    }
    priceRowUnitIds.add(unitId);
    const existingRow = existingRowsByUnitId.get(unitId);
    nextRows.push({
      ...buildEmptyItemUnitConversionRow(baseUnitId, index + 1),
      ...existingRow,
      iuc_unit_id: unitId,
      iuc_unit_slno:
        (row.ipm_unit_slno ?? "").trim() ||
        (existingRow?.iuc_unit_slno ?? "").trim() ||
        String(index + 1),
      iuc_to_base_factor:
        resolveItemPriceToBaseFactorValue(row) ||
        resolveItemUnitConversionToBaseFactorValue(existingRow ?? {}) ||
        (unitId === baseUnitId ? "1" : ""),
      iuc_unit_factor:
        resolveItemPriceUnitFactorValue(row) ||
        resolveItemUnitConversionUnitFactorValue(existingRow ?? {}) ||
        "1",
      iuc_is_default_unit:
        (row.ipm_is_default_unit ?? "false") === "true" ? "true" : "false",
      iuc_is_base_unit:
        (row.ipm_is_base_unit ?? "false") === "true" ? "true" : "false",
      iuc_is_big_unit:
        (row.ipm_is_big_unit ?? "false") === "true" ? "true" : "false",
    });
  }
  return syncSerializedItemUnitConversionRows(
    serializeLinkedRecordRows(nextRows),
    values,
  );
}
function syncItemPriceRowsWithUnitConversions(
  serializedRows: string,
  values: Record<string, string>,
): string {
  const rows = parseLinkedRecordRows(serializedRows);
  if (rows.length === 0) {
    return serializedRows;
  }
  const baseUnitId = (values.item_base_unit_id ?? "").trim();
  const itemUnitConversionsByUnitId = buildItemUnitConversionRowsByUnitId(values);
  let hasChanges = false;
  const nextRows = rows.map((row) => {
    const unitId = (row.ipm_unit_id ?? "").trim() || baseUnitId;
    const matchingUnitConversion = itemUnitConversionsByUnitId.get(unitId);
    if (!matchingUnitConversion) {
      return row;
    }
    const nextRow = { ...row };
    const nextFactor =
      resolveItemUnitConversionToBaseFactorValue(matchingUnitConversion) ||
      (unitId === baseUnitId ? "1" : "");
    const nextUnitFactor =
      resolveItemUnitConversionUnitFactorValue(matchingUnitConversion) ||
      (unitId === baseUnitId ? "1" : "");
    const nextUnitSlno = (matchingUnitConversion.iuc_unit_slno ?? "").trim();
    const nextIsDefaultUnit =
      (matchingUnitConversion.iuc_is_default_unit ?? "false") === "true"
        ? "true"
        : "false";
    if ((nextRow.ipm_unit_id ?? "").trim() !== unitId) {
      nextRow.ipm_unit_id = unitId;
      hasChanges = true;
    }
    if ((nextRow.ipm_to_base_factor ?? "") !== nextFactor) {
      nextRow.ipm_to_base_factor = nextFactor;
      hasChanges = true;
    }
    if ((nextRow.ipm_unit_factor ?? "") !== nextUnitFactor) {
      nextRow.ipm_unit_factor = nextUnitFactor;
      hasChanges = true;
    }
    if ((nextRow.ipm_unit_slno ?? "") !== nextUnitSlno) {
      nextRow.ipm_unit_slno = nextUnitSlno;
      hasChanges = true;
    }
    if ((nextRow.ipm_is_default_unit ?? "false") !== nextIsDefaultUnit) {
      nextRow.ipm_is_default_unit = nextIsDefaultUnit;
      hasChanges = true;
    }
    return nextRow;
  });
  return hasChanges ? serializeLinkedRecordRows(nextRows) : serializedRows;
}
function syncSerializedItemPriceRows(
  serializedRows: string,
  values: Record<string, string>,
  itemTaxRecordsById: ReadonlyMap<string, Record<string, unknown>>,
  forceRecalculateAll = false,
): string {
  const rows = parseLinkedRecordRows(serializedRows);
  if (rows.length === 0) {
    return serializedRows;
  }
  const conversionSyncedRows = syncItemPriceRowsWithUnitConversions(
    serializedRows,
    values,
  );
  const effectiveRows =
    conversionSyncedRows === serializedRows
      ? rows
      : parseLinkedRecordRows(conversionSyncedRows);
  const previousRows = parseLinkedRecordRows(values[ITEM_PRICE_ROWS_FIELD_NAME] ?? "");
  const taxContext = resolveItemPriceTaxContext(values, itemTaxRecordsById);
  const changedField = detectChangedItemPriceField(previousRows, effectiveRows);
  let nextRows = effectiveRows;
  if (forceRecalculateAll) {
    nextRows = recalculateAllItemPriceRowsForTaxContext(effectiveRows, taxContext);
  } else if (!changedField) {
    nextRows = normalizeItemPriceRows(effectiveRows);
  } else if (changedField.fieldName === "ipm_cost_wot") {
    nextRows = recalculateItemPriceRowsFromCostWot(
      effectiveRows,
      changedField.rowIndex,
      taxContext,
    );
  } else if (changedField.fieldName === "ipm_cost_price") {
    nextRows = recalculateItemPriceRowsFromCostPrice(
      effectiveRows,
      changedField.rowIndex,
      taxContext,
    );
  } else if (
    changedField.fieldName === "ipm_to_base_factor" ||
    changedField.fieldName === "ipm_unit_factor"
  ) {
    nextRows = recalculateItemPriceRowsFromConversion(
      effectiveRows,
      changedField.rowIndex,
      taxContext,
    );
  } else if (
    changedField.fieldName === "ipm_profit_type" ||
    changedField.fieldName === "ipm_round_off" ||
    ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS.some(
      ({ marginFieldName }) => marginFieldName === changedField.fieldName,
    )
  ) {
    const recalculatedRows = cloneItemPriceRows(effectiveRows);
    recalculatedRows[changedField.rowIndex] = syncItemPriceRowFromProfitInputs(
      recalculatedRows[changedField.rowIndex] ?? {},
      taxContext,
    );
    nextRows = recalculatedRows;
  } else if (
    ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS.some(
      ({ saleFieldName }) => saleFieldName === changedField.fieldName,
    )
  ) {
    const recalculatedRows = cloneItemPriceRows(effectiveRows);
    recalculatedRows[changedField.rowIndex] = syncItemPriceRowFromSaleInputs(
      recalculatedRows[changedField.rowIndex] ?? {},
      taxContext,
    );
    nextRows = recalculatedRows;
  } else {
    nextRows = normalizeItemPriceRows(effectiveRows);
  }
  const normalizedRows = normalizeItemPriceRows(nextRows);
  const roleNormalizedRows = normalizeItemPriceRowsForRules(
    normalizedRows,
    (values.item_base_unit_id ?? "").trim(),
  );
  if (roleNormalizedRows !== normalizedRows) {
    return serializeLinkedRecordRows(roleNormalizedRows);
  }
  return normalizedRows === effectiveRows
    ? conversionSyncedRows
    : serializeLinkedRecordRows(normalizedRows);
}
function buildEmptyItemReorderRow(baseUnitId: string): LinkedRecordRow {
  return {
    ...ITEM_REORDER_INITIAL_FORM_VALUES,
    ir_unit_id: baseUnitId.trim(),
  };
}
function buildEmptyItemEanRow(
  baseUnitId: string,
  preferredUnitId: string,
  sourceRow?: LinkedRecordRow,
): LinkedRecordRow {
  const sourceUnitId = (sourceRow?.ean_unit_id ?? "").trim();
  const sourceGodownId = (sourceRow?.ean_godown_id ?? "").trim();
  return {
    ...ITEM_EAN_INITIAL_FORM_VALUES,
    ean_unit_id: sourceUnitId || preferredUnitId.trim() || baseUnitId.trim(),
    ean_godown_id: sourceGodownId,
  };
}
function collectLinkedRowUnitIds(
  rows: LinkedRecordRow[],
  fieldName: string,
): string[] {
  return rows
    .map((row) => (row[fieldName] ?? "").trim())
    .filter(Boolean);
}
function buildSelectableItemUnitOptions(
  values: Record<string, string>,
  unitOptions: ERPDynamicSelectOption[],
): ERPDynamicSelectOption[] {
  const selectableUnitIds = new Set<string>();
  const addUnitId = (value: string | undefined) => {
    const normalized = value?.trim() ?? "";
    if (normalized) {
      selectableUnitIds.add(normalized);
    }
  };
  addUnitId(values.item_base_unit_id);
  for (const unitId of buildManagedItemUnitConversionRows(values)
    .filter((row) => (row.iuc_is_active ?? "true") === "true")
    .map((row) => (row.iuc_unit_id ?? "").trim())
    .filter(Boolean)) {
    selectableUnitIds.add(unitId);
  }
  for (const unitId of collectLinkedRowUnitIds(
    parseLinkedRecordRows(values[ITEM_PRICE_ROWS_FIELD_NAME] ?? ""),
    "ipm_unit_id",
  )) {
    selectableUnitIds.add(unitId);
  }
  for (const unitId of collectLinkedRowUnitIds(
    parseLinkedRecordRows(values[ITEM_EAN_ROWS_FIELD_NAME] ?? ""),
    "ean_unit_id",
  )) {
    selectableUnitIds.add(unitId);
  }
  if (selectableUnitIds.size === 0) {
    return unitOptions;
  }
  return unitOptions.filter(
    (option) => !option.value || selectableUnitIds.has(option.value),
  );
}
function buildItemEanUnitOptions(
  values: Record<string, string>,
  unitOptions: ERPDynamicSelectOption[],
): ERPDynamicSelectOption[] {
  return buildSelectableItemUnitOptions(values, unitOptions);
}
function buildItemUnitConversionUnitOptions(
  rows: LinkedRecordRow[],
  unitOptions: ERPDynamicSelectOption[],
  rowIndex: number,
): ERPDynamicSelectOption[] {
  const currentUnitId = (rows[rowIndex]?.iuc_unit_id ?? "").trim();
  const usedUnitIds = new Set(
    rows
      .map((row, index) => (index === rowIndex ? "" : (row.iuc_unit_id ?? "").trim()))
      .filter(Boolean),
  );
  return unitOptions.filter(
    (option) =>
      !option.value ||
      option.value === currentUnitId ||
      !usedUnitIds.has(option.value),
  );
}
function buildItemPriceUnitOptions(
  rows: LinkedRecordRow[],
  unitOptions: ERPDynamicSelectOption[],
  rowIndex: number,
): ERPDynamicSelectOption[] {
  const currentUnitId = (rows[rowIndex]?.ipm_unit_id ?? "").trim();
  const usedUnitIds = new Set(
    rows
      .map((row, index) => (index === rowIndex ? "" : (row.ipm_unit_id ?? "").trim()))
      .filter(Boolean),
  );
  return unitOptions.filter(
    (option) =>
      !option.value ||
      option.value === currentUnitId ||
      !usedUnitIds.has(option.value),
  );
}
function resolvePreferredItemEanUnitId(values: Record<string, string>): string {
  const primaryPriceUnitId = (values.ipm_unit_id ?? "").trim();
  if (primaryPriceUnitId) {
    return primaryPriceUnitId;
  }
  const itemUnitConversionIds = collectLinkedRowUnitIds(
    parseLinkedRecordRows(values[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME] ?? ""),
    "iuc_unit_id",
  );
  if (itemUnitConversionIds.length > 0) {
    return itemUnitConversionIds[itemUnitConversionIds.length - 1] ?? "";
  }
  const priceRowUnitIds = collectLinkedRowUnitIds(
    parseLinkedRecordRows(values[ITEM_PRICE_ROWS_FIELD_NAME] ?? ""),
    "ipm_unit_id",
  );
  if (priceRowUnitIds.length > 0) {
    return priceRowUnitIds[priceRowUnitIds.length - 1] ?? "";
  }
  return (values.item_base_unit_id ?? "").trim();
}
function syncSerializedRowUnitIds(
  serializedRows: string,
  unitFieldName: string,
  nextBaseUnitId: string,
  previousBaseUnitId: string,
): string | null {
  if (!nextBaseUnitId.trim()) {
    return null;
  }
  const rows = parseLinkedRecordRows(serializedRows);
  if (rows.length === 0) {
    return null;
  }
  let hasChanges = false;
  const nextRows = rows.map((row) => {
    const currentUnitId = (row[unitFieldName] ?? "").trim();
    if (!currentUnitId || currentUnitId === previousBaseUnitId.trim()) {
      hasChanges = true;
      return {
        ...row,
        [unitFieldName]: nextBaseUnitId.trim(),
      };
    }
    return row;
  });
  return hasChanges ? serializeLinkedRecordRows(nextRows) : null;
}
function syncSerializedItemUnitConversionRows(
  serializedRows: string,
  values: Record<string, string>,
): string {
  const rows = parseLinkedRecordRows(serializedRows);
  if (rows.length === 0) {
    return serializedRows;
  }
  if (
    !resolveLinkedBaseUnitId(values, {
      unitConversionRows: rows,
    })
  ) {
    return serializedRows;
  }
  let hasChanges = false;
  const nextRows = rows.map((row, index) => {
    const nextRow = { ...row };
    if (!(nextRow.iuc_unit_slno ?? "").trim()) {
      nextRow.iuc_unit_slno = String(index + 1);
      hasChanges = true;
    }
    if (!(nextRow.iuc_is_active ?? "").trim()) {
      nextRow.iuc_is_active = ITEM_UNIT_CONVERSION_INITIAL_FORM_VALUES.iuc_is_active;
      hasChanges = true;
    }
    const normalizedToBaseFactor = resolveItemUnitConversionToBaseFactorValue(nextRow);
    const normalizedUnitFactor = resolveItemUnitConversionUnitFactorValue(nextRow);
    if ((nextRow.iuc_to_base_factor ?? "") !== normalizedToBaseFactor) {
      nextRow.iuc_to_base_factor = normalizedToBaseFactor;
      hasChanges = true;
    }
    if ((nextRow.iuc_unit_factor ?? "") !== normalizedUnitFactor) {
      nextRow.iuc_unit_factor = normalizedUnitFactor;
      hasChanges = true;
    }
    return nextRow;
  });
  return hasChanges ? serializeLinkedRecordRows(nextRows) : serializedRows;
}
function syncSerializedItemUnitConversionRowsForBaseUnitChange(
  serializedRows: string,
  nextBaseUnitId: string,
  previousBaseUnitId: string,
): string {
  const normalizedBaseUnitId = nextBaseUnitId.trim();
  const normalizedPreviousBaseUnitId = previousBaseUnitId.trim();
  if (!normalizedBaseUnitId) {
    return serializedRows;
  }
  const rows = parseLinkedRecordRows(serializedRows);
  if (rows.length === 0) {
    return serializeLinkedRecordRows([
      buildDefaultBaseItemUnitConversionRow(normalizedBaseUnitId),
    ]);
  }
  let hasChanges = false;
  const nextRows = rows.map((row) => {
    if (
      (row.iuc_is_base_unit ?? "false") !== "true" ||
      (row.iuc_unit_id ?? "").trim() !== normalizedPreviousBaseUnitId
    ) {
      return row;
    }
    hasChanges = true;
    return {
      ...row,
      iuc_unit_id: normalizedBaseUnitId,
    };
  });
  const normalizedRows = hasChanges
    ? serializeLinkedRecordRows(nextRows)
    : serializedRows;
  return syncSerializedItemUnitConversionRows(normalizedRows, {
    item_base_unit_id: normalizedBaseUnitId,
  });
}
function mapSourceToLinkedRow(
  source: Record<string, unknown>,
  textFieldNames: readonly string[],
  booleanFieldNames: readonly string[],
  defaults: LinkedRecordRow,
): LinkedRecordRow {
  const row: LinkedRecordRow = {
    ...defaults,
  };
  for (const fieldName of textFieldNames) {
    row[fieldName] = toDisplayValue(getFieldValue(source, fieldName)) || defaults[fieldName] || "";
  }
  for (const fieldName of booleanFieldNames) {
    const fallback = defaults[fieldName] === "true" ? "true" : "false";
    row[fieldName] = toSelectBoolean(
      getFieldValue(source, fieldName),
      fallback,
    );
  }
  return row;
}
function assignLinkedRowToValues(
  values: Record<string, string>,
  row: LinkedRecordRow,
  textFieldNames: readonly string[],
  booleanFieldNames: readonly string[],
  defaults: LinkedRecordRow,
): Record<string, string> {
  const nextValues = { ...values };
  for (const fieldName of textFieldNames) {
    nextValues[fieldName] = row[fieldName] ?? defaults[fieldName] ?? "";
  }
  for (const fieldName of booleanFieldNames) {
    const fallback = defaults[fieldName] === "true" ? "true" : "false";
    const value = row[fieldName];
    nextValues[fieldName] =
      value !== undefined ? (value === "true" ? "true" : "false") : fallback;
  }
  return nextValues;
}
function hasLinkedRowContent(
  row: LinkedRecordRow,
  contentFieldNames: readonly string[],
): boolean {
  return contentFieldNames.some((fieldName) => (row[fieldName] ?? "").trim() !== "");
}
function hasMeaningfulItemPriceRows(values: Record<string, string>): boolean {
  return parseLinkedRecordRows(values[ITEM_PRICE_ROWS_FIELD_NAME] ?? "").some((row) =>
    hasLinkedRowContent(row, ITEM_PRICE_SUBMISSION_FIELD_NAMES),
  );
}
function collectChangedFieldValues(
  currentValues: Record<string, string>,
  nextValues: Record<string, string>,
  fieldNames: readonly string[],
): Record<string, string> {
  const changedValues: Record<string, string> = {};
  for (const fieldName of fieldNames) {
    const currentValue = currentValues[fieldName] ?? "";
    const nextValue = nextValues[fieldName] ?? "";
    if (currentValue !== nextValue) {
      changedValues[fieldName] = nextValue;
    }
  }
  return changedValues;
}
function normalizeComparisonString(value: unknown): string {
  return toDisplayValue(value).trim();
}
function normalizeComparisonBoolean(
  value: unknown,
  fallback: "true" | "false" = "false",
): string {
  return toSelectBoolean(value, fallback);
}
function normalizeComparisonInteger(value: unknown): string {
  const normalized = toDisplayValue(value).trim();
  if (!normalized) {
    return "";
  }
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? String(parsed) : normalized;
}
type ItemPriceScope = {
  branchId: string;
  companyId: string;
};

function resolveItemPriceScope(
  source: Record<string, unknown> | null | undefined,
): ItemPriceScope {
  return {
    companyId: normalizeComparisonString(getFieldValue(source ?? {}, "item_company_id")),
    branchId: normalizeComparisonString(getFieldValue(source ?? {}, "item_branch_id")),
  };
}

function filterItemPriceRowsByScope(
  rows: Record<string, unknown>[],
  scope: ItemPriceScope,
): Record<string, unknown>[] {
  return rows.filter(
    (row) =>
      normalizeComparisonString(getFieldValue(row, "ipm_company_id")) ===
        scope.companyId &&
      normalizeComparisonString(getFieldValue(row, "ipm_branch_id")) === scope.branchId,
  );
}

function toSingleOrArrayPayload<T>(items: T[]): T | T[] {
  return items.length === 1 ? items[0] : items;
}

function shouldRecreateItemUnitConversionPayloadRow(
  existingRow: Record<string, unknown> | undefined,
  desiredRow: Record<string, unknown>,
): boolean {
  if (!existingRow) {
    return true;
  }
  return (
    normalizeComparisonString(getFieldValue(existingRow, "iuc_company_id")) !==
      normalizeComparisonString(desiredRow.iuc_company_id) ||
    normalizeComparisonString(getFieldValue(existingRow, "iuc_unit_id")) !==
      normalizeComparisonString(desiredRow.iuc_unit_id) ||
    normalizeComparisonString(getFieldValue(existingRow, "iuc_base_unit_id")) !==
      normalizeComparisonString(desiredRow.iuc_base_unit_id) ||
    normalizeComparisonInteger(getFieldValue(existingRow, "iuc_unit_slno")) !==
      normalizeComparisonInteger(desiredRow.iuc_unit_slno) ||
    normalizeComparisonBoolean(getFieldValue(existingRow, "iuc_is_default_unit")) !==
      normalizeComparisonBoolean(desiredRow.iuc_is_default_unit) ||
    normalizeComparisonBoolean(getFieldValue(existingRow, "iuc_is_base_unit")) !==
      normalizeComparisonBoolean(desiredRow.iuc_is_base_unit) ||
    normalizeComparisonBoolean(getFieldValue(existingRow, "iuc_is_active"), "true") !==
      normalizeComparisonBoolean(desiredRow.iuc_is_active, "true")
  );
}
function selectManagedItemPriceLinkedRow(
  rows: LinkedRecordRow[],
  values: Record<string, string>,
): LinkedRecordRow | null {
  const currentPriceRowId = (values.ipm_id ?? "").trim();
  if (currentPriceRowId) {
    const matchingRow = rows.find(
      (row) => (row.ipm_id ?? "").trim() === currentPriceRowId,
    );
    if (matchingRow) {
      return matchingRow;
    }
  }
  const preferredUnitId =
    (values.ipm_unit_id ?? "").trim() || (values.item_base_unit_id ?? "").trim();
  const preferredGodownId = (values.ipm_godown_id ?? "").trim();
  if (preferredUnitId || preferredGodownId) {
    const exactMatch = rows.find(
      (row) =>
        (row.ipm_unit_id ?? "").trim() === preferredUnitId &&
        (row.ipm_godown_id ?? "").trim() === preferredGodownId,
    );
    if (exactMatch) {
      return exactMatch;
    }
  }
  if (preferredUnitId) {
    if (!preferredGodownId) {
      const matchingGlobalRow = rows.find(
        (row) =>
          (row.ipm_unit_id ?? "").trim() === preferredUnitId &&
          !(row.ipm_godown_id ?? "").trim(),
      );
      if (matchingGlobalRow) {
        return matchingGlobalRow;
      }
    }
    const matchingRow = rows.find(
      (row) => (row.ipm_unit_id ?? "").trim() === preferredUnitId,
    );
    if (matchingRow) {
      return matchingRow;
    }
  }
  return rows[0] ?? null;
}
function syncPrimaryItemPriceValuesFromRows(
  values: Record<string, string>,
  serializedRows: string,
): Record<string, string> {
  const nextValues: Record<string, string> = {
    ...values,
    [ITEM_PRICE_ROWS_FIELD_NAME]: serializedRows,
  };
  const baseUnitId = (nextValues.item_base_unit_id ?? "").trim();
  const defaultRow = buildEmptyItemPriceRow(baseUnitId);
  const rows = parseLinkedRecordRows(serializedRows);
  const managedRow = selectManagedItemPriceLinkedRow(rows, nextValues) ?? defaultRow;
  return assignLinkedRowToValues(
    nextValues,
    managedRow,
    ITEM_PRICE_TEXT_FIELD_NAMES,
    ITEM_PRICE_BOOLEAN_FIELD_NAMES,
    defaultRow,
  );
}
function buildItemPriceRowsValueChangeResult(
  values: Record<string, string>,
  previousValues: Record<string, string>,
  serializedRows: string,
  itemTaxRecordsById: ReadonlyMap<string, Record<string, unknown>>,
): ERPDynamicFieldValueChangeResult | void {
  const comparisonValues = {
    ...values,
    [ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME]:
      previousValues[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME] ??
      values[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME] ??
      "",
    [ITEM_PRICE_ROWS_FIELD_NAME]:
      previousValues[ITEM_PRICE_ROWS_FIELD_NAME] ??
      values[ITEM_PRICE_ROWS_FIELD_NAME] ??
      "",
  };
  const nextUnitConversionRows = syncSerializedItemUnitConversionRowsFromPriceRows(
    values[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME] ?? "",
    serializedRows,
    values,
  );
  const normalizedRows = syncSerializedItemPriceRows(
    serializedRows,
    {
      ...comparisonValues,
      [ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME]: nextUnitConversionRows,
    },
    itemTaxRecordsById,
  );
  const finalUnitConversionRows = syncSerializedItemUnitConversionRowsFromPriceRows(
    nextUnitConversionRows,
    normalizedRows,
    {
      ...values,
      [ITEM_PRICE_ROWS_FIELD_NAME]: normalizedRows,
    },
  );
  const nextValues = syncPrimaryItemPriceValuesFromRows(
    {
      ...values,
      [ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME]: finalUnitConversionRows,
    },
    normalizedRows,
  );
  if (hasMeaningfulItemPriceRows(nextValues)) {
    nextValues.item_price_list = "true";
  }
  const changedValues = collectChangedFieldValues(
    comparisonValues,
    nextValues,
    [ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME, "item_price_list", ...ITEM_PRICE_SYNC_FIELD_NAMES],
  );
  if (Object.keys(changedValues).length === 0) {
    return;
  }
  return {
    values: changedValues,
  };
}
function buildItemUnitConversionRowsValueChangeResult(
  values: Record<string, string>,
  previousValues: Record<string, string>,
  serializedRows: string,
  itemTaxRecordsById: ReadonlyMap<string, Record<string, unknown>>,
): ERPDynamicFieldValueChangeResult | void {
  const normalizedRows = syncSerializedItemUnitConversionRows(serializedRows, values);
  const comparisonValues = {
    ...values,
    [ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME]:
      previousValues[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME] ??
      values[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME] ??
      "",
  };
  const nextValues: Record<string, string> = {
    ...values,
    [ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME]: normalizedRows,
  };
  const nextPriceRows = syncSerializedItemPriceRows(
    nextValues[ITEM_PRICE_ROWS_FIELD_NAME] ?? "",
    {
      ...nextValues,
      [ITEM_PRICE_ROWS_FIELD_NAME]:
        previousValues[ITEM_PRICE_ROWS_FIELD_NAME] ??
        values[ITEM_PRICE_ROWS_FIELD_NAME] ??
        "",
    },
    itemTaxRecordsById,
  );
  nextValues[ITEM_PRICE_ROWS_FIELD_NAME] = nextPriceRows;
  const syncedPriceValues = syncPrimaryItemPriceValuesFromRows(nextValues, nextPriceRows);
  const changedValues = collectChangedFieldValues(
    comparisonValues,
    syncedPriceValues,
    [ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME, ...ITEM_PRICE_SYNC_FIELD_NAMES],
  );
  if (Object.keys(changedValues).length === 0) {
    return;
  }
  return {
    values: changedValues,
  };
}
function syncPrimaryItemReorderValuesFromRows(
  values: Record<string, string>,
  serializedRows: string,
): Record<string, string> {
  const nextValues: Record<string, string> = {
    ...values,
    [ITEM_REORDER_ROWS_FIELD_NAME]: serializedRows,
  };
  const baseUnitId = (nextValues.item_base_unit_id ?? "").trim();
  const defaultRow = buildEmptyItemReorderRow(baseUnitId);
  const rows = parseLinkedRecordRows(serializedRows);
  const managedRow =
    rows.find((row) => hasLinkedRowContent(row, ITEM_REORDER_CONTENT_FIELD_NAMES)) ??
    defaultRow;
  return assignLinkedRowToValues(
    nextValues,
    managedRow,
    ITEM_REORDER_ROW_TEXT_FIELD_NAMES,
    ITEM_REORDER_ROW_BOOLEAN_FIELD_NAMES,
    defaultRow,
  );
}
function syncPrimaryItemEanValuesFromRows(
  values: Record<string, string>,
  serializedRows: string,
): Record<string, string> {
  const nextValues: Record<string, string> = {
    ...values,
    [ITEM_EAN_ROWS_FIELD_NAME]: serializedRows,
  };
  const baseUnitId = (nextValues.item_base_unit_id ?? "").trim();
  const defaultRow = buildEmptyItemEanRow(baseUnitId, resolvePreferredItemEanUnitId(nextValues));
  const rows = parseLinkedRecordRows(serializedRows);
  const managedRow =
    rows.find((row) => hasLinkedRowContent(row, ITEM_EAN_CONTENT_FIELD_NAMES)) ??
    defaultRow;
  return assignLinkedRowToValues(
    nextValues,
    managedRow,
    ITEM_EAN_ROW_TEXT_FIELD_NAMES,
    ITEM_EAN_ROW_BOOLEAN_FIELD_NAMES,
    defaultRow,
  );
}
function buildItemReorderRowsValueChangeResult(
  values: Record<string, string>,
  previousValues: Record<string, string>,
  serializedRows: string,
): ERPDynamicFieldValueChangeResult | void {
  const comparisonValues = {
    ...values,
    [ITEM_REORDER_ROWS_FIELD_NAME]:
      previousValues[ITEM_REORDER_ROWS_FIELD_NAME] ??
      values[ITEM_REORDER_ROWS_FIELD_NAME] ??
      "",
  };
  const nextValues = syncPrimaryItemReorderValuesFromRows(
    values,
    serializedRows,
  );
  const changedValues = collectChangedFieldValues(
    comparisonValues,
    nextValues,
    [...ITEM_REORDER_ROW_TEXT_FIELD_NAMES, ...ITEM_REORDER_ROW_BOOLEAN_FIELD_NAMES],
  );
  if (Object.keys(changedValues).length === 0) {
    return;
  }
  return {
    values: changedValues,
  };
}
function buildItemEanRowsValueChangeResult(
  values: Record<string, string>,
  previousValues: Record<string, string>,
  serializedRows: string,
): ERPDynamicFieldValueChangeResult | void {
  const comparisonValues = {
    ...values,
    [ITEM_EAN_ROWS_FIELD_NAME]:
      previousValues[ITEM_EAN_ROWS_FIELD_NAME] ??
      values[ITEM_EAN_ROWS_FIELD_NAME] ??
      "",
  };
  const nextValues = syncPrimaryItemEanValuesFromRows(values, serializedRows);
  const changedValues = collectChangedFieldValues(
    comparisonValues,
    nextValues,
    [...ITEM_EAN_ROW_TEXT_FIELD_NAMES, ...ITEM_EAN_ROW_BOOLEAN_FIELD_NAMES],
  );
  if (Object.keys(changedValues).length === 0) {
    return;
  }
  return {
    values: changedValues,
  };
}
function validateItemPriceRows(value: string, values: Record<string, string>): string | null {
  const effectiveValues: Record<string, string> = {
    ...values,
    [ITEM_PRICE_ROWS_FIELD_NAME]: value,
  };
  if (
    (effectiveValues.item_price_list ?? "false") !== "true" &&
    !hasMeaningfulItemPriceRows(effectiveValues)
  ) {
    return null;
  }
  const rows = buildManagedItemPriceRows(effectiveValues);
  if (rows.length === 0) {
    return "Add at least one price row when Price List is enabled.";
  }
  const baseUnitId = (effectiveValues.item_base_unit_id ?? "").trim();
  const usedUnitIds = new Set<string>();
  let defaultRows = 0;
  let baseRows = 0;
  const nonNegativeFieldConfigs = [
    { key: "ipm_cost_wot", label: "Cost WOT" },
    { key: "ipm_cost_price", label: "Cost" },
    { key: "ipm_max_price", label: "Max" },
    { key: "ipm_min_price", label: "Min" },
    { key: "ipm_disc_perc", label: "Disc %" },
    { key: "ipm_disc_qty", label: "Disc Qty" },
    { key: "ipm_addl_cess", label: "Cess" },
  ] as const;
  for (const [index, row] of rows.entries()) {
    const unitId = (row.ipm_unit_id ?? "").trim() || baseUnitId;
    if (!unitId) {
      return `Price row ${index + 1}: Unit is required.`;
    }
    const toBaseFactor = parseOptionalItemPriceNumber(row.ipm_to_base_factor);
    if (toBaseFactor === null || toBaseFactor <= 0) {
      return `Price row ${index + 1}: Conv must be greater than 0.`;
    }
    const unitFactor = parseOptionalItemPriceNumber(resolveItemPriceUnitFactorValue(row));
    if (unitFactor === null || unitFactor <= 0) {
      return `Price row ${index + 1}: Unit Factor must be greater than 0.`;
    }
    const godownId = (row.ipm_godown_id ?? "").trim();
    if (!godownId) {
      return `Price row ${index + 1}: Godown is required.`;
    }
    if (usedUnitIds.has(unitId)) {
      return `Price row ${index + 1}: Unit is already used in another price row.`;
    }
    usedUnitIds.add(unitId);
    const profitType = (row.ipm_profit_type ?? "").trim();
    if (!profitType) {
      return `Price row ${index + 1}: Profit Type is required.`;
    }
    for (const fieldConfig of nonNegativeFieldConfigs) {
      const numericValue = parseOptionalItemPriceNumber(row[fieldConfig.key]);
      if (numericValue !== null && numericValue < 0) {
        return `Price row ${index + 1}: ${fieldConfig.label} cannot be negative.`;
      }
    }
    const isDefaultUnit = (row.ipm_is_default_unit ?? "false") === "true";
    const isBaseUnit = (row.ipm_is_base_unit ?? "false") === "true";
    if (isDefaultUnit) {
      defaultRows += 1;
    }
    if (isBaseUnit) {
      baseRows += 1;
    }
  }
  if (baseRows > 1) {
    return "Only one base price row is allowed.";
  }
  if (defaultRows > 1) {
    return "Only one default price row is allowed.";
  }
  return null;
}
function validateItemUnitConversionRows(
  value: string,
  values: Record<string, string>,
): string | null {
  const baseUnitId = (values.item_base_unit_id ?? "").trim();
  if (!baseUnitId) {
    return null;
  }
  const rows = buildManagedItemUnitConversionRows(values);
  if (rows.length === 0) {
    return "Add at least one unit conversion row.";
  }
  const usedUnitIds = new Set<string>();
  let activeBaseRows = 0;
  let activeDefaultRows = 0;
  for (const [index, row] of rows.entries()) {
    const unitId = (row.iuc_unit_id ?? "").trim();
    if (!unitId) {
      return `Unit conversion row ${index + 1}: Unit is required.`;
    }
    if (usedUnitIds.has(unitId)) {
      return `Unit conversion row ${index + 1}: Unit is already used in another conversion row.`;
    }
    usedUnitIds.add(unitId);
    const factor = parseOptionalItemPriceNumber(row.iuc_to_base_factor);
    if (factor === null || factor <= 0) {
      return `Unit conversion row ${index + 1}: To Base must be greater than 0.`;
    }
    const unitFactor = parseOptionalItemPriceNumber(
      resolveItemUnitConversionUnitFactorValue(row),
    );
    if (unitFactor === null || unitFactor <= 0) {
      return `Unit conversion row ${index + 1}: Unit Factor must be greater than 0.`;
    }
    const weight = parseOptionalItemPriceNumber(row.iuc_uom_weight);
    if (weight !== null && weight < 0) {
      return `Unit conversion row ${index + 1}: Weight cannot be negative.`;
    }
    const isActive = (row.iuc_is_active ?? "true") === "true";
    const isBaseUnit = (row.iuc_is_base_unit ?? "false") === "true";
    const isDefaultUnit = (row.iuc_is_default_unit ?? "false") === "true";
    if (isActive && isBaseUnit) {
      activeBaseRows += 1;
    }
    if (isActive && isDefaultUnit) {
      activeDefaultRows += 1;
    }
    if (!isBaseUnit) {
      continue;
    }
  }
  if (activeBaseRows === 0) {
    return "Add one active base unit conversion row.";
  }
  if (activeBaseRows > 1) {
    return "Only one active base unit conversion row is allowed.";
  }
  if (activeDefaultRows > 1) {
    return "Only one active default unit conversion row is allowed.";
  }
  return null;
}
function validateItemReorderRows(value: string, values: Record<string, string>): string | null {
  const rows = buildManagedItemReorderRows(values);
  if (rows.length === 0) {
    return null;
  }
 // const baseUnitId = (values.item_base_unit_id ?? "").trim();
  // for (const [index, row] of rows.entries()) {
  //   const unitId = (row.ir_unit_id ?? "").trim() || baseUnitId;
  //   if (!unitId) {
  //     return `Reorder row ${index + 1}: Unit is required.`;
  //   }
  //   const reorderType = (row.ir_reorder_type ?? "").trim();
  //   if (!reorderType) {
  //     return `Reorder row ${index + 1}: Reorder Type is required.`;
  //   }
  // }
  return null;
}
function validateItemEanRows(value: string, values: Record<string, string>): string | null {
  const rows = buildManagedItemEanRows(values);
  if (rows.length === 0) {
    return null;
  }
  // const baseUnitId = (values.item_base_unit_id ?? "").trim();
  // for (const [index, row] of rows.entries()) {
  //   const unitId = (row.ean_unit_id ?? "").trim() || baseUnitId;
  //   if (!unitId) {
  //     return `EAN row ${index + 1}: Unit is required.`;
  //   }
  //   const eanCode = (row.ean_code ?? "").trim();
  //   if (!eanCode) {
  //     return `EAN row ${index + 1}: EAN Code is required.`;
  //   }
  // }
  return null;
}
function buildCustomFieldEditor(
  columns: LinkedRecordColumn[],
  createRow: (
    values: Record<string, string>,
    sourceRow?: LinkedRecordRow,
  ) => LinkedRecordRow,
  addLabel: string,
  emptyState: string,
  options: {
    actionsLabel?: string;
    autoCreateFirstRowOnMount?: boolean;
    autoFocusInitialRowOnMount?: boolean;
    autoAppendOnEnter?: {
      columnKey: string;
      focusColumnKey?: string;
    };
    showRowIndex?: boolean;
  } = {},
) {
  return function renderLinkedRecordEditor({
    disabled,
    setValue,
    value,
    values,
  }: ERPDynamicCustomFieldRenderProps) {
    return (
      <ItemLinkedRecordsEditor
        addLabel={addLabel}
        actionsLabel={options.actionsLabel}
        autoCreateFirstRowOnMount={options.autoCreateFirstRowOnMount}
        autoFocusInitialRowOnMount={options.autoFocusInitialRowOnMount}
        autoAppendOnEnter={options.autoAppendOnEnter}
        columns={columns}
        createRow={(sourceRow) => createRow(values, sourceRow)}
        disabled={disabled}
        emptyState={emptyState}
        onChange={setValue}
        showRowIndex={options.showRowIndex}
        value={value}
      />
    );
  };
}
function shouldShowItemPriceSection(values: Record<string, string>): boolean {
  if ((values.item_price_list ?? "false") === "true") {
    return true;
  }
  return buildManagedItemPriceRows(values).length > 0;
}
function shouldShowItemReorderSection(values: Record<string, string>): boolean {
  if (hasLinkedRows(values[ITEM_REORDER_ROWS_FIELD_NAME])) {
    return true;
  }
  return ITEM_REORDER_CONTENT_FIELD_NAMES.some(
    (fieldName) => (values[fieldName] ?? "").trim() !== "",
  );
}
function buildManagedItemUnitConversionRows(values: Record<string, string>): LinkedRecordRow[] {
  return parseLinkedRecordRows(values[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME] ?? "").filter(
    (row) => hasLinkedRowContent(row, ITEM_UNIT_CONVERSION_CONTENT_FIELD_NAMES),
  );
}
function buildManagedItemPriceRows(values: Record<string, string>): LinkedRecordRow[] {
  return parseLinkedRecordRows(values[ITEM_PRICE_ROWS_FIELD_NAME] ?? "").filter((row) =>
    hasLinkedRowContent(row, ITEM_PRICE_CONTENT_FIELD_NAMES),
  );
}
function buildManagedItemPriceRowsByUnitId(
  values: Record<string, string>,
): Map<string, LinkedRecordRow> {
  return new Map(
    buildManagedItemPriceRows(values)
      .map((row) => [(row.ipm_unit_id ?? "").trim(), row] as const)
      .filter(([unitId]) => Boolean(unitId)),
  );
}
function buildManagedItemReorderRows(values: Record<string, string>): LinkedRecordRow[] {
  return parseLinkedRecordRows(values[ITEM_REORDER_ROWS_FIELD_NAME] ?? "").filter((row) =>
    hasLinkedRowContent(row, ITEM_REORDER_CONTENT_FIELD_NAMES),
  );
}
function buildManagedItemEanRows(values: Record<string, string>): LinkedRecordRow[] {
  return parseLinkedRecordRows(values[ITEM_EAN_ROWS_FIELD_NAME] ?? "").filter((row) =>
    hasLinkedRowContent(row, ITEM_EAN_CONTENT_FIELD_NAMES),
  );
}
function applyItemPriceDefaults(
  values: Record<string, string>,
): Record<string, string> {
  const nextValues = { ...values };
  const baseUnitId = (nextValues.item_base_unit_id ?? "").trim();
  if (!(nextValues.ipm_profit_type ?? "").trim()) {
    nextValues.ipm_profit_type = ITEM_PRICE_DEFAULT_PROFIT_TYPE;
  }
  if (!(nextValues.ipm_is_active ?? "").trim()) {
    nextValues.ipm_is_active = ITEM_PRICE_INITIAL_FORM_VALUES.ipm_is_active;
  }
  if (!hasLinkedRows(nextValues[ITEM_PRICE_ROWS_FIELD_NAME])) {
    nextValues[ITEM_PRICE_ROWS_FIELD_NAME] = serializeLinkedRecordRows([
      buildEmptyItemPriceRow(baseUnitId),
    ]);
  }
  return nextValues;
}
function applyItemUnitConversionDefaults(
  values: Record<string, string>,
): Record<string, string> {
  const nextValues = { ...values };
  const baseUnitId = (nextValues.item_base_unit_id ?? "").trim();
  if (!baseUnitId) {
    return nextValues;
  }
  if (!hasLinkedRows(nextValues[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME])) {
    nextValues[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME] = serializeLinkedRecordRows([
      buildDefaultBaseItemUnitConversionRow(baseUnitId),
    ]);
  }
  return nextValues;
}
function normalizeItemLinkedSubmissionValues(
  values: Record<string, string>,
  itemTaxRecordsById: ReadonlyMap<string, Record<string, unknown>>,
): Record<string, string> {
  const nextValues = applyItemUnitConversionDefaults({ ...values });
  nextValues[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME] =
    syncSerializedItemUnitConversionRowsFromPriceRows(
      nextValues[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME] ?? "",
      nextValues[ITEM_PRICE_ROWS_FIELD_NAME] ?? "",
      nextValues,
    );
  nextValues[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME] =
    syncSerializedItemUnitConversionRows(
      nextValues[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME] ?? "",
      nextValues,
    );
  nextValues[ITEM_PRICE_ROWS_FIELD_NAME] = syncSerializedItemPriceRows(
    nextValues[ITEM_PRICE_ROWS_FIELD_NAME] ?? "",
    nextValues,
    itemTaxRecordsById,
  );
  return nextValues;
}
function selectManagedItemPriceRecord(
  rows: Record<string, unknown>[],
  preferredUnitId: string,
): Record<string, unknown> | null {
  const normalizedPreferredUnitId = preferredUnitId.trim();
  const globalRows = rows.filter(
    (row) => !toDisplayValue(getFieldValue(row, "ipm_godown_id")),
  );
  if (normalizedPreferredUnitId) {
    const matchingGlobalRow = globalRows.find(
      (row) =>
        toDisplayValue(getFieldValue(row, "ipm_unit_id")) === normalizedPreferredUnitId,
    );
    if (matchingGlobalRow) {
      return matchingGlobalRow;
    }
    const matchingRow = rows.find(
      (row) =>
        toDisplayValue(getFieldValue(row, "ipm_unit_id")) === normalizedPreferredUnitId,
    );
    if (matchingRow) {
      return matchingRow;
    }
  }
  return globalRows[0] ?? rows[0] ?? null;
}
function selectManagedItemReorderRecord(
  rows: Record<string, unknown>[],
  preferredUnitId: string,
): Record<string, unknown> | null {
  const normalizedPreferredUnitId = preferredUnitId.trim();
  const globalRows = rows.filter(
    (row) => !toDisplayValue(getFieldValue(row, "ir_godown_id")),
  );
  if (normalizedPreferredUnitId) {
    const matchingGlobalRow = globalRows.find(
      (row) =>
        toDisplayValue(getFieldValue(row, "ir_unit_id")) === normalizedPreferredUnitId,
    );
    if (matchingGlobalRow) {
      return matchingGlobalRow;
    }
    const matchingRow = rows.find(
      (row) =>
        toDisplayValue(getFieldValue(row, "ir_unit_id")) === normalizedPreferredUnitId,
    );
    if (matchingRow) {
      return matchingRow;
    }
  }
  return globalRows[0] ?? rows[0] ?? null;
}
function selectManagedItemEanCodeRecord(
  rows: Record<string, unknown>[],
  preferredUnitId: string,
): Record<string, unknown> | null {
  const normalizedPreferredUnitId = preferredUnitId.trim();
  const isDefaultRow = (row: Record<string, unknown>) =>
    toSelectBoolean(getFieldValue(row, "ean_is_default"), "false") === "true";
  const globalRows = rows.filter(
    (row) => !toDisplayValue(getFieldValue(row, "ean_godown_id")),
  );
  const defaultGlobalRows = globalRows.filter(isDefaultRow);
  const defaultRows = rows.filter(isDefaultRow);
  if (normalizedPreferredUnitId) {
    const matchingDefaultGlobalRow = defaultGlobalRows.find(
      (row) =>
        toDisplayValue(getFieldValue(row, "ean_unit_id")) === normalizedPreferredUnitId,
    );
    if (matchingDefaultGlobalRow) {
      return matchingDefaultGlobalRow;
    }
    const matchingGlobalRow = globalRows.find(
      (row) =>
        toDisplayValue(getFieldValue(row, "ean_unit_id")) === normalizedPreferredUnitId,
    );
    if (matchingGlobalRow) {
      return matchingGlobalRow;
    }
    const matchingDefaultRow = defaultRows.find(
      (row) =>
        toDisplayValue(getFieldValue(row, "ean_unit_id")) === normalizedPreferredUnitId,
    );
    if (matchingDefaultRow) {
      return matchingDefaultRow;
    }
    const matchingRow = rows.find(
      (row) =>
        toDisplayValue(getFieldValue(row, "ean_unit_id")) === normalizedPreferredUnitId,
    );
    if (matchingRow) {
      return matchingRow;
    }
  }
  return defaultGlobalRows[0] ?? defaultRows[0] ?? globalRows[0] ?? rows[0] ?? null;
}
function buildUuidTextField(name: string, label: string): ERPDynamicModalField {
  return {
    name,
    label,
    validation: {
      pattern: UUID_PATTERN,
      patternMessage: `${label} must be a valid UUID.`,
    },
  };
}
function applyItemCheckboxControlStyle(
  fields: ERPDynamicModalField[],
): ERPDynamicModalField[] {
  return fields.map((field) =>
    field.type === "checkbox"
      ? {
        ...field,
        controlStyle: {
          ...ITEM_CHECKBOX_CONTROL_STYLE,
          ...(field.controlStyle ?? {}),
        },
      }
      : field,
  );
}
function removeDefaultSelectPlaceholders(
  fields: ERPDynamicModalField[],
): ERPDynamicModalField[] {
  return fields.map((field) =>
    field.type === "select"
      ? {
        ...field,
        placeholder: "",
      }
      : field,
  );
}
function removeDefaultLinkedColumnPlaceholders(
  columns: LinkedRecordColumn[],
): LinkedRecordColumn[] {
  return columns.map((column) =>
    column.type === "select"
      ? {
        ...column,
        placeholder: "",
      }
      : column,
  );
}
function normalizeItemWidgetKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function buildItemFormSections(
  fields: ERPDynamicModalField[],
): ItemFormSection[] {
  if (fields.length === 0) {
    return [];
  }
  const sections: ItemFormSection[] = [];
  let currentSection: ItemFormSection = {
    heading: null,
    fields: [],
  };
  for (const field of fields) {
    if ((field.type ?? "text") === "heading") {
      if (currentSection.heading !== null || currentSection.fields.length > 0) {
        sections.push(currentSection);
      }
      currentSection = {
        heading: field,
        fields: [],
      };
      continue;
    }
    currentSection.fields.push(field);
  }
  if (currentSection.heading !== null || currentSection.fields.length > 0) {
    sections.push(currentSection);
  }
  return sections;
}
function flattenItemFormSections(sections: ItemFormSection[]): ERPDynamicModalField[] {
  return sections.flatMap((section) =>
    section.heading ? [section.heading, ...section.fields] : section.fields,
  );
}
function resolveItemWidgetMatchKey(
  widget: ItemWidgetConfigRecord,
  type: "heading" | "field",
): string {
  const candidates =
    type === "heading"
      ? [widget.widgetName, widget.widgetGuiName, widget.widgetSecondaryText]
      : [widget.widgetGuiName, widget.widgetName, widget.widgetSecondaryText];
  for (const candidate of candidates) {
    const normalized = normalizeItemWidgetKey(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}
function resolveItemWidgetLabel(widget: ItemWidgetConfigRecord): string {
  return (
    widget.widgetSecondaryText.trim() ||
    widget.widgetGuiName.trim() ||
    widget.widgetName.trim()
  );
}
function combineItemWidgetVisibility(
  visibleWhen: ERPDynamicModalField["visibleWhen"],
  widgetVisibility: boolean,
): ERPDynamicModalField["visibleWhen"] {
  if (widgetVisibility && !visibleWhen) {
    return undefined;
  }
  return (values) => {
    if (!widgetVisibility) {
      return false;
    }
    if (!visibleWhen) {
      return true;
    }
    try {
      return visibleWhen(values);
    } catch {
      return true;
    }
  };
}
function applyItemWidgetOverrides(
  field: ERPDynamicModalField,
  widget: ItemWidgetConfigRecord | undefined,
): ERPDynamicModalField {
  if (!widget) {
    return field;
  }
  const nextLabel = resolveItemWidgetLabel(widget);
  return {
    ...field,
    label: nextLabel || field.label,
    visibleWhen: combineItemWidgetVisibility(field.visibleWhen, widget.widgetVisibility),
  };
}
function reorderConfiguredItems<T>(
  items: Array<{
    item: T;
    originalIndex: number;
    configuredPosition: number | null;
  }>,
): T[] {
  const configuredItems = items
    .filter(
      (
        item,
      ): item is {
        item: T;
        originalIndex: number;
        configuredPosition: number;
      } => item.configuredPosition !== null,
    )
    .sort((left, right) => {
      if (left.configuredPosition !== right.configuredPosition) {
        return left.configuredPosition - right.configuredPosition;
      }
      return left.originalIndex - right.originalIndex;
    });
  if (configuredItems.length < 2) {
    return items.map((item) => item.item);
  }
  let configuredItemIndex = 0;
  return items.map((item) =>
    item.configuredPosition === null
      ? item.item
      : configuredItems[configuredItemIndex++]?.item ?? item.item,
  );
}
function toItemWidgetConfigRecords(payload: unknown): ItemWidgetConfigRecord[] {
  return extractArrayRecords(payload)
    .map((record) => ({
      widgetNo: toDisplayValue(getFirstDefinedValue(record, WIDGET_NUMBER_KEYS)),
      widgetGroupId: toDisplayValue(getFirstDefinedValue(record, WIDGET_GROUP_ID_KEYS)),
      widgetName: toDisplayValue(getFirstDefinedValue(record, WIDGET_NAME_KEYS)),
      widgetPosition: toNonNegativeInteger(
        toDisplayValue(getFirstDefinedValue(record, WIDGET_POSITION_KEYS)),
        0,
      ),
      widgetVisibility:
        toSelectBoolean(getFirstDefinedValue(record, WIDGET_VISIBILITY_KEYS), "true") ===
        "true",
      widgetGuiName: toDisplayValue(getFirstDefinedValue(record, WIDGET_GUI_NAME_KEYS)),
      widgetSecondaryText: toDisplayValue(
        getFirstDefinedValue(record, WIDGET_SECONDARY_TEXT_KEYS),
      ),
    }))
    .filter((record) => Boolean(record.widgetNo));
}
function applyItemWidgetConfigToFields(
  fields: ERPDynamicModalField[],
  widgets: ItemWidgetConfigRecord[],
  rootWidgetGroupId: string,
): ERPDynamicModalField[] {
  if (widgets.length === 0) {
    return fields;
  }
  const sections = buildItemFormSections(fields);
  const sectionWidgets = widgets.filter(
    (widget) => widget.widgetGroupId === rootWidgetGroupId,
  );
  const sectionWidgetByKey = new Map(
    sectionWidgets
      .map((widget) => [resolveItemWidgetMatchKey(widget, "heading"), widget] as const)
      .filter(([key]) => Boolean(key)),
  );
  const nextSections = sections.map((section, sectionIndex) => {
    const headingWidget =
      section.heading
        ? sectionWidgetByKey.get(normalizeItemWidgetKey(section.heading.label))
        : undefined;
    const sectionHidden = headingWidget?.widgetVisibility === false;
    const childWidgetByKey = new Map(
      widgets
        .filter((widget) => widget.widgetGroupId === headingWidget?.widgetNo)
        .map((widget) => [resolveItemWidgetMatchKey(widget, "field"), widget] as const)
        .filter(([key]) => Boolean(key)),
    );
    const nextHeading = section.heading
      ? applyItemWidgetOverrides(section.heading, headingWidget)
      : null;
    const nextFields = reorderConfiguredItems(
      section.fields.map((field, fieldIndex) => {
        const matchingWidget = childWidgetByKey.get(normalizeItemWidgetKey(field.label));
        const effectiveWidget =
          sectionHidden && matchingWidget
            ? {
              ...matchingWidget,
              widgetVisibility: false,
            }
            : matchingWidget;
        return {
          item: sectionHidden
            ? {
              ...field,
              visibleWhen: combineItemWidgetVisibility(field.visibleWhen, false),
            }
            : applyItemWidgetOverrides(field, effectiveWidget),
          originalIndex: fieldIndex,
          configuredPosition: matchingWidget?.widgetPosition ?? null,
        };
      }),
    );
    return {
      item: {
        heading: nextHeading,
        fields: nextFields,
      },
      originalIndex: sectionIndex,
      configuredPosition: headingWidget?.widgetPosition ?? null,
    };
  });
  return flattenItemFormSections(reorderConfiguredItems(nextSections));
}
function buildItemFormFields(
  companyOptions: ERPDynamicSelectOption[],
  branchOptions: ERPDynamicSelectOption[],
  groupOptions: ERPDynamicSelectOption[],
  categoryOptions: ERPDynamicSelectOption[],
  brandOptions: ERPDynamicSelectOption[],
  sectionOptions: ERPDynamicSelectOption[],
  unitOptions: ERPDynamicSelectOption[],
  godownOptions: ERPDynamicSelectOption[],
  taxOptions: ERPDynamicSelectOption[],
  itemTaxRecordsById: ReadonlyMap<string, Record<string, unknown>>,
  hsnOptions: ERPDynamicSelectOption[],
  supplierOptions: ERPDynamicSelectOption[],
  customerGroupOptions: ERPDynamicSelectOption[],
  itemOptions: ERPDynamicSelectOption[],
  itemPriceTableColumnsConfig: Record<string, unknown>[],
  itemReorderTableColumnsConfig: Record<string, unknown>[],
  itemEanTableColumnsConfig: Record<string, unknown>[],
  itemWidgetConfigRecords: ItemWidgetConfigRecord[],
  onItemGroupSearchChange?: ERPDynamicSearchQueryChangeHandler,
): ERPDynamicModalField[] {
  const basePriceRowColumns: LinkedRecordColumn[] = [
    {
      key: "ipm_unit_id",
      label: "Unit",
      type: "select",
      searchable: true,
      width: "10rem",
      readOnlyResolver: ({ rowIndex }) => rowIndex === 0,
    },
    {
      key: "ipm_to_base_factor",
      bindingKey: "ipm_unit_factor",
      label: "Conv",
      type: "number",
      min: 0.0001,
      step: "0.0001",
      width: "7rem",
      readOnlyResolver: ({ rowIndex }) => rowIndex === 0,
    },
    {
      key: "ipm_is_default_unit",
      label: "Default",
      type: "checkbox",
      width: "6rem",
    },
    {
      key: "ipm_is_base_unit",
      label: "Base",
      type: "checkbox",
      width: "6rem",
    },
    {
      key: "ipm_godown_id",
      label: "Godown",
      type: "select",
      searchable: true,
      options: godownOptions,
      placeholder: "Select Godown",
      width: "11rem",
    },
    {
      key: "ipm_cost_wot",
      label: "Cost WOT",
      type: "number",
      min: 0,
      step: "0.0001",
      width: "8rem",
    },
    { key: "ipm_cost_price", label: "Cost", type: "number", min: 0, step: "0.0001", width: "7rem" },
    {
      key: "ipm_profit_type",
      label: "Profit Type",
      type: "select",
      options: ITEM_PRICE_PROFIT_TYPE_OPTIONS,
      width: "9rem",
    },
    {
      key: "ipm_round_off",
      label: "Round Off",
      type: "select",
      options: ITEM_PRICE_ROUND_OFF_OPTIONS,
      width: "7rem",
    },
    { key: "ipm_price_a_markup_perc", label: "A Margin", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_sales_price_a", label: "Sale A", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_price_b_markup_perc", label: "B Margin", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_sales_price_b", label: "Sale B", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_price_c_markup_perc", label: "C Margin", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_sales_price_c", label: "Sale C", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_price_d_markup_perc", label: "D Margin", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_sales_price_d", label: "Sale D", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_max_price", label: "Max", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_min_price", label: "Min", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_disc_perc", label: "Disc %", type: "number", min: 0, step: "0.001", width: "7rem" },
    { key: "ipm_disc_qty", label: "Disc Qty", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_addl_cess", label: "Cess", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_loading_charge", label: "Loading", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_freight_charge", label: "Freight", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_is_big_unit", label: "Big Unit", type: "checkbox", width: "6rem" },
    { key: "ipm_uom_remarks", label: "Remarks", width: "12rem" },
    { key: "ipm_cost_remarks", label: "Cost Remarks", width: "12rem" },
    { key: "ipm_loyalty_points", label: "Points", type: "number", min: 0, step: "1", width: "6rem" },
  ];
  const priceRowColumns = removeDefaultLinkedColumnPlaceholders(
    applyConfiguredLinkedTableColumnConfig(
      basePriceRowColumns,
      itemPriceTableColumnsConfig,
      ITEM_PRICE_TABLE_COLUMN_NAME_TO_KEY,
    ),
  );
  const unitConversionRowColumns = removeDefaultLinkedColumnPlaceholders([
    {
      key: "iuc_unit_id",
      label: "Unit",
      type: "select",
      searchable: true,
      options: unitOptions,
      optionsResolver: ({ rowIndex, rows }) =>
        buildItemUnitConversionUnitOptions(rows, unitOptions, rowIndex),
      readOnlyResolver: ({ row }) =>
        (row.iuc_is_base_unit ?? "false") === "true",
      width: "10rem",
    },
    { key: "iuc_unit_slno", label: "Sl No", type: "number", min: 1, step: "1", width: "6rem" },
    {
      key: "iuc_to_base_factor",
      label: "To Base",
      type: "number",
      min: 0.0001,
      step: "0.0001",
      width: "7rem",
      readOnlyResolver: ({ row }) => (row.iuc_is_base_unit ?? "false") === "true",
    },
    {
      key: "iuc_unit_factor",
      label: "Unit Factor",
      type: "number",
      min: 0.0001,
      step: "0.0001",
      width: "7rem",
      readOnlyResolver: ({ row }) => (row.iuc_is_base_unit ?? "false") === "true",
    },
    {
      key: "iuc_is_default_unit",
      label: "Default",
      type: "checkbox",
      width: "6rem",
    },
    {
      key: "iuc_is_base_unit",
      label: "Base",
      type: "checkbox",
      width: "6rem",
    },
    {
      key: "iuc_is_big_unit",
      label: "Big Unit",
      type: "checkbox",
      width: "6rem",
    },
    {
      key: "iuc_uom_weight",
      label: "Weight",
      type: "number",
      min: 0,
      step: "0.0001",
      width: "7rem",
    },
    {
      key: "iuc_uom_remarks",
      label: "Remarks",
      width: "12rem",
    },
    {
      key: "iuc_is_active",
      label: "Active",
      type: "checkbox",
      width: "6rem",
    },
  ]);
  const baseReorderRowColumns: LinkedRecordColumn[] = [
    { key: "ir_min_level", label: "Min Level", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ir_max_level", label: "Max Level", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ir_reorder_level", label: "Reorder Level", type: "number", min: 0, step: "0.0001", width: "8rem" },
    { key: "ir_reorder_qty", label: "Reorder Qty", type: "number", min: 0, step: "0.0001", width: "8rem" },
    {
      key: "ir_reorder_type",
      label: "Reorder Type",
      type: "select",
      options: ITEM_REORDER_TYPE_OPTIONS,
      width: "10rem",
    },
  ];
  const reorderRowColumns = removeDefaultLinkedColumnPlaceholders(
    applyConfiguredLinkedTableColumnConfig(
      baseReorderRowColumns,
      itemReorderTableColumnsConfig,
      ITEM_REORDER_TABLE_COLUMN_NAME_TO_KEY,
    ),
  );
  const baseEanRowColumns: LinkedRecordColumn[] = [
    {
      key: "ean_code",
      label: "EAN Code",
      placeholder: "Scan or enter barcode",
      width: "14rem",
    },
    {
      key: "ean_unit_id",
      label: "Unit Code",
      type: "select",
      searchable: true,
      width: "10rem",
    },
    {
      key: "ean_godown_id",
      label: "Godown",
      type: "select",
      searchable: true,
      options: godownOptions,
      placeholder: "Global Default",
      width: "11rem",
    },
    {
      key: "ean_is_default",
      label: "Default",
      type: "checkbox",
      width: "6rem",
    },
    {
      key: "ean_is_active",
      label: "Active",
      type: "checkbox",
      width: "6rem",
    },
    {
      key: "ean_remarks",
      label: "Remarks",
      width: "12rem",
    },
  ];
  const eanRowColumns = removeDefaultLinkedColumnPlaceholders(
    applyConfiguredLinkedTableColumnConfig(
      baseEanRowColumns,
      itemEanTableColumnsConfig,
      ITEM_EAN_TABLE_COLUMN_NAME_TO_KEY,
    ),
  );
  return applyItemWidgetConfigToFields(
    removeDefaultSelectPlaceholders(
      applyItemCheckboxControlStyle([
      {
        name: "itemHeadingCore",
        label: "Core Details",
        type: "heading",
      },
      {
        name: "item_name_en",
        label: "Item Name",
        required: true,
        validation: {
          maxLength: 200,
          maxLengthMessage: "Item Name must be at most 200 characters.",
        },
      },
      {
        name: "item_sku",
        label: "SKU",
        validation: {
          maxLength: 60,
          maxLengthMessage: "SKU must be at most 60 characters.",
        },
      },
      {
        name: "item_name_ta",
        label: "Item Name (Local)",
        validation: {
          maxLength: 200,
          maxLengthMessage: "Item Name (Local) must be at most 200 characters.",
        },
      },
      {
        name: "item_code",
        label: "Item Code",
        validation: {
          maxLength: 50,
          maxLengthMessage: "Item Code must be at most 50 characters.",
        },
      },
      {
        name: "item_alias",
        label: "Alias",
        validation: {
          maxLength: 200,
          maxLengthMessage: "Alias must be at most 200 characters.",
        },
      },
      {
        name: "item_default_barcode",
        label: "Default Barcode",
        validation: {
          maxLength: 200,
          maxLengthMessage: "Default Barcode must be at most 200 characters.",
        },
      },
      {
        name: "item_batch_config",
        label: "Batch Config",
        type: "select",
        searchable: false,
        options: BATCH_CONFIG_OPTIONS,
        placeholder: "Select Batch Config",
      },
      {
        name: "item_base_unit_id",
        label: "Base Unit",
        type: "select",
        searchable: true,
        options: unitOptions,
        onValueChange: ({ value, values, previousValues }) => {
          const currentReorderUnitId = (values.ir_unit_id ?? "").trim();
          const currentEanUnitId = (values.ean_unit_id ?? "").trim();
          const previousBaseUnitId = (previousValues.item_base_unit_id ?? "").trim();
          if (!value.trim()) {
            return;
          }
          const nextValues = { ...values };
          let hasChanges = false;
          if (!currentReorderUnitId || currentReorderUnitId === previousBaseUnitId) {
            nextValues.ir_unit_id = value;
            hasChanges = true;
          }
          if (!currentEanUnitId || currentEanUnitId === previousBaseUnitId) {
            nextValues.ean_unit_id = value;
            hasChanges = true;
          }
          const nextReorderRows = syncSerializedRowUnitIds(
            values[ITEM_REORDER_ROWS_FIELD_NAME] ?? "",
            "ir_unit_id",
            value,
            previousBaseUnitId,
          );
          if (nextReorderRows !== null) {
            nextValues[ITEM_REORDER_ROWS_FIELD_NAME] = nextReorderRows;
            hasChanges = true;
          }
          const nextEanRows = syncSerializedRowUnitIds(
            values[ITEM_EAN_ROWS_FIELD_NAME] ?? "",
            "ean_unit_id",
            value,
            previousBaseUnitId,
          );
          if (nextEanRows !== null) {
            nextValues[ITEM_EAN_ROWS_FIELD_NAME] = nextEanRows;
            hasChanges = true;
          }
          const nextItemUnitConversionRows =
            syncSerializedItemUnitConversionRowsForBaseUnitChange(
              values[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME] ?? "",
              value,
              previousBaseUnitId,
            );
          if (
            nextItemUnitConversionRows !==
            (values[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME] ?? "")
          ) {
            nextValues[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME] = nextItemUnitConversionRows;
            hasChanges = true;
          }
          const nextSyncedPriceRows = syncSerializedItemPriceRows(
            nextValues[ITEM_PRICE_ROWS_FIELD_NAME] ?? "",
            {
              ...nextValues,
              [ITEM_PRICE_ROWS_FIELD_NAME]:
                previousValues[ITEM_PRICE_ROWS_FIELD_NAME] ??
                values[ITEM_PRICE_ROWS_FIELD_NAME] ??
                "",
            },
            itemTaxRecordsById,
          );
          if (nextSyncedPriceRows !== (nextValues[ITEM_PRICE_ROWS_FIELD_NAME] ?? "")) {
            nextValues[ITEM_PRICE_ROWS_FIELD_NAME] = nextSyncedPriceRows;
            hasChanges = true;
          }
          if (hasChanges) {
            return {
              values: nextValues,
            };
          }
        },
      },
      {
        name: "item_packing_item_ids",
        label: "Packing Items",
        type: "select",
        searchable: true,
        multiple: true,
        options: itemOptions,
        helperText: "Select one or more packing items (optional).",
      },
      {
        name: "itemInlineReferenceLinksHeading",
        label: "",
        type: "custom",
        fieldStyle: {
          gridColumn: "1 / -1",
        },
        render: () => <div style={ITEM_INLINE_SECTION_HEADING_STYLE}>Reference Links</div>,
      },
      {
        name: "item_company_id",
        label: "Company",
        type: "select",
        searchable: true,
        options: companyOptions,
      },
      {
        name: "item_branch_id",
        label: "Branch",
        type: "select",
        searchable: true,
        options: branchOptions,
      },
      buildUuidTextField("item_company_category_id", "Company Category Id"),
      {
        name: "item_group_id",
        label: "Item Group",
        type: "select",
        searchable: true,
        options: groupOptions,
        onSearchQueryChange: onItemGroupSearchChange,
      },
      {
        name: "item_category_id",
        label: "Item Category",
        type: "select",
        searchable: true,
        options: categoryOptions,
      },
      {
        name: "item_section_id",
        label: "Item Section",
        type: "select",
        searchable: true,
        options: sectionOptions,
      },
      {
        name: "item_brand_id",
        label: "Item Brand",
        type: "select",
        searchable: true,
        options: brandOptions,
      },
      {
        name: "item_hsn_code",
        label: "HSN Code",
        type: "select",
        searchable: true,
        options: hsnOptions,
      },
      {
        name: "item_default_tax_id",
        label: "Default Tax",
        type: "select",
        searchable: true,
        options: taxOptions,
        onValueChange: ({ value, values }) => {
          const nextFormValues: Record<string, string> = {
            ...values,
            item_default_tax_id: value,
          };
          const normalizedRows = syncSerializedItemPriceRows(
            nextFormValues[ITEM_PRICE_ROWS_FIELD_NAME] ?? "",
            nextFormValues,
            itemTaxRecordsById,
            true,
          );
          const nextValues = syncPrimaryItemPriceValuesFromRows(
            nextFormValues,
            normalizedRows,
          );
          const changedValues = collectChangedFieldValues(
            nextFormValues,
            nextValues,
            ITEM_PRICE_SYNC_FIELD_NAMES,
          );
          if (Object.keys(changedValues).length === 0) {
            return;
          }
          return {
            values: changedValues,
          };
        },
      },
      {
        name: "item_supplier_id",
        label: "Default Supplier",
        type: "select",
        searchable: true,
        options: supplierOptions,
      },
      {
        name: "item_cust_group",
        label: "Item Customer Group",
        type: "select",
        searchable: true,
        options: customerGroupOptions,
      },
      {
        name: "itemInlinePriceListHeading",
        label: "",
        type: "custom",
        fieldStyle: {
          gridColumn: "1 / -1",
        },
        render: () => <div style={ITEM_INLINE_SECTION_HEADING_STYLE}>Price List Table</div>,
      },
      {
        name: ITEM_PRICE_ROWS_FIELD_NAME,
        label: "",
        type: "custom",
        fieldStyle: {
          gridColumn: "1 / -1",
        },
        helperText:
          "Add and edit price rows here. Unit conversion values are maintained from this section while the Unit Conversion block stays hidden.",
        onValueChange: ({ value, values, previousValues }) =>
          buildItemPriceRowsValueChangeResult(
            values,
            previousValues,
            value,
            itemTaxRecordsById,
          ),
        validation: {
          custom: validateItemPriceRows,
        },
        render: ({ disabled, setValue, value, values }) => {
          const nextPriceRowColumns = priceRowColumns.map((column) =>
            column.key === "ipm_unit_id"
              ? {
                ...column,
                options: unitOptions,
                optionsResolver: (params: {
                  rowIndex: number;
                  rows: LinkedRecordRow[];
                }) =>
                  buildItemPriceUnitOptions(
                    params.rows,
                    unitOptions,
                    params.rowIndex,
                  ),
              }
              : column,
          );
          return (
            <ItemLinkedRecordsEditor
              addLabel="+"
              autoCreateFirstRowOnMount
              autoFocusInitialRowOnMount={false}
              columns={nextPriceRowColumns}
              createRow={() =>
                buildEmptyItemPriceRow(
                  hasLinkedRows(value) ? "" : (values.item_base_unit_id ?? "").trim(),
                )
              }
              disabled={disabled}
              emptyState="No price rows added."
              exclusiveTrueColumnKeys={["ipm_is_default_unit", "ipm_is_base_unit"]}
              removeDisabledRowIndexes={[0]}
              onChange={setValue}
              value={value}
            />
          );
        },
      },
      {
        name: "itemHeadingUnitConversionTable",
        label: "Unit Conversion",
        type: "heading",
        defaultExpanded: true,
        sectionGridColumns: 4,
        visibleWhen: () => false,
      },
      {
        name: ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME,
        label: "",
        type: "custom",
        visibleWhen: () => false,
        fieldStyle: {
          gridColumn: "1 / -1",
        },
        helperText:
          "Maintain the valid units for this item here. Price rows can only use units from this section.",
        validation: {
          custom: validateItemUnitConversionRows,
        },
        onValueChange: ({ value, values, previousValues }) =>
          buildItemUnitConversionRowsValueChangeResult(
            values,
            previousValues,
            value,
            itemTaxRecordsById,
          ),
        render: buildCustomFieldEditor(
          unitConversionRowColumns,
          (values) => {
            const rows = buildManagedItemUnitConversionRows(values);
            const nextUnitSlno = rows.length + 1;
            return buildEmptyItemUnitConversionRow(
              (values.item_base_unit_id ?? "").trim(),
              nextUnitSlno,
            );
          },
          "+",
          "No unit conversions added.",
          {
            autoCreateFirstRowOnMount: true,
            autoFocusInitialRowOnMount: false,
          },
        ),
      },
      {
        name: "itemHeadingEanTable",
        label: "EAN Table",
        type: "heading",
        defaultExpanded: true,
        sectionGridColumns: 4,
      },
      {
        name: ITEM_EAN_ROWS_FIELD_NAME,
        label: "",
        type: "custom",
        fieldStyle: {
          gridColumn: "1 / -1",
        },
        helperText:
          "Scan in the EAN Code column and press Enter from the scanner to open the next row automatically.",
        validation: {
          custom: validateItemEanRows,
        },
        onValueChange: ({ value, values, previousValues }) =>
          buildItemEanRowsValueChangeResult(values, previousValues, value),
        render: ({ disabled, setValue, value, values }) => {
          const eanUnitOptions = buildItemEanUnitOptions(values, unitOptions);
          const nextEanRowColumns = eanRowColumns.map((column) =>
            column.key === "ean_unit_id"
              ? {
                ...column,
                options: eanUnitOptions,
              }
              : column,
          );
          return (
            <ItemLinkedRecordsEditor
              addLabel="+"
              actionsLabel="Remove"
              autoCreateFirstRowOnMount
              autoFocusInitialRowOnMount={false}
              autoAppendOnEnter={{
                columnKey: "ean_code",
                focusColumnKey: "ean_code",
              }}
              columns={nextEanRowColumns}
              createRow={(sourceRow) =>
                buildEmptyItemEanRow(
                  (values.item_base_unit_id ?? "").trim(),
                  resolvePreferredItemEanUnitId(values),
                  sourceRow,
                )
              }
              disabled={disabled}
              emptyState="No EAN rows added."
              onChange={setValue}
              showRowIndex={false}
              value={value}
            />
          );
        },
      },
      {
        name: "itemHeadingReorderTable",
        label: "Reorder Table",
        type: "heading",
        defaultExpanded: true,
        sectionGridColumns: 4,
      },
      {
        name: ITEM_REORDER_ROWS_FIELD_NAME,
        label: "",
        type: "custom",
        fieldStyle: {
          gridColumn: "1 / -1",
        },
        helperText: "Optional. Use rows when this item needs multiple reorder rules.",
        validation: {
          custom: validateItemReorderRows,
        },
        onValueChange: ({ value, values, previousValues }) =>
          buildItemReorderRowsValueChangeResult(values, previousValues, value),
        render: buildCustomFieldEditor(
          reorderRowColumns,
          (values) => buildEmptyItemReorderRow((values.item_base_unit_id ?? "").trim()),
          "+",
          "No reorder rows added.",
          {
            autoCreateFirstRowOnMount: true,
            autoFocusInitialRowOnMount: false,
          },
        ),
      },
      {
        name: "itemHeadingInventory",
        label: "Inventory & Notes",
        type: "heading",
      },
      {
        name: "item_sort_order",
        label: "Sort Order",
        type: "number",
        min: 0,
        step: 1,
        validation: {
          minMessage: "Sort Order must be 0 or greater.",
        },
      },
      {
        name: "item_storage_location",
        label: "Storage Location",
        validation: {
          maxLength: 250,
          maxLengthMessage: "Storage Location must be at most 250 characters.",
        },
      },
      {
        name: "item_image_url",
        label: "Image URL",
        type: "url",
      },
      {
        name: "item_photo_file",
        label: "Photo File",
        type: "file",
        accept: "image/*",
        helperText: "Optional. If selected, uploaded as base64.",
      },
      {
        name: "item_notes",
        label: "Notes",
        rows: 3,
        colSpan: 2,
        validation: {
          maxLength: 250,
          maxLengthMessage: "Notes must be at most 250 characters.",
        },
      },
      {
        name: "itemHeadingRules",
        label: "Rules & Status",
        type: "heading",
        defaultExpanded: false,
        sectionGridColumns: 6,
      },
      {
        name: "item_is_active",
        label: "Is Active",
        type: "checkbox",
        controlStyle: {
          accentColor: "#dc2626",
        },
        gridRowStart: 1,
        gridColumnStart: 1,
      },
      {
        name: "item_retail_item",
        label: "Retail Item",
        type: "checkbox",
        gridRowStart: 2,
        gridColumnStart: 1,
      },
      {
        name: "item_price_list",
        label: "Price List",
        type: "checkbox",
        onValueChange: ({ value, values }) => {
          if (value !== "true") {
            return;
          }
          return {
            values: applyItemPriceDefaults(applyItemUnitConversionDefaults(values)),
          };
        },
        gridRowStart: 3,
        gridColumnStart: 1,
      },
      {
        name: "item_allow_neg_stock",
        label: "Allow Negative Stock",
        type: "checkbox",
        gridRowStart: 1,
        gridColumnStart: 5,
      },
      {
        name: "item_allow_promo",
        label: "Allow Promo",
        type: "checkbox",
        gridRowStart: 1,
        gridColumnStart: 6,
      },
      {
        name: "item_allow_purchase",
        label: "Allow Purchase",
        type: "checkbox",
        gridRowStart: 3,
        gridColumnStart: 2,
      },
      {
        name: "item_is_service",
        label: "Service Item",
        type: "checkbox",
        gridRowStart: 5,
        gridColumnStart: 1,
      },
      {
        name: "item_allow_freight",
        label: "Allow Freight",
        type: "checkbox",
        gridRowStart: 2,
        gridColumnStart: 3,
      },
      {
        name: "item_allow_negative_so",
        label: "Allow Negative SO",
        type: "checkbox",
        gridRowStart: 2,
        gridColumnStart: 5,
      },
      {
        name: "item_allow_loyalty",
        label: "Allow Loyalty",
        type: "checkbox",
        gridRowStart: 2,
        gridColumnStart: 6,
      },
      {
        name: "item_allow_sales",
        label: "Allow Sales",
        type: "checkbox",
        gridRowStart: 1,
        gridColumnStart: 2,
      },
      {
        name: "item_allow_loading",
        label: "Allow Loading",
        type: "checkbox",
        gridRowStart: 1,
        gridColumnStart: 3,
      },
      {
        name: "item_damagable_product",
        label: "Damagable Product",
        type: "checkbox",
        gridRowStart: 1,
        gridColumnStart: 4,
      },
      {
        name: "item_has_offer",
        label: "Has Offer",
        type: "checkbox",
        controlStyle: {
          accentColor: "#16a34a",
        },
        gridRowStart: 3,
        gridColumnStart: 5,
      },
      {
        name: "item_allow_sales_return",
        label: "Allow Sales Return",
        type: "checkbox",
        gridRowStart: 2,
        gridColumnStart: 2,
      },
      {
        name: "item_weigh_scale",
        label: "Weigh Scale",
        type: "checkbox",
        controlStyle: {
          accentColor: "#ea580c",
        },
        gridRowStart: 5,
        gridColumnStart: 3,
      },
      {
        name: "item_auto_break",
        label: "Auto Break",
        type: "checkbox",
        controlStyle: {
          accentColor: "#2563eb",
        },
        gridRowStart: 3,
        gridColumnStart: 3,
      },
      {
        name: "item_auto_make",
        label: "Auto Make",
        type: "checkbox",
        controlStyle: {
          accentColor: "#2563eb",
        },
        gridRowStart: 4,
        gridColumnStart: 3,
      },
      {
        name: "item_is_batch_based",
        label: "Batch Based",
        type: "checkbox",
        gridRowStart: 4,
        gridColumnStart: 1,
      },
      {
        name: "item_expiry_days",
        label: "Expiry Days",
        type: "number",
        visibleWhen: (values) => values.item_is_expiry_item === "true",
        gridRowStart: 5,
        gridColumnStart: 4,
      },
      {
        name: "item_is_expiry_item",
        label: "Expiry Item",
        type: "checkbox",
        gridRowStart: 4,
        gridColumnStart: 4,
      },
      {
        name: "item_intimate_before_days",
        label: "Intimate Before Days",
        type: "number",
        visibleWhen: (values) => values.item_is_expiry_item === "true",
        gridRowStart: 6,
        gridColumnStart: 4,
      },
      {
        name: "item_allow_po",
        label: "Allow PO",
        type: "checkbox",
        gridRowStart: 4,
        gridColumnStart: 2,
      },
      {
        name: "item_allow_so",
        label: "Allow SO",
        type: "checkbox",
        gridRowStart: 5,
        gridColumnStart: 2,
      },
      {
        name: "item_is_kit",
        label: "Is Kit",
        type: "checkbox",
        gridRowStart: 2,
        gridColumnStart: 4,
      },
      {
        name: "item_is_demand",
        label: "Is Demand",
        type: "checkbox",
        gridRowStart: 3,
        gridColumnStart: 4,
      },
      {
        name: "item_random_stock",
        label: "Random Stock",
        type: "checkbox",
        gridRowStart: 4,
        gridColumnStart: 5,
      },
      {
        name: "item_barcode_sticker",
        label: "Barcode Sticker",
        type: "checkbox",
        gridRowStart: 3,
        gridColumnStart: 6,
      },
      ]),
    ),
    itemWidgetConfigRecords,
    ITEM_MASTER_WIDGET_GROUP_ID,
  );
}
function mapItemFormValues(
  source: Record<string, unknown> | null,
  defaults: ItemFormDefaults,
  itemTaxRecordsById: ReadonlyMap<string, Record<string, unknown>>,
): Record<string, string> {
  const rowSource = source ?? {};
  const mappedValues: Record<string, string> = {
    ...ITEM_INITIAL_FORM_VALUES,
  };
  assignTextFieldsFromSource(
    mappedValues,
    rowSource,
    ITEM_TEXT_FIELD_NAMES,
    ITEM_INITIAL_FORM_VALUES,
  );
  assignBooleanFieldsFromSource(
    mappedValues,
    rowSource,
    ITEM_BOOLEAN_FIELD_NAMES,
    ITEM_INITIAL_FORM_VALUES,
  );
  assignTextFieldsFromSource(
    mappedValues,
    rowSource,
    ITEM_PRICE_TEXT_FIELD_NAMES,
    ITEM_PRICE_INITIAL_FORM_VALUES,
  );
  assignBooleanFieldsFromSource(
    mappedValues,
    rowSource,
    ITEM_PRICE_BOOLEAN_FIELD_NAMES,
    ITEM_PRICE_INITIAL_FORM_VALUES,
  );
  mappedValues[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME] = syncSerializedItemUnitConversionRows(
    toDisplayValue(getFieldValue(rowSource, ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME)) ||
    ITEM_INITIAL_FORM_VALUES[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME],
    mappedValues,
  );
  mappedValues[ITEM_PRICE_ROWS_FIELD_NAME] = syncSerializedItemPriceRows(
    toDisplayValue(getFieldValue(rowSource, ITEM_PRICE_ROWS_FIELD_NAME)) ||
    ITEM_INITIAL_FORM_VALUES[ITEM_PRICE_ROWS_FIELD_NAME],
    mappedValues,
    itemTaxRecordsById,
  );
  mappedValues[ITEM_REORDER_ROWS_FIELD_NAME] =
    toDisplayValue(getFieldValue(rowSource, ITEM_REORDER_ROWS_FIELD_NAME)) ||
    ITEM_INITIAL_FORM_VALUES[ITEM_REORDER_ROWS_FIELD_NAME];
  mappedValues[ITEM_EAN_ROWS_FIELD_NAME] =
    toDisplayValue(getFieldValue(rowSource, ITEM_EAN_ROWS_FIELD_NAME)) ||
    ITEM_INITIAL_FORM_VALUES[ITEM_EAN_ROWS_FIELD_NAME];
  mappedValues.item_name_en =
    toDisplayValue(getFieldValue(rowSource, "item_name_en")) ||
    toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) ||
    defaults.masterName ||
    ITEM_INITIAL_FORM_VALUES.item_name_en;
  mappedValues.item_code =
    toDisplayValue(getFieldValue(rowSource, "item_code")) ||
    toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.code)) ||
    defaults.searchCode ||
    ITEM_INITIAL_FORM_VALUES.item_code;
  mappedValues.item_alias =
    toDisplayValue(getFieldValue(rowSource, "item_alias")) ||
    toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) ||
    ITEM_INITIAL_FORM_VALUES.item_alias;
  mappedValues.item_stock_type = toUpper(
    toDisplayValue(getFieldValue(rowSource, "item_stock_type")) ||
    toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) ||
    ITEM_INITIAL_FORM_VALUES.item_stock_type,
  );
  mappedValues.item_hsn_code = toUpper(
    toDisplayValue(getFieldValue(rowSource, "item_hsn_code")),
  );
  mappedValues.item_batch_config =
    normalizeItemBatchConfigValue(getFieldValue(rowSource, "item_batch_config")) ||
    ITEM_INITIAL_FORM_VALUES.item_batch_config;
  mappedValues.item_sort_order =
    toDisplayValue(getFieldValue(rowSource, "item_sort_order")) ||
    toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) ||
    ITEM_INITIAL_FORM_VALUES.item_sort_order;
  mappedValues.item_notes =
    toDisplayValue(getFieldValue(rowSource, "item_notes")) ||
    toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
    defaults.masterDescription ||
    ITEM_INITIAL_FORM_VALUES.item_notes;
  mappedValues.item_packing_item_ids =
    toCsvFromArray(getFieldValue(rowSource, "item_packing_item_ids")) ||
    ITEM_INITIAL_FORM_VALUES.item_packing_item_ids;
  mappedValues.item_expiry_days =
    toDisplayValue(getFieldValue(rowSource, "item_expiry_days")) ||
    ITEM_INITIAL_FORM_VALUES.item_expiry_days;
  mappedValues.item_intimate_before_days =
    toDisplayValue(getFieldValue(rowSource, "item_intimate_before_days")) ||
    ITEM_INITIAL_FORM_VALUES.item_intimate_before_days;
  mappedValues.ipm_unit_id =
    toDisplayValue(getFieldValue(rowSource, "ipm_unit_id")) ||
    mappedValues.item_base_unit_id ||
    ITEM_PRICE_INITIAL_FORM_VALUES.ipm_unit_id;
  if (
    mappedValues.item_price_list !== "true" &&
    hasLinkedRows(mappedValues[ITEM_PRICE_ROWS_FIELD_NAME])
  ) {
    mappedValues.item_price_list = "true";
  }
  Object.assign(mappedValues, applyItemUnitConversionDefaults(mappedValues));
  mappedValues[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME] = syncSerializedItemUnitConversionRows(
    mappedValues[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME],
    mappedValues,
  );
  mappedValues[ITEM_PRICE_ROWS_FIELD_NAME] = syncSerializedItemPriceRows(
    mappedValues[ITEM_PRICE_ROWS_FIELD_NAME],
    mappedValues,
    itemTaxRecordsById,
  );
  if (shouldShowItemPriceSection(mappedValues)) {
    Object.assign(mappedValues, applyItemPriceDefaults(mappedValues));
    mappedValues[ITEM_PRICE_ROWS_FIELD_NAME] = syncSerializedItemPriceRows(
      mappedValues[ITEM_PRICE_ROWS_FIELD_NAME],
      mappedValues,
      itemTaxRecordsById,
    );
  }
  return mappedValues;
}
async function buildItemRequestPayload({
  editingItemId,
  files,
  shouldUpdate,
  values,
}: BuildItemRequestPayloadArgs): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = {
    item_company_id: (values.item_company_id ?? "").trim(),
    item_branch_id: toNullableString(values.item_branch_id ?? ""),
    item_code: toNullableString(values.item_code ?? ""),
    item_sku: toNullableString(values.item_sku ?? ""),
    item_name_en: (values.item_name_en ?? "").trim(),
    item_name_ta: toNullableString(values.item_name_ta ?? ""),
    item_alias: toNullableString(values.item_alias ?? ""),
    item_stock_type: toUpper(values.item_stock_type ?? "") || "FG",
    item_default_barcode: toNullableString(values.item_default_barcode ?? ""),
    item_group_id: (values.item_group_id ?? "").trim(),
    item_category_id: toNullableString(values.item_category_id ?? ""),
    item_brand_id: toNullableString(values.item_brand_id ?? ""),
    item_section_id: toNullableString(values.item_section_id ?? ""),
    item_company_category_id: toNullableString(values.item_company_category_id ?? ""),
    item_supplier_id: toNullableString(values.item_supplier_id ?? ""),
    item_cust_group: toNullableString(values.item_cust_group ?? ""),
    item_base_unit_id: (values.item_base_unit_id ?? "").trim(),
    item_is_service: (values.item_is_service ?? "false") === "true",
    item_is_batch_based: (values.item_is_batch_based ?? "false") === "true",
    item_is_expiry_item: (values.item_is_expiry_item ?? "false") === "true",
    item_expiry_days: toOptionalNonNegativeInteger(values.item_expiry_days ?? ""),
    item_intimate_before_days: toOptionalNonNegativeInteger(
      values.item_intimate_before_days ?? "",
    ),
    item_allow_sales: (values.item_allow_sales ?? "true") === "true",
    item_allow_sales_return: (values.item_allow_sales_return ?? "true") === "true",
    item_allow_purchase: (values.item_allow_purchase ?? "true") === "true",
    item_allow_po: (values.item_allow_po ?? "true") === "true",
    item_allow_so: (values.item_allow_so ?? "true") === "true",
    item_allow_neg_stock: (values.item_allow_neg_stock ?? "true") === "true",
    item_allow_negative_so:
      (values.item_allow_negative_so ?? "true") === "true",
    item_price_list:
      (values.item_price_list ?? "false") === "true" || hasMeaningfulItemPriceRows(values),
    item_weigh_scale: (values.item_weigh_scale ?? "false") === "true",
    item_retail_item: (values.item_retail_item ?? "true") === "true",
    item_is_kit: (values.item_is_kit ?? "false") === "true",
    item_auto_break: (values.item_auto_break ?? "false") === "true",
    item_auto_make: (values.item_auto_make ?? "false") === "true",
    item_allow_loyalty: (values.item_allow_loyalty ?? "false") === "true",
    item_allow_promo: (values.item_allow_promo ?? "false") === "true",
    item_has_offer: (values.item_has_offer ?? "false") === "true",
    item_damagable_product:
      (values.item_damagable_product ?? "false") === "true",
    item_is_demand: (values.item_is_demand ?? "false") === "true",
    item_allow_loading: (values.item_allow_loading ?? "false") === "true",
    item_allow_freight: (values.item_allow_freight ?? "false") === "true",
    item_random_stock: (values.item_random_stock ?? "false") === "true",
    item_barcode_sticker: (values.item_barcode_sticker ?? "false") === "true",
    item_default_tax_id: toNullableString(values.item_default_tax_id ?? ""),
    item_hsn_code: toUpperNullable(values.item_hsn_code ?? ""),
    item_batch_config: toNonNegativeInteger(
      normalizeItemBatchConfigValue(values.item_batch_config) || "0",
      0,
    ),
    item_sort_order: toOptionalNonNegativeInteger(values.item_sort_order ?? ""),
    item_image_url: toNullableString(values.item_image_url ?? ""),
    item_notes: toNullableString(values.item_notes ?? ""),
    item_storage_location: toNullableString(values.item_storage_location ?? ""),
    item_packing_item_ids: toUniqueStringArrayFromCsv(
      values.item_packing_item_ids ?? "",
    ),
    item_is_active: (values.item_is_active ?? "true") === "true",
    item_created_by: toNullableString(values.item_created_by ?? ""),
    item_modified_by: toNullableString(values.item_modified_by ?? ""),
  };
  const selectedPhoto = files.item_photo_file;
  if (selectedPhoto) {
    payload.item_photo = await fileToBase64(selectedPhoto);
  }
  if (shouldUpdate && editingItemId !== null) {
    payload.item_id = toUpdateId(editingItemId);
  }
  return payload;
}
export default function ItemMasterPageContent({
  inlineModalOnly,
  onCrudControllerReady,
  onModalOpenChange,
  onItemSaved,
}: ItemMasterPageContentProps = {}) {
  const { getAll: getSupplierLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getCustomerGroupLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getItemLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getTaxLookup } = useApi<unknown>(TAX_LOOKUP_ENDPOINT);
  const { getAll: listItemTaxes } = useApi<unknown>(ITEM_TAX_MASTER_LIST_ENDPOINT);
  const { getAll: getItemPriceTableColumns } = useApi<unknown>(UI_TABLE_COLUMNS_ENDPOINT);
  const { getAll: getItemReorderTableColumns } = useApi<unknown>(UI_TABLE_COLUMNS_ENDPOINT);
  const { getAll: getItemEanTableColumns } = useApi<unknown>(UI_TABLE_COLUMNS_ENDPOINT);
  const { getAll: getItemMasterWidgets } = useApi<unknown>(WIDGET_MASTER_LIST_ENDPOINT);
  const { getAll: getCompanyLookup } = useApi<unknown>(COMPANY_LOOKUP_ENDPOINT);
  const { getAll: getBranchLookup } = useApi<unknown>(BRANCH_LOOKUP_ENDPOINT);
  const { getAll: getGroupLookup } = useApi<unknown>(ITEM_GROUP_LOOKUP_ENDPOINT);
  const { getAll: searchGroupLookup } = useApi<unknown>(ITEM_GROUP_LOOKUP_ENDPOINT);
  const { getAll: getCategoryLookup } = useApi<unknown>(ITEM_CATEGORY_LOOKUP_ENDPOINT);
  const { getAll: getBrandLookup } = useApi<unknown>(ITEM_BRAND_LOOKUP_ENDPOINT);
  const { getAll: getSectionLookup } = useApi<unknown>(ITEM_SECTION_LOOKUP_ENDPOINT);
  const { getAll: getUnitLookup } = useApi<unknown>(UNIT_LOOKUP_ENDPOINT);
  const { getAll: getGodownLookup } = useApi<unknown>(GODOWN_LOOKUP_ENDPOINT);
  const { getAll: getHsnLookup } = useApi<unknown>(HSN_LOOKUP_ENDPOINT);
  const { getAll: listItemUnitConversions } = useApi<unknown>(
    ITEM_PRICE_API_ENDPOINTS.list,
  );
  const { run: upsertItemUnitConversion } = useApi<unknown, unknown>(
    ITEM_PRICE_API_ENDPOINTS.create,
    {
      method: "POST",
      toast: {
        success: false,
      },
    },
  );
  const { run: removeItemUnitConversion } = useApi<unknown, unknown>(
    ITEM_PRICE_API_ENDPOINTS.delete,
    {
      method: "DELETE",
      toast: {
        success: false,
      },
    },
  );
  const { getAll: listItemPrices } = useApi<unknown>(ITEM_PRICE_API_ENDPOINTS.list);
  const { run: upsertItemPrice } = useApi<unknown, unknown>(
    ITEM_PRICE_API_ENDPOINTS.create,
    {
      method: "POST",
      toast: {
        success: false,
      },
    },
  );
  const { run: removeItemPrice } = useApi<unknown, unknown>(ITEM_PRICE_API_ENDPOINTS.delete, {
    method: "DELETE",
    toast: {
      success: false,
    },
  });
  const { getAll: listItemReorders } = useApi<unknown>(ITEM_REORDER_API_ENDPOINTS.list);
  const { run: upsertItemReorder } = useApi<unknown, unknown>(
    ITEM_REORDER_API_ENDPOINTS.create,
    {
      method: "POST",
      toast: {
        success: false,
      },
    },
  );
  const { run: removeItemReorder } = useApi<unknown, unknown>(ITEM_REORDER_API_ENDPOINTS.delete, {
    method: "DELETE",
    toast: {
      success: false,
    },
  });
  const { getAll: listItemEanCodes } = useApi<unknown>(ITEM_EAN_CODE_API_ENDPOINTS.list);
  const { run: upsertItemEanCode } = useApi<unknown, unknown>(
    ITEM_EAN_CODE_API_ENDPOINTS.create,
    {
      method: "POST",
      toast: {
        success: false,
      },
    },
  );
  const { run: removeItemEanCode } = useApi<unknown, unknown>(ITEM_EAN_CODE_API_ENDPOINTS.delete, {
    method: "DELETE",
    toast: {
      success: false,
    },
  });
  const [companyOptions, setCompanyOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [branchOptions, setBranchOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [brandOptions, setBrandOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [sectionOptions, setSectionOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [unitOptions, setUnitOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [godownOptions, setGodownOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [taxOptions, setTaxOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [hsnOptions, setHsnOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [customerGroupOptions, setCustomerGroupOptions] = useState<
    ERPDynamicSelectOption[]
  >([]);
  const [itemOptions, setItemOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [itemTaxRecords, setItemTaxRecords] = useState<Record<string, unknown>[]>([]);
  const [itemPriceTableColumnsConfig, setItemPriceTableColumnsConfig] = useState<
    Record<string, unknown>[]
  >([]);
  const [itemReorderTableColumnsConfig, setItemReorderTableColumnsConfig] = useState<
    Record<string, unknown>[]
  >([]);
  const [itemEanTableColumnsConfig, setItemEanTableColumnsConfig] = useState<
    Record<string, unknown>[]
  >([]);
  const [itemWidgetConfigRecords, setItemWidgetConfigRecords] = useState<
    ItemWidgetConfigRecord[]
  >([]);
  const itemGroupSearchTimeoutRef = useRef<number | null>(null);
  const itemGroupSearchRequestRef = useRef(0);
  const itemTaxRecordsById = useMemo(
    () =>
      new Map(
        itemTaxRecords
          .map((record) => [
            toDisplayValue(getFieldValue(record, "tax_id")),
            record,
          ] as const)
          .filter(([taxId]) => Boolean(taxId)),
      ),
    [itemTaxRecords],
  );
  const loadItemGroupOptions = useCallback(
    async (search = "") => {
      const normalizedSearch = search.trim();
      const payload = await searchGroupLookup(
        normalizedSearch
          ? {
            ...ITEM_GROUP_LOOKUP_QUERY,
            search: normalizedSearch,
          }
          : ITEM_GROUP_LOOKUP_QUERY,
      );
      return toLookupOptions(payload, DEFAULT_GROUP_OPTION, GROUP_LOOKUP_KEYS);
    },
    [searchGroupLookup],
  );
  const handleItemGroupSearchChange = useCallback<ERPDynamicSearchQueryChangeHandler>(
    (query) => {
      const normalizedQuery = query.trim();
      if (itemGroupSearchTimeoutRef.current !== null) {
        window.clearTimeout(itemGroupSearchTimeoutRef.current);
      }
      if (!normalizedQuery) {
        return;
      }
      const requestId = itemGroupSearchRequestRef.current + 1;
      itemGroupSearchRequestRef.current = requestId;
      itemGroupSearchTimeoutRef.current = window.setTimeout(() => {
        void (async () => {
          try {
            const searchedOptions = await loadItemGroupOptions(normalizedQuery);
            if (itemGroupSearchRequestRef.current !== requestId) {
              return;
            }
            setGroupOptions((current) => mergeLookupOptionSets(current, searchedOptions));
          } catch {
            // Keep the existing option set when incremental search fails.
          }
        })();
      }, ITEM_GROUP_SEARCH_DEBOUNCE_MS);
    },
    [loadItemGroupOptions],
  );
  useEffect(() => {
    return () => {
      if (itemGroupSearchTimeoutRef.current !== null) {
        window.clearTimeout(itemGroupSearchTimeoutRef.current);
      }
    };
  }, []);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [
        companiesPayload,
        branchesPayload,
        groupsPayload,
        categoriesPayload,
        brandsPayload,
        sectionsPayload,
        unitsPayload,
        godownsPayload,
        taxesPayload,
        itemTaxesPayload,
        hsnPayload,
        suppliersPayload,
        customerGroupsPayload,
        itemsPayload,
        uiTableColumnsPayload,
        uiReorderTableColumnsPayload,
        uiEanTableColumnsPayload,
        itemMasterWidgetsPayload,
      ] = await Promise.allSettled([
        getCompanyLookup(COMPANY_LOOKUP_QUERY),
        getBranchLookup(BRANCH_LOOKUP_QUERY),
        getGroupLookup(ITEM_GROUP_LOOKUP_QUERY),
        getCategoryLookup(ITEM_CATEGORY_LOOKUP_QUERY),
        getBrandLookup(ITEM_BRAND_LOOKUP_QUERY),
        getSectionLookup(ITEM_SECTION_LOOKUP_QUERY),
        getUnitLookup(UNIT_LOOKUP_QUERY),
        getGodownLookup(GODOWN_LOOKUP_QUERY),
        getTaxLookup(LOOKUP_QUERY_ITEM_TAXES),
        listItemTaxes(ITEM_TAX_LIST_QUERY),
        getHsnLookup(HSN_LOOKUP_QUERY),
        getSupplierLookup(LOOKUP_QUERY_SUPPLIERS),
        getCustomerGroupLookup(LOOKUP_QUERY_CUSTOMER_GROUPS),
        getItemLookup(LOOKUP_QUERY_ITEMS),
        getItemPriceTableColumns(UI_TABLE_COLUMNS_QUERY),
        getItemReorderTableColumns(UI_REORDER_TABLE_COLUMNS_QUERY),
        getItemEanTableColumns(UI_EAN_TABLE_COLUMNS_QUERY),
        getItemMasterWidgets(ITEM_MASTER_WIDGET_QUERY),
      ]);
      if (!mounted) {
        return;
      }
      setCompanyOptions(
        companiesPayload.status === "fulfilled"
          ? toLookupOptions(
            companiesPayload.value,
            DEFAULT_COMPANY_OPTION,
            COMPANY_LOOKUP_KEYS,
          )
          : [],
      );
      setBranchOptions(
        branchesPayload.status === "fulfilled"
          ? toLookupOptions(
            branchesPayload.value,
            DEFAULT_BRANCH_OPTION,
            BRANCH_LOOKUP_KEYS,
          )
          : [],
      );
      setGroupOptions((current) => {
        if (groupsPayload.status !== "fulfilled") {
          return current;
        }
        const initialGroupOptions = toLookupOptions(
          groupsPayload.value,
          DEFAULT_GROUP_OPTION,
          GROUP_LOOKUP_KEYS,
        );
        return current.length > 0
          ? mergeLookupOptionSets(initialGroupOptions, current)
          : initialGroupOptions;
      });
      setCategoryOptions(
        categoriesPayload.status === "fulfilled"
          ? toLookupOptions(
            categoriesPayload.value,
            DEFAULT_CATEGORY_OPTION,
            CATEGORY_LOOKUP_KEYS,
          )
          : [],
      );
      setBrandOptions(
        brandsPayload.status === "fulfilled"
          ? toLookupOptions(brandsPayload.value, DEFAULT_BRAND_OPTION, BRAND_LOOKUP_KEYS)
          : [],
      );
      setSectionOptions(
        sectionsPayload.status === "fulfilled"
          ? toLookupOptions(
            sectionsPayload.value,
            DEFAULT_SECTION_OPTION,
            SECTION_LOOKUP_KEYS,
          )
          : [],
      );
      setUnitOptions(
        unitsPayload.status === "fulfilled"
          ? toLookupOptions(unitsPayload.value, DEFAULT_UNIT_OPTION, UNIT_LOOKUP_KEYS)
          : [],
      );
      setGodownOptions(
        godownsPayload.status === "fulfilled"
          ? toLookupOptions(godownsPayload.value, DEFAULT_GODOWN_OPTION, GODOWN_LOOKUP_KEYS)
          : [],
      );
      setTaxOptions(
        taxesPayload.status === "fulfilled"
          ? toLookupOptions(taxesPayload.value, DEFAULT_TAX_OPTION, TAX_LOOKUP_KEYS)
          : [],
      );
      setItemTaxRecords(
        itemTaxesPayload.status === "fulfilled"
          ? extractArrayRecords(itemTaxesPayload.value, DEFAULT_LOOKUP_ARRAY_KEYS)
          : [],
      );
      setHsnOptions(
        hsnPayload.status === "fulfilled"
          ? toHsnOptions(hsnPayload.value, DEFAULT_HSN_OPTION)
          : [],
      );
      setSupplierOptions(
        suppliersPayload.status === "fulfilled"
          ? toLookupOptions(suppliersPayload.value, DEFAULT_SUPPLIER_OPTION)
          : [],
      );
      setCustomerGroupOptions(
        customerGroupsPayload.status === "fulfilled"
          ? toLookupOptions(customerGroupsPayload.value, DEFAULT_CUSTOMER_GROUP_OPTION)
          : [],
      );
      setItemOptions(
        itemsPayload.status === "fulfilled"
          ? toLookupOptions(itemsPayload.value, DEFAULT_PACKING_OPTION)
          : [],
      );
      setItemPriceTableColumnsConfig(
        uiTableColumnsPayload.status === "fulfilled"
          ? extractUiTableColumnConfigRecords(
            uiTableColumnsPayload.value,
            ITEM_PRICE_TABLE_UI_ID,
          )
          : [],
      );
      setItemReorderTableColumnsConfig(
        uiReorderTableColumnsPayload.status === "fulfilled"
          ? extractUiTableColumnConfigRecords(
            uiReorderTableColumnsPayload.value,
            ITEM_REORDER_TABLE_UI_ID,
          )
          : [],
      );
      setItemEanTableColumnsConfig(
        uiEanTableColumnsPayload.status === "fulfilled"
          ? extractUiTableColumnConfigRecords(
            uiEanTableColumnsPayload.value,
            ITEM_EAN_TABLE_UI_ID,
          )
          : [],
      );
      setItemWidgetConfigRecords(
        itemMasterWidgetsPayload.status === "fulfilled"
          ? toItemWidgetConfigRecords(itemMasterWidgetsPayload.value)
          : [],
      );
    })();
    return () => {
      mounted = false;
    };
  }, [
    getBrandLookup,
    getBranchLookup,
    getCategoryLookup,
    getCompanyLookup,
    getCustomerGroupLookup,
    getGodownLookup,
    getGroupLookup,
    getHsnLookup,
    getItemEanTableColumns,
    getItemMasterWidgets,
    getItemLookup,
    getItemPriceTableColumns,
    getItemReorderTableColumns,
    getSectionLookup,
    getSupplierLookup,
    getTaxLookup,
    getUnitLookup,
    listItemTaxes,
  ]);
  const listItemUnitConversionRecords = useCallback(
    async (itemId: string) => {
      const payload = await listItemUnitConversions({
        iuc_item_id: itemId,
        limit: ITEM_UNIT_CONVERSION_QUERY_LIMIT,
      });
      return extractArrayRecords(payload, DEFAULT_LOOKUP_ARRAY_KEYS);
    },
    [listItemUnitConversions],
  );
  const listItemPriceRecords = useCallback(
    async (
      itemId: string,
      scopeSource?: Record<string, unknown> | null,
    ) => {
      const scope = scopeSource ? resolveItemPriceScope(scopeSource) : null;
      const payload = await listItemPrices({
        ipm_item_id: itemId,
        limit: ITEM_PRICE_QUERY_LIMIT,
        ...(scope?.companyId ? { ipm_company_id: scope.companyId } : {}),
        ...(scope?.branchId ? { ipm_branch_id: scope.branchId } : {}),
      });
      const rows = extractArrayRecords(payload, DEFAULT_LOOKUP_ARRAY_KEYS);
      return scope ? filterItemPriceRowsByScope(rows, scope) : rows;
    },
    [listItemPrices],
  );
  const listItemReorderRecords = useCallback(
    async (itemId: string) => {
      const payload = await listItemReorders({
        ir_item_id: itemId,
        limit: ITEM_REORDER_QUERY_LIMIT,
      });
      return extractArrayRecords(payload, DEFAULT_LOOKUP_ARRAY_KEYS);
    },
    [listItemReorders],
  );
  const listItemEanCodeRecords = useCallback(
    async (itemId: string) => {
      const payload = await listItemEanCodes({
        ean_item_id: itemId,
        limit: ITEM_EAN_CODE_QUERY_LIMIT,
      });
      return extractArrayRecords(payload, DEFAULT_LOOKUP_ARRAY_KEYS);
    },
    [listItemEanCodes],
  );
  const extractLinkedRowIds = useCallback(
    (rows: Record<string, unknown>[], fieldName: string) =>
      rows
        .map((row) => toDisplayValue(getFieldValue(row, fieldName)))
        .filter((value): value is string => Boolean(value)),
    [],
  );
  const buildItemUnitConversionPayloadRows = useCallback(
    (itemId: string, values: Record<string, string>) => {
      const normalizedValues = normalizeItemLinkedSubmissionValues(
        values,
        itemTaxRecordsById,
      );
      const baseUnitId = resolveLinkedBaseUnitId(normalizedValues);
      const itemPriceRows = buildManagedItemPriceRows(normalizedValues);
      const hiddenUnitConversionRowsByUnitId = new Map(
        buildManagedItemUnitConversionRows(normalizedValues)
          .map((row) => [(row.iuc_unit_id ?? "").trim(), row] as const)
          .filter(([unitId]) => Boolean(unitId)),
      );

      if (itemPriceRows.length > 0) {
        const seenUnitIds = new Set<string>();
        return itemPriceRows.flatMap((priceRow, index) => {
          const unitId = (priceRow.ipm_unit_id ?? "").trim() || baseUnitId;
          if (!unitId || seenUnitIds.has(unitId)) {
            return [];
          }
          seenUnitIds.add(unitId);
          const matchingUnitConversionRow = hiddenUnitConversionRowsByUnitId.get(unitId);
          const nextToBaseFactor = toOptionalNonNegativeNumber(
            resolveItemPriceToBaseFactorValue(priceRow) ||
              resolveItemUnitConversionToBaseFactorValue(
                matchingUnitConversionRow ?? {},
              ) ||
              (unitId === baseUnitId ? "1" : ""),
          );
          const nextUnitFactor = toOptionalNonNegativeNumber(
            resolveItemPriceUnitFactorValue(priceRow) ||
              resolveItemUnitConversionUnitFactorValue(
                matchingUnitConversionRow ?? {},
              ) ||
              (unitId === baseUnitId ? "1" : ""),
          );
          const payload: Record<string, unknown> = {
            iuc_company_id: (normalizedValues.item_company_id ?? "").trim(),
            iuc_item_id: itemId,
            iuc_unit_id: unitId,
            iuc_base_unit_id: baseUnitId,
            iuc_unit_slno:
              toOptionalNonNegativeInteger(
                priceRow.ipm_unit_slno ??
                  matchingUnitConversionRow?.iuc_unit_slno ??
                  String(index + 1),
              ) ?? index + 1,
            iuc_to_base_factor: nextToBaseFactor,
            iuc_unit_factor: nextUnitFactor,
            iuc_is_default_unit: (priceRow.ipm_is_default_unit ?? "false") === "true",
            iuc_is_base_unit: (priceRow.ipm_is_base_unit ?? "false") === "true",
            iuc_is_big_unit: (priceRow.ipm_is_big_unit ?? "false") === "true",
            iuc_uom_weight: toOptionalNonNegativeNumber(
              (matchingUnitConversionRow?.iuc_uom_weight ?? "").trim() || "0",
            ),
            iuc_uom_remarks: toNullableString(
              matchingUnitConversionRow?.iuc_uom_remarks ?? "",
            ),
            iuc_is_active:
              (matchingUnitConversionRow?.iuc_is_active ?? "true") === "true",
          };

          const itemUnitConversionId = toTrimmedOrUndefined(
            matchingUnitConversionRow?.iuc_id,
          );
          if (itemUnitConversionId) {
            payload.iuc_id = itemUnitConversionId;
          }

          return [payload];
        });
      }

      return buildManagedItemUnitConversionRows(normalizedValues).map((row) => {
        const unitId = (row.iuc_unit_id ?? "").trim() || baseUnitId;
        const payload: Record<string, unknown> = {
          iuc_company_id: (normalizedValues.item_company_id ?? "").trim(),
          iuc_item_id: itemId,
          iuc_unit_id: unitId,
          iuc_base_unit_id: baseUnitId,
          iuc_unit_slno:
            toOptionalNonNegativeInteger(row.iuc_unit_slno ?? "") ?? 0,
          iuc_to_base_factor: toOptionalNonNegativeNumber(
            resolveItemUnitConversionToBaseFactorValue(row) ||
              (unitId === baseUnitId ? "1" : ""),
          ),
          iuc_unit_factor: toOptionalNonNegativeNumber(
            resolveItemUnitConversionUnitFactorValue(row) ||
              (unitId === baseUnitId ? "1" : ""),
          ),
          iuc_is_default_unit: (row.iuc_is_default_unit ?? "false") === "true",
          iuc_is_base_unit: (row.iuc_is_base_unit ?? "false") === "true",
          iuc_is_big_unit: (row.iuc_is_big_unit ?? "false") === "true",
          iuc_uom_weight: toOptionalNonNegativeNumber(
            (row.iuc_uom_weight ?? "").trim() || "0",
          ),
          iuc_uom_remarks: toNullableString(row.iuc_uom_remarks ?? ""),
          iuc_is_active: (row.iuc_is_active ?? "true") === "true",
        };

        const itemUnitConversionId = toTrimmedOrUndefined(row.iuc_id);
        if (itemUnitConversionId) {
          payload.iuc_id = itemUnitConversionId;
        }

        return payload;
      });
    },
    [itemTaxRecordsById],
  );
  const buildItemPricePayloadRows = useCallback(
    (itemId: string, values: Record<string, string>) => {
      const normalizedValues = normalizeItemLinkedSubmissionValues(
        values,
        itemTaxRecordsById,
      );
      const baseUnitId = resolveLinkedBaseUnitId(normalizedValues);
      const itemUnitConversionsByUnitId = buildItemUnitConversionRowsByUnitId(
        normalizedValues,
      );
      return buildManagedItemPriceRows(normalizedValues).map((row) => {
        const unitId = (row.ipm_unit_id ?? "").trim() || baseUnitId;
        const matchingUnitConversion = itemUnitConversionsByUnitId.get(unitId);
        const nextToBaseFactor =
          resolveItemPriceToBaseFactorValue(row) ||
          resolveItemUnitConversionToBaseFactorValue(matchingUnitConversion ?? {}) ||
          "1";
        const nextUnitFactor =
          resolveItemPriceUnitFactorValue(row) ||
          resolveItemUnitConversionUnitFactorValue(matchingUnitConversion ?? {}) ||
          "1";
        const payload: Record<string, unknown> = {
          ipm_company_id: toNullableString(normalizedValues.item_company_id ?? ""),
          ipm_branch_id: toNullableString(normalizedValues.item_branch_id ?? ""),
          ipm_item_id: itemId,
          ipm_unit_id: unitId,
          ipm_godown_id: (row.ipm_godown_id ?? "").trim(),
          ipm_base_unit_id: toNullableString(baseUnitId),
          ipm_profit_type: normalizeItemPriceProfitType(row.ipm_profit_type),
          ipm_unit_slno: toOptionalNonNegativeInteger(
            matchingUnitConversion?.iuc_unit_slno ?? row.ipm_unit_slno ?? "",
          ),
          ipm_to_base_factor: toOptionalNonNegativeNumber(nextToBaseFactor),
          ipm_unit_factor: toOptionalNonNegativeNumber(nextUnitFactor),
          ipm_cost_price: toOptionalNonNegativeNumber(row.ipm_cost_price ?? ""),
          ipm_cost_wot: toOptionalNonNegativeNumber(row.ipm_cost_wot ?? ""),
          ipm_sales_price_a: toOptionalNonNegativeNumber(
            row.ipm_sales_price_a ?? "",
          ),
          ipm_sales_price_b: toOptionalNonNegativeNumber(
            row.ipm_sales_price_b ?? "",
          ),
          ipm_sales_price_c: toOptionalNonNegativeNumber(
            row.ipm_sales_price_c ?? "",
          ),
          ipm_sales_price_d: toOptionalNonNegativeNumber(
            row.ipm_sales_price_d ?? "",
          ),
          ipm_price_a_wot: toOptionalNonNegativeNumber(row.ipm_price_a_wot ?? ""),
          ipm_price_b_wot: toOptionalNonNegativeNumber(row.ipm_price_b_wot ?? ""),
          ipm_price_c_wot: toOptionalNonNegativeNumber(row.ipm_price_c_wot ?? ""),
          ipm_price_d_wot: toOptionalNonNegativeNumber(row.ipm_price_d_wot ?? ""),
          ipm_price_a_markup_perc: toOptionalNonNegativeNumber(
            row.ipm_price_a_markup_perc ?? "",
          ),
          ipm_price_b_markup_perc: toOptionalNonNegativeNumber(
            row.ipm_price_b_markup_perc ?? "",
          ),
          ipm_price_c_markup_perc: toOptionalNonNegativeNumber(
            row.ipm_price_c_markup_perc ?? "",
          ),
          ipm_price_d_markup_perc: toOptionalNonNegativeNumber(
            row.ipm_price_d_markup_perc ?? "",
          ),
          ipm_min_price: toOptionalNonNegativeNumber(row.ipm_min_price ?? ""),
          ipm_max_price: toOptionalNonNegativeNumber(row.ipm_max_price ?? ""),
          ipm_disc_perc: toOptionalNonNegativeNumber(row.ipm_disc_perc ?? ""),
          ipm_disc_qty: toOptionalNonNegativeNumber(row.ipm_disc_qty ?? ""),
          ipm_addl_cess: toOptionalNonNegativeNumber(row.ipm_addl_cess ?? ""),
          ipm_round_off: toOptionalNonNegativeNumber(row.ipm_round_off ?? ""),
          ipm_is_default_unit:
            (row.ipm_is_default_unit ??
              matchingUnitConversion?.iuc_is_default_unit ??
              "false") === "true",
          ipm_is_base_unit:
            (row.ipm_is_base_unit ?? matchingUnitConversion?.iuc_is_base_unit ?? "false") ===
            "true",
          ipm_is_big_unit:
            (row.ipm_is_big_unit ?? matchingUnitConversion?.iuc_is_big_unit ?? "false") ===
            "true",
          ipm_loading_charge: toOptionalNonNegativeNumber(
            row.ipm_loading_charge ?? "",
          ),
          ipm_freight_charge: toOptionalNonNegativeNumber(
            row.ipm_freight_charge ?? "",
          ),
          ipm_loyalty_points: toOptionalNonNegativeNumber(
            (row.ipm_loyalty_points ?? "").trim() || "0",
          ),
          ipm_uom_remarks: toNullableString(row.ipm_uom_remarks ?? ""),
          ipm_cost_remarks: toNullableString(row.ipm_cost_remarks ?? ""),
          ipm_is_active: (row.ipm_is_active ?? "true") === "true",
        };

        const itemPriceId = toTrimmedOrUndefined(row.ipm_id);
        if (itemPriceId) {
          payload.ipm_id = itemPriceId;
        }

        return payload;
      });
    },
    [itemTaxRecordsById],
  );
  const buildItemReorderPayloadRows = useCallback(
    (itemId: string, values: Record<string, string>) => {
      const baseUnitId = (values.item_base_unit_id ?? "").trim();
      return buildManagedItemReorderRows(values).map((row) => {
        const payload: Record<string, unknown> = {
          ir_item_id: itemId,
          ir_branch_id: toNullableString(values.item_branch_id ?? ""),
          ir_unit_id: (row.ir_unit_id ?? "").trim() || baseUnitId,
          ir_min_level: toOptionalNonNegativeNumber(row.ir_min_level ?? ""),
          ir_max_level: toOptionalNonNegativeNumber(row.ir_max_level ?? ""),
          ir_reorder_level: toOptionalNonNegativeNumber(
            row.ir_reorder_level ?? "",
          ),
          ir_reorder_qty: toOptionalNonNegativeNumber(row.ir_reorder_qty ?? ""),
          ir_lead_time_days: toOptionalNonNegativeInteger(
            row.ir_lead_time_days ?? "",
          ),
          ir_review_cycle_days: toOptionalNonNegativeInteger(
            row.ir_review_cycle_days ?? "",
          ),
          ir_reorder_days: toOptionalNonNegativeInteger(row.ir_reorder_days ?? ""),
          ir_expiry_buffer_days: toOptionalNonNegativeInteger(
            row.ir_expiry_buffer_days ?? "",
          ),
          ir_reorder_type: (row.ir_reorder_type ?? "").trim(),
          ir_is_active: (row.ir_is_active ?? "true") === "true",
          ir_remarks: toNullableString(row.ir_remarks ?? ""),
        };
        const itemReorderId = toTrimmedOrUndefined(row.ir_id);
        if (itemReorderId) {
          payload.ir_id = itemReorderId;
        }
        return payload;
      });
    },
    [],
  );
  const buildItemEanPayloadRows = useCallback(
    (itemId: string, values: Record<string, string>) => {
      const baseUnitId = (values.item_base_unit_id ?? "").trim();
      return buildManagedItemEanRows(values).map((row) => {
        const payload: Record<string, unknown> = {
          ean_item_id: itemId,
          ean_unit_id: (row.ean_unit_id ?? "").trim() || baseUnitId,
          ean_code: (row.ean_code ?? "").trim(),
          ean_godown_id: toNullableString(row.ean_godown_id ?? ""),
          ean_is_default: (row.ean_is_default ?? "false") === "true",
          ean_is_active: (row.ean_is_active ?? "true") === "true",
          ean_remarks: toNullableString(row.ean_remarks ?? ""),
        };
        const itemEanCodeId = toTrimmedOrUndefined(row.ean_id);
        if (itemEanCodeId) {
          payload.ean_id = itemEanCodeId;
        }
        return payload;
      });
    },
    [],
  );
  const deleteLinkedItemPrices = useCallback(
    async (itemId: string) => {
      const rows = await listItemPriceRecords(itemId);
      const itemPriceIds = extractLinkedRowIds(rows, "ipm_id");
      if (itemPriceIds.length === 0) {
        return;
      }
      await removeItemPrice({
        body: toSingleOrArrayPayload(
          itemPriceIds.map((ipmId) => ({
            ipm_id: ipmId,
          })),
        ),
      });
    },
    [extractLinkedRowIds, listItemPriceRecords, removeItemPrice],
  );
  const deleteLinkedItemUnitConversions = useCallback(
    async (itemId: string) => {
      const rows = await listItemUnitConversionRecords(itemId);
      const itemUnitConversionIds = extractLinkedRowIds(rows, "iuc_id");
      if (itemUnitConversionIds.length === 0) {
        return;
      }
      await removeItemUnitConversion({
        body: itemUnitConversionIds.map((iucId) => ({
          iuc_id: iucId,
        })),
      });
    },
    [extractLinkedRowIds, listItemUnitConversionRecords, removeItemUnitConversion],
  );
  const deleteLinkedItemReorders = useCallback(
    async (itemId: string) => {
      const rows = await listItemReorderRecords(itemId);
      const itemReorderIds = extractLinkedRowIds(rows, "ir_id");
      if (itemReorderIds.length === 0) {
        return;
      }
      await removeItemReorder({
        body: itemReorderIds.map((irId) => ({
          ir_id: irId,
        })),
      });
    },
    [extractLinkedRowIds, listItemReorderRecords, removeItemReorder],
  );
  const deleteLinkedItemEanCodes = useCallback(
    async (itemId: string) => {
      const rows = await listItemEanCodeRecords(itemId);
      const itemEanCodeIds = extractLinkedRowIds(rows, "ean_id");
      if (itemEanCodeIds.length === 0) {
        return;
      }
      await removeItemEanCode({
        body: itemEanCodeIds.map((eanId) => ({
          ean_id: eanId,
        })),
      });
    },
    [extractLinkedRowIds, listItemEanCodeRecords, removeItemEanCode],
  );
  const syncLinkedItemUnitConversion = useCallback(
    async (itemId: string, values: Record<string, string>) => {
      const existingRows = await listItemUnitConversionRecords(itemId);
      const desiredRows = buildItemUnitConversionPayloadRows(itemId, values);
      const existingRowsById = new Map(
        existingRows
          .map((row) => [toDisplayValue(getFieldValue(row, "iuc_id")), row] as const)
          .filter(([iucId]) => Boolean(iucId)),
      );
      const desiredIds = new Set<string>();
      const deleteIds = new Set<string>();
      const updateRows: Record<string, unknown>[] = [];
      const createRows: Record<string, unknown>[] = [];

      for (const desiredRow of desiredRows) {
        const desiredId =
          typeof desiredRow.iuc_id === "string" ? desiredRow.iuc_id.trim() : "";
        if (!desiredId) {
          createRows.push(desiredRow);
          continue;
        }
        desiredIds.add(desiredId);
        const existingRow = existingRowsById.get(desiredId);
        if (shouldRecreateItemUnitConversionPayloadRow(existingRow, desiredRow)) {
          if (existingRow) {
            deleteIds.add(desiredId);
          }
          const { iuc_id: _ignoredId, ...createRow } = desiredRow;
          createRows.push(createRow);
          continue;
        }
        updateRows.push(desiredRow);
      }

      for (const existingId of extractLinkedRowIds(existingRows, "iuc_id")) {
        if (!desiredIds.has(existingId)) {
          deleteIds.add(existingId);
        }
      }

      if (deleteIds.size > 0) {
        await removeItemUnitConversion({
          body: Array.from(deleteIds).map((iucId) => ({
            iuc_id: iucId,
          })),
        });
      }
      if (updateRows.length === 0 && createRows.length === 0) {
        return;
      }
      if (updateRows.length > 0) {
        await upsertItemUnitConversion({
          body: updateRows,
        });
      }
      if (createRows.length > 0) {
        await upsertItemUnitConversion({
          body: createRows,
        });
      }
    },
    [
      buildItemUnitConversionPayloadRows,
      extractLinkedRowIds,
      listItemUnitConversionRecords,
      removeItemUnitConversion,
      upsertItemUnitConversion,
    ],
  );
  const syncLinkedItemPrice = useCallback(
    async (itemId: string, values: Record<string, string>) => {
      const existingRows = await listItemPriceRecords(itemId, values);
      const desiredRows = buildItemPricePayloadRows(itemId, values);
      const shouldSyncItemPriceRows =
        (values.item_price_list ?? "false") === "true" ||
        hasMeaningfulItemPriceRows(values);
      const desiredIds = new Set(
        desiredRows
          .map((row) => (typeof row.ipm_id === "string" ? row.ipm_id : ""))
          .filter(Boolean),
      );
      const deleteIds = extractLinkedRowIds(existingRows, "ipm_id").filter(
        (existingId) => !desiredIds.has(existingId),
      );
      if (deleteIds.length > 0) {
        await removeItemPrice({
          body: toSingleOrArrayPayload(
            deleteIds.map((ipmId) => ({
              ipm_id: ipmId,
            })),
          ),
        });
      }
      if (!shouldSyncItemPriceRows || desiredRows.length === 0) {
        return;
      }
      await upsertItemPrice({
        body: toSingleOrArrayPayload(desiredRows),
      });
    },
    [buildItemPricePayloadRows, extractLinkedRowIds, listItemPriceRecords, removeItemPrice, upsertItemPrice],
  );
  const syncLinkedItemReorder = useCallback(
    async (itemId: string, values: Record<string, string>) => {
      const existingRows = await listItemReorderRecords(itemId);
      const desiredRows = buildItemReorderPayloadRows(itemId, values);
      const desiredIds = new Set(
        desiredRows
          .map((row) => (typeof row.ir_id === "string" ? row.ir_id : ""))
          .filter(Boolean),
      );
      const deleteIds = extractLinkedRowIds(existingRows, "ir_id").filter(
        (existingId) => !desiredIds.has(existingId),
      );
      if (deleteIds.length > 0) {
        await removeItemReorder({
          body: deleteIds.map((irId) => ({
            ir_id: irId,
          })),
        });
      }
      if (desiredRows.length === 0) {
        return;
      }
      await upsertItemReorder({
        body: desiredRows,
      });
    },
    [buildItemReorderPayloadRows, extractLinkedRowIds, listItemReorderRecords, removeItemReorder, upsertItemReorder],
  );
  const syncLinkedItemEanCode = useCallback(
    async (itemId: string, values: Record<string, string>) => {
      const existingRows = await listItemEanCodeRecords(itemId);
      const desiredRows = buildItemEanPayloadRows(itemId, values);
      const desiredIds = new Set(
        desiredRows
          .map((row) => (typeof row.ean_id === "string" ? row.ean_id : ""))
          .filter(Boolean),
      );
      const deleteIds = extractLinkedRowIds(existingRows, "ean_id").filter(
        (existingId) => !desiredIds.has(existingId),
      );
      if (deleteIds.length > 0) {
        await removeItemEanCode({
          body: deleteIds.map((eanId) => ({
            ean_id: eanId,
          })),
        });
      }
      if (desiredRows.length === 0) {
        return;
      }
      await upsertItemEanCode({
        body: desiredRows,
      });
    },
    [buildItemEanPayloadRows, extractLinkedRowIds, listItemEanCodeRecords, removeItemEanCode, upsertItemEanCode],
  );
  const augmentItemDetailSource = useCallback(
    async ({
      recordId,
      source,
      rowSource,
    }: {
      recordId: string | number;
      source: Record<string, unknown> | null;
      rowSource: Record<string, unknown> | null;
    }) => {
      const itemSource = source ?? rowSource ?? {};
      const itemId =
        toDisplayValue(getFieldValue(itemSource, "item_id")) || String(recordId);
      if (!itemId) {
        return null;
      }
      const preferredUnitId = toDisplayValue(
        getFieldValue(itemSource, "item_base_unit_id"),
      );
      const [itemUnitConversionRows, priceRows, reorderRows, eanRows] = await Promise.all([
        listItemUnitConversionRecords(itemId),
        listItemPriceRecords(itemId, itemSource),
        listItemReorderRecords(itemId),
        listItemEanCodeRecords(itemId),
      ]);
      const managedPriceRow = selectManagedItemPriceRecord(priceRows, preferredUnitId);
      const managedReorderRow = selectManagedItemReorderRecord(
        reorderRows,
        preferredUnitId,
      );
      const managedEanRow = selectManagedItemEanCodeRecord(eanRows, preferredUnitId);
      const serializedItemUnitConversionRows = syncSerializedItemUnitConversionRows(
        serializeLinkedRecordRows(
          itemUnitConversionRows.map((row) =>
            mapSourceToLinkedRow(
              row,
              ITEM_UNIT_CONVERSION_ROW_TEXT_FIELD_NAMES,
              ITEM_UNIT_CONVERSION_ROW_BOOLEAN_FIELD_NAMES,
              buildEmptyItemUnitConversionRow(preferredUnitId, 2),
            ),
          ),
        ),
        {
          item_base_unit_id: preferredUnitId,
        },
      );
      const itemPriceSyncValues: Record<string, string> = {
        item_default_tax_id:
          toDisplayValue(getFieldValue(itemSource, "item_default_tax_id")),
        item_base_unit_id: preferredUnitId,
        [ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME]: serializedItemUnitConversionRows,
        [ITEM_PRICE_ROWS_FIELD_NAME]: "",
      };
      const serializedPriceRows = syncSerializedItemPriceRows(
        serializeLinkedRecordRows(
          priceRows.map((row) =>
            mapSourceToLinkedRow(
              row,
              ITEM_PRICE_TEXT_FIELD_NAMES,
              ITEM_PRICE_BOOLEAN_FIELD_NAMES,
              buildEmptyItemPriceRow(preferredUnitId),
            ),
          ),
        ),
        itemPriceSyncValues,
        itemTaxRecordsById,
      );
      const serializedReorderRows = serializeLinkedRecordRows(
        reorderRows.map((row) =>
          mapSourceToLinkedRow(
            row,
            ITEM_REORDER_ROW_TEXT_FIELD_NAMES,
            ITEM_REORDER_ROW_BOOLEAN_FIELD_NAMES,
            buildEmptyItemReorderRow(preferredUnitId),
          ),
        ),
      );
      const serializedEanRows = serializeLinkedRecordRows(
        eanRows.map((row) =>
          mapSourceToLinkedRow(
            row,
            ITEM_EAN_ROW_TEXT_FIELD_NAMES,
            ITEM_EAN_ROW_BOOLEAN_FIELD_NAMES,
            buildEmptyItemEanRow(preferredUnitId, preferredUnitId),
          ),
        ),
      );
      if (
        !managedPriceRow &&
        !managedReorderRow &&
        !managedEanRow &&
        !serializedItemUnitConversionRows &&
        !serializedPriceRows &&
        !serializedReorderRows &&
        !serializedEanRows
      ) {
        return null;
      }
      return {
        ...(managedPriceRow ?? {}),
        ...(managedReorderRow ?? {}),
        ...(managedEanRow ?? {}),
        [ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME]: serializedItemUnitConversionRows,
        [ITEM_PRICE_ROWS_FIELD_NAME]: serializedPriceRows,
        [ITEM_REORDER_ROWS_FIELD_NAME]: serializedReorderRows,
        [ITEM_EAN_ROWS_FIELD_NAME]: serializedEanRows,
        item_price_list: priceRows.length > 0 ? "true" : getFieldValue(itemSource, "item_price_list"),
      };
    },
    [
      itemTaxRecordsById,
      listItemUnitConversionRecords,
      listItemEanCodeRecords,
      listItemPriceRecords,
      listItemReorderRecords,
    ],
  );
  const itemFormFields = useMemo(
    () =>
      buildItemFormFields(
        companyOptions,
        branchOptions,
        groupOptions,
        categoryOptions,
        brandOptions,
        sectionOptions,
        unitOptions,
        godownOptions,
        taxOptions,
        itemTaxRecordsById,
        hsnOptions,
        supplierOptions,
        customerGroupOptions,
        itemOptions,
        itemPriceTableColumnsConfig,
        itemReorderTableColumnsConfig,
        itemEanTableColumnsConfig,
        itemWidgetConfigRecords,
        handleItemGroupSearchChange,
      ),
    [
      brandOptions,
      branchOptions,
      categoryOptions,
      companyOptions,
      customerGroupOptions,
      godownOptions,
      groupOptions,
      hsnOptions,
      itemOptions,
      itemEanTableColumnsConfig,
      itemTaxRecordsById,
      itemWidgetConfigRecords,
      itemPriceTableColumnsConfig,
      itemReorderTableColumnsConfig,
      handleItemGroupSearchChange,
      sectionOptions,
      supplierOptions,
      taxOptions,
      unitOptions,
    ],
  );
  return (
    <CrudMasterPage
      title="Item"
      entityLabel="item"
      entityLabelPlural="items"
      auditHistory={{ screenName: "Item Master" }}
      apiEndpoints={API_ENDPOINTS}
      gridTableName={GRID_TABLE_NAME}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Item List"
      createLabel="Add Item"
      codeColumnHeader="Item Code"
      nameColumnHeader="Item Name"
      nameFieldLabel="Item Name"
      nameFieldPlaceholder="Sugar 1kg"
      formTitle="Item Form"
      formDescription="Create and update items."
      customFields={itemFormFields}
      createInitialValues={ITEM_INITIAL_FORM_VALUES}
      modalPanelStyle={ITEM_MODAL_PANEL_STYLE}
      modalFormGridColumns={3}
      modalStackLabels
      modalSectionNavigationMode="tabs"
      modalHideFieldHelperText
      modalFocusFirstInvalidFieldOnValidationError
      modalEnableArrowKeyFieldNavigation
      hideListPage={inlineModalOnly}
      augmentDetailSource={({ recordId, source, rowSource }) =>
        augmentItemDetailSource({
          recordId,
          source,
          rowSource,
        })
      }
      mapFormValues={({ source, defaults }) =>
        mapItemFormValues(source, defaults, itemTaxRecordsById)
      }
      buildRequestPayload={(params) => buildItemRequestPayload(params)}
      onCrudControllerReady={onCrudControllerReady}
      onModalOpenChange={onModalOpenChange}
      afterSubmitSuccess={async ({ response, payload, values, editingItemId, shouldUpdate }) => {
        const responseSource = extractResponseRecord(response);
        const savedItemId =
          toDisplayValue(getFieldValue(responseSource ?? {}, "item_id")) ||
          toDisplayValue(payload.item_id) ||
          (editingItemId !== null ? String(editingItemId) : "");
        if (!savedItemId) {
          return;
        }
        const normalizedValues = normalizeItemLinkedSubmissionValues(
          values,
          itemTaxRecordsById,
        );
        await syncLinkedItemUnitConversion(savedItemId, normalizedValues);
        await Promise.all([
          syncLinkedItemPrice(savedItemId, normalizedValues),
          syncLinkedItemReorder(savedItemId, normalizedValues),
          syncLinkedItemEanCode(savedItemId, normalizedValues),
        ]);
        await onItemSaved?.({
          itemId: savedItemId,
          shouldUpdate,
          values,
        });
      }}
      afterDeleteSuccess={async ({ deleteId, rowSource }) => {
        const deletedItemId =
          toDisplayValue(getFieldValue(rowSource ?? {}, "item_id")) ||
          String(deleteId);
        if (!deletedItemId) {
          return;
        }
        await Promise.all([
          deleteLinkedItemUnitConversions(deletedItemId),
          deleteLinkedItemPrices(deletedItemId),
          deleteLinkedItemReorders(deletedItemId),
          deleteLinkedItemEanCodes(deletedItemId),
        ]);
      }}
    />
  );
}
