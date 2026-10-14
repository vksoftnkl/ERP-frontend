"use client";

import { cx } from "@/components/design-system/cx";
import { liveLine, type LiveSession } from "./live-cash";
import styles from "./live-cash-line.module.scss";

/**
 * "● 2 live sessions · cash in tills ₹ 7,450.00" — Qt `TillLiveCash` as a
 * label (role "strong"), its tooltip one live session per line. On the Till
 * Sessions toolbar and under the Business Day title.
 */
export function LiveCashLine({
  sessions,
  className,
}: {
  sessions: readonly LiveSession[] | null;
  className?: string;
}) {
  const line = liveLine(sessions);
  return (
    <span
      className={cx(styles.line, sessions === null && styles.reading, className)}
      title={line.title || undefined}
      role="status"
      aria-live="polite"
    >
      {line.text}
    </span>
  );
}
