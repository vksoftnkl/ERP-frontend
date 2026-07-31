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
  type ReactNode,
} from "react";
import { cx } from "@/components/design-system/cx";
import { useLazyRunDropdownQuery } from "@/store/api/quotationApi";
import styles from "../page.module.scss";

export function GroupBox({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cx(styles.group, className)}>
      <legend className={styles.groupTitle}>{title}</legend>
      {children}
    </fieldset>
  );
}

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
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
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  maxLength?: number;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
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
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        className={styles.input}
        type="date"
        value={value}
        disabled={disabled}
        data-quotation-focus={id}
        onChange={(event) => onChange(event.target.value)}
      />
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
  const [query, setQuery] = useState("");
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
    const timer = window.setTimeout(() => fetchOptions(query), 250);
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
    setQuery("");
  };

  return (
    <Field label={label} htmlFor={id}>
      <div
        className={styles.combo}
        ref={rootRef}
        // Tabbing out fires no mousedown, so without this the menu stays open and
        // the input keeps rendering the empty search text over a selected value.
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setOpen(false);
            setQuery("");
          }
        }}
      >
        <input
          id={id}
          className={styles.input}
          value={open ? query : selectedLabel}
          disabled={disabled}
          placeholder={placeholder ?? "Search…"}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-menu`}
          data-quotation-focus={id}
          onFocus={() => {
            if (!disabled) {
              setOpen(true);
              setQuery("");
              fetchOptions("");
            }
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
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
            }
          }}
        />
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
