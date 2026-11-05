import { describe, expect, it } from "vitest";
import { COL } from "./purchase-order.constants";
import {
  chargesTypedOnLoad,
  liveTotals,
  paintLanding,
  paintServerLines,
  poFooterCells,
  repriceCharges,
  repriceLine,
  withLiveEstimate,
} from "./po-landing";
import { calcLine, chargeRateAmount, goodsValue, r2, taxOn } from "./po-line-math";
import { blankLine, createPoDraft } from "./purchase-order.state";
import type { PoChargeLine, PoDraft, PoLine, PurchaseOrderCalc } from "./purchase-order.types";

const SCOPE = { companyId: "c1", branchId: "b1", accYear: "2026-2027", deviceId: "d1" };

function line(over: Partial<PoLine>): PoLine {
  return { ...blankLine(), itemId: "i", itemName: "Item", uomId: "u", unitName: "PCS", gstPct: 18, ...over };
}

function charge(over: Partial<PoChargeLine>): PoChargeLine {
  return { key: `k-${over.chgId ?? "x"}`, chgId: "x", name: "C", onBill: true, method: "FIXED", type: "ADD", rate: "0", amount: "", typed: false, ...over };
}

/**
 * The live answer of :3011 /purchase/orders/validate (server bbef3f41) for ZT PO D14/00655's lines and
 * charges, 2026-11-05: line 1 = 10 × 90 at 18 %; Freight 100 before tax, Cash Discount 2 % after tax,
 * coolie 2 / qty and own lorry 150 off the bill.
 */
const ANSWER_LINE_1 = {
  key: "1",
  gross: "900",
  discAmt: "0",
  taxable: "942.86",
  gstPct: "18",
  tax: "169.72",
  total: "1112.58",
  netGross: "900",
  chrgBeforeTax: "42.86",
  chrgAfterTax: "-18",
  offbillShare: "90",
  amount: "1094.58",
  landedValue: "1014.86",
  landedCost: "84.571667",
  landedCostIncl: "98.715",
};

describe("purchase order — line math (Qt PurchaseLineMath)", () => {
  it("rounds half-up to 2 places, symmetric", () => {
    expect(r2(2.675)).toBe(2.68);
    expect(r2(-1.005)).toBe(-1.01);
    expect(r2(84.8574)).toBe(84.86);
  });
  it("taxes CGST and SGST each rounded on its own; inter-state one IGST", () => {
    expect(taxOn(942.86, 18)).toBe(169.72);
    expect(taxOn(100.05, 5)).toBe(5);
    expect(taxOn(100.05, 5, true)).toBe(5);
    expect(taxOn(0, 18)).toBe(0);
  });
  it("works a line out: gross, disc, sch, taxable, tax, total", () => {
    expect(calcLine({ qty: 10, rate: 100, discPct: 10, gstPct: 18 })).toEqual({
      gross: 1000,
      discAmt: 100,
      schAmt: 0,
      taxable: 900,
      tax: 162,
      total: 1062,
    });
    expect(calcLine({ qty: 4, rate: 250, discPct: 10, schPct: 5, gstPct: 12 }).taxable).toBe(855);
    expect(goodsValue(line({ qty: "10", rate: "90" }))).toBe(900);
  });
  it("a charge from its rate: fixed, % of the goods value, per qty; weight methods unknown", () => {
    expect(chargeRateAmount({ method: "FIXED", rate: "-12" }, 2100, 30)).toBe(12);
    expect(chargeRateAmount({ method: "PERCENT", rate: "2" }, 2100, 30)).toBe(42);
    expect(chargeRateAmount({ method: "net_qty", rate: "2" }, 2100, 30)).toBe(60);
    expect(chargeRateAmount({ method: "KG", rate: "2" }, 2100, 30)).toBeNull();
  });
});

