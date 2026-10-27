import { describe, expect, it } from "vitest";
import { blankLine } from "./opening-stock.lines";
import {
  applyLineEdit,
  auditLinesOf,
  createDraft,
  isOpeningWorthRemembering,
  openingStockReducer,
  scopeLabelOf,
  splitRefusal,
  type DraftScope,
} from "./opening-stock.state";
import type {
  OpeningStockDocumentPayload,
  OpeningStockDraft,
  OpeningStockItemLookup,
  OpeningStockLine,
} from "./opening-stock.types";

const SCOPE: DraftScope = {
  companyId: "company-1",
  branchId: "branch-1",
  accYear: "2026-2027",
  deviceId: "device-1",
};
const TODAY = "2026-10-02";

function lookup(overrides: Partial<OpeningStockItemLookup> = {}): OpeningStockItemLookup {
  return {
    itemId: "item-1",
    itemCode: "P001",
    itemName: "Paracetamol 500",
    barcode: "8901234567890",
    uomId: "iuc-box",
    unitName: "BOX",
    toBaseFactor: 12,
    baseUomId: "iuc-pcs",
    taxPerc: 12,
    trackSignature: "BME",
    mrp: 30,
    salePrice: 0,
    alreadyOpened: false,
    ...overrides,
  };
}

function withGodown(draft: OpeningStockDraft): OpeningStockDraft {
  return openingStockReducer(draft, { type: "godownSet", godownId: "gdl-1", godownName: "Main" });
}

/** A draft with one picked, looked-up line on row key "r1". */
function pickedDraft(): OpeningStockDraft {
  let draft = withGodown(createDraft(SCOPE, TODAY));
  draft = { ...draft, lines: [blankLine("r1")] };
  draft = openingStockReducer(draft, {
    type: "itemPicked",
    rowKey: "r1",
    itemId: "item-1",
    itemName: "Paracetamol",
  });
  return openingStockReducer(draft, { type: "itemLookupApplied", rowKey: "r1", lookup: lookup() });
}

function row(draft: OpeningStockDraft, key: string): OpeningStockLine {
  const found = draft.lines.find((line) => line.key === key);
  if (!found) {
    throw new Error(`no row ${key}`);
  }
  return found;
}

describe("a fresh document", () => {
  it("starts blank in the session's scope, dated today, MANUAL, one empty row", () => {
    const draft = createDraft(SCOPE, TODAY);
    expect(draft.status).toBe("DRAFT");
    expect(draft.mode).toBe("entry");
    expect(draft.header.docDate).toBe(TODAY);
    expect(draft.header.rateSource).toBe("MANUAL");
    expect(draft.lines).toHaveLength(1);
    expect(draft.dirty).toBe(false);
    expect(scopeLabelOf(draft)).toBe("");
  });
});

