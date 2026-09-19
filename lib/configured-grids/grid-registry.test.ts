import { afterEach, describe, expect, it } from "vitest";
import {
  buildGridDeletedParam,
  CONFIGURED_GRIDS,
  findGridIdByName,
  getGridId,
  gridRunEndpoint,
  gridSupportsDeletedFilter,
  normalizeGridDirectoryPayload,
  primeGridDirectory,
  resetGridDirectoryForTests,
  resolveGridId,
} from "./grid-registry";

/** The shape `/configured-grid-sql/run?grid_id=34` answers with. */
const GRID_PAYLOAD = {
  success: true,
  data: {
    items: [
      { grid_id: "57", grid_name: "MAIN LIST - CUSTOMER STATES", grid_device_type: "Desktop", grid_status: true },
      { grid_id: "67", grid_name: "MAIN LIST - ITEMS", grid_device_type: "Desktop", grid_status: true },
      { grid_id: "83", grid_name: "TXN MAIN LIST - QUOTATION", grid_device_type: "Desktop", grid_status: true },
    ],
    meta: { page: 1, limit: 100, total: 3 },
  },
};

afterEach(() => {
  resetGridDirectoryForTests();
});

describe("normalizeGridDirectoryPayload", () => {
  it("reads the rows out of the grid runner's envelope", () => {
    expect(normalizeGridDirectoryPayload(GRID_PAYLOAD)).toEqual([
      { gridId: "57", gridName: "MAIN LIST - CUSTOMER STATES", deviceType: "Desktop", isActive: true },
      { gridId: "67", gridName: "MAIN LIST - ITEMS", deviceType: "Desktop", isActive: true },
      { gridId: "83", gridName: "TXN MAIN LIST - QUOTATION", deviceType: "Desktop", isActive: true },
    ]);
  });

  it("drops rows with no id or no name rather than inventing one", () => {
    expect(normalizeGridDirectoryPayload([{ grid_id: "9" }, { grid_name: "X" }, 3, null])).toEqual([]);
  });
});

describe("findGridIdByName", () => {
  const rows = normalizeGridDirectoryPayload(GRID_PAYLOAD);

  it("matches the whole name, ignoring case", () => {
    expect(findGridIdByName("main list - items", rows)).toBe("67");
  });

  it("does not match a name that merely contains it", () => {
    expect(findGridIdByName("MAIN LIST", rows)).toBeNull();
  });

  it("ignores a same-named grid kept under another device type", () => {
    // The `web` copies are exactly this case: same list, invisible in Grid Master.
    const withWebTwin = [
      { gridId: "84", gridName: "TXN MAIN LIST - QUOTATION", deviceType: "web", isActive: true },
      ...rows,
    ];
    expect(findGridIdByName("TXN MAIN LIST - QUOTATION", withWebTwin)).toBe("83");
  });
});

describe("getGridId", () => {
  it("answers with the registry's fallback until Grid Master's list arrives", () => {
    expect(getGridId("stateList")).toBe(CONFIGURED_GRIDS.stateList.fallbackId);
  });

  it("answers with Grid Master's own id once primed", () => {
    primeGridDirectory([
      { gridId: "204", gridName: "MAIN LIST - CUSTOMER STATES", deviceType: "Desktop", isActive: true },
    ]);
    expect(getGridId("stateList")).toBe("204");
    expect(resolveGridId("stateList", [])).toBe("204");
  });

  it("falls back again when the grid is gone from Grid Master", () => {
    primeGridDirectory([
      { gridId: "204", gridName: "MAIN LIST - CUSTOMER STATES", deviceType: "Desktop", isActive: true },
    ]);
    primeGridDirectory([]);
    expect(getGridId("stateList")).toBe(CONFIGURED_GRIDS.stateList.fallbackId);
  });
});

describe("the deleted-rows filter", () => {
  it("sends the token this grid's SQL binds, and the legacy name with it", () => {
    expect(buildGridDeletedParam("stateList", true)).toEqual({
      wantdelete: true,
      istm_is_deleted: true,
    });
  });

  it("sends only the legacy name for a grid that hardcodes the filter", () => {
    expect(buildGridDeletedParam("itemList", false)).toEqual({ wantdelete: false });
    expect(gridSupportsDeletedFilter("itemList")).toBe(false);
    expect(gridSupportsDeletedFilter("stateList")).toBe(true);
  });
});

describe("the registry itself", () => {
  it("names every list distinctly — a shared name would cross two screens", () => {
    const names = Object.values(CONFIGURED_GRIDS).map((grid) => grid.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("carries a usable fallback id for every list", () => {
    for (const [key, grid] of Object.entries(CONFIGURED_GRIDS)) {
      expect(grid.fallbackId, key).toMatch(/^\d+$/);
    }
  });

  it("builds the run url the master screens read", () => {
    expect(gridRunEndpoint("67")).toBe("/configured-grid-sql/run?grid_id=67");
  });
});
