/**
 * The two grids' columns — a ui_tables layout (59 lines, 60 claims) joined, by
 * `ui_tbl_clm_no`, to the columns this screen knows. Pure. The layout supplies
 * titles, widths, order and visibility (the Qt `NexTable::loadLayout`); a
 * column the screen does not draw is never shown, whatever the layout says.
 *
 * Widths are shares of the grid (`ui_tbl_clm_column_width` is a Qt fraction,
 * not a percent — memory: ui_table width is not a percent), so the visible
 * columns are scaled to sum to 100 on a full-width table.
 */
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";

export type GridColumn = {
  no: number;
  header: string;
  /** Share of the grid's width, in percent; the visible columns sum to 100. */
  widthPct: number;
};

export function resolveColumns(
  rows: readonly UiTableColumnRow[] | undefined,
  shown: readonly number[],
  titles: Readonly<Record<number, string>>,
  widths: Readonly<Record<number, number>>,
): GridColumn[] {
  const byNumber = new Map<number, UiTableColumnRow>();
  for (const row of rows ?? []) {
    const no = Number.parseInt(String(row.uiTblClmNo ?? ""), 10);
    if (Number.isFinite(no) && !byNumber.has(no)) {
      byNumber.set(no, row);
    }
  }
  const placed: { no: number; header: string; width: number; position: number }[] = [];
  for (const no of shown) {
    const row = byNumber.get(no);
    if (row && row.uiTblClmColumnVisibility === false) {
      continue;
    }
    const fallback = widths[no] ?? 6;
    const configured = row && typeof row.uiTblClmColumnWidth === "number" ? row.uiTblClmColumnWidth : 0;
    placed.push({
      no,
      header: (row?.uiTblClmName ?? "").trim() || titles[no] || "",
      width: configured > 0 ? configured : fallback,
      position: row && Number.isFinite(Number(row.uiTblClmColumnPosition)) ? Number(row.uiTblClmColumnPosition) : no,
    });
  }
  placed.sort((left, right) => left.position - right.position || left.no - right.no);
  const total = placed.reduce((sum, column) => sum + column.width, 0) || 1;
  return placed.map((column) => ({ no: column.no, header: column.header, widthPct: (column.width / total) * 100 }));
}
