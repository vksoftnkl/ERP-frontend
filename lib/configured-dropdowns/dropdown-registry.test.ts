import { afterEach, describe, expect, it } from "vitest";
import {
  CONFIGURED_DROPDOWNS,
  findDropdownIdByName,
  getDropdownId,
  normalizeDropdownDirectoryPayload,
  primeDropdownDirectory,
  resetDropdownDirectoryForTests,
  resolveDropdownId,
} from "./dropdown-registry";

/** The shape `/configured-grid-sql/run?grid_id=43` answers with. */
const DIRECTORY_PAYLOAD = {
  success: true,
  data: {
    items: [
      { dropdown_id: 22, dropdown_name: "COMPANYS", dropdown_device_type: "Desktop" },
      { dropdown_id: 32, dropdown_name: "BRANCHES", dropdown_device_type: "Desktop" },
      { dropdown_id: 42, dropdown_name: "ITEMS", dropdown_device_type: "Desktop" },
    ],
    meta: { page: 1, limit: 100, total: 3 },
  },
};

afterEach(() => {
  resetDropdownDirectoryForTests();
});

describe("normalizeDropdownDirectoryPayload", () => {
  it("reads the rows out of the grid runner's envelope, ids as text", () => {
    expect(normalizeDropdownDirectoryPayload(DIRECTORY_PAYLOAD)).toEqual([
      { dropdownId: "22", dropdownName: "COMPANYS", deviceType: "Desktop" },
      { dropdownId: "32", dropdownName: "BRANCHES", deviceType: "Desktop" },
      { dropdownId: "42", dropdownName: "ITEMS", deviceType: "Desktop" },
    ]);
  });

  it("drops rows with no id or no name rather than inventing one", () => {
    expect(normalizeDropdownDirectoryPayload([{ dropdown_id: "9" }, { dropdown_name: "X" }])).toEqual([]);
  });
});

describe("findDropdownIdByName", () => {
  const rows = normalizeDropdownDirectoryPayload(DIRECTORY_PAYLOAD);

  it("matches the whole name, ignoring case", () => {
    expect(findDropdownIdByName("companys", rows)).toBe("22");
  });

  it("does not match a name that merely contains it", () => {
    // "ITEMS" must never answer for "ITEM UNITS" or "ITEM GROUPS".
    expect(findDropdownIdByName("ITEM", rows)).toBeNull();
    expect(findDropdownIdByName("ITEM UNITS", rows)).toBeNull();
  });

  it("ignores a same-named dropdown kept under another device type", () => {
    // Exactly the PRINT PURPOSES case: a Web row beside the Desktop one.
    const withWebTwin = [
      { dropdownId: "8", dropdownName: "COMPANYS", deviceType: "Web" },
      ...rows,
    ];
    expect(findDropdownIdByName("COMPANYS", withWebTwin)).toBe("22");
  });
});

describe("getDropdownId", () => {
  it("answers with the registry's fallback until Dropdown Master's list arrives", () => {
    expect(getDropdownId("company")).toBe(CONFIGURED_DROPDOWNS.company.fallbackId);
  });

  it("answers with Dropdown Master's own id once primed", () => {
    primeDropdownDirectory([
      { dropdownId: "140", dropdownName: "COMPANYS", deviceType: "Desktop" },
    ]);
    expect(getDropdownId("company")).toBe("140");
    expect(resolveDropdownId("company", [])).toBe("140");
  });

  it("falls back again when the dropdown is gone from Dropdown Master", () => {
    primeDropdownDirectory([
      { dropdownId: "140", dropdownName: "COMPANYS", deviceType: "Desktop" },
    ]);
    primeDropdownDirectory([]);
    expect(getDropdownId("company")).toBe(CONFIGURED_DROPDOWNS.company.fallbackId);
  });
});

describe("the registry itself", () => {
  it("names every dropdown distinctly — a shared name would cross two fields", () => {
    const names = Object.values(CONFIGURED_DROPDOWNS).map((entry) => entry.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("carries a usable fallback id for every dropdown", () => {
    for (const [key, entry] of Object.entries(CONFIGURED_DROPDOWNS)) {
      expect(entry.fallbackId, key).toMatch(/^\d+$/);
    }
  });

  it("marks the dropdowns whose SQL binds a parameter", () => {
    // These 400 unless the caller sends dropdown_param — a property of the
    // dropdown, so it is recorded with the name rather than in each screen.
    expect(CONFIGURED_DROPDOWNS.employee.paramBound).toBe(true);
    expect(CONFIGURED_DROPDOWNS.ledgerForPostingRole.paramBound).toBe(true);
    expect(CONFIGURED_DROPDOWNS.company.paramBound).toBe(false);
  });
});
