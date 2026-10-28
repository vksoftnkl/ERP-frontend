/**
 * The line grid's columns — ui_table 56's layout over the columns this screen
 * draws. Pure. The layout supplies titles, widths, order and visibility (an
 * admin may hide a column from the grid's right-click settings); WHICH columns
 * can show at all is `SHOWN_COLUMNS` — the 19 the Qt screen of 3ce8487 knows.
 * Rows join on `ui_tbl_clm_no`, the column number the Qt grid writes by.
 *
 * `ui_tbl_clm_column_width` is a Qt fraction, not a percent (the visible
 * columns of table 56 sum to far more than 100): it is used as a weight, and
 * every column's share is its weight over the shown columns' total.
 */
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import { COL, FALLBACK_COLUMN_TITLES, FALLBACK_COLUMN_WIDTHS, SHOWN_COLUMNS } from "./invoice.constants";

export type LineColumn = {
  no: number;
  header: string;
  /** Share of the grid's width, in percent; the shown columns sum to 100. */
  widthPct: number;
};

export function resolveLineColumns(rows: readonly UiTableColumnRow[] | undefined): LineColumn[] {
  const byNumber = new Map<number, UiTableColumnRow>();
  for (const row of rows ?? []) {
    const no = Number.parseInt(String(row.uiTblClmNo ?? ""), 10);
    if (Number.isFinite(no) && !byNumber.has(no)) {
      byNumber.set(no, row);
    }
  }
  const placed: { no: number; header: string; width: number; position: number }[] = [];
  SHOWN_COLUMNS.forEach((no, index) => {
    const row = byNumber.get(no);
    // Item is how a line gets its item: it never hides.
    if (row && row.uiTblClmColumnVisibility === false && no !== COL.Item) {
      return;
    }
    const fallbackWidth = FALLBACK_COLUMN_WIDTHS[no] ?? 4;
    const width =
      row && typeof row.uiTblClmColumnWidth === "number" && row.uiTblClmColumnWidth > 0
        ? row.uiTblClmColumnWidth
        : fallbackWidth;
    const position = row && Number.isFinite(Number(row.uiTblClmColumnPosition)) ? Number(row.uiTblClmColumnPosition) : index * 10;
    placed.push({
      no,
      header: (row?.uiTblClmName ?? "").trim() || FALLBACK_COLUMN_TITLES[no] || "",
      width,
      position,
    });
  });
  placed.sort((left, right) => left.position - right.position || left.no - right.no);
  const total = placed.reduce((sum, column) => sum + column.width, 0) || 1;
  return placed.map((column) => ({ no: column.no, header: column.header, widthPct: (column.width / total) * 100 }));
}
