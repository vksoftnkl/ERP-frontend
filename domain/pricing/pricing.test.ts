/**
 * Golden cases for the pricing engine.
 *
 * Every case asserts the §3.5 reconciliation as well as its own numbers: a bill
 * that does not add up to its own lines is the failure mode that matters most,
 * and it is the one a change to the charge distribution breaks first.
 */
import { describe, expect, it } from "vitest";
import { recalcDocument, reconcile } from "./document";
import { applyLineDiscounts, baseRateOf, netBillableQty, priceRowGoods } from "./lines";
import { defaultPolicy, emptyChargeRow, emptyLine } from "./factories";
import { dec, money, roundToStep } from "./money";
import { distribute } from "./charges";
import type { ChargeRow, DocumentFlags, Line, VoucherPolicy } from "./types";

const LOCAL: DocumentFlags = {
  isLocalSale: true,
  hasFreight: false,
  hasLoad: false,
  hasUnload: false,
};

const INTER_STATE: DocumentFlags = { ...LOCAL, isLocalSale: false };

const STANDARD: VoucherPolicy = defaultPolicy({ discountAlterBaseRate: false });
const DISCOUNT_FIRST: VoucherPolicy = defaultPolicy({ discountAlterBaseRate: true });

/** 18% GST, split 9 + 9 locally. */
function gst18(): Partial<Line> {
  return { gstPerc: 18, cgstPerc: 9, sgstPerc: 9, igstPerc: 18 };
}

function exclusiveLine(overrides: Partial<Line> = {}): Line {
  return emptyLine({
    itemId: "item-a",
    billQty: 10,
    toBaseFactor: 1,
    rate: 100,
    isInclusiveTax: false,
    ...gst18(),
    ...overrides,
  });
}

function inclusiveLine(overrides: Partial<Line> = {}): Line {
  return emptyLine({
    itemId: "item-b",
    billQty: 10,
    toBaseFactor: 1,
    rate: 118,
    isInclusiveTax: true,
    ...gst18(),
    ...overrides,
  });
}

function charge(overrides: Partial<ChargeRow> = {}): ChargeRow {
  return emptyChargeRow({ key: "c1", chgId: "chg-1", ...overrides });
}

/** Both sides of the reconciliation must agree, always. */
function expectReconciled(totals: ReturnType<typeof recalcDocument>["totals"]): void {
  const { fromLines, fromTaxSummary } = reconcile(totals);
  expect(fromLines).toBe(fromTaxSummary);
}

describe("netBillableQty", () => {
  it("multiplies cases by the base factor and adds the loose quantity", () => {
    expect(netBillableQty(2, 3, 0, 12).toNumber()).toBe(27);
  });

  it("treats a length of 0 as 1, not as a zero multiplier", () => {
    expect(netBillableQty(0, 4, 0, 12).toNumber()).toBe(4);
    expect(netBillableQty(0, 4, 2.5, 12).toNumber()).toBe(10);
  });
});

describe("baseRateOf", () => {
  it("leaves an exclusive rate alone", () => {
    expect(baseRateOf(dec(100), exclusiveLine()).toNumber()).toBe(100);
  });

  it("extracts GST out of an inclusive rate", () => {
    expect(baseRateOf(dec(118), inclusiveLine()).toNumber()).toBe(100);
  });

  it("takes per-unit cess off before dividing by the percentage", () => {
    // (118 - 2) / 1.18
    const line = inclusiveLine({ cessPerUnit: 2 });
    expect(money(baseRateOf(dec(118), line))).toBe(98.31);
  });
});

