/**
 * The whole pricing pipeline, single direction, no circularity:
 *
 *   Pass 1    price every line on its own                    (`lines.ts`)
 *   basis     measure each line for charge distribution
 *   override  FREIGHT / LOADING per-line amounts, gated on the document flags
 *             and on the policy's calc type
 *   distribute charges, calling back for net totals           (`charges.ts`)
 *   Pass 2    finalise each line with its charge shares and tax
 *   totals    document sums, round-off and the two stat labels
 *
 * In the Qt client every handler had to end in exactly one
 * `recalcDocumentTotals()`. Here this function is a `useMemo` over the draft, so
 * it cannot be called twice or forgotten — the discipline is not ported, the
 * arithmetic is.
 */
import { Dec, dec, money, perc, percentOf, rate, roundToStep, safeDiv, sum } from "./money";
import { distribute } from "./charges";
import { applyGstAndCess, priceRowGoods, roundGoodsPricing } from "./lines";
import type {
  ChargeRole,
  ChargeRoleOverrides,
  ChargeRow,
  DocumentFlags,
  DocumentPricing,
  DocumentTotals,
  Line,
  LineBasis,
  LineChargeShare,
  PricedChargeRow,
  PricedLine,
  VoucherPolicy,
} from "./types";

/** A calc type of `MANUAL` means the operator types the charge in themselves. */
function isManualCalcType(calcType: string): boolean {
  return (calcType ?? "").trim().toUpperCase() === "MANUAL";
}

type RoundedGoods = ReturnType<typeof roundGoodsPricing>;

/**
 * Pass 2 for one line: add the charge shares, tax the result, and derive the
 * per-unit statistics.
 */
function finalizeLine(
  line: Line,
  goods: RoundedGoods,
  share: LineChargeShare,
  isLocal: boolean,
): PricedLine {
  const netQty = dec(goods.netQty);
  const chrgBeforeTax = money(share.beforeTax);
  const chrgAfterTax = money(share.afterTax);
  const taxableAmt = money(dec(goods.netGross).plus(dec(chrgBeforeTax)));

  const tax = applyGstAndCess(dec(taxableAmt), line, netQty, isLocal);
  const cgstAmt = money(tax.cgstAmt);
  const sgstAmt = money(tax.sgstAmt);
  const igstAmt = money(tax.igstAmt);
  const gstAmt = money(dec(cgstAmt).plus(dec(sgstAmt)).plus(dec(igstAmt)));
  const cessAmt = money(tax.cessAmt);

  const total = money(
    dec(taxableAmt).plus(dec(gstAmt)).plus(dec(cessAmt)).plus(dec(chrgAfterTax)),
  );

  const netPrice = money(safeDiv(dec(total), netQty));
  const netPriceBeforeTax = rate(safeDiv(dec(taxableAmt), netQty));

  const mrp = dec(line.mrp);
  const savingsPerc = mrp.gt(0) ? perc(percentOf(mrp.minus(dec(netPrice)), mrp)) : 0;

  return {
    ...line,
    netQty: goods.netQty,
    rateBeforeTax: goods.rateBeforeTax,
    grossAmt: goods.grossAmt,
    netGross: goods.netGross,
    discAmt: goods.discAmt,
    splDiscAmt: goods.splDiscAmt,
    schAmt: goods.schAmt,
    billSchDiscAmt: goods.billSchDiscAmt,
    freightAmt: goods.freightAmt,
    loadingAmt: goods.loadingAmt,
    chrgBeforeTax,
    chrgAfterTax,
    taxableAmt,
    cgstAmt,
    sgstAmt,
    igstAmt,
    gstAmt,
    cessAmt,
    total,
    netPrice,
    netPriceBeforeTax,
    savingsPerc,
    profit: money(dec(netPrice).minus(dec(line.costPrice))),
    profitBeforeTax: money(dec(netPriceBeforeTax).minus(dec(line.costBeforeTax))),
    // What the keyed rate gives away against the item's standard selling price:
    // positive when the line is sold above it.
    rateDiff: money(dec(line.rate).minus(dec(line.actualPrice))),
  };
}

function totalOf(rows: PricedChargeRow[], roles: ChargeRole[]): number {
  return money(
    sum(rows.filter((row) => roles.includes(row.role)).map((row) => dec(row.amountValue))),
  );
}

const NAMED_ROLES: ChargeRole[] = ["FREIGHT", "LOADING", "UNLOADING", "CASH_DISC"];

