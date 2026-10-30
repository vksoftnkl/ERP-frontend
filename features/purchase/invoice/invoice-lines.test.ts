/**
 * Purchase Entry — the line rules of Qt NexERP 0fbe19c..e0c56ef (PI-LINES):
 * From GRN / From PO, REJECTED / PRICE KEPT, cost incl. / sums / markup / Sell
 * A–D, scheme / extra disc, ITC, F4, F12 splits, textile, the item strip, the
 * scheme's Free and a new line's defaults.
 */
import { describe, expect, it } from "vitest";
import { COL } from "./invoice.constants";
import {
  allocNeedOf,
  allocSeedOf,
  evalMoneyExpression,
  foldAllocs,
  grnChoices,
  itcText,
  itemStripParts,
  lineDefaultsFrom,
  linesFromGrn,
  linesFromPo,
  poChoices,
  schemeFreeText,
} from "./invoice-lines";
import {
  allocsOf,
  buildPayload,
  changesFigures,
  checkText,
  checkTone,
  createDraft,
  draftFromPayload,
  invoiceReducer,
  lineDto,
  whyNotEditable,
  withLineDefaults,
  type InvoiceAction,
} from "./invoice.state";
import type {
  InvoiceDraft,
  PurchaseGrnLine,
  PurchaseInvoicePayload,
  PurchaseItemContext,
  PurchaseItemLookup,
  PurchasePoPendingLine,
} from "./invoice.types";

const SCOPE = { companyId: "c1", branchId: "b1", accYear: "2026-2027", deviceId: "d1" };
const TODAY = "2026-10-29";
const PRICES = { priceUpdate: true, autoBatchNo: false };
const TEXTILE = { priceUpdate: false, autoBatchNo: true };

const ITEM: PurchaseItemLookup = {
  itemId: "item-a",
  itemCode: "A1",
  itemName: "SHIRT",
  uomId: "uom-pcs",
  unitName: "PCS",
  toBaseFactor: "1",
  taxPerc: "5",
  trackSignature: "",
  mrp: "500",
};
const TEXTILE_ITEM: PurchaseItemLookup = { ...ITEM, itemId: "item-t", trackSignature: "B" };
const SERIAL_ITEM: PurchaseItemLookup = { ...ITEM, itemId: "item-s", trackSignature: "R" };

function run(draft: InvoiceDraft, ...actions: InvoiceAction[]): InvoiceDraft {
  return actions.reduce(invoiceReducer, draft);
}

function bill(settings = { priceUpdate: false, autoBatchNo: false }, item = ITEM): InvoiceDraft {
  return run(
    createDraft(SCOPE, TODAY),
    { type: "lineSettings", settings },
    { type: "supplier", id: "sup-1", name: "Supplier" },
    { type: "godown", id: "gd-1", name: "Main" },
    { type: "header", patch: { supplierInvNo: "S-1" } },
    { type: "applyItem", key: "l1", item },
    { type: "editCell", key: "l1", column: COL.Billed, raw: "10" },
  );
}

