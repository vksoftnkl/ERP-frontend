/**
 * The quick rate popup's arithmetic and rules — Qt `QuickRateDialog`
 * (quick_rate_dialog.cpp) and its live spec (tests/quickrate/live/
 * test_quick_rate_live.cpp: Q1 levels/columns, Q2 the live line and the save,
 * Q4 read-only, Q6 only the line's unit and W/o tax = price ÷ 1.18, Q7 cost).
 */
import { describe, expect, it } from "vitest";
import {
  activeLevels,
  applyCellEdit,
  buildQuickRatePayload,
  cellView,
  changedRowCount,
  costWotOf,
  fromDayRefusal,
  historyNote,
  inwardCells,
  inwardNote,
  isCellEditable,
  isRowChanged,
  liveLine,
  nextEnterStop,
  quickRateBelowCostLines,
  quickRateColumns,
  rowsFromGrid,
  scheduledNotice,
  showAllUnitsOffer,
  shownRows,
  startColumnIndex,
  startRowIndex,
  subLine,
  unitText,
  verticalStop,
  type QuickRateColumn,
  type QuickRateRow,
} from "./quick-rate";
import type { ItemInwardRow, PriceLevelMasterRow, SellingPriceRow } from "./selling-price.types";

const PCS = "01a161d8-500a-7180-941f-b5673c7c72af";
const BOTTLE = "01a161d8-500a-7180-941f-b5673c7c72b0";

function gridRow(over: Partial<SellingPriceRow> = {}): SellingPriceRow {
  return {
    lineNo: 1,
    itemId: "item-1",
    itemCode: "ZT-A",
    barcode: "8901",
    itemName: "ZT-ITEM-A",
    uomId: PCS,
    unitName: "PCS",
    stockQty: 12,
    mrp: null,
    salePrice: null,
    maxPrice: 150,
    priceSource: "MASTER",
    priceScope: "BRANCH",
    bucketId: "ipm-1",
    costRate: 100,
    costWot: 84.75,
    costBasis: "ITEM",
    minPrice: 0,
    roundOff: 0,
    taxPerc: 18,
    inclTax: true,
    hasCess: false,
    levels: [
      { level: 1, price: 118, priceWot: 100, markupPerc: 18, marginPerc: 15 },
      { level: 2, price: 118, priceWot: 100, markupPerc: 18, marginPerc: 15 },
      { level: 3, price: 118, priceWot: 100, markupPerc: 18, marginPerc: 15 },
      { level: 4, price: 118, priceWot: 100, markupPerc: 18, marginPerc: 15 },
    ],
    ...over,
  };
}

function level(id: number, over: Partial<PriceLevelMasterRow> = {}): PriceLevelMasterRow {
  return {
    priceLvlId: id,
    priceLvlName: ["Wholesale", "Retail", "Dealer", "Special"][id - 1],
    priceLvlShort: null,
    priceLvlIsActive: true,
    ...over,
  };
}

function col(columns: QuickRateColumn[], kind: QuickRateColumn["kind"], levelId?: number): QuickRateColumn {
  const found = columns.find((c) => c.kind === kind && (levelId === undefined || c.level === levelId));
  if (!found) throw new Error(`no ${kind} column`);
  return found;
}

describe("levels (Q1)", () => {
  it("shows only the active, undeleted levels 1..4, in id order", () => {
    const levels = activeLevels([
      level(3),
      level(1),
      level(2, { priceLvlIsActive: false }),
      level(4, { priceLvlIsDeleted: true }),
      level(5),
    ]);
    expect(levels).toEqual([
      { id: 1, name: "Wholesale" },
      { id: 3, name: "Dealer" },
    ]);
  });

  it("falls back to all four, Price A..D, when none is active or the master is unreadable", () => {
    const names = ["Price A", "Price B", "Price C", "Price D"];
    expect(activeLevels(undefined).map((l) => l.name)).toEqual(names);
    expect(activeLevels([level(1, { priceLvlIsActive: false })]).map((l) => l.name)).toEqual(names);
  });

  it("the grid is Unit, MRP, Stock, Cost w/o tax, Cost, 3 per level, Min", () => {
    const columns = quickRateColumns(activeLevels([level(1), level(2)]));
    expect(columns).toHaveLength(5 + 3 * 2 + 1);
    expect(columns.map((c) => c.header)).toEqual([
      "Unit",
      "MRP",
      "Stock",
      "Cost w/o tax",
      "Cost",
      "Profit %",
      "W/o tax",
      "Price",
      "Profit %",
      "W/o tax",
      "Price",
      "Min",
    ]);
    expect(startColumnIndex(columns)).toBe(7);
  });
});

