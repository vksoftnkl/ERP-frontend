/**
 * Purchase Entry — the reducer's side of Qt NexERP dd59c2c / 1600680: the Disc
 * / Sch amount pairs (P7), Markup B–D (P8), HSN and the MSP ownership rule (P9,
 * Q4), the charge split and Total (P10), the estimate / live totals and the
 * lines left out of /validate (P11), the godown a new bill takes (P11, Q5) and
 * the grid's Enter stops (P15).
 */
import { describe, expect, it } from "vitest";
import { COL } from "./invoice.constants";
import {
  buildPayload,
  canRecalc,
  changesFigures,
  createDraft,
  draftFromPayload,
  invoiceReducer,
  isEnterStop,
  type InvoiceAction,
} from "./invoice.state";
import type { InvoiceDraft, PurchaseInvoicePayload, PurchaseItemLookup } from "./invoice.types";

const SCOPE = { companyId: "c1", branchId: "b1", accYear: "2026-2027", deviceId: "d1" };
const TODAY = "2026-11-05";
const PRICES = { priceUpdate: true, autoBatchNo: false };
const NO_PRICES = { priceUpdate: false, autoBatchNo: false };

const ITEM: PurchaseItemLookup = {
  itemId: "item-a",
  itemCode: "A1",
  itemName: "ZT-ITEM-A",
  uomId: "uom-a",
  unitName: "PCS",
  toBaseFactor: "1",
  taxPerc: "18",
  trackSignature: "",
  mrp: "0",
};

function run(draft: InvoiceDraft, ...actions: InvoiceAction[]): InvoiceDraft {
  return actions.reduce(invoiceReducer, draft);
}

function bill(settings = NO_PRICES, item = ITEM): InvoiceDraft {
  return run(
    createDraft(SCOPE, TODAY),
    { type: "lineSettings", settings },
    { type: "supplier", id: "sup-1", name: "ZT-PUR Supplier" },
    { type: "godown", id: "gd-1", name: "Main" },
    { type: "applyItem", key: "l1", item },
    { type: "editCell", key: "l1", column: COL.Billed, raw: "10" },
    { type: "editCell", key: "l1", column: COL.Rate, raw: "100" },
  );
}

/** The server's answer to the bill's first line. */
function answer(line: Record<string, unknown>, extra: Record<string, unknown> = {}): InvoiceAction {
  return { type: "calc", sentKeys: ["l1"], answer: { lines: [{ lineNo: 1, ...line }], totals: {}, ...extra } };
}

describe("P7 — Disc / Sch as amounts", () => {
  it("typing an amount clears its %, and the other way round; the payload sends the one typed", () => {
    let draft = run(bill(), { type: "editCell", key: "l1", column: COL.DiscPct, raw: "2" }, { type: "editCell", key: "l1", column: COL.SchPct, raw: "5" });
    draft = run(draft, { type: "editCell", key: "l1", column: COL.DiscAmt, raw: "30/2" });
    expect(draft.lines[0]).toMatchObject({ discPct: "", discAmt: "15", schPct: "5", schAmt: "" });
    let dto = buildPayload(draft, false, TODAY).body.lines[0];
    expect(dto).toMatchObject({ discAmt: 15, schPct: 5 });
    expect(dto.discPct).toBeUndefined();
    draft = run(draft, { type: "editCell", key: "l1", column: COL.SchAmt, raw: "20" }, { type: "editCell", key: "l1", column: COL.DiscPct, raw: "1" });
    expect(draft.lines[0]).toMatchObject({ discPct: "1", discAmt: "", schPct: "", schAmt: "20" });
    dto = buildPayload(draft, false, TODAY).body.lines[0];
    expect(dto).toMatchObject({ discPct: 1, schAmt: 20 });
    expect(dto.discAmt).toBeUndefined();
    expect(dto.schPct).toBeUndefined();
  });

  it("the blank one shows what its pair comes to — the estimate's at once, the server's after", () => {
    let draft = run(bill(), { type: "editCell", key: "l1", column: COL.DiscPct, raw: "2" });
    expect(draft.lines[0].derived.discAmt).toBe("20.00");
    draft = run(draft, answer({ gross: "1000.00", discAmt: "20.00", schAmt: "0.00", taxable: "980.00" }));
    expect(draft.lines[0].derived).toMatchObject({ discAmt: "20.00", discPct: "" });
  });

  it("a stored amount line keeps its amount; a stored % line shows its amount muted", () => {
    const loaded = draftFromPayload(
      {
        header: { piId: "pi-1", piCompanyId: "c1", piBranchId: "b1", piAccYear: "2026-2027", piRefno: "PUR/1", piStatus: "DRAFT", piSupplierId: "s1", piGodownId: "g1" },
        lines: [
          { piiId: "x1", piiItemId: "i1", piiUomId: "u1", piiBilledQty: "10", piiRate: "100", piiDiscPct: "0", piiDiscAmt: "25", piiSchPct: "2", piiSchAmt: "19.50", piiGrossAmt: "1000" },
        ],
      } as PurchaseInvoicePayload,
      "entry",
    );
    expect(loaded.lines[0]).toMatchObject({ discPct: "", discAmt: "25", schPct: "2", schAmt: "" });
    expect(loaded.lines[0].derived).toMatchObject({ discPct: "2.5", schAmt: "19.50" });
  });
});

