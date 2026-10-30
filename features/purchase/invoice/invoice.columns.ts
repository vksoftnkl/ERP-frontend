/**
 * The line grid's columns — ui_table 56's layout over the columns this screen
 * draws. Pure. The layout supplies titles, widths, order and visibility (an
 * admin may hide a column from the grid's right-click settings); WHICH columns
 * can show at all is `SHOWN_COLUMNS`, narrowed by the session's rules the way
 * Qt `applyTextileColumns` hides them: Sell A–D and Markup only while the bill
 * keys selling prices, Size / Colour / Model only while the company numbers its
 * own batches. Rows join on `ui_tbl_clm_no`, the column number the Qt grid
 * writes by.
 *
 * `ui_tbl_clm_column_width` is a Qt fraction, not a percent (the visible
 * columns of table 56 sum to far more than 100): it is used as a weight, and
 * every column's share is its weight over the shown columns' total.
 */
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import {
  COL,
  FALLBACK_COLUMN_TITLES,
  FALLBACK_COLUMN_WIDTHS,
  MOCKUP_COLUMN_TITLES,
  MORE_COLUMN_NOS,
  PRICE_COLUMNS,
  SHOWN_COLUMNS,
  TEXTILE_COLUMNS,
} from "./invoice.constants";
import type { LineSettings } from "./invoice.types";

export type LineColumn = {
  no: number;
  header: string;
  /** Share of the grid's width, in percent; the shown columns sum to 100. */
  widthPct: number;
  /** The layout's own weight — the grid's minimum width follows the total. */
  weight: number;
};

const NO_RULES: LineSettings = { priceUpdate: false, autoBatchNo: false };

/**
 * `moreShown` = the column numbers picked under More columns (Qt `m_moreOn`):
 * Sch % / Extra disc / Cost incl. / PO / GRN ref and Sell B–D stay hidden
 * without it. The order is the mockup's (`SHOWN_COLUMNS`) — Qt moves the
 * sections there whatever the layout's positions say; the layout still
 * supplies widths and may hide a column.
 */
export function resolveLineColumns(
  rows: readonly UiTableColumnRow[] | undefined,
  rules: LineSettings = NO_RULES,
  moreShown: ReadonlySet<number> = new Set(),
): LineColumn[] {
  const byNumber = new Map<number, UiTableColumnRow>();
  for (const row of rows ?? []) {
    const no = Number.parseInt(String(row.uiTblClmNo ?? ""), 10);
    if (Number.isFinite(no) && !byNumber.has(no)) {
      byNumber.set(no, row);
    }
  }
  const placed: { no: number; header: string; width: number; position: number }[] = [];
  SHOWN_COLUMNS.forEach((no, index) => {
    if ((PRICE_COLUMNS.has(no) && !rules.priceUpdate) || (TEXTILE_COLUMNS.has(no) && !rules.autoBatchNo)) {
      return;
    }
    if (MORE_COLUMN_NOS.has(no) && !moreShown.has(no)) {
      return;
    }
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
    placed.push({
      no,
      header: MOCKUP_COLUMN_TITLES[no] || (row?.uiTblClmName ?? "").trim() || FALLBACK_COLUMN_TITLES[no] || "",
      width,
      position: index,
    });
  });
  placed.sort((left, right) => left.position - right.position);
  const total = placed.reduce((sum, column) => sum + column.width, 0) || 1;
  return placed.map((column) => ({
    no: column.no,
    header: column.header,
    widthPct: (column.width / total) * 100,
    weight: column.width,
  }));
}