describe("applyLineDiscounts", () => {
  it("applies the four discounts to the running balance in order", () => {
    const line = exclusiveLine({ discPerc: 10, splDiscPerc: 10, schPerc: 10, billSchDiscPerc: 10 });
    const result = applyLineDiscounts(dec(1000), line, dec(10));
    expect(result.discAmt.toNumber()).toBe(100);
    expect(result.splDiscAmt.toNumber()).toBe(90);
    expect(result.schAmt.toNumber()).toBe(81);
    expect(result.billSchDiscAmt.toNumber()).toBe(72.9);
    expect(result.balance.toNumber()).toBe(656.1);
  });

  it("prefers the percentage, then the per-quantity rate, then the keyed amount", () => {
    const percent = applyLineDiscounts(
      dec(1000),
      exclusiveLine({ discPerc: 10, discPerQty: 5, discAmt: 999 }),
      dec(10),
    );
    expect(percent.discAmt.toNumber()).toBe(100);

    const perQty = applyLineDiscounts(
      dec(1000),
      exclusiveLine({ discPerQty: 5, discAmt: 999 }),
      dec(10),
    );
    expect(perQty.discAmt.toNumber()).toBe(50);

    const keyed = applyLineDiscounts(dec(1000), exclusiveLine({ discAmt: 123 }), dec(10));
    expect(keyed.discAmt.toNumber()).toBe(123);
  });

  it("takes bill scheme as a percentage only — a keyed amount is ignored", () => {
    const result = applyLineDiscounts(dec(1000), exclusiveLine(), dec(10));
    expect(result.billSchDiscAmt.toNumber()).toBe(0);
  });
});

describe("priceRowGoods", () => {
  it("survives a zero quantity without dividing by zero", () => {
    const goods = priceRowGoods(exclusiveLine({ billQty: 0 }), STANDARD);
    expect(goods.netQty.toNumber()).toBe(0);
    expect(goods.netGross.toNumber()).toBe(0);
    expect(goods.rateBeforeTax.toNumber()).toBe(100);
  });

  it("only bills per-qty freight on a line whose item carries freight", () => {
    const withFreight = priceRowGoods(exclusiveLine({ freightPerQty: 3, hasFreight: true }), STANDARD);
    expect(withFreight.freightAmt.toNumber()).toBe(30);

    const withoutFlag = priceRowGoods(exclusiveLine({ freightPerQty: 3, hasFreight: false }), STANDARD);
    expect(withoutFlag.freightAmt.toNumber()).toBe(0);
  });
});

describe("inclusive vs exclusive tax", () => {
  it("prices an inclusive line and its exclusive twin identically", () => {
    const exclusive = recalcDocument([exclusiveLine()], [], STANDARD, LOCAL);
    const inclusive = recalcDocument([inclusiveLine()], [], STANDARD, LOCAL);

    expect(exclusive.totals.lineTaxable).toBe(1000);
    expect(exclusive.totals.docTax).toBe(180);
    expect(exclusive.totals.amount).toBe(1180);
    expect(inclusive.totals.amount).toBe(exclusive.totals.amount);
    expect(inclusive.lines[0].rateBeforeTax).toBe(100);
    expectReconciled(exclusive.totals);
    expectReconciled(inclusive.totals);
  });

  it("splits GST locally and switches to IGST inter-state", () => {
    const local = recalcDocument([exclusiveLine()], [], STANDARD, LOCAL);
    expect(local.totals.docCgst).toBe(90);
    expect(local.totals.docSgst).toBe(90);
    expect(local.totals.docIgst).toBe(0);

    const inter = recalcDocument([exclusiveLine()], [], STANDARD, INTER_STATE);
    expect(inter.totals.docCgst).toBe(0);
    expect(inter.totals.docSgst).toBe(0);
    expect(inter.totals.docIgst).toBe(180);
    expect(inter.totals.amount).toBe(local.totals.amount);
    expectReconciled(inter.totals);
  });

  it("prices a mixed inclusive/exclusive document line by line", () => {
    const result = recalcDocument([exclusiveLine(), inclusiveLine()], [], STANDARD, LOCAL);
    expect(result.lines[0].total).toBe(1180);
    expect(result.lines[1].total).toBe(1180);
    expect(result.totals.amount).toBe(2360);
    expect(result.totals.totItems).toBe(2);
    expectReconciled(result.totals);
  });
});