describe("P8 — Markup B–D", () => {
  it("a typed markup clears its Sell and goes as markupXPct; a typed Sell clears its markup", () => {
    let draft = run(bill(PRICES), { type: "editCell", key: "l1", column: COL.SellC, raw: "150" });
    draft = run(draft, { type: "editCell", key: "l1", column: COL.MarkupC, raw: "20" }, { type: "editCell", key: "l1", column: COL.MarkupB, raw: "30" });
    expect(draft.lines[0]).toMatchObject({ sellC: "", markupC: "20", markupB: "30" });
    expect(buildPayload(draft, false, TODAY).body.lines[0]).toMatchObject({ markupBPct: 30, markupCPct: 20 });
    draft = run(draft, { type: "editCell", key: "l1", column: COL.SellB, raw: "140" });
    expect(draft.lines[0]).toMatchObject({ markupB: "", sellB: "140" });
    const dto = buildPayload(draft, false, TODAY).body.lines[0];
    expect(dto.markupBPct).toBeUndefined();
    expect(dto.sellB).toBe(140);
  });

  it("paints Sell / Markup / margin B–D back; nothing is keyed or sent without the price policy", () => {
    const draft = run(bill(PRICES), { type: "editCell", key: "l1", column: COL.MarkupB, raw: "20" });
    const painted = invoiceReducer(draft, answer({ sellB: 140.89, markupBPct: "20.00", marginBPct: "16.67", markupAPct: null }));
    expect(painted.lines[0]).toMatchObject({ sellB: "140.89", markupB: "20", marginBPct: "16.67", markup: "" });
    const off = run(bill(), { type: "editCell", key: "l1", column: COL.MarkupB, raw: "20" }, { type: "editCell", key: "l1", column: COL.Msp, raw: "90" });
    expect(off.lines[0]).toMatchObject({ markupB: "", msp: "" });
  });
});

describe("P9 — HSN and the MSP (Q4: the line owns it when typed or stored)", () => {
  it("the item's current MSP shows but is never sent; a typed one is sent until cleared; a typed 0 is sent", () => {
    let draft = invoiceReducer(bill(PRICES), answer({ hsn: "33049990", minPrice: "125.00" }));
    expect(draft.lines[0]).toMatchObject({ hsn: "33049990", msp: "125", mspOwned: false });
    expect(buildPayload(draft, false, TODAY).body.lines[0].minPrice).toBeUndefined();
    draft = run(draft, { type: "editCell", key: "l1", column: COL.Msp, raw: "130" });
    expect(buildPayload(draft, false, TODAY).body.lines[0].minPrice).toBe(130);
    // the answer does not paint over a typed MSP
    draft = invoiceReducer(draft, answer({ minPrice: "125.00" }));
    expect(draft.lines[0].msp).toBe("130");
    draft = run(draft, { type: "editCell", key: "l1", column: COL.Msp, raw: "0" });
    expect(buildPayload(draft, false, TODAY).body.lines[0].minPrice).toBe(0);
    draft = run(draft, { type: "editCell", key: "l1", column: COL.Msp, raw: "" });
    expect(buildPayload(draft, false, TODAY).body.lines[0].minPrice).toBeUndefined();
  });

  it("a stored MSP is the line's: sent back on the re-save; HSN from the stored line", () => {
    const loaded = draftFromPayload(
      {
        header: { piId: "pi-1", piCompanyId: "c1", piBranchId: "b1", piAccYear: "2026-2027", piRefno: "PUR/1", piStatus: "DRAFT", piSupplierId: "s1", piGodownId: "g1" },
        lines: [{ piiId: "x1", piiItemId: "i1", piiUomId: "u1", piiBilledQty: "1", piiRate: "100", piiMinPrice: "125.00", piiHsnCode: "1006" }],
      } as PurchaseInvoicePayload,
      "entry",
      PRICES,
    );
    expect(loaded.lines[0]).toMatchObject({ msp: "125", mspOwned: true, hsn: "1006" });
    expect(buildPayload(loaded, false, TODAY).body.lines[0].minPrice).toBe(125);
  });
});

