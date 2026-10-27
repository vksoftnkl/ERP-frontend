import { describe, expect, it } from "vitest";
import { GRID_POPUP_KEY_HINT, gridPopupTitle } from "./grid-popup-bits";

describe("grid popup title", () => {
  it("defaults to Select <column heading>", () => {
    expect(gridPopupTitle(undefined, "Description")).toBe("Select Description");
    expect(gridPopupTitle("  ", " Supplier ")).toBe("Select Supplier");
  });
  it("an explicit title wins", () => {
    expect(gridPopupTitle("Pick the item", "Description")).toBe("Pick the item");
  });
  it("never leaves the popup untitled", () => {
    expect(gridPopupTitle(undefined, undefined)).toBe("Select");
  });
  it("carries the key hint", () => {
    expect(GRID_POPUP_KEY_HINT).toBe("type to search · ↑↓ · Enter picks · Esc closes");
  });
});
