/**
 * Enter on a voucher → its own screen (plan §8.2); Enter on a ledger → the
 * Ledger Statement (§9.3). Routes, not behaviour: this is the only place the
 * feature looks at what kind of document a row is.
 *
 * The plan reads `src.module` + `src.docType` first, then falls back to "the
 * Voucher Register in view mode by voucherId + accYear". Two facts from the
 * dev database (2026-10-12) shape what that can mean today:
 *
 *  - Rows WITH a `src` are documents (SALES/SALE_BILL, STOCK/OPENING,
 *    TILL/TILL_MOVEMENT, …) and none of those screens opens by key yet. The
 *    one `src` route kept is ACCOUNTS/RECEIPT, which the ledger statement's
 *    server is asked to send for receipts.
 *  - Rows WITHOUT a `src` are the vouchers' own types (Receipt, Payment,
 *    Journal, the notes, Expense, …), and each of those has a keyed screen
 *    taking the voucher id. The Voucher Register has no keyed view mode, so
 *    the fallback is by voucher TYPE onto those screens.
 *
 * Unmapped → null, and the screen says "no screen opens this voucher type yet".
 *
 * THE KEY IS THE ROW'S. `branchId` comes from the row; when the server does
 * not send it (a FORWARD field), the report's own one-branch scope stands in,
 * since every row of a one-branch list is in that branch. Under All branches
 * with no row branch there is no key, and no guess.
 */
import { buildSearch as buildLedgerSearch } from "@/features/reports/ledger-statement/query/params";
import type { Src, VoucherRow } from "../wire/types";

export const LEDGER_STATEMENT_HREF = "/reports/ledger-statement";
export const NO_SCREEN_MESSAGE = "No screen opens this voucher type yet.";

type DocKey = { companyId: string; branchId: string; accYear: string; docId: string };

const seg = encodeURIComponent;

function keyed(base: string) {
  return (k: DocKey) => `${base}/${seg(k.companyId)}/${seg(k.branchId)}/${seg(k.accYear)}/${seg(k.docId)}`;
}

/** `src.module/src.docType` → a screen opened by `src.docId`. */
const SRC_SCREENS: Record<string, (k: DocKey) => string> = {
  "ACCOUNTS/RECEIPT": keyed("/accounts/receipt"),
};

/** `acc_voucher_types.vchr_type_id` → the screen that opens one voucher by its four keys. */
const VOUCHER_SCREENS: Record<number, (k: DocKey) => string> = {
  12: keyed("/accounts/receipt"), // Receipt
  24: keyed("/accounts/journal"), // Journal
  26: keyed("/accounts/debit-note"), // Debit Note
  27: keyed("/accounts/credit-note"), // Credit Note
  28: keyed("/accounts/purchase-accounting"), // Purchase (Accounting)
  29: keyed("/accounts/sales-accounting"), // Sales (Accounting)
  30: keyed("/accounts/receipt-voucher"), // Receipt Voucher
  31: keyed("/accounts/payment-voucher"), // Payment Voucher
  33: keyed("/accounts/payment"), // Payment
  40: keyed("/accounts/expense-voucher"), // Expense Voucher
};

type DrillRow = Pick<VoucherRow, "voucherId" | "voucherTypeId" | "accYear" | "branchId" | "src">;

export type ReportScope = { companyId: string; accYear: string; branchId: string | null };

function srcTarget(src: Src, key: Omit<DocKey, "docId">): string | null {
  const route = SRC_SCREENS[`${src.module.toUpperCase()}/${src.docType.toUpperCase()}`];
  return route ? route({ ...key, docId: src.docId }) : null;
}

/** The route to open for a voucher row, or null when no screen opens it yet. */
export function drillTarget(row: DrillRow, scope: ReportScope): string | null {
  const companyId = scope.companyId;
  const branchId = row.branchId ?? scope.branchId;
  const accYear = (row.accYear ?? scope.accYear).trim();
  if (!companyId || !branchId || !accYear) return null;
  const key = { companyId, branchId, accYear };
  if (row.src) return srcTarget(row.src, key);
  const route = row.voucherTypeId !== null ? VOUCHER_SCREENS[row.voucherTypeId] : undefined;
  return route ? route({ ...key, docId: row.voucherId }) : null;
}

/** A ledger, the same range and branch → the Ledger Statement's URL (a navigation, not a call). */
export function ledgerStatementHref(args: {
  ledgerId: string;
  fromDate: string;
  toDate: string;
  branchId: string | null;
}): string {
  const search = buildLedgerSearch({
    ledgerId: args.ledgerId,
    fromDate: args.fromDate,
    toDate: args.toDate,
    branchId: args.branchId,
    tab: "vouchers",
    includeCancelled: true,
    withBillRefs: true,
    withLegs: false,
  });
  return `${LEDGER_STATEMENT_HREF}?${search.toString()}`;
}
