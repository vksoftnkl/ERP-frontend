import { describe, expect, it } from "vitest";
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import { resolveLineColumns } from "./invoice.columns";
import { COL, MORE_COLUMN_NOS, SHOWN_COLUMNS } from "./invoice.constants";
import {
  allocsOf,
  buildPayload,
  canRecalc,
  changesFigures,
  checkBeforeSave,
  checkText,
  createDraft,
  draftFromPayload,
  invoiceReducer,
  isWorthRemembering,
  rateText,
  whyNotEditable,
  type InvoiceAction,
} from "./invoice.state";
import type { InvoiceDraft, PurchaseInvoicePayload, PurchaseItemLookup } from "./invoice.types";

const SCOPE = { companyId: "c1", branchId: "b1", accYear: "2026-2027", deviceId: "d1" };
const TODAY = "2026-10-28";

const ITEM_A: PurchaseItemLookup = {
  itemId: "item-a",
  itemCode: "A1",
  itemName: "ZT-ITEM-A",
  uomId: "uom-a",
  unitName: "PCS",
  toBaseFactor: "1.000000",
  taxPerc: "18.00",
  trackSignature: "",
  mrp: "0",
};
const ITEM_B: PurchaseItemLookup = { ...ITEM_A, itemId: "item-b", itemName: "MRP STOCK ITEM", uomId: "uom-b", mrp: "75.00" };

function run(draft: InvoiceDraft, ...actions: InvoiceAction[]): InvoiceDraft {
  return actions.reduce(invoiceReducer, draft);
}

/** The Qt live test's bill: A 10 × 100; B 20 billed, 16 received, 2 damaged, batch + expiry + MRP 80. */
function keyedBill(): InvoiceDraft {
  let draft = createDraft(SCOPE, TODAY);
  draft = run(
    draft,
    { type: "supplier", id: "sup-1", name: "ZT-PUR Supplier" },
    { type: "godown", id: "gd-1", name: "Coimbatore" },
    { type: "header", patch: { supplierInvNo: "ZTQ-1", invoiceAmount: "2,300" } },
    { type: "applyItem", key: "l1", item: ITEM_A, name: "ZT-ITEM-A" },
    { type: "editCell", key: "l1", column: COL.Billed, raw: "10" },
    { type: "editCell", key: "l1", column: COL.Rate, raw: "100" },
  );
  const second = draft.lines[1].key;
  return run(
    draft,
    { type: "applyItem", key: second, item: ITEM_B },
    { type: "editCell", key: second, column: COL.Billed, raw: "20" },
    { type: "editCell", key: second, column: COL.Recd, raw: "16" },
    { type: "editCell", key: second, column: COL.Dmg, raw: "2" },
    { type: "editCell", key: second, column: COL.Rate, raw: "50" },
    { type: "editCell", key: second, column: COL.Batch, raw: "zt-1028" },
    { type: "editCell", key: second, column: COL.Expiry, raw: "30/06/2027" },
    { type: "editCell", key: second, column: COL.Mrp, raw: "80" },
  );
}

