/**
 * The line grid's columns — ui_table 57's layout over the columns this screen
 * draws (`PO_COLUMN_NUMBERS`). Pure. The layout supplies titles, widths, order
 * and visibility; a column number the screen does not know (one the layout
 * grows later) is never drawn, and the hidden carriers (14 ItemId, 15 UomId,
 * 16 LineId) are fields of the line, not columns.
 *
 * Widths: `ui_tbl_clm_column_width` is the Qt FRACTION, not a percent — the
 * visible ones are normalised to shares of 100.
 */
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import { PO_COLUMN_NUMBERS, PO_FALLBACK_COLUMNS } from "./purchase-order.constants";

export type PoGridColumn = {
  no: number;
  header: string;
  /** Share of the grid's width, in percent; the drawn columns sum to 100. */
  widthPct: number;
};

export function resolvePoColumns(rows: readonly UiTableColumnRow[] | undefined): PoGridColumn[] {
  const byNumber = new Map<number, UiTableColumnRow>();
  for (const row of rows ?? []) {
    const no = Number.parseInt(String(row.uiTblClmNo ?? ""), 10);
    if (Number.isFinite(no) && !byNumber.has(no)) {
      byNumber.set(no, row);
    }
  }
  const placed: { no: number; header: string; width: number; position: number }[] = [];
  for (const no of PO_COLUMN_NUMBERS) {
    const row = byNumber.get(no);
    const fallback = PO_FALLBACK_COLUMNS[no];
    if (row && row.uiTblClmColumnVisibility === false) {
      continue;
    }
    const stored = row && typeof row.uiTblClmColumnWidth === "number" && row.uiTblClmColumnWidth > 0 ? row.uiTblClmColumnWidth : 0;
    placed.push({
      no,
      header: (row?.uiTblClmName ?? "").trim() || fallback?.title || "",
      width: stored || fallback?.width || 6,
      position: row && Number.isFinite(Number(row.uiTblClmColumnPosition)) ? Number(row.uiTblClmColumnPosition) : no,
    });
  }
  placed.sort((left, right) => left.position - right.position || left.no - right.no);
  const total = placed.reduce((sum, column) => sum + column.width, 0) || 1;
  return placed.map((column) => ({ no: column.no, header: column.header, widthPct: (column.width / total) * 100 }));
}
