"use client";

/**
 * What sits under the grid: the profit line for the current row (Qt
 * `lblProfitLine`, the item card's Pricing line), and the two cards (the Qt
 * `.ui`'s frameSrc / frameRow) — the Src legend and the card that says, in
 * words, what Save will do to the current row. The violet four-number card
 * went in Qt 4ae6575; the profit line replaced it.
 */
import { Fragment } from "react";
import { cx } from "@/components/design-system/cx";
import { chipColours } from "../selling-price.constants";
import { profitLineText, type ProfitLine, type RowCard } from "../selling-price.cards";
import styles from "../page.module.scss";

const LEGEND: ReadonlyArray<{ chip: string; text: string }> = [
  { chip: "BUCKET·BR", text: "this branch's own row for this bucket — Save updates it" },
  {
    chip: "BUCKET·CH",
    text: "the chain row (branch NULL) — under This branch, Save creates the override",
  },
  { chip: "MASTER", text: "the headline row (bucket NULL) — the SAME table; Save updates it in place" },
  { chip: "NEW", text: "a bucket no row prices yet — Save inserts it" },
];

export function SrcLegendCard() {
  return (
    <section className={styles.card} aria-label="Src legend">
      <div className={styles.cardTitle}>SRC — WHICH ROW OF THE PRICE TABLE THIS IS</div>
      <div className={styles.legendGrid}>
        {LEGEND.map((entry) => {
          const colours = chipColours(entry.chip);
          return (
            <Fragment key={entry.chip}>
              <span
                className={cx(styles.chip, styles.legendChip)}
                style={{ color: colours.fg, background: colours.bg }}
              >
                {entry.chip}
              </span>
              <span>{entry.text}</span>
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

/**
 * "Profit per PCS (no tax):  WS ₹10.00 (10.0%) ↑ · RET ₹12.00 (12.0%)" — each
 * amount green (profit) or red (loss), the arrow green / red the way the
 * profit moved since the row was loaded; the old figures are in the tooltip.
 */
export function ProfitLineView({ line }: { line: ProfitLine }) {
  if (line.kind === "note") {
    return (
      <div className={styles.profitLine} role="status" aria-live="polite">
        {line.text}
      </div>
    );
  }
  return (
    <div
      className={styles.profitLine}
      role="status"
      aria-live="polite"
      aria-label={profitLineText(line)}
      title={line.tooltip}
    >
      <span className={styles.profitCaption}>Profit per {line.unit} (no tax):</span>
      {line.parts.map((part, index) => (
        <Fragment key={part.level + index}>
          {index > 0 ? <span className={styles.profitDot}>·</span> : null}
          <span>
            {part.level}{" "}
            <span className={part.loss ? styles.deltaDown : styles.deltaUp}>
              {part.amount} ({part.pct}%)
            </span>
            {part.moved ? (
              <span className={part.moved === "up" ? styles.deltaUp : styles.deltaDown}>
                {part.moved === "up" ? " ↑" : " ↓"}
              </span>
            ) : null}
          </span>
        </Fragment>
      ))}
      {line.cess ? (
        <span className={styles.profitCess}>(approximate — this item carries a cess)</span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function RowCardView({ card }: { card: RowCard }) {
  return (
    <section
      className={cx(styles.card, card.tone === "new" && styles.rowCardNew)}
      aria-label="What Save does to the current row"
    >
      <div className={styles.rowCardTitle}>{card.title}</div>
      <div className={styles.rowCardNote}>{card.note}</div>
    </section>
  );
}
