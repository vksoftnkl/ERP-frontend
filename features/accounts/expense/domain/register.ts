/**
 * F8's register (Qt `ExpenseVoucherEntry::showList`, 6f15977): grid 137
 * "MAIN LIST - EXPENSE VOUCHERS" — the same list the menu lands on — opened
 * over the entry screen as a PICKER. Its rows, as the picker paints them, and
 * the window it opens on.
 *
 * No React, no fetch.
 */
import { addDays } from "@/features/sales/quotation/quotation.utils";
import type { ExpenseKeys, ExpenseScope } from "../expense.types";
import { formatMoney } from "./money";

/** Qt's picker opens on the last N days (`defaultDaysBack`), as the menu's list does here. */
export const REGISTER_WINDOW_DAYS = 30;

export type RegisterFilters = {
  /** "" = every status. */
  status: string;
  fromDate: string;
  toDate: string;
};

export function defaultRegisterFilters(today: string): RegisterFilters {
  return { status: "", fromDate: addDays(today, -REGISTER_WINDOW_DAYS), toDate: today };
}

export type RegisterRow = {
  /** The whole document key — the row's own, never the session's. */
  keys: ExpenseKeys;
  date: string;
  /** A draft takes its number at post. */
  number: string;
  paidTo: string;
  heads: string;
  amount: string;
  tenders: string;
  gstBillNo: string;
  session: string;
  status: string;
  cancelled: boolean;
};

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

/**
 * One grid-137 row. A key the row leaves out falls back to the scope it was
 * listed under (the grid filters on all three); a row without a voucher id
 * cannot be opened and is dropped.
 */
export function registerRowOf(row: Record<string, unknown>, scope: ExpenseScope): RegisterRow | null {
  const voucherId = text(row.avh_voucher_id);
  if (!voucherId) {
    return null;
  }
  const status = text(row.avh_voucher_status).toUpperCase();
  return {
    keys: {
      voucherId,
      companyId: text(row.avh_company_id) || scope.companyId,
      branchId: text(row.avh_branch_id) || scope.branchId,
      accYear: text(row.avh_acc_year) || scope.accYear,
    },
    date: text(row.avh_voucher_date).slice(0, 10),
    number: text(row.avh_voucher_refno) || "— draft —",
    paidTo: text(row.paid_to),
    heads: text(row.expense_heads),
    amount: formatMoney(row.avh_doc_amount),
    tenders: text(row.tenders),
    gstBillNo: text(row.gst_bill_no),
    session: text(row.session_no),
    status,
    cancelled: status === "CANCELLED",
  };
}

export function registerRowsOf(rows: readonly Record<string, unknown>[], scope: ExpenseScope): RegisterRow[] {
  return rows.map((row) => registerRowOf(row, scope)).filter((row): row is RegisterRow => row !== null);
}

/** Up / Down move the highlight within the page, stopping at either end. */
export function stepHighlight(rows: readonly RegisterRow[], activeId: string | null, step: 1 | -1): string | null {
  if (rows.length === 0) {
    return null;
  }
  const at = rows.findIndex((row) => row.keys.voucherId === activeId);
  const from = at < 0 ? 0 : at;
  const next = Math.min(rows.length - 1, Math.max(0, from + step));
  return rows[next].keys.voucherId;
}
