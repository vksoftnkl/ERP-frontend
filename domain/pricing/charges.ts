/**
 * Additional-charge distribution — the port of `ChargeGridController::distribute`.
 *
 * Every rule in here was a bug that was already fixed once in the Qt client, so
 * each one is called out where it is implemented rather than summarised away.
 */
import { Dec, ZERO, dec, money, sum } from "./money";
import type {
  ChargeApplyOn,
  ChargeRole,
  ChargeDistribution,
  ChargeRoleOverrides,
  ChargeRow,
  LineBasis,
  LineChargeShare,
  PricedChargeRow,
} from "./types";

export type DistributeOptions = {
  /**
   * `role -> per-line amounts`. A charge row whose role is present uses those
   * amounts instead of its own method computation — this is how weight-band
   * freight and per-item loading reach the bill without being re-flattened.
   */
  roleOverrides?: ChargeRoleOverrides;
  /**
   * Pre-discount net total per line, given the charge shares accumulated so
   * far. The engine prices every goods-basis row, calls back with those shares,
   * and the host runs pass 2 on a copy to answer — so multiple after-tax
   * discounts all measure the *same* pre-discount total. No compounding, and
   * the result does not depend on the row order.
   */
  netTotalOf: (shares: LineChargeShare[]) => number[];
  /** Place of supply is the company's own state (drives the row's own GST split). */
  isLocal: boolean;
};

/**
 * A DEDUCT row that is not before-tax is a discount off the already-taxed bill,
 * so it is measured against each line's net total. Every other row is measured
 * against the line's post-discount pre-tax goods value.
 */
function usesNetTotalBasis(row: ChargeRow): boolean {
  return row.type === "DEDUCT" && !row.beforeTax;
}

/**
 * `rate === 0 && amount !== 0` means the operator priced the charge by total.
 * Spread that amount by `applyOn` instead of recomputing it from the method.
 */
function isManualAmount(row: ChargeRow): boolean {
  return dec(row.rate).isZero() && !dec(row.amount).isZero();
}

function weightsFor(basis: LineBasis[], basisValues: Dec[], applyOn: ChargeApplyOn): Dec[] {
  switch (applyOn) {
    case "QTY":
      return basis.map((line) => dec(line.billQty));
    case "WEIGHT":
      return basis.map((line) => dec(line.weight));
    case "VALUE":
      return basisValues;
    case "FLAT":
    default:
      return basis.map(() => dec(1));
  }
}
/**
 * Spread a lump sum across the lines. `applyOn` matters *only* here — for every
 * other method it is not a basis at all.
 *
 * The residue of the division lands on the last line so the shares add back up
 * to the lump exactly. When the chosen basis totals zero (a WEIGHT spread over
 * weightless lines, a VALUE spread over a document that is still all zeros) the
 * spread falls back to equal shares: the Qt code divides by zero there and the
 * charge silently vanishes off the bill, which is worse than an even split.
 */
function spreadLump(
  lump: Dec,
  basis: LineBasis[],
  basisValues: Dec[],
  applyOn: ChargeApplyOn,
): Dec[] {
  if (basis.length === 0) {
    return [];
  }
  let weights = weightsFor(basis, basisValues, applyOn);
  let total = sum(weights);
  if (total.isZero()) {
    weights = basis.map(() => dec(1));
    total = dec(basis.length);
  }
  const shares: Dec[] = [];
  let allocated = ZERO;
  for (let index = 0; index < basis.length; index += 1) {
    if (index === basis.length - 1) {
      shares.push(lump.minus(allocated));
      break;
    }
    const share = dec(money(lump.times(weights[index]).div(total)));
    shares.push(share);
    allocated = allocated.plus(share);
  }
  return shares;
}
/**
 * Method → per-line amount:
 *   FIXED    lump sum, spread by `applyOn`
 *   QTY      billQty × rate
 *   NET_QTY  netQty × rate
 *   KG/QTL/TON  weight × rate  (no unit conversion — the rate is quoted in the
 *               charge's own unit, exactly as the Qt client treats it)
 *   PERCENT  basis × rate / 100
 */