describe("picking an item", () => {
  it("seeds the row before the lookup answers: tracks nothing, split 1, SALEABLE, the header's godown", () => {
    let draft = withGodown(createDraft(SCOPE, TODAY));
    const key = draft.lines[0].key;
    draft = openingStockReducer(draft, { type: "itemPicked", rowKey: key, itemId: "item-1", itemName: "X" });
    const picked = row(draft, key);
    expect(picked.trackSignature).toBe("N");
    expect(picked.splitNo).toBe(1);
    expect(picked.bucket).toBe("SALEABLE");
    expect(picked.godownId).toBe("gdl-1");
    expect(picked.godownName).toBe("Main");
    // Picking into the last row grows the grid by one.
    expect(draft.lines).toHaveLength(2);
    expect(draft.dirty).toBe(true);
  });

  it("fills unit, factor, tax and signature from the lookup — and no cost", () => {
    const filled = row(pickedDraft(), "r1");
    expect(filled.uomId).toBe("iuc-box");
    expect(filled.baseUomId).toBe("iuc-pcs");
    expect(filled.toBaseFactor).toBe(12);
    expect(filled.taxPerc).toBe(12);
    expect(filled.trackSignature).toBe("BME");
    expect(filled.mrp).toBe(30);
    expect(filled.costPerUnit).toBe(0);
    expect(filled.itemCode).toBe("P001");
    expect(filled.barcode).toBe("8901234567890");
  });

  it("falls back to a factor of 1 and to N", () => {
    let draft = withGodown(createDraft(SCOPE, TODAY));
    const key = draft.lines[0].key;
    draft = openingStockReducer(draft, { type: "itemPicked", rowKey: key, itemId: "item-1", itemName: "X" });
    draft = openingStockReducer(draft, {
      type: "itemLookupApplied",
      rowKey: key,
      lookup: lookup({ toBaseFactor: 0, trackSignature: "" }),
    });
    expect(row(draft, key).toBaseFactor).toBe(1);
    expect(row(draft, key).trackSignature).toBe("N");
  });

  it("names the item from the picker row and shows its unit until the lookup answers", () => {
    let draft = withGodown(createDraft(SCOPE, TODAY));
    const key = draft.lines[0].key;
    draft = openingStockReducer(draft, {
      type: "itemPicked",
      rowKey: key,
      itemId: "item-1",
      itemName: "Samsung H1",
      unitName: "PCS",
    });
    expect(row(draft, key).itemName).toBe("Samsung H1");
    expect(row(draft, key).unitName).toBe("PCS");
  });

  it("a RE-pick drops everything the old item brought, and keeps the qty and the typed cost", () => {
    let draft = pickedDraft();
    draft = openingStockReducer(draft, { type: "lineFieldSet", rowKey: "r1", field: "qty", value: 5 });
    draft = openingStockReducer(draft, { type: "lineFieldSet", rowKey: "r1", field: "costPerUnit", value: 240 });
    draft = openingStockReducer(draft, { type: "lineFieldSet", rowKey: "r1", field: "batchNo", value: "B1" });
    draft = openingStockReducer(draft, { type: "lineFieldSet", rowKey: "r1", field: "costRateWot", value: 15 });
    draft = openingStockReducer(draft, { type: "supplierPicked", rowKey: "r1", supplierId: "s1", supplierName: "Sup" });
    draft = openingStockReducer(draft, {
      type: "itemPicked",
      rowKey: "r1",
      itemId: "item-2",
      itemName: "Other",
      unitName: "KG",
    });
    const repicked = row(draft, "r1");
    expect(repicked.itemId).toBe("item-2");
    expect(repicked.qty).toBe(5);
    expect(repicked.costPerUnit).toBe(240);
    for (const field of ["barcode", "itemCode", "uomId", "baseUomId", "batchNo", "supplierId", "supplierName"] as const) {
      expect(repicked[field]).toBe("");
    }
    expect(repicked.unitName).toBe("KG");
    expect(repicked.toBaseFactor).toBe(0);
    expect(repicked.taxPerc).toBe(0);
    expect(repicked.costRateWot).toBe(0);
    expect(repicked.mrp).toBe(0);
    expect(repicked.trackSignature).toBe("N");
    // The lookup then fills the new item's barcode into the cleared cell.
    draft = openingStockReducer(draft, {
      type: "itemLookupApplied",
      rowKey: "r1",
      lookup: lookup({ itemId: "item-2", barcode: "222", toBaseFactor: 1 }),
    });
    expect(row(draft, "r1").barcode).toBe("222");
    expect(row(draft, "r1").costRate).toBe(240);
  });

  it("a RE-pick drops the old batch's size, colour and model, and whether its batch was typed (Qt 74b755c)", () => {
    let draft = pickedDraft();
    draft = openingStockReducer(draft, {
      type: "batchDetailChoiceSet",
      rowKey: "r1",
      field: "sizeName",
      id: "isz-xl",
      name: "XL",
    });
    draft = openingStockReducer(draft, {
      type: "batchDetailChoiceSet",
      rowKey: "r1",
      field: "colourName",
      id: "icl-red",
      name: "Red",
    });
    draft = openingStockReducer(draft, { type: "lineFieldSet", rowKey: "r1", field: "model", value: "Slim" });
    // Typed with the setting off, so nothing is cleared — but the flag is set.
    draft = openingStockReducer(draft, { type: "batchNoSet", rowKey: "r1", value: "B1", autoBatchNo: false });
    expect(row(draft, "r1").batchTyped).toBe(true);
    expect(row(draft, "r1").sizeId).toBe("isz-xl");
    draft = openingStockReducer(draft, { type: "itemPicked", rowKey: "r1", itemId: "item-2", itemName: "Other" });
    const repicked = row(draft, "r1");
    for (const field of ["sizeId", "sizeName", "colourId", "colourName", "model"] as const) {
      expect(repicked[field]).toBe("");
    }
    expect(repicked.batchTyped).toBe(false);
  });

  it("keeps the scanned symbol over the item's own barcode", () => {
    let draft = withGodown(createDraft(SCOPE, TODAY));
    const key = draft.lines[0].key;
    draft = openingStockReducer(draft, { type: "barcodeResolved", rowKey: key, barcode: "SCAN-1", itemId: "item-1" });
    draft = openingStockReducer(draft, { type: "itemLookupApplied", rowKey: key, lookup: lookup() });
    expect(row(draft, key).barcode).toBe("SCAN-1");
  });

  it("empties the row when the lookup refuses the item", () => {
    const draft = openingStockReducer(pickedDraft(), { type: "lineCleared", rowKey: "r1" });
    expect(row(draft, "r1").itemId).toBe("");
    expect(row(draft, "r1").uomId).toBe("");
  });
});

