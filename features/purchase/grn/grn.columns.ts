/**
 * The line grid's columns — the Qt `GrnEntry::applyColumns` of the 2026-10-29
 * rebuild: the mockup's order and titles, the `ColumnWeights` proportions (no
 * sideways scroll at 1560 px), whatever ui_table 58 says. Qt renames and moves
 * every section itself and shows the mockup's columns 32.. that ui_table 58 does
 * not register yet, so the layout rows no longer decide anything here. Size /
 * Colour / Model, Sell A–D and Excess show only under the screen's rule
 * (`hidden`). Pure.
 */
import { DRAWN_COLUMNS, FALLBACK_COLUMNS, TEXTILE_WEIGHTS, type ColumnNo } from "./grn.constants";

export type GrnColumn = {
  no: ColumnNo;
  header: string;
  /** Share of the grid's width, in percent; the drawn columns sum to 100. */
  widthPct: number;
};

export function resolveGrnColumns(hidden: ReadonlySet<number> = new Set(), textile = false): GrnColumn[] {
  const placed = DRAWN_COLUMNS.filter((no) => !hidden.has(no)).map((no) => ({
    no,
    header: FALLBACK_COLUMNS[no].title,
    width: (textile ? TEXTILE_WEIGHTS[no] : undefined) ?? FALLBACK_COLUMNS[no].width,
  }));
  const total = placed.reduce((sum, column) => sum + column.width, 0) || 1;
  return placed.map((column) => ({ no: column.no, header: column.header, widthPct: (column.width / total) * 100 }));
}
