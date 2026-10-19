/**
 * The Business Day screen's reading of the day — the Qt
 * `TillBusinessDayEntry::showDay / showNoDay / rebuild` (NexERP d5c3637,
 * c77f3f1), as plain functions over what the screen already holds.
 *
 * Since c77f3f1 (notes 117) the checklist is the SERVER's close-check when it
 * could be read — what F10 re-checks — and the screen's own reading of the
 * day's sessions only when it could not, saying so in a grey "Server
 * close-check" row. A drawer still out from an earlier day stays the client's
 * either way (amber beside the server's check, which does not count it against
 * this day; red without it).
 *
 * The safe (Qt bec3f98, notes 118): SAFE_NOT_COUNTED / SAFE_OVER_INSURED come
 * from the close-check; without the first, the day's own safe figures
 * (`days/get` → `safe`) say whether it was counted. "Count safe" / "Remit"
 * open the Cash Office (menu 287) on that tab.
 *
 * Money is summed in paise (`decimal.ts`), never as floats.
 *
 * Since Qt a449b8c the checklist also reads the LIVE sessions
 * (`../../shared/live-cash.ts`): every session of the branch still holding a
 * drawer, ANY date — a day's own list shows only its date, and one opened
 * yesterday is still a drawer to collect.
 *
 * Since Qt 425fa80 (notes 126) the books are checked against the drawers and
 * the safe book (`books.ts`, rows the screen passes in), and the checklist is
 * DRAWN with its green rows folded under one "N checks OK" row
 * (`foldGreenChecks`) — what needs a look stays in view above the sessions.
 */
import { clock12FromHhmm, dayMonthTime12Of } from "@/lib/time-format";
import { TILL_SESSIONS_HREF } from "../../shared/format";
import { liveCashFigure, liveTotalPaise, type LiveSession } from "../../shared/live-cash";
import { formatMoney, formatSignedMoney, paiseOrZero, signOf, toCount, toPaise } from "./decimal";
import {
  clockOf,
  displayDate,
  isoDateOfLocal,
  sessionKeysOf,
  text,
  type CloseCheckItem,
  type GridRow,
  type SessionKeys,
  type TillCloseCheck,
  type TillDay,
} from "./wire";

// ── The head and the facts strip ──────────────────────────────────────────

export type PillTone = "" | "info" | "success" | "warning" | "danger";

export type DayHead = {
  title: string;
  sub: string;
  pill: string;
  pillTone: PillTone;
  facts: {
    status: string;
    opened: string;
    sessions: string;
    storeZ: string;
    cutoff: string;
    reopened: string;
  };
};

export type HeadContext = {
  companyName: string;
  /** The effective `till.day_cutoff` ("04:00"), or null while it is unread. */
  cutoff: string | null;
  /** Another store than the header's (Cash Position's drill, Qt 3b5069d `openOn`): named after the company. */
  branchName?: string;
};

/** `Acme · Zone store` — the branch only when the screen is on another store than the header's. */
function whose(context: HeadContext): string {
  return [context.companyName, context.branchName ?? ""].filter(Boolean).join(" · ");
}

/** What the Cut-off cell shows: the setting's value as a 12-hour clock, or its key as Qt does. */
function cutoffText(cutoff: string | null): string {
  return cutoff && cutoff.trim() ? clock12FromHhmm(cutoff.trim()) : "till.day_cutoff";
}

/** Before anything is read (or a read failed): the .ui file's own placeholders. */
export function blankHead(context: HeadContext): DayHead {
  return {
    title: "Business Day",
    sub: whose(context),
    pill: "",
    pillTone: "",
    facts: { status: "—", opened: "—", sessions: "—", storeZ: "—", cutoff: cutoffText(context.cutoff), reopened: "—" },
  };
}

