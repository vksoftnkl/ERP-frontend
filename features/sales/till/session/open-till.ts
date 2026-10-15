/**
 * Open Till (S1, menu 272) — everything Qt `TillOpenSessionDialog` decides,
 * without the widgets: which counter, which float, what the count says, the
 * live-session panel, why Open (Ctrl+Enter) would refuse, and the body it would post.
 * Since Qt c77f3f1 the panel also says when the live session waits for its
 * approver (the screen re-reads every 15 s) and when it belongs to an earlier
 * business date (Resume refuses).
 *
 * One read, `GET /till/sessions/open-check`, says everything: whether this
 * device needs a session at all, the business day, the counter (linked, or the
 * free ones to pick from), a session this device already holds and this
 * user's session on another device. The open itself is `POST
 * /till/sessions/open`, which re-checks all of it.
 *
 * The float is ISSUED (out of the safe, a TFlt voucher) or CARRIED (what the
 * previous close on the counter left). The drawer is counted by denomination;
 * counted ≠ issued opens anyway and posts a FLOAT_MISMATCH variance under the
 * reason picked.
 */
import { countLines, countedPaise, type DenomCountValue, type Denomination } from "../shared/denom";
import { clockOf, ddmmyyyy } from "../shared/format";
import { formatMoney, formatSignedMoney, paiseOf, paiseToNumber } from "../shared/money";
import type { TillOpenBody } from "../shared/api/till-session-api";
import type { TillReason } from "../shared/reasons";
import type {
  TillCarriedFrom,
  TillOpenCheck,
  TillOpenCheckCounter,
  TillOpenCheckSession,
  TillSessionPayload,
} from "../shared/wire/types";

export type FloatChoice = "ISSUED" | "CARRIED";

/** What the open screen holds while the cashier fills it. */
export type OpenTillForm = {
  /** The counter picked from the free list ("" = none yet). */
  pickedCounterId: string;
  floatChoice: FloatChoice;
  /** The Issued box, as typed. */
  issuedPaise: number;
  count: DenomCountValue;
  reasonId: string;
};

export type OpenTillInputs = {
  /** The last open-check answer; null before it lands or when it failed. */
  check: TillOpenCheck | null;
  /** The refusal open-check answered with ("" = none). */
  checkError: string;
  form: OpenTillForm;
  denominations: readonly Denomination[];
  reasons: readonly TillReason[];
  /** The signed-in user. */
  me: string;
};

// ─── the counter ─────────────────────────────────────────────────────────────

/**
 * The counter being opened: the linked one, else the one picked — and when
 * exactly one counter is free, that one (Qt pre-selects it).
 */
export function chosenCounterId(check: TillOpenCheck | null, picked: string): string {
  if (!check) return "";
  if (check.linkedCounter) return check.linkedCounter.counterId;
  const free = check.freeCounters ?? [];
  if (free.length === 1) return free[0].counterId;
  return free.some((c) => c.counterId === picked) ? picked : "";
}

export function chosenCounter(check: TillOpenCheck | null, picked: string): TillOpenCheckCounter | null {
  if (!check) return null;
  if (check.linkedCounter) return check.linkedCounter;
  const id = chosenCounterId(check, picked);
  return (check.freeCounters ?? []).find((c) => c.counterId === id) ?? null;
}

/**
 * The float to carry: open-check fills the top-level `carriedFrom` only when
 * it was asked with a counterId (or for the linked counter); every free
 * counter carries its own as well — so the one pre-selected free counter still
 * offers it.
 */
export function carriedFromOf(check: TillOpenCheck | null, picked: string): TillCarriedFrom | null {
  if (!check) return null;
  return check.carriedFrom ?? chosenCounter(check, picked)?.carriedFrom ?? null;
}