describe("ENT-05 / ENT-19 — sums in money cells", () => {
  it("works a little sum out, * and / first", () => {
    expect(evalMoneyExpression("12/2", { sell: false, mrp: 0 })).toEqual({ ok: true, value: "6" });
    expect(evalMoneyExpression("3*4.5", { sell: false, mrp: 0 })).toEqual({ ok: true, value: "13.5" });
    expect(evalMoneyExpression("100-5+2*3", { sell: false, mrp: 0 })).toEqual({ ok: true, value: "101" });
    expect(evalMoneyExpression("1,250", { sell: false, mrp: 0 })).toEqual({ ok: true, value: "1250" });
    expect(evalMoneyExpression("", { sell: false, mrp: 0 })).toEqual({ ok: true, value: "" });
  });

  it("refuses what is no sum, a division by 0 and a negative answer", () => {
    expect(evalMoneyExpression("12//2", { sell: false, mrp: 0 }).ok).toBe(false);
    expect(evalMoneyExpression("5/0", { sell: false, mrp: 0 }).ok).toBe(false);
    expect(evalMoneyExpression("2-5", { sell: false, mrp: 0 }).ok).toBe(false);
    expect(evalMoneyExpression("10%", { sell: false, mrp: 500 }).ok).toBe(false);
  });

  it("Sell A–D take 10% = MRP less 10 %, and need the MRP", () => {
    expect(evalMoneyExpression("10%", { sell: true, mrp: 499 })).toEqual({ ok: true, value: "449.1" });
    expect(evalMoneyExpression("10%", { sell: true, mrp: 0 })).toEqual({ ok: false, hint: "10% needs the MRP first." });
  });

  it("a Rate cell holds the answer; a text that is no sum is cleared with a hint", () => {
    let draft = run(bill(), { type: "editCell", key: "l1", column: COL.Rate, raw: "1200/12" });
    expect(draft.lines[0].rate).toBe("100");
    draft = run(draft, { type: "editCell", key: "l1", column: COL.Rate, raw: "12**2" });
    expect(draft.lines[0].rate).toBe("");
    expect(draft.hint).toBe('Line 1: "12**2" is not a sum this cell can take.');
  });

  it("Sell A follows MRP %, and Markup and Sell A clear each other", () => {
    let draft = run(bill(PRICES), { type: "editCell", key: "l1", column: COL.SellA, raw: "20%" });
    expect(draft.lines[0].sellA).toBe("400");
    draft = run(draft, { type: "editCell", key: "l1", column: COL.Markup, raw: "30" });
    expect(draft.lines[0]).toMatchObject({ markup: "30", sellA: "" });
    draft = run(draft, { type: "editCell", key: "l1", column: COL.SellA, raw: "450" });
    expect(draft.lines[0]).toMatchObject({ markup: "", sellA: "450" });
  });
});

describe("the payload of the new line fields", () => {
  it("sends Sell A–D and the markup only while the bill keys prices (Qt m_priceUpdate)", () => {
    const keyed = (settings: typeof PRICES) =>
      run(
        bill(settings),
        { type: "editCell", key: "l1", column: COL.Rate, raw: "100" },
        { type: "editCell", key: "l1", column: COL.SellB, raw: "480" },
        { type: "editCell", key: "l1", column: COL.Markup, raw: "25" },
      );
    const on = buildPayload(keyed(PRICES), false, TODAY).body.lines[0];
    expect(on).toMatchObject({ sellB: 480, markupAPct: 25 });
    expect(on.sellA).toBeUndefined();
    const off = buildPayload(keyed({ priceUpdate: false, autoBatchNo: false }), false, TODAY).body.lines[0];
    expect(off.sellB).toBeUndefined();
    expect(off.markupAPct).toBeUndefined();
  });

  it("sends Sch %, Extra disc, and Cost incl. only while it was typed (ENT-04 / ENT-06)", () => {
    let draft = run(
      bill(),
      { type: "editCell", key: "l1", column: COL.SchPct, raw: "2.5" },
      { type: "editCell", key: "l1", column: COL.ExtraDisc, raw: "30/3" },
      { type: "editCell", key: "l1", column: COL.CostIncl, raw: "105" },
    );
    expect(draft.lines[0].costTyped).toBe(true);
    expect(buildPayload(draft, false, TODAY).body.lines[0]).toMatchObject({ schPct: 2.5, extraDiscAmt: 10, costIncl: 105 });
    // The answer back-solves Rate and stops sending the cost.
    const { sentKeys } = buildPayload(draft, false, TODAY, true);
    draft = invoiceReducer(draft, {
      type: "calc",
      sentKeys,
      answer: { lines: [{ lineNo: 1, total: "1050", rate: "100.0000", costIncl: "105.00" }], totals: {} },
    });
    expect(draft.lines[0]).toMatchObject({ rate: "100", costIncl: "105.00", costTyped: false });
    expect(buildPayload(draft, false, TODAY).body.lines[0].costIncl).toBeUndefined();
  });

  it("paints Sell A, the markup and its margin back when the bill keys prices", () => {
    const draft = run(bill(PRICES), { type: "editCell", key: "l1", column: COL.Markup, raw: "25" });
    const { sentKeys } = buildPayload(draft, false, TODAY, true);
    const painted = invoiceReducer(draft, {
      type: "calc",
      sentKeys,
      answer: { lines: [{ lineNo: 1, sellA: 131.25, markupAPct: "25.00", marginAPct: "20.00" }], totals: {} },
    });
    expect(painted.lines[0]).toMatchObject({ sellA: "131.25", markup: "25", marginPct: "20" });
  });
});

