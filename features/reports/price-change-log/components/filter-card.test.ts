import { describe, expect, it } from "vitest";
import {
  FILTER_SUMMARY_EMPTY,
  activeFilterParts,
  filterSummaryLine,
  filtersButtonText,
  type ScreenFilters,
} from "./filter-card";

const NONE: ScreenFilters = {
  from: "2026-10-26",
  to: "2026-10-26",
  branch: null,
  item: null,
  user: null,
  table: "BOTH",
  source: "",
  action: "",
};

describe("Filters popup summary (Qt refreshFilterSummary)", () => {
  it("says nothing is narrowed, and the button is plain", () => {
    expect(activeFilterParts(NONE)).toEqual([]);
    expect(filterSummaryLine([])).toBe(FILTER_SUMMARY_EMPTY);
    expect(filtersButtonText(0)).toBe("Filters…");
  });

  it("lists every narrowed filter and counts them on the button", () => {
    const parts = activeFilterParts({
      ...NONE,
      branch: { id: "b", text: "Coimbatore" },
      item: { id: "i", text: "Samsung H1" },
      table: "IPM",
      action: "UPDATE",
      user: { id: "u", text: "VKPOS" },
    });
    expect(parts).toEqual(["branch Coimbatore", "item Samsung H1", "prices only", "changed", "by VKPOS"]);
    expect(filterSummaryLine(parts)).toBe(
      "Showing: branch Coimbatore · item Samsung H1 · prices only · changed · by VKPOS",
    );
    expect(filtersButtonText(parts.length)).toBe("Filters (5)…");
  });
});
