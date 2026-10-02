/**
 * The words and figures around the rows: the subtitle and chip
 * (`refreshTitle`), the row card (`refreshRowCard`), the violet card
 * (`refreshFourCard`), the cells' read-outs (the delegate's paint), the
 * column layout and the price-band strip.
 */
import { describe, expect, it } from "vitest";
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import { changedChipText, fourCard, levelBandText, rowCard, subtitleText } from "./selling-price.cards";
import { priceBands, resolveSellingPriceColumns, seedColumns } from "./selling-price.columns";
import { cellText, deltaFits, deltaOf, deltaText } from "./selling-price.display";
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

describe("the violet card", () => {
  it("shows one level's four numbers", () => {
    const card = fourCard(row(), 0, 0, ["Wholesale"], false);
    expect(card).toEqual({
      enabled: true,
      which: "Wholesale · row 1 · Salt 1 Kg · tax 18.00%",
      markup: "20.0",
      wot: "120.00",
      price: "141.60",
      margin: "16.7",
      cess: false,
    });
  });

  it("is shut with no row, and while saving", () => {
    expect(fourCard(null, -1, 0, [], false).which).toBe("move onto a row to see its numbers");
    expect(fourCard(row(), 0, 0, [], true).enabled).toBe(false);
  });

  it("warns for a cess item", () => {
    expect(fourCard(row({ hasCess: true }), 0, 0, [], false).cess).toBe(true);
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

  it("chips the change since load", () => {
    const edited = setLevelPrice(loaded, 0, 145);
    expect(deltaOf(loaded, "priceA")).toBeNull();
    expect(deltaOf(edited, "priceA")).toBe(3.4);
    expect(deltaOf(edited, "rateA")).toBeCloseTo(2.88, 10);
    expect(deltaOf(edited, "mkupA")).toBeNull();
    expect(deltaText(3.4)).toBe("+3.40");
    expect(deltaText(-2)).toBe("−2.00");
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
});