describe("LAW-01 — the ITC words", () => {
  it("says the class, or the split", () => {
    expect(itcText("ELIGIBLE", "18.00", "0", "0")).toBe("Elig.");
    expect(itcText("RCM", 0, 0, 0)).toBe("RCM");
    expect(itcText("UNREGISTERED", 0, 0, 0)).toBe("No GST");
    expect(itcText("BLOCKED_17_5", 0, 0, 5)).toBe("Blocked 17(5)");
    expect(itcText("ELIGIBLE", "0", "0", "12")).toBe("Inelig.");
    expect(itcText("ELIGIBLE", "90", "18", "0")).toBe("90.00 E · 18.00 P");
    expect(itcText("ELIGIBLE", "90", "0", "9")).toBe("90.00 E · 9.00 lost");
    expect(itcText(null, 0, 0, 0)).toBe("");
  });

  it("a calculation fills the line's ITC", () => {
    const draft = bill();
    const { sentKeys } = buildPayload(draft, false, TODAY, true);
    const painted = invoiceReducer(draft, {
      type: "calc",
      sentKeys,
      answer: { lines: [{ lineNo: 1, itcClass: "ELIGIBLE", itcEligible: "25.00", itcPending: "5.00" }], totals: {} },
    });
    expect(painted.lines[0].calc?.itc).toBe("25.00 E · 5.00 P");
  });
});

const GRN_LINES: PurchaseGrnLine[] = [
  {
    grnItemId: "gri-1",
    grnItemAccYear: "2026-2027",
    grnId: "grn-1",
    grnRefno: "GRN/2026-2027/D1/00007",
    grnDate: "2026-10-27",
    lineNo: 1,
    challanNo: "DC-9",
    itemId: "item-a",
    itemName: "SHIRT",
    uomId: "uom-pcs",
    unitName: "PCS",
    challanQty: "10.000",
    receivedQty: "8.000",
    damagedQty: "1.000",
    freeQty: "1.000",
    returnedQty: "2.000",
    provisionalRate: "90.0000",
    poRate: "95.0000",
    poDiscPct: "2.00",
    mrp: "500.00",
  },
  {
    grnItemId: "gri-2",
    grnItemAccYear: "2026-2027",
    grnId: "grn-1",
    grnRefno: "GRN/2026-2027/D1/00007",
    grnDate: "2026-10-27",
    lineNo: 2,
    itemId: "item-b",
    itemName: "TROUSER",
    uomId: "uom-pcs",
    unitName: "PCS",
    challanQty: "0",
    receivedQty: "5",
    damagedQty: "0",
    provisionalRate: "200",
    poRate: null,
  },
  { grnItemId: "gri-3", grnItemAccYear: "2026-2027", grnId: "grn-2", grnRefno: "GRN/2026-2027/D1/00009", itemId: "item-c", uomId: "u" },
];

describe("R4 — From GRN", () => {
  it("lists one choice per GRN with its line count", () => {
    expect(grnChoices(GRN_LINES)).toEqual([
      { id: "grn-1", label: "GRN/2026-2027/D1/00007 · 27/10/2026 · DC DC-9 (2 lines)" },
      { id: "grn-2", label: "GRN/2026-2027/D1/00009 (1 line)" },
    ]);
  });

  it("brings Billed = the challan qty (at least what came), the PO rate else the provisional one", () => {
    const { lines, returned } = linesFromGrn(GRN_LINES, "grn-1", new Set());
    expect(lines[0]).toMatchObject({ billed: "10", recd: "8", dmg: "1", free: "1", rate: "95", discPct: "2", mrp: "500", srcRefno: "00007", grnItemId: "gri-1" });
    expect(lines[1]).toMatchObject({ billed: "5", rate: "200", discPct: "" });
    expect(returned).toEqual(["SHIRT — 2 went back on a GRN return"]);
    expect(linesFromGrn(GRN_LINES, "grn-1", new Set(["gri-1"])).lines).toHaveLength(1);
  });

  it("a GRN line keys only the supplier's figures, and sends only them", () => {
    const { lines } = linesFromGrn(GRN_LINES, "grn-1", new Set());
    const draft = run(bill(), { type: "addSourceLines", lines, hint: "2 lines from the GRN" });
    expect(draft.lines.map((line) => line.itemId)).toEqual(["item-a", "item-a", "item-b", ""]);
    const grn = draft.lines[1];
    expect(whyNotEditable(grn, COL.Billed)).toBe("");
    expect(whyNotEditable(grn, COL.Rate)).toBe("");
    expect(whyNotEditable(grn, COL.Recd)).not.toBe("");
    expect(whyNotEditable(grn, COL.Batch)).not.toBe("");
    expect(whyNotEditable(grn, COL.Item)).not.toBe("");
    expect(lineDto(grn, 2, draft)).toEqual({
      lineNo: 2,
      itemId: "item-a",
      uomId: "uom-pcs",
      billedQty: 10,
      rate: 95,
      discPct: 2,
      grnItemId: "gri-1",
      grnItemAccYear: "2026-2027",
    });
    expect(allocsOf(grn)).toBeUndefined();
    expect(draft.hint).toBe("2 lines from the GRN");
    expect(changesFigures({ type: "addSourceLines", lines, hint: "" })).toBe(true);
  });
});

const PO_LINES: PurchasePoPendingLine[] = [
  {
    poId: "po-1",
    accYear: "2026-2027",
    refno: "PO/2026-2027/D1/00012",
    docDate: "2026-10-20T00:00:00.000Z",
    poiId: "poi-1",
    itemId: "item-a",
    itemName: "SHIRT",
    uomId: "uom-pcs",
    unitName: "PCS",
    rate: "98.5000",
    discPct: "0",
    schPct: "1.50",
    mrp: "480.00",
    pendingQty: "6.000",
  },
];

describe("DOC-04 — From PO", () => {
  it("lists the PO and brings its pending lines with the PO's rate, sch % and MRP", () => {
    expect(poChoices(PO_LINES)).toEqual([{ id: "po-1", label: "PO/2026-2027/D1/00012 · 20/10/2026 (1 line pending)" }]);
    const lines = linesFromPo(PO_LINES, "po-1", new Set());
    expect(lines[0]).toMatchObject({ billed: "6", rate: "98.5", schPct: "1.5", mrp: "480", srcRefno: "00012", poItemId: "poi-1", poYear: "2026-2027" });
  });

  it("a PO line keeps its own MRP when the item lookup lands, and sends the PO line", () => {
    const lines = linesFromPo(PO_LINES, "po-1", new Set());
    let draft = run(createDraft(SCOPE, TODAY), { type: "addSourceLines", lines, hint: "" });
    draft = invoiceReducer(draft, { type: "applyItem", key: draft.lines[0].key, item: ITEM, source: true });
    expect(draft.lines[0]).toMatchObject({ mrp: "480", gstPct: "5", itemName: "SHIRT", poItemId: "poi-1" });
    expect(lineDto(draft.lines[0], 1, draft)).toMatchObject({ poItemId: "poi-1", poItemAccYear: "2026-2027", billedQty: 6, schPct: 1.5 });
    // Another item picked on the line: the PO link was the old item's.
    const other = invoiceReducer(draft, { type: "applyItem", key: draft.lines[0].key, item: { ...ITEM, itemId: "item-z" } });
    expect(other.lines[0].poItemId).toBe("");
  });
});

describe("R18 / D16 — Check", () => {
  it("REJECTED beside SHORT, and PRICE KEPT on a posted line, amber", () => {
    const draft = bill();
    const { sentKeys } = buildPayload(draft, false, TODAY, true);
    const painted = invoiceReducer(draft, {
      type: "calc",
      sentKeys,
      answer: { lines: [{ lineNo: 1, pendingShortQty: "1", rejectedQty: "2.000" }], totals: {} },
    });
    expect(checkText(painted.lines[0])).toBe("REJECTED 2 · SHORT 1");
    expect(checkTone("REJECTED 2 · SHORT 1")).toBe("warn");
    expect(checkTone("SHORT 1")).toBe("bad");
    expect(checkTone("OK · PRICE KEPT")).toBe("warn");
    expect(checkTone("OK")).toBe("good");
  });

  it("reads the stored line's source, rejection, price result, ITC and extras", () => {
    const payload: PurchaseInvoicePayload = {
      header: {
        piId: "pi-9",
        piCompanyId: "c1",
        piBranchId: "b1",
        piAccYear: "2026-2027",
        piRefno: "PUR/9",
        piStatus: "POSTED",
        piSupplierId: "sup-1",
        piGodownId: "gd-1",
      },
      lines: [
        {
          piiId: "pii-1",
          piiItemId: "item-a",
          piiUomId: "uom-pcs",
          piiBilledQty: "10",
          piiReceivedQty: "8",
          piiRate: "95",
          piiTotalAmt: "997.50",
          piiSrcDocType: "GRN",
          piiSrcItemId: "gri-1",
          piiSrcDocYear: "2026-2027",
          piiSrcDocRefno: "GRN/2026-2027/D1/00007",
          piiRejectedAtGrnQty: "2.000",
          piiPriceUpdateResult: "KEPT_NEWER",
          piiItcClass: "ELIGIBLE",
          piiItcEligibleAmt: "47.50",
          piiSchPct: "1.00",
          piiSellA: "520.00",
          allocs: [{ piaBucket: "SALEABLE", piaBatchNo: "GRN-LOT", piaQty: "8" }],
        },
        {
          piiId: "pii-2",
          piiItemId: "item-b",
          piiUomId: "uom-pcs",
          piiBilledQty: "4",
          piiRate: "50",
          piiSrcDocType: "PURCHASE_ORDER",
          piiSrcItemId: "poi-7",
          piiSrcDocRefno: "PO/2026-2027/D1/00012",
          piiSrcDocYear: "2026-2027",
        },
        {
          piiId: "pii-3",
          piiItemId: "item-c",
          piiUomId: "uom-pcs",
          piiBilledQty: "1",
          piiRate: "50",
          piiSrcDocType: "SALE_BILL",
          piiSrcItemId: "sbi-1",
          piiSrcDocRefno: "SB/2026-2027/00044",
          piiSrcDocYear: "2026-2027",
        },
      ],
    };
    const draft = draftFromPayload(payload, "browse");
    const [grn, po, sister] = draft.lines;
    expect(grn).toMatchObject({ grnItemId: "gri-1", srcRefno: "00007", batch: "", split: null, costIncl: "99.75", schPct: "1", sellA: "520", priceKept: true });
    expect(checkText(grn)).toBe("REJECTED 2 · PRICE KEPT");
    expect(grn.calc?.itc).toBe("Elig.");
    expect(po).toMatchObject({ poItemId: "poi-7", poYear: "2026-2027", srcRefno: "00012" });
    expect(sister).toMatchObject({ sisterSaleItemId: "sbi-1", srcRefno: "SB/2026-2027/00044" });
    expect(lineDto(sister, 3, draft)).toMatchObject({ sisterSaleItemId: "sbi-1", sisterSaleItemAccYear: "2026-2027" });
  });
});

