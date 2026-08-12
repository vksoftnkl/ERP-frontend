/**
 * Sale Order — tender arithmetic. Pure: no React, no API, no wire shapes.
 *
 * The one rule everything below enforces (the plan's §5.1): **the surcharge is
 * never part of what settles the document.** A card fee is the company's income
 * for taking the card, not the customer's money against the order — so every
 * comparison against the document amount uses the base / settled figures, and
 * `payStatus` is decided by the net. The Qt client got this wrong in exactly one
 * place (the per-row ceiling compared the gross) and that bug is deliberately
 * not ported.
 *
 *   rowTotal   = base + surcharge(base, master)
 *   tendered   = Σ rowTotal            — what crossed the counter, fee included
 *   settled    = tendered − Σ surcharge − change   ( = Σ base )
 *   balance    = settled − documentAmount
 */
import { money } from "@/domain/pricing";

/**
 * Why the dialog exists. Not a preference — the two are different transactions:
 * a settlement must cover the bill, an advance is partial by nature.
 */
export type TenderPurpose = "settlement" | "advance";

/** The surcharge configuration a tender master row carries. */
export type SurchargeConfig = {
  /** Percent of the settled base. */
  perc: number;
  /** Flat fee per use of the tender. */
  flat: number;
};

/**
 * One tender row as the arithmetic sees it. `keyed` is what the operator typed
 * into the amount cell — for a cash row that is what the customer handed over,
 * which is why change can come out of it; for every other type it is the amount
 * charged and change never applies.
 */
export type TenderArithRow = {
  key: string;
  keyed: number;
  /** From the tender type (master override applied): may change be returned? */
  allowChange: boolean;
  surcharge: SurchargeConfig;
};

/** The five money figures each row persists (`td_*`), plus the change share. */
export type PricedTenderRow = {
  key: string;
  /** `tdAmount` — what settles the document. `keyed` minus this row's change. */
  base: number;
  /** `tdSurchargeAmt` — the fee, computed on the base. */
  surcharge: number;
  /** `tdTotalAmt` = base + surcharge (`ck_td_total_amt` insists). */
  total: number;
  /** `tdReceivedAmt` — what was physically handed: total + change. */
  received: number;
  /** `tdChangeAmt` — returned to the customer out of this row. */
  change: number;
};

export type TenderTotals = {
  /** Σ rowTotal — gross across the counter, net of change. → `soTenderAmt`. */
  tendered: number;
  /** Σ surcharge. → `soSurchargeAmt`. */
  surcharge: number;
  /** Returned to the customer. */
  change: number;
  /** What actually settles the document: tendered − surcharge − change. */
  settled: number;
  /** settled − documentAmount. Negative = still to collect. */
  balance: number;
};

export type TenderComputation = {
  rows: PricedTenderRow[];
  totals: TenderTotals;
};

/** Money-rounded surcharge on a settled base. Zero base carries no fee. */
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
 * change-allowed rows in row order (the Qt till attributes it to CASH). A row's
 * settled base is its keyed amount minus its change share; the surcharge is then
 * computed on that base — never on money that went straight back across the
 * counter.
 *
 * In advance mode nothing requires coverage, but the same change rule holds: an
 * operator who keys cash beyond the order's value is handing the difference
 * back, not banking it as a bigger advance.
 */
export function computeTenders(
  rows: TenderArithRow[],
  documentAmount: number,
): TenderComputation {
  const keyedTotal = rows.reduce((total, row) => total + Math.max(0, row.keyed), 0);
  let changeToGive = Math.max(0, money(keyedTotal - Math.max(0, documentAmount)));

  const priced: PricedTenderRow[] = rows.map((row) => {
    const keyed = Math.max(0, row.keyed);
    let change = 0;
    if (row.allowChange && changeToGive > 0) {
      change = Math.min(keyed, changeToGive);
      changeToGive = money(changeToGive - change);
    }
    const base = money(keyed - change);
    const surcharge = surchargeOf(base, row.surcharge);
    const total = money(base + surcharge);
    return {
      key: row.key,
      base,
      surcharge,
      total,
      received: money(total + change),
      change,
    };
  });

  const tendered = money(priced.reduce((total, row) => total + row.total, 0));
  const surcharge = money(priced.reduce((total, row) => total + row.surcharge, 0));
  const change = money(priced.reduce((total, row) => total + row.change, 0));
  // The formula's `tendered − surcharge − change` reduces to Σ base because
  // change is already out of every base above; summing the bases keeps the
  // identity exact under rounding.
  const settled = money(priced.reduce((total, row) => total + row.base, 0));
  const balance = money(settled - Math.max(0, documentAmount));

  return {
    rows: priced,
    totals: { tendered, surcharge, change, settled, balance },
  };
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
  return settled >= documentAmount - epsilon ? "PAID" : "PARTIAL";
}

/**
 * The per-row ceiling, settlement mode only: a row may not settle more than the
 * document still needs. Judged on the BASE — a card settling a full bill whose
 * fee takes the gross past the bill total is legal (the ported Qt bug refused
 * it). Advance mode has no ceiling: a customer may deposit any amount.
 */
export function rowExceedsDocument(
  base: number,
  settledByOtherRows: number,
  documentAmount: number,
  purpose: TenderPurpose,
): boolean {
  if (purpose !== "settlement") {
    return false;
  }
  const remaining = money(documentAmount - settledByOtherRows);
  return money(base) > money(remaining + 0.005);
}

/**
 * The stored roll-ups have no `so_paid_amt` column, so the net a loaded order
 * was settled by is re-derived: tender − surcharge − refund.
 */
export function netSettledOf(tenderAmt: number, surchargeAmt: number, refundAmt: number): number {
  return money(tenderAmt - surchargeAmt - refundAmt);
}