/** The counter line in the facts: linked text, "none free", or a pick list. */
export function counterDisplay(check: TillOpenCheck | null):
  | { kind: "text"; text: string }
  | { kind: "pick"; options: { value: string; label: string }[]; placeholder: string } {
  if (!check) return { kind: "text", text: "—" };
  const linked = check.linkedCounter;
  if (linked) return { kind: "text", text: `${linked.code} · ${linked.name}  (this device)` };
  const free = check.freeCounters ?? [];
  if (free.length === 0) return { kind: "text", text: "none free" };
  return {
    kind: "pick",
    options: free.map((c) => ({ value: c.counterId, label: `${c.code} · ${c.name}` })),
    placeholder: free.length === 1 ? "" : "Pick a counter",
  };
}

export function dayText(check: TillOpenCheck | null): string {
  const day = check?.businessDay;
  if (!day) return "—";
  if (day.status) return day.status;
  return day.autoOpen ? "opens with this session" : "NOT OPEN";
}

export function businessDateText(check: TillOpenCheck | null): string {
  return check?.businessDay?.date ? ddmmyyyy(check.businessDay.date) : "—";
}

// ─── the live panel ──────────────────────────────────────────────────────────

export type LivePanel = {
  session: TillOpenCheckSession;
  onThisDevice: boolean;
  ownSession: boolean;
  status: string;
  /** Its own cashier, on this device, still taking money (OPEN / SUSPENDED). */
  resumable: boolean;
  counting: boolean;
  title: string;
  head: string;
  text: string;
  /** "warning" when the text says why this drawer is stuck (waiting for an approver, the day ended). */
  textTone: "" | "warning";
  /**
   * Its own cashier's session here, PENDING_APPROVAL (Qt c77f3f1): it holds
   * the drawer until a supervisor decides, so the screen looks again every
   * `WAIT_POLL_MS` to show the decision without a logout.
   */
  waitsForApprover: boolean;
  note: string;
  showResume: boolean;
  showForceClose: boolean;
  showEndShift: boolean;
  endShiftEnabled: boolean;
  endShiftLabel: string;
  showCashMovement: boolean;
  cashMovementEnabled: boolean;
  /** The Till menu's Suspend (Qt TillMenu line 8), placed here: the own OPEN session. */
  showSuspend: boolean;
  /**
   * The session whose supervisor pickups / top-ups the panel lists (Qt
   * 2026-10-12): this cashier's own, on this device — else none.
   */
  supervisorMovesTssId: string | null;
};

/**
 * The live panel. `liveDate` is the live session's business date as
 * `/sessions/get` answered it (`liveDateOf`; "" until it has): a session of an
 * earlier business date bills no more, and the text says so while Resume is
 * offered.
 */
export function livePanelOf(check: TillOpenCheck | null, me: string, liveDate = ""): LivePanel | null {
  const mine = check?.deviceSession ?? null;
  const elsewhere = check?.userSessionElsewhere ?? null;
  const session = mine ?? elsewhere;
  if (!session) return null;
  const onThisDevice = mine !== null;
  const ownSession = session.operatorId === me;
  const status = session.status ?? "";
  const resumable = onThisDevice && ownSession && (status === "OPEN" || status === "SUSPENDED");
  const counting = status === "COUNTING";
  const waitsForApprover = onThisDevice && ownSession && status === "PENDING_APPROVAL";

  let text: string;
  let textTone: LivePanel["textTone"] = "";
  if (!onThisDevice) {
    text =
      `You have session ${session.sessionNo} open on ${session.deviceName || "another device"}. ` +
      "Close it there first — a cashier holds one drawer at a time.";
  } else if (!ownSession) {
    text =
      `Counter ${session.counterCode} is in use by ${session.operatorName}. ` +
      "A supervisor must force-close it before a new session opens here.";
  } else if (counting) {
    text = "Billing has ended and the drawer waits for its count. Continue count opens End Shift.";
  } else if (waitsForApprover) {
    text = pendingApprovalText(session.sessionNo);
    textTone = "warning";
  } else if (!resumable) {
    text = `The session is ${status}: it waits for an approver, so it cannot take money again.`;
  } else {
    text = "The app was closed without ending the shift. The session and its drawer are still yours.";
  }
  // A session of an earlier business date bills no more (TILL_SESSION_DAY_ENDED):
  // say so before the cashier resumes into a bill the server refuses.
  const ended = resumable ? dayEndedText(check, liveDate) : "";
  if (ended) {
    text = ended;
    textTone = "warning";
  }

  return {
    session,
    onThisDevice,
    ownSession,
    status,
    resumable,
    counting,
    title: onThisDevice ? "Live session on this device" : "Your session on another device",
    head: `${session.sessionNo}  ·  ${session.operatorName}  ·  opened ${clockOf(session.openedOn)}  ·  ${status}`,
    text,
    textTone,
    waitsForApprover,
    note:
      onThisDevice && ownSession
        ? `Another cashier at this device sees: “Counter ${session.counterCode} has ${session.operatorName}'s live ` +
          "session — a supervisor must force-close it” (TILL_COUNTER_BUSY)."
        : "",
    showResume: onThisDevice,
    showForceClose: onThisDevice,
    showEndShift: onThisDevice && ownSession,
    endShiftEnabled: resumable || counting,
    endShiftLabel: counting ? "Continue count" : "End shift",
    showCashMovement: onThisDevice && ownSession,
    cashMovementEnabled: resumable,
    showSuspend: onThisDevice && ownSession && status === "OPEN",
    supervisorMovesTssId: onThisDevice && ownSession ? session.sessionId : null,
  };
}