describe("F12 — batches / serials", () => {
  it("folds one SALEABLE row (+ its DAMAGED twin) in the bill's godown back onto the row", () => {
    expect(
      foldAllocs(
        [
          { bucket: "SALEABLE", batchNo: "b1", expiryDate: "2027-06-30", qty: 8 },
          { bucket: "DAMAGED", batchNo: "b1", expiryDate: "2027-06-30", qty: 2 },
        ],
        "gd-1",
      ),
    ).toMatchObject({ batch: "B1", expiryIso: "2027-06-30" });
    expect(foldAllocs([{ bucket: "SALEABLE", batchNo: "b1", qty: 8, godownId: "gd-2" }], "gd-1")).toBeNull();
    expect(foldAllocs([{ bucket: "SALEABLE", serialNo: "S1", qty: 1 }], "gd-1")).toBeNull();
    expect(foldAllocs([{ bucket: "SALEABLE", batchNo: "b1", mfgDate: "2026-01-01", qty: 8 }], "gd-1")).toBeNull();
    expect(
      foldAllocs(
        [
          { bucket: "SALEABLE", batchNo: "b1", qty: 4 },
          { bucket: "SALEABLE", batchNo: "b2", qty: 4 },
        ],
        "gd-1",
      ),
    ).toBeNull();
  });

  it("keeps a real split, shuts batch / expiry, and sends its rows in the bill's godown", () => {
    let draft = run(bill(), { type: "editCell", key: "l1", column: COL.Rate, raw: "100" });
    draft = invoiceReducer(draft, {
      type: "setAllocs",
      key: "l1",
      rows: [
        { bucket: "SALEABLE", batchNo: "B1", qty: 6 },
        { bucket: "SALEABLE", batchNo: "B2", qty: 4, godownId: "gd-9", godownName: "Back store" },
      ],
    });
    const line = draft.lines[0];
    expect(line.batch).toBe("2 batches (F12)");
    expect(whyNotEditable(line, COL.Batch)).toContain("F12");
    expect(whyNotEditable(line, COL.Expiry)).toContain("F12");
    expect(allocsOf(line, "gd-1")).toEqual([
      { bucket: "SALEABLE", batchNo: "B1", qty: 6, godownId: "gd-1" },
      { bucket: "SALEABLE", batchNo: "B2", qty: 4, godownId: "gd-9" },
    ]);
    // Changing the qty of a split line names F12.
    const changed = invoiceReducer(draft, { type: "editCell", key: "l1", column: COL.Billed, raw: "12" });
    expect(changed.hint).toBe("Line 1: the qty changed — open F12 and make the batches add up again.");
    // Back to one row: the row holds it again.
    const folded = invoiceReducer(draft, { type: "setAllocs", key: "l1", rows: [{ bucket: "SALEABLE", batchNo: "B9", qty: 10 }] });
    expect(folded.lines[0]).toMatchObject({ split: null, batch: "B9" });
  });

  it("serials read as serials", () => {
    const draft = invoiceReducer(bill({ priceUpdate: false, autoBatchNo: false }, SERIAL_ITEM), {
      type: "setAllocs",
      key: "l1",
      rows: [
        { bucket: "SALEABLE", serialNo: "S1", qty: 1 },
        { bucket: "SALEABLE", serialNo: "S2", qty: 1 },
      ],
    });
    expect(draft.lines[0].batch).toBe("2 serials (F12)");
  });

  it("needs received + damaged + free, and seeds from the row", () => {
    const draft = run(
      bill(),
      { type: "editCell", key: "l1", column: COL.Dmg, raw: "2" },
      { type: "editCell", key: "l1", column: COL.Free, raw: "1" },
      { type: "editCell", key: "l1", column: COL.Batch, raw: "lot-1" },
    );
    const line = draft.lines[0];
    const need = allocNeedOf(line, { godownId: "gd-1", godownName: "Main" }, draft.lineSettings);
    expect(need).toMatchObject({ received: 8, damaged: 2, free: 1, serial: false, textile: false, godownName: "Main" });
    expect(allocSeedOf(line, need)).toEqual([
      { bucket: "SALEABLE", qty: 8, batchNo: "LOT-1", mrp: 500, freeQty: 1 },
      { bucket: "DAMAGED", qty: 2, batchNo: "LOT-1", mrp: 500 },
    ]);
    expect(allocSeedOf(bill().lines[0], need)).toEqual([]);
  });
});

