/**
 * The line grid's columns — ui_table 54's layout joined to what the boxes show
 * (Qt `applyColumns`). Pure. The layout supplies titles, widths and order;
 * WHICH columns show is the screen's decision (the rate columns follow the
 * ticked Loading / Unloading boxes), re-applied whenever the layout lands.
 * Rows join on `ui_tbl_clm_no`, the column number the Qt grid writes by.
 */
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import {
  COL,
  FALLBACK_COLUMN_LAYOUT,
  FALLBACK_COLUMN_TITLES,
  visibleColumnNumbers,
} from "./stock-transfer.constants";

export type LineColumn = {
  no: number;
  header: string;
  /** Share of the grid's width, in percent; the visible columns sum to 100. */
  widthPct: number;
  /** ui_tbl_clm_column_focus — recorded; Enter follows the screen's own stops. */
  focus: boolean;
};

type Placed = { no: number; header: string; width: number; position: number; focus: boolean };

export function resolveLineColumns(
  rows: readonly UiTableColumnRow[] | undefined,
  flags: { loadEnabled: boolean; unloadEnabled: boolean },
): LineColumn[] {
  const byNumber = new Map<number, UiTableColumnRow>();
  for (const row of rows ?? []) {
    const no = Number.parseInt(String(row.uiTblClmNo ?? ""), 10);
    if (Number.isFinite(no) && !byNumber.has(no)) {
      byNumber.set(no, row);
    }
  }
  const placed: Placed[] = [];
  for (const no of visibleColumnNumbers(flags)) {
    const row = byNumber.get(no);
    const fallback = FALLBACK_COLUMN_LAYOUT[no] ?? { width: 6, position: no, focus: false };
    const width =
      row && typeof row.uiTblClmColumnWidth === "number" && row.uiTblClmColumnWidth > 0
        ? row.uiTblClmColumnWidth
        : fallback.width;
    placed.push({
      no,
      header: (row?.uiTblClmName ?? "").trim() || FALLBACK_COLUMN_TITLES[no] || "",
      width: width > 0 ? width : fallback.width,
      position: row ? Number(row.uiTblClmColumnPosition ?? fallback.position) : fallback.position,
      focus: row ? row.uiTblClmColumnFocus === true : fallback.focus,
    });
  }
  for (const column of placed) {
    // The mockup's last column has no heading of its own worth reading in full.
    if (column.no === COL.LineNo) {
      column.header = column.header || "#";
    }
  }
  placed.sort((left, right) => left.position - right.position || left.no - right.no);
  const total = placed.reduce((sum, column) => sum + column.width, 0) || 1;
  return placed.map((column) => ({
    no: column.no,
    header: column.header,
    widthPct: (column.width / total) * 100,
    focus: column.focus,
  }));
}
