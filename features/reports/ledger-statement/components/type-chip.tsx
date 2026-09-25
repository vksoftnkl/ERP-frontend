/**
 * `rowKind` + `voucherTypeShort` → a chip (plan §8.4).
 *
 * The colour map is keyed by voucher TYPE ID (`accounts.acc_voucher_types`,
 * read 2026-09-25), and an unknown id is neutral grey. It is presentation
 * only: no behaviour anywhere in this feature branches on voucher type. If one
 * ever needs to, the server should send the fact instead.
 */
import styles from "../page.module.scss";
import type { VoucherRow } from "../wire/types";

const TYPE_TONE: Record<number, string> = {
  3: styles.chipSales, // Sales Bill
  19: styles.chipSales, // Delivery Challan
  5: styles.chipReceipt, // Order Advance Receipt
  12: styles.chipReceipt, // Receipt
  18: styles.chipReturn, // Sales Return
  20: styles.chipReturn, // Delivery Challan Return
  13: styles.chipContra, // Cheque Clearing
  22: styles.chipContra, // Tender Change
  14: styles.chipBounce, // Cheque Bounce
};

export function typeText(row: Pick<VoucherRow, "voucherTypeShort" | "voucherTypeName">): string {
  return (row.voucherTypeShort ?? row.voucherTypeName ?? "?").toUpperCase();
}

export function TypeChip({ row }: { row: VoucherRow }) {
  const title = row.voucherTypeName ?? undefined;
  if (row.rowKind === "REVERSAL") {
    return (
      <span className={`${styles.chip} ${styles.chipDanger}`} title={title ? `Reversal · ${title}` : "Reversal"}>
        REVERSAL
      </span>
    );
  }
  if (row.rowKind === "CANCELLED") {
    return (
      <span className={`${styles.chip} ${styles.chipDanger}`} title={title ? `${title} · cancelled` : "Cancelled"}>
        {typeText(row)} · CANCELLED
      </span>
    );
  }
  return (
    <span className={`${styles.chip} ${TYPE_TONE[row.voucherTypeId] ?? styles.chipNeutral}`} title={title}>
      {typeText(row)}
    </span>
  );
}
