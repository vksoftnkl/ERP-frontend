/**
 * The line grid's columns — ui_table 55's layout (titles, widths, order, the
 * Enter stops) over the screen's own: the Unload rate shows only while the
 * Unloading box is ticked, and a receipt opened as keyed has no Sent / Received
 * / Still-in-transit (they belong to the despatch and have moved on since).
 * Rows join on `ui_tbl_clm_no`, the number the Qt grid writes its cells by.
 */
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import { COL, FALLBACK_COLUMNS, type ColumnNo } from "./branch-inward.constants";

export type LineColumn = {
  no: ColumnNo;
  header: string;
  /** Share of the grid's width, in percent; the visible columns sum to 100. */
  widthPct: number;
};

const ORDER = Object.values(COL) as ColumnNo[];

export function resolveColumns(
  rows: readonly UiTableColumnRow[] | undefined,
  opts: { unloading: boolean; asKeyed: boolean },
): LineColumn[] {
  const byNumber = new Map<number, UiTableColumnRow>();
  for (const row of rows ?? []) {
    const no = Number.parseInt(String(row.uiTblClmNo ?? ""), 10);
    if (Number.isFinite(no) && !byNumber.has(no)) {
      byNumber.set(no, row);
    }
  }
  const hidden = new Set<ColumnNo>([COL.LineNo]); // the row number is the grid's own gutter
  if (!opts.unloading) {
    hidden.add(COL.UnloadRate);
  }
  if (opts.asKeyed) {
    hidden.add(COL.Sent);
    hidden.add(COL.Received);
    hidden.add(COL.Remaining);
    hidden.add(COL.PostNote);
  }
  const placed = ORDER.filter((no) => !hidden.has(no) && byNumber.get(no)?.uiTblClmColumnVisibility !== false).map(
    (no) => {
      const row = byNumber.get(no);
      const fallback = FALLBACK_COLUMNS[no];
      const width =
        row && typeof row.uiTblClmColumnWidth === "number" && row.uiTblClmColumnWidth > 0
          ? row.uiTblClmColumnWidth
          : fallback.width;
      return {
        no,
        header: (row?.uiTblClmName ?? "").trim() || fallback.title,
        width,
        position: row ? Number(row.uiTblClmColumnPosition ?? no) : no,
      };
    },
  );
  placed.sort((a, b) => a.position - b.position || a.no - b.no);
  const total = placed.reduce((sum, column) => sum + column.width, 0) || 1;
  return placed.map((column) => ({ no: column.no, header: column.header, widthPct: (column.width / total) * 100 }));
}
