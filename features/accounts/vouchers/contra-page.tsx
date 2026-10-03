"use client";

/**
 * Contra — menu 104, voucher type `Con`: money moved between our own cash and
 * bank accounts. Both sides take Cash-in-Hand, Bank Accounts and Bank OD A/c
 * (and their sub-groups); there is no party, bill, GST, TDS or cheque on it.
 */
import VoucherPage from "./voucher-page";

/** Menu 104, "Contra", a child of Accounts (menu 5). */
export const CONTRA_MENU_ID = 104;

export default function ContraPage() {
  return (
    <VoucherPage
      typeCode="Con"
      menuId={CONTRA_MENU_ID}
      title="Contra"
      subtitle="Money moved between our own cash and bank accounts."
    />
  );
}
