"use client";

import {
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FiCalendar, FiRotateCcw, FiSave, FiTrash2 } from "react-icons/fi";
import { toast } from "react-toastify";
import type { ERPDynamicSelectOption } from "@/components/library/ui";
import {
  KeyboardShortcutHints,
  type KeyboardShortcutDefinition,
} from "@/components/library/ui/keyboard-shortcut-hints";
import { useBusinessContext } from "@/components/layout/business-context";
import { extractRows } from "@/features/masters/shared/normalizers";
import { useApi } from "@/hooks/useApi";
import {
  getAuthSessionId,
  getAuthUserId,
  getOrCreateClientDeviceId,
} from "@/lib/auth/session";
import {
  type ItemPriceDetailsPayload,
  useLazyGetItemOptionsQuery,
  useLazyGetItemPriceDetailsQuery,
  useLazyGetUnitOptionsQuery,
} from "@/store/api/lookupsApi";
import {
  DEFAULT_GODOWN_OPTION,
  DEFAULT_ITEM_OPTION,
  DELETE_ACTION_COLUMN_WIDTH,
  GODOWN_LIST_ENDPOINT,
  GODOWN_LOOKUP_QUERY,
  MIN_RESIZABLE_COLUMN_WIDTH,
  QUANTITY_FORMATTER,
  SERIAL_NUMBER_COLUMN_WIDTH,
  VALUE_FORMATTER,
} from "@/features/stocks/_shared/constants";
import { LookupCell } from "@/features/stocks/_shared/LookupCell";
import type {
  ColumnAlign,
  ColumnKind,
  LookupCellState,
  LookupKind,
} from "@/features/stocks/_shared/types";
import {
  buildGodownLookupOptions,
  buildUomOptions,
  cx,
  filterLookupOptions,
  formatAccountingYear,
  formatDateEntry,
  formatDateForDisplay,
  formatQuantityValue,
  focusOpeningStockField,
  getTodayInputValue,
  moveOpeningStockFieldFocus,
  normalizeColumnName,
  openDatePicker,
  parseDecimal,
  resolveDefaultItemPriceRecord,
  resolveItemPriceRecordByUnitId,
  resolveTrackingType,
  toCanonicalDateValue,
  toInputValue,
  toIsoDateTime,
  toNullableTrimmedString,
} from "@/features/stocks/opening-stock/Utils";
import styles from "@/features/stocks/_shared/stock-page.module.scss";

type PhysicalStockColumn = {
  key: string;
  header: string;
  width: string;
  align: ColumnAlign;
  kind: ColumnKind;
  lookupKind?: LookupKind;
  options?: readonly string[];
  defaultValue?: string;
  readOnly?: boolean;
};

type PhysicalStockRow = {
  id: number;
  values: Record<string, string>;
};

type PhysicalStockSaveDetail = {
  psdRowNo: number;
  psdAccYear: string;
  psdCompanyId: string;
  psdBranchId: string;
  psdGodownId: string;
  psdItemId: string;
  psdUnitId: string;
  psdBaseUnitId: string;
  psdToBaseFactor: number;
  psdBarcode?: string | null;
  psdMrp?: number;
  psdTrackingType?: "NONE" | "MRP" | "BATCH" | "SERIAL";
  psdBookQty?: number;
  psdBookBaseQty?: number;
  psdPhysicalQty?: number;
  psdPhysicalBaseQty?: number;
  psdDiffQty?: number;
  psdDiffBaseQty?: number;
  psdStockRateWot?: number;
  psdStockRateWithTax?: number;
  psdReasonId?: string | null;
  psdResolution?: "ADJUST_LOSS_GAIN";
  psdNotes?: string | null;
  batchDetails?: PhysicalStockSaveBatchDetail[];
};

type PhysicalStockSaveBatchDetail = {
  psbRowNo: number;
  psbAccYear: string;
  psbCompanyId: string;
  psbBranchId: string;
  psbGodownId: string;
  psbItemId: string;
  psbUnitId: string;
  psbBaseUnitId: string;
  psbToBaseFactor: number;
  psbBatchNo?: string | null;
  psbBatchDate?: string | null;
  psbMfgDate?: string | null;
  psbExpiryDate?: string | null;
  psbMrp?: number;
  psbBarcode?: string | null;
  psbSerialNo?: string | null;
  psbBookQty?: number;
  psbBookBaseQty?: number;
  psbPhysicalQty?: number;
  psbPhysicalBaseQty?: number;
  psbDiffQty?: number;
  psbDiffBaseQty?: number;
  psbStockRateWot?: number;
  psbStockRateWithTax?: number;
  psbReasonId?: string | null;
  psbResolution?: "ADJUST_LOSS_GAIN";
  psbNotes?: string | null;
};

type PhysicalStockSaveRequest = {
  psAccYear: string;
  psCompanyId: string;
  psBranchId: string;
  psGodownId: string;
  psDocNo: number;
  psDocRefNo: string | null;
  psDocDate: string;
  psCountType: "FULL";
  psStockCutoffAt: string;
  psFreezeStock: boolean;
  psPostingMode: "ADJUST_DIFFERENCE_ONLY";
  psRateSource: "MANUAL";
  psTotalLines: number;
  psTotalBookValue: number;
  psTotalCountedValue: number;
  psNetVarianceValue: number;
  psStatus: "DRAFT";
  psApprovalRequired: boolean;
  psDeviceType: "WEB";
  psDeviceId: string | null;
  psCounterId: string;
  psSessionId: string | null;
  psRemarks: string | null;
  psCreatedBy: string;
  details: PhysicalStockSaveDetail[];
};

type PhysicalStockSuccessResponse<T> = {
  success: true;
  message: string;
  data: T;
};

type PhysicalStockDocumentResponse = {
  header: {
    psc_id: string;
    psc_refno: string;
    psc_date: string;
  };
  details: Array<{
    psd_id: string;
    psd_psc_id: string;
    psd_row_no: number;
  }>;
};

type RowValidationIssue = {
  rowId: number;
  fieldKey: string;
  message: string;
};

const PHYSICAL_STOCK_SAVE_ENDPOINT = "/physical-stock";
const UI_TABLE_COLUMNS_LIST_ENDPOINT = "/ui-table-columns/list";
const UI_TABLE_COLUMNS_CREATE_ENDPOINT = "/ui-table-columns/create";
const UI_TABLE_COLUMNS_QUERY = {
  uiTblClmTableId: "6",
  page: "1",
  limit: "100",
} as const;
const LOOKUP_SEARCH_DEBOUNCE_MS = 250;

const PHYSICAL_STOCK_TABLE_SHORTCUTS: readonly KeyboardShortcutDefinition[] = [
  { label: "Prev Cell", keys: ["Shift"] },
  { label: "Next Cell", keys: ["Enter"] },
  { label: "Close Lookup", keys: ["Escape"] },
];

const TRACKING_OPTIONS = ["0", "1", "2", "3"] as const;
const TRACKING_TYPE_OPTION_LABELS: Record<(typeof TRACKING_OPTIONS)[number], string> = {
  "0": "NONE",
  "1": "MRP",
  "2": "BATCH",
  "3": "SERIAL",
};

