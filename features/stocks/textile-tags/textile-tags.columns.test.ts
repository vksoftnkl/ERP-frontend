import { describe, expect, it } from "vitest";
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import { TAG_COL } from "./domain/textile-tag-entity";
import { resolveTextileTagColumns, TAG_COLUMNS } from "./textile-tags.columns";

/** ui_table 53 on the dev DB, 2026-10-19 — every row registered twice. */
function row(no: number, name: string, width: number, visible: boolean, focus: boolean, id = `c${no}`): UiTableColumnRow {
  return {
    uiTblClmId: id,
    uiTblClmNo: String(no),
    uiTblClmName: name,
    uiTblClmColumnWidth: width,
    uiTblClmColumnVisibility: visible,
    uiTblClmColumnFocus: focus,
    uiTblClmColumnPosition: no,
    uiTblClmColumnNecessity: false,
  };
}

const LAYOUT_53: UiTableColumnRow[] = [
  row(0, "#", 3, true, false),
  row(1, "Item", 11, true, true),
  row(1, "Item", 12, true, true, "c1-dup"),
  row(2, "Brand", 9, true, true),
  row(3, "Size", 5, true, true),
  row(10, "Src", 4, true, false),
  row(11, "Price", 6, true, true),
  row(14, "Barcode", 9, true, false),
  row(15, "Season", 7, false, true),
  row(16, "Label note", 10, false, true),
  row(17, "ItemId", 0, false, false),
  row(28, "State", 0, false, false),
];

describe("resolveTextileTagColumns", () => {
  it("layout 53: col 1 titled Item", () => {
    const columns = resolveTextileTagColumns(LAYOUT_53);
    const item = columns.find((column) => column.number === TAG_COL.ItemName);
    expect(item?.header).toBe("Item");
    expect(item?.kind).toBe("itemLookup");
    expect(item?.focus).toBe(true);
  });

  it("layout 53: Season hidden, ids hidden, Barcode shown", () => {
    const columns = resolveTextileTagColumns(LAYOUT_53);
    const byNumber = new Map(columns.map((column) => [column.number, column]));
    expect(byNumber.get(TAG_COL.SeasonName)?.visible).toBe(false);
    expect(byNumber.get(TAG_COL.ItemId)?.visible).toBe(false);
    expect(byNumber.get(TAG_COL.State)?.visible).toBe(false);
    expect(byNumber.get(TAG_COL.Barcode)?.visible).toBe(true);
  });

  it("takes the first row of a slot registered twice, in position order", () => {
    const columns = resolveTextileTagColumns(LAYOUT_53);
    expect(columns.filter((column) => column.number === TAG_COL.ItemName)).toHaveLength(1);
    expect(columns.find((column) => column.number === TAG_COL.ItemName)?.columnId).toBe("c1");
    expect(columns.map((column) => column.number)).toEqual([0, 1, 2, 3, 10, 11, 14, 15, 16, 17, 28]);
  });

  it("reads the Qt fractional widths at 11px a unit, a dragged px width first", () => {
    const columns = resolveTextileTagColumns([
      row(1, "Item", 11, true, true),
      { ...row(2, "Brand", 9, true, true), uiTblClmPx: "140px" },
    ]);
    expect(columns[0].widthPx).toBe(121);
    expect(columns[1].widthPx).toBe(140);
  });

  it("without a layout shows 0–14 with the .ui's headings and hides the rest", () => {
    const columns = resolveTextileTagColumns(undefined);
    expect(columns).toHaveLength(TAG_COLUMNS.length);
    expect(columns.filter((column) => column.visible).map((column) => column.number)).toEqual(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    );
    expect(columns.find((column) => column.number === TAG_COL.Model)?.header).toBe("Model / design");
    expect(columns.find((column) => column.number === TAG_COL.Model)?.maxLength).toBe(100);
  });

  it("drops a layout row no slot has a meaning for", () => {
    const columns = resolveTextileTagColumns([row(1, "Item", 11, true, true), row(99, "Mystery", 5, true, false)]);
    expect(columns.map((column) => column.number)).toEqual([1]);
  });
});
