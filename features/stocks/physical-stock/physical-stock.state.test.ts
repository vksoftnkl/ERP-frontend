import { describe, expect, it } from "vitest";
import {
  applyWireLines,
  blankLine,
  computeTotals,
  createDraft,
  ensureTrailingBlank,
  insertHoldings,
  isEditable,
  lineFromSheet,
  physicalStockReducer,
  recalcLine,
  refillAverageCosts,
  type DraftSeed,
} from "./physical-stock.state";
import type {
  CountLine,
  CountSheetRow,
  PhysicalStockDocument,
  PhysicalStockDraft,
  PhysicalStockWireLine,
} from "./physical-stock.types";

const SEED: DraftSeed = {
  scope: { companyId: "c1", branchId: "b1", accYear: "2026-2027", deviceId: "d1" },
  today: "2026-10-02",
  now: "2026-10-02T10:15",
};

function sheetRow(overrides: Partial<CountSheetRow> = {}): CountSheetRow {
  return {
    lineNo: 1,
    splitNo: 1,
    itemId: "item-a",
    itemCode: "A1",
    itemName: "MILK 500ML",
    lotId: "lot-1",
    godownId: "g1",
    godownName: "Coimbatore",
    bucket: "SALEABLE",
    baseUomId: "u1",
    unitName: "NOS",
    batchNo: "B1",
    mfgDate: null,
    expiryDate: "2026-12-31T00:00:00.000Z",
    mrp: 25,
    salePrice: 24,
    serialNo: null,
    supplierId: null,
    bookQty: 100,
    avgCostRate: 20,
    stockValue: 2000,
    countedQty: null,
    ...overrides,
  };
}

function holding(book: number, avg: number, key = "h", lot = `lot-${key}`): CountLine {
  return { ...lineFromSheet(sheetRow({ lotId: lot, bookQty: book, avgCostRate: avg }), key) };
}

function wireLine(overrides: Partial<PhysicalStockWireLine> = {}): PhysicalStockWireLine {
  return {
    sviId: "svi-1",
    lineNo: 1,
    splitNo: 1,
    itemId: "item-a",
    itemCode: "A1",
    itemName: "MILK 500ML",
    unitName: "NOS",
    baseUomId: "u1",
    godownId: "g1",
    godownName: "Coimbatore",
    bucket: "SALEABLE",
    batchNo: "B1",
    mfgDate: null,
    expiryDate: "2026-12-31",
    mrp: 25,
    salePrice: 24,
    serialNo: null,
    supplierId: "s1",
    supplierName: "ACME",
    bookQty: 100,
    countedQty: 97,
    diffQty: -3,
    reasonId: null,
    reasonName: null,
    lotId: "lot-1",
    remarks: null,
    ...overrides,
  };
}

function documentOf(lines: PhysicalStockWireLine[], status = "DRAFT"): PhysicalStockDocument {
  return {
    header: {
      svhId: "svh-1",
      accYear: "2026-2027",
      companyId: "c1",
      branchId: "b1",
      deviceId: "dev-doc",
      refno: "PHY0007",
      usrRefno: "ref",
      docDate: "2026-09-30",
      godownId: "g1",
      godownName: "Coimbatore",
      reasonId: "r1",
      reasonName: "Shrinkage",
      freezeStock: false,
      freezeFrom: null,
      freezeTo: null,
      status,
      lineCount: 1,
      totalQty: -3,
      totalValue: -60,
      rateSource: "LAST_PURCHASE",
      remarks: "aisle 4",
    },
    lines,
  };
}

