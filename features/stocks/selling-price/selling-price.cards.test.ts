/**
 * The words and figures around the rows: the subtitle and chip
 * (`refreshTitle`), the row card (`refreshRowCard`), the profit line
 * (`refreshProfitLine`), the cells' read-outs and ↑ / ↓ marks (the delegate's
 * paint and helpEvent), the column layout with its level visibility and Enter
 * stops, and the price-band strip.
 */
import { describe, expect, it } from "vitest";
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import {
  changedChipText,
  levelBandText,
  profitLine,
  profitLineText,
  rowCard,
  subtitleText,
} from "./selling-price.cards";
import {
  priceBands,
  resolveSellingPriceColumns,
  screenColumns,
  seedColumns,
} from "./selling-price.columns";
import { cellText, deltaArrow, deltaFits, deltaOf, deltaText, deltaTip } from "./selling-price.display";
import { rowFromServer, setLevelPrice, type PriceGridRow } from "./selling-price.state";
import type { SellingPriceRow } from "./selling-price.types";

function serverRow(overrides: Partial<SellingPriceRow> = {}): SellingPriceRow {
  return {
    lineNo: 1,
    itemId: "item-1",
    itemCode: "SALT",
    barcode: null,
    itemName: "Salt 1 Kg",
    uomId: "iuc-1",
    unitName: "PCS",
    stockQty: 5,
    mrp: 40,
    salePrice: null,
    maxPrice: 40,
    priceSource: "BUCKET",
    priceScope: "BRANCH",
    bucketId: "ipm-1",
    costRate: 118,
    costWot: 100,
    costBasis: "MRP",
    minPrice: 0,
    roundOff: 0,
    taxPerc: 18,
    inclTax: true,
    hasCess: false,
    levels: [{ level: 1, price: 141.6, priceWot: 0, markupPerc: 0, marginPerc: 0 }],
    ...overrides,
  };
}

function row(overrides: Partial<SellingPriceRow> = {}): PriceGridRow {
  return rowFromServer(serverRow(overrides));
}

describe("the title", () => {
  it("counts items, rows and changes, and says nothing is written until Save", () => {
    const rows = [setLevelPrice(row(), 0, 140), row({ uomId: "iuc-2" })];
    expect(subtitleText("ACME", "Head Office", rows)).toBe(
      "ACME · Head Office · 1 item, 2 rows · 1 changed · nothing is written until Save",
    );
    expect(subtitleText("ACME", "", [])).toBe(
      "ACME · 0 items, 0 rows · 0 changed · nothing is written until Save",
    );
  });

  it("shouts the changed count", () => {
    expect(changedChipText(1)).toBe("1 ROW CHANGED");
    expect(changedChipText(7)).toBe("7 ROWS CHANGED");
  });
});

