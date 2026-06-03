import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import type { ERPDynamicSelectOption } from "@/components/design-system/ui";
import type {
  PhysicalStockRow,
  PhysicalStockColumn,
  PhysicalStockSaveDetail,
  PhysicalStockSaveBatchDetail,
  PhysicalStockDocumentResponse,
  UiTableColumnPayload,
  SavePhysicalStockUiTableColumnRequest,
  RowValidationIssue,
  ItemStockBalancePayload,
  ItemBatchStockLookupPayload,
  PhysicalStockHeaderPayload,
  PhysicalStockListFilters,
  PhysicalStockListMeta,
} from "./physical-stock.types";
import type { PhysicalStockListRow } from "./PhysicalStockListModal";
import type { ItemPriceDetailsPayload } from "@/store/api/lookupsApi";
import type { ColumnAlign } from "@/features/stocks/_shared/types";
import {
  PHYSICAL_STOCK_COLUMNS,
  PHYSICAL_STOCK_COLUMN_SCHEMA,
  UI_TABLE_COLUMNS_QUERY,
  NON_NEGATIVE_NUMBER_FIELD_KEYS,
  QUANTITY_FIELD_KEYS,
  DATE_FIELD_KEYS,
  HIDDEN_ROW_VALUE_DEFAULTS,
  TRACKING_OPTIONS,
  UUID_PATTERN,
  DEFAULT_BATCH_OPTION,
} from "./physical-stock.constants";
import {
  parseDecimal,
  formatQuantityValue,
  formatDateForDisplay,
  toCanonicalDateValue,
  getTodayInputValue,
  toInputValue,
  toNullableTrimmedString,
  toIsoDateTime,
  normalizeColumnName,
  moveOpeningStockFieldFocus,
  resolveTrackingType,
} from "@/features/stocks/opening-stock/opening-stock.utils";
import styles from "@/features/stocks/_shared/stock-page.module.scss";
import {
  VALUE_FORMATTER,
  MIN_RESIZABLE_COLUMN_WIDTH,
  SERIAL_NUMBER_COLUMN_WIDTH,
  DELETE_ACTION_COLUMN_WIDTH,
} from "@/features/stocks/_shared/constants";