describe("purchase invoice — the draft", () => {
  it("starts DRAFT with today's dates and one blank line", () => {
    const draft = createDraft(SCOPE, TODAY);
    expect(draft.status).toBe("DRAFT");
    expect(draft.docDate).toBe(TODAY);
    expect(draft.supplierInvDate).toBe(TODAY);
    expect(draft.lines).toHaveLength(1);
    expect(draft.dirty).toBe(false);
  });

  it("an item lookup fills unit and GST %, and a blank line follows (Qt S1)", () => {
    const draft = run(createDraft(SCOPE, TODAY), { type: "applyItem", key: "l1", item: ITEM_A, name: "ZT-ITEM-A" });
    expect(draft.lines[0].unitName).toBe("PCS");
    expect(draft.lines[0].gstPct).toBe("18");
    expect(draft.lines).toHaveLength(2);
    expect(draft.lines[1].itemId).toBe("");
    expect(draft.dirty).toBe(true);
  });

  it("takes the item's MRP when it has one", () => {
    const draft = run(createDraft(SCOPE, TODAY), { type: "applyItem", key: "l1", item: ITEM_B });
    expect(draft.lines[0].mrp).toBe("75");
  });

  it("opens Barcode only on a blank line, the rest only on a line with an item", () => {
    const blank = createDraft(SCOPE, TODAY).lines[0];
    expect(whyNotEditable(blank, COL.Barcode)).toBe("");
    expect(whyNotEditable(blank, COL.Item)).toBe("");
    expect(whyNotEditable(blank, COL.Billed)).not.toBe("");
    const keyed = keyedBill().lines[0];
    expect(whyNotEditable(keyed, COL.Barcode)).not.toBe("");
    expect(whyNotEditable(keyed, COL.Billed)).toBe("");
    expect(whyNotEditable(keyed, COL.Taxable)).not.toBe("");
  });

  it("refuses edits on a posted bill", () => {
    const posted = { ...keyedBill(), status: "POSTED" };
    expect(invoiceReducer(posted, { type: "editCell", key: "l1", column: COL.Billed, raw: "99" })).toBe(posted);
    expect(invoiceReducer(posted, { type: "removeLine", key: "l1" })).toBe(posted);
  });

  it("says a bad expiry, and upper-cases the batch", () => {
    const draft = keyedBill();
    expect(draft.lines[1].batch).toBe("ZT-1028");
    const bad = invoiceReducer(draft, { type: "editCell", key: draft.lines[1].key, column: COL.Expiry, raw: "31/02/2027" });
    expect(bad.hint).toBe("Line 2: expiry must be dd/MM/yyyy.");
  });

  it("removes a line and keeps a blank one at the end", () => {
    const draft = invoiceReducer(keyedBill(), { type: "removeLine", key: "l1" });
    expect(draft.lines.map((line) => line.itemId)).toEqual(["item-b", ""]);
  });
});

describe("purchase invoice — the payload (Qt buildPayload)", () => {
  it("builds the header and the lines as Qt does", () => {
    const { body, sentKeys } = buildPayload(keyedBill(), false, TODAY);
    expect(body.header).toMatchObject({
      companyId: "c1",
      branchId: "b1",
      accYear: "2026-2027",
      deviceId: "d1",
      supplierId: "sup-1",
      supplierInvNo: "ZTQ-1",
      godownId: "gd-1",
      invoiceAmountPrinted: 2300,
      post: false,
    });
    expect(body.header.piId).toBeUndefined();
    expect(body.charges).toEqual([]);
    expect(sentKeys).toHaveLength(2);
    expect(body.lines[0]).toEqual({ lineNo: 1, itemId: "item-a", uomId: "uom-a", billedQty: 10, rate: 100 });
    expect(body.lines[1]).toMatchObject({
      lineNo: 2,
      billedQty: 20,
      receivedQty: 16,
      damagedQty: 2,
      rate: 50,
      mrp: 80,
    });
  });

  it("batch / expiry on the row = one SALEABLE row + one DAMAGED row", () => {
    const line = keyedBill().lines[1];
    expect(allocsOf(line)).toEqual([
      { bucket: "SALEABLE", batchNo: "ZT-1028", expiryDate: "2027-06-30", mrp: 80, qty: 16 },
      { bucket: "DAMAGED", batchNo: "ZT-1028", expiryDate: "2027-06-30", mrp: 80, qty: 2 },
    ]);
  });

  it("received defaults to billed − damaged when it was not typed", () => {
    let draft = keyedBill();
    const key = draft.lines[1].key;
    draft = invoiceReducer(draft, { type: "editCell", key, column: COL.Recd, raw: "" });
    const allocs = allocsOf(draft.lines[1]);
    expect(allocs?.[0].qty).toBe(18);
    expect(buildPayload(draft, false, TODAY).body.lines[1].receivedQty).toBeUndefined();
  });

  it("a calculation with no invoice no yet sends '-' (the DTO insists)", () => {
    const draft = invoiceReducer(keyedBill(), { type: "header", patch: { supplierInvNo: "" } });
    expect(buildPayload(draft, false, TODAY, true).body.header.supplierInvNo).toBe("-");
    expect(buildPayload(draft, false, TODAY).body.header.supplierInvNo).toBe("");
  });

  it("gates save and the calculation the Qt way", () => {
    const empty = createDraft(SCOPE, TODAY);
    expect(canRecalc(empty)).toBe(false);
    expect(checkBeforeSave(empty)?.title).toBe("Header incomplete");
    const bill = keyedBill();
    expect(canRecalc(bill)).toBe(true);
    expect(checkBeforeSave(bill)).toBeNull();
    const noLines = { ...bill, lines: bill.lines.filter((line) => !line.itemId) };
    expect(checkBeforeSave(noLines)?.title).toBe("No lines");
    expect(checkBeforeSave({ ...bill, status: "POSTED", refno: "PUR/1" })?.message).toBe("PUR/1 is POSTED.");
  });

  it("schedules a recalculation for the figures, not for batch / expiry", () => {
    expect(changesFigures({ type: "editCell", key: "l1", column: COL.Rate, raw: "1" })).toBe(true);
    expect(changesFigures({ type: "editCell", key: "l1", column: COL.Batch, raw: "X" })).toBe(false);
    expect(changesFigures({ type: "header", patch: { invoiceAmount: "1" } })).toBe(true);
    expect(changesFigures({ type: "header", patch: { remarks: "x" } })).toBe(false);
    expect(changesFigures({ type: "applyItem", key: "l1", item: ITEM_A, quiet: true })).toBe(false);
  });
});

