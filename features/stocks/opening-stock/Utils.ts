import type { ERPDynamicSelectOption } from "@/components/library/ui";
import type {
  ItemPriceDetailsPayload,
  ItemTaxDetailPayload,
} from "@/store/api/lookupsApi";
import type {
  ColumnAlign,
  ColumnDefinition,
  ColumnSchema,
  OpeningStockRow,
  TableFocusableFieldTarget,
  TableFieldNavigationDirection,
  UiTableColumnPayload,
} from "./Types";
import type {
  OpeningStockDocumentPayload,
  OpeningStockSaveDetail,
} from "./opening-stock.types";
import {
  COLUMN_SCHEMA,
  FALLBACK_COLUMN_KEYS,
  HIDDEN_INTERNAL_COLUMN_KEYS,
  ITEM_AUTOFILL_FIELD_KEYS,
  //ITEM_AUTOFILL_RESET_VALUES_PLACEHOLDER,
  QUANTITY_FORMATTER,
  SERIAL_NUMBER_COLUMN_WIDTH,
  TABLE_FIELD_CONTAINER_SELECTOR,
  TABLE_FIELD_CONTROL_SELECTOR,
} from "./constants";

// ─── String / class helpers ───────────────────────────────────────────────────

export function cx(...tokens: Array<string | false | undefined>): string {
  return tokens.filter(Boolean).join(" ");
}

export function normalizeColumnName(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
}

// ─── Number helpers ───────────────────────────────────────────────────────────

