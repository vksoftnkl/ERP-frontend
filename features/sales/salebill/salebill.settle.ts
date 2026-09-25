/**
 * Sale Bill Entry — settlement arithmetic (§15.4–15.9). Pure: no React, no
 * wire shapes. Everything is in paise, compared as integers.
 *
 *   surcharge(row, base) = base ≤ 0 ? 0 : base × perc/100 + flat   // flat once used
 *   row.amount           = base + surcharge                          // the cell keys BASE, shows GROSS
 *   tendered             = Σ amount       over rows except ADJUST
 *   surchargeSum         = Σ surchargeAmt over rows except ADJUST
 *   balance              = tendered − surchargeSum − billAmount
 *
 * The surcharge is the bank's cut. It settles nothing, so it is netted out of
 * the balance, and EVERY comparison against the bill uses the base.
 *
 * The ADJUST row is a read-only mirror of the set-offs. It never appears in
 * these rows, never carries a surcharge, and is never counted as tendered
 * (§1 fact 4). `billAmount` here is already net of the set-offs.
 */
import { money } from "@/domain/pricing";
import type { TenderDraftRow } from "@/features/sales/sale-order/sale-order.types";
import { givesChange } from "@/features/sales/sale-order/tender/arithmetic";
import type { BillAdjustmentRow, PartyLoyalty } from "./salebill.types";

const EPSILON = 0.005;

export function paise(value: number): number {
  return Math.round(value * 100);
}

/** One tender row as the settlement sees it. `keyed` is the BASE the cashier typed. */
export type SettleRow = Pick<
  TenderDraftRow,
  "key" | "keyed" | "typeCode" | "allowChange" | "surchargePerc" | "surchargeFlat"
>;

export type SettledRow = {
  key: string;
  base: number;
  surchargeAmt: number;
  /** base + surcharge — what is charged. */
  amount: number;
};

export type SettleTotals = {
  tendered: number;
  surchargeSum: number;
  /** tendered − surchargeSum − billAmount. < 0 short, > 0 change. */
  balance: number;
};

export function surchargeFor(base: number, perc: number, flat: number): number {
  if (base <= EPSILON) {
    return 0;
  }
  return money((base * (perc || 0)) / 100 + (flat || 0));
}

/** Price every row against the bill (§15.4). Nothing is routed as change yet. */
export function settleRows(rows: SettleRow[], billAmount: number): { rows: SettledRow[]; totals: SettleTotals } {
  const priced = rows.map((row) => {
    const base = Math.max(0, money(row.keyed));
    const surchargeAmt = surchargeFor(base, row.surchargePerc, row.surchargeFlat);
    return { key: row.key, base, surchargeAmt, amount: money(base + surchargeAmt) };
  });
  const tendered = money(priced.reduce((sum, row) => sum + row.amount, 0));
  const surchargeSum = money(priced.reduce((sum, row) => sum + row.surchargeAmt, 0));
  return {
    rows: priced,
    totals: { tendered, surchargeSum, balance: money(tendered - surchargeSum - Math.max(0, billAmount)) },
  };
}

/**
 * F1 (§15.4): fill the current row with the shortfall. `base = amount −
 * surcharge − balance` reduces to `currentBase − balance` when the balance is
 * negative. Nothing changes when nothing is short.
 */
export function fillShortfall(currentBase: number, balance: number): number {
  if (balance >= -EPSILON) {
    return currentBase;
  }
  return money(Math.max(0, currentBase - balance));
}

/**
 * Set-off is given back before change (§15.5): after any amount commit,
 * `excess = balance`, `adjusted = Σ set-off`. Both > 0 → release
 * `min(excess, adjusted)` NEWEST FIRST. A credit is never spent AND handed
 * back as change; only the excess beyond the set-off becomes change.
 */
export function releaseAdjustments(rows: BillAdjustmentRow[], amount: number): { rows: BillAdjustmentRow[]; released: number } {
  let left = Math.max(0, money(amount));
  if (left <= EPSILON) {
    return { rows, released: 0 };
  }
  const next = rows.map((row) => ({ ...row }));
  // Newest first: the panel lists oldest first, so walk from the end.
  for (let index = next.length - 1; index >= 0 && left > EPSILON; index -= 1) {
    const take = Math.min(next[index].amount, left);
    if (take <= 0) {
      continue;
    }
    next[index] = { ...next[index], amount: money(next[index].amount - take) };
    left = money(left - take);
  }
  const released = money(Math.max(0, amount) - left);
  return { rows: next.filter((row) => row.amount > EPSILON), released };
}

export type ChangeRouting = {
  /** `refundAmt` per row key. */
  refunds: Map<string, number>;
  /** Change that no row could hand back — the save refuses on it. */
  unrouted: number;
};

/**
 * Change routing on Save (§15.6): walk the rows in display order; the FIRST
 * change-capable row that is at least the change takes it all. A row at
 * amount 0 never takes change (Qt did, sending a CASH line with a negative
 * total — D3). Anything left is refused by the caller.
 */
export function routeChange(rows: SettleRow[], settled: SettledRow[], change: number): ChangeRouting {
  const refunds = new Map<string, number>();
  let left = Math.max(0, money(change));
  if (left <= EPSILON) {
    return { refunds, unrouted: 0 };
  }
  const baseOf = new Map(settled.map((row) => [row.key, row.base]));
  for (const row of rows) {
    const base = baseOf.get(row.key) ?? 0;
    if (base <= EPSILON || !givesChange(row.allowChange, row.typeCode)) {
      continue;
    }
    if (paise(base) >= paise(left)) {
      refunds.set(row.key, left);
      left = 0;
      break;
    }
  }
  return { refunds, unrouted: left };
}

/** TEMP_CR counts as credit in the roll-ups (D5) but never flips the term (§28 Q12). */
export function isCreditLike(typeCode: string): boolean {
  return typeCode === "CREDIT" || typeCode === "TEMP_CR";
}

export type SettlementOutcome = {
  /** Σ amount (excl. ADJUST, incl. surcharge) — what `sbTenderAmt` carries (C4). */
  tender: number;
  /** CREDIT + TEMP_CR bases. */
  credit: number;
  /** max(0, balance), routed onto one row. */
  refund: number;
  surcharge: number;
  refunds: Map<string, number>;
};

/** What the dialog hands back on Save (§15.6 output). */
export function settlementOutcome(rows: SettleRow[], billAmount: number): SettlementOutcome & { unrouted: number } {
  const { rows: settled, totals } = settleRows(rows, billAmount);
  const refund = Math.max(0, totals.balance);
  const routing = routeChange(rows, settled, refund);
  const baseOf = new Map(settled.map((row) => [row.key, row.base]));
  const credit = money(
    rows.filter((row) => isCreditLike(row.typeCode)).reduce((sum, row) => sum + (baseOf.get(row.key) ?? 0), 0),
  );
  return {
    tender: totals.tendered,
    credit,
    refund,
    surcharge: totals.surchargeSum,
    refunds: routing.refunds,
    unrouted: routing.unrouted,
  };
}

// ---------------------------------------------------------------------------
// Roll-ups (§15.9)
// ---------------------------------------------------------------------------

export type Rollups = {
  tenderAmt: number;
  surchargeAmt: number;
  refundAmt: number;
  creditAmt: number;
  /** What crossed the counter, net: tender − surcharge − refund − credit. */
  counterPaid: number;
  /** counterPaid + totalAdjusted. */
  paidAmt: number;
  balanceAmt: number;
  payStatus: "PAID" | "PARTIAL" | "UNPAID";
  payMode: string | null;
};

export type RollupInput = {
  bill: number;
  totalAdjusted: number;
  term: "CASH" | "CREDIT";
  /** The settled rows with their type and base, or empty on the plain route. */
  lines: Array<{ typeCode: string; base: number; amount: number }>;
  tender: number;
  credit: number;
  refund: number;
  surcharge: number;
};

export function payStatusOf(paid: number, bill: number): Rollups["payStatus"] {
  if (paise(bill) > 0 && paise(paid) >= paise(bill)) {
    return "PAID";
  }
  return paise(paid) > 0 ? "PARTIAL" : "UNPAID";
}

/**
 * The header figures on the payload. With tender lines: the dialog's
 * outcome. Without (the plain route): a Credit term leaves the whole balance
 * on credit; a Cash term is paid at the counter, `ADVANCE` when the set-offs
 * cover it, else `CASH`.
 */
export function rollupsOf(input: RollupInput): Rollups {
  const bill = Math.max(0, money(input.bill));
  const adjusted = Math.min(bill, Math.max(0, money(input.totalAdjusted)));
  if (input.lines.length === 0) {
    const open = money(bill - adjusted);
    if (input.term === "CREDIT") {
      const paid = adjusted;
      return {
        tenderAmt: 0,
        surchargeAmt: 0,
        refundAmt: 0,
        creditAmt: open,
        counterPaid: 0,
        paidAmt: paid,
        balanceAmt: money(bill - paid),
        payStatus: payStatusOf(paid, bill),
        payMode: "CREDIT",
      };
    }
    return {
      tenderAmt: open,
      surchargeAmt: 0,
      refundAmt: 0,
      creditAmt: 0,
      counterPaid: open,
      paidAmt: bill,
      balanceAmt: 0,
      payStatus: payStatusOf(bill, bill),
      payMode: open <= EPSILON && adjusted > EPSILON ? "ADVANCE" : "CASH",
    };
  }
  const counterPaid = money(input.tender - input.surcharge - input.refund - input.credit);
  const paid = money(counterPaid + adjusted);
  const largest = input.lines.reduce<{ typeCode: string; amount: number } | null>(
    (best, line) => (!best || line.amount > best.amount ? line : best),
    null,
  );
  return {
    tenderAmt: money(input.tender),
    surchargeAmt: money(input.surcharge),
    refundAmt: money(input.refund),
    creditAmt: money(input.credit),
    counterPaid,
    paidAmt: paid,
    balanceAmt: money(Math.max(0, bill - paid)),
    payStatus: payStatusOf(paid, bill),
    payMode: largest?.typeCode ?? null,
  };
}

