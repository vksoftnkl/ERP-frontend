import { describe, expect, it } from "vitest";
import type { ItemQtyPricePayload } from "@/store/api/itemQtyPriceApi";
import type { EffectiveSetting } from "@/features/settings/app-settings/types";
import { resolveSlabHeaders } from "./item-qty-price.columns";
import type { ItemQtyPriceRow } from "./item-qty-price.types";
import {
  buildSavePayload,
  createBlankRow,
  defaultPriceLevelOf,
  describeSlabPreview,
  describeTodayLine,
  ensureTrailingRow,
  findDuplicateSlab,
  findSlabProblem,
  headlinePricesByUnit,
  isQtyPriceWorkWorthRemembering,
  isTrailingRow,
  itemQtyPriceHref,
  localTodayIso,
  locateSlabRefusal,
  mapPayloadToRow,
  normalizePriceMode,
  parseItemQtyPriceDeepLink,
  priceLevelInfoById,
  priceModeLabel,
  slabsOverlap,
  type UnitPricesToday,
} from "./item-qty-price.utils";

const ITEM = { id: "item-1", label: "Bill Item" };
const BOX = "iuc-box";
const PCS = "iuc-pcs";
const TODAY = "2026-10-23";

function slab(overrides: Partial<ItemQtyPriceRow> = {}): ItemQtyPriceRow {
  return {
    ...createBlankRow(ITEM),
    itemUnitId: BOX,
    unitLabel: "BOX",
    fromQty: "1",
    toQty: "10",
    value: "5",
    effectiveFrom: "2026-11-01",
    isDirty: true,
    ...overrides,
  };
}

function payload(overrides: Partial<ItemQtyPricePayload> = {}): ItemQtyPricePayload {
  return {
    iqp_id: "iqp-1",
    iqp_item_id: ITEM.id,
    iqp_item_unit_id: BOX,
    iqp_company_id: null,
    iqp_branch_id: null,
    iqp_party_id: null,
    iqp_price_level: null,
    iqp_from_qty: 10,
    iqp_to_qty: null,
    iqp_price_mode: "R",
    iqp_disc_pct: null,
    iqp_flat_off: 2.5,
    iqp_price: null,
    iqp_is_tax_incl: false,
    iqp_effective_from: "2026-11-01T00:00:00.000Z",
    iqp_effective_to: null,
    iqp_is_active: true,
    iqp_is_deleted: false,
    iqp_created_on: "",
    iqp_created_by: null,
    iqp_modified_on: "",
    iqp_modified_by: null,
    iqp_item_name: "Bill Item",
    iqp_unit_name: "BOX",
    iqp_company_name: null,
    iqp_branch_name: null,
    iqp_price_level_name: null,
    iqp_party_name: null,
    ...overrides,
  };
}

describe("modes", () => {
  it("reads the operator's labels and the server's letters, old Q as R", () => {
    expect(priceModeLabel("P")).toBe("% off");
    expect(priceModeLabel("R")).toBe("₹ off");
    expect(priceModeLabel("F")).toBe("Fixed price");
    expect(normalizePriceMode("Q")).toBe("R");
    expect(normalizePriceMode("f")).toBe("F");
    expect(normalizePriceMode(null)).toBe("P");
  });
});

describe("value column", () => {
  it("loads the mode's own figure as the Value, and an open To as blank", () => {
    const row = mapPayloadToRow(payload());
    expect(row).toMatchObject({ priceMode: "R", value: "2.5", toQty: "", fromQty: "10" });
    expect(row.effectiveFrom).toBe("2026-11-01");
    expect(mapPayloadToRow(payload({ iqp_price_mode: "F", iqp_price: 88, iqp_flat_off: 3 })).value).toBe(
      "88",
    );
    expect(mapPayloadToRow(payload({ iqp_flat_off: null })).value).toBe("");
  });

  it("saves the Value into the mode's field only — the other two null, never 0", () => {
    const sent = buildSavePayload(slab({ priceMode: "F", value: "88" }), "ZT", TODAY);
    expect(sent).toMatchObject({ iqp_price_mode: "F", iqp_price: 88, iqp_disc_pct: null, iqp_flat_off: null });
    const pct = buildSavePayload(slab({ priceMode: "P", value: "5" }), "ZT", TODAY);
    expect(pct).toMatchObject({ iqp_disc_pct: 5, iqp_flat_off: null, iqp_price: null });
  });

  it("sends scope as null, an open To as null and a blank From date as today", () => {
    const sent = buildSavePayload(slab({ toQty: "", effectiveFrom: "", effectiveTo: "" }), null, TODAY);
    expect(sent).toMatchObject({
      iqp_company_id: null,
      iqp_price_level: null,
      iqp_to_qty: null,
      iqp_effective_from: TODAY,
      iqp_effective_to: null,
    });
    expect(sent).not.toHaveProperty("iqp_created_by");
    expect(buildSavePayload(slab({ toQty: "0" }), null, TODAY).iqp_to_qty).toBeNull();
    expect(buildSavePayload(slab({ iqpId: "iqp-1" }), "ZT", TODAY)).toMatchObject({
      iqp_id: "iqp-1",
      iqp_modified_by: "ZT",
    });
  });
});

