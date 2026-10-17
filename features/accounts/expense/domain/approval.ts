/**
 * The till approval gate on an expense voucher — Qt
 * `ExpenseVoucherEntry::postSaved` (425fa80), server notes 124 §5.
 *
 * In a till session an expense above the company's EXPENSE rule needs an
 * approver. As shipped (`till.approval_gate` WARN) it posts and a request
 * waits in the approvers' inbox; a company on REFUSE answers `/expenses/post`
 * with 428 TILL_APPROVAL_REQUIRED instead. By then the voucher is a saved
 * DRAFT (Post saves, then posts by the key), so the screen asks for an
 * approval of THAT voucher (`ApprovalRequestDialog`) and, APPROVED, posts the
 * same key again with `approvalId`. Closed without one, the draft stays saved
 * and a later Post asks again — the inbox hands back the same request.
 *
 * `/expenses/validate` lists the same need as a refusal (field `approvalId`)
 * under REFUSE. It does not shut Post here: Post is where it is asked for.
 *
 * No React, no fetch.
 */
import {
  APPROVAL_REQUIRED_CODE,
  approvalAskOf,
  type ApprovalNeed,
  type ApprovalRequestState,
} from "@/features/sales/till/shared/approval-gate";
import type { ExpenseKeys, ExpenseRefusal, PostExpenseBody } from "../expense.types";

/** The rule an expense paid at a till falls under, when the 428 names none. */
export const EXPENSE_APPROVAL_EVENT = "EXPENSE";

/** What the request names the voucher as (the server's `EXPENSE_SRC_DOC_TYPE`). */
export const EXPENSE_SRC_DOC_TYPE = "EXPENSE";

/**
 * The "Needs approval" dialog for a 428 on `voucher` — the saved draft whose
 * post was refused. The 428's event and amount win; the tenders as typed fill
 * an amount it left out (Qt `tendersTyped()`).
 */
export function expenseApprovalAsk(
  need: ApprovalNeed,
  voucher: ExpenseKeys,
  tendersPaise: number,
): ApprovalRequestState {
  return approvalAskOf(need, {
    companyId: voucher.companyId,
    branchId: voucher.branchId,
    accYear: voucher.accYear,
    event: EXPENSE_APPROVAL_EVENT,
    amount: tendersPaise / 100,
    srcDocType: EXPENSE_SRC_DOC_TYPE,
    srcDocId: voucher.voucherId,
  });
}

/** `/expenses/post`'s body: the key, and the approval once there is one. */
export function expensePostBody(keys: ExpenseKeys, approvalId: string | null): PostExpenseBody {
  return {
    companyId: keys.companyId,
    branchId: keys.branchId,
    accYear: keys.accYear,
    voucherId: keys.voucherId,
    ...(approvalId ? { approvalId } : {}),
  };
}

/** The approval need, as `/validate` lists it under REFUSE. */
export function isApprovalRefusal(refusal: Pick<ExpenseRefusal, "code">): boolean {
  return refusal.code === APPROVAL_REQUIRED_CODE;
}

/**
 * The refusals that shut Post: all but the approval need, which Post itself
 * asks for. (Qt 425fa80 still counts it, so there Post never opens under
 * REFUSE and the 428 dialog cannot be reached.)
 */
export function refusalsThatShutPost<T extends Pick<ExpenseRefusal, "code">>(refusals: readonly T[]): T[] {
  return refusals.filter((refusal) => !isApprovalRefusal(refusal));
}
