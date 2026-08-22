"use client";

/**
 * The header blocks' field primitives: a labelled control, and the searchable
 * combobox the customer / place-of-supply / agent / salesman fields are built on.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { cx } from "@/components/design-system/cx";
import { useLazyRunDropdownQuery } from "@/store/api/quotationApi";
import { fromDisplayDate, toDisplayDate } from "../quotation.utils";
import styles from "../page.module.scss";

export function GroupBox({
  title,
  children,
  className,
  onContextMenu,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  /** For a panel that carries its own right-click configuration. */
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
}) {
  return (
    <fieldset className={cx(styles.group, className)} onContextMenu={onContextMenu}>
      <legend className={styles.groupTitle}>{title}</legend>
      {children}
    </fieldset>
  );
}

export function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  /** Marks the label, for a field the save refuses to go without. */
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
        {required ? (
          // Carries the word too, for a reader who cannot see the colour the
          // asterisk is drawn in.
          <span className={styles.requiredMark} title="Required">
            *<span className={styles.srOnly}> (required)</span>
          </span>
        ) : null}
      </label>
      {children}
    </>
  );
}

export function TextField({
  id,
  label,
  value,
  disabled,
  maxLength,
  placeholder,
  required,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  maxLength?: number;
  placeholder?: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} htmlFor={id} required={required}>
      <input
        id={id}
        className={styles.input}
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
        data-quotation-focus={id}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
    </Field>
  );
}

export function NumberField({
  id,
  label,
  value,
  disabled,
  min,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  disabled?: boolean;
  min?: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        className={cx(styles.input, styles.alignRight)}
        type="number"
        value={Number.isFinite(value) ? value : 0}
        disabled={disabled}
        min={min}
        data-quotation-focus={id}
        step={1}
        // `sqValidityDays` is an integer column and the DTO's transform passes a
        // non-integer straight to `@IsInt()`, so 7.5 would 400 the whole save.
        onChange={(event) => onChange(Math.trunc(Number.parseFloat(event.target.value) || 0))}
      />
    </Field>
  );
}

/**
 * A `dd-mm-yyyy` date field.
 *
 * Not `<input type="date">`: that renders in the BROWSER's locale, so the same
 * screen reads `08/01/2026` here and `01/08/2026` on the next desk. The text
 * input owns the format and the calendar button borrows the native picker —
 * kept in the DOM (transparent, not `display: none`) because `showPicker()`
 * refuses to open for an unrendered input.
 */
export function DateField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [text, setText] = useState(() => toDisplayDate(value));
  const pickerRef = useRef<HTMLInputElement | null>(null);

  // The draft is the source of truth: a re-derived validity date, a load or a
  // Clear all arrive as a new `value` and must be shown as typed-in text.
  useEffect(() => {
    setText(toDisplayDate(value));
  }, [value]);

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
    // Not a date — snap back rather than leave a half-typed cell standing.
    setText(toDisplayDate(value));
  };

  return (
    <Field label={label} htmlFor={id}>
      <div className={styles.dateField}>
        <input
          id={id}
          className={cx(styles.input, styles.dateInput)}
          value={text}
          placeholder="dd-mm-yyyy"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          data-quotation-focus={id}
          onChange={(event) => {
            setText(event.target.value);
            const iso = fromDisplayDate(event.target.value);
            if (iso) {
              onChange(iso);
            }
          }}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commit(event.currentTarget.value);
            }
          }}
        />
        <span className={styles.dateButton} aria-hidden="true">
          <svg className={styles.dateButtonIcon} viewBox="0 0 16 16">
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
            ref={pickerRef}
            type="date"
            className={styles.datePicker}
            value={value}
            tabIndex={-1}
            disabled={disabled}
            aria-label={`${label} calendar`}
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
      </div>
    </Field>
  );
}

