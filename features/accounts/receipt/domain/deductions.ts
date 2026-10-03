/**
 * Where the settling deductions land — the server engine's step 1, previewed.
 *
 * A TDS, a claim, a typed write-back: value that settles a bill without
 * arriving (or leaving) as money. The server reserves it on the bills BEFORE
 * any money is poured, and it does two things the client has to do exactly the
 * same way or `onAccount` disagrees by the overflow and the post is refused:
 *
 *  - **A pin is an instruction.** A line pinned to a bill lands on that bill,
 *    whole, and goes into that bill's allocation amount.
 *  - **An unpinned deduction fills ROOM, and no more** (notes 62 A1). It is
 *    spread over the bills this voucher settles, up to what they still have
 *    pending once the typed figures are on them; the part no bill has room for
 *    is held ON ACCOUNT with the money. That is TDS on an advance: 50,000 paid
 *    ahead to a 194C supplier is 49,500 of money and 500 of tax, and with no
 *    bill to land on the 500 is part of the advance. Counted as allocated in
 *    full, the client claimed 500 less on account than the server holds and
 *    every such voucher was refused.
 *
 * The spread follows the money placed on each bill (where the voucher actually
 * settled), falling back to the room itself when that would overfill a bill —
 * the Qt client's `allocationAmounts()`, to the paisa. Only bills the payload
 * SENDS take a share: room on a bill nobody touched is room the server never
 * offers the deduction.
 */
import type { BillRow } from "../receipt.types";
import { toPaise } from "./money";
import { unmirroredUnder, type RoleLine, type SettlementPolicy } from "./roles";

/**
 * What a bill has had placed against it, in paise. Receive is cash AND credit.
 *
 * Defined here rather than in `identity.ts` (which re-exports it) only so that
 * the identity can use the plan below without the two modules importing each
 * other.
 */
export function settledPaise(bill: BillRow): number {
  return (
    toPaise(bill.receive) + toPaise(bill.discount) + toPaise(bill.writeOff) + toPaise(bill.roundOff)
  );
}

export type DeductionLine = RoleLine & {
  amount: number;
  againstBillId: string | null;
};

export type DeductionPlan = {
  /** Per bill, in bill order: the pinned deductions on it, in paise. */
  pinned: number[];
  /** Per bill: its share of the unpinned deductions, in paise. */
  shares: number[];
  /** Unpinned deduction no bill had room for — the server holds it on account. */
  overflow: number;
};

/**
 * Split `total` paise across the weights, exactly.
 *
 * Largest remainder: everybody gets the floor of their share, and the paise
 * left over go to the rows whose fractions were biggest. Without it, forty
 * bills each lose up to a paisa and the voucher is refused for the difference.
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

export function planDeductions(
  bills: readonly BillRow[],
  otherLines: readonly DeductionLine[],
  policy: SettlementPolicy,
): DeductionPlan {
  const index = new Map(bills.map((bill, position) => [bill.billId, position]));
  const pinned = bills.map(() => 0);
  let unpinned = 0;
  for (const line of otherLines) {
    if (!unmirroredUnder(line, policy)) {
      continue;
    }
    const at = line.againstBillId ? index.get(line.againstBillId) : undefined;
    if (at === undefined) {
      // Unpinned — or pinned to a bill that is no longer listed, which the
      // reducer drops; either way it is the spread's to place.
      unpinned += toPaise(line.amount);
      continue;
    }
    pinned[at] += toPaise(line.amount);
  }

  // Room on the bills the payload sends, after the typed figures and the pins.
  const sent = bills.map((bill) => settledPaise(bill) > 0);
  const room = bills.map((bill, position) =>
    sent[position]
      ? Math.max(0, toPaise(bill.pendingAmount) - settledPaise(bill) - pinned[position])
      : 0,
  );
  const totalRoom = room.reduce((sum, value) => sum + value, 0);
  const placed = Math.min(unpinned, totalRoom);

  let shares = bills.map(() => 0);
  if (placed > 0) {
    const paid = bills.map((bill, position) =>
      sent[position] ? Math.max(0, toPaise(bill.receive)) : 0,
    );
    shares = spreadPaise(placed, paid);
    const fits =
      paid.some((value) => value > 0) && shares.every((share, position) => share <= room[position]);
    if (!fits) {
      shares = spreadPaise(placed, room);
    }
  }
  return { pinned, shares, overflow: unpinned - placed };
}
