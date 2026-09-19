import { afterEach, describe, expect, it } from "vitest";
import {
  findUiTableIdByName,
  getUiTableId,
  normalizeUiTableDirectoryPayload,
  primeUiTableDirectory,
  resetUiTableDirectoryForTests,
  resolveUiTableId,
  UI_TABLES,
} from "./ui-table-registry";

/** The shape `/configured-grid-sql/run?grid_id=35` answers with. */
const GRID_PAYLOAD = {
  success: true,
  message: "Grid data fetched successfully",
  data: {
    items: [
      { ui_tbl_id: "17", ui_tbl_name: "ITEM MASTER - PRICE", ui_tbl_is_active: true, ui_tbl_device_type: "Desktop" },
      { ui_tbl_id: "18", ui_tbl_name: "QUOTATION - LINES", ui_tbl_is_active: true, ui_tbl_device_type: "Desktop" },
      { ui_tbl_id: "21", ui_tbl_name: "CHARGES", ui_tbl_is_active: true, ui_tbl_device_type: "Desktop" },
    ],
    meta: { page: 1, limit: 100, total: 3 },
  },
};

afterEach(() => {
  resetUiTableDirectoryForTests();
});

describe("normalizeUiTableDirectoryPayload", () => {
  it("reads the rows out of the grid runner's envelope", () => {
    expect(normalizeUiTableDirectoryPayload(GRID_PAYLOAD)).toEqual([
      { uiTblId: "17", uiTblName: "ITEM MASTER - PRICE", deviceType: "Desktop", isActive: true },
      { uiTblId: "18", uiTblName: "QUOTATION - LINES", deviceType: "Desktop", isActive: true },
      { uiTblId: "21", uiTblName: "CHARGES", deviceType: "Desktop", isActive: true },
    ]);
  });

  it("reads camelCase rows and a bare array just the same", () => {
    const rows = normalizeUiTableDirectoryPayload([
      { uiTblId: 21, uiTblName: "CHARGES", uiTblDeviceType: "Desktop" },
    ]);
    // A list that does not report the active flag is a list of live tables.
    expect(rows).toEqual([
      { uiTblId: "21", uiTblName: "CHARGES", deviceType: "Desktop", isActive: true },
    ]);
  });

  it("drops rows with no id or no name rather than inventing one", () => {
    expect(
      normalizeUiTableDirectoryPayload([{ ui_tbl_id: "9" }, { ui_tbl_name: "CHARGES" }, 7, null]),
    ).toEqual([]);
  });
});

describe("findUiTableIdByName", () => {
  const rows = normalizeUiTableDirectoryPayload(GRID_PAYLOAD);

  it("matches the whole name, ignoring case", () => {
    expect(findUiTableIdByName("charges", rows)).toBe("21");
  });

  it("does not match a name that merely contains it", () => {
    // "ITEM MASTER - PRICE" must never answer for "ITEM QTY WISE PRICE".
    expect(findUiTableIdByName("PRICE", rows)).toBeNull();
    expect(findUiTableIdByName("ITEM QTY WISE PRICE", rows)).toBeNull();
  });

  it("ignores a same-named row kept under another device type", () => {
    const withWebTwin = [
      { uiTblId: "26", uiTblName: "CHARGES", deviceType: "Web", isActive: true },
      ...rows,
    ];
    expect(findUiTableIdByName("CHARGES", withWebTwin)).toBe("21");
  });

  it("prefers a live table over an inactive one of the same name", () => {
    const withInactiveTwin = [
      { uiTblId: "3", uiTblName: "CHARGES", deviceType: "Desktop", isActive: false },
      ...rows,
    ];
    expect(findUiTableIdByName("CHARGES", withInactiveTwin)).toBe("21");
  });
});

describe("getUiTableId", () => {
  it("answers with the registry's fallback until the master's list arrives", () => {
    expect(getUiTableId("openingStockLines")).toBe(UI_TABLES.openingStockLines.fallbackId);
  });

  it("answers with the master's own id once primed", () => {
    primeUiTableDirectory([
      { uiTblId: "104", uiTblName: "OPENING STOCK - LINES", deviceType: "Desktop", isActive: true },
    ]);
    expect(getUiTableId("openingStockLines")).toBe("104");
  });

  it("falls back again when the table is gone from the master", () => {
    primeUiTableDirectory([
      { uiTblId: "104", uiTblName: "OPENING STOCK - LINES", deviceType: "Desktop", isActive: true },
    ]);
    primeUiTableDirectory([
      { uiTblId: "21", uiTblName: "CHARGES", deviceType: "Desktop", isActive: true },
    ]);
    expect(getUiTableId("openingStockLines")).toBe(UI_TABLES.openingStockLines.fallbackId);
  });
});

describe("resolveUiTableId", () => {
  it("reads the rows it is handed before anything it remembers", () => {
    primeUiTableDirectory([
      { uiTblId: "104", uiTblName: "CHARGES", deviceType: "Desktop", isActive: true },
    ]);
    const rows = normalizeUiTableDirectoryPayload(GRID_PAYLOAD);
    expect(resolveUiTableId("charges", rows)).toBe("21");
  });

  it("falls back to what it remembers when the rows have no such table", () => {
    primeUiTableDirectory([
      { uiTblId: "104", uiTblName: "CHARGES", deviceType: "Desktop", isActive: true },
    ]);
    expect(resolveUiTableId("charges", [])).toBe("104");
  });
});

describe("the registry itself", () => {
  it("names every grid distinctly — a shared name would cross two screens' layouts", () => {
    const names = Object.values(UI_TABLES).map((table) => table.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("carries a usable fallback id for every grid", () => {
    for (const [key, table] of Object.entries(UI_TABLES)) {
      expect(table.fallbackId, key).toMatch(/^\d+$/);
    }
  });
});