describe("F4 — the unit switch (itemLookupApplied, keepLineValues)", () => {
  it("1 BOX of 12 at 240 becomes 1 PCS at 20: qty kept, cost per BASE unit kept", () => {
    let draft = pickedDraft();
    draft = openingStockReducer(draft, { type: "lineFieldSet", rowKey: "r1", field: "qty", value: 1 });
    draft = openingStockReducer(draft, { type: "lineFieldSet", rowKey: "r1", field: "costPerUnit", value: 240 });
    expect(row(draft, "r1").costRate).toBe(20);
    draft = openingStockReducer(draft, {
      type: "itemLookupApplied",
      rowKey: "r1",
      keepLineValues: true,
      lookup: lookup({ uomId: "iuc-pcs", unitName: "PCS", toBaseFactor: 1, barcode: "PCS-EAN", mrp: 3 }),
    });
    const switched = row(draft, "r1");
    expect(switched.uomId).toBe("iuc-pcs");
    expect(switched.unitName).toBe("PCS");
    expect(switched.qty).toBe(1);
    expect(switched.costPerUnit).toBe(20);
    expect(switched.costRate).toBe(20);
    expect(switched.baseQty).toBe(1);
    expect(switched.value).toBe(20);
    // The line's MRP is the lot's, not the unit's.
    expect(switched.mrp).toBe(30);
    // An EAN belongs to one unit: the old unit's code gives way to the new one's.
    expect(switched.barcode).toBe("PCS-EAN");
  });

  it("takes the lookup's MRP and sale price where the line has none", () => {
    let draft = pickedDraft();
    draft = openingStockReducer(draft, { type: "lineFieldSet", rowKey: "r1", field: "mrp", value: 0 });
    draft = openingStockReducer(draft, {
      type: "itemLookupApplied",
      rowKey: "r1",
      keepLineValues: true,
      lookup: lookup({ uomId: "iuc-pcs", toBaseFactor: 1, mrp: 3, salePrice: 2.5 }),
    });
    expect(row(draft, "r1").mrp).toBe(3);
    expect(row(draft, "r1").salePrice).toBe(2.5);
    // No cost typed: none is invented.
    expect(row(draft, "r1").costPerUnit).toBe(0);
  });
});

describe("the barcode cell", () => {
  it("holds a typed code without making the document dirty", () => {
    let draft = withGodown(createDraft(SCOPE, TODAY));
    draft = { ...draft, dirty: false };
    const key = draft.lines[0].key;
    draft = openingStockReducer(draft, { type: "barcodeTyped", rowKey: key, barcode: "750252" });
    expect(row(draft, key).barcode).toBe("750252");
    expect(draft.dirty).toBe(false);
    // The resolve does — an item landed.
    draft = openingStockReducer(draft, { type: "barcodeResolved", rowKey: key, barcode: "750252", itemId: "item-1" });
    expect(draft.dirty).toBe(true);
  });

  it("never writes a typed code over a row that already has its item", () => {
    const draft = openingStockReducer(pickedDraft(), { type: "barcodeTyped", rowKey: "r1", barcode: "sams" });
    expect(row(draft, "r1").barcode).toBe("8901234567890");
  });

  it("an item picked from the ↓ search clears the typed text so its own barcode fills the cell", () => {
    let draft = withGodown(createDraft(SCOPE, TODAY));
    const key = draft.lines[0].key;
    draft = openingStockReducer(draft, { type: "barcodeTyped", rowKey: key, barcode: "sams" });
    draft = openingStockReducer(draft, { type: "itemPicked", rowKey: key, itemId: "item-1", itemName: "X" });
    expect(row(draft, key).barcode).toBe("");
    draft = openingStockReducer(draft, { type: "itemLookupApplied", rowKey: key, lookup: lookup() });
    expect(row(draft, key).barcode).toBe("8901234567890");
  });
});

