/**
 * Dates as the operator reads them: `dd/MM/yyyy`, everywhere.
 *
 * One house format for every date the application shows — lists, entry boxes,
 * popups, messages, prints the client builds. A screen never builds one by
 * hand: it calls these, so the separator and the field order live here alone.
 *
 * DISPLAY ONLY. What the server reads, what a sort compares and what a draft
 * holds stays ISO `yyyy-MM-dd` (the `parse…` helpers below turn typed text back
 * into it). Times of day are `lib/time-format.ts`'s 12-hour clock.
 */
import { formatClock12 } from "./time-format";

/** The separator between day, month and year. */
export const DATE_SEPARATOR = "/";

/** What an empty date box shows. */
export const DATE_PLACEHOLDER = "dd/mm/yyyy";

/** The date pattern for format strings (print masks, spreadsheets): `dd/MM/yyyy`. */
export const DATE_PATTERN = "dd/MM/yyyy";

/** What an empty date-and-time box shows. */
export const DATE_TIME_PLACEHOLDER = "dd/mm/yyyy hh:mm AM";

const pad = (value: number): string => String(value).padStart(2, "0");

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** An ISO date with something after it — a time, an offset. */
const ISO_DATE_HEAD = /^(\d{4})-(\d{2})-(\d{2})(?=[T ])/;
/** An ISO timestamp that carries a clock: `yyyy-MM-ddTHH:mm…`. */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

function isRealDay(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || year < 1 || year > 9999) return false;
  const at = new Date(Date.UTC(year, month - 1, day));
  return (
    at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === day
  );
}

function isoOf(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}

/** Day, month and year as `dd/MM/yyyy`. */
export function formatDateParts(day: number, month: number, year: number): string {
  return `${pad(day)}${DATE_SEPARATOR}${pad(month)}${DATE_SEPARATOR}${year}`;
}

/** A `Date`'s LOCAL calendar day as `dd/MM/yyyy`. */
export function formatLocalDate(at: Date): string {
  return formatDateParts(at.getDate(), at.getMonth() + 1, at.getFullYear());
}

/** A `Date`'s local day and clock as `dd/MM/yyyy hh:mm AM`. */
export function formatLocalDateTime(at: Date): string {
  return `${formatLocalDate(at)} ${formatClock12(at)}`;
}

/**
 * `yyyy-MM-dd` — or the date half of a `yyyy-MM-ddT…` timestamp, read as
 * written, with no timezone round-trip — as `dd/MM/yyyy`. Blank when the text
 * does not start with an ISO date.
 *
 * The literal reading matters: `new Date("2026-01-13")` is UTC midnight, which
 * prints as the 12th anywhere west of Greenwich.
 */
export function isoToDisplayDate(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  const match = ISO_DATE.exec(text) ?? ISO_DATE_HEAD.exec(text);
  if (!match) return "";
  return `${match[3]}${DATE_SEPARATOR}${match[2]}${DATE_SEPARATOR}${match[1]}`;
}

/**
 * Any date value as `dd/MM/yyyy`; blank when it is not one.
 *
 * - a bare ISO date `yyyy-MM-dd` is a calendar day, shown as written;
 * - an ISO timestamp or a `Date` is an instant, shown as its LOCAL day;
 * - text already in day-first form (`dd-MM-yyyy`, `dd.MM.yyyy`, `dd/MM/yyyy`)
 *   is re-spelled with the house separator.
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : formatLocalDate(value);
  }
  const text = String(value).trim();
  if (ISO_DATE.test(text)) return isoToDisplayDate(text);
  if (ISO_TIMESTAMP.test(text)) {
    const at = new Date(text);
    return Number.isNaN(at.getTime()) ? isoToDisplayDate(text) : formatLocalDate(at);
  }
  const dayFirst = DAY_FIRST.exec(text);
  if (dayFirst && !dayFirst[4] && dayFirst[3].length === 4) {
    const [day, month, year] = [Number(dayFirst[1]), Number(dayFirst[2]), Number(dayFirst[3])];
    return isRealDay(year, month, day) ? formatDateParts(day, month, year) : "";
  }
  return "";
}

/** {@link formatDate}, but text that is not a date is shown as it came. */
export function formatDateOrRaw(value: string | Date | null | undefined): string {
  const shown = formatDate(value);
  if (shown) return shown;
  if (value === null || value === undefined) return "";
  return value instanceof Date ? "" : String(value);
}

/** An instant (ISO timestamp or `Date`) as the local `dd/MM/yyyy hh:mm AM`; blank when it is not one. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const at = value instanceof Date ? value : new Date(value);
  return Number.isNaN(at.getTime()) ? "" : formatLocalDateTime(at);
}

/** Today's local calendar day, ISO `yyyy-MM-dd`. */
export function todayIsoDate(today: Date = new Date()): string {
  return isoOf(today.getFullYear(), today.getMonth() + 1, today.getDate());
}

// ── Reading what an operator types ─────────────────────────────────────────

/** Day-first with any of `/ - . space` between the parts; an optional tail (a time). */
const DAY_FIRST = /^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{4}|\d{2})(\s.*)?$/;

