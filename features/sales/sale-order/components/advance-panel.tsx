"use client";
/**
 * The advance panel — BUILT BUT NOT MOUNTED (the plan's §7.3): on a new order
 * every figure is zero, and the header space is worth more as credit. Mounting
 * it later — on a saved order, beside the credit panel — is a layout decision,
 * not new data: the load already parses these seven server-owned figures and
 * the save leaves them untouched by omission.
 *
 * Advance TENDERED and BALANCE DUE are deliberately not here; they belong to
 * the totals strip and stay visible always.
 */
import { formatCurrency } from "@/domain/pricing";
import type { AdvanceEcho } from "../sale-order.types";
import styles from "../page.module.scss";

export function AdvancePanel({ advance }: { advance: AdvanceEcho }) {
  return (
    <div className={styles.advancePanel}>
      <span className={styles.creditPanelTitle}>
        Advance{advance.status ? ` · ${advance.status}` : ""}
      </span>
      <div className={styles.creditGrid}>
        <span className={styles.creditCell}>
          <span className={styles.creditLabel}>Required</span>
          <span className={styles.creditValue}>{formatCurrency(advance.required)}</span>
        </span>
        <span className={styles.creditCell}>
          <span className={styles.creditLabel}>Received</span>
          <span className={styles.creditValue}>{formatCurrency(advance.recdAmt)}</span>
        </span>
        <span className={styles.creditCell}>
          <span className={styles.creditLabel}>Adjusted</span>
          <span className={styles.creditValue}>{formatCurrency(advance.adjustedAmt)}</span>
        </span>
        <span className={styles.creditCell}>
          <span className={styles.creditLabel}>Refunded</span>
          <span className={styles.creditValue}>{formatCurrency(advance.refundAmt)}</span>
        </span>
        <span className={styles.creditCell}>
          <span className={styles.creditLabel}>Forfeited</span>
          <span className={styles.creditValue}>{formatCurrency(advance.forfeitAmt)}</span>
        </span>
        <span className={styles.creditCell}>
          <span className={styles.creditLabel}>Balance Held</span>
          <span className={styles.creditValue}>{formatCurrency(advance.balanceAmt)}</span>
        </span>
      </div>
    </div>
  );
}
