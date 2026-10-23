"use client";

/**
 * A `dd-mm-yyyy` date box with a drop-down segment — the Qt `QDateEdit` with
 * its calendar popup, as the desktop screen shows its Date and Invoice date.
 *
 * Not a bare `<input type="date">`: that renders in the BROWSER's locale, so
 * the same voucher reads `10/12/2026` on one desk and `12/10/2026` on the
 * next. The text input owns the format (the quotation's `DateField` helpers);
 * the segment borrows the native picker, kept rendered (transparent) because
 * `showPicker()` refuses an unrendered input.
 *
 * `fieldProps` lands on the TEXT input — the header's Enter walk finds it there.
 */
import { useState } from "react";
import { cx } from "@/components/design-system/cx";
import { fromDisplayDate, toDisplayDate } from "@/features/sales/quotation/quotation.utils";
import { dateStepOf, stepIsoDate } from "@/lib/date-step";
import styles from "../expense.module.scss";

export type DateInputProps = {
  value: string;
  disabled?: boolean;
  title?: string;
  "aria-label": string;
  fieldProps?: Record<string, string>;
  onChange: (iso: string) => void;
};

export function DateInput({ value, disabled, title, fieldProps, onChange, ...rest }: DateInputProps) {
  const label = rest["aria-label"];
  const [text, setText] = useState(() => toDisplayDate(value));
  // The draft is the source of truth: a load or a New arrives as a new value,
  // and the box shows it (adjusted during render, not in an effect).
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(toDisplayDate(value));
  }

  const commit = (raw: string) => {
    const iso = fromDisplayDate(raw.trim());
    if (iso) {
      onChange(iso);
      setText(toDisplayDate(iso));
      return;
    }
    // Not a date — snap back rather than leave a half-typed date standing.
    setText(toDisplayDate(value));
  };

  return (
    <div className={cx(styles.dateBox, disabled && styles.dateBoxDisabled)} title={title}>
      <input
        {...fieldProps}
        className={styles.dateText}
        value={text}
        placeholder="dd-mm-yyyy"
        inputMode="numeric"
        autoComplete="off"
        data-uppercase="off"
        disabled={disabled}
        aria-label={label}
        onChange={(event) => {
          setText(event.target.value);
          const iso = fromDisplayDate(event.target.value);
          if (iso) onChange(iso);
        }}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          // ↑ / ↓: the next / previous day, from today when the box is empty
          // (Qt NexDateEdit). The operator's edit, so it goes out as a change.
          const step = dateStepOf(event);
          if (step !== 0) {
            event.preventDefault();
            const next = stepIsoDate(fromDisplayDate(event.currentTarget.value), step);
            setText(toDisplayDate(next));
            onChange(next);
          }
        }}
      />
      <span className={styles.dateDrop} aria-hidden="true">
        <svg viewBox="0 0 10 6" className={styles.dateDropIcon}>
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <input
          type="date"
          className={styles.datePicker}
          value={value}
          tabIndex={-1}
          disabled={disabled}
          aria-label={`${label} calendar`}
          onChange={(event) => event.target.value && onChange(event.target.value)}
          onClick={(event) => {
            const picker = event.currentTarget;
            if (typeof picker.showPicker === "function") picker.showPicker();
          }}
        />
      </span>
    </div>
  );
}
