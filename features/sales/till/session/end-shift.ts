/**
 * End Shift (S4) — the cashier's blind close, Qt `TillEndShiftDialog` without
 * the widgets.
 *
 *   1 End billing   POST /till/sessions/end-billing — the session stops
 *                   taking money (COUNTING); held bills go to the branch pool
 *                   (till.close_with_holds RELEASE) or refuse (BLOCK).
 *   2 Count cash    by denomination; the expected figure is never shown.
 *   3 Count slips   one line per SLIPS tender of the session (card terminal,
 *                   cheque, gift voucher): slips · amount · batch. STATEMENT
 *                   tenders (UPI / wallet / bank) are "verified later", NONE
 *                   ones are not in the drawer.
 *   4 Submit        POST /till/sessions/count → ACCEPTED / RECOUNT_REQUIRED /
 *                   SENT_FOR_APPROVAL — an answer, never a figure.
 *
 * Close (POST /till/sessions/close) follows an ACCEPTED count: the float left
 * stays in the drawer, the rest of the count goes to the safe (TDrp), the Z
 * number is issued. Esc after step 1 does NOT reopen billing.
 */
import { clockOf } from "../shared/format";
import { amountInputPaise, formatMoney, paiseToNumber } from "../shared/money";
import type { TillCloseBody, TillCountBody } from "../shared/api/till-session-api";
import type { TillCountLine, TillSessionKey, TillSessionPayload, TillSessionTender } from "../shared/wire/types";

export type EndShiftAnswer = "" | "ACCEPTED" | "RECOUNT_REQUIRED" | "SENT_FOR_APPROVAL";

/** One slip line as the cashier fills it. */
export type SlipLine = {
  key: string;
  tenderTypeId: number;
  tenderId: string;
  name: string;
  mode: string;
  /** Only SLIPS lines take a count; the rest say why not. */
  countable: boolean;
  slips: string;
  amount: string;
  batch: string;
};

/** What showSession reads off the session: the screen's starting state. */
export type EndShiftView = {
  status: string;
  title: string;
  statusTone: "red" | "green" | "amber";
  blind: boolean;
  attempts: number;
  attemptText: string;
  billing: boolean;
  step1Tone: "amber" | "green";
  step1Text: string;
  countPlaceText: string;
  expectedText: string;
  expectedNote: string;
  slipNote: string;
  /** The answer a reopened dialog starts from. */
  answer: EndShiftAnswer;
  /** Accepted on the drawer, a slip total out: waits for the slip check. */
  slipCheck: boolean;
  /** Counted elsewhere (till.count_place CASH_OFFICE). */
  cashOffice: boolean;
  footNote: string;
  closeText: string;
};

export const DEFAULT_FOOT_NOTE =
  "Esc after step 1 does NOT reopen billing — the session stays COUNTING; only a supervisor can reopen it.";
export const DEFAULT_CLOSE_TEXT =
  "Close the session now: the float left stays in the drawer, the rest of the count goes to the safe (a TDrp " +
  "voucher), and the Z number is issued.";

export function blindOf(session: TillSessionPayload): boolean {
  return session.tssCountMode !== "OPEN";
}

export function attemptText(blind: boolean, attempt: number, suffix: "" | "accepted" | "answered"): string {
  const mode = blind ? "blind" : "open";
  return suffix ? `${mode} count · attempt ${attempt} ${suffix}` : `${mode} count · attempt ${attempt}`;
}

