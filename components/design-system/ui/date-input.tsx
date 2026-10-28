"use client";

/**
 * The house date box: `dd/MM/yyyy` on every desk, whatever the browser's locale.
 *
 * Not a bare `<input type="date">`: that renders in the BROWSER's locale, so the
 * same voucher reads `10/12/2026` on one desk and `12/10/2026` on the next (and
 * headless Chromium always shows `mm/dd/yyyy`). Here a text input owns the
 * format (`lib/date-format.ts`) and the calendar button borrows the native
 * picker — kept rendered but transparent, because `showPicker()` refuses an
 * unrendered input.
 *
 * A drop-in for the native box: `value` / `onChange` speak ISO `yyyy-MM-dd`
 * ("" for no date), `min` / `max` bound the picker, and every other input prop
 * (`className`, `id`, `data-*`, `onKeyDown`, `ref`…) lands on the TEXT input, so
 * the caller's styling and Enter walks find it where the native box was.
 *
 * Typing: the house format, or `-` `.` as the separator, one-digit days and
 * months, eight bare digits; a two-digit year once the box is left. A complete
 * date goes out as it is typed; a half-typed one snaps back on leaving. ↑ / ↓
 * step a day (Qt NexDateEdit), from today when the box is empty.
 */
import {
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type Ref,
} from "react";
import { cx } from "@/components/design-system/cx";
import styles from "@/components/design-system/ui/date-input.module.scss";
import {
  DATE_PLACEHOLDER,
  DATE_TIME_PLACEHOLDER,
  formatLocalDateTimeValue,
  isoToDisplayDate,
  parseDisplayDate,
  parseDisplayDateTime,
} from "@/lib/date-format";
import { dateStepOf, stepIsoDate } from "@/lib/date-step";

type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "onChange" | "min" | "max" | "size"
>;

type BaseProps = NativeInputProps & {
  /** Fires with the new value, or "" when the box is cleared. */
  onChange: (value: string) => void;
  ref?: Ref<HTMLInputElement>;
  /** On the wrapper — for a box that was a flex / grid item itself. */
  wrapperClassName?: string;
  wrapperStyle?: CSSProperties;
  /** Fill the parent's width (`display: flex; width: 100%`). */
  block?: boolean;
  /** No calendar button — for dense grid cells. */
  noPicker?: boolean;
  /** An emptied box sends "" (default). When false it snaps back instead. */
  clearable?: boolean;
  /** The calendar button's accessible name; defaults from `aria-label`. */
  pickerLabel?: string;
};

export type DateInputProps = BaseProps & {
  /** ISO `yyyy-MM-dd`, or "" / null for no date. */
  value: string | null | undefined;
  /** ISO `yyyy-MM-dd` bounds for the calendar. */
  min?: string;
  max?: string;
  /** ↑ / ↓ step a day (default true). Off where the arrows move a grid's row. */
  arrowStep?: boolean;
};

export type DateTimeInputProps = BaseProps & {
  /** Local `yyyy-MM-ddTHH:mm` (a `datetime-local` value), or "" / null. */
  value: string | null | undefined;
  min?: string;
  max?: string;
};

type Mode = {
  pickerType: "date" | "datetime-local";
  placeholder: string;
  /** The value as the box shows it. */
  show: (value: string) => string;
  /** Typed text → value; `final` when the box is being left (looser reading). */
  parse: (text: string, final: boolean) => string | null;
  /** The value as the native picker takes it ("" when it is not one). */
  pickerValue: (value: string) => string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const DATE_MODE: Mode = {
  pickerType: "date",
  placeholder: DATE_PLACEHOLDER,
  show: (value) => isoToDisplayDate(value) || value,
  parse: (text, final) => parseDisplayDate(text, { allowShortYear: final }),
  pickerValue: (value) => {
    const head = value.slice(0, 10);
    return ISO_DATE.test(head) ? head : "";
  },
};

const DATE_TIME_MODE: Mode = {
  pickerType: "datetime-local",
  placeholder: DATE_TIME_PLACEHOLDER,
  show: (value) => formatLocalDateTimeValue(value) || value,
  parse: (text) => parseDisplayDateTime(text),
  pickerValue: (value) => (LOCAL_DATE_TIME.test(value) ? value.slice(0, 16) : ""),
};

function assignRef<T>(ref: Ref<T> | undefined, node: T | null): void {
  if (typeof ref === "function") {
    ref(node);
  } else if (ref) {
    (ref as { current: T | null }).current = node;
  }
}

function CalendarIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.75" y="3" width="12.5" height="11.25" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M1.75 6.5h12.5M5 1.75v2.5M11 1.75v2.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.3"
      />
    </svg>
  );
}

