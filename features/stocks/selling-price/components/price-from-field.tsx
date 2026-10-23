"use client";

/**
 * "Price from" (notes 140 A, Qt `datePriceFrom`) — the day the new prices
 * start, `dd-mm-yyyy`. Today = at once; a later day keeps today's prices until
 * then (Save reads "Schedule"); blank reads as today.
 *
 * The quotation's date field, without its label: the text input owns the
 * format (a native date input renders in the browser's locale) and the
 * calendar button borrows the native picker. Tab — either way — and Enter go
 * back to the grid: the screen's two keyboard stops are the grid and this
 * field (Qt `setTabOrder(tblLines, datePriceFrom)`).
 */
import { useState } from "react";
import { cx } from "@/components/design-system/cx";
import qs from "@/features/sales/quotation/page.module.scss";
import { fromDisplayDate, toDisplayDate } from "@/features/sales/quotation/quotation.utils";
import { PRICE_FROM_INPUT_ID } from "../selling-price.constants";
import styles from "../page.module.scss";

const TIP =
  "The day the new prices start. Today = at once. A later day keeps today's prices until then (see Scheduled, F9).";

export function PriceFromField({
  value,
  today,
  disabled,
  onChange,
  onLeave,
}: {
  /** `YYYY-MM-DD`, "" = today. */
  value: string;
  /** `YYYY-MM-DD` — the picker opens no earlier. */
  today: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  /** Back to the grid. */
  onLeave: () => void;
}) {
  const [text, setText] = useState(() => toDisplayDate(value));
  // The day can change from outside (back to today after a scheduled save):
  // the text follows it.
  const [seenValue, setSeenValue] = useState(value);
  if (seenValue !== value) {
    setSeenValue(value);
    setText(toDisplayDate(value));
  }

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange("");
      return;
    }
    const iso = fromDisplayDate(trimmed);
    if (iso) {
      onChange(iso);
      setText(toDisplayDate(iso));
      return;
    }
    // Not a date — snap back rather than leave a half-typed day standing.
    setText(toDisplayDate(value));
  };

  return (
    <span className={cx(qs.dateField, styles.priceFromField)}>
      <input
        id={PRICE_FROM_INPUT_ID}
        className={cx(qs.input, qs.dateInput)}
        value={text}
        placeholder="today"
        inputMode="numeric"
        autoComplete="off"
        aria-label="Price from"
        title={TIP}
        disabled={disabled}
        // F5 / Ctrl+Enter from here commits a half-typed day before the save reads it.
        data-selling-price-commit="true"
        onChange={(event) => {
          setText(event.target.value);
          const iso = fromDisplayDate(event.target.value);
          if (iso) {
            onChange(iso);
          } else if (!event.target.value.trim()) {
            onChange("");
          }
        }}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.ctrlKey || event.metaKey || event.altKey) {
            return;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            commit(event.currentTarget.value);
            onLeave();
          }
        }}
      />
      <span className={qs.dateButton} aria-hidden="true">
        <svg className={qs.dateButtonIcon} viewBox="0 0 16 16">
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
          type="date"
          className={qs.datePicker}
          value={value}
          min={today}
          tabIndex={-1}
          disabled={disabled}
          aria-label="Price from calendar"
          onChange={(event) => onChange(event.target.value)}
          onClick={(event) => {
            const picker = event.currentTarget;
            if (typeof picker.showPicker === "function") {
              // Clicking anywhere but the native icon does nothing otherwise.
              picker.showPicker();
            }
          }}
        />
      </span>
    </span>
  );
}
