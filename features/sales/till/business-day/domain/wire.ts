/**
 * The wire of the Business Day screen (menu 274), read against the server's
 * till module (`till.controller.ts`, `services/till-day.service.ts`,
 * `dto/till-session.dto.ts`, `types/till-api.types.ts`):
 *
 *   GET  /till/days/get   ?companyId&branchId[&tbdId&accYear]   → TillDayPayload
 *                         no tbdId = today's business date (now − till.day_cutoff);
 *                         404 when nobody has opened it yet; `safe` = the day's
 *                         safe figures (notes 118)
 *   POST /till/days/open  { companyId, branchId }               → TillDayPayload
 *                         idempotent: an open day comes back as it is
 *   GET  /till/days/close-check ?companyId&branchId&tbdId&accYear → TillDayCloseCheckPayload
 *                         the server's own checklist (notes 117): RED blocks,
 *                         AMBER is shown, canClose / canCloseWithException
 *   POST /till/days/close  { companyId, branchId, accYear, tbdId, notes?, exception? }
 *                         → TillDayClosePayload { day, zNo, tapId, closedOver, forceClosed }
 *                         409 TILL_DAY_CLOSE_BLOCKED when a RED came back since the check
 *   POST /till/days/reopen { companyId, branchId, accYear, tbdId, reasonId, approverPin, notes? }
 *                         → TillDayReopenPayload { day, tapId }
 *   GET  /till/movements/supervisors ?companyId&branchId&accYear&tssId → TillSupervisorPayload[]
 *   GET  /till/denominations/list    ?companyId                        → the cash count's notes and coins
 *   GET  /dropdown-details/run       TILL APPROVER USERS (68), `icompany_id` → the exception's
 *                                    approvers when no session is live (notes 118)
 *
 * Every DTO is whitelisted with forbidNonWhitelisted, so nothing else is sent.
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
import { clock12Of } from "@/lib/time-format";
import { paiseOrZero, toPaise } from "./decimal";

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
  /** Who closed it (`tbdClosedByName`); "" while open. */
  tbdClosedByName: string;
  tbdZNo: string;
  tbdReopenCount: number;
  /** Live, by status: what hangs off the day right now. */
  sessions: { status: string; count: number }[];
  /**
   * Notes 113 — `till.handover_receipt` for the branch: REQUIRED = a hand-over
   * reaches the safe only on a supervisor's Approve Cash; NONE (or anything
   * else, or a server before notes 113) = straight into the safe.
   */
  handoverReceipt: string;
  /** Notes 113 — hand-overs and drops nobody has approved yet (no amount: the receive is blind). */
  awaitingReceipt: AwaitingReceipt;
  /** Notes 118 — the day's safe figures; `null` from a server that does not send them. */
  safe: DaySafe | null;
};

/**
 * Notes 118 — the day's `safe` block, in paise: kept current by every safe
 * count and remittance, frozen at the close. `counted` is null while no safe
 * was counted that day (`expected` is then the safes' expected balance);
 * `opening` is written at the close.
 */
export type DaySafe = {
  opening: bigint;
  /** What the safes should hold — what a count is judged against. */
  expected: bigint;
  counted: bigint | null;
  /** The day's live remittances (sent to bank). */
  remitted: bigint;
};

export type AwaitingReceipt = {
  /** Of this business day. */
  thisDay: number;
  /** Of earlier business days, still unapproved. */
  earlierDays: number;
  /** When the oldest one was handed over (ISO); null when none waits. */
  oldestOn: string | null;
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
    tbdClosedByName: text(data.tbdClosedByName).trim(),
    tbdZNo: text(data.tbdZNo).trim(),
    tbdReopenCount: wholeNumber(data.tbdReopenCount),
    sessions,
    handoverReceipt: text(data.handoverReceipt).trim().toUpperCase(),
    awaitingReceipt: awaitingOf(data.awaitingReceipt),
    safe: daySafeOf(data.safe),
  };
}

