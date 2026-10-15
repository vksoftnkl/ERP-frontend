/**
 * Reopen — Qt `TillReopenDialog` (c77f3f1, notes 117 §5) without the widgets:
 * a CLOSED session back to COUNTING, opened from the Session Cockpit's Reopen.
 *
 * POST /till/sessions/reopen: the SESSION_REOPEN rule (STORE_MANAGER), the
 * caller's PIN, never its cashier; a REOPEN reason (some need a note). The
 * server voids the hand-over and reverses the close's variance vouchers, and
 * refuses while the business day is closed (TILL_DAY_CLOSED), once the cash is
 * approved into the safe (TILL_CASH_ALREADY_APPROVED), or while a later
 * session carries its float / its counter is busy (TILL_REOPEN_BLOCKED).
 * Reopened, Count / close (End Shift) closes it again; the Z is kept.
 */
import type { TillReopenBody } from "../shared/api/till-session-api";
import type { TillSessionKey, TillSessionReopenResult } from "../shared/wire/types";

export const REOPEN_HINT =
  "The hand-over is voided and the close's variance vouchers reversed — never deleted. The session goes back to " +
  "counting: Count / close (End Shift) closes it again, keeping its Z. Not once its cash is approved into the " +
  "safe, nor on a closed day.";

export type ReopenForm = { reasonId: string; note: string; pin: string };

export const EMPTY_REOPEN: ReopenForm = { reasonId: "", note: "", pin: "" };

/** Why it cannot go yet, or "" — the button's tooltip (Qt `problem`). */
export function reopenProblem(form: ReopenForm, needsNote: boolean): string {
  if (!form.reasonId) return "Pick the reason.";
  if (needsNote && !form.note.trim()) return "This reason needs a note: what was wrong.";
  if (!form.pin) return "Type your till PIN: it signs the reopen.";
  return "";
}

export function reopenBody(key: TillSessionKey, form: ReopenForm): TillReopenBody {
  const note = form.note.trim();
  return { ...key, reasonId: form.reasonId, approverPin: form.pin, ...(note ? { notes: note } : {}) };
}

/** The server's sentence (rebuilt from the answer, as the controller words it) and Qt's line under it. */
export function reopenMessage(result: TillSessionReopenResult): string {
  const s = result.session;
  return (
    `Session ${s?.tssSessionNo ?? ""} reopened (×${s?.tssReopenCount ?? ""})` +
    "\n\nCount / close (End Shift) closes it again; the Z number is kept."
  );
}