describe("recalcLine — counted − book, and roughly what it is worth", () => {
  it("values a shortage at the holding's average cost", () => {
    const line = recalcLine({ ...holding(100, 20), countedText: "97" });
    expect(line.diffQty).toBe(-3);
    expect(line.diffValue).toBe(-60);
  });

  it("values an overage the same way", () => {
    const line = recalcLine({ ...holding(50, 8), countedText: "55" });
    expect(line.diffQty).toBe(5);
    expect(line.diffValue).toBe(40);
  });

  it("an exact count differs by zero", () => {
    expect(recalcLine({ ...holding(30, 5), countedText: "30" }).diffQty).toBe(0);
  });

  it("a blank count clears the difference — not walked is not zero", () => {
    const line = recalcLine({ ...holding(30, 5), countedText: "" });
    expect(line.diffQty).toBeNull();
    expect(line.diffValue).toBeNull();
  });

  it("counting 0 is a finding: the whole book is short", () => {
    expect(recalcLine({ ...holding(30, 5), countedText: "0" }).diffQty).toBe(-30);
  });

  it("keeps binary noise out of the difference", () => {
    expect(recalcLine({ ...holding(0.1, 1), countedText: "0.3" }).diffQty).toBe(0.2);
  });
});

describe("computeTotals", () => {
  it("counts holdings, walked lines and variance lines, and nets the variance", () => {
    const lines = [
      recalcLine({ ...holding(100, 20, "a"), countedText: "97" }),
      recalcLine({ ...holding(50, 8, "b"), countedText: "55" }),
      recalcLine({ ...holding(30, 5, "c"), countedText: "30" }),
      holding(10, 1, "d"),
      blankLine("blank"),
    ];
    expect(computeTotals(lines)).toEqual({
      lines: 4,
      counted: 3,
      varianceLines: 2,
      netQty: 2,
      netValue: -20,
    });
  });
});

describe("ensureTrailingBlank", () => {
  it("adds a blank row only when the last row is a holding", () => {
    const withHolding = ensureTrailingBlank([holding(1, 1, "a")], 5);
    expect(withHolding.lines).toHaveLength(2);
    expect(withHolding.lines[1].lotId).toBe("");
    expect(withHolding.seq).toBe(6);
    const already = ensureTrailingBlank(withHolding.lines, withHolding.seq);
    expect(already.lines).toHaveLength(2);
  });
});

describe("insertHoldings — a pick adds every holding of the item", () => {
  it("replaces the blank row with the holdings, keeps one blank row, and carries the scan", () => {
    const lines = [holding(1, 1, "a", "lot-a"), { ...blankLine("blank"), barcode: "890123" }];
    const result = insertHoldings(
      lines,
      "blank",
      [sheetRow({ lotId: "lot-1" }), sheetRow({ lotId: "lot-2", lineNo: 2 })],
      10,
    );
    expect(result.added).toBe(2);
    expect(result.already).toBe(0);
    expect(result.index).toBe(1);
    expect(result.lines.map((line) => line.lotId)).toEqual(["lot-a", "lot-1", "lot-2", ""]);
    expect(result.lines[1].barcode).toBe("890123");
    expect(result.lines[2].barcode).toBe("");
  });

  it("skips a holding already on the sheet — same lot AND bucket", () => {
    const lines = [holding(1, 1, "a", "lot-1"), blankLine("blank")];
    const result = insertHoldings(
      lines,
      "blank",
      [sheetRow({ lotId: "lot-1" }), sheetRow({ lotId: "lot-1", bucket: "DAMAGED" })],
      3,
    );
    expect(result.already).toBe(1);
    expect(result.added).toBe(1);
    expect(result.lines[1].bucket).toBe("DAMAGED");
  });

  it("leaves the sheet alone when everything is already on it", () => {
    const lines = [holding(1, 1, "a", "lot-1"), blankLine("blank")];
    const result = insertHoldings(lines, "blank", [sheetRow({ lotId: "lot-1" })], 3);
    expect(result.added).toBe(0);
    expect(result.lines).toHaveLength(2);
  });
});

describe("applyWireLines — a saved document onto the grid", () => {
  it("keeps the average the sheet brought and values the variance with it", () => {
    const previous = [holding(100, 20, "a", "lot-1")];
    const { lines } = applyWireLines([wireLine()], previous, 1);
    expect(lines).toHaveLength(2);
    expect(lines[0].countedText).toBe("97");
    expect(lines[0].diffQty).toBe(-3);
    expect(lines[0].avgCostRate).toBe(20);
    expect(lines[0].diffValue).toBe(-60);
    expect(lines[0].supplierName).toBe("ACME");
    expect(lines[1].lotId).toBe("");
  });

  it("leaves the value blank when no average is known yet", () => {
    const { lines } = applyWireLines([wireLine()], [], 1);
    expect(lines[0].avgCostRate).toBeNull();
    expect(lines[0].diffValue).toBeNull();
  });

  it("reads a counted 0 back as the text 0, never blank", () => {
    const { lines } = applyWireLines([wireLine({ countedQty: "0.000000", diffQty: -100 })], [], 1);
    expect(lines[0].countedText).toBe("0");
  });
});

