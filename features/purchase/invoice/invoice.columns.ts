/**
 * The line grid's columns — ui_table 56's layout (Qt NexERP dd59c2c P4,
 * 1600680 Q2). Pure.
 *
 * - The LAYOUT decides which columns show, their titles and their order
 *   (`ui_tbl_clm_column_position`); there is no "More columns" chooser any
 *   more. The screen only takes away what its settings rule out: Markup A–D /
 *   Sell A–D without the price policy, Model / Size / Colour without
 *   stock.auto_batch_no (Qt `applyColumns`). Nothing forces a hidden column
 *   back — Recd, Dmg, Short, Cost incl. and HSN are hidden by the registration
 *   (server migration 20261102160000) and stay so.
 * - Before (or without) the layout every drawn column shows, in the
 *   registration's order (Qt: `m_layoutKnown` false).
 * - Rows join on `ui_tbl_clm_no`, the column number the Qt grid writes by; a
 *   number the screen does not draw (the technical ones) is never shown.
 * - Widths are the pixels each column needs (Qt `ColumnWeights::setPixelFloor`,
 *   `COLUMN_PX`); the grid draws them in the page unit and scrolls sideways
 *   when they do not fit. A heading of two words or more and over 8 letters
 *   breaks onto two lines near its middle (Qt `layoutLoaded`).
 */
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import {
  COL,
  COLUMN_PX,
  COLUMN_PX_FALLBACK,
  COLUMN_PX_MIN,
  DRAWN_COLUMNS,
  FALLBACK_COLUMN_TITLES,
  FALLBACK_ORDER,
  PRICE_COLUMNS,
  TEXTILE_COLUMNS,
} from "./invoice.constants";
import type { LineSettings } from "./invoice.types";

export type LineColumn = {
  no: number;
  /** The layout's title (or the registration's, before the layout). */
  header: string;
  /** The heading as drawn — two lines where Qt breaks it ("Chrg before\ntax"). */
  heading: string;
  /** The pixels the column needs (drawn in the page unit). */
  px: number;
};

const NO_RULES: LineSettings = { priceUpdate: false, autoBatchNo: false };

/** Qt `layoutLoaded`: a heading with a space and over 8 letters takes two lines, broken at the space nearest its middle. */
export function twoLineHeading(title: string): string {
  if (!title.includes(" ") || title.length <= 8) {
    return title;
  }
  const mid = Math.floor(title.length / 2);
  let at = title.lastIndexOf(" ", mid);
  const after = title.indexOf(" ", mid);
  if (at < 0 || (after >= 0 && after - mid < mid - at)) {
    at = after;
  }
  return at > 0 ? `${title.slice(0, at)}\n${title.slice(at + 1)}` : title;
}

/** Does a session rule take the column away (Qt `applyColumns`)? */
function ruledOut(no: number, rules: LineSettings): boolean {
  return (PRICE_COLUMNS.has(no) && !rules.priceUpdate) || (TEXTILE_COLUMNS.has(no) && !rules.autoBatchNo);
}

export function resolveLineColumns(rows: readonly UiTableColumnRow[] | undefined, rules: LineSettings = NO_RULES): LineColumn[] {
  const byNumber = new Map<number, UiTableColumnRow>();
  for (const row of rows ?? []) {
    const no = Number.parseInt(String(row.uiTblClmNo ?? ""), 10);
    if (Number.isFinite(no) && DRAWN_COLUMNS.has(no) && !byNumber.has(no)) {
      byNumber.set(no, row);
    }
  }
  const layoutKnown = byNumber.size > 0;
  let order: number[];
  if (layoutKnown) {
    // The layout's positions; a drawn column the layout lacks a row for goes after them, in the registration's order.
    const listed = [...byNumber.values()]
      .map((row, index) => ({ no: Number.parseInt(String(row.uiTblClmNo), 10), position: Number(row.uiTblClmColumnPosition), index }))
      .sort((left, right) => {
        const a = Number.isFinite(left.position) ? left.position : Number.MAX_SAFE_INTEGER;
        const b = Number.isFinite(right.position) ? right.position : Number.MAX_SAFE_INTEGER;
        return a - b || left.index - right.index;
      })
      .map((entry) => entry.no);
    order = [...listed, ...FALLBACK_ORDER.filter((no) => !byNumber.has(no))];
  } else {
    order = [...FALLBACK_ORDER];
  }
  const out: LineColumn[] = [];
  for (const no of order) {
    if (ruledOut(no, rules)) {
      continue;
    }
    const row = byNumber.get(no);
    // Item is how a line gets its item: it never hides (the web's own guard; Qt follows the layout here too).
    if (row && row.uiTblClmColumnVisibility === false && no !== COL.Item) {
      continue;
    }
    const header = (row?.uiTblClmName ?? "").trim() || FALLBACK_COLUMN_TITLES[no] || "";
    out.push({ no, header, heading: twoLineHeading(header), px: Math.max(COLUMN_PX_MIN, COLUMN_PX[no] ?? COLUMN_PX_FALLBACK) });
  }
  return out;
}

/** The grid's natural width (Σ the columns' pixels) — below it the lines scroll sideways. */
export function lineColumnsPx(columns: readonly LineColumn[]): number {
  return columns.reduce((sum, column) => sum + column.px, 0);
}