export function SelectField({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <select
        id={id}
        className={styles.select}
        value={value}
        disabled={disabled}
        data-quotation-focus={id}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function CheckField({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.check} aria-disabled={disabled ? "true" : undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

/**
 * A value the operator cannot change but which still reads as a field — the
 * quote number, which the server allocates inside its create transaction.
 * `readOnly` rather than `disabled`: it keeps the white box of the fields around
 * it instead of greying out, and stays selectable so the number can be copied.
 */
export function ReadOnlyInput({
  id,
  label,
  value,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        className={cx(styles.input, styles.inputReadOnly)}
        value={value}
        placeholder={placeholder}
        readOnly
        tabIndex={-1}
        autoComplete="off"
      />
    </Field>
  );
}

export function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <Field label={label}>
      <span className={styles.readOnlyValue} title={value}>
        {value || "—"}
      </span>
    </Field>
  );
}

// ---------------------------------------------------------------------------

/**
 * Whether this keystroke is the operator starting to edit the box, as opposed
 * to navigating it (arrows, Enter, Escape, Tab) or running a shortcut.
 */
function startsEditing(event: ReactKeyboardEvent<HTMLInputElement>): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }
  return event.key.length === 1 || event.key === "Backspace" || event.key === "Delete";
}

export type DropdownComboProps = {
  id: string;
  label: string;
  /** `fixed.dropdown_details.dropdown_id`. */
  dropdownId: string;
  /** The SQL column that holds the value, and the one that holds the label. */
  valueKey: string;
  labelKey: string;
  /** Optional second column shown greyed on the right of each option. */
  metaKey?: string;
  value: string;
  /** The label to show for `value` when the list has not been fetched yet. */
  selectedLabel: string;
  disabled?: boolean;
  placeholder?: string;
  onSelect: (value: string, label: string) => void;
};

/**
 * A server-searched combobox over a configured dropdown.
 *
 * The menu is rendered inside the field's own relatively-positioned wrapper
 * rather than portaled: the header blocks are not inside a scroll container, so
 * there is nothing to clip it, and keeping it in the tree means the
 * outside-click test is a single `contains` check. (A portaled menu whose ref is
 * left out of that test swallows every option click — a bug this codebase has
 * already paid for once.)
 */