describe("the audit lines and the notice", () => {
  it("says a fresh document is new", () => {
    expect(auditLinesOf(createDraft(SCOPE, TODAY))).toEqual(["New — not saved yet"]);
  });

  it("keeps a notice until a load or a fresh document clears it", () => {
    let draft = openingStockReducer(createDraft(SCOPE, TODAY), { type: "noticeSet", text: "This is the newest opening." });
    expect(draft.notice).toBe("This is the newest opening.");
    draft = openingStockReducer(draft, { type: "reset", scope: SCOPE, today: TODAY });
    expect(draft.notice).toBe("");
  });
});

describe("editing a cell — onGridCellEdited", () => {
  it("re-derives the base rate and the value from the per-unit cost", () => {
    let draft = pickedDraft();
    draft = openingStockReducer(draft, { type: "lineFieldSet", rowKey: "r1", field: "qty", value: 10 });
    draft = openingStockReducer(draft, { type: "lineFieldSet", rowKey: "r1", field: "costPerUnit", value: 240 });
    const edited = row(draft, "r1");
    expect(edited.baseQty).toBe(120);
    expect(edited.costRate).toBe(20);
    expect(edited.value).toBe(2400);
    expect(edited.costRateWot).toBeCloseTo(20 / 1.12, 6);
  });

  it("keeps a typed without-tax rate until the cost or tax changes — a quantity does not change the rate", () => {
    let line = row(pickedDraft(), "r1");
    line = applyLineEdit(line, "costPerUnit", 240);
    line = applyLineEdit(line, "qty", 1);
    line = applyLineEdit(line, "costRateWot", 15);
    expect(line.costRateWot).toBe(15);
    expect(line.valueWot).toBe(12 * 15);
    // Qty and Free keep it (Qt 6d56fa6: a typed per-unit cess survives a
    // quantity change); only the values re-derive.
    const requantified = applyLineEdit(line, "qty", 2);
    expect(requantified.costRateWot).toBe(15);
    expect(requantified.valueWot).toBe(24 * 15);
    expect(applyLineEdit(line, "freeQty", 1).costRateWot).toBe(15);
    // A tax change clears it and re-derives.
    const retaxed = applyLineEdit(line, "taxPerc", 5);
    expect(retaxed.costRateWot).toBeCloseTo(20 / 1.05, 6);
    // So does a cost change.
    const recosted = applyLineEdit(line, "costPerUnit", 120);
    expect(recosted.costRateWot).toBeCloseTo(10 / 1.12, 6);
  });

  it("stores text cells without recalculating", () => {
    const line = applyLineEdit(row(pickedDraft(), "r1"), "batchNo", "B-77");
    expect(line.batchNo).toBe("B-77");
  });
});

