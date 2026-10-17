/**
 * Waiting for approval — the approvers' inbox (Qt `TillApprovalInboxDialog`,
 * 425fa80, notes 124 §5) without the widgets: what Till Sessions (273) opens
 * from its toolbar. GET /till/approvals/pending for the header company ·
 * branch lists every kind the server waits on; the row texts, the head line
 * and who may decide are the shared `../shared/approval-gate.ts`. What is
 * here is the screen's own part:
 *
 *   the toolbar button   "Waiting for approval (3)", primary while any wait
 *   the pick             kept across a refresh by the row's key, else the first
 *   Open (Enter)         REQUEST → the decide dialog; SAFE_VARIANCE → a note
 *                        that Cash Office (287) decides it; a session's or a
 *                        received bag's cash gap → that session's Cockpit
 *                        (a route here: the inbox closes on the way)
 */
import { inboxButtonText, inboxRowKey, safeGapInfo } from "../shared/approval-gate";
import type { TillApprovalInboxItem, TillSessionKey } from "../shared/wire/types";

export type InboxScope = { companyId: string; branchId: string };

// ─── the toolbar button ──────────────────────────────────────────────────────

/**
 * The button on Till Sessions (Qt `TillSessionsView::refreshInboxCount`):
 * its caption, and the primary role while anything waits. `null` = not read
 * yet, or the read failed (Qt's -1): the plain caption.
 */
export function inboxButtonState(count: number | null): { text: string; primary: boolean } {
  const waiting = count !== null && count > 0 ? count : 0;
  return { text: inboxButtonText(waiting), primary: waiting > 0 };
}

// ─── the list ────────────────────────────────────────────────────────────────

export const INBOX_TITLE = "Waiting for approval";
export const INBOX_LOADING = "Loading…";
export const INBOX_READ_FAILED = "Could not read the list.";

/**
 * The current row after a (re)read: the one picked before, by its key, else
 * the first (Qt `fill`); -1 for an empty list.
 */
export function inboxPickedIndex(items: readonly TillApprovalInboxItem[], pickedKey: string | null): number {
  if (items.length === 0) return -1;
  const at = pickedKey === null ? -1 : items.findIndex((item) => inboxRowKey(item) === pickedKey);
  return at >= 0 ? at : 0;
}

// ─── opening a row ───────────────────────────────────────────────────────────

/** What Open does with a row (Qt `openRow`). */
export type InboxOpen =
  | { kind: "decide"; item: TillApprovalInboxItem }
  | { kind: "info"; title: string; text: string }
  | { kind: "cockpit"; key: TillSessionKey };

/** The info box's title after a decide (Qt `AppMessage::showInfo(tr("Approval"), …)`). */
export const DECIDED_TITLE = "Approval";
export const SAFE_GAP_TITLE = "Safe count gap";

/**
 * A REQUEST is approved or rejected here; a safe's count gap is decided in
 * Cash Office (287); a session's or a received bag's cash gap opens that
 * session's Cockpit — the inbox's company · branch, the row's year and
 * session (Qt `loadSession(tssId, accYear, company, branch)`). A gap row with
 * no session to open is null.
 */
export function inboxOpenOf(item: TillApprovalInboxItem | null, scope: InboxScope): InboxOpen | null {
  if (!item) return null;
  if (item.kind === "REQUEST") return { kind: "decide", item };
  if (item.kind === "SAFE_VARIANCE") return { kind: "info", title: SAFE_GAP_TITLE, text: safeGapInfo(item) };
  if (!item.tssId) return null;
  return {
    kind: "cockpit",
    key: { companyId: scope.companyId, branchId: scope.branchId, accYear: item.accYear, tssId: item.tssId },
  };
}

// ─── cancelling one's own request ────────────────────────────────────────────

/** Qt's `QInputDialog` over "Cancel my request". */
export const CANCEL_REQUEST_TITLE = "Cancel my request";
export const CANCEL_REQUEST_PROMPT = "Why do you no longer need it? (optional)";