/** Today has no business day yet (`/till/days/get` answered 404). */
export function noDayHead(businessDate: string, context: HeadContext): DayHead {
  return {
    title: `Business Day  ${displayDate(businessDate)}`,
    sub:
      `${whose(context)} · not opened yet — the first till session opens it (till.day_auto_open), ` +
      "or a manager's Day Open",
    pill: "NOT OPEN",
    pillTone: "",
    facts: {
      status: "NOT OPEN — no session yet",
      opened: "—",
      sessions: "—",
      storeZ: "—",
      cutoff: cutoffText(context.cutoff),
      reopened: "—",
    },
  };
}

export function dayStatusTone(status: string): PillTone {
  if (status === "CLOSED") return "success";
  if (status === "CLOSING") return "warning";
  return "info";
}

/** "10:42 PM by MEENA T" — who closed the day and when, as much as the server said. */
function closedByText(day: TillDay): string {
  const at = clockOf(day.tbdClosedOn);
  const by = day.tbdClosedByName;
  if (at && by) return `${at} by ${by}`;
  return at || (by ? `by ${by}` : "");
}

export function dayStatusText(status: string, day?: TillDay): string {
  if (status === "OPEN") return "OPEN — sessions may open";
  if (status === "CLOSING") return "CLOSING — no new session may open";
  if (status === "CLOSED" && day) {
    const closed = closedByText(day);
    return closed ? `CLOSED ${closed}` : "CLOSED";
  }
  return status;
}

/** `{ total, closed }` over the day's live session counts. */
export function sessionCounts(day: TillDay): { total: number; closed: number } {
  let total = 0;
  let closed = 0;
  for (const entry of day.sessions) {
    total += entry.count;
    if (entry.status === "CLOSED") closed += entry.count;
  }
  return { total, closed };
}

export function dayHead(day: TillDay, context: HeadContext): DayHead {
  const opened = clockOf(day.tbdOpenedOn);
  const { total, closed } = sessionCounts(day);
  return {
    title: `Business Day  ${displayDate(day.tbdBusinessDate)}`,
    sub: `${whose(context)} · opened ${opened}`,
    pill: day.tbdStatus,
    pillTone: dayStatusTone(day.tbdStatus),
    facts: {
      status: dayStatusText(day.tbdStatus, day),
      opened: opened || "—",
      sessions: `${total} · ${closed} closed`,
      storeZ: day.tbdZNo || "issued on close",
      cutoff: cutoffText(context.cutoff),
      reopened: String(day.tbdReopenCount),
    },
  };
}

// ── The checklist, the numbers, the verdict ───────────────────────────────

/** red blocks · amber needs a decision · green is done · info · grey waits for the server. */
export type CheckTone = "red" | "amber" | "green" | "info" | "grey";

export const CHECK_TONE_NAMES: Record<CheckTone, string> = {
  red: "RED",
  amber: "AMBER",
  green: "GREEN",
  info: "INFO",
  grey: "LATER",
};

export type CheckAction = {
  label: string;
  /** The session the button opens; `null` = it opens no session. */
  session: SessionKeys | null;
  /** Where the button goes instead of a session (Till Sessions, the Cash Office); none + no session = off. */
  href?: string;
};

export type Check = { tone: CheckTone; title: string; detail: string; action?: CheckAction };

export type NumberLine = { name: string; value: string; tone: PillTone };
export type NumberSection = { name: string; lines: NumberLine[] };

export type Verdict = { pill: string; tone: PillTone; text: string };

export type DayReading = { checks: Check[]; numbers: NumberSection[]; verdict: Verdict };

/** Which rows the sessions grid has given us so far. */
export type RowsState = { status: "loading" | "ready" | "error"; rows: readonly GridRow[] };

const OPEN_COCKPIT = "Open cockpit  →";

/** The Cash Office (menu 287, notes 118): the safe's count and its remittance to the bank. */
export const CASH_OFFICE_HREF = "/sales/till/cash-office";

export type CashOfficeTab = "count" | "remit";

/** The Cash Office opened on one tab (Qt `requestOpenMenu(287, { tab })`). */
export function cashOfficeHref(tab: CashOfficeTab): string {
  return `${CASH_OFFICE_HREF}?tab=${tab}`;
}

