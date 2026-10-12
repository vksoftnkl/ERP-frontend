/**
 * The Business Day screen's own reading of the day — the Qt
 * `TillBusinessDayEntry::showDay / showNoDay / rebuild` (NexERP d5c3637), as
 * plain functions over the rows the screen already holds.
 *
 * The checklist is the CLIENT's reading, and says so: the server has no
 * close-check, no Close day, no Close with exception, no Reopen and no day X /
 * store Z print yet (README "Not in phase 1": phase 4), and no cash office
 * (bag verification, safe count: phase 5). Those rows are grey — "LATER" — and
 * the buttons that would do them are off with that reason.
 *
 * Money is summed in paise (`decimal.ts`), never as floats.
 */
import { formatMoney, formatSignedMoney, paiseOrZero, signOf, toCount, toPaise } from "./decimal";
import { clockOf, displayDate, sessionKeysOf, text, type GridRow, type SessionKeys, type TillDay } from "./wire";

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
};

/** What the Cut-off cell shows: the setting's value, or its key as Qt does. */
function cutoffText(cutoff: string | null): string {
  return cutoff && cutoff.trim() ? cutoff.trim() : "till.day_cutoff";
}

/** Before anything is read (or a read failed): the .ui file's own placeholders. */
export function blankHead(context: HeadContext): DayHead {
  return {
    title: "Business Day",
    sub: context.companyName,
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
      `${context.companyName} · not opened yet — the first till session opens it (till.day_auto_open), ` +
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

export function dayStatusText(status: string): string {
  if (status === "OPEN") return "OPEN — sessions may open";
  if (status === "CLOSING") return "CLOSING — no new session may open";
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
    sub: `${context.companyName} · opened ${opened}`,
    pill: day.tbdStatus,
    pillTone: dayStatusTone(day.tbdStatus),
    facts: {
      status: dayStatusText(day.tbdStatus),
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
  /** The session the button opens; `null` = nothing on the server to do it yet. */
  session: SessionKeys | null;
};

export type Check = { tone: CheckTone; title: string; detail: string; action?: CheckAction };

export type NumberLine = { name: string; value: string; tone: PillTone };
export type NumberSection = { name: string; lines: NumberLine[] };

export type Verdict = { pill: string; tone: PillTone; text: string };

export type DayReading = { checks: Check[]; numbers: NumberSection[]; verdict: Verdict };

/** Which rows the sessions grid has given us so far. */
export type RowsState = { status: "loading" | "ready" | "error"; rows: readonly GridRow[] };

export const NOT_ON_SERVER = "Not on the server yet";

const OPEN_COCKPIT = "Open cockpit  →";

/** "1 session" / "3 sessions" — Qt's `%n session(s)` as an English translation reads it. */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** "C01-261007-02 · MEENA T" — how a session is named in a checklist line. */
function sessionLabel(row: GridRow): string {
  return `${text(row.tss_session_no)} · ${text(row.cashier)}`;
}

/** The two rows every day carries until the server has their routes. */
function laterChecks(): Check[] {
  return [
    {
      tone: "grey",
      title: "Drop bags verified · safe counted",
      detail: "The cash office (S9: bag verification, safe count) is not on the server yet",
    },
    {
      tone: "grey",
      title: "Server close-check",
      detail: "GET /till/days/close-check is not built — this list is the screen's own reading of the sessions",
    },
  ];
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
    return {
      tone: "amber",
      title: "Remittance",
      detail: `${over.join("; ")} — raise a remittance`,
      action: { label: "Remit  →", session: null },
    };
  }
  return { tone: "green", title: "Remittance", detail: "No safe over its insured limit" };
}

function verdictOf(checks: readonly Check[]): Verdict {
  const reds = checks.filter((check) => check.tone === "red").length;
  const ambers = checks.filter((check) => check.tone === "amber").length;
  if (reds > 0) {
    return {
      pill: `${reds} RED`,
      tone: "danger",
      text:
        "A live session nobody counted blocks the day close — end its shift and count it (End Shift) or have the " +
        "cash office count it from the cockpit.",
    };
  }
  if (ambers > 0) {
    return {
      pill: `${ambers} AMBER`,
      tone: "warning",
      text: "No red item. Decide what is amber — or, when the server has it, close with an exception over what is left.",
    };
  }
  return {
    pill: "READY",
    tone: "success",
    text: "Every session is closed and nothing waits. The day can be closed as soon as the server's Day Close is built.",
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
 * The day's checklist, numbers and verdict from the sessions grid (150) and
 * the safes grid (136) — Qt `rebuild()`.
 *
 * Until the sessions are read the screen says so rather than calling the day
 * READY on an empty list (Qt briefly did, while its grid reloaded); a failed
 * read says that too.
 */
export function readDay(sessions: RowsState, safes: RowsState): DayReading {
  if (sessions.status !== "ready") {
    const failed = sessions.status === "error";
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
      verdict: failed
        ? {
            pill: "NOT READ",
            tone: "danger",
            text: "The checklist needs the day's sessions, and they could not be read.",
          }
        : { pill: "…", tone: "", text: "Reading the sessions of the day…" },
    };
  }

  const rows = sessions.rows;
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
  const checks: Check[] = [];
  if (live > 0) {
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
  if (pending > 0) {
    checks.push({
      tone: "amber",
      title: "Approvals pending",
      detail:
        `${plural(pending, "session")} wait for an approver: ${pendingNames.join(", ")} — ` +
        "the approval gate is phase 3",
      action: { label: OPEN_COCKPIT, session: sessionKeysOf(firstPending) },
    });
  } else {
    checks.push({ tone: "green", title: "Approvals pending", detail: "None waiting" });
  }
  checks.push(remittanceCheck(safes));
  checks.push(...laterChecks());

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
  numbers.push({
    name: "EXCEPTIONS",
    lines: [
      { name: "Pending approvals", value: String(pending), tone: pending ? "warning" : "" },
      { name: "Recounts", value: String(recounts), tone: recounts ? "warning" : "" },
      { name: "Force closes", value: String(forced), tone: forced ? "warning" : "" },
    ],
  });

  return { checks, numbers, verdict: verdictOf(checks) };
}

/** The checklist as Qt's test prints it: `TONE title — detail`. */
export function checkLines(checks: readonly Check[]): string[] {
  return checks.map((check) => `${CHECK_TONE_NAMES[check.tone]} ${check.title} — ${check.detail}`);
}