describe("cell edits", () => {
  const columns = quickRateColumns(activeLevels([level(1), level(2)]));
  const [row] = rowsFromGrid([gridRow({ roundOff: 0 })]);

  it("Price is taken as typed (no round-off)", () => {
    const next = applyCellEdit({ ...row, source: { ...row.source, roundOff: 5 } }, col(columns, "price", 2), 121.37);
    expect(next.prices).toEqual([118, 121.37, 118, 118]);
  });

  it("W/o tax → price = round-off(typed × 1.18)", () => {
    expect(applyCellEdit(row, col(columns, "wot", 1), 110).prices[0]).toBe(129.8);
    const rounded = { ...row, source: { ...row.source, roundOff: 1 } };
    expect(applyCellEdit(rounded, col(columns, "wot", 1), 110).prices[0]).toBe(130);
  });

  it("Profit % → w/o tax = cost w/o tax × (1 + p%) → price = round-off(× 1.18)", () => {
    // cost w/o tax 84.75 (the server's), +20% = 101.70, × 1.18 = 120.006
    expect(applyCellEdit(row, col(columns, "profit", 2), 20).prices[1]).toBe(120.01);
    const rounded = { ...row, source: { ...row.source, roundOff: 0.5 } };
    expect(applyCellEdit(rounded, col(columns, "profit", 2), 20).prices[1]).toBe(120);
  });

  it("Profit % with no cost prices nothing", () => {
    const noCost = rowsFromGrid([gridRow({ costRate: 0, costWot: 0 })])[0];
    expect(applyCellEdit(noCost, col(columns, "profit", 1), 20).prices).toEqual(noCost.prices);
  });

  it("prices that exclude tax use a tax factor of 1", () => {
    const excl = rowsFromGrid([gridRow({ inclTax: false, costWot: 0 })])[0];
    expect(applyCellEdit(excl, col(columns, "wot", 1), 110).prices[0]).toBe(110);
    // cost w/o tax = cost ÷ 1 = 100; +10% = 110
    expect(applyCellEdit(excl, col(columns, "profit", 1), 10).prices[0]).toBe(110);
  });

  it("Cost typed with tax, or without (× 1.18); Min as typed", () => {
    expect(applyCellEdit(row, col(columns, "cost"), 105.555).cost).toBe(105.56);
    expect(applyCellEdit(row, col(columns, "costWot"), 100).cost).toBe(118);
    expect(applyCellEdit(row, col(columns, "min"), 99.999).min).toBe(100);
  });

  it("cost w/o tax is the server's as loaded, cost ÷ (1 + tax) once typed", () => {
    expect(costWotOf(row)).toBe(84.75);
    const typed = applyCellEdit(row, col(columns, "cost"), 118);
    expect(costWotOf(typed)).toBeCloseTo(100, 10);
  });

  it("W/o tax shows price ÷ 1.18 (Q6) and Profit % on cost w/o tax", () => {
    expect(cellView(row, col(columns, "wot", 1)).text).toBe("100.00");
    // (100 − 84.75) ÷ 84.75 = 17.99%
    expect(cellView(row, col(columns, "profit", 1)).text).toBe("17.99");
    const free = { ...row, prices: [0, 118, 118, 118] };
    expect(cellView(free, col(columns, "profit", 1)).text).toBe("—");
    expect(cellView(free, col(columns, "wot", 1)).text).toBe("—");
  });

  it("a changed price carries its move", () => {
    const next = applyCellEdit(row, col(columns, "price", 2), 121);
    expect(cellView(next, col(columns, "price", 2)).delta).toBe(3);
    expect(cellView(next, col(columns, "price", 1)).delta).toBe(0);
  });
});

describe("editability (Q4, Q7)", () => {
  const columns = quickRateColumns(activeLevels([level(1)]));
  const stockAverage = rowsFromGrid([gridRow({ costBasis: "ITEM" })])[0];
  const ownCost = rowsFromGrid([gridRow({ costBasis: "PRICE_ROW" })])[0];

  it("a stock-average cost is read-only; the price row's own cost is editable", () => {
    expect(isCellEditable(stockAverage, col(columns, "cost"), true)).toBe(false);
    expect(isCellEditable(stockAverage, col(columns, "costWot"), true)).toBe(false);
    expect(isCellEditable(ownCost, col(columns, "cost"), true)).toBe(true);
    expect(isCellEditable(ownCost, col(columns, "costWot"), true)).toBe(true);
  });

  it("without the Edit right nothing is editable", () => {
    for (const column of columns) {
      expect(isCellEditable(ownCost, column, false)).toBe(false);
    }
  });

  it("unit, MRP and stock are never editable", () => {
    expect(isCellEditable(ownCost, col(columns, "unit"), true)).toBe(false);
    expect(isCellEditable(ownCost, col(columns, "mrp"), true)).toBe(false);
    expect(isCellEditable(ownCost, col(columns, "stock"), true)).toBe(false);
  });
});

describe("changed rows", () => {
  const columns = quickRateColumns(activeLevels([level(1), level(2)]));

  it("a price, the min or the cost moving by 0.005 or more", () => {
    const rows = rowsFromGrid([gridRow(), gridRow({ uomId: BOTTLE })]);
    expect(changedRowCount(rows)).toBe(0);
    expect(isRowChanged({ ...rows[0], prices: [118.004, 118, 118, 118] })).toBe(false);
    expect(isRowChanged({ ...rows[0], prices: [118, 118, 118, 118.01] })).toBe(true);
    expect(isRowChanged({ ...rows[0], min: 1 })).toBe(true);
    expect(isRowChanged({ ...rows[0], cost: 101 })).toBe(true);
    const edited = [applyCellEdit(rows[0], col(columns, "price", 2), 121), rows[1]];
    expect(changedRowCount(edited)).toBe(1);
  });
});

describe("the save payload (Q2, Q7)", () => {
  const columns = quickRateColumns(activeLevels([level(2)]));

  function save(rows: QuickRateRow[], originMenuId = 12) {
    return buildQuickRatePayload({
      rows,
      companyId: "co",
      branchId: "br",
      scope: "BRANCH",
      confirmed: false,
      effectiveFrom: "2026-10-24",
      originMenuId,
    });
  }

  it("only changed rows; all four levels, hidden ones as loaded; lineNo over the whole grid", () => {
    const loaded = rowsFromGrid([
      gridRow({ uomId: BOTTLE, unitName: "Bottle" }),
      gridRow({
        levels: [
          { level: 1, price: 110, priceWot: 0, markupPerc: 0, marginPerc: 0 },
          { level: 2, price: 118, priceWot: 0, markupPerc: 0, marginPerc: 0 },
          { level: 3, price: 125, priceWot: 0, markupPerc: 0, marginPerc: 0 },
          { level: 4, price: 0, priceWot: 0, markupPerc: 0, marginPerc: 0 },
        ],
      }),
    ]);
    const rows = [loaded[0], applyCellEdit(loaded[1], col(columns, "price", 2), 121)];
    const payload = save(rows);
    expect(payload.rows).toHaveLength(1);
    const [row] = payload.rows;
    expect(row.lineNo).toBe(2);
    expect(row.levels.map((l) => [l.level, l.price])).toEqual([
      [1, 110],
      [2, 121],
      [3, 125],
      [4, 0],
    ]);
    expect(row.levels[1].priceWot).toBeCloseTo(121 / 1.18, 10);
    expect(row.levels[1].markupPerc).toBeCloseTo(21, 10);
    expect(row).toMatchObject({
      itemId: "item-1",
      uomId: PCS,
      bucketId: "ipm-1",
      mrp: null,
      salePrice: null,
      minPrice: 0,
      roundOff: 0,
      priceScope: "BRANCH",
    });
    expect("costPrice" in row).toBe(false);
  });

  it("costPrice only when the cost changed; priceScope only when loaded with one", () => {
    const [loaded] = rowsFromGrid([gridRow({ costBasis: "PRICE_ROW", priceScope: null })]);
    const typed = applyCellEdit(loaded, col(columns, "cost"), 105);
    const [row] = save([typed]).rows;
    expect(row.costPrice).toBe(105);
    expect("priceScope" in row).toBe(false);
    // The markup is measured on the NEW cost.
    expect(row.levels[0].markupPerc).toBeCloseTo(((118 - 105) / 105) * 100, 10);
  });

  it("effectiveFrom always; originMenuId unless it is menu 30", () => {
    const [loaded] = rowsFromGrid([gridRow()]);
    const rows = [applyCellEdit(loaded, col(columns, "min"), 50)];
    const fromBill = save(rows, 12);
    expect(fromBill.effectiveFrom).toBe("2026-10-24");
    expect(fromBill.originMenuId).toBe(12);
    expect(fromBill).toMatchObject({ companyId: "co", branchId: "br", scope: "BRANCH", confirmed: false });
    expect("originMenuId" in save(rows, 30)).toBe(false);
    expect("originMenuId" in save(rows, 0)).toBe(false);
  });

  it("names the below-cost lines from the rows they were sent as", () => {
    const levels = activeLevels([level(2)]);
    const loaded = rowsFromGrid([gridRow({ uomId: BOTTLE, unitName: "Bottle" }), gridRow({ mrp: 140 })]);
    const rows = [loaded[0], applyCellEdit(loaded[1], col(columns, "price", 2), 90)];
    const lines = quickRateBelowCostLines(
      {
        problems: [
          {
            lineNo: 2,
            itemId: "item-1",
            itemCode: null,
            itemName: "ZT-ITEM-A",
            uomId: PCS,
            bucketId: "ipm-1",
            level: 2,
            verdict: "BELOW_COST",
            message: "",
          },
        ],
      },
      rows,
      levels,
    );
    expect(lines).toEqual([
      { row: 2, item: "ZT-ITEM-A", bucket: "PCS · MRP 140", level: "Retail", price: 90, cost: 100 },
    ]);
  });

  it("refuses a From day before today, and words a scheduled save", () => {
    expect(fromDayRefusal("2026-10-23", "2026-10-24")).toBe(
      "New rates can start today or a later day, not before.",
    );
    expect(fromDayRefusal("2026-10-24", "2026-10-24")).toBeNull();
    expect(scheduledNotice("2026-10-30", "2026-10-24")).toBe(
      "The new rates start 30-10-2026; today's rates stay till then.",
    );
    expect(scheduledNotice("2026-10-24", "2026-10-24")).toBeNull();
    expect(scheduledNotice("", "2026-10-24")).toBeNull();
  });
});

