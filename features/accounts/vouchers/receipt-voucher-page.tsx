"use client";

/**
 * Receipt Voucher — menu 260, voucher type `RcpV`: money received from many
 * parties at once (a salesman's collection run). Each customer is a line on
 * the Credit side with its instrument (cash, UPI, a cheque — the money leg is
 * the server's) and its bills, settled on demand; the rest is an advance. A
 * cheque dated later posts on a voucher of its own. Cash and bank may also be
 * keyed by hand on the Debit side; a cheque is banked in Received Cheques (51).
 */
import VoucherPage from "./voucher-page";
import type { VoucherKeys } from "./vouchers.types";

/** Menu 260, "Receipt Voucher", a child of Accounts (menu 5). */
export const RECEIPT_VOUCHER_MENU_ID = 260;

export default function ReceiptVoucherPage({ initialKeys }: { initialKeys?: VoucherKeys }) {
  return (
    <VoucherPage
      typeCode="RcpV"
      menuId={RECEIPT_VOUCHER_MENU_ID}
      title="Receipt Voucher"
      subtitle="Money received from many parties at once — each on its own line, with its instrument and its bills."
      initialKeys={initialKeys}
    />
  );
}