const REMIT: CheckAction = { label: "Remit  →", session: null, href: cashOfficeHref("remit") };
const COUNT_SAFE: CheckAction = { label: "Count safe  →", session: null, href: cashOfficeHref("count") };

/** The server's close-check codes, as the checklist names them (Qt c77f3f1). */
export const CLOSE_CHECK_TITLES: Readonly<Record<string, string>> = {
  SESSIONS_LIVE: "Sessions closed",
  SESSIONS_PENDING_APPROVAL: "Approvals pending",
  CASH_TO_APPROVE: "Cash to approve",
  VARIANCE_UNDECIDED: "Cash differences decided",
  MOVEMENTS_UNPOSTED: "Everything posted",
  SLIP_GAPS: "Slip gaps",
  HELD_BILLS: "Held bills",
  SAFE_OVER_INSURED: "Remittance",
  SAFE_NOT_COUNTED: "Safe counted",
};

/** The codes whose sessions the cockpit settles: their row opens the first one. */
const TO_COCKPIT = new Set(["SESSIONS_LIVE", "SESSIONS_PENDING_APPROVAL", "CASH_TO_APPROVE", "VARIANCE_UNDECIDED"]);

/** "1 session" / "3 sessions" — Qt's `%n session(s)` as an English translation reads it. */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** "C01-261007-02 · MEENA T" — how a session is named in a checklist line. */
function sessionLabel(row: GridRow): string {
  return `${text(row.tss_session_no)} · ${text(row.cashier)}`;
}

/** "C01-261006-01 · RAVI K · ₹ 7,450.00" (or "cash hidden") — a live drawer in a checklist line. */
function liveLabel(session: LiveSession): string {
  return `${session.sessionNo} · ${session.cashier} · ${liveCashFigure(session)}`;
}

/**
 * Qt a449b8c: a drawer still out from an earlier day — live, but not on this
 * day's list. Its cash is in no safe either; the button opens the first one's
 * cockpit. Without the server's check it is red, as a live session of the day
 * would be; beside it (c77f3f1) amber — it does not block THIS day's close.
 * `null` when there is none (or the live read has not answered yet).
 *
 * Only drawers opened BEFORE the day shown (`dayDate`, ISO): looking back at
 * an older day, a till opened on a later day is not that day's business (Qt
 * bec3f98). A session whose date cannot be read stays flagged, as Qt keeps it.
 */
function olderDrawersCheck(
  rows: readonly GridRow[],
  live: readonly LiveSession[],
  dayDate: string,
  tone: CheckTone,
): Check | null {
  const dayIds = new Set(rows.map((row) => text(row.tss_id).trim()));
  const older = live.filter(
    (session) =>
      !dayIds.has(session.key.tssId) && (!dayDate || !session.businessDate || session.businessDate < dayDate),
  );
  if (older.length === 0) return null;
  return {
    tone,
    title: "Drawers still out from an earlier day",
    detail:
      `${plural(older.length, "session")} opened before this day and not closed: ` + older.map(liveLabel).join(", "),
    action: { label: OPEN_COCKPIT, session: older[0].key },
  };
}

/**
 * The safe count (notes 118). Required to close only under
 * `till.day_close_safe_count`: then the close-check says so itself
 * (SAFE_NOT_COUNTED, whatever its tone) and this row is not added. Otherwise
 * the day's own safe figures tell — counted green, not counted amber with the
 * Cash Office's count. `null` without a day, or when the check has the row.
 *
 * A day without a `safe` block (a server before notes 118) reads as not
 * counted, as Qt reads it.
 */
function safeCountedCheck(day: TillDay | null, check: TillCloseCheck | null): Check | null {
  if (!day || check?.items.some((item) => item.code === "SAFE_NOT_COUNTED")) return null;
  const counted = day.safe?.counted ?? null;
  if (counted !== null) {
    return {
      tone: "green",
      title: "Safe counted",
      detail: `Counted ${formatMoney(counted)} today (should hold ${formatMoney(day.safe?.expected ?? BigInt(0))})`,
    };
  }
  return {
    tone: "amber",
    title: "Safe counted",
    detail: "Not counted today (not needed to close the day)",
    action: COUNT_SAFE,
  };
}