describe("P10 — the charge split and Total", () => {
  it("Total is the server's amount (the after-tax share in); a stored line adds its after-tax share", () => {
    const painted = invoiceReducer(bill(), answer({ taxable: "1050.00", total: "1239.00", amount: "1259.00", chrgBeforeTax: "50.00", chrgAfterTax: "20.00" }));
    expect(painted.lines[0].calc).toMatchObject({ total: 1259, chrgBeforeTax: 50, chrgAfterTax: 20 });
    const older = invoiceReducer(bill(), answer({ total: "1239.00", chrgAfterTax: "20.00" }));
    expect(older.lines[0].calc?.total).toBe(1259);
    const loaded = draftFromPayload(
      {
        header: { piId: "pi-1", piCompanyId: "c1", piBranchId: "b1", piAccYear: "2026-2027", piRefno: "PUR/1", piStatus: "POSTED", piSupplierId: "s1", piGodownId: "g1" },
        lines: [{ piiId: "x1", piiItemId: "i1", piiUomId: "u1", piiBilledQty: "1", piiRate: "100", piiTotalAmt: "1239", piiChrgBeforeTax: "50", piiChrgAfterTax: "20" }],
        gstBreakup: [{ gstPct: "18.00", taxable: "1050.00", cgst: "94.50", sgst: "94.50", igst: "0", cess: "0", total: "1239.00" }],
      } as PurchaseInvoicePayload,
      "browse",
    );
    expect(loaded.lines[0].calc).toMatchObject({ total: 1259, chrgBeforeTax: 50, chrgAfterTax: 20 });
    expect(loaded.gstBreakup).toHaveLength(1);
  });
});

describe("P11 — the line at once, the server after", () => {
  it("a typed cell reprices the line and the totals follow; the answer replaces both", () => {
    let draft = bill();
    expect(draft.lines[0].est).toMatchObject({ taxable: 1000, tax: 180, total: 1180 });
    expect(draft.awaitingServer).toBe(true);
    expect(draft.liveTotals).toMatchObject({ taxable: 1000, gstTotal: 180, netPayable: 1180 });
    draft = invoiceReducer(draft, answer({ taxable: "1000.00", cgst: "90", sgst: "90", total: "1180", amount: "1180" }, { gstBreakup: [{ gstPct: "18" }] }));
    expect(draft.lines[0].est).toBeNull();
    expect(draft).toMatchObject({ awaitingServer: false, liveTotals: null });
    expect(draft.gstBreakup).toHaveLength(1);
  });

  it("the estimate uses the last answer's charge shares and the supplier's tax mode", () => {
    let draft = invoiceReducer(bill(), answer({ taxable: "1050", gstPct: "18", total: "1239", amount: "1259", chrgBeforeTax: "50", chrgAfterTax: "20" }, { supplierTaxMode: "REGULAR" }));
    draft = run(draft, { type: "editCell", key: "l1", column: COL.Billed, raw: "20" });
    expect(draft.lines[0].est).toMatchObject({ taxable: 2050, tax: 369, total: 2439 });
    const composition = invoiceReducer(bill(), answer({ taxable: "1000", gstPct: "18", total: "1000" }, { supplierTaxMode: "COMPOSITION" }));
    expect(run(composition, { type: "editCell", key: "l1", column: COL.Rate, raw: "50" }).lines[0].est?.tax).toBe(0);
  });

  it("no estimate where no recalculation follows (a typed batch); a PO line's lookup reprices and recalculates", () => {
    const answered = invoiceReducer(bill(), answer({ taxable: "1000", gstPct: "18", total: "1180" }));
    const batch = run(answered, { type: "editCell", key: "l1", column: COL.Batch, raw: "b1" });
    expect(batch.awaitingServer).toBe(false);
    expect(batch.lines[0].est).toBeNull();
    const lookup: InvoiceAction = { type: "applyItem", key: "l1", item: ITEM, source: true };
    expect(changesFigures(lookup)).toBe(true);
    expect(changesFigures({ type: "applyItem", key: "l1", item: ITEM, quiet: true })).toBe(false);
    expect(invoiceReducer(answered, lookup).lines[0].est).toMatchObject({ taxable: 1000, tax: 180 });
  });

  it("a line with an item and no qty yet stays out of /validate (Save still names it)", () => {
    const draft = run(bill(), { type: "applyItem", key: "l2", item: { ...ITEM, itemId: "item-b" } });
    const { body, sentKeys } = buildPayload(draft, false, TODAY, true);
    expect(sentKeys).toEqual(["l1"]);
    expect(body.lines).toHaveLength(1);
    expect(buildPayload(draft, false, TODAY).body.lines).toHaveLength(2);
    const painted = invoiceReducer(draft, { type: "calc", sentKeys, answer: { lines: [{ lineNo: 1, total: "1180" }], totals: {} } });
    expect(painted.hint).toBe("Line 2 has no qty yet — it joins the figures once it has one.");
    const onlyHalf = run(createDraft(SCOPE, TODAY), { type: "supplier", id: "s", name: "S" }, { type: "godown", id: "g", name: "G" }, { type: "applyItem", key: "l1", item: ITEM });
    expect(canRecalc(onlyHalf)).toBe(false);
  });
});