function shareByMethod(row: ChargeRow, basis: LineBasis[], basisValues: Dec[]): Dec[] {
  const chargeRate = dec(row.rate);
  if (isManualAmount(row)) {
    return spreadLump(dec(row.amount), basis, basisValues, row.applyOn);
  }
  switch (row.method) {
    case "FIXED":
      return spreadLump(chargeRate, basis, basisValues, row.applyOn);
    case "QTY":
      return basis.map((line) => dec(line.billQty).times(chargeRate));
    case "NET_QTY":
      return basis.map((line) => dec(line.netQty).times(chargeRate));
    case "KG":
    case "QTL":
    case "TON":
      return basis.map((line) => dec(line.weight).times(chargeRate));
    case "PERCENT":
      return basisValues.map((value) => value.times(chargeRate).div(100));
    default:
      return basis.map(() => ZERO);
  }
}
function priceRow(
  row: ChargeRow,
  basis: LineBasis[],
  basisValues: Dec[],
  options: DistributeOptions,
  /** Roles whose per-line override a previous row has already taken. */
  consumedRoles: Set<ChargeRole>,
): PricedChargeRow {
  // One override, one row. A document carrying two rows of the same role — the
  // picker warns about a duplicate but does not block it — would otherwise have
  // each of them take the whole per-line freight and bill it twice.
  const override = consumedRoles.has(row.role) ? undefined : options.roleOverrides?.[row.role];
  const raw =
    override && override.length === basis.length
      ? override.map((amount) => dec(amount))
      : shareByMethod(row, basis, basisValues);
  if (override && override.length === basis.length) {
    consumedRoles.add(row.role);
  }
  const signed = row.type === "DEDUCT" ? raw.map((share) => share.neg()) : raw;
  // Rounded here, once: the lines, the row total and the document tax summary
  // must all be built from the same figures or the bill stops reconciling with
  // its own lines.
  const shares = signed.map((share) => money(share));
  const amountValue = money(sum(shares.map((share) => dec(share))));
  // `beforeTax` alone decides whether a share moves the taxable base; `taxApl`
  // only governs after-tax rows. So a row carries its own GST iff
  // `taxApl && !beforeTax` — every other combination zeroes the whole tax block
  // *including the tax percentage*. Charges never carry cess.
  const carriesOwnTax = row.taxApl && !row.beforeTax;
  if (!carriesOwnTax) {
    return {
      ...row,
      amountValue,
      shares,
      taxPercApplied: 0,
      cgstPercApplied: 0,
      sgstPercApplied: 0,
      igstPercApplied: 0,
      cgstAmt: 0,
      sgstAmt: 0,
      igstAmt: 0,
      taxAmt: 0,
      cessAmt: 0,
      netAmt: amountValue,
    };
  }
  const half = dec(row.taxPerc).div(2);
  const cgstPerc = dec(row.cgstPerc).gt(0) ? dec(row.cgstPerc) : half;
  const sgstPerc = dec(row.sgstPerc).gt(0) ? dec(row.sgstPerc) : half;
  const igstPerc = dec(row.igstPerc).gt(0) ? dec(row.igstPerc) : dec(row.taxPerc);
  const amount = dec(amountValue);
  const cgstAmt = options.isLocal ? money(amount.times(cgstPerc).div(100)) : 0;
  const sgstAmt = options.isLocal ? money(amount.times(sgstPerc).div(100)) : 0;
  const igstAmt = options.isLocal ? 0 : money(amount.times(igstPerc).div(100));
  const taxAmt = money(dec(cgstAmt).plus(dec(sgstAmt)).plus(dec(igstAmt)));
  return {
    ...row,
    amountValue,
    shares,
    taxPercApplied: options.isLocal ? money(cgstPerc.plus(sgstPerc)) : money(igstPerc),
    cgstPercApplied: options.isLocal ? money(cgstPerc) : 0,
    sgstPercApplied: options.isLocal ? money(sgstPerc) : 0,
    igstPercApplied: options.isLocal ? 0 : money(igstPerc),
    cgstAmt,
    sgstAmt,
    igstAmt,
    taxAmt,
    cessAmt: 0,
    netAmt: money(amount.plus(dec(taxAmt))),
  };
}
/**
 * Distribute every charge row across the lines.
 *
 * Two passes over the rows, because of rule 3 (basis by row): the goods-basis
 * rows are priced first, then `netTotalOf` is asked what each line's net total
 * is with those shares applied, and only then are the after-tax DEDUCT rows
 * measured. The returned `rows` are in the caller's original order regardless.
 */
export function distribute(
  basis: LineBasis[],
  rows: ChargeRow[],
  options: DistributeOptions,
): ChargeDistribution {
  const shares: LineChargeShare[] = basis.map(() => ({ beforeTax: 0, afterTax: 0 }));
  const priced: (PricedChargeRow | null)[] = rows.map(() => null);
  const consumedRoles = new Set<ChargeRole>();
  const goodsBasis = basis.map((line) => dec(line.netGross));
  const applyRow = (row: PricedChargeRow): void => {
    row.shares.forEach((share, index) => {
      const target = shares[index];
      if (!target) {
        return;
      }
      if (row.beforeTax) {
        target.beforeTax = money(dec(target.beforeTax).plus(dec(share)));
      } else {
        target.afterTax = money(dec(target.afterTax).plus(dec(share)));
      }
    });
  };
  rows.forEach((row, index) => {
    if (usesNetTotalBasis(row)) {
      return;
    }
    const pricedRow = priceRow(row, basis, goodsBasis, options, consumedRoles);
    priced[index] = pricedRow;
    applyRow(pricedRow);
  });
  const deferred = rows.some(usesNetTotalBasis);
  if (deferred) {
    const netTotals = options.netTotalOf(shares.map((share) => ({ ...share })));
    const netTotalBasis = basis.map((_line, index) => dec(netTotals[index] ?? 0));
    rows.forEach((row, index) => {
      if (!usesNetTotalBasis(row)) {
        return;
      }
      const pricedRow = priceRow(row, basis, netTotalBasis, options, consumedRoles);
      priced[index] = pricedRow;
      applyRow(pricedRow);
    });
  }
  const pricedRows = priced.filter((row): row is PricedChargeRow => row !== null);
  let chargeTaxable = ZERO;
  let cgst = ZERO;
  let sgst = ZERO;
  let igst = ZERO;
  let afterTaxNonTaxable = ZERO;
  pricedRows.forEach((row) => {
    if (row.beforeTax) {
      return;
    }
    if (row.taxApl) {
      chargeTaxable = chargeTaxable.plus(dec(row.amountValue));
      cgst = cgst.plus(dec(row.cgstAmt));
      sgst = sgst.plus(dec(row.sgstAmt));
      igst = igst.plus(dec(row.igstAmt));
      return;
    }
    afterTaxNonTaxable = afterTaxNonTaxable.plus(dec(row.amountValue));
  });
  return {
    lines: shares,
    rows: pricedRows,
    chargeTaxable: money(chargeTaxable),
    cgst: money(cgst),
    sgst: money(sgst),
    igst: money(igst),
    cess: 0,
    afterTaxNonTaxable: money(afterTaxNonTaxable),
  };
}