"use client";
/**
 * The strip over the panels: More filters (F8), the line that says which
 * statement is shown (ledger, period, branch) and each switch away from its
 * default, the key hints, and Show (F5).
 *
 * Every filter lives in More filters (the user's call, 2026-11-02, as on
 * Party-wise Outstanding): the strip holds none of its own.
 */
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";

type Props = {
  /** The statement's subject: ledger, period, branch. Empty = no ledger yet. */
  head: string[];
  /** Each switch away from its default; "More filters (n)" counts these. */
  extra: string[];
  onShow: () => void;
  onMoreFilters: () => void;
};

export function FilterStrip({ head, extra, onShow, onMoreFilters }: Props) {
  const line = [...head, ...extra].join(" · ");
  return (
    <div className={styles.strip} role="search" aria-label="Report filters">
      <button type="button" className={styles.button} onClick={onMoreFilters}>
        More filters{extra.length > 0 ? ` (${extra.length})` : ""}
        <span className={styles.key}>F8</span>
      </button>
      <span className={cx(styles.stripSummary, !head.length && styles.stripSummaryNone)} title={line || undefined}>
        {head.length ? line : "No ledger chosen: More filters (F8) or Ctrl+L picks one"}
      </span>
      <div className={styles.stripSpacer} />
      <span className={styles.stripHint}>Ctrl+L ledger · PgUp / PgDn ledger in group</span>
      <button type="button" className={styles.primaryButton} onClick={onShow}>
        Show<span className={styles.key}>F5</span>
      </button>
    </div>
  );
}
