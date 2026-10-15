/**
 * Decide variance — Qt `TillVarianceDecideDialog` without the widgets: the
 * approver's decision on a PENDING_APPROVAL session (notes 105 A), opened from
 * the Session Cockpit's Approve.
 *
 * POST /till/sessions/decide-variance: APPROVE with a treatment (EXPENSE →
 * Cash Short & Excess, RECOVER → the cashier's staff ledger, SUSPENSE →
 * Tender suspense) and a reason, or RECOUNT (one more count attempt). The note
 * is required; the PIN only when the rule's channel is COUNTER (the server
 * says so with TILL_APPROVER_PIN). Who may decide is the server's call: never
 * the cashier, a 276 grant at the rule's level and amount, or a super admin.
 * Approved, the session is COUNTING again and End Shift closes it.
 *
 * Bag mode (Qt c77f3f1 `setBag`, notes 113): a received bag's RECEIVE-stage
 * difference instead — any session status, APPROVE only (the receiver's
 * count stands, so no Recount), `tcmId` in the body; neither that receiver
 * nor the session's cashier decides it.
 */
import type { TillDecideVarianceBody } from "../shared/api/till-session-api";
import { CASH_TENDER_TYPE_ID } from "../shared/denom";
import type { TillError } from "../shared/errors";
import { formatSignedMoney, paiseOf } from "../shared/money";
import { reasonsOf, type TillReason } from "../shared/reasons";
import type {
  TillApprovableTreatment,
  TillSessionKey,
  TillSessionPayload,
  TillVarianceDecision,
} from "../shared/wire/types";
import { bagDocNo, pendingReceive, pendingVariance } from "./cockpit";

export type VarianceEvent = "CASH_VARIANCE" | "NONCASH_VARIANCE";

// ─── what the cockpit opens it on ────────────────────────────────────────────

/** A received bag whose RECEIVE-stage difference is decided (notes 113). */
export type DecideBag = { tcmId: string; docNo: string };

/** What the dialog is opened on: the session's facts and the gap it decides. */
export type DecideRequest = {
  key: TillSessionKey;
  event: VarianceEvent;
  variancePaise: number;
  sessionNo: string;
  cashier: string;
  /** Set: a bag's receive difference — APPROVE only, `tcmId` in the body. */
  bag?: DecideBag | null;
};

/**
 * The session's pending gap (the cash one when there is one): CASH_VARIANCE
 * or NONCASH_VARIANCE. No pending row at all reads as a cash gap, as Qt does.
 */
export function decideRequestOf(s: TillSessionPayload, key: TillSessionKey): DecideRequest {
  const pending = pendingVariance(s);
  const cash = !pending || pending.tvrTenderTypeId === CASH_TENDER_TYPE_ID;
  return {
    key,
    event: cash ? "CASH_VARIANCE" : "NONCASH_VARIANCE",
    variancePaise: paiseOf(pending?.tvrVariance),
    sessionNo: s.tssSessionNo ?? "",
    cashier: s.operatorName ?? "",
  };
}

/**
 * A received bag's pending difference (Qt `decideVariance` → `setBag`): a cash
 * gap of the bag's variance, on the bag the variance names.
 */
export function bagDecideRequestOf(s: TillSessionPayload, key: TillSessionKey): DecideRequest {
  const receive = pendingReceive(s);
  const tcmId = receive?.tvrMovementId ?? "";
  return {
    key,
    event: "CASH_VARIANCE",
    variancePaise: paiseOf(receive?.tvrVariance),
    sessionNo: s.tssSessionNo ?? "",
    cashier: s.operatorName ?? "",
    bag: { tcmId, docNo: bagDocNo(s, tcmId) },
  };
}

/** The Event fact: the gap's event, or `RECEIVE_VARIANCE · <bag doc no>`. */
export function decideEventText(request: DecideRequest): string {
  return request.bag ? `RECEIVE_VARIANCE · ${request.bag.docNo}` : request.event;
}

/** What the cockpit says once the server took the decision. */
export function decidedMessage(decision: TillVarianceDecision): string {
  return decision === "APPROVE"
    ? "Approved. The session is ready to close: Count / close (End Shift) closes it and posts the variance."
    : "Sent back to recount: the cashier counts the drawer once more.";
}

// ─── the dialog ──────────────────────────────────────────────────────────────

export type DecideOption<T extends string = string> = { value: T; label: string };

