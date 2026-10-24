"use client";

/**
 * The day strip — Qt `paintDays()`: one chip per day with changes, newest
 * first, the latest 14; a click jumps the grid to that day. The totals sit on
 * the right of the same bar.
 */
import styles from "../page.module.scss";
import type { DayChip } from "../view/report";

export type DayStripProps = {
  chips: readonly DayChip[];
  onPick: (day: string) => void;
  totals: string;
  cap: string;
};

export function DayStrip({ chips, onPick, totals, cap }: DayStripProps) {
  return (
    <div className={styles.stripBar}>
      <div className={styles.dayStrip} role="toolbar" aria-label="Days with changes">
        {chips.map((chip) => (
          <button
            key={chip.day}
            type="button"
            className={styles.dayChip}
            // Not a tab stop (Qt NoFocus): the grid keeps the keyboard.
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(chip.day)}
            title={`${chip.label} — ${chip.sub}`}
          >
            <span className={styles.dayChipDay}>{chip.label}</span>
            <span className={styles.dayChipSub}>{chip.sub}</span>
          </button>
        ))}
      </div>
      <span className={styles.totals}>
        {totals}
        {cap ? <span className={styles.totalsCap}>{cap}</span> : null}
      </span>
    </div>
  );
}
