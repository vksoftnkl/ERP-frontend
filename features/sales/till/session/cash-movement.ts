/**
 * Cash Movement (S3, rev 2) — Qt `TillCashMovementDialog` without the widgets:
 * every non-sale cash movement through a drawer, one document with one
 * voucher each.
 *
 *   Drop     the cashier's sealed bag to the safe: declared amount + bag +
 *            seal, no count now (the cash office verifies it)        TDrp
 *   Paid in  cash income with no party: reason, ledger, ref           TPIn
 *   Pickup   a SUPERVISOR takes cash, the cashier witnesses:
 *            reason, counted by note                                  TDrp
 *   Top-up   a SUPERVISOR brings change from the safe, counted        TFlt
 *
 * One `POST /till/movements/create` each. The safe is the server's (the
 * counter's, else the branch default — the route takes no safe). Pickup /
 * Top-up need Till Sessions (273) OVERRIDE on the LOGGED-IN user; the
 * supervisor's PIN at the till is the approval gate (phase 3, not built), so
 * the sign-off panel says who signs instead of asking for PINs. A pickup is
 * always two people: the session's own cashier cannot take it.
 */
import { countLines, countedPaise, type DenomCountValue, type Denomination } from "../shared/denom";
import { formatMoney, paiseToNumber } from "../shared/money";
import { reasonById, reasonsOf, type TillReason } from "../shared/reasons";
import type { TillMovementBody } from "../shared/api/till-session-api";
import type { TillSessionKey, TillSessionPayload } from "../shared/wire/types";

export type MovementMode = "DROP" | "PAID_IN" | "PICKUP" | "TOP_UP";

export const MOVEMENT_MODES: readonly MovementMode[] = ["DROP", "PAID_IN", "PICKUP", "TOP_UP"];

export const MODE_TITLES: Record<MovementMode, string> = {
  DROP: "Drop",
  PAID_IN: "Paid in",
  PICKUP: "Pickup",
  TOP_UP: "Top-up",
};

export type MovementForm = {
  mode: MovementMode;
  reasonId: string;
  ledger: { id: string; text: string } | null;
  /** Drop: the declared amount. */
  amountPaise: number;
  bagNo: string;
  sealNo: string;
  refNo: string;
  partyName: string;
  notes: string;
  count: DenomCountValue;
};

export type MovementInputs = {
  form: MovementForm;
  /** `/sessions/get`; null while it is read. */
  session: TillSessionPayload | null;
  reasons: readonly TillReason[];
  denominations: readonly Denomination[];
  /** The signed-in user. */
  me: string;
  /** The signed-in user's name, for the sign-off panel. */
  myName: string;
};

/** A drop is a sealed bag: declared, counted later by the cash office. Everything else counts by note. */
export function isCounted(mode: MovementMode): boolean {
  return mode !== "DROP";
}

/** The reason category the server demands for the mode (Drop and Top-up take none). */
export function reasonCategory(mode: MovementMode): string | null {
  return mode === "PAID_IN" ? "PAID_IN" : mode === "PICKUP" ? "PICKUP" : null;
}

export function reasonOptions(mode: MovementMode, reasons: readonly TillReason[]): TillReason[] {
  const category = reasonCategory(mode);
  return category ? reasonsOf(reasons, category) : [];
}

/** The Ref box: always on a paid-in; on a pickup only when its reason asks for one. */
export function refVisible(form: MovementForm, reasons: readonly TillReason[]): boolean {
  if (form.mode === "PAID_IN") return true;
  return Boolean(reasonCategory(form.mode) && reasonById(reasons, form.reasonId)?.needsRef);
}

export function movementAmount(inputs: MovementInputs): number {
  return isCounted(inputs.form.mode)
    ? countedPaise(inputs.denominations, inputs.form.count)
    : Math.max(0, inputs.form.amountPaise);
}

export function movementProblem(inputs: MovementInputs): string {
  const { form, session, reasons } = inputs;
  if (!session) return "Reading the session…";
  const status = session.tssStatus;
  if (status !== "OPEN" && status !== "SUSPENDED") return `The session is ${status}: it no longer moves cash.`;
  if (form.mode === "PICKUP" && session.tssOperatorId === inputs.me) {
    return (
      "A pickup is two people: a supervisor takes it (from Till Sessions) and you sign for it. " +
      "To move cash to the safe yourself, use Drop."
    );
  }
  const needsReason = form.mode === "PAID_IN" || form.mode === "PICKUP";
  if (needsReason && !form.reasonId) return "Pick a reason.";
  if (form.mode === "DROP" && (!form.bagNo.trim() || !form.sealNo.trim())) {
    return "A drop is a sealed bag: enter its bag no and seal.";
  }
  const amount = movementAmount(inputs);
  if (amount <= 0) return isCounted(form.mode) ? "Count the cash, note by note." : "Enter the declared amount.";
  // What the reason itself demands (Till Masters: Note / Ref / Cap).
  const reason = needsReason ? reasonById(reasons, form.reasonId) : null;
  if (reason) {
    if (reason.needsNote && !form.notes.trim()) return `“${reason.name}” needs a note.`;
    if (reason.needsRef && !form.refNo.trim()) return `“${reason.name}” needs a ref no (bill / voucher no).`;
    if (reason.maxAmountPaise > 0 && amount > reason.maxAmountPaise) {
      return `“${reason.name}” allows at most ${formatMoney(reason.maxAmountPaise)} in one movement.`;
    }
  }
  // The reason's own ledger is the default; without one a ledger is needed.
  if (form.mode === "PAID_IN" && !form.ledger?.id && reason && !reason.ledgerId) {
    return "This reason has no ledger: pick the ledger the money comes from.";
  }
  return "";
}

function textOrNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed ? trimmed : null;
}

export function movementBody(inputs: MovementInputs, key: TillSessionKey): TillMovementBody {
  const { form, reasons } = inputs;
  const body: TillMovementBody = { ...key, kind: form.mode, notes: textOrNull(form.notes) };
  if (isCounted(form.mode)) body.lines = countLines(inputs.denominations, form.count);
  else body.amount = paiseToNumber(Math.max(0, form.amountPaise));
  if ((form.mode === "PAID_IN" || form.mode === "PICKUP") && form.reasonId) body.reasonId = form.reasonId;
  if (refVisible(form, reasons)) body.refNo = textOrNull(form.refNo);
  if (form.mode === "PAID_IN") {
    if (form.ledger?.id) body.ledgerId = form.ledger.id;
    body.partyName = textOrNull(form.partyName);
  }
  if (form.mode === "DROP" || form.mode === "PICKUP") {
    body.bagNo = textOrNull(form.bagNo);
    body.sealNo = textOrNull(form.sealNo);
  }
  return body;
}

export type MovementWords = {
  title: string;
  voucher: string;
  voucherTone: "blue" | "green" | "grey";
  safeCaption: string;
  bagCaption: string;
  sealCaption: string;
  totalCaption: string;
  signRule: string;
  supervisor: string;
  witness: string;
  postHint: string;
  modeNote: string;
};

export const SIGN_NOTE =
  "Supervisor and witness PINs at the till come with the approval gate (till build phase 3). Until then the " +
  "supervisor is whoever is logged in with the Till Sessions (273) override right.";

export function movementWords(mode: MovementMode, session: TillSessionPayload | null, myName: string): MovementWords {
  const drop = mode === "DROP";
  const paidIn = mode === "PAID_IN";
  const pickup = mode === "PICKUP";
  const topUp = mode === "TOP_UP";
  const cashier = session?.operatorName ?? "";
  return {
    title: `${MODE_TITLES[mode]} — ${session?.tssSessionNo ?? ""} · ${cashier}`,
    voucher: paidIn ? "TPIn" : topUp ? "TFlt" : "TDrp",
    voucherTone: topUp ? "green" : paidIn ? "blue" : "grey",
    safeCaption: topUp ? "From safe" : "To safe",
    bagCaption: drop ? "Bag no *" : "Bag no",
    sealCaption: drop ? "Seal *" : "Seal",
    totalCaption: topUp ? "TOPPED UP" : pickup ? "PICKED UP" : "PAID IN",
    signRule: pickup ? "PICKUP · ALWAYS · Supervisor" : "TOP_UP · ALWAYS · Supervisor",
    supervisor: `${myName}  (logged in — Till Sessions right)`,
    witness: pickup ? `${cashier}  (the session's cashier)` : cashier,
    postHint: drop
      ? "Posts TDrp  Dr Safe / Cr Till cash  (on the declared amount)"
      : paidIn
        ? "Posts TPIn  Dr Till cash / Cr the reason's or chosen ledger"
        : pickup
          ? "Posts TDrp  Dr Safe / Cr Till cash"
          : "Posts TFlt  Dr Till cash / Cr Safe",
    modeNote: drop
      ? "Sealed by the cashier, dropped into the safe slot. Nobody counts it now — the cash office opens the bag " +
        "later; a difference there becomes this session's variance."
      : paidIn
        ? "Cash income with no party (scrap, a refund to the store). An expense is an Expense voucher; a supplier " +
          "or staff member is a bill-wise Payment."
        : pickup
          ? "A supervisor takes cash out of the drawer; the cashier signs for it. Slip prints with two signature lines."
          : "Change from the safe into the drawer, counted by note — the mirror of a pickup.",
  };
}

/** A fresh form for a mode — Qt clears the count, the amount and every box on a mode change. */
export function emptyMovementForm(mode: MovementMode, count: DenomCountValue): MovementForm {
  return {
    mode,
    reasonId: "",
    ledger: null,
    amountPaise: 0,
    bagNo: "",
    sealNo: "",
    refNo: "",
    partyName: "",
    notes: "",
    count,
  };
}