export function recalcDocument(
  lines: Line[],
  charges: ChargeRow[],
  policy: VoucherPolicy,
  flags: DocumentFlags,
): DocumentPricing {
  // ---- Pass 1 -------------------------------------------------------------
  const goods: RoundedGoods[] = lines.map((line) => roundGoodsPricing(priceRowGoods(line, policy)));

  const basis: LineBasis[] = lines.map((line, index) => ({
    netGross: goods[index].netGross,
    billQty: line.billQty,
    netQty: goods[index].netQty,
    weight: money(dec(line.weight).times(dec(line.billQty))),
    // The entry grids always keep one blank row waiting at the bottom. It names
    // no item, so it takes no share of any charge: without this a lump spread by
    // FLAT is divided by the blank row too, and every priced row above it
    // changes the instant the operator opens a new one.
    chargeable: Boolean(line.itemId),
  }));

  // ---- Role overrides -----------------------------------------------------
  // The per-line freight/loading columns only reach the bill through a charge
  // row carrying the matching role. If the operator turned the charge off, or
  // the policy says the amount is typed in by hand, the override is not offered
  // and the row prices by its own method instead.
  //
  // UNLOADING has no per-line column anywhere on this screen (the item grid
  // carries FreightPerQty and LoadingPerQty only), so it is never overridden —
  // an unloading charge row always prices by its own method. When a per-line
  // unloading column appears, it belongs here.
  const roleOverrides: ChargeRoleOverrides = {};
  if (flags.hasFreight && !isManualCalcType(policy.freightCalcType)) {
    roleOverrides.FREIGHT = goods.map((row) => row.freightAmt);
  }
  if (flags.hasLoad && !isManualCalcType(policy.loadingCalcType)) {
    roleOverrides.LOADING = goods.map((row) => row.loadingAmt);
  }

  // ---- Distribution -------------------------------------------------------
  const distribution = distribute(basis, charges, {
    roleOverrides,
    isLocal: flags.isLocalSale,
    // Pass 2 on a copy. In Qt this wrote the cells and re-read them, which is
    // only safe because the real pass 2 immediately overwrites them; here it is
    // a pure function returning numbers.
    netTotalOf: (shares) =>
      lines.map((line, index) => finalizeLine(line, goods[index], shares[index], flags.isLocalSale).total),
  });

  // ---- Pass 2 -------------------------------------------------------------
  const priced: PricedLine[] = lines.map((line, index) =>
    finalizeLine(line, goods[index], distribution.lines[index], flags.isLocalSale),
  );

  // ---- Totals -------------------------------------------------------------
  const totals = totalsOf(priced, distribution, policy);

  return { lines: priced, charges: distribution.rows, totals };
}

