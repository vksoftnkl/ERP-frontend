"use client";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiChevronDown, FiMoreVertical, FiPlus, FiSearch, FiTrash2 } from "react-icons/fi";
import { toast } from "react-toastify";
import { useBusinessContext } from "@/components/layout/business-context";
import type { ERPDynamicSelectOption } from "@/components/library/ui";
import tableStyles from "@/components/ui/table.module.scss";
import { extractRows } from "@/features/masters/shared/normalizers";
import { useApi } from "@/hooks/useApi";
import {
  getAuthSessionId,
  getAuthUserId,
  getOrCreateClientDeviceId,
} from "@/lib/auth/session";
import {
  type ItemPriceDetailsPayload,
  type ItemTaxDetailPayload,
  useLazyGetGodownOptionsQuery,
  useLazyGetItemOptionsQuery,
  useLazyGetItemPriceDetailsQuery,
  useLazyGetItemTaxByIdQuery,
  useLazyGetTaxOptionsQuery,
  useLazyGetUnitOptionsQuery,
} from "@/store/api/lookupsApi";
import type { ApiSuccessResponse, ListMeta } from "@/utils/types";
import type {
  OpeningStockSaveDetail,
  OpeningStockSaveRequest,
} from "./opening-stock.types";
import styles from "./page.module.scss";
type ColumnAlign = "left" | "center" | "right";
type ColumnKind = "text" | "number" | "date" | "select" | "lookup";
type LookupKind = "item" | "godown";
type UiTableColumnPayload = {
  uiTblClmNo?: string;
  uiTblClmName: string | null;
  uiTblClmColumnWidth: number | null;
  uiTblClmColumnVisibility: boolean | null;
  uiTblClmColumnPosition: number | null;
};
type ColumnSchema = {
  header: string;
  defaultWidth: string;
  align: ColumnAlign;
  kind: ColumnKind;
  lookupKind?: LookupKind;
  placeholder?: string;
  options?: readonly string[];
  defaultValue?: string;
};
type ColumnDefinition = ColumnSchema & {
  key: string;
  width: string;
};
type OpeningStockRow = {
  id: number;
  values: Record<string, string>;
};
type AccountLedgerRecord = {
  ledId: string;
  ledName: string;
};
const UI_TABLE_COLUMNS_LIST_ENDPOINT = "/ui-table-columns/list";
const ACCOUNT_LEDGER_LIST_ENDPOINT = "/account-ledger-masters/list";
const OPENING_STOCK_SAVE_ENDPOINT = "/opening-stocks";
const UI_TABLE_COLUMNS_QUERY = {
  uiTblClmTableId: "5",
  page: "1",
  limit: "100",
} as const;
const UI_TABLE_COLUMNS_TOAST_OPTIONS = {
  success: false,
  error: false,
} as const;
const OPENING_STOCK_LEDGER_NAME = "opening stock";
const LOOKUP_SEARCH_DEBOUNCE_MS = 250;
const SERIAL_NUMBER_COLUMN_WIDTH = "112px";
const TRACKING_OPTIONS = ["NONE", "BATCH", "LOT"] as const;
const PROFIT_TYPE_OPTIONS = ["PERCENT", "VALUE"] as const;
const CESS_TYPE_OPTIONS = ["NONE", "PERCENT", "PER_UNIT"] as const;
const DEFAULT_ITEM_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Clear selection",
};
const DEFAULT_GODOWN_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Clear selection",
};
const LOOKUP_FIELD_CONFIG: Record<
  LookupKind,
  {
    labelField: string;
    idField: string;
    emptyMessage: string;
  }
