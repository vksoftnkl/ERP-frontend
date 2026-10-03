"use client";

/**
 * Debit Note — menu 101, voucher type `DrN`: ONE party, on the header, is
 * debited (a purchase returned, a rate difference charged, an interest
 * charge). The typed lines are the credits; GST, where it applies, is the
 * GSTR-1 9B (CDN) register; the note raises a journal bill on the party —
 * less what is set against the party's open bills.
 */
import VoucherPage from "./voucher-page";
import type { VoucherKeys } from "./vouchers.types";

/** Menu 101, "Debit Note", a child of Accounts (menu 5). */
export const DEBIT_NOTE_MENU_ID = 101;

export default function DebitNotePage({ initialKeys }: { initialKeys?: VoucherKeys }) {
  return (
    <VoucherPage
      typeCode="DrN"
      menuId={DEBIT_NOTE_MENU_ID}
      title="Debit Note"
      subtitle="A party debited — one party, the lines it is debited against, their GST, and the bill it raises."
      initialKeys={initialKeys}
    />
  );
}
