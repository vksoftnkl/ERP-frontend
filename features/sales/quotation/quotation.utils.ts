/**
 * Quotation Entry — pure helpers. No React, no API.
 */
import { formatAccountingYear } from "@/features/stocks/opening-stock/opening-stock.utils";
import type { GridColumnConfig } from "@/store/slices/gridColumnsSlice";
import {
  CHARGE_COLUMN_MEANINGS,
  ITEM_COLUMN_MEANINGS,
  isSerialColumnName,
  normalizeColumnToken,
  SERIAL_COLUMN_KEY,
  type ChargeColumnMeaning,
  type GridCellKind,
  type ItemColumnMeaning,
} from "./quotation.constants";
import type { UiTableColumnRow, WireDecimal } from "./quotation.types";
// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------
/**
 * Every `numeric` column comes back from `/quotations/get` as a **string** with
 * trailing zeros trimmed (`0.00` → `"0"`, `1234.50` → `"1234.5"`), so a loaded
 * value must be parsed, never assumed to be a number or to have 2 decimals.
 */
export function toNumber(value: WireDecimal | boolean | undefined, fallback = 0): number {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
/** Same, but keeps `null` as `null` for the nullable payload columns. */
export function toNullableNumber(value: WireDecimal | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}
/** Parse what an operator typed into a grid cell. A blank cell is 0, not NaN. */
export function parseCell(value: string): number {
  const trimmed = value.trim().replace(/,/g, "");
  if (!trimmed || trimmed === "-" || trimmed === ".") {
    return 0;
  }
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}
/** Trim to `null` — the shape every nullable string column wants. */
export function toNullableText(value: string | null | undefined, maxLength?: number): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return null;
  }
  return maxLength ? trimmed.slice(0, maxLength) : trimmed;
}
// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Today as `yyyy-mm-dd` in LOCAL time — `toISOString()` would shift the day. */
export function todayIso(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
/** `yyyy-mm-dd` out of whatever the API returned (a full ISO timestamp). */
export function toDateInput(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  if (ISO_DATE.test(trimmed)) {
    return trimmed;
  }
  const separatorIndex = trimmed.indexOf("T");
  if (separatorIndex === 10) {
    return trimmed.slice(0, 10);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const month = `${parsed.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${parsed.getUTCDate()}`.padStart(2, "0");
  return `${parsed.getUTCFullYear()}-${month}-${day}`;
}
/**
 * `yyyy-mm-dd` (what the draft and the wire use) → `dd-mm-yyyy` (what the screen
 * shows). A native `<input type="date">` renders in the BROWSER's locale, which
 * is why the date fields are text inputs with their own formatting.
 */
export function toDisplayDate(value: string): string {
  const match = ISO_DATE.exec((value ?? "").trim());
  if (!match) {
    return "";
  }
  const [, year, month, day] = match;
  return `${day}-${month}-${year}`;
}
/**
 * The inverse, tolerant of what an operator actually types: `-`, `/` or `.` as
 * separators, or eight bare digits. Returns null when it is not a real date, so
 * a half-typed cell leaves the stored value alone.
 */
export function fromDisplayDate(value: string): string | null {
  const digits = (value ?? "").replace(/[^0-9]/g, "");
  if (digits.length !== 8) {
    return null;
  }
  const iso = `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
  return isRealDate(iso) ? iso : null;
}
export function isRealDate(value: string): boolean {
  const match = ISO_DATE.exec(value.trim());
  if (!match) {
    return false;
  }
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return (
    date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day)
  );
}
const DAY_MS = 24 * 60 * 60 * 1000;
function toUtcTime(value: string): number | null {
  const match = ISO_DATE.exec(value.trim());
  if (!match) {
    return null;
  }
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
export function addDays(value: string, days: number): string {
  const time = toUtcTime(value);
  if (time === null) {
    return "";
  }
  const shifted = new Date(time + days * DAY_MS);
  const month = `${shifted.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${shifted.getUTCDate()}`.padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${month}-${day}`;
}
/** `to - from` in whole days. `null` when either side is not a real date. */
export function daysBetween(from: string, to: string): number | null {
  const fromTime = toUtcTime(from);
  const toTime = toUtcTime(to);
  if (fromTime === null || toTime === null) {
    return null;
  }
  return Math.round((toTime - fromTime) / DAY_MS);
}
/**
 * `sq_acc_year` is `char(9)` and the DTO caps it at 9 — the fiscal year the
 * voucher date falls in, April-start, e.g. `"2026-2027"`.
 */
export function accountingYearOf(quoteDate: string): string {
  return formatAccountingYear(quoteDate) ?? formatAccountingYear(todayIso()) ?? "";
}
// ---------------------------------------------------------------------------
// Column resolution
// ---------------------------------------------------------------------------
/**
 * What `ui_tbl_clm_column_width` means on a given layout.
 *
 * `"px"` — the web tables (item grid 23, opening stock 5): the number is the
 * column's pixel width, which is also what a drag saves back.
 *
 * `"qtPercent"` — the layouts the Qt screens own (charges 21): a percent-of-grid
 * number sized for that grid, where the visible columns sum to ~460%. It is not
 * a percent of anything this layout has, and rendering it as a `%` on a
 * `table-layout: fixed` table whose width derives from those same percentages
 * blows the table up to tens of millions of pixels. Such a layout is scaled into
 * pixels at the ratio the Qt grid used.
 */
export type ColumnWidthUnit = "px" | "qtPercent";
export type ResolvedColumn<TMeaning> = TMeaning & {
  header: string;
  /** Column width in **pixels**, whatever unit the layout stored. */
  widthPx: number;
  visible: boolean;
  focus: boolean;
  columnNumber: number;
  /** `ui_tbl_clm_id`, the handle a resize is saved against. Null on fallback. */
  columnId: string | null;
};
/** Pixels per configured "percent". 9.6 (the Description column) → ~106px. */
const PX_PER_CONFIG_UNIT = 11;
/** Narrow enough to be a flag column, wide enough to read a heading. */
const MIN_COLUMN_PX = 34;
const DEFAULT_COLUMN_PX = 90;
function widthPxOf(configured: number | null, unit: ColumnWidthUnit): number {
  if (typeof configured !== "number" || !Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_COLUMN_PX;
  }
  const px = unit === "px" ? configured : configured * PX_PER_CONFIG_UNIT;
  return Math.max(MIN_COLUMN_PX, Math.round(px));
}
/** The floor a drag may take a column to — same one the resolver enforces. */
export const MIN_RESIZED_COLUMN_PX = MIN_COLUMN_PX;
/**
 * The inverse of `widthPxOf`: a dragged pixel width back into the unit the
 * layout stores. On a `qtPercent` layout, writing raw pixels would be read back
 * multiplied by `PX_PER_CONFIG_UNIT` — an 11× wider column every reload.
 */
export function configWidthFromPx(widthPx: number, unit: ColumnWidthUnit): number {
  const safe = Math.max(MIN_COLUMN_PX, Math.round(widthPx));
  return unit === "px" ? safe : Math.round((safe / PX_PER_CONFIG_UNIT) * 100) / 100;
}
/** Total width of the visible columns, for the table's own `width`. */
export function totalColumnWidth<TMeaning>(
  columns: ResolvedColumn<TMeaning>[],
  extraPx = 0,
): number {
  return columns.reduce((total, column) => total + column.widthPx, extraPx);
}
/**
 * Join the server's layout rows to the local column meanings.
 *
 * Sorted by `uiTblClmNo`, never by `uiTblClmColumnPosition`: the live data has a
 * duplicate position (58) and a hole (62), so position ordering is
 * non-deterministic between two columns.
 *
 * A configured row with no local meaning is dropped (it would render an empty
 * column); a meaning with no configured row is dropped too, since the server
 * owns which columns this deployment shows. If the layout could not be fetched
 * at all, the caller falls back to `defaultColumns`.
 */
function resolveColumns<TMeaning extends { key: string; token: string; kind: GridCellKind }>(
  rows: UiTableColumnRow[] | undefined,
  meanings: TMeaning[],
  unit: ColumnWidthUnit,
): ResolvedColumn<TMeaning>[] {
  if (!rows || rows.length === 0) {
    return [];
  }
  const byKey = new Map(meanings.map((meaning) => [meaning.key, meaning]));
  const resolved: ResolvedColumn<TMeaning>[] = [];
  // Two configured rows can land on one meaning — the serial column answers to
  // several names — and two columns sharing a key would be two React children
  // with the same key. First row in column-number order wins.
  const taken = new Set<string>();
  for (const row of rows) {
    const rawName = row.uiTblClmName ?? "";
    const normalized = normalizeColumnToken(rawName);
    // The charge grid's first column is literally named "#", which normalises to
    // the empty string; match it by its column number instead.
    const key = normalized || (row.uiTblClmNo === "0" ? SERIAL_COLUMN_KEY : "");
    // The row number is named per deployment ("sl.no", "Id", "#"), so it is
    // matched by any of those rather than by the one this build happens to ship.
    const meaning =
      (key ? byKey.get(key) : undefined) ??
      (isSerialColumnName(key) ? byKey.get(SERIAL_COLUMN_KEY) : undefined);
    if (!meaning || taken.has(meaning.key)) {
      continue;
    }
    taken.add(meaning.key);
    resolved.push({
      ...meaning,
      // A serial column's configured name is a row-number caption, not a field
      // label, and comes in every casing there is — it shows the shipped one.
      header: meaning.kind === "serial" ? meaning.token : rawName || meaning.token,
      widthPx: widthPxOf(row.uiTblClmColumnWidth, unit),
      visible: row.uiTblClmColumnVisibility !== false,
      focus: row.uiTblClmColumnFocus === true,
      columnNumber: Number.parseInt(row.uiTblClmNo ?? "0", 10) || 0,
      columnId: row.uiTblClmId ?? null,
    });
  }
  return resolved.sort((left, right) => left.columnNumber - right.columnNumber);
}
/** Fallback layout: every local meaning, in declaration order, all visible. */
function fallbackColumns<TMeaning extends { key: string; token: string }>(
  meanings: TMeaning[],
): ResolvedColumn<TMeaning>[] {
  return meanings.map((meaning, index) => ({
    ...meaning,
    header: meaning.token,
    widthPx: DEFAULT_COLUMN_PX,
    visible: true,
    focus: false,
    columnNumber: index,
    columnId: null,
  }));
}
export type ResolvedItemColumn = ResolvedColumn<ItemColumnMeaning>;
export type ResolvedChargeColumn = ResolvedColumn<ChargeColumnMeaning>;
/** The unit each grid's layout stores its widths in. */
export const ITEM_COLUMN_WIDTH_UNIT: ColumnWidthUnit = "px";
export const CHARGE_COLUMN_WIDTH_UNIT: ColumnWidthUnit = "qtPercent";
/** What a serial column the layout never configured is given to work with. */
const SERIAL_COLUMN_PX = 48;
/**
 * The items grid always opens on its Sl.No column, even on a layout that carries
 * no row for it at all — the row number is how an operator refers to a line, and
 * the frozen first column is anchored on it.
 *
 * A layout that configures the column and hides it is left alone: that is an
 * admin's own choice in the grid's "Admin settings", not a gap. The injected one
 * carries `columnId: null`, so a width drag on it stays local the same way the
 * whole fallback layout's does.
 */
function withSerialColumn<TMeaning extends { key: string; token: string; kind: GridCellKind }>(
  columns: ResolvedColumn<TMeaning>[],
  meanings: TMeaning[],
): ResolvedColumn<TMeaning>[] {
  if (columns.some((column) => column.kind === "serial")) {
    return columns;
  }
  const meaning = meanings.find((candidate) => candidate.kind === "serial");
  if (!meaning) {
    return columns;
  }
  return [
    {
      ...meaning,
      header: meaning.token,
      widthPx: SERIAL_COLUMN_PX,
      visible: true,
      focus: false,
      // Below every configured number, so a re-sort keeps it first.
      columnNumber: -1,
      columnId: null,
    },
    ...columns,
  ];
}
export function resolveItemColumns(rows: UiTableColumnRow[] | undefined): ResolvedItemColumn[] {
  const resolved = resolveColumns(rows, ITEM_COLUMN_MEANINGS, ITEM_COLUMN_WIDTH_UNIT);
  return resolved.length > 0
    ? withSerialColumn(resolved, ITEM_COLUMN_MEANINGS)
    : fallbackColumns(ITEM_COLUMN_MEANINGS);
}
export function resolveChargeColumns(rows: UiTableColumnRow[] | undefined): ResolvedChargeColumn[] {
  const resolved = resolveColumns(rows, CHARGE_COLUMN_MEANINGS, CHARGE_COLUMN_WIDTH_UNIT);
  return resolved.length > 0 ? resolved : fallbackColumns(CHARGE_COLUMN_MEANINGS);
}
/**
 * Whether a column is the grid's frozen one: the leftmost visible column, which
 * stays put while the rest scroll sideways. Sl.No on the item grid, Charge Name
 * on the charges grid — the layout hides that grid's own `#` column, and a charge
 * row is identified by its name rather than by a number anyway.
 *
 * Anything further right is never frozen: it would park on top of the columns to
 * its left instead of at the grid's edge.
 */
export function isFrozenColumn(columnIndex: number): boolean {
  return columnIndex === 0;
}
/** The configured grid columns of the browse list, visible ones in order. */
export function visibleGridColumns(columns: GridColumnConfig[] | undefined): GridColumnConfig[] {
  return (columns ?? []).filter((column) => column.visible !== false);
}
// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------
let rowKeySequence = 0;
/**
 * A stable row key. Rows are addressed by key everywhere — the reducer, the
 * focus walker, the validation map — so that inserting above row 3 cannot
 * silently re-target an edit at the old index 3.
 */
export function nextRowKey(prefix: string): string {
  rowKeySequence += 1;
  return `${prefix}-${rowKeySequence}`;
}
/** `true` when the value is one of the enum's members, for a wire string. */
export function asEnum<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const upper = (value ?? "").trim().toUpperCase();
  return (allowed as readonly string[]).includes(upper) ? (upper as T) : fallback;
}
/**
 * The page-number list a pager renders: first, last, the current page's
 * immediate neighbours, and an `"ellipsis"` wherever a run is skipped. Same
 * shape `components/ui/table.tsx`'s pagination bar builds, so the quote-list
 * popup's pager reads like every other one in the app.
 */
export function buildPageList(totalPages: number, currentPage: number): Array<number | "ellipsis"> {
  const pages: Array<number | "ellipsis"> = [];
  const safeTotal = Math.max(1, totalPages);
  for (let page = 1; page <= safeTotal; page += 1) {
    if (page === 1 || page === safeTotal || (page >= currentPage - 1 && page <= currentPage + 1)) {
      pages.push(page);
      continue;
    }
    if ((page === currentPage - 2 || page === currentPage + 2) && pages[pages.length - 1] !== "ellipsis") {
      pages.push("ellipsis");
    }
  }
  return pages;
}