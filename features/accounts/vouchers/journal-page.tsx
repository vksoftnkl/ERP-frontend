"use client";

/**
 * Journal — menu 103, voucher type `Jrl`: any ledger to any ledger. Parties
 * sit on the lines, on either side; a party line may be set against the
 * party's open bills (bill-wise OPTIONAL) and what is not becomes a journal
 * bill of its own. No GST band — a tax ledger is typed as an ordinary line.
 * Its Exceptions list (grid 118) shows the journals and notes that settled a
 * sales or purchase bill by hand.
 */
import VoucherPage from "./voucher-page";
import type { VoucherKeys } from "./vouchers.types";

/** Menu 103, "Journal", a child of Accounts (menu 5). */
export const JOURNAL_MENU_ID = 103;

export default function JournalPage({ initialKeys }: { initialKeys?: VoucherKeys }) {
  return (
    <VoucherPage
      typeCode="Jrl"
      menuId={JOURNAL_MENU_ID}
      title="Journal"
      subtitle="Adjustments between any ledgers — parties on the lines, their bills settled or raised as you choose."
      initialKeys={initialKeys}
    />
  );
}
