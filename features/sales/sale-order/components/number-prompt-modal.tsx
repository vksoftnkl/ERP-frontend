"use client";
/**
 * One number, asked for in a dialog — the Qt screen's `QInputDialog::getDouble`
 * behind "Disc % All" and "± Price". Enter applies, Esc closes, and a value
 * outside the range is clamped rather than refused: the operator who types
 * 120 for a discount meant the most the field allows.
 */
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { Field } from "@/features/sales/quotation/components/fields";
import styles from "@/features/sales/quotation/page.module.scss";

export type NumberPromptModalProps = {
  isOpen: boolean;
  title: string;
  /** The question above the box. */
  label: string;
  min: number;
  max: number;
  step?: number;
  initialValue?: number;
  /** A line under the box — what the number will do. */
  note?: string;
  confirmLabel?: string;
  onClose: () => void;
  onApply: (value: number) => void;
};

export function NumberPromptModal({
  isOpen,
  title,
  label,
  min,
  max,
  step = 0.01,
  initialValue = 0,
  note,
  confirmLabel = "Apply",
  onClose,
  onApply,
}: NumberPromptModalProps) {
  const [text, setText] = useState(String(initialValue));
  const inputRef = useRef<HTMLInputElement | null>(null);

  // A fresh question each time it opens: yesterday's percent is not a default.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setText(String(initialValue));
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialValue, isOpen]);

  const parsed = Number.parseFloat(text.replace(/,/g, ""));
  const valid = Number.isFinite(parsed);

  const apply = () => {
    if (!valid) {
      return;
    }
    onApply(Math.min(max, Math.max(min, parsed)));
  };

  return (
    <ModalShell
      title={title}
      isOpen={isOpen}
      narrow
      onClose={onClose}
      footer={
        <>
          <button type="button" className={styles.button} onClick={onClose}>
            Cancel <span className={styles.buttonHint}>Esc</span>
          </button>
          <button
            type="button"
            className={cx(styles.button, styles.buttonPrimary)}
            disabled={!valid}
            onClick={apply}
          >
            {confirmLabel} <span className={styles.buttonHint}>Enter</span>
          </button>
        </>
      }
    >
      <Field label={label} htmlFor="sale-order-number-prompt">
        <input
          ref={inputRef}
          id="sale-order-number-prompt"
          className={styles.input}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            }
          }}
        />
      </Field>
      {note ? <p className={styles.modalNote}>{note}</p> : null}
    </ModalShell>
  );
}
