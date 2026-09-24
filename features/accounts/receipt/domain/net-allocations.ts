/**
 * A POSTED (or CANCELLED) receipt's `allocations[]` → the rows the bills grid
 * shows.
 *
 * ── Why this is not a `map()` ────────────────────────────────────────────
 * `allocations[]` is the voucher's ADJUSTMENT HISTORY, not its current state.
 * `acc_bill_adjustment` never rewrites a row and never soft-deletes one: it
 * retracts by inserting the exact negative (`ck_abj_reversal_sign` makes that
 * the only legal shape). So after one amend, a receipt that settles two bills
 * comes back holding the original, its reversal AND the replacement — and
 * painted row by row, one bill appeared three times, once with **−2,000 in an
 * editable Receive cell**.
 *
 * Five rules, each of which the Qt port got wrong at least once:
 *
 *  1. Group by `billId`, keeping the order the server first mentions each bill
 *     (the order the posting engine walked).
 *  2. Route by `adjType` into COLUMNS, and skip a type this client does not
 *     know rather than folding it into Receive. (The payload carries no
 *     `discount` / `writeoff` fields — Qt once read keys that never existed.)
 *  3. SUM, do not filter on `isReversed`. A reversal is by constraint the
 *     exact negative of what it retracts, so summing is exact; filtering on
 *     the flag loses the leftover amount of a PARTIAL reversal.
 *  4. Add the settlement back to `pendingAmount` — but only the MATURED part.
 *     `pendingAmount` arrives as it stands NOW, already net of this receipt,
 *     and the grid has to show the bill as it STOOD. A post-dated cheque never
 *     moved `abl_pending_amount`, so there is nothing to undo: `rct00018` put
 *     800 post-dated against a bill showing 5,380, and a blind add-back paints
 *     6,180 — a figure that bill has never carried. The held part goes to the
 *     PDC held column instead.
 *  5. Drop bills that net to zero: a correction emptied them and this receipt
 *     no longer touches them.
 */
import type { BillRow, ReceiptAllocationWire } from "../receipt.types";
import { billColumnOf } from "./adj-type";
import { toPaise, toRupees } from "./money";

type Accumulator = {
  row: BillRow;
  receive: number;
  discount: number;
  writeOff: number;
  roundOff: number;
  /** The part of this receipt's settlement that has NOT matured. */
  held: number;
};

function seedRow(entry: ReceiptAllocationWire): BillRow {
  return {
    billId: entry.billId,
    billAccYear: entry.billAccYear,
    billType: entry.billType ?? "SALES",
    docRefno: entry.docRefno,
    // `/get` carries no customer reference, no overdue count and no profit:
    // what a posted receipt shows is what it DID, and those belong to the
    // open-items view of a party. Blank is the honest answer, not zero.
    usrRefno: "",
    docDate: entry.docDate ?? "",
    dueDate: entry.dueDate,
    daysOverdue: 0,
    billAmount: entry.billAmount ?? 0,
    pendingAmount: entry.pendingAmount ?? 0,
    status: entry.status ?? "OPEN",
    pdcHeld: 0,
    ppdSuggested: 0,
    tcsAmount: 0,
    tcsPending: 0,
    billProfit: null,
    receive: 0,
    discount: 0,
    writeOff: 0,
    roundOff: 0,
    receiveTyped: false,
    writeoffApprovedBy: entry.approvedBy,
    note: "",
  };
}

export function netAllocations(allocations: readonly ReceiptAllocationWire[]): BillRow[] {
  const byBill = new Map<string, Accumulator>();

  for (const entry of allocations) {
    const column = billColumnOf(entry.adjType);
    if (column === null) {
      continue;
    }
    let bucket = byBill.get(entry.billId);
    if (!bucket) {
      bucket = { row: seedRow(entry), receive: 0, discount: 0, writeOff: 0, roundOff: 0, held: 0 };
      byBill.set(entry.billId, bucket);
    }
    const amount = toPaise(entry.amount);
    bucket[column] += amount;
    // `matured` absent means true — an ordinary row that settled at once.
    if (entry.matured === false) {
      bucket.held += amount;
    }
  }

  const rows: BillRow[] = [];
  for (const bucket of byBill.values()) {
    const settled = bucket.receive + bucket.discount + bucket.writeOff + bucket.roundOff;
    if (settled === 0) {
      continue;
    }
    // Only what actually moved the bill is added back.
    const matured = settled - bucket.held;
    rows.push({
      ...bucket.row,
      pendingAmount: toRupees(toPaise(bucket.row.pendingAmount) + matured),
      pdcHeld: toRupees(bucket.held),
      receive: toRupees(bucket.receive),
      discount: toRupees(bucket.discount),
      writeOff: toRupees(bucket.writeOff),
      roundOff: toRupees(bucket.roundOff),
      // Every figure on a loaded receipt is one the operator chose. Marking
      // them typed is what stops Auto-allocate rearranging a posted receipt
      // the moment an amend begins.
      receiveTyped: true,
    });
  }
  return rows;
}

/**
 * The credits half of the same payload.
 *
 * On a POSTED receipt a `creditsApplied` row names the INVOICE it settled in
 * `billId` and the credit it spent in `againstBillId`. On a DRAFT it is the
 * other way round — `billId` IS the credit and `againstBillId` is null —
 * because that is genuinely all the operator has chosen: which invoices a
 * credit ends up settling is decided by the engine at post, and a draft has
 * not run it.
 */
export function netCreditsApplied(
  creditsApplied: readonly ReceiptAllocationWire[],
  isDraft: boolean,
): Array<{ billId: string; billAccYear: string; docRefno: string; amount: number }> {
  const byCredit = new Map<
    string,
    { billId: string; billAccYear: string; docRefno: string; amount: number }
  >();
  for (const entry of creditsApplied) {
    const creditId = isDraft ? entry.billId : (entry.againstBillId ?? entry.billId);
    const refno = isDraft ? entry.docRefno : (entry.againstBillRefno ?? entry.docRefno);
    const found = byCredit.get(creditId);
    if (found) {
      found.amount = toRupees(toPaise(found.amount) + toPaise(entry.amount));
      continue;
    }
    byCredit.set(creditId, {
      billId: creditId,
      billAccYear: entry.billAccYear,
      docRefno: refno,
      amount: entry.amount,
    });
  }
  return [...byCredit.values()].filter((entry) => toPaise(entry.amount) !== 0);
}
