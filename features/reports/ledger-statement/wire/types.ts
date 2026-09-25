/**
 * Ledger Statement — the response shapes of `/reports/ledger-statement/*`.
 *
 * Mirrors the SERVER's `ledger-statement.types.ts` (read 2026-09-25, while the
 * routes were still being written), not the plan's examples. Four places differ
 * from the plan, and the server wins in each:
 *
 * - `SidedAmount.side` is never null on the server ("zero reads as 0.00 DR").
 *   The plan has `null` on zero. `Bal` accepts both, and `money.ts` prints a
 *   zero with no side whichever arrives.
 * - `header.ledger.creditLimit` exists (a customer's `cus_credit_amt_limit`).
 * - `branchId`, `branchName`, `voucherTypeShort`, `voucherNo` and all three
 *   `src` fields are nullable.
 * - `/voucher-legs` needs `ledgerId` (it marks `isThisLedger`).
 *
 * Amounts are strings with two decimals, and they stay strings (plan §4.2).
 */

export type Side = "DR" | "CR";

/** A balance: the magnitude and its side. `side` is null only on zero, if at all. */
export type Bal = { amount: string; side: Side | null };

export type RowKind = "NORMAL" | "CANCELLED" | "REVERSAL";

export type LedgerPickItem = {
  ledgerId: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
  isBillByBill: boolean;
  /** `led_company_id IS NULL`: the same ledger in every company. */
  isShared: boolean;
};

export type LedgerPickPayload = { items: LedgerPickItem[] };

export type LedgerFacts = {
  ledgerId: string;
  name: string;
  groupName: string | null;
  nature: string | null;
  isBillByBill: boolean;
  gstin: string | null;
  mobile: string | null;
  creditDays: number | null;
  creditLimit: string | null;
};

export type PeriodSummary = {
  fromDate: string;
  toDate: string;
  opening: Bal;
  debit: { amount: string; vouchers: number };
  credit: { amount: string; vouchers: number };
  closing: Bal;
  cancelledPairs: number;
  /** `COMPANY_LEVEL_ONLY`: a branch view of a ledger opened only at company level. */
  openingNote: string | null;
};

export type HeaderPayload = { ledger: LedgerFacts; period: PeriodSummary };

export type VoucherLeg = {
  rowNo: number;
  side: Side;
  ledgerId: string;
  ledgerName: string | null;
  amount: string;
  role: string | null;
  isThisLedger: boolean;
  remarks: string | null;
};

export type VoucherSrc = {
  module: string | null;
  docType: string | null;
  docId: string | null;
};

export type VoucherRow = {
  voucherId: string;
  accYear: string;
  branchId: string | null;
  branchName: string | null;
  date: string;
  voucherTypeId: number;
  voucherTypeName: string | null;
  voucherTypeShort: string | null;
  voucherNo: string | null;
  status: string;
  rowKind: RowKind;
  pairOutsideRange: boolean;
  particulars: string | null;
  asPerDetails: boolean;
  legCount: number;
  narration: string | null;
  billRefs: string[];
  debit: string;
  credit: string;
  balance: Bal;
  createdBy: string | null;
  src: VoucherSrc | null;
  /** Only with `withLegs=true`. */
  legs?: VoucherLeg[];
};

export type VoucherPage = {
  broughtForward: Bal;
  rows: VoucherRow[];
  carriedForward: Bal;
  page: { page: number; pageSize: number; totalRows: number };
};

export type VoucherLegsPayload = {
  voucherId: string;
  accYear: string;
  voucherNo: string | null;
  date: string;
  status: string;
  legs: VoucherLeg[];
};

export type DailyRow = {
  date: string;
  debit: string;
  credit: string;
  vouchers: number;
  closing: Bal;
};

export type DailyPayload = { opening: Bal; days: DailyRow[]; closing: Bal };

export type MonthlyRow = {
  /** `YYYY-MM` */
  month: string;
  debit: string;
  credit: string;
  closing: Bal;
  isFuture: boolean;
};

export type MonthlyPayload = { opening: Bal; months: MonthlyRow[]; closing: Bal };

export type ExportPayload = HeaderPayload & {
  broughtForward: Bal;
  rows: VoucherRow[];
  carriedForward: Bal;
  totalRows: number;
};