describe("textile — Size · Colour · Model (stock.auto_batch_no)", () => {
  it("opens only on a batch-tracked line with Batch blank, and travels on the SALEABLE row", () => {
    let draft = run(
      bill(TEXTILE, TEXTILE_ITEM),
      { type: "pickChoice", key: "l1", field: "size", id: "sz-m", name: "M" },
      { type: "pickChoice", key: "l1", field: "colour", id: "cl-red", name: "RED" },
      { type: "editCell", key: "l1", column: COL.Model, raw: "Slim" },
    );
    expect(draft.lines[0]).toMatchObject({ sizeId: "sz-m", sizeName: "M", colourId: "cl-red", model: "Slim" });
    expect(allocsOf(draft.lines[0])).toEqual([{ bucket: "SALEABLE", mrp: 500, sizeId: "sz-m", colourId: "cl-red", model: "Slim", qty: 10 }]);
    // A typed batch carries none of them.
    draft = invoiceReducer(draft, { type: "editCell", key: "l1", column: COL.Batch, raw: "x1" });
    expect(draft.lines[0]).toMatchObject({ batch: "X1", sizeId: "", colourId: "", model: "" });
    expect(draft.hint).toContain("a typed batch carries no size / colour / model");
    expect(invoiceReducer(draft, { type: "pickChoice", key: "l1", field: "size", id: "sz-l", name: "L" })).toBe(draft);
  });

  it("stays shut on a plain item, or with auto batch no off", () => {
    expect(whyNotEditable(bill(TEXTILE).lines[0], COL.Size, TEXTILE)).not.toBe("");
    expect(whyNotEditable(bill(PRICES, TEXTILE_ITEM).lines[0], COL.Model, PRICES)).not.toBe("");
    expect(whyNotEditable(bill(TEXTILE, TEXTILE_ITEM).lines[0], COL.Colour, TEXTILE)).toBe("");
  });
});

describe("ENT-07 — buy N get M", () => {
  const scheme = { buy: 10, free: 1 };

  it("fills Free = floor(Billed / N) × M, and follows Billed while it is the scheme's", () => {
    expect(schemeFreeText(25, scheme)).toBe("2");
    expect(schemeFreeText(9, scheme)).toBe("");
    expect(schemeFreeText(25, { buy: 0, free: 0 })).toBe("");
    let draft = run(bill(), { type: "editCell", key: "l1", column: COL.Billed, raw: "25" });
    draft = invoiceReducer(draft, { type: "schemeFree", key: "l1", itemId: "item-a", scheme });
    expect(draft.lines[0]).toMatchObject({ free: "2", freeAuto: "2" });
    expect(draft.hint).toBe("Line 1: scheme buy 10 get 1 — 2 free. Type over Free if the bill says otherwise.");
    draft = run(draft, { type: "editCell", key: "l1", column: COL.Billed, raw: "5" }, { type: "schemeFree", key: "l1", itemId: "item-a", scheme });
    expect(draft.lines[0].free).toBe("");
  });

  it("leaves a Free the operator typed (even blanked), and a reopened draft's own", () => {
    let draft = run(bill(), { type: "editCell", key: "l1", column: COL.Free, raw: "3" }, { type: "editCell", key: "l1", column: COL.Billed, raw: "30" });
    expect(invoiceReducer(draft, { type: "schemeFree", key: "l1", itemId: "item-a", scheme })).toBe(draft);
    draft = { ...bill(), lines: bill().lines.map((line, index) => (index === 0 ? { ...line, free: "4" } : line)) };
    expect(invoiceReducer(draft, { type: "schemeFree", key: "l1", itemId: "item-a", scheme })).toBe(draft);
  });
});

const CONTEXT: PurchaseItemContext = {
  itemId: "item-a",
  itemName: "SHIRT",
  lastPurchases: [
    { docDate: "2026-10-20", refno: "PUR/7", supplierName: "Other", supplierId: "sup-9", rate: "97.0000", discPct: "1", unitName: "PCS" },
    { docDate: "2026-10-10", refno: "PUR/5", supplierName: "Supplier", supplierId: "sup-1", rate: "96.5000", discPct: "0", unitName: "PCS" },
    { docDate: "2026-10-01", refno: "PUR/2", supplierName: "Supplier", supplierId: "sup-1", rate: "1150", unitName: "BOX" },
  ],
  poRate: null,
  stock: { saleable: "40.000", damaged: "2.000", unitName: "PCS" },
  prices: { sellA: "520.00", sellB: "510", mrp: "550.00" },
  supplierItem: { code: "SH-01", schemeBuyQty: "10.000", schemeFreeQty: "1.000" },
};