describe("the live line (Q2)", () => {
  const levels = activeLevels([level(1), level(2)]);
  const columns = quickRateColumns(levels);
  const [row] = rowsFromGrid([gridRow()]);

  it("off a level cell: what Save will send, or how to type", () => {
    expect(liveLine({ row, column: col(columns, "cost"), levels, changed: 0 }).text).toBe(
      "Type a price, a profit % or a w/o-tax rate; Enter moves to the next price.",
    );
    expect(liveLine({ row: null, column: null, levels, changed: 2 }).text).toBe("2 rows changed — Ctrl+S saves.");
    expect(liveLine({ row, column: col(columns, "min"), levels, changed: 1 }).text).toBe(
      "1 row changed — Ctrl+S saves.",
    );
  });

  it("on a level cell: the move, the profit, the MRP", () => {
    const edited = applyCellEdit(row, col(columns, "price", 2), 121);
    const line = liveLine({ row: edited, column: col(columns, "profit", 2), levels, changed: 1 });
    expect(line.text).toBe(
      "PCS · Retail   118.00 → 121.00  (+2.5%)   ·   profit 20.99% on cost w/o tax 84.75   ·   under MRP 150.00 ✓",
    );
    expect(line.warn).toBe(false);
  });

  it("warns above MRP and below cost", () => {
    const above = applyCellEdit(row, col(columns, "price", 1), 160);
    const aboveLine = liveLine({ row: above, column: col(columns, "price", 1), levels, changed: 1 });
    expect(aboveLine.text).toContain("ABOVE MRP 150.00");
    expect(aboveLine.warn).toBe(true);
    const below = applyCellEdit(row, col(columns, "price", 1), 90);
    const belowLine = liveLine({ row: below, column: col(columns, "price", 1), levels, changed: 1 });
    expect(belowLine.text).toContain("118.00 → 90.00  (−23.7%)");
    expect(belowLine.text).toContain("BELOW COST — Save will ask");
    expect(belowLine.warn).toBe(true);
  });
});