describe("purchase order — the live estimate (Qt repriceRow / repriceCharges / paintLive)", () => {
  it("a line keeps the last answer's shares: Taxable = goods + before-tax share, Amount adds the after-tax one", () => {
    const priced = repriceLine(line({ qty: "10", rate: "90", total: 1, chrgBeforeTax: 42.86, chrgAfterTax: -18 }));
    // the same figures the server sent for this line
    expect(priced).toMatchObject({ taxable: 942.86, tax: 169.72, lineTotal: 1112.58, total: 1094.58 });
    const plain = repriceLine(line({ qty: "10", rate: "100", discPct: "10" }));
    expect(plain).toMatchObject({ taxable: 900, tax: 162, lineTotal: 1062, total: 1062 });
  });
  it("a line nothing is keyed on stays as it is; a blank row too", () => {
    const fresh = line({});
    expect(repriceLine(fresh)).toBe(fresh);
    const blank = blankLine();
    expect(repriceLine(blank)).toBe(blank);
  });
  it("charges follow the lines by their method; a typed amount stands, signed; weight methods keep the last figure", () => {
    const lines = [line({ qty: "10", rate: "90" }), line({ key: "l2", qty: "20", rate: "60" })];
    const out = repriceCharges(lines, [
      charge({ chgId: "f", method: "FIXED", rate: "100" }),
      charge({ chgId: "d", method: "PERCENT", type: "DEDUCT", rate: "2" }),
      charge({ chgId: "q", method: "QTY", rate: "2" }),
      charge({ chgId: "w", method: "KG", rate: "3", amount: "45.00" }),
      charge({ chgId: "t", method: "FIXED", type: "DEDUCT", rate: "12", amount: "50", typed: true }),
    ]);
    expect(out.map((c) => c.amount)).toEqual(["100.00", "-42.00", "60.00", "45.00", "-50.00"]);
  });
  it("totals as the server counts them: before-tax charges are in the lines; the rest carries its own GST", () => {
    const lines = [line({ taxable: 942.86, tax: 169.72, lineTotal: 1112.58, total: 1094.58 }), blankLine()];
    const { strip, totals } = liveTotals(lines, [
      charge({ chgId: "f", amount: "100.00", beforeTax: true }),
      charge({ chgId: "d", amount: "-42.00" }),
      charge({ chgId: "h", amount: "50.00", gst: 6 }),
    ]);
    expect(strip).toEqual({ lines: 1, orderedValue: "1112.58", chargesEstimate: "14.00", poTotal: "1126.58" });
    expect(totals).toEqual({ taxable: 942.86, tax: 169.72, net: 1112.58 });
  });
  it("only an open PO gets the estimate; it mutes the split / landing cells until the answer", () => {
    let draft: PoDraft = { ...createPoDraft(SCOPE, "2026-11-05"), supplierId: "s1" };
    draft = { ...draft, lines: [line({ key: "a", qty: "10", rate: "90" }), blankLine()] };
    const live = withLiveEstimate(draft, ["a"]);
    expect(live.awaitingServer).toBe(true);
    expect(live.lines[0]).toMatchObject({ taxable: 900, tax: 162, total: 1062 });
    expect(live.serverTotals).toEqual({ lines: 1, orderedValue: "1062.00", chargesEstimate: "0.00", poTotal: "1062.00" });
    const browse = { ...draft, viewMode: "browse" as const };
    expect(withLiveEstimate(browse, ["a"])).toBe(browse);
  });
});

