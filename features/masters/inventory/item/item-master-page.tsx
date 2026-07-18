"use client";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage, {
  type CrudMasterPageController,
} from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import {
  useLazyConfiguredDropdown,
  type LazyDropdownHandlers,
} from "@/features/masters/shared/use-lazy-configured-dropdown";
import {
  buildControllableFieldNames,
  buildWidgetFieldConfig,
  type ResolvedFieldConfig,
  type WidgetMasterSectionConfig,
  type WidgetMastersResponse,
} from "@/features/masters/shared/widget-config";
import WidgetVisibilityTree, {
  type WidgetTreeSectionView,
} from "@/features/masters/shared/widget-visibility-tree";
import {
  ERPDynamicModalForm,
  type ERPDynamicCustomFieldRenderProps,
  type ERPDynamicFieldValueChangePayload,
  type ERPDynamicFieldValueChangeResult,
  type ERPDynamicModalController,
  type ERPDynamicModalField,
  type ERPDynamicModalVariant,
  type ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
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
  type LinkedRecordColumnLayoutEntry,
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
import {
  API_ENDPOINTS,
  GRID_TABLE_NAME,
  LOOKUP_ENDPOINT,
  BRANCH_LOOKUP_ENDPOINT,
  BRANCH_BY_COMPANY_ENDPOINT,
  UNIT_LOOKUP_ENDPOINT,
  GODOWN_LOOKUP_ENDPOINT,
  HSN_LOOKUP_ENDPOINT,
  UI_TABLE_COLUMNS_ENDPOINT,
  UI_TABLE_COLUMNS_CREATE_ENDPOINT,
  WIDGET_MASTER_LIST_ENDPOINT,
  WIDGET_CONFIG_TREE_ENDPOINT,
  WIDGET_VISIBILITY_ENDPOINT,
  ITEM_MASTER_WIDGET_SECTION_MENU_ID,
  ITEM_MASTER_WIDGET_TYPE,
  ITEM_TAX_MASTER_LIST_ENDPOINT,
  ITEM_REORDER_TABLE_UI_ID,
  ITEM_PRICE_TABLE_UI_ID,
  ITEM_EAN_TABLE_UI_ID,
  UUID_PATTERN,
  ITEM_PRICE_ROWS_FIELD_NAME,
  ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME,
  ITEM_REORDER_ROWS_FIELD_NAME,
  ITEM_EAN_ROWS_FIELD_NAME,
  BRANCH_LOOKUP_QUERY,
  UNIT_LOOKUP_QUERY,
  GODOWN_LOOKUP_QUERY,
  UI_TABLE_COLUMNS_QUERY,
  UI_REORDER_TABLE_COLUMNS_QUERY,
  UI_EAN_TABLE_COLUMNS_QUERY,
  ITEM_MASTER_WIDGET_QUERY,
  ITEM_TAX_LIST_QUERY,
  LOOKUP_QUERY_ITEMS,
  HSN_LOOKUP_QUERY,
  BRANCH_LOOKUP_KEYS,
  UNIT_LOOKUP_KEYS,
  GODOWN_LOOKUP_KEYS,
  LOOKUP_KEYS,
  REQUEST_PAYLOAD_KEYS,
  DEFAULT_COMPANY_OPTION,
  DEFAULT_BRANCH_OPTION,
  DEFAULT_GROUP_OPTION,
  DEFAULT_CATEGORY_OPTION,
  DEFAULT_BRAND_OPTION,
  DEFAULT_SECTION_OPTION,
  DEFAULT_UNIT_OPTION,
  DEFAULT_GODOWN_OPTION,
  DEFAULT_TAX_OPTION,
  DEFAULT_SUPPLIER_OPTION,
  DEFAULT_HSN_OPTION,
  DEFAULT_CUSTOMER_GROUP_OPTION,
  DEFAULT_PACKING_OPTION,
  ITEM_BATCH_CONFIG_NONE_VALUE,
  ITEM_BATCH_CONFIG_MRP_VALUE,
  ITEM_BATCH_CONFIG_BATCH_VALUE,
  BATCH_CONFIG_OPTIONS,
  ITEM_PRICE_DEFAULT_PROFIT_TYPE,
  ITEM_PRICE_PROFIT_TYPE_OPTIONS,
  ITEM_PRICE_ROUND_OFF_OPTIONS,
  ITEM_REORDER_TYPE_OPTIONS,
  ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS,
  ITEM_PRICE_TABLE_COLUMN_NAME_TO_KEY,
  ITEM_REORDER_TABLE_COLUMN_NAME_TO_KEY,
  ITEM_EAN_TABLE_COLUMN_NAME_TO_KEY,
  ITEM_PRICE_INITIAL_FORM_VALUES,
  ITEM_REORDER_INITIAL_FORM_VALUES,
  ITEM_EAN_INITIAL_FORM_VALUES,
  ITEM_UNIT_CONVERSION_INITIAL_FORM_VALUES,
  ITEM_INITIAL_FORM_VALUES,
  ITEM_MODAL_PANEL_STYLE,
  ITEM_INLINE_SECTION_HEADING_STYLE,
  ITEM_CHECKBOX_CONTROL_STYLE,
  ITEM_TEXT_FIELD_NAMES,
  ITEM_BOOLEAN_FIELD_NAMES,
  ITEM_PRICE_TEXT_FIELD_NAMES,
  ITEM_PRICE_BOOLEAN_FIELD_NAMES,
  ITEM_PRICE_SYNC_FIELD_NAMES,
  ITEM_UNIT_CONVERSION_ROW_TEXT_FIELD_NAMES,
  ITEM_UNIT_CONVERSION_ROW_BOOLEAN_FIELD_NAMES,
  ITEM_REORDER_ROW_TEXT_FIELD_NAMES,
  ITEM_REORDER_ROW_BOOLEAN_FIELD_NAMES,
  ITEM_EAN_ROW_TEXT_FIELD_NAMES,
  ITEM_EAN_ROW_BOOLEAN_FIELD_NAMES,
  ITEM_PRICE_CONTENT_FIELD_NAMES,
  ITEM_PRICE_SUBMISSION_FIELD_NAMES,
  ITEM_UNIT_CONVERSION_CONTENT_FIELD_NAMES,
  ITEM_REORDER_CONTENT_FIELD_NAMES,
  ITEM_EAN_CONTENT_FIELD_NAMES,
  WIDGET_FIELD_NAME_BY_FORM_FIELD,
  type SaveUiTableColumnLayoutRequest,
  type UiTableColumnLayoutItem,
  normalizeItemBatchConfigValue,
} from "./item-master-page.constants";
// Backend fieldNames (lowercased) that map to a real item form field, so their
// popup checkbox can actually show/hide something. Fields with no bridge entry
// render read-only in the tree ("not on form").
const WIDGET_CONTROLLABLE_FIELD_NAMES = buildControllableFieldNames(
  WIDGET_FIELD_NAME_BY_FORM_FIELD,
);
// Company is a lazy, server-side searchable configured dropdown (fixed.dropdown_details
// 8=company comp_id/comp_name). Loaded on open + on debounced server-side search via
// /dropdown-details/run; nothing fetched up front.
const COMPANY_DROPDOWN_CONFIG = {
  dropdownId: "8",
  idKeys: ["comp_id", "compId"] as const,
  labelKeys: ["comp_name", "compName"] as const,
  defaultOption: DEFAULT_COMPANY_OPTION,
} as const;
// Source keys to seed the saved company on edit/view (/items/get returns both
// item_company_id and the resolved item_company_name).
const COMPANY_SOURCE_ID_KEYS = ["item_company_id", "itemCompanyId"] as const;
const COMPANY_SOURCE_NAME_KEYS = ["item_company_name", "itemCompanyName"] as const;
// Item Group is a lazy, server-side searchable configured dropdown (fixed.dropdown_details
// 17=item groups itg_id/itg_name from inventory.item_group_master where active). Loaded on
// open + on debounced server-side search via /dropdown-details/run; nothing fetched up front.
const GROUP_DROPDOWN_CONFIG = {
  dropdownId: "17",
  idKeys: ["itg_id", "itgId"] as const,
  labelKeys: ["itg_name", "itgName"] as const,
  defaultOption: DEFAULT_GROUP_OPTION,
} as const;
// Source keys to seed the saved item group on edit/view (/items/get returns both
// item_group_id and the resolved item_group_name).
const GROUP_SOURCE_ID_KEYS = ["item_group_id", "itemGroupId"] as const;
const GROUP_SOURCE_NAME_KEYS = ["item_group_name", "itemGroupName"] as const;
// Item Category is a lazy, server-side searchable configured dropdown (fixed.dropdown_details
// 20=item categories category_id/category_name from inventory.item_category_master where active).
const CATEGORY_DROPDOWN_CONFIG = {
  dropdownId: "20",
  idKeys: ["category_id", "categoryId"] as const,
  labelKeys: ["category_name", "categoryName"] as const,
  defaultOption: DEFAULT_CATEGORY_OPTION,
} as const;
const CATEGORY_SOURCE_ID_KEYS = ["item_category_id", "itemCategoryId"] as const;
const CATEGORY_SOURCE_NAME_KEYS = ["item_category_name", "itemCategoryName"] as const;
// Item Section is a lazy, server-side searchable configured dropdown (fixed.dropdown_details
// 19=item sections sec_id/sec_name from inventory.item_section_master where active).
const SECTION_DROPDOWN_CONFIG = {
  dropdownId: "19",
  idKeys: ["sec_id", "secId"] as const,
  labelKeys: ["sec_name", "secName"] as const,
  defaultOption: DEFAULT_SECTION_OPTION,
} as const;
const SECTION_SOURCE_ID_KEYS = ["item_section_id", "itemSectionId"] as const;
const SECTION_SOURCE_NAME_KEYS = ["item_section_name", "itemSectionName"] as const;
// Item Brand is a lazy, server-side searchable configured dropdown (fixed.dropdown_details
// 18=item brands brand_id/brand_name from inventory.item_brand_master where active).
const BRAND_DROPDOWN_CONFIG = {
  dropdownId: "18",
  idKeys: ["brand_id", "brandId"] as const,
  labelKeys: ["brand_name", "brandName"] as const,
  defaultOption: DEFAULT_BRAND_OPTION,
} as const;
const BRAND_SOURCE_ID_KEYS = ["item_brand_id", "itemBrandId"] as const;
const BRAND_SOURCE_NAME_KEYS = ["item_brand_name", "itemBrandName"] as const;
// Item Customer Group is a lazy, server-side searchable configured dropdown
// (fixed.dropdown_details 3=customerGroups cgr_id/cgr_name from sales.cust_groups where active).
const CUSTOMER_GROUP_DROPDOWN_CONFIG = {
  dropdownId: "3",
  idKeys: ["cgr_id", "cgrId"] as const,
  labelKeys: ["cgr_name", "cgrName"] as const,
  defaultOption: DEFAULT_CUSTOMER_GROUP_OPTION,
} as const;
const CUSTOMER_GROUP_SOURCE_ID_KEYS = ["item_cust_group", "itemCustGroup"] as const;
const CUSTOMER_GROUP_SOURCE_NAME_KEYS = ["item_cust_group_name", "itemCustGroupName"] as const;
// Default Supplier is a lazy, server-side searchable configured dropdown (fixed.dropdown_details
// 35=SUPPLIERS sup_id/sup_name from purchase.suppliers where active).
const SUPPLIER_DROPDOWN_CONFIG = {
  dropdownId: "35",
  idKeys: ["sup_id", "supId"] as const,
  labelKeys: ["sup_name", "supName"] as const,
  defaultOption: DEFAULT_SUPPLIER_OPTION,
} as const;
const SUPPLIER_SOURCE_ID_KEYS = ["item_supplier_id", "itemSupplierId"] as const;
const SUPPLIER_SOURCE_NAME_KEYS = ["item_supplier_name", "itemSupplierName"] as const;
// Default Tax is a lazy, server-side searchable configured dropdown (fixed.dropdown_details
// 36=TAXES tax_id/tax_name from inventory.item_tax_master where active & not deleted). Loaded
// on open + on debounced server-side search via /dropdown-details/run; nothing fetched up front.
// The full tax records (GST/CESS percentages) still load eagerly via grid 5 into
// itemTaxRecordsById for the price-with-tax math — this dropdown only supplies the field options.
const TAX_DROPDOWN_CONFIG = {
  dropdownId: "36",
  idKeys: ["tax_id", "taxId"] as const,
  labelKeys: ["tax_name", "taxName"] as const,
  defaultOption: DEFAULT_TAX_OPTION,
} as const;
const TAX_SOURCE_ID_KEYS = ["item_default_tax_id", "itemDefaultTaxId"] as const;
const TAX_SOURCE_NAME_KEYS = ["item_default_tax_name", "itemDefaultTaxName"] as const;
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
  if (normalized === "By %" || normalized === "By %") {
    return "By %";
  }
  if (normalized === "By Rs " || normalized === "By Rs " || normalized === "BY_AMOUNT") {
    return "By Rs";
  }
  if (normalized === "By User" || normalized === "By User" || normalized === "MANUAL") {
    return "By User";
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
  // The Unit Conversion Table is the source of truth for its own rows, so keep
  // every existing row and only append a conversion row for a price unit that
  // isn't tracked here yet. Rebuilding the table from the price list would drop
  // the units the user maintains only in the conversion table.
  const existingRows = parseLinkedRecordRows(serializedItemUnitConversionRows);
  const trackedUnitIds = new Set(
    existingRows.map((row) => (row.iuc_unit_id ?? "").trim()).filter(Boolean),
  );
  const nextRows: LinkedRecordRow[] = [...existingRows];
  for (const row of priceRows) {
    const unitId = (row.ipm_unit_id ?? "").trim();
    if (!unitId || trackedUnitIds.has(unitId)) {
      continue;
    }
    trackedUnitIds.add(unitId);
    nextRows.push({
      ...buildEmptyItemUnitConversionRow(baseUnitId, nextRows.length + 1),
      iuc_unit_id: unitId,
      iuc_unit_slno:
        (row.ipm_unit_slno ?? "").trim() || String(nextRows.length + 1),
      iuc_to_base_factor:
        resolveItemPriceToBaseFactorValue(row) ||
        (unitId === baseUnitId ? "1" : ""),
      iuc_unit_factor: resolveItemPriceUnitFactorValue(row) || "1",
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
    // Only mirror conversion data onto rows the user already assigned a unit
    // to. Falling back to the base unit here would silently pre-select it in
    // an untouched price row, which reads as "the Unit Conversion Table filled
    // this in for me". The first row still gets the base unit, but from
    // normalizeItemPriceRowsForRules below, where that invariant belongs.
    const unitId = (row.ipm_unit_id ?? "").trim();
    if (!unitId) {
      return row;
    }
    const matchingUnitConversion = itemUnitConversionsByUnitId.get(unitId);
    if (!matchingUnitConversion) {
      return row;
    }
    const nextRow = { ...row };
    // The price list's Conv column mirrors the Unit Factor maintained in the
    // Unit Conversion Table, so drive both mirrored price-row factor fields
    // from the conversion row's unit factor. Preferring the to-base factor
    // here would resurrect its stale "1" default whenever only the Unit
    // Factor column was edited.
    const nextFactor =
      resolveItemUnitConversionUnitFactorValue(matchingUnitConversion) ||
      (unitId === baseUnitId ? "1" : "");
    const nextUnitFactor = nextFactor;
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
  const roleNormalizedRows = normalizeItemPriceRowsForRules(normalizedRows);
  if (roleNormalizedRows !== normalizedRows) {
    return serializeLinkedRecordRows(roleNormalizedRows);
  }
  return normalizedRows === effectiveRows
    ? conversionSyncedRows
    : serializeLinkedRecordRows(normalizedRows);
}
// ir_branch_id/ir_unit_id/ir_godown_id default to blank rather than to the
// item's branch/base unit: the server stores a blank as NULL, which is the
// "global rule" (no branch/unit/godown scoping) the user gets by default.
function buildEmptyItemReorderRow(): LinkedRecordRow {
  return { ...ITEM_REORDER_INITIAL_FORM_VALUES };
}
function buildEmptyItemEanRow(
  baseUnitId: string,
  preferredUnitId: string,
  sourceRow?: LinkedRecordRow,
): LinkedRecordRow {
  const sourceUnitId = (sourceRow?.ean_unit_id ?? "").trim();
  return {
    ...ITEM_EAN_INITIAL_FORM_VALUES,
    ean_unit_id: sourceUnitId || preferredUnitId.trim() || baseUnitId.trim(),
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
// Price rows list the same units as the EAN table — the base unit plus the
// active Unit Conversion Table rows — and additionally never offer a unit a
// sibling price row already claimed.
function buildItemPriceUnitOptions(
  values: Record<string, string>,
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
  return buildSelectableItemUnitOptions(values, unitOptions).filter(
    (option) =>
      !option.value ||
      option.value === currentUnitId ||
      !usedUnitIds.has(option.value),
  );
}
// ir_unit_id is stored as a FK to item_unit_conversion(iuc_id), but the
// composite save translates a unit_id into this item's conversion row before
// writing it (server: resolveUnitConversionId), exactly as it does for the EAN
// table's ean_unit_id — so reorder rows carry a unit_id in the form and list
// the same units as the EAN table. Keying the options by iuc_id instead leaves
// the column empty until the item is saved, because conversion rows added in
// this form have no iuc_id yet.
function buildItemReorderUnitOptions(
  values: Record<string, string>,
  unitOptions: ERPDynamicSelectOption[],
): ERPDynamicSelectOption[] {
  return buildSelectableItemUnitOptions(values, unitOptions);
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
// The composite GET returns item_reorders.ir_unit_id and item_ean_codes
// .ean_unit_id as an iuc_id (their FK target is item_unit_conversion), while
// both Unit columns are keyed by unit_id. Hop back through the item's own
// conversion rows on load so the saved unit shows as the selected option; the
// save path maps the picked unit_id back to the iuc_id. Values that match no
// conversion row (e.g. one since deleted) are left untouched.
function mapLinkedRowUnitConversionIdsToUnitIds(
  rows: Record<string, unknown>[],
  unitFieldName: string,
  unitConversionRows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const unitIdByConversionId = new Map(
    unitConversionRows.map((row) => [
      toDisplayValue(getFieldValue(row, "iuc_id")),
      toDisplayValue(getFieldValue(row, "iuc_unit_id")),
    ]),
  );
  return rows.map((row) => {
    const unitId = unitIdByConversionId.get(
      toDisplayValue(getFieldValue(row, unitFieldName)),
    );
    return unitId ? { ...row, [unitFieldName]: unitId } : row;
  });
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
type ItemPriceScope = {
  branchId: string;
};

function resolveItemPriceScope(
  source: Record<string, unknown> | null | undefined,
): ItemPriceScope {
  return {
    branchId: normalizeComparisonString(getFieldValue(source ?? {}, "item_branch_id")),
  };
}

/**
 * Keeps only the price rows that belong to the item's branch. Rows are already
 * scoped to the item by ipm_item_id server-side, so this is just a guard against
 * showing another branch's rows; a row with no branch of its own is treated as
 * item-wide and always kept, as is every row when the item itself has no branch.
 *
 * Deliberately does NOT compare ipm_company_id against item_company_id: the
 * server overwrites item_company_id with the caller's token company on save
 * (items-master.service applyOptionalFields) while the price rows keep the
 * company picked in the form, so on a company-bound token the two legitimately
 * differ and comparing them silently emptied the price table on edit.
 */
function filterItemPriceRowsByScope(
  rows: Record<string, unknown>[],
  scope: ItemPriceScope,
): Record<string, unknown>[] {
  if (!scope.branchId) {
    return rows;
  }
  return rows.filter((row) => {
    const rowBranchId = normalizeComparisonString(getFieldValue(row, "ipm_branch_id"));
    return !rowBranchId || rowBranchId === scope.branchId;
  });
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
  // Editing the price list must not mutate the Unit Conversion Table — the two
  // tables are maintained independently. Recalculate the price rows against the
  // current (unchanged) conversion rows only; the conversion table stays as-is.
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
  if (hasMeaningfulItemPriceRows(nextValues)) {
    nextValues.item_price_list = "true";
  }
  const changedValues = collectChangedFieldValues(
    comparisonValues,
    nextValues,
    ["item_price_list", ...ITEM_PRICE_SYNC_FIELD_NAMES],
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
  // The Unit Conversion Table is the source of truth for the item's base unit,
  // so derive item_base_unit_id from its base row here. Without this the base
  // unit is only ever populated when editing/viewing a saved record (from the
  // mapped source), leaving create-mode price/conversion syncs with no base
  // unit to key off. Ignore price rows so the table's base row always wins.
  const nextBaseUnitId = resolveLinkedBaseUnitId(values, {
    priceRows: [],
    unitConversionRows: parseLinkedRecordRows(normalizedRows),
  });
  const comparisonValues = {
    ...values,
    [ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME]:
      previousValues[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME] ??
      values[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME] ??
      "",
  };
  const nextValues: Record<string, string> = {
    ...values,
    item_base_unit_id: nextBaseUnitId,
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
    ["item_base_unit_id", ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME, ...ITEM_PRICE_SYNC_FIELD_NAMES],
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
  const defaultRow = buildEmptyItemReorderRow();
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
    // No base-unit fallback: rows no longer inherit a unit, so an unpicked one
    // has to be reported rather than quietly saved as the base unit.
    const unitId = (row.ipm_unit_id ?? "").trim();
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
// Rules & Status lives inside the EAN Table tab, below the EAN and Reorder
// tables. Its fields keep the column layout they were authored with; the rows
// are shifted down past the tables by ITEM_EAN_SECTION_RULES_ROW_OFFSET.
const ITEM_EAN_SECTION_EAN_TABLE_ROW = 1;
const ITEM_EAN_SECTION_REORDER_HEADING_ROW = 2;
const ITEM_EAN_SECTION_REORDER_TABLE_ROW = 3;
const ITEM_EAN_SECTION_RULES_HEADING_ROW = 4;
const ITEM_EAN_SECTION_RULES_ROW_OFFSET = ITEM_EAN_SECTION_RULES_HEADING_ROW;
const ITEM_RULES_AND_STATUS_FIELDS: (ERPDynamicModalField & {
  gridRowStart: number;
})[] = [
  // `item_is_active` lives in the Core Details tab; the remaining column-1 rows
  // shift up one so this column stays gapless.
  {
    name: "item_retail_item",
    label: "Retail Item",
    type: "checkbox",
    gridRowStart: 1,
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
    gridRowStart: 2,
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
    gridRowStart: 4,
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
    gridRowStart: 3,
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
];

function buildCustomFieldEditor(
  columns: LinkedRecordColumn[],
  createRow: (
    values: Record<string, string>,
    sourceRow?: LinkedRecordRow,
  ) => LinkedRecordRow,
  emptyState: string,
  options: {
    actionsLabel?: string;
    autoCreateFirstRowOnMount?: boolean;
    autoFocusInitialRowOnMount?: boolean;
    autoAppendOnEnter?: {
      columnKey: string;
      focusColumnKey?: string;
    };
    autoAppendOnSelect?: {
      columnKey: string;
      focusColumnKey?: string;
    };
    columnLayoutStorageKey?: string;
    removeDisabledRowIndexes?: number[];
    onColumnLayoutChange?: (columns: LinkedRecordColumnLayoutEntry[]) => void;
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
        actionsLabel={options.actionsLabel}
        autoCreateFirstRowOnMount={options.autoCreateFirstRowOnMount}
        autoFocusInitialRowOnMount={options.autoFocusInitialRowOnMount}
        autoAppendOnEnter={options.autoAppendOnEnter}
        autoAppendOnSelect={options.autoAppendOnSelect}
        columnLayoutStorageKey={options.columnLayoutStorageKey}
        columns={columns}
        createRow={(sourceRow) => createRow(values, sourceRow)}
        disabled={disabled}
        emptyState={emptyState}
        removeDisabledRowIndexes={options.removeDisabledRowIndexes}
        onColumnLayoutChange={options.onColumnLayoutChange}
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
  if (!(nextValues.ipm_profit_type ?? "").trim()) {
    nextValues.ipm_profit_type = ITEM_PRICE_DEFAULT_PROFIT_TYPE;
  }
  if (!(nextValues.ipm_is_active ?? "").trim()) {
    nextValues.ipm_is_active = ITEM_PRICE_INITIAL_FORM_VALUES.ipm_is_active;
  }
  if (!hasLinkedRows(nextValues[ITEM_PRICE_ROWS_FIELD_NAME])) {
    // Seeded with no unit: the user picks it from the Unit Conversion Table's units.
    nextValues[ITEM_PRICE_ROWS_FIELD_NAME] = serializeLinkedRecordRows([
      buildEmptyItemPriceRow(""),
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
  const defaultRows = rows.filter(isDefaultRow);
  if (normalizedPreferredUnitId) {
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
  return defaultRows[0] ?? rows[0] ?? null;
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
// Re-label, re-order, and show/hide the item form's hardcoded fields from the
// widget-masters config for menu 29 (fixed.form_section / form_field), matched
// via WIDGET_FIELD_NAME_BY_FORM_FIELD (each field `name` → backend field_name,
// case-insensitively). Unlike the shared applyWidgetFieldConfig, the many
// unconfigured item fields (flags, linked tables, notes) are kept in place
// rather than trailed to the end — only the configured fields are reordered,
// and only within their own form section. A configured field whose visibility
// is false is dropped; a field's fieldSecondaryText, when set, wins over
// fieldGuiName as its rendered label. An empty config map is a no-op, so a
// failed/empty fetch leaves the form on its hardcoded labels and order.
function applyItemWidgetFieldConfig(
  fields: ERPDynamicModalField[],
  config: Map<string, ResolvedFieldConfig>,
  fieldNameByFormField: Record<string, string>,
): ERPDynamicModalField[] {
  if (config.size === 0) {
    return fields;
  }
  const sections = buildItemFormSections(fields);
  const nextSections = sections.map((section) => {
    const resolvedFields: Array<{
      item: ERPDynamicModalField;
      originalIndex: number;
      configuredPosition: number | null;
    }> = [];
    section.fields.forEach((field, fieldIndex) => {
      const backendName = fieldNameByFormField[field.name];
      const resolved = backendName ? config.get(backendName.toLowerCase()) : undefined;
      // Drop a configured-but-hidden field entirely (both the field and its slot),
      // so the remaining configured fields still fill their own slots exactly.
      if (resolved && !resolved.visible) {
        return;
      }
      const nextLabel = resolved
        ? (resolved.secondaryText ?? "").trim() || resolved.label
        : "";
      resolvedFields.push({
        item: nextLabel ? { ...field, label: nextLabel } : field,
        originalIndex: fieldIndex,
        configuredPosition: resolved ? resolved.order : null,
      });
    });
    return {
      heading: section.heading,
      fields: reorderConfiguredItems(resolvedFields),
    };
  });
  return flattenItemFormSections(nextSections);
}
type LinkedTableColumnLayoutChangeArgs = {
  tableId: string;
  columns: LinkedRecordColumnLayoutEntry[];
  configuredColumns: Record<string, unknown>[];
  columnNameToKey: Record<string, string>;
};
type LinkedTableColumnLayoutChangeHandler = (
  args: LinkedTableColumnLayoutChangeArgs,
) => void;
function normalizeLinkedTableColumnName(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
}
function toNullableLayoutInteger(value: unknown): number | null {
  const normalized = toDisplayValue(value);
  if (!normalized) {
    return null;
  }
  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) ? parsed : null;
}
function toNullableLayoutNumber(value: unknown): number | null {
  const normalized = toDisplayValue(value);
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
function buildLinkedTableColumnConfigByKey(
  configuredColumns: Record<string, unknown>[],
  columnNameToKey: Record<string, string>,
): Map<string, Record<string, unknown>> {
  const configByKey = new Map<string, Record<string, unknown>>();
  for (const configuredColumn of configuredColumns) {
    const normalizedName = normalizeLinkedTableColumnName(
      toDisplayValue(getFieldValue(configuredColumn, "uiTblClmName")),
    );
    const columnKey = columnNameToKey[normalizedName];
    if (columnKey && !configByKey.has(columnKey)) {
      configByKey.set(columnKey, configuredColumn);
    }
  }
  return configByKey;
}
function buildUiTableColumnLayoutRequest(
  tableId: string,
  column: LinkedRecordColumnLayoutEntry,
  configuredColumn: Record<string, unknown> | undefined,
): UiTableColumnLayoutItem {
  const uiTblClmId = configuredColumn
    ? toDisplayValue(getFieldValue(configuredColumn, "uiTblClmId"))
    : "";
  const fallbackColumnNumber = String(column.position);
  const width =
    column.widthPx ??
    (configuredColumn
      ? toNullableLayoutNumber(getFieldValue(configuredColumn, "uiTblClmColumnWidth"))
      : null);
  return {
    ...(uiTblClmId ? { uiTblClmId } : {}),
    uiTblClmNo:
      (configuredColumn
        ? toDisplayValue(getFieldValue(configuredColumn, "uiTblClmNo"))
        : "") || fallbackColumnNumber,
    uiTblClmName:
      (configuredColumn
        ? toDisplayValue(getFieldValue(configuredColumn, "uiTblClmName"))
        : "") ||
      column.label ||
      column.key,
    uiTblClmTableId: tableId,
    uiTblClmColumnWidth: width,
    uiTblClmColumnVisibility: column.visible,
    uiTblClmColumnFocus: column.focus,
    uiTblClmColumnPosition: column.position,
    uiTblClmColumnNecessity: column.necessity,
    uiTblClmNextColumn: configuredColumn
      ? toNullableLayoutInteger(getFieldValue(configuredColumn, "uiTblClmNextColumn"))
      : null,
    uiTblClmPreviousColumn: configuredColumn
      ? toNullableLayoutInteger(getFieldValue(configuredColumn, "uiTblClmPreviousColumn"))
      : null,
    uiTblClmIsActive:
      toSelectBoolean(
        configuredColumn
          ? getFieldValue(configuredColumn, "uiTblClmIsActive")
          : undefined,
        "true",
      ) === "true",
  };
}
function buildItemFormFields(
  companyOptions: ERPDynamicSelectOption[],
  companyHandlers: LazyDropdownHandlers,
  branchOptions: ERPDynamicSelectOption[],
  groupOptions: ERPDynamicSelectOption[],
  groupHandlers: LazyDropdownHandlers,
  categoryOptions: ERPDynamicSelectOption[],
  categoryHandlers: LazyDropdownHandlers,
  brandOptions: ERPDynamicSelectOption[],
  brandHandlers: LazyDropdownHandlers,
  sectionOptions: ERPDynamicSelectOption[],
  sectionHandlers: LazyDropdownHandlers,
  unitOptions: ERPDynamicSelectOption[],
  godownOptions: ERPDynamicSelectOption[],
  taxOptions: ERPDynamicSelectOption[],
  taxHandlers: LazyDropdownHandlers,
  itemTaxRecordsById: ReadonlyMap<string, Record<string, unknown>>,
  hsnOptions: ERPDynamicSelectOption[],
  supplierOptions: ERPDynamicSelectOption[],
  supplierHandlers: LazyDropdownHandlers,
  customerGroupOptions: ERPDynamicSelectOption[],
  customerGroupHandlers: LazyDropdownHandlers,
  itemOptions: ERPDynamicSelectOption[],
  itemPriceTableColumnsConfig: Record<string, unknown>[],
  itemReorderTableColumnsConfig: Record<string, unknown>[],
  itemEanTableColumnsConfig: Record<string, unknown>[],
  widgetFieldConfig: Map<string, ResolvedFieldConfig>,
  onLinkedTableColumnLayoutChange?: LinkedTableColumnLayoutChangeHandler,
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
      // Only the first row (the base unit's row) has a locked unit factor.
      // Editability must NOT depend on the Base checkbox for any other row.
      readOnlyResolver: ({ rowIndex }) => rowIndex === 0,
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
    {
      key: "ir_branch_id",
      label: "Branch",
      type: "select",
      searchable: true,
      options: branchOptions,
      placeholder: "Item Branch",
      width: "10rem",
    },
    {
      key: "ir_unit_id",
      label: "Unit",
      type: "select",
      searchable: true,
      placeholder: "Global",
      width: "10rem",
    },
    {
      key: "ir_godown_id",
      label: "Godown",
      type: "select",
      searchable: true,
      options: godownOptions,
      placeholder: "Global Default",
      width: "11rem",
    },
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
  return applyItemWidgetFieldConfig(
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
        name: "item_hsn_code",
        label: "HSN Code",
        type: "select",
        searchable: true,
        required: true,
        options: hsnOptions,
      },
      {
        name: "item_default_tax_id",
        label: "Default Tax",
        type: "select",
        searchable: true,
        serverSearch: true,
        required: true,
        options: taxOptions,
        onSearchOpenChange: taxHandlers.onSearchOpenChange,
        onSearchQueryChange: taxHandlers.onSearchQueryChange,
        onValueChange: (payload) => {
          // Pin the picked option so it stays visible after the next lazy fetch
          // replaces the list, then run the price-with-tax recalculation.
          taxHandlers.onValueChange(payload);
          const { value, values } = payload;
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
        name: "item_is_active",
        label: "Is Active",
        type: "checkbox",
        controlStyle: {
          accentColor: "#dc2626",
        },
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
        serverSearch: true,
        options: companyOptions,
        onSearchOpenChange: companyHandlers.onSearchOpenChange,
        onSearchQueryChange: companyHandlers.onSearchQueryChange,
        onValueChange: companyHandlers.onValueChange,
      },
      {
        name: "item_branch_id",
        label: "Branch",
        type: "select",
        searchable: true,
        options: branchOptions,
      },
      {
        name: "item_group_id",
        label: "Item Group",
        type: "select",
        searchable: true,
        serverSearch: true,
        required: true,
        options: groupOptions,
        onSearchOpenChange: groupHandlers.onSearchOpenChange,
        onSearchQueryChange: groupHandlers.onSearchQueryChange,
        onValueChange: groupHandlers.onValueChange,
      },
      {
        name: "item_category_id",
        label: "Item Category",
        type: "select",
        searchable: true,
        serverSearch: true,
        options: categoryOptions,
        onSearchOpenChange: categoryHandlers.onSearchOpenChange,
        onSearchQueryChange: categoryHandlers.onSearchQueryChange,
        onValueChange: categoryHandlers.onValueChange,
      },
      {
        name: "item_section_id",
        label: "Item Section",
        type: "select",
        searchable: true,
        serverSearch: true,
        options: sectionOptions,
        onSearchOpenChange: sectionHandlers.onSearchOpenChange,
        onSearchQueryChange: sectionHandlers.onSearchQueryChange,
        onValueChange: sectionHandlers.onValueChange,
      },
      {
        name: "item_brand_id",
        label: "Item Brand",
        type: "select",
        searchable: true,
        serverSearch: true,
        required: true,
        options: brandOptions,
        onSearchOpenChange: brandHandlers.onSearchOpenChange,
        onSearchQueryChange: brandHandlers.onSearchQueryChange,
        onValueChange: brandHandlers.onValueChange,
      },
      {
        name: "item_supplier_id",
        label: "Default Supplier",
        type: "select",
        searchable: true,
        serverSearch: true,
        options: supplierOptions,
        onSearchOpenChange: supplierHandlers.onSearchOpenChange,
        onSearchQueryChange: supplierHandlers.onSearchQueryChange,
        onValueChange: supplierHandlers.onValueChange,
      },
      {
        name: "item_cust_group",
        label: "Item Customer Group",
        type: "select",
        searchable: true,
        serverSearch: true,
        options: customerGroupOptions,
        onSearchOpenChange: customerGroupHandlers.onSearchOpenChange,
        onSearchQueryChange: customerGroupHandlers.onSearchQueryChange,
        onValueChange: customerGroupHandlers.onValueChange,
      },
      {
        name: "itemInlineUnitConversionHeading",
        label: "",
        type: "custom",
        fieldStyle: {
          gridColumn: "1 / -1",
        },
        render: () => (
          <div style={ITEM_INLINE_SECTION_HEADING_STYLE}>Unit Conversion Table</div>
        ),
      },
      {
        name: ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME,
        label: "",
        type: "custom",
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
        render: ({ disabled, setValue, value, values }) => (
          <ItemLinkedRecordsEditor
            autoCreateFirstRowOnMount
            autoFocusInitialRowOnMount={false}
            autoAppendOnSelect={{ columnKey: "iuc_unit_id" }}
            columnLayoutStorageKey="item-master-unit-conversion"
            columns={unitConversionRowColumns}
            createRow={(_sourceRow, currentRows) => {
              const rows =
                currentRows ?? buildManagedItemUnitConversionRows(values);
              return buildEmptyItemUnitConversionRow(
                (values.item_base_unit_id ?? "").trim(),
                rows.length + 1,
              );
            }}
            disabled={disabled}
            emptyState="No unit conversions added."
            exclusiveTrueColumnKeys={["iuc_is_default_unit", "iuc_is_base_unit"]}
            removeDisabledRowIndexes={[0]}
            onChange={setValue}
            value={value}
          />
        ),
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
          "Add and edit price rows here. Price rows can only use units from the Unit Conversion Table above.",
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
          const priceUnitOptions = buildSelectableItemUnitOptions(
            values,
            unitOptions,
          );
          const nextPriceRowColumns = priceRowColumns.map((column) =>
            column.key === "ipm_unit_id"
              ? {
                ...column,
                options: priceUnitOptions,
                optionsResolver: (params: {
                  rowIndex: number;
                  rows: LinkedRecordRow[];
                }) =>
                  buildItemPriceUnitOptions(
                    values,
                    params.rows,
                    unitOptions,
                    params.rowIndex,
                  ),
              }
              : column,
          );
          return (
            <ItemLinkedRecordsEditor
              autoCreateFirstRowOnMount
              autoFocusInitialRowOnMount={false}
              autoAppendOnSelect={{ columnKey: "ipm_unit_id" }}
              columnLayoutStorageKey="item-master-price-list"
              columns={nextPriceRowColumns}
              createRow={() => buildEmptyItemPriceRow("")}
              disabled={disabled}
              emptyState="No price rows added."
              exclusiveTrueColumnKeys={["ipm_is_default_unit", "ipm_is_base_unit"]}
              removeDisabledRowIndexes={[0]}
              onColumnLayoutChange={(columns) =>
                onLinkedTableColumnLayoutChange?.({
                  tableId: ITEM_PRICE_TABLE_UI_ID,
                  columns,
                  configuredColumns: itemPriceTableColumnsConfig,
                  columnNameToKey: ITEM_PRICE_TABLE_COLUMN_NAME_TO_KEY,
                })
              }
              onChange={setValue}
              value={value}
            />
          );
        },
      },
      {
        name: "itemHeadingEanTable",
        label: "EAN Table",
        type: "heading",
        defaultExpanded: true,
        // Six columns so the Rules & Status block below keeps its column layout.
        sectionGridColumns: 6,
      },
      {
        name: ITEM_EAN_ROWS_FIELD_NAME,
        label: "",
        type: "custom",
        fieldStyle: {
          gridColumn: "1 / -1",
        },
        // The tables and the Rules & Status block share this section's grid, so
        // every row here is placed explicitly. Anchoring the first one at row 1
        // keeps the row numbers below as written (the form normalizes a
        // section's rows against its lowest gridRowStart).
        gridRowStart: ITEM_EAN_SECTION_EAN_TABLE_ROW,
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
              actionsLabel="Remove"
              autoCreateFirstRowOnMount
              autoFocusInitialRowOnMount={false}
              autoAppendOnEnter={{
                columnKey: "ean_code",
                focusColumnKey: "ean_code",
              }}
              autoAppendOnSelect={{ columnKey: "ean_unit_id" }}
              columnLayoutStorageKey="item-master-ean-code"
              columns={nextEanRowColumns}
              // A new EAN row starts with no unit picked: the Unit Conversion
              // Table decides which units the dropdown *offers*, not which one
              // is selected. Only sourceRow still carries a unit forward, so a
              // scanner appending rows from Enter keeps the unit the user chose.
              createRow={(sourceRow) => buildEmptyItemEanRow("", "", sourceRow)}
              disabled={disabled}
              emptyState="No EAN rows added."
              removeDisabledRowIndexes={[0]}
              onColumnLayoutChange={(columns) =>
                onLinkedTableColumnLayoutChange?.({
                  tableId: ITEM_EAN_TABLE_UI_ID,
                  columns,
                  configuredColumns: itemEanTableColumnsConfig,
                  columnNameToKey: ITEM_EAN_TABLE_COLUMN_NAME_TO_KEY,
                })
              }
              onChange={setValue}
              showRowIndex={false}
              value={value}
            />
          );
        },
      },
      {
        name: "itemInlineReorderTableHeading",
        label: "",
        type: "custom",
        fieldStyle: {
          gridColumn: "1 / -1",
        },
        gridRowStart: ITEM_EAN_SECTION_REORDER_HEADING_ROW,
        render: () => <div style={ITEM_INLINE_SECTION_HEADING_STYLE}>Reorder Table</div>,
      },
      {
        name: ITEM_REORDER_ROWS_FIELD_NAME,
        label: "",
        type: "custom",
        fieldStyle: {
          gridColumn: "1 / -1",
        },
        gridRowStart: ITEM_EAN_SECTION_REORDER_TABLE_ROW,
        helperText: "Optional. Use rows when this item needs multiple reorder rules.",
        validation: {
          custom: validateItemReorderRows,
        },
        onValueChange: ({ value, values, previousValues }) =>
          buildItemReorderRowsValueChangeResult(values, previousValues, value),
        render: ({ disabled, setValue, value, values }) => {
          const reorderUnitOptions = buildItemReorderUnitOptions(values, unitOptions);
          const nextReorderRowColumns = reorderRowColumns.map((column) =>
            column.key === "ir_unit_id"
              ? {
                ...column,
                options: reorderUnitOptions,
              }
              : column,
          );
          return (
            <ItemLinkedRecordsEditor
              autoCreateFirstRowOnMount
              autoFocusInitialRowOnMount={false}
              autoAppendOnSelect={{ columnKey: "ir_unit_id" }}
              columnLayoutStorageKey="item-master-reorder"
              columns={nextReorderRowColumns}
              createRow={() => buildEmptyItemReorderRow()}
              disabled={disabled}
              emptyState="No reorder rows added."
              removeDisabledRowIndexes={[0]}
              onColumnLayoutChange={(columns) =>
                onLinkedTableColumnLayoutChange?.({
                  tableId: ITEM_REORDER_TABLE_UI_ID,
                  columns,
                  configuredColumns: itemReorderTableColumnsConfig,
                  columnNameToKey: ITEM_REORDER_TABLE_COLUMN_NAME_TO_KEY,
                })
              }
              onChange={setValue}
              value={value}
            />
          );
        },
      },
      {
        name: "itemInlineRulesHeading",
        label: "",
        type: "custom",
        fieldStyle: {
          gridColumn: "1 / -1",
        },
        gridRowStart: ITEM_EAN_SECTION_RULES_HEADING_ROW,
        render: () => <div style={ITEM_INLINE_SECTION_HEADING_STYLE}>Rules & Status</div>,
      },
      ...ITEM_RULES_AND_STATUS_FIELDS.map((field) => ({
        ...field,
        gridRowStart: field.gridRowStart + ITEM_EAN_SECTION_RULES_ROW_OFFSET,
      })),
      {
        name: "itemHeadingInventory",
        label: "Inventory & Notes",
        type: "heading",
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
      ]),
    ),
    widgetFieldConfig,
    WIDGET_FIELD_NAME_BY_FORM_FIELD,
  );
}
// POST /items/create, GET /items/get and DELETE /items/delete now return the
// item nested under `data.item` (alongside sibling unit_conversions/prices/
// ean_codes/reorders arrays) instead of the item fields directly on `data`.
// Unwrap that nesting once so downstream field lookups (which only read
// top-level keys) keep working; a plain flat source (e.g. a grid row) passes
// through unchanged.
function unwrapItemSource(
  source: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!source) {
    return {};
  }
  const nestedItem = (source as { item?: unknown }).item;
  if (nestedItem && typeof nestedItem === "object" && !Array.isArray(nestedItem)) {
    return nestedItem as Record<string, unknown>;
  }
  return source;
}
function mapItemFormValues(
  source: Record<string, unknown> | null,
  defaults: ItemFormDefaults,
  itemTaxRecordsById: ReadonlyMap<string, Record<string, unknown>>,
): Record<string, string> {
  const rowSource = unwrapItemSource(source);
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
  const { getAll: getItemLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: listItemTaxes } = useApi<unknown>(ITEM_TAX_MASTER_LIST_ENDPOINT);
  const { getAll: getItemPriceTableColumns } = useApi<unknown>(UI_TABLE_COLUMNS_ENDPOINT);
  const { getAll: getItemReorderTableColumns } = useApi<unknown>(UI_TABLE_COLUMNS_ENDPOINT);
  const { getAll: getItemEanTableColumns } = useApi<unknown>(UI_TABLE_COLUMNS_ENDPOINT);
  const { run: saveUiTableColumnLayout } = useApi<
    unknown,
    SaveUiTableColumnLayoutRequest
  >(UI_TABLE_COLUMNS_CREATE_ENDPOINT, {
    method: "POST",
    toast: {
      success: false,
    },
  });
  const { getAll: getItemMasterWidgets } = useApi<unknown>(WIDGET_MASTER_LIST_ENDPOINT);
  const { getAll: getBranchLookup } = useApi<unknown>(BRANCH_LOOKUP_ENDPOINT);
  // Errors aren't toasted — a failed company-scoped branch refresh shouldn't
  // interrupt the form; the Branch field just keeps its prior option list.
  const { run: getBranchesByCompany } = useApi<unknown>(BRANCH_BY_COMPANY_ENDPOINT, {
    toast: { error: false },
  });
  const { getAll: getUnitLookup } = useApi<unknown>(UNIT_LOOKUP_ENDPOINT);
  const { getAll: getGodownLookup } = useApi<unknown>(GODOWN_LOOKUP_ENDPOINT);
  const { getAll: getHsnLookup } = useApi<unknown>(HSN_LOOKUP_ENDPOINT);
  const company = useLazyConfiguredDropdown(COMPANY_DROPDOWN_CONFIG);
  const group = useLazyConfiguredDropdown(GROUP_DROPDOWN_CONFIG);
  const category = useLazyConfiguredDropdown(CATEGORY_DROPDOWN_CONFIG);
  const brand = useLazyConfiguredDropdown(BRAND_DROPDOWN_CONFIG);
  const section = useLazyConfiguredDropdown(SECTION_DROPDOWN_CONFIG);
  const customerGroup = useLazyConfiguredDropdown(CUSTOMER_GROUP_DROPDOWN_CONFIG);
  const supplier = useLazyConfiguredDropdown(SUPPLIER_DROPDOWN_CONFIG);
  const tax = useLazyConfiguredDropdown(TAX_DROPDOWN_CONFIG);
  const [branchOptions, setBranchOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [unitOptions, setUnitOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [godownOptions, setGodownOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [hsnOptions, setHsnOptions] = useState<ERPDynamicSelectOption[]>([]);
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
  const [widgetFieldConfig, setWidgetFieldConfig] = useState<
    Map<string, ResolvedFieldConfig>
  >(() => new Map());
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
  // When Company changes, re-scope the Branch options to that company's active
  // branches and auto-select: keep the current branch if it still belongs to the
  // new company, otherwise select the first branch in the new list (mirrors the
  // company/branch switcher's businessContext.saga.ts auto-select behavior).
  const handleCompanyValueChange = useCallback(
    async (
      payload: ERPDynamicFieldValueChangePayload,
    ): Promise<ERPDynamicFieldValueChangeResult | void> => {
      company.handlers.onValueChange(payload);
      const companyId = payload.value.trim();
      if (!companyId) {
        return;
      }
      try {
        const response = await getBranchesByCompany({
          url: `${BRANCH_BY_COMPANY_ENDPOINT}/${companyId}`,
        });
        const nextBranchOptions = toLookupOptions(
          response,
          DEFAULT_BRANCH_OPTION,
          BRANCH_LOOKUP_KEYS,
        );
        setBranchOptions(nextBranchOptions);
        const currentBranchId = (payload.previousValues.item_branch_id ?? "").trim();
        const branchStillValid = nextBranchOptions.some(
          (option) => option.value === currentBranchId,
        );
        const nextBranchId = branchStillValid
          ? currentBranchId
          : (nextBranchOptions[0]?.value ?? "");
        if (nextBranchId === currentBranchId) {
          return;
        }
        return { values: { item_branch_id: nextBranchId } };
      } catch {
        // Keep whatever branch options/selection are currently shown.
      }
    },
    [company.handlers, getBranchesByCompany],
  );
  const companyFieldHandlers = useMemo(
    () => ({ ...company.handlers, onValueChange: handleCompanyValueChange }),
    [company.handlers, handleCompanyValueChange],
  );
  const handleLinkedTableColumnLayoutChange =
    useCallback<LinkedTableColumnLayoutChangeHandler>(
      ({ tableId, columns, configuredColumns, columnNameToKey }) => {
        void (async () => {
          const configByKey = buildLinkedTableColumnConfigByKey(
            configuredColumns,
            columnNameToKey,
          );
          try {
            await saveUiTableColumnLayout({
              body: {
                uiTblId: tableId,
                uiTblColumns: columns.map((column) =>
                  buildUiTableColumnLayoutRequest(tableId, column, configByKey.get(column.key))
                ),
              },
            });
          } catch (error) {
            // Persisting the column layout is a background nicety — the reorder/
            // resize is already applied locally. Swallow failures here so a
            // rejected save (validation, or the auth-refresh 401->retry race)
            // can't bubble up as an unhandled promise rejection and crash the
            // page. useApi already surfaces an error toast for the failure.
            console.warn("Failed to persist UI table column layout", error);
          }
        })();
      },
      [saveUiTableColumnLayout],
    );
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [
        branchesPayload,
        unitsPayload,
        godownsPayload,
        itemTaxesPayload,
        hsnPayload,
        itemsPayload,
        uiTableColumnsPayload,
        uiReorderTableColumnsPayload,
        uiEanTableColumnsPayload,
        itemMasterWidgetsPayload,
      ] = await Promise.allSettled([
        getBranchLookup(BRANCH_LOOKUP_QUERY),
        getUnitLookup(UNIT_LOOKUP_QUERY),
        getGodownLookup(GODOWN_LOOKUP_QUERY),
        listItemTaxes(ITEM_TAX_LIST_QUERY),
        getHsnLookup(HSN_LOOKUP_QUERY),
        getItemLookup(LOOKUP_QUERY_ITEMS),
        getItemPriceTableColumns(UI_TABLE_COLUMNS_QUERY),
        getItemReorderTableColumns(UI_REORDER_TABLE_COLUMNS_QUERY),
        getItemEanTableColumns(UI_EAN_TABLE_COLUMNS_QUERY),
        getItemMasterWidgets(ITEM_MASTER_WIDGET_QUERY),
      ]);
      if (!mounted) {
        return;
      }
      setBranchOptions(
        branchesPayload.status === "fulfilled"
          ? toLookupOptions(
            branchesPayload.value,
            DEFAULT_BRANCH_OPTION,
            BRANCH_LOOKUP_KEYS,
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
      setWidgetFieldConfig(
        itemMasterWidgetsPayload.status === "fulfilled"
          ? buildWidgetFieldConfig(itemMasterWidgetsPayload.value as WidgetMastersResponse)
          : new Map(),
      );
    })();
    return () => {
      mounted = false;
    };
  }, [
    getBranchLookup,
    getGodownLookup,
    getHsnLookup,
    getItemEanTableColumns,
    getItemMasterWidgets,
    getItemLookup,
    getItemPriceTableColumns,
    getItemReorderTableColumns,
    getUnitLookup,
    listItemTaxes,
  ]);
  const buildItemUnitConversionPayloadRows = useCallback(
    (itemId: string, values: Record<string, string>) => {
      const normalizedValues = normalizeItemLinkedSubmissionValues(
        values,
        itemTaxRecordsById,
      );
      const baseUnitId = resolveLinkedBaseUnitId(normalizedValues);
      // The Unit Conversion Table is the source of truth for its own payload.
      // Price rows are kept in sync with these rows via the value-change
      // handlers, so we always serialize the unit conversion rows directly
      // instead of deriving them from the price list.
      return buildManagedItemUnitConversionRows(normalizedValues).map((row) => {
        const unitId = (row.iuc_unit_id ?? "").trim() || baseUnitId;
        const payload: Record<string, unknown> = {
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
      const itemBranchId = (values.item_branch_id ?? "").trim();
      return buildManagedItemReorderRows(values).map((row) => {
        const payload: Record<string, unknown> = {
          ir_item_id: itemId,
          ir_branch_id: toNullableString((row.ir_branch_id ?? "").trim() || itemBranchId),
          ir_unit_id: toNullableString(row.ir_unit_id ?? ""),
          ir_godown_id: toNullableString(row.ir_godown_id ?? ""),
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
  const augmentItemDetailSource = useCallback(
    ({
      recordId,
      source,
      rowSource,
    }: {
      recordId: string | number;
      source: Record<string, unknown> | null;
      rowSource: Record<string, unknown> | null;
    }) => {
      const compositeSource = source ?? rowSource;
      const itemSource = unwrapItemSource(compositeSource);
      const itemId =
        toDisplayValue(getFieldValue(itemSource, "item_id")) || String(recordId);
      if (!itemId) {
        return null;
      }
      const preferredUnitId = toDisplayValue(
        getFieldValue(itemSource, "item_base_unit_id"),
      );
      // GET /items/get?item_id=X (the detail fetch that produced `source`)
      // already returns unit_conversions/prices/ean_codes/reorders as sibling
      // arrays on the same payload, so read them directly here instead of
      // issuing four more requests to the per-table list endpoints — those
      // aren't reliably implemented server-side (see
      // FIX_ITEM_UNIT_CONVERSIONS_404.md).
      const itemUnitConversionRows = extractArrayRecords(
        getFieldValue(compositeSource ?? {}, "unit_conversions"),
        DEFAULT_LOOKUP_ARRAY_KEYS,
      );
      // ipm_unit_id comes back as an iuc_id (it is a FK to item_unit_conversion),
      // but every price-row control matches on unit ids, so retarget it the same
      // way reorder/EAN rows are below — otherwise the Unit cell renders blank
      // and the conversion-factor lookups miss.
      const priceRows = mapLinkedRowUnitConversionIdsToUnitIds(
        filterItemPriceRowsByScope(
          extractArrayRecords(
            getFieldValue(compositeSource ?? {}, "prices"),
            DEFAULT_LOOKUP_ARRAY_KEYS,
          ),
          resolveItemPriceScope(itemSource),
        ),
        "ipm_unit_id",
        itemUnitConversionRows,
      );
      const reorderRows = mapLinkedRowUnitConversionIdsToUnitIds(
        extractArrayRecords(
          getFieldValue(compositeSource ?? {}, "reorders"),
          DEFAULT_LOOKUP_ARRAY_KEYS,
        ),
        "ir_unit_id",
        itemUnitConversionRows,
      );
      const eanRows = mapLinkedRowUnitConversionIdsToUnitIds(
        extractArrayRecords(
          getFieldValue(compositeSource ?? {}, "ean_codes"),
          DEFAULT_LOOKUP_ARRAY_KEYS,
        ),
        "ean_unit_id",
        itemUnitConversionRows,
      );
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
            buildEmptyItemReorderRow(),
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
        // Even with no child rows, still backfill the flat item_* fields
        // unwrapped from the composite GET response so the detail merge above
        // this callback doesn't stay stuck on the nested `data.item` shape.
        return Object.keys(itemSource).length > 0 ? { ...itemSource, item: { ...itemSource } } : null;
      }
      const augmentedItemSource: Record<string, unknown> = {
        // Backfills the flat item_* fields (unwrapped above from the composite
        // GET response's `data.item`) so callers reading the merged detail
        // source at the top level (mergeRowWithDetail, mapItemFormValues) see
        // them, since this augmented object is spread on top of the raw
        // (now-nested) detail source.
        ...itemSource,
        ...(managedPriceRow ?? {}),
        ...(managedReorderRow ?? {}),
        ...(managedEanRow ?? {}),
        [ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME]: serializedItemUnitConversionRows,
        [ITEM_PRICE_ROWS_FIELD_NAME]: serializedPriceRows,
        [ITEM_REORDER_ROWS_FIELD_NAME]: serializedReorderRows,
        [ITEM_EAN_ROWS_FIELD_NAME]: serializedEanRows,
        item_price_list: priceRows.length > 0 ? "true" : getFieldValue(itemSource, "item_price_list"),
      };
      return {
        ...augmentedItemSource,
        // CrudMasterPage merges this return value on top of the raw detail
        // source (`{...detailSource, ...supplementalSource}`), which still
        // carries the composite GET response's nested `item` key untouched.
        // mapItemFormValues later calls unwrapItemSource() on that merged
        // object, which prefers a nested `item` object when present — so
        // without overriding it here, it would re-read the *stale* nested
        // item (missing these linked-row fields) instead of this augmented
        // one, silently dropping the unit conversion/price/reorder/EAN rows.
        item: augmentedItemSource,
      };
    },
    [itemTaxRecordsById],
  );
  const itemFormFields = useMemo(
    () =>
      buildItemFormFields(
        company.options,
        companyFieldHandlers,
        branchOptions,
        group.options,
        group.handlers,
        category.options,
        category.handlers,
        brand.options,
        brand.handlers,
        section.options,
        section.handlers,
        unitOptions,
        godownOptions,
        tax.options,
        tax.handlers,
        itemTaxRecordsById,
        hsnOptions,
        supplier.options,
        supplier.handlers,
        customerGroup.options,
        customerGroup.handlers,
        itemOptions,
        itemPriceTableColumnsConfig,
        itemReorderTableColumnsConfig,
        itemEanTableColumnsConfig,
        widgetFieldConfig,
        handleLinkedTableColumnLayoutChange,
      ),
    [
      brand.options,
      brand.handlers,
      branchOptions,
      category.options,
      category.handlers,
      company.options,
      companyFieldHandlers,
      customerGroup.options,
      customerGroup.handlers,
      godownOptions,
      group.options,
      group.handlers,
      hsnOptions,
      itemOptions,
      itemEanTableColumnsConfig,
      itemTaxRecordsById,
      widgetFieldConfig,
      itemPriceTableColumnsConfig,
      itemReorderTableColumnsConfig,
      handleLinkedTableColumnLayoutChange,
      section.options,
      section.handlers,
      supplier.options,
      supplier.handlers,
      tax.options,
      tax.handlers,
      unitOptions,
    ],
  );
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted items. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 1's stored SQL; keys with no matching token are ignored. `wantdelete` is
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
  // Right-click "Visible Settings" popup over the item create/update modal —
  // brings the item master to parity with the other master pages (unit/godown/
  // etc.). Toggling a field's visibility updates widgetFieldConfig, which the
  // itemFormFields memo re-applies live; Save persists the change to the server.
  const { getAll: getWidgetConfigTree } = useApi<WidgetMastersResponse>(
    WIDGET_CONFIG_TREE_ENDPOINT,
    { toast: { error: false } },
  );
  const { run: saveVisibility, loading: savingVisibility } = useApi(
    WIDGET_VISIBILITY_ENDPOINT,
    { method: "PATCH" },
  );
  const [configSections, setConfigSections] = useState<WidgetMasterSectionConfig[]>([]);
  // Section-level visibility overrides keyed by sectionId; falls back to the
  // fetched sectionVisibility until the user toggles a section.
  const [sectionVisibility, setSectionVisibility] = useState<Map<number, boolean>>(
    () => new Map(),
  );
  // Edited secondary text keyed by fieldId; falls back to the fetched value.
  const [secondaryTextById, setSecondaryTextById] = useState<Map<number, string>>(
    () => new Map(),
  );
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const treeLoadedRef = useRef(false);
  const visibilityControllerRef = useRef<ERPDynamicModalController | null>(null);
  // Fetched lazily the first time the popup opens, then cached. Scoped to the
  // "Web" platform so a menu's Desktop-only section stays out of the tree.
  const loadConfigTree = useCallback(async () => {
    if (treeLoadedRef.current) {
      return;
    }
    treeLoadedRef.current = true;
    setTreeLoading(true);
    setTreeError(null);
    try {
      const payload = await getWidgetConfigTree({
        menu_id: ITEM_MASTER_WIDGET_SECTION_MENU_ID,
        platform: ITEM_MASTER_WIDGET_TYPE,
      });
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
  // modal on top via its controller.
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
  const handleToggleField = useCallback(
    (backendName: string, checked: boolean) => {
      const key = backendName.toLowerCase();
      setWidgetFieldConfig((prev) => {
        const next = new Map(prev);
        const existing = next.get(key);
        next.set(
          key,
          existing
            ? { ...existing, visible: checked }
            : { label: "", order: Number.MAX_SAFE_INTEGER, visible: checked },
        );
        return next;
      });
    },
    [],
  );
  const handleToggleSection = useCallback((sectionId: number, checked: boolean) => {
    setSectionVisibility((prev) => {
      const next = new Map(prev);
      next.set(sectionId, checked);
      return next;
    });
  }, []);
  const handleChangeSecondaryText = useCallback((fieldId: number, value: string) => {
    setSecondaryTextById((prev) => {
      const next = new Map(prev);
      next.set(fieldId, value);
      return next;
    });
  }, []);
  // Build the tree view from the /config payload, deriving each checkbox from the
  // live form visibility map so the popup and the rendered form stay in sync.
  const treeSections = useMemo<WidgetTreeSectionView[]>(
    () =>
      configSections.map((section) => ({
        sectionId: section.sectionId,
        label: section.sectionGuiName?.trim() || section.sectionName || "Section",
        visible:
          sectionVisibility.get(section.sectionId) ?? section.sectionVisibility !== false,
        fields: (Array.isArray(section.fields) ? section.fields : []).map((field) => {
          const key = (field.fieldName ?? "").trim().toLowerCase();
          const configEntry = widgetFieldConfig.get(key);
          return {
            fieldId: field.fieldId,
            fieldName: field.fieldName,
            label: (field.fieldGuiName ?? "").trim() || field.fieldName,
            secondaryText:
              secondaryTextById.get(field.fieldId) ?? (field.fieldSecondaryText ?? ""),
            checked: configEntry ? configEntry.visible : field.fieldVisibility !== false,
            controllable: WIDGET_CONTROLLABLE_FIELD_NAMES.has(key),
          };
        }),
      })),
    [configSections, sectionVisibility, secondaryTextById, widgetFieldConfig],
  );
  // PATCH the current section/field visibility + secondary text back to the server
  // in the documented { data: [{ sectionId, sectionGuiName, sectionVisibility,
  // fields: [{ fieldId, fieldSecondaryText, fieldVisibility }] }] } shape. Throws on
  // failure so the hosting modal stays open (useApi toasts the error).
  const handleVisibilitySubmit = useCallback(async () => {
    const payload = {
      data: configSections.map((section) => ({
        sectionId: section.sectionId,
        sectionGuiName: section.sectionGuiName?.trim() || section.sectionName || "Section",
        sectionVisibility:
          sectionVisibility.get(section.sectionId) ?? section.sectionVisibility !== false,
        fields: (Array.isArray(section.fields) ? section.fields : []).map((field) => {
          const key = (field.fieldName ?? "").trim().toLowerCase();
          const configEntry = widgetFieldConfig.get(key);
          return {
            fieldId: field.fieldId,
            fieldSecondaryText:
              secondaryTextById.get(field.fieldId) ?? field.fieldSecondaryText ?? "",
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
      title="Item"
      iconName="item_master"
      entityLabel="item"
      entityLabelPlural="items"
      // The modal appends its own "— New" / "— Edit" mode suffix.
      createModalTitle="Item Master"
      editModalTitle="Item Master"
      auditHistory={{ screenName: "Item Master" }}
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
      gridTableName={GRID_TABLE_NAME}
      listResponseStyleArrayKey=""
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Item List"
      listTitleOverride="Item List"
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
      // Non-dense flow so an inline section heading (e.g. "Reference Links")
      // always breaks to a fresh row. With dense packing, the lone "Is Active"
      // checkbox that ends Core Details leaves two empty cells, and the grid
      // back-fills them with the fields that follow the full-width heading
      // (Company/Branch) — visually pulling them above their own subsection.
      modalFormDenseGrid={false}
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
      mapFormValues={({ source, defaults }) => {
        // Seed the lazy Company/Item Group/Category/Brand/Section/Customer Group/
        // Supplier/Default Tax dropdowns so the triggers show the saved labels on
        // edit/view before each field is opened (and lazily loaded).
        const rowSource = unwrapItemSource(source);
        company.seedSelected(
          toDisplayValue(getFirstDefinedValue(rowSource, COMPANY_SOURCE_ID_KEYS)),
          toDisplayValue(getFirstDefinedValue(rowSource, COMPANY_SOURCE_NAME_KEYS)),
        );
        group.seedSelected(
          toDisplayValue(getFirstDefinedValue(rowSource, GROUP_SOURCE_ID_KEYS)),
          toDisplayValue(getFirstDefinedValue(rowSource, GROUP_SOURCE_NAME_KEYS)),
        );
        category.seedSelected(
          toDisplayValue(getFirstDefinedValue(rowSource, CATEGORY_SOURCE_ID_KEYS)),
          toDisplayValue(getFirstDefinedValue(rowSource, CATEGORY_SOURCE_NAME_KEYS)),
        );
        brand.seedSelected(
          toDisplayValue(getFirstDefinedValue(rowSource, BRAND_SOURCE_ID_KEYS)),
          toDisplayValue(getFirstDefinedValue(rowSource, BRAND_SOURCE_NAME_KEYS)),
        );
        section.seedSelected(
          toDisplayValue(getFirstDefinedValue(rowSource, SECTION_SOURCE_ID_KEYS)),
          toDisplayValue(getFirstDefinedValue(rowSource, SECTION_SOURCE_NAME_KEYS)),
        );
        customerGroup.seedSelected(
          toDisplayValue(getFirstDefinedValue(rowSource, CUSTOMER_GROUP_SOURCE_ID_KEYS)),
          toDisplayValue(getFirstDefinedValue(rowSource, CUSTOMER_GROUP_SOURCE_NAME_KEYS)),
        );
        supplier.seedSelected(
          toDisplayValue(getFirstDefinedValue(rowSource, SUPPLIER_SOURCE_ID_KEYS)),
          toDisplayValue(getFirstDefinedValue(rowSource, SUPPLIER_SOURCE_NAME_KEYS)),
        );
        tax.seedSelected(
          toDisplayValue(getFirstDefinedValue(rowSource, TAX_SOURCE_ID_KEYS)),
          toDisplayValue(getFirstDefinedValue(rowSource, TAX_SOURCE_NAME_KEYS)),
        );
        return mapItemFormValues(source, defaults, itemTaxRecordsById);
      }}
      buildRequestPayload={async (params) => {
        const itemPayload = await buildItemRequestPayload(params);
        // Persist the item together with its linked tables (unit conversions,
        // prices, EAN codes, reorders) in the one /items/create composite call.
        // The server injects the parent item_id into every child row, so the id
        // passed to the builders here is only a placeholder ("" on create).
        const normalizedValues = normalizeItemLinkedSubmissionValues(
          params.values,
          itemTaxRecordsById,
        );
        const childItemId =
          params.shouldUpdate && params.editingItemId !== null
            ? String(params.editingItemId)
            : "";
        const includeItemPrices =
          (normalizedValues.item_price_list ?? "false") === "true" ||
          hasMeaningfulItemPriceRows(normalizedValues);
        return {
          ...itemPayload,
          unit_conversions: buildItemUnitConversionPayloadRows(
            childItemId,
            normalizedValues,
          ),
          prices: includeItemPrices
            ? buildItemPricePayloadRows(childItemId, normalizedValues)
            : [],
          ean_codes: buildItemEanPayloadRows(childItemId, normalizedValues),
          reorders: buildItemReorderPayloadRows(childItemId, normalizedValues),
        };
      }}
      onCrudControllerReady={onCrudControllerReady}
      onModalOpenChange={(open, variantKey) => {
        // Clear the lazy Company/Item Group/Category/Brand/Section/Customer Group/
        // Supplier/Default Tax dropdowns when the create modal opens so no stale
        // selection from a previously edited item lingers (they reload on open).
        if (open && variantKey === "master-create") {
          company.seedSelected("", "");
          group.seedSelected("", "");
          category.seedSelected("", "");
          brand.seedSelected("", "");
          section.seedSelected("", "");
          customerGroup.seedSelected("", "");
          supplier.seedSelected("", "");
          tax.seedSelected("", "");
        }
        onModalOpenChange?.(open, variantKey);
      }}
      afterSubmitSuccess={async ({ response, payload, values, editingItemId, shouldUpdate }) => {
        const responseSource = extractResponseRecord(response);
        const savedItemId =
          toDisplayValue(getFieldValue(unwrapItemSource(responseSource), "item_id")) ||
          toDisplayValue(payload.item_id) ||
          (editingItemId !== null ? String(editingItemId) : "");
        if (!savedItemId) {
          return;
        }
        // The item and all of its linked rows (unit conversions, prices,
        // reorders, EAN codes) are created/updated in the single /items/create
        // composite call (see buildRequestPayload). Rows the user removed are
        // NOT deleted from this client — the per-table /delete endpoints
        // (/item-unit-conversions/delete, /item-prices/delete,
        // /item-reorders/delete, /item-ean-codes/delete) must never be called
        // from here; the server owns that cleanup.
        await onItemSaved?.({
          itemId: savedItemId,
          shouldUpdate,
          values,
        });
      }}
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