/**
 * Cell rendering for configured dropdowns, by `dropdown_columns_data_type`.
 *
 * Two rules hold for every branch below:
 *
 *  - **Read the value as a string first.** The API quotes numerics, so a `Number`
 *    column arrives as `"1234.50"` as often as `1234.5`.
 *  - **Never throw, never blank.** An unparseable date renders as the text that was
 *    sent. A row that shows something odd is diagnosable; a row that shows nothing
 *    is reported as "the dropdown is broken".
 *
 * Pure: no React, no locale detection beyond the fixed `en-IN` grouping the rest of
 * the app formats numbers with.
 */
import type { DropdownDataType } from "./types";

const GROUPED_INTEGER = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const GROUPED_DECIMAL = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Whatever came out of the JSON, as display text. Never throws. */
export function toRawText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }
  if (typeof value === "object") {
    // An object in a cell is a configuration mistake, not something to stringify
    // into the popup.
    return "";
  }
  return String(value);
}

function parseNumber(raw: string): number | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}[T ](\d{2}):(\d{2})/;

type DateParts = { day: number; month: number; year: number; hour: number; minute: number };

/**
 * Date parts, without a timezone round-trip.
 *
 * `new Date("2026-01-13")` is parsed as UTC midnight and prints as the 12th
 * anywhere west of Greenwich, so an ISO date is read straight out of the string
 * instead. Only values that are not ISO at all fall through to `Date.parse`.
 *
 * The same literal reading applies to `DateTime`, so a trailing `Z` is displayed
 * as the wall clock the server sent rather than converted to the viewer's zone —
 * matching the Qt widget, and keeping a `Date` column and a `DateTime` column over
 * the same field from disagreeing about which day it is. Every column configured
 * in this deployment is `Text` today, so nothing depends on it yet; revisit here,
 * for both types together, if a timestamp column is ever configured.
 */
function parseDateParts(raw: string): DateParts | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const isoDate = ISO_DATE.exec(text);
  if (isoDate) {
    const year = Number(isoDate[1]);
    const month = Number(isoDate[2]);
    const day = Number(isoDate[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }
    const isoTime = ISO_TIME.exec(text);
    return {
      day,
      month,
      year,
      hour: isoTime ? Number(isoTime[1]) : 0,
      minute: isoTime ? Number(isoTime[2]) : 0,
    };
  }
  const parsed = new Date(text);
  const time = parsed.getTime();
  if (Number.isNaN(time)) {
    return null;
  }
  return {
    day: parsed.getDate(),
    month: parsed.getMonth() + 1,
    year: parsed.getFullYear(),
    hour: parsed.getHours(),
    minute: parsed.getMinutes(),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDate(parts: DateParts): string {
  return `${pad(parts.day)}/${pad(parts.month)}/${parts.year}`;
}

function formatDateTime(parts: DateParts): string {
  const meridiem = parts.hour >= 12 ? "PM" : "AM";
  const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  return `${formatDate(parts)} ${pad(hour12)}:${pad(parts.minute)} ${meridiem}`;
}

/** One cell, formatted for its configured data type. */
export function formatDropdownValue(value: unknown, dataType: DropdownDataType): string {
  const raw = toRawText(value);
  if (!raw.trim()) {
    return "";
  }
  switch (dataType) {
    case "NumberTS": {
      const parsed = parseNumber(raw);
      return parsed === null ? raw : GROUPED_INTEGER.format(parsed);
    }
    case "NumericTS": {
      const parsed = parseNumber(raw);
      return parsed === null ? raw : GROUPED_DECIMAL.format(parsed);
    }
    case "Number": {
      const parsed = parseNumber(raw);
      return parsed === null ? raw : String(parsed);
    }
    case "Date": {
      const parts = parseDateParts(raw);
      return parts ? formatDate(parts) : raw;
    }
    case "DateTime": {
      const parts = parseDateParts(raw);
      return parts ? formatDateTime(parts) : raw;
    }
    default:
      return raw;
  }
}
