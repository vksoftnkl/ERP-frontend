import { describe, expect, it } from "vitest";
import type { ItemPriceLookupPayload } from "@/features/sales/quotation/quotation.types";
import { nextRowKey } from "@/features/sales/quotation/quotation.utils";
import type { OpenSourcePick } from "@/features/sales/testbill/domain/import";
import {
  appendSourceLines,
  applyDcItemPrice,
  copyDcAsNew,
  createDcDraft,
  createDcLine,
  dcReducer,
  discountAll,
  draftFromHeld,
  hasUnsavedWork,
  lineIsFulfilled,
  setLineDiscPerc,
  setLineQty,
  setLineRate,
  withTrailingBlank,
} from "./dc.state";
import type { DcDraft } from "./dc.types";

const draft = () =>
  createDcDraft({ companyId: "c", branchId: "b", accYear: "2026-2027", dcDate: "2026-10-31", companyStateCode: "33" });

const lookup = (overrides: Partial<ItemPriceLookupPayload> = {}): ItemPriceLookupPayload =>
  ({
    item_id: "item-1",
    item_uc_id: "iuc-1",
    godown_id: "gd-1",
    godown_name: "Main",
    item_code: "A1",
    item_name: "ZT-ITEM-A",
    item_com_code: null,
    barcode: "890",
    allow_promo: false,
    add_freight: false,
    item_group_id: "g",
    item_category_id: null,
    item_brand_id: null,
    item_section_id: null,
    weigh_scale: false,
    batch_config: 0,
    service_item: "N",
    allow_negative_stock: false,
    price_level: 1,
    sales_price: 100,
    cost_price: 60,
    cost_wot: 55,
    min_price: 80,
    max_price: 120,
    disc_perc: 5,
    disc_qty: 0,
    sch_discount: null,
    addl_cess: 0,
    unit_name: "PCS",
    base_unit_id: "u",
    base_factor: 1,
    iuc_uom_weight: 0.5,
    decimal_count: 2,
    loading_charge: null,
    resolved_weight: null,
    freight_charge: null,
    loyalty_pv: 0,
    stock: 10,
    reorder_qty: null,
    item_incl_tax: false,
    gst_rate: 18,
    cess_perc: 0,
    cess_unit: 0,
    sgst_perc: 9,
    cgst_perc: 9,
    igst_perc: 18,
    ...overrides,
  }) as ItemPriceLookupPayload;