describe("discountAlterBaseRate", () => {
  it("agrees with the standard order on a percentage discount and no per-unit cess", () => {
    const line = inclusiveLine({ discPerc: 10 });
    const standard = recalcDocument([line], [], STANDARD, LOCAL);
    const discountFirst = recalcDocument([line], [], DISCOUNT_FIRST, LOCAL);

    expect(standard.totals.amount).toBe(1062);
    expect(discountFirst.totals.amount).toBe(1062);

    // The bill agrees; the columns deliberately do not. On the discount-first
    // path the discount cell holds tax-inclusive money and gross === netGross,
    // so "savings" reads 0 there.
    expect(standard.lines[0].grossAmt).toBe(1000);
    expect(standard.lines[0].discAmt).toBe(100);
    expect(discountFirst.lines[0].grossAmt).toBe(900);
    expect(discountFirst.lines[0].netGross).toBe(900);
    expect(discountFirst.lines[0].discAmt).toBe(118);

    expectReconciled(standard.totals);
    expectReconciled(discountFirst.totals);
  });

  it("diverges on a per-quantity discount", () => {
    const line = inclusiveLine({ discPerQty: 10 });
    const standard = recalcDocument([line], [], STANDARD, LOCAL);
    const discountFirst = recalcDocument([line], [], DISCOUNT_FIRST, LOCAL);

    expect(standard.totals.amount).toBe(1062);
    expect(discountFirst.totals.amount).toBe(1079.99);
    expect(discountFirst.totals.amount).not.toBe(standard.totals.amount);
    expectReconciled(standard.totals);
    expectReconciled(discountFirst.totals);
  });

  it("diverges on a line carrying per-unit cess", () => {
    const line = inclusiveLine({ discPerc: 10, cessPerUnit: 2 });
    const standard = recalcDocument([line], [], STANDARD, LOCAL);
    const discountFirst = recalcDocument([line], [], DISCOUNT_FIRST, LOCAL);

    expect(standard.totals.docCess).toBe(20);
    expect(discountFirst.totals.docCess).toBe(20);
    expect(standard.totals.amount).toBe(1064.01);
    expect(discountFirst.totals.amount).toBe(1061.99);
    expectReconciled(standard.totals);
    expectReconciled(discountFirst.totals);
  });
});

