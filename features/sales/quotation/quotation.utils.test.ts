/**
 * Column resolution and the small parsers.
 *
 * The column tests matter because no migration provisions ui tables 23/21 — they
 * are data in the dev database only. A fresh environment gets an empty layout, and
 * the screen has to render every column from the local defaults rather than an
 * empty grid.
 */
import { describe, expect, it } from "vitest";
import { CHARGE_COLUMN_MEANINGS, ITEM_COLUMN_MEANINGS } from "./quotation.constants";
import type { UiTableColumnRow } from "./quotation.types";
import {
  accountingYearOf,
  addDays,
  buildPageList,
  daysBetween,
  fromDisplayDate,
  isRealDate,
  parseCell,
  resolveChargeColumns,
  resolveItemColumns,
  toDateInput,
  toDisplayDate,
  toNullableNumber,
  toNullableText,
  toNumber,
  totalColumnWidth,
} from "./quotation.utils";

function layoutRow(
  no: number,
  name: string,
  overrides: Partial<UiTableColumnRow> = {},
): UiTableColumnRow {
  return {
    uiTblClmId: `c${no}`,
    uiTblClmNo: String(no),
    uiTblClmName: name,
    uiTblClmColumnWidth: 9.6,
    uiTblClmColumnVisibility: true,
    uiTblClmColumnFocus: false,
    uiTblClmColumnPosition: no,
    uiTblClmColumnNecessity: false,
    ...overrides,
  };
}

describe("resolveItemColumns", () => {
  it("falls back to every local column when the server has no layout", () => {
    for (const columns of [resolveItemColumns(undefined), resolveItemColumns([])]) {
      expect(columns).toHaveLength(ITEM_COLUMN_MEANINGS.length);
      expect(columns.every((column) => column.visible)).toBe(true);
      expect(columns.every((column) => column.widthPx > 0)).toBe(true);
    }
  });

  it("takes the item layout's width as pixels — ui table 23 stores px", () => {
    const columns = resolveItemColumns([
      layoutRow(4, "Description", { uiTblClmColumnWidth: 140 }),
    ]);
    expect(columns).toHaveLength(1);
    expect(columns[0].widthPx).toBe(140);
    expect(columns[0].key).toBe("description");
    expect(columns[0].header).toBe("Description");
  });

  it("floors a very narrow column so its heading stays readable", () => {
    const columns = resolveItemColumns([layoutRow(1, "id", { uiTblClmColumnWidth: 12 })]);
    expect(columns[0].widthPx).toBe(34);
  });

  it("orders by column number, never by position", () => {
    // Live data has position 58 twice and 62 unused, so position ordering is
    // non-deterministic between two columns.
    const columns = resolveItemColumns([
      layoutRow(59, "Total", { uiTblClmColumnPosition: 58 }),
      layoutRow(58, "ChrgAfterTax", { uiTblClmColumnPosition: 58 }),
      layoutRow(22, "Rate", { uiTblClmColumnPosition: 22 }),
    ]);
    expect(columns.map((column) => column.key)).toEqual(["rate", "chrgaftertax", "total"]);
  });

  it("honours the configured visibility and drops a column it has no meaning for", () => {
    const columns = resolveItemColumns([
      layoutRow(3, "Description"),
      layoutRow(4, "AliasName", { uiTblClmColumnVisibility: false }),
      layoutRow(90, "Something Nobody Implemented"),
    ]);
    expect(columns.map((column) => column.key)).toEqual(["description", "aliasname"]);
    expect(columns[1].visible).toBe(false);
  });

  it("matches on the name with punctuation and case stripped", () => {
    const columns = resolveItemColumns([
      layoutRow(23, "Rate.BTax"),
      layoutRow(42, "Gst %"),
      layoutRow(13, "Case Qty"),
    ]);
    expect(columns.map((column) => column.key)).toEqual(["caseqty", "ratebtax", "gst"]);
  });
});

describe("resolveChargeColumns", () => {
  it("matches the serial column by its number — its name '#' normalises to nothing", () => {
    const columns = resolveChargeColumns([
      layoutRow(0, "#", { uiTblClmColumnWidth: 2.13 }),
      layoutRow(1, "Charge Name"),
    ]);
    expect(columns).toHaveLength(2);
    expect(columns[0].kind).toBe("serial");
    expect(columns[1].key).toBe("chargename");
  });

  it("falls back to every local column when the server has no layout", () => {
    expect(resolveChargeColumns(undefined)).toHaveLength(CHARGE_COLUMN_MEANINGS.length);
  });

  it("still scales its width — ui table 21 stores the Qt grid's percents", () => {
    // 9.6 configured units → ~106px, not 9.6px and not "9.6%". The item grid
    // (ui table 23) stores pixels; these two must not drift into one rule.
    const columns = resolveChargeColumns([layoutRow(1, "Charge Name")]);
    expect(columns[0].widthPx).toBe(106);
  });
});

describe("totalColumnWidth", () => {
  it("adds the row-action column so the table can state its own width", () => {
    const columns = resolveItemColumns([layoutRow(3, "Description"), layoutRow(22, "Rate")]);
    expect(totalColumnWidth(columns, 30)).toBe(columns[0].widthPx + columns[1].widthPx + 30);
  });
});

describe("numbers off the wire", () => {
  it("parses the strings /quotations/get returns, trailing zeros already trimmed", () => {
    expect(toNumber("0")).toBe(0);
    expect(toNumber("1234.5")).toBe(1234.5);
    expect(toNumber("12.34")).toBe(12.34);
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined, 7)).toBe(7);
    expect(toNumber("not a number")).toBe(0);
    expect(toNullableNumber(null)).toBeNull();
    expect(toNullableNumber("")).toBeNull();
    expect(toNullableNumber("5")).toBe(5);
  });

  it("treats a blank or half-typed cell as zero rather than NaN", () => {
    expect(parseCell("")).toBe(0);
    expect(parseCell("  ")).toBe(0);
    expect(parseCell("-")).toBe(0);
    expect(parseCell(".")).toBe(0);
    expect(parseCell("1,234.50")).toBe(1234.5);
    expect(parseCell("abc")).toBe(0);
    expect(parseCell("12.")).toBe(12);
  });

  it("trims a nullable text field to null and clamps it to the column length", () => {
    expect(toNullableText("  ")).toBeNull();
    expect(toNullableText(null)).toBeNull();
    expect(toNullableText(" hello ")).toBe("hello");
    expect(toNullableText("123456789", 8)).toBe("12345678");
  });
});

describe("dates", () => {
  it("takes yyyy-mm-dd out of the full ISO timestamp the API returns", () => {
    expect(toDateInput("2026-07-30T00:00:00.000Z")).toBe("2026-07-30");
    expect(toDateInput("2026-07-30")).toBe("2026-07-30");
    expect(toDateInput(null)).toBe("");
    expect(toDateInput("nonsense")).toBe("");
  });

  it("shows dates as dd-mm-yyyy and reads back what the operator types", () => {
    expect(toDisplayDate("2026-08-01")).toBe("01-08-2026");
    expect(toDisplayDate("")).toBe("");
    expect(toDisplayDate("nonsense")).toBe("");

    expect(fromDisplayDate("01-08-2026")).toBe("2026-08-01");
    expect(fromDisplayDate("01/08/2026")).toBe("2026-08-01");
    expect(fromDisplayDate("01.08.2026")).toBe("2026-08-01");
    expect(fromDisplayDate("01082026")).toBe("2026-08-01");
    // Half-typed or impossible: the caller keeps the value it had.
    expect(fromDisplayDate("01-08")).toBeNull();
    expect(fromDisplayDate("31-02-2026")).toBeNull();
    expect(fromDisplayDate("")).toBeNull();
  });

  it("rejects a date that is not on the calendar", () => {
    expect(isRealDate("2026-07-30")).toBe(true);
    expect(isRealDate("2026-02-31")).toBe(false);
    expect(isRealDate("2026-13-01")).toBe(false);
    expect(isRealDate("30/07/2026")).toBe(false);
  });

  it("counts the validity period in whole days", () => {
    expect(addDays("2026-07-30", 15)).toBe("2026-08-14");
    expect(daysBetween("2026-07-30", "2026-08-14")).toBe(15);
    expect(daysBetween("2026-07-30", "2026-07-01")).toBe(-29);
    expect(daysBetween("2026-07-30", "bad")).toBeNull();
    // Across a DST-free but month-crossing boundary, and across a leap day.
    expect(addDays("2028-02-28", 2)).toBe("2028-03-01");
  });

  it("derives the April-start accounting year, 9 characters wide", () => {
    expect(accountingYearOf("2026-07-30")).toBe("2026-2027");
    expect(accountingYearOf("2026-03-31")).toBe("2025-2026");
    expect(accountingYearOf("2026-04-01")).toBe("2026-2027");
    expect(accountingYearOf("2026-07-30")).toHaveLength(9);
  });
});

describe("buildPageList", () => {
  it("lists every page when the current page's neighbours already reach both ends", () => {
    expect(buildPageList(5, 3)).toEqual([1, 2, 3, 4, 5]);
  });

  it("still ellipsis-truncates a short list once the current page sits at an end", () => {
    // Page 1's neighbour window (0..2) does not reach page 5, so the gap
    // still collapses — "few pages" alone does not skip the ellipsis rule.
    expect(buildPageList(5, 1)).toEqual([1, 2, "ellipsis", 5]);
  });

  it("keeps first, last and the current page's neighbours, ellipsis for the rest", () => {
    expect(buildPageList(10, 6)).toEqual([1, "ellipsis", 5, 6, 7, "ellipsis", 10]);
  });

  it("does not ellipsis a run of exactly one skipped page", () => {
    // Page 3 is the only one between {1,2} and {4,5,6,7}, still worth an ellipsis
    // marker rather than being spelled out — this is the boundary case.
    expect(buildPageList(7, 5)).toEqual([1, "ellipsis", 4, 5, 6, 7]);
  });

  it("never drops below page 1 even when currentPage is out of range", () => {
    expect(buildPageList(1, 1)).toEqual([1]);
    expect(buildPageList(0, 1)).toEqual([1]);
  });
});
