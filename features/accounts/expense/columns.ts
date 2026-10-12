/**
 * The two grids' columns: what each one MEANS here, joined to what
 * `ui_tables` 51 "EXPENSE VOUCHER - LINES" and 52 "EXPENSE VOUCHER - TENDERS"
 * say about order, heading, width and visibility (Qt d97cdd4 `NexTable`).
 *
 * The join is the receipt's (`resolveReceiptColumns`): by heading first, by
 * `ui_tbl_clm_no` second, ordered by `ui_tbl_clm_column_position`.
 *
 * Two lists per grid:
 *  - the LAYOUT (`resolve…Layout`) — every configured column, hidden ones
 *    included: what the right-click Admin-settings dialog lists and what
 *    drag-to-widen works on (`useGridSettings` / `useColumnResize`, shared with
 *    the receipt and the quotation);
 *  - the VISIBLE columns (`visible…Columns`) — what the grid draws.
 *
 * ── Widths are SHARES of the grid ────────────────────────────────────────
 * Both layouts were written by the Qt client as shares of 100, and Qt lays
 * them out that way: the grid always fits its block. So each visible column
 * gets its share of the visible columns' widths, on a `width: 100%` table —
 * safe because the table's width comes from its shell, never from its content
 * (the 33-million-pixel runaway is a percent column on a `max-content` table).
 * The width each share is taken from is the house one (`ui_tbl_clm_px` once a
 * column was dragged, else the stored fraction), so drag-to-widen and "save
 * column width" work as on every other grid. Drawn in the house's own pixel
 * unit instead, the tenders grid (1100 config px) scrolls sideways even on a
 * 1900 px screen.
 *
 * The GST columns (HSN/SAC, GST, ITC, Tax) show only with a GST bill,
 * whatever the layout says (Qt `applyLineColumns`).
 */
import {
  resolveReceiptColumns,
  type ReceiptColumnMeaning,
  type ResolvedReceiptColumn,
} from "@/features/accounts/receipt/columns";
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";

export type LineColumnKey =
  | "rowNo"
  | "reason"
  | "ledger"
  | "description"
  | "hsn"
  | "amount"
  | "gst"
  | "itc"
  | "tax"
  | "total";

export type TenderColumnKey = "tender" | "account" | "ref" | "amount";

const LINE_MEANINGS: ReceiptColumnMeaning<LineColumnKey>[] = [
  { key: "rowNo", token: "#", kind: "serial", align: "center" },
  { key: "reason", token: "Reason", kind: "picker", align: "left" },
  { key: "ledger", token: "Expense ledger", kind: "picker", align: "left", aliases: ["Ledger"] },
  { key: "description", token: "Description", kind: "text", align: "left" },
  { key: "hsn", token: "HSN/SAC", kind: "text", align: "left", aliases: ["HSN"] },
  { key: "amount", token: "Amount", kind: "money", align: "right", aliases: ["Taxable"] },
  { key: "gst", token: "GST", kind: "picker", align: "left" },
  { key: "itc", token: "ITC", kind: "chip", align: "center" },
  { key: "tax", token: "Tax", kind: "money", align: "right" },
  { key: "total", token: "Total", kind: "money", align: "right" },
];

const LINE_NUMBERS: Record<LineColumnKey, number> = {
  rowNo: 0,
  reason: 1,
  ledger: 2,
  description: 3,
  hsn: 4,
  amount: 5,
  gst: 6,
  itc: 7,
  tax: 8,
  total: 9,
};

const TENDER_MEANINGS: ReceiptColumnMeaning<TenderColumnKey>[] = [
  { key: "tender", token: "Tender", kind: "picker", align: "left" },
  { key: "account", token: "Account", kind: "text", align: "left" },
  { key: "ref", token: "Ref", kind: "text", align: "left" },
  { key: "amount", token: "Amount", kind: "money", align: "right" },
];

const TENDER_NUMBERS: Record<TenderColumnKey, number> = { tender: 0, account: 1, ref: 2, amount: 3 };

