/**
 * The configured lists' columns.
 *
 * Which columns show, in what order and under what heading is the grid's own
 * config in Grid Master (`/configured-grid-sql/columns`), so a change there
 * moves the list without code. That config does not reach the client with its
 * data type or its "total" flag, so how a column FORMATS (a day, an IST time,
 * money, a count) and which money columns total are kept here, keyed by the SQL
 * alias — the same aliases the grids were seeded with (migrations
 * 20261008190000 / 20261009170000). The specs below are also the whole list
 * when the config cannot be read.
 */
import { istDateTime, shortDate } from "./dates";
import { formatPaise, paiseOf, toPaise } from "./money";
import { text } from "./parse";
import type { GridRow } from "./types";

export type ColumnFormat = "text" | "date" | "datetime" | "money" | "count";
export type ColumnAlign = "left" | "center" | "right";

export type GridColumn = {
  field: string;
  header: string;
  format: ColumnFormat;
  align: ColumnAlign;
  /** Grid Master's width — a weight, never a percent. */
  weight: number;
  visible: boolean;
  total: boolean;
};

type Spec = [field: string, header: string, format: ColumnFormat, weight: number, visible?: boolean, total?: boolean];

function specs(rows: Spec[]): GridColumn[] {
  return rows.map(([field, header, format, weight, visible = true, total = false]) => ({
    field,
    header,
    format,
    align: format === "money" || format === "count" ? "right" : format === "text" ? "left" : "center",
    weight,
    visible,
    total,
  }));
}

export type SettlementGrid =
  | "payouts"
  | "notReceived"
  | "unexplained"
  | "duplicates"
  | "suspense"
  | "pickRow";

export const FALLBACK_COLUMNS: Record<SettlementGrid, GridColumn[]> = {
  payouts: specs([
    ["asi_payout_date", "Payout Date", "date", 9],
    ["asi_payout_ref", "Payout UTR", "text", 12],
    ["asi_provider", "Provider", "text", 10],
    ["asi_source", "Source", "text", 6],
    ["tender_name", "Tender", "text", 10],
    ["asi_file_name", "File", "text", 14, false],
    ["asi_line_count", "Lines", "count", 5],
    ["asi_total_gross", "Gross", "money", 11, true, true],
    ["asi_total_fee", "Fee", "money", 9, true, true],
    ["asi_total_tax", "GST on Fee", "money", 9, true, true],
    ["asi_total_net", "Net", "money", 11, true, true],
    ["matched_count", "Matched", "count", 6],
    ["suggested_count", "Suggested", "count", 6],
    ["unmatched_count", "Unmatched", "count", 6],
    ["asi_status", "Status", "text", 8],
    ["voucher_refno", "Voucher", "text", 10],
    ["asi_imported_on", "Imported On", "datetime", 10, false],
    ["asi_void_reason", "Void Reason", "text", 14, false],
    ["asi_notes", "Notes", "text", 14, false],
  ]),
  notReceived: specs([
    ["tender_name", "Tender", "text", 9],
    ["td_doc_date", "Date", "date", 9],
    ["td_expected_settle_on", "Expected On", "date", 9],
    ["days_overdue", "Days Over", "count", 6],
    ["td_src_doc_type", "Doc Type", "text", 8, false],
    ["doc_refno", "Bill / Doc", "text", 10],
    ["session_no", "Session", "text", 9],
    ["cashier", "Cashier", "text", 9],
    ["td_total_amt", "Amount", "money", 10, true, true],
    ["td_settle_amount", "Paid So Far", "money", 10, false, true],
    ["outstanding", "Outstanding", "money", 10, true, true],
    ["td_ref_no", "Reference", "text", 12],
    ["td_auth_code", "Auth", "text", 7, false],
    ["td_card_last4", "Last 4", "text", 5],
    ["td_settle_status", "Status", "text", 7],
  ]),
  unexplained: specs([
    ["asi_payout_date", "Payout Date", "date", 9],
    ["asi_payout_ref", "Payout UTR", "text", 12],
    ["asi_provider", "Provider", "text", 9],
    ["asi_status", "Payout Status", "text", 8],
    ["tender_name", "Tender", "text", 9],
    ["asl_row_no", "Row", "count", 4, false],
    ["asl_txn_on", "Txn On", "datetime", 11],
    ["asl_terminal_id", "TID", "text", 7],
    ["asl_vpa", "VPA", "text", 10, false],
    ["asl_ref_no", "RRN / UTR", "text", 12],
    ["asl_auth_code", "Auth", "text", 7, false],
    ["asl_card_last4", "Last 4", "text", 5],
    ["asl_payer", "Payer", "text", 10],
    ["asl_gross_amount", "Gross", "money", 10, true, true],
    ["asl_net_amount", "Net", "money", 10, false, true],
    ["age_days", "Age (days)", "count", 6],
  ]),
  duplicates: specs([
    ["dup_key", "Reference", "text", 18],
    ["dup_count", "Times", "count", 5],
    ["tender_name", "Tender", "text", 9],
    ["td_doc_date", "Date", "date", 9],
    ["td_src_doc_type", "Doc Type", "text", 8, false],
    ["doc_refno", "Bill / Doc", "text", 10],
    ["td_total_amt", "Amount", "money", 10],
    ["td_ref_no", "Ref No", "text", 12, false],
    ["td_auth_code", "Auth", "text", 7, false],
    ["td_card_last4", "Last 4", "text", 5, false],
    ["session_no", "Session", "text", 9],
    ["td_created_on", "Keyed On", "datetime", 11],
  ]),
  suspense: specs([
    ["avh_voucher_date", "Date", "date", 9],
    ["avh_voucher_refno", "Voucher", "text", 10],
    ["vchr_type_code", "Type", "text", 6],
    ["avh_src_doc_type", "Source", "text", 12],
    ["avh_src_doc_id", "Source Id", "text", 8, false],
    ["debit", "Debit", "money", 10, true, true],
    ["credit", "Credit", "money", 10, true, true],
    ["avh_voucher_status", "Status", "text", 8],
    ["session_no", "Session", "text", 9],
    ["avh_remarks", "Remarks", "text", 18],
  ]),
  pickRow: specs([
    ["tender_name", "Tender", "text", 9],
    ["td_doc_date", "Date", "date", 8],
    ["td_created_on", "Keyed On", "datetime", 11],
    ["td_src_doc_type", "Doc Type", "text", 8, false],
    ["doc_refno", "Bill / Doc", "text", 10],
    ["session_no", "Session", "text", 9],
    ["cashier", "Cashier", "text", 8, false],
    ["td_dr_cr", "Dr / Cr", "text", 4, false],
    ["td_total_amt", "Amount", "money", 10],
    ["td_settle_amount", "Settled", "money", 9, false],
    ["outstanding", "Outstanding", "money", 10],
    ["td_ref_no", "RRN / UTR", "text", 12],
    ["td_auth_code", "Auth", "text", 7],
    ["td_card_last4", "Last 4", "text", 5],
    ["td_payer_vpa", "Payer VPA", "text", 10, false],
    ["td_settle_status", "Status", "text", 7],
    ["td_expected_settle_on", "Expected On", "date", 8, false],
  ]),
};