/**
 * SAFE · TODAY (notes 118): the day's safe figures — Opening once the day is
 * CLOSED (it is written at the close), Should hold, Counted, Sent to bank.
 * `null` when the server sent no `safe` block.
 */
export function daySafeSection(day: TillDay | null): NumberSection | null {
  const safe = day?.safe;
  if (!day || !safe) return null;
  const lines: NumberLine[] = [];
  if (day.tbdStatus === "CLOSED") lines.push({ name: "Opening", value: formatMoney(safe.opening), tone: "" });
  lines.push({ name: "Should hold", value: formatMoney(safe.expected), tone: "" });
  lines.push({ name: "Counted", value: safe.counted === null ? "not yet" : formatMoney(safe.counted), tone: "" });
  lines.push({ name: "Sent to bank", value: formatMoney(safe.remitted), tone: "" });
  return { name: "SAFE · TODAY", lines };
}

// ── The server's close-check ──────────────────────────────────────────────

/** What the day's close context says, for `readDay`. */
export type CloseContext = {
  /** The day shown: its status, closer, store Z and cash receipts. */
  day: TillDay | null;
  /** The server's close-check of THIS day; `null` = not read (yet, or it failed). */
  check: TillCloseCheck | null;
  /** Why the close-check could not be read; "" when it did not fail. */
  checkError: string;
  /** "Now", for the oldest waiting hand-over (today shows a clock, an earlier day a date). */
  now: Date;
  /**
   * Books = drawers / safe (Qt 425fa80, notes 126 — `books.ts`): after the
   * safe count, before the numbers. They never block; an amber one counts in
   * the verdict as Qt counts it.
   */
  books: readonly Check[];
};

/**
 * A session the close-check names by id: the day's list row when it is there,
 * else enough of one for the cockpit (the day's company, branch and year).
 */
export function sessionKeysById(tssId: string, rows: readonly GridRow[], day: TillDay | null): SessionKeys | null {
  const row = rows.find((candidate) => text(candidate.tss_id).trim() === tssId);
  const keys = sessionKeysOf(row);
  if (keys) return keys;
  if (!day || !tssId) return null;
  return sessionKeysOf({
    tss_id: tssId,
    tss_acc_year: day.tbdAccYear,
    tss_company_id: day.tbdCompanyId,
    tss_branch_id: day.tbdBranchId,
  });
}

/** One server item as a checklist row (Qt c77f3f1 `rebuild`, the server branch). */
function serverCheckRow(item: CloseCheckItem, rows: readonly GridRow[], day: TillDay | null): Check {
  const tone: CheckTone = item.tone === "RED" ? "red" : item.tone === "AMBER" ? "amber" : "green";
  const title = CLOSE_CHECK_TITLES[item.code] ?? item.code;
  if (item.tone !== "GREEN" && TO_COCKPIT.has(item.code) && item.sessionIds.length > 0) {
    return {
      tone,
      title,
      detail: item.detail,
      action: { label: OPEN_COCKPIT, session: sessionKeysById(item.sessionIds[0], rows, day) },
    };
  }
  if (item.tone !== "GREEN" && item.code === "SAFE_OVER_INSURED") {
    return { tone, title, detail: `${item.detail} — raise a remittance`, action: REMIT };
  }
  if (item.tone !== "GREEN" && item.code === "SAFE_NOT_COUNTED") {
    return { tone, title, detail: item.detail, action: COUNT_SAFE };
  }
  return { tone, title, detail: item.detail };
}

/** "3 hand-overs / drops" — Qt's `%n hand-over(s) / drop(s)` as an English translation reads it. */
function handOvers(count: number): string {
  return count === 1 ? "1 hand-over / drop" : `${count} hand-overs / drops`;
}

/**
 * Notes 113 / 114, the client's reading: hand-overs and drops reach the safe
 * only when a supervisor approves the closed session's cash (Till Sessions →
 * Cockpit → Approve Cash); the day says how many still wait. The jump opens the
 * newest row of the day's list still TO APPROVE; one from an earlier day is not
 * on this list, so Till Sessions finds it.
 */
