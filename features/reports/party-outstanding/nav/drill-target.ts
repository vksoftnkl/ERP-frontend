/**
 * Enter on a bill (or a settlement) → the source document's own screen
 * (plan §12; the ledger-statement rules, its §10).
 *
 * THE KEY IS THE ROW'S, NEVER THE SESSION'S. `companyId` is the report's own.
 * The branch and the year come from the row: a bill raised in another branch,
 * or carried in from last year's partition, opens in its own scope. That is
 * why nothing here takes a session.
 *
 * This is the only type-keyed map in the feature, and it maps to ROUTES, not
 * behaviour. What each `srcDocType` points at was read off the dev database
 * (2026-10-09):
 *
 *   RECEIPT_ADVANCE       srcDocId = the receipt voucher (type 12)
 *   PAYMENT_ADVANCE       srcDocId = the payment voucher (type 33)
 *   VOUCHER               srcDocId = the voucher; its TYPE picks the screen
 *   SALE_BILL / SALE_RETURN / SALES_ORDER   the document: no keyed screen yet
 *   OPENING_BALANCE       no document; the Opening Balances screen
 *   CHEQUE_BOUNCE_CHARGE  srcDocId = the PDC register row; Received Cheques
 *
 * The keyed voucher routes need the bill's BRANCH, and VOUCHER rows need the
 * voucher TYPE. Neither is in the server's bill row yet (FORWARD fields in
 * `types.ts`), so until they are, those rows answer "no screen to open yet"
 * rather than opening under the session's branch. Opening Balances and
 * Received Cheques take no focus key yet, so they open on their own default
 * view.
 */
import type { BillRow } from "../wire/types";

export type DocKey = { companyId: string; branchId: string; accYear: string; docId: string };

const seg = encodeURIComponent;

function keyed(base: string) {
  return (k: DocKey) => `${base}/${seg(k.companyId)}/${seg(k.branchId)}/${seg(k.accYear)}/${seg(k.docId)}`;
}

/** `acc_voucher_types.vchr_type_id` → the screen that opens one by its four keys. */
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
};

/** The fixed voucher type of the src types that carry one. */
const SRC_VOUCHER_TYPE: Record<string, number> = {
  RECEIPT_ADVANCE: 12,
  PAYMENT_ADVANCE: 33,
};

/** A voucher by its own keys → its screen, or null. */
export function voucherTarget(args: {
  companyId: string;
  branchId: string | null;
  accYear: string | null;
  voucherId: string | null;
  voucherTypeId: number | null;
}): string | null {
  const { companyId, branchId, accYear, voucherId, voucherTypeId } = args;
  if (!companyId || !branchId || !accYear || !voucherId || voucherTypeId === null) return null;
  const route = VOUCHER_SCREENS[voucherTypeId];
  return route ? route({ companyId, branchId, accYear: accYear.trim(), docId: voucherId }) : null;
}

type DrillRow = Pick<
  BillRow,
  "srcDocType" | "srcDocId" | "srcAccYear" | "voucherId" | "voucherTypeId" | "branchId" | "accYear"
>;

/** The route to open for a bill, or null when there is no screen for it yet. */
export function drillTarget(row: DrillRow, companyId: string): string | null {
  const type = (row.srcDocType ?? "").toUpperCase();
  if (type === "OPENING_BALANCE") return "/accounts/opening-balance";
  if (type === "CHEQUE_BOUNCE_CHARGE") return "/accounts/received-cheques";
  if (type in SRC_VOUCHER_TYPE) {
    return voucherTarget({
      companyId,
      branchId: row.branchId,
      accYear: row.srcAccYear ?? row.accYear,
      voucherId: row.srcDocId ?? row.voucherId,
      voucherTypeId: SRC_VOUCHER_TYPE[type],
    });
  }
  if (type === "VOUCHER") {
    return voucherTarget({
      companyId,
      branchId: row.branchId,
      accYear: row.srcAccYear ?? row.accYear,
      voucherId: row.srcDocId ?? row.voucherId,
      voucherTypeId: row.voucherTypeId,
    });
  }
  return null;
}

export const NO_SCREEN_MESSAGE = "This bill has no screen to open yet.";
export const NO_VOUCHER_SCREEN_MESSAGE = "This voucher has no screen to open yet.";
