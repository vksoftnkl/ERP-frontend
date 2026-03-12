"use client";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicCustomFieldRenderProps,
  ERPDynamicModalField,
  ERPDynamicSearchQueryChangeHandler,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  buildLookupOptions,
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
const COMPANY_LOOKUP_ENDPOINT = "/company-masters/list";
const BRANCH_LOOKUP_ENDPOINT = "/branch-masters/list";
const ITEM_GROUP_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const ITEM_CATEGORY_LOOKUP_ENDPOINT = "/item-categories/list";
const ITEM_BRAND_LOOKUP_ENDPOINT = "/item-brands/list";
const ITEM_SECTION_LOOKUP_ENDPOINT = "/item-sections/list";
const UNIT_LOOKUP_ENDPOINT = "/units/list";
const HSN_LOOKUP_ENDPOINT = "/hsn-code-masters/get";
const ITEM_PRICE_QUERY_LIMIT = "100";
const ITEM_REORDER_QUERY_LIMIT = "100";
const ITEM_EAN_CODE_QUERY_LIMIT = "100";
const ITEM_GROUP_SEARCH_DEBOUNCE_MS = 250;
const UUID_PATTERN = "^[0-9a-fA-F-]{36}$";
const ITEM_PRICE_ROWS_FIELD_NAME = "item_price_rows_json";
const ITEM_REORDER_ROWS_FIELD_NAME = "item_reorder_rows_json";
const ITEM_EAN_ROWS_FIELD_NAME = "item_ean_rows_json";
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
const ITEM_GROUP_LOOKUP_QUERY = {
  module: "itemGroups",
} as const;
const ITEM_CATEGORY_LOOKUP_QUERY = {
  page: "1",
  limit: "100",
  category_is_active: "true",
} as const;
const ITEM_BRAND_LOOKUP_QUERY = {
  page: "1",
  limit: "100",
  brand_is_active: "true",
} as const;
const ITEM_SECTION_LOOKUP_QUERY = {
  page: "1",
  limit: "100",
  sec_is_active: "true",
} as const;
const UNIT_LOOKUP_QUERY = {
  page: "1",
  limit: "100",
  unit_is_active: "true",
} as const;
const LOOKUP_QUERY_ITEM_TAXES = {
  module: "itemTaxes",
  limit: "50",
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
  activeOnly: "true",
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
const DEFAULT_TAX_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
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
const ITEM_REORDER_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "purchase", label: "Purchase" },
  { value: "production", label: "Production" },
  { value: "repack", label: "Repack" },
  { value: "transfer", label: "Transfer" },
];
const ITEM_PRICE_INITIAL_FORM_VALUES: Record<string, string> = {
  ipm_unit_rate_id: "",
  ipm_unit_id: "",
  ipm_unit_slno: "",
  ipm_conversion_factor: "",
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
  "ipm_remarks",
] as const;
const ITEM_PRICE_BOOLEAN_FIELD_NAMES = ["ipm_big_unit", "ipm_is_active"] as const;
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
  "ean_remarks",
] as const;
const ITEM_EAN_ROW_BOOLEAN_FIELD_NAMES = ["ean_is_default", "ean_is_active"] as const;
const ITEM_PRICE_CONTENT_FIELD_NAMES = ITEM_PRICE_TEXT_FIELD_NAMES.filter(
  (fieldName) =>
    fieldName !== "ipm_unit_rate_id" &&
    fieldName !== "ipm_unit_id" &&
    fieldName !== "ipm_profit_type",
);
const ITEM_REORDER_CONTENT_FIELD_NAMES = [
  "ir_min_level",
  "ir_max_level",
  "ir_reorder_level",
  "ir_reorder_qty",
  "ir_reorder_type",
] as const;
const ITEM_EAN_CONTENT_FIELD_NAMES = ["ean_code"] as const;
function toSnakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}
function getFieldValue(source: Record<string, unknown>, fieldName: string): unknown {
  return getFirstDefinedValue(source, [fieldName, toSnakeCase(fieldName)]);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function toOptionalNonNegativeInteger(value: string): number | undefined {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return Math.floor(parsed);
}
function toOptionalNonNegativeNumber(value: string): number | undefined {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
}
function toUpperNullable(value: string): string | null {
  const normalized = toUpper(value);
  return normalized ? normalized : null;
}
function extractArrayRecords(
  payload: unknown,
  arrayKeys: readonly string[],
): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (!isRecord(payload)) {
    return [];
  }
  for (const key of arrayKeys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
    if (isRecord(value)) {
      for (const nestedKey of arrayKeys) {
        const nestedValue = value[nestedKey];
        if (Array.isArray(nestedValue)) {
          return nestedValue.filter(isRecord);
        }
      }
    }
  }
  return [];
}
function extractResponseRecord(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) {
    return null;
  }
  return isRecord(payload.data) ? payload.data : payload;
}
function hasLinkedRows(value: string | undefined): boolean {
  return parseLinkedRecordRows(value ?? "").length > 0;
}
function toTrimmedOrUndefined(value: string | undefined): string | undefined {
  const normalized = value?.trim() ?? "";
  return normalized || undefined;
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
function buildEmptyItemReorderRow(baseUnitId: string): LinkedRecordRow {
  return {
    ...ITEM_REORDER_INITIAL_FORM_VALUES,
    ir_unit_id: baseUnitId.trim(),
  };
}
function buildEmptyItemEanRow(baseUnitId: string): LinkedRecordRow {
  return {
    ...ITEM_EAN_INITIAL_FORM_VALUES,
    ean_unit_id: baseUnitId.trim(),
  };
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
function mapValuesToLinkedRow(
  values: Record<string, string>,
  textFieldNames: readonly string[],
  booleanFieldNames: readonly string[],
  defaults: LinkedRecordRow,
): LinkedRecordRow {
  const row: LinkedRecordRow = {
    ...defaults,
  };

  for (const fieldName of textFieldNames) {
    row[fieldName] = values[fieldName] ?? defaults[fieldName] ?? "";
  }

  for (const fieldName of booleanFieldNames) {
    const value = values[fieldName];
    row[fieldName] =
      value !== undefined
        ? value === "true"
          ? "true"
          : "false"
        : defaults[fieldName] === "true"
          ? "true"
          : "false";
  }

  return row;
}
function hasLinkedRowContent(
  row: LinkedRecordRow,
  contentFieldNames: readonly string[],
): boolean {
  return contentFieldNames.some((fieldName) => (row[fieldName] ?? "").trim() !== "");
}
function upsertManagedLinkedRow(
  rows: LinkedRecordRow[],
  primaryRow: LinkedRecordRow,
  options: {
    contentFieldNames: readonly string[];
    idFieldName: string;
    matchFieldName?: string;
  },
): LinkedRecordRow[] {
  const primaryId = (primaryRow[options.idFieldName] ?? "").trim();
  const shouldMergePrimary =
    hasLinkedRowContent(primaryRow, options.contentFieldNames) || primaryId.length > 0;

  if (!shouldMergePrimary) {
    return rows;
  }
  const nextRows = [...rows];
  let targetIndex = -1;
  if (primaryId) {
    targetIndex = nextRows.findIndex(
      (row) => (row[options.idFieldName] ?? "").trim() === primaryId,
    );
  }
  if (targetIndex < 0 && options.matchFieldName) {
    const matchValue = (primaryRow[options.matchFieldName] ?? "").trim();
    if (matchValue) {
      targetIndex = nextRows.findIndex((row) => {
        const currentValue = (row[options.matchFieldName ?? ""] ?? "").trim();
        return currentValue === matchValue;
      });
    }
  }
  if (targetIndex < 0 && nextRows.length > 0) {
    targetIndex = 0;
  }
  if (targetIndex >= 0) {
    nextRows[targetIndex] = {
      ...nextRows[targetIndex],
      ...primaryRow,
    };
    return nextRows;
  }
  return [...nextRows, primaryRow];
}
function validateItemPriceRows(value: string, values: Record<string, string>): string | null {
  if ((values.item_price_list ?? "false") !== "true") {
    return null;
  }
  const rows = buildManagedItemPriceRows(values);
  if (rows.length === 0) {
    return "Add at least one price row or fill the price details when Price List is enabled.";
  }
  const baseUnitId = (values.item_base_unit_id ?? "").trim();
  for (const [index, row] of rows.entries()) {
    const unitId = (row.ipm_unit_id ?? "").trim() || baseUnitId;
    if (!unitId) {
      return `Price row ${index + 1}: Unit is required.`;
    }

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
  createRow: (values: Record<string, string>) => LinkedRecordRow,
  addLabel: string,
  emptyState: string,
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
        columns={columns}
        createRow={() => createRow(values)}
        disabled={disabled}
        emptyState={emptyState}
        onChange={setValue}
        value={value}
      />
    );
  };
}
function shouldShowItemPriceSection(values: Record<string, string>): boolean {
  if ((values.item_price_list ?? "false") === "true") {
    return true;
  }
  if (hasLinkedRows(values[ITEM_PRICE_ROWS_FIELD_NAME])) {
    return true;
  }
  if ((values.ipm_unit_rate_id ?? "").trim()) {
    return true;
  }
  return ITEM_PRICE_CONTENT_FIELD_NAMES.some(
    (fieldName) => (values[fieldName] ?? "").trim() !== "",
  );
}
function shouldShowItemReorderSection(values: Record<string, string>): boolean {
  if (hasLinkedRows(values[ITEM_REORDER_ROWS_FIELD_NAME])) {
    return true;
  }
  return ITEM_REORDER_CONTENT_FIELD_NAMES.some(
    (fieldName) => (values[fieldName] ?? "").trim() !== "",
  );
}
function hasItemEanContent(values: Record<string, string>): boolean {
  if (hasLinkedRows(values[ITEM_EAN_ROWS_FIELD_NAME])) {
    return true;
  }
  return ITEM_EAN_CONTENT_FIELD_NAMES.some(
    (fieldName) => (values[fieldName] ?? "").trim() !== "",
  );
}
function shouldShowItemEanSection(values: Record<string, string>): boolean {
  return hasItemEanContent(values);
}
function buildPrimaryItemPriceRow(values: Record<string, string>): LinkedRecordRow {
  return mapValuesToLinkedRow(
    values,
    ITEM_PRICE_TEXT_FIELD_NAMES,
    ITEM_PRICE_BOOLEAN_FIELD_NAMES,
    ITEM_PRICE_INITIAL_FORM_VALUES,
  );
}
function buildPrimaryItemEanRow(values: Record<string, string>): LinkedRecordRow {
  return mapValuesToLinkedRow(
    values,
    ITEM_EAN_ROW_TEXT_FIELD_NAMES,
    ITEM_EAN_ROW_BOOLEAN_FIELD_NAMES,
    ITEM_EAN_INITIAL_FORM_VALUES,
  );
}
function buildManagedItemPriceRows(values: Record<string, string>): LinkedRecordRow[] {
  return upsertManagedLinkedRow(
    parseLinkedRecordRows(values[ITEM_PRICE_ROWS_FIELD_NAME] ?? ""),
    buildPrimaryItemPriceRow(values),
    {
      contentFieldNames: ITEM_PRICE_CONTENT_FIELD_NAMES,
      idFieldName: "ipm_unit_rate_id",
      matchFieldName: "ipm_unit_id",
    },
  );
}
function buildManagedItemReorderRows(values: Record<string, string>): LinkedRecordRow[] {
  return parseLinkedRecordRows(values[ITEM_REORDER_ROWS_FIELD_NAME] ?? "");
}
function buildManagedItemEanRows(values: Record<string, string>): LinkedRecordRow[] {
  return upsertManagedLinkedRow(
    parseLinkedRecordRows(values[ITEM_EAN_ROWS_FIELD_NAME] ?? ""),
    buildPrimaryItemEanRow(values),
    {
      contentFieldNames: ITEM_EAN_CONTENT_FIELD_NAMES,
      idFieldName: "ean_id",
      matchFieldName: "ean_unit_id",
    },
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
function buildLinkedDetailFields(
  columns: LinkedRecordColumn[],
  overrides: Record<string, Partial<ERPDynamicModalField>> = {},
): ERPDynamicModalField[] {
  return columns.map((column) => {
    const override = overrides[column.key] ?? {};
    const field: ERPDynamicModalField = {
      name: column.key,
      label: column.label,
      type:
        column.type === "checkbox"
          ? "checkbox"
          : column.type === "select"
            ? "select"
            : column.type === "number"
              ? "number"
              : "text",
      ...((column.type ?? "text") === "select"
        ? {
            searchable: true,
            options: column.options ?? [],
          }
        : {}),
      ...(column.type === "number"
        ? {
            min: column.min,
            step: column.step,
          }
        : {}),
      ...override,
    };

    return field;
  });
}
function buildItemFormFields(
  companyOptions: ERPDynamicSelectOption[],
  branchOptions: ERPDynamicSelectOption[],
  groupOptions: ERPDynamicSelectOption[],
  categoryOptions: ERPDynamicSelectOption[],
  brandOptions: ERPDynamicSelectOption[],
  sectionOptions: ERPDynamicSelectOption[],
  unitOptions: ERPDynamicSelectOption[],
  taxOptions: ERPDynamicSelectOption[],
  hsnOptions: ERPDynamicSelectOption[],
  supplierOptions: ERPDynamicSelectOption[],
  customerGroupOptions: ERPDynamicSelectOption[],
  itemOptions: ERPDynamicSelectOption[],
  onItemGroupSearchChange?: ERPDynamicSearchQueryChangeHandler,
): ERPDynamicModalField[] {
  const priceRowColumns: LinkedRecordColumn[] = [
    { key: "ipm_unit_id", label: "Unit", type: "select", options: unitOptions, width: "10rem" },
    {
      key: "ipm_profit_type",
      label: "Profit Type",
      type: "select",
      options: ITEM_PRICE_PROFIT_TYPE_OPTIONS,
      width: "9rem",
    },
    { key: "ipm_conversion_factor", label: "Conv.", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_unit_slno", label: "Sl No", type: "number", min: 0, step: 1, width: "6rem" },
    { key: "ipm_cost_price", label: "Cost", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_cost_wot", label: "Cost WOT", type: "number", min: 0, step: "0.0001", width: "8rem" },
    { key: "ipm_sales_price_a", label: "Sale A", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_sales_price_b", label: "Sale B", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_sales_price_c", label: "Sale C", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_sales_price_d", label: "Sale D", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_price_a_wot", label: "A WOT", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_price_b_wot", label: "B WOT", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_price_c_wot", label: "C WOT", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_price_d_wot", label: "D WOT", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_price_a_margin", label: "A Margin", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_price_b_margin", label: "B Margin", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_price_c_margin", label: "C Margin", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_price_d_margin", label: "D Margin", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_min_price", label: "Min", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_max_price", label: "Max", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_disc_perc", label: "Disc %", type: "number", min: 0, step: "0.001", width: "7rem" },
    { key: "ipm_disc_qty", label: "Disc Qty", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_addl_cess", label: "Cess", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_round_off", label: "Round Off", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_uom_weight", label: "Weight", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_loading_charge", label: "Loading", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_freight_charge", label: "Freight", type: "number", min: 0, step: "0.0001", width: "7rem" },
    { key: "ipm_big_unit", label: "Big Unit", type: "checkbox", width: "6rem" },
    { key: "ipm_is_active", label: "Active", type: "checkbox", width: "6rem" },
    { key: "ipm_remarks", label: "Remarks", width: "12rem" },
  ];
  const reorderRowColumns: LinkedRecordColumn[] = [
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
  const eanRowColumns: LinkedRecordColumn[] = [
    { key: "ean_unit_id", label: "Unit", type: "select", options: unitOptions, width: "10rem" },
    { key: "ean_code", label: "EAN Code", width: "12rem" },
    { key: "ean_is_default", label: "Default", type: "checkbox", width: "6rem" },
    { key: "ean_is_active", label: "Active", type: "checkbox", width: "6rem" },
    { key: "ean_remarks", label: "Remarks", width: "12rem" },
  ];
  const eanDetailFields = buildLinkedDetailFields(eanRowColumns, {
    ean_remarks: {
      type: "textarea",
      rows: 2,
      colSpan: 2,
    },
  });
  const priceDetailFields = buildLinkedDetailFields(priceRowColumns, {
    ipm_unit_id: {
      helperText: "Enable Price List in Rules & Status to save price details.",
    },
    ipm_remarks: {
      type: "textarea",
      rows: 2,
      colSpan: 2,
    },
  });

  return [
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
      name: "itemHeadingReorder",
      label: "Reorder Details",
      type: "heading",
      defaultExpanded: true,
      sectionGridColumns: 4,
    },
    {
      name: ITEM_REORDER_ROWS_FIELD_NAME,
      label: "Reorder Rows",
      type: "custom",
      fieldStyle: {
        gridColumn: "1 / -1",
      },
      helperText: "Optional. Use rows when this item needs multiple reorder rules.",
      validation: {
        custom: validateItemReorderRows,
      },
      render: buildCustomFieldEditor(
        reorderRowColumns,
        (values) => buildEmptyItemReorderRow((values.item_base_unit_id ?? "").trim()),
        "Add Reorder Row",
        "No reorder rows added.",
      ),
    },
    {
      name: "itemHeadingEan",
      label: "EAN Details",
      type: "heading",
      defaultExpanded: true,
      sectionGridColumns: 4,
    },
    ...eanDetailFields,
    {
      name: ITEM_EAN_ROWS_FIELD_NAME,
      label: "EAN Rows",
      type: "custom",
      fieldStyle: {
        gridColumn: "1 / -1",
      },
      helperText: "Optional. Use rows when this item needs multiple EAN mappings.",
      validation: {
        custom: validateItemEanRows,
      },
      render: buildCustomFieldEditor(
        eanRowColumns,
        (values) => buildEmptyItemEanRow((values.item_base_unit_id ?? "").trim()),
        "Add EAN Row",
        "No EAN rows added.",
      ),
    },
    {
      name: "itemHeadingPriceList",
      label: "Price List Details",
      type: "heading",
      defaultExpanded: true,
      sectionGridColumns: 5,
    },
    ...priceDetailFields,
    {
      name: ITEM_PRICE_ROWS_FIELD_NAME,
      label: "Price Rows",
      type: "custom",
      fieldStyle: {
        gridColumn: "1 / -1",
      },
      helperText:
        "Optional. Use rows for multiple price records. Uncheck Price List in Rules & Status to remove all saved price rows.",
      visibleWhen: shouldShowItemPriceSection,
      validation: {
        custom: validateItemPriceRows,
      },
      render: buildCustomFieldEditor(
        priceRowColumns,
        (values) => buildEmptyItemPriceRow((values.item_base_unit_id ?? "").trim()),
        "Add Price Row",
        "No price rows added.",
      ),
    },
    {
      name: "itemHeadingRules",
      label: "Rules & Status",
      type: "heading",
      defaultExpanded: false,
      sectionGridColumns: 5,
    },
    {
      name: "item_is_active",
      label: "Is Active",
      type: "checkbox",
      gridRowStart: 1,
      gridColumnStart: 1,
    },
    {
      name: "item_retail_item",
      label: "Retail Item",
      type: "checkbox",
      gridRowStart: 1,
      gridColumnStart: 2,
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
      gridRowStart: 1,
      gridColumnStart: 3,
    },
    {
      name: "item_allow_neg_stock",
      label: "Allow Negative Stock",
      type: "checkbox",
      gridRowStart: 1,
      gridColumnStart: 4,
    },
    {
      name: "item_allow_promo",
      label: "Allow Promo",
      type: "checkbox",
      gridRowStart: 1,
      gridColumnStart: 5,
    },
    {
      name: "item_allow_purchase",
      label: "Allow Purchase",
      type: "checkbox",
      gridRowStart: 2,
      gridColumnStart: 1,
    },
    {
      name: "item_is_service",
      label: "Service Item",
      type: "checkbox",
      gridRowStart: 2,
      gridColumnStart: 2,
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
      gridColumnStart: 4,
    },
    {
      name: "item_allow_loyalty",
      label: "Allow Loyalty",
      type: "checkbox",
      gridRowStart: 2,
      gridColumnStart: 5,
    },
    {
      name: "item_allow_sales",
      label: "Allow Sales",
      type: "checkbox",
      gridRowStart: 3,
      gridColumnStart: 1,
    },
    {
      name: "item_allow_loading",
      label: "Allow Loading",
      type: "checkbox",
      gridRowStart: 3,
      gridColumnStart: 2,
    },
    {
      name: "item_damagable_product",
      label: "Damagable Product",
      type: "checkbox",
      gridRowStart: 3,
      gridColumnStart: 3,
    },
    {
      name: "item_has_offer",
      label: "Has Offer",
      type: "checkbox",
      gridRowStart: 3,
      gridColumnStart: 4,
    },
    {
      name: "item_allow_sales_return",
      label: "Allow Sales Return",
      type: "checkbox",
      gridRowStart: 4,
      gridColumnStart: 1,
    },
    {
      name: "item_weigh_scale",
      label: "Weigh Scale",
      type: "checkbox",
      gridRowStart: 4,
      gridColumnStart: 2,
    },
    {
      name: "item_expiry_days",
      label: "Expiry Days",
      type: "number",
      min: 0,
      step: 1,
      visibleWhen: (values) => values.item_is_expiry_item === "true",
      gridRowStart: 4,
      gridColumnStart: 3,
    },
    {
      name: "item_auto_break",
      label: "Auto Break",
      type: "checkbox",
      gridRowStart: 5,
      gridColumnStart: 1,
    },
    {
      name: "item_auto_make",
      label: "Auto Make",
      type: "checkbox",
      gridRowStart: 5,
      gridColumnStart: 2,
    },
    {
      name: "item_is_batch_based",
      label: "Batch Based",
      type: "checkbox",
      gridRowStart: 6,
      gridColumnStart: 1,
    },
    {
      name: "item_is_expiry_item",
      label: "Expiry Item",
      type: "checkbox",
      gridRowStart: 6,
      gridColumnStart: 2,
    },
    {
      name: "item_intimate_before_days",
      label: "Intimate Before Days",
      type: "number",
      min: 0,
      step: 1,
      visibleWhen: (values) => values.item_is_expiry_item === "true",
      gridRowStart: 6,
      gridColumnStart: 4,
    },
    {
      name: "item_allow_po",
      label: "Allow PO",
      type: "checkbox",
      gridRowStart: 6,
      gridColumnStart: 5,
    },
    {
      name: "item_allow_so",
      label: "Allow SO",
      type: "checkbox",
      gridRowStart: 7,
      gridColumnStart: 1,
    },
    {
      name: "item_is_kit",
      label: "Is Kit",
      type: "checkbox",
      gridRowStart: 7,
      gridColumnStart: 2,
    },
    {
      name: "item_is_demand",
      label: "Is Demand",
      type: "checkbox",
      gridRowStart: 7,
      gridColumnStart: 4,
    },
    {
      name: "item_random_stock",
      label: "Random Stock",
      type: "checkbox",
      gridRowStart: 7,
      gridColumnStart: 5,
    },
    {
      name: "item_barcode_sticker",
      label: "Barcode Sticker",
      type: "checkbox",
      gridRowStart: 8,
      gridColumnStart: 1,
    },
  ];
}
function toLookupOptions(
  payload: unknown,
  defaultOption: ERPDynamicSelectOption,
  lookupOptions?: {
    arrayKeys?: readonly string[];
    idKeys?: readonly string[];
    labelKeys?: readonly string[];
  },
): ERPDynamicSelectOption[] {
  return buildLookupOptions(payload, defaultOption, {
    arrayKeys: lookupOptions?.arrayKeys ?? DEFAULT_LOOKUP_ARRAY_KEYS,
    idKeys: lookupOptions?.idKeys ?? ["id", "value"],
    labelKeys: lookupOptions?.labelKeys ?? ["name", "label"],
  }).filter((option) => option.value !== defaultOption.value);
}

function toHsnOptions(payload: unknown): ERPDynamicSelectOption[] {
  return buildLookupOptions(payload, DEFAULT_HSN_OPTION, {
    arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
    idKeys: ["hsnCode", "hsn_code"],
    labelKeys: ["hsnCode", "hsn_code"],
  }).filter((option) => option.value !== DEFAULT_HSN_OPTION.value);
}

function mergeLookupOptionSets(
  currentOptions: ERPDynamicSelectOption[],
  nextOptions: ERPDynamicSelectOption[],
): ERPDynamicSelectOption[] {
  const merged = new Map<string, ERPDynamicSelectOption>();

  for (const option of currentOptions) {
    if (!option.value) {
      continue;
    }
    merged.set(option.value, option);
  }

  for (const option of nextOptions) {
    if (!option.value) {
      continue;
    }
    merged.set(option.value, option);
  }

  return Array.from(merged.values());
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file as base64."));
        return;
      }
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read file."));
    };
    reader.readAsDataURL(file);
  });
}
export default function ItemMasterPage() {
  const { getAll: getLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getCompanyLookup } = useApi<unknown>(COMPANY_LOOKUP_ENDPOINT);
  const { getAll: getBranchLookup } = useApi<unknown>(BRANCH_LOOKUP_ENDPOINT);
  const { getAll: getGroupLookup } = useApi<unknown>(ITEM_GROUP_LOOKUP_ENDPOINT);
  const { getAll: searchGroupLookup } = useApi<unknown>(ITEM_GROUP_LOOKUP_ENDPOINT);
  const { getAll: getCategoryLookup } = useApi<unknown>(ITEM_CATEGORY_LOOKUP_ENDPOINT);
  const { getAll: getBrandLookup } = useApi<unknown>(ITEM_BRAND_LOOKUP_ENDPOINT);
  const { getAll: getSectionLookup } = useApi<unknown>(ITEM_SECTION_LOOKUP_ENDPOINT);
  const { getAll: getUnitLookup } = useApi<unknown>(UNIT_LOOKUP_ENDPOINT);
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
  const [taxOptions, setTaxOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [hsnOptions, setHsnOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [customerGroupOptions, setCustomerGroupOptions] = useState<
    ERPDynamicSelectOption[]
  >([]);
  const [itemOptions, setItemOptions] = useState<ERPDynamicSelectOption[]>([]);
  const itemGroupSearchTimeoutRef = useRef<number | null>(null);
  const itemGroupSearchRequestRef = useRef(0);
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
        taxesPayload,
        hsnPayload,
        suppliersPayload,
        customerGroupsPayload,
        itemsPayload,
      ] = await Promise.allSettled([
        getCompanyLookup(COMPANY_LOOKUP_QUERY),
        getBranchLookup(BRANCH_LOOKUP_QUERY),
        getGroupLookup(ITEM_GROUP_LOOKUP_QUERY),
        getCategoryLookup(ITEM_CATEGORY_LOOKUP_QUERY),
        getBrandLookup(ITEM_BRAND_LOOKUP_QUERY),
        getSectionLookup(ITEM_SECTION_LOOKUP_QUERY),
        getUnitLookup(UNIT_LOOKUP_QUERY),
        getLookup(LOOKUP_QUERY_ITEM_TAXES),
        getHsnLookup(HSN_LOOKUP_QUERY),
        getLookup(LOOKUP_QUERY_SUPPLIERS),
        getLookup(LOOKUP_QUERY_CUSTOMER_GROUPS),
        getLookup(LOOKUP_QUERY_ITEMS),
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
      setTaxOptions(
        taxesPayload.status === "fulfilled"
          ? toLookupOptions(taxesPayload.value, DEFAULT_TAX_OPTION)
          : [],
      );
      setHsnOptions(hsnPayload.status === "fulfilled" ? toHsnOptions(hsnPayload.value) : []);
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
    })();
    return () => {
      mounted = false;
    };
  }, [
    getBrandLookup,
    getBranchLookup,
    getCategoryLookup,
    getCompanyLookup,
    getGroupLookup,
    getHsnLookup,
    getLookup,
    getSectionLookup,
    getUnitLookup,
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
          ipm_profit_type:
            (row.ipm_profit_type ?? "").trim() || ITEM_PRICE_DEFAULT_PROFIT_TYPE,
          ipm_unit_slno: toOptionalNonNegativeInteger(row.ipm_unit_slno ?? ""),
          ipm_conversion_factor: toOptionalNonNegativeNumber(
            row.ipm_conversion_factor ?? "",
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
      const serializedPriceRows = serializeLinkedRecordRows(
        priceRows.map((row) =>
          mapSourceToLinkedRow(
            row,
            ITEM_PRICE_TEXT_FIELD_NAMES,
            ITEM_PRICE_BOOLEAN_FIELD_NAMES,
            buildEmptyItemPriceRow(preferredUnitId),
          ),
        ),
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
            buildEmptyItemEanRow(preferredUnitId),
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
    [listItemEanCodeRecords, listItemPriceRecords, listItemReorderRecords],
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
        taxOptions,
        hsnOptions,
        supplierOptions,
        customerGroupOptions,
        itemOptions,
        handleItemGroupSearchChange,
      ),
    [
      brandOptions,
      branchOptions,
      categoryOptions,
      companyOptions,
      customerGroupOptions,
      groupOptions,
      hsnOptions,
      itemOptions,
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
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mappedValues: Record<string, string> = {
          ...ITEM_INITIAL_FORM_VALUES,
        };
        for (const fieldName of ITEM_TEXT_FIELD_NAMES) {
          const value = toDisplayValue(getFieldValue(rowSource, fieldName));
          mappedValues[fieldName] = value || ITEM_INITIAL_FORM_VALUES[fieldName];
        }
        for (const fieldName of ITEM_BOOLEAN_FIELD_NAMES) {
          const fallback =
            ITEM_INITIAL_FORM_VALUES[fieldName] === "true" ? "true" : "false";
          mappedValues[fieldName] = toSelectBoolean(
            getFieldValue(rowSource, fieldName),
            fallback,
          );
        }
        for (const fieldName of ITEM_PRICE_TEXT_FIELD_NAMES) {
          const value = toDisplayValue(getFieldValue(rowSource, fieldName));
          mappedValues[fieldName] = value || ITEM_PRICE_INITIAL_FORM_VALUES[fieldName];
        }
        for (const fieldName of ITEM_PRICE_BOOLEAN_FIELD_NAMES) {
          const fallback =
            ITEM_PRICE_INITIAL_FORM_VALUES[fieldName] === "true" ? "true" : "false";
          mappedValues[fieldName] = toSelectBoolean(
            getFieldValue(rowSource, fieldName),
            fallback,
          );
        }
        mappedValues[ITEM_PRICE_ROWS_FIELD_NAME] =
          toDisplayValue(getFieldValue(rowSource, ITEM_PRICE_ROWS_FIELD_NAME)) ||
          ITEM_INITIAL_FORM_VALUES[ITEM_PRICE_ROWS_FIELD_NAME];
        mappedValues[ITEM_REORDER_ROWS_FIELD_NAME] =
          toDisplayValue(getFieldValue(rowSource, ITEM_REORDER_ROWS_FIELD_NAME)) ||
          ITEM_INITIAL_FORM_VALUES[ITEM_REORDER_ROWS_FIELD_NAME];
        mappedValues[ITEM_EAN_ROWS_FIELD_NAME] =
          toDisplayValue(getFieldValue(rowSource, ITEM_EAN_ROWS_FIELD_NAME)) ||
          ITEM_INITIAL_FORM_VALUES[ITEM_EAN_ROWS_FIELD_NAME];
        mappedValues.ir_id =
          toDisplayValue(getFieldValue(rowSource, "ir_id")) ||
          ITEM_INITIAL_FORM_VALUES.ir_id;
        mappedValues.ir_unit_id =
          toDisplayValue(getFieldValue(rowSource, "ir_unit_id")) ||
          ITEM_INITIAL_FORM_VALUES.ir_unit_id;
        mappedValues.ir_min_level =
          toDisplayValue(getFieldValue(rowSource, "ir_min_level")) ||
          ITEM_INITIAL_FORM_VALUES.ir_min_level;
        mappedValues.ir_max_level =
          toDisplayValue(getFieldValue(rowSource, "ir_max_level")) ||
          ITEM_INITIAL_FORM_VALUES.ir_max_level;
        mappedValues.ir_reorder_level =
          toDisplayValue(getFieldValue(rowSource, "ir_reorder_level")) ||
          ITEM_INITIAL_FORM_VALUES.ir_reorder_level;
        mappedValues.ir_reorder_qty =
          toDisplayValue(getFieldValue(rowSource, "ir_reorder_qty")) ||
          ITEM_INITIAL_FORM_VALUES.ir_reorder_qty;
        mappedValues.ir_lead_time_days =
          toDisplayValue(getFieldValue(rowSource, "ir_lead_time_days")) ||
          ITEM_INITIAL_FORM_VALUES.ir_lead_time_days;
        mappedValues.ir_review_cycle_days =
          toDisplayValue(getFieldValue(rowSource, "ir_review_cycle_days")) ||
          ITEM_INITIAL_FORM_VALUES.ir_review_cycle_days;
        mappedValues.ir_reorder_days =
          toDisplayValue(getFieldValue(rowSource, "ir_reorder_days")) ||
          ITEM_INITIAL_FORM_VALUES.ir_reorder_days;
        mappedValues.ir_expiry_buffer_days =
          toDisplayValue(getFieldValue(rowSource, "ir_expiry_buffer_days")) ||
          ITEM_INITIAL_FORM_VALUES.ir_expiry_buffer_days;
        mappedValues.ir_reorder_type =
          toDisplayValue(getFieldValue(rowSource, "ir_reorder_type")) ||
          ITEM_INITIAL_FORM_VALUES.ir_reorder_type;
        mappedValues.ir_remarks =
          toDisplayValue(getFieldValue(rowSource, "ir_remarks")) ||
          ITEM_INITIAL_FORM_VALUES.ir_remarks;
        mappedValues.ir_is_active = toSelectBoolean(
          getFieldValue(rowSource, "ir_is_active"),
          ITEM_INITIAL_FORM_VALUES.ir_is_active === "true" ? "true" : "false",
        );
        mappedValues.ean_id =
          toDisplayValue(getFieldValue(rowSource, "ean_id")) ||
          ITEM_INITIAL_FORM_VALUES.ean_id;
        mappedValues.ean_unit_id =
          toDisplayValue(getFieldValue(rowSource, "ean_unit_id")) ||
          ITEM_INITIAL_FORM_VALUES.ean_unit_id;
        mappedValues.ean_code =
          toDisplayValue(getFieldValue(rowSource, "ean_code")) ||
          ITEM_INITIAL_FORM_VALUES.ean_code;
        mappedValues.ean_remarks =
          toDisplayValue(getFieldValue(rowSource, "ean_remarks")) ||
          ITEM_INITIAL_FORM_VALUES.ean_remarks;
        mappedValues.ean_is_default = toSelectBoolean(
          getFieldValue(rowSource, "ean_is_default"),
          ITEM_INITIAL_FORM_VALUES.ean_is_default === "true" ? "true" : "false",
        );
        mappedValues.ean_is_active = toSelectBoolean(
          getFieldValue(rowSource, "ean_is_active"),
          ITEM_INITIAL_FORM_VALUES.ean_is_active === "true" ? "true" : "false",
        );
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
      }}
      buildRequestPayload={async ({
        values,
        shouldUpdate,
        editingItemId,
        files,
      }) => {
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
          item_company_category_id: toNullableString(
            values.item_company_category_id ?? "",
          ),
          item_supplier_id: toNullableString(values.item_supplier_id ?? ""),
          item_cust_group: toNullableString(values.item_cust_group ?? ""),
          item_base_unit_id: (values.item_base_unit_id ?? "").trim(),
          item_is_service: (values.item_is_service ?? "false") === "true",
          item_is_batch_based: (values.item_is_batch_based ?? "false") === "true",
          item_is_expiry_item: (values.item_is_expiry_item ?? "false") === "true",
          item_expiry_days: toOptionalNonNegativeInteger(
            values.item_expiry_days ?? "",
          ),
          item_intimate_before_days: toOptionalNonNegativeInteger(
            values.item_intimate_before_days ?? "",
          ),
          item_allow_sales: (values.item_allow_sales ?? "true") === "true",
          item_allow_sales_return:
            (values.item_allow_sales_return ?? "true") === "true",
          item_allow_purchase: (values.item_allow_purchase ?? "true") === "true",
          item_allow_po: (values.item_allow_po ?? "true") === "true",
          item_allow_so: (values.item_allow_so ?? "true") === "true",
          item_allow_neg_stock:
            (values.item_allow_neg_stock ?? "true") === "true",
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
          item_barcode_sticker:
            (values.item_barcode_sticker ?? "false") === "true",
          item_default_tax_id: toNullableString(values.item_default_tax_id ?? ""),
          item_hsn_code: toUpperNullable(values.item_hsn_code ?? ""),
          item_batch_config: toNonNegativeInteger(
            values.item_batch_config ?? "0",
            0,
          ),
          item_sort_order: toOptionalNonNegativeInteger(
            values.item_sort_order ?? "",
          ),
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
      }}
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