function cashToApproveCheck(day: TillDay | null, rows: readonly GridRow[], now: Date): Check {
  if (day?.handoverReceipt !== "REQUIRED") {
    return {
      tone: "grey",
      title: "Cash to approve",
      detail: "Hand-over receipt is off (till.handover_receipt = NONE): hand-overs go straight to the safe",
    };
  }
  const { thisDay, earlierDays, oldestOn } = day.awaitingReceipt;
  if (thisDay + earlierDays === 0) {
    return { tone: "green", title: "Cash to approve", detail: "Every closed session's cash is approved into the safe" };
  }
  const parts: string[] = [];
  if (thisDay > 0) parts.push(`${thisDay} today`);
  if (earlierDays > 0) parts.push(`${earlierDays} from earlier days`);
  if (oldestOn) {
    const at = new Date(oldestOn);
    const today = !Number.isNaN(at.getTime()) && isoDateOfLocal(at) === isoDateOfLocal(now);
    const when = today ? clockOf(oldestOn) : dayMonthTime12Of(oldestOn);
    if (when) parts.push(`oldest ${when}`);
  }
  let awaiting: GridRow | null = null;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (text(rows[index].cash_receipt).trim().toUpperCase() === "TO APPROVE") {
      awaiting = rows[index];
      break;
    }
  }
  const keys = sessionKeysOf(awaiting);
  return {
    tone: "red",
    title: "Cash to approve",
    detail: `${handOvers(thisDay + earlierDays)} not yet approved by a supervisor: ${parts.join(" · ")}`,
    action: keys
      ? { label: OPEN_COCKPIT, session: keys }
      : { label: "Till Sessions  →", session: null, href: TILL_SESSIONS_HREF },
  };
}

/** The remittance check, from grid 136's balance (movements + counts) and insured limit. */
function remittanceCheck(safes: RowsState): Check {
  if (safes.status === "error") {
    return { tone: "grey", title: "Remittance", detail: "The safes could not be read (MAIN LIST - TILL SAFES)" };
  }
  const over: string[] = [];
  for (const safe of safes.rows) {
    const insured = toPaise(safe.tsf_insured_limit);
    const balance = paiseOrZero(safe.balance);
    if (insured !== null && insured > BigInt(0) && balance > insured) {
      over.push(`${text(safe.tsf_code)} ${formatMoney(balance)} over the insured ${formatMoney(insured)}`);
    }
  }
  if (over.length > 0) {
    return { tone: "amber", title: "Remittance", detail: `${over.join("; ")} — raise a remittance`, action: REMIT };
  }
  return { tone: "green", title: "Remittance", detail: "No safe over its insured limit" };
}

/** A CLOSED day's verdict, whatever its checklist says. */
function closedVerdict(day: TillDay): Verdict {
  const closed = closedByText(day);
  return {
    pill: "CLOSED",
    tone: "success",
    text:
      `Closed${closed ? ` ${closed}` : ""}${day.tbdZNo ? ` — store Z ${day.tbdZNo}` : ""}. ` +
      "Reopen day opens it again (an area manager's PIN).",
  };
}

/** Is `code` RED on the server's check? */
export function isRedOnCheck(check: TillCloseCheck | null, code: string): boolean {
  return check?.items.some((item) => item.code === code && item.tone === "RED") === true;
}

/**
 * The verdict when only what an exception may cover is red: live sessions
 * (Qt's sentence) and, since notes 118, the safe not counted. Qt bec3f98 kept
 * the sessions sentence for both; with only the safe red it would name
 * sessions that are not there, so the safe gets its own.
 */
function exceptionVerdictText(check: TillCloseCheck | null): string {
  const sessions = isRedOnCheck(check, "SESSIONS_LIVE");
  const safe = isRedOnCheck(check, "SAFE_NOT_COUNTED");
  if (safe && !sessions) {
    return (
      "Only the safe count blocks the close. Count the safe on the Cash Office, or Close with exception: " +
      "a store manager approves."
    );
  }
  if (safe) {
    return (
      "Only sessions still open and the safe count block the close. Close them from the cockpit and count the " +
      "safe, or Close with exception: count their drawers there and a store manager approves."
    );
  }
  return (
    "Only sessions still open block the close. Close them from the cockpit, or Close with exception: " +
    "count their drawers there and a store manager approves."
  );
}

