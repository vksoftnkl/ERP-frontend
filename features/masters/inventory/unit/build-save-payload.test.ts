import { describe, expect, it } from "vitest";
import { buildUnitSavePayload, toClearableNumber } from "./build-save-payload";

const FILLED = {
  unitName: " Box ",
  unitAlias: "",
  unitCode: "BOX",
  unitDescription: "",
  unitDecimalCount: "2",
  unitWeight: "1.5",
  unitLoading: "10",
  unitUnloading: "5",
  unitAttachCharge: "2",
  unitIsPackUnit: "true",
  unitBaseUnitId: "unit-nos",
  unitConversion: "12",
  unitIsActive: "true",
};

describe("toClearableNumber", () => {
  it("sends a cleared box as null, a number as a number", () => {
    expect(toClearableNumber("")).toBeNull();
    expect(toClearableNumber("   ")).toBeNull();
    expect(toClearableNumber(undefined)).toBeNull();
    expect(toClearableNumber("0")).toBe(0);
    expect(toClearableNumber(" 2.5 ")).toBe(2.5);
  });
});

describe("buildUnitSavePayload", () => {
  it("carries every clearable box as a number when filled", () => {
    const payload = buildUnitSavePayload({ values: FILLED, shouldUpdate: true, editingItemId: "unit-1" });
    expect(payload).toMatchObject({
      unit_id: "unit-1",
      unit_name: "Box",
      unit_weight: 1.5,
      unit_loading: 10,
      unit_unloading: 5,
      unit_attach_charge: 2,
      unit_base_unit_id: "unit-nos",
      unit_conversion: 12,
    });
  });

  it("sends cleared boxes as null — present, so the server clears them", () => {
    const payload = buildUnitSavePayload({
      values: { ...FILLED, unitWeight: "", unitLoading: "", unitUnloading: " ", unitAttachCharge: "", unitConversion: "" },
      shouldUpdate: true,
      editingItemId: "unit-1",
    });
    for (const key of ["unit_weight", "unit_loading", "unit_unloading", "unit_attach_charge", "unit_conversion"] as const) {
      expect(payload).toHaveProperty(key, null);
    }
  });

  it("drops base unit and conversion once Pack Unit is unticked, whatever the hidden boxes hold", () => {
    const payload = buildUnitSavePayload({
      values: { ...FILLED, unitIsPackUnit: "false" },
      shouldUpdate: false,
      editingItemId: null,
    });
    expect(payload.unit_id).toBe("");
    expect(payload.unit_is_pack_unit).toBe(false);
    expect(payload.unit_base_unit_id).toBeNull();
    expect(payload.unit_conversion).toBeNull();
  });
});