describe("purchase invoice — answers painted back", () => {
  it("paints the server's figures by the order the lines were sent (Qt paintCalc)", () => {
    const bill = keyedBill();
    const { sentKeys } = buildPayload(bill, false, TODAY, true);
    const painted = invoiceReducer(bill, {
      type: "calc",
      sentKeys,
      answer: {
        lines: [
          { lineNo: 1, taxable: "1000.00", gstPct: "18.00", cgst: "90.00", sgst: "90.00", igst: "0.00", cess: "0.00", total: "1180.00", landedCostWot: "100.000000", pendingShortQty: "0.00" },
          { lineNo: 2, taxable: "1000.00", gstPct: "12.00", cgst: "60.00", sgst: "60.00", igst: "0", cess: "0", total: "1120.00", landedCostWot: "50", pendingShortQty: "2.000" },
        ],
        totals: { taxable: "2000.00", cgst: "150.00", sgst: "150.00", igst: "0", cess: "0", roundOff: "0.00", netPayable: "2300.00", shortValue: "100.00", itcPending: "12.00" },
        invoiceAmountPrinted: 2300,
        difference: "0.00",
      },
    });
    expect(painted.lines[0].calc?.total).toBe(1180);
    expect(painted.lines[0].calc?.tax).toBe(180);
    expect(checkText(painted.lines[0])).toBe("OK");
    expect(checkText(painted.lines[1])).toBe("SHORT 2");
    expect(painted.lines[1].gstPct).toBe("12");
    expect(painted.totals).toMatchObject({ netPayable: 2300, gst: 300, difference: 0, shortValue: 100, itcPending: 12 });
    // Painting is not an edit.
    expect(painted.dirty).toBe(bill.dirty);
  });

  it("drops an answer for a line that is gone", () => {
    const bill = keyedBill();
    const { sentKeys } = buildPayload(bill, false, TODAY, true);
    const removed = invoiceReducer(bill, { type: "removeLine", key: sentKeys[0] });
    const painted = invoiceReducer(removed, {
      type: "calc",
      sentKeys,
      answer: { lines: [{ lineNo: 1, total: "1" }, { lineNo: 2, total: "2" }], totals: {} },
    });
    expect(painted.lines[0].calc?.total).toBe(2);
  });
});