describe("the godown a new bill takes (P11 / Q5)", () => {
  it("the supplier's default (else the branch's) when none is picked; a picked one is left alone", () => {
    const fresh = run(createDraft(SCOPE, TODAY), { type: "supplier", id: "s1", name: "S" });
    const took = invoiceReducer(fresh, { type: "supplierDefaults", creditDays: null, billFromGstin: "", godownId: "g-sup", godownName: "Supplier godown" });
    expect(took).toMatchObject({ godownId: "g-sup", godownName: "Supplier godown" });
    const picked = run(fresh, { type: "godown", id: "g-mine", name: "Mine" });
    expect(invoiceReducer(picked, { type: "supplierDefaults", creditDays: null, billFromGstin: "", godownId: "g-sup" }).godownId).toBe("g-mine");
    // no supplier yet: nothing to default from
    expect(invoiceReducer(createDraft(SCOPE, TODAY), { type: "supplierDefaults", creditDays: null, billFromGstin: "", godownId: "g-br" }).godownId).toBe("");
  });
});

describe("P15 — where Enter stops on a line", () => {
  it("Item on a blank line; Billed → Free → Rate → Disc % → Sch % → Extra disc on a keyed one; Batch / Expiry only when tracked", () => {
    const draft = bill();
    const blank = draft.lines[1];
    const keyed = draft.lines[0];
    expect(isEnterStop(blank, COL.Item)).toBe(true);
    expect(isEnterStop(blank, COL.Barcode)).toBe(false);
    expect(isEnterStop(keyed, COL.Item)).toBe(false);
    for (const column of [COL.Billed, COL.Free, COL.Rate, COL.DiscPct, COL.SchPct, COL.ExtraDisc]) {
      expect(isEnterStop(keyed, column)).toBe(true);
    }
    for (const column of [COL.Batch, COL.Expiry, COL.Recd, COL.DiscAmt, COL.Mrp]) {
      expect(isEnterStop(keyed, column)).toBe(false);
    }
    const tracked = run(createDraft(SCOPE, TODAY), { type: "applyItem", key: "l1", item: { ...ITEM, trackSignature: "BE" } }).lines[0];
    expect(isEnterStop(tracked, COL.Batch)).toBe(true);
    expect(isEnterStop(tracked, COL.Expiry)).toBe(true);
    const grn = { ...keyed, grnItemId: "g1" };
    expect(isEnterStop(grn, COL.Free)).toBe(false);
    expect(isEnterStop(grn, COL.Billed)).toBe(true);
  });
});
