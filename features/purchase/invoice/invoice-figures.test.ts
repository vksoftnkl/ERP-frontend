/**
 * Purchase Entry — the line figures of Qt NexERP dd59c2c (P7 pairs, P11 the
 * estimate and the live totals, P12 the GST break-up).
 */
import { describe, expect, it } from "vitest";
import {
  derivedPairs,
  GST_SOURCE_AWAITING,
  GST_SOURCE_LINES,
  GST_SOURCE_SERVER,
  gstBreakupRows,
  gstBreakupTotal,
  lineHalfTyped,
  liveTotalsOf,
  recalcBlockedHint,
  repriceLine,
  waitingHint,
} from "./invoice-figures";
import { blankLine, createDraft } from "./invoice.state";
import type { InvoiceDraft, InvoiceLine, LineCalc } from "./invoice.types";

const SCOPE = { companyId: "c1", branchId: "b1", accYear: "2026-2027", deviceId: "d1" };
const REGULAR = { interState: false, supplierTaxMode: "REGULAR" };

function line(patch: Partial<InvoiceLine>): InvoiceLine {
  return { ...blankLine("l1"), itemId: "item-a", gstPct: "18", ...patch };
}

function calc(patch: Partial<LineCalc>): LineCalc {
  return {
    taxable: 0,
    gstPct: 18,
    tax: 0,
    total: 0,
    chrgBeforeTax: 0,
    chrgAfterTax: 0,
    gstParts: { cgst: 0, sgst: 0, igst: 0, cess: 0 },
    costWot: 0,
    shortQty: 0,
    rejectedQty: 0,
    itc: "",
    ...patch,
  };
}

describe("P7 — what the blank one of a pair stands for", () => {
  it("a typed % shows its amount, a typed amount its % (of the gross; Sch of the gross after Disc)", () => {
    expect(derivedPairs({ gross: 1000, discAmt: 20, schAmt: 49 }, { discPct: true, schPct: true })).toEqual({
      discPct: "",
      discAmt: "20.00",
      schPct: "",
      schAmt: "49.00",
    });
    expect(derivedPairs({ gross: 1000, discAmt: 25, schAmt: 19.5 }, { discPct: false, schPct: false })).toEqual({
      discPct: "2.5",
      discAmt: "",
      schPct: "2",
      schAmt: "",
    });
    expect(derivedPairs({ gross: 1000, discAmt: 0, schAmt: 0 }, { discPct: false, schPct: false })).toEqual({
      discPct: "",
      discAmt: "",
      schPct: "",
      schAmt: "",
    });
  });
});

describe("P11 — the line at once", () => {
  it("works the line out with the disc amount and the extra disc, and fills the pair", () => {
    const out = repriceLine(line({ billed: "10", rate: "100", discAmt: "5", extraDisc: "10" }), REGULAR);
    expect(out.est).toEqual({ taxable: 985, tax: 177.3, total: 1162.3, gstParts: { cgst: 88.65, sgst: 88.65, igst: 0, cess: 0 } });
    expect(out.derived.discPct).toBe("0.5");
  });

  it("keeps the last answer's charge shares: Taxable = goods + before-tax share, Total adds the after-tax share", () => {
    const out = repriceLine(
      line({ billed: "10", rate: "100", calc: calc({ taxable: 1050, chrgBeforeTax: 50, chrgAfterTax: 20 }) }),
      { interState: true, supplierTaxMode: "REGULAR" },
    );
    expect(out.est).toEqual({ taxable: 1050, tax: 189, total: 1259, gstParts: { cgst: 0, sgst: 0, igst: 189, cess: 0 } });
  });

  it("charges no GST for a composition / unregistered supplier; waits without a GST % or anything keyed", () => {
    expect(repriceLine(line({ billed: "2", rate: "50" }), { interState: false, supplierTaxMode: "COMPOSITION" }).est?.tax).toBe(0);
    const noGst = line({ billed: "2", rate: "50", gstPct: "" });
    expect(repriceLine(noGst, REGULAR)).toBe(noGst);
    const nothing = line({});
    expect(repriceLine(nothing, REGULAR)).toBe(nothing);
  });

  it("an item with no qty yet stays out of /validate; a GRN line never does", () => {
    expect(lineHalfTyped(line({ rate: "100" }))).toBe(true);
    expect(lineHalfTyped(line({ free: "2" }))).toBe(false);
    expect(lineHalfTyped(line({ grnItemId: "g1" }))).toBe(false);
    expect(lineHalfTyped(blankLine("l9"))).toBe(false);
    expect(waitingHint([line({ billed: "1" }), line({ key: "l2" })])).toBe("Line 2 has no qty yet — it joins the figures once it has one.");
    expect(waitingHint([line({}), line({ key: "l2" })])).toBe("Lines 1, 2 have no qty yet — they join the figures once they have one.");
    expect(waitingHint([line({ billed: "1" })])).toBe("");
  });

  it("says what the server is waiting for", () => {
    const draft = { lines: [line({ billed: "1" })], supplierId: "", godownId: "" };
    expect(recalcBlockedHint(draft)).toBe("Pick the supplier to have the server confirm the figures.");
    expect(recalcBlockedHint({ ...draft, supplierId: "s1" })).toBe("Pick the godown to have the server confirm the figures.");
    expect(recalcBlockedHint({ ...draft, supplierId: "s1", godownId: "g1" })).toBe("");
    expect(recalcBlockedHint({ lines: [blankLine("l1")], supplierId: "", godownId: "" })).toBe("");
  });

  it("the totals from the lines while an edit waits (Qt paintLive): Σ Total + charge GST + TCS, to the rupee", () => {
    const draft: InvoiceDraft = {
      ...createDraft(SCOPE, "2026-11-05"),
      lines: [
        line({ est: { taxable: 995, tax: 179.1, total: 1174.1, gstParts: { cgst: 89.55, sgst: 89.55, igst: 0, cess: 0 } } }),
        line({ key: "l2", calc: calc({ taxable: 1000, tax: 120, total: 1120 }) }),
        blankLine("l3"),
      ],
      serverTotals: { chargeTax: "9.00", chargesOnBill: "50.00", offbillCharges: "30.00", shortValue: "0", gstOnShort: "0" },
      tcsAmount: "1.50",
      invoiceAmount: "2305",
    };
    expect(liveTotalsOf(draft)).toEqual({
      taxable: 1995,
      gstTotal: 299.1,
      chargesOnBill: 50,
      roundOff: 0.4,
      netPayable: 2305,
      invoiceAmountPrinted: 2305,
      difference: 0,
      offbillCharges: 30,
      shortValue: 0,
      gstOnShort: 0,
      chargeTax: 9,
      cgst: 89.55,
      sgst: 89.55,
      igst: 0,
      cess: 0,
    });
    // the credit split is the last answer's (Qt 7d8c926 paintLive)
    expect(liveTotalsOf({ ...draft, serverTotals: { ...draft.serverTotals, itcEligible: "120.00" } })).toMatchObject({ itcEligible: "120.00" });
    expect(liveTotalsOf({ ...draft, lines: [blankLine("l1")] })).toEqual({});
  });
});