export function pendingApprovalText(sessionNo: string): string {
  return (
    `The count of session ${sessionNo} did not match, so it waits for a supervisor. It holds this drawer until ` +
    "then — no new session opens here.\n\nAsk a supervisor to approve it (or send it for a recount) in Till " +
    "Sessions → Cockpit. This screen checks every 15 seconds: once decided, Continue count closes the session and " +
    "you can open a new one — no need to log out."
  );
}

// ─── waiting for an approver ─────────────────────────────────────────────────

/** How often Open Till looks again at a session waiting for its approver (Qt `m_waitPoll`). */
export const WAIT_POLL_MS = 15_000;

/**
 * Whether the next look is due: a session waiting for its approver, on a
 * screen the cashier can see, with nothing posting and no End shift / Cash
 * movement dialog over it. The timer is single-shot, armed again by each
 * answer that still shows the wait (Qt: `m_waitPoll->start()` in showLivePanel).
 */
export function waitPollDue(
  panel: LivePanel | null,
  state: { visible: boolean; busy: boolean; dialogOpen: boolean },
): boolean {
  return Boolean(panel?.waitsForApprover) && state.visible && !state.busy && !state.dialogOpen;
}

// ─── the live session's business date ───────────────────────────────────────

/** A live date asked for that came back blank: unknown — the server judges on Resume. */
export const LIVE_DATE_UNKNOWN = "?";

/** The live session's business date from `/sessions/get`, `yyyy-MM-dd` ("" when it sent none). */
export function liveDateOf(payload: Pick<TillSessionPayload, "tssBusinessDate"> | null | undefined): string {
  return (payload?.tssBusinessDate ?? "").slice(0, 10);
}

/**
 * Empty while the live session belongs to today's business date (or its date
 * is not known yet); otherwise why it cannot bill and what to do (Qt
 * `dayEndedText`).
 */
export function dayEndedText(check: TillOpenCheck | null, liveDate: string): string {
  const today = (check?.businessDay?.date ?? "").slice(0, 10);
  if (!liveDate || liveDate === LIVE_DATE_UNKNOWN || !today || liveDate === today) return "";
  return (
    `Session ${check?.deviceSession?.sessionNo ?? ""} belongs to business date ${ddmmyyyy(liveDate)} — today is ` +
    `${ddmmyyyy(today)}. It cannot take bills any more.\n\nEnd shift: count the drawer and close it, then open ` +
    "a session for today."
  );
}

/**
 * What Resume does (Qt `resumeSession`):
 *   none      — nothing here to resume
 *   readDate  — the live panel's `/sessions/get` has not answered: read the
 *               business date first (blank → `LIVE_DATE_UNKNOWN`), then decide again
 *   dayEnded  — an earlier business date: refuse, with the text as a warning
 *   adopt     — OPEN: nothing to tell the server, the session is this app's again
 *   resume    — SUSPENDED: `POST /till/sessions/resume`
 */