export type ParseDateOptions = {
  /**
   * Take a two-digit year (`28/10/26`, six bare digits) as 20yy. Off while the
   * operator is still typing — `28/10/20` is on its way to `28/10/2026`, not a
   * date in 2020 — and on when the box is left or Enter is pressed.
   */
  allowShortYear?: boolean;
};

/**
 * What an operator types into a date box, as ISO `yyyy-MM-dd`; null when it is
 * not a real date.
 *
 * Takes the house `dd/MM/yyyy`, any of `-` `.` or a space as the separator,
 * one-digit days and months (`5/1/2026`), eight bare digits (`28102026`) and an
 * ISO date. Two-digit years only with {@link ParseDateOptions.allowShortYear}.
 */
export function parseDisplayDate(
  text: string | null | undefined,
  options: ParseDateOptions = {},
): string | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;

  const iso = ISO_DATE.exec(raw);
  if (iso) {
    const [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    return isRealDay(year, month, day) ? isoOf(year, month, day) : null;
  }

  let day: number;
  let month: number;
  let year: number;
  let yearText: string;
  const parts = DAY_FIRST.exec(raw);
  if (parts && !parts[4]) {
    [day, month, yearText] = [Number(parts[1]), Number(parts[2]), parts[3]];
  } else if (/^\d{8}$/.test(raw)) {
    [day, month, yearText] = [Number(raw.slice(0, 2)), Number(raw.slice(2, 4)), raw.slice(4)];
  } else if (/^\d{6}$/.test(raw)) {
    [day, month, yearText] = [Number(raw.slice(0, 2)), Number(raw.slice(2, 4)), raw.slice(4)];
  } else {
    return null;
  }
  if (yearText.length === 2) {
    if (!options.allowShortYear) return null;
    year = 2000 + Number(yearText);
  } else {
    year = Number(yearText);
  }
  return isRealDay(year, month, day) ? isoOf(year, month, day) : null;
}

/**
 * A server-sent text cell, re-spelled in the house format; anything that is
 * not a date comes back untouched.
 *
 * For values that arrive already formatted — configured grid SQL that writes
 * `to_char(…, 'DD-MM-YYYY')` or `'DD-MM-YYYY HH12:MI AM'` — and for raw ISO
 * dates and timestamps in a cell. A time after a day-first date is kept as it
 * came; an ISO timestamp is shown as the local `dd/MM/yyyy hh:mm AM`, except
 * an exact UTC midnight, which is how a plain `date` column serialises.
 */
export function normalizeDateText(value: string): string {
  const text = value.trim();
  if (!text || text.length > 40 || !/^\d/.test(text)) return value;

  const dayFirst = /^(\d{2})[-.](\d{2})[-.](\d{4})(\s.*)?$/.exec(text);
  if (dayFirst) {
    const [day, month, year] = [Number(dayFirst[1]), Number(dayFirst[2]), Number(dayFirst[3])];
    if (!isRealDay(year, month, day)) return value;
    return `${formatDateParts(day, month, year)}${dayFirst[4] ?? ""}`;
  }
  if (ISO_DATE.test(text)) return isoToDisplayDate(text);
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.0+)?(?:Z|[+-]00:?00)$/.test(text)) {
    return isoToDisplayDate(text);
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(text)) {
    const at = new Date(text);
    return Number.isNaN(at.getTime()) ? value : formatLocalDateTime(at);
  }
  return value;
}

// ── Date and time together (`datetime-local` values) ───────────────────────

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/** A `datetime-local` value `yyyy-MM-ddTHH:mm` as `dd/MM/yyyy hh:mm AM`; blank when it is not one. */
export function formatLocalDateTimeValue(value: string | null | undefined): string {
  const match = LOCAL_DATE_TIME.exec((value ?? "").trim());
  if (!match) return "";
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${formatDateParts(day, month, year)} ${pad(hour12)}:${pad(minute)} ${hour < 12 ? "AM" : "PM"}`;
}

/** A trailing AM / PM marker — `PM`, `pm`, `p.m.`, or just `p`. */
const MERIDIEM = /([ap])\.?\s*(?:m\.?)?\s*$/i;

/**
 * What an operator types into a date-and-time box, as `yyyy-MM-ddTHH:mm`;
 * null when it is not a real instant. Twelve digits `ddMMyyyyhhmm` with any
 * separators, then AM / PM (`a` / `p` will do); with no marker the hour is
 * read on the 24-hour clock.
 */
export function parseDisplayDateTime(text: string | null | undefined): string | null {
  const raw = (text ?? "").trim();
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length !== 12) return null;
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  let hour = Number(digits.slice(8, 10));
  const minute = Number(digits.slice(10, 12));
  const meridiem = MERIDIEM.exec(raw)?.[1]?.toUpperCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === "P" ? 12 : 0);
  }
  if (hour > 23 || minute > 59 || !isRealDay(year, month, day)) return null;
  return `${isoOf(year, month, day)}T${pad(hour)}:${pad(minute)}`;
}
