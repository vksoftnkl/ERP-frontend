/**
 * Sale Tender — arithmetic. Pure: no React, no API, no wire shapes.
 *
 *   surcharge(base, master, perc) = base <= 0 ? 0 : base * perc / 100 + master.flat
 *   amount                        = base + surcharge
 *   tendered                      = Σ amount
 *   surchargeTotal                = Σ surcharge
 *   balance                       = tendered − surchargeTotal − documentAmount
 *
 * Two rules carry the whole screen:
 *
 *  - **The surcharge is the bank's cut, not the shop's takings.** It settles no
 *    part of the document, so it nets back out of the balance and EVERY
 *    comparison against the document amount is made on the `base`. Get this
 *    wrong and the screen refuses to settle a full bill on a card that carries
 *    a fee.
 *  - **The flat fee applies only once the row is used** (`base > 0`), so an
 *    untouched card row cannot quietly add ₹5 to the bill.
 *
 * **Deviation from the plan, deliberate (§11 / §13).** The plan keeps the keyed
 * amount as the row's `base` and hands change back as a separate `refundAmt`,
 * letting the DOCUMENT net it out. This backend cannot: `acc_bill_balance`'s
 * ADVANCE row is seeded from `Σ td_amount` and never sees the change, so a
 * ₹2,000 note against a ₹1,500 order would post a ₹2,000 advance and hold ₹500
 * that was handed straight back across the counter. Here the change comes out
 * of the row's own base instead — `td_amount` is what was KEPT, `td_change_amt`
 * what was returned, `td_received_amt` what was physically handed over — so
 * every server-side roll-up reads true. The document's net is unchanged either
 * way; only where the subtraction happens moves.
 */
import { money } from "@/domain/pricing";

/**
 * Why the dialog exists. Not a preference — the two are different
 * transactions: a settlement must cover the bill, an advance is partial by
 * nature.
 */
export type TenderPurpose = "settlement" | "advance";

/** The surcharge configuration a tender master row carries. */
export type SurchargeConfig = {
  /** Percent of the settled base. */
  perc: number;
  /** Flat fee, charged once the row is used at all. */
  flat: number;
};

/**
 * One tender row as the arithmetic sees it. `keyed` is what the cashier typed:
 * what the customer handed over on a change-capable row, what is being charged
 * on every other.
 */
export type TenderArithRow = {
  key: string;
  keyed: number;
  /** `givesChange(master)` — CASH always can, whatever the master says. */
  allowChange: boolean;
  surcharge: SurchargeConfig;
};

/** The five money figures each row persists (`td_*`). */
export type PricedTenderRow = {
  key: string;
  /** `tdAmount` — what settles the document. The keyed amount less its change. */
  base: number;
  /** `tdSurchargeAmt` — the fee, computed on the base. */
  surchargeAmt: number;
  /** `tdTotalAmt` = base + surcharge (`ck_td_total_amt` re-derives it). */
  amount: number;
  /** `tdReceivedAmt` — what physically crossed the counter. */
  received: number;
  /** `tdChangeAmt` — returned to the customer out of this row. */
  refundAmt: number;
};

export type TenderTotals = {
  /** Σ amount — gross, the fee included. → `soTenderAmt`. */
  tendered: number;
  /** Σ surcharge. → `soSurchargeAmt`. */
  surchargeTotal: number;
  /** Handed back. → the row's `tdChangeAmt`, and the balance box when positive. */
  refund: number;
  /** What actually settles the document: tendered − surcharge − refund. */
  settled: number;
  /** settled − documentAmount. Negative = still to collect. */
  balance: number;
};

export type TenderComputation = {
  rows: PricedTenderRow[];
  totals: TenderTotals;
};

/** Money-rounded surcharge on a settled base. An unused row carries no fee. */
export function surchargeOf(base: number, config: SurchargeConfig): number {
  if (base <= 0) {
    return 0;
  }
  return money((base * (config.perc || 0)) / 100 + (config.flat || 0));
}

/**
 * Price the rows against the document.
 *
 * Change: keying more than the document needs is only meaningful where change
 * can physically be handed back, so the overpayment is absorbed by the
 * change-capable rows in row order — which is the plan's "all of it out of the
 * first change-capable row" whenever that row can cover it, and degrades
 * safely (rather than driving a base negative) when it cannot.
 *
 * A document with NO value yet — an order still being keyed — has nothing to
 * overpay: every rupee is a deposit, and computing change against 0 would hand
 * the whole advance back and settle nothing.
 */
