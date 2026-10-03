"use client";

/**
 * Payment Voucher — menu 261, voucher type `PmtV`: money paid to many parties
 * at once. Each supplier is a line on the Debit side with its instrument (cash,
 * UPI, a bank transfer, or OUR cheque from a book — the leaf is taken at Post)
 * and its bills; TDS is deducted where the party's section says so (the line is
 * keyed net, the party is debited the gross). A cheque dated later posts on a
 * voucher of its own; its life after that is Issued Cheques' (menu 52).
 */
import VoucherPage from "./voucher-page";
import type { VoucherKeys } from "./vouchers.types";

/** Menu 261, "Payment Voucher", a child of Accounts (menu 5). */
export const PAYMENT_VOUCHER_MENU_ID = 261;

export default function PaymentVoucherPage({ initialKeys }: { initialKeys?: VoucherKeys }) {
  return (
    <VoucherPage
      typeCode="PmtV"
      menuId={PAYMENT_VOUCHER_MENU_ID}
      title="Payment Voucher"
      subtitle="Money paid to many parties at once — cheques from our books, TDS deducted where due."
      initialKeys={initialKeys}
    />
  );
}
