/**
 * Void movement — Qt `TillMovementVoidDialog` (ec9d92d) without the widgets:
 * a supervisor voids one hand-posted cash movement — a drop, paid in,
 * exchange, pickup or top-up on the Session Cockpit's Money documents tab, or
 * a remittance on the Cash Office (notes 118).
 *
 * POST /till/movements/void: the voucher is mirrored (Rev), the row VOIDED
 * with a MOVEMENT_VOID reason (some need a note, `trs_needs_note`). Till
 * Sessions (273) OVERRIDE; a remittance needs Cash Office (287) OVERRIDE. The
 * server refuses what cannot go: a session with its final count, a bag
 * already received into the safe, a remittance the bank confirmed or whose
 * business day is closed, the open's float or the close's hand-over.
 */
import type { TillVoidMovementBody } from "./api/till-session-api";
import { reasonById, reasonsOf, type TillReason } from "./reasons";
import type { TillMovementFull } from "./wire/types";

/** The movement to void: its key, and what the dialog shows of it. */
export type MovementVoidRequest = {
  key: { companyId: string; branchId: string; accYear: string; tcmId: string };
  docNo: string;
  /** DROP · PAID_IN · EXCHANGE · PICKUP · TOP_UP · REMIT. */
  kind: string;
  amount: number;
};

export type MovementVoidForm = { reasonId: string; note: string };

export const EMPTY_MOVEMENT_VOID: MovementVoidForm = { reasonId: "", note: "" };

/** The hand-posted kinds a supervisor may void from the cockpit's Money documents tab. */
export const VOIDABLE_SESSION_KINDS = ["DROP", "PAID_IN", "EXCHANGE", "PICKUP", "TOP_UP"] as const;

/** Where the cash goes back to, and when the server says no. */
export function movementVoidInfo(kind: string): string {
  return kind === "REMIT"
    ? "The cash goes back into the safe. Not when the bank has confirmed it, or its day is closed."
    : "The cash goes back to where it came from. Not when the session has its final count, or a bag is already in the safe.";
}

/** The live MOVEMENT_VOID reasons. */
export function voidReasons(reasons: readonly TillReason[]): TillReason[] {
  return reasonsOf(reasons, "MOVEMENT_VOID");
}

export function voidNoteNeeded(reasons: readonly TillReason[], reasonId: string): boolean {
  return reasonById(reasons, reasonId)?.needsNote ?? false;
}

/** Why it cannot go yet, or "" — the button's tooltip (Qt `problem`). */
export function movementVoidProblem(form: MovementVoidForm, needsNote: boolean): string {
  if (!form.reasonId) return "Pick the reason.";
  if (needsNote && !form.note.trim()) return "This reason needs a note.";
  return "";
}

export function movementVoidBody(request: MovementVoidRequest, form: MovementVoidForm): TillVoidMovementBody {
  const note = form.note.trim();
  return { ...request.key, reasonId: form.reasonId, ...(note ? { notes: note } : {}) };
}

/** The server's sentence, rebuilt from the answer as the controller words it. */
export function movementVoidMessage(result: TillMovementFull): string {
  return `${result.tcmKind} ${result.tcmDocNo} voided`;
}