export function endShiftView(session: TillSessionPayload, previous: EndShiftAnswer): EndShiftView {
  const status = session.tssStatus ?? "";
  const blind = blindOf(session);
  const attempts = Number(session.tssCountAttempts ?? 0) || 0;
  const countedOn = session.tssCountedOn ?? "";
  const billing = status === "OPEN" || status === "SUSPENDED";
  const slipRows = slipLinesOf(session.tenders ?? []);
  let answer: EndShiftAnswer = previous;
  let slipCheck = false;
  let footNote = DEFAULT_FOOT_NOTE;
  let closeText = DEFAULT_CLOSE_TEXT;
  if (status === "PENDING_APPROVAL") {
    answer = "SENT_FOR_APPROVAL";
  } else if (status === "CLOSED") {
    footNote = `Session closed — Z ${session.tssZNo ?? ""}.`;
  } else if (status === "COUNTING" && attempts > 0 && !previous) {
    // Re-opened after a count. tssCountedOn is stamped only by a FINAL
    // (accepted) count: then the shift closes, and a second count would write
    // its variances again. Without it the last answer was a recount.
    if (countedOn) {
      slipCheck = session.tssVarianceStatus === "PENDING";
      answer = "ACCEPTED";
      closeText = `The count (attempt ${attempts}) was accepted — close the session.`;
    } else {
      answer = "RECOUNT_REQUIRED";
    }
  }
  const cashOffice = session.tssCountPlace === "CASH_OFFICE" && status === "COUNTING";
  if (cashOffice) footNote = "Drawer sealed — awaiting count in the cash office.";
  return {
    status,
    title: `End Shift — ${session.tssSessionNo} · ${session.operatorName ?? ""} · ${session.counterName ?? ""} · opened ${clockOf(session.tssOpenedOn)}`,
    statusTone: status === "PENDING_APPROVAL" ? "red" : status === "CLOSED" ? "green" : "amber",
    blind,
    attempts,
    attemptText: countedOn ? attemptText(blind, attempts, "accepted") : attemptText(blind, attempts + 1, ""),
    billing,
    step1Tone: billing ? "amber" : "green",
    step1Text: billing
      ? "The session is still billing. Ending it stops every bill, return and receipt from taking money here; held " +
        "bills go to the branch pool."
      : `Billing ended ${clockOf(session.tssBillingEndedOn)}. Held bills went to the branch pool — any counter can resume them.`,
    countPlaceText: session.tssCountPlace === "CASH_OFFICE" ? "count place = CASH_OFFICE" : "count place = COUNTER",
    expectedText: blind ? "" : "—",
    expectedNote: blind ? "hidden from the cashier — till.blind_close = true" : "open count — the cockpit shows the expected figure",
    slipNote:
      slipRows.length === 0
        ? "No card, cheque, voucher or UPI money in this session — only cash to count."
        : "Card = one line per terminal: its settlement print's batch total, slips, batch no. STATEMENT rows are " +
          "matched to the provider statement later; NONE is shown for information only.",
    answer,
    slipCheck,
    cashOffice,
    footNote,
    closeText,
  };
}

/** One line per tender the session saw that is not cash. */
export function slipLinesOf(tenders: readonly TillSessionTender[]): SlipLine[] {
  return tenders
    .filter((t) => t.closeMode !== "DENOM")
    .map((t, index) => ({
      key: `${t.tenderTypeId}|${t.tenderId ?? ""}|${index}`,
      tenderTypeId: t.tenderTypeId,
      tenderId: t.tenderId ?? "",
      name: t.tenderName || t.tenderTypeName || "",
      mode: t.closeMode,
      countable: t.closeMode === "SLIPS",
      slips: "",
      amount: "",
      batch: "",
    }));
}

/** What an uncountable line says in its Amount cell. */
export function slipLineNote(line: SlipLine): string {
  if (line.countable) return "";
  return line.mode === "STATEMENT" ? "verified later" : "not in the drawer";
}

export function slipsTotalPaise(lines: readonly SlipLine[]): number {
  return lines.reduce((sum, line) => sum + (line.countable ? amountInputPaise(line.amount) : 0), 0);
}