describe("P12 — the GST break-up", () => {
  const lines = [
    line({ calc: calc({ taxable: 1000, tax: 180, total: 1180, gstParts: { cgst: 90, sgst: 90, igst: 0, cess: 0 } }) }),
    line({ key: "l2", gstPct: "12", calc: calc({ gstPct: 12, taxable: 500, tax: 60, total: 560, gstParts: { cgst: 30, sgst: 30, igst: 0, cess: 0 } }) }),
    line({ key: "l3", est: { taxable: 200, tax: 36, total: 236, gstParts: { cgst: 18, sgst: 18, igst: 0, cess: 0 } } }),
  ];
  const charges = [
    { key: "c1", chgId: "ch1", name: "Freight", onBill: true, method: "FIXED", basis: "", rate: "100", amount: "100.00", typed: false, payeeIds: [], payeeNames: [], gst: 18, net: 118, priced: true },
    { key: "c2", chgId: "ch2", name: "Coolie", onBill: false, method: "FIXED", basis: "", rate: "50", amount: "50.00", typed: false, payeeIds: [], payeeNames: [], gst: 0, net: 50, priced: true },
  ];
  const base = { lines, charges, gstBreakup: null, awaitingServer: false, facts: createDraft(SCOPE, "2026-11-05").facts };

  it("takes the server's break-up when its answer is the one on screen", () => {
    const server = [{ gstPct: "18.00", taxable: "1000.00", cgst: "90.00", sgst: "90.00", igst: "0.00", cess: "0.00", total: "1180.00" }];
    expect(gstBreakupRows({ ...base, gstBreakup: server })).toEqual({
      rows: [{ gstPct: 18, taxable: 1000, cgst: 90, sgst: 90, igst: 0, cess: 0, total: 1180 }],
      source: GST_SOURCE_SERVER,
    });
  });

  it("else groups the lines on screen by GST %, low to high, with each taxed on-bill charge at its own rate", () => {
    const { rows, source } = gstBreakupRows(base);
    expect(source).toBe(GST_SOURCE_LINES);
    expect(rows).toEqual([
      { gstPct: 12, taxable: 500, cgst: 30, sgst: 30, igst: 0, cess: 0, total: 560 },
      { gstPct: 18, taxable: 1300, cgst: 117, sgst: 117, igst: 0, cess: 0, total: 1534 },
    ]);
    expect(gstBreakupTotal(rows)).toEqual({ taxable: 1800, cgst: 147, sgst: 147, igst: 0, cess: 0, total: 2094 });
    // an edit waiting for the server: the server's rows are last answer's, so the lines are grouped
    expect(gstBreakupRows({ ...base, awaitingServer: true, gstBreakup: [{ gstPct: "5", taxable: "1" }] }).source).toBe(GST_SOURCE_AWAITING);
  });
});