/** The `safe` block; `null` when there is none (Qt: an empty object shows nothing). */
function daySafeOf(raw: unknown): DaySafe | null {
  if (!isRecord(raw) || Object.keys(raw).length === 0) return null;
  return {
    opening: paiseOrZero(raw.opening),
    expected: paiseOrZero(raw.expected),
    counted: toPaise(raw.counted),
    remitted: paiseOrZero(raw.remitted),
  };
}

function awaitingOf(raw: unknown): AwaitingReceipt {
  if (!isRecord(raw)) return { thisDay: 0, earlierDays: 0, oldestOn: null };
  const oldest = text(raw.oldestOn).trim();
  return {
    thisDay: Math.max(0, wholeNumber(raw.thisDay)),
    earlierDays: Math.max(0, wholeNumber(raw.earlierDays)),
    oldestOn: oldest || null,
  };
}

// ── The close (notes 117) ─────────────────────────────────────────────────

/** The day's key, as every close route takes it (`TillDayKeyDto`). */
export type DayKey = { companyId: string; branchId: string; accYear: string; tbdId: string };

/** The key of the day shown — the day's own company and branch, the screen's when it lacks them. */
export function dayKeyOf(day: TillDay, scope: Scope): DayKey {
  return {
    companyId: day.tbdCompanyId || scope.companyId,
    branchId: day.tbdBranchId || scope.branchId,
    accYear: day.tbdAccYear.trim(),
    tbdId: day.tbdId,
  };
}

/** RED blocks the close (unless an exception may cover it) · AMBER is shown · GREEN is clear. */
export type CloseCheckTone = "RED" | "AMBER" | "GREEN";

/** One line of the server's close-check (`TillCloseCheckItem`). */
export type CloseCheckItem = {
  /** SESSIONS_LIVE, CASH_TO_APPROVE … — kept as sent (an unknown one shows as itself). */
  code: string;
  tone: CloseCheckTone;
  count: number;
  detail: string;
  /** The sessions behind it, for the jump buttons. */
  sessionIds: string[];
};

/** `TillDayCloseCheckPayload`, as the screen keeps it. */
export type TillCloseCheck = {
  tbdId: string;
  tbdAccYear: string;
  tbdBusinessDate: string;
  tbdStatus: string;
  items: CloseCheckItem[];
  /** The day is open and nothing is RED. */
  canClose: boolean;
  /** Something is RED, and every RED is a live session (SESSIONS_LIVE). */
  canCloseWithException: boolean;
};

function toneOf(value: unknown): CloseCheckTone {
  const tone = text(value).trim().toUpperCase();
  return tone === "RED" || tone === "AMBER" ? tone : "GREEN";
}

/** `GET /till/days/close-check`; `null` when it is not one. */
export function parseCloseCheck(raw: unknown): TillCloseCheck | null {
  const data = unwrap(raw);
  if (!isRecord(data)) return null;
  const tbdId = text(data.tbdId).trim();
  if (!tbdId || !Array.isArray(data.items)) return null;
  return {
    tbdId,
    tbdAccYear: text(data.tbdAccYear).trim(),
    tbdBusinessDate: text(data.tbdBusinessDate).slice(0, 10),
    tbdStatus: text(data.tbdStatus).trim().toUpperCase(),
    items: data.items.filter(isRecord).map((item) => ({
      code: text(item.code).trim().toUpperCase(),
      tone: toneOf(item.tone),
      count: wholeNumber(item.count),
      detail: text(item.detail),
      sessionIds: Array.isArray(item.sessionIds)
        ? item.sessionIds.map((id) => text(id).trim()).filter((id) => id.length > 0)
        : [],
    })),
    canClose: data.canClose === true,
    canCloseWithException: data.canCloseWithException === true,
  };
}

/** The close-check only speaks for the day it was read for. */
export function checkOfDay(check: TillCloseCheck | null, day: TillDay | null): TillCloseCheck | null {
  return check && day && check.tbdId === day.tbdId ? check : null;
}

