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
 * Top-up need Till Sessions (273) OVERRIDE on the LOGGED-IN user, and the
 * witness — the session's cashier — types their till PIN on this screen
 * (notes 108): nothing is recorded without them there. A pickup is always
 * two people: the session's own cashier cannot take it.
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

/** The mode tiles' second line (Qt 2026-10-12). Ctrl+1..4 pick them in this order. */
export const MODE_LINES: Record<MovementMode, string> = {
  DROP: "Sealed bag to the safe",
  PAID_IN: "Cash income, no party",
  PICKUP: "Supervisor takes cash",
  TOP_UP: "Change from the safe",
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
  /** Notes 108: the session cashier's till PIN (a pickup; a top-up someone else brings). */
  witnessPin: string;
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
  /** The signed-in user's name: the supervisor on the summary card. */
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

/**
 * Notes 108: a Pickup always has a witness (the session's cashier); a Top-up
 * has one unless the session's own cashier brings the change to their own
 * drawer. Whenever there is a witness, their till PIN proves they were here.
 * Until the session is read its cashier is unknown, so a top-up asks (Qt).
 */
export function needsWitnessPin(mode: MovementMode, session: TillSessionPayload | null, me: string): boolean {
  if (mode === "PICKUP") return true;
  if (mode !== "TOP_UP") return false;
  return (session?.tssOperatorId ?? "") !== me;
}

/** The session's cashier by name, or the stand-in Qt uses before it is read. */
function cashierOr(session: TillSessionPayload | null, standIn: string): string {
  return session?.operatorName?.trim() || standIn;
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
  if (needsWitnessPin(form.mode, session, inputs.me) && !form.witnessPin.trim()) {
    return `${cashierOr(session, "The cashier")} must type their till PIN.`;
  }
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
  if (needsWitnessPin(form.mode, inputs.session, inputs.me)) body.witnessPin = form.witnessPin.trim();
  return body;
}

export type MovementWords = {
  title: string;
  /** Under the title: whose session, or that it is still being read. */
  sub: string;
  /** Which way the cash goes, in words a cashier reads at a glance. */
  flow: string;
  flowTone: "blue" | "green";
  /** The summary card. */
  totalCaption: string;
  safeCaption: string;
  safeTip: string;
  bagCaption: string;
  sealCaption: string;
  supervisor: string;
  witness: string;
  /** Notes 108: the witness PIN row. */
  pinCaption: string;
  pinHint: string;
  modeNote: string;
};

export const SUPERVISOR_TIP = "The user logged in now, with the Till Sessions override right.";
export const WITNESS_TIP = "The session's cashier signs the slip.";

export function movementWords(mode: MovementMode, session: TillSessionPayload | null, myName: string): MovementWords {
  const drop = mode === "DROP";
  const paidIn = mode === "PAID_IN";
  const pickup = mode === "PICKUP";
  const topUp = mode === "TOP_UP";
  const cashier = session?.operatorName ?? "";
  const sessionNo = session?.tssSessionNo ?? "";
  return {
    title: `Cash Movement — ${MODE_TITLES[mode]}`,
    sub: sessionNo ? `Session ${sessionNo} · ${cashier}` : "Reading the session…",
    flow: paidIn ? "INTO THE TILL" : topUp ? "SAFE → TILL" : "TILL → SAFE",
    flowTone: topUp || paidIn ? "green" : "blue",
    totalCaption: drop ? "DECLARED IN THE BAG" : paidIn ? "PAID IN" : pickup ? "PICKED UP" : "TOPPED UP",
    safeCaption: paidIn ? "Ledger" : topUp ? "From safe" : "To safe",
    safeTip: paidIn ? "" : "The counter's own safe, else the branch's default safe.",
    bagCaption: drop ? "Bag no *" : "Bag no",
    sealCaption: drop ? "Seal *" : "Seal",
    supervisor: myName,
    witness: cashier,
    pinCaption: `${cashierOr(session, "Cashier")}'s PIN *`,
    pinHint: `${cashierOr(session, "The cashier")} types their own till PIN here — proof they saw it.`,
    modeNote: drop
      ? "The cashier seals the bag and drops it in the safe. The cash office counts it later."
      : paidIn
        ? "Cash income with no party, e.g. scrap. An expense is an Expense voucher."
        : pickup
          ? "A supervisor takes cash from the drawer; the cashier signs for it."
          : "A supervisor brings change from the safe into the drawer.",
  };
}

/**
 * The summary card's second line: a paid-in's ledger (the one picked, else
 * the reason's own, else —); every other mode moves cash through the
 * counter's safe.
 */
export function summaryAccount(inputs: Pick<MovementInputs, "form" | "reasons">): string {
  const { form, reasons } = inputs;
  if (form.mode !== "PAID_IN") return "Counter's safe";
  const ledger = form.ledger?.text?.trim() || reasonById(reasons, form.reasonId)?.ledgerName?.trim() || "";
  return ledger || "—";
}

export type MovementStars = {
  /** A paid-in whose reason has no ledger of its own (or no reason yet). */
  ledger: boolean;
  /** The reason demands a ref no (Till Masters). */
  ref: boolean;
  /** The reason demands a note (Till Masters). */
  notes: boolean;
  /** Every mode but a drop counts by note. */
  count: boolean;
};

/** A * on what this mode and this reason demand. */
export function movementStars(inputs: Pick<MovementInputs, "form" | "reasons">): MovementStars {
  const { form, reasons } = inputs;
  const reason = reasonById(reasons, form.reasonId);
  return {
    ledger: form.mode === "PAID_IN" && !reason?.ledgerId,
    ref: Boolean(reason?.needsRef),
    notes: Boolean(reason?.needsNote),
    count: isCounted(form.mode),
  };
}

/** The ledger box's tip: blank falls back to the reason's own ledger. */
export function ledgerTip(inputs: Pick<MovementInputs, "form" | "reasons">): string {
  const { form, reasons } = inputs;
  const reason = reasonById(reasons, form.reasonId);
  return form.mode === "PAID_IN" && reason?.ledgerId ? `Blank = the reason's own ledger (${reason.ledgerName}).` : "";
}

/**
 * The mode a Ctrl+digit picks (Ctrl+1..4, the tiles' order); null for any
 * other key.
 */
export function modeForKey(event: { key: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): MovementMode | null {
  if (!event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return null;
  const index = ["1", "2", "3", "4"].indexOf(event.key);
  return index >= 0 ? MOVEMENT_MODES[index] : null;
}

/** Ctrl+Enter posts (Qt 2026-10-12); F10 still does. */
export function isPostKey(event: { key: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): boolean {
  if (event.altKey || event.shiftKey || event.metaKey) return false;
  return event.ctrlKey ? event.key === "Enter" : event.key === "F10";
}

/** A fresh form for a mode — Qt clears the count, the amount and every box (the PIN too) on a mode change. */
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
    witnessPin: "",
    count,
  };
}
