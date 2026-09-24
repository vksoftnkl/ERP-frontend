/**
 * Reopening a DRAFT: the remembered settlement, clamped onto today's bills.
 *
 * A draft touched no bill (R10) — it wrote no `acc_bill_adjustment` row and
 * moved no `abl_pending_amount` — so `/open-items` is the truth and nothing has
 * to be added back. What `/get` returns in `allocations[]` is a MEMO
 * (`avh_draft_lines`), stored exactly as it was sent and never re-checked, on
 * purpose: staleness is the client's to handle, because only the client can
 * tell the operator about it.
 *
 * So each remembered figure is written into its row if it still fits, and
 * clamped if it does not — **money first**. A discount is a decision about a
 * balance that may no longer exist, and the money is what the customer
 * actually handed over.
 *
 * Whatever was clamped or dropped is REPORTED. Silently entering a smaller
 * number than the operator left is the worst of the available options.
 */
import type { BillRow, CreditRow } from "../receipt.types";
import { toPaise, toRupees } from "./money";

/** One remembered settlement, as `/get` hands it back on a draft. */
export type DraftMemoBill = {
  billId: string;
  billAccYear: string;
  amount: number;
  discount?: number;
  writeoff?: number;
  roundoff?: number;
};

export type DraftMemoCredit = { billId: string; amount: number };

export type MergeResult = {
  bills: BillRow[];
  credits: CreditRow[];
  /** What moved under the draft, in the operator's words. */
  notes: string[];
};

export function mergeDraftMemo(input: {
  bills: readonly BillRow[];
  credits: readonly CreditRow[];
  memoBills: readonly DraftMemoBill[];
  memoCredits: readonly DraftMemoCredit[];
}): MergeResult {
  const notes: string[] = [];
  const memoByBill = new Map(input.memoBills.map((memo) => [memo.billId, memo]));
  const memoByCredit = new Map(input.memoCredits.map((memo) => [memo.billId, memo]));

  const bills = input.bills.map((bill) => {
    const memo = memoByBill.get(bill.billId);
    if (!memo) {
      return bill;
    }
    const pending = toPaise(bill.pendingAmount);
    // Money first, then the reductions in the order they cost the company
    // least to lose: a write-off is the last thing to survive a clamp.
    const receive = Math.min(toPaise(memo.amount), pending);
    let left = pending - receive;
    const discount = Math.min(toPaise(memo.discount ?? 0), left);
    left -= discount;
    const writeOff = Math.min(toPaise(memo.writeoff ?? 0), left);
    left -= writeOff;
    const roundOff = Math.min(toPaise(memo.roundoff ?? 0), left);

    const wanted =
      toPaise(memo.amount) +
      toPaise(memo.discount ?? 0) +
      toPaise(memo.writeoff ?? 0) +
      toPaise(memo.roundoff ?? 0);
    if (wanted > receive + discount + writeOff + roundOff) {
      notes.push(
        `The draft has moved on — ${bill.docRefno} has been part-paid since, so ` +
          `${toRupees(wanted).toFixed(2)} no longer fits and ` +
          `${toRupees(receive + discount + writeOff + roundOff).toFixed(2)} has been kept.`,
      );
    }
    return {
      ...bill,
      receive: toRupees(receive),
      discount: toRupees(discount),
      writeOff: toRupees(writeOff),
      roundOff: toRupees(roundOff),
      // A remembered figure is one the operator chose, so Auto-allocate leaves
      // it where it is.
      receiveTyped: receive > 0 || discount > 0 || writeOff > 0 || roundOff > 0,
    };
  });

  // A bill the memo names that /open-items no longer lists has been closed by
  // somebody else. There is nothing to restore it onto.
  const listed = new Set(input.bills.map((bill) => bill.billId));
  for (const memo of input.memoBills) {
    if (!listed.has(memo.billId) && toPaise(memo.amount) > 0) {
      notes.push(
        `One bill this draft was holding ${toRupees(toPaise(memo.amount)).toFixed(2)} against ` +
          "has been closed since, so it is no longer listed.",
      );
    }
  }

  // Either half may be empty on its own. Returning early on empty bills is how
  // the Qt screen made an applied credit come back as zero.
  const credits = input.credits.map((credit) => {
    const memo = memoByCredit.get(credit.billId);
    if (!memo) {
      return credit;
    }
    const held = toPaise(credit.pendingAmount);
    const apply = Math.min(toPaise(memo.amount), held);
    if (apply < toPaise(memo.amount)) {
      notes.push(
        `${credit.docRefno} now holds only ${toRupees(held).toFixed(2)}, so the ` +
          `${toRupees(toPaise(memo.amount)).toFixed(2)} this draft was spending has been reduced.`,
      );
    }
    return { ...credit, apply: toRupees(apply), applyTyped: apply > 0 };
  });

  return { bills, credits, notes };
}
