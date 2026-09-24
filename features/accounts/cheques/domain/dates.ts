/**
 * Calendar arithmetic on `yyyy-mm-dd` strings.
 *
 * ISO dates compare correctly as strings, so every "before / after" on this
 * screen is a string comparison and nothing here builds a local `Date` that a
 * timezone could shift by a day. Month and year steps clamp to the last day of
 * the target month (31 March − 1 month = 28/29 February), which is what
 * PostgreSQL's `interval '3 months'` does on the server.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string | null | undefined): value is string {
  const match = ISO.exec(value ?? "");
  if (!match) {
    return false;
  }
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function addMonths(value: string, months: number): string {
  const match = ISO.exec(value);
  if (!match) {
    return "";
  }
  const [, y, m, d] = match.map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(Math.min(d, lastDay))}`;
}

export function addYears(value: string, years: number): string {
  return addMonths(value, years * 12);
}

/**
 * The accounting year's own bounds. `2026-2027` → 1 April 2026 to 31 March
 * 2027, unless the business context supplied real bounds (a company whose
 * year does not start in April).
 */
export function accountingYearBounds(
  accYear: string,
  beginDate?: string | null,
  endDate?: string | null,
): { start: string; end: string } | null {
  const begin = (beginDate ?? "").slice(0, 10);
  const end = (endDate ?? "").slice(0, 10);
  if (isIsoDate(begin) && isIsoDate(end)) {
    return { start: begin, end };
  }
  const match = /^(\d{4})\s*-\s*(\d{4})$/.exec(accYear.trim());
  if (!match) {
    return null;
  }
  return { start: `${match[1]}-04-01`, end: `${match[2]}-03-31` };
}

/**
 * The default window of the register: the WHOLE of the accounting year the
 * screen was opened in, measured on the instrument date.
 *
 * Not a month: an accountant hunting "that cheque from Mr Rao" has no idea
 * which month it was in. And not the calendar year the Qt screen used — a
 * cheque received in March 2027 belongs to 2026-2027, and a January-to-January
 * window hides it.
 *
 * The margins are the widest dates a cheque RECEIVED in this year can carry,
 * by `ck_apd_dates`: up to three months before the day it was received (older
 * is stale) and up to a year after (post-dated). So the default hides nothing
 * that belongs to the year.
 */
export function defaultDateRange(
  accYear: string,
  beginDate?: string | null,
  endDate?: string | null,
): { from: string; to: string } {
  const bounds = accountingYearBounds(accYear, beginDate, endDate);
  if (!bounds) {
    return { from: "", to: "" };
  }
  return { from: addMonths(bounds.start, -3), to: addYears(bounds.end, 1) };
}
