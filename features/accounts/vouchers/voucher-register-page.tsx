"use client";

/**
 * Voucher Register — menu 262: every voucher type in one place (the Qt
 * `VoucherRegisterEntry` opened with no type). The list shows every type the
 * user may view; the entry has a band of those types, and a voucher opened
 * from the list comes up on its own type. Each type keeps the rights of ITS
 * menu (Journal 103, Contra 104, …) — menu 262 grants none of its own.
 */
import VoucherPage from "./voucher-page";

/** Menu 262, "Voucher Register", a child of Accounts (menu 5). */
export const VOUCHER_REGISTER_MENU_ID = 262;

export default function VoucherRegisterPage() {
  return (
    <VoucherPage
      typeCode=""
      title="Voucher Register"
      subtitle="Journal, contra, notes and accounting vouchers."
    />
  );
}
