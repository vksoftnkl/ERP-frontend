/**
 * The wire of the Business Day screen (menu 274), read against the server's
 * till module (`till.controller.ts`, `services/till-day.service.ts`,
 * `dto/till-session.dto.ts`, `types/till-api.types.ts`):
 *
 *   GET  /till/days/get   ?companyId&branchId[&tbdId&accYear]   → TillDayPayload
 *                         no tbdId = today's business date (now − till.day_cutoff);
 *                         404 when nobody has opened it yet
 *   POST /till/days/open  { companyId, branchId }               → TillDayPayload
 *                         idempotent: an open day comes back as it is
 *
 * Both DTOs are whitelisted with forbidNonWhitelisted, so nothing else is sent.
 * A refusal is the till module's own body (till-exception.filter.ts):
 * `{ success:false, message, errors:[{ field, message, code? }] }` — flat, not
 * the global filter's nested `message.message`; both are read.
 *
 * The grids are run through `/configured-grid-sql/run` by name:
 *   TILL DAY SESSIONS (150)              'icompany_id' 'ibranch_id' 'ifrom_date' 'ito_date' 'istatus' 'ivariance'
 *   MAIN LIST - TILL BUSINESS DAYS (149) 'icompany_id' 'ibranch_id' 'ifrom_date' 'ito_date'
 *   MAIN LIST - TILL SAFES (136)         'icompany_id' 'ibranch_id' ('iinactive' unsent = active only, as Qt)
 * Every token is QUOTED in the SQL, so an unsent one stays a literal and
 * silently filters to nothing — the builders below always send all of them.
 */

export type DayStatus = "OPEN" | "CLOSING" | "CLOSED";

/** `TillDayPayload`, as the screen keeps it. */
export type TillDay = {
  tbdId: string;
  tbdAccYear: string;
  tbdCompanyId: string;
  tbdBranchId: string;
  /** `YYYY-MM-DD`. */
  tbdBusinessDate: string;
  /** The server's word, kept as sent (an unknown one shows as itself). */
  tbdStatus: string;
  tbdOpenedOn: string;
  tbdOpenedBy: string;
  tbdClosedOn: string | null;
  tbdZNo: string;
  tbdReopenCount: number;
  /** Live, by status: what hangs off the day right now. */
  sessions: { status: string; count: number }[];
};

export type GridRow = Record<string, unknown>;

export type GridPage = { items: GridRow[]; total: number | null };

/** The keys a session row opens its cockpit with. */
export type SessionKeys = { companyId: string; branchId: string; accYear: string; tssId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A cell as text: `null` / `undefined` → `""`, everything else as it prints. */
export function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

function wholeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && /^\s*-?\d+\s*$/.test(value)) return Number.parseInt(value, 10);
  return 0;
}

/** The `data` of a success body, or the body itself when it is not wrapped. */
function unwrap(raw: unknown): unknown {
  if (isRecord(raw) && "data" in raw && (raw.success === true || raw.success === undefined)) return raw.data;
  return raw;
}

/** `TillDayPayload` from `/till/days/get` or `/till/days/open`; `null` when it is not one. */
export function parseDay(raw: unknown): TillDay | null {
  const data = unwrap(raw);
  if (!isRecord(data)) return null;
  const tbdId = text(data.tbdId).trim();
  const businessDate = text(data.tbdBusinessDate).slice(0, 10);
  if (!tbdId || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) return null;
  const sessions = Array.isArray(data.sessions)
    ? data.sessions.filter(isRecord).map((entry) => ({
        status: text(entry.status).trim().toUpperCase(),
        count: wholeNumber(entry.count),
      }))
    : [];
  return {
    tbdId,
    tbdAccYear: text(data.tbdAccYear).trim(),
    tbdCompanyId: text(data.tbdCompanyId),
    tbdBranchId: text(data.tbdBranchId),
    tbdBusinessDate: businessDate,
    tbdStatus: text(data.tbdStatus).trim().toUpperCase(),
    tbdOpenedOn: text(data.tbdOpenedOn),
    tbdOpenedBy: text(data.tbdOpenedBy),
    tbdClosedOn: data.tbdClosedOn === null || data.tbdClosedOn === undefined ? null : text(data.tbdClosedOn),
    tbdZNo: text(data.tbdZNo).trim(),
    tbdReopenCount: wholeNumber(data.tbdReopenCount),
    sessions,
  };
}

/** One `/configured-grid-sql/run` page: `{ data: { items, meta: { total } } }`. */
export function parseGridPage(raw: unknown): GridPage {
  const data = unwrap(raw);
  const items = isRecord(data) && Array.isArray(data.items) ? data.items.filter(isRecord) : [];
  const meta = isRecord(data) && isRecord(data.meta) ? data.meta : null;
  const total = meta ? wholeNumber(meta.total) : null;
  return { items, total: meta && meta.total !== null && meta.total !== undefined ? total : null };
}

// ── Grid tokens ───────────────────────────────────────────────────────────

export type Scope = { companyId: string; branchId: string };

/** The sessions of one business date — every token, "" for "any". */
export function sessionGridParams(scope: Scope, businessDate: string): Record<string, string> {
  return {
    icompany_id: scope.companyId,
    ibranch_id: scope.branchId,
    ifrom_date: businessDate,
    ito_date: businessDate,
    istatus: "",
    ivariance: "",
  };
}