export type ResumePlan =
  | { kind: "none" }
  | { kind: "readDate" }
  | { kind: "dayEnded"; text: string }
  | { kind: "adopt" }
  | { kind: "resume" };

export function resumePlan(check: TillOpenCheck | null, me: string, liveDate: string): ResumePlan {
  const session = check?.deviceSession ?? null;
  if (!session || !livePanelOf(check, me)?.resumable) return { kind: "none" };
  if (!liveDate) return { kind: "readDate" };
  const ended = dayEndedText(check, liveDate);
  if (ended) return { kind: "dayEnded", text: ended };
  return session.status === "SUSPENDED" ? { kind: "resume" } : { kind: "adopt" };
}

/** The live session's facts from `/sessions/get`: bills, float, the cash gauge. */
export function liveFacts(payload: TillSessionPayload | null): { bills: string; float: string; gauge: string; gaugeWarn: boolean } {
  if (!payload) return { bills: "—", float: "—", gauge: "—", gaugeWarn: false };
  const limit = payload.cashLimit;
  let gauge = "—";
  let gaugeWarn = false;
  if (limit) {
    gauge = gaugeText(limit.gauge, limit.state);
    gaugeWarn = limit.state !== "NORMAL";
  }
  return {
    bills: String(payload.totals?.billCount ?? 0),
    float: formatMoney(paiseOf(payload.tssFloatIssued)),
    gauge,
    gaugeWarn,
  };
}

/** `●●○○  pickup due` — quarters of the alert limit, never the figure. */
export function gaugeText(gauge: number | null, state: string): string {
  const dots = gauge === null || gauge === undefined ? 0 : Math.max(0, Math.min(4, Math.trunc(gauge)));
  let text = "●".repeat(dots) + "○".repeat(4 - dots);
  if (state === "ALERT") text += "  pickup due";
  else if (state === "BLOCKED") text += "  billing blocked";
  return text;
}

// ─── the float and the count ─────────────────────────────────────────────────

/** Carried only when there is something to carry and nothing live in the way. */
export function isCarried(inputs: OpenTillInputs): boolean {
  return (
    inputs.form.floatChoice === "CARRIED" &&
    carriedFromOf(inputs.check, inputs.form.pickedCounterId) !== null &&
    livePanelOf(inputs.check, inputs.me) === null
  );
}

export function carriedAvailable(inputs: OpenTillInputs): boolean {
  return carriedFromOf(inputs.check, inputs.form.pickedCounterId) !== null && livePanelOf(inputs.check, inputs.me) === null;
}

/** The float the drawer should hold: what the last close left, or what the safe hands over. */
export function floatIssuedPaise(inputs: OpenTillInputs): number {
  if (isCarried(inputs)) return paiseOf(carriedFromOf(inputs.check, inputs.form.pickedCounterId)?.floatLeft);
  return Math.max(0, inputs.form.issuedPaise);
}

export function countedOf(inputs: OpenTillInputs): number {
  return countedPaise(inputs.denominations, inputs.form.count);
}

export type OpenFigures = {
  issued: number;
  counted: number;
  diff: number;
  short: boolean;
  over: boolean;
  /** Nothing counted yet is not a difference: the band waits for the count. */
  mismatch: boolean;
  diffText: string;
  diffTone: "danger" | "warning" | "success";
};

export function openFigures(inputs: OpenTillInputs): OpenFigures {
  const issued = floatIssuedPaise(inputs);
  const counted = countedOf(inputs);
  const diff = counted - issued;
  const short = diff < 0;
  const over = diff > 0;
  return {
    issued,
    counted,
    diff,
    short,
    over,
    mismatch: (short || over) && counted > 0,
    diffText: short ? `${formatSignedMoney(diff)}  short` : over ? `${formatSignedMoney(diff)}  over` : formatMoney(0),
    diffTone: short ? "danger" : over ? "warning" : "success",
  };
}

