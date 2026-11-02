"use client";
/**
 * The strip over the tiles: More filters (F8), the line that says which
 * filters are applied, the key hints, and Show (F5).
 *
 * Every filter lives in More filters (the user's call, 2026-11-02): the strip
 * holds none of its own. Side, As on and Branch are in the title's subtitle;
 * the line here lists every other filter that is not at its default, so the
 * report never runs on a filter nobody can see.
 */
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import type { OutstandingSide } from "../wire/types";

type Props = {
  side: OutstandingSide;
  /** The applied filters away from their defaults, one phrase each. */
  applied: string[];
  onShow: () => void;
  onMoreFilters: () => void;
};

export function FilterStrip({ side, applied, onShow, onMoreFilters }: Props) {
  const summary = applied.join(" · ");
  return (
    <div className={styles.strip} role="search" aria-label="Report filters">
      <div className={styles.stripRow}>
        <button type="button" className={styles.button} onClick={onMoreFilters}>
          More filters{applied.length > 0 ? ` (${applied.length})` : ""}
          <span className={styles.key}>F8</span>
        </button>
        <span className={cx(styles.stripSummary, !summary && styles.stripSummaryNone)} title={summary || undefined}>
          {summary || "No filters beyond the defaults"}
        </span>

        <div className={styles.stripSpacer} />
        <span className={styles.stripHint}>
          Ctrl+F find ledger · Ctrl+L ledger statement · Ctrl+R {side === "PAYABLE" ? "payment" : "receipt"}
        </span>
        <button type="button" className={styles.primaryButton} onClick={onShow}>
          Show<span className={styles.key}>F5</span>
        </button>
      </div>
    </div>
  );
}