export function DropdownCombo(props: DropdownComboProps) {
  const {
    id,
    label,
    dropdownId,
    valueKey,
    labelKey,
    metaKey,
    value,
    selectedLabel,
    disabled,
    placeholder,
    onSelect,
  } = props;

  const [open, setOpen] = useState(false);
  /**
   * What has been typed into the box, or `null` for "the menu is open but no
   * search has been keyed yet".
   *
   * The distinction is what keeps the picked customer readable: an empty string
   * is a real search (everything matches) and renders as an empty box, so
   * collapsing the two made simply clicking into the field blank the name that
   * was already chosen. While the query is `null` the box shows the selection
   * and the first keystroke replaces it, because focusing also selects the text.
   */
  const [query, setQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [runDropdown, { data, isFetching }] = useLazyRunDropdownQuery();

  const options = useMemo(() => {
    const rows = data?.items ?? [];
    return rows
      .map((row) => ({
        value: String(row[valueKey] ?? ""),
        label: String(row[labelKey] ?? ""),
        meta: metaKey ? String(row[metaKey] ?? "") : "",
      }))
      .filter((option) => option.value);
  }, [data, labelKey, metaKey, valueKey]);

  const fetchOptions = useCallback(
    (search: string) => {
      void runDropdown({ dropdownId, search, limit: 25 });
    },
    [dropdownId, runDropdown],
  );

  // Debounced server-side search: these dropdowns filter in SQL, so typing must
  // refetch rather than narrow a cached page.
  useEffect(() => {
    if (!open) {
      return;
    }
    const timer = window.setTimeout(() => fetchOptions(query ?? ""), 250);
    return () => window.clearTimeout(timer);
  }, [fetchOptions, open, query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const commit = (option: { value: string; label: string }) => {
    onSelect(option.value, option.label);
    setOpen(false);
    setQuery(null);
  };

  return (
    <Field label={label} htmlFor={id}>
      <div
        className={styles.combo}
        ref={rootRef}
        // Tabbing out fires no mousedown, so without this the menu stays open and
        // the input keeps rendering a half-typed search over the selected value.
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setOpen(false);
            setQuery(null);
          }
        }}
      >
        <input
          id={id}
          className={cx(styles.input, styles.comboInput)}
          // The typed search only takes over once there IS one; otherwise the
          // box reads back what is selected, open or not.
          //
          // `selectedLabel` is coerced even though the prop is typed `string`: a
          // draft restored from JSON (a parked cart) or held across a dev
          // hot-reload can be missing a field the type promises, and an
          // `undefined` here would make React switch the input from
          // uncontrolled to controlled and drop whatever had been typed into it.
          // A blank label is the right reading of "nothing picked" anyway.
          value={open && query !== null ? query : (selectedLabel ?? "")}
          disabled={disabled}
          placeholder={placeholder ?? "Search…"}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-menu`}
          data-quotation-focus={id}
          onFocus={(event) => {
            if (!disabled) {
              setOpen(true);
              // Not `""`: that is a search for everything and would blank the
              // box, hiding the very name the operator came back to check.
              setQuery(null);
              setActiveIndex(0);
              // Selected rather than cleared, so the first keystroke still
              // replaces the whole thing and searching feels the same as before
              // — the grid cells arrive focused the same way.
              event.currentTarget.select();
              fetchOptions("");
            }
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            // The box is showing the current selection rather than a search, so
            // this keystroke has to replace the whole label instead of being
            // appended to it — otherwise the search runs for "KARTHIKV".
            // Focusing selects the text for exactly this reason, but focus does
            // not fire again when the field already has it: after Escape, or
            // after picking with Enter, which leaves the caret in place.
            if (query === null && startsEditing(event)) {
              event.currentTarget.select();
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => Math.min(index + 1, Math.max(options.length - 1, 0)));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
              return;
            }
            if (event.key === "Enter" && open && options[activeIndex]) {
              event.preventDefault();
              commit(options[activeIndex]);
              return;
            }
            if (event.key === "Escape" && open) {
              event.preventDefault();
              setOpen(false);
              // Abandons the half-typed search rather than leaving it to
              // reappear the next time the menu opens.
              setQuery(null);
            }
          }}
        />
        <button
          type="button"
          className={styles.comboToggle}
          disabled={disabled}
          // Not a tab stop: the input beside it already is, and this only
          // duplicates what focusing that input does.
          tabIndex={-1}
          aria-hidden="true"
          onMouseDown={(event) => {
            // Keep focus where it is, so an open menu closes on click instead of
            // blurring and immediately reopening from the input's own onFocus.
            event.preventDefault();
          }}
          onClick={() => {
            if (disabled) {
              return;
            }
            if (open) {
              setOpen(false);
              setQuery(null);
              return;
            }
            document.getElementById(id)?.focus();
          }}
        >
          <svg className={styles.comboToggleIcon} viewBox="0 0 10 6" aria-hidden="true">
            <path
              d="M1 1l4 4 4-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.4"
            />
          </svg>
        </button>
        {open ? (
          <div className={styles.comboMenu} id={`${id}-menu`} role="listbox">
            {isFetching && options.length === 0 ? (
              <p className={styles.comboEmpty}>Searching…</p>
            ) : null}
            {!isFetching && options.length === 0 ? (
              <p className={styles.comboEmpty}>Nothing matches.</p>
            ) : null}
            {options.map((option, index) => (
              <button
                key={option.value}
                type="button"
                className={styles.comboOption}
                data-active={index === activeIndex ? "true" : undefined}
                aria-selected={option.value === value}
                role="option"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(option)}
              >
                <span>{option.label}</span>
                {option.meta ? <span className={styles.comboOptionMeta}>{option.meta}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </Field>
  );
}
