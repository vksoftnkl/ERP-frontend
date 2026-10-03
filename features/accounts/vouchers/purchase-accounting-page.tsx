"use client";

/**
 * Purchase (Accounting) — menu 163, voucher type `PurA`: a purchase booked in
 * the accounts only (no stock moves). ONE supplier, on the header, is
 * credited the total; the typed lines are the expense / asset ledgers with
 * their GST rates and ITC class (GSTR-2, input; reverse charge where the tax
 * is ours to pay), TDS is deducted where the supplier's section says so, and
 * the voucher raises a PURCHASE bill — less what is set against the
 * supplier's open advances.
 */
import VoucherPage from "./voucher-page";
import type { VoucherKeys } from "./vouchers.types";

/** Menu 163, "Purchase (Accounting)", a child of Accounts (menu 5). */
export const PURCHASE_ACCOUNTING_MENU_ID = 163;

export default function PurchaseAccountingPage({ initialKeys }: { initialKeys?: VoucherKeys }) {
  return (
    <VoucherPage
      typeCode="PurA"
      menuId={PURCHASE_ACCOUNTING_MENU_ID}
      title="Purchase (Accounting)"
      subtitle="A purchase without stock — one supplier, the expense lines with their GST and ITC, TDS where due."
      initialKeys={initialKeys}
    />
  );
}