describe("delivery challan draft", () => {
  it("starts as a DRAFT with SUPPLY, one blank row and the local place of supply", () => {
    const d = draft();
    expect(d.status).toBe("DRAFT");
    expect(d.header.purpose).toBe("SUPPLY");
    expect(d.header.purposeLabel).toBe("Supply");
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0].itemId).toBe("");
    expect(d.isLocalSale).toBe(true);
  });

  it("always keeps one blank row waiting", () => {
    const priced = createDcLine({ itemId: "x" });
    expect(withTrailingBlank([priced])).toHaveLength(2);
    const blank = createDcLine();
    expect(withTrailingBlank([priced, blank])).toHaveLength(2);
  });

  it("prices a hand line from the price list, bucket SALEABLE, auto-pop 1", () => {
    const line = applyDcItemPrice(createDcLine(), lookup(), { autoPopQty: true, priceLevel: 1 });
    expect(line.rate).toBe(100);
    expect(line.discPerc).toBe(5);
    expect(line.bucket).toBe("SALEABLE");
    expect(line.billQty).toBe(1);
    expect(line.godownId).toBe("gd-1");
  });

  it("keeps an ORDER line's rate and discount — the customer agreed it", () => {
    const fromOrder = createDcLine({ srcLineId: "soi-1", rate: 90, discPerc: 0, billQty: 3, godownId: "gd-o" });
    const line = applyDcItemPrice(fromOrder, lookup(), { autoPopQty: true, priceLevel: 1 });
    expect(line.rate).toBe(90);
    expect(line.discPerc).toBe(0);
    expect(line.billQty).toBe(3);
  });

  it("takes godown and batch from the lookup on every line, order lines too (Qt full fill)", () => {
    const fromOrder = createDcLine({
      srcLineId: "soi-1",
      godownId: "gd-o",
      godownName: "Order godown",
      batchNo: "B-ORDER",
      batchDate: "2026-09-01",
      expiryDate: "2027-09-01",
    });
    const named = applyDcItemPrice(
      fromOrder,
      { ...lookup(), batch_no: "B-LOOKUP", batch_date: "2026-10-01", expiry_date: "2027-10-01" },
      { autoPopQty: false, priceLevel: 1 },
    );
    expect(named).toMatchObject({
      godownId: "gd-1",
      godownName: "Main",
      batchNo: "B-LOOKUP",
      batchDate: "2026-10-01",
      expiryDate: "2027-10-01",
    });
    // The live lookup names no batch: Qt writes the empty answer over the cell.
    const unnamed = applyDcItemPrice(fromOrder, lookup(), { autoPopQty: false, priceLevel: 1 });
    expect(unnamed).toMatchObject({ godownId: "gd-1", batchNo: null, batchDate: null, expiryDate: null });
  });

  it("caps a quantity at the order line's open quantity, with Qt's warning", () => {
    const line = createDcLine({ itemId: "x", orderQty: 4 });
    const over = setLineQty(line, 5);
    expect(over.line.billQty).toBe(4);
    expect(over.warning).toBe("The order has only 4.000 open on this line.");
    expect(setLineQty(line, 4.0004).warning).toBeNull();
    expect(setLineQty(createDcLine({ itemId: "x" }), 99).warning).toBeNull();
  });

  it("refuses a rate under the minimum and empties the cell", () => {
    const line = createDcLine({ itemId: "x", minPrice: 80 });
    expect(setLineRate(line, 70)).toEqual({ line: { ...line, rate: 0 }, warning: "Rate < minimum selling price." });
    expect(setLineRate(line, 85).warning).toBeNull();
    expect(setLineRate({ ...line, isFree: true }, 0).warning).toBeNull();
  });

  it("keying Disc % clears the per-qty and the amount; Alt+D skips free and blank rows", () => {
    const line = createDcLine({ itemId: "x", discPerQty: 2, discAmt: 10 });
    expect(setLineDiscPerc(line, 7)).toMatchObject({ discPerc: 7, discPerQty: 0, discAmt: 0 });
    const lines = discountAll([line, createDcLine({ itemId: "y", isFree: true }), createDcLine()], 3);
    expect(lines.map((l) => l.discPerc)).toEqual([3, 0, 0]);
  });

  it("a billed or returned line stays on the challan", () => {
    expect(lineIsFulfilled({ billedQty: 1, returnedQty: 0 })).toBe(true);
    expect(lineIsFulfilled({ billedQty: 0, returnedQty: 0 })).toBe(false);
  });

  it("appends order lines, tops up a repeat to the cap, names the FIRST order on the header", () => {
    const doc = { docId: "so-1", accYear: "2026-2027", refno: "SO-7", date: "2026-10-01", purpose: null, ageDays: 0, pastWindow: false, lines: [] };
    const orderLine = {
      lineId: "soi-1", lineNo: 1, itemId: "item-1", itemName: "ZT-ITEM-A", unitId: "iuc-1", unitName: "PCS",
      lotId: null, batchNo: null, godownId: "gd-1", docQty: 5, openQty: 5, freeQty: 0, rate: 90, taxId: null, taxPerc: 18, hsnCode: "1234",
    };
    const picks: OpenSourcePick[] = [{ doc, line: orderLine, takeQty: 3 }];
    const first = appendSourceLines(draft(), picks);
    expect(first.newLineKeys).toHaveLength(1);
    expect(first.draft.source).toMatchObject({ docId: "so-1", refno: "SO-7", docType: "SALES_ORDER" });
    const added = first.draft.lines[0];
    expect(added).toMatchObject({ orderQty: 5, billQty: 3, rate: 90, srcLineId: "soi-1", srcDocType: "SALES_ORDER" });
    expect(first.draft.lines).toHaveLength(2);
    const again = appendSourceLines(first.draft, [{ doc, line: orderLine, takeQty: 4 }]);
    expect(again.newLineKeys).toHaveLength(0);
    expect(again.draft.lines[0].billQty).toBe(5);
  });

  it("copy as new strips identity, trail and fulfilment", () => {
    const loaded = {
      ...draft(),
      docId: "dc-1",
      status: "POSTED" as const,
      refno: "dc00009",
      revisionNo: 2,
      source: { docType: "SALES_ORDER", docId: "so-1", accYear: null, refno: "SO-7", date: null },
      lines: [createDcLine({ itemId: "x", sdiId: "sdi-1", srcDocId: "so-1", srcLineId: "soi-1", orderQty: 5, billedQty: 2 })],
    };
    const copy = copyDcAsNew(loaded, "2026-11-01");
    expect(copy).toMatchObject({ docId: null, status: "DRAFT", refno: "", revisionNo: 0, source: null, mode: "entry" });
    expect(copy.header.dcDate).toBe("2026-11-01");
    expect(copy.lines[0]).toMatchObject({ sdiId: null, srcDocId: null, srcLineId: null, orderQty: 0, billedQty: 0 });
  });

  it("the reducer never removes the trailing blank row and drops stored totals on a line edit", () => {
    let d: DcDraft = { ...draft(), storedTotals: { totItems: 1, totQty: 1, totWeight: 0, taxable: 1, tax: 0, total: 1 } };
    const blankKey = d.lines[0].key;
    expect(dcReducer(d, { type: "lineRemoved", rowKey: blankKey })).toBe(d);
    d = dcReducer(d, { type: "linePatch", rowKey: blankKey, patch: { itemId: "x" } });
    expect(d.lines).toHaveLength(2);
    expect(d.storedTotals).toBeNull();
    expect(d.isDirty).toBe(true);
  });

  it("an answer for a row that has gone changes nothing and leaves the draft clean", () => {
    const loaded: DcDraft = { ...draft(), storedTotals: { totItems: 1, totQty: 1, totWeight: 0, taxable: 1, tax: 0, total: 1 } };
    for (const action of [
      { type: "lineReplace", rowKey: "line-gone", line: createDcLine({ itemId: "x" }) },
      { type: "linePatch", rowKey: "line-gone", patch: { billQty: 2 } },
      { type: "lineDisplay", rowKey: "line-gone", patch: { itemName: "late" } },
    ] as const) {
      const after = dcReducer(loaded, action);
      expect(after).toBe(loaded);
      expect(after.isDirty).toBe(false);
      expect(after.storedTotals).not.toBeNull();
    }
  });

  it("asks before discarding only a NEW challan with item lines that was touched", () => {
    const withLine: DcDraft = { ...draft(), isDirty: true, lines: withTrailingBlank([createDcLine({ itemId: "x" })]) };
    expect(hasUnsavedWork(withLine)).toBe(true);
    expect(hasUnsavedWork({ ...withLine, isDirty: false })).toBe(false);
    expect(hasUnsavedWork({ ...withLine, docId: "dc-1" })).toBe(false);
    expect(hasUnsavedWork({ ...draft(), isDirty: true })).toBe(false);
  });
});

