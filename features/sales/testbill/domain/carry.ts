/**
 * Sale Bill — the charge carry (§12.4). Pure.
 *
 * An order's charges ride onto the bills raised against it, and how much of
 * each rides onto THIS bill is a server decision: `/validate` answers
 * `proposals.charges[]` keyed on the order's charge id and year. The client's
 * part is small and exact:
 *
 *  - on order import, stamp every row's carry facts BEFORE clearing its id
 *    (`srcCdId` = the order's `cdId`, `srcAccYear` = the order's year, basis
 *    PRORATA, `orderAmount`);
 *  - apply a proposal to a row whose basis is neither MANUAL nor NONE: if
 *    |amount − proposed| > 0.005, amount = proposed and rate = 0 (manual-amount
 *    mode);
 *  - the per-row basis menu: PRORATA · FULL (`max(0, orderAmount −
 *    carriedSoFar)`) · MANUAL · NONE (0);
 *  - emit the carry keys only on carried rows (that part is `payload/build-charges.ts`).
 */
import { money } from "@/domain/pricing";
import type { BillChargeRow, ChargeCarry, ChargeCarryBasis, ChargeCarryProposal } from "@/features/sales/testbill/types";

const EPSILON = 0.005;

/** The carry facts an order charge row starts with (§12.4, "stamp before clearing its id"). */
export function carryFromOrderCharge(
  source: { cdId: string; cdAmount: number | null },
  orderAccYear: string,
): ChargeCarry {
  return {
    srcCdId: source.cdId,
    srcAccYear: orderAccYear,
    basis: "PRORATA",
    orderAmount: money(source.cdAmount ?? 0),
    carriedSoFar: 0,
    proposed: 0,
    isFinalBill: false,
  };
}

function carryKey(srcCdId: string, srcAccYear: string): string {
  return `${srcCdId}|${srcAccYear}`;
}

/**
 * Apply `/validate`'s proposals (§12.4). Only rows whose basis is PRORATA or
 * FULL move; the server's `carriedSoFar` / `orderAmount` / `isFinalBill` are
 * refreshed on every carried row it names, whatever the basis. Returns the
 * same array when nothing changed, so a reducer can tell.
 */
export function applyCarryProposals(
  rows: BillChargeRow[],
  proposals: ChargeCarryProposal[],
): { rows: BillChargeRow[]; changed: boolean } {
  if (proposals.length === 0) {
    return { rows, changed: false };
  }
  const byKey = new Map(proposals.map((row) => [carryKey(row.cdSrcCdId, row.cdSrcAccYear), row]));
  let changed = false;
  const next = rows.map((row) => {
    const carry = row.carry;
    if (!carry) {
      return row;
    }
    const proposal = byKey.get(carryKey(carry.srcCdId, carry.srcAccYear));
    if (!proposal) {
      return row;
    }
    const facts: ChargeCarry = {
      ...carry,
      orderAmount: money(proposal.orderAmount || carry.orderAmount),
      carriedSoFar: money(proposal.carriedSoFar),
      proposed: money(proposal.proposed),
      isFinalBill: proposal.isFinalBill,
    };
    let updated: BillChargeRow = { ...row, carry: facts };
    if (carry.basis !== "MANUAL" && carry.basis !== "NONE") {
      const wanted = carry.basis === "FULL" ? fullCarryAmount(facts) : facts.proposed;
      if (Math.abs(money(row.amount) - wanted) > EPSILON) {
        updated = { ...updated, amount: wanted, rate: 0 };
      }
    }
    if (
      updated.amount !== row.amount ||
      updated.rate !== row.rate ||
      facts.orderAmount !== carry.orderAmount ||
      facts.carriedSoFar !== carry.carriedSoFar ||
      facts.proposed !== carry.proposed ||
      facts.isFinalBill !== carry.isFinalBill
    ) {
      changed = true;
      return updated;
    }
    return row;
  });
  return { rows: changed ? next : rows, changed };
}

/** FULL = what is left of the order's charge after the earlier bills. */
export function fullCarryAmount(carry: ChargeCarry): number {
  return money(Math.max(0, carry.orderAmount - carry.carriedSoFar));
}

/**
 * The per-row basis menu (§12.4). PRORATA takes the server's proposal (or
 * keeps the amount until one lands), FULL takes the remainder, NONE takes 0,
 * and MANUAL leaves the amount to the operator. Every basis but MANUAL prices
 * the row by total (rate 0), so the engine reads the amount as keyed.
 */
export function setCarryBasis(row: BillChargeRow, basis: ChargeCarryBasis): BillChargeRow {
  const carry = row.carry;
  if (!carry) {
    return row;
  }
  const facts = { ...carry, basis };
  switch (basis) {
    case "FULL":
      return { ...row, carry: facts, amount: fullCarryAmount(facts), rate: 0 };
    case "NONE":
      return { ...row, carry: facts, amount: 0, rate: 0 };
    case "PRORATA":
      return facts.proposed > 0 || facts.carriedSoFar > 0
        ? { ...row, carry: facts, amount: facts.proposed, rate: 0 }
        : { ...row, carry: facts };
    default:
      return { ...row, carry: facts };
  }
}

/** An Amount edit on a carried row makes it MANUAL (§12.1). */
export function carryAfterAmountEdit(row: BillChargeRow): BillChargeRow {
  if (!row.carry || row.carry.basis === "MANUAL") {
    return row;
  }
  return { ...row, carry: { ...row.carry, basis: "MANUAL" } };
}

/** The carried rows, for the strip beside the charge grid. */
export function carriedRows(rows: readonly BillChargeRow[]): BillChargeRow[] {
  return rows.filter((row) => Boolean(row.chgId) && Boolean(row.carry));
}
