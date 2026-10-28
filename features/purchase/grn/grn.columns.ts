/**
 * The line grid's columns — ui_table 58's layout (titles, widths, order,
 * visibility) over the columns this screen draws (`DRAWN_COLUMNS`, the Qt
 * `GrnCols`). Rows join on `ui_tbl_clm_no`, the number the Qt grid writes its
 * cells by. Later columns of the table (Size, Sell A, Excess …) are never drawn.
 * Pure.
 */
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import { DRAWN_COLUMNS, FALLBACK_COLUMNS, type ColumnNo } from "./grn.constants";

export type GrnColumn = {
  no: ColumnNo;
  header: string;
  /** Share of the grid's width, in percent; the drawn columns sum to 100. */
  widthPct: number;
};

export function resolveGrnColumns(rows: readonly UiTableColumnRow[] | undefined): GrnColumn[] {
  const byNumber = new Map<number, UiTableColumnRow>();
  for (const row of rows ?? []) {
    const no = Number.parseInt(String(row.uiTblClmNo ?? ""), 10);
    if (Number.isFinite(no) && !byNumber.has(no)) {
      byNumber.set(no, row);
    }
  }
  const placed = DRAWN_COLUMNS.filter((no) => byNumber.get(no)?.uiTblClmColumnVisibility !== false).map((no) => {
    const row = byNumber.get(no);
    const fallback = FALLBACK_COLUMNS[no];
    const width =
      row && typeof row.uiTblClmColumnWidth === "number" && row.uiTblClmColumnWidth > 0
        ? row.uiTblClmColumnWidth
        : fallback.width;
    const position = row ? Number(row.uiTblClmColumnPosition) : Number.NaN;
    return {
      no,
      header: (row?.uiTblClmName ?? "").trim() || fallback.title,
      width,
      position: Number.isFinite(position) ? position : no,
    };
  });
  placed.sort((a, b) => a.position - b.position || a.no - b.no);
  const total = placed.reduce((sum, column) => sum + column.width, 0) || 1;
  return placed.map((column) => ({ no: column.no, header: column.header, widthPct: (column.width / total) * 100 }));
}
