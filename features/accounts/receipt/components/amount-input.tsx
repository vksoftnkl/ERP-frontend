"use client";

/**
 * A money box that shows one figure at rest and lets the operator type another.
 *
 * Built for the tender surcharge (Qt 6f15977): on a UPI or card master the
 * figure TYPED is what goes to the bills, and the row then carries the GROSS
 * the customer pays — 200 typed on a 1% UPI rests as 202.00. Fed straight
 * back into the box on every keystroke, that gross would be typed over:
 * "2" becomes 2.02, the next "0" makes it 2.020. So while the box has focus it
 * holds the operator's own text, starting from `editValue` (what goes to the
 * bills); it hands each keystroke up as a number and shows `value` again only
 * when the caret leaves.
 *
 * On a tender with no surcharge the two figures are the same, and this is an
 * ordinary number box.
 *
 * `resetKey` is for a box that outlives the document under it (the header's
 * Amount box): Ctrl+Enter or F1 pressed with the caret inside replaces the
 * receipt, and the operator's text must not survive onto the next one.
 */
import { useState, type KeyboardEvent } from "react";

export type AmountInputProps = {
  /** Shown at rest. Zero renders blank. */
  value: number;
  /** What the text starts from when focus arrives. Defaults to `value`. */
  editValue?: number;
  /** Every keystroke, as a number (blank = 0). */
  onValueChange: (value: number) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  title?: string;
  /** Data attributes the focus walk addresses the box by. */
  fieldAttr?: Record<string, string>;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** When this changes while the box has focus, its text restarts from `editValue`. */
  resetKey?: string;
};

function shownText(value: number): string {
  return value === 0 ? "" : String(value);
}

export function AmountInput({
  value,
  editValue,
  onValueChange,
  className,
  disabled,
  placeholder,
  title,
  fieldAttr,
  onFocus,
  onBlur,
  onKeyDown,
  resetKey,
}: AmountInputProps) {
  /** The operator's own text while the box has focus; null at rest. */
  const [text, setText] = useState<string | null>(null);
  // Adjusted during render, the way React documents for state that follows a
  // prop — an effect would paint the stale text once first.
  const [seenKey, setSeenKey] = useState(resetKey);
  if (resetKey !== seenKey) {
    setSeenKey(resetKey);
    if (text !== null) {
      setText(shownText(editValue ?? value));
    }
  }

  return (
    <input
      {...fieldAttr}
      className={className}
      type="number"
      min={0}
      step="0.01"
      value={text ?? shownText(value)}
      disabled={disabled}
      placeholder={placeholder}
      title={title}
      onFocus={() => {
        setText(shownText(editValue ?? value));
        onFocus?.();
      }}
      onChange={(event) => {
        setText(event.target.value);
        onValueChange(Number(event.target.value) || 0);
      }}
      onBlur={() => {
        setText(null);
        onBlur?.();
      }}
      onKeyDown={onKeyDown}
    />
  );
}
