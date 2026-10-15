/**
 * Approve Cash — Qt `TillApproveCashDialog` (c77f3f1, notes 114) without the
 * widgets: a supervisor approves a CLOSED session's cash into the safe,
 * opened from the Session Cockpit's Approve Cash.
 *
 * POST /till/sessions/approve-cash: every hand-over / drop of the session
 * still awaiting receipt, as one total. The amount handed over is shown (not
 * blind); Received starts at it, so an exact one is PIN + Ctrl+Enter.
 *
 * A difference: within till.cash_tolerance the server books it itself. Beyond
 * it the supervisor either decides it here (a treatment + reason; their own
 * CASH_VARIANCE grant must cover it — else the server's 403 is shown) or
 * leaves "Send to another approver", and it waits for decide-variance with the
 * answer's tcmId. Never the session's cashier (unless till.single_operator).
 */
import type { TillApproveCashBody } from "../shared/api/till-session-api";
import { CASH_TENDER_TYPE_ID } from "../shared/denom";
import { formatMoney, formatSignedMoney, paiseOf, paiseToAmount, paiseToNumber, toPaise } from "../shared/money";
import { reasonsOf, type TillReason } from "../shared/reasons";
import type {
  TillApprovableTreatment,
  TillCashApprovalResult,
  TillSessionKey,
  TillSessionPayload,
} from "../shared/wire/types";
import type { DecideOption } from "./variance-decide";

// ─── what the dialog is opened on ────────────────────────────────────────────

export type ApproveCashFacts = {
  sessionNo: string;
  cashier: string;
  /** Σ of the hand-over and drops awaiting receipt. */
  handedPaise: number;
  /** One line per awaiting bag — shown only when there is more than one. */
  parts: string[];
  /** The close count's cash tolerance; -1 = not known here (always "beyond"). */
  tolerancePaise: number;
};

/**
 * What waits: the hand-over and any drops POSTED and AWAITING receipt; the
 * session's own `cashAwaiting` should the movements be missing. The tolerance
 * is the cash CLOSE-stage variance's (the last one listed).
 */
export function approveCashFacts(s: TillSessionPayload): ApproveCashFacts {
  let handed = 0;
  const parts: string[] = [];
  for (const m of s.movements ?? []) {
    if (m.tcmReceiptStatus !== "AWAITING" || m.tcmStatus !== "POSTED") continue;
    const amount = paiseOf(m.tcmAmount);
    handed += amount;
    parts.push(`${m.tcmKind === "DROP" ? "Drop" : "Close hand-over"} ${m.tcmDocNo ?? ""}  ${formatMoney(amount)}`);
  }
  if (parts.length === 0) handed = paiseOf(s.cashAwaiting);
  let tolerance = -1;
  for (const v of s.variances ?? []) {
    if (v.tvrStage === "CLOSE" && v.tvrTenderTypeId === CASH_TENDER_TYPE_ID) tolerance = paiseOf(v.tvrTolerance);
  }
  return {
    sessionNo: s.tssSessionNo ?? "",
    cashier: s.operatorName ?? "",
    handedPaise: handed,
    parts,
    tolerancePaise: tolerance,
  };
}

/** Qt joins the parts with three spaces either side of a dot. */
export function partsLine(facts: ApproveCashFacts): string {
  return facts.parts.length > 1 ? facts.parts.join("   ·   ") : "";
}

// ─── the form ────────────────────────────────────────────────────────────────

export type ApproveCashForm = {
  /** As typed; starts at the amount handed over. */
  received: string;
  /** "" = send to another approver. */
  treatment: "" | TillApprovableTreatment;
  reasonId: string;
  note: string;
  pin: string;
};

/** Received = handed over, typed as a plain figure (`2000` / `2000.50`). */
export function initialApproveCashForm(facts: ApproveCashFacts): ApproveCashForm {
  return { received: paiseToAmount(facts.handedPaise), treatment: "", reasonId: "", note: "", pin: "" };
}

/** "Send to another approver" first, then the three treatments (a cash gap may be expensed). */
export function approveCashTreatments(): DecideOption<"" | TillApprovableTreatment>[] {
  return [
    { value: "", label: "Send to another approver" },
    { value: "EXPENSE", label: "Expense — Cash Short & Excess" },
    { value: "RECOVER", label: "Recover from the cashier (staff ledger)" },
    { value: "SUSPENSE", label: "Suspense — clear it later by a journal" },
  ];
}