export function computeTenders(
  rows: TenderArithRow[],
  documentAmount: number,
): TenderComputation {
  const keyedTotal = rows.reduce((total, row) => total + Math.max(0, row.keyed), 0);
  let changeToGive =
    documentAmount > 0 ? Math.max(0, money(keyedTotal - documentAmount)) : 0;

  const priced: PricedTenderRow[] = rows.map((row) => {
    const keyed = Math.max(0, row.keyed);
    let refundAmt = 0;
    if (row.allowChange && changeToGive > 0) {
      refundAmt = Math.min(keyed, changeToGive);
      changeToGive = money(changeToGive - refundAmt);
    }
    const base = money(keyed - refundAmt);
    const surchargeAmt = surchargeOf(base, row.surcharge);
    const amount = money(base + surchargeAmt);
    return {
      key: row.key,
      base,
      surchargeAmt,
      amount,
      received: money(amount + refundAmt),
      refundAmt,
    };
  });

  const tendered = money(priced.reduce((total, row) => total + row.amount, 0));
  const surchargeTotal = money(priced.reduce((total, row) => total + row.surchargeAmt, 0));
  const refund = money(priced.reduce((total, row) => total + row.refundAmt, 0));
  // `tendered − surcharge − refund` reduces to Σ base because the change is
  // already out of every base above; summing the bases keeps it exact under
  // rounding.
  const settled = money(priced.reduce((total, row) => total + row.base, 0));

  return {
    rows: priced,
    totals: {
      tendered,
      surchargeTotal,
      refund,
      settled,
      balance: money(settled - Math.max(0, documentAmount)),
    },
  };
}

/**
 * Whether money keyed beyond the document can actually be handed back. CASH
 * always can whatever the master says — the drawer is exactly what change
 * comes out of, and taking a ₹500 note for a ₹470 bill is how a counter works.
 * Everything else goes by the master: a card or UPI collection returns nothing.
 */
export function givesChange(allowChange: boolean, typeCode: string): boolean {
  return allowChange || typeCode === "CASH";
}

/**
 * `soPayStatus`, decided by the NET — a fee closing the last rupee of the gap
 * does not make the order paid.
 */
export function payStatusOf(settled: number, documentAmount: number): "UNPAID" | "PARTIAL" | "PAID" {
  const epsilon = 0.005;
  if (settled <= epsilon) {
    return "UNPAID";
  }
  // A document with no value yet cannot be "paid": money taken against an
  // order still being keyed is a deposit on account. The save recomputes this
  // against the finished total.
  if (documentAmount <= epsilon) {
    return "PARTIAL";
  }
  return settled >= documentAmount - epsilon ? "PAID" : "PARTIAL";
}

/** How the balance box paints. One box, three states (the plan's §5). */
export type BalanceTone = "settled" | "short" | "over";

export type BalancePresentation = {
  tone: BalanceTone;
  caption: string;
  /** The figure to show — always a magnitude; the caption carries the sense. */
  value: number;
};

export function presentBalance(balance: number, purpose: TenderPurpose): BalancePresentation {
  const epsilon = 0.005;
  if (Math.abs(balance) <= epsilon) {
    return { tone: "settled", caption: "Refund", value: 0 };
  }
  if (balance < 0) {
    // On an advance a shortfall is the NORMAL case — it is what will be billed
    // later — so it is not painted as a problem.
    return {
      tone: "short",
      caption: purpose === "advance" ? "Balance to Collect" : "Balance",
      value: money(-balance),
    };
  }
  return { tone: "over", caption: "Refund", value: money(balance) };
}

/**
 * F1 — settle the outstanding balance with this row. The keyed base absorbs
 * whatever is still short; the surcharge is then recomputed from the master by
 * the ordinary pricing pass. Does nothing when nothing is outstanding.
 */
export function payBalanceWithRow(currentKeyed: number, balance: number): number {
  if (balance >= -0.005) {
    return currentKeyed;
  }
  return money(Math.max(0, currentKeyed - balance));
}

/**
 * The stored roll-ups have no `so_paid_amt` column, so the net a loaded order
 * was settled by is re-derived: tender − surcharge − refund.
 */
export function netSettledOf(tenderAmt: number, surchargeAmt: number, refundAmt: number): number {
  return money(tenderAmt - surchargeAmt - refundAmt);
}