describe("charges", () => {
  it("moves the taxable base with a before-tax cash-discount DEDUCT", () => {
    const cashDisc = charge({
      role: "CASH_DISC",
      method: "PERCENT",
      type: "DEDUCT",
      applyOn: "FLAT",
      beforeTax: true,
      taxApl: false,
      rate: 2,
    });
    const result = recalcDocument([exclusiveLine()], [cashDisc], STANDARD, LOCAL);

    expect(result.lines[0].chrgBeforeTax).toBe(-20);
    expect(result.lines[0].taxableAmt).toBe(980);
    expect(result.totals.docTax).toBe(176.4);
    expect(result.totals.amount).toBe(1156.4);
    expect(result.totals.cashDiscAmt).toBe(-20);
    expect(result.totals.chargeOwnTax).toBe(0);
    expectReconciled(result.totals);
  });

  it("gives an after-tax taxable charge its own GST and leaves the lines' tax alone", () => {
    const freight = charge({
      role: "OTHERS",
      method: "FIXED",
      type: "ADD",
      applyOn: "FLAT",
      beforeTax: false,
      taxApl: true,
      rate: 100,
      taxPerc: 18,
    });
    const result = recalcDocument([exclusiveLine()], [freight], STANDARD, LOCAL);

    expect(result.lines[0].taxableAmt).toBe(1000);
    expect(result.lines[0].chrgAfterTax).toBe(100);
    expect(result.lines[0].total).toBe(1280);
    expect(result.totals.chargeTaxable).toBe(100);
    expect(result.charges[0].cgstAmt).toBe(9);
    expect(result.charges[0].sgstAmt).toBe(9);
    expect(result.charges[0].taxPercApplied).toBe(18);
    expect(result.totals.chargeOwnTax).toBe(18);
    expect(result.totals.docTaxable).toBe(1100);
    expect(result.totals.docTax).toBe(198);
    expect(result.totals.amount).toBe(1298);
    expectReconciled(result.totals);
  });

  it("zeroes the whole tax block, percentage included, unless taxApl && !beforeTax", () => {
    const taxableBeforeTax = charge({
      role: "OTHERS",
      method: "FIXED",
      applyOn: "FLAT",
      beforeTax: true,
      taxApl: true,
      rate: 100,
      taxPerc: 18,
    });
    const result = recalcDocument([exclusiveLine()], [taxableBeforeTax], STANDARD, LOCAL);

    expect(result.charges[0].taxPercApplied).toBe(0);
    expect(result.charges[0].taxAmt).toBe(0);
    expect(result.totals.chargeTaxable).toBe(0);
    // It moved the line's taxable base instead, so the LINE taxed it.
    expect(result.lines[0].taxableAmt).toBe(1100);
    expect(result.totals.docTax).toBe(198);
    expect(result.totals.amount).toBe(1298);
    expectReconciled(result.totals);
  });

  it("measures after-tax DEDUCT rows on net totals, without compounding, in any order", () => {
    const five = charge({
      key: "c5",
      role: "OTHERS",
      method: "PERCENT",
      type: "DEDUCT",
      beforeTax: false,
      taxApl: false,
      rate: 5,
    });
    const three = charge({ ...five, key: "c3", rate: 3 });
    const forward = recalcDocument([exclusiveLine()], [five, three], STANDARD, LOCAL);
    const reversed = recalcDocument([exclusiveLine()], [three, five], STANDARD, LOCAL);

    // Both measure the same pre-discount net total of 1180 — 59 and 35.40.
    expect(forward.lines[0].chrgAfterTax).toBe(-94.4);
    expect(forward.totals.amount).toBe(1085.6);
    expect(reversed.totals.amount).toBe(forward.totals.amount);
    expect(reversed.lines[0].chrgAfterTax).toBe(forward.lines[0].chrgAfterTax);
    expectReconciled(forward.totals);
    expectReconciled(reversed.totals);
  });

  it("spreads a FIXED lump by FLAT with the residue on the last line", () => {
    const lines = [
      exclusiveLine({ itemId: "a" }),
      exclusiveLine({ itemId: "b" }),
      exclusiveLine({ itemId: "c" }),
    ];
    const lump = charge({
      role: "OTHERS",
      method: "FIXED",
      applyOn: "FLAT",
      beforeTax: true,
      rate: 100,
    });
    const result = recalcDocument(lines, [lump], STANDARD, LOCAL);

    expect(result.charges[0].shares).toEqual([33.33, 33.33, 33.34]);
    expect(result.charges[0].amountValue).toBe(100);
    expectReconciled(result.totals);
  });

  it("spreads a FIXED lump by VALUE in proportion to each line's net gross", () => {
    const lines = [
      exclusiveLine({ itemId: "a", billQty: 10 }),
      exclusiveLine({ itemId: "b", billQty: 30 }),
    ];
    const lump = charge({
      role: "OTHERS",
      method: "FIXED",
      applyOn: "VALUE",
      beforeTax: true,
      rate: 100,
    });
    const result = recalcDocument(lines, [lump], STANDARD, LOCAL);
    expect(result.charges[0].shares).toEqual([25, 75]);
    expectReconciled(result.totals);
  });

  it("spreads a manual amount by applyOn and ignores the method", () => {
    const lines = [
      exclusiveLine({ itemId: "a", billQty: 10 }),
      exclusiveLine({ itemId: "b", billQty: 30 }),
    ];
    const manual = charge({
      role: "OTHERS",
      method: "QTY",
      applyOn: "VALUE",
      beforeTax: true,
      rate: 0,
      amount: 250,
    });
    const result = recalcDocument(lines, [manual], STANDARD, LOCAL);
    expect(result.charges[0].shares).toEqual([62.5, 187.5]);
    expect(result.charges[0].amountValue).toBe(250);
    expectReconciled(result.totals);
  });

  it("prices the per-unit methods off quantity and weight", () => {
    const line = exclusiveLine({ billQty: 10, weight: 2 });
    const perQty = charge({ role: "OTHERS", method: "QTY", beforeTax: true, rate: 3 });
    const perNetQty = charge({ key: "c2", role: "OTHERS", method: "NET_QTY", beforeTax: true, rate: 3 });
    const perKg = charge({ key: "c3", role: "OTHERS", method: "KG", beforeTax: true, rate: 3 });

    const result = recalcDocument([line], [perQty, perNetQty, perKg], STANDARD, LOCAL);
    expect(result.charges[0].amountValue).toBe(30);
    expect(result.charges[1].amountValue).toBe(30);
    // weight basis is per-unit weight × bill quantity = 20 kg
    expect(result.charges[2].amountValue).toBe(60);
    expectReconciled(result.totals);
  });

  it("falls back to equal shares when the chosen distribution basis is all zeros", () => {
    const weightless = [exclusiveLine({ itemId: "a" }), exclusiveLine({ itemId: "b" })];
    const lump = charge({
      role: "OTHERS",
      method: "FIXED",
      applyOn: "WEIGHT",
      beforeTax: true,
      rate: 100,
    });
    const result = recalcDocument(weightless, [lump], STANDARD, LOCAL);
    expect(result.charges[0].shares).toEqual([50, 50]);
    expect(result.charges[0].amountValue).toBe(100);
  });

  it("lets a role override replace the row's own method computation", () => {
    const line = exclusiveLine({ freightPerQty: 4, hasFreight: true });
    const freightRow = charge({
      role: "FREIGHT",
      method: "FIXED",
      applyOn: "FLAT",
      beforeTax: true,
      rate: 999,
    });
    const policy = defaultPolicy({ freightCalcType: "item_basis" });

    const applied = recalcDocument([line], [freightRow], policy, { ...LOCAL, hasFreight: true });
    expect(applied.charges[0].amountValue).toBe(40);
    expect(applied.totals.freightAmt).toBe(40);

    // Checkbox off → the override is not offered and the row prices itself.
    const notApplied = recalcDocument([line], [freightRow], policy, LOCAL);
    expect(notApplied.charges[0].amountValue).toBe(999);

    // MANUAL policy → likewise the operator's own figure stands.
    const manualPolicy = defaultPolicy({ freightCalcType: "MANUAL" });
    const manual = recalcDocument([line], [freightRow], manualPolicy, { ...LOCAL, hasFreight: true });
    expect(manual.charges[0].amountValue).toBe(999);
  });

  it("gives a per-line role override to one row only", () => {
    const line = exclusiveLine({ freightPerQty: 4, hasFreight: true });
    const policy = defaultPolicy({ freightCalcType: "item_basis" });
    const first = charge({
      key: "f1",
      role: "FREIGHT",
      method: "FIXED",
      applyOn: "FLAT",
      beforeTax: true,
      rate: 999,
    });
    const second = charge({ ...first, key: "f2" });

    const result = recalcDocument([line], [first, second], policy, {
      ...LOCAL,
      hasFreight: true,
    });

    // The first FREIGHT row takes the override (40 = 4 × 10); the second falls
    // back to its own method instead of billing the same freight twice.
    expect(result.charges[0].amountValue).toBe(40);
    expect(result.charges[1].amountValue).toBe(999);
    expect(result.totals.freightAmt).toBe(1039);
    expectReconciled(result.totals);
  });

  it("keeps distribute()'s returned rows in the caller's order", () => {
    const basis = [{ netGross: 1000, billQty: 10, netQty: 10, weight: 0 }];
    const rows = [
      charge({ key: "after", role: "OTHERS", method: "PERCENT", type: "DEDUCT", rate: 5 }),
      charge({ key: "before", role: "OTHERS", method: "PERCENT", beforeTax: true, rate: 5 }),
    ];
    const distributed = distribute(basis, rows, {
      isLocal: true,
      netTotalOf: () => [1180],
    });
    expect(distributed.rows.map((row) => row.key)).toEqual(["after", "before"]);
    expect(distributed.rows[0].amountValue).toBe(-59);
    expect(distributed.rows[1].amountValue).toBe(50);
  });
});

