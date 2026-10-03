"use client";

/**
 * Credit Note — menu 102, voucher type `CrN`: ONE party, on the header, is
 * credited (a sale returned, a discount allowed, a rate difference). The
 * typed lines are the debits; GST, where it applies, is the GSTR-1 9B (CDN)
 * register; the note raises a journal bill on the party — less what is set
 * against the party's open bills.
 */
import VoucherPage from "./voucher-page";
import type { VoucherKeys } from "./vouchers.types";

/** Menu 102, "Credit Note", a child of Accounts (menu 5). */
export const CREDIT_NOTE_MENU_ID = 102;

export default function CreditNotePage({ initialKeys }: { initialKeys?: VoucherKeys }) {
  return (
    <VoucherPage
      typeCode="CrN"
      menuId={CREDIT_NOTE_MENU_ID}
      title="Credit Note"
      subtitle="A party credited — one party, the lines it is credited against, their GST, and the bill it raises."
      initialKeys={initialKeys}
    />
  );
}
