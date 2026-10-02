/**
 * How the adjustment screen reads and writes its cells — the anonymous-namespace
 * helpers at the top of `stock_adjustment_entry.cpp` and the date pair of
 * `stock_adjustment_entity.h`. Pure.
 */
import { formatCurrency } from "@/domain/pricing";
import { fromDisplayDate, toDisplayDate } from "@/features/sales/quotation/quotation.utils";

/** A cell's number: grouping commas and a leading "+" dropped; anything else is 0. */
export function cellNumber(text: string | number | null | undefined): number {
  if (typeof text === "number") {
    return Number.isFinite(text) ? text : 0;
  }
  const cleaned = (text ?? "").replace(/,/g, "").replace(/\+/g, "").trim();
  if (!cleaned) {
    return 0;
  }
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

/** A quantity as the Qty cell holds it: signed, no trailing zeros, no grouping. */
export function qtyCell(value: number): string {
  if (value === 0 || !Number.isFinite(value)) {
    return "0";
  }
  return value.toFixed(3).replace(/\.?0+$/, "");
}

/** Money, two places, Indian grouping, zero shown. */
export function money(value: number): string {
  return formatCurrency(Number.isFinite(value) ? value : 0, 2, true);
}

export function nearlyZero(value: number): boolean {
  return Math.abs(value) < 0.0000005;
}

/** "1 line" / "3 lines". */
export function linesText(count: number): string {
  return count === 1 ? "1 line" : `${count} lines`;
}

/** The quantity the pick list shows: whole numbers bare, otherwise three places. */
export function pickQtyText(value: number): string {
  return Number.isInteger(value)
    ? formatCurrency(value, 0, true)
    : formatCurrency(value, 3, true);
}

// ── Dates: dd-MM-yyyy on screen, ISO on the wire ──────────────────────────

const ISO_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

/** The screen's dd-MM-yyyy (or an ISO date) to yyyy-MM-dd; "" when it is not a date. */
export function dateToWire(shown: string | null | undefined): string {
  const text = (shown ?? "").trim();
  if (!text) {
    return "";
  }
  // dd-MM-yyyy as the Qt cell takes it (any of - / . as the separator, or the
  // eight digits bare); ISO is the second chance, as in StockAdjustmentCols.
  const fromDisplay = /^\d{2}[-/.]?\d{2}[-/.]?\d{4}$/.test(text) ? fromDisplayDate(text) : null;
  if (fromDisplay) {
    return fromDisplay;
  }
  const iso = ISO_PREFIX.exec(text);
  if (iso && toDisplayDate(iso[1])) {
    return iso[1];
  }
  return "";
}

/** yyyy-MM-dd (or a timestamp) to dd-MM-yyyy; an unreadable value is shown as it came. */
export function dateFromWire(iso: string | null | undefined): string {
  const text = (iso ?? "").trim();
  if (!text) {
    return "";
  }
  const match = ISO_PREFIX.exec(text);
  const shown = match ? toDisplayDate(match[1]) : "";
  return shown || text;
}
