import { describe, expect, it } from "vitest";
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import {
  BILL_COLUMN_MEANINGS,
  BILL_COLUMN_NUMBERS,
  BILL_EDITABLE_COLUMNS,
  TENDER_COLUMN_MEANINGS,
  TENDER_COLUMN_NUMBERS,
  resolveBillColumns,
  resolveTenderColumns,
} from "./columns";

function layoutRow(partial: Partial<UiTableColumnRow> & { uiTblClmNo: string }): UiTableColumnRow {
  return {
    uiTblClmId: `clm-${partial.uiTblClmNo}`,
    uiTblClmName: null,
    uiTblClmColumnWidth: 10,
    uiTblClmPx: null,
    uiTblClmColumnVisibility: true,
    uiTblClmColumnFocus: false,
    uiTblClmColumnPosition: Number(partial.uiTblClmNo),
    uiTblClmColumnNecessity: false,
    ...partial,
  };
}

describe("column tables", () => {
  it("numbers every bill meaning, uniquely", () => {
    const keys = BILL_COLUMN_MEANINGS.map((meaning) => meaning.key);
    expect(Object.keys(BILL_COLUMN_NUMBERS).sort()).toEqual([...keys].sort());
    expect(new Set(Object.values(BILL_COLUMN_NUMBERS)).size).toBe(keys.length);
  });

  it("numbers every tender meaning, uniquely", () => {
    const keys = TENDER_COLUMN_MEANINGS.map((meaning) => meaning.key);
    expect(Object.keys(TENDER_COLUMN_NUMBERS).sort()).toEqual([...keys].sort());
    expect(new Set(Object.values(TENDER_COLUMN_NUMBERS)).size).toBe(keys.length);
  });

  it("opens only the settlement cells and the note for editing", () => {
    expect([...BILL_EDITABLE_COLUMNS].sort()).toEqual(
      ["discount", "note", "receive", "roundOff", "writeOff"].sort(),
    );
  });
});

describe("resolveReceiptColumns — no layout", () => {
  it("falls back to every meaning, in declaration order, at the default width", () => {
    for (const rows of [undefined, []]) {
      const columns = resolveBillColumns(rows);
      expect(columns.map((column) => column.key)).toEqual(
        BILL_COLUMN_MEANINGS.map((meaning) => meaning.key),
      );
      expect(columns[0]).toMatchObject({
        header: "Date",
        widthPx: 90,
        visible: true,
        position: 0,
        columnId: null,
      });
    }
  });
});

describe("resolveReceiptColumns — joined to a layout", () => {
  it("joins by heading, ignoring case and punctuation", () => {
    const [column] = resolveTenderColumns([
      layoutRow({ uiTblClmNo: "99", uiTblClmName: "instr. DATE" }),
    ]);
    expect(column.key).toBe("instrDate");
    expect(column.header).toBe("instr. DATE");
  });

  it("joins by key name too", () => {
    const [column] = resolveBillColumns([layoutRow({ uiTblClmNo: "99", uiTblClmName: "writeOff" })]);
    expect(column.key).toBe("writeOff");
  });

  it("falls back to the column number when a heading was renamed", () => {
    const [column] = resolveBillColumns([
      layoutRow({ uiTblClmNo: "11", uiTblClmName: "Amount now" }),
    ]);
    expect(column.key).toBe("receive");
    expect(column.header).toBe("Amount now");
  });

  it("uses the meaning's token when the layout has no heading", () => {
    const [column] = resolveBillColumns([layoutRow({ uiTblClmNo: "12", uiTblClmName: null })]);
    expect(column.header).toBe("Disc");
  });

  it("drops a row it cannot place, and never places a meaning twice", () => {
    const columns = resolveBillColumns([
      layoutRow({ uiTblClmNo: "50", uiTblClmName: "BillId" }),
      layoutRow({ uiTblClmNo: "0", uiTblClmName: "Date" }),
      layoutRow({ uiTblClmNo: "0", uiTblClmName: "Date" }),
    ]);
    expect(columns.map((column) => column.key)).toEqual(["docDate"]);
  });

  it("orders by position, breaking ties on the column number", () => {
    const columns = resolveBillColumns([
      layoutRow({ uiTblClmNo: "2", uiTblClmName: "Their ref", uiTblClmColumnPosition: 5 }),
      layoutRow({ uiTblClmNo: "1", uiTblClmName: "Ref", uiTblClmColumnPosition: 5 }),
      layoutRow({ uiTblClmNo: "0", uiTblClmName: "Date", uiTblClmColumnPosition: 9 }),
    ]);
    expect(columns.map((column) => column.key)).toEqual(["docRefno", "usrRefno", "docDate"]);
  });

  it("carries visibility, focus, necessity and the column id", () => {
    const [column] = resolveBillColumns([
      layoutRow({
        uiTblClmNo: "18",
        uiTblClmName: "Note",
        uiTblClmId: "clm-abc",
        uiTblClmColumnVisibility: false,
        uiTblClmColumnFocus: true,
        uiTblClmColumnNecessity: true,
      }),
    ]);
    expect(column).toMatchObject({
      visible: false,
      focus: true,
      necessity: true,
      columnId: "clm-abc",
      columnNumber: 18,
    });
  });

  it("treats a null visibility as visible", () => {
    const [column] = resolveBillColumns([
      layoutRow({ uiTblClmNo: "0", uiTblClmName: "Date", uiTblClmColumnVisibility: null }),
    ]);
    expect(column.visible).toBe(true);
  });
});

describe("column width", () => {
  function widthOf(partial: Partial<UiTableColumnRow>): number {
    return resolveBillColumns([layoutRow({ uiTblClmNo: "0", uiTblClmName: "Date", ...partial })])[0]
      .widthPx;
  }

  it("converts the Qt fraction to pixels, never a percent", () => {
    expect(widthOf({ uiTblClmColumnWidth: 10 })).toBe(110);
  });

  it("prefers a dragged pixel width, with or without the unit", () => {
    expect(widthOf({ uiTblClmPx: "120px", uiTblClmColumnWidth: 10 })).toBe(120);
    expect(widthOf({ uiTblClmPx: "64.6" })).toBe(65);
  });

  it("clamps both sources to the minimum width", () => {
    expect(widthOf({ uiTblClmPx: "5px" })).toBe(34);
    expect(widthOf({ uiTblClmColumnWidth: 1 })).toBe(34);
  });

  it("ignores a garbled dragged width and a missing fraction", () => {
    expect(widthOf({ uiTblClmPx: "wide", uiTblClmColumnWidth: 10 })).toBe(110);
    expect(widthOf({ uiTblClmColumnWidth: null })).toBe(90);
    expect(widthOf({ uiTblClmColumnWidth: 0 })).toBe(90);
  });
});