const STORED: PurchaseInvoicePayload = {
  header: {
    piId: "pi-1",
    piCompanyId: "c1",
    piBranchId: "b1",
    piAccYear: "2026-2027",
    piDeviceId: "d1",
    piRefno: "PUR/2026-2027/D14/00302",
    piStatus: "DRAFT",
    piDocDate: "2026-10-28T00:00:00.000Z",
    piSupplierId: "sup-1",
    supplierName: "ZT-PUR Supplier",
    piSupplierInvNo: "ZTQ-1",
    piSupplierInvDate: "2026-10-27T00:00:00.000Z",
    piGodownId: "gd-1",
    godownName: "Coimbatore",
    piInvoiceAmountPrinted: "2300.00",
    piTaxableAmt: "2000.00",
    piCgstAmt: "150.00",
    piSgstAmt: "150.00",
    piIgstAmt: "0.00",
    piCessAmt: "0.00",
    piRoundOff: "0.00",
    piNetPayable: "2300.00",
    piShortValue: "100.00",
    piItcPendingAmt: "12.00",
  },
  lines: [
    {
      piiId: "pii-1",
      piiItemId: "item-a",
      piiUomId: "uom-a",
      piiBilledQty: "10.000",
      piiReceivedQty: "10.000",
      piiDamagedQty: "0.000",
      piiShortQty: "0.000",
      piiFreeQty: "0.000",
      piiRate: "100.0000",
      piiDiscPct: "0.00",
      piiTaxableAmt: "1000.00",
      piiGstPct: "18.00",
      piiCgstAmt: "90.00",
      piiSgstAmt: "90.00",
      piiTotalAmt: "1180.00",
      piiLandedCostWot: "100.000000",
      allocs: [{ piaBucket: "SALEABLE", piaQty: "10.000" }],
    },
    {
      piiId: "pii-2",
      piiItemId: "item-b",
      piiUomId: "uom-b",
      piiBilledQty: "20.000",
      piiReceivedQty: "16.000",
      piiDamagedQty: "2.000",
      piiShortQty: "2.000",
      piiRate: "50.0000",
      piiMrp: "80.00",
      allocs: [
        { piaBucket: "SALEABLE", piaBatchNo: "ZT-1028", piaExpiryDate: "2027-06-30T00:00:00.000Z", piaQty: "16.000" },
        { piaBucket: "DAMAGED", piaBatchNo: "ZT-1028", piaExpiryDate: "2027-06-30T00:00:00.000Z", piaQty: "2.000" },
      ],
    },
    {
      piiId: "pii-3",
      piiItemId: "item-c",
      piiUomId: "uom-c",
      piiBilledQty: "5",
      piiReceivedQty: "5",
      piiRate: "10",
      allocs: [
        { piaGodownId: "gd-1", piaBucket: "SALEABLE", piaBatchNo: "B1", piaQty: "3.000", piaSalePrice: null },
        { piaGodownId: "gd-1", piaBucket: "SALEABLE", piaBatchNo: "B2", piaQty: "2.000", piaFreeQty: "0" },
      ],
    },
  ],
};

describe("purchase invoice — a stored bill (Qt applyLoaded)", () => {
  it("reads the header, the lines and the stored figures", () => {
    const draft = draftFromPayload(STORED, "entry");
    expect(draft.refno).toBe("PUR/2026-2027/D14/00302");
    expect(draft.docDate).toBe("2026-10-28");
    expect(draft.supplierInvDate).toBe("2026-10-27");
    expect(draft.invoiceAmount).toBe("2300");
    expect(draft.godownName).toBe("Coimbatore");
    expect(draft.lines[0]).toMatchObject({ billed: "10", recd: "10", dmg: "", rate: "100", gstPct: "18" });
    expect(draft.lines[1]).toMatchObject({ batch: "ZT-1028", expiry: "30/06/2027", mrp: "80", dmg: "2" });
    expect(checkText(draft.lines[1])).toBe("SHORT 2");
    expect(draft.totals?.netPayable).toBe(2300);
    expect(draft.dirty).toBe(false);
  });

  it("a DRAFT opened for keying ends on a blank line; read-only does not", () => {
    expect(draftFromPayload(STORED, "entry").lines).toHaveLength(4);
    expect(draftFromPayload(STORED, "browse").lines).toHaveLength(3);
    expect(draftFromPayload({ ...STORED, header: { ...STORED.header, piStatus: "POSTED" } }, "entry").lines).toHaveLength(3);
  });

  it("keeps a line split into several batches as it was, and shuts its batch cells", () => {
    const draft = draftFromPayload(STORED, "entry");
    const split = draft.lines[2];
    expect(split.batch).toBe("2 batches (F12)");
    expect(whyNotEditable(split, COL.Batch)).toContain("2 batches");
    expect(allocsOf(split)).toEqual([
      { godownId: "gd-1", bucket: "SALEABLE", batchNo: "B1", qty: 3 },
      { godownId: "gd-1", bucket: "SALEABLE", batchNo: "B2", qty: 2 },
    ]);
  });

  it("re-saves a stored draft under its own id", () => {
    const { body } = buildPayload(draftFromPayload(STORED, "entry"), true, TODAY);
    expect(body.header.piId).toBe("pi-1");
    expect(body.header.post).toBe(true);
    expect(body.lines).toHaveLength(3);
    expect(body.lines[0].receivedQty).toBe(10);
  });

  it("the names of a loaded line arrive quietly, and only for the item it still holds", () => {
    const draft = draftFromPayload(STORED, "entry");
    const named = invoiceReducer(draft, { type: "applyItem", key: "l1", item: ITEM_A, quiet: true });
    expect(named.lines[0].itemName).toBe("ZT-ITEM-A");
    expect(named.lines[0].calc?.total).toBe(1180);
    expect(named.dirty).toBe(false);
    const wrong = invoiceReducer(draft, { type: "applyItem", key: "l1", item: ITEM_B, quiet: true });
    expect(wrong).toBe(draft);
  });

  it("F2 on a read-only draft opens it for keying", () => {
    const browse = draftFromPayload(STORED, "browse");
    const editing = invoiceReducer(browse, { type: "beginEdit" });
    expect(editing.viewMode).toBe("entry");
    expect(editing.lines).toHaveLength(4);
    const posted = draftFromPayload({ ...STORED, header: { ...STORED.header, piStatus: "POSTED" } }, "browse");
    expect(invoiceReducer(posted, { type: "beginEdit" })).toBe(posted);
  });
});