type DateBoxProps = BaseProps & {
  mode: Mode;
  value: string | null | undefined;
  min?: string;
  max?: string;
  arrowStep?: boolean;
};

function DateBox({
  mode,
  value: rawValue,
  onChange,
  min,
  max,
  ref,
  className,
  style,
  wrapperClassName,
  wrapperStyle,
  block,
  noPicker,
  clearable = true,
  pickerLabel,
  arrowStep = false,
  placeholder,
  disabled,
  readOnly,
  onKeyDown,
  onBlur,
  onFocus,
  ...inputProps
}: DateBoxProps) {
  const value = rawValue ?? "";
  const textRef = useRef<HTMLInputElement | null>(null);
  // What is being typed, or null while the box simply shows the value — so a
  // value set from outside (a load, a reset, the calendar) always reads back
  // in the house format.
  const [typing, setTyping] = useState<string | null>(null);
  const shown = typing ?? mode.show(value);

  const emit = (next: string) => {
    if (next !== value) onChange(next);
  };

  const commit = (raw: string) => {
    setTyping(null);
    const trimmed = raw.trim();
    if (!trimmed) {
      if (clearable) emit("");
      return;
    }
    const parsed = mode.parse(trimmed, true);
    // Not a date: the box goes back to showing the value rather than leave a
    // half-typed date standing.
    if (parsed) emit(parsed);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Enter settles the typed text BEFORE the caller's Enter walk / search runs.
    if (event.key === "Enter" && typing !== null) {
      commit(event.currentTarget.value);
    }
    onKeyDown?.(event);
    if (event.defaultPrevented || !arrowStep || readOnly || disabled) return;
    const step = dateStepOf(event.nativeEvent);
    if (step !== 0) {
      event.preventDefault();
      const from = mode.parse(event.currentTarget.value, true) ?? (ISO_DATE.test(value) ? value : "");
      setTyping(null);
      emit(stepIsoDate(from, step));
    }
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    if (typing !== null) commit(event.currentTarget.value);
    onBlur?.(event);
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    // Typing replaces the whole date, the way a dense entry screen expects.
    if (!readOnly) event.currentTarget.select();
    onFocus?.(event);
  };

  const label = pickerLabel ?? (inputProps["aria-label"] ? `${inputProps["aria-label"]} calendar` : "Open calendar");
  const pickerOff = disabled || readOnly;

  return (
    <span className={cx(styles.root, block && styles.block, wrapperClassName)} style={wrapperStyle}>
      <input
        {...inputProps}
        ref={(node) => {
          textRef.current = node;
          assignRef(ref, node);
        }}
        type="text"
        className={cx(styles.text, className)}
        style={noPicker ? style : { ...style, paddingRight: "calc(var(--erp-date-input-button) + 2px)" }}
        value={shown}
        placeholder={placeholder ?? mode.placeholder}
        size={mode.pickerType === "date" ? 11 : 20}
        inputMode={mode.pickerType === "date" ? "numeric" : undefined}
        autoComplete="off"
        spellCheck={false}
        data-uppercase="off"
        disabled={disabled}
        readOnly={readOnly}
        onChange={(event) => {
          const text = event.target.value;
          setTyping(text);
          const parsed = mode.parse(text, false);
          if (parsed) emit(parsed);
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={handleFocus}
      />
      {noPicker ? null : (
        <span className={cx(styles.button, pickerOff && styles.buttonDisabled)}>
          <CalendarIcon />
          <input
            type={mode.pickerType}
            className={styles.picker}
            value={mode.pickerValue(value)}
            min={min}
            max={max}
            tabIndex={-1}
            disabled={pickerOff}
            aria-label={label}
            data-date-picker-proxy="true"
            onChange={(event) => {
              setTyping(null);
              if (event.target.value) emit(event.target.value.slice(0, mode.pickerType === "date" ? 10 : 16));
              textRef.current?.focus();
            }}
            onClick={(event) => {
              const picker = event.currentTarget;
              try {
                picker.showPicker?.();
              } catch {
                // No user activation / cross-origin frame — the click still
                // focuses the native box, which opens on its own icon.
              }
            }}
          />
        </span>
      )}
    </span>
  );
}

/** A `dd/MM/yyyy` date box; see the file comment. */
export function DateInput({ arrowStep = true, ...props }: DateInputProps) {
  return <DateBox {...props} mode={DATE_MODE} arrowStep={arrowStep} />;
}

/** A `dd/MM/yyyy hh:mm AM` date-and-time box over a `datetime-local` value. */
export function DateTimeInput(props: DateTimeInputProps) {
  return <DateBox {...props} mode={DATE_TIME_MODE} arrowStep={false} />;
}