> = {
  item: {
    labelField: "itemname",
    idField: "oslitemid",
    emptyMessage: "No items found.",
  },
  godown: {
    labelField: "godown",
    idField: "oslgodownid",
    emptyMessage: "No godowns found.",
  },
};
const COLUMN_SCHEMA: Record<string, ColumnSchema> = {
  barcode: {
    header: "Barcode",
    defaultWidth: "100px",
    align: "left",
    kind: "text",
    placeholder: "Barcode",
  },
  code: {
    header: "Code",
    defaultWidth: "100px",
    align: "left",
    kind: "text",
    placeholder: "Item code",
  },
  itemname: {
    header: "Item Name",
    defaultWidth: "220px",
    align: "left",
    kind: "lookup",
    lookupKind: "item",
    placeholder: "Search item",
  },
  godown: {
    header: "Godown",
    defaultWidth: "150px",
    align: "left",
    kind: "lookup",
    lookupKind: "godown",
    placeholder: "Search godown",
  },
  uom: {
    header: "Uom",
    defaultWidth: "100px",
    align: "left",
    kind: "text",
    placeholder: "Uom",
  },
  taxname: {
    header: "Tax Name",
    defaultWidth: "120px",
    align: "left",
    kind: "text",
    placeholder: "Tax name",
  },
  openingqty: {
    header: "Opening Qty",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.000",
    defaultValue: "0.000",
  },
  freeqty: {
    header: "Free Qty",
    defaultWidth: "100px",
    align: "right",
    kind: "number",
    placeholder: "0.000",
    defaultValue: "0.000",
  },
  baseqty: {
    header: "Base Qty",
    defaultWidth: "100px",
    align: "right",
    kind: "number",
    placeholder: "0.000",
    defaultValue: "0.000",
  },
  convfactor: {
    header: "Conv Factor",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "1.000",
    defaultValue: "1.000",
  },
  batchno: {
    header: "Batch No",
    defaultWidth: "120px",
    align: "left",
    kind: "text",
    placeholder: "Batch no",
  },
  serialno: {
    header: "Serial No",
    defaultWidth: "120px",
    align: "left",
    kind: "text",
    placeholder: "Serial no",
  },
  batchdate: {
    header: "Batch Date",
    defaultWidth: "120px",
    align: "left",
    kind: "date",
  },
  mfgdate: {
    header: "Mfg Date",
    defaultWidth: "120px",
    align: "left",
    kind: "date",
  },
  expirydate: {
    header: "Expiry Date",
    defaultWidth: "120px",
    align: "left",
    kind: "date",
  },
  costprice: {
    header: "Cost Price",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    defaultValue: "0.00",
  },
  costwot: {
    header: "Cost Wot",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    defaultValue: "0.00",
  },
  profittype: {
    header: "Profit Type",
    defaultWidth: "110px",
    align: "left",
    kind: "select",
    options: PROFIT_TYPE_OPTIONS,
    defaultValue: PROFIT_TYPE_OPTIONS[0],
  },
  roundoff: {
    header: "Round Off",
    defaultWidth: "100px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    defaultValue: "0.00",
  },
  priceawot: {
    header: "Price A Wot",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    defaultValue: "0.00",
  },
  priceamarkup: {
    header: "Price A Markup",
    defaultWidth: "120px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    defaultValue: "0.00",
  },
  pricea: {
    header: "Price A",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    defaultValue: "0.00",
  },
  pricebwot: {
    header: "Price B Wot",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    defaultValue: "0.00",
  },
  pricebmarkup: {
    header: "Price B Markup",
    defaultWidth: "120px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    defaultValue: "0.00",
  },
  priceb: {
    header: "Price B",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    defaultValue: "0.00",
  },
  pricecwot: {
    header: "Price C Wot",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    defaultValue: "0.00",
  },
  pricecmarkup: {
    header: "Price C Markup",
    defaultWidth: "120px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    defaultValue: "0.00",
  },
  pricec: {
    header: "Price C",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    defaultValue: "0.00",
  },
  pricedwot: {
    header: "Price D Wot",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    defaultValue: "0.00",
  },
  pricedmarkup: {
    header: "Price D Markup",
    defaultWidth: "120px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    defaultValue: "0.00",
  },
  priced: {
    header: "Price D",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    defaultValue: "0.00",
  },
  mrp: {
    header: "M.R.P",
    defaultWidth: "100px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    defaultValue: "0.00",
  },
  msp: {
    header: "M.S.P",
    defaultWidth: "100px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    defaultValue: "0.00",
  },
  remarks: {
    header: "Remarks",
    defaultWidth: "220px",
    align: "left",
    kind: "text",
    placeholder: "Remarks",
  },
  oslitemid: {
    header: "osl item id",
    defaultWidth: "120px",
    align: "left",
    kind: "text",
    placeholder: "Item id",
  },
  oslunitid: {
    header: "osl unit id",
    defaultWidth: "120px",
    align: "left",
    kind: "text",
    placeholder: "Unit id",
  },
  oslbaseuomid: {
    header: "osl base uom id",
    defaultWidth: "130px",
    align: "left",
    kind: "text",
    placeholder: "Base uom id",
  },
  oslgodownid: {
    header: "osl godown id",
    defaultWidth: "130px",
    align: "left",
    kind: "text",
    placeholder: "Godown id",
  },
  osltrackingtype: {
    header: "osl tracking type",
    defaultWidth: "130px",
    align: "left",
    kind: "select",
    options: TRACKING_OPTIONS,
    defaultValue: TRACKING_OPTIONS[0],
  },
  osltaxid: {
    header: "osl tax id",
    defaultWidth: "110px",
    align: "left",
    kind: "text",
    placeholder: "Tax id",
  },
  osltaxperc: {
    header: "osl tax perc",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.000",
    defaultValue: "0.000",
  },
  oslcesstype: {
    header: "osl cess type",
    defaultWidth: "120px",
    align: "left",
    kind: "select",
    options: CESS_TYPE_OPTIONS,
    defaultValue: CESS_TYPE_OPTIONS[0],
  },
  oslcessperc: {
    header: "osl cess perc",
    defaultWidth: "110px",
    align: "right",
    kind: "number",
    placeholder: "0.000",
    defaultValue: "0.000",
  },
  oslcessperunit: {
    header: "osl cess per unit",
    defaultWidth: "120px",
    align: "right",
    kind: "number",
    placeholder: "0.00",
    defaultValue: "0.00",
  },
};
const FALLBACK_COLUMN_KEYS = [
  "barcode",
  "code",
  "itemname",
  "godown",
  "uom",
  "taxname",
  "openingqty",
  "freeqty",
  "baseqty",
  "convfactor",
  "batchno",
  "serialno",
  "costprice",
  "pricea",
  "mrp",
  "remarks",
] as const;
const HIDDEN_INTERNAL_COLUMN_KEYS = new Set([
  "oslitemid",
  "oslunitid",
  "oslbaseuomid",
  "oslgodownid",
  "osltaxid",
]);
const ITEM_AUTOFILL_FIELD_KEYS = [
  "barcode",
  "code",
  "godown",
  "uom",
  "taxname",
  "baseqty",
  "convfactor",
  "costprice",
  "costwot",
  "profittype",
  "roundoff",
  "priceawot",
  "priceamarkup",
  "pricea",
  "pricebwot",
  "pricebmarkup",
  "priceb",
  "pricecwot",
  "pricecmarkup",
  "pricec",
  "pricedwot",
  "pricedmarkup",
  "priced",
  "mrp",
  "msp",
  "remarks",
  "oslunitid",
  "oslbaseuomid",
  "oslgodownid",
  "osltrackingtype",
  "osltaxid",
  "osltaxperc",
  "oslcesstype",
  "oslcessperc",
  "oslcessperunit",
] as const;
const QUANTITY_FORMATTER = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const VALUE_FORMATTER = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
function cx(...tokens: Array<string | false | undefined>): string {
  return tokens.filter(Boolean).join(" ");
}
function normalizeColumnName(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
}
function parseDecimal(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}
function formatQuantityValue(value: number): string {
  return QUANTITY_FORMATTER.format(value).replace(/,/g, "");
}
function getTodayInputValue(): string {
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}
function toNullableTrimmedString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
function toIsoDateTime(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? `${normalized}T00:00:00.000Z` : null;
}
function formatAccountingYear(referenceDate: string | null | undefined): string | null {
  const normalized = referenceDate?.trim() || getTodayInputValue();
  const parsedMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!parsedMatch) {
    return null;
  }
  const year = Number(parsedMatch[1]);
  const month = Number(parsedMatch[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}
function toInputValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : String(value);
}
function normalizeOpeningStockProfitType(value: string | null | undefined): string {
  const normalized = (value ?? "").trim().toUpperCase();
  if (normalized === "BY_AMOUNT" || normalized === "BY RS" || normalized === "VALUE") {
    return "VALUE";
  }
  return "PERCENT";
}
function normalizeOpeningStockCessType(value: string | null | undefined): string {
  const normalized = (value ?? "").trim().toUpperCase();
  if (normalized === "PER_UNIT" || normalized === "UNIT") {
    return "PER_UNIT";
  }
  if (normalized === "PERCENT") {
    return "PERCENT";
  }
  return "NONE";
}
function resolveTrackingType(item: ItemPriceDetailsPayload["item"]): string {
  return item.item_is_batch_based || item.item_is_expiry_item ? "BATCH" : "NONE";
}
function buildTaxSelectionValues(taxDetail: ItemTaxDetailPayload | ItemPriceDetailsPayload["item_tax"]): Record<string, string> {
  return {
    taxname: toInputValue(taxDetail?.tax_name),
    osltaxid: toInputValue(taxDetail?.tax_id),
    osltaxperc: toInputValue(taxDetail?.tax_gst_rate_total),
    oslcesstype: normalizeOpeningStockCessType(taxDetail?.tax_cess_type),
    oslcessperc: toInputValue(taxDetail?.tax_cess_perc),
    oslcessperunit: toInputValue(taxDetail?.tax_cess_unit),
  };
}
function buildPriceSelectionValues(
  detail: ItemPriceDetailsPayload,
  priceRecord: ItemPriceDetailsPayload["item_prices"][number] | null,
  unitOptionsByValue: Map<string, string>,
  godownOptionsByValue: Map<string, string>,
  currentValues: Record<string, string>,
): Record<string, string> {
  const resolvedUnitId = priceRecord?.ipm_unit_id ?? detail.item.item_base_unit_id ?? "";
  const convFactor = priceRecord?.ipm_to_base_factor ?? 1;
  const openingQty = parseDecimal(currentValues.openingqty);
  const resolvedGodownId = priceRecord?.ipm_godown_id ?? "";
  return {
    uom: unitOptionsByValue.get(resolvedUnitId) ?? "",
    godown: godownOptionsByValue.get(resolvedGodownId) ?? "",
    baseqty: formatQuantityValue(openingQty * convFactor),
    convfactor: toInputValue(convFactor),
    costprice: toInputValue(priceRecord?.ipm_cost_price),
    costwot: toInputValue(priceRecord?.ipm_cost_wot),
    profittype: normalizeOpeningStockProfitType(priceRecord?.ipm_profit_type),
    roundoff: toInputValue(priceRecord?.ipm_round_off),
    priceawot: toInputValue(priceRecord?.ipm_price_a_wot),
    priceamarkup: toInputValue(priceRecord?.ipm_price_a_markup_perc),
    pricea: toInputValue(priceRecord?.ipm_sales_price_a),
    pricebwot: toInputValue(priceRecord?.ipm_price_b_wot),
    pricebmarkup: toInputValue(priceRecord?.ipm_price_b_markup_perc),
    priceb: toInputValue(priceRecord?.ipm_sales_price_b),
    pricecwot: toInputValue(priceRecord?.ipm_price_c_wot),
    pricecmarkup: toInputValue(priceRecord?.ipm_price_c_markup_perc),
    pricec: toInputValue(priceRecord?.ipm_sales_price_c),
    pricedwot: toInputValue(priceRecord?.ipm_price_d_wot),
    pricedmarkup: toInputValue(priceRecord?.ipm_price_d_markup_perc),
    priced: toInputValue(priceRecord?.ipm_sales_price_d),
    mrp: toInputValue(priceRecord?.ipm_max_price),
    msp: toInputValue(priceRecord?.ipm_min_price),
    remarks: toInputValue(
      priceRecord?.ipm_uom_remarks ?? priceRecord?.ipm_cost_remarks ?? detail.item.item_notes,
    ),
    oslunitid: toInputValue(resolvedUnitId),
    oslbaseuomid: toInputValue(priceRecord?.ipm_id),
    oslgodownid: toInputValue(resolvedGodownId),
  };
}
function resolveItemPriceRecordByUnitId(
  detail: ItemPriceDetailsPayload,
  unitId: string,
): ItemPriceDetailsPayload["item_prices"][number] | null {
  const normalizedUnitId = unitId.trim();
  if (!normalizedUnitId) {
    return resolveDefaultItemPriceRecord(detail.item_prices);
  }
  return (
    detail.item_prices.find((record) => record.ipm_unit_id === normalizedUnitId) ??
    resolveDefaultItemPriceRecord(detail.item_prices)
  );
}
function buildUomOptions(
  detail: ItemPriceDetailsPayload | null | undefined,
  unitOptionsByValue: Map<string, string>,
): ERPDynamicSelectOption[] {
  if (!detail) {
    return [];
  }
  const optionMap = new Map<string, string>();
  for (const [index, priceRecord] of detail.item_prices.entries()) {
    if (!priceRecord.ipm_unit_id.trim()) {
      continue;
    }
    if (optionMap.has(priceRecord.ipm_unit_id)) {
      continue;
    }
    optionMap.set(
      priceRecord.ipm_unit_id,
      unitOptionsByValue.get(priceRecord.ipm_unit_id) ?? `UOM ${index + 1}`,
    );
  }
  return Array.from(optionMap, ([value, label]) => ({ value, label }));
}
function toColumnWidth(value: number | null | undefined, fallback: string): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return `${value}px`;
}
function getAlignClass(align: ColumnAlign): string {
  if (align === "right") {
    return tableStyles.alignRight;
  }
  if (align === "center") {
    return tableStyles.alignCenter;
  }
  return tableStyles.alignLeft;
}
function createUnknownColumnSchema(header: string): ColumnSchema {
  return {
    header,
    defaultWidth: "120px",
    align: "left",
    kind: "text",
    placeholder: header,
  };
}
function createFallbackColumns(): ColumnDefinition[] {
  return FALLBACK_COLUMN_KEYS.map((key) => {
    const schema = COLUMN_SCHEMA[key];
    return {
      key,
      header: schema.header,
      width: schema.defaultWidth,
      align: schema.align,
      kind: schema.kind,
      lookupKind: schema.lookupKind,
      placeholder: schema.placeholder,
      options: schema.options,
      defaultValue: schema.defaultValue,
      defaultWidth: schema.defaultWidth,
    };
  }).filter((column) => !HIDDEN_INTERNAL_COLUMN_KEYS.has(column.key));
}
function createDefaultRowValues(): Record<string, string> {
  return Object.entries(COLUMN_SCHEMA).reduce<Record<string, string>>((accumulator, [key, schema]) => {
    accumulator[key] = schema.defaultValue ?? "";
    return accumulator;
  }, {});
}
const DEFAULT_ROW_VALUES = createDefaultRowValues();
function createItemAutofillResetValues(): Record<string, string> {
  return ITEM_AUTOFILL_FIELD_KEYS.reduce<Record<string, string>>((accumulator, key) => {
    accumulator[key] = DEFAULT_ROW_VALUES[key] ?? "";
    return accumulator;
  }, {});
}
const ITEM_AUTOFILL_RESET_VALUES = createItemAutofillResetValues();
function buildPendingItemSelectionValues(option: ERPDynamicSelectOption): Record<string, string> {
  return {
    ...ITEM_AUTOFILL_RESET_VALUES,
    itemname: option.value ? option.label : "",
    oslitemid: option.value,
  };
}
function createRow(id: number, overrides: Record<string, string> = {}): OpeningStockRow {
  return {
    id,
    values: {
      ...DEFAULT_ROW_VALUES,
      ...overrides,
    },
  };
}
const INITIAL_ROWS: OpeningStockRow[] = [createRow(1)];
function createEmptyRow(nextId: number): OpeningStockRow {
  return createRow(nextId);
}
function getNextRowId(rows: OpeningStockRow[]): number {
  return rows.reduce((highestId, row) => Math.max(highestId, row.id), 0) + 1;
}
function getFilteredRows(rows: OpeningStockRow[], searchQuery: string): OpeningStockRow[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  if (!normalizedQuery) {
    return rows;
  }
  return rows.filter((row) =>
    Object.values(row.values).some((value) => value.toLowerCase().includes(normalizedQuery)),
  );
}
function getRowStockValue(row: OpeningStockRow): number {
  return parseDecimal(row.values.openingqty) * parseDecimal(row.values.costprice);
}
function isPristineRow(row: OpeningStockRow): boolean {
  return Object.entries(DEFAULT_ROW_VALUES).every(
    ([key, defaultValue]) => (row.values[key] ?? "") === defaultValue,
  );
}
function getTotals(rows: OpeningStockRow[]): {
  lines: number;
  qty: number;
  freeQty: number;
  value: number;
} {
  return rows.reduce(
    (accumulator, row) => ({
      lines: accumulator.lines + 1,
      qty: accumulator.qty + parseDecimal(row.values.openingqty),
      freeQty: accumulator.freeQty + parseDecimal(row.values.freeqty),
      value: accumulator.value + getRowStockValue(row),
    }),
    { lines: 0, qty: 0, freeQty: 0, value: 0 },
  );
}
function getRowValidationMessage(row: OpeningStockRow, rowNumber: number): string | null {
  if (!toNullableTrimmedString(row.values.oslitemid)) {
    return `Row ${rowNumber} is missing an item.`;
  }
  if (!toNullableTrimmedString(row.values.oslunitid)) {
    return `Row ${rowNumber} is missing a unit.`;
  }
  if (!toNullableTrimmedString(row.values.oslgodownid)) {
    return `Row ${rowNumber} is missing a godown.`;
  }
  if (!row.values.openingqty?.trim()) {
    return `Row ${rowNumber} is missing opening quantity.`;
  }
  return null;
}
function buildOpeningStockDetailPayload(row: OpeningStockRow): OpeningStockSaveDetail {
  return {
    osl_barcode: toNullableTrimmedString(row.values.barcode),
    osl_item_id: row.values.oslitemid.trim(),
    osl_unit_id: row.values.oslunitid.trim(),
    osl_base_uom_id: toNullableTrimmedString(row.values.oslbaseuomid),
    osl_godown_id: row.values.oslgodownid.trim(),
    osl_tracking_type: row.values.osltrackingtype?.trim() || "NONE",
    osl_tax_id: toNullableTrimmedString(row.values.osltaxid),
    osl_tax_perc: parseDecimal(row.values.osltaxperc),
    osl_cess_type: row.values.oslcesstype?.trim() || "NONE",
    osl_cess_perc: parseDecimal(row.values.oslcessperc),
    osl_cess_per_unit: parseDecimal(row.values.oslcessperunit),
    osl_qty: parseDecimal(row.values.openingqty),
    osl_free_qty: parseDecimal(row.values.freeqty),
    osl_base_qty: parseDecimal(row.values.baseqty),
    osl_conv_factor: parseDecimal(row.values.convfactor) || 1,
    osl_batch_no: toNullableTrimmedString(row.values.batchno),
    osl_serial_no: toNullableTrimmedString(row.values.serialno),
    osl_batch_date: toIsoDateTime(row.values.batchdate),
    osl_mfg_date: toIsoDateTime(row.values.mfgdate),
    osl_expiry_date: toIsoDateTime(row.values.expirydate),
    osl_cost_rate: parseDecimal(row.values.costprice),
    osl_cost_rate_wot: parseDecimal(row.values.costwot),
    osl_sale_rate_a_wot: parseDecimal(row.values.priceawot),
    osl_markup_perc_a: parseDecimal(row.values.priceamarkup),
    osl_sale_rate_a: parseDecimal(row.values.pricea),
    osl_sale_rate_b_wot: parseDecimal(row.values.pricebwot),
    osl_markup_perc_b: parseDecimal(row.values.pricebmarkup),
    osl_sale_rate_b: parseDecimal(row.values.priceb),
    osl_sale_rate_c_wot: parseDecimal(row.values.pricecwot),
    osl_markup_perc_c: parseDecimal(row.values.pricecmarkup),
    osl_sale_rate_c: parseDecimal(row.values.pricec),
    osl_sale_rate_d_wot: parseDecimal(row.values.pricedwot),
    osl_markup_perc_d: parseDecimal(row.values.pricedmarkup),
    osl_sale_rate_d: parseDecimal(row.values.priced),
    osl_mrp_rate: parseDecimal(row.values.mrp),
    osl_min_rate: parseDecimal(row.values.msp),
    osl_remarks: toNullableTrimmedString(row.values.remarks),
    item_code: toNullableTrimmedString(row.values.code),
    item_name: toNullableTrimmedString(row.values.itemname),
    godown_name: toNullableTrimmedString(row.values.godown),
    uom_name: toNullableTrimmedString(row.values.uom),
    tax_name: toNullableTrimmedString(row.values.taxname),
    profit_type: toNullableTrimmedString(row.values.profittype),
    round_off: parseDecimal(row.values.roundoff),
  };
}
function buildOpeningStockNarration(rows: OpeningStockRow[]): string | null {
  const remarks = rows
    .map((row) => toNullableTrimmedString(row.values.remarks))
    .filter((value): value is string => Boolean(value));
  return remarks.length > 0 ? remarks.join(" | ") : null;
}
function resolveConfiguredColumns(configuredColumns: UiTableColumnPayload[]): ColumnDefinition[] {
  if (configuredColumns.length === 0) {
    return createFallbackColumns();
  }
  const visibleColumns = [...configuredColumns]
    .filter((column) => column.uiTblClmColumnVisibility !== false)
    .sort((left, right) => {
      const leftPosition = left.uiTblClmColumnPosition ?? Number.MAX_SAFE_INTEGER;
      const rightPosition = right.uiTblClmColumnPosition ?? Number.MAX_SAFE_INTEGER;
      if (leftPosition !== rightPosition) {
        return leftPosition - rightPosition;
      }
      const leftNo = Number(left.uiTblClmNo ?? "");
      const rightNo = Number(right.uiTblClmNo ?? "");
      if (Number.isFinite(leftNo) && Number.isFinite(rightNo) && leftNo !== rightNo) {
        return leftNo - rightNo;
      }
      return 0;
    });
  const seenKeys = new Set<string>();
  const resolvedColumns: ColumnDefinition[] = [];
  for (const configuredColumn of visibleColumns) {
    const header = configuredColumn.uiTblClmName?.trim() ?? "";
    if (!header) {
      continue;
    }
    const key = normalizeColumnName(header);
    if (!key || seenKeys.has(key) || HIDDEN_INTERNAL_COLUMN_KEYS.has(key)) {
      continue;
    }
    const schema = COLUMN_SCHEMA[key] ?? createUnknownColumnSchema(header);
    resolvedColumns.push({
      key,
      header,
      width: toColumnWidth(configuredColumn.uiTblClmColumnWidth, schema.defaultWidth),
      align: schema.align,
      kind: schema.kind,
      lookupKind: schema.lookupKind,
      placeholder: schema.placeholder,
      options: schema.options,
      defaultValue: schema.defaultValue,
      defaultWidth: schema.defaultWidth,
    });
    seenKeys.add(key);
  }
  return resolvedColumns.length > 0 ? resolvedColumns : createFallbackColumns();
}
function getTableMinWidth(columns: ColumnDefinition[]): string {
  const width = columns.reduce(
    (total, column) => total + parseDecimal(column.width),
    parseDecimal(SERIAL_NUMBER_COLUMN_WIDTH),
  );
  return `${Math.max(width, 1080)}px`;
}
function mergeLookupOptions(
  currentOptions: ERPDynamicSelectOption[],
  nextOptions: ERPDynamicSelectOption[],
): ERPDynamicSelectOption[] {
  const emptyOption =
    currentOptions.find((option) => option.value === "") ??
    nextOptions.find((option) => option.value === "");
  const merged = new Map<string, string>();
  for (const option of [...currentOptions, ...nextOptions]) {
    if (!option.value) {
      continue;
    }
    if (!merged.has(option.value)) {
      merged.set(option.value, option.label);
    }
  }
  const normalizedOptions = Array.from(merged, ([value, label]) => ({ value, label })).sort(
    (left, right) => left.label.localeCompare(right.label),
  );
  return emptyOption ? [emptyOption, ...normalizedOptions] : normalizedOptions;
}
function filterLookupOptions(
  options: ERPDynamicSelectOption[],
  searchQuery: string,
): ERPDynamicSelectOption[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  return options.filter((option) => {
    if (!option.value.trim()) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return (
      option.label.toLowerCase().includes(normalizedQuery) ||
      option.value.toLowerCase().includes(normalizedQuery)
    );
  });
}
function resolveDefaultItemPriceRecord(
  itemPrices: ItemPriceDetailsPayload["item_prices"],
): ItemPriceDetailsPayload["item_prices"][number] | null {
  return itemPrices.find((record) => record.ipm_is_default_unit) ?? itemPrices[0] ?? null;
}
function buildItemAutofillValues(
  detail: ItemPriceDetailsPayload,
  unitOptionsByValue: Map<string, string>,
  godownOptionsByValue: Map<string, string>,
  currentValues: Record<string, string>,
  selectedLabel: string,
): Record<string, string> {
  const defaultPrice = resolveDefaultItemPriceRecord(detail.item_prices);
  return {
    ...ITEM_AUTOFILL_RESET_VALUES,
    itemname: detail.item.item_name_en?.trim() || selectedLabel,
    oslitemid: detail.item.item_id,
    barcode: toInputValue(detail.item.item_default_barcode),
    code: toInputValue(detail.item.item_code),
    ...buildPriceSelectionValues(
      detail,
      defaultPrice,
      unitOptionsByValue,
      godownOptionsByValue,
      currentValues,
    ),
    osltrackingtype: resolveTrackingType(detail.item),
    ...(detail.item_tax
      ? buildTaxSelectionValues(detail.item_tax)
      : {
          taxname: "",
          osltaxid: toInputValue(detail.item.item_default_tax_id),
        }),
  };
}
function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}): ReactNode {
  return (
    <article className={styles.summaryCard}>
      <span className={styles.summaryLabel}>{label}</span>
      <strong className={styles.summaryValue}>{value}</strong>
      <span className={styles.summaryHint}>{hint}</span>
    </article>
  );
}
export default function OpeningStockPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [voucherDate, setVoucherDate] = useState(() => getTodayInputValue());
  const [rows, setRows] = useState<OpeningStockRow[]>(INITIAL_ROWS);
  const [uiColumnConfigs, setUiColumnConfigs] = useState<UiTableColumnPayload[]>([]);
  const [itemDetailsByItemId, setItemDetailsByItemId] = useState<Record<string, ItemPriceDetailsPayload>>({});
  const [itemOptions, setItemOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_ITEM_OPTION]);
  const [taxOptions, setTaxOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [unitOptions, setUnitOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [godownOptions, setGodownOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_GODOWN_OPTION,
  ]);
  const [openLookupCell, setOpenLookupCell] = useState<{
    key: string;
    kind: LookupKind;
  } | null>(null);
  const [openRowActionMenuId, setOpenRowActionMenuId] = useState<number | null>(null);
  const [lookupSearchQuery, setLookupSearchQuery] = useState("");
  const lookupRootRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const rowActionRootRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const lookupSearchInputRef = useRef<HTMLInputElement | null>(null);
  const itemSearchTimeoutRef = useRef<number | null>(null);
  const itemSearchRequestRef = useRef(0);
  const itemDetailRequestRef = useRef<Record<number, number>>({});
  const godownSearchTimeoutRef = useRef<number | null>(null);
  const godownSearchRequestRef = useRef(0);
  const {
    activeCompany,
    activeBranch,
    loading: isBusinessContextLoading,
    error: businessContextError,
  } = useBusinessContext();
  const { getAll: listUiTableColumns, loading: isConfigLoading, error: configError } = useApi<
    ApiSuccessResponse<UiTableColumnPayload[], ListMeta>
  >(UI_TABLE_COLUMNS_LIST_ENDPOINT, {
    toast: UI_TABLE_COLUMNS_TOAST_OPTIONS,
  });
  const { run: listAccountLedgers } = useApi<unknown>(ACCOUNT_LEDGER_LIST_ENDPOINT, {
    toast: {
      success: false,
      error: false,
    },
  });
  const { run: saveOpeningStock, loading: isSavingOpeningStock } = useApi<
    unknown,
    OpeningStockSaveRequest
  >(OPENING_STOCK_SAVE_ENDPOINT, {
    method: "POST",
    toast: {
      successMessage: "Opening stock updated successfully.",
    },
  });
  const [triggerItemOptions, { isFetching: isItemLookupLoading }] =
    useLazyGetItemOptionsQuery();
  const [triggerTaxOptions] = useLazyGetTaxOptionsQuery();
  const [triggerUnitOptions] = useLazyGetUnitOptionsQuery();
  const [triggerGodownOptions, { isFetching: isGodownLookupLoading }] =
    useLazyGetGodownOptionsQuery();
  const [triggerItemPriceDetails] = useLazyGetItemPriceDetailsQuery();
  const [triggerItemTaxById] = useLazyGetItemTaxByIdQuery();
  const loadLookupOptions = useCallback(
    async (lookupKind: LookupKind, search = ""): Promise<ERPDynamicSelectOption[]> => {
      const normalizedSearch = search.trim();
      return lookupKind === "item"
        ? triggerItemOptions(
            normalizedSearch ? { search: normalizedSearch } : undefined,
            true,
          ).unwrap()
        : triggerGodownOptions(
            normalizedSearch ? { search: normalizedSearch } : undefined,
            true,
          ).unwrap();
    },
    [triggerGodownOptions, triggerItemOptions],
  );
  const loadUnitOptions = useCallback(
    async (search = ""): Promise<ERPDynamicSelectOption[]> => {
      const normalizedSearch = search.trim();
      return triggerUnitOptions(
        normalizedSearch ? { search: normalizedSearch } : undefined,
        true,
      ).unwrap();
    },
    [triggerUnitOptions],
  );
  const loadTaxOptions = useCallback(
    async (): Promise<ERPDynamicSelectOption[]> => triggerTaxOptions(undefined, true).unwrap(),
    [triggerTaxOptions],
  );
  useEffect(() => {
    let cancelled = false;
    const loadUiColumnConfig = async () => {
      try {
        const payload = await listUiTableColumns({ ...UI_TABLE_COLUMNS_QUERY });
        if (!cancelled) {
          setUiColumnConfigs(Array.isArray(payload?.data) ? payload.data : []);
        }
      } catch {
        if (!cancelled) {
          setUiColumnConfigs([]);
        }
      }
    };
    void loadUiColumnConfig();
    return () => {
      cancelled = true;
    };
  }, [listUiTableColumns]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [itemsPayload, taxesPayload, unitsPayload, godownsPayload] = await Promise.allSettled([
        loadLookupOptions("item"),
        loadTaxOptions(),
        loadUnitOptions(),
        loadLookupOptions("godown"),
      ]);
      if (cancelled) {
        return;
      }
      if (itemsPayload.status === "fulfilled") {
        setItemOptions(itemsPayload.value);
      }
      if (taxesPayload.status === "fulfilled") {
        setTaxOptions(taxesPayload.value);
      }
      if (unitsPayload.status === "fulfilled") {
        setUnitOptions(unitsPayload.value);
      }
      if (godownsPayload.status === "fulfilled") {
        setGodownOptions(godownsPayload.value);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadLookupOptions, loadTaxOptions, loadUnitOptions]);
  useEffect(() => {
    if (!openLookupCell) {
      return;
    }
    const animationFrame = window.requestAnimationFrame(() => {
      lookupSearchInputRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [openLookupCell]);
  useEffect(() => {
    if (!openLookupCell && openRowActionMenuId === null) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const lookupRootElement = openLookupCell ? lookupRootRefs.current[openLookupCell.key] : null;
      if (lookupRootElement && !lookupRootElement.contains(event.target as Node)) {
        setOpenLookupCell(null);
        setLookupSearchQuery("");
      }
      const actionRootElement =
        openRowActionMenuId !== null ? rowActionRootRefs.current[openRowActionMenuId] : null;
      if (actionRootElement && !actionRootElement.contains(event.target as Node)) {
        setOpenRowActionMenuId(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenLookupCell(null);
        setLookupSearchQuery("");
        setOpenRowActionMenuId(null);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openLookupCell, openRowActionMenuId]);
  useEffect(() => {
    return () => {
      if (itemSearchTimeoutRef.current !== null) {
        window.clearTimeout(itemSearchTimeoutRef.current);
      }
      if (godownSearchTimeoutRef.current !== null) {
        window.clearTimeout(godownSearchTimeoutRef.current);
      }
    };
  }, []);
  const unitOptionsByValue = useMemo(
    () =>
      new Map(
        unitOptions
          .filter((option) => option.value.trim().length > 0)
          .map((option) => [option.value, option.label]),
      ),
    [unitOptions],
  );
  const taxOptionsByValue = useMemo(
    () =>
      new Map(
        taxOptions
          .filter((option) => option.value.trim().length > 0)
          .map((option) => [option.value, option.label]),
      ),
    [taxOptions],
  );
  const taxSelectOptions = useMemo(
    () => taxOptions.filter((option) => option.value.trim().length > 0),
    [taxOptions],
  );
  useEffect(() => {
    if (unitOptionsByValue.size === 0) {
      return;
    }
    setRows((currentRows) =>
      currentRows.map((row) => {
        const unitId = row.values.oslunitid?.trim() ?? "";
        if (!unitId) {
          return row;
        }
        const unitLabel = unitOptionsByValue.get(unitId);
        if (!unitLabel || row.values.uom === unitLabel) {
          return row;
        }
        return {
          ...row,
          values: {
            ...row.values,
            uom: unitLabel,
          },
        };
      }),
    );
  }, [unitOptionsByValue]);
  const columns = resolveConfiguredColumns(uiColumnConfigs);
  const draftRows = useMemo(() => rows.filter((row) => !isPristineRow(row)), [rows]);
  const draftTotals = useMemo(() => getTotals(draftRows), [draftRows]);
  const filteredRows = getFilteredRows(rows, searchQuery);
  const visibleTotals = getTotals(filteredRows);
  const trackingRows = filteredRows.filter((row) => row.values.osltrackingtype !== "NONE").length;
  const accountingYear = formatAccountingYear(voucherDate);
  const contextStatusText = !activeCompany
    ? "Select a company in the header to enable opening stock posting."
    : !activeBranch
      ? "Select a branch in the header to enable opening stock posting."
      : `Posting to ${activeCompany.compName} / ${activeBranch.brName}${accountingYear ? ` for ${accountingYear}` : ""}.`;
  const configStatusText = isConfigLoading
    ? "Loading column config..."
    : uiColumnConfigs.length > 0
      ? `Using ${columns.length} visible columns from UI table 5`
      : configError
        ? "Column config unavailable. Using fallback columns."
        : "Using fallback columns.";
  const itemOptionsByValue = useMemo(
    () => new Map(itemOptions.map((option) => [option.value, option.label])),
    [itemOptions],
  );
  const godownOptionsByValue = useMemo(
    () => new Map(godownOptions.map((option) => [option.value, option.label])),
    [godownOptions],
  );
  const handleRowChange = (rowId: number, field: string, value: string) => {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? (() => {
              const nextValues = {
                ...row.values,
                [field]: value,
              };
              if (field === "openingqty" || field === "convfactor") {
                nextValues.baseqty = formatQuantityValue(
                  parseDecimal(field === "openingqty" ? value : nextValues.openingqty) *
                    parseDecimal(field === "convfactor" ? value : nextValues.convfactor),
                );
              }
              return {
                ...row,
                values: nextValues,
              };
            })()
          : row,
      ),
    );
  };
  const handleUomChange = useCallback(
    (rowId: number, unitId: string) => {
      setRows((currentRows) =>
        currentRows.map((row) => {
          if (row.id !== rowId) {
            return row;
          }
          const itemId = row.values.oslitemid?.trim() ?? "";
          const itemDetail = itemId ? itemDetailsByItemId[itemId] : undefined;
          if (!itemDetail) {
            return row;
          }
          const priceRecord = resolveItemPriceRecordByUnitId(itemDetail, unitId);
          return {
            ...row,
            values: {
              ...row.values,
              ...buildPriceSelectionValues(
                itemDetail,
                priceRecord,
                unitOptionsByValue,
                godownOptionsByValue,
                row.values,
              ),
            },
          };
        }),
      );
    },
    [godownOptionsByValue, itemDetailsByItemId, unitOptionsByValue],
  );
  const handleTaxChange = useCallback(
    (rowId: number, taxId: string) => {
      if (!taxId.trim()) {
        setRows((currentRows) =>
          currentRows.map((row) =>
            row.id === rowId
              ? {
                  ...row,
                  values: {
                    ...row.values,
                    ...buildTaxSelectionValues({
                      tax_id: "",
                      tax_name: "",
                      tax_gst_rate_total: 0,
                      tax_cess_type: "NONE",
                      tax_cess_perc: 0,
                      tax_cess_unit: 0,
                    }),
                  },
                }
              : row,
          ),
        );
        return;
      }
      void (async () => {
        try {
          const taxDetail = await triggerItemTaxById({ taxId }, true).unwrap();
          setRows((currentRows) =>
            currentRows.map((row) =>
              row.id === rowId
                ? {
                    ...row,
                    values: {
                      ...row.values,
                      ...buildTaxSelectionValues(taxDetail),
                    },
                  }
                : row,
            ),
          );
        } catch (error) {
          const message =
            error && typeof error === "object" && "message" in error && typeof error.message === "string"
              ? error.message
              : "Failed to load tax details.";
          toast.error(message, {
            toastId: `opening-stock-tax-details:${taxId}`,
          });
        }
      })();
    },
    [triggerItemTaxById],
  );
  const handleLookupSelection = useCallback(
    (rowId: number, lookupKind: LookupKind, option: ERPDynamicSelectOption) => {
      if (lookupKind !== "item") {
        const fieldConfig = LOOKUP_FIELD_CONFIG[lookupKind];
        setRows((currentRows) =>
          currentRows.map((row) =>
            row.id === rowId
              ? {
                  ...row,
                  values: {
                    ...row.values,
                    [fieldConfig.labelField]: option.value ? option.label : "",
                    [fieldConfig.idField]: option.value,
                  },
                }
              : row,
          ),
        );
        setOpenLookupCell(null);
        setLookupSearchQuery("");
        return;
      }
      const requestId = (itemDetailRequestRef.current[rowId] ?? 0) + 1;
      itemDetailRequestRef.current[rowId] = requestId;
      setRows((currentRows) =>
        currentRows.map((row) =>
          row.id === rowId
            ? {
                ...row,
                values: {
                  ...row.values,
                  ...buildPendingItemSelectionValues(option),
                },
              }
            : row,
        ),
      );
      setOpenLookupCell(null);
      setLookupSearchQuery("");
      if (!option.value) {
        return;
      }
      const cachedDetail = itemDetailsByItemId[option.value];
      if (cachedDetail) {
        setRows((currentRows) =>
          currentRows.map((row) => {
            if (row.id !== rowId || (row.values.oslitemid ?? "").trim() !== option.value) {
              return row;
            }
            return {
              ...row,
              values: {
                ...row.values,
                ...buildItemAutofillValues(
                  cachedDetail,
                  unitOptionsByValue,
                  godownOptionsByValue,
                  row.values,
                  option.label,
                ),
              },
            };
          }),
        );
        return;
      }
      void (async () => {
        try {
          const detail = await triggerItemPriceDetails({ itemId: option.value }, true).unwrap();
          if (itemDetailRequestRef.current[rowId] !== requestId) {
            return;
          }
          setItemDetailsByItemId((current) => ({
            ...current,
            [detail.item.item_id]: detail,
          }));
          setRows((currentRows) =>
            currentRows.map((row) => {
              if (row.id !== rowId || (row.values.oslitemid ?? "").trim() !== option.value) {
                return row;
              }
              return {
                ...row,
                values: {
                  ...row.values,
                  ...buildItemAutofillValues(
                    detail,
                    unitOptionsByValue,
                    godownOptionsByValue,
                    row.values,
                    option.label,
                  ),
                },
              };
            }),
          );
        } catch (error) {
          if (itemDetailRequestRef.current[rowId] !== requestId) {
            return;
          }
          const message =
            error && typeof error === "object" && "message" in error && typeof error.message === "string"
              ? error.message
              : "Failed to load item price details.";
          toast.error(message, {
            toastId: `opening-stock-item-price-details:${option.value}`,
          });
        }
      })();
    },
    [
      godownOptionsByValue,
      itemDetailsByItemId,
      triggerItemPriceDetails,
      unitOptionsByValue,
    ],
  );
  const handleLookupSearchChange = useCallback(
    (lookupKind: LookupKind, search: string) => {
      const normalizedSearch = search.trim();
      if (lookupKind === "item") {
        if (itemSearchTimeoutRef.current !== null) {
          window.clearTimeout(itemSearchTimeoutRef.current);
        }
        if (!normalizedSearch) {
          return;
        }
        const requestId = itemSearchRequestRef.current + 1;
        itemSearchRequestRef.current = requestId;
        itemSearchTimeoutRef.current = window.setTimeout(() => {
          void (async () => {
            try {
              const searchedOptions = await loadLookupOptions("item", normalizedSearch);
              if (itemSearchRequestRef.current !== requestId) {
                return;
              }
              setItemOptions((currentOptions) => mergeLookupOptions(currentOptions, searchedOptions));
            } catch {
              // Keep existing options when live item lookup search fails.
            }
          })();
        }, LOOKUP_SEARCH_DEBOUNCE_MS);
        return;
      }
      if (godownSearchTimeoutRef.current !== null) {
        window.clearTimeout(godownSearchTimeoutRef.current);
      }
      if (!normalizedSearch) {
        return;
      }
      const requestId = godownSearchRequestRef.current + 1;
      godownSearchRequestRef.current = requestId;
      godownSearchTimeoutRef.current = window.setTimeout(() => {
        void (async () => {
          try {
            const searchedOptions = await loadLookupOptions("godown", normalizedSearch);
            if (godownSearchRequestRef.current !== requestId) {
              return;
            }
            setGodownOptions((currentOptions) => mergeLookupOptions(currentOptions, searchedOptions));
          } catch {
            // Keep existing options when live godown lookup search fails.
          }
        })();
      }, LOOKUP_SEARCH_DEBOUNCE_MS);
    },
    [loadLookupOptions],
  );
  const handleAddRow = () => {
    setRows((currentRows) => [...currentRows, createEmptyRow(getNextRowId(currentRows))]);
  };
  const handleRemoveRow = (rowId: number) => {
    setOpenRowActionMenuId((currentId) => (currentId === rowId ? null : currentId));
    setRows((currentRows) => {
      const nextRows = currentRows.filter((row) => row.id !== rowId);
      return nextRows.length > 0 ? nextRows : [createEmptyRow(1)];
    });
  };
  const handleUpdateStock = useCallback(async () => {
    if (!activeCompany) {
      toast.error("Select a company in the header before updating stock.", {
        toastId: "opening-stock-save:missing-company",
      });
      return;
    }
    if (!activeBranch) {
      toast.error("Select a branch in the header before updating stock.", {
        toastId: "opening-stock-save:missing-branch",
      });
      return;
    }
    if (!accountingYear) {
      toast.error("The selected company does not have a valid financial year.", {
        toastId: "opening-stock-save:missing-fin-year",
      });
      return;
    }
    const voucherDateIso = toIsoDateTime(voucherDate);
    if (!voucherDateIso) {
      toast.error("Select a valid voucher date before updating stock.", {
        toastId: "opening-stock-save:missing-voucher-date",
      });
      return;
    }
    const userId = getAuthUserId();
    if (!userId) {
      toast.error("User session is missing. Please login again.", {
        toastId: "opening-stock-save:missing-user",
      });
      return;
    }
    if (draftRows.length === 0) {
      toast.error("Add at least one stock row before updating stock.", {
        toastId: "opening-stock-save:no-rows",
      });
      return;
    }

    for (const [index, row] of draftRows.entries()) {
      const validationMessage = getRowValidationMessage(row, index + 1);
      if (validationMessage) {
        toast.error(validationMessage, {
          toastId: `opening-stock-save:row-${index + 1}`,
        });
        return;
      }
    }

    let matchingLedgers: AccountLedgerRecord[] = [];
    try {
      const ledgerPayload = await listAccountLedgers({
        query: {
          ledCompanyId: activeCompany.compId,
          ledIsActive: "true",
          page: "1",
          limit: "100",
        },
      });
      matchingLedgers = extractRows<AccountLedgerRecord>(ledgerPayload).filter(
        (ledger): ledger is AccountLedgerRecord =>
          typeof ledger?.ledId === "string" &&
          typeof ledger?.ledName === "string" &&
          ledger.ledName.trim().toLowerCase() === OPENING_STOCK_LEDGER_NAME,
      );
    } catch {
      toast.error("Failed to load the Opening Stock ledger.", {
        toastId: "opening-stock-save:ledger-request-failed",
      });
      return;
    }

    if (matchingLedgers.length === 0) {
      toast.error("No active account ledger named Opening Stock was found for the selected company.", {
        toastId: "opening-stock-save:ledger-missing",
      });
      return;
    }
    if (matchingLedgers.length > 1) {
      toast.error("More than one active account ledger named Opening Stock exists for the selected company.", {
        toastId: "opening-stock-save:ledger-ambiguous",
      });
      return;
    }

    const requestPayload: OpeningStockSaveRequest = {
      header: {
        avh_voucher_type_id: 1,
        osh_acc_year: accountingYear,
        osh_company_id: activeCompany.compId,
        osh_branch_id: activeBranch.brId,
        osh_voucher_date: voucherDateIso,
        avh_party_id: matchingLedgers[0].ledId,
        avh_bill_date: voucherDateIso,
        avh_opposite_ledger_id: null,
        avh_employee_id: [],
        osh_device_type: "WEB",
        osh_counter_id: "COUNTER-1",
        osh_session_id: getAuthSessionId(),
        osh_device_id: getOrCreateClientDeviceId(),
        osh_status: "DRAFT",
        osh_ref_no: null,
        osh_narration: buildOpeningStockNarration(draftRows),
        osh_total_lines: draftTotals.lines,
        osh_total_qty: draftTotals.qty,
        osh_total_value: draftTotals.value,
        osh_user_id: userId,
      },
      details: draftRows.map(buildOpeningStockDetailPayload),
    };

    try {
      await saveOpeningStock({
        body: requestPayload,
      });
      setRows([createEmptyRow(1)]);
      setSearchQuery("");
      setLookupSearchQuery("");
      setOpenLookupCell(null);
      setOpenRowActionMenuId(null);
    } catch {
      // Toasting is handled in useApi.
    }
  }, [
    accountingYear,
    activeBranch,
    activeCompany,
    draftRows,
    draftTotals.lines,
    draftTotals.qty,
    draftTotals.value,
    listAccountLedgers,
    saveOpeningStock,
    voucherDate,
  ]);
  const tableMinWidth = getTableMinWidth(columns);
  useEffect(() => {
    if (godownOptionsByValue.size === 0 && taxOptionsByValue.size === 0) {
      return;
    }
    setRows((currentRows) =>
      currentRows.map((row) => {
        const nextValues = { ...row.values };
        const godownId = row.values.oslgodownid?.trim() ?? "";
        const taxId = row.values.osltaxid?.trim() ?? "";
        const godownLabel = godownId ? godownOptionsByValue.get(godownId) : "";
        const taxLabel = taxId ? taxOptionsByValue.get(taxId) : "";
        let changed = false;
        if (godownLabel && nextValues.godown !== godownLabel) {
          nextValues.godown = godownLabel;
          changed = true;
        }
        if (taxLabel && nextValues.taxname !== taxLabel) {
          nextValues.taxname = taxLabel;
          changed = true;
        }
        return changed
          ? {
              ...row,
              values: nextValues,
            }
          : row;
      }),
    );
  }, [godownOptionsByValue, taxOptionsByValue]);
  const filteredItemOptions = useMemo(
    () => filterLookupOptions(itemOptions, lookupSearchQuery),
    [itemOptions, lookupSearchQuery],
  );
  const filteredGodownOptions = useMemo(
    () => filterLookupOptions(godownOptions, lookupSearchQuery),
    [godownOptions, lookupSearchQuery],
  );
  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headingBlock}>
          <div className={styles.headingRow}>
            <div>
              <h1 className={styles.title}>Opening Stock</h1>
            </div>
          </div>
        </div>
        <div className={styles.summaryGrid}>
          <SummaryCard
            label="Visible Lines"
            value={String(visibleTotals.lines)}
            hint={`${rows.length} total rows in draft`}
          />
          <SummaryCard
            label="Visible Qty"
            value={QUANTITY_FORMATTER.format(visibleTotals.qty)}
            hint={`${QUANTITY_FORMATTER.format(visibleTotals.freeQty)} free quantity`}
          />
          <SummaryCard
            label="Visible Value"
            value={VALUE_FORMATTER.format(visibleTotals.value)}
            hint="Opening qty x cost price"
          />
          <SummaryCard
            label="Tracked Rows"
            value={String(trackingRows)}
            hint="Rows with tracking enabled"
          />
        </div>
      </header>
      <div className={cx(tableStyles.tableShell, styles.tableShell)}>
        <div className={tableStyles.toolbar}>
          <div className={tableStyles.tableTools}>
            <div className={tableStyles.searchField}>
              <FiSearch className={tableStyles.searchIcon} aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search visible stock values"
                className={tableStyles.searchInput}
                autoComplete="off"
              />
            </div>
            <label className={styles.toolbarDateField}>
              <span className={styles.toolbarDateLabel}>Voucher Date</span>
              <input
                type="date"
                value={voucherDate}
                onChange={(event) => setVoucherDate(event.target.value)}
                className={styles.toolbarDateInput}
              />
            </label>
            <button type="button" className={tableStyles.createButton} onClick={handleAddRow}>
              <FiPlus className={tableStyles.createIcon} aria-hidden="true" />
              <span>Add line</span>
            </button>
            <button
              type="button"
              className={cx(tableStyles.createButton, styles.updateButton)}
              onClick={handleUpdateStock}
              disabled={isSavingOpeningStock || isBusinessContextLoading}
            >
              <span>{isSavingOpeningStock ? "Updating..." : "Update Stock"}</span>
            </button>
          </div>
          <p className={styles.toolbarNote}>
            Update Stock posts all non-empty rows. Search only changes what is visible in the grid.
          </p>
          <p
            className={cx(
              styles.configMeta,
              Boolean(!activeCompany || !activeBranch || businessContextError) &&
                styles.configMetaError,
            )}
          >
            {businessContextError ? `${businessContextError} ` : ""}
            {contextStatusText} {configStatusText}
          </p>
        </div>
        <div className={tableStyles.tableViewport} data-erp-table-viewport="true">
          <table
            className={tableStyles.table}
            style={{ "--erp-table-min-width": tableMinWidth } as CSSProperties}
          >
            <colgroup>
              <col style={{ width: SERIAL_NUMBER_COLUMN_WIDTH }} />
              {columns.map((column) => (
                <col key={column.key} style={{ width: column.width }} />
              ))}
            </colgroup>
            <thead className={tableStyles.head}>
              <tr>
                <th
                  className={cx(
                    tableStyles.headerCell,
                    tableStyles.alignLeft,
                    styles.stickySerialCell,
                    styles.stickySerialHeader,
                  )}
                  style={{ width: SERIAL_NUMBER_COLUMN_WIDTH }}
                >
                  <span className={tableStyles.headerText}>S.No</span>
                </th>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={cx(tableStyles.headerCell, getAlignClass(column.align))}
                    style={{ width: column.width }}
                  >
                    <span className={tableStyles.headerText}>{column.header}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={tableStyles.body}>
              {filteredRows.length === 0 ? (
                <tr className={cx(tableStyles.row, tableStyles.rowOdd)}>
                  <td
                    className={cx(tableStyles.cell, tableStyles.emptyCell)}
                    colSpan={columns.length + 1}
                  >
                    No stock lines match the current search.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, index) => (
                  <tr
                    key={row.id}
                    className={cx(
                      styles.dataRow,
                      tableStyles.row,
                      index % 2 === 0 ? tableStyles.rowOdd : tableStyles.rowEven,
                    )}
                  >
                    <td
                      data-label="S.No"
                      className={cx(
                        tableStyles.cell,
                        tableStyles.alignLeft,
                        styles.stickySerialCell,
                      )}
                    >
                      <div className={styles.serialCellContent}>
                        <span className={styles.rowNumber}>{index + 1}</span>
                        <div
                          className={tableStyles.actionsMenuRoot}
                          ref={(element) => {
                            rowActionRootRefs.current[row.id] = element;
                          }}
                        >
                          <button
                            type="button"
                            className={tableStyles.actionsTrigger}
                            aria-label={`Open actions for row ${index + 1}`}
                            aria-haspopup="menu"
                            aria-expanded={openRowActionMenuId === row.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenRowActionMenuId((currentId) =>
                                currentId === row.id ? null : row.id,
                              );
                            }}
                            onMouseDown={(event) => event.stopPropagation()}
                          >
                            <FiMoreVertical
                              className={tableStyles.actionsTriggerIcon}
                              aria-hidden="true"
                            />
                          </button>
                          {openRowActionMenuId === row.id ? (
                            <div
                              className={tableStyles.actionsDropdown}
                              role="menu"
                              aria-label={`Actions for row ${index + 1}`}
                            >
                              <button
                                type="button"
                                role="menuitem"
                                className={cx(
                                  tableStyles.actionsDropdownItem,
                                  tableStyles.actionsDropdownDelete,
                                )}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleRemoveRow(row.id);
                                }}
                              >
                                <FiTrash2 className={styles.actionIcon} aria-hidden="true" />
                                <span>Remove row</span>
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    {columns.map((column) => {
                      const value = row.values[column.key] ?? "";
                      const isNumeric = column.kind === "number";
                      const currentItemId = row.values.oslitemid?.trim() ?? "";
                      const currentItemDetail = currentItemId ? itemDetailsByItemId[currentItemId] : undefined;
                      const uomSelectOptions = buildUomOptions(currentItemDetail, unitOptionsByValue);
                      const sharedClassName = cx(
                        styles.cellInput,
                        isNumeric && styles.numericInput,
                      );
                      const lookupKind = column.lookupKind;
                      const lookupFieldConfig = lookupKind ? LOOKUP_FIELD_CONFIG[lookupKind] : null;
                      const cellLookupKey = `${row.id}:${column.key}`;
                      const isLookupOpen = openLookupCell?.key === cellLookupKey;
                      const selectedLookupId = lookupFieldConfig
                        ? row.values[lookupFieldConfig.idField] ?? ""
                        : "";
                      const selectedLookupLabel = lookupKind
                        ? (
                            lookupKind === "item"
                              ? itemOptionsByValue.get(selectedLookupId)
                              : godownOptionsByValue.get(selectedLookupId)
                          ) ?? value
                        : value;
                      const lookupOptions = lookupKind
                        ? lookupKind === "item"
                          ? filteredItemOptions
                          : filteredGodownOptions
                        : [];
                      const isLookupLoading = lookupKind
                        ? lookupKind === "item"
                          ? isItemLookupLoading
                          : isGodownLookupLoading
                        : false;

                      return (
                        <td
                          key={column.key}
                          data-label={column.header}
                          className={cx(tableStyles.cell, getAlignClass(column.align))}
                        >
                          {column.key === "uom" ? (
                            <select
                              value={row.values.oslunitid ?? ""}
                              onChange={(event) => handleUomChange(row.id, event.target.value)}
                              className={styles.cellSelect}
                              disabled={!currentItemDetail || uomSelectOptions.length === 0}
                            >
                              <option value="">
                                {currentItemDetail ? "Select Uom" : "Select item first"}
                              </option>
                              {uomSelectOptions.map((option) => (
                                <option key={`${row.id}-uom-${option.value}`} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          ) : column.key === "taxname" ? (
                            <select
                              value={row.values.osltaxid ?? ""}
                              onChange={(event) => handleTaxChange(row.id, event.target.value)}
                              className={styles.cellSelect}
                            >
                              <option value="">None</option>
                              {taxSelectOptions.map((option) => (
                                <option key={`${row.id}-tax-${option.value}`} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          ) : column.kind === "lookup" && lookupKind && lookupFieldConfig ? (
                            <div
                              className={styles.lookupCell}
                              ref={(element) => {
                                lookupRootRefs.current[cellLookupKey] = element;
                              }}
                            >
                              <button
                                type="button"
                                className={cx(
                                  styles.lookupTrigger,
                                  isLookupOpen && styles.lookupTriggerOpen,
                                )}
                                onClick={() => {
                                  setOpenLookupCell((currentCell) =>
                                    currentCell?.key === cellLookupKey
                                      ? null
                                      : { key: cellLookupKey, kind: lookupKind },
                                  );
                                  setLookupSearchQuery("");
                                }}
                                aria-expanded={isLookupOpen}
                                aria-haspopup="listbox"
                              >
                                <span
                                  className={cx(
                                    styles.lookupTriggerLabel,
                                    !selectedLookupLabel && styles.lookupPlaceholder,
                                  )}
                                >
                                  {selectedLookupLabel || column.placeholder || column.header}
                                </span>
                                <FiChevronDown
                                  className={cx(
                                    styles.lookupChevron,
                                    isLookupOpen && styles.lookupChevronOpen,
                                  )}
                                  aria-hidden="true"
                                />
                              </button>
                              {isLookupOpen ? (
                                <div className={styles.lookupMenu}>
                                  <div className={styles.lookupSearchWrap}>
                                    <FiSearch
                                      className={styles.lookupSearchIcon}
                                      aria-hidden="true"
                                    />
                                    <input
                                      ref={lookupSearchInputRef}
                                      type="text"
                                      value={lookupSearchQuery}
                                      onChange={(event) => {
                                        const nextQuery = event.target.value;
                                        setLookupSearchQuery(nextQuery);
                                        handleLookupSearchChange(lookupKind, nextQuery);
                                      }}
                                      placeholder={column.placeholder || `Search ${column.header}`}
                                      className={styles.lookupSearchInput}
                                      autoComplete="off"
                                    />
                                  </div>
                                  <div className={styles.lookupOptions} role="listbox">
                                    {lookupOptions.length > 0 ? (
                                      lookupOptions.map((option) => (
                                        <button
                                          key={`${cellLookupKey}-${option.value}`}
                                          type="button"
                                          className={cx(
                                            styles.lookupOption,
                                            option.value === selectedLookupId &&
                                              styles.lookupOptionActive,
                                          )}
                                          onClick={() =>
                                            handleLookupSelection(row.id, lookupKind, option)
                                          }
                                        >
                                          {option.label}
                                        </button>
                                      ))
                                    ) : (
                                      <div className={styles.lookupEmptyState}>
                                        {isLookupLoading
                                          ? "Loading options..."
                                          : LOOKUP_FIELD_CONFIG[lookupKind].emptyMessage}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : column.kind === "select" ? (
                            <select
                              value={value}
                              onChange={(event) =>
                                handleRowChange(row.id, column.key, event.target.value)
                              }
                              className={styles.cellSelect}
                            >
                              {(column.options ?? []).map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={column.kind === "date" ? "date" : isNumeric ? "number" : "text"}
                              value={value}
                              onChange={(event) =>
                                handleRowChange(row.id, column.key, event.target.value)
                              }
                              className={sharedClassName}
                              placeholder={column.placeholder}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className={tableStyles.paginationBar}>
          <div className={tableStyles.paginationInfo}>
            <span>{visibleTotals.lines} visible lines</span>
            <span>{QUANTITY_FORMATTER.format(visibleTotals.qty)} qty</span>
            <span>{QUANTITY_FORMATTER.format(visibleTotals.freeQty)} free qty</span>
          </div>
          <div className={styles.footerValue}>
            <span className={styles.footerLabel}>Visible stock value</span>
            <strong>{VALUE_FORMATTER.format(visibleTotals.value)}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
