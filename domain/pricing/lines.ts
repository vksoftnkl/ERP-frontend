/**
 * Pass 1 of the pricing pipeline: one item row, on its own, priced down to a
 * post-discount pre-tax goods value (`netGross`). Nothing here knows about
 * charges, the document, or the other lines.
 */
import { Dec, ZERO, dec, money, rate, safeDiv } from "./money";
import type { Line, VoucherPolicy } from "./types";
/** The three amounts `applyLineDiscounts` computed, plus what is left. */
export type LineDiscounts = {
  discAmt: Dec;
  splDiscAmt: Dec;
  schAmt: Dec;
  billSchDiscAmt: Dec;
  balance: Dec;
};
/** What pass 1 produces for a line. */
export type GoodsPricing = {
  netQty: Dec;
  /** Tax-exclusive rate per unit of net quantity. A divisor — 12 dp, not 2. */
  rateBeforeTax: Dec;
  grossAmt: Dec;
  netGross: Dec;
  discAmt: Dec;
  splDiscAmt: Dec;
  schAmt: Dec;
  billSchDiscAmt: Dec;
  freightAmt: Dec;
  loadingAmt: Dec;
};
/**
 * Net billable quantity in the rate's own unit:
 *   `caseQty * toBaseFactor + billQty * (lengthQty > 0 ? lengthQty : 1)`
 *
 * `lengthQty` doubles as a multiplier (cut-to-length goods) and as "not
 * applicable"; 0 means 1, which is why it cannot be folded into `toBaseFactor`.
 */
export function netBillableQty(
  caseQty: number,
  billQty: number,
  lengthQty: number,
  toBaseFactor: number,
): Dec {
  const length = dec(lengthQty);
  const multiplier = length.gt(0) ? length : dec(1);
  return dec(caseQty).times(dec(toBaseFactor)).plus(dec(billQty).times(multiplier));
}
/**
 * Extract the tax-exclusive rate out of a tax-inclusive one:
 *   `(inclusiveRate - cessPerUnit) / (1 + (gstPerc + cessPerc) / 100)`
 *
 * Per-unit cess is a flat adder, so it comes off before the percentage division.
 * An exclusive line returns the rate unchanged.
 */
export function baseRateOf(inclusiveRate: Dec, line: Line): Dec {
  if (!line.isInclusiveTax) {
    return inclusiveRate;
  }
  const divisor = dec(1).plus(dec(line.gstPerc).plus(dec(line.cessPerc)).div(100));
  const withoutPerUnitCess = inclusiveRate.minus(dec(line.cessPerUnit));
  return safeDiv(withoutPerUnitCess, divisor);
}
/**
 * The four line discounts, in order, each applied to the *running* balance:
 * item discount → special discount → scheme → bill scheme.
 *
 * Within the first three groups the operator keys exactly one of three columns.
 * A percentage wins, then a per-quantity rate, and a keyed amount is used only
 * when neither is set — which is what the Qt code does by writing the Amt cell
 * in the `perc > 0` / `perQty > 0` branches and always subtracting the cell.
 * The reducer's "clear the alternates" rule is what makes the choice
 * unambiguous on the way in.
 *
 * Bill scheme is percent-only.
 */
export function applyLineDiscounts(amount: Dec, line: Line, netQty: Dec): LineDiscounts {
  let balance = amount;
  const step = (percentage: number, perQty: number, keyed: number): Dec => {
    if (dec(percentage).gt(0)) {
      return balance.times(dec(percentage)).div(100);
    }
    if (dec(perQty).gt(0)) {
      return netQty.times(dec(perQty));
    }
    return dec(keyed);
  };
  const discAmt = step(line.discPerc, line.discPerQty, line.discAmt);
  balance = balance.minus(discAmt);
  const splDiscAmt = step(line.splDiscPerc, line.splDiscPerQty, line.splDiscAmt);
  balance = balance.minus(splDiscAmt);
  const schAmt = step(line.schPerc, line.schPerQty, line.schAmt);
  balance = balance.minus(schAmt);
  const billSchDiscAmt = dec(line.billSchDiscPerc).gt(0)
    ? balance.times(dec(line.billSchDiscPerc)).div(100)
    : ZERO;
  balance = balance.minus(billSchDiscAmt);
  return { discAmt, splDiscAmt, schAmt, billSchDiscAmt, balance };
}
/** The GST + cess block for one taxable amount. */
export type TaxBlock = {
  cgstAmt: Dec;
  sgstAmt: Dec;
  igstAmt: Dec;
  gstAmt: Dec;
  cessAmt: Dec;
  /** `amount + gstAmt + cessAmt` */
  taxed: Dec;
};
/**
 * `cess = amount * cessPerc / 100 + netQty * cessPerUnit`, then local supply
 * splits GST into cgst + sgst at their own percentages while an inter-state one
 * carries igst.
 */
