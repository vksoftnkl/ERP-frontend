import { describe, expect, it } from "vitest";
import {
  scheduleCells,
  scheduleDateText,
  scheduleLevels,
} from "./components/scheduled-prices-dialog";
import type { SellingPriceScheduleRow } from "./selling-price.types";

function level(levelNo: number, price: number) {
  return { level: levelNo, markupPerc: 0, priceWot: price, price, marginPerc: 0 };
}

function row(over: Partial<SellingPriceScheduleRow> = {}): SellingPriceScheduleRow {
  return {
    lineNo: 1,
    itemId: "i1",
    itemCode: null,
    barcode: null,
    itemName: "ZT-ITEM-A",
    uomId: "u1",
    unitName: "PCS",
    stockQty: 0,
    mrp: null,
    salePrice: null,
    maxPrice: 0,
    priceSource: "MASTER",
    priceScope: "BRANCH",
    bucketId: "ipm-new",
    costRate: 0,
    costWot: 0,
    costBasis: null,
    minPrice: 0,
    roundOff: 0.01,
    taxPerc: 0,
    inclTax: true,
    hasCess: false,
    levels: [level(1, 118), level(2, 120)],
    effectiveFrom: "2026-10-24",
    effectiveTo: "9999-12-31",
    previous: { bucketId: "ipm-old", priceScope: "BRANCH", levels: [level(1, 110), level(2, 120)] },
    ...over,
  };
}

describe("scheduled prices list", () => {
  it("shows 'before → after' where a level changes and the plain price where it does not", () => {
    const cells = scheduleCells(row(), [0, 1], "Coimbatore");
    expect(cells.prices).toEqual(["110.00 → 118.00", "120.00"]);
    expect(cells.from).toBe("24-10-2026");
    expect(cells.branch).toBe("Coimbatore");
  });

  it("names a chain row 'All branches' and shows plain prices with nothing before it", () => {
    const cells = scheduleCells(row({ priceScope: "CHAIN", previous: null }), [0], "Coimbatore");
    expect(cells.branch).toBe("All branches");
    expect(cells.prices).toEqual(["118.00"]);
  });

  it("drops a level the company has not switched on and keeps the defaults for unnamed ones", () => {
    const { names, active } = scheduleLevels([
      { priceLvlId: 1, priceLvlName: "WHOLE SALE", priceLvlShort: "WS", priceLvlIsActive: true },
      { priceLvlId: 3, priceLvlName: null, priceLvlShort: null, priceLvlIsActive: false },
      { priceLvlId: 9, priceLvlName: "junk", priceLvlShort: null, priceLvlIsActive: true },
    ]);
    expect(names).toEqual(["WHOLE SALE", "Level B", "Level C", "Level D"]);
    expect(active).toEqual([true, true, false, true]);
  });

  it("formats an ISO day as dd-MM-yyyy", () => {
    expect(scheduleDateText("2026-10-24T00:00:00.000Z")).toBe("24-10-2026");
    expect(scheduleDateText("")).toBe("");
  });
});
