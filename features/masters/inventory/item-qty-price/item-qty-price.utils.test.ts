import { describe, expect, it } from "vitest";
import { createBlankRow, isQtyPriceWorkWorthRemembering } from "./item-qty-price.utils";

const ITEM = { id: "item-1", label: "Widget" };

describe("screen memory", () => {
  it("keeps the grid only while a row holds an unsaved edit", () => {
    expect(isQtyPriceWorkWorthRemembering({ rows: [] })).toBe(false);
    // A fresh screen, and an item just loaded: saved rows plus the pristine
    // entry row (even one a barcode pre-filled the unit on).
    expect(isQtyPriceWorkWorthRemembering({ rows: [createBlankRow()] })).toBe(false);
    const saved = { ...createBlankRow(ITEM), iqpId: "iqp-1", isNew: false };
    const scanned = { ...createBlankRow(ITEM), itemUnitId: "unit-1", unitLabel: "PCS" };
    expect(isQtyPriceWorkWorthRemembering({ rows: [saved, scanned] })).toBe(false);
    // An edit to a saved row, or a new row typed into.
    expect(
      isQtyPriceWorkWorthRemembering({ rows: [{ ...saved, price: "9", isDirty: true }, scanned] }),
    ).toBe(true);
    expect(
      isQtyPriceWorkWorthRemembering({ rows: [saved, { ...scanned, discPct: "5", isDirty: true }] }),
    ).toBe(true);
  });
});
