/**
 * The business-day pill, top right (plan §6), from `summary.businessDay`. A
 * range has no status (`null`), and then there is no pill: the Day-wise tab
 * carries it per day.
 */
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import type { BusinessDay } from "../wire/types";

export function pillOf(day: BusinessDay): { text: string; note: string | null; tone: "amber" | "green" | "grey" } {
  switch (day.status) {
    case "OPEN":
      return { text: "Business day OPEN", note: "figures are provisional until Day Close", tone: "amber" };
    case "CLOSING":
      return { text: "Business day CLOSING", note: "Day Close is running", tone: "amber" };
    case "CLOSED":
      return { text: day.zNo ? `Business day CLOSED · Z ${day.zNo}` : "Business day CLOSED", note: null, tone: "green" };
    case "NONE":
      return { text: "No till day", note: null, tone: "grey" };
    case "MIXED":
      return { text: "Business day MIXED", note: "branches differ", tone: "amber" };
  }
}

const TONE = { amber: styles.pillAmber, green: styles.pillGreen, grey: styles.pillGrey } as const;

export function BusinessDayPill({ day, stale }: { day: BusinessDay | null; stale: boolean }) {
  if (!day) return null;
  const pill = pillOf(day);
  return (
    <div className={cx(styles.pillBox, stale && styles.stale)}>
      <span className={cx(styles.pill, TONE[pill.tone])}>{pill.text}</span>
      {pill.note ? <span className={styles.pillNote}>{pill.note}</span> : null}
    </div>
  );
}