describe("the row card — what Save does to the current row", () => {
  it("asks for a row when there is none", () => {
    expect(rowCard(null, -1, "BRANCH")).toEqual({
      tone: "plain",
      title: "THE CURRENT ROW",
      note: "Move onto a row to see which row of the price table Save writes for it.",
    });
  });

  it("reads §5.5's table for a bucket row", () => {
    expect(rowCard(row({ priceScope: "BRANCH" }), 0, "BRANCH").title).toBe(
      "BUCKET·BR — THIS BRANCH'S OWN ROW",
    );
    expect(rowCard(row({ priceScope: "BRANCH" }), 0, "BRANCH").note).toMatch(
      /^This branch's own row is updated\. No other branch is affected\./,
    );
    expect(rowCard(row({ priceScope: "CHAIN" }), 0, "BRANCH").note).toMatch(
      /^A branch override is created for this branch\./,
    );
    expect(rowCard(row({ priceScope: "CHAIN" }), 0, "CHAIN").title).toBe("BUCKET·CH — THE CHAIN ROW");
    expect(rowCard(row({ priceScope: "CHAIN" }), 0, "CHAIN").note).toMatch(/^The chain row is updated\./);
    expect(rowCard(row({ priceScope: "BRANCH" }), 0, "CHAIN").note).toMatch(
      /^This row is already a branch override, so All branches updates the override in place\./,
    );
  });

  it("prefixes the headline's note", () => {
    const card = rowCard(row({ priceSource: "MASTER", mrp: null, priceScope: "CHAIN" }), 0, "CHAIN");
    expect(card.title).toBe("MASTER — THE HEADLINE ROW");
    expect(card.note).toMatch(/^The item's ordinary price row — no MRP \/ sale-price bucket\. The chain row is updated\./);
  });

  it("explains a row no price row answers yet", () => {
    const card = rowCard(row({ priceSource: "BUCKET", priceScope: null }), 0, "BRANCH");
    expect(card.note).toMatch(/^No row prices this yet\. A row is created for this branch/);
  });

  it("is green for a NEW row, and names the no-stock toast", () => {
    const fresh = row({ priceSource: "MASTER", priceScope: null, mrp: 45, stockQty: 0 });
    const card = rowCard(fresh, 2, "CHAIN");
    expect(card.tone).toBe("new");
    expect(card.title).toBe("NEW — A BUCKET NO ROW PRICES YET");
    expect(card.note).toContain(
      "Row 3: MRP 45.00 for Salt 1 Kg. Legal and useful. Save inserts it (as a chain row), copying cess / loading / freight / godown from the headline row, and the toast NAMES it:",
    );
    const stocked = rowCard(row({ priceSource: "MASTER", priceScope: null, mrp: 45, stockQty: 3 }), 0, "BRANCH");
    expect(stocked.note).toContain("Save inserts it (for this branch), copying cess / loading / freight / godown from the headline row.");
  });

  it("says which cost the markups work from", () => {
    expect(rowCard(row({ costBasis: "MRP" }), 0, "BRANCH").note).toContain(
      "\nCost 118.00 (100.00 before tax) is the landing cost of the stock at MRP 40.00 only.",
    );
    expect(rowCard(row({ costBasis: "ITEM" }), 0, "BRANCH").note).toContain(
      "is the item's average over all its stock in this branch.",
    );
    expect(rowCard(row({ costBasis: "PRICE_ROW" }), 0, "BRANCH").note).toContain(
      "is the cost kept on the price row — this branch has no stock cost for it yet.",
    );
  });
});

describe("the profit line (refreshProfitLine)", () => {
  const SHORTS = ["WS", "RET", "C", "D"];
  const NAMES = ["Wholesale", "Retail", "Level C", "Level D"];
  const ALL = [true, true, true, true];
  // Cost 118 incl. 18% = 100 before tax; WS 141.60 = 120 before tax.
  const priced = rowFromServer(
    serverRow({
      levels: [
        { level: 1, price: 141.6, priceWot: 0, markupPerc: 0, marginPerc: 0 },
        { level: 2, price: 106.2, priceWot: 0, markupPerc: 0, marginPerc: 0 },
      ],
    }),
  );

  it("shows each priced level's profit before tax, % on the cost before tax", () => {
    const line = profitLine(priced, ALL, SHORTS, NAMES);
    expect(line.kind).toBe("line");
    expect(profitLineText(line)).toBe(
      "Profit per PCS (no tax):  WS ₹20.00 (20.0%)  ·  RET -₹10.00 (-10.0%)",
    );
    if (line.kind === "line") {
      expect(line.parts.map((part) => part.loss)).toEqual([false, true]);
      expect(line.tooltip).toBe(
        "Wholesale: price ₹141.60, profit ₹20.00 (20.0%)\nRetail: price ₹106.20, profit -₹10.00 (-10.0%)",
      );
    }
  });

  it("marks a level whose profit moved since load, the old figure in the tooltip", () => {
    const line = profitLine(setLevelPrice(priced, 0, 147.5), ALL, SHORTS, NAMES);
    expect(profitLineText(line)).toBe(
      "Profit per PCS (no tax):  WS ₹25.00 (25.0%) ↑  ·  RET -₹10.00 (-10.0%)",
    );
    if (line.kind === "line") {
      expect(line.parts[0].moved).toBe("up");
      expect(line.tooltip.split("\n")[0]).toBe(
        "Wholesale: price ₹147.50, profit ₹25.00 (25.0%), was ₹20.00",
      );
    }
    expect(profitLine(setLevelPrice(priced, 0, 130), ALL, SHORTS, NAMES)).toMatchObject({
      parts: [{ moved: "down" }, { moved: null }],
    });
  });

  it("leaves out a level that is switched off or has no price", () => {
    const line = profitLine(priced, [true, false, true, true], SHORTS, NAMES);
    expect(profitLineText(line)).toBe("Profit per PCS (no tax):  WS ₹20.00 (20.0%)");
    expect(profitLine(priced, [false, false, true, true], SHORTS, NAMES)).toEqual({
      kind: "note",
      text: "No price yet.",
    });
  });

  it("says why there are no figures", () => {
    expect(profitLineText(profitLine(null, ALL, SHORTS, NAMES))).toBe(
      "Profit shows here for the row you are on.",
    );
    expect(profitLineText(profitLine(row({ costRate: 0, costWot: 0 }), ALL, SHORTS, NAMES))).toBe(
      "No cost on this row, so no profit to show.",
    );
  });

  it("calls the figures approximate for a cess item", () => {
    expect(profitLineText(profitLine(row({ hasCess: true }), ALL, SHORTS, NAMES))).toBe(
      "Profit per PCS (no tax):  WS ₹20.00 (20.0%)   (approximate — this item carries a cess)",
    );
  });

  it("falls back to the level letter when no short name came", () => {
    const line = profitLine(priced, ALL, [], NAMES);
    expect(line.kind === "line" && line.parts.map((part) => part.level)).toEqual(["A", "B"]);
  });
});

describe("cell read-outs", () => {
  const loaded = row({ stockQty: 2.5, salePrice: null, minPrice: 0 });

  it("paints money, markups, stock and dashes", () => {
    expect(cellText(loaded, "priceA")).toBe("141.60");
    expect(cellText(loaded, "mkupA")).toBe("20.0");
    expect(cellText(loaded, "rateA")).toBe("120.00");
    expect(cellText(loaded, "stockQty")).toBe("2.500");
    expect(cellText(row({ stockQty: 1200 }), "stockQty")).toBe("1,200");
    expect(cellText(loaded, "salePx")).toBe("—");
    expect(cellText(loaded, "minPrice")).toBe("0.00");
    expect(cellText(loaded, "costWot")).toBe("100.00");
  });

  it("marks the change since load ↑ / ↓, the loaded figure in the tooltip", () => {
    const edited = setLevelPrice(loaded, 0, 145);
    expect(deltaOf(loaded, "priceA")).toBeNull();
    expect(deltaOf(edited, "priceA")).toBe(3.4);
    expect(deltaOf(edited, "rateA")).toBeCloseTo(2.88, 10);
    expect(deltaOf(edited, "mkupA")).toBeNull();
    expect(deltaText(3.4)).toBe("+3.40");
    expect(deltaText(-2)).toBe("−2.00");
    expect(deltaArrow(3.4)).toBe("↑");
    expect(deltaArrow(-2)).toBe("↓");
    expect(deltaTip(edited, "priceA")).toBe("Was 141.60 (+3.40)");
    // A base rate's loaded figure is the loaded price before tax.
    expect(deltaTip(edited, "rateA")).toBe("Was 120.00 (+2.88)");
    expect(deltaTip(setLevelPrice(loaded, 0, 140), "priceA")).toBe("Was 141.60 (−1.60)");
    expect(deltaTip(loaded, "priceA")).toBe("");
  });

  it("drops the chip where it would not fit beside the figure", () => {
    expect(deltaFits("+3.40", "141.60", 92)).toBe(true);
    expect(deltaFits("+1,000.00", "12,345.60", 55)).toBe(false);
    // The same cell at a bigger page unit needs more room.
    expect(deltaFits("+3.40", "141.60", 92, 20)).toBe(false);
  });
});

describe("columns", () => {
  const layoutRow = (
    no: number,
    name: string,
    position: number,
    extra: Partial<UiTableColumnRow> = {},
  ): UiTableColumnRow => ({
    uiTblClmId: `id-${no}`,
    uiTblClmNo: String(no),
    uiTblClmName: name,
    uiTblClmColumnWidth: 4,
    uiTblClmColumnVisibility: true,
    uiTblClmColumnFocus: false,
    uiTblClmColumnPosition: position,
    uiTblClmColumnNecessity: false,
    ...extra,
  });

  it("joins ui table 44 by column number, repeated names and all", () => {
    const columns = resolveSellingPriceColumns([
      layoutRow(0, "#", 0),
      layoutRow(1, "Item", 2),
      layoutRow(8, "Mkup%", 3, { uiTblClmColumnFocus: true }),
      layoutRow(9, "Net Rate", 5, { uiTblClmColumnFocus: true }),
      layoutRow(10, "Mkup%", 6),
      layoutRow(37, "Base Rate", 4, { uiTblClmColumnVisibility: false }),
      layoutRow(17, "ItemId", 7),
      layoutRow(35, "Branch", 1),
    ]);
    expect(columns.map((column) => column.key)).toEqual([
      "lineNo",
      "branchName",
      "itemName",
      "mkupA",
      "rateA",
      "priceA",
      "mkupB",
    ]);
    const mkupA = columns.find((column) => column.key === "mkupA");
    expect(mkupA?.header).toBe("Mkup%");
    expect(mkupA?.focus).toBe(true);
    // Qt percents → pixels at the Sale Bill's ratio.
    expect(mkupA?.widthPx).toBe(44);
    expect(columns.find((column) => column.key === "rateA")?.visible).toBe(false);
  });

  it("falls back to the Qt seed until the layout answers", () => {
    expect(resolveSellingPriceColumns(undefined)).toEqual(seedColumns());
    const seed = seedColumns();
    expect(seed.slice(0, 4).map((column) => column.key)).toEqual([
      "lineNo",
      "branchName",
      "barcodeText",
      "itemName",
    ]);
    expect(seed.find((column) => column.key === "itemName")?.widthPx).toBe(230);
    expect(seed.find((column) => column.key === "mkupA")?.focus).toBe(true);
    expect(seed.find((column) => column.key === "costRate")?.focus).toBe(false);
  });

  it("bands the levels over their columns, Min apart, the rest under the lead", () => {
    const bands = priceBands(seedColumns(), ["Wholesale", "", "Retail", "Dealer"]);
    expect(bands.map((band) => [band.text, band.span])).toEqual([
      ["one row = one row of the item price table", 11],
      ["WHOLESALE  (A)", 3],
      ["LEVEL  (B)", 3],
      ["RETAIL  (C)", 3],
      ["DEALER  (D)", 3],
      ["", 1],
    ]);
    expect(levelBandText(undefined, "A")).toBe("LEVEL  (A)");
  });

  it("draws no column and no band for a level the company has not switched on", () => {
    const shown = screenColumns(seedColumns(), [true, false, true, false]);
    const keys = shown.map((column) => column.key);
    for (const gone of ["mkupB", "rateB", "priceB", "mkupD", "rateD", "priceD"]) {
      expect(keys).not.toContain(gone);
    }
    expect(keys).toContain("priceC");
    const bands = priceBands(shown, ["Wholesale", "Retail", "Dealer", "Special"]);
    expect(bands.map((band) => [band.text, band.span])).toEqual([
      ["one row = one row of the item price table", 11],
      ["WHOLESALE  (A)", 3],
      ["DEALER  (C)", 3],
      ["", 1],
    ]);
  });

  it("stops Enter on the prices only — one Net Rate per active level", () => {
    const shown = screenColumns(seedColumns(), [true, true, false, true]);
    expect(shown.filter((column) => column.focus).map((column) => column.key)).toEqual([
      "priceA",
      "priceB",
      "priceD",
    ]);
    // The layout's own flags (markups, base rates, Min) do not count…
    expect(seedColumns().find((column) => column.key === "minPrice")?.focus).toBe(true);
    // …and a column the layout hides stays hidden.
    const hiddenRate = seedColumns().map((column) =>
      column.key === "rateA" ? { ...column, visible: false } : column,
    );
    expect(screenColumns(hiddenRate, [true, true, true, true]).map((column) => column.key)).not.toContain(
      "rateA",
    );
  });
});