/** `POST /till/days/close`, as the screen needs it. */
export type DayCloseResult = {
  /** The day as closed; `null` when the body did not carry one. */
  day: TillDay | null;
  /** The store Z, as text; "" when the body did not say. */
  zNo: string;
  /** How many live sessions the exception force-closed; `null` when the body did not say. */
  forcedCount: number | null;
};

export function parseCloseResult(raw: unknown): DayCloseResult {
  const data = unwrap(raw);
  if (!isRecord(data)) return { day: null, zNo: "", forcedCount: null };
  // `{ day, zNo, … }`: the Z is `zNo`, else the day's `tbdZNo` (Qt bec3f98 —
  // no top-level tbdZNo is sent). A bare day is still read, for an older body.
  const day = parseDay(isRecord(data.day) ? data.day : data);
  const zNo = text(data.zNo).trim() || day?.tbdZNo || text(data.tbdZNo).trim();
  return { day, zNo, forcedCount: Array.isArray(data.forceClosed) ? data.forceClosed.length : null };
}

/** `POST /till/days/reopen` → the day, open again (`null` when the body did not carry it). */
export function parseReopenResult(raw: unknown): TillDay | null {
  const data = unwrap(raw);
  if (!isRecord(data)) return null;
  return parseDay(isRecord(data.day) ? data.day : data);
}

/** `GET /till/movements/supervisors` — one who may sign for a session (Till Sessions 273 OVERRIDE). */
export type Supervisor = { userId: string; loginName: string; fullName: string; hasPin: boolean | null };

/** The `data` array of a list answer (or `data.items`); `[]` for anything else. */
export function listOf(raw: unknown): Record<string, unknown>[] {
  const data = unwrap(raw);
  if (Array.isArray(data)) return data.filter(isRecord);
  if (isRecord(data) && Array.isArray(data.items)) return data.items.filter(isRecord);
  return [];
}

export function parseSupervisors(raw: unknown): Supervisor[] {
  return listOf(raw)
    .map((row) => ({
      userId: text(row.userId).trim(),
      loginName: text(row.loginName).trim(),
      fullName: text(row.fullName).trim(),
      hasPin: typeof row.hasPin === "boolean" ? row.hasPin : null,
    }))
    .filter((row) => row.userId.length > 0);
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

/** A refusal's first `errors[]` entry — what Qt's `firstError` reads. */
export type FirstError = {
  status: number | null;
  /** TILL_DAY_CLOSE_BLOCKED, TILL_APPROVER_PIN … — or "". */
  code: string;
  field: string;
  /** The first error's own sentence, else the head, else the fallback. */
  message: string;
};

/** The first `errors[]` entry of the till filter's flat body or the global filter's nested one. */
export function firstErrorOf(error: unknown, fallback: string): FirstError {
  if (!isRecord(error)) return { status: null, code: "", field: "", message: fallback };
  let body: unknown = error.data;
  if (isRecord(body) && isRecord(body.message)) body = body.message;
  const errors = isRecord(body) && Array.isArray(body.errors) ? body.errors.filter(isRecord) : [];
  const first = errors[0] ?? {};
  const headSource = isRecord(body) ? body.message : undefined;
  const message =
    text(first.message).trim() ||
    (typeof headSource === "string" && headSource.trim()) ||
    (typeof error.error === "string" && error.error.trim()) ||
    (typeof error.message === "string" && error.message.trim()) ||
    fallback;
  return {
    status: errorStatus(error),
    code: text(first.code).trim(),
    field: text(first.field).trim(),
    message,
  };
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

/**
 * An ISO instant → the local `hh:mm AM`; "" when it is not one — the Qt
 * `clock`, 12-hour since c77f3f1 (`hh:mm AP`).
 */
export function clockOf(iso: string | null | undefined): string {
  return clock12Of(iso);
}

/** `2026-10-07` → `20261007`, for a file name; "" when it is not a date. */
export function compactDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[1]}${match[2]}${match[3]}` : "";
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