/**
 * The verdict band (Qt c77f3f1): a closed day says who closed it; otherwise
 * what is red names itself, and amber / ready say whether F10 has the
 * server's word behind it.
 */
function verdictOf(checks: readonly Check[], context: CloseContext): Verdict {
  if (context.day?.tbdStatus === "CLOSED") return closedVerdict(context.day);
  const serverCheck = context.check !== null;
  const reds = checks.filter((check) => check.tone === "red");
  const ambers = checks.filter((check) => check.tone === "amber").length;
  if (reds.length > 0) {
    const exceptionOnly = serverCheck && context.check?.canCloseWithException === true;
    return {
      pill: `${reds.length} RED`,
      tone: "danger",
      text: exceptionOnly
        ? exceptionVerdictText(context.check)
        : `Blocks the day close: ${reds.map((check) => check.title).join(", ")}. Clear each from its row above.`,
    };
  }
  if (ambers > 0) {
    return {
      pill: `${ambers} AMBER`,
      tone: "warning",
      text: serverCheck
        ? "No red item: F10 closes the day. Look at what is amber first — it is not checked again."
        : "No red item by the screen's own reading — the server's check could not be read, so F10 waits for it.",
    };
  }
  return {
    pill: "READY",
    tone: "success",
    text: serverCheck
      ? "Every session is closed and nothing waits: F10 closes the day."
      : "Nothing waits by the screen's own reading — the server's check could not be read, so F10 waits for it.",
  };
}

/** No business day: one info line and nothing to close. */
export function noDayReading(): DayReading {
  return {
    checks: [
      {
        tone: "info",
        title: "Day not opened",
        detail: "The first till session of the day opens it (till.day_auto_open), or Day Open here.",
      },
    ],
    numbers: [],
    verdict: {
      pill: "NOT OPEN",
      tone: "",
      text: "Nothing to close: today's business day has not been opened yet.",
    },
  };
}

/**
 * The day's checklist, numbers and verdict — Qt `rebuild()`: the server's
 * close-check when `close.check` is in, else the screen's own reading of the
 * sessions grid (150) and the safes grid (136).
 *
 * Until the sessions are read (and without the server's check) the screen
 * says so rather than calling the day READY on an empty list (Qt briefly did,
 * while its grid reloaded); a failed read says that too.
 *
 * `liveSessions` is every live session of the branch, any date (`null` until
 * read): the drawers still out from an earlier day, and "Live now" in the
 * numbers. `dayDate` is the business date shown (ISO), "" when unknown.
 * `close` is the day itself, its close-check and the books' rows (see
 * `CloseContext`).
 */