export function applyGstAndCess(
  amount: Dec,
  line: Line,
  netQty: Dec,
  isLocal: boolean,
): TaxBlock {
  const cessAmt = amount
    .times(dec(line.cessPerc))
    .div(100)
    .plus(netQty.times(dec(line.cessPerUnit)));
  const cgstAmt = isLocal ? amount.times(dec(line.cgstPerc)).div(100) : ZERO;
  const sgstAmt = isLocal ? amount.times(dec(line.sgstPerc)).div(100) : ZERO;
  const igstAmt = isLocal ? ZERO : amount.times(dec(line.igstPerc)).div(100);
  const gstAmt = cgstAmt.plus(sgstAmt).plus(igstAmt);
  return { cgstAmt, sgstAmt, igstAmt, gstAmt, cessAmt, taxed: amount.plus(gstAmt).plus(cessAmt) };
}
/**
 * `policy.discountAlterBaseRate === true`: discount the keyed money first, then
 * extract tax out of the *discounted* rate.
 *
 * `grossAmt === netGross` on this path, deliberately, and documented as such in
 * the Qt source: the discount columns hold tax-inclusive money, so no
 * tax-exclusive gross reconciles with them. The consequence is that "savings"
 * (gross − netGross) reads 0 here. Do not "fix" it.
 */
function priceRowDiscountFirst(line: Line, netQty: Dec): GoodsPricing {
  const keyedValue = netQty.times(dec(line.rate));
  const discounts = applyLineDiscounts(keyedValue, line, netQty);
  const discountedRate = safeDiv(discounts.balance, netQty);
  const baseRate = baseRateOf(discountedRate, line);
  const goods = netQty.times(baseRate);
  return {
    netQty,
    rateBeforeTax: baseRate,
    grossAmt: goods,
    netGross: goods,
    discAmt: discounts.discAmt,
    splDiscAmt: discounts.splDiscAmt,
    schAmt: discounts.schAmt,
    billSchDiscAmt: discounts.billSchDiscAmt,
    freightAmt: ZERO,
    loadingAmt: ZERO,
  };
}
/**
 * `policy.discountAlterBaseRate === false`: extract tax out of the keyed rate
 * first, so `grossAmt` is the undiscounted tax-exclusive goods value, then
 * discount that.
 */
function priceRowStandard(line: Line, netQty: Dec): GoodsPricing {
  const baseRate = baseRateOf(dec(line.rate), line);
  const grossAmt = netQty.times(baseRate);
  const discounts = applyLineDiscounts(grossAmt, line, netQty);
  return {
    netQty,
    rateBeforeTax: baseRate,
    grossAmt,
    netGross: discounts.balance,
    discAmt: discounts.discAmt,
    splDiscAmt: discounts.splDiscAmt,
    schAmt: discounts.schAmt,
    billSchDiscAmt: discounts.billSchDiscAmt,
    freightAmt: ZERO,
    loadingAmt: ZERO,
  };
}
/**
 * Pass 1 for one line. The two orders agree on percentage discounts without
 * per-unit cess and diverge for per-quantity discounts and cess lines — that
 * divergence is the point of the setting, not a bug.
 *
 * Per-line freight and loading are computed here because they are per *net*
 * quantity: the rate is per unit of net quantity (`netGross = netQty × baseRate`)
 * so the item lookup's per-unit freight is in the same unit. They only reach the
 * bill through a charge row's role override (see `document.ts`) — never twice.
 */
export function priceRowGoods(line: Line, policy: VoucherPolicy): GoodsPricing {
  const netQty = netBillableQty(line.caseQty, line.billQty, line.lengthQty, line.toBaseFactor);
  // A zero net quantity would make every per-unit rate a division by zero. The
  // line is simply worth nothing yet; keep the extracted rate so the grid can
  // still show what the keyed rate is worth before tax.
  if (netQty.isZero()) {
    return {
      netQty,
      rateBeforeTax: baseRateOf(dec(line.rate), line),
      grossAmt: ZERO,
      netGross: ZERO,
      discAmt: ZERO,
      splDiscAmt: ZERO,
      schAmt: ZERO,
      billSchDiscAmt: ZERO,
      freightAmt: ZERO,
      loadingAmt: ZERO,
    };
  }
  const priced = policy.discountAlterBaseRate
    ? priceRowDiscountFirst(line, netQty)
    : priceRowStandard(line, netQty);
  return {
    ...priced,
    // `hasFreight` is the item's own "this line carries freight" flag; without
    // it a per-qty freight rate left over from a previous item must not bill.
    freightAmt: line.hasFreight ? netQty.times(dec(line.freightPerQty)) : ZERO,
    loadingAmt: netQty.times(dec(line.loadingPerQty)),
  };
}
/**
 * Round a pass-1 result the way the Qt grid stores it: currency cells at 2 dp,
 * the rate (a divisor) at 12. Exposed for tests and for the item grid, which
 * paints pass-1 columns before the document pass has anything to add.
 */
export function roundGoodsPricing(pricing: GoodsPricing) {
  return {
    netQty: pricing.netQty.toNumber(),
    rateBeforeTax: rate(pricing.rateBeforeTax),
    grossAmt: money(pricing.grossAmt),
    netGross: money(pricing.netGross),
    discAmt: money(pricing.discAmt),
    splDiscAmt: money(pricing.splDiscAmt),
    schAmt: money(pricing.schAmt),
    billSchDiscAmt: money(pricing.billSchDiscAmt),
    freightAmt: money(pricing.freightAmt),
    loadingAmt: money(pricing.loadingAmt),
  };
}