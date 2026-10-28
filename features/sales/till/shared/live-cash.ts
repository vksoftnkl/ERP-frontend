/**
 * Live cash — Qt `TillLiveCash` (NexERP a449b8c) without the label: every
 * session of the header company · branch still holding a drawer (OPEN,
 * SUSPENDED, COUNTING, PENDING_APPROVAL — ANY date: one opened yesterday is
 * still a drawer to collect), each with the cash it should hold now.
 *
 *   "● 2 live sessions · cash in tills ₹ 7,450.00"
 *
 * The sessions are grid 144 "MAIN LIST - TILL SESSIONS", read once per live
 * status with the date tokens BLANK — the grid's own `NULLIF('ifrom_date', '')
 * IS NULL` means no date bound — and every token always sent (a quoted token
 * left unsent stays a literal word and filters to nothing; `session-list.ts`).
 *
 * The cash is the server's own figure (GET /till/sessions/expected, D4: the
 * client never computes it), so it needs Till Sessions (273) OVERRIDE. A
 * session the user may not see is still live, its cash "hidden" — a refusal
 * is an answer here, never an error box.
 *
 * Shown on Till Sessions (273) and Business Day (274). Everything below is
 * pure; `use-live-cash.ts` holds the state and `live-cash-line.tsx` draws it.
 */
import type { TillSessionClient } from "./api/till-session-api";
import { CASH_TENDER_TYPE_ID } from "./denom";
import { textOf } from "./format";
import { formatMoney, toPaise } from "./money";
import type { GridRow, TillSessionKey, TillSessionPayload } from "./wire/types";

/** The statuses a drawer is still out in, in the order the line lists them. */
export const LIVE_STATUSES = ["OPEN", "SUSPENDED", "COUNTING", "PENDING_APPROVAL"] as const;

export type LiveScope = { companyId: string; branchId: string };

export type LiveSession = {
  /** The row's own key; `accYear` is the session's year, not today's. */
  key: TillSessionKey;
  sessionNo: string;
  counter: string;
  cashier: string;
  status: string;
  /** The session's business date, ISO (grid 144 sends DD-MM-YYYY); "" when unreadable. */
  businessDate: string;
  /** The server's expected cash, in paise; null = hidden (no 273 OVERRIDE, or not sent). */
  cashPaise: number | null;
};

/** Grid 144 for one live status, every date: all six tokens, the dates blank. */
export function liveGridParams(scope: LiveScope, status: string): Record<string, string> {
  return {
    icompany_id: scope.companyId,
    ibranch_id: scope.branchId,
    ifrom_date: "",
    ito_date: "",
    istatus: status,
    ivariance: "",
  };
}

