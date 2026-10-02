/**
 * The line grid's columns — ui_table 41's layout joined to the kind's
 * visibility (applyKindColumns + seedLocalLayout of the Qt screen). Pure.
 *
 * The layout supplies titles, widths, order and the Enter stops; WHICH columns
 * show is the kind's decision, re-applied whenever the layout lands so a late
 * answer cannot undo it. Rows join on `ui_tbl_clm_no`, the column number — the
 * key the Qt grid writes its cells by — so a renamed column keeps its meaning.
 */
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import {
  COL,
  FALLBACK_COLUMN_LAYOUT,
  FALLBACK_COLUMN_TITLES,
  kindColumns,
  type Kind,
} from "./stock-adjustment.constants";

export type LineColumn = {
  /** The ui_table 41 column number (31 / 32 for the two screen-made ones). */
  no: number;
  header: string;
  /** Share of the grid's width, in percent; the visible columns sum to 100. */
  widthPct: number;
  /** ui_tbl_clm_column_focus — Enter stops here. */
  focus: boolean;
};

type Placed = { no: number; header: string; width: number; position: number; focus: boolean };

export function resolveLineColumns(rows: readonly UiTableColumnRow[] | undefined, kind: Kind): LineColumn[] {
  const byNumber = new Map<number, UiTableColumnRow>();
  for (const row of rows ?? []) {
    const no = Number.parseInt(String(row.uiTblClmNo ?? ""), 10);
    if (Number.isFinite(no) && !byNumber.has(no)) {
      byNumber.set(no, row);
    }
  }
  const shown = kindColumns(kind);
  const placed: Placed[] = [];
  for (const no of shown) {
    const row = byNumber.get(no);
    const fallback = FALLBACK_COLUMN_LAYOUT[no] ?? { width: 6, position: no, focus: false };
    const width = row && typeof row.uiTblClmColumnWidth === "number" && row.uiTblClmColumnWidth > 0
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

  // The two screen-made columns: the arrow sits between From and To, the row
  // note at the end — wherever the layout put the columns around them.
  const bucket = placed.find((column) => column.no === COL.Bucket);
  const maxPosition = placed.reduce((max, column) => Math.max(max, column.position), 0);
  for (const column of placed) {
    if (column.no === COL.Arrow) {
      column.position = bucket ? bucket.position + 0.5 : column.position;
    }
    if (column.no === COL.Hint) {
      column.position = maxPosition + 1;
    }
    // The per-kind titles the Qt screen sets over the layout's.
    if (column.no === COL.Bucket) {
      column.header = kind === "Move" ? "From" : "Bucket";
    }
    if (column.no === COL.ToBucket) {
      column.header = "To";
    }
    if (column.no === COL.Arrow || column.no === COL.Hint) {
      column.header = "";
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
