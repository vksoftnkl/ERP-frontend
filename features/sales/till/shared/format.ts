/**
 * The small readers and writers every till screen shares: a grid row's text
 * and flags, the session's clock and dates, a session-key route, the event
 * colours of the till journal.
 */
import type { GridRow, TillSessionKey } from "./wire/types";

// ─── row readers ─────────────────────────────────────────────────────────────

/** A field as text: strings as sent, numbers and booleans spelled, null blank. */
export function textOf(row: Record<string, unknown> | null | undefined, key: string): string {
  const value = row?.[key];
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

/** A Postgres flag as the grid runner sends it: true, "true", "t", "1". */
export function flagOf(row: Record<string, unknown> | null | undefined, key: string): boolean {
  const value = row?.[key];
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "t" || text === "1";
}

/** A count as a whole number (grid counts arrive as strings). */
export function intOf(row: Record<string, unknown> | null | undefined, key: string): number {
  const parsed = Number.parseInt(textOf(row, key), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Rows oldest first on a timestamp field. The runner drops the grid SQL's own
 * ORDER BY, so the order is put back here; the original order breaks ties.
 */
export function sortRowsBy(rows: readonly GridRow[], key: string): GridRow[] {
  return rows
    .map((row, index) => ({ row, index, at: Date.parse(textOf(row, key)) }))
    .sort((a, b) => {
      const left = Number.isNaN(a.at) ? Number.POSITIVE_INFINITY : a.at;
      const right = Number.isNaN(b.at) ? Number.POSITIVE_INFINITY : b.at;
      return left === right ? a.index - b.index : left - right;
    })
    .map((entry) => entry.row);
}

// ─── dates ───────────────────────────────────────────────────────────────────

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Today in the browser's own calendar, `yyyy-MM-dd`. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `yyyy-MM-dd` moved by whole days. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((part) => Number.parseInt(part, 10));
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d + days);
  return todayIso(date);
}

/** `2026-10-09…` → `09-10-2026`; anything else as it came. */
export function ddmmyyyy(iso: string | null | undefined): string {
  const text = (iso ?? "").slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : (iso ?? "");
}

/** An ISO instant as the local `HH:mm`; blank when it is not one. */
export function clockOf(iso: string | null | undefined): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** `opened → ended (or now)` as `7 h 12 m`. */
export function durationText(fromIso: string | null | undefined, toIso: string | null | undefined, now: Date): string {
  const from = fromIso ? Date.parse(fromIso) : Number.NaN;
  if (Number.isNaN(from)) return "—";
  const to = toIso ? Date.parse(toIso) : Number.NaN;
  const end = Number.isNaN(to) ? now.getTime() : to;
  const minutes = Math.max(0, Math.floor((end - from) / 60000));
  return `${Math.floor(minutes / 60)} h ${minutes % 60} m`;
}

// ─── the cockpit route ───────────────────────────────────────────────────────

export const OPEN_TILL_HREF = "/sales/till/open";
export const TILL_SESSIONS_HREF = "/sales/till/sessions";

/**
 * One session's cockpit, addressed by its whole key — the shape the Business
 * Day screen links to: `/sales/till/sessions/<company>/<branch>/<year>/<id>`.
 */
export function cockpitHref(key: TillSessionKey): string {
  return [TILL_SESSIONS_HREF, key.companyId, key.branchId, key.accYear, key.tssId]
    .map((part, index) => (index === 0 ? part : encodeURIComponent(part)))
    .join("/");
}

// ─── the journal's colours (Qt txn_doc_types_till eventStyles) ───────────────

export type TillTone = "green" | "amber" | "red" | "blue" | "grey";

const EVENT_TONES: Record<string, TillTone> = {};
for (const code of ["SESSION_OPEN", "SESSION_CLOSE", "SESSION_RESUME", "DAY_OPEN", "CASH_UNBLOCK", "SETTLEMENT_POSTED"]) {
  EVENT_TONES[code] = "green";
}
for (const code of [
  "CASH_ALERT",
  "SESSION_SUSPEND",
  "SESSION_END_BILLING",
  "SESSION_COUNT",
  "SESSION_RECOUNT",
  "NO_SALE",
  "DRAWER_OPEN_SALE",
  "SLIP_CHECK",
  "SYNC_PENDING_AT_CLOSE",
  "LATE_ARRIVAL",
  "SESSION_IDLE_LOCK",
  "REPRINT",
]) {
  EVENT_TONES[code] = "amber";
}
for (const code of [
  "CASH_BLOCK",
  "MOVEMENT_VOIDED",
  "APPROVAL_REQUESTED",
  "DRAWER_LEFT_OPEN",
  "PIN_FAIL",
  "DUPLICATE_REF_BLOCKED",
  "NONCASH_WRITTEN_OFF",
  "MONEY_DOC_CANCELLED",
]) {
  EVENT_TONES[code] = "red";
}
for (const code of [
  "MOVEMENT_POSTED",
  "VARIANCE_DECIDED",
  "RECEIPT_POSTED",
  "PAYMENT_POSTED",
  "EXPENSE_POSTED",
  "SETTLEMENT_IMPORTED",
  "RETENDER",
]) {
  EVENT_TONES[code] = "blue";
}

/** A `till_event` code's colour; an unknown code is grey and shown as sent. */
export function eventTone(code: string): TillTone {
  return EVENT_TONES[code.trim().toUpperCase()] ?? "grey";
}

/** A session status's colour, as the Sessions list and the cockpit draw it. */
export function statusTone(status: string): TillTone {
  switch (status.trim().toUpperCase().replace(/ /g, "_")) {
    case "CLOSED":
      return "green";
    case "OPEN":
      return "blue";
    case "COUNTING":
    case "PENDING_APPROVAL":
      return "amber";
    case "VOIDED":
      return "red";
    default:
      return "grey";
  }
}
