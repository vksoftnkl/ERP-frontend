/**
 * Quotation Entry — pure helpers. No React, no API.
 */
import { formatAccountingYear } from "@/features/stocks/opening-stock/opening-stock.utils";
import type { GridColumnConfig } from "@/store/slices/gridColumnsSlice";
import {
  CHARGE_COLUMN_MEANINGS,
  CHARGE_SERIAL_KEY,
  ITEM_COLUMN_MEANINGS,
  normalizeColumnToken,
  type ChargeColumnMeaning,
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

export type ResolvedColumn<TMeaning> = TMeaning & {
  header: string;
  /**
   * Column width in **pixels**.
   *
   * `ui_tbl_clm_column_width` is a percent-of-grid number sized for the Qt
   * screen, and the 76 visible item columns sum to ~460% — so it is not a percent
   * of anything this layout has. Rendering it as a `%` on a `table-layout: fixed`
   * table whose width is `max-content` is worse than wrong: the percentages
   * resolve against a width that is itself derived from them and the table grows
   * to tens of millions of pixels. The number is therefore scaled into pixels at
   * the ratio the Qt grid used.
   */
  widthPx: number;
  visible: boolean;
  focus: boolean;
  columnNumber: number;
};

/** Pixels per configured "percent". 9.6 (the Description column) → ~106px. */
const PX_PER_CONFIG_UNIT = 11;
/** Narrow enough to be a flag column, wide enough to read a heading. */
const MIN_COLUMN_PX = 34;
const DEFAULT_COLUMN_PX = 90;

function widthPxOf(configured: number | null): number {
  if (typeof configured !== "number" || !Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_COLUMN_PX;
  }
  return Math.max(MIN_COLUMN_PX, Math.round(configured * PX_PER_CONFIG_UNIT));
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
function resolveColumns<TMeaning extends { key: string; token: string }>(
  rows: UiTableColumnRow[] | undefined,
  meanings: TMeaning[],
  serialKey: string,
): ResolvedColumn<TMeaning>[] {
  if (!rows || rows.length === 0) {
    return [];
  }
  const byKey = new Map(meanings.map((meaning) => [meaning.key, meaning]));
  const resolved: ResolvedColumn<TMeaning>[] = [];

  for (const row of rows) {
    const rawName = row.uiTblClmName ?? "";
    const normalized = normalizeColumnToken(rawName);
    // The charge grid's first column is literally named "#", which normalises to
    // the empty string; match it by its column number instead.
    const key = normalized || (row.uiTblClmNo === "0" ? serialKey : "");
    const meaning = key ? byKey.get(key) : undefined;
    if (!meaning) {
      continue;
    }
    resolved.push({
      ...meaning,
      header: rawName || meaning.token,
      widthPx: widthPxOf(row.uiTblClmColumnWidth),
      visible: row.uiTblClmColumnVisibility !== false,
      focus: row.uiTblClmColumnFocus === true,
      columnNumber: Number.parseInt(row.uiTblClmNo ?? "0", 10) || 0,
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
  }));
}

export type ResolvedItemColumn = ResolvedColumn<ItemColumnMeaning>;
export type ResolvedChargeColumn = ResolvedColumn<ChargeColumnMeaning>;

export function resolveItemColumns(rows: UiTableColumnRow[] | undefined): ResolvedItemColumn[] {
  const resolved = resolveColumns(rows, ITEM_COLUMN_MEANINGS, "id");
  return resolved.length > 0 ? resolved : fallbackColumns(ITEM_COLUMN_MEANINGS);
}

export function resolveChargeColumns(rows: UiTableColumnRow[] | undefined): ResolvedChargeColumn[] {
  const resolved = resolveColumns(rows, CHARGE_COLUMN_MEANINGS, CHARGE_SERIAL_KEY);
  return resolved.length > 0 ? resolved : fallbackColumns(CHARGE_COLUMN_MEANINGS);
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
