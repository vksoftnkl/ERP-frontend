/**
 * Sale Bill — the settlement roll-ups (§15.9). Pure, in paise.
 *
 *   counterPaid = tender − surcharge − refund − credit   // credit includes TEMP_CR (D5)
 *   paidAmt     = counterPaid + totalAdjusted
 *   balanceAmt  = bill − paidAmt
 *   payStatus   = PAID (paid ≥ bill > 0) · PARTIAL (paid > 0) · UNPAID
 *   payMode     = the type of the line with the largest amount
 *
 * With no tender lines (the plain route): a Credit term leaves `bill −
 * adjusted` on credit; a Cash term is paid at the counter, `ADVANCE` when the
 * set-offs cover the bill, else `CASH`. On load the counter part is
 * `sbPaidAmt − sbAdvanceAmt − sbNoteAdjAmt` — the stored figure INCLUDES the
 * set-offs, and before that fix an amend sent an advance twice as "paid".
 *
 * The server recomputes all of it at post and again on re-tender; what the
 * client sends is its proposal.
 */
import { money } from "@/domain/pricing";

const EPSILON = 0.005;

function paise(value: number): number {
  return Math.round(value * 100);
}

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