export function parseDecimal(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatQuantityValue(value: number): string {
  return QUANTITY_FORMATTER.format(value).replace(/,/g, "");
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function getTodayInputValue(): string {
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

export function toIsoDateTime(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? `${normalized}T00:00:00.000Z` : null;
}

export function toInputDateValue(value: string | null | undefined): string {
  const normalized = value?.trim();
  if (!normalized) return "";
  const isoDateMatch = /^\d{4}-\d{2}-\d{2}/.exec(normalized);
  if (isoDateMatch) return isoDateMatch[0];
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "";
  const localDate = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

export function formatAccountingYear(referenceDate: string | null | undefined): string | null {
  const normalized = referenceDate?.trim() || getTodayInputValue();
  const parsedMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!parsedMatch) return null;
  const year = Number(parsedMatch[1]);
  const month = Number(parsedMatch[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

// ─── Value coercion ───────────────────────────────────────────────────────────

export function toInputValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

export function toNullableTrimmedString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function toConfiguredNumberInputValue(
  columnKey: keyof typeof COLUMN_SCHEMA,
  value: number | null | undefined,
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return COLUMN_SCHEMA[columnKey]?.defaultValue ?? "";
  }
  const defaultValue = COLUMN_SCHEMA[columnKey]?.defaultValue;
  const decimalPlaces = defaultValue?.includes(".")
    ? defaultValue.split(".")[1].length
    : 0;
  return decimalPlaces > 0 ? value.toFixed(decimalPlaces) : String(value);
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

export function normalizeOpeningStockProfitType(value: string | null | undefined): string {
  const normalized = (value ?? "").trim().toUpperCase();
  return normalized === "BY_AMOUNT" || normalized === "BY RS" || normalized === "VALUE"
    ? "VALUE"
    : "PERCENT";
}

export function normalizeOpeningStockCessType(value: string | null | undefined): string {
  const normalized = (value ?? "").trim().toUpperCase();
  if (normalized === "PER_UNIT" || normalized === "UNIT") return "PER_UNIT";
  if (normalized === "PERCENT") return "PERCENT";
  return "NONE";
}

// ─── Item/price helpers ───────────────────────────────────────────────────────

export function resolveTrackingType(item: ItemPriceDetailsPayload["item"]): string {
  return item.item_is_batch_based || item.item_is_expiry_item ? "BATCH" : "NONE";
}

export function resolveDefaultItemPriceRecord(
  itemPrices: ItemPriceDetailsPayload["item_prices"],
): ItemPriceDetailsPayload["item_prices"][number] | null {
  return itemPrices.find((r) => r.ipm_is_default_unit) ?? itemPrices[0] ?? null;
}

export function resolveItemPriceRecordByUnitId(
  detail: ItemPriceDetailsPayload,
  unitId: string,
): ItemPriceDetailsPayload["item_prices"][number] | null {
  const normalizedUnitId = unitId.trim();
  if (!normalizedUnitId) return resolveDefaultItemPriceRecord(detail.item_prices);
  return (
    detail.item_prices.find((r) => r.ipm_unit_id === normalizedUnitId) ??
    resolveDefaultItemPriceRecord(detail.item_prices)
  );
}

// ─── Value builders ───────────────────────────────────────────────────────────

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
      priceRecord?.ipm_uom_remarks ??
        priceRecord?.ipm_cost_remarks ??
        detail.item.item_notes,
    ),
    oslunitid: toInputValue(resolvedUnitId),
    oslbaseuomid: toInputValue(priceRecord?.ipm_id),
    oslgodownid: toInputValue(resolvedGodownId),
  };
}

export function buildUomOptions(
  detail: ItemPriceDetailsPayload | null | undefined,
  unitOptionsByValue: Map<string, string>,
): ERPDynamicSelectOption[] {
  if (!detail) return [];
  const optionMap = new Map<string, string>();
  for (const [index, priceRecord] of detail.item_prices.entries()) {
    if (!priceRecord.ipm_unit_id.trim() || optionMap.has(priceRecord.ipm_unit_id)) continue;
    optionMap.set(
      priceRecord.ipm_unit_id,
      unitOptionsByValue.get(priceRecord.ipm_unit_id) ?? `UOM ${index + 1}`,
    );
  }
  return Array.from(optionMap, ([value, label]) => ({ value, label }));
}

export function buildItemAutofillValues(
  detail: ItemPriceDetailsPayload,
  unitOptionsByValue: Map<string, string>,
  godownOptionsByValue: Map<string, string>,
  currentValues: Record<string, string>,
  selectedLabel: string,
  itemAutofillResetValues: Record<string, string>,
): Record<string, string> {
  const defaultPrice = resolveDefaultItemPriceRecord(detail.item_prices);
  return {
    ...itemAutofillResetValues,
    itemname: detail.item.item_name_en?.trim() || selectedLabel,
    oslitemid: detail.item.item_id,
    barcode: toInputValue(detail.item.item_default_barcode),
    code: toInputValue(detail.item.item_code),
    ...buildPriceSelectionValues(detail, defaultPrice, unitOptionsByValue, godownOptionsByValue, currentValues),
    osltrackingtype: resolveTrackingType(detail.item),
    ...(detail.item_tax
      ? buildTaxSelectionValues(detail.item_tax)
      : {
          taxname: "",
          osltaxid: toInputValue(detail.item.item_default_tax_id),
        }),
  };
}

export function buildPendingItemSelectionValues(
  option: ERPDynamicSelectOption,
  itemAutofillResetValues: Record<string, string>,
): Record<string, string> {
  return {
    ...itemAutofillResetValues,
    itemname: option.value ? option.label : "",
    oslitemid: option.value,
  };
}

export function buildLoadedLookupOptions(
  entries: Array<{ value: string | null | undefined; label: string | null | undefined }>,
): ERPDynamicSelectOption[] {
  const options = new Map<string, string>();
  for (const entry of entries) {
    const value = entry.value?.trim() ?? "";
    const label = entry.label?.trim() ?? "";
    if (!value || !label || options.has(value)) continue;
    options.set(value, label);
  }
  return Array.from(options, ([value, label]) => ({ value, label }));
}

// ─── Row helpers ──────────────────────────────────────────────────────────────

export function createDefaultRowValues(): Record<string, string> {
  return Object.entries(COLUMN_SCHEMA).reduce<Record<string, string>>(
    (acc, [key, schema]) => {
      acc[key] = schema.defaultValue ?? "";
      return acc;
    },
    {},
  );
}

export function createItemAutofillResetValues(
  defaultRowValues: Record<string, string>,
): Record<string, string> {
  return ITEM_AUTOFILL_FIELD_KEYS.reduce<Record<string, string>>((acc, key) => {
    acc[key] = defaultRowValues[key] ?? "";
    return acc;
  }, {});
}

export function createRow(
  id: number,
  defaultRowValues: Record<string, string>,
  overrides: Record<string, string> = {},
): OpeningStockRow {
  return { id, values: { ...defaultRowValues, ...overrides } };
}

export function getNextRowId(rows: OpeningStockRow[]): number {
  return rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
}

export function isPristineRow(
  row: OpeningStockRow,
  defaultRowValues: Record<string, string>,
): boolean {
  return Object.entries(defaultRowValues).every(
    ([key, defaultValue]) => (row.values[key] ?? "") === defaultValue,
  );
}

export function getFilteredRows(rows: OpeningStockRow[], searchQuery: string): OpeningStockRow[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  if (!normalizedQuery) return rows;
  return rows.filter((row) =>
    Object.values(row.values).some((v) => v.toLowerCase().includes(normalizedQuery)),
  );
}

export function getRowStockValue(row: OpeningStockRow): number {
  return parseDecimal(row.values.openingqty) * parseDecimal(row.values.costprice);
}

export function getTotals(rows: OpeningStockRow[]) {
  return rows.reduce(
    (acc, row) => ({
      lines: acc.lines + 1,
      qty: acc.qty + parseDecimal(row.values.openingqty),
      freeQty: acc.freeQty + parseDecimal(row.values.freeqty),
      value: acc.value + getRowStockValue(row),
    }),
    { lines: 0, qty: 0, freeQty: 0, value: 0 },
  );
}

export function getRowValidationMessage(row: OpeningStockRow, rowNumber: number): string | null {
  if (!toNullableTrimmedString(row.values.oslitemid)) return `Row ${rowNumber} is missing an item.`;
  if (!toNullableTrimmedString(row.values.oslunitid)) return `Row ${rowNumber} is missing a unit.`;
  if (!toNullableTrimmedString(row.values.oslgodownid)) return `Row ${rowNumber} is missing a godown.`;
  if (!row.values.openingqty?.trim()) return `Row ${rowNumber} is missing opening quantity.`;
  return null;
}

export function buildOpeningStockNarration(rows: OpeningStockRow[]): string | null {
  const remarks = rows
    .map((row) => toNullableTrimmedString(row.values.remarks))
    .filter((v): v is string => Boolean(v));
  return remarks.length > 0 ? remarks.join(" | ") : null;
}

// ─── Payload builders ─────────────────────────────────────────────────────────

export function buildOpeningStockDetailPayload(row: OpeningStockRow): OpeningStockSaveDetail {
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

export function mapOpeningStockDetailToRow(
  detail: OpeningStockDocumentPayload["details"][number],
  rowId: number,
  defaultRowValues: Record<string, string>,
): OpeningStockRow {
  return createRow(rowId, defaultRowValues, {
    barcode: toInputValue(detail.osl_barcode),
    code: toInputValue(detail.osl_item_code),
    itemname: toInputValue(detail.osl_item_name),
    godown: toInputValue(detail.osl_godown_name),
    uom: toInputValue(detail.osl_unit_name),
    taxname: toInputValue(detail.osl_tax_name),
    openingqty: toConfiguredNumberInputValue("openingqty", detail.osl_qty),
    freeqty: toConfiguredNumberInputValue("freeqty", detail.osl_free_qty),
    baseqty: toConfiguredNumberInputValue("baseqty", detail.osl_base_qty),
    convfactor: toConfiguredNumberInputValue("convfactor", detail.osl_conv_factor),
    batchno: toInputValue(detail.osl_batch_no),
    serialno: toInputValue(detail.osl_serial_no),
    batchdate: toInputDateValue(detail.osl_batch_date),
    mfgdate: toInputDateValue(detail.osl_mfg_date),
    expirydate: toInputDateValue(detail.osl_expiry_date),
    costprice: toConfiguredNumberInputValue("costprice", detail.osl_cost_rate),
    costwot: toConfiguredNumberInputValue("costwot", detail.osl_cost_rate_wot),
    profittype: defaultRowValues.profittype ?? "",
    roundoff: defaultRowValues.roundoff ?? "",
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
    osltrackingtype: toInputValue(detail.osl_tracking_type || "NONE"),
    osltaxid: toInputValue(detail.osl_tax_id),
    osltaxperc: toConfiguredNumberInputValue("osltaxperc", detail.osl_tax_perc),
    oslcesstype: normalizeOpeningStockCessType(detail.osl_cess_type),
    oslcessperc: toConfiguredNumberInputValue("oslcessperc", detail.osl_cess_perc),
    oslcessperunit: toConfiguredNumberInputValue("oslcessperunit", detail.osl_cess_per_unit),
  });
}

export function mapOpeningStockDocumentToRows(
  document: OpeningStockDocumentPayload,
  defaultRowValues: Record<string, string>,
): OpeningStockRow[] {
  if (document.details.length === 0) {
    return [createRow(1, defaultRowValues)];
  }
  return document.details.map((detail, index) =>
    mapOpeningStockDetailToRow(detail, index + 1, defaultRowValues),
  );
}

// ─── Lookup option helpers ────────────────────────────────────────────────────

export function mergeLookupOptions(
  currentOptions: ERPDynamicSelectOption[],
  nextOptions: ERPDynamicSelectOption[],
): ERPDynamicSelectOption[] {
  const emptyOption =
    currentOptions.find((o) => o.value === "") ?? nextOptions.find((o) => o.value === "");
  const merged = new Map<string, string>();
  for (const option of [...currentOptions, ...nextOptions]) {
    if (!option.value) continue;
    if (!merged.has(option.value)) merged.set(option.value, option.label);
  }
  const normalizedOptions = Array.from(merged, ([value, label]) => ({ value, label })).sort(
    (a, b) => a.label.localeCompare(b.label),
  );
  return emptyOption ? [emptyOption, ...normalizedOptions] : normalizedOptions;
}

export function filterLookupOptions(
  options: ERPDynamicSelectOption[],
  searchQuery: string,
): ERPDynamicSelectOption[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  return options.filter((option) => {
    if (!option.value.trim()) return false;
    if (!normalizedQuery) return true;
    return (
      option.label.toLowerCase().includes(normalizedQuery) ||
      option.value.toLowerCase().includes(normalizedQuery)
    );
  });
}

// ─── Column resolution ────────────────────────────────────────────────────────

function createUnknownColumnSchema(header: string): ColumnSchema {
  return { header, defaultWidth: "120px", align: "left", kind: "text", placeholder: header };
}

function toColumnWidth(value: number | null | undefined, fallback: string): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return `${value}px`;
}

export function createFallbackColumns(): ColumnDefinition[] {
  return FALLBACK_COLUMN_KEYS.map((key) => {
    const schema = COLUMN_SCHEMA[key];
    return { key, ...schema, width: schema.defaultWidth };
  }).filter((col) => !HIDDEN_INTERNAL_COLUMN_KEYS.has(col.key));
}

export function resolveConfiguredColumns(configuredColumns: UiTableColumnPayload[]): ColumnDefinition[] {
  if (configuredColumns.length === 0) return createFallbackColumns();
  const visibleColumns = [...configuredColumns]
    .filter((col) => col.uiTblClmColumnVisibility !== false)
    .sort((a, b) => {
      const ap = a.uiTblClmColumnPosition ?? Number.MAX_SAFE_INTEGER;
      const bp = b.uiTblClmColumnPosition ?? Number.MAX_SAFE_INTEGER;
      if (ap !== bp) return ap - bp;
      const an = Number(a.uiTblClmNo ?? "");
      const bn = Number(b.uiTblClmNo ?? "");
      if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
      return 0;
    });
  const seenKeys = new Set<string>();
  const resolvedColumns: ColumnDefinition[] = [];
  for (const col of visibleColumns) {
    const header = col.uiTblClmName?.trim() ?? "";
    if (!header) continue;
    const key = normalizeColumnName(header);
    if (!key || seenKeys.has(key) || HIDDEN_INTERNAL_COLUMN_KEYS.has(key)) continue;
    const schema = COLUMN_SCHEMA[key] ?? createUnknownColumnSchema(header);
    resolvedColumns.push({
      key,
      header,
      width: toColumnWidth(col.uiTblClmColumnWidth, schema.defaultWidth),
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

export function getTableMinWidth(columns: ColumnDefinition[]): string {
  const width = columns.reduce(
    (total, col) => total + parseDecimal(col.width),
    parseDecimal(SERIAL_NUMBER_COLUMN_WIDTH),
  );
  return `${Math.max(width, 1080)}px`;
}

// ─── Table keyboard navigation ────────────────────────────────────────────────

export function getTableFocusableFieldTargets(root: HTMLElement): TableFocusableFieldTarget[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABLE_FIELD_CONTAINER_SELECTOR))
    .map((container) => {
      const control = container.querySelector<HTMLElement>(TABLE_FIELD_CONTROL_SELECTOR);
      if (!control || control.hasAttribute("disabled")) return null;
      const rowIndex = Number(container.dataset.openingStockRowIndex ?? "");
      const columnIndex = Number(container.dataset.openingStockColumnIndex ?? "");
      if (!Number.isFinite(rowIndex) || !Number.isFinite(columnIndex)) return null;
      return { fieldKey: `${rowIndex}:${columnIndex}`, rowIndex, columnIndex, container, control };
    })
    .filter((t): t is TableFocusableFieldTarget => t !== null);
}

export function findNextTableFieldTarget(
  targets: TableFocusableFieldTarget[],
  currentTarget: TableFocusableFieldTarget,
  direction: TableFieldNavigationDirection,
): TableFocusableFieldTarget | null {
  const targetMap = new Map(targets.map((t) => [t.fieldKey, t]));
  const maxRowIndex = Math.max(...targets.map((t) => t.rowIndex));
  const maxColumnIndex = Math.max(...targets.map((t) => t.columnIndex));
  if (direction === "left" || direction === "right") {
    const delta = direction === "left" ? -1 : 1;
    for (
      let nextCol = currentTarget.columnIndex + delta;
      nextCol >= 0 && nextCol <= maxColumnIndex;
      nextCol += delta
    ) {
      const candidate = targetMap.get(`${currentTarget.rowIndex}:${nextCol}`);
      if (candidate) return candidate;
    }
    return null;
  }
  const delta = direction === "up" ? -1 : 1;
  for (
    let nextRow = currentTarget.rowIndex + delta;
    nextRow >= 0 && nextRow <= maxRowIndex;
    nextRow += delta
  ) {
    const candidate = targetMap.get(`${nextRow}:${currentTarget.columnIndex}`);
    if (candidate) return candidate;
  }
  return null;
}

export function focusTableFieldControl(control: HTMLElement) {
  control.focus();
  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
    try {
      control.setSelectionRange(control.value.length, control.value.length);
    } catch {
      // Some input types do not support text selection.
    }
  }
  control.scrollIntoView({ block: "nearest", inline: "nearest" });
}

// ─── Column alignment CSS helper ──────────────────────────────────────────────

export function getAlignClass(align: ColumnAlign): string {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}