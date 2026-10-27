"use client";

import { cx } from "@/components/design-system/cx";
import type { Outcome } from "../branch-inward.types";
import styles from "../page.module.scss";

/** What this receipt does to the despatch: it closes, or it stays in transit. */
export function OutcomeCard({ outcome }: { outcome: Outcome }) {
  return (
    <section
      className={cx(
        styles.card,
        styles.outcome,
        outcome.tone === "good" && styles.toneGood,
        outcome.tone === "warn" && styles.toneWarn,
      )}
      aria-label="Outcome"
      role="status"
    >
      <h3 className={styles.outcomeTitle}>{outcome.title}</h3>
      {outcome.text ? <p className={styles.outcomeText}>{outcome.text}</p> : null}
    </section>
  );
}