/** The words around the float, which follow ISSUED / CARRIED. */
export function floatWords(carried: boolean): { caption: string; mode: string; postHint: string } {
  return carried
    ? { caption: "Carried", mode: "float = CARRIED (the last close's drawer)", postHint: "no voucher: the cash never left the drawer" }
    : { caption: "Issued", mode: "float = ISSUED (out of the safe)", postHint: "TFlt voucher posts on Open" };
}

export function carriedLabel(carried: TillCarriedFrom | null): string {
  return carried
    ? `Carried from ${carried.sessionNo} (${formatMoney(paiseOf(carried.floatLeft))})`
    : "Carried — none on this counter today";
}

// ─── why Open (Ctrl+Enter) would refuse, and what it would post ──────────────

export function openProblem(inputs: OpenTillInputs): string {
  const { check, checkError, form } = inputs;
  if (!check) return checkError || "Still asking the server about this device…";
  if (!check.requireSession) return "No till session is needed on this device.";
  if (check.deviceSession) return `This device already holds session ${check.deviceSession.sessionNo}.`;
  if (check.userSessionElsewhere) {
    return `You already have session ${check.userSessionElsewhere.sessionNo} open on another device.`;
  }
  const day = check.businessDay;
  if (!day?.status && !day?.autoOpen) return "The business day is not open — Day Open first (Business Day, menu 274).";
  if (day?.status === "CLOSING" || day?.status === "CLOSED") return `The business day is ${day.status} — no session opens on it.`;
  const linked = check.linkedCounter;
  if (linked) {
    if (linked.inactive) return `Counter ${linked.code} is switched off (Till Masters).`;
  } else if ((check.freeCounters ?? []).length === 0) {
    const who = (check.busyCounters ?? []).map((b) => `${b.code} (${b.session?.operatorName ?? ""})`);
    return who.length === 0
      ? "No free counter in this branch (Till Masters, menu 275)."
      : `No free counter in this branch — in use: ${who.join(", ")}.`;
  } else if (!chosenCounterId(check, form.pickedCounterId)) {
    return "Pick the counter you are opening.";
  }
  const figures = openFigures(inputs);
  if (figures.counted === 0 && figures.issued > 0) return "Count the drawer: every note and coin in it.";
  if (figures.mismatch && !form.reasonId) return "The count differs from the float: pick a reason.";
  return "";
}

export function openBody(inputs: OpenTillInputs, scope: { companyId: string; branchId: string }): TillOpenBody {
  const { check, form } = inputs;
  const body: TillOpenBody = {
    companyId: scope.companyId,
    branchId: scope.branchId,
    floatMode: "ISSUED",
    lines: countLines(inputs.denominations, form.count),
  };
  // A linked device may leave the counter out; an unlinked one names it.
  const counterId = chosenCounterId(check, form.pickedCounterId);
  if (!check?.linkedCounter && counterId) body.counterId = counterId;
  if (isCarried(inputs)) {
    body.floatMode = "CARRIED";
    const carried = carriedFromOf(check, form.pickedCounterId);
    if (carried?.sessionId) body.prevSessionId = carried.sessionId;
  } else {
    body.floatIssued = paiseToNumber(Math.max(0, form.issuedPaise));
  }
  // The reason files the OPEN variance; the notes keep the figure for whoever
  // reads the session later.
  const figures = openFigures(inputs);
  const reason = inputs.reasons.find((r) => r.id === form.reasonId);
  if (figures.mismatch && form.reasonId) {
    body.reasonId = form.reasonId;
    body.notes = `FLOAT_MISMATCH ${formatSignedMoney(figures.diff)}: ${reason?.name ?? ""}`.trim();
  }
  return body;
}

export const MISMATCH_NOTE =
  "The session opens now; the difference posts at once as a FLOAT_MISMATCH variance (TVar, Cash Short & Excess) " +
  "under the reason picked. Supervisor PIN at open comes with the approval gate (till build phase 3).";

export const FORCE_CLOSE_TIP =
  "Force close comes with the approval gate (till build phase 3) — not on the server yet";
