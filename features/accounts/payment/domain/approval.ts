/**
 * The till approval gate on a payment — Qt `PaymentEntry::askApproval`
 * (425fa80), server notes 131.
 *
 * Cash paid out of a till drawer above the company's CASH_PAYMENT rule needs
 * an approver. As shipped (`till.approval_gate` WARN) the payment posts and a
 * request waits in the approvers' inbox; under REFUSE the one-call post
 * (`/payments/create` with `post: true`) answers 428 TILL_APPROVAL_REQUIRED —
 * the one refusal that does NOT roll everything back. The server KEEPS the
 * payment as a DRAFT and names it (srcDocType PAYMENT, srcDocId = its
 * avhVoucherId), so:
 *
 *   1. the screen adopts that id first (`keptDraftHeader`): whatever happens
 *      next, a retry — now, or later from the list — sends it as
 *      `avhVoucherId` and posts THAT draft, never a second copy;
 *   2. the "Needs approval" dialog asks for it (`paymentApprovalAsk`);
 *   3. APPROVED → the save-and-post goes again with `approvalId`; otherwise
 *      the operator is told the payment is kept as a draft.
 *
 * No React, no fetch.
 */
import { approvalAskOf, type ApprovalNeed, type ApprovalRequestState } from "@/features/sales/till/shared/approval-gate";
import type { PaymentHeaderDraft } from "../payment.types";

/** The rule cash paid at a till falls under, when the 428 names none. */
export const PAYMENT_APPROVAL_EVENT = "CASH_PAYMENT";

/** What the request names the payment as, when the 428 names nothing. */
export const PAYMENT_SRC_DOC_TYPE = "PAYMENT";

export const KEPT_AS_DRAFT_TITLE = "Kept as a draft";

export const KEPT_AS_DRAFT_TEXT =
  "The payment is saved as a draft and waits for the approval. Once it is approved, press Post again " +
  "(the same payment, or open it from the list with F8).";

/**
 * The header once a 428 named the draft it kept: that id, status DRAFT. A 428
 * that names none leaves the header as it was.
 */
export function keptDraftHeader(header: PaymentHeaderDraft, need: ApprovalNeed): PaymentHeaderDraft {
  if (!need.srcDocId) {
    return header;
  }
  return { ...header, voucherId: need.srcDocId, status: "DRAFT" };
}

/**
 * The "Needs approval" dialog for a 428 on `header` (the kept draft's, see
 * `keptDraftHeader`). The 428's event, amount and document type win; the
 * amount paid fills an amount it left out (Qt `m_identity.received`).
 */
export function paymentApprovalAsk(
  need: ApprovalNeed,
  header: PaymentHeaderDraft,
  paid: number,
): ApprovalRequestState {
  return approvalAskOf(need, {
    companyId: header.scope.companyId,
    branchId: header.scope.branchId,
    accYear: header.scope.accYear,
    event: PAYMENT_APPROVAL_EVENT,
    amount: paid,
    srcDocType: need.srcDocType || PAYMENT_SRC_DOC_TYPE,
    srcDocId: header.voucherId ?? "",
  });
}
