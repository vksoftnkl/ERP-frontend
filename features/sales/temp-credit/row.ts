/**
 * Temp Credits (menu 257) — one row of grid 114, "MAIN LIST - TEMP CREDITS",
 * under its SQL's own names, and the readings the register takes from it.
 *
 * A temp credit is a bill's pending amount lent to a walk-in on a promise
 * (`accounts.acc_temp_credit`, written by `/bills/post` for a TEMP_CR tender).
 * The balance is the BILL's: the row carries the bill-balance id (`atc_abl_id`)
 * and the ledger the bill was raised on (`atc_party_id`), which is what a
 * receipt collects against. Pure: no React.
 */
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import type { SaleBillDocKey } from "@/features/sales/salebill/salebill.types";
import type { TempCreditCollect } from "@/features/accounts/receipt/domain/collect";

export type TempCreditRow = {
  atc_id: string;
  atc_company_id: string;
  atc_branch_id: string;
  atc_acc_year: string;
  atc_bill_date: string;
  atc_bill_refno: string;
  atc_name: string;
  atc_mobile: string;
  atc_place: string;
  atc_credit_amount: number;
  atc_balance_amount: number;
  atc_due_date: string;
  days_overdue: number;
  atc_status: string;
  atc_promise_date: string;
  atc_created_by: string;
  /** The bill behind the credit (`sale_bill.sb_id`), for Open bill. */
  atc_src_doc_id: string;
  /** The bill-balance row a receipt ticks. */
  atc_abl_id: string;
  /** The ledger the bill was raised on — the receipt's party. */
  atc_party_id: string;
  atc_party_name: string;
};

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function number(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** The grid row behind a shell row, typed. */
export function tempCreditOf(row: MasterTableRow | null | undefined): TempCreditRow | null {
  const source = row?.__source;
  if (!source) {
    return null;
  }
  return {
    atc_id: text(source.atc_id),
    atc_company_id: text(source.atc_company_id),
    atc_branch_id: text(source.atc_branch_id),
    atc_acc_year: text(source.atc_acc_year),
    atc_bill_date: text(source.atc_bill_date),
    atc_bill_refno: text(source.atc_bill_refno),
    atc_name: text(source.atc_name),
    atc_mobile: text(source.atc_mobile),
    atc_place: text(source.atc_place),
    atc_credit_amount: number(source.atc_credit_amount),
    atc_balance_amount: number(source.atc_balance_amount),
    atc_due_date: text(source.atc_due_date),
    days_overdue: number(source.days_overdue),
    atc_status: text(source.atc_status).toUpperCase(),
    atc_promise_date: text(source.atc_promise_date),
    atc_created_by: text(source.atc_created_by),
    atc_src_doc_id: text(source.atc_src_doc_id),
    atc_abl_id: text(source.atc_abl_id),
    atc_party_id: text(source.atc_party_id),
    atc_party_name: text(source.atc_party_name),
  };
}

/** Receive and Follow-up act on money still owed; a settled row has none. */
export function hasBalance(row: TempCreditRow | null): boolean {
  return Boolean(row && row.atc_balance_amount > 0);
}

/** The bill behind the credit — null when the row does not name one. */
export function billKeyOf(row: TempCreditRow | null): SaleBillDocKey | null {
  if (!row || !row.atc_src_doc_id) {
    return null;
  }
  return {
    sbId: row.atc_src_doc_id,
    sbCompanyId: row.atc_company_id,
    sbBranchId: row.atc_branch_id,
    sbAccYear: row.atc_acc_year,
  };
}

/**
 * What the receipt needs to collect this credit. Null when the bill has no
 * open balance row behind it — then there is nothing for a receipt to settle.
 */
export function collectArgsOf(row: TempCreditRow | null): TempCreditCollect | null {
  if (!row || !row.atc_party_id) {
    return null;
  }
  return {
    partyId: row.atc_party_id,
    partyName: row.atc_party_name,
    mobile: row.atc_mobile,
    billId: row.atc_abl_id,
    ref: row.atc_bill_refno,
    name: row.atc_name,
  };
}

/** `dd-mm-yyyy` out of a date or timestamp; blank when there is none. */
export function displayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

/** The Qt dialog's title line: who, mobile, bill, balance, due. */
export function describeRow(row: TempCreditRow): string {
  return [
    row.atc_name || "—",
    row.atc_mobile || "—",
    `bill ${row.atc_bill_refno || "—"}`,
    `balance ${row.atc_balance_amount.toFixed(2)}`,
    `due ${displayDate(row.atc_due_date) || "—"}`,
  ].join(" · ");
}