describe("purchase order — the server's split and landing cost (Qt paintServerLines)", () => {
  const keys = new Map([[1, "a"]]);
  it("the live answer: the figures, the split, Amount = amount, the landing costs with how", () => {
    const [painted] = paintServerLines([line({ key: "a", qty: "10", rate: "90" })], [ANSWER_LINE_1], keys, true);
    expect(painted).toMatchObject({
      taxable: 942.86,
      tax: 169.72,
      lineTotal: 1112.58,
      total: 1094.58,
      chrgBeforeTax: 42.86,
      chrgAfterTax: -18,
      landedCost: "84.571667",
      landedCostIncl: "98.715",
    });
    expect(painted.landedTip).toBe(
      "84.571667 per PCS\n= landed value 1,014.86 ÷ 10 PCS (ordered + free)\n" +
        "landed value = net 900.00 + before-tax charges 42.86 + after-tax charges -18.00 + our own charges 90.00",
    );
    expect(painted.landedInclTip).toBe("98.715 per PCS\n= (landed value 1,014.86 + GST 169.72) ÷ 10 PCS");
  });
  it("an older server (no amount, no split, no landing): Amount = total, the split blank", () => {
    const [painted] = paintServerLines(
      [line({ key: "a", qty: "10", rate: "100", chrgBeforeTax: 5 })],
      [{ key: "1", taxable: "900", gstPct: "18", tax: "162", total: "1062" }],
      keys,
      true,
    );
    expect(painted).toMatchObject({ total: 1062, lineTotal: 1062, chrgBeforeTax: null, chrgAfterTax: null, landedCost: "" });
  });
  it("after an open only the landing costs and the charges' flags land; the saved figures stand", () => {
    const draft: PoDraft = {
      ...createPoDraft(SCOPE, "2026-11-05"),
      poId: "po1",
      status: "POSTED",
      viewMode: "browse",
      lines: [line({ key: "a", qty: "10", rate: "90", taxable: 942.86, tax: 169.72, total: 1094.58, chrgBeforeTax: 42.86 })],
      charges: [charge({ chgId: "f", amount: "100.00", typed: false })],
      dirty: false,
    };
    const calc: PurchaseOrderCalc = {
      lines: [{ ...ANSWER_LINE_1, taxable: "1", tax: "1", total: "1", amount: "1" }],
      totals: { taxable: "1", tax: "1", net: "1" },
      charges: [{ chgId: "f", signedAmount: "99.00", rate: "99", beforeTax: true, landingCost: true, tax: "0.00" }],
    };
    const opened = paintLanding(draft, calc, keys);
    expect(opened.lines[0]).toMatchObject({ taxable: 942.86, total: 1094.58, landedCost: "84.571667" });
    expect(opened.charges?.[0]).toMatchObject({ amount: "100.00", beforeTax: true, flagsKnown: true, gst: 0 });
    expect(opened.dirty).toBe(false);
  });
});

describe("purchase order — a stored PO's charges and the Σ row", () => {
  it("a saved amount its rate does not give on these lines was typed; the rest go by their rate", () => {
    const lines = [line({ qty: "10", rate: "90" }), line({ key: "l2", qty: "20", rate: "60" })];
    const out = chargesTypedOnLoad(
      [
        charge({ chgId: "f", method: "FIXED", rate: "100", amount: "100.00", typed: true }),
        charge({ chgId: "d", method: "PERCENT", type: "DEDUCT", rate: "2", amount: "-42.00", typed: true }),
        charge({ chgId: "t", method: "FIXED", rate: "100", amount: "80.00", typed: true }),
        charge({ chgId: "w", method: "KG", rate: "3", amount: "45.00", typed: true }),
      ],
      lines,
    );
    expect(out.map((c) => c.typed)).toEqual([false, false, true, false]);
  });
  it("Σ: qty and money sums, blank when zero, no row without a line", () => {
    expect(poFooterCells([blankLine()])).toBeNull();
    const cells = poFooterCells([
      line({ qty: "10", free: "2", tax: 169.72, total: 1094.58, chrgBeforeTax: 42.86, chrgAfterTax: -18, received: 0, pending: 10 }),
      line({ key: "l2", qty: "20", tax: 62.86, total: 1296, chrgBeforeTax: 57.14, chrgAfterTax: -24, received: 0, pending: 20 }),
      blankLine(),
    ]);
    expect(cells).toEqual({
      [COL.Item]: "2 item(s)",
      [COL.Qty]: "30",
      [COL.Free]: "2",
      [COL.Pending]: "30",
      [COL.ChrgBeforeTax]: "100.00",
      [COL.Tax]: "232.58",
      [COL.ChrgAfterTax]: "-42.00",
      [COL.Total]: "2,390.58",
    });
  });
});
