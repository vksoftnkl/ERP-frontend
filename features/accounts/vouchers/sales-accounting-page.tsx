"use client";

/**
 * Sales (Accounting) — menu 259, voucher type `SalA`: a sale booked in the
 * accounts only (no stock moves). ONE customer, on the header, is debited
 * the total; the typed lines are the income ledgers with their GST rates, the
 * tax legs are worked out by the server (GSTR-1, output), and the voucher
 * raises a SALES bill on the customer, due after its credit days — less what
 * is set against the customer's open credits.
 */
import VoucherPage from "./voucher-page";
import type { VoucherKeys } from "./vouchers.types";

/** Menu 259, "Sales (Accounting)", a child of Accounts (menu 5). */
export const SALES_ACCOUNTING_MENU_ID = 259;

export default function SalesAccountingPage({ initialKeys }: { initialKeys?: VoucherKeys }) {
  return (
    <VoucherPage
      typeCode="SalA"
      menuId={SALES_ACCOUNTING_MENU_ID}
      title="Sales (Accounting)"
      subtitle="A sale without stock — one customer, the income lines with their GST, and the bill it raises."
      initialKeys={initialKeys}
    />
  );
}