export function readDay(
  sessions: RowsState,
  safes: RowsState,
  liveSessions: readonly LiveSession[] | null = null,
  dayDate = "",
  close: Partial<CloseContext> = {},
): DayReading {
  const context: CloseContext = {
    day: close.day ?? null,
    check: close.check && close.day && close.check.tbdId !== close.day.tbdId ? null : (close.check ?? null),
    checkError: close.checkError ?? "",
    now: close.now ?? new Date(),
    books: close.books ?? [],
  };
  const dayClosed = context.day?.tbdStatus === "CLOSED";
  if (sessions.status !== "ready" && !context.check) {
    const failed = sessions.status === "error";
    const unread: Verdict = failed
      ? {
          pill: "NOT READ",
          tone: "danger",
          text: "The checklist needs the day's sessions, and they could not be read.",
        }
      : { pill: "…", tone: "", text: "Reading the sessions of the day…" };
    return {
      checks: [
        failed
          ? {
              tone: "grey",
              title: "Sessions closed",
              detail: "The sessions of the day could not be read (TILL DAY SESSIONS) — the list below can try again",
            }
          : { tone: "info", title: "Sessions closed", detail: "Reading the sessions of the day…" },
      ],
      numbers: [],
      verdict: dayClosed && context.day ? closedVerdict(context.day) : unread,
    };
  }

  const rowsRead = sessions.status === "ready";
  const rows = rowsRead ? sessions.rows : [];
  let live = 0;
  let counting = 0;
  let pending = 0;
  let closed = 0;
  let bills = 0;
  let recounts = 0;
  let forced = 0;
  let net = BigInt(0);
  let expected = BigInt(0);
  let counted = BigInt(0);
  let variance = BigInt(0);
  let firstLive: GridRow | null = null;
  let firstPending: GridRow | null = null;
  const liveNames: string[] = [];
  const pendingNames: string[] = [];

  for (const row of rows) {
    const status = text(row.tss_status).trim().toUpperCase();
    if (status === "OPEN" || status === "SUSPENDED") {
      live += 1;
      liveNames.push(sessionLabel(row));
      firstLive ??= row;
    } else if (status === "COUNTING") {
      counting += 1;
      liveNames.push(`${sessionLabel(row)} (counting)`);
      firstLive ??= row;
    } else if (status === "PENDING_APPROVAL") {
      pending += 1;
      pendingNames.push(sessionLabel(row));
      firstPending ??= row;
    } else if (status === "CLOSED") {
      closed += 1;
      expected += paiseOrZero(row.cash_expected);
      counted += paiseOrZero(row.cash_counted);
      variance += paiseOrZero(row.cash_variance);
      net += paiseOrZero(row.net_sales);
    }
    bills += toCount(row.bills);
    const flags = text(row.flags);
    if (flags.includes("RECOUNT")) recounts += 1;
    if (flags.includes("FORCE CLOSED")) forced += 1;
  }

  // ── Checklist ──────────────────────────────────────────────────────────
  // The server's close-check when it could be read — what F10 re-checks;
  // else the screen's own reading of the day's sessions, saying so.
  const checks: Check[] = [];
  const serverCheck = context.check !== null;
  if (context.check) {
    for (const item of context.check.items) checks.push(serverCheckRow(item, rows, context.day));
  } else if (live > 0) {
    checks.push({
      tone: "red",
      title: "Sessions closed",
      detail: `${plural(live + counting, "session")} still billing or being counted: ${liveNames.join(", ")}`,
      action: { label: OPEN_COCKPIT, session: sessionKeysOf(firstLive) },
    });
  } else if (counting > 0) {
    checks.push({
      tone: "amber",
      title: "Sessions closed",
      detail: `${plural(counting, "session")} counted but not closed: ${liveNames.join(", ")}`,
      action: { label: OPEN_COCKPIT, session: sessionKeysOf(firstLive) },
    });
  } else {
    checks.push({
      tone: "green",
      title: "Sessions closed",
      detail: rows.length === 0 ? "No till session today" : `All ${plural(rows.length, "session")} closed`,
    });
  }
  if (!serverCheck) {
    if (pending > 0) {
      checks.push({
        tone: "amber",
        title: "Approvals pending",
        detail: `${plural(pending, "session")} wait for an approver: ${pendingNames.join(", ")}`,
        action: { label: OPEN_COCKPIT, session: sessionKeysOf(firstPending) },
      });
    } else {
      checks.push({ tone: "green", title: "Approvals pending", detail: "None waiting" });
    }
    checks.push(remittanceCheck(safes));
    checks.push(cashToApproveCheck(context.day, rows, context.now));
    if (context.checkError) {
      checks.push({
        tone: "grey",
        title: "Server close-check",
        detail: `Could not be read (${context.checkError}) — this list is the screen's own reading of the sessions`,
      });
    }
  }
  // Only once the day's own list is in: before it, every live drawer would look older.
  const older = rowsRead ? olderDrawersCheck(rows, liveSessions ?? [], dayDate, serverCheck ? "amber" : "red") : null;
  if (older) checks.push(older);
  const safeCounted = safeCountedCheck(context.day, context.check);
  if (safeCounted) checks.push(safeCounted);
  checks.push(...context.books);

  if (!rowsRead) return { checks, numbers: [], verdict: verdictOf(checks, context) };

  // ── The day in numbers ─────────────────────────────────────────────────
  const varianceSign = signOf(variance);
  const numbers: NumberSection[] = [
    {
      name: "SALES",
      lines: [
        { name: "Bills", value: String(bills), tone: "" },
        { name: "Net sales (closed sessions)", value: formatMoney(net), tone: "" },
      ],
    },
    {
      name: "CASH IN TILLS",
      lines: [
        // Qt a449b8c: what every drawer still out should hold now, the server's
        // figure (a session whose cash is hidden adds nothing).
        ...(liveSessions && liveSessions.length > 0
          ? [
              {
                name: `Live now (${plural(liveSessions.length, "session")}, any day)`,
                value: formatMoney(BigInt(liveTotalPaise(liveSessions))),
                tone: "info" as const,
              },
            ]
          : []),
        { name: `Expected (${closed} closed)`, value: formatMoney(expected), tone: "" },
        { name: "Counted", value: formatMoney(counted), tone: "" },
        {
          name: "Variance",
          value: formatSignedMoney(variance),
          tone: varianceSign < 0 ? "danger" : varianceSign > 0 ? "success" : "",
        },
      ],
    },
  ];
  if (safes.status === "ready") {
    for (const safe of safes.rows) {
      const insured = toPaise(safe.tsf_insured_limit);
      numbers.push({
        name: `SAFE · ${text(safe.tsf_code)}`,
        lines: [
          { name: "Balance (movements + counts)", value: formatMoney(paiseOrZero(safe.balance)), tone: "" },
          {
            name: "Insured limit",
            value: insured !== null && insured > BigInt(0) ? formatMoney(insured) : "none",
            tone: "",
          },
        ],
      });
    }
  }
  // The day's safe figures (notes 118): kept current by every count and remittance, frozen at the close.
  const daySafe = daySafeSection(context.day);
  if (daySafe) numbers.push(daySafe);
  numbers.push({
    name: "EXCEPTIONS",
    lines: [
      { name: "Pending approvals", value: String(pending), tone: pending ? "warning" : "" },
      { name: "Recounts", value: String(recounts), tone: recounts ? "warning" : "" },
      { name: "Force closes", value: String(forced), tone: forced ? "warning" : "" },
    ],
  });

  return { checks, numbers, verdict: verdictOf(checks, context) };
}