describe("totals", () => {
  it("deducts a free line's gross from the bill", () => {
    const paid = exclusiveLine({ itemId: "paid" });
    const free = exclusiveLine({ itemId: "free", isFree: true });
    const result = recalcDocument([paid, free], [], STANDARD, LOCAL);

    expect(result.totals.freeSchemeAmount).toBe(1000);
    // Both lines are priced (2 × 1180) and the free one's gross comes back off.
    expect(result.totals.lineTotal).toBe(2360);
    expect(result.totals.amount).toBe(1360);
    expectReconciled(result.totals);
  });

  it("measures saving against MRP and margin against the taxable value", () => {
    const line = exclusiveLine({ mrp: 150, costPrice: 80, costBeforeTax: 80 });
    const result = recalcDocument([line], [], STANDARD, LOCAL);

    // netPrice = 1180 / 10 = 118
    expect(result.lines[0].netPrice).toBe(118);
    expect(result.lines[0].savingsPerc).toBe(21.33);
    expect(result.totals.savingAmt).toBe(320);
    expect(result.totals.savingPerc).toBe(21.33);

    // netPriceBeforeTax = 1000 / 10 = 100, cost pre-tax 80 → 20 per unit
    expect(result.lines[0].profitBeforeTax).toBe(20);
    expect(result.totals.marginAmt).toBe(200);
    expect(result.totals.marginPerc).toBe(20);
  });

  it("keeps a line with no MRP out of both sides of the saving fraction", () => {
    const withMrp = exclusiveLine({ itemId: "a", mrp: 150 });
    const withoutMrp = exclusiveLine({ itemId: "b", mrp: 0 });
    const result = recalcDocument([withMrp, withoutMrp], [], STANDARD, LOCAL);

    expect(result.totals.savingAmt).toBe(320);
    expect(result.totals.savingPerc).toBe(21.33);
    expect(result.lines[1].savingsPerc).toBe(0);
  });

  it("totals quantity, weight, cost and the loyalty points off net quantity", () => {
    const line = exclusiveLine({ billQty: 10, weight: 2, costPrice: 80, loyaltyPv: 0.5 });
    const result = recalcDocument([line], [], STANDARD, LOCAL);
    expect(result.totals.totQty).toBe(10);
    expect(result.totals.totWeight).toBe(20);
    expect(result.totals.totalCost).toBe(800);
    expect(result.totals.totalLoyaltyPv).toBe(5);
  });

  it("reports the rate difference against the item's standard price", () => {
    const line = exclusiveLine({ rate: 95, actualPrice: 100 });
    const result = recalcDocument([line], [], STANDARD, LOCAL);
    expect(result.lines[0].rateDiff).toBe(-5);
    expect(result.totals.totalRateDiff).toBe(-50);
  });
});

