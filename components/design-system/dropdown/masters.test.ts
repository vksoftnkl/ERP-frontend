import { afterEach, describe, expect, it } from "vitest";
import {
  clearDropdownMasters,
  getDropdownMaster,
  registerDropdownMaster,
  unregisterDropdownMaster,
} from "./masters";

const registration = { menuId: 10, render: () => null };

afterEach(() => {
  clearDropdownMasters();
});

describe("the dropdown master registry", () => {
  it("returns null for an unregistered dropdown — which is not an error", () => {
    expect(getDropdownMaster("39")).toBeNull();
  });

  it("registers and resolves by id", () => {
    registerDropdownMaster(39, registration);
    expect(getDropdownMaster("39")).toBe(registration);
  });

  it("treats the numeric and string forms of an id as the same dropdown", () => {
    registerDropdownMaster(39, registration);
    expect(getDropdownMaster(39)).toBe(registration);
    expect(getDropdownMaster(" 39 ")).toBe(registration);
  });

  it("lets a later registration replace an earlier one", () => {
    const replacement = { menuId: 21, render: () => null };
    registerDropdownMaster(39, registration);
    registerDropdownMaster(39, replacement);
    expect(getDropdownMaster(39)).toBe(replacement);
  });

  it("ignores an empty id rather than registering under a blank key", () => {
    registerDropdownMaster("  ", registration);
    expect(getDropdownMaster("")).toBeNull();
  });

  it("unregisters", () => {
    registerDropdownMaster(39, registration);
    unregisterDropdownMaster(39);
    expect(getDropdownMaster(39)).toBeNull();
  });
});
