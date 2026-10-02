import { describe, expect, it } from "vitest";
import { blankLine } from "./opening-stock.lines";
import {
  applyLineEdit,
  createDraft,
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
    expect(scopeLabelOf(draft)).toBe("2026-2027");
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

  it("keeps a typed without-tax rate until the qty, cost or tax changes", () => {
    let line = row(pickedDraft(), "r1");
    line = applyLineEdit(line, "costPerUnit", 240);
    line = applyLineEdit(line, "qty", 1);
    line = applyLineEdit(line, "costRateWot", 15);
    expect(line.costRateWot).toBe(15);
    expect(line.valueWot).toBe(12 * 15);
    // A tax change clears it and re-derives.
    const retaxed = applyLineEdit(line, "taxPerc", 5);
    expect(retaxed.costRateWot).toBeCloseTo(20 / 1.05, 6);
    // So does a quantity change — the Qt switch falls through for Qty too.
    const requantified = applyLineEdit(line, "qty", 2);
    expect(requantified.costRateWot).toBeCloseTo(20 / 1.12, 6);
  });

  it("stores text cells without recalculating", () => {
    const line = applyLineEdit(row(pickedDraft(), "r1"), "batchNo", "B-77");
    expect(line.batchNo).toBe("B-77");
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
    expect(scopeLabelOf(draft)).toBe("Main · 2026-2027");
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
