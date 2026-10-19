/**
 * Cash Movement (S3, rev 2) — Qt `TillCashMovementDialog` without the widgets:
 * every non-sale cash movement through a drawer, one document with one
 * voucher each.
 *
 *   Drop     the cashier's sealed bag to the safe: declared amount + bag +
 *            seal, no count now (the cash office verifies it)        TDrp
 *   Paid in  cash income with no party: reason, ledger, ref           TPIn
 *   Pickup   cash from the drawer into a supervisor's hand:
 *            reason, counted by note                                  TDrp
 *   Top-up   change a supervisor brings from the safe, counted        TFlt
 *
 * One `POST /till/movements/create` each, always by the session's cashier at
 * the counter (notes 110). A hand-over is two signatures, not "do +
 * approve": the cashier is logged in, the supervisor picks their name and
 * types their till PIN here, after the count — so neither can post one
 * without the other there. Pickup: the cashier gives, the supervisor
 * receives; Top-up the other way round.
 *
 * A drop goes only into the counter's own drop safe (the session's
 * `dropSafeName`); with none, the bag goes to a supervisor as a Pickup.
 */
import type { DocumentPrintTarget } from "@/features/printing/domain/documentPrint";
import { countLines, countedPaise, type DenomCountValue, type Denomination } from "../shared/denom";
import { formatMoney, paiseOf, paiseToNumber } from "../shared/money";
import { reasonById, reasonsOf, type TillReason } from "../shared/reasons";
import type { TillMovementBody } from "../shared/api/till-session-api";
import type { TillMovementDetail, TillSessionKey, TillSessionPayload, TillSupervisor } from "../shared/wire/types";

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
  PICKUP: "Cash to a supervisor",
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
  /** Notes 110, a hand-over: the supervisor at the counter (a `TillSupervisor.userId`), "" = none picked. */
  supervisorId: string;
  /** …and their own till PIN, which signs the counted amount. */
  supervisorPin: string;
  count: DenomCountValue;
};