const PHYSICAL_STOCK_COLUMNS: PhysicalStockColumn[] = [
  { key: "barcode", header: "Barcode", width: "110px", align: "left", kind: "text" },
  { key: "code", header: "Code", width: "100px", align: "left", kind: "text" },
  {
    key: "itemname",
    header: "Item name",
    width: "220px",
    align: "left",
    kind: "lookup",
    lookupKind: "item",
  },
  {
    key: "godown",
    header: "Godown",
    width: "160px",
    align: "left",
    kind: "lookup",
    lookupKind: "godown",
  },
  { key: "uom", header: "Uom", width: "105px", align: "left", kind: "text" },
  { key: "batchno", header: "Batch no", width: "120px", align: "left", kind: "text" },
  { key: "serialno", header: "Serial no", width: "120px", align: "left", kind: "text" },
  { key: "batchdate", header: "Batch date", width: "120px", align: "left", kind: "date" },
  { key: "mfgdate", header: "Mfg date", width: "120px", align: "left", kind: "date" },
  { key: "expirydate", header: "Expiry date", width: "120px", align: "left", kind: "date" },
  {
    key: "bookqty",
    header: "Book qty",
    width: "110px",
    align: "right",
    kind: "number",
  },
  {
    key: "bookfreeqty",
    header: "Book Free qty",
    width: "120px",
    align: "right",
    kind: "number",
  },
  {
    key: "bookbaseqty",
    header: "Book Base qty",
    width: "130px",
    align: "right",
    kind: "number",
    readOnly: true,
  },
  {
    key: "bookfreebaseqty",
    header: "Book free base qty",
    width: "150px",
    align: "right",
    kind: "number",
    readOnly: true,
  },
  {
    key: "physicalqty",
    header: "Physical qty",
    width: "120px",
    align: "right",
    kind: "number",
  },
  {
    key: "physicalfreeqty",
    header: "Physical Free qty",
    width: "140px",
    align: "right",
    kind: "number",
  },
  {
    key: "physicalbaseqty",
    header: "Physical Base qty",
    width: "150px",
    align: "right",
    kind: "number",
    readOnly: true,
  },
  {
    key: "physicalfreebaseqty",
    header: "Physical free base qty",
    width: "170px",
    align: "right",
    kind: "number",
    readOnly: true,
  },
  {
    key: "diffqty",
    header: "Diff Qty",
    width: "110px",
    align: "right",
    kind: "number",
    readOnly: true,
  },
  {
    key: "convfactor",
    header: "Conv factor",
    width: "120px",
    align: "right",
    kind: "number",
    defaultValue: "1.000",
  },
  {
    key: "costprice",
    header: "Cost price",
    width: "115px",
    align: "right",
    kind: "number",
  },
  { key: "costwot", header: "Cost wot", width: "110px", align: "right", kind: "number" },
  { key: "mrp", header: "M.R.P", width: "100px", align: "right", kind: "number" },
  { key: "reason", header: "Reason", width: "180px", align: "left", kind: "text" },
  { key: "remarks", header: "Remarks", width: "220px", align: "left", kind: "text" },
  {
    key: "oslitemid",
    header: "osl item id",
    width: "130px",
    align: "left",
    kind: "text",
    readOnly: true,
  },
  {
    key: "oslunitid",
    header: "osl unit id",
    width: "130px",
    align: "left",
    kind: "text",
    readOnly: true,
  },
  {
    key: "oslbaseuomid",
    header: "osl base uom id",
    width: "145px",
    align: "left",
    kind: "text",
    readOnly: true,
  },
  {
    key: "oslgodownid",
    header: "osl godown id",
    width: "145px",
    align: "left",
    kind: "text",
    readOnly: true,
  },
  {
    key: "osltrackingtype",
    header: "osl tracking type",
    width: "140px",
    align: "left",
    kind: "select",
    options: TRACKING_OPTIONS,
    defaultValue: "0",
  },
  {
    key: "total",
    header: "Total",
    width: "120px",
    align: "right",
    kind: "number",
    readOnly: true,
  },
];

type UiTableColumnPayload = {
  uiTblClmId?: string;
  uiTblClmNo?: string;
  uiTblClmTableId?: string | null;
  uiTblClmName: string | null;
  uiTblClmColumnWidth: number | null;
  uiTblClmColumnVisibility: boolean | null;
  uiTblClmColumnFocus?: boolean | null;
  uiTblClmColumnPosition: number | null;
  uiTblClmColumnNecessity?: boolean | null;
  uiTblClmNextColumn?: number | null;
  uiTblClmPreviousColumn?: number | null;
  uiTblClmIsActive?: boolean | null;
};

