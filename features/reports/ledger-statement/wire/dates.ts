/**
 * Dates stay strings end to end (plan §4.3): ISO `YYYY-MM-DD` on the wire,
 * `dd-MM-yyyy` on screen. The only `Date` built here is a UTC one, and only
 * for day arithmetic, so no timezone can move a day.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** True for a real calendar date in `YYYY-MM-DD` form. */
export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const utc = new Date(Date.UTC(y, m - 1, d));
  return utc.getUTCFullYear() === y && utc.getUTCMonth() === m - 1 && utc.getUTCDate() === d;
}

/** `2026-09-25` (or an ISO timestamp) → `25-09-2026`. Anything else is returned as is. */
export function displayDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const match = ISO_DATE.exec(iso);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : iso;
}

/** First ten characters of an ISO date or timestamp: the day, as the wire means it. */
export function isoDay(value: string | null | undefined): string {
  if (!value) return "";
  const match = ISO_DATE.exec(value);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map((part) => Number(part));
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** `2026-08-01` → `2026-07-31`. */
export function previousDay(iso: string): string {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() - 1);
  return fromUtc(date);
}

/** `2026-09` → `Sep 2026`. */
export function monthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  return `${MONTHS[Number(match[2]) - 1] ?? match[2]} ${match[1]}`;
}

/** `2026-02` → `["2026-02-01", "2026-02-28"]`. */
export function monthBounds(month: string): [string, string] {
  const [y, m] = month.split("-").map((part) => Number(part));
  const last = new Date(Date.UTC(y, m, 0));
  return [`${month}-01`, fromUtc(last)];
}

/** ISO strings order lexically, so clamping needs no `Date`. */
export function clampIso(iso: string, min: string | null, max: string | null): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

/** Today in the browser's own calendar, as `YYYY-MM-DD`. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Is `iso` within the inclusive range? Missing bounds do not constrain. */
export function isWithin(iso: string, min: string | null, max: string | null): boolean {
  return (!min || iso >= min) && (!max || iso <= max);
}