export type MovementInputs = {
  form: MovementForm;
  /** `/sessions/get`; null while it is read. */
  session: TillSessionPayload | null;
  reasons: readonly TillReason[];
  denominations: readonly Denomination[];
  /** The signed-in user: a movement is entered by the session's own cashier (notes 110). */
  me: string;
  /** `GET /till/movements/supervisors` — who may sign a hand-over here; null while it is read. */
  supervisors: readonly TillSupervisor[] | null;
  /** Why that list did not load ("" when it did). */
  supervisorError: string;
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
 * Notes 110: cash changing hands between the cashier and a supervisor. Both
 * sign: the cashier by being logged in, the supervisor by name + till PIN.
 */
export function isHandOver(mode: MovementMode): boolean {
  return mode === "PICKUP" || mode === "TOP_UP";
}

/**
 * A drop goes only into the counter's own drop safe. A server without notes
 * 110 sends no `dropSafeName` at all: then a drop works as it did — and so
 * does a session not read yet (Qt reads an empty object the same way).
 */
export function hasDropSafe(session: TillSessionPayload | null): boolean {
  if (!session || !("dropSafeName" in session)) return true;
  return Boolean(session.dropSafeName?.trim());
}

export const NO_DROP_SAFE_TIP =
  "This counter has no drop safe: hand the bag to a supervisor as a Pickup (Till Safes, menu 280, marks a drop safe).";

/** The Drop tile's tip: the safe the bag goes into, or why the tile is off. */
export function dropTileTitle(session: TillSessionPayload | null): string {
  if (!hasDropSafe(session)) return NO_DROP_SAFE_TIP;
  const safe = session?.dropSafeName?.trim();
  return safe ? `Ctrl+1 · into ${safe}` : "Ctrl+1";
}

/**
 * The mode the dialog stays on once the session is read. Open Till opens on
 * Drop; with no drop safe that tile is off, and the bag goes to a supervisor
 * instead — so the dialog moves to Pickup rather than sit on a dead tile (Qt
 * stays on Drop and refuses the post).
 */
export function openingMode(mode: MovementMode, session: TillSessionPayload | null): MovementMode {
  return mode === "DROP" && !hasDropSafe(session) ? "PICKUP" : mode;
}

/** A supervisor by name: the full name, else the login (Qt's combo text). */
export function supervisorLabel(supervisor: TillSupervisor): string {
  return supervisor.fullName?.trim() || supervisor.loginName;
}

/** The supervisor picked, when they are on the list. */
export function pickedSupervisor(
  inputs: Pick<MovementInputs, "form" | "supervisors">,
): TillSupervisor | null {
  const id = inputs.form.supervisorId;
  if (!id) return null;
  return inputs.supervisors?.find((supervisor) => supervisor.userId === id) ?? null;
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
  // Notes 110: every kind is entered at the counter by the session's cashier
  // (the server refuses one from the office: TILL_MOVEMENT_AT_COUNTER).
  if (session.tssOperatorId !== inputs.me) {
    const cashier = session.operatorName?.trim();
    return `Cash movements are entered at the counter, logged in as the session's cashier${cashier ? ` (${cashier})` : ""}.`;
  }
  if (form.mode === "DROP" && !hasDropSafe(session)) {
    return "This counter has no drop safe: hand the bag to a supervisor as a Pickup.";
  }
  const needsReason = form.mode === "PAID_IN" || form.mode === "PICKUP";
  if (needsReason && !form.reasonId) return "Pick a reason.";
  if (form.mode === "DROP" && (!form.bagNo.trim() || !form.sealNo.trim())) {
    return "A drop is a sealed bag: enter its bag no and seal.";
  }
  const amount = movementAmount(inputs);
  if (amount <= 0) return isCounted(form.mode) ? "Count the cash, note by note." : "Enter the declared amount.";
  // The second signature, after the count (notes 110): the server re-checks
  // all of it (273 OVERRIDE, not the cashier, the PIN) on the post.
  if (isHandOver(form.mode)) {
    if (inputs.supervisors === null) return "Reading who can sign…";
    if (inputs.supervisors.length === 0) {
      return inputs.supervisorError || "No one can sign here: a supervisor needs the Till Sessions (273) override right.";
    }
    const supervisor = pickedSupervisor(inputs);
    if (!supervisor) return "Pick the supervisor who is here with you.";
    const name = supervisorLabel(supervisor);
    // Qt reads a missing hasPin as "has one": only an explicit false refuses.
    if (supervisor.hasPin === false) return `${name} has no till PIN: set one in User Administration (menu 58).`;
    if (!form.supervisorPin.trim()) return `${name} types their till PIN to sign.`;
  }
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
  if (isHandOver(form.mode)) {
    body.supervisorId = form.supervisorId;
    body.supervisorPin = form.supervisorPin.trim();
  }
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
  /**
   * A hand-over's two signatures (notes 110): Pickup — the cashier gives, the
   * supervisor receives; Top-up the reverse. "—" until the supervisor is picked.
   */
  givenBy: string;
  receivedBy: string;
  modeNote: string;
};

/** Under the supervisor's PIN (notes 110): the PIN signs the counted amount, so it comes after the count. */
export const SIGN_HINT =
  "Count first, in front of both of you. The supervisor then types their own till PIN — that signs the counted amount.";

/** `supervisorName`: the supervisor picked, "" for none yet. */
export function movementWords(
  mode: MovementMode,
  session: TillSessionPayload | null,
  supervisorName: string,
): MovementWords {
  const drop = mode === "DROP";
  const paidIn = mode === "PAID_IN";
  const pickup = mode === "PICKUP";
  const topUp = mode === "TOP_UP";
  const cashier = session?.operatorName ?? "";
  const supervisor = supervisorName || "—";
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
    givenBy: topUp ? supervisor : cashier,
    receivedBy: topUp ? cashier : supervisor,
    modeNote: drop
      ? "The cashier seals the bag and drops it in the drop safe. The cash office counts it later."
      : paidIn
        ? "Cash income with no party, e.g. scrap. An expense is an Expense voucher."
        : pickup
          ? "You hand cash to the supervisor, here at the counter. Both of you sign."
          : "The supervisor hands you change from the safe, here at the counter. Both of you sign.",
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

/**
 * A fresh form for a mode — Qt clears the count, the amount and every box on
 * a mode change, the supervisor's pick and PIN too (notes 110 `setMode`).
 */
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
    supervisorId: "",
    supervisorPin: "",
    count,
  };
}

// ─── the slip (Qt 3b5069d, notes 135 — post & print, TILL_DESIGN S3) ─────────

/** What the server answered, as the dialog says it: `PICKUP tpi00031 posted — 150.00.` */
export function movementPostedText(result: Pick<TillMovementDetail, "tcmKind" | "tcmDocNo" | "tcmAmount">): string {
  return `${result.tcmKind} ${result.tcmDocNo} posted — ${formatMoney(paiseOf(result.tcmAmount))}.`;
}

/** The question after the post: the slip both people sign. */
export function movementPrintQuestion(result: Pick<TillMovementDetail, "tcmKind" | "tcmDocNo" | "tcmAmount">): string {
  return `${movementPostedText(result)}\n\nPrint the slip now?`;
}

/** The download's name: `slip-<doc no>`, a "/" in the number as "-". */
export function slipFilename(docNo: string): string {
  return `slip-${docNo}`.replace(/\//g, "-");
}

export function slipLabel(docNo: string): string {
  return `Slip ${docNo}`;
}

/**
 * The movement as a print document (purpose TILL_MOVEMENT): docId = tcm_id,
 * with the session's company, year and branch (branch.profile prints the
 * letterhead) — Qt `PrintingModule::printDocuments` after the post.
 */
export function movementSlipTarget(
  movement: Pick<TillMovementDetail, "tcmId" | "tcmDocNo">,
  key: Pick<TillSessionKey, "companyId" | "branchId" | "accYear">,
): DocumentPrintTarget {
  return {
    docId: movement.tcmId,
    companyId: key.companyId,
    accYear: key.accYear,
    branchId: key.branchId,
    filename: slipFilename(movement.tcmDocNo),
  };
}