function totalsOf(
  priced: PricedLine[],
  distribution: ReturnType<typeof distribute>,
  policy: VoucherPolicy,
): DocumentTotals {
  const sumBy = (pick: (line: PricedLine) => Dec): Dec => sum(priced.map(pick));

  const grossAmt = sumBy((line) => dec(line.grossAmt));
  const netGross = sumBy((line) => dec(line.netGross));
  const itemDisc = sumBy((line) => dec(line.discAmt));
  const splDisc = sumBy((line) => dec(line.splDiscAmt));
  const schDisc = sumBy((line) => dec(line.schAmt));
  const billSchDisc = sumBy((line) => dec(line.billSchDiscAmt));
  const lineTaxable = sumBy((line) => dec(line.taxableAmt));
  const lineCgst = sumBy((line) => dec(line.cgstAmt));
  const lineSgst = sumBy((line) => dec(line.sgstAmt));
  const lineIgst = sumBy((line) => dec(line.igstAmt));
  const lineCess = sumBy((line) => dec(line.cessAmt));
  const lineTotal = sumBy((line) => dec(line.total));
  const totQty = sumBy((line) => dec(line.billQty));
  const totWeight = sumBy((line) => dec(line.weight).times(dec(line.billQty)));
  const totalCost = sumBy((line) => dec(line.costPrice).times(dec(line.netQty)));
  const totalProfit = sumBy((line) => dec(line.profit).times(dec(line.netQty)));
  const totalProfitBeforeTax = sumBy((line) => dec(line.profitBeforeTax).times(dec(line.netQty)));
  const totalLoyaltyPv = sumBy((line) => dec(line.loyaltyPv).times(dec(line.netQty)));
  const totalRateDiff = sumBy((line) => dec(line.rateDiff).times(dec(line.netQty)));

  // A free line is priced like any other and then its gross is taken back off
  // the bill. (The plan defines this as the gross amount of the `isFree` lines;
  // on the discount-first path `grossAmt === netGross`, so a free line deducts
  // its post-discount value there. If the Qt client ever proves to deduct
  // `grossAmt - netGross` instead, this one expression is the only place to
  // change.)
  const freeSchemeAmount = sum(
    priced.filter((line) => line.isFree).map((line) => dec(line.grossAmt)),
  );

  const chargeOwnTax = dec(distribution.cgst)
    .plus(dec(distribution.sgst))
    .plus(dec(distribution.igst))
    .plus(dec(distribution.cess));

  const docTaxable = lineTaxable.plus(dec(distribution.chargeTaxable));
  const docCgst = lineCgst.plus(dec(distribution.cgst));
  const docSgst = lineSgst.plus(dec(distribution.sgst));
  const docIgst = lineIgst.plus(dec(distribution.igst));
  const docCess = lineCess.plus(dec(distribution.cess));
  const docTax = docCgst.plus(docSgst).plus(docIgst).plus(docCess);

  const amount = lineTotal.minus(freeSchemeAmount).plus(chargeOwnTax);
  const bill = roundToStep(amount, policy.roundOffStep);

  // The two stat labels measure different things and must stay different.
  //
  // Saving is the customer's, against MRP. A line with no MRP is outside *both*
  // sides of the fraction.
  const mrpLines = priced.filter((line) => dec(line.mrp).gt(0));
  const savingAmt = sum(
    mrpLines.map((line) => dec(line.mrp).minus(dec(line.netPrice)).times(dec(line.netQty))),
  );
  const savingBase = sum(mrpLines.map((line) => dec(line.mrp).times(dec(line.netQty))));

  // Margin is the company's, pre-tax. Charge revenue is outside both sides.
  const marginAmt = totalProfitBeforeTax;

  return {
    grossAmt: money(grossAmt),
    netGross: money(netGross),
    itemDisc: money(itemDisc),
    splDisc: money(splDisc),
    schDisc: money(schDisc),
    billSchDisc: money(billSchDisc),
    lineTaxable: money(lineTaxable),
    lineCgst: money(lineCgst),
    lineSgst: money(lineSgst),
    lineIgst: money(lineIgst),
    lineCess: money(lineCess),
    lineTax: money(lineCgst.plus(lineSgst).plus(lineIgst).plus(lineCess)),
    lineTotal: money(lineTotal),
    totQty: dec(totQty).toNumber(),
    totWeight: money(totWeight),
    totItems: priced.filter((line) => line.itemId).length,
    totalCost: money(totalCost),
    totalProfit: money(totalProfit),
    totalProfitBeforeTax: money(totalProfitBeforeTax),
    totalLoyaltyPv: money(totalLoyaltyPv),
    totalRateDiff: money(totalRateDiff),
    freeSchemeAmount: money(freeSchemeAmount),

    freightAmt: totalOf(distribution.rows, ["FREIGHT"]),
    loadAmt: totalOf(distribution.rows, ["LOADING"]),
    unloadAmt: totalOf(distribution.rows, ["UNLOADING"]),
    cashDiscAmt: totalOf(distribution.rows, ["CASH_DISC"]),
    otherAmt: money(
      sum(
        distribution.rows
          .filter((row) => !NAMED_ROLES.includes(row.role))
          .map((row) => dec(row.amountValue)),
      ),
    ),

    chargeTaxable: distribution.chargeTaxable,
    chargeOwnTax: money(chargeOwnTax),
    afterTaxNonTaxable: distribution.afterTaxNonTaxable,
    docTaxable: money(docTaxable),
    docCgst: money(docCgst),
    docSgst: money(docSgst),
    docIgst: money(docIgst),
    docCess: money(docCess),
    docTax: money(docTax),
    amount: money(amount),
    roundOff: money(bill.minus(amount)),
    bill: money(bill),

    savingAmt: money(savingAmt),
    savingPerc: perc(percentOf(savingAmt, savingBase)),
    marginAmt: money(marginAmt),
    marginPerc: perc(percentOf(marginAmt, lineTaxable)),
  };
}

/**
 * The §3.5 reconciliation, as two numbers that must be equal. Asserted by every
 * golden test.
 *
 * `amount + freeSchemeAmount === docTaxable + docTax + afterTaxNonTaxable`
 *
 * Read left to right: what the bill adds up to from the lines, and what it adds
 * up to from the tax summary. An after-tax *taxable* charge reaches the bill
 * through its line shares and its tax through `chargeOwnTax`, so its amount is
 * inside `docTaxable` and must not be counted again — which is why only the
 * after-tax rows that carry no tax of their own appear on the right.
 */
export function reconcile(totals: DocumentTotals): { fromLines: number; fromTaxSummary: number } {
  return {
    fromLines: money(dec(totals.amount).plus(dec(totals.freeSchemeAmount))),
    fromTaxSummary: money(
      dec(totals.docTaxable).plus(dec(totals.docTax)).plus(dec(totals.afterTaxNonTaxable)),
    ),
  };
}