/** On load, the counter part is `sbPaidAmt − sbAdvanceAmt − sbNoteAdjAmt` (§15.9). */
export function counterPaidOnLoad(paidAmt: number, advanceAmt: number, noteAdjAmt: number): number {
  return money(paidAmt - advanceAmt - noteAdjAmt);
}

// ---------------------------------------------------------------------------
// Loyalty (§15.7)
// ---------------------------------------------------------------------------

export type LoyaltyFacts = {
  member: boolean;
  rate: number;
  points: number;
  redeemable: number;
  worth: number;
  minPoints: number;
  maxRedeemAmount: number;
  multiple: number;
  usable: boolean;
  hint: string;
};

export function loyaltyFacts(input: {
  loyalty: PartyLoyalty | null;
  /** The customer's points from the master when not a member (`cust_points`). */
  fallbackPoints: number;
  masterRate: number;
  masterMinPoints: number;
  isWalkIn: boolean;
  /** customer allowLoyalty && the Loyalty tick. */
  loyaltyAllowed: boolean;
}): LoyaltyFacts {
  const member = input.loyalty !== null;
  const rate = member && (input.loyalty?.rate ?? 0) > 0 ? input.loyalty!.rate : input.masterRate || 1;
  const points = member ? input.loyalty!.balance : input.fallbackPoints;
  const redeemable = member ? Math.min(input.loyalty!.redeemable, points) : points;
  const worth = money(redeemable * rate);
  const minPoints = member ? input.loyalty!.minPoints : rate > 0 ? input.masterMinPoints / rate : 0;
  const multiple = member ? input.loyalty!.multiple || 1 : 1;
  const maxRedeemAmount = member ? input.loyalty!.maxRedeemAmount : 0;
  const redemptionAllowed = member ? input.loyalty!.allowPointRedeem : true;
  const usable = input.loyaltyAllowed && redemptionAllowed && worth > EPSILON && redeemable >= minPoints;
  let hint: string;
  if (input.isWalkIn) {
    hint = "Walk-in — no member. Add the customer to earn points.";
  } else if (!input.loyaltyAllowed) {
    hint = member
      ? `Loyalty is switched off for this customer (customer master) or unticked on this bill — ${points} points can't be redeemed here.`
      : "This customer is not on the loyalty scheme.";
  } else if (!member) {
    hint = "This customer is not on the loyalty scheme.";
  } else if (!redemptionAllowed) {
    hint = "The scheme does not allow redemption on this bill.";
  } else if (redeemable < minPoints) {
    hint = `Needs at least ${Math.ceil(minPoints)} points to redeem.`;
  } else {
    hint = `card ${input.loyalty!.cardNo ?? "—"} · max ${money(Math.min(worth, maxRedeemAmount > 0 ? maxRedeemAmount : worth)).toFixed(2)} on this bill · in multiples of ${multiple} pts`;
  }
  return { member, rate, points, redeemable, worth, minPoints, maxRedeemAmount, multiple, usable, hint };
}

/**
 * A redeem amount keyed on the LOYALTY row: capped at `worth`, and at
 * `maxRedeemAmount` for a member; the points are `amount / rate` floored to
 * `multiple`, and the amount is rewritten from them.
 */
export function loyaltyRedeem(
  amount: number,
  facts: LoyaltyFacts,
): { amount: number; points: number; refused: string | null } {
  if (amount <= EPSILON) {
    return { amount: 0, points: 0, refused: null };
  }
  if (facts.member && facts.maxRedeemAmount > 0 && amount > facts.maxRedeemAmount + EPSILON) {
    return { amount: 0, points: 0, refused: `The scheme allows at most ${facts.maxRedeemAmount.toFixed(2)} on this bill.` };
  }
  if (amount > facts.worth + EPSILON) {
    return { amount: 0, points: 0, refused: `Only ${facts.worth.toFixed(2)} of points is available.` };
  }
  const raw = facts.rate > 0 ? amount / facts.rate : 0;
  const multiple = facts.multiple > 0 ? facts.multiple : 1;
  const points = Math.floor(raw / multiple) * multiple;
  return { amount: money(points * facts.rate), points, refused: null };
}

// ---------------------------------------------------------------------------
// The identity box and the cash-limit line (§15.8 A, B)
// ---------------------------------------------------------------------------

export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const MICR_PATTERN = /^[0-9]{9}$/;

export function isValidPan(value: string): boolean {
  return PAN_PATTERN.test(value.trim().toUpperCase());
}

/** "Cash today from this party X + this bill Y = Z", hidden when both are 0. */
export function cashLimitLine(cashToday: number, cashThisBill: number): string | null {
  if (cashToday <= EPSILON && cashThisBill <= EPSILON) {
    return null;
  }
  const fmt = (value: number) => value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `Cash today from this party ${fmt(cashToday)} + this bill ${fmt(cashThisBill)} = ${fmt(money(cashToday + cashThisBill))}`;
}

/** Mobile matching the way the server does (D8): exact, after normalising. */
export function normaliseMobile(value: string): string {
  return value.replace(/[^0-9]/g, "");
}