export function createDefaultRowValues(): Record<string, string> {
  return {
    ...PHYSICAL_STOCK_COLUMNS.reduce<Record<string, string>>((accumulator, column) => {
      accumulator[column.key] = column.defaultValue ?? "";
      return accumulator;
    }, {}),
    ...HIDDEN_ROW_VALUE_DEFAULTS,
  };
}
export const DEFAULT_ROW_VALUES = createDefaultRowValues();
export function createRow(id: number, overrides: Record<string, string> = {}): PhysicalStockRow {
  return {
    id,
    values: {
      ...DEFAULT_ROW_VALUES,
      ...overrides,
    },
  };
}
export function createEmptyRow(nextId: number): PhysicalStockRow {
  return createRow(nextId);
}
export function getNextRowId(rows: PhysicalStockRow[]): number {
  return rows.reduce((highestId, row) => Math.max(highestId, row.id), 0) + 1;
}
export function isPristineRow(row: PhysicalStockRow): boolean {
  return Object.entries(DEFAULT_ROW_VALUES).every(
    ([key, defaultValue]) => (row.values[key] ?? "") === defaultValue,
  );
}
export function getDraftRows(rows: PhysicalStockRow[]): PhysicalStockRow[] {
  return rows.filter((row) => !isPristineRow(row));
}
export function formatAmountInput(value: number): string {
  return VALUE_FORMATTER.format(value).replace(/,/g, "");
}
export function getActualConvFactor(values: Record<string, string>): number {
  return parseDecimal(values.convfactor) || 1;
}
export function withDerivedPhysicalValues(values: Record<string, string>): Record<string, string> {
  const convFactor = getActualConvFactor(values);
  const bookQty = parseDecimal(values.bookqty);
  const bookFreeQty = parseDecimal(values.bookfreeqty);
  const physicalQty = parseDecimal(values.physicalqty);
  const physicalFreeQty = parseDecimal(values.physicalfreeqty);
  const costPrice = parseDecimal(values.costprice);
  return {
    ...values,
    bookbaseqty: formatQuantityValue(bookQty * convFactor),
    bookfreebaseqty: formatQuantityValue(bookFreeQty * convFactor),
    physicalbaseqty: formatQuantityValue(physicalQty * convFactor),
    physicalfreebaseqty: formatQuantityValue(physicalFreeQty * convFactor),
    diffqty: formatQuantityValue(physicalQty - bookQty),
    total: formatAmountInput(physicalQty * costPrice),
  };
}
export function parseOptionalStockNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    return null;
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
export function buildStockBalanceQuantityValues(
  currentValues: Record<string, string>,
  balance: ItemStockBalancePayload,
): Record<string, string> {
  const bookQty = parseOptionalStockNumber(balance.book_qty ?? balance.isb_closing_qty);
  const bookBaseQty = parseOptionalStockNumber(balance.book_base_qty);
  const bookFreeQty = parseOptionalStockNumber(
    balance.book_free_qty ?? balance.isb_free_closing_qty,
  );
  const bookFreeBaseQty = parseOptionalStockNumber(balance.book_free_base_qty);
  const quantityValues: Record<string, string> = {};
  if (bookQty !== null) {
    quantityValues.bookqty = toInputValue(bookQty);
  }
  if (bookFreeQty !== null) {
    quantityValues.bookfreeqty = toInputValue(bookFreeQty);
  }
  const nextValues = withDerivedPhysicalValues({
    ...currentValues,
    ...quantityValues,
  });
  if (bookBaseQty !== null) {
    nextValues.bookbaseqty = formatQuantityValue(bookBaseQty);
  }
  if (bookFreeBaseQty !== null) {
    nextValues.bookfreebaseqty = formatQuantityValue(bookFreeBaseQty);
  }
  return nextValues;
}
export function isBatchLookupTrackingType(value: string | null | undefined): boolean {
  const normalized = (value ?? "").trim().toUpperCase();
  return normalized === "1" || normalized === "2" || normalized === "MRP" || normalized === "BATCH";
}
export function getBatchLookupOptionLabel(batch: ItemBatchStockLookupPayload): string {
  return batch.ibs_batch_no?.trim() || batch.ibs_batch_id;
}
export function buildBatchLookupOptions(
  batches: ItemBatchStockLookupPayload[],
): ERPDynamicSelectOption[] {
  const seenValues = new Set<string>();
  const options: ERPDynamicSelectOption[] = [DEFAULT_BATCH_OPTION];
  for (const batch of batches) {
    const value = batch.ibs_batch_id?.trim() ?? "";
    if (!value || seenValues.has(value)) {
      continue;
    }
    seenValues.add(value);
    options.push({
      value,
      label: getBatchLookupOptionLabel(batch),
    });
  }
  return options;
}
export function hasBatchLookupScope(values: Record<string, string>): boolean {
  return Boolean(
    values.oslitemid?.trim() && values.oslunitid?.trim() && values.oslgodownid?.trim(),
  );
}
export function ensureTrailingEmptyRow(rows: PhysicalStockRow[], sourceRowId: number): PhysicalStockRow[] {
  const sourceRowIndex = rows.findIndex((row) => row.id === sourceRowId);
  if (sourceRowIndex === -1 || sourceRowIndex !== rows.length - 1) {
    return rows;
  }
  if (isPristineRow(rows[sourceRowIndex])) {
    return rows;
  }
  return [...rows, createEmptyRow(getNextRowId(rows))];
}
export function buildInvalidFieldState(issues: RowValidationIssue[]): Record<string, true> {
  return issues.reduce<Record<string, true>>((accumulator, issue) => {
    accumulator[`${issue.rowId}:${issue.fieldKey}`] = true;
    return accumulator;
  }, {});
}
export function getAlignClass(align: ColumnAlign): string {
  if (align === "right") {
    return styles.alignRight;
  }
  if (align === "center") {
    return styles.alignCenter;
  }
  return styles.alignLeft;
}
export function handleFieldNavigationKeyDown(event: ReactKeyboardEvent<HTMLElement>): boolean {
  if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }
  event.preventDefault();
  moveOpeningStockFieldFocus(event.currentTarget, "right");
  return true;
}
export function getTrackingOptionFromItem(detail: ItemPriceDetailsPayload): string {
  const trackingType = resolveTrackingType(detail.item);
  return TRACKING_OPTIONS.includes(trackingType as (typeof TRACKING_OPTIONS)[number])
    ? trackingType
    : "0";
}
export function getTrackingPayloadValue(value: string): "NONE" | "MRP" | "BATCH" | "SERIAL" {
  if (value === "1") {
    return "MRP";
  }
  if (value === "2") {
    return "BATCH";
  }
  if (value === "3") {
    return "SERIAL";
  }
  return "NONE";
}
export function getColumnMinWidth(columns: PhysicalStockColumn[]): string {
  const width = columns.reduce(
    (total, column) => total + parseDecimal(column.width),
    parseDecimal(SERIAL_NUMBER_COLUMN_WIDTH) + parseDecimal(DELETE_ACTION_COLUMN_WIDTH),
  );
  return `${Math.max(width, 2800)}px`;
}
export function parseColumnWidth(width: string, fallback = 120): number {
  const parsed = Number.parseFloat(width);
  return Number.isFinite(parsed) ? parsed : fallback;
}
export function toColumnWidth(value: number | null | undefined, fallback: string): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return `${value}px`;
}
export function reorderColumns(
  current: PhysicalStockColumn[],
  sourceKey: string,
  targetKey: string,
): PhysicalStockColumn[] {
  if (!sourceKey || !targetKey || sourceKey === targetKey) {
    return current;
  }
  const next = [...current];
  const sourceIndex = next.findIndex((column) => column.key === sourceKey);
  const targetIndex = next.findIndex((column) => column.key === targetKey);
  if (sourceIndex === -1 || targetIndex === -1) {
    return current;
  }
  const [movedColumn] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, movedColumn);
  return next;
}
export function findPhysicalStockUiTableColumnConfig(
  configuredColumns: UiTableColumnPayload[],
  columnKey: string,
): UiTableColumnPayload | null {
  return (
    configuredColumns.find(
      (column) => normalizeColumnName(column.uiTblClmName ?? "") === columnKey,
    ) ?? null
  );
}
export function buildPhysicalStockUiTableColumnRequest(
  column: PhysicalStockColumn,
  configuredColumn: UiTableColumnPayload | null,
  columnIndex: number,
  overrides: Partial<Pick<SavePhysicalStockUiTableColumnRequest, "uiTblClmColumnPosition" | "uiTblClmColumnWidth">> = {},
): SavePhysicalStockUiTableColumnRequest {
  const fallbackPosition = columnIndex + 1;
  return {
    ...(configuredColumn?.uiTblClmId ? { uiTblClmId: configuredColumn.uiTblClmId } : {}),
    uiTblClmNo: configuredColumn?.uiTblClmNo || String(fallbackPosition),
    uiTblClmName: configuredColumn?.uiTblClmName?.trim() || column.header || column.key,
    uiTblClmTableId: configuredColumn?.uiTblClmTableId ?? UI_TABLE_COLUMNS_QUERY.uiTblClmTableId,
    uiTblClmColumnWidth:
      overrides.uiTblClmColumnWidth ??
      configuredColumn?.uiTblClmColumnWidth ??
      parseColumnWidth(column.width),
    uiTblClmColumnVisibility: configuredColumn?.uiTblClmColumnVisibility ?? true,
    uiTblClmColumnFocus: configuredColumn?.uiTblClmColumnFocus ?? false,
    uiTblClmColumnPosition:
      overrides.uiTblClmColumnPosition ??
      configuredColumn?.uiTblClmColumnPosition ??
      fallbackPosition,
    uiTblClmColumnNecessity: configuredColumn?.uiTblClmColumnNecessity ?? false,
    uiTblClmNextColumn: configuredColumn?.uiTblClmNextColumn ?? null,
    uiTblClmPreviousColumn: configuredColumn?.uiTblClmPreviousColumn ?? null,
    uiTblClmIsActive: configuredColumn?.uiTblClmIsActive ?? true,
  };
}
export function upsertPhysicalStockUiTableColumnConfig(
  configuredColumns: UiTableColumnPayload[],
  savedColumn: UiTableColumnPayload,
  fallbackColumnKey: string,
): UiTableColumnPayload[] {
  const savedColumnKey = normalizeColumnName(savedColumn.uiTblClmName ?? "") || fallbackColumnKey;
  let didUpdate = false;
  const nextColumns = configuredColumns.map((column) => {
    const sameColumnId =
      Boolean(savedColumn.uiTblClmId) && column.uiTblClmId === savedColumn.uiTblClmId;
    const sameColumnKey = normalizeColumnName(column.uiTblClmName ?? "") === savedColumnKey;
    if (!sameColumnId && !sameColumnKey) {
      return column;
    }
    didUpdate = true;
    return savedColumn;
  });
  return didUpdate ? nextColumns : [...nextColumns, savedColumn];
}
export function resolveConfiguredColumns(configuredColumns: UiTableColumnPayload[]): PhysicalStockColumn[] {
  if (configuredColumns.length === 0) {
    return [];
  }
  const visibleColumns = [...configuredColumns]
    .filter((column) => {
      const key = normalizeColumnName(column.uiTblClmName ?? "");
      return key === "barcode" || key === "uom" || column.uiTblClmColumnVisibility !== false;
    })
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
  const resolvedColumns: PhysicalStockColumn[] = [];
  for (const configuredColumn of visibleColumns) {
    const header = configuredColumn.uiTblClmName?.trim() ?? "";
    if (!header) {
      continue;
    }
    const key = normalizeColumnName(header);
    const schema = PHYSICAL_STOCK_COLUMN_SCHEMA.get(key);
    if (!schema || seenKeys.has(key)) {
      continue;
    }
    resolvedColumns.push({
      ...schema,
      header,
      width: toColumnWidth(configuredColumn.uiTblClmColumnWidth, schema.width),
    });
    seenKeys.add(key);
  }
  if (!seenKeys.has("barcode")) {
    const barcodeSchema = PHYSICAL_STOCK_COLUMN_SCHEMA.get("barcode");
    const barcodeConfig = configuredColumns.find(
      (column) => normalizeColumnName(column.uiTblClmName ?? "") === "barcode",
    );
    if (barcodeSchema) {
      resolvedColumns.unshift({
        ...barcodeSchema,
        header: barcodeConfig?.uiTblClmName?.trim() || barcodeSchema.header,
        width: toColumnWidth(barcodeConfig?.uiTblClmColumnWidth, barcodeSchema.width),
      });
    }
  }
  if (!seenKeys.has("uom")) {
    const uomSchema = PHYSICAL_STOCK_COLUMN_SCHEMA.get("uom");
    const uomConfig = configuredColumns.find(
      (column) => normalizeColumnName(column.uiTblClmName ?? "") === "uom",
    );
    if (uomSchema) {
      const godownIndex = resolvedColumns.findIndex((column) => column.key === "godown");
      const itemNameIndex = resolvedColumns.findIndex((column) => column.key === "itemname");
      const insertIndex =
        godownIndex >= 0
          ? godownIndex + 1
          : itemNameIndex >= 0
            ? itemNameIndex + 1
            : resolvedColumns.length;
      resolvedColumns.splice(insertIndex, 0, {
        ...uomSchema,
        header: uomConfig?.uiTblClmName?.trim() || uomSchema.header,
        width: toColumnWidth(uomConfig?.uiTblClmColumnWidth, uomSchema.width),
      });
    }
  }
  return resolvedColumns;
}
export function buildDocumentNumber(voucherRefNo: string): number {
  const numericRef = Number.parseInt(voucherRefNo.replace(/\D/g, ""), 10);
  if (Number.isInteger(numericRef) && numericRef > 0) {
    return numericRef;
  }
  return Date.now();
}
export function toOptionalUuid(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return UUID_PATTERN.test(normalized) ? normalized : null;
}
export function getReasonRemarks(row: PhysicalStockRow): string | null {
  const reason = toNullableTrimmedString(row.values.reason);
  const remarks = toNullableTrimmedString(row.values.remarks);
  if (reason && remarks) {
    return `${reason} - ${remarks}`;
  }
  return reason ?? remarks;
}
export function getRowValidationIssues(row: PhysicalStockRow, rowNumber: number): RowValidationIssue[] {
  const issues: RowValidationIssue[] = [];
  if (!toNullableTrimmedString(row.values.oslitemid)) {
    issues.push({
      rowId: row.id,
      fieldKey: "itemname",
      message: `Row ${rowNumber} is missing an item name.`,
    });
  }
  if (!toNullableTrimmedString(row.values.oslgodownid)) {
    issues.push({
      rowId: row.id,
      fieldKey: "godown",
      message: `Row ${rowNumber} is missing a godown.`,
    });
  }
  if (!toNullableTrimmedString(row.values.oslunitid)) {
    issues.push({
      rowId: row.id,
      fieldKey: "uom",
      message: `Row ${rowNumber} is missing a unit.`,
    });
  }
  if (parseDecimal(row.values.convfactor) <= 0) {
    issues.push({
      rowId: row.id,
      fieldKey: "convfactor",
      message: `Row ${rowNumber} conversion factor must be greater than zero.`,
    });
  }
  for (const fieldKey of NON_NEGATIVE_NUMBER_FIELD_KEYS) {
    const value = row.values[fieldKey]?.trim() ?? "";
    if (!value) {
      continue;
    }
    const parsedValue = Number(value);
    if (Number.isFinite(parsedValue) && parsedValue >= 0) {
      continue;
    }
    const column = PHYSICAL_STOCK_COLUMNS.find((entry) => entry.key === fieldKey);
    issues.push({
      rowId: row.id,
      fieldKey,
      message: `Row ${rowNumber} has an invalid ${column?.header ?? fieldKey}.`,
    });
  }
  const normalizedDates = Object.fromEntries(
    DATE_FIELD_KEYS.map((fieldKey) => [fieldKey, toCanonicalDateValue(row.values[fieldKey])]),
  ) as Record<(typeof DATE_FIELD_KEYS)[number], string>;
  for (const fieldKey of DATE_FIELD_KEYS) {
    const value = row.values[fieldKey]?.trim() ?? "";
    if (!value || normalizedDates[fieldKey]) {
      continue;
    }
    const column = PHYSICAL_STOCK_COLUMNS.find((entry) => entry.key === fieldKey);
    issues.push({
      rowId: row.id,
      fieldKey,
      message: `Row ${rowNumber} has an invalid ${column?.header ?? fieldKey}. Use dd/mm/yyyy.`,
    });
  }
  if (
    normalizedDates.mfgdate &&
    normalizedDates.expirydate &&
    normalizedDates.expirydate < normalizedDates.mfgdate
  ) {
    issues.push({
      rowId: row.id,
      fieldKey: "expirydate",
      message: `Row ${rowNumber} expiry date must be on or after mfg date.`,
    });
  }
  return issues;
}
export function renderValidationToastContent(issues: RowValidationIssue[]): ReactNode {
  const visibleIssues = issues.slice(0, 5);
  const remainingCount = issues.length - visibleIssues.length;
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: "0.35rem" }}>
        Fix validation errors before saving physical stock.
      </div>
      {visibleIssues.map((issue) => (
        <div key={`${issue.rowId}-${issue.fieldKey}`}>{issue.message}</div>
      ))}
      {remainingCount > 0 ? <div>{`+${remainingCount} more issue(s).`}</div> : null}
    </div>
  );
}
export function buildPhysicalStockDetailPayload(
  row: PhysicalStockRow,
  rowIndex: number,
  scope: {
    accountingYear: string;
    companyId: string;
    branchId: string;
  },
): PhysicalStockSaveDetail {
  const convFactor = getActualConvFactor(row.values);
  const itemId = row.values.oslitemid.trim();
  const unitId = row.values.oslunitid.trim();
  const baseUnitId = row.values.baseunitid.trim() || unitId;
  const godownId = row.values.oslgodownid.trim();
  const notes = getReasonRemarks(row);
  const trackingType = getTrackingPayloadValue(row.values.osltrackingtype);
  const hasBatchDetail = Boolean(
    toNullableTrimmedString(row.values.batchid) ||
    toNullableTrimmedString(row.values.batchno) ||
      toNullableTrimmedString(row.values.mfgbatchno) ||
      toNullableTrimmedString(row.values.serialno) ||
      toNullableTrimmedString(row.values.batchdate) ||
      toNullableTrimmedString(row.values.mfgdate) ||
      toNullableTrimmedString(row.values.expirydate),
  );
  const baseDetail = {
    psdRowNo: rowIndex + 1,
    psdAccYear: scope.accountingYear,
    psdCompanyId: scope.companyId,
    psdBranchId: scope.branchId,
    psdGodownId: godownId,
    psdItemId: itemId,
    psdUnitId: unitId,
    psdBaseUnitId: baseUnitId,
    psdToBaseFactor: convFactor,
    psdBarcode: toNullableTrimmedString(row.values.barcode),
    psdMrp: parseDecimal(row.values.mrp),
    psdTrackingType: trackingType,
    psdBookQty: parseDecimal(row.values.bookqty),
    psdBookBaseQty: parseDecimal(row.values.bookbaseqty),
    psdPhysicalQty: parseDecimal(row.values.physicalqty),
    psdPhysicalBaseQty: parseDecimal(row.values.physicalbaseqty),
    psdDiffQty: parseDecimal(row.values.diffqty),
    psdDiffBaseQty: parseDecimal(row.values.physicalbaseqty) - parseDecimal(row.values.bookbaseqty),
    psdStockRateWot: parseDecimal(row.values.costwot),
    psdStockRateWithTax: parseDecimal(row.values.costprice),
    psdReasonId: toOptionalUuid(row.values.oslreasonid),
    psdResolution: "ADJUST_LOSS_GAIN" as const,
    psdNotes: notes,
  };
  if (!hasBatchDetail) {
    return baseDetail;
  }
  return {
    ...baseDetail,
    batchDetails: [
      {
        psbRowNo: 1,
        psbAccYear: scope.accountingYear,
        psbCompanyId: scope.companyId,
        psbBranchId: scope.branchId,
        psbGodownId: godownId,
        psbItemId: itemId,
        psbUnitId: unitId,
        psbBaseUnitId: baseUnitId,
        psbToBaseFactor: convFactor,
        psbBatchId: toOptionalUuid(row.values.batchid),
        psbBatchNo: toNullableTrimmedString(row.values.batchno),
        psbMfgBatchNo: toNullableTrimmedString(row.values.mfgbatchno),
        psbBatchDate: toIsoDateTime(row.values.batchdate),
        psbMfgDate: toIsoDateTime(row.values.mfgdate),
        psbExpiryDate: toIsoDateTime(row.values.expirydate),
        psbMrp: parseDecimal(row.values.mrp),
        psbBarcode: toNullableTrimmedString(row.values.barcode),
        psbSerialNo: toNullableTrimmedString(row.values.serialno),
        psbBookQty: parseDecimal(row.values.bookqty),
        psbBookBaseQty: parseDecimal(row.values.bookbaseqty),
        psbPhysicalQty: parseDecimal(row.values.physicalqty),
        psbPhysicalBaseQty: parseDecimal(row.values.physicalbaseqty),
        psbDiffQty: parseDecimal(row.values.diffqty),
        psbDiffBaseQty:
          parseDecimal(row.values.physicalbaseqty) - parseDecimal(row.values.bookbaseqty),
        psbStockRateWot: parseDecimal(row.values.costwot),
        psbStockRateWithTax: parseDecimal(row.values.costprice),
        psbReasonId: toOptionalUuid(row.values.oslreasonid),
        psbResolution: "ADJUST_LOSS_GAIN",
        psbNotes: notes,
      },
    ],
  };
}
export function createPhysicalStockListFiltersForToday(): PhysicalStockListFilters {
  const today = toCanonicalDateValue(getTodayInputValue());
  return {
    search: "",
    dateFrom: today,
    dateTo: today,
  };
}
export function getPhysicalStockLabel(row: PhysicalStockHeaderPayload | PhysicalStockListRow): string {
  return row.psc_refno?.trim() || row.psc_doc_no?.trim() || row.psc_id;
}
export function getPhysicalStockListErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load physical stock list.";
}
export function getTrackingOptionFromPayload(value: string | null | undefined): string {
  const normalized = value?.trim().toUpperCase() ?? "";
  if (normalized === "MRP" || normalized === "1") {
    return "1";
  }
  if (normalized === "BATCH" || normalized === "2") {
    return "2";
  }
  if (normalized === "SERIAL" || normalized === "3") {
    return "3";
  }
  return "0";
}
export function mapPhysicalStockDocumentToRows(document: PhysicalStockDocumentResponse): PhysicalStockRow[] {
  const rows: PhysicalStockRow[] = [];
  for (const detail of document.details) {
    const batches = detail.batch_details.length > 0 ? detail.batch_details : [null];
    for (const batch of batches) {
      const notes = batch?.psb_notes ?? detail.psd_notes ?? "";
      const rowValues = withDerivedPhysicalValues({
        ...DEFAULT_ROW_VALUES,
        barcode: toInputValue(batch?.psb_barcode ?? detail.psd_barcode),
        code: toInputValue(detail.psd_item_code),
        itemname: toInputValue(detail.psd_item_name),
        godown: toInputValue(detail.psd_godown_name),
        uom: toInputValue(detail.psd_unit_name),
        batchno: toInputValue(batch?.psb_batch_no),
        serialno: toInputValue(batch?.psb_serial_no),
        batchdate: formatDateForDisplay(batch?.psb_batch_date),
        mfgdate: formatDateForDisplay(batch?.psb_mfg_date),
        expirydate: formatDateForDisplay(batch?.psb_expiry_date),
        bookqty: toInputValue(batch?.psb_book_qty ?? detail.psd_book_qty),
        bookbaseqty: toInputValue(batch?.psb_book_base_qty ?? detail.psd_book_base_qty),
        physicalqty: toInputValue(batch?.psb_physical_qty ?? detail.psd_physical_qty),
        physicalbaseqty: toInputValue(
          batch?.psb_physical_base_qty ?? detail.psd_physical_base_qty,
        ),
        diffqty: toInputValue(batch?.psb_diff_qty ?? detail.psd_diff_qty),
        convfactor: toInputValue(batch?.psb_to_base_factor ?? detail.psd_to_base_factor ?? 1),
        costprice: toInputValue(
          batch?.psb_stock_rate_with_tax ?? detail.psd_stock_rate_with_tax,
        ),
        costwot: toInputValue(batch?.psb_stock_rate_wot ?? detail.psd_stock_rate_wot),
        mrp: toInputValue(batch?.psb_mrp ?? detail.psd_mrp),
        remarks: toInputValue(notes),
        oslitemid: toInputValue(detail.psd_item_id),
        oslunitid: toInputValue(detail.psd_unit_id),
        oslbaseuomid: toInputValue(detail.psd_base_unit_id),
        oslgodownid: toInputValue(detail.psd_godown_id),
        osltrackingtype: getTrackingOptionFromPayload(detail.psd_tracking_type),
        baseunitid: toInputValue(detail.psd_base_unit_id || detail.psd_unit_id),
        batchid: toInputValue(batch?.psb_batch_id),
        mfgbatchno: toInputValue(batch?.psb_mfg_batch_no),
      });
      rows.push(createRow(rows.length + 1, rowValues));
    }
  }
  return rows.length > 0 ? [...rows, createEmptyRow(rows.length + 1)] : [createEmptyRow(1)];
}
