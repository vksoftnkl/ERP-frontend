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
import { computeIdentity, settledPaise } from "../domain/identity";
import { roundMoney, toPaise, toRupees } from "../domain/money";
import { isUnmirroredDeduction, linesThatTravel } from "../domain/roles";
import { buildCreditMemo } from "./build-draft";

export type PostPayloadInput = {
  header: ReceiptHeaderDraft;
  bills: readonly BillRow[];
  credits: readonly CreditRow[];
  otherLines: readonly OtherLineRow[];
  tenders: readonly import("../receipt.types").TenderRow[];
};

/**
 * Split `total` paise across the weights, exactly.
 *
 * Largest remainder: everybody gets the floor of their share, and the paise
 * left over go to the rows whose fractions were biggest. Without it, forty
 * bills each lose up to a paisa and the receipt is refused for the difference.
 */
export function spreadPaise(total: number, weights: readonly number[]): number[] {
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0 || weightTotal <= 0) {
    return weights.map(() => 0);
  }
  const exact = weights.map((weight) => (total * weight) / weightTotal);
  const floors = exact.map((value) => Math.floor(value));
  let left = total - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const entry of order) {
    if (left <= 0) {
      break;
    }
    floors[entry.index] += 1;
    left -= 1;
  }
  return floors;
}

/** Pinned deductions, totalled per bill. */
function pinnedByBill(otherLines: readonly OtherLineRow[]): Map<string, number> {
  const byBill = new Map<string, number>();
  for (const line of otherLines) {
    if (!isUnmirroredDeduction(line) || !line.againstBillId) {
      continue;
    }
    byBill.set(line.againstBillId, (byBill.get(line.againstBillId) ?? 0) + toPaise(line.amount));
  }
  return byBill;
}

export function buildAllocations(input: {
  bills: readonly BillRow[];
  otherLines: readonly OtherLineRow[];
}): PostReceiptAllocationBody[] {
  const pinned = pinnedByBill(input.otherLines);
  const unpinnedTotal = input.otherLines
    .filter((line) => isUnmirroredDeduction(line) && !line.againstBillId)
    .reduce((sum, line) => sum + toPaise(line.amount), 0);

  // The share is weighted by the MONEY placed on each bill — the spread
  // follows where the receipt actually settled, not how many rows it touched.
  const weights = input.bills.map((bill) => toPaise(bill.receive));
  const shares = spreadPaise(unpinnedTotal, weights);

  const rows: PostReceiptAllocationBody[] = [];
  input.bills.forEach((bill, index) => {
    const amount = toPaise(bill.receive) + (pinned.get(bill.billId) ?? 0) + shares[index];
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

/** The pins, numbered against the array `/create` actually sent. */
export function buildOtherLinePins(
  otherLines: readonly OtherLineRow[],
): PostReceiptOtherLinePinBody[] {
  const travelling = linesThatTravel(otherLines);
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
