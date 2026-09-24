"use client";

/**
 * The four chip colours, and what each one MEANS — not what it looks like.
 *
 *   amber   the operator did it, or must look   MANUAL · STALE · PARTIAL · FROZEN
 *   blue    the system derived it               CARRY FWD · BILL-WISE · MIGRATION
 *   green   settled                             OPEN
 *   grey    unrecognised                        anything else, shown verbatim
 *
 * An unknown value is shown as it arrived rather than mapped to a default: the
 * server's vocabularies grow, and a chip that silently paints a new status as
 * "OPEN" is worse than one that admits it does not know the word.
 *
 * In Qt this was painted in a delegate, because a `QTableWidgetItem` has no
 * border-radius. Here it is a span.
 */
import styles from "../page.module.scss";

export type ChipTone = "amber" | "blue" | "green" | "grey";

const TONES: Record<string, ChipTone> = {
  MANUAL: "amber",
  STALE: "amber",
  PARTIAL: "amber",
  FROZEN: "amber",
  CARRY_FORWARD: "blue",
  "CARRY FWD": "blue",
  MIGRATION: "blue",
  "BILL-WISE": "blue",
  OPEN: "green",
};

const LABELS: Record<string, string> = {
  CARRY_FORWARD: "Carry fwd",
  MIGRATION: "Migration",
  MANUAL: "Manual",
};

export function toneOf(value: string): ChipTone {
  return TONES[value.trim().toUpperCase()] ?? "grey";
}

export type ChipProps = {
  value: string | null | undefined;
  /** Overrides the derived label — the layout's own wording wins where it has one. */
  label?: string;
  title?: string;
};

export function Chip({ value, label, title }: ChipProps) {
  const raw = (value ?? "").trim();
  if (!raw) {
    return null;
  }
  const tone = toneOf(raw);
  return (
    <span className={`${styles.chip} ${styles[`chip${tone[0].toUpperCase()}${tone.slice(1)}`]}`} title={title}>
      {label ?? LABELS[raw.toUpperCase()] ?? raw}
    </span>
  );
}