/** Without a GST bill these are hidden, whatever the layout says. */
const GST_ONLY: ReadonlySet<LineColumnKey> = new Set<LineColumnKey>(["hsn", "gst", "itc", "tax"]);

function fallbackRows(names: readonly string[], widths: readonly number[]): UiTableColumnRow[] {
  return names.map((name, index) => ({
    uiTblClmId: "",
    uiTblClmNo: String(index),
    uiTblClmName: name,
    uiTblClmColumnWidth: widths[index] ?? 10,
    uiTblClmColumnVisibility: true,
    uiTblClmColumnFocus: false,
    uiTblClmColumnPosition: index,
    uiTblClmColumnNecessity: false,
  }));
}

/** The Qt seed (`setupGrids`), used until — or if never — the layout loads. */
const LINE_FALLBACK = fallbackRows(
  ["#", "Reason", "Expense ledger", "Description", "HSN/SAC", "Amount", "GST", "ITC", "Tax", "Total"],
  [4, 13, 17, 15, 8, 10, 9, 6, 8, 10],
);
const TENDER_FALLBACK = fallbackRows(["Tender", "Account", "Ref", "Amount"], [22, 38, 20, 20]);

export type ExpenseColumn<TKey extends string> = ResolvedReceiptColumn<TKey>;

/**
 * The configured layout, or the Qt seed until it loads. A seed column has no
 * `ui_tbl_clm_id`, so the settings dialog pins it and nothing is saved for it.
 */
function resolveLayout<TKey extends string>(
  rows: UiTableColumnRow[] | undefined,
  fallback: UiTableColumnRow[],
  meanings: ReceiptColumnMeaning<TKey>[],
  numbers: Record<TKey, number>,
): ExpenseColumn<TKey>[] {
  if (rows && rows.length > 0) {
    return resolveReceiptColumns(rows, meanings, numbers);
  }
  return resolveReceiptColumns(fallback, meanings, numbers).map((column) => ({ ...column, columnId: null }));
}

/** Every configured column of the lines grid (ui_table 51), hidden ones included. */
export function resolveLineLayout(rows: UiTableColumnRow[] | undefined): ExpenseColumn<LineColumnKey>[] {
  return resolveLayout(rows, LINE_FALLBACK, LINE_MEANINGS, LINE_NUMBERS);
}

/** Every configured column of the tenders grid (ui_table 52), hidden ones included. */
export function resolveTenderLayout(rows: UiTableColumnRow[] | undefined): ExpenseColumn<TenderColumnKey>[] {
  return resolveLayout(rows, TENDER_FALLBACK, TENDER_MEANINGS, TENDER_NUMBERS);
}

/** What the lines grid draws: the layout's visible columns, the GST ones only with a bill. */
export function visibleLineColumns(
  layout: readonly ExpenseColumn<LineColumnKey>[],
  gstBill: boolean,
): ExpenseColumn<LineColumnKey>[] {
  return (
    layout
      .filter((column) => column.visible && (gstBill || !GST_ONLY.has(column.key)))
      // With a GST bill the amount typed is the TAXABLE value (Qt renames the heading).
      .map((column) => (column.key === "amount" && gstBill ? { ...column, header: "Taxable" } : column))
  );
}

/** What the tenders grid draws. */
export function visibleTenderColumns(layout: readonly ExpenseColumn<TenderColumnKey>[]): ExpenseColumn<TenderColumnKey>[] {
  return layout.filter((column) => column.visible);
}

/** The visible columns' widths, summed: what each column takes its share of. */
export function columnsWidthPx(columns: readonly { widthPx: number }[]): number {
  return columns.reduce((sum, column) => sum + column.widthPx, 0);
}

/** One column's share of the grid, as a CSS width. */
export function columnShare(widthPx: number, totalPx: number): string {
  return totalPx > 0 ? `${((widthPx / totalPx) * 100).toFixed(3)}%` : "auto";
}
