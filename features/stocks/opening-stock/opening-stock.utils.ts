import type { ERPDynamicSelectOption } from "@/components/design-system/ui";
import type { StockLookupOption } from "@/features/stocks/_shared/types";
import { extractRows } from "@/features/masters/shared/normalizers";
import type {
  ItemPriceDetailsPayload,
  ItemTaxDetailPayload,
} from "@/store/api/lookupsApi";
import type { ApiSuccessResponse, ListMeta } from "@/utils/types";
import {
  BATCH_TRACKING_FIELD_KEYS,
  COLUMN_SCHEMA,
  DEFAULT_GODOWN_OPTION,
  DELETE_ACTION_COLUMN_WIDTH,
  DISPLAY_DATE_PATTERN,
  HIDDEN_INTERNAL_COLUMN_KEYS,
  ISO_DATE_PATTERN,
  ISO_DATE_TIME_PATTERN,
  ITEM_AUTOFILL_FIELD_KEYS,
  OPENING_STOCK_DATE_FIELD_KEYS,
  OPENING_STOCK_NON_NEGATIVE_NUMBER_FIELD_KEYS,
  PROFIT_TYPE_OPTIONS,
  QUANTITY_FORMATTER,
  ROUND_OFF_OPTIONS,
  SERIAL_NUMBER_COLUMN_WIDTH,
  TRACKING_OPTIONS,
  TRACKING_TYPE_OPTION_LABELS,
  TRACKING_REQUIRED_FIELD_KEYS,
  TRACKING_REQUIRED_FIELD_LABELS,
} from "./constants";
import type {
  ColumnDefinition,
  ColumnSchema,
  GodownLookupRecord,
  OpeningStockDocumentPayload,
  OpeningStockRow,
  OpeningStockSaveDetail,
  RowValidationIssue,
  UiTableColumnPayload,
} from "./opening-stock.types";
import { toColumnWidth } from "@/features/stocks/_shared/stock-utils";
export function cx(...tokens: Array<string | false | undefined>): string {
  return tokens.filter(Boolean).join(" ");
}
export function normalizeColumnName(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
}
export function parseDecimal(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}
export function getOpeningStockActualConvFactor(values: Record<string, string>): number {
  const storedActualConvFactor = parseDecimal(values.oslactualconvfactor);
  if (storedActualConvFactor > 0) {
    return storedActualConvFactor;
  }
  return parseDecimal(values.convfactor) || 1;
}
export function formatQuantityValue(value: number): string {
  return QUANTITY_FORMATTER.format(value).replace(/,/g, "");
}
function isValidDateParts(year: string, month: string, day: string): boolean {
  const parsedYear = Number(year);
  const parsedMonth = Number(month);
  const parsedDay = Number(day);
  if (
    !Number.isInteger(parsedYear) ||
    !Number.isInteger(parsedMonth) ||
    !Number.isInteger(parsedDay)
  ) {
    return false;
  }
  const candidate = new Date(Date.UTC(parsedYear, parsedMonth - 1, parsedDay));
  return (
    candidate.getUTCFullYear() === parsedYear &&
    candidate.getUTCMonth() === parsedMonth - 1 &&
    candidate.getUTCDate() === parsedDay
  );
}
export function toCanonicalDateValue(value: string | null | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    return "";
  }
  const isoMatch = normalized.match(ISO_DATE_PATTERN);
  if (isoMatch && isValidDateParts(isoMatch[1], isoMatch[2], isoMatch[3])) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  const isoDateTimeMatch = normalized.match(ISO_DATE_TIME_PATTERN);
  if (
    isoDateTimeMatch &&
    isValidDateParts(isoDateTimeMatch[1], isoDateTimeMatch[2], isoDateTimeMatch[3])
  ) {
    return `${isoDateTimeMatch[1]}-${isoDateTimeMatch[2]}-${isoDateTimeMatch[3]}`;
  }
  const displayMatch = normalized.match(DISPLAY_DATE_PATTERN);
  if (displayMatch && isValidDateParts(displayMatch[3], displayMatch[2], displayMatch[1])) {
    return `${displayMatch[3]}-${displayMatch[2]}-${displayMatch[1]}`;
  }
  return "";
}
export function formatDateForDisplay(value: string | null | undefined): string {
  const normalized = toCanonicalDateValue(value);
  if (!normalized) {
    return "";
  }
  const [year, month, day] = normalized.split("-");
  if (!year || !month || !day) {
    return "";
  }
  return `${day}/${month}/${year}`;
}
export function formatDateEntry(value: string): string {
  const normalized = value.trim();
  if (normalized.includes("-")) {
    return formatDateForDisplay(normalized);
  }
  const digits = normalized.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
export function openDatePicker(input: HTMLInputElement | null) {
  if (!input) {
    return;
  }
  const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
  if (typeof pickerInput.showPicker === "function") {
    pickerInput.showPicker();
    return;
  }
  input.focus();
  input.click();
}
export function getTodayInputValue(): string {
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60_000);
  return formatDateForDisplay(localDate.toISOString().slice(0, 10));
}
export function toNullableTrimmedString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
export function toIsoDateTime(value: string | null | undefined): string | null {
  const normalized = toCanonicalDateValue(value);
  return normalized ? `${normalized}T00:00:00.000Z` : null;
}
export function toInputDateValue(value: string | null | undefined): string {
  return formatDateForDisplay(value);
}
export function formatAccountingYear(referenceDate: string | null | undefined): string | null {
  const normalized = toCanonicalDateValue(referenceDate?.trim() || getTodayInputValue());
  const parsedMatch = normalized.match(ISO_DATE_PATTERN);
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
export function toInputValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : String(value);
}
export function buildGodownLookupOptions(
  payload: ApiSuccessResponse<GodownLookupRecord[], ListMeta> | unknown,
  branchId: string | null | undefined,
): StockLookupOption[] {
  const normalizedBranchId = branchId?.trim() ?? "";
  const rows = extractRows<GodownLookupRecord>(payload, [
    "data",
    "rows",
    "items",
    "results",
    "list",
    "godowns",
    "godown_locations",
    "godownLocations",
    "locations",
    "warehouses",
  ]);
  const optionMap = new Map<string, StockLookupOption>();
  for (const row of rows) {
    const value = getGodownLookupField(row, GODOWN_LOOKUP_ID_KEYS);
    const label = getGodownLookupField(row, GODOWN_LOOKUP_LABEL_KEYS) || value;
    const code = getGodownLookupField(row, GODOWN_LOOKUP_CODE_KEYS);
    const rowBranchId = getGodownLookupField(row, GODOWN_LOOKUP_BRANCH_ID_KEYS);
    if (!value || !label) {
      continue;
    }
    if (normalizedBranchId && rowBranchId && rowBranchId !== normalizedBranchId) {
      continue;
    }
    if (!optionMap.has(value)) {
      optionMap.set(value, code ? { value, label, code } : { value, label });
    }
  }
  const options = Array.from(optionMap.values()).sort((left, right) =>
    left.label.localeCompare(right.label),
  );
  return [DEFAULT_GODOWN_OPTION, ...options];
}
const GODOWN_LOOKUP_ID_KEYS = [
  "gdl_id",
  "gdlId",
  "gdl_location_id",
  "godown_id",
  "godownId",
  "id",
  "_id",
  "value",
  "Location ID",
  "location id",
] as const;
const GODOWN_LOOKUP_LABEL_KEYS = [
  "gdl_name",
  "gdlName",
  "godown_name",
  "godownName",
  "name",
  "label",
  "Location Name",
  "location name",
] as const;
const GODOWN_LOOKUP_BRANCH_ID_KEYS = [
  "gdl_branch_id",
  "gdlBranchId",
  "branch_id",
  "branchId",
  "Branch ID",
  "branch id",
] as const;
// "Search Code" column source. `gdl_code` is the configured search code; fall
// back to `gdl_short` (alias) when no explicit code is set on the godown.
const GODOWN_LOOKUP_CODE_KEYS = [
  "gdl_code",
  "gdlCode",
  "search_code",
  "searchCode",
  "gdl_short",
  "gdlShort",
] as const;
function getGodownLookupField(
  row: GodownLookupRecord,
  keys: readonly (keyof GodownLookupRecord)[],
): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized) {
        return normalized;
      }
    }
  }
  return "";
}
type UnitDecimalRecord = {
  unit_id?: string | null;
  unitId?: string | null;
  item_unit_id?: string | null;
  itemUnitId?: string | null;
  uom_id?: string | null;
  id?: string | null;
  value?: string | null;
  unit_decimal_count?: number | string | null;
  unitDecimalCount?: number | string | null;
  decimal_count?: number | string | null;
  decimalCount?: number | string | null;
};
function toUnitDecimalCount(value: number | string | null | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
}
export function buildUnitDecimalCountById(payload: unknown): Record<string, number> {
  const rows = extractRows<UnitDecimalRecord>(payload, [
    "data",
    "rows",
    "items",
    "results",
    "list",
    "units",
    "itemUnits",
  ]);
  const unitDecimalCountById: Record<string, number> = {};
  for (const row of rows) {
    const unitId =
      row.unit_id?.trim() ??
      row.unitId?.trim() ??
      row.item_unit_id?.trim() ??
      row.itemUnitId?.trim() ??
      row.uom_id?.trim() ??
      row.id?.trim() ??
      row.value?.trim() ??
      "";
    if (!unitId) {
      continue;
    }
    unitDecimalCountById[unitId] = toUnitDecimalCount(
      row.unit_decimal_count ??
        row.unitDecimalCount ??
        row.decimal_count ??
        row.decimalCount,
    );
  }
  return unitDecimalCountById;
}
export function normalizeOpeningStockProfitType(value: string | null | undefined): string {
  const normalized = (value ?? "").trim().toUpperCase();
  if (normalized === "BY_AMOUNT" || normalized === "BY RS" || normalized === "VALUE") {
    return "BY_AMOUNT";
  }
  if (normalized === "MANUAL" || normalized === "BY USER" || normalized === "USER") {
    return "MANUAL";
  }
  return "BY_PERCENT";
}
export function normalizeOpeningStockRoundOff(
  value: string | number | null | undefined,
): string {
  const normalized = toInputValue(value).trim();
  if (!normalized) {
    return "";
  }
  const numericValue = parseDecimal(normalized);
  if (numericValue <= 0) {
    return "";
  }
  return ROUND_OFF_OPTIONS.find((option) => parseDecimal(option) === numericValue) ?? "";
}
export function normalizeOpeningStockCessType(value: string | null | undefined): string {
  const normalized = (value ?? "").trim().toUpperCase();
  if (normalized === "PER_UNIT" || normalized === "UNIT") {
    return "PER_UNIT";
  }
  if (normalized === "PERCENT") {
    return "PERCENT";
  }
  return "NONE";
}
export function resolveTrackingType(item: ItemPriceDetailsPayload["item"]): string {
  const batchConfig = item.item_batch_config;
  if (batchConfig === 1) {
    return "1";
  }
  if (batchConfig === 2) {
    return "2";
  }
  if (item.item_is_batch_based || item.item_is_expiry_item) {
    return "2";
  }
  return "0";
}
export function buildTaxSelectionValues(
  taxDetail: ItemTaxDetailPayload | ItemPriceDetailsPayload["item_tax"],
): Record<string, string> {
  return {
    taxname: toInputValue(taxDetail?.tax_name),
    osltaxid: toInputValue(taxDetail?.tax_id),
    osltaxperc: toInputValue(taxDetail?.tax_gst_rate_total),
    oslcesstype: normalizeOpeningStockCessType(taxDetail?.tax_cess_type),
    oslcessperc: toInputValue(taxDetail?.tax_cess_perc),
    oslcessperunit: toInputValue(taxDetail?.tax_cess_unit),
  };
}
export function buildPriceSelectionValues(
  detail: ItemPriceDetailsPayload,
  priceRecord: ItemPriceDetailsPayload["item_prices"][number] | null,
  unitOptionsByValue: Map<string, string>,
  godownOptionsByValue: Map<string, string>,
  currentValues: Record<string, string>,
): Record<string, string> {
  const resolvedUnitId = priceRecord?.ipm_unit_id ?? detail.item.item_base_unit_id ?? "";
  const actualConvFactor = priceRecord?.ipm_to_base_factor ?? 1;
  const displayConvFactor = priceRecord?.ipm_unit_factor ?? actualConvFactor;
  const openingQty = parseDecimal(currentValues.openingqty);
  const freeQty = parseDecimal(currentValues.freeqty);
  const requestedGodownId = priceRecord?.ipm_godown_id ?? "";
  const resolvedGodownId =
    requestedGodownId && godownOptionsByValue.has(requestedGodownId) ? requestedGodownId : "";
  return {
    uom: unitOptionsByValue.get(resolvedUnitId) ?? "",
    godown: godownOptionsByValue.get(resolvedGodownId) ?? "",
    baseqty: formatQuantityValue(openingQty * actualConvFactor),
    freebaseqty: formatQuantityValue(freeQty * actualConvFactor),
    convfactor: toInputValue(displayConvFactor),
    oslactualconvfactor: toInputValue(actualConvFactor),
    costprice: toInputValue(priceRecord?.ipm_cost_price),
    costwot: toInputValue(priceRecord?.ipm_cost_wot),
    profittype: normalizeOpeningStockProfitType(priceRecord?.ipm_profit_type),
    roundoff: normalizeOpeningStockRoundOff(priceRecord?.ipm_round_off),
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
export function resolveDefaultItemPriceRecord(
  itemPrices: ItemPriceDetailsPayload["item_prices"],
): ItemPriceDetailsPayload["item_prices"][number] | null {
  return itemPrices.find((record) => record.ipm_is_default_unit) ?? itemPrices[0] ?? null;
}
export function resolveItemPriceRecordByUnitId(
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
export function buildUomOptions(
  detail: ItemPriceDetailsPayload | null | undefined,
  unitOptionsByValue: Map<string, string>,
): ERPDynamicSelectOption[] {
  if (!detail) {
    return [];
  }
  const optionMap = new Map<string, string>();
  for (const [index, priceRecord] of detail.item_prices.entries()) {
    if (!priceRecord.ipm_unit_id.trim() || optionMap.has(priceRecord.ipm_unit_id)) {
      continue;
    }
    optionMap.set(
      priceRecord.ipm_unit_id,
      unitOptionsByValue.get(priceRecord.ipm_unit_id) ?? `UOM ${index + 1}`,
    );
  }
  return Array.from(optionMap, ([value, label]) => ({ value, label }));
}
export { parseColumnWidth, toColumnWidth, reorderColumns } from "@/features/stocks/_shared/stock-utils";
export function mergeResolvedColumns(
  previous: ColumnDefinition[],
  incoming: ColumnDefinition[],
): ColumnDefinition[] {
  if (previous.length === 0) {
    return incoming;
  }
  const previousMap = new Map(previous.map((column) => [column.key, column]));
  return incoming.map((column) => {
    const previousColumn = previousMap.get(column.key);
    if (!previousColumn) {
      return column;
    }
    return {
      ...column,
      width: previousColumn.width || column.width,
    };
  });
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
function toConfiguredNumberInputValue(
  columnKey: keyof typeof COLUMN_SCHEMA,
  value: number | null | undefined,
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_ROW_VALUES[columnKey] ?? "";
  }
  const defaultValue = COLUMN_SCHEMA[columnKey]?.defaultValue;
  const decimalPlaces = defaultValue?.includes(".") ? defaultValue.split(".")[1].length : 0;
  if (decimalPlaces > 0) {
    return value.toFixed(decimalPlaces);
  }
  return String(value);
}
function parseOptionalOpeningStockNumber(
  value: string | number | null | undefined,
): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const normalized = toInputValue(value).trim();
  if (!normalized) {
    return null;
  }
  const parsedValue = Number(normalized);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}
function roundDerivedOpeningStockValue(
  value: number,
  roundOffValue: string | number | null | undefined,
): number {
  const roundOffStep = parseOptionalOpeningStockNumber(roundOffValue);
  if (roundOffStep === null || roundOffStep <= 0) {
    return value;
  }
  return Number(
    (Math.round((value + Number.EPSILON) / roundOffStep) * roundOffStep).toFixed(4),
  );
}
export function getOpeningStockTaxExclusiveInputValue(
  columnKey: "costwot" | "priceawot" | "pricebwot" | "pricecwot" | "pricedwot",
  inclusiveValue: string | number | null | undefined,
  taxPercentage: string | number | null | undefined,
): string {
  if (typeof inclusiveValue === "string" && inclusiveValue.trim().length === 0) {
    return DEFAULT_ROW_VALUES[columnKey] ?? "";
  }
  const normalizedInclusiveValue =
    typeof inclusiveValue === "number" ? inclusiveValue : parseDecimal(toInputValue(inclusiveValue));
  const normalizedTaxPercentage =
    typeof taxPercentage === "number" ? taxPercentage : parseDecimal(toInputValue(taxPercentage));
  const divisor = 1 + Math.max(normalizedTaxPercentage, 0) / 100;
  const taxExclusiveValue =
    divisor > 0 ? normalizedInclusiveValue / divisor : normalizedInclusiveValue;
  return toConfiguredNumberInputValue(columnKey, taxExclusiveValue);
}
export function getOpeningStockCostWotInputValue(
  costPrice: string | number | null | undefined,
  taxPercentage: string | number | null | undefined,
): string {
  return getOpeningStockTaxExclusiveInputValue("costwot", costPrice, taxPercentage);
}
export function getOpeningStockCostInputValue(
  costWot: string | number | null | undefined,
  taxPercentage: string | number | null | undefined,
): string {
  return getOpeningStockTaxInclusiveInputValue("costprice", costWot, taxPercentage);
}
export function getOpeningStockTaxInclusiveInputValue(
  columnKey: "costprice" | "pricea" | "priceb" | "pricec" | "priced",
  taxExclusiveValue: string | number | null | undefined,
  taxPercentage: string | number | null | undefined,
): string {
  if (typeof taxExclusiveValue === "string" && taxExclusiveValue.trim().length === 0) {
    return DEFAULT_ROW_VALUES[columnKey] ?? "";
  }
  const normalizedTaxExclusiveValue =
    typeof taxExclusiveValue === "number"
      ? taxExclusiveValue
      : parseDecimal(toInputValue(taxExclusiveValue));
  const normalizedTaxPercentage =
    typeof taxPercentage === "number" ? taxPercentage : parseDecimal(toInputValue(taxPercentage));
  const multiplier = 1 + Math.max(normalizedTaxPercentage, 0) / 100;
  return toConfiguredNumberInputValue(columnKey, normalizedTaxExclusiveValue * multiplier);
}
export function getOpeningStockMarkupInputValue(
  columnKey: "priceamarkup" | "pricebmarkup" | "pricecmarkup" | "pricedmarkup",
  saleValue: string | number | null | undefined,
  costValue: string | number | null | undefined,
  profitType: string | null | undefined,
): string {
  if (typeof saleValue === "string" && saleValue.trim().length === 0) {
    return DEFAULT_ROW_VALUES[columnKey] ?? "";
  }
  if (typeof costValue === "string" && costValue.trim().length === 0) {
    return DEFAULT_ROW_VALUES[columnKey] ?? "";
  }
  const normalizedSaleValue =
    typeof saleValue === "number" ? saleValue : parseDecimal(toInputValue(saleValue));
  const normalizedCostValue =
    typeof costValue === "number" ? costValue : parseDecimal(toInputValue(costValue));
  const normalizedProfitType = normalizeOpeningStockProfitType(profitType);
  const markupPercentage =
    normalizedProfitType === "BY_AMOUNT"
      ? normalizedSaleValue - normalizedCostValue
      : normalizedCostValue > 0
        ? ((normalizedSaleValue - normalizedCostValue) / normalizedCostValue) * 100
        : 0;
  return toConfiguredNumberInputValue(columnKey, markupPercentage);
}
export function createDefaultRowValues(): Record<string, string> {
  return Object.entries(COLUMN_SCHEMA).reduce<Record<string, string>>((accumulator, [key, schema]) => {
    const value = schema.defaultValue ?? "";
    accumulator[key] = value === "0.00" || value === "0.000" ? "" : value;
    return accumulator;
  }, {});
}
export const DEFAULT_ROW_VALUES = createDefaultRowValues();
export function createItemAutofillResetValues(): Record<string, string> {
  return ITEM_AUTOFILL_FIELD_KEYS.reduce<Record<string, string>>((accumulator, key) => {
    accumulator[key] = DEFAULT_ROW_VALUES[key] ?? "";
    return accumulator;
  }, {});
}
export const ITEM_AUTOFILL_RESET_VALUES = createItemAutofillResetValues();
export const OPENING_STOCK_SALE_PRICE_FIELD_PAIRS = [
  {
    saleField: "pricea",
    saleWotField: "priceawot",
    markupField: "priceamarkup",
  },
  {
    saleField: "priceb",
    saleWotField: "pricebwot",
    markupField: "pricebmarkup",
  },
  {
    saleField: "pricec",
    saleWotField: "pricecwot",
    markupField: "pricecmarkup",
  },
  {
    saleField: "priced",
    saleWotField: "pricedwot",
    markupField: "pricedmarkup",
  },
] as const;
type OpeningStockSalePriceFieldPair = (typeof OPENING_STOCK_SALE_PRICE_FIELD_PAIRS)[number];
export function getOpeningStockSalePairDerivedValues(
  values: Record<string, string>,
  fieldPair: OpeningStockSalePriceFieldPair,
  source: "markup" | "sale" | "saleWot" = "sale",
): Partial<Record<OpeningStockSalePriceFieldPair[keyof OpeningStockSalePriceFieldPair], string>> {
  if (source === "markup") {
    const normalizedMarkup = values[fieldPair.markupField]?.trim() ?? "";
    const normalizedProfitType = normalizeOpeningStockProfitType(values.profittype);
    const costPriceValue = parseOptionalOpeningStockNumber(values.costprice);
    if (!normalizedMarkup || costPriceValue === null || normalizedProfitType === "MANUAL") {
      return {};
    }
    const markupValue = parseOptionalOpeningStockNumber(normalizedMarkup) ?? 0;
    const nextSaleValue = roundDerivedOpeningStockValue(
      normalizedProfitType === "BY_AMOUNT"
        ? costPriceValue + markupValue
        : costPriceValue + (costPriceValue * markupValue) / 100,
      values.roundoff,
    );
    const nextSaleInputValue = toConfiguredNumberInputValue(fieldPair.saleField, nextSaleValue);
    return {
      [fieldPair.saleField]: nextSaleInputValue,
      [fieldPair.saleWotField]: getOpeningStockTaxExclusiveInputValue(
        fieldPair.saleWotField,
        nextSaleInputValue,
        values.osltaxperc,
      ),
    };
  }
  if (source === "saleWot") {
    const nextSaleValue = getOpeningStockTaxInclusiveInputValue(
      fieldPair.saleField,
      values[fieldPair.saleWotField],
      values.osltaxperc,
    );
    return {
      [fieldPair.saleField]: nextSaleValue,
      [fieldPair.markupField]: getOpeningStockMarkupInputValue(
        fieldPair.markupField,
        nextSaleValue,
        values.costprice,
        values.profittype,
      ),
    };
  }
  return {
    [fieldPair.saleWotField]: getOpeningStockTaxExclusiveInputValue(
      fieldPair.saleWotField,
      values[fieldPair.saleField],
      values.osltaxperc,
    ),
    [fieldPair.markupField]: getOpeningStockMarkupInputValue(
      fieldPair.markupField,
      values[fieldPair.saleField],
      values.costprice,
      values.profittype,
    ),
  };
}
const NONE_TRACKING_DISABLED_FIELD_KEYS = new Set([
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
]);
const MANUAL_PROFIT_DISABLED_FIELD_KEYS = new Set([
  "priceamarkup",
  "pricebmarkup",
  "pricecmarkup",
  "pricedmarkup",
]);
const NONE_TRACKING_HIDDEN_FIELD_KEYS = new Set(["profittype", "roundoff"]);
export function buildPendingItemSelectionValues(
  option: ERPDynamicSelectOption,
): Record<string, string> {
  return {
    ...ITEM_AUTOFILL_RESET_VALUES,
    oslactualconvfactor: "",
    itemname: option.value ? option.label : "",
    oslitemid: option.value,
  };
}
export function createRow(
  id: number,
  overrides: Record<string, string> = {},
): OpeningStockRow {
  return {
    id,
    values: {
      ...DEFAULT_ROW_VALUES,
      ...overrides,
    },
  };
}
export const INITIAL_ROWS: OpeningStockRow[] = [createRow(1)];
export function createEmptyRow(nextId: number): OpeningStockRow {
  return createRow(nextId);
}
export function buildLoadedLookupOptions(
  entries: Array<{
    value: string | null | undefined;
    label: string | null | undefined;
    code?: string | null | undefined;
  }>,
): StockLookupOption[] {
  const options = new Map<string, StockLookupOption>();
  for (const entry of entries) {
    const value = entry.value?.trim() ?? "";
    const label = entry.label?.trim() ?? "";
    const code = entry.code?.trim() ?? "";
    if (!value || !label || options.has(value)) {
      continue;
    }
    options.set(value, code ? { value, label, code } : { value, label });
  }
  return Array.from(options.values());
}
export function getNextRowId(rows: OpeningStockRow[]): number {
  return rows.reduce((highestId, row) => Math.max(highestId, row.id), 0) + 1;
}
export function ensureTrailingEmptyRow(
  rows: OpeningStockRow[],
  sourceRowId: number,
): OpeningStockRow[] {
  const sourceRowIndex = rows.findIndex((row) => row.id === sourceRowId);
  if (sourceRowIndex === -1 || sourceRowIndex !== rows.length - 1) {
    return rows;
  }
  const sourceRow = rows[sourceRowIndex];
  if (isPristineRow(sourceRow)) {
    return rows;
  }
  return [...rows, createEmptyRow(getNextRowId(rows))];
}
export function getFilteredRows(rows: OpeningStockRow[], searchQuery: string): OpeningStockRow[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  if (!normalizedQuery) {
    return rows;
  }
  return rows.filter((row) =>
    Object.values(row.values).some((value) => value.toLowerCase().includes(normalizedQuery)),
  );
}
export function getRowStockValue(row: OpeningStockRow): number {
  return parseDecimal(row.values.openingqty) * parseDecimal(row.values.costprice);
}
function getTrackingTypeValue(row: OpeningStockRow): (typeof TRACKING_OPTIONS)[number] {
  return normalizeOpeningStockTrackingType(row.values.osltrackingtype);
}
export function normalizeOpeningStockTrackingType(
  value: string | null | undefined,
): (typeof TRACKING_OPTIONS)[number] {
  const normalized = (value ?? "").trim().toUpperCase();
  if (normalized === "1" || normalized === "MRP") {
    return "1";
  }
  if (normalized === "2" || normalized === "BATCH") {
    return "2";
  }
  return "0";
}
export function toOpeningStockTrackingTypePayloadValue(
  value: string | null | undefined,
): string {
  return TRACKING_TYPE_OPTION_LABELS[normalizeOpeningStockTrackingType(value)];
}

export function isOpeningStockBatchNumberEditable(
  row: OpeningStockRow,
  itemDetail?: ItemPriceDetailsPayload,
): boolean {
  if (!itemDetail?.item.item_is_batch_based) {
    return false;
  }

  const trackingType = getTrackingTypeValue(row);
  return trackingType === "1" || trackingType === "2";
}

export function getTrackingRequiredFieldKeys(
  row: OpeningStockRow,
  itemDetail?: ItemPriceDetailsPayload,
): readonly string[] {
  const trackingType = getTrackingTypeValue(row);
  const requiredFieldKeys = TRACKING_REQUIRED_FIELD_KEYS[trackingType] ?? [];

  if (trackingType !== "2" || !itemDetail || itemDetail.item.item_is_batch_based) {
    return requiredFieldKeys;
  }

  return requiredFieldKeys.filter((fieldKey) => fieldKey !== "batchno");
}
export function getInvalidFieldKey(rowId: number, fieldKey: string): string {
  return `${rowId}:${fieldKey}`;
}
export function isTrackingRequiredFieldMissing(
  row: OpeningStockRow,
  fieldKey: string,
  itemDetail?: ItemPriceDetailsPayload,
): boolean {
  if (!getTrackingRequiredFieldKeys(row, itemDetail).includes(fieldKey)) {
    return false;
  }
  return !toNullableTrimmedString(row.values[fieldKey]);
}
export function clearInvalidFieldKeys(
  current: Record<string, true>,
  rowId: number,
  fieldKeys: readonly string[],
): Record<string, true> {
  let changed = false;
  const next = { ...current };
  for (const fieldKey of fieldKeys) {
    const invalidFieldKey = getInvalidFieldKey(rowId, fieldKey);
    if (next[invalidFieldKey]) {
      delete next[invalidFieldKey];
      changed = true;
    }
  }
  return changed ? next : current;
}
export function buildInvalidFieldState(
  issues: Array<{ rowId: number; fieldKey: string }>,
): Record<string, true> {
  return issues.reduce<Record<string, true>>((accumulator, issue) => {
    accumulator[getInvalidFieldKey(issue.rowId, issue.fieldKey)] = true;
    return accumulator;
  }, {});
}
export function isValidationFieldSatisfied(row: OpeningStockRow, fieldKey: string): boolean {
  if (fieldKey === "itemname") {
    return Boolean(toNullableTrimmedString(row.values.oslitemid));
  }
  if (fieldKey === "godown") {
    return Boolean(toNullableTrimmedString(row.values.oslgodownid));
  }
  if (fieldKey === "uom") {
    return Boolean(toNullableTrimmedString(row.values.oslunitid));
  }
  return Boolean(toNullableTrimmedString(row.values[fieldKey]));
}
export function focusOpeningStockField(
  table: HTMLTableElement | null,
  rowId: number,
  fieldKey: string,
): void {
  const selector = `[data-opening-stock-row-id="${rowId}"][data-opening-stock-field-key="${fieldKey}"]`;
  const fieldControl = table?.querySelector<HTMLElement>(selector);
  if (!fieldControl) {
    return;
  }
  fieldControl.scrollIntoView({
    block: "nearest",
    inline: "nearest",
  });
  fieldControl.focus();
  if (fieldControl instanceof HTMLInputElement && fieldControl.type !== "date") {
    fieldControl.select();
  }
}
function getOpeningStockFocusableControls(table: HTMLTableElement): HTMLElement[] {
  return Array.from(
    table.querySelectorAll<HTMLElement>('[data-opening-stock-field-control="true"]'),
  ).filter((element) => !element.matches(":disabled"));
}
export function moveOpeningStockFieldFocus(
  currentControl: HTMLElement,
  direction: "left" | "right",
): void {
  const table = currentControl.closest("table");
  if (!(table instanceof HTMLTableElement)) {
    return;
  }
  const focusableControls = getOpeningStockFocusableControls(table);
  const currentIndex = focusableControls.indexOf(currentControl);
  if (currentIndex === -1) {
    return;
  }
  const targetIndex = direction === "left" ? currentIndex - 1 : currentIndex + 1;
  const targetControl = focusableControls[targetIndex];
  if (!targetControl) {
    return;
  }
  targetControl.scrollIntoView({
    block: "nearest",
    inline: "nearest",
  });
  targetControl.focus();
  if (targetControl instanceof HTMLInputElement && targetControl.type !== "date") {
    targetControl.select();
  }
}
function isOpeningStockQuantityField(fieldKey: string): boolean {
  return fieldKey === "openingqty" || fieldKey === "freeqty";
}
export function getOpeningStockQuantityDecimalCount(
  unitId: string | null | undefined,
  unitDecimalCountById: Record<string, number>,
): number {
  const normalizedUnitId = unitId?.trim() ?? "";
  if (!normalizedUnitId) {
    return 0;
  }
  return unitDecimalCountById[normalizedUnitId] ?? 0;
}

export function normalizeOpeningStockQuantityInputValue(
  value: string,
  decimalCount: number,
): string {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return "";
  }

  const sanitizedValue = normalizedValue.replace(/[^\d.]/g, "");
  if (!sanitizedValue) {
    return "";
  }

  const hasDecimalSeparator = sanitizedValue.includes(".");
  const [wholePart = "", ...fractionParts] = sanitizedValue.split(".");
  const normalizedWholePart = wholePart || (hasDecimalSeparator && decimalCount > 0 ? "0" : "");

  if (!hasDecimalSeparator || decimalCount <= 0) {
    return normalizedWholePart;
  }

  const normalizedFractionPart = fractionParts.join("").slice(0, decimalCount);
  if (sanitizedValue.endsWith(".") && normalizedFractionPart.length === 0) {
    return `${normalizedWholePart}.`;
  }

  return `${normalizedWholePart}.${normalizedFractionPart}`;
}

export function getOpeningStockQuantityInputStep(
  fieldKey: string,
  decimalCount: number,
): string | undefined {
  if (!isOpeningStockQuantityField(fieldKey)) {
    return undefined;
  }

  if (decimalCount <= 0) {
    return "1";
  }

  return `0.${"0".repeat(Math.max(decimalCount - 1, 0))}1`;
}

export function normalizeOpeningStockRowQuantitiesByUnit(
  row: OpeningStockRow,
  unitDecimalCountById: Record<string, number>,
): OpeningStockRow {
  const decimalCount = getOpeningStockQuantityDecimalCount(
    row.values.oslunitid,
    unitDecimalCountById,
  );
  const nextOpeningQty = normalizeOpeningStockQuantityInputValue(
    row.values.openingqty ?? "",
    decimalCount,
  );
  const nextFreeQty = normalizeOpeningStockQuantityInputValue(
    row.values.freeqty ?? "",
    decimalCount,
  );

  if (
    nextOpeningQty === (row.values.openingqty ?? "") &&
    nextFreeQty === (row.values.freeqty ?? "")
  ) {
    return row;
  }

  const convFactor = getOpeningStockActualConvFactor(row.values);
  return {
    ...row,
    values: {
      ...row.values,
      openingqty: nextOpeningQty,
      freeqty: nextFreeQty,
      baseqty: formatQuantityValue(parseDecimal(nextOpeningQty) * convFactor),
      freebaseqty: formatQuantityValue(parseDecimal(nextFreeQty) * convFactor),
    },
  };
}

export function isPristineRow(row: OpeningStockRow): boolean {
  return Object.entries(DEFAULT_ROW_VALUES).every(
    ([key, defaultValue]) => (row.values[key] ?? "") === defaultValue,
  );
}

export function getTotals(rows: OpeningStockRow[]): {
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

function getOpeningStockFieldLabel(fieldKey: string): string {
  return TRACKING_REQUIRED_FIELD_LABELS[fieldKey] ?? COLUMN_SCHEMA[fieldKey]?.header ?? fieldKey;
}

export function getRowValidationIssues(
  row: OpeningStockRow,
  rowNumber: number,
  itemDetail?: ItemPriceDetailsPayload,
): RowValidationIssue[] {
  const issues: RowValidationIssue[] = [];

  if (!toNullableTrimmedString(row.values.oslitemid)) {
    issues.push({
      fieldKey: "itemname",
      message: `Row ${rowNumber} is missing an item name.`,
    });
  }

  if (!toNullableTrimmedString(row.values.oslunitid)) {
    issues.push({
      fieldKey: "uom",
      message: `Row ${rowNumber} is missing a unit.`,
    });
  }

  if (!toNullableTrimmedString(row.values.oslgodownid)) {
    issues.push({
      fieldKey: "godown",
      message: `Row ${rowNumber} is missing a godown.`,
    });
  }

  if (!row.values.openingqty?.trim()) {
    issues.push({
      fieldKey: "openingqty",
      message: `Row ${rowNumber} is missing opening quantity.`,
    });
  }

  for (const fieldKey of OPENING_STOCK_NON_NEGATIVE_NUMBER_FIELD_KEYS) {
    const normalizedValue = row.values[fieldKey]?.trim() ?? "";
    if (!normalizedValue) {
      continue;
    }

    const parsedValue = Number(normalizedValue);
    if (Number.isFinite(parsedValue) && parsedValue >= 0) {
      continue;
    }

    issues.push({
      fieldKey,
      message: `Row ${rowNumber} has an invalid ${getOpeningStockFieldLabel(fieldKey)}. Enter a non-negative number.`,
    });
  }

  const normalizedDates = Object.fromEntries(
    OPENING_STOCK_DATE_FIELD_KEYS.map((fieldKey) => [fieldKey, toCanonicalDateValue(row.values[fieldKey])]),
  ) as Record<(typeof OPENING_STOCK_DATE_FIELD_KEYS)[number], string>;

  for (const fieldKey of OPENING_STOCK_DATE_FIELD_KEYS) {
    const normalizedValue = row.values[fieldKey]?.trim() ?? "";
    if (!normalizedValue || normalizedDates[fieldKey]) {
      continue;
    }

    issues.push({
      fieldKey,
      message: `Row ${rowNumber} has an invalid ${getOpeningStockFieldLabel(fieldKey)}. Use dd/mm/yyyy.`,
    });
  }

  if (
    normalizedDates.mfgdate &&
    normalizedDates.expirydate &&
    normalizedDates.expirydate < normalizedDates.mfgdate
  ) {
    issues.push({
      fieldKey: "expirydate",
      message: `Row ${rowNumber} expiry date must be on or after mfg date.`,
    });
  }

  for (const missingTrackingFieldKey of getTrackingRequiredFieldKeys(row, itemDetail)) {
    if (toNullableTrimmedString(row.values[missingTrackingFieldKey])) {
      continue;
    }

    const trackingType = getTrackingTypeValue(row);
    issues.push({
      fieldKey: missingTrackingFieldKey,
      message: `Row ${rowNumber} requires ${getOpeningStockFieldLabel(missingTrackingFieldKey)} when tracking type is ${trackingType === "1" ? "MRP" : "BATCH"}.`,
    });
  }

  return issues;
}

export function getRowValidationMessage(
  row: OpeningStockRow,
  rowNumber: number,
  itemDetail?: ItemPriceDetailsPayload,
): string | null {
  return getRowValidationIssues(row, rowNumber, itemDetail)[0]?.message ?? null;
}

export function buildOpeningStockDetailPayload(row: OpeningStockRow): OpeningStockSaveDetail {
  const convFactor = getOpeningStockActualConvFactor(row.values);

  return {
    osl_barcode: toNullableTrimmedString(row.values.barcode),
    osl_item_id: row.values.oslitemid.trim(),
    osl_unit_id: row.values.oslunitid.trim(),
    osl_base_uom_id: toNullableTrimmedString(row.values.oslbaseuomid),
    osl_godown_id: row.values.oslgodownid.trim(),
    osl_tracking_type: toOpeningStockTrackingTypePayloadValue(row.values.osltrackingtype),
    osl_tax_id: toNullableTrimmedString(row.values.osltaxid),
    osl_tax_perc: parseDecimal(row.values.osltaxperc),
    osl_cess_type: row.values.oslcesstype?.trim() || "NONE",
    osl_cess_perc: parseDecimal(row.values.oslcessperc),
    osl_cess_per_unit: parseDecimal(row.values.oslcessperunit),
    osl_qty: parseDecimal(row.values.openingqty),
    osl_free_qty: parseDecimal(row.values.freeqty),
    osl_base_qty: parseDecimal(row.values.baseqty),
    osl_free_base_qty: parseDecimal(row.values.freebaseqty),
    osl_conv_factor: convFactor,
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

function mapOpeningStockDetailToRow(
  detail: OpeningStockDocumentPayload["details"][number],
  rowId: number,
): OpeningStockRow {
  return createRow(rowId, {
    barcode: toInputValue(detail.osl_barcode),
    code: toInputValue(detail.osl_item_code),
    itemname: toInputValue(detail.osl_item_name),
    godown: toInputValue(detail.osl_godown_name),
    uom: toInputValue(detail.osl_unit_name),
    taxname: toInputValue(detail.osl_tax_name),
    openingqty: toConfiguredNumberInputValue("openingqty", detail.osl_qty),
    freeqty: toConfiguredNumberInputValue("freeqty", detail.osl_free_qty),
    baseqty: toConfiguredNumberInputValue("baseqty", detail.osl_base_qty),
    freebaseqty: toConfiguredNumberInputValue("freebaseqty", detail.osl_free_base_qty),
    convfactor: toConfiguredNumberInputValue("convfactor", detail.osl_conv_factor),
    oslactualconvfactor: toConfiguredNumberInputValue("convfactor", detail.osl_conv_factor),
    batchno: toInputValue(detail.osl_batch_no),
    serialno: toInputValue(detail.osl_serial_no),
    batchdate: toInputDateValue(detail.osl_batch_date),
    mfgdate: toInputDateValue(detail.osl_mfg_date),
    expirydate: toInputDateValue(detail.osl_expiry_date),
    costprice: toConfiguredNumberInputValue("costprice", detail.osl_cost_rate),
    costwot: toConfiguredNumberInputValue("costwot", detail.osl_cost_rate_wot),
    profittype: DEFAULT_ROW_VALUES.profittype ?? PROFIT_TYPE_OPTIONS[0],
    roundoff: DEFAULT_ROW_VALUES.roundoff ?? "",
    priceawot: toConfiguredNumberInputValue("priceawot", detail.osl_sale_rate_a_wot),
    priceamarkup: toConfiguredNumberInputValue("priceamarkup", detail.osl_markup_perc_a),
    pricea: toConfiguredNumberInputValue("pricea", detail.osl_sale_rate_a),
    pricebwot: toConfiguredNumberInputValue("pricebwot", detail.osl_sale_rate_b_wot),
    pricebmarkup: toConfiguredNumberInputValue("pricebmarkup", detail.osl_markup_perc_b),
    priceb: toConfiguredNumberInputValue("priceb", detail.osl_sale_rate_b),
    pricecwot: toConfiguredNumberInputValue("pricecwot", detail.osl_sale_rate_c_wot),
    pricecmarkup: toConfiguredNumberInputValue("pricecmarkup", detail.osl_markup_perc_c),
    pricec: toConfiguredNumberInputValue("pricec", detail.osl_sale_rate_c),
    pricedwot: toConfiguredNumberInputValue("pricedwot", detail.osl_sale_rate_d_wot),
    pricedmarkup: toConfiguredNumberInputValue("pricedmarkup", detail.osl_markup_perc_d),
    priced: toConfiguredNumberInputValue("priced", detail.osl_sale_rate_d),
    mrp: toConfiguredNumberInputValue("mrp", detail.osl_mrp_rate),
    msp: toConfiguredNumberInputValue("msp", detail.osl_min_rate),
    remarks: toInputValue(detail.osl_remarks),
    oslitemid: toInputValue(detail.osl_item_id),
    oslunitid: toInputValue(detail.osl_unit_id),
    oslbaseuomid: toInputValue(detail.osl_base_uom_id),
    oslgodownid: toInputValue(detail.osl_godown_id),
    osltrackingtype: normalizeOpeningStockTrackingType(detail.osl_tracking_type),
    osltaxid: toInputValue(detail.osl_tax_id),
    osltaxperc: toConfiguredNumberInputValue("osltaxperc", detail.osl_tax_perc),
    oslcesstype: normalizeOpeningStockCessType(detail.osl_cess_type),
    oslcessperc: toConfiguredNumberInputValue("oslcessperc", detail.osl_cess_perc),
    oslcessperunit: toConfiguredNumberInputValue("oslcessperunit", detail.osl_cess_per_unit),
  });
}
export function mapOpeningStockDocumentToRows(
  document: OpeningStockDocumentPayload,
): OpeningStockRow[] {
  if (document.details.length === 0) {
    return [createEmptyRow(1)];
  }

  const loadedRows = document.details.map((detail, index) =>
    mapOpeningStockDetailToRow(detail, index + 1),
  );

  return [...loadedRows, createEmptyRow(getNextRowId(loadedRows))];
}

export function buildOpeningStockNarration(rows: OpeningStockRow[]): string | null {
  const remarks = rows
    .map((row) => toNullableTrimmedString(row.values.remarks))
    .filter((value): value is string => Boolean(value));

  return remarks.length > 0 ? remarks.join(" | ") : null;
}

export function resolveConfiguredColumns(
  configuredColumns: UiTableColumnPayload[],
): ColumnDefinition[] {
  if (configuredColumns.length === 0) {
    return [];
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

  return resolvedColumns;
}

export function getTableMinWidth(columns: ColumnDefinition[]): string {
  const width = columns.reduce(
    (total, column) => total + parseDecimal(column.width),
    parseDecimal(DELETE_ACTION_COLUMN_WIDTH) + parseDecimal(SERIAL_NUMBER_COLUMN_WIDTH),
  );
  return `${Math.max(width, 1080)}px`;
}

export function mergeLookupOptions<TOption extends ERPDynamicSelectOption>(
  currentOptions: TOption[],
  nextOptions: TOption[],
): TOption[] {
  const emptyOption =
    currentOptions.find((option) => option.value === "") ??
    nextOptions.find((option) => option.value === "");
  const merged = new Map<string, TOption>();

  for (const option of [...currentOptions, ...nextOptions]) {
    if (!option.value) {
      continue;
    }
    if (!merged.has(option.value)) {
      merged.set(option.value, option);
    }
  }

  const normalizedOptions = Array.from(merged.values()).sort((left, right) =>
    left.label.localeCompare(right.label),
  );

  return emptyOption ? [emptyOption, ...normalizedOptions] : normalizedOptions;
}

export function filterLookupOptions<TOption extends ERPDynamicSelectOption>(
  options: TOption[],
  searchQuery: string,
): TOption[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  return options.filter((option) => {
    if (!option.value.trim()) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    const code = (option as StockLookupOption).code;
    return (
      option.label.toLowerCase().includes(normalizedQuery) ||
      option.value.toLowerCase().includes(normalizedQuery) ||
      (code?.toLowerCase().includes(normalizedQuery) ?? false)
    );
  });
}

export function buildItemAutofillValues(
  detail: ItemPriceDetailsPayload,
  unitOptionsByValue: Map<string, string>,
  godownOptionsByValue: Map<string, string>,
  taxOptionsByValue: Map<string, string>,
  currentValues: Record<string, string>,
  selectedLabel: string,
): Record<string, string> {
  const defaultPrice = resolveDefaultItemPriceRecord(detail.item_prices);
  const defaultTaxId = toInputValue(detail.item.item_default_tax_id);

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
          taxname: taxOptionsByValue.get(defaultTaxId) ?? "",
          osltaxid: defaultTaxId,
        }),
  };
}

export function isOpeningStockFieldDisabled(
  columnKey: string,
  row: OpeningStockRow,
  itemDetail?: ItemPriceDetailsPayload,
): boolean {
  const trackingType = getTrackingTypeValue(row);
  const profitType = normalizeOpeningStockProfitType(row.values.profittype);
  const isBatchTrackingSelected = trackingType === "2";
  const isBatchOnlyField = BATCH_TRACKING_FIELD_KEYS.has(columnKey);
  const isBatchNumberField = columnKey === "batchno";
  const isBatchNumberEditable = isOpeningStockBatchNumberEditable(row, itemDetail);
  const isNoneTrackingRestrictedField =
    trackingType === "0" && NONE_TRACKING_DISABLED_FIELD_KEYS.has(columnKey);
  const isManualProfitRestrictedField =
    profitType === "MANUAL" && MANUAL_PROFIT_DISABLED_FIELD_KEYS.has(columnKey);

  return (
    columnKey === "baseqty" ||
    columnKey === "freebaseqty" ||
    columnKey === "convfactor" ||
    columnKey === "osltaxperc" ||
    columnKey === "osltrackingtype" ||
    columnKey === "oslcessperc" ||
    columnKey === "oslcessperunit" ||
    columnKey === "oslcesstype" ||
    columnKey === "taxname" ||
    columnKey === "oslitemid" ||
    columnKey === "oslunitid" ||
    columnKey === "osltaxid" ||
    columnKey === "osluomid" ||
    columnKey === "oslgodownid" ||
    columnKey === "oslbaseuomid" ||
    (isBatchNumberField && !isBatchNumberEditable) ||
    (columnKey !== "batchno" && isBatchOnlyField && !isBatchTrackingSelected) ||
    isNoneTrackingRestrictedField ||
    isManualProfitRestrictedField
  );
}

export function isOpeningStockFieldHidden(
  columnKey: string,
  row: OpeningStockRow,
): boolean {
  return getTrackingTypeValue(row) === "0" && NONE_TRACKING_HIDDEN_FIELD_KEYS.has(columnKey);
}