/** The checklist as Qt's test prints it: `TONE title — detail`. */
export function checkLines(checks: readonly Check[]): string[] {
  return checks.map((check) => `${CHECK_TONE_NAMES[check.tone]} ${check.title} — ${check.detail}`);
}

// ── The checklist as drawn: green folded ──────────────────────────────────

/** The "N checks OK" row: its title, its detail (the green titles), and the rows it holds. */
export type GreenFold = { title: string; detail: string; greens: Check[] };

export type FoldedChecks = { rows: Check[]; fold: GreenFold | null };

/**
 * The checklist as it is drawn (Qt 425fa80 `addCheck` / `foldGreen`): a
 * green row needs no action, so every green row goes under ONE "N checks OK"
 * row — its detail their titles joined " · " — that Show opens; every other
 * row stays above it, in order, and the sessions grid keeps its height. No
 * green row, no fold. Only the drawing folds: the verdict counts every row.
 */
export function foldGreenChecks(checks: readonly Check[]): FoldedChecks {
  const rows = checks.filter((check) => check.tone !== "green");
  const greens = checks.filter((check) => check.tone === "green");
  if (greens.length === 0) return { rows, fold: null };
  return {
    rows,
    fold: {
      title: `${plural(greens.length, "check")} OK`,
      detail: greens.map((check) => check.title).join(" · "),
      greens,
    },
  };
}

/** The fold's button: two spaces before the arrow, as every check button. */
export function greenFoldLabel(open: boolean): string {
  return open ? "Hide  ▴" : "Show  ▾";
}