describe("textile — the batch number and the size / colour / model (Qt 74b755c)", () => {
  function withDetail(): OpeningStockDraft {
    let draft = pickedDraft();
    draft = openingStockReducer(draft, {
      type: "batchDetailChoiceSet",
      rowKey: "r1",
      field: "sizeName",
      id: "isz-xl",
      name: "XL",
    });
    return openingStockReducer(draft, { type: "lineFieldSet", rowKey: "r1", field: "model", value: "Slim" });
  }

  it("puts a Size / Colour name in the cell and its id beside it; a new name has no id yet", () => {
    let draft = withDetail();
    expect(row(draft, "r1").sizeName).toBe("XL");
    expect(row(draft, "r1").sizeId).toBe("isz-xl");
    draft = openingStockReducer(draft, {
      type: "batchDetailChoiceSet",
      rowKey: "r1",
      field: "colourName",
      id: "",
      name: "Peacock",
    });
    expect(row(draft, "r1").colourName).toBe("Peacock");
    expect(row(draft, "r1").colourId).toBe("");
    expect(draft.dirty).toBe(true);
  });

  it("a TYPED batch number clears and locks them while the company numbers its batches", () => {
    const draft = openingStockReducer(withDetail(), {
      type: "batchNoSet",
      rowKey: "r1",
      value: "ZT-TYPED-1",
      autoBatchNo: true,
    });
    const line = row(draft, "r1");
    expect(line.batchNo).toBe("ZT-TYPED-1");
    expect(line.batchTyped).toBe(true);
    expect([line.sizeId, line.sizeName, line.colourId, line.colourName, line.model]).toEqual(["", "", "", "", ""]);
  });

  it("emptying the batch hands the number back to the server, and the cells open again", () => {
    let draft = openingStockReducer(withDetail(), {
      type: "batchNoSet",
      rowKey: "r1",
      value: "ZT-TYPED-1",
      autoBatchNo: true,
    });
    draft = openingStockReducer(draft, { type: "batchNoSet", rowKey: "r1", value: "  ", autoBatchNo: true });
    expect(row(draft, "r1").batchTyped).toBe(false);
  });

  it("loads a batch as GIVEN, with what its batch detail row carries", () => {
    const draft = openingStockReducer(createDraft(SCOPE, TODAY), {
      type: "documentLoaded",
      document: {
        header: {
          svhId: "svh-1",
          accYear: "2026-2027",
          companyId: "company-1",
          branchId: "branch-1",
          deviceId: "device-1",
          refno: "OPN0001",
          usrRefno: null,
          docDate: "2026-10-26",
          godownId: "gdl-1",
          godownName: "Main",
          status: "DRAFT",
          lineCount: 1,
          totalQty: 1,
          totalValue: 10,
          totalValueWot: 10,
          rateSource: "MANUAL",
          remarks: null,
        },
        lines: [
          {
            sviId: "svi-1",
            lineNo: 1,
            splitNo: 1,
            itemId: "item-1",
            itemCode: null,
            itemName: "Shirt",
            unitName: "PCS",
            uomId: "iuc-1",
            baseUomId: "iuc-1",
            toBaseFactor: 1,
            godownId: "gdl-1",
            godownName: "Main",
            bucket: "SALEABLE",
            barcode: null,
            batchNo: "CBE26-00001",
            mfgDate: null,
            expiryDate: null,
            mrp: null,
            salePrice: null,
            serialNo: null,
            supplierId: null,
            supplierName: null,
            qty: 1,
            baseQty: 1,
            freeQty: 0,
            freeBaseQty: 0,
            weightQty: 0,
            costRate: 10,
            costRateWot: 10,
            landedRate: 0,
            taxPerc: 0,
            value: 10,
            valueWot: 10,
            lotId: null,
            remarks: null,
            trackSignature: "B",
            sizeId: "isz-xl",
            sizeName: "XL",
            colourId: null,
            colourName: null,
            model: "Slim fit",
          },
        ],
      },
      scope: { companyId: "company-1", branchId: "branch-1", accYear: "2026-2027" },
      openForEdit: true,
    });
    const line = draft.lines[0];
    expect(line.sizeName).toBe("XL");
    expect(line.sizeId).toBe("isz-xl");
    expect(line.colourName).toBe("");
    expect(line.model).toBe("Slim fit");
    expect(line.batchTyped).toBe(false);
  });
});

describe("the header godown", () => {
  it("fills only lines that have none — a line sent elsewhere stays there", () => {
    let draft = createDraft(SCOPE, TODAY);
    draft = {
      ...draft,
      lines: [
        { ...blankLine("a"), itemId: "i1" },
        { ...blankLine("b"), itemId: "i2", godownId: "gdl-other", godownName: "Other" },
        blankLine("c"),
      ],
    };
    draft = openingStockReducer(draft, { type: "godownSet", godownId: "gdl-1", godownName: "Main" });
    expect(row(draft, "a").godownId).toBe("gdl-1");
    expect(row(draft, "b").godownId).toBe("gdl-other");
    expect(row(draft, "c").godownId).toBe("");
    expect(scopeLabelOf(draft)).toBe("Main");
  });
});

