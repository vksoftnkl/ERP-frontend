import { describe, expect, it } from "vitest";
import {
  itemPurchasePayload,
  itemPurchaseValuesFromSource,
  purchaseUnitChoices,
  validateItemPercent,
} from "./item-purchase-fields";

describe("item purchase fields (MST-03)", () => {
  it("reads /items/get: 0 % and ELIGIBLE are the defaults", () => {
    expect(
      itemPurchaseValuesFromSource({
        item_purchase_uom_id: "iuc2",
        item_min_shelf_life_pct: "60.00",
        item_itc_class: "BLOCKED_17_5",
        item_shortage_pct: 0,
      }),
    ).toEqual({
      item_purchase_uom_id: "iuc2",
      item_min_shelf_life_pct: "60",
      item_itc_class: "BLOCKED_17_5",
      item_shortage_pct: "",
    });
    expect(itemPurchaseValuesFromSource({ item_itc_class: "ELIGIBLE" }).item_itc_class).toBe("");
    expect(itemPurchaseValuesFromSource({}).item_purchase_uom_id).toBe("");
  });

  it("offers only the saved unit rows", () => {
    const choices = purchaseUnitChoices(
      [
        { iuc_id: "iuc1", iuc_unit_id: "PCS" },
        { iuc_id: "", iuc_unit_id: "BOX" },
        { iuc_id: "iuc2", iuc_unit_id: "DOZ" },
      ],
      (unitId) => ({ PCS: "Pieces", DOZ: "Dozen" })[unitId] ?? "",
    );
    expect(choices).toEqual([
      { value: "iuc1", label: "Pieces" },
      { value: "iuc2", label: "Dozen" },
    ]);
  });

  it("sends every key, null for the defaults and for a unit no longer in the grid", () => {
    expect(
      itemPurchasePayload(
        { item_purchase_uom_id: "iuc9", item_min_shelf_life_pct: "0", item_itc_class: "", item_shortage_pct: "0.5" },
        new Set(["iuc1"]),
      ),
    ).toEqual({
      item_purchase_uom_id: null,
      item_min_shelf_life_pct: null,
      item_itc_class: null,
      item_shortage_pct: 0.5,
    });
    expect(itemPurchasePayload({ item_purchase_uom_id: "iuc1", item_itc_class: "ineligible" }, new Set(["iuc1"]))).toMatchObject({
      item_purchase_uom_id: "iuc1",
      item_itc_class: "INELIGIBLE",
    });
  });

  it("refuses a percent outside 0–100", () => {
    expect(validateItemPercent("", "Min Shelf Life %")).toBeNull();
    expect(validateItemPercent("100", "Min Shelf Life %")).toBeNull();
    expect(validateItemPercent("120", "Normal Shortage %")).toMatch(/between 0 and 100/);
  });
});
