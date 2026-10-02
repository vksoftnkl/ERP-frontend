"use client";

/**
 * A `dd-MM-yyyy HH:mm` field — the freeze window's QDateTimeEdit with its
 * calendar popup. A text input owns the format (a native datetime input
 * renders in the browser's locale); the calendar button borrows the native
 * picker, as the quotation's DateField does.
 */
import { useState } from "react";
import { cx } from "@/components/design-system/cx";
import { Field } from "@/features/sales/quotation/components/fields";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { displayDateTime, fromDisplayDateTime } from "../physical-stock.format";

export type DateTimeFieldProps = {
  id: string;
  label: string;
  /** Local `yyyy-mm-ddTHH:mm`. */
  value: string;
  disabled?: boolean;
  title?: string;
  onChange: (value: string) => void;
};

export function DateTimeField({ id, label, value, disabled, title, onChange }: DateTimeFieldProps) {
  // What is being typed, or null when the field simply shows the value — so a
  // value set from outside (a load, a reset) always reads back as typed text.
  const [typing, setTyping] = useState<string | null>(null);
  const text = typing ?? displayDateTime(value);

  const commit = (raw: string) => {
    const parsed = fromDisplayDateTime(raw);
    if (parsed) {
      onChange(parsed);
    }
    // Either way the field goes back to showing the value — a half-typed
    // instant snaps back rather than standing.
    setTyping(null);
  };

  return (
    <Field label={label} htmlFor={id}>
      <div className={quotationStyles.dateField} title={title}>
        <input
          id={id}
          className={cx(quotationStyles.input, quotationStyles.dateInput)}
          value={text}
          placeholder="dd-mm-yyyy hh:mm"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          onChange={(event) => {
            setTyping(event.target.value);
            const parsed = fromDisplayDateTime(event.target.value);
            if (parsed) {
              onChange(parsed);
            }
          }}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commit(event.currentTarget.value);
            }
          }}
        />
        <span className={quotationStyles.dateButton} aria-hidden="true">
          <svg className={quotationStyles.dateButtonIcon} viewBox="0 0 16 16">
            <rect
              x="1.75"
              y="3"
              width="12.5"
              height="11.25"
              rx="1.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
            />
            <path
              d="M1.75 6.5h12.5M5 1.75v2.5M11 1.75v2.5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.3"
            />
          </svg>
          <input
            type="datetime-local"
            className={quotationStyles.datePicker}
            value={value}
            tabIndex={-1}
            disabled={disabled}
            aria-label={`${label} calendar`}
            onChange={(event) => {
              if (event.target.value) {
                onChange(event.target.value.slice(0, 16));
              }
            }}
            onClick={(event) => {
              const picker = event.currentTarget;
              if (typeof picker.showPicker === "function") {
                picker.showPicker();
              }
            }}
          />
        </span>
      </div>
    </Field>
  );
}