describe("rows", () => {
  it("inserts a blank row ABOVE the current one", () => {
    const draft = openingStockReducer(pickedDraft(), { type: "lineInserted", beforeRowKey: "r1", newKey: "new" });
    expect(draft.lines[0].key).toBe("new");
    expect(draft.lines[1].key).toBe("r1");
  });

  it("never removes the trailing blank row", () => {
    const draft = pickedDraft();
    const trailing = draft.lines[draft.lines.length - 1].key;
    expect(openingStockReducer(draft, { type: "lineRemoved", rowKey: trailing })).toBe(draft);
    const removed = openingStockReducer(draft, { type: "lineRemoved", rowKey: "r1" });
    expect(removed.lines).toHaveLength(1);
    expect(removed.lines[0].itemId).toBe("");
  });

  it("splits a tracked line into the next allocation of the same line", () => {
    let draft = pickedDraft();
    draft = openingStockReducer(draft, { type: "lineFieldSet", rowKey: "r1", field: "qty", value: 4 });
    draft = openingStockReducer(draft, { type: "lineFieldSet", rowKey: "r1", field: "batchNo", value: "B1" });
    draft = openingStockReducer(draft, { type: "lineSplit", rowKey: "r1", newKey: "r2" });
    const copy = row(draft, "r2");
    expect(draft.lines[1].key).toBe("r2");
    expect(copy.splitNo).toBe(2);
    expect(copy.itemId).toBe("item-1");
    expect(copy.uomId).toBe("iuc-box");
    expect(copy.trackSignature).toBe("BME");
    expect(copy.qty).toBe(0);
    expect(copy.batchNo).toBe("");
  });

  it("refuses to split a blank row, or an item tracked by nothing", () => {
    expect(splitRefusal(blankLine())?.title).toBe("Split batch");
    expect(splitRefusal({ ...blankLine(), itemId: "i", trackSignature: "N" })?.title).toBe(
      "Nothing to split by",
    );
    expect(splitRefusal({ ...blankLine(), itemId: "i", trackSignature: "B" })).toBeNull();
  });
});

describe("after a write — startNextDocument", () => {
  it("carries the godown, the date and the rate source; clears the rest; comes up clean", () => {
    let draft = pickedDraft();
    draft = openingStockReducer(draft, { type: "headerSet", field: "docDate", value: "2026-04-01" });
    draft = openingStockReducer(draft, { type: "rateSourceSet", value: "AVG_COST" });
    draft = openingStockReducer(draft, { type: "headerSet", field: "remarks", value: "go-live" });
    draft = { ...draft, svhId: "svh-1", refno: "OPN0001" };
    const next = openingStockReducer(draft, { type: "startNext", scope: SCOPE, today: TODAY });
    expect(next.header.godownId).toBe("gdl-1");
    expect(next.header.docDate).toBe("2026-04-01");
    expect(next.header.rateSource).toBe("AVG_COST");
    expect(next.header.remarks).toBe("");
    expect(next.svhId).toBe("");
    expect(next.refno).toBe("");
    expect(next.lines).toHaveLength(1);
    expect(next.dirty).toBe(false);
  });

  it("New starts genuinely blank", () => {
    const next = openingStockReducer(pickedDraft(), { type: "reset", scope: SCOPE, today: TODAY });
    expect(next.header.godownId).toBe("");
  });
});

describe("screen memory", () => {
  it("keeps only unsaved work on a draft still open for keying", () => {
    expect(isOpeningWorthRemembering(createDraft(SCOPE, TODAY))).toBe(false);
    expect(isOpeningWorthRemembering(pickedDraft())).toBe(true);
  });

  it("drops a browsed, posted or cancelled document even when it reads dirty", () => {
    expect(isOpeningWorthRemembering({ ...pickedDraft(), mode: "browse" })).toBe(false);
    for (const status of ["POSTED", "CANCELLED"]) {
      const filed = openingStockReducer(pickedDraft(), { type: "statusApplied", status });
      expect(isOpeningWorthRemembering(filed)).toBe(false);
    }
  });

  it("drops the document once the next one starts clean", () => {
    const next = openingStockReducer(pickedDraft(), { type: "startNext", scope: SCOPE, today: TODAY });
    expect(isOpeningWorthRemembering(next)).toBe(false);
  });
});