describe("the trailing blank line", () => {
  it("is added once the last row has a unit, and is the only line without one", () => {
    const rows = ensureTrailingRow([slab()], ITEM);
    expect(rows).toHaveLength(2);
    expect(isTrailingRow(rows, rows[1].localId)).toBe(true);
    expect(isTrailingRow(rows, rows[0].localId)).toBe(false);
    expect(ensureTrailingRow(rows, ITEM)).toBe(rows);
    expect(ensureTrailingRow([], null)).toEqual([]);
  });
});

describe("uniqueness", () => {
  it("matches the whole scope, the unit and the range to two places", () => {
    const rows = [slab(), slab({ value: "6" }), slab({ toQty: "20" })];
    expect(findDuplicateSlab(rows, 1)).toBe(0);
    expect(findDuplicateSlab(rows, 2)).toBe(-1);
    expect(findDuplicateSlab([slab(), slab({ priceLevel: "2" })], 1)).toBe(-1);
    expect(findDuplicateSlab([slab({ fromQty: "1.001" }), slab()], 1)).toBe(0);
  });
});

describe("overlap (server notes 139 A4)", () => {
  it("refuses a shared qty on a shared date in one unit and scope", () => {
    expect(slabsOverlap(slab({ fromQty: "1", toQty: "10" }), slab({ fromQty: "5", toQty: "15" }), TODAY)).toBe(
      true,
    );
    // [from, to): a ladder that meets at 10 does not overlap.
    expect(slabsOverlap(slab({ fromQty: "1", toQty: "10" }), slab({ fromQty: "10", toQty: "" }), TODAY)).toBe(
      false,
    );
    // "& above" runs on.
    expect(slabsOverlap(slab({ fromQty: "951", toQty: "" }), slab({ fromQty: "2000", toQty: "3000" }), TODAY)).toBe(
      true,
    );
  });

  it("is judged per unit and scope, and on dates inclusive with open ends", () => {
    const base = slab({ fromQty: "1", toQty: "10" });
    expect(slabsOverlap(base, slab({ itemUnitId: PCS }), TODAY)).toBe(false);
    expect(slabsOverlap(base, slab({ branchId: "br-1" }), TODAY)).toBe(false);
    const november = slab({ effectiveFrom: "2026-11-01", effectiveTo: "2026-11-30" });
    expect(slabsOverlap(november, slab({ effectiveFrom: "2026-12-01" }), TODAY)).toBe(false);
    expect(slabsOverlap(november, slab({ effectiveFrom: "2026-11-30" }), TODAY)).toBe(true);
    // A blank From date is today's.
    expect(slabsOverlap(slab({ effectiveFrom: "", effectiveTo: "2026-10-30" }), november, TODAY)).toBe(false);
    // Inactive slabs count too.
    expect(slabsOverlap(base, slab({ fromQty: "5", toQty: "8", isActive: false }), TODAY)).toBe(true);
  });
});