/** One configured column, as `/configured-grid-sql/columns` normalises it. */
export type ConfiguredColumn = {
  field: string;
  header: string;
  visible: boolean;
  order: number;
  align?: ColumnAlign;
};

/** A column the specs do not name: its format guessed from its alias. */
function guessFormat(field: string): ColumnFormat {
  if (/_on$/.test(field)) return "datetime";
  if (/_date$/.test(field)) return "date";
  if (/(amount|amt|gross|net|fee|tax|debit|credit|outstanding)$/.test(field)) return "money";
  if (/(_count|_days|_no)$/.test(field) && !/(ref_no|session_no)$/.test(field)) return "count";
  return "text";
}

/**
 * The visible columns, in Grid Master's order with its headings and
 * alignment; the specs say how each formats. No config → the specs.
 */
export function mergeColumns(fallback: readonly GridColumn[], configured: readonly ConfiguredColumn[]): GridColumn[] {
  const usable = configured.filter((column) => column.field);
  if (usable.length === 0) return fallback.filter((column) => column.visible);
  const byField = new Map(fallback.map((column) => [column.field, column]));
  return [...usable]
    .sort((a, b) => a.order - b.order)
    .filter((column) => column.visible)
    .map((column) => {
      const spec = byField.get(column.field);
      const format = spec?.format ?? guessFormat(column.field);
      return {
        field: column.field,
        header: column.header || spec?.header || column.field,
        format,
        align: column.align ?? spec?.align ?? (format === "money" || format === "count" ? "right" : "left"),
        weight: spec?.weight ?? 9,
        visible: true,
        total: spec?.total ?? false,
      };
    });
}

export function cellText(row: GridRow, column: GridColumn): string {
  const raw = text(row, column.field);
  switch (column.format) {
    case "date":
      return shortDate(raw);
    case "datetime":
      return istDateTime(raw) || shortDate(raw);
    case "money": {
      const paise = toPaise(row[column.field]);
      return paise === null ? "" : formatPaise(paise);
    }
    default:
      return raw;
  }
}

/** The money columns' totals, paise, for the columns marked to total. */
export function columnTotals(rows: readonly GridRow[], columns: readonly GridColumn[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const column of columns) {
    if (!column.total || column.format !== "money") continue;
    totals[column.field] = rows.reduce((sum, row) => sum + paiseOf(row[column.field]), 0);
  }
  return totals;
}
