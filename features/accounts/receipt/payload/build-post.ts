/**
 * `POST /receipts/post` — the settlement, as the server takes it.
 *
 * Three rules, each of which made a receipt unpostable when it was got wrong:
 *
 *  - **`amount` excludes discount, write-off and round-off.** They travel as
 *    their own fields beside it. Folding the round-off in made the server read
 *    it as cash, and every receipt with a round-off was refused for being out
 *    by exactly that amount (notes 34).
 *  - **`amount` INCLUDES the settling deductions.** A TDS the customer
 *    withheld settles the bill, so the bill's total settlement contains it —
 *    "money, TDS, claims and credits together", in the DTO's own words.
 *  - **Pins are numbered against the FILTERED list.** `lineNo` is a position
 *    in the array `/create` sent, and the mirrored roles are not in it.
 *    Numbered against the full list, a pin points at the wrong line as soon as
 *    a discount is on the receipt.
 *
 * The spread of unpinned deductions is the client's PREVIEW; the server
 * spreads them deterministically itself. It is still made exact here (largest
 * remainder, in paise) rather than left with a rounding tail, because an
 * `onAccount` that disagrees by a paisa is a refused post.
 */
import type {
  BillRow,
  CreditRow,
  OtherLineRow,
  PostReceiptAllocationBody,
  PostReceiptBody,
  PostReceiptOtherLinePinBody,
  ReceiptHeaderDraft,
} from "../receipt.types";
import { planDeductions, spreadPaise } from "../domain/deductions";
import { computeIdentity, settledPaise } from "../domain/identity";
import { roundMoney, toPaise, toRupees } from "../domain/money";
import {
  RECEIPT_SETTLEMENT,
  linesThatTravel,
  type RoleLine,
  type SettlementPolicy,
} from "../domain/roles";
import { buildCreditMemo } from "./build-draft";

/**
 * What the allocation and pin builders read off a line. Structural, so
 * Bill-wise Payment's own line rows go through the same two functions.
 */
export type PinnableLine = RoleLine & {
  amount: number;
  againstBillId: string | null;
  againstBillAccYear: string | null;
};

export type PostPayloadInput = {
  header: ReceiptHeaderDraft;
  bills: readonly BillRow[];
  credits: readonly CreditRow[];
  otherLines: readonly OtherLineRow[];
  tenders: readonly import("../receipt.types").TenderRow[];
};

/** The largest-remainder split now lives beside the plan that uses it. */
export { spreadPaise };

export function buildAllocations(
  input: {
    bills: readonly BillRow[];
    otherLines: readonly PinnableLine[];
  },
  policy: SettlementPolicy = RECEIPT_SETTLEMENT,
): PostReceiptAllocationBody[] {
  // The same plan the identity counted — pins whole, the unpinned spread up to
  // the bills' room — so `Σ amount + onAccount` here is the figure the strip
  // showed. What did not fit is not on any bill; it is in `onAccount`.
  const plan = planDeductions(input.bills, input.otherLines, policy);

  const rows: PostReceiptAllocationBody[] = [];
  input.bills.forEach((bill, index) => {
    const amount = toPaise(bill.receive) + plan.pinned[index] + plan.shares[index];
    const reductions = toPaise(bill.discount) + toPaise(bill.writeOff) + toPaise(bill.roundOff);
    if (amount === 0 && reductions === 0) {
      return;
    }
    rows.push({
      billId: bill.billId,
      billAccYear: bill.billAccYear,
      amount: toRupees(amount),
      discount: roundMoney(bill.discount),
      writeoff: roundMoney(bill.writeOff),
      roundoff: roundMoney(bill.roundOff),
      ...(bill.writeoffApprovedBy ? { writeoffApprovedBy: bill.writeoffApprovedBy } : {}),
    });
  });
  return rows;
}

/**
 * The pins, numbered against the array `/create` actually sent — which is why
 * the caller's own "which lines travel" rule is taken rather than assumed.
 */
export function buildOtherLinePins<TLine extends PinnableLine>(
  otherLines: readonly TLine[],
  travel: (lines: readonly TLine[]) => TLine[] = linesThatTravel,
): PostReceiptOtherLinePinBody[] {
  const travelling = travel(otherLines);
  const pins: PostReceiptOtherLinePinBody[] = [];
  travelling.forEach((line, index) => {
    if (!line.againstBillId || !line.againstBillAccYear || toPaise(line.amount) <= 0) {
      return;
    }
    pins.push({
      lineNo: index + 1,
      billId: line.againstBillId,
      billAccYear: line.againstBillAccYear,
      amount: roundMoney(line.amount),
    });
  });
  return pins;
}

export function buildPostPayload(input: PostPayloadInput): PostReceiptBody {
  const identity = computeIdentity({
    bills: input.bills,
    credits: input.credits,
    tenders: input.tenders,
    otherLines: input.otherLines,
  });
  return {
    avhVoucherId: input.header.voucherId ?? "",
    avhCompanyId: input.header.scope.companyId,
    avhBranchId: input.header.scope.branchId,
    avhAccYear: input.header.scope.accYear,
    // IN ORDER — the server's own bill order, which is the order the engine
    // walks. Re-sorting the grid would silently change the settlement.
    allocations: buildAllocations({ bills: input.bills, otherLines: input.otherLines }),
    creditsApplied: buildCreditMemo(input.credits),
    otherLineBills: buildOtherLinePins(input.otherLines),
    onAccount: identity.onAccount,
  };
}

/** What a bill has had placed on it, for a caller outside `domain/`. */
export { settledPaise };