type SavePhysicalStockUiTableColumnRequest = {
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

const PHYSICAL_STOCK_COLUMN_SCHEMA = new Map(
  PHYSICAL_STOCK_COLUMNS.map((column) => [column.key, column]),
);

const HIDDEN_ROW_VALUE_DEFAULTS: Record<string, string> = {
  baseunitid: "",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_FIELD_KEYS = ["batchdate", "mfgdate", "expirydate"] as const;
const QUANTITY_FIELD_KEYS = new Set([
  "bookqty",
  "bookfreeqty",
  "physicalqty",
  "physicalfreeqty",
]);
const DERIVED_FIELD_KEYS = new Set([
  "bookbaseqty",
  "bookfreebaseqty",
  "physicalbaseqty",
  "physicalfreebaseqty",
  "diffqty",
  "total",
]);
const NON_NEGATIVE_NUMBER_FIELD_KEYS = PHYSICAL_STOCK_COLUMNS.filter(
  (column) => column.kind === "number" && column.key !== "diffqty",
).map((column) => column.key);

function createDefaultRowValues(): Record<string, string> {
  return {
    ...PHYSICAL_STOCK_COLUMNS.reduce<Record<string, string>>((accumulator, column) => {
      accumulator[column.key] = column.defaultValue ?? "";
      return accumulator;
    }, {}),
    ...HIDDEN_ROW_VALUE_DEFAULTS,
  };
}

const DEFAULT_ROW_VALUES = createDefaultRowValues();

function createRow(id: number, overrides: Record<string, string> = {}): PhysicalStockRow {
  return {
    id,
    values: {
      ...DEFAULT_ROW_VALUES,
      ...overrides,
    },
  };
}

function createEmptyRow(nextId: number): PhysicalStockRow {
  return createRow(nextId);
}

function getNextRowId(rows: PhysicalStockRow[]): number {
  return rows.reduce((highestId, row) => Math.max(highestId, row.id), 0) + 1;
}

function isPristineRow(row: PhysicalStockRow): boolean {
  return Object.entries(DEFAULT_ROW_VALUES).every(
    ([key, defaultValue]) => (row.values[key] ?? "") === defaultValue,
  );
}

function getDraftRows(rows: PhysicalStockRow[]): PhysicalStockRow[] {
  return rows.filter((row) => !isPristineRow(row));
}

function formatAmountInput(value: number): string {
  return VALUE_FORMATTER.format(value).replace(/,/g, "");
}

function getActualConvFactor(values: Record<string, string>): number {
  return parseDecimal(values.convfactor) || 1;
}

function withDerivedPhysicalValues(values: Record<string, string>): Record<string, string> {
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

function ensureTrailingEmptyRow(rows: PhysicalStockRow[], sourceRowId: number): PhysicalStockRow[] {
  const sourceRowIndex = rows.findIndex((row) => row.id === sourceRowId);
  if (sourceRowIndex === -1 || sourceRowIndex !== rows.length - 1) {
    return rows;
  }
  if (isPristineRow(rows[sourceRowIndex])) {
    return rows;
  }
  return [...rows, createEmptyRow(getNextRowId(rows))];
}

function buildInvalidFieldState(issues: RowValidationIssue[]): Record<string, true> {
  return issues.reduce<Record<string, true>>((accumulator, issue) => {
    accumulator[`${issue.rowId}:${issue.fieldKey}`] = true;
    return accumulator;
  }, {});
}

function getAlignClass(align: ColumnAlign): string {
  if (align === "right") {
    return styles.alignRight;
  }
  if (align === "center") {
    return styles.alignCenter;
  }
  return styles.alignLeft;
}

function handleFieldNavigationKeyDown(event: ReactKeyboardEvent<HTMLElement>): boolean {
  if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }
  event.preventDefault();
  moveOpeningStockFieldFocus(event.currentTarget, "right");
  return true;
}

function getTrackingOptionFromItem(detail: ItemPriceDetailsPayload): string {
  const trackingType = resolveTrackingType(detail.item);
  return TRACKING_OPTIONS.includes(trackingType as (typeof TRACKING_OPTIONS)[number])
    ? trackingType
    : "0";
}

function getTrackingPayloadValue(value: string): "NONE" | "MRP" | "BATCH" | "SERIAL" {
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

function getColumnMinWidth(columns: PhysicalStockColumn[]): string {
  const width = columns.reduce(
    (total, column) => total + parseDecimal(column.width),
    parseDecimal(SERIAL_NUMBER_COLUMN_WIDTH) + parseDecimal(DELETE_ACTION_COLUMN_WIDTH),
  );
  return `${Math.max(width, 2800)}px`;
}

function parseColumnWidth(width: string, fallback = 120): number {
  const parsed = Number.parseFloat(width);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toColumnWidth(value: number | null | undefined, fallback: string): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return `${value}px`;
}

function reorderColumns(
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

function findPhysicalStockUiTableColumnConfig(
  configuredColumns: UiTableColumnPayload[],
  columnKey: string,
): UiTableColumnPayload | null {
  return (
    configuredColumns.find(
      (column) => normalizeColumnName(column.uiTblClmName ?? "") === columnKey,
    ) ?? null
  );
}

function buildPhysicalStockUiTableColumnRequest(
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

function upsertPhysicalStockUiTableColumnConfig(
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

function resolveConfiguredColumns(configuredColumns: UiTableColumnPayload[]): PhysicalStockColumn[] {
  if (configuredColumns.length === 0) {
    return [];
  }

  const visibleColumns = [...configuredColumns]
    .filter((column) => {
      const key = normalizeColumnName(column.uiTblClmName ?? "");
      return key === "barcode" || column.uiTblClmColumnVisibility !== false;
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

  return resolvedColumns;
}

function buildDocumentNumber(voucherRefNo: string): number {
  const numericRef = Number.parseInt(voucherRefNo.replace(/\D/g, ""), 10);
  if (Number.isInteger(numericRef) && numericRef > 0) {
    return numericRef;
  }
  return Date.now();
}

function toOptionalUuid(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function getReasonRemarks(row: PhysicalStockRow): string | null {
  const reason = toNullableTrimmedString(row.values.reason);
  const remarks = toNullableTrimmedString(row.values.remarks);
  if (reason && remarks) {
    return `${reason} - ${remarks}`;
  }
  return reason ?? remarks;
}

function getRowValidationIssues(row: PhysicalStockRow, rowNumber: number): RowValidationIssue[] {
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

function renderValidationToastContent(issues: RowValidationIssue[]): ReactNode {
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

function buildPhysicalStockDetailPayload(
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
    toNullableTrimmedString(row.values.batchno) ||
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
    psdReasonId: null,
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
        psbBatchNo: toNullableTrimmedString(row.values.batchno),
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
        psbReasonId: null,
        psbResolution: "ADJUST_LOSS_GAIN",
        psbNotes: notes,
      },
    ],
  };
}

export default function PhysicalStockPage() {
  const [voucherDate, setVoucherDate] = useState(() => getTodayInputValue());
  const [voucherRefNo, setVoucherRefNo] = useState("");
  const [rows, setRows] = useState<PhysicalStockRow[]>(() => [createEmptyRow(1)]);
  const [invalidFieldKeys, setInvalidFieldKeys] = useState<Record<string, true>>({});
  const [itemOptions, setItemOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_ITEM_OPTION]);
  const [godownOptions, setGodownOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_GODOWN_OPTION,
  ]);
  const [unitOptions, setUnitOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [columns, setColumns] = useState<PhysicalStockColumn[]>(PHYSICAL_STOCK_COLUMNS);
  const [uiColumnConfigs, setUiColumnConfigs] = useState<UiTableColumnPayload[]>([]);
  const [itemDetailsByItemId, setItemDetailsByItemId] = useState<
    Record<string, ItemPriceDetailsPayload>
  >({});
  const [openLookupCell, setOpenLookupCell] = useState<LookupCellState | null>(null);
  const [lookupSearchQuery, setLookupSearchQuery] = useState("");
  const tableRef = useRef<HTMLTableElement | null>(null);
  const voucherDatePickerRef = useRef<HTMLInputElement | null>(null);
  const rowDatePickerRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const lookupRootRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lookupSearchInputRef = useRef<HTMLInputElement | null>(null);
  const itemSearchTimeoutRef = useRef<number | null>(null);
  const godownSearchTimeoutRef = useRef<number | null>(null);

  const {
    activeCompany,
    activeBranch,
    loading: isBusinessContextLoading,
  } = useBusinessContext();
  const columnsRef = useRef<PhysicalStockColumn[]>(PHYSICAL_STOCK_COLUMNS);
  const uiColumnConfigsRef = useRef<UiTableColumnPayload[]>([]);
  const draggingColumnKeyRef = useRef<string | null>(null);
  const resizingColumnRef = useRef<{
    key: string;
    startX: number;
    startWidth: number;
    currentWidth: number;
  } | null>(null);
  const columnSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [triggerItemOptions, { isFetching: isItemLookupLoading }] =
    useLazyGetItemOptionsQuery();
  const [triggerUnitOptions] = useLazyGetUnitOptionsQuery();
  const [triggerItemPriceDetails] = useLazyGetItemPriceDetailsQuery();
  const { getAll: listUiTableColumns } = useApi<unknown>(UI_TABLE_COLUMNS_LIST_ENDPOINT, {
    toast: {
      success: false,
      error: false,
    },
  });
  const { run: saveUiTableColumn } = useApi<
    { data?: UiTableColumnPayload },
    SavePhysicalStockUiTableColumnRequest
  >(UI_TABLE_COLUMNS_CREATE_ENDPOINT, {
    method: "POST",
    toast: {
      success: false,
      error: false,
    },
  });
  const { run: listGodowns, loading: isGodownLookupLoading } = useApi<unknown>(
    GODOWN_LIST_ENDPOINT,
    {
      toast: {
        success: false,
        error: false,
      },
    },
  );
  const { run: savePhysicalStock, loading: isSavingPhysicalStock } = useApi<
    PhysicalStockSuccessResponse<PhysicalStockDocumentResponse>,
    PhysicalStockSaveRequest
  >(PHYSICAL_STOCK_SAVE_ENDPOINT, {
    method: "POST",
    toast: {
      successMessage: "Physical stock saved successfully.",
    },
  });

  const itemOptionsByValue = useMemo(
    () => new Map(itemOptions.map((option) => [option.value, option.label])),
    [itemOptions],
  );
  const godownOptionsByValue = useMemo(
    () => new Map(godownOptions.map((option) => [option.value, option.label])),
    [godownOptions],
  );
  const unitOptionsByValue = useMemo(
    () => new Map(unitOptions.map((option) => [option.value, option.label])),
    [unitOptions],
  );
  const draftRows = useMemo(() => getDraftRows(rows), [rows]);
  const tableMinWidth = useMemo(
    () => getColumnMinWidth(columns),
    [columns],
  );
  const totals = useMemo(
    () =>
      draftRows.reduce(
        (accumulator, row) => ({
          bookQty: accumulator.bookQty + parseDecimal(row.values.bookqty),
          physicalQty: accumulator.physicalQty + parseDecimal(row.values.physicalqty),
          diffQty: accumulator.diffQty + parseDecimal(row.values.diffqty),
          value: accumulator.value + parseDecimal(row.values.total),
        }),
        { bookQty: 0, physicalQty: 0, diffQty: 0, value: 0 },
      ),
    [draftRows],
  );

  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);

  useEffect(() => {
    uiColumnConfigsRef.current = uiColumnConfigs;
  }, [uiColumnConfigs]);

  const loadItemOptions = useCallback(
    async (search = "") => {
      const normalizedSearch = search.trim();
      const nextOptions = await triggerItemOptions(
        normalizedSearch ? { search: normalizedSearch } : undefined,
        true,
      ).unwrap();
      setItemOptions(nextOptions);
    },
    [triggerItemOptions],
  );

  const loadGodownOptions = useCallback(
    async (search = "") => {
      const normalizedSearch = search.trim();
      const payload = await listGodowns({
        query: {
          ...GODOWN_LOOKUP_QUERY,
          ...(normalizedSearch ? { search: normalizedSearch } : {}),
        },
      });
      setGodownOptions(buildGodownLookupOptions(payload, activeBranch?.brId));
    },
    [activeBranch?.brId, listGodowns],
  );

  useEffect(() => {
    void (async () => {
      try {
        const payload = await listUiTableColumns(UI_TABLE_COLUMNS_QUERY);
        const configuredColumns = extractRows<UiTableColumnPayload>(payload, [
          "data",
          "rows",
          "items",
          "results",
          "columns",
          "uiTableColumns",
        ]);
        uiColumnConfigsRef.current = configuredColumns;
        setUiColumnConfigs(configuredColumns);
        const resolvedColumns = resolveConfiguredColumns(configuredColumns);
        setColumns(resolvedColumns.length > 0 ? resolvedColumns : PHYSICAL_STOCK_COLUMNS);
      } catch {
        uiColumnConfigsRef.current = [];
        setUiColumnConfigs([]);
        setColumns(PHYSICAL_STOCK_COLUMNS);
      }
    })();
  }, [listUiTableColumns]);

  useEffect(() => {
    void loadItemOptions();
  }, [loadItemOptions]);

  useEffect(() => {
    void loadGodownOptions();
  }, [loadGodownOptions]);

  useEffect(() => {
    void (async () => {
      try {
        const options = await triggerUnitOptions(undefined, true).unwrap();
        setUnitOptions(options);
      } catch {
        setUnitOptions([]);
      }
    })();
  }, [triggerUnitOptions]);

  useEffect(() => {
    if (!openLookupCell) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const activeRoot = lookupRootRefs.current[openLookupCell.key];
      if (activeRoot?.contains(event.target as Node)) {
        return;
      }
      setOpenLookupCell(null);
      setLookupSearchQuery("");
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openLookupCell]);

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

  const handleRowChange = useCallback((rowId: number, fieldKey: string, value: string) => {
    setRows((currentRows) => {
      const nextRows = currentRows.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        const nextValues = withDerivedPhysicalValues({
          ...row.values,
          [fieldKey]: value,
        });
        return {
          ...row,
          values: nextValues,
        };
      });
      return ensureTrailingEmptyRow(nextRows, rowId);
    });
    setInvalidFieldKeys((current) => {
      const invalidKey = `${rowId}:${fieldKey}`;
      if (!current[invalidKey]) {
        return current;
      }
      const next = { ...current };
      delete next[invalidKey];
      return next;
    });
  }, []);

  const handleRemoveRow = useCallback((rowId: number) => {
    setRows((currentRows) => {
      if (currentRows.length <= 1) {
        return [createEmptyRow(1)];
      }
      const nextRows = currentRows.filter((row) => row.id !== rowId);
      return nextRows.length > 0 ? nextRows : [createEmptyRow(1)];
    });
    setInvalidFieldKeys((current) => {
      const prefix = `${rowId}:`;
      const next = Object.fromEntries(
        Object.entries(current).filter(([key]) => !key.startsWith(prefix)),
      ) as Record<string, true>;
      return next;
    });
  }, []);

  const applyItemDetailToRow = useCallback(
    (
      rowId: number,
      selectedLabel: string,
      detail: ItemPriceDetailsPayload,
      preferredUnitId?: string,
    ) => {
      const priceRecord = preferredUnitId
        ? resolveItemPriceRecordByUnitId(detail, preferredUnitId)
        : resolveDefaultItemPriceRecord(detail.item_prices);
      const unitId = priceRecord?.ipm_unit_id ?? detail.item.item_base_unit_id ?? "";
      const baseUnitId = priceRecord?.ipm_base_unit_id ?? detail.item.item_base_unit_id ?? unitId;
      const displayConvFactor = priceRecord?.ipm_unit_factor ?? priceRecord?.ipm_to_base_factor ?? 1;
      const toBaseFactor = priceRecord?.ipm_to_base_factor ?? displayConvFactor;
      const godownId = priceRecord?.ipm_godown_id ?? "";

      setRows((currentRows) => {
        const nextRows = currentRows.map((row) => {
          if (row.id !== rowId) {
            return row;
          }
          const nextValues = withDerivedPhysicalValues({
            ...row.values,
            itemname: detail.item.item_name_en?.trim() || selectedLabel,
            oslitemid: detail.item.item_id,
            barcode: toInputValue(detail.item.item_default_barcode),
            code: toInputValue(detail.item.item_code),
            uom: unitOptionsByValue.get(unitId) ?? "",
            godown: godownId ? godownOptionsByValue.get(godownId) ?? "" : row.values.godown,
            convfactor: toInputValue(toBaseFactor || displayConvFactor || 1),
            costprice: toInputValue(priceRecord?.ipm_cost_price),
            costwot: toInputValue(priceRecord?.ipm_cost_wot),
            mrp: toInputValue(priceRecord?.ipm_max_price),
            remarks: toInputValue(
              priceRecord?.ipm_uom_remarks ??
                priceRecord?.ipm_cost_remarks ??
                detail.item.item_notes,
            ),
            oslunitid: unitId,
            oslbaseuomid: toInputValue(priceRecord?.ipm_id),
            oslgodownid: godownId || row.values.oslgodownid,
            osltrackingtype: getTrackingOptionFromItem(detail),
            baseunitid: baseUnitId,
          });
          return {
            ...row,
            values: nextValues,
          };
        });
        return ensureTrailingEmptyRow(nextRows, rowId);
      });
    },
    [godownOptionsByValue, unitOptionsByValue],
  );

  const handleLookupSelection = useCallback(
    async (rowId: number, lookupKind: LookupKind, option: ERPDynamicSelectOption) => {
      setOpenLookupCell(null);
      setLookupSearchQuery("");

      if (lookupKind === "godown") {
        setRows((currentRows) => {
          const nextRows = currentRows.map((row) =>
            row.id === rowId
              ? {
                  ...row,
                  values: {
                    ...row.values,
                    godown: option.value ? option.label : "",
                    oslgodownid: option.value,
                  },
                }
              : row,
          );
          return ensureTrailingEmptyRow(nextRows, rowId);
        });
        return;
      }

      if (!option.value) {
        setRows((currentRows) =>
          currentRows.map((row) =>
            row.id === rowId
              ? createRow(row.id, {
                  bookqty: row.values.bookqty,
                  bookfreeqty: row.values.bookfreeqty,
                  physicalqty: row.values.physicalqty,
                  physicalfreeqty: row.values.physicalfreeqty,
                })
              : row,
          ),
        );
        return;
      }

      setRows((currentRows) => {
        const nextRows = currentRows.map((row) =>
          row.id === rowId
            ? {
                ...row,
                values: {
                  ...row.values,
                  itemname: option.label,
                  oslitemid: option.value,
                },
              }
            : row,
        );
        return ensureTrailingEmptyRow(nextRows, rowId);
      });

      try {
        const detail = await triggerItemPriceDetails({ itemId: option.value }, true).unwrap();
        setItemDetailsByItemId((current) => ({
          ...current,
          [detail.item.item_id]: detail,
        }));
        applyItemDetailToRow(rowId, option.label, detail);
      } catch {
        toast.error("Failed to load item price details.", {
          toastId: "physical-stock:item-detail-failed",
        });
      }
    },
    [applyItemDetailToRow, triggerItemPriceDetails],
  );

  const handleUomChange = useCallback(
    (rowId: number, unitId: string) => {
      const row = rows.find((entry) => entry.id === rowId);
      const itemId = row?.values.oslitemid?.trim() ?? "";
      const itemDetail = itemId ? itemDetailsByItemId[itemId] : undefined;

      if (itemDetail) {
        applyItemDetailToRow(rowId, row?.values.itemname ?? "", itemDetail, unitId);
        return;
      }

      handleRowChange(rowId, "oslunitid", unitId);
      handleRowChange(rowId, "uom", unitOptionsByValue.get(unitId) ?? "");
    },
    [applyItemDetailToRow, handleRowChange, itemDetailsByItemId, rows, unitOptionsByValue],
  );

  const handleLookupToggle = useCallback(
    (cellKey: string, lookupKind: LookupKind) => {
      setOpenLookupCell((current) => {
        if (current?.key === cellKey) {
          setLookupSearchQuery("");
          return null;
        }
        setLookupSearchQuery("");
        if (lookupKind === "item") {
          void loadItemOptions();
        } else {
          void loadGodownOptions();
        }
        return { key: cellKey, kind: lookupKind };
      });
    },
    [loadGodownOptions, loadItemOptions],
  );

  const enqueueColumnConfigSave = useCallback((task: () => Promise<void>) => {
    const saveTask = columnSaveQueueRef.current.catch(() => undefined).then(task);
    columnSaveQueueRef.current = saveTask;
    return saveTask;
  }, []);

  const persistPhysicalStockColumnWidth = useCallback(
    async (columnKey: string, width: number) => {
      const renderedColumns = columnsRef.current;
      const columnIndex = renderedColumns.findIndex((column) => column.key === columnKey);
      const column = columnIndex >= 0 ? renderedColumns[columnIndex] : null;

      if (!column || !Number.isFinite(width) || width <= 0) {
        return;
      }

      const configuredColumn = findPhysicalStockUiTableColumnConfig(
        uiColumnConfigsRef.current,
        columnKey,
      );

      try {
        const response = await saveUiTableColumn({
          body: buildPhysicalStockUiTableColumnRequest(column, configuredColumn, columnIndex, {
            uiTblClmColumnWidth: width,
          }),
        });
        const savedColumn = response?.data;
        if (!savedColumn) {
          return;
        }

        setUiColumnConfigs((current) => {
          const nextColumns = upsertPhysicalStockUiTableColumnConfig(
            current,
            savedColumn,
            columnKey,
          );
          uiColumnConfigsRef.current = nextColumns;
          return nextColumns;
        });
      } catch {
        // Keep the local resize even if persistence fails.
      }
    },
    [saveUiTableColumn],
  );

  const persistPhysicalStockColumnOrder = useCallback(
    async (orderedColumns: PhysicalStockColumn[]) => {
      let nextColumnConfigs = uiColumnConfigsRef.current;

      for (const [columnIndex, column] of orderedColumns.entries()) {
        const configuredColumn = findPhysicalStockUiTableColumnConfig(
          nextColumnConfigs,
          column.key,
        );

        try {
          const response = await saveUiTableColumn({
            body: buildPhysicalStockUiTableColumnRequest(column, configuredColumn, columnIndex, {
              uiTblClmColumnPosition: columnIndex + 1,
              uiTblClmColumnWidth: parseColumnWidth(column.width),
            }),
          });
          const savedColumn = response?.data;
          if (!savedColumn) {
            continue;
          }

          nextColumnConfigs = upsertPhysicalStockUiTableColumnConfig(
            nextColumnConfigs,
            savedColumn,
            column.key,
          );
        } catch {
          // Continue saving the rest of the order; the local order remains usable.
        }
      }

      uiColumnConfigsRef.current = nextColumnConfigs;
      setUiColumnConfigs(nextColumnConfigs);
    },
    [saveUiTableColumn],
  );

  const handleColumnDragStart = useCallback(
    (event: ReactDragEvent<HTMLDivElement>, columnKey: string) => {
      draggingColumnKeyRef.current = columnKey;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", columnKey);
    },
    [],
  );

  const handleColumnDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleColumnDrop = useCallback(
    (targetKey: string) => {
      const sourceKey = draggingColumnKeyRef.current;
      draggingColumnKeyRef.current = null;

      if (!sourceKey || sourceKey === targetKey) {
        return;
      }

      setColumns((current) => {
        const nextColumns = reorderColumns(current, sourceKey, targetKey);
        if (nextColumns === current) {
          return current;
        }
        columnsRef.current = nextColumns;
        void enqueueColumnConfigSave(() => persistPhysicalStockColumnOrder(nextColumns));
        return nextColumns;
      });
    },
    [enqueueColumnConfigSave, persistPhysicalStockColumnOrder],
  );

  const handleColumnDragEnd = useCallback(() => {
    draggingColumnKeyRef.current = null;
  }, []);

  const handleColumnResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLSpanElement>, columnKey: string, width: string) => {
      event.preventDefault();
      event.stopPropagation();

      const startWidth = parseColumnWidth(width);
      resizingColumnRef.current = {
        key: columnKey,
        startX: event.clientX,
        startWidth,
        currentWidth: startWidth,
      };

      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    },
    [],
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const activeResize = resizingColumnRef.current;
      if (!activeResize) {
        return;
      }

      const delta = event.clientX - activeResize.startX;
      const nextWidth = Math.max(MIN_RESIZABLE_COLUMN_WIDTH, activeResize.startWidth + delta);
      activeResize.currentWidth = nextWidth;

      setColumns((current) =>
        current.map((column) =>
          column.key === activeResize.key ? { ...column, width: `${nextWidth}px` } : column,
        ),
      );
    };

    const handleMouseUp = () => {
      const activeResize = resizingColumnRef.current;
      if (!activeResize) {
        return;
      }

      resizingColumnRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (Math.round(activeResize.currentWidth) !== Math.round(activeResize.startWidth)) {
        void enqueueColumnConfigSave(() =>
          persistPhysicalStockColumnWidth(activeResize.key, activeResize.currentWidth),
        );
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      if (resizingColumnRef.current) {
        resizingColumnRef.current = null;
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      }
    };
  }, [enqueueColumnConfigSave, persistPhysicalStockColumnWidth]);

  const handleLookupSearchInputChange = useCallback(
    (lookupKind: LookupKind, search: string) => {
      setLookupSearchQuery(search);
      const timeoutRef = lookupKind === "item" ? itemSearchTimeoutRef : godownSearchTimeoutRef;
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => {
        if (lookupKind === "item") {
          void loadItemOptions(search);
        } else {
          void loadGodownOptions(search);
        }
      }, LOOKUP_SEARCH_DEBOUNCE_MS);
    },
    [loadGodownOptions, loadItemOptions],
  );

  const handleClearRows = useCallback(() => {
    setRows([createEmptyRow(1)]);
    setInvalidFieldKeys({});
    setVoucherRefNo("");
  }, []);

  const handleSavePhysicalStock = useCallback(async () => {
    if (!activeCompany) {
      toast.error("Select a company in the header before saving physical stock.", {
        toastId: "physical-stock-save:missing-company",
      });
      return;
    }
    if (!activeBranch) {
      toast.error("Select a branch in the header before saving physical stock.", {
        toastId: "physical-stock-save:missing-branch",
      });
      return;
    }

    const accountingYear = formatAccountingYear(voucherDate);
    if (!accountingYear) {
      toast.error("Select a valid voucher date before saving physical stock.", {
        toastId: "physical-stock-save:missing-date",
      });
      return;
    }

    const voucherDateIso = toIsoDateTime(voucherDate);
    if (!voucherDateIso) {
      toast.error("Select a valid voucher date before saving physical stock.", {
        toastId: "physical-stock-save:invalid-date",
      });
      return;
    }

    const userId = getAuthUserId();
    if (!userId) {
      toast.error("User session is missing. Please login again.", {
        toastId: "physical-stock-save:missing-user",
      });
      return;
    }

    if (draftRows.length === 0) {
      toast.error("Add at least one physical stock row before saving.", {
        toastId: "physical-stock-save:no-rows",
      });
      return;
    }

    const validationIssues = draftRows.flatMap((row, index) =>
      getRowValidationIssues(row, index + 1),
    );
    const headerGodownId = draftRows[0]?.values.oslgodownid?.trim() ?? "";
    const hasMixedGodowns = draftRows.some(
      (row) => row.values.oslgodownid.trim() !== headerGodownId,
    );
    if (hasMixedGodowns) {
      validationIssues.push({
        rowId: draftRows.find((row) => row.values.oslgodownid.trim() !== headerGodownId)?.id ?? 0,
        fieldKey: "godown",
        message: "Physical stock save currently supports one godown per document.",
      });
    }

    if (validationIssues.length > 0) {
      setInvalidFieldKeys(buildInvalidFieldState(validationIssues));
      const [firstIssue] = validationIssues;
      if (firstIssue) {
        window.requestAnimationFrame(() => {
          focusOpeningStockField(tableRef.current, firstIssue.rowId, firstIssue.fieldKey);
        });
      }
      toast.dismiss("physical-stock-save:validation");
      toast.error(renderValidationToastContent(validationIssues), {
        toastId: "physical-stock-save:validation",
        autoClose: 8000,
      });
      return;
    }

    setInvalidFieldKeys({});
    const docNo = buildDocumentNumber(voucherRefNo);
    const totalBookValue = draftRows.reduce(
      (sum, row) => sum + parseDecimal(row.values.bookbaseqty) * parseDecimal(row.values.costwot),
      0,
    );
    const totalCountedValue = draftRows.reduce(
      (sum, row) =>
        sum + parseDecimal(row.values.physicalbaseqty) * parseDecimal(row.values.costwot),
      0,
    );
    const normalizedRefNo = toNullableTrimmedString(voucherRefNo) ?? `PHY-STK-${docNo}`;
    const requestPayload: PhysicalStockSaveRequest = {
      psAccYear: accountingYear,
      psCompanyId: activeCompany.compId,
      psBranchId: activeBranch.brId,
      psGodownId: headerGodownId,
      psDocNo: docNo,
      psDocRefNo: normalizedRefNo,
      psDocDate: voucherDateIso,
      psCountType: "FULL",
      psStockCutoffAt: voucherDateIso,
      psFreezeStock: true,
      psPostingMode: "ADJUST_DIFFERENCE_ONLY",
      psRateSource: "MANUAL",
      psTotalLines: draftRows.length,
      psTotalBookValue: Number(totalBookValue.toFixed(2)),
      psTotalCountedValue: Number(totalCountedValue.toFixed(2)),
      psNetVarianceValue: Number((totalCountedValue - totalBookValue).toFixed(2)),
      psStatus: "DRAFT",
      psApprovalRequired: true,
      psDeviceType: "WEB",
      psDeviceId: getOrCreateClientDeviceId(),
      psCounterId: "COUNTER-1",
      psSessionId: toOptionalUuid(getAuthSessionId()),
      psRemarks:
        draftRows.map(getReasonRemarks).filter((value): value is string => Boolean(value)).join(" | ") ||
        null,
      psCreatedBy: userId,
      details: draftRows.map((row, index) =>
        buildPhysicalStockDetailPayload(row, index, {
          accountingYear,
          companyId: activeCompany.compId,
          branchId: activeBranch.brId,
        }),
      ),
    };

    try {
      const response = await savePhysicalStock({ body: requestPayload });
      const savedRefNo = response?.data?.header?.psc_refno?.trim();
      if (savedRefNo) {
        setVoucherRefNo(savedRefNo);
      }
    } catch {
      // useApi already shows the API error toast.
    }
  }, [activeBranch, activeCompany, draftRows, savePhysicalStock, voucherDate, voucherRefNo]);

  const renderCell = (row: PhysicalStockRow, rowIndex: number, column: PhysicalStockColumn) => {
    const value = row.values[column.key] ?? "";
    const invalid = Boolean(invalidFieldKeys[`${row.id}:${column.key}`]);
    const lookupKind = column.lookupKind;
    const cellKey = `${row.id}:${column.key}`;
    const isLookupOpen = openLookupCell?.key === cellKey;
    const isNumeric = column.kind === "number";
    const isReadOnly = column.readOnly || DERIVED_FIELD_KEYS.has(column.key);
    const sharedClassName = cx(
      styles.cellInput,
      isNumeric && styles.numericInput,
      invalid && styles.requiredField,
    );

    if (column.kind === "lookup" && lookupKind) {
      const selectedId =
        lookupKind === "item" ? row.values.oslitemid ?? "" : row.values.oslgodownid ?? "";
      const selectedLabel =
        lookupKind === "item"
          ? itemOptionsByValue.get(selectedId) ?? row.values.itemname
          : godownOptionsByValue.get(selectedId) ?? row.values.godown;
      const options =
        lookupKind === "item"
          ? filterLookupOptions(itemOptions, lookupSearchQuery)
          : filterLookupOptions(godownOptions, lookupSearchQuery);

      return (
        <LookupCell
          rowId={row.id}
          fieldKey={column.key}
          cellKey={cellKey}
          lookupKind={lookupKind}
          isOpen={isLookupOpen}
          isLoading={lookupKind === "item" ? isItemLookupLoading : isGodownLookupLoading}
          selectedId={selectedId}
          selectedLabel={selectedLabel}
          placeholder={`Search ${column.header}`}
          header={column.header}
          emptyMessage={lookupKind === "item" ? "No items found." : "No godowns found."}
          options={options}
          searchQuery={lookupSearchQuery}
          shortcutValues={row.values}
          hasValidationError={invalid}
          styles={styles}
          searchInputRef={lookupSearchInputRef}
          rootRef={(element) => {
            lookupRootRefs.current[cellKey] = element;
          }}
          onToggle={() => handleLookupToggle(cellKey, lookupKind)}
          onTriggerKeyDown={handleFieldNavigationKeyDown}
          onSearchChange={(search) => handleLookupSearchInputChange(lookupKind, search)}
          onSelect={(option) => void handleLookupSelection(row.id, lookupKind, option)}
        />
      );
    }
    if (column.key === "uom") {
      const currentItemId = row.values.oslitemid?.trim() ?? "";
      const itemDetail = currentItemId ? itemDetailsByItemId[currentItemId] : undefined;
      const rowUomOptions = itemDetail
        ? buildUomOptions(itemDetail, unitOptionsByValue)
        : unitOptions.filter((option) => option.value);
      return (
        <select
          data-opening-stock-field-control="true"
          data-opening-stock-row-id={row.id}
          data-opening-stock-field-key={column.key}
          value={row.values.oslunitid ?? ""}
          onChange={(event) => handleUomChange(row.id, event.target.value)}
          onKeyDown={handleFieldNavigationKeyDown}
          className={cx(styles.cellSelect, invalid && styles.requiredField)}
          disabled={rowUomOptions.length === 0}
          aria-invalid={invalid || undefined}
        >
          <option value="">{itemDetail ? "Select Uom" : "Select item first"}</option>
          {rowUomOptions.map((option) => (
            <option
              key={`${row.id}-uom-${option.value}`}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    if (column.kind === "select") {
      return (
        <select
          data-opening-stock-field-control="true"
          data-opening-stock-row-id={row.id}
          data-opening-stock-field-key={column.key}
          value={value}
          onChange={(event) => handleRowChange(row.id, column.key, event.target.value)}
          onKeyDown={handleFieldNavigationKeyDown}
          className={cx(styles.cellSelect, invalid && styles.requiredField)}
          aria-invalid={invalid || undefined}
        >
          {(column.options ?? []).map((option) => (
            <option
              key={option}
              value={option}
            >
              {TRACKING_TYPE_OPTION_LABELS[option as keyof typeof TRACKING_TYPE_OPTION_LABELS] ??
                option}
            </option>
          ))}
        </select>
      );
    }
    if (column.kind === "date") {
      const datePickerKey = `${row.id}:${column.key}`;
      return (
        <div className={cx(styles.dateInputWrap, invalid && styles.requiredDateWrap)}>
          <input
            data-opening-stock-field-control="true"
            data-opening-stock-row-id={row.id}
            data-opening-stock-field-key={column.key}
            type="text"
            value={value}
            onChange={(event) =>
              handleRowChange(row.id, column.key, formatDateEntry(event.target.value))
            }
            onKeyDown={handleFieldNavigationKeyDown}
            className={cx(sharedClassName, styles.dateInputWithPicker)}
            placeholder="dd/mm/yyyy"
            inputMode="numeric"
            maxLength={10}
            aria-invalid={invalid || undefined}
          />
          <input
            ref={(element) => {
              rowDatePickerRefs.current[datePickerKey] = element;
            }}
            type="date"
            value={toCanonicalDateValue(value)}
            onChange={(event) =>
              handleRowChange(row.id, column.key, formatDateForDisplay(event.target.value))
            }
            tabIndex={-1}
            aria-hidden="true"
            className={styles.hiddenDatePickerInput}
          />
          <button
            type="button"
            className={cx(
              styles.datePickerTrigger,
              invalid && styles.requiredDatePickerTrigger,
            )}
            onClick={() => openDatePicker(rowDatePickerRefs.current[datePickerKey] ?? null)}
            aria-label={`Open ${column.header} calendar for row ${rowIndex + 1}`}
          >
            <FiCalendar
              className={styles.datePickerIcon}
              aria-hidden="true"
            />
          </button>
        </div>
      );
    }
    return (
      <input
        data-opening-stock-field-control="true"
        data-opening-stock-row-id={row.id}
        data-opening-stock-field-key={column.key}
        type={isNumeric ? "number" : "text"}
        value={value}
        onChange={(event) => handleRowChange(row.id, column.key, event.target.value)}
        onKeyDown={(event) => {
          if (handleFieldNavigationKeyDown(event)) {
            return;
          }
          if (isNumeric && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            event.preventDefault();
          }
          if (QUANTITY_FIELD_KEYS.has(column.key) && event.key === "-") {
            event.preventDefault();
          }
        }}
        onWheel={
          isNumeric
            ? (event) => {
                event.currentTarget.blur();
              }
            : undefined
        }
        className={sharedClassName}
        readOnly={isReadOnly}
        disabled={isReadOnly}
        aria-invalid={invalid || undefined}
        inputMode={isNumeric ? "decimal" : undefined}
        step={isNumeric ? "any" : undefined}
        autoComplete="off"
        spellCheck={false}
      />
    );
  };
  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headingBlock}>
          <div className={styles.headingRow}>
            <h1 className={styles.title}>Physical Stock</h1>
          </div>
        </div>
      </header>
      <div className={styles.tableShell}>
        <div className={styles.toolbar}>
          <div className={styles.tableTools}>
            <label className={styles.toolbarDateField}>
              <span className={styles.toolbarDateLabel}>Voucher Date</span>
              <div className={styles.toolbarDateControl}>
                <input
                  type="text"
                  value={voucherDate}
                  onChange={(event) => setVoucherDate(formatDateEntry(event.target.value))}
                  className={cx(styles.toolbarDateInput, styles.dateInputWithPicker)}
                  placeholder="dd/mm/yyyy"
                  inputMode="numeric"
                  maxLength={10}
                />
                <input
                  ref={voucherDatePickerRef}
                  type="date"
                  value={toCanonicalDateValue(voucherDate)}
                  onChange={(event) => setVoucherDate(formatDateForDisplay(event.target.value))}
                  tabIndex={-1}
                  aria-hidden="true"
                  className={styles.hiddenDatePickerInput}
                />
                <button
                  type="button"
                  className={styles.datePickerTrigger}
                  onClick={() => openDatePicker(voucherDatePickerRef.current)}
                  aria-label="Open voucher date calendar"
                >
                  <FiCalendar
                    className={styles.datePickerIcon}
                    aria-hidden="true"
                  />
                </button>
              </div>
            </label>
            <label className={styles.toolbarDateField}>
              <span className={styles.toolbarDateLabel}>Ref No</span>
              <div className={styles.toolbarDateControl}>
                <input
                  type="text"
                  value={voucherRefNo}
                  onChange={(event) => setVoucherRefNo(event.target.value)}
                  className={cx(styles.toolbarDateInput, styles.toolbarRefInput)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </label>
            <button
              type="button"
              className={cx(styles.createButton, styles.updateButton)}
              onClick={() => void handleSavePhysicalStock()}
              disabled={isSavingPhysicalStock || isBusinessContextLoading}
            >
              <FiSave
                className={styles.createIcon}
                aria-hidden="true"
              />
              <span>{isSavingPhysicalStock ? "Saving..." : "Save Stock"}</span>
            </button>
            <button
              type="button"
              className={cx(styles.createButton, styles.clearRowsButton)}
              onClick={handleClearRows}
              disabled={isSavingPhysicalStock || draftRows.length === 0}
            >
              <FiRotateCcw
                className={styles.createIcon}
                aria-hidden="true"
              />
              <span>Clear Rows</span>
            </button>
          </div>
        </div>
        <div
          className={styles.tableViewport}
          data-erp-table-viewport="true"
        >
          <table
            ref={tableRef}
            className={cx(styles.table, styles.resizableTable, styles.columnStripedTable)}
            style={{ "--erp-table-min-width": tableMinWidth } as CSSProperties}
          >
            <colgroup>
              <col style={{ width: SERIAL_NUMBER_COLUMN_WIDTH }} />
              {columns.map((column) => (
                <col
                  key={column.key}
                  style={{ width: column.width }}
                />
              ))}
              <col style={{ width: DELETE_ACTION_COLUMN_WIDTH }} />
            </colgroup>
            <thead className={styles.head}>
              <tr>
                <th
                  className={cx(
                    styles.headerCell,
                    styles.alignCenter,
                    styles.headerCellDark,
                    styles.stickySerialCell,
                    styles.stickySerialHeader,
                  )}
                  style={{ width: SERIAL_NUMBER_COLUMN_WIDTH, left: 0 }}
                >
                  <span className={styles.headerText}>S.No</span>
                </th>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={cx(
                      styles.headerCell,
                      styles.alignCenter,
                      styles.headerCellDark,
                      styles.resizableHeaderCell,
                    )}
                    style={{ width: column.width }}
                  >
                    <div
                      draggable
                      className={styles.draggableHeaderContent}
                      onDragStart={(event) => handleColumnDragStart(event, column.key)}
                      onDragOver={handleColumnDragOver}
                      onDrop={() => handleColumnDrop(column.key)}
                      onDragEnd={handleColumnDragEnd}
                    >
                      <span className={styles.headerText}>{column.header}</span>
                    </div>
                    <span
                      className={styles.columnResizeHandle}
                      onMouseDown={(event) =>
                        handleColumnResizeStart(event, column.key, column.width)
                      }
                      onDragStart={(event) => event.preventDefault()}
                      role="presentation"
                    />
                  </th>
                ))}
                <th
                  className={cx(
                    styles.headerCell,
                    styles.alignCenter,
                    styles.headerCellDark,
                    styles.stickyActionCell,
                    styles.stickyActionHeader,
                  )}
                  style={{ width: DELETE_ACTION_COLUMN_WIDTH, right: 0 }}
                  aria-hidden="true"
                />
              </tr>
            </thead>
            <tbody className={styles.body}>
              {rows.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  className={cx(
                    styles.dataRow,
                    styles.row,
                    rowIndex % 2 === 0 ? styles.rowOdd : styles.rowEven,
                  )}
                >
                  <td
                    data-label="S.No"
                    className={cx(
                      styles.cell,
                      styles.compactCell,
                      styles.alignLeft,
                      styles.stickySerialCell,
                    )}
                    style={{ left: 0 }}
                  >
                    <div className={styles.serialCellContent}>
                      <span className={styles.rowNumber}>{rowIndex + 1}</span>
                    </div>
                  </td>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      data-label={column.header}
                      className={cx(
                        styles.cell,
                        styles.compactCell,
                        getAlignClass(column.align),
                      )}
                    >
                      {renderCell(row, rowIndex, column)}
                    </td>
                  ))}
                  <td
                    data-label=""
                    className={cx(
                      styles.cell,
                      styles.compactCell,
                      styles.alignCenter,
                      styles.stickyActionCell,
                    )}
                    style={{ right: 0 }}
                  >
                    <div className={styles.actionCellContent}>
                      <button
                        type="button"
                        className={styles.rowDeleteButton}
                        aria-label={`Delete row ${rowIndex + 1}`}
                        onClick={() => handleRemoveRow(row.id)}
                      >
                        <FiTrash2
                          className={styles.actionIcon}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.paginationBar}>
          <div className={styles.paginationInfo}>
            <KeyboardShortcutHints
              shortcuts={PHYSICAL_STOCK_TABLE_SHORTCUTS}
              dense
            />
          </div>
          <div className={styles.footerValue}>
            <strong className={styles.footerLabel}>book qty</strong>
            <strong>{QUANTITY_FORMATTER.format(totals.bookQty)}</strong>
            <strong className={styles.footerLabel}>physical qty</strong>
            <strong>{QUANTITY_FORMATTER.format(totals.physicalQty)}</strong>
            <strong className={styles.footerLabel}>diff qty</strong>
            <strong>{QUANTITY_FORMATTER.format(totals.diffQty)}</strong>
            <strong className={styles.footerLabel}>total</strong>
            <strong>{VALUE_FORMATTER.format(totals.value)}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