describe("only the line's unit (Q6)", () => {
  const rows = rowsFromGrid([
    gridRow({ uomId: BOTTLE, unitName: "Bottle" }),
    gridRow({ uomId: PCS, unitName: "PCS" }),
    gridRow({ uomId: PCS, unitName: "PCS", mrp: 140, salePrice: 130, bucketId: "ipm-2" }),
  ]);

  it("shows the line's unit rows; all of them with Show all, without a unit, or when it is not there", () => {
    expect(shownRows(rows, PCS, false)).toEqual([false, true, true]);
    expect(shownRows(rows, PCS, true)).toEqual([true, true, true]);
    expect(shownRows(rows, "", false)).toEqual([true, true, true]);
    expect(shownRows(rows, "other-unit", false)).toEqual([true, true, true]);
    expect(startRowIndex(rows, PCS)).toBe(1);
    expect(startRowIndex(rows, undefined)).toBe(0);
  });

  it("offers Show all units from a bill line only, counting what it hides", () => {
    expect(showAllUnitsOffer(rows, PCS, true)).toEqual({ visible: true, text: "Show all units (1 more)" });
    expect(showAllUnitsOffer(rows, PCS, false).visible).toBe(false);
    expect(showAllUnitsOffer(rows, "other-unit", true).visible).toBe(false);
  });

  it("the unit cell names the bucket", () => {
    expect(unitText(rows[2].source)).toBe("PCS · MRP 140 · SP 130");
    expect(unitText(rows[1].source)).toBe("PCS");
  });
});

describe("the Enter walk", () => {
  const columns = quickRateColumns(activeLevels([level(1), level(2)]));
  // price columns 7 and 10, min 11
  const rows = rowsFromGrid([gridRow({ uomId: BOTTLE }), gridRow(), gridRow()]);

  it("walks the prices and Min of the shown rows, round to the top", () => {
    const shown = [false, true, true];
    expect(nextEnterStop(rows, shown, columns, true, { row: 1, col: 7 })).toEqual({ row: 1, col: 10 });
    expect(nextEnterStop(rows, shown, columns, true, { row: 1, col: 10 })).toEqual({ row: 1, col: 11 });
    expect(nextEnterStop(rows, shown, columns, true, { row: 1, col: 11 })).toEqual({ row: 2, col: 7 });
    // From the last stop it skips the hidden row 0 and lands on row 1.
    expect(nextEnterStop(rows, shown, columns, true, { row: 2, col: 11 })).toEqual({ row: 1, col: 7 });
    // From a profit cell: that level's price.
    expect(nextEnterStop(rows, shown, columns, true, { row: 1, col: 5 })).toEqual({ row: 1, col: 7 });
  });

  it("goes nowhere read-only", () => {
    expect(nextEnterStop(rows, [true, true, true], columns, false, { row: 0, col: 7 })).toBeNull();
  });

  it("↑↓ move between the shown units", () => {
    const shown = [true, false, true];
    expect(verticalStop(shown, { row: 0, col: 7 }, 1)).toEqual({ row: 2, col: 7 });
    expect(verticalStop(shown, { row: 2, col: 7 }, -1)).toEqual({ row: 0, col: 7 });
    expect(verticalStop(shown, { row: 2, col: 7 }, 1)).toBeNull();
  });
});

describe("the headline and the two panels", () => {
  it("the sub line, or why there is no grid", () => {
    expect(subLine(rowsFromGrid([gridRow()]), "ZT-ITEM-A")).toBe("ZT-A  ·  barcode 8901  ·  GST 18% (incl.)");
    expect(subLine([], "ZT-ITEM-A")).toBe("ZT-ITEM-A has no price row this branch can see.");
  });

  it("an inward row (Q5): type · ref, cost read", () => {
    const row: ItemInwardRow = {
      date: "2026-10-23",
      txnType: "OPENING",
      refno: "OPN0006",
      supplierId: null,
      supplierName: null,
      qty: 24,
      freeQty: 0,
      unitName: "PCS",
      baseQty: 24,
      costWot: 84.75,
      taxPerc: 18,
      cost: 100,
      mrp: 150,
      batchNo: null,
    };
    expect(inwardCells(row)).toEqual([
      "23-10-2026",
      "Opening · OPN0006",
      "—",
      "24 PCS",
      "84.75",
      "18%",
      "100.00",
      "150",
    ]);
    expect(inwardCells({ ...row, taxPerc: null, mrp: null })[5]).toBe("—");
  });

  it("the panels' notes", () => {
    expect(inwardNote({ rows: 0 })).toBe("No inward of this item yet.");
    expect(inwardNote({ rows: 3 })).toBe("");
    expect(inwardNote({ status: 404 })).toBe("Recent inward will show here once the server has it (notes-146).");
    expect(inwardNote({ status: 500 })).toBe("Recent inward could not be read (500).");
    expect(historyNote({ rows: 0 })).toBe("No rate change of this item has been recorded yet.");
    expect(historyNote({ rows: 2 })).toBe("F3 — the full price history of this item");
    expect(historyNote({ status: 403 })).toBe(
      "Who changed it: needs a right on the Price Change Log (menu 290).",
    );
  });
});
