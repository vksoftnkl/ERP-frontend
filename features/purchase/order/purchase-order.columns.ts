/**
 * The line grid's columns — ui_table 57's layout over the columns this screen
 * draws (`PO_COLUMN_NUMBERS`). Pure. Since the 2026-10-29 rebuild Qt
 * `applyColumns` sets every title, shows every mockup column and moves them to
 * the mockup's order, whatever the layout says — so does this; a column number the screen does not know (one the layout
 * grows later) is never drawn, and the hidden carriers (14 ItemId, 15 UomId,
 * 16 LineId) are fields of the line, not columns.
 *
 * Widths: Qt's ColumnWeights (bcd844a: the pixels each column needs, 23 in
 * 1560 px; 56 for one it has no weight for) normalised to shares of 100 — the
 * layout's `ui_tbl_clm_column_width` is not read, as Qt's weights win.
 */
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import { PO_COLUMN_NUMBERS, PO_FALLBACK_COLUMNS } from "./purchase-order.constants";

export type PoGridColumn = {
  no: number;
  header: string;
  /** The heading as drawn — two lines where Qt breaks it ("Chrg\nbefore tax"); else the header. */
  heading: string;
  /** The heading's tooltip (Qt bcd844a: what the split / landing columns are). */
  tip: string;
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
  const placed: { no: number; header: string; heading: string; tip: string; width: number; position: number }[] = [];
  for (const no of PO_COLUMN_NUMBERS) {
    const row = byNumber.get(no);
    const fallback = PO_FALLBACK_COLUMNS[no];
    // Qt applyColumns: the mockup's titles, widths and order win over the layout's
    const header = fallback?.title || (row?.uiTblClmName ?? "").trim() || "";
    placed.push({
      no,
      header,
      heading: fallback?.heading || header,
      tip: fallback?.tip ?? "",
      width: fallback?.width || 56,
      position: PO_COLUMN_NUMBERS.indexOf(no),
    });
  }
  placed.sort((left, right) => left.position - right.position);
  const total = placed.reduce((sum, column) => sum + column.width, 0) || 1;
  return placed.map((column) => ({
    no: column.no,
    header: column.header,
    heading: column.heading,
    tip: column.tip,
    widthPct: (column.width / total) * 100,
  }));
}