describe("a recalled hold", () => {
  const tenant = { companyId: "co-now", branchId: "br-now", accYear: "2026-2027" };

  /** The stored draft as a hold row carries it — through JSON, as the server keeps it. */
  function parked(): DcDraft {
    const held: DcDraft = {
      ...draft(),
      docId: "dc-old",
      status: "POSTED",
      refno: "dc00042",
      revisionNo: 3,
      mode: "browse",
      isDirty: false,
      lines: withTrailingBlank([createDcLine({ itemId: "a", billQty: 1 }), createDcLine({ itemId: "b", billQty: 2 })]),
    };
    return JSON.parse(JSON.stringify(held)) as DcDraft;
  }

  it("comes back a NEW, editable challan in this screen's tenant", () => {
    const restored = draftFromHeld(parked(), tenant);
    expect(restored).toMatchObject({
      docId: null,
      status: "DRAFT",
      refno: "",
      revisionNo: 0,
      mode: "entry",
      amending: false,
      posting: null,
      storedTotals: null,
      isDirty: true,
      ...tenant,
    });
    expect(restored.lines.map((line) => line.itemId)).toEqual(["a", "b", ""]);
  });

  it("gives every line a fresh key, so a row keyed after a reload cannot share one", () => {
    const stored = parked();
    const restored = draftFromHeld(stored, tenant);
    const keys = restored.lines.map((line) => line.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(stored.lines.map((line) => line.key)).not.toContain(key);
    }
    // A blank row inserted next is keyed apart from every restored line.
    const grown = dcReducer(restored, { type: "lineInserted", rowKey: keys[0] });
    expect(new Set(grown.lines.map((line) => line.key)).size).toBe(grown.lines.length);
  });

  it("an edit to one row changes that row alone, after the key counter restarted (a reload)", () => {
    // The parked keys are exactly the ones this page's counter hands out next —
    // what a reload produces. Kept as stored, the next blank row would share
    // the first line's key and an edit would land on both.
    const probe = Number(nextRowKey("line").split("-")[1]);
    const stored = parked();
    stored.lines = stored.lines.map((line, i) => ({ ...line, key: `line-${probe + 1 + i}` }));
    const restored = draftFromHeld(stored, tenant);
    const withNewRow = dcReducer(restored, { type: "lineInserted", rowKey: restored.lines[2].key });
    const keys = withNewRow.lines.map((line) => line.key);
    expect(new Set(keys).size).toBe(keys.length);
    const edited = dcReducer(withNewRow, { type: "linePatch", rowKey: withNewRow.lines[0].key, patch: { billQty: 9 } });
    expect(edited.lines.map((line) => line.billQty)).toEqual([9, 2, 0, 0]);
  });
});
