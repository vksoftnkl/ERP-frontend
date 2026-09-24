/**
 * `POST /opening-balances/bills` — one party's whole breakup.
 *
 * **`ablId` is load-bearing.** A bill without one is an INSERT, and re-sending
 * a bill this screen loaded without its id is refused outright by
 * `ux_abl_doc_refno`:
 *
 *     "'ADV/2025/118' is already an opening bill of this party for this year.
 *      Send its ablId to update it."
 *
 * So `replace: true` does NOT mean "here is the whole breakup, sort it out". It
 * means "anything I have not listed is gone". Only a genuinely new row leaves
 * out `ablId`, and the draft never rebuilds a loaded row without one.
 *
 * `ablPendingAmount`, `ablStatus` and `ablAllocAmount` are GENERATED or
 * server-derived and are never sent. `branchId` is required and is always the
 * session branch — the panel cannot be open under the company-level scope,
 * because `abl_branch_id` is NOT NULL.
 */
import { isBlankBill } from "../derived";
import type {
  BillRow,
  SaveOpeningBillRow,
  SaveOpeningBills,
  Scope,
} from "../opening-balance.types";
import { toWireDate } from "../wire/dates";
import { toBillWire } from "../wire/side";

export function buildBillRow(bill: BillRow): SaveOpeningBillRow {
  return {
    ...(bill.ablId ? { ablId: bill.ablId } : {}),
    ablDocRefno: bill.docRefno.trim(),
    ablDocDate: bill.docDate,
    ablDueDate: toWireDate(bill.dueDate),
    ablCreditDays: bill.creditDays,
    ablGraceDays: bill.graceDays,
    ablDrCr: toBillWire(bill.drCr) ?? "DR",
    ablBillAmount: bill.amount,
    ablNarration: bill.narration.trim() === "" ? null : bill.narration.trim(),
  };
}

export type BillsPayloadContext = {
  scope: Scope;
  partyId: string;
  /** The party's `acc_opening_balance` row. Omitted on its first save. */
  opId?: string | null;
};

export function buildBillsPayload(
  context: BillsPayloadContext,
  bills: readonly BillRow[],
): SaveOpeningBills {
  const { scope, partyId, opId } = context;
  if (!scope.branchId) {
    // Unreachable through the UI — the panel is shut under the company-level
    // scope — but a body with no branch is a 400, and failing here names why.
    throw new Error(
      "Opening bills are branch-scoped: a breakup cannot be saved under the company-level set.",
    );
  }
  return {
    companyId: scope.companyId,
    branchId: scope.branchId,
    accYear: scope.accYear,
    partyId,
    ...(opId ? { opId } : {}),
    bills: bills.filter((bill) => !isBlankBill(bill)).map(buildBillRow),
    replace: true,
  };
}
