/**
 * The equation the whole screen serves:
 *
 *     RECEIVED + DEDUCTIONS + CREDITS = ALLOCATED + ON ACCOUNT + ADDITIONS
 *
 * Post is refused while it is out by a paisa, and the server recomputes all six
 * figures and refuses the receipt anyway. So this is a PREVIEW of the server's
 * arithmetic, and the only thing that matters about it is that it does not
 * drift from it.
 *
 * ── A deduction is on BOTH sides ─────────────────────────────────────────
 * The customer withheld it, AND the bill went down by it. That is what makes
 * the worked example hold: 70,000 received + 1,400 TDS + 4,000 credit =
 * 70,750 allocated + 4,650 on account, with the 1,400 **inside** the 70,750.
 * The Qt screen once counted it on the left only, and every receipt with TDS
 * was out by the TDS.
 *
 * ── The mirrored three are already inside `settled()` ────────────────────
 * Discount, write-off and round-off are bill COLUMNS. Their role lines exist
 * so the left-hand side sees them, but adding them to ALLOCATED again leaves
 * the strip permanently out by the discount with nothing visibly wrong.
 * `isMirroredByBillColumn` is the same function here and in `allocate.ts` on
 * purpose: written twice, the two copies drift.
 */
import type { BillRow, CreditRow, OtherLineRow, TenderRow } from "../receipt.types";
import { sumOf, toPaise, toRupees } from "./money";
import { isAddition, isLegSplit, isMirroredByBillColumn, isSettlingDeduction } from "./roles";

export type IdentityInput = {
  bills: readonly BillRow[];
  credits: readonly CreditRow[];
  tenders: readonly TenderRow[];
  otherLines: readonly OtherLineRow[];
};

/** Every figure in rupees, rounded to paise. `difference` is SIGNED. */
export type ReceiptIdentity = {
  received: number;
  deductions: number;
  creditsApplied: number;
  allocated: number;
  onAccount: number;
  additions: number;
  /** left − right. Positive = received but not placed. */
  difference: number;
  balances: boolean;
};

/** What a bill has had placed against it, in paise. Receive is cash AND credit. */
export function settledPaise(bill: BillRow): number {
  return (
    toPaise(bill.receive) + toPaise(bill.discount) + toPaise(bill.writeOff) + toPaise(bill.roundOff)
  );
}

/** The same in rupees, for the grid's After column. */
export function settled(bill: BillRow): number {
  return toRupees(settledPaise(bill));
}

/** What a bill can still take. Never negative. */
export function roomPaise(bill: BillRow): number {
  return Math.max(0, toPaise(bill.pendingAmount) - settledPaise(bill));
}

export function room(bill: BillRow): number {
  return toRupees(roomPaise(bill));
}

/** `pending − settled` for the After column — the same figure, signed. */
export function afterSettlement(bill: BillRow): number {
  return toRupees(toPaise(bill.pendingAmount) - settledPaise(bill));
}

/** Profit less every reduction given on the bill. Live, as the operator types. */
export function netProfit(bill: BillRow): number | null {
  if (bill.billProfit === null) {
    return null;
  }
  return toRupees(
    toPaise(bill.billProfit) -
      toPaise(bill.discount) -
      toPaise(bill.writeOff) -
      toPaise(bill.roundOff),
  );
}

/** Half a paisa. Below this the two sides are the same figure. */
const TOLERANCE_PAISE = 0;

export function computeIdentity(input: IdentityInput): ReceiptIdentity {
  const received = sumOf(input.tenders, (tender) => tender.amount);
  const deductions = sumOf(
    input.otherLines.filter(isSettlingDeduction),
    (line) => line.amount,
  );
  const creditsApplied = sumOf(input.credits, (credit) => credit.apply);
  const additions = sumOf(input.otherLines.filter(isAddition), (line) => line.amount);

  // Every settling deduction the bills grid does NOT already carry as a column.
  // The mirrored three are inside `settledPaise` below; adding them here is
  // the bug that leaves the strip out by exactly the discount.
  const unmirroredDeductions = sumOf(
    input.otherLines.filter(
      (line) => isSettlingDeduction(line) && !isMirroredByBillColumn(line),
    ),
    (line) => line.amount,
  );
  const placed = input.bills.reduce((total, bill) => total + settledPaise(bill), 0);
  const allocated = placed + unmirroredDeductions;

  const left = received + deductions + creditsApplied;
  const right = allocated + additions;
  // On account is what is LEFT OVER, so it is computed with itself at zero and
  // never goes negative: a deficit is a deficit, not a negative advance.
  const onAccount = Math.max(0, left - right);
  const difference = left - (right + onAccount);

  return {
    received: toRupees(received),
    deductions: toRupees(deductions),
    creditsApplied: toRupees(creditsApplied),
    allocated: toRupees(allocated),
    onAccount: toRupees(onAccount),
    additions: toRupees(additions),
    difference: toRupees(difference),
    balances: Math.abs(difference) <= TOLERANCE_PAISE,
  };
}

/**
 * What the party owes once this receipt is in — the party band's third figure.
 *
 * **Not the Qt formula.** Qt computed `totalBalance − Σ settled()`, which
 * subtracts APPLIED CREDITS: but spending a credit moves nothing between the
 * party and us — the bill and the credit both shrink and the net is unchanged.
 * It also MISSED settling deductions with no bill column (TDS, claims), which
 * genuinely do reduce what the party owes.
 *
 * Derived from the identity instead: what actually leaves their account is the
 * money we received (less anything they paid on top) plus every deduction that
 * settles a bill — the mirrored three included, since a discount really does
 * reduce the debt.
 */
export function balanceAfterReceipt(
  totalBalance: number | null,
  identity: ReceiptIdentity,
): number | null {
  if (totalBalance === null) {
    return null;
  }
  const moved =
    toPaise(identity.received) - toPaise(identity.additions) + toPaise(identity.deductions);
  return toRupees(toPaise(totalBalance) - moved);
}

/** Whether a role line is money that never touches the identity at all. */
export { isLegSplit };
