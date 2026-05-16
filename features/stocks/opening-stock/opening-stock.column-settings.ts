import type { CSSProperties } from "react";
import type { KeyboardShortcutDefinition } from "@/components/design-system/ui/keyboard-shortcut-hints";
import type {
  OpeningStockRow,
  ColumnDefinition,
  UiTableColumnPayload,
} from "./opening-stock.types";
import type { OpeningStockListMeta } from "./opening-stock.types";
import { UI_TABLE_COLUMNS_QUERY } from "./constants";
import {
  normalizeColumnName,
  parseColumnWidth,
  isPristineRow,
  toCanonicalDateValue,
  getTodayInputValue,
} from "./opening-stock.utils";

export const OPENING_STOCK_TABLE_SHORTCUTS: readonly KeyboardShortcutDefinition[] = [
  {
    label: "Prev Cell",
    keys: ["Shift"],
  },
  {
    label: "Next Cell",
    keys: ["Enter"],
  },
  {
    label: "Close Lookup",
    keys: ["Escape"],
  },
  {
    label: "Open List",
    keys: ["F5"],
  },
];
export type OpeningStockLoadRequest =
  | { type: "latest" }
  | { type: "refno"; refNo: string }
  | { type: "voucher"; voucherId: string; label: string };
export type InlineItemMasterRequest = {
  itemId: string;
  mode: "create" | "update";
  query: string;
  rowId: number;
};
export type InlineGodownMasterRequest = {
  godownId: string;
  mode: "create" | "update";
  query: string;
  rowId: number;
};
export type OpeningStockListFilters = {
  search: string;
  dateFrom: string;
  dateTo: string;
};
export type OpeningStockEditorState = {
  loadedVoucherId: string | null;
  voucherDate: string;
  voucherRefNo: string;
  rows: OpeningStockRow[];
};
export const DEFAULT_OPENING_STOCK_LIST_FILTERS: OpeningStockListFilters = {
  search: "",
  dateFrom: "",
  dateTo: "",
};
export function createOpeningStockListFiltersForToday(): OpeningStockListFilters {
  const today = toCanonicalDateValue(getTodayInputValue());
  return {
    search: "",
    dateFrom: today,
    dateTo: today,
  };
}
export const EMPTY_OPENING_STOCK_LIST_META: OpeningStockListMeta = {
  page: 1,
  limit: 20,
  total: 0,
  total_pages: 0,
};
export const TABLE_SETTINGS_CONTEXT_MENU_WIDTH = 190;
export const TABLE_SETTINGS_CONTEXT_MENU_HEIGHT = 96;
export const TABLE_SETTINGS_CONTEXT_MENU_PADDING = 8;
export type OpeningStockColumnSettingsMode = "filter" | "visibility";
export type TableSettingsContextMenuPosition = Pick<CSSProperties, "left" | "top">;
export type OpeningStockColumnSettingsRow = {
  key: string;
  label: string;
  uiTblClmId?: string;
  uiTblClmNo?: string;
  uiTblClmTableId: string | null;
  width: number | null;
  visible: boolean;
  focus: boolean;
  position: number;
  necessity: boolean;
  nextColumn: number | null;
  previousColumn: number | null;
  isActive: boolean;
};
export type SaveOpeningStockUiTableColumnRequest = {
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
export function clampContextMenuPosition(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
export function compareUiTableColumns(
  left: UiTableColumnPayload,
  right: UiTableColumnPayload,
): number {
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
}
export function getUiTableColumnDraftKey(
  column: UiTableColumnPayload,
  index: number,
): string {
  const id = column.uiTblClmId?.trim();
  if (id) {
    return id;
  }
  return `${column.uiTblClmName ?? "column"}:${index}`;
}
export function buildOpeningStockColumnSettingsRows(
  configuredColumns: UiTableColumnPayload[],
  fallbackColumns: ColumnDefinition[],
): OpeningStockColumnSettingsRow[] {
  if (configuredColumns.length === 0) {
    return fallbackColumns.map((column, index) => ({
      key: column.key,
      label: column.header,
      uiTblClmNo: String(index + 1),
      uiTblClmTableId: UI_TABLE_COLUMNS_QUERY.uiTblClmTableId,
      width: parseColumnWidth(column.width),
      visible: true,
      focus: false,
      position: index + 1,
      necessity: false,
      nextColumn: null,
      previousColumn: null,
      isActive: true,
    }));
  }
  return [...configuredColumns]
    .sort(compareUiTableColumns)
    .map((column, index) => {
      const fallbackPosition = index + 1;
      return {
        key: getUiTableColumnDraftKey(column, index),
        label: column.uiTblClmName?.trim() || `Column ${fallbackPosition}`,
        uiTblClmId: column.uiTblClmId,
        uiTblClmNo: column.uiTblClmNo,
        uiTblClmTableId: column.uiTblClmTableId ?? UI_TABLE_COLUMNS_QUERY.uiTblClmTableId,
        width: column.uiTblClmColumnWidth,
        visible: column.uiTblClmColumnVisibility ?? true,
        focus: column.uiTblClmColumnFocus ?? false,
        position: column.uiTblClmColumnPosition ?? fallbackPosition,
        necessity: column.uiTblClmColumnNecessity ?? false,
        nextColumn: column.uiTblClmNextColumn ?? null,
        previousColumn: column.uiTblClmPreviousColumn ?? null,
        isActive: column.uiTblClmIsActive ?? true,
      };
    });
}
export function buildOpeningStockUiTableColumnRequest(
  row: OpeningStockColumnSettingsRow,
  mode: OpeningStockColumnSettingsMode,
  checked: boolean,
): SaveOpeningStockUiTableColumnRequest {
  return {
    ...(row.uiTblClmId ? { uiTblClmId: row.uiTblClmId } : {}),
    uiTblClmNo: row.uiTblClmNo || String(row.position),
    uiTblClmName: row.label,
    uiTblClmTableId: row.uiTblClmTableId,
    uiTblClmColumnWidth: row.width,
    uiTblClmColumnVisibility: mode === "visibility" ? checked : row.visible,
    uiTblClmColumnFocus: mode === "filter" ? checked : row.focus,
    uiTblClmColumnPosition: row.position,
    uiTblClmColumnNecessity: row.necessity,
    uiTblClmNextColumn: row.nextColumn,
    uiTblClmPreviousColumn: row.previousColumn,
    uiTblClmIsActive: row.isActive,
  };
}
export function findOpeningStockUiTableColumnConfig(
  configuredColumns: UiTableColumnPayload[],
  columnKey: string,
): UiTableColumnPayload | null {
  return (
    configuredColumns.find(
      (column) => normalizeColumnName(column.uiTblClmName ?? "") === columnKey,
    ) ?? null
  );
}
export function buildOpeningStockUiTableColumnWidthRequest(
  column: ColumnDefinition,
  configuredColumn: UiTableColumnPayload | null,
  columnIndex: number,
  width: number,
): SaveOpeningStockUiTableColumnRequest {
  const fallbackPosition = columnIndex + 1;
  return {
    ...(configuredColumn?.uiTblClmId ? { uiTblClmId: configuredColumn.uiTblClmId } : {}),
    uiTblClmNo: configuredColumn?.uiTblClmNo || String(fallbackPosition),
    uiTblClmName: configuredColumn?.uiTblClmName?.trim() || column.header || column.key,
    uiTblClmTableId: configuredColumn?.uiTblClmTableId ?? UI_TABLE_COLUMNS_QUERY.uiTblClmTableId,
    uiTblClmColumnWidth: width,
    uiTblClmColumnVisibility: configuredColumn?.uiTblClmColumnVisibility ?? true,
    uiTblClmColumnFocus: configuredColumn?.uiTblClmColumnFocus ?? false,
    uiTblClmColumnPosition: configuredColumn?.uiTblClmColumnPosition ?? fallbackPosition,
    uiTblClmColumnNecessity: configuredColumn?.uiTblClmColumnNecessity ?? false,
    uiTblClmNextColumn: configuredColumn?.uiTblClmNextColumn ?? null,
    uiTblClmPreviousColumn: configuredColumn?.uiTblClmPreviousColumn ?? null,
    uiTblClmIsActive: configuredColumn?.uiTblClmIsActive ?? true,
  };
}
export function upsertOpeningStockUiTableColumnConfig(
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
export function buildOpeningStockEditorSignature({
  loadedVoucherId,
  voucherDate,
  voucherRefNo,
  rows,
}: OpeningStockEditorState): string {
  return JSON.stringify({
    loadedVoucherId: loadedVoucherId?.trim() || null,
    voucherDate: voucherDate.trim(),
    voucherRefNo: voucherRefNo.trim(),
    rows: rows.filter((row) => !isPristineRow(row)).map((row) => row.values),
  });
}
export function buildNavigationHref(href: string | URL): string {
  if (typeof href === "string") {
    return href;
  }
  return href.toString();
}
export function isSameNavigationTarget(targetHref: string | URL): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const currentUrl = new URL(window.location.href);
  const nextUrl = new URL(buildNavigationHref(targetHref), currentUrl);
  return nextUrl.href === currentUrl.href;
}
export function getOpeningStockVoucherLabel(source: {
  avh_voucher_refno?: string | null;
  osh_voucher_no?: string | null;
  avh_voucher_id?: string | null;
}): string {
  return (
    source.avh_voucher_refno?.trim() ||
    source.osh_voucher_no?.trim() ||
    source.avh_voucher_id?.trim() ||
    "selected voucher"
  );
}
export function getOpeningStockListErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return "Failed to load opening stock list.";
}