describe("refillAverageCosts", () => {
  it("fills only the averages a line lacks and re-values it", () => {
    const { lines } = applyWireLines([wireLine()], [], 1);
    const refilled = refillAverageCosts(lines, [sheetRow({ lotId: "lot-1", avgCostRate: 20 })]);
    expect(refilled[0].avgCostRate).toBe(20);
    expect(refilled[0].diffValue).toBe(-60);
    const untouched = refillAverageCosts(refilled, [sheetRow({ lotId: "lot-1", avgCostRate: 99 })]);
    expect(untouched[0].avgCostRate).toBe(20);
  });
});

describe("physicalStockReducer", () => {
  const fresh = (): PhysicalStockDraft => createDraft(SEED);

  it("starts a blank DRAFT with one blank row, AVG_COST, and a three-hour freeze window", () => {
    const draft = fresh();
    expect(draft.status).toBe("DRAFT");
    expect(draft.lines).toHaveLength(1);
    expect(draft.rateSource).toBe("AVG_COST");
    expect(draft.freezeFrom).toBe("2026-10-02T10:15");
    expect(draft.freezeTo).toBe("2026-10-02T13:15");
    expect(draft.scope).toBe("2026-2027");
    expect(isEditable(draft)).toBe(true);
  });

  it("draws a sheet: every holding plus the blank row, marked dirty", () => {
    const draft = physicalStockReducer(fresh(), {
      type: "sheetApplied",
      rows: [sheetRow(), sheetRow({ lotId: "lot-2", lineNo: 2 })],
      godownName: "Coimbatore",
    });
    expect(draft.lines).toHaveLength(3);
    expect(draft.dirty).toBe(true);
    expect(draft.audit).toBe("2 holdings to count in Coimbatore.");
  });

  it("changing the godown clears the sheet and says so", () => {
    let draft = physicalStockReducer(fresh(), { type: "godownSelected", id: "g1", name: "Coimbatore" });
    draft = physicalStockReducer(draft, { type: "sheetApplied", rows: [sheetRow()], godownName: "Coimbatore" });
    draft = physicalStockReducer(draft, { type: "godownSelected", id: "g2", name: "Erode" });
    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0].lotId).toBe("");
    expect(draft.audit).toBe("Godown changed to Erode — load the count sheet again.");
  });

  it("re-choosing the same godown keeps the sheet", () => {
    let draft = physicalStockReducer(fresh(), { type: "godownSelected", id: "g1", name: "Coimbatore" });
    draft = physicalStockReducer(draft, { type: "sheetApplied", rows: [sheetRow()], godownName: "Coimbatore" });
    draft = physicalStockReducer(draft, { type: "godownSelected", id: "g1", name: "Coimbatore" });
    expect(draft.lines).toHaveLength(2);
  });

  it("counting the last holding grows a spare row", () => {
    let draft = physicalStockReducer(fresh(), { type: "sheetApplied", rows: [sheetRow()], godownName: "G" });
    // Simulate a sheet whose blank row was consumed.
    draft = { ...draft, lines: draft.lines.slice(0, 1) };
    draft = physicalStockReducer(draft, { type: "countedSet", rowKey: draft.lines[0].key, text: "98" });
    expect(draft.lines).toHaveLength(2);
    expect(draft.lines[0].diffQty).toBe(-2);
    expect(draft.lines[0].diffValue).toBe(-40);
  });

  it("refuses a count or a reason on the blank row", () => {
    const draft = fresh();
    const key = draft.lines[0].key;
    const counted = physicalStockReducer(draft, { type: "countedSet", rowKey: key, text: "5" });
    expect(counted.lines[0].countedText).toBe("");
    const reasoned = physicalStockReducer(draft, { type: "reasonPicked", rowKey: key, id: "r", name: "R" });
    expect(reasoned.lines[0].reasonName).toBe("");
  });

  it("a blind count hides the book and says so; New keeps it on", () => {
    let draft = physicalStockReducer(fresh(), { type: "blindSet", blind: true });
    expect(draft.audit).toBe("Blind count — the book figure is hidden until you turn this off.");
    draft = physicalStockReducer(draft, { type: "reset", seed: SEED });
    expect(draft.blind).toBe(true);
  });

  it("a save takes the server's number and status and repaints from its lines", () => {
    let draft = physicalStockReducer(fresh(), { type: "sheetApplied", rows: [sheetRow()], godownName: "G" });
    draft = physicalStockReducer(draft, { type: "countedSet", rowKey: draft.lines[0].key, text: "97" });
    draft = physicalStockReducer(draft, { type: "documentSaved", document: documentOf([wireLine()]) });
    expect(draft.svhId).toBe("svh-1");
    expect(draft.refno).toBe("PHY0007");
    expect(draft.dirty).toBe(false);
    expect(draft.lines[0].avgCostRate).toBe(20);
    expect(draft.lines[0].diffValue).toBe(-60);
  });

  it("a loaded DRAFT opens for edit only when asked; a POSTED one never does", () => {
    const scope = { companyId: "c9", branchId: "b9", accYear: "2025-2026" };
    const asked = physicalStockReducer(fresh(), {
      type: "documentLoaded",
      document: documentOf([wireLine()]),
      scope,
      openForEdit: true,
    });
    expect(asked.mode).toBe("entry");
    expect(asked.companyId).toBe("c9");
    expect(asked.accYear).toBe("2026-2027");
    expect(asked.deviceId).toBe("dev-doc");
    expect(asked.rateSource).toBe("LAST_PURCHASE");
    expect(asked.scope).toBe("Coimbatore · 2026-2027");
    const viewed = physicalStockReducer(fresh(), {
      type: "documentLoaded",
      document: documentOf([wireLine()]),
      scope,
      openForEdit: false,
    });
    expect(viewed.mode).toBe("browse");
    const posted = physicalStockReducer(fresh(), {
      type: "documentLoaded",
      document: documentOf([wireLine()], "POSTED"),
      scope,
      openForEdit: true,
    });
    expect(posted.mode).toBe("browse");
    expect(isEditable(posted)).toBe(false);
  });

  it("the next sheet keeps the run's godown, date and rate source", () => {
    let draft = physicalStockReducer(fresh(), { type: "godownSelected", id: "g1", name: "Coimbatore" });
    draft = physicalStockReducer(draft, { type: "headerSet", field: "docDate", value: "2026-09-29" });
    draft = physicalStockReducer(draft, { type: "headerSet", field: "rateSource", value: "MRP" });
    draft = physicalStockReducer(draft, { type: "headerSet", field: "remarks", value: "first aisle" });
    draft = physicalStockReducer(draft, { type: "startNext", seed: SEED });
    expect(draft.godownId).toBe("g1");
    expect(draft.docDate).toBe("2026-09-29");
    expect(draft.rateSource).toBe("MRP");
    expect(draft.remarks).toBe("");
    expect(draft.dirty).toBe(false);
    expect(draft.scope).toBe("Coimbatore · 2026-2027");
  });

  it("a late business context re-seeds only a clean, unsaved screen", () => {
    const scope = { companyId: "c2", branchId: "b2", accYear: "2026-2027", deviceId: "d2" };
    expect(physicalStockReducer(fresh(), { type: "scopeSeeded", scope }).companyId).toBe("c2");
    const dirty = physicalStockReducer(fresh(), { type: "headerSet", field: "remarks", value: "x" });
    expect(physicalStockReducer(dirty, { type: "scopeSeeded", scope }).companyId).toBe("c1");
  });

  it("a status other than DRAFT makes the sheet read-only", () => {
    const posted = physicalStockReducer(fresh(), { type: "statusApplied", status: "POSTED" });
    expect(isEditable(posted)).toBe(false);
  });
});
