"use client";

/**
 * The three cards under the grid (the Qt `.ui`'s frameSrc / frameFour /
 * frameRow): the Src legend, the violet "each level is four numbers" card and
 * the card that says, in words, what Save will do to the current row.
 */
import { Fragment, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { chipColours } from "../selling-price.constants";
import type { FourCard, RowCard } from "../selling-price.cards";
import type { FourTarget } from "../use-selling-price-screen";
import { acceptsTyping, type FourField, type NumericInputKind } from "../selling-price.state";
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

type FourInputProps = {
  id: string;
  label: string;
  value: string;
  kind: NumericInputKind;
  disabled: boolean;
  /** The row and level the card shows right now. */
  target: FourTarget;
  onFinish: (text: string, target: FourTarget) => void;
};

/**
 * One of the four boxes. Only a TYPED change counts — leaving the box
 * untouched (the Qt editingFinished-on-focus-out) changes nothing.
 */
function FourInput({ id, label, value, kind, disabled, target, onFinish }: FourInputProps) {
  const [text, setText] = useState(value);
  const [dirty, setDirty] = useState(false);
  /** Where the typing started — the edit lands there, wherever focus goes next. */
  const [editTarget, setEditTarget] = useState<FourTarget | null>(null);
  // The row's figure, followed while nobody is typing: the card re-reads the
  // current row whenever it (or the level) changes.
  const [seenValue, setSeenValue] = useState(value);
  if (seenValue !== value) {
    setSeenValue(value);
    if (!dirty) {
      setText(value);
    }
  }

  const finish = () => {
    if (!dirty) {
      return;
    }
    setDirty(false);
    onFinish(text, editTarget ?? target);
    setEditTarget(null);
    // The card re-reads the row; a refused edit falls back to the row's figure.
    setText(value);
  };

  return (
    <input
      id={id}
      aria-label={label}
      className={styles.fourInput}
      value={text}
      disabled={disabled}
      inputMode="decimal"
      autoComplete="off"
      onChange={(event) => {
        if (acceptsTyping(kind, event.target.value)) {
          if (!dirty) {
            setEditTarget(target);
          }
          setDirty(true);
          setText(event.target.value);
        }
      }}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          finish();
        } else if (event.key === "Escape" && dirty) {
          event.preventDefault();
          setDirty(false);
          setEditTarget(null);
          setText(value);
        }
      }}
    />
  );
}

export function FourNumberCard({
  four,
  target,
  onEdit,
}: {
  four: FourCard;
  target: FourTarget;
  onEdit: (field: FourField, text: string, target: FourTarget) => void;
}) {
  const disabled = !four.enabled;
  return (
    <section
      className={cx(styles.card, styles.fourCard)}
      aria-label="Each level is four numbers"
      // F5 / Ctrl+Enter from a box here commits it before the save reads the rows.
      data-selling-price-commit="true"
    >
      <div className={styles.cardTitle}>EACH LEVEL IS FOUR NUMBERS</div>
      <div className={styles.fourWhich}>{four.which}</div>
      <div className={styles.fourGrid}>
        <label className={styles.fourCap} htmlFor="csp-four-markup">
          markup %
        </label>
        <span />
        <label className={styles.fourCap} htmlFor="csp-four-wot">
          price wot
        </label>
        <span />
        <label className={styles.fourCap} htmlFor="csp-four-price">
          price
        </label>
        <span />
        <label className={styles.fourCap} htmlFor="csp-four-margin">
          margin %
        </label>
        <FourInput
          id="csp-four-markup"
          label="markup %"
          value={four.markup}
          kind="percent"
          disabled={disabled}
          target={target}
          onFinish={(text, at) => onEdit("markup", text, at)}
        />
        <span className={styles.fourArrow}>⇄</span>
        <FourInput
          id="csp-four-wot"
          label="price wot"
          value={four.wot}
          kind="amount"
          disabled={disabled}
          target={target}
          onFinish={(text, at) => onEdit("wot", text, at)}
        />
        <span className={styles.fourArrow}>⇄</span>
        <FourInput
          id="csp-four-price"
          label="price"
          value={four.price}
          kind="amount"
          disabled={disabled}
          target={target}
          onFinish={(text, at) => onEdit("price", text, at)}
        />
        <span className={styles.fourArrow}>⇄</span>
        <FourInput
          id="csp-four-margin"
          label="margin %"
          value={four.margin}
          kind="percent"
          disabled={disabled}
          target={target}
          onFinish={(text, at) => onEdit("margin", text, at)}
        />
      </div>
      <p className={styles.fourNote}>
        Type any one; the other three follow. The server keeps PRICE and recomputes wot + markup
        from it. Delta chips against the loaded value are the preview.
      </p>
      {four.cess ? (
        <p className={styles.cessNote}>
          ⚠ This item carries a cess: the four numbers are approximate — a per-unit cess is not a
          percentage of price.
        </p>
      ) : null}
    </section>
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
