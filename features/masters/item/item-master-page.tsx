"use client";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
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
const ITEM_TAX_MASTER_LIST_ENDPOINT = "/item-taxes/list";
const ITEM_PRICE_QUERY_LIMIT = "100";
const ITEM_REORDER_QUERY_LIMIT = "100";
const ITEM_EAN_CODE_QUERY_LIMIT = "100";
const UI_TABLE_COLUMNS_QUERY_LIMIT = "100";
const ITEM_GROUP_SEARCH_DEBOUNCE_MS = 250;
const ITEM_REORDER_TABLE_UI_ID = "2";
const ITEM_PRICE_TABLE_UI_ID = "3";
const ITEM_EAN_TABLE_UI_ID = "4";
const UUID_PATTERN = "^[0-9a-fA-F-]{36}$";
const ITEM_PRICE_ROWS_FIELD_NAME = "item_price_rows_json";
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
const BATCH_CONFIG_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "0", label: "None" },
  { value: "1", label: "MRP & Selling Wise" },
  { value: "2", label: "Batch Wise" },
];
const ITEM_PRICE_DEFAULT_PROFIT_TYPE = "BY %";
const ITEM_PRICE_PROFIT_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "BY %", label: "BY %" },
  { value: "BY RS", label: "BY RS" },
  { value: "BY USER", label: "BY USER" },
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
    marginFieldName: "ipm_price_a_margin",
    saleFieldName: "ipm_sales_price_a",
    saleWotFieldName: "ipm_price_a_wot",
  },
  {
    marginFieldName: "ipm_price_b_margin",
    saleFieldName: "ipm_sales_price_b",
    saleWotFieldName: "ipm_price_b_wot",
  },
  {
    marginFieldName: "ipm_price_c_margin",
    saleFieldName: "ipm_sales_price_c",
    saleWotFieldName: "ipm_price_c_wot",
  },
  {
    marginFieldName: "ipm_price_d_margin",
    saleFieldName: "ipm_sales_price_d",
    saleWotFieldName: "ipm_price_d_wot",
  },
] as const;
const ITEM_PRICE_TABLE_COLUMN_NAME_TO_KEY = {
  unit: "ipm_unit_id",
  godown: "ipm_godown_id",
  costwot: "ipm_cost_wot",
  cost: "ipm_cost_price",
  profittype: "ipm_profit_type",
  roundoff: "ipm_round_off",
  amargin: "ipm_price_a_margin",
  salea: "ipm_sales_price_a",
  bmargin: "ipm_price_b_margin",
  saleb: "ipm_sales_price_b",
  cmargin: "ipm_price_c_margin",
  salec: "ipm_sales_price_c",
  dmargin: "ipm_price_d_margin",
  saled: "ipm_sales_price_d",
  max: "ipm_max_price",
  min: "ipm_min_price",
  disc: "ipm_disc_perc",
  discqty: "ipm_disc_qty",
  conv: "ipm_conversion_factor",
  conversionfactor: "ipm_conversion_factor",
  cess: "ipm_addl_cess",
  weight: "ipm_uom_weight",
  loading: "ipm_loading_charge",
  freight: "ipm_freight_charge",
  bigunit: "ipm_big_unit",
  remarks: "ipm_remarks",
  points: "ipm_points",
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
  ipm_unit_rate_id: "",
  ipm_unit_id: "",
  ipm_godown_id: "",
  ipm_unit_slno: "",
  ipm_conversion_factor: "1",
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
  ipm_price_a_margin: "",
  ipm_price_b_margin: "",
  ipm_price_c_margin: "",
  ipm_price_d_margin: "",
  ipm_max_price: "",
  ipm_min_price: "",
  ipm_disc_perc: "",
  ipm_disc_qty: "",
  ipm_addl_cess: "",
  ipm_profit_type: "",
  ipm_round_off: "",
  ipm_big_unit: "false",
  ipm_uom_weight: "",
  ipm_loading_charge: "",
  ipm_freight_charge: "",
  ipm_points: "",
  ipm_remarks: "",
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
  maxHeight: "80vh",
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
  "ipm_unit_rate_id",
  "ipm_unit_id",
  "ipm_godown_id",
  "ipm_unit_slno",
  "ipm_conversion_factor",
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
  "ipm_price_a_margin",
  "ipm_price_b_margin",
  "ipm_price_c_margin",
  "ipm_price_d_margin",
  "ipm_max_price",
  "ipm_min_price",
  "ipm_disc_perc",
  "ipm_disc_qty",
  "ipm_addl_cess",
  "ipm_profit_type",
  "ipm_round_off",
  "ipm_uom_weight",
  "ipm_loading_charge",
  "ipm_freight_charge",
  "ipm_points",
  "ipm_remarks",
] as const;
const ITEM_PRICE_BOOLEAN_FIELD_NAMES = ["ipm_big_unit", "ipm_is_active"] as const;
const ITEM_PRICE_SYNC_FIELD_NAMES = [
  ...ITEM_PRICE_TEXT_FIELD_NAMES,
  ...ITEM_PRICE_BOOLEAN_FIELD_NAMES,
  ITEM_PRICE_ROWS_FIELD_NAME,
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
  (fieldName) =>
    fieldName !== "ipm_unit_rate_id" &&
    fieldName !== "ipm_unit_id" &&
    fieldName !== "ipm_godown_id" &&
    fieldName !== "ipm_profit_type",
);
const ITEM_REORDER_CONTENT_FIELD_NAMES = [
  "ir_min_level",
  "ir_max_level",
  "ir_reorder_level",
  "ir_reorder_qty",
  "ir_reorder_type",
] as const;
const ITEM_EAN_CONTENT_FIELD_NAMES = ["ean_code", "ean_godown_id", "ean_remarks"] as const;
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
  return normalized || ITEM_PRICE_DEFAULT_PROFIT_TYPE;
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
  if (normalizedProfitType !== "BY USER") {
    const costPriceValue = parseOptionalItemPriceNumber(nextRow.ipm_cost_price);
    for (const { marginFieldName, saleFieldName } of ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS) {
      const marginValue = parseOptionalItemPriceNumber(nextRow[marginFieldName]) ?? 0;
      const nextSaleValue =
        costPriceValue === null
          ? null
          : roundDerivedItemPriceValue(
            normalizedProfitType === "BY RS"
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
  if (normalizedProfitType === "BY USER") {
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
        : normalizedProfitType === "BY RS"
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
      nextRows[index + 1]?.ipm_conversion_factor,
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
      nextRows[index]?.ipm_conversion_factor,
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
      nextRows[index + 1]?.ipm_conversion_factor,
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
      nextRows[index]?.ipm_conversion_factor,
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
      nextRows[index]?.ipm_conversion_factor,
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
    if ((row.ipm_profit_type ?? "") === normalizedProfitType) {
      return row;
    }
    hasChanges = true;
    return {
      ...row,
      ipm_profit_type: normalizedProfitType,
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
function buildEmptyItemPriceRow(baseUnitId: string): LinkedRecordRow {
  return {
    ...ITEM_PRICE_INITIAL_FORM_VALUES,
    ipm_unit_rate_id: "",
    ipm_unit_id: baseUnitId.trim(),
    ipm_profit_type: ITEM_PRICE_DEFAULT_PROFIT_TYPE,
    ipm_is_active: ITEM_PRICE_INITIAL_FORM_VALUES.ipm_is_active,
  };
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
  const previousRows = parseLinkedRecordRows(values[ITEM_PRICE_ROWS_FIELD_NAME] ?? "");
  const taxContext = resolveItemPriceTaxContext(values, itemTaxRecordsById);
  const changedField = detectChangedItemPriceField(previousRows, rows);
  let nextRows = rows;
  if (forceRecalculateAll) {
    nextRows = recalculateAllItemPriceRowsForTaxContext(rows, taxContext);
  } else if (!changedField) {
    nextRows = normalizeItemPriceRows(rows);
  } else if (changedField.fieldName === "ipm_cost_wot") {
    nextRows = recalculateItemPriceRowsFromCostWot(rows, changedField.rowIndex, taxContext);
  } else if (changedField.fieldName === "ipm_cost_price") {
    nextRows = recalculateItemPriceRowsFromCostPrice(rows, changedField.rowIndex, taxContext);
  } else if (changedField.fieldName === "ipm_conversion_factor") {
    nextRows = recalculateItemPriceRowsFromConversion(rows, changedField.rowIndex, taxContext);
  } else if (
    changedField.fieldName === "ipm_profit_type" ||
    changedField.fieldName === "ipm_round_off" ||
    ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS.some(
      ({ marginFieldName }) => marginFieldName === changedField.fieldName,
    )
  ) {
    const recalculatedRows = cloneItemPriceRows(rows);
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
    const recalculatedRows = cloneItemPriceRows(rows);
    recalculatedRows[changedField.rowIndex] = syncItemPriceRowFromSaleInputs(
      recalculatedRows[changedField.rowIndex] ?? {},
      taxContext,
    );
    nextRows = recalculatedRows;
  } else {
    nextRows = normalizeItemPriceRows(rows);
  }

  return nextRows === rows ? serializedRows : serializeLinkedRecordRows(nextRows);
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
function buildItemEanUnitOptions(
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
  addUnitId(values.ipm_unit_id);
  addUnitId(values.ean_unit_id);
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
function selectManagedItemPriceLinkedRow(
  rows: LinkedRecordRow[],
  values: Record<string, string>,
): LinkedRecordRow | null {
  const currentPriceRowId = (values.ipm_unit_rate_id ?? "").trim();
  if (currentPriceRowId) {
    const matchingRow = rows.find(
      (row) => (row.ipm_unit_rate_id ?? "").trim() === currentPriceRowId,
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
    [ITEM_PRICE_ROWS_FIELD_NAME]:
      previousValues[ITEM_PRICE_ROWS_FIELD_NAME] ??
      values[ITEM_PRICE_ROWS_FIELD_NAME] ??
      "",
  };
  const normalizedRows = syncSerializedItemPriceRows(
    serializedRows,
    comparisonValues,
    itemTaxRecordsById,
  );
  const nextValues = syncPrimaryItemPriceValuesFromRows(values, normalizedRows);
  const changedValues = collectChangedFieldValues(
    values,
    nextValues,
    ITEM_PRICE_SYNC_FIELD_NAMES,
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
  if ((values.item_price_list ?? "false") !== "true") {
    return null;
  }
  const rows = buildManagedItemPriceRows(values);
  if (rows.length === 0) {
    return "Add at least one price row when Price List is enabled.";
  }
  const baseUnitId = (values.item_base_unit_id ?? "").trim();
  const usedUnitIds = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const unitId = (row.ipm_unit_id ?? "").trim() || baseUnitId;
    if (!unitId) {
      return `Price row ${index + 1}: Unit is required.`;
    }
    if (usedUnitIds.has(unitId)) {
      return `Price row ${index + 1}: Unit is already used in another price row.`;
    }
    usedUnitIds.add(unitId);
    const profitType = (row.ipm_profit_type ?? "").trim();
    if (!profitType) {
      return `Price row ${index + 1}: Profit Type is required.`;
    }
  }
  return null;
}
function validateItemReorderRows(value: string, values: Record<string, string>): string | null {
  const rows = buildManagedItemReorderRows(values);
  if (rows.length === 0) {
    return null;
  }
  const baseUnitId = (values.item_base_unit_id ?? "").trim();
  for (const [index, row] of rows.entries()) {
    const unitId = (row.ir_unit_id ?? "").trim() || baseUnitId;
    if (!unitId) {
      return `Reorder row ${index + 1}: Unit is required.`;
    }
    const reorderType = (row.ir_reorder_type ?? "").trim();
    if (!reorderType) {
      return `Reorder row ${index + 1}: Reorder Type is required.`;
    }
  }
  return null;
}
function validateItemEanRows(value: string, values: Record<string, string>): string | null {
  const rows = buildManagedItemEanRows(values);
  if (rows.length === 0) {
    return null;
  }
  const baseUnitId = (values.item_base_unit_id ?? "").trim();
  for (const [index, row] of rows.entries()) {
    const unitId = (row.ean_unit_id ?? "").trim() || baseUnitId;
    if (!unitId) {
      return `EAN row ${index + 1}: Unit is required.`;
    }
    const eanCode = (row.ean_code ?? "").trim();
    if (!eanCode) {
      return `EAN row ${index + 1}: EAN Code is required.`;
    }
  }
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
function buildManagedItemPriceRows(values: Record<string, string>): LinkedRecordRow[] {
  return parseLinkedRecordRows(values[ITEM_PRICE_ROWS_FIELD_NAME] ?? "").filter((row) =>
    hasLinkedRowContent(row, ITEM_PRICE_CONTENT_FIELD_NAMES),
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
  if (!(nextValues.ipm_unit_id ?? "").trim()) {
    nextValues.ipm_unit_id = baseUnitId;
  }
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
function moveLinkedColumnBefore(
  columns: LinkedRecordColumn[],
  columnKey: string,
  beforeColumnKey: string,
): LinkedRecordColumn[] {
  const sourceIndex = columns.findIndex((column) => column.key === columnKey);
  const targetIndex = columns.findIndex(
    (column) => column.key === beforeColumnKey,
  );
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return columns;
  }
  const nextColumns = [...columns];
  const [movedColumn] = nextColumns.splice(sourceIndex, 1);
  if (!movedColumn) {
    return columns;
  }
  const nextTargetIndex = nextColumns.findIndex(
    (column) => column.key === beforeColumnKey,
  );
  nextColumns.splice(nextTargetIndex < 0 ? nextColumns.length : nextTargetIndex, 0, movedColumn);
  return nextColumns;
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
  onItemGroupSearchChange?: ERPDynamicSearchQueryChangeHandler,
): ERPDynamicModalField[] {
  const basePriceRowColumns: LinkedRecordColumn[] = [
    {
      key: "ipm_unit_id",
      label: "Unit",
      type: "select",
      searchable: true,
      options: unitOptions,
      optionsResolver: ({ rowIndex, rows }) =>
        buildItemPriceUnitOptions(rows, unitOptions, rowIndex),
      width: "10rem",
    },
    {
      key: "ipm_godown_id",
      label: "Godown",
      type: "select",
      searchable: true,
      options: godownOptions,
      placeholder: "Global Price",
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
    { key: "ipm_price_a_margin", label: "A Margin", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_sales_price_a", label: "Sale A", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_price_b_margin", label: "B Margin", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_sales_price_b", label: "Sale B", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_price_c_margin", label: "C Margin", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_sales_price_c", label: "Sale C", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_price_d_margin", label: "D Margin", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_sales_price_d", label: "Sale D", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_max_price", label: "Max", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_min_price", label: "Min", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_disc_perc", label: "Disc %", type: "number", min: 0, step: "0.001", width: "7rem" },
    { key: "ipm_disc_qty", label: "Disc Qty", type: "number", min: 0, step: "0.0001", width: "7rem" },
    {
      key: "ipm_conversion_factor",
      label: "Conv",
      type: "number",
      min: 0,
      step: "0.0001",
      width: "7rem",
      readOnlyResolver: ({ rowIndex }) => rowIndex === 0,
    },
    { key: "ipm_addl_cess", label: "Cess", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_uom_weight", label: "Weight", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_loading_charge", label: "Loading", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_freight_charge", label: "Freight", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_big_unit", label: "Big Unit", type: "checkbox", width: "6rem" },
    { key: "ipm_remarks", label: "Remarks", width: "12rem" },
    { key: "ipm_points", label: "Points", type: "number", min: 0, step: "1", width: "6rem" },
  ];
  const priceRowColumns = removeDefaultLinkedColumnPlaceholders(
    moveLinkedColumnBefore(
      applyConfiguredLinkedTableColumnConfig(
        basePriceRowColumns,
        itemPriceTableColumnsConfig,
        ITEM_PRICE_TABLE_COLUMN_NAME_TO_KEY,
      ),
      "ipm_conversion_factor",
      "ipm_unit_id",
    ),
  );
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
  return removeDefaultSelectPlaceholders(
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
          minLength: 2,
          maxLength: 200,
          minLengthMessage: "Item Name must be at least 2 characters.",
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
        name: "item_branch_id",
        label: "Branch",
        type: "select",
        searchable: true,
        options: branchOptions,
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
        name: "item_company_id",
        label: "Company",
        type: "select",
        searchable: true,
        required: true,
        options: companyOptions,
        validation: {
          requiredMessage: "Company is required.",
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
      buildUuidTextField("item_company_category_id", "Company Category Id"),
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
        name: "item_hsn_code",
        label: "HSN Code",
        type: "select",
        searchable: true,
        options: hsnOptions,
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
        name: "itemHeadingLinks",
        label: "Reference Links",
        type: "heading",
      },
      {
        name: "item_group_id",
        label: "Item Group",
        type: "select",
        searchable: true,
        options: groupOptions,
        onSearchQueryChange: onItemGroupSearchChange,
      },
      {
        name: "item_section_id",
        label: "Item Section",
        type: "select",
        searchable: true,
        options: sectionOptions,
      },
      {
        name: "item_base_unit_id",
        label: "Base Unit",
        type: "select",
        searchable: true,
        required: true,
        options: unitOptions,
        onValueChange: ({ value, values, previousValues }) => {
          const currentPriceUnitId = (values.ipm_unit_id ?? "").trim();
          const currentReorderUnitId = (values.ir_unit_id ?? "").trim();
          const currentEanUnitId = (values.ean_unit_id ?? "").trim();
          const previousBaseUnitId = (previousValues.item_base_unit_id ?? "").trim();
          if (!value.trim()) {
            return;
          }
          const nextValues = { ...values };
          let hasChanges = false;
          if (!currentPriceUnitId || currentPriceUnitId === previousBaseUnitId) {
            nextValues.ipm_unit_id = value;
            hasChanges = true;
          }
          if (!currentReorderUnitId || currentReorderUnitId === previousBaseUnitId) {
            nextValues.ir_unit_id = value;
            hasChanges = true;
          }
          if (!currentEanUnitId || currentEanUnitId === previousBaseUnitId) {
            nextValues.ean_unit_id = value;
            hasChanges = true;
          }
          const nextPriceRows = syncSerializedRowUnitIds(
            values[ITEM_PRICE_ROWS_FIELD_NAME] ?? "",
            "ipm_unit_id",
            value,
            previousBaseUnitId,
          );
          if (nextPriceRows !== null) {
            nextValues[ITEM_PRICE_ROWS_FIELD_NAME] = nextPriceRows;
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
          if (hasChanges) {
            return {
              values: nextValues,
            };
          }
        },
        validation: {
          requiredMessage: "Base Unit is required.",
        },
      },
      {
        name: "item_brand_id",
        label: "Item Brand",
        type: "select",
        searchable: true,
        options: brandOptions,
      },
      {
        name: "item_supplier_id",
        label: "Default Supplier",
        type: "select",
        searchable: true,
        options: supplierOptions,
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
        name: "item_category_id",
        label: "Item Category",
        type: "select",
        searchable: true,
        options: categoryOptions,
      },
      {
        name: "item_cust_group",
        label: "Item Customer Group",
        type: "select",
        searchable: true,
        options: customerGroupOptions,
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
        name: "itemHeadingPriceTable",
        label: "Price List Table",
        type: "heading",
        defaultExpanded: true,
        sectionGridColumns: 5,
      },
      {
        name: ITEM_PRICE_ROWS_FIELD_NAME,
        label: "",
        type: "custom",
        fieldStyle: {
          gridColumn: "1 / -1",
        },
        helperText:
          "Add and edit price rows here. Keep Price List checked in Rules & Status to save these rows.",
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
        render: buildCustomFieldEditor(
          priceRowColumns,
          (values) => buildEmptyItemPriceRow((values.item_base_unit_id ?? "").trim()),
          "+",
          "No price rows added.",
          {
            autoCreateFirstRowOnMount: true,
            autoFocusInitialRowOnMount: false,
          },
        ),
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
            values: applyItemPriceDefaults(values),
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
    toDisplayValue(getFieldValue(rowSource, "item_batch_config")) ||
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
  if (shouldShowItemPriceSection(mappedValues)) {
    Object.assign(mappedValues, applyItemPriceDefaults(mappedValues));
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
    item_price_list: (values.item_price_list ?? "false") === "true",
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
    item_batch_config: toNonNegativeInteger(values.item_batch_config ?? "0", 0),
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
export default function ItemMasterPageContent() {
  const { getAll: getSupplierLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getCustomerGroupLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getItemLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getTaxLookup } = useApi<unknown>(TAX_LOOKUP_ENDPOINT);
  const { getAll: listItemTaxes } = useApi<unknown>(ITEM_TAX_MASTER_LIST_ENDPOINT);
  const { getAll: getItemPriceTableColumns } = useApi<unknown>(UI_TABLE_COLUMNS_ENDPOINT);
  const { getAll: getItemReorderTableColumns } = useApi<unknown>(UI_TABLE_COLUMNS_ENDPOINT);
  const { getAll: getItemEanTableColumns } = useApi<unknown>(UI_TABLE_COLUMNS_ENDPOINT);
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
    getItemLookup,
    getItemPriceTableColumns,
    getItemReorderTableColumns,
    getSectionLookup,
    getSupplierLookup,
    getTaxLookup,
    getUnitLookup,
    listItemTaxes,
  ]);
  const listItemPriceRecords = useCallback(
    async (itemId: string) => {
      const payload = await listItemPrices({
        ipm_item_id: itemId,
        limit: ITEM_PRICE_QUERY_LIMIT,
      });
      return extractArrayRecords(payload, DEFAULT_LOOKUP_ARRAY_KEYS);
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
  const buildItemPricePayloadRows = useCallback(
    (itemId: string, values: Record<string, string>) => {
      const baseUnitId = (values.item_base_unit_id ?? "").trim();
      return buildManagedItemPriceRows(values).map((row) => {
        const payload: Record<string, unknown> = {
          ipm_item_id: itemId,
          ipm_unit_id: (row.ipm_unit_id ?? "").trim() || baseUnitId,
          ipm_godown_id: toNullableString(row.ipm_godown_id ?? ""),
          ipm_profit_type:
            (row.ipm_profit_type ?? "").trim() || ITEM_PRICE_DEFAULT_PROFIT_TYPE,
          ipm_unit_slno: toOptionalNonNegativeInteger(row.ipm_unit_slno ?? ""),
          ipm_conversion_factor: toOptionalNonNegativeNumber(
            (row.ipm_conversion_factor ?? "").trim() || "1",
          ),
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
          ipm_price_a_margin: toOptionalNonNegativeNumber(
            row.ipm_price_a_margin ?? "",
          ),
          ipm_price_b_margin: toOptionalNonNegativeNumber(
            row.ipm_price_b_margin ?? "",
          ),
          ipm_price_c_margin: toOptionalNonNegativeNumber(
            row.ipm_price_c_margin ?? "",
          ),
          ipm_price_d_margin: toOptionalNonNegativeNumber(
            row.ipm_price_d_margin ?? "",
          ),
          ipm_min_price: toOptionalNonNegativeNumber(row.ipm_min_price ?? ""),
          ipm_max_price: toOptionalNonNegativeNumber(row.ipm_max_price ?? ""),
          ipm_disc_perc: toOptionalNonNegativeNumber(row.ipm_disc_perc ?? ""),
          ipm_disc_qty: toOptionalNonNegativeNumber(row.ipm_disc_qty ?? ""),
          ipm_addl_cess: toOptionalNonNegativeNumber(row.ipm_addl_cess ?? ""),
          ipm_round_off: toOptionalNonNegativeNumber(row.ipm_round_off ?? ""),
          ipm_big_unit: (row.ipm_big_unit ?? "false") === "true",
          ipm_uom_weight: toOptionalNonNegativeNumber(row.ipm_uom_weight ?? ""),
          ipm_loading_charge: toOptionalNonNegativeNumber(
            row.ipm_loading_charge ?? "",
          ),
          ipm_freight_charge: toOptionalNonNegativeNumber(
            row.ipm_freight_charge ?? "",
          ),
          ipm_points: toOptionalNonNegativeInteger(
            (row.ipm_points ?? "").trim() || "0",
          ),
          ipm_remarks: toNullableString(row.ipm_remarks ?? ""),
          ipm_is_active: (row.ipm_is_active ?? "true") === "true",
        };

        const itemPriceId = toTrimmedOrUndefined(row.ipm_unit_rate_id);
        if (itemPriceId) {
          payload.ipm_unit_rate_id = itemPriceId;
        }

        return payload;
      });
    },
    [],
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
      const itemPriceIds = extractLinkedRowIds(rows, "ipm_unit_rate_id");
      if (itemPriceIds.length === 0) {
        return;
      }
      await removeItemPrice({
        body: itemPriceIds.map((ipmUnitRateId) => ({
          ipm_unit_rate_id: ipmUnitRateId,
        })),
      });
    },
    [extractLinkedRowIds, listItemPriceRecords, removeItemPrice],
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
  const syncLinkedItemPrice = useCallback(
    async (itemId: string, values: Record<string, string>) => {
      const existingRows = await listItemPriceRecords(itemId);
      const desiredRows = buildItemPricePayloadRows(itemId, values);
      const desiredIds = new Set(
        desiredRows
          .map((row) =>
            typeof row.ipm_unit_rate_id === "string" ? row.ipm_unit_rate_id : "",
          )
          .filter(Boolean),
      );
      const deleteIds = extractLinkedRowIds(existingRows, "ipm_unit_rate_id").filter(
        (existingId) => !desiredIds.has(existingId),
      );
      if (deleteIds.length > 0) {
        await removeItemPrice({
          body: deleteIds.map((ipmUnitRateId) => ({
            ipm_unit_rate_id: ipmUnitRateId,
          })),
        });
      }
      if ((values.item_price_list ?? "false") !== "true" || desiredRows.length === 0) {
        return;
      }
      await upsertItemPrice({
        body: desiredRows,
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
      const [priceRows, reorderRows, eanRows] = await Promise.all([
        listItemPriceRecords(itemId),
        listItemReorderRecords(itemId),
        listItemEanCodeRecords(itemId),
      ]);
      const managedPriceRow = selectManagedItemPriceRecord(priceRows, preferredUnitId);
      const managedReorderRow = selectManagedItemReorderRecord(
        reorderRows,
        preferredUnitId,
      );
      const managedEanRow = selectManagedItemEanCodeRecord(eanRows, preferredUnitId);
      const itemPriceSyncValues: Record<string, string> = {
        item_default_tax_id:
          toDisplayValue(getFieldValue(itemSource, "item_default_tax_id")),
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
        [ITEM_PRICE_ROWS_FIELD_NAME]: serializedPriceRows,
        [ITEM_REORDER_ROWS_FIELD_NAME]: serializedReorderRows,
        [ITEM_EAN_ROWS_FIELD_NAME]: serializedEanRows,
        item_price_list: priceRows.length > 0 ? "true" : getFieldValue(itemSource, "item_price_list"),
      };
    },
    [
      itemTaxRecordsById,
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
      afterSubmitSuccess={async ({ response, payload, values, editingItemId }) => {
        const responseSource = extractResponseRecord(response);
        const savedItemId =
          toDisplayValue(getFieldValue(responseSource ?? {}, "item_id")) ||
          toDisplayValue(payload.item_id) ||
          (editingItemId !== null ? String(editingItemId) : "");
        if (!savedItemId) {
          return;
        }
        await Promise.all([
          syncLinkedItemPrice(savedItemId, values),
          syncLinkedItemReorder(savedItemId, values),
          syncLinkedItemEanCode(savedItemId, values),
        ]);
      }}
      afterDeleteSuccess={async ({ deleteId, rowSource }) => {
        const deletedItemId =
          toDisplayValue(getFieldValue(rowSource ?? {}, "item_id")) ||
          String(deleteId);
        if (!deletedItemId) {
          return;
        }
        await Promise.all([
          deleteLinkedItemPrices(deletedItemId),
          deleteLinkedItemReorders(deletedItemId),
          deleteLinkedItemEanCodes(deletedItemId),
        ]);
      }}
    />
  );
}
