/**
 * Beginning an AMEND: the bills grid becomes an open list again.
 *
 * A posted receipt shows only the bills it settled. That is right for reading
 * it and useless for correcting it — the most common correction is "this went
 * against the wrong bill", and the right bill is not on screen. So the amend
 * re-reads `/open-items` and puts this receipt's own settlement BACK on top of
 * it, which is the same add-back `net-allocations.ts` does for a posted
 * receipt, for the same reason: show the bill as it STOOD before this receipt.
 *
 * The two live side by side in `domain/` so they cannot drift.
 */
import type { BillRow, CreditRow } from "../receipt.types";
import { settledPaise } from "./identity";
import { toPaise, toRupees } from "./money";

export type AmendMergeResult = {
  bills: BillRow[];
  credits: CreditRow[];
  notes: string[];
};

export function mergeForAmend(input: {
  /** Freshly read, as the party stands today. */
  openBills: readonly BillRow[];
  openCredits: readonly CreditRow[];
  /** What the posted receipt did — `netAllocations` output. */
  baseline: readonly BillRow[];
  baselineCredits: ReadonlyArray<{ billId: string; billAccYear: string; amount: number }>;
  /** This receipt. Its own leftover advance must not be offered back. */
  voucherId: string;
}): AmendMergeResult {
  const notes: string[] = [];
  const baselineByBill = new Map(input.baseline.map((bill) => [bill.billId, bill]));
  const seen = new Set<string>();

  const bills = input.openBills.map((bill) => {
    const was = baselineByBill.get(bill.billId);
    if (!was) {
      return bill;
    }
    seen.add(bill.billId);
    return {
      ...bill,
      // Add this receipt's settlement back, so the row shows what the bill had
      // outstanding when it was taken.
      pendingAmount: toRupees(toPaise(bill.pendingAmount) + settledPaise(was)),
      receive: was.receive,
      discount: was.discount,
      writeOff: was.writeOff,
      roundOff: was.roundOff,
      writeoffApprovedBy: was.writeoffApprovedBy,
      receiveTyped: true,
    };
  });

  // A bill this receipt CLOSED is not in /open-items at all. It is appended
  // rather than sorted in: the server's order is the one the engine walks, and
  // this is a row the server did not send.
  for (const was of input.baseline) {
    if (seen.has(was.billId)) {
      continue;
    }
    bills.push({ ...was, pendingAmount: toRupees(settledPaise(was)), receiveTyped: true });
  }

  const baselineCreditById = new Map(
    input.baselineCredits.map((credit) => [credit.billId, credit]),
  );
  const credits = input.openCredits
    // Offering this receipt's OWN leftover advance back to itself is circular,
    // and the server recomputes the remainder anyway.
    .filter((credit) => credit.srcDocId !== input.voucherId)
    .map((credit) => {
      const was = baselineCreditById.get(credit.billId);
      if (!was) {
        return credit;
      }
      return {
        ...credit,
        // The credit was spent by this receipt, so what it "holds" today is
        // short by exactly that. Put it back before offering it again.
        pendingAmount: toRupees(toPaise(credit.pendingAmount) + toPaise(was.amount)),
        apply: was.amount,
        applyTyped: true,
      };
    });

  const missingCredits = input.baselineCredits.filter(
    (credit) => !credits.some((row) => row.billId === credit.billId),
  );
  if (missingCredits.length > 0) {
    notes.push(
      `${missingCredits.length} credit(s) this receipt spent are no longer listed against the ` +
        "party, so they cannot be re-applied here.",
    );
  }

  return { bills, credits, notes };
}
