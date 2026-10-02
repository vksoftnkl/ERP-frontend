/**
 * The F8 filter (Qt `SellingPriceFilterDialog::State`), the grid query it
 * becomes (`ApiEndpoints::SellingPriceBulk::grid`), the one setting the screen
 * reads, and the HQ test that greys All branches.
 */
import { describe, expect, it } from "vitest";
import { isHqUserType } from "./selling-price.constants";
import {
  emptyFilterState,
  emptyFilters,
  filterStateFrom,
  filterSummary,
  gridQuery,
  isFilterEmpty,
  itemOnlyFilters,
  picksOf,
  type FilterState,
} from "./selling-price.filter";
import { parseBelowCostPolicy, parseSellingPriceSettings } from "./selling-price.settings";
import type { EffectiveSetting } from "@/features/settings/app-settings/types";

describe("filterSummary", () => {
  it("says Active items only when nothing is set", () => {
    expect(filterSummary(emptyFilterState())).toBe("Active items only");
  });

  it("lists the search and the picked names in the dialog's order", () => {
    const state: FilterState = {
      filters: { ...emptyFilters(), search: "  salt ", taxId: "t", groupId: "g", trackPresetId: "p", activeOnly: false },
      texts: { tax: "GST 18%", group: "Snacks", preset: "MRP + batch" },
    };
    expect(filterSummary(state)).toBe(
      "Contains “salt”  ·  Group: Snacks  ·  Tracked as: MRP + batch  ·  Tax: GST 18%  ·  Active + inactive items",
    );
  });

  it("is empty only with nothing picked and active-only on", () => {
    expect(isFilterEmpty(emptyFilterState())).toBe(true);
    expect(isFilterEmpty({ ...emptyFilterState(), filters: { ...emptyFilters(), activeOnly: false } })).toBe(false);
    expect(isFilterEmpty({ ...emptyFilterState(), filters: { ...emptyFilters(), brandId: "b" } })).toBe(false);
  });
});

describe("the dialog's picks", () => {
  it("become the filter and its texts, the search trimmed", () => {
    const state = filterStateFrom(" salt ", false, {
      group: { id: "g", text: "Snacks" },
      preset: { id: "p", text: "MRP + batch" },
      tax: { id: "", text: "ignored" },
    });
    expect(state.filters).toEqual({
      ...emptyFilters(),
      search: "salt",
      activeOnly: false,
      groupId: "g",
      trackPresetId: "p",
    });
    expect(state.texts).toEqual({ group: "Snacks", preset: "MRP + batch" });
  });

  it("come back in when the dialog reopens", () => {
    const state = filterStateFrom("", true, { brand: { id: "b", text: "Tata" } });
    expect(picksOf(state)).toEqual({ brand: { id: "b", text: "Tata" } });
  });
});

describe("gridQuery", () => {
  it("sends only what is set, under the server's names", () => {
    const filters = {
      ...emptyFilters(),
      groupId: "g",
      brandId: "b",
      sectionId: "s",
      supplierId: "sup",
      categoryId: "c",
      trackPresetId: "p",
      taxId: "t",
      search: " salt ",
    };
    expect(gridQuery("co", "br", filters, 1000, 2000)).toEqual({
      companyId: "co",
      branchId: "br",
      itemGroupId: "g",
      itemBrandId: "b",
      itemSectionId: "s",
      supplierId: "sup",
      itemCategoryId: "c",
      trackPresetId: "p",
      taxId: "t",
      search: "salt",
      limit: 1000,
      offset: 2000,
    });
  });

  it("sends activeOnly only as false — true is the server's default", () => {
    expect(gridQuery("co", "br", emptyFilters(), 10, 0)).toEqual({
      companyId: "co",
      branchId: "br",
      limit: 10,
      offset: 0,
    });
    expect(gridQuery("co", "br", { ...emptyFilters(), activeOnly: false }, 10, 0).activeOnly).toBe("false");
  });

  it("loads one item's rows by the item alone", () => {
    expect(gridQuery("co", "br", itemOnlyFilters("item-9"), 1000, 0)).toEqual({
      companyId: "co",
      branchId: "br",
      itemId: "item-9",
      limit: 1000,
      offset: 0,
    });
  });
});

describe("inventory.below_cost_price", () => {
  const setting = (value: string | null, fallback: string | null = "warning") =>
    ({ asdKey: "inventory.below_cost_price", value, asdDefaultValue: fallback }) as EffectiveSetting;

  it("reads the catalog's three tokens, any case", () => {
    expect(parseBelowCostPolicy("restrict")).toBe("restrict");
    expect(parseBelowCostPolicy(" ALLOW ")).toBe("allow");
    expect(parseBelowCostPolicy("warning")).toBe("warning");
  });

  it("falls back to the seeded warning for a blank or unknown value", () => {
    expect(parseBelowCostPolicy("")).toBe("warning");
    expect(parseBelowCostPolicy("block")).toBe("warning");
    expect(parseBelowCostPolicy(null)).toBe("warning");
  });

  it("takes the effective value, else the catalog default", () => {
    expect(parseSellingPriceSettings([setting("restrict")]).belowCostPrice).toBe("restrict");
    expect(parseSellingPriceSettings([setting(null, "allow")]).belowCostPrice).toBe("allow");
    expect(parseSellingPriceSettings([]).belowCostPrice).toBe("warning");
    expect(parseSellingPriceSettings(undefined).belowCostPrice).toBe("warning");
  });
});

describe("isHqUserType", () => {
  it("lets HQ, ADMIN and SUPER ADMIN save for all branches", () => {
    expect(isHqUserType("HQ")).toBe(true);
    expect(isHqUserType("admin")).toBe(true);
    expect(isHqUserType("SUPER ADMIN")).toBe(true);
    expect(isHqUserType("USER")).toBe(false);
    expect(isHqUserType(null)).toBe(false);
  });
});
