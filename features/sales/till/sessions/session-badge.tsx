"use client";

/**
 * A session pill of the Till Sessions list (status · treatment · cash), in the
 * shared session palette (`badgeTone`): the house pill, plus a slate tone for
 * the `locked` bucket the shared `TonePill` has no class for.
 */
import { cx } from "@/components/design-system/cx";
import styles from "../shared/till.module.scss";
import { badgeTone } from "./session-list";
import local from "./sessions.module.scss";

export function SessionBadge({ value }: { value: string }) {
  const text = value.trim();
  if (!text) return null;
  const tone = badgeTone(text);
  return (
    <span
      className={cx(
        styles.pill,
        tone === "green" && styles.pillGreen,
        tone === "amber" && styles.pillAmber,
        tone === "red" && styles.pillRed,
        tone === "blue" && styles.pillBlue,
        tone === "slate" && local.pillSlate,
      )}
    >
      {text}
    </span>
  );
}