describe("ENT-02 — a new line's rate", () => {
  it("takes the pending PO in the same unit, else this supplier's last purchase in that unit", () => {
    expect(lineDefaultsFrom(CONTEXT, "PCS", "sup-1")).toEqual({ rate: "96.5", discPct: "", schPct: "", said: "rate from the last purchase PUR/5" });
    expect(lineDefaultsFrom(CONTEXT, "PCS", "sup-x")).toMatchObject({ rate: "97", discPct: "1" });
    expect(lineDefaultsFrom(CONTEXT, "DOZ", "sup-1")).toBeNull();
    const withPo = { ...CONTEXT, poRate: { refno: "PO/12", rate: "95", discPct: "2", schPct: "0", unitName: "PCS" } };
    expect(lineDefaultsFrom(withPo, "PCS", "sup-1")).toMatchObject({ rate: "95", discPct: "2", said: "rate from PO/12" });
  });

  it("fills only a Rate still blank, on the item it was asked for", () => {
    const draft = bill();
    const filled = invoiceReducer(draft, { type: "lineDefaults", key: "l1", itemId: "item-a", rate: "96.5", discPct: "1", schPct: "", said: "rate from PUR/5" });
    expect(filled.lines[0]).toMatchObject({ rate: "96.5", discPct: "1" });
    expect(filled.hint).toBe("Line 1: rate from PUR/5 — change it if the bill says otherwise.");
    const typed = run(draft, { type: "editCell", key: "l1", column: COL.Rate, raw: "90" });
    expect(invoiceReducer(typed, { type: "lineDefaults", key: "l1", itemId: "item-a", rate: "96.5", discPct: "", schPct: "", said: "" })).toBe(typed);
  });
});

describe("B9 — the item strip", () => {
  it("lists last purchases, stock, prices, the supplier's code and scheme", () => {
    expect(itemStripParts(CONTEXT)).toEqual([
      "last purchases: 20-10 Other 97 · 10-10 Supplier 96.50 · 01-10 Supplier 1150",
      "stock 40 pcs (+2 damaged)",
      "Sell A 520 / B 510",
      "MRP 550",
      "supplier code SH-01",
      "scheme buy 10 get 1",
    ]);
    expect(itemStripParts({ itemId: "x" })[0]).toBe("no purchase yet");
  });
});

describe("F4 — the next unit", () => {
  it("takes the unit's facts and the item's MRP in it, and asks again", () => {
    const draft = invoiceReducer(bill(), {
      type: "unitSwitched",
      key: "l1",
      item: { ...ITEM, uomId: "uom-box", unitName: "BOX", toBaseFactor: "12", mrp: "0" },
    });
    expect(draft.lines[0]).toMatchObject({ uomId: "uom-box", unitName: "BOX", factor: 12, mrp: "", calc: null, billed: "10" });
    expect(draft.hint).toBe("Line 1: unit changed — check the rate.");
    expect(changesFigures({ type: "unitSwitched", key: "l1", item: ITEM })).toBe(true);
  });
});

describe("screen memory from before the port", () => {
  it("fills the new line fields and turns kept allocations into the split", () => {
    const old = createDraft(SCOPE, TODAY) as unknown as Record<string, unknown>;
    const legacyLine = { ...(bill().lines[0] as unknown as Record<string, unknown>) };
    delete legacyLine.split;
    delete legacyLine.grnItemId;
    delete legacyLine.freeAuto;
    legacyLine.keptAllocs = [
      { bucket: "SALEABLE", batchNo: "B1", qty: 5 },
      { bucket: "SALEABLE", batchNo: "B2", qty: 5 },
    ];
    delete old.lineSettings;
    const restored = withLineDefaults({ ...(old as unknown as InvoiceDraft), lines: [legacyLine as unknown as InvoiceDraft["lines"][number]] });
    expect(restored.lineSettings).toEqual({ priceUpdate: false, autoBatchNo: false });
    expect(restored.lines[0].grnItemId).toBe("");
    expect(restored.lines[0].split).toHaveLength(2);
  });
});
