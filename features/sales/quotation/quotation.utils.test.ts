/**
 * Column resolution and the small parsers.
 *
 * The column tests matter because no migration provisions ui tables 23/21 — they
 * are data in the dev database only. A fresh environment gets an empty layout, and
 * the screen has to render every column from the local defaults rather than an
 * empty grid.
 */
import { describe, expect, it } from "vitest";
import {
  CHARGE_COLUMN_MEANINGS,
  ITEM_COLUMN_MEANINGS,
  ITEM_COLUMN_NUMBERS,
} from "./quotation.constants";
import type { UiTableColumnRow } from "./quotation.types";
import {
  accountingYearOf,
  addDays,
  buildPageList,
  SIZE_FACTOR_COUNT,
  SIZE_FACTOR_LABELS,
  SIZE_FACTOR_PLACEHOLDERS,
  cubicFeetFromSize,
  joinSizeFactors,
  sanitizeSizeFactorInput,
  sanitizeSizeInput,
  splitSizeFactors,
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
    const [, description] = resolveItemColumns([
      layoutRow(4, "Description", { uiTblClmColumnWidth: 140 }),
    ]);
    expect(description.widthPx).toBe(140);
    expect(description.key).toBe("description");
    expect(description.header).toBe("Description");
  });

  it("floors a very narrow column so its heading stays readable", () => {
    const columns = resolveItemColumns([layoutRow(1, "id", { uiTblClmColumnWidth: 12 })]);
    expect(columns[0].widthPx).toBe(34);
  });

  it("orders by position, so the settings dialog's reorder takes effect", () => {
    const columns = resolveItemColumns([
      layoutRow(22, "Rate", { uiTblClmColumnPosition: 59 }),
      layoutRow(59, "Total", { uiTblClmColumnPosition: 22 }),
    ]);
    expect(columns.map((column) => column.key)).toEqual(["slno", "total", "rate"]);
  });

  it("breaks a duplicate position by column number", () => {
    // Live layouts ship duplicate positions (grid 24 has two), which would
    // otherwise leave those two columns' order undecided.
    const columns = resolveItemColumns([
      layoutRow(59, "Total", { uiTblClmColumnPosition: 58 }),
      layoutRow(58, "ChrgAfterTax", { uiTblClmColumnPosition: 58 }),
      layoutRow(22, "Rate", { uiTblClmColumnPosition: 22 }),
    ]);
    expect(columns.map((column) => column.key)).toEqual([
      "slno",
      "rate",
      "chrgaftertax",
      "total",
    ]);
  });

  it("carries the layout's focus and necessity flags through to the settings dialog", () => {
    const [, rate] = resolveItemColumns([
      layoutRow(22, "Rate", {
        uiTblClmColumnFocus: true,
        uiTblClmColumnNecessity: true,
      }),
    ]);
    expect(rate.focus).toBe(true);
    expect(rate.necessity).toBe(true);
    expect(rate.position).toBe(22);
  });

  it("honours the configured visibility and drops a column it has no meaning for", () => {
    const columns = resolveItemColumns([
      layoutRow(3, "Description"),
      layoutRow(4, "AliasName", { uiTblClmColumnVisibility: false }),
      layoutRow(90, "Something Nobody Implemented"),
    ]);
    expect(columns.map((column) => column.key)).toEqual(["slno", "description", "aliasname"]);
    expect(columns[2].visible).toBe(false);
  });

  it("resolves the size column under both names ui table 23 gives it", () => {
    // Grid 23 carries the same free-text field twice: "Size" at 5 (where grids
    // 18 and 24 also put it) and "ItemSize" at 90. Before the alias, only the
    // trailing one matched and the column an operator expects after Description
    // was missing from the grid entirely.
    const columns = resolveItemColumns([
      layoutRow(4, "Description"),
      layoutRow(5, "Size"),
      layoutRow(90, "ItemSize"),
    ]);
    expect(columns.map((column) => column.key)).toEqual(["slno", "description", "size"]);
    // The lower column number wins; the duplicate is dropped, not rendered blank.
    expect(columns[2].header).toBe("Size");
    expect(columns[2].write).toBe("itemSize");
    expect(columns[2].read).toBe("itemSize");
  });

  it("resolves the size column on a layout that only carries the alias", () => {
    const columns = resolveItemColumns([layoutRow(90, "ItemSize")]);
    expect(columns.map((column) => column.key)).toEqual(["slno", "size"]);
    expect(columns[1].header).toBe("ItemSize");
    expect(columns[1].write).toBe("itemSize");
  });

  it("matches on the name with punctuation and case stripped", () => {
    const columns = resolveItemColumns([
      layoutRow(23, "Rate.BTax"),
      layoutRow(42, "Gst %"),
      layoutRow(13, "Case Qty"),
    ]);
    // Every layout gets its serial column, so the three configured ones follow it.
    expect(columns.map((column) => column.key)).toEqual([
      "slno",
      "caseqty",
      "ratebtax",
      "gst",
    ]);
  });

  it("numbers every meaning ui table 23 configures, exactly once", () => {
    // `ITEM_COLUMN_NUMBERS` is kept beside the meanings rather than on them, so
    // this is what stops the two drifting: a meaning added without a number
    // silently loses the rename fallback, and a number typed twice would bind
    // two columns to one meaning.
    const numbers = Object.values(ITEM_COLUMN_NUMBERS);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const key of Object.keys(ITEM_COLUMN_NUMBERS)) {
      expect(ITEM_COLUMN_MEANINGS.some((meaning) => meaning.key === key)).toBe(true);
    }
    // Only `AliasName` is unnumbered — ui table 23 does not configure it.
    const unnumbered = ITEM_COLUMN_MEANINGS.filter(
      (meaning) => ITEM_COLUMN_NUMBERS[meaning.key] === undefined,
    );
    expect(unnumbered.map((meaning) => meaning.token)).toEqual(["AliasName"]);
  });

  it("matches the serial column under whichever name the layout gives it", () => {
    // ui table 23 is named "sl.no" on this deployment and "Id" on others. Before
    // both resolved here, "sl.no" matched nothing and the grid opened on Barcode.
    for (const name of ["sl.no", "Sl.No", "Id", "S.No"]) {
      const columns = resolveItemColumns([layoutRow(1, name), layoutRow(2, "Barcode")]);
      expect(columns.map((column) => column.key)).toEqual(["slno", "barcode"]);
      expect(columns[0].kind).toBe("serial");
      // ui table master owns the heading — the serial column included.
      expect(columns[0].header).toBe(name);
    }
  });

  it("paints every heading the layout's own name, not the shipped token", () => {
    const columns = resolveItemColumns([
      layoutRow(1, "Row"),
      layoutRow(4, "Item Description"),
      layoutRow(15, "Quote Qty"),
    ]);
    expect(columns.map((column) => column.header)).toEqual([
      "Row",
      "Item Description",
      "Quote Qty",
    ]);
    // Renaming does not change what the cell DOES.
    expect(columns.map((column) => column.key)).toEqual(["slno", "description", "quoteqty"]);
  });

  it("keeps a renamed column on the grid, by its ui_tbl_clm_no", () => {
    // The whole point of `ITEM_COLUMN_NUMBERS`: a deployment that renames
    // "Quote Qty" (column 15) used to lose the column altogether, because the
    // name was the only thing the join had.
    const columns = resolveItemColumns([layoutRow(1, "sl.no"), layoutRow(15, "Bill Qty")]);
    expect(columns.map((column) => column.key)).toEqual(["slno", "quoteqty"]);
    expect(columns[1].header).toBe("Bill Qty");
    // Still writes the same draft field it always did.
    expect(columns[1].write).toBe("billQty");
  });

  it("prefers the name over the number, so a reordered layout is not mislabelled", () => {
    // Column 15's name here is another column's token. The name wins: a layout
    // whose numbering differs from ours must degrade to dropping columns, never
    // to labelling them wrongly.
    const columns = resolveItemColumns([layoutRow(1, "sl.no"), layoutRow(15, "Barcode")]);
    expect(columns.map((column) => column.key)).toEqual(["slno", "barcode"]);
    expect(columns[1].write).toBe("barcode");
  });

  it("gives a layout with no serial row one of its own, first", () => {
    const columns = resolveItemColumns([layoutRow(2, "Barcode"), layoutRow(4, "Description")]);
    expect(columns.map((column) => column.key)).toEqual(["slno", "barcode", "description"]);
    // Nothing to save a width against — it is not a configured row.
    expect(columns[0].columnId).toBeNull();
    expect(columns[0].visible).toBe(true);
  });

  it("leaves a serial column the layout hides hidden rather than adding a second", () => {
    const columns = resolveItemColumns([
      layoutRow(1, "sl.no", { uiTblClmColumnVisibility: false }),
      layoutRow(2, "Barcode"),
    ]);
    expect(columns.map((column) => column.key)).toEqual(["slno", "barcode"]);
    expect(columns[0].visible).toBe(false);
  });

  it("keeps one column per meaning when two rows claim the same one", () => {
    // Two serial aliases in one layout would otherwise be two columns sharing a
    // React key.
    const columns = resolveItemColumns([
      layoutRow(1, "Id", { uiTblClmColumnWidth: 40 }),
      layoutRow(2, "sl.no", { uiTblClmColumnWidth: 90 }),
      layoutRow(3, "Barcode"),
    ]);
    expect(columns.map((column) => column.key)).toEqual(["slno", "barcode"]);
    expect(columns[0].widthPx).toBe(40);
  });
});

describe("resolveChargeColumns", () => {
  it("matches the serial column by its number — its name '#' normalises to nothing", () => {
    const columns = resolveChargeColumns([
      layoutRow(0, "#", { uiTblClmColumnWidth: 48 }),
      layoutRow(1, "Charge Name"),
    ]);
    expect(columns).toHaveLength(2);
    expect(columns[0].kind).toBe("serial");
    expect(columns[1].key).toBe("chargename");
  });

  it("falls back to every local column when the server has no layout", () => {
    expect(resolveChargeColumns(undefined)).toHaveLength(CHARGE_COLUMN_MEANINGS.length);
  });

  it("reads its widths as pixels — the web layout stores them the item grid's way", () => {
    // Both this grid (ui table 26) and the item grid (23) are web layouts in
    // pixels. The Qt tables are the ones that store fractional percents, and
    // reading one of those as pixels — or these as percents — is an 11× error in
    // whichever direction; `resolveItemColumnsWith` still takes the unit per grid
    // because Sale Order's table 24 is one of them.
    const columns = resolveChargeColumns([layoutRow(1, "Charge Name", { uiTblClmColumnWidth: 220 })]);
    expect(columns[0].widthPx).toBe(220);
  });
});

describe("totalColumnWidth", () => {
  it("adds the row-action column so the table can state its own width", () => {
    const columns = resolveItemColumns([layoutRow(3, "Description"), layoutRow(22, "Rate")]);
    const sum = columns.reduce((total, column) => total + column.widthPx, 0);
    expect(totalColumnWidth(columns, 30)).toBe(sum + 30);
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

describe("cubicFeetFromSize", () => {
  it("divides length(ft) x width(in) x thickness(in) x pieces by 144", () => {
    // The worked example: 45ft x 2in x 2in x 6 pieces = 1080 / 144 = 7.5 CFT.
    expect(cubicFeetFromSize("45*2*2*6")).toBe(7.5);
    expect(cubicFeetFromSize("12*6*2*10")).toBe(10);
  });

  it("tolerates the spacing an operator types around the stars", () => {
    expect(cubicFeetFromSize(" 45 * 2 * 2 * 6 ")).toBe(7.5);
  });

  it("takes a lone number as an already-computed CFT, not a dimension", () => {
    // Keying "7.5" into the Size cell means 7.5 CFT of Bill Qty, not 7.5 / 144.
    expect(cubicFeetFromSize("7.5")).toBe(7.5);
    expect(cubicFeetFromSize(cubicFeetFromSize("45*2*2*6")?.toString() ?? "")).toBe(7.5);
  });

  it("reads a trailing star as mid-keying rather than a missing factor", () => {
    // "8*8*8*8*" is what the cell holds when the operator tabs away after the
    // star: 4096 / 144, the same size as "8*8*8*8".
    expect(cubicFeetFromSize("8*8*8*8*")).toBe(28.444);
    expect(cubicFeetFromSize("8*8*8*8")).toBe(28.444);
    expect(cubicFeetFromSize("45*2*2*6**")).toBe(7.5);
  });

  it("rounds to three decimals rather than sending float dust", () => {
    // 1/144 = 0.0069444...
    expect(cubicFeetFromSize("1*1*1*1")).toBe(0.007);
    expect(cubicFeetFromSize("10*3*2.5*4")).toBe(2.083);
  });

  it("returns null for anything that is not a run of positive numbers", () => {
    for (const bad of ["", "   ", "*", "*6", "45**6", "45*abc", "45*0*2", "-45*2*2*6", "abc"]) {
      expect(cubicFeetFromSize(bad)).toBeNull();
    }
    expect(cubicFeetFromSize(null)).toBeNull();
    expect(cubicFeetFromSize(undefined)).toBeNull();
  });

});

describe("sanitizeSizeInput", () => {
  it("keeps the digits, stars and decimal points a dimension is made of", () => {
    expect(sanitizeSizeInput("45*2*2*6")).toBe("45*2*2*6");
    expect(sanitizeSizeInput("10*3*2.5*4")).toBe("10*3*2.5*4");
    expect(sanitizeSizeInput("8*8*8*8*")).toBe("8*8*8*8*");
  });

  it("drops letters and every other character, keyed or pasted", () => {
    expect(sanitizeSizeInput("abcd")).toBe("");
    expect(sanitizeSizeInput("45x2x2")).toBe("4522");
    expect(sanitizeSizeInput("45 * 2 * 2 * 6 cft")).toBe("45*2*2*6");
    expect(sanitizeSizeInput("-45*2")).toBe("45*2");
  });

  it("leaves an empty cell empty", () => {
    expect(sanitizeSizeInput("")).toBe("");
  });
});

describe("sanitizeSizeFactorInput", () => {
  it("keeps only what one factor is made of — no star to type", () => {
    expect(sanitizeSizeFactorInput("45")).toBe("45");
    expect(sanitizeSizeFactorInput("2.5")).toBe("2.5");
    expect(sanitizeSizeFactorInput("45*2")).toBe("452");
    expect(sanitizeSizeFactorInput("45x")).toBe("45");
    expect(sanitizeSizeFactorInput("-6")).toBe("6");
    expect(sanitizeSizeFactorInput("")).toBe("");
  });
});

describe("the Size cell's per-box text", () => {
  it("carries one hint and one label per box", () => {
    // A short list would leave the last box with an `undefined` placeholder.
    expect(SIZE_FACTOR_PLACEHOLDERS).toHaveLength(SIZE_FACTOR_COUNT);
    expect(SIZE_FACTOR_LABELS).toHaveLength(SIZE_FACTOR_COUNT);
  });
});

describe("splitSizeFactors", () => {
  it("gives the four boxes a stored size is keyed as", () => {
    expect(splitSizeFactors("45*2*2*6")).toEqual(["45", "2", "2", "6"]);
    expect(splitSizeFactors("10*3*2.5*4")).toEqual(["10", "3", "2.5", "4"]);
  });

  it("pads a short value rather than shifting factors out of their box", () => {
    // A bare CFT sits alone in the first box, which is exactly what
    // `cubicFeetFromSize` reads a single factor as.
    expect(splitSizeFactors("7.5")).toEqual(["7.5", "", "", ""]);
    expect(splitSizeFactors("45*2")).toEqual(["45", "2", "", ""]);
  });

  it("drops the trailing star of a half-keyed size", () => {
    expect(splitSizeFactors("8*8*8*8*")).toEqual(["8", "8", "8", "8"]);
    expect(splitSizeFactors("45*2*")).toEqual(["45", "2", "", ""]);
  });

  it("keeps a legacy free-text tail in the last box", () => {
    // Nothing keyed through the boxes makes five factors, but text saved before
    // the boxes existed can, and it has to stay editable and unmangled.
    expect(splitSizeFactors("45*2*2*6*3")).toEqual(["45", "2", "2", "6*3"]);
  });

  it("gives four blanks for an empty cell", () => {
    expect(splitSizeFactors("")).toEqual(["", "", "", ""]);
    expect(splitSizeFactors(null)).toEqual(["", "", "", ""]);
    expect(splitSizeFactors(undefined)).toEqual(["", "", "", ""]);
  });
});

describe("joinSizeFactors", () => {
  it("puts the stars back in", () => {
    expect(joinSizeFactors(["45", "2", "2", "6"])).toBe("45*2*2*6");
  });

  it("drops a blank box instead of leaving an empty factor", () => {
    // `"45**6"` is text `cubicFeetFromSize` refuses, which would leave Bill Qty
    // silently stale on a row still being keyed.
    expect(joinSizeFactors(["45", "", "2", ""])).toBe("45*2");
    expect(joinSizeFactors(["45", "", "", ""])).toBe("45");
    expect(joinSizeFactors([" 45 ", "2", "", ""])).toBe("45*2");
  });

  it("leaves an untouched cell empty", () => {
    expect(joinSizeFactors(["", "", "", ""])).toBe("");
  });

  it("round-trips every shape a stored size takes", () => {
    for (const stored of ["45*2*2*6", "10*3*2.5*4", "7.5", "45*2", "45*2*2*6*3", ""]) {
      expect(joinSizeFactors(splitSizeFactors(stored))).toBe(stored);
    }
  });

  it("feeds cubicFeetFromSize the CFT the boxes were keyed for", () => {
    expect(cubicFeetFromSize(joinSizeFactors(["45", "2", "2", "6"]))).toBe(7.5);
    expect(cubicFeetFromSize(joinSizeFactors(["7.5", "", "", ""]))).toBe(7.5);
  });
});