describe("save-time validation", () => {
  const units = [BOX];

  it("speaks Qt's words, row by row in Qt's order", () => {
    expect(findSlabProblem([createBlankRow(ITEM)], units, TODAY)?.message).toBe(
      "Add at least one pricing row with a valid unit.",
    );
    expect(findSlabProblem([slab({ itemUnitId: "iuc-other" })], units, TODAY)).toMatchObject({
      cell: "unit",
      message: "Row 1's unit must be one of this item's units.",
    });
    expect(findSlabProblem([slab({ fromQty: "" })], units, TODAY)?.message).toBe(
      "Row 1's From Qty is required.",
    );
    expect(findSlabProblem([slab({ value: "" })], units, TODAY)).toMatchObject({
      cell: "value",
      message: "Slab 1 needs its mode and value (% off, ₹ off or a fixed price).",
    });
    const rows = [slab(), slab({ value: "6" })];
    expect(findSlabProblem(rows, units, TODAY)).toMatchObject({
      localId: rows[1].localId,
      cell: "unit",
      message: "Row 2's Company/Branch/Customer/Price Level/Unit/Qty range is already added.",
    });
  });

  it("skips the blank line and waits for the unit list before judging units", () => {
    expect(findSlabProblem([slab(), createBlankRow(ITEM)], units, TODAY)).toBeNull();
    expect(findSlabProblem([slab({ itemUnitId: "iuc-other" })], [], TODAY)).toBeNull();
  });

  it("refuses what the server refuses, on the row", () => {
    expect(findSlabProblem([slab({ fromQty: "5", toQty: "5" })], units, TODAY)?.cell).toBe("toQty");
    expect(findSlabProblem([slab({ value: "150" })], units, TODAY)?.message).toBe(
      "Row 1's % off cannot be more than 100.",
    );
    expect(findSlabProblem([slab({ priceMode: "F", value: "150" })], units, TODAY)).toBeNull();
    expect(
      findSlabProblem([slab({ effectiveFrom: "2026-11-02", effectiveTo: "2026-11-01" })], units, TODAY)?.cell,
    ).toBe("effectiveTo");
    const rows = [slab({ fromQty: "100", toQty: "110" }), slab({ fromQty: "105", toQty: "120" })];
    expect(findSlabProblem(rows, units, TODAY)).toMatchObject({
      localId: rows[1].localId,
      cell: "fromQty",
    });
    expect(findSlabProblem(rows, units, TODAY)?.message).toContain("overlaps row 1 (100–110)");
  });

  it("passes the screen test's ladder: 777–787, 900–950, 951 & above", () => {
    const rows = [
      slab({ fromQty: "777", toQty: "787" }),
      slab({ fromQty: "951", toQty: "", priceMode: "R", value: "2.5" }),
      slab({ fromQty: "900", toQty: "950", priceMode: "F", value: "88" }),
      createBlankRow(ITEM),
    ];
    expect(findSlabProblem(rows, units, TODAY)).toBeNull();
  });
});

describe("server refusals", () => {
  it("finds the batch row and the cell a refused field names", () => {
    expect(locateSlabRefusal("1.iqp_from_qty", 3)).toEqual({ index: 1, cell: "fromQty" });
    expect(locateSlabRefusal("items.2.iqp_disc_pct", 3)).toEqual({ index: 2, cell: "value" });
    expect(locateSlabRefusal("iqp_price", 1)).toEqual({ index: 0, cell: "value" });
    expect(locateSlabRefusal("iqp_item_unit_id", 2)).toEqual({ index: null, cell: "unit" });
    expect(locateSlabRefusal("iqp_item_id", 1)).toEqual({ index: 0, cell: null });
    expect(locateSlabRefusal("7.iqp_from_qty", 3).index).toBeNull();
  });
});

describe("today's prices and the preview", () => {
  const levels = priceLevelInfoById([
    { priceLvlId: 1, priceLvlShort: "WS", priceLvlIsActive: true },
    { priceLvlId: 2, priceLvlShort: "RET", priceLvlIsActive: true },
    { priceLvlId: 3, priceLvlShort: "SPL", priceLvlIsActive: false },
  ]);
  const prices: UnitPricesToday = { levels: { 1: 105, 2: 110, 3: 99 }, maxPrice: 150 };

  it("keeps the headline row per unit, not a bucket's", () => {
    const byUnit = headlinePricesByUnit([
      { uomId: BOX, mrp: 150, salePrice: null, maxPrice: 150, levels: [{ level: 1, price: 1 }] },
      { uomId: BOX, mrp: null, salePrice: null, maxPrice: 150, levels: [{ level: 1, price: 105 }] },
      { uomId: BOX, mrp: null, salePrice: null, maxPrice: 1, levels: [] },
    ]);
    expect(byUnit[BOX]).toEqual({ levels: { 1: 105 }, maxPrice: 150 });
  });

  it("reads the levels and MRP today, leaving out a level not switched on", () => {
    expect(describeTodayLine({ hasItem: false, prices: null, unitName: "", levels })).toBe(
      "Pick an item to see its prices today.",
    );
    expect(describeTodayLine({ hasItem: true, prices: null, unitName: "BOX", levels })).toBe(
      "No price at this branch yet for BOX.",
    );
    expect(describeTodayLine({ hasItem: true, prices, unitName: "BOX", levels })).toBe(
      "Today (BOX): WS ₹105.00 · RET ₹110.00 · MRP ₹150.00",
    );
  });

  it("works each mode out from the slab's level, else the house default", () => {
    const at = (row: ItemQtyPriceRow, defaultLevel = 1) =>
      describeSlabPreview({ hasItem: true, row, unitName: "BOX", prices, levels, defaultLevel });
    expect(at(slab({ fromQty: "10", toQty: "20", value: "5" }))).toEqual({
      kind: "slab",
      lead: "Buy 10–20 BOX at WS: 5% off",
      each: "₹99.75",
      today: "₹105.00",
      dearer: false,
      inactive: false,
    });
    expect(at(slab({ fromQty: "951", toQty: "", priceMode: "R", value: "2.5", priceLevel: "2" }))).toMatchObject({
      lead: "Buy 951 or more BOX at RET: ₹2.50 off",
      each: "₹107.50",
    });
    expect(at(slab({ priceMode: "F", value: "120", isActive: false }), 2)).toMatchObject({
      lead: "Buy 1–10 BOX at RET: fixed ₹120.00",
      each: "₹120.00",
      dearer: true,
      inactive: true,
    });
    expect(at(slab({ value: "" }))).toEqual({ kind: "hint", text: "Buy 1–10 BOX: choose the mode and its value." });
    // No price at that level: a fixed price still reads, a discount has nothing to work from.
    expect(at(slab({ priceLevel: "4" }))).toMatchObject({ each: null, today: null });
    expect(at(slab({ priceLevel: "4", priceMode: "F", value: "9" }))).toMatchObject({ each: "₹9.00", today: null });
  });

  it("hints what to do when there is no slab under the cursor", () => {
    const hint = (hasItem: boolean) =>
      describeSlabPreview({ hasItem, row: null, unitName: "", prices: null, levels, defaultLevel: 1 });
    expect(hint(false)).toEqual({
      kind: "hint",
      text: "Each slab: buy this many, get this price. Pick an item, then add slabs.",
    });
    expect(hint(true)).toMatchObject({ text: expect.stringContaining("+ adds a slab") });
  });

  it("previews at the house price level, bounded to 1..4", () => {
    const setting = (value: string | null) =>
      [{ asdKey: "sales.default_price_level", value, asdDefaultValue: "1" }] as unknown as EffectiveSetting[];
    expect(defaultPriceLevelOf(undefined)).toBe(1);
    expect(defaultPriceLevelOf(setting("3"))).toBe(3);
    expect(defaultPriceLevelOf(setting("7"))).toBe(4);
    expect(defaultPriceLevelOf(setting(null))).toBe(1);
  });
});