describe("round-off", () => {
  it("moves the bill onto the step and reports the difference", () => {
    expect(roundToStep(dec(1234.56), 1).toNumber()).toBe(1235);
    expect(roundToStep(dec(1234.4), 1).toNumber()).toBe(1234);
    expect(roundToStep(dec(1234.56), 5).toNumber()).toBe(1235);
    expect(roundToStep(dec(1234.56), 0).toNumber()).toBe(1234.56);
  });

  it("puts the round-off on the document totals", () => {
    // 3 × 118.90 inclusive @ 18% → an amount that needs rounding.
    const line = emptyLine({
      itemId: "a",
      billQty: 3,
      toBaseFactor: 1,
      rate: 118.9,
      isInclusiveTax: true,
      ...gst18(),
    });
    const result = recalcDocument([line], [], defaultPolicy({ roundOffStep: 1 }), LOCAL);
    expect(result.totals.bill).toBe(Math.round(result.totals.amount));
    expect(money(dec(result.totals.amount).plus(dec(result.totals.roundOff)))).toBe(
      result.totals.bill,
    );
  });

  it("does not round at all on a step of 0", () => {
    const line = emptyLine({
      itemId: "a",
      billQty: 3,
      toBaseFactor: 1,
      rate: 118.9,
      isInclusiveTax: true,
      ...gst18(),
    });
    const result = recalcDocument([line], [], defaultPolicy({ roundOffStep: 0 }), LOCAL);
    expect(result.totals.roundOff).toBe(0);
    expect(result.totals.bill).toBe(result.totals.amount);
  });
});

describe("empty document", () => {
  it("prices to zero without throwing", () => {
    const result = recalcDocument([], [], STANDARD, LOCAL);
    expect(result.totals.amount).toBe(0);
    expect(result.totals.bill).toBe(0);
    expect(result.totals.totItems).toBe(0);
    expectReconciled(result.totals);
  });

  it("prices a charge grid with no lines to zero rather than throwing", () => {
    const lump = charge({ role: "OTHERS", method: "FIXED", applyOn: "FLAT", rate: 100 });
    const result = recalcDocument([], [lump], STANDARD, LOCAL);
    expect(result.charges[0].shares).toEqual([]);
    expect(result.charges[0].amountValue).toBe(0);
    expect(result.totals.amount).toBe(0);
  });
});