/**
 * A cash gap is short & excess by default; a slip gap is never short & excess
 * (plan §4.2) — no Expense on offer for it.
 */
export function treatmentOptions(event: VarianceEvent): DecideOption<TillApprovableTreatment>[] {
  const options: DecideOption<TillApprovableTreatment>[] = [];
  if (event !== "NONCASH_VARIANCE") options.push({ value: "EXPENSE", label: "Expense — Cash Short & Excess" });
  options.push({ value: "RECOVER", label: "Recover from the cashier (staff ledger)" });
  options.push({ value: "SUSPENSE", label: "Suspense — clear it later by a journal" });
  return options;
}

/** The reasons of this kind of gap: VARIANCE for cash, NONCASH for slips — active, not replaced. */
export function reasonOptions(reasons: readonly TillReason[], event: VarianceEvent): DecideOption[] {
  const category = event === "NONCASH_VARIANCE" ? "NONCASH" : "VARIANCE";
  return [
    { value: "", label: "Pick a reason" },
    ...reasonsOf(reasons, category).map((reason) => ({ value: reason.id, label: reason.name })),
  ];
}

export type DecideForm = {
  decision: TillVarianceDecision;
  treatment: TillApprovableTreatment;
  reasonId: string;
  note: string;
  pin: string;
};

/** Approve, the first treatment on offer, no reason yet (Qt's combo defaults). */
export function initialDecideForm(event: VarianceEvent): DecideForm {
  return { decision: "APPROVE", treatment: treatmentOptions(event)[0].value, reasonId: "", note: "", pin: "" };
}

/** Why the decision cannot go yet, or "" — the button's tooltip. */
export function decideProblem(form: DecideForm): string {
  if (form.decision === "APPROVE" && !form.reasonId) return "Pick the reason.";
  if (!form.note.trim()) return "Write a note: what you found.";
  return "";
}

export function decideButtonLabel(decision: TillVarianceDecision): string {
  return decision === "APPROVE" ? "Approve - Ctrl+Enter" : "Send to recount - Ctrl+Enter";
}

/**
 * The request: the key and the decision; APPROVE adds its treatment and
 * reason; the PIN only when typed; a bag's `tcmId` when deciding one.
 */
export function decideBody(key: TillSessionKey, form: DecideForm, tcmId = ""): TillDecideVarianceBody {
  const approve = form.decision === "APPROVE";
  return {
    companyId: key.companyId,
    branchId: key.branchId,
    accYear: key.accYear,
    tssId: key.tssId,
    decision: form.decision,
    ...(approve ? { treatment: form.treatment, reasonId: form.reasonId } : {}),
    note: form.note.trim(),
    ...(form.pin ? { approverPin: form.pin } : {}),
    ...(tcmId ? { tcmId } : {}),
  };
}

/** The variance as Qt's facts card shows it: signed, red when short, amber when over. */
export function decideAmount(paise: number): { text: string; tone: "danger" | "warning" } {
  return { text: formatSignedMoney(paise), tone: paise < 0 ? "danger" : "warning" };
}

export const DECIDE_HINT =
  "Approve: the session is ready to close again — End Shift closes it and posts the variance. Recount: the cashier " +
  "counts once more.";

/** Bag mode's hint (Qt `setBag`). */
export const BAG_DECIDE_HINT =
  "The cash was approved for other than was handed over. Approve books the difference at once — the supervisor's " +
  "count stands, so there is no recount. Not that supervisor, not the cashier.";

export type DecideRefusal = {
  /** The red line under the form. */
  line: string;
  /** The control it is about, to take the focus. */
  focus: "pin" | "treatment" | "reason" | null;
  /** A wrong PIN is typed again from empty. */
  clearPin: boolean;
};

/**
 * A refusal, said beside the field it is about: who may decide is the
 * server's call (self / grant / limit / PIN).
 */
export function decideRefusal(error: TillError): DecideRefusal {
  const line = error.code ? `${error.code} — ${error.text}` : error.text;
  if (error.code === "TILL_APPROVER_PIN" || error.field === "approverPin") {
    return { line, focus: "pin", clearPin: true };
  }
  if (error.field === "treatment") return { line, focus: "treatment", clearPin: false };
  if (error.field === "reasonId") return { line, focus: "reason", clearPin: false };
  return { line, focus: null, clearPin: false };
}
