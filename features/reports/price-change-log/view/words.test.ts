import { describe, expect, it } from "vitest";
import type { PriceLogRow } from "../wire/types";
import {
  appliesText,
  changeChips,
  changeText,
  dayText,
  deviceText,
  moveText,
  numberText,
  valueText,
  whoText,
} from "./words";

function row(over: Partial<PriceLogRow> = {}): PriceLogRow {
  return {
    ipclId: "c1",
    changedOn: "2026-10-23T10:15:00+05:30",
    day: "2026-10-23",
    changeSetId: "s1",
    priceTable: "IPM",
    rowId: "r1",
    action: "UPDATE",
    source: "CHANGE_SELLING_PRICE",
    menuId: 30,
    companyId: "co",
    branchId: null,
    branchName: null,
    itemId: "i1",
    itemCode: "SKU1",
    itemName: "Tata Salt",
    unitId: null,
    unitName: "PCS",
    godownId: null,
    godownName: null,
    partyId: null,
    partyName: null,
    priceLevel: null,
    priceLevelName: null,
    bucketMrp: null,
    bucketSp: null,
    effectiveFrom: null,
    effectiveTo: null,
    userId: "u1",
    userName: "Viji",
    deviceId: null,
    deviceName: null,
    ip: null,
    app: "WEB",
    reason: null,
    changed: [],
    changedLabels: [],
    oldPriceA: null,
    newPriceA: null,
    oldMrp: null,
    newMrp: null,
    oldCost: null,
    newCost: null,
    oldSlabPrice: null,
    newSlabPrice: null,
    slabFromQty: null,
    slabToQty: null,
    changePct: null,
    ...over,
  };
}

describe("words", () => {
  it("says numbers, days and places the report's way", () => {
    expect(numberText(118)).toBe("118");
    expect(numberText(118.5)).toBe("118.50");
    expect(numberText("1200.25")).toBe("1,200.25");
    expect(numberText(0)).toBe("0");
    expect(numberText(null)).toBe("—");
    expect(dayText("2026-10-23")).toBe("Fri 23-10-2026");
    expect(appliesText(row({ bucketMrp: 150, bucketSp: 140 }))).toBe("MRP 150 · SP 140");
    expect(
      appliesText(row({ priceTable: "IQP", slabFromQty: 10, slabToQty: null, priceLevelName: "Retail" })),
    ).toBe("10+ qty · Retail");
    expect(appliesText(row())).toBe("—");
  });

  it("names who and where", () => {
    expect(whoText(row())).toBe("Viji");
    expect(whoText(row({ app: "SYSTEM", userName: null }))).toBe("System");
    expect(deviceText(row({ ip: "10.0.0.4" }))).toBe("(no device) 10.0.0.4");
    expect(deviceText(row({ deviceName: "TILL-1" }))).toBe("TILL-1");
  });
});

describe("changeChips", () => {
  it("draws one chip per changed field and drops a price's companions", () => {
    const chips = changeChips(
      row({
        fields: [
          { column: "ipm_sales_price_b", label: "Price B", before: 118, after: 119 },
          { column: "ipm_price_b_wot", label: "Price B (w/o tax)", before: 100, after: 100.85 },
          { column: "ipm_price_b_markup_perc", label: "Markup B %", before: 10, after: 11 },
          { column: "ipm_max_price", label: "MRP", before: 150, after: 140 },
        ],
      }),
    );
    expect(chips).toEqual([
      { text: "Price B 118 → 119  ▲0.8%", tone: "up" },
      { text: "MRP 150 → 140  ▼6.7%", tone: "down" },
    ]);
  });

  it("falls back to the headline pairs without fields[]", () => {
    const text = changeText(
      row({
        changed: ["ipm_sales_price_a", "ipm_min_price"],
        changedLabels: ["Price A", "Min price"],
        oldPriceA: 110,
        newPriceA: 118,
      }),
    );
    expect(text).toBe("Price A 110 → 118  ▲7.3%; Min price");
  });

  it("names a create, a delete and a below-cost save", () => {
    expect(changeText(row({ action: "CREATE", newPriceA: 118, newMrp: 150 }))).toBe(
      "new price row; Price A 118; MRP 150",
    );
    expect(changeChips(row({ action: "DELETE", priceTable: "IQP" }))[0]).toEqual({
      text: "slab deleted",
      tone: "down",
    });
    expect(changeChips(row({ action: "CREATE", reason: "Saved below cost, confirmed" })).at(-1)).toEqual({
      text: "below cost",
      tone: "warn",
    });
  });
});

describe("the detail cells", () => {
  it("reads values and moves", () => {
    expect(valueText(true)).toBe("Yes");
    expect(valueText("9999-12-31")).toBe("open");
    expect(valueText("2026-10-23")).toBe("23-10-2026");
    expect(valueText(null)).toBe("—");
    expect(moveText(118, 119)).toEqual({ text: "+1  ▲0.8%", direction: 1 });
    expect(moveText(120, 76)).toEqual({ text: "−44  ▼36.7%", direction: -1 });
    expect(moveText("A", "B")).toEqual({ text: "changed", direction: 0 });
    expect(moveText(5, 5).text).toBe("");
  });
});
