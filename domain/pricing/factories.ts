/**
 * Blank engine records. Shared by the draft reducer (a new line, a new charge
 * row) and by the golden tests, so a field added to `Line` cannot be silently
 * left `undefined` in one of the two.
 */
import type { ChargeRow, Line, VoucherPolicy } from "./types";
/** Every engine input of a line, zeroed. */
export function emptyLine(overrides: Partial<Line> = {}): Line {
  return {
    itemId: "",
    caseQty: 0,
    billQty: 0,
    lengthQty: 0,
    toBaseFactor: 1,
    rate: 0,
    isInclusiveTax: false,
    isFree: false,
    discPerc: 0,
    discPerQty: 0,
    discAmt: 0,
    splDiscPerc: 0,
    splDiscPerQty: 0,
    splDiscAmt: 0,
    schPerc: 0,
    schPerQty: 0,
    schAmt: 0,
    billSchDiscPerc: 0,
    gstPerc: 0,
    cgstPerc: 0,
    sgstPerc: 0,
    igstPerc: 0,
    cessPerc: 0,
    cessPerUnit: 0,
    mrp: 0,
    minPrice: 0,
    actualPrice: 0,
    costPrice: 0,
    costBeforeTax: 0,
    weight: 0,
    loyaltyPv: 0,
    freightPerQty: 0,
    loadingPerQty: 0,
    hasFreight: false,
    ...overrides,
  };
}
export function emptyChargeRow(overrides: Partial<ChargeRow> = {}): ChargeRow {
  return {
    key: "",
    chgId: "",
    role: "NONE",
    method: "FIXED",
    type: "ADD",
    applyOn: "FLAT",
    beforeTax: false,
    taxApl: false,
    rate: 0,
    amount: 0,
    taxPerc: 0,
    cgstPerc: 0,
    sgstPerc: 0,
    igstPerc: 0,
    ...overrides,
  };
}
/**
 * The policy a document falls back to when the session has nothing to say and a
 * loaded document carries no snapshot (a legacy row saved before the three
 * columns existed).
 */
export function defaultPolicy(overrides: Partial<VoucherPolicy> = {}): VoucherPolicy {
  return {
    freightCalcType: "MANUAL",
    loadingCalcType: "MANUAL",
    discountAlterBaseRate: false,
    // No `sq_round_off_step` column and no session setting either — see the
    // plan's §13.4. One place, marked as such.
    roundOffStep: 1,
    ...overrides,
  };
}