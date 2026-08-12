"use client";
/**
 * The credit panel (the plan's §7). Renders the party-credit summary — the SAME
 * object the save gate judges, so panel and gate can never disagree.
 *
 * Colour discipline: red is reserved for the two facts that change a decision —
 * overdue money, and a breached limit. Everything else is information.
 * `isCreditCheckEnabled === false` greys the panel and says so; the gate is
 * already out of the picture by then.
 */
import { formatCurrency } from "@/domain/pricing";
import type { PartyCreditSummary } from "../sale-order.types";
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";

export type CreditPanelProps = {
  credit: PartyCreditSummary | null;
  /** A customer is picked but the lookup failed or has not landed. */
  hasCustomer: boolean;
};

export function CreditPanel({ credit, hasCustomer }: CreditPanelProps) {
  if (!credit) {
    return (
      <div className={styles.creditPanel}>
        <span className={styles.creditPanelTitle}>Credit</span>
        <span className={styles.creditStatusLine}>
          {hasCustomer ? "Credit standing unavailable." : "Pick a customer to see their standing."}
        </span>
      </div>
    );
  }

  const checkOff = credit.isCreditCheckEnabled === false;
  const limitBreached = credit.isAmtLimitExceeded || credit.isBillLimitExceeded;
  const overdue = credit.overdueAmount > 0;

  const statusLine = checkOff
    ? "Credit check is off for this customer."
    : limitBreached
      ? "Over the credit limit."
      : overdue
        ? `Overdue by ${credit.maxOverdueDays} day${credit.maxOverdueDays === 1 ? "" : "s"}.`
        : "Within limits.";

  return (
    <div className={cx(styles.creditPanel, checkOff && styles.creditPanelOff)}>
      <span className={styles.creditPanelTitle}>
        Credit{credit.partyName ? ` · ${credit.partyName}` : ""} · as on {credit.asOnDate}
      </span>
      <div className={styles.creditGrid}>
        <span className={styles.creditCell}>
          <span className={styles.creditLabel}>Outstanding</span>
          <span className={styles.creditValue}>
            {formatCurrency(credit.pendingAmount)} / {credit.pendingBillCount} bills
          </span>
        </span>
        <span className={styles.creditCell}>
          <span className={styles.creditLabel}>Overdue</span>
          <span
            className={cx(styles.creditValue, !checkOff && overdue && styles.creditAlert)}
            title={
              credit.oldestOverdueDueDate
                ? `Oldest due date ${credit.oldestOverdueDueDate}`
                : undefined
            }
          >
            {formatCurrency(credit.overdueAmount)} / {credit.overdueBillCount} bills
          </span>
        </span>
        <span className={styles.creditCell}>
          <span className={styles.creditLabel}>Overdue By</span>
          <span
            className={cx(styles.creditValue, !checkOff && overdue && styles.creditAlert)}
            title={
              credit.oldestOverdueDueDate
                ? `Oldest due date ${credit.oldestOverdueDueDate}`
                : undefined
            }
          >
            {credit.maxOverdueDays} d
          </span>
        </span>
        <span className={styles.creditCell}>
          <span className={styles.creditLabel}>Credit Limit</span>
          <span className={styles.creditValue}>
            {formatCurrency(credit.creditAmtLimit)} / {credit.creditBillLimit} bills
          </span>
        </span>
        <span className={styles.creditCell}>
          <span className={styles.creditLabel}>Available</span>
          <span className={cx(styles.creditValue, !checkOff && limitBreached && styles.creditAlert)}>
            {credit.availableCreditAmount === null
              ? "—"
              : formatCurrency(credit.availableCreditAmount)}
            {credit.availableBillCount === null ? "" : ` / ${credit.availableBillCount} bills`}
          </span>
        </span>
      </div>
      <span
        className={cx(
          styles.creditStatusLine,
          !checkOff && (limitBreached || overdue) && styles.creditStatusBad,
        )}
      >
        {statusLine}
      </span>
    </div>
  );
}