/** VARIANCE reasons, active and not replaced by the company's own. */
export function approveCashReasons(reasons: readonly TillReason[]): DecideOption[] {
  return [
    { value: "", label: "Pick a reason" },
    ...reasonsOf(reasons, "VARIANCE").map((reason) => ({ value: reason.id, label: reason.name })),
  ];
}

/** A typed amount as paise; blank or unreadable is 0 (Qt's NexDoubleEdit value). */
function receivedPaise(form: ApproveCashForm): number {
  const paise = toPaise(form.received);
  return paise !== null && paise > 0 ? paise : 0;
}

export type ApproveCashState = {
  /** received − handed over. */
  differencePaise: number;
  differs: boolean;
  /** Beyond tolerance (or not knowing it): the supervisor chooses. */
  beyond: boolean;
  /** "matches" / "difference +x" */
  differenceText: string;
  differenceTone: "success" | "danger" | "warning";
  /** The treatment picker shows only beyond tolerance. */
  showTreatment: boolean;
  /** The reason shows only when a treatment is chosen. */
  showReason: boolean;
  hint: string;
  /** Why it cannot go yet, or "" — the button's tooltip. */
  problem: string;
};

/** Qt `refreshState` + `problem`. */
export function approveCashState(facts: ApproveCashFacts, form: ApproveCashForm): ApproveCashState {
  const diff = receivedPaise(form) - facts.handedPaise;
  const differs = diff !== 0;
  // Within it the server books it to Cash Short & Excess by itself.
  const beyond = differs && (facts.tolerancePaise < 0 || Math.abs(diff) > facts.tolerancePaise);
  const deciding = beyond && form.treatment !== "";
  let problem = "";
  if (!form.received.trim()) problem = "Type what you received.";
  else if (beyond && form.treatment && !form.reasonId) problem = "Pick the reason.";
  else if (!form.pin) problem = "Type your till PIN.";
  return {
    differencePaise: diff,
    differs,
    beyond,
    differenceText: differs ? `difference ${formatSignedMoney(diff)}` : "matches",
    differenceTone: !differs ? "success" : diff < 0 ? "danger" : "warning",
    showTreatment: beyond,
    showReason: deciding,
    hint: !differs
      ? "The cash goes into the safe, signed with your PIN."
      : !beyond
        ? `Within the tolerance of ${formatMoney(facts.tolerancePaise)}: the difference is booked to Cash Short & Excess at once.`
        : deciding
          ? `You decide it now: your approval limit must cover ${formatMoney(Math.abs(diff))}, or the server says so.`
          : "Another approver decides the difference (Approve on this session). The cash you received goes into the safe now.",
    problem,
  };
}

/**
 * The request (Qt `body()`): the PIN always; the received amount only when it
 * differs (left out = exactly what was handed over); the treatment and reason
 * only when one is chosen beyond tolerance; the note when typed.
 */
export function approveCashBody(key: TillSessionKey, facts: ApproveCashFacts, form: ApproveCashForm): TillApproveCashBody {
  const state = approveCashState(facts, form);
  const body: TillApproveCashBody = { ...key, approverPin: form.pin };
  if (state.differs) {
    body.receivedAmount = paiseToNumber(receivedPaise(form));
    if (state.beyond && form.treatment) {
      body.treatment = form.treatment;
      body.reasonId = form.reasonId;
    }
  }
  const note = form.note.trim();
  if (note) body.notes = note;
  return body;
}

// ─── the answer ──────────────────────────────────────────────────────────────

/** What the cockpit says once the cash is in the safe (Qt `approveCash`). */
export function approveCashOutcome(result: TillCashApprovalResult): string {
  const received = formatMoney(paiseOf(result.received));
  const diff = formatSignedMoney(paiseOf(result.difference));
  switch (result.outcome) {
    case "APPROVED":
      return `${received} approved into the safe.`;
    case "WITHIN_TOLERANCE":
      return `${received} approved into the safe. The difference ${diff} is within tolerance and booked to Cash Short & Excess.`;
    case "DECIDED":
      return `${received} approved into the safe. The difference ${diff} is booked (${result.treatment ?? ""}, voucher ${result.varianceVoucherNo ?? ""}).`;
    default:
      return `${received} approved into the safe. The difference ${diff} waits for another approver: they open this session and press Approve.`;
  }
}