describe("deep link", () => {
  it("round-trips the item the Item Master list opens", () => {
    const href = itemQtyPriceHref("01a0-item", "BILL ITEM & CO");
    expect(href).toBe("/master/item-qty-price-master?itemId=01a0-item&itemName=BILL+ITEM+%26+CO");
    const params = new URLSearchParams(href.split("?")[1]);
    expect(parseItemQtyPriceDeepLink(params)).toEqual({ itemId: "01a0-item", itemName: "BILL ITEM & CO" });
    expect(parseItemQtyPriceDeepLink(new URLSearchParams("itemName=x"))).toBeNull();
    expect(parseItemQtyPriceDeepLink(null)).toBeNull();
  });
});

describe("slab grid headings", () => {
  it("takes Uom / From / To from the layout and fixes Mode and Value", () => {
    const headers = resolveSlabHeaders([
      { uiTblClmName: "item_unit_id", uiTblClmColumnPosition: 22, uiTblClmColumnVisibility: true, uiTblClmColumnWidth: null },
      { uiTblClmName: "UOM ", uiTblClmColumnPosition: 5, uiTblClmColumnVisibility: true, uiTblClmColumnWidth: null },
      { uiTblClmName: "To qty", uiTblClmColumnPosition: 7, uiTblClmColumnVisibility: false, uiTblClmColumnWidth: null },
      { uiTblClmName: "Mode", uiTblClmColumnPosition: 8, uiTblClmColumnVisibility: true, uiTblClmColumnWidth: null },
      { uiTblClmName: "Disc %", uiTblClmColumnPosition: 9, uiTblClmColumnVisibility: true, uiTblClmColumnWidth: null },
    ]);
    expect(headers).toEqual({ unit: "UOM", fromQty: "From Qty", toQty: "To qty", mode: "Mode", value: "Value" });
    // The id echo alone keeps the default heading.
    expect(
      resolveSlabHeaders([
        { uiTblClmName: "item_unit_id", uiTblClmColumnPosition: 1, uiTblClmColumnVisibility: true, uiTblClmColumnWidth: null },
      ]).unit,
    ).toBe("Uom");
    expect(resolveSlabHeaders(undefined).unit).toBe("Uom");
  });
});

describe("screen memory", () => {
  it("keeps the grid only while a row holds an unsaved edit", () => {
    expect(isQtyPriceWorkWorthRemembering({ rows: [] })).toBe(false);
    const saved = { ...slab(), iqpId: "iqp-1", isDirty: false };
    expect(isQtyPriceWorkWorthRemembering({ rows: [saved, createBlankRow(ITEM)] })).toBe(false);
    expect(isQtyPriceWorkWorthRemembering({ rows: [{ ...saved, value: "9", isDirty: true }] })).toBe(true);
  });

  it("dates a new slab by the local calendar", () => {
    expect(localTodayIso(new Date(2026, 0, 5, 1, 30))).toBe("2026-01-05");
  });
});
