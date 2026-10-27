import { describe, expect, it } from "vitest";
import {
  EMPTY_SHEET_FILTER,
  applyNegativeOnly,
  emptySheetMessage,
  sheetFilterQuery,
  sheetFilterSummary,
} from "./physical-stock.sheet-filter";
import type { CountSheetRow } from "./physical-stock.types";

const row = (bookQty: number) => ({ bookQty }) as CountSheetRow;

describe("sheet filter", () => {
  it("sends only what was chosen, and includeZero always", () => {
    expect(sheetFilterQuery(EMPTY_SHEET_FILTER)).toEqual({ includeZero: false });
    expect(sheetFilterQuery({ ...EMPTY_SHEET_FILTER, brandId: "b1", sectionId: "s1", includeZero: true })).toEqual({
      itemBrandId: "b1",
      itemSectionId: "s1",
      includeZero: true,
    });
  });

  it("negative only sends negativeOnly and never includes empty holdings", () => {
    expect(sheetFilterQuery({ ...EMPTY_SHEET_FILTER, negativeOnly: true, includeZero: true })).toEqual({
      negativeOnly: true,
      includeZero: false,
    });
  });

  it("re-checks negative only on the rows", () => {
    const rows = [row(-2), row(0), row(5)];
    expect(applyNegativeOnly(rows, { ...EMPTY_SHEET_FILTER, negativeOnly: true })).toEqual([row(-2)]);
    expect(applyNegativeOnly(rows, EMPTY_SHEET_FILTER)).toHaveLength(3);
  });

  it("summarises like Qt", () => {
    expect(sheetFilterSummary(EMPTY_SHEET_FILTER)).toBe("every group · every bucket");
    expect(
      sheetFilterSummary({
        ...EMPTY_SHEET_FILTER,
        groupId: "g",
        groupName: "Shirts",
        brandId: "b",
        brandName: "Acme",
        negativeOnly: true,
        bucket: "DAMAGED",
        includeZero: true,
      }),
    ).toBe("group Shirts · brand Acme · negative stock only · DAMAGED · with empty holdings");
  });

  it("explains which empty it is", () => {
    expect(emptySheetMessage({ ...EMPTY_SHEET_FILTER, negativeOnly: true })).toContain("below zero");
    expect(emptySheetMessage({ ...EMPTY_SHEET_FILTER, includeZero: true })).toContain("no holdings at all");
    expect(emptySheetMessage(EMPTY_SHEET_FILTER)).toContain("matches");
  });
});
