/**
 * Force close — Qt `TillForceCloseDialog` (c77f3f1, notes 117 §4) without the
 * widgets: a supervisor closes a session whose cashier has gone (OPEN,
 * SUSPENDED or COUNTING), opened from the Session Cockpit's Force close….
 *
 * POST /till/sessions/force-close: the server ends billing, takes this count
 * as the close count (at the cash office, no recount) and, within tolerance,
 * closes it — the hand-over is the supervisor's, which they may approve
 * (notes 116). Beyond tolerance the session waits for Approve.
 *
 * The FORCE_CLOSE rule (STORE_MANAGER): the caller's PIN, never the session's
 * cashier. A FORCE_CLOSE reason; some need a note (`trs_needs_note`).
 */
import type { TillForceCloseBody } from "../shared/api/till-session-api";
import { reasonById, reasonsOf, type TillReason } from "../shared/reasons";
import type { TillCountLine, TillForceCloseResult, TillSessionKey, TillSessionPayload } from "../shared/wire/types";
import type { DecideOption } from "./variance-decide";

export type SessionFacts = {
  sessionNo: string;
  cashier: string;
  counter: string;
  status: string;
  z: string;
};

/**
 * What the facts card reads: a cockpit's `/sessions/get` payload, or Open
 * Till's open-check session renamed to its keys (`openCheckFacts`).
 */
export type SessionFactsSource = Pick<TillSessionPayload, "tssSessionNo" | "operatorName" | "counterCode" | "tssStatus"> & {
  tssZNo?: number | null;
};

/** The facts card of the force-close and reopen dialogs. */
export function sessionFacts(s: SessionFactsSource): SessionFacts {
  return {
    sessionNo: s.tssSessionNo ?? "",
    cashier: s.operatorName ?? "",
    counter: s.counterCode ?? "",
    status: (s.tssStatus ?? "").replace(/_/g, " "),
    z: s.tssZNo === null || s.tssZNo === undefined ? "" : String(s.tssZNo),
  };
}

export const FORCE_CLOSE_BLIND_TEXT =
  "Count the drawer: every note and coin in it. Your count is the close count — there is no recount. Within " +
  "tolerance the session closes and its cash is yours to approve; beyond it the session waits for Approve.";

/** The usable reasons of one category, "Pick a reason" first. */
export function categoryReasons(reasons: readonly TillReason[], category: string): DecideOption[] {
  return [
    { value: "", label: "Pick a reason" },
    ...reasonsOf(reasons, category).map((reason) => ({ value: reason.id, label: reason.name })),
  ];
}

/** The picked reason asks for a note (`trs_needs_note`). */
export function noteNeeded(reasons: readonly TillReason[], reasonId: string): boolean {
  return reasonById(reasons, reasonId)?.needsNote ?? false;
}

export function notePlaceholder(needed: boolean): string {
  return needed ? "required for this reason" : "optional";
}

export type ForceCloseForm = { reasonId: string; note: string; pin: string };

export const EMPTY_FORCE_CLOSE: ForceCloseForm = { reasonId: "", note: "", pin: "" };

/** Why it cannot go yet, or "" — the button's tooltip (Qt `problem`). */
export function forceCloseProblem(form: ForceCloseForm, needsNote: boolean): string {
  if (!form.reasonId) return "Pick the reason.";
  if (needsNote && !form.note.trim()) return "This reason needs a note: what happened.";
  if (!form.pin) return "Type your till PIN: it signs the force close.";
  return "";
}

export function forceCloseHint(countedPaise: number): string {
  return countedPaise <= 0
    ? "An empty drawer counts as 0.00 — the whole expected cash becomes the difference."
    : "Never the session's cashier. The FORCE_CLOSE rule needs a store manager or above.";
}

export function forceCloseBody(key: TillSessionKey, form: ForceCloseForm, lines: TillCountLine[]): TillForceCloseBody {
  const note = form.note.trim();
  return { ...key, reasonId: form.reasonId, approverPin: form.pin, lines, ...(note ? { notes: note } : {}) };
}

/**
 * The server's own sentence (the controller's envelope `message`, which the
 * shared client does not hand back — rebuilt here from the same fields) and
 * Qt's line under it.
 */
export function forceCloseMessage(result: TillForceCloseResult): string {
  const no = result.session?.tssSessionNo ?? "";
  const head =
    result.outcome === "CLOSED"
      ? `Session ${no} force-closed — Z ${result.session?.tssZNo ?? ""}`
      : `Session ${no}: the count is out of tolerance and waits for a decision`;
  return (
    `${head}\n\nWithin tolerance the session is closed and its cash waits for Approve Cash; beyond it the session ` +
    "waits for Approve."
  );
}
