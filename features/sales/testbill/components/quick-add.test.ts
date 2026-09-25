import { describe, expect, it } from "vitest";
import { quickAddViolation } from "./customer-quick-add";

const ok = { name: "ACME", gstin: "", gstType: "UNREGISTERED", areaId: "a", groupId: "g", stateCode: "33" };

describe("quick add (§7.7)", () => {
  it("needs a name, an area, a group and a state", () => {
    expect(quickAddViolation({ ...ok, name: " " })).toMatch(/name/);
    expect(quickAddViolation({ ...ok, areaId: "" })).toMatch(/area/);
    expect(quickAddViolation({ ...ok, groupId: "" })).toMatch(/group/);
    expect(quickAddViolation({ ...ok, stateCode: "" })).toMatch(/state/);
    expect(quickAddViolation(ok)).toBeNull();
  });

  it("an unregistered customer has no GSTIN; a registered one needs a valid one starting with the state code", () => {
    expect(quickAddViolation({ ...ok, gstin: "33AAAAA9999A1Z5" })).toMatch(/unregistered/i);
    expect(quickAddViolation({ ...ok, gstType: "REGULAR", gstin: "" })).toMatch(/valid 15-character/);
    expect(quickAddViolation({ ...ok, gstType: "REGULAR", gstin: "29AAAAA9999A1Z5" })).toMatch(/state code 33/);
    expect(quickAddViolation({ ...ok, gstType: "REGULAR", gstin: "33AAAAA9999A1Z5" })).toBeNull();
    expect(quickAddViolation({ ...ok, gstType: "COMPOSITION", gstin: "33aaaaa9999a1z5" })).toBeNull();
  });
});