/** "13-10-2026" → "2026-10-13"; anything else → "". */
function isoOfDisplayDate(value: string): string {
  const match = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(value.trim());
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

/**
 * The rows of the per-status reads, as live sessions with their cash not yet
 * asked for. A session that moved status between two of the reads (OPEN →
 * SUSPENDED while they were on the wire) can come back twice; it is one
 * drawer, so the first one counts.
 */
export function liveSessionsOf(rows: readonly GridRow[], scope: LiveScope): LiveSession[] {
  const seen = new Set<string>();
  const sessions: LiveSession[] = [];
  for (const row of rows) {
    const tssId = textOf(row, "tss_id").trim();
    if (!tssId || seen.has(tssId)) continue;
    seen.add(tssId);
    sessions.push({
      key: {
        companyId: textOf(row, "tss_company_id").trim() || scope.companyId,
        branchId: textOf(row, "tss_branch_id").trim() || scope.branchId,
        accYear: textOf(row, "tss_acc_year").trim(),
        tssId,
      },
      sessionNo: textOf(row, "tss_session_no"),
      counter: textOf(row, "counter_code"),
      cashier: textOf(row, "cashier"),
      status: textOf(row, "tss_status"),
      businessDate: isoOfDisplayDate(textOf(row, "business_date")),
      cashPaise: null,
    });
  }
  return sessions;
}

/**
 * The cash a session should hold now: its CASH tender's `expected` (type 1, or
 * named CASH). Null when there is no cash line or the server left it out —
 * the line then says "cash hidden" rather than a zero it does not know.
 */
export function cashExpectedOf(payload: Pick<TillSessionPayload, "tenders"> | null | undefined): number | null {
  const tenders = Array.isArray(payload?.tenders) ? payload.tenders : [];
  const cash = tenders.find(
    (tender) =>
      Number(tender?.tenderTypeId) === CASH_TENDER_TYPE_ID ||
      String(tender?.tenderTypeName ?? "").trim().toUpperCase() === "CASH",
  );
  return cash ? toPaise(cash.expected) : null;
}

/** The cash in every till the server showed, in paise; hidden ones add nothing. */
export function liveTotalPaise(sessions: readonly LiveSession[]): number {
  let total = 0;
  for (const session of sessions) total += session.cashPaise ?? 0;
  return total;
}

/** tss_id → expected cash (paise), the sessions whose cash is known only. */
export function liveCashByTss(sessions: readonly LiveSession[]): ReadonlyMap<string, number> {
  const cash = new Map<string, number>();
  for (const session of sessions) {
    if (session.cashPaise !== null) cash.set(session.key.tssId, session.cashPaise);
  }
  return cash;
}

/** `₹ 7,450.00`, or `cash hidden`. */
export function liveCashFigure(session: LiveSession): string {
  return session.cashPaise === null ? "cash hidden" : `₹ ${formatMoney(session.cashPaise)}`;
}

/** Qt's `%n live session(s)` as the English translation reads it. */
function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

export type LiveLine = { text: string; title: string };

/** Before the first read of the branch has answered (Qt's constructor text). */
export const LIVE_LINE_READING = "Live sessions…";

/**
 * What the line says, and its tooltip: one session per line,
 * `session · cashier · STATUS · ₹ x` (`cash hidden` when the server would not
 * show it). `null` sessions = not read yet.
 */
export function liveLine(sessions: readonly LiveSession[] | null): LiveLine {
  if (sessions === null) return { text: LIVE_LINE_READING, title: "" };
  if (sessions.length === 0) return { text: "No live session", title: "No drawer is out at this branch." };
  let hidden = 0;
  const lines: string[] = [];
  for (const session of sessions) {
    if (session.cashPaise === null) hidden += 1;
    lines.push(
      [session.sessionNo, session.cashier, session.status.replace(/_/g, " "), liveCashFigure(session)].join(" · "),
    );
  }
  let text = `● ${count(sessions.length, "live session")} · cash in tills ₹ ${formatMoney(liveTotalPaise(sessions))}`;
  // Two spaces, as Qt: the aside reads apart from the figure.
  if (hidden > 0) text += `  (${hidden} not shown — needs Till Sessions override)`;
  return { text, title: lines.join("\n") };
}

// ─── the read ───────────────────────────────────────────────────────────────

export type LiveCashReader = Pick<TillSessionClient, "gridRows" | "expected">;

/**
 * Every live session of the scope and its cash: grid 144 once per live status
 * (in parallel), then `/sessions/expected` for each one found, on the
 * session's OWN year — a drawer opened before the year end still belongs to
 * the old one.
 *
 * Nothing here throws. A status whose read fails adds no row (Qt's `done()` on
 * error); a refused expected read leaves that session's cash hidden (a 403 is
 * "not this user's to see"). `isCurrent` is asked between the two rounds: a
 * read the caller has since superseded stops there and answers `null`.
 */
export async function readLiveCash(
  reader: LiveCashReader,
  scope: LiveScope,
  isCurrent: () => boolean = () => true,
): Promise<LiveSession[] | null> {
  const perStatus = await Promise.all(
    LIVE_STATUSES.map((status) =>
      reader.gridRows("tillSessionList", liveGridParams(scope, status)).catch(() => [] as GridRow[]),
    ),
  );
  if (!isCurrent()) return null;
  const sessions = liveSessionsOf(perStatus.flat(), scope);
  const cash = await Promise.all(
    sessions.map((session) =>
      reader
        .expected({ ...scope, accYear: session.key.accYear, tssId: session.key.tssId })
        .then(cashExpectedOf)
        .catch(() => null),
    ),
  );
  if (!isCurrent()) return null;
  return sessions.map((session, index) => ({ ...session, cashPaise: cash[index] }));
}