/** The List tab: the branch's business days of the last 90 days (Qt's window). */
export const DAYS_LIST_WINDOW = 90;

export function daysGridParams(scope: Scope, today: string): Record<string, string> {
  return {
    icompany_id: scope.companyId,
    ibranch_id: scope.branchId,
    ifrom_date: addDaysIso(today, -DAYS_LIST_WINDOW),
    ito_date: today,
  };
}

export function safesGridParams(scope: Scope): Record<string, string> {
  return { icompany_id: scope.companyId, ibranch_id: scope.branchId };
}

/** The `/till/days/get` query — the id only with its year (the server refuses one alone). */
export function dayQuery(scope: Scope, pick?: { tbdId: string; accYear: string } | null): Record<string, string> {
  const query: Record<string, string> = { companyId: scope.companyId, branchId: scope.branchId };
  if (pick && pick.tbdId) {
    query.tbdId = pick.tbdId;
    query.accYear = pick.accYear.trim();
  }
  return query;
}

// ── Rows ──────────────────────────────────────────────────────────────────

/** A TILL DAY SESSIONS row's own keys, or `null` when it lacks one. */
export function sessionKeysOf(row: GridRow | null | undefined): SessionKeys | null {
  if (!row) return null;
  const keys = {
    companyId: text(row.tss_company_id).trim(),
    branchId: text(row.tss_branch_id).trim(),
    accYear: text(row.tss_acc_year).trim(),
    tssId: text(row.tss_id).trim(),
  };
  return keys.companyId && keys.branchId && keys.accYear && keys.tssId ? keys : null;
}

/**
 * Where the Qt screen opened `TillSessionCockpit` over itself, the web
 * navigates to the session's own route, each key URL-encoded.
 */
export function cockpitHref(keys: SessionKeys): string {
  const part = encodeURIComponent;
  return `/sales/till/sessions/${part(keys.companyId)}/${part(keys.branchId)}/${part(keys.accYear)}/${part(keys.tssId)}`;
}

/** A MAIN LIST - TILL BUSINESS DAYS row → the day it opens. */
export function dayPickOf(row: GridRow | null | undefined): { tbdId: string; accYear: string } | null {
  if (!row) return null;
  const tbdId = text(row.tbd_id).trim();
  const accYear = text(row.tbd_acc_year).trim();
  return tbdId && accYear ? { tbdId, accYear } : null;
}

// ── Errors ────────────────────────────────────────────────────────────────

/** The HTTP status of an RTK Query error, or `null`. */
export function errorStatus(error: unknown): number | null {
  if (!isRecord(error)) return null;
  const status = error.status;
  if (typeof status === "number") return status;
  if (isRecord(error.data) && typeof error.data.statusCode === "number") return error.data.statusCode;
  return null;
}

/**
 * The sentence for a refusal: the field lines (they say what to do — "Run
 * SELECT public.ensure_acc_year_partitions(…)"), under the head when the head
 * adds something. Reads the till filter's flat body and the global filter's
 * nested one.
 */
export function tillDayErrorText(error: unknown, fallback: string): string {
  if (!isRecord(error)) return fallback;
  let body: unknown = error.data;
  if (isRecord(body) && isRecord(body.message)) body = body.message;
  const lines: string[] = [];
  if (isRecord(body) && Array.isArray(body.errors)) {
    for (const entry of body.errors) {
      const message = isRecord(entry) ? text(entry.message).trim() : "";
      if (message && !lines.includes(message)) lines.push(message);
    }
  }
  const headSource = isRecord(body) ? body.message : undefined;
  const head =
    (typeof headSource === "string" && headSource.trim()) ||
    (typeof error.error === "string" && error.error.trim()) ||
    (typeof error.message === "string" && error.message.trim()) ||
    fallback;
  if (lines.length === 0) return head;
  if (lines.length === 1 && (lines[0] === head || lines[0].endsWith(head))) return lines[0];
  return `${head}\n${lines.join("\n")}`;
}

// ── Dates ─────────────────────────────────────────────────────────────────

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** A local `Date` as `YYYY-MM-DD`. */
export function isoDateOfLocal(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `YYYY-MM-DD` ± whole days, on the calendar (no time zone involved). */
export function addDaysIso(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** `2026-10-07` → `07-10-2026`; anything else as it came. */
export function displayDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : iso;
}

/** An ISO instant → local `HH:mm`; "" when it is not one (the Qt `clock`). */
export function clockOf(iso: string): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** The server's default when the setting is unread (`till.settings.ts`). */
export const DEFAULT_DAY_CUTOFF = "04:00";

/**
 * The business date at `now`: the calendar date less the cut-off, so 00:40
 * under a 04:00 cut-off is still yesterday — what the server's
 * `businessDateNow` works out (in the database's zone, which is the
 * counter's). A cut-off that is not `HH:MM` reads as the default.
 */
export function businessDateAt(now: Date, cutoff: string | null | undefined): string {
  const match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(cutoff ?? "") ?? /^(\d{1,2}):(\d{2})$/.exec(DEFAULT_DAY_CUTOFF);
  const hours = match ? Number.parseInt(match[1], 10) : 4;
  const minutes = match ? Number.parseInt(match[2], 10) : 0;
  const shifted = new Date(now.getTime());
  shifted.setHours(shifted.getHours() - hours, shifted.getMinutes() - minutes);
  return isoDateOfLocal(shifted);
}
