/**
 * Numbers, dates and the freeze window's wall-clock instants — how the Qt
 * screen reads and paints them, as pure functions.
 */
import { formatCurrency } from "@/domain/pricing";
import type { WireNumber } from "./physical-stock.types";

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/** A wire decimal as a number; null when absent or not a number at all. */
export function toNumberOrNull(value: WireNumber): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const text = value.replace(/,/g, "").trim();
  if (!text) {
    return null;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The value a Qt Number cell keeps: `QString::number(v, 'g', 13)`, read back.
 * Thirteen significant digits is what stops `0.1 + 0.2` from surfacing as a
 * variance of 0.30000000000000004.
 */
export function g13(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toPrecision(13));
}

/** Two decimals, as a Currency cell stores what it shows. */
export function round2(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const scaled = Math.round(Math.abs(value) * 100 + Number.EPSILON) / 100;
  return value < 0 ? -scaled : scaled;
}

/**
 * A Number cell's text. ZERO PAINTS BLANK — NexTable's rule for every Number
 * column, so a holding the book says is empty shows no book figure, and a line
 * that agreed shows no difference.
 */
export function formatNumberCell(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value === 0) {
    return "";
  }
  return String(g13(value));
}

/** A Currency cell: Indian grouping, two decimals. Absent is blank, zero is "0.00". */
export function formatCurrencyCell(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "";
  }
  return formatCurrency(value, 2, true);
}

function grouped(value: number, decimals: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** The totals bar's Net Variance Qty — `QLocale::toString(netQty, 'f', 3)`. */
export function formatNetQty(value: number): string {
  return grouped(value, 3);
}

/** The totals bar's Net Variance Value — `QLocale::toString(netValue, 'f', 2)`. */
export function formatNetValue(value: number): string {
  return grouped(value, 2);
}

/**
 * What a Counted Qty cell will take: the delegate's
 * `QDoubleValidator(0, 999999999, 3)`. Never negative — a SHORTAGE is counted
 * as fewer than the book, not typed as minus three. Returns null for a
 * keystroke the validator would have refused, so the cell keeps its text.
 */
export function sanitizeCountedInput(text: string): string | null {
  const trimmed = text.replace(/\s+/g, "");
  if (trimmed === "") {
    return "";
  }
  return /^\d{0,9}(\.\d{0,3})?$/.test(trimmed) ? trimmed : null;
}

/** `cellNumber()` — a typed count as a number. Blank reads as 0, so test blank first. */
export function parseCounted(text: string): number {
  const parsed = Number(text.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The date half of whatever the wire carried; "" for nothing. */
export function isoDateOf(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text) {
    return "";
  }
  const head = text.slice(0, 10);
  return ISO_DATE.test(head) ? head : text;
}

/** `dd-MM-yyyy` — the grid's date format. Anything unparseable is shown as it came. */
export function displayDate(value: string): string {
  const match = ISO_DATE.exec((value ?? "").trim());
  if (!match) {
    return value ?? "";
  }
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** A Date as the local wall clock, `yyyy-mm-ddTHH:mm`. */
export function toLocalDateTime(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/** The inverse — null when it is not a real local instant. */
export function parseLocalDateTime(value: string): Date | null {
  const match = LOCAL_DATE_TIME.exec((value ?? "").trim());
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }
  return date;
}

export function addHoursLocal(value: string, hours: number): string {
  const date = parseLocalDateTime(value);
  if (!date) {
    return "";
  }
  return toLocalDateTime(new Date(date.getTime() + hours * 60 * 60 * 1000));
}

/** `dd-MM-yyyy HH:mm` — the freeze fields' display format. */
export function displayDateTime(value: string): string {
  const match = LOCAL_DATE_TIME.exec((value ?? "").trim());
  if (!match) {
    return "";
  }
  return `${match[3]}-${match[2]}-${match[1]} ${match[4]}:${match[5]}`;
}

/**
 * What an operator types into a freeze field, tolerant of the separator:
 * twelve digits, `ddMMyyyyHHmm`. Null when it is not a real instant.
 */
export function fromDisplayDateTime(text: string): string | null {
  const digits = (text ?? "").replace(/[^0-9]/g, "");
  if (digits.length !== 12) {
    return null;
  }
  const local =
    `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}` +
    `T${digits.slice(8, 10)}:${digits.slice(10, 12)}`;
  return parseLocalDateTime(local) ? local : null;
}

/**
 * A local wall-clock instant as the wire wants it: ISO WITH ITS OFFSET. The
 * freeze guard compares the window to the server's `now()`, so an instant
 * without an offset would be read in the server's zone, not the counter's.
 */
export function toWireInstant(value: string): string {
  const date = parseLocalDateTime(value);
  if (!date) {
    return "";
  }
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  return `${toLocalDateTime(date)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** A wire instant back onto the local wall clock; "" when there is none. */
export function fromWireInstant(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text) {
    return "";
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : toLocalDateTime(parsed);
}