describe("loading a document", () => {
  const document: OpeningStockDocumentPayload = {
    header: {
      svhId: "svh-9",
      accYear: "2025-2026",
      companyId: "company-1",
      branchId: "branch-1",
      deviceId: "device-of-the-document",
      refno: "OPN0009",
      usrRefno: null,
      docDate: "2025-04-01",
      godownId: "gdl-1",
      godownName: "Main",
      status: "DRAFT",
      lineCount: 1,
      totalQty: 12,
      totalValue: 240,
      totalValueWot: 240,
      rateSource: "MANUAL",
      remarks: null,
    },
    lines: [],
  };

  it("takes the document's own year and device, and opens a DRAFT for edit only when asked", () => {
    const scope = { companyId: "company-1", branchId: "branch-1", accYear: "2025-2026" };
    const forEdit = openingStockReducer(createDraft(SCOPE, TODAY), {
      type: "documentLoaded",
      document,
      scope,
      openForEdit: true,
    });
    expect(forEdit.accYear).toBe("2025-2026");
    expect(forEdit.deviceId).toBe("device-of-the-document");
    expect(forEdit.mode).toBe("entry");
    expect(forEdit.lines).toHaveLength(1);

    const read = openingStockReducer(createDraft(SCOPE, TODAY), {
      type: "documentLoaded",
      document,
      scope,
      openForEdit: false,
    });
    expect(read.mode).toBe("browse");
  });

  it("shows who created and posted it, in the 12-hour house format, and clears the notice", () => {
    let draft = openingStockReducer(createDraft(SCOPE, TODAY), { type: "noticeSet", text: "old notice" });
    draft = openingStockReducer(draft, {
      type: "documentLoaded",
      document: {
        ...document,
        header: {
          ...document.header,
          status: "POSTED",
          createdOn: "2026-10-23T10:15:00",
          createdByName: "VKPOS",
          postedOn: "2026-10-23T22:18:00",
          postedByName: "VKPOS",
        },
      },
      scope: { companyId: "company-1", branchId: "branch-1", accYear: "2025-2026" },
      openForEdit: false,
    });
    expect(draft.notice).toBe("");
    expect(auditLinesOf(draft)).toEqual([
      "Created 23-10-2026 10:15 AM by VKPOS",
      "Posted 23-10-2026 10:18 PM by VKPOS",
    ]);
  });

  it("opens a POSTED document read-only whatever was asked", () => {
    const posted = openingStockReducer(createDraft(SCOPE, TODAY), {
      type: "documentLoaded",
      document: { ...document, header: { ...document.header, status: "POSTED" } },
      scope: { companyId: "c", branchId: "b", accYear: "2025-2026" },
      openForEdit: true,
    });
    expect(posted.status).toBe("POSTED");
    expect(posted.mode).toBe("browse");
  });
});

describe("the pre-post check's answer", () => {
  it("locates problems by the RENUMBERED split the screen sent", () => {
    let draft = pickedDraft();
    draft = openingStockReducer(draft, { type: "lineSplit", rowKey: "r1", newKey: "r2" });
    // Typed as split 5, sent as split 2.
    draft = openingStockReducer(draft, { type: "lineFieldSet", rowKey: "r2", field: "splitNo", value: 5 });
    draft = openingStockReducer(draft, {
      type: "problemsApplied",
      problems: [{ lineNo: 1, splitNo: 2, message: "Line 1 split 2 (X): batch is blank" }],
    });
    expect(row(draft, "r2").problem).toContain("batch is blank");
  });

  it("lands each problem on the row it names, by line and split", () => {
    let draft = pickedDraft();
    draft = openingStockReducer(draft, { type: "lineSplit", rowKey: "r1", newKey: "r2" });
    draft = openingStockReducer(draft, {
      type: "problemsApplied",
      problems: [{ lineNo: 1, splitNo: 2, message: "Line 1 split 2 (X): batch is blank" }],
    });
    expect(row(draft, "r1").problem).toBe("");
    expect(row(draft, "r2").problem).toContain("batch is blank");
    // Editing the line clears what the server said about it.
    draft = openingStockReducer(draft, { type: "lineFieldSet", rowKey: "r2", field: "batchNo", value: "B2" });
    expect(row(draft, "r2").problem).toBe("");
  });
});