function slipCount(line: SlipLine): number {
  const n = Number.parseInt(line.slips, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export type EndShiftState = {
  status: string;
  /** The answer that blocks a resubmit — a recount clears it. */
  outcome: EndShiftAnswer;
  cashOffice: boolean;
  cashPaise: number;
  slipsPaise: number;
};

export function endShiftProblem(state: EndShiftState): string {
  const { status } = state;
  if (!status) return "Reading the session…";
  if (status === "OPEN" || status === "SUSPENDED") return "End billing first (step 1).";
  if (status === "PENDING_APPROVAL") return "The count waits for a supervisor.";
  if (state.cashOffice) return "This drawer is counted in the cash office.";
  if (status !== "COUNTING") return `The session is ${status}.`;
  if (state.outcome === "ACCEPTED") return "The count is accepted — close the session.";
  if (state.cashPaise === 0 && state.slipsPaise === 0) return "Count the drawer: every note and coin in it.";
  return "";
}

/** The count lines can still be typed: counting, not yet accepted, not the cash office's. */
export function countingOpen(state: EndShiftState): boolean {
  return state.status === "COUNTING" && state.outcome !== "ACCEPTED" && !state.cashOffice;
}

export function countBody(key: TillSessionKey, cashLines: readonly TillCountLine[], slips: readonly SlipLine[]): TillCountBody {
  const lines: TillCountLine[] = [...cashLines];
  for (const line of slips) {
    if (!line.countable) continue;
    const amount = amountInputPaise(line.amount);
    const qty = slipCount(line);
    if (amount === 0 && qty === 0) continue;
    const entry: TillCountLine = { tenderTypeId: line.tenderTypeId, qty, enteredAmount: paiseToNumber(amount) };
    if (line.tenderId) entry.tenderId = line.tenderId;
    const batch = line.batch.trim();
    if (batch) entry.batchRef = batch;
    lines.push(entry);
  }
  return { ...key, lines };
}

export type StepTone = "done" | "current" | "todo";

export function stepStates(status: string, answer: EndShiftAnswer): {
  tones: [StepTone, StepTone, StepTone, StepTone];
  labels: [string, string, string, string];
} {
  const billingDone = !(status === "OPEN" || status === "SUSPENDED");
  const outcome = answer === "RECOUNT_REQUIRED" ? "" : answer;
  const submitted = Boolean(outcome) || status === "PENDING_APPROVAL" || status === "CLOSED";
  const middle: StepTone = !billingDone ? "todo" : submitted ? "done" : "current";
  return {
    tones: [billingDone ? "done" : "current", middle, middle, submitted ? "done" : "todo"],
    labels: [
      billingDone ? "✓  End billing" : "1  End billing",
      billingDone && submitted ? "✓  Count cash" : "2  Count cash",
      billingDone && submitted ? "✓  Count slips" : "3  Count slips",
      submitted ? "✓  Submit" : "4  Submit",
    ],
  };
}

export function acceptedText(slipCheck: boolean): string {
  return slipCheck
    ? "The cash is within the tolerance. A slip total differs: hand the slips over — the supervisor checks them " +
        "after close. Close the session below."
    : "Within the tolerance. Hand the drawer and the slips over, or close the session below.";
}

export function recountText(attemptsLeft: number): string {
  if (attemptsLeft < 0) return "A recount is due. Count the cash again.";
  return attemptsLeft === 1 ? "1 recount left. Count the cash again." : `${attemptsLeft} recounts left. Count the cash again.`;
}

export const APPROVAL_TEXT =
  "Out of tolerance after the last recount: the session waits for a supervisor. The approval gate is not on the " +
  "server yet (till build phase 3) — until it is, this session holds its counter, cashier and device (notes 97 §1.2).";

export const END_BILLING_CONFIRM =
  "After this no bill, return or receipt can take money in this session, and only a supervisor can reopen it. " +
  "End billing now?";

/**
 * Close: blank Float left = "counter default" — sent as null, the server then
 * leaves the counter's default float in a CARRIED store (else 0). Never more
 * than the cash counted.
 */
export function closeConfirmText(floatLeft: number | null): string {
  if (floatLeft === null) {
    return "Close the session? The counter's default float stays in a carried-float store; the rest goes to the safe.";
  }
  return floatLeft > 0
    ? `Close the session, leaving ${formatMoney(floatLeft)} in the drawer for the next shift?`
    : "Close the session? All the counted cash goes to the safe.";
}

export function closeBody(key: TillSessionKey, floatLeft: number | null): TillCloseBody {
  return { ...key, floatLeft: floatLeft === null ? null : paiseToNumber(floatLeft) };
}

/** The Float left box, read: blank = counter default (null), else paise. */
export function floatLeftOf(text: string): number | null {
  return text.trim() === "" ? null : amountInputPaise(text);
}

export function floatLeftProblem(floatLeft: number | null, cashPaise: number): string {
  if (floatLeft !== null && cashPaise > 0 && floatLeft > cashPaise) {
    return `The float left cannot be more than the cash counted (${formatMoney(cashPaise)}).`;
  }
  return "";
}