describe("purchase invoice — small rules", () => {
  it("rateText trims a stored rate", () => {
    expect(rateText("100.0000")).toBe("100");
    expect(rateText("12.3450")).toBe("12.345");
    expect(rateText(null)).toBe("");
  });

  it("remembers only real, unsaved work", () => {
    expect(isWorthRemembering(createDraft(SCOPE, TODAY))).toBe(false);
    expect(isWorthRemembering(keyedBill())).toBe(true);
    expect(isWorthRemembering({ ...keyedBill(), status: "POSTED" })).toBe(false);
  });
});

describe("purchase invoice — the line columns", () => {
  it("falls back to the Qt columns, the price and textile ones only under their rules", () => {
    const allRules = { priceUpdate: true, autoBatchNo: true };
    expect(resolveLineColumns(undefined, allRules).map((column) => column.no)).toEqual(
      SHOWN_COLUMNS.filter((no) => !MORE_COLUMN_NOS.has(no)),
    );
    const allMore = new Set(MORE_COLUMN_NOS);
    expect(resolveLineColumns(undefined, allRules, allMore).map((column) => column.no)).toEqual([...SHOWN_COLUMNS]);
    const rows: UiTableColumnRow[] = [
      { uiTblClmId: "1", uiTblClmNo: "1", uiTblClmName: "Item", uiTblClmColumnWidth: 9, uiTblClmColumnVisibility: true, uiTblClmColumnFocus: false, uiTblClmColumnPosition: 10, uiTblClmColumnNecessity: false },
      { uiTblClmId: "2", uiTblClmNo: "0", uiTblClmName: "Barcode", uiTblClmColumnWidth: 4, uiTblClmColumnVisibility: true, uiTblClmColumnFocus: false, uiTblClmColumnPosition: 20, uiTblClmColumnNecessity: false },
      { uiTblClmId: "3", uiTblClmNo: "33", uiTblClmName: "Sell A", uiTblClmColumnWidth: 5, uiTblClmColumnVisibility: true, uiTblClmColumnFocus: false, uiTblClmColumnPosition: 15, uiTblClmColumnNecessity: false },
      { uiTblClmId: "4", uiTblClmNo: "2", uiTblClmName: "Unit", uiTblClmColumnWidth: 3, uiTblClmColumnVisibility: false, uiTblClmColumnFocus: false, uiTblClmColumnPosition: 30, uiTblClmColumnNecessity: false },
    ];
    const columns = resolveLineColumns(rows);
    // The mockup's order wins over the layout's positions (Qt moveSection).
    expect(columns[0].no).toBe(COL.Barcode);
    expect(columns[1].no).toBe(COL.Item);
    // Sell A only while the bill keys selling prices.
    expect(columns.some((column) => column.no === COL.SellA)).toBe(false);
    expect(columns.some((column) => column.no === COL.Unit)).toBe(false);
    const priced = resolveLineColumns(rows, { priceUpdate: true, autoBatchNo: false });
    expect(priced.findIndex((column) => column.no === COL.SellA)).toBeGreaterThan(priced.findIndex((column) => column.no === COL.CostWot));
    expect(priced.find((column) => column.no === COL.DiscPct)?.header).toBe("Disc");
    expect(priced.some((column) => column.no === COL.Size)).toBe(false);
    const total = columns.reduce((sum, column) => sum + column.widthPct, 0);
    expect(Math.round(total)).toBe(100);
  });
});
