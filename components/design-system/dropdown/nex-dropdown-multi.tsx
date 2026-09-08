"use client";
import { useCallback, useEffect, useId, useRef, useState, type FocusEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { dropdownParamsKey } from "./api";
import { dropdownIdKey } from "./config";
import { DropdownPopup } from "./dropdown-popup";
import { toRawText } from "./format";
import styles from "./nex-dropdown.module.scss";
import type { DropdownParams, DropdownSelection } from "./types";
import { useDropdownKeys } from "./use-dropdown-keys";
import { useDropdownMaster } from "./use-dropdown-master";
import { useDropdownSearch } from "./use-dropdown-search";

export type NexDropdownMultiProps = {
  /** `fixed.dropdown_details.dropdown_id`. */
  dropdownId: string | number;
  /**
   * Controlled, **in pick order** — that ordering is the contract, not an
   * accident of storage, so never round-trip this through a Set or a keyed map.
   *
   * Selections carry their text as well as their id (the Qt widget keeps ids and
   * looks the labels up separately). Chips have to render a label before any list
   * has been fetched, and a caller loading a saved record already has both.
   */
  value: readonly DropdownSelection[];
  onChange: (next: DropdownSelection[]) => void;
  params?: DropdownParams;
  /**
   * Close the list after each pick.
   *
   * Default false, deliberately diverging from the Qt widget, which closes and so
   * makes picking five tags five reopens. Multi exists to pick several.
   */
  closeOnSelect?: boolean;
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
  className?: string;
  emptyText?: string;
  "aria-label"?: string;
};

/**
 * The multi-select variant: chips in pick order, one shared search box.
 *
 * Shares every data and keyboard rule with `NexDropdownSingle` through the same
 * two hooks — they are two components over one hook pair, not a base class with
 * two subclasses. Only three behaviours differ: a pick appends instead of
 * replacing, re-picking an id already held is a no-op rather than a toggle, and
 * Backspace on an empty search box removes the last chip.
 */
export function NexDropdownMulti({
  dropdownId,
  value,
  onChange,
  params,
  closeOnSelect = false,
  id,
  name,
  placeholder,
  disabled = false,
  readOnly = false,
  invalid = false,
  className,
  emptyText,
  "aria-label": ariaLabel,
}: NexDropdownMultiProps) {
  const generatedId = useId();
  const controlId = id ?? `nex-dropdown-multi-${generatedId}`;
  const listId = `${controlId}-listbox`;
  const resolvedId = String(dropdownId ?? "").trim();
  const paramsKey = dropdownParamsKey(params);

  const fieldRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  /** Plain text here: there is no committed value for the box to display. */
  const [query, setQuery] = useState("");

  const { config, columns, rows, loading, errorMessage, hasMore, total, loadMore, retry } =
    useDropdownSearch({ dropdownId: resolvedId, open, search: query, params });

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const append = useCallback(
    (selection: DropdownSelection) => {
      const current = valueRef.current;
      // Re-picking is a no-op, not a toggle: the operator reaching for a row they
      // already hold means "this one", not "remove it".
      if (current.some((held) => held.id === selection.id)) {
        return;
      }
      onChangeRef.current([...current, selection]);
    },
    [],
  );

  const commit = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row || !config) {
        return;
      }
      const selectionId = toRawText(row[dropdownIdKey(config)]).trim();
      if (!selectionId) {
        return;
      }
      append({ id: selectionId, text: toRawText(row[config.completionKey]).trim() });
      setQuery("");
      if (closeOnSelect) {
        setOpen(false);
      }
      inputRef.current?.focus();
    },
    [append, closeOnSelect, config, rows],
  );

  const removeAt = useCallback((index: number) => {
    const current = valueRef.current;
    onChangeRef.current(current.filter((_, position) => position !== index));
  }, []);

  const handleBackspace = useCallback(() => {
    // Mid-edit: an ordinary character delete.
    if (query.length > 0 || valueRef.current.length === 0) {
      return false;
    }
    removeAt(valueRef.current.length - 1);
    return true;
  }, [query.length, removeAt]);

  const master = useDropdownMaster({
    dropdownId: resolvedId,
    onSaved: (saved) => {
      retry();
      if (saved?.id) {
        append({ id: saved.id, text: saved.text ?? "" });
        setQuery("");
      }
      inputRef.current?.focus();
    },
  });

  const keys = useDropdownKeys({
    open,
    setOpen,
    rowCount: rows.length,
    resetKey: `${resolvedId}|${query}|${paramsKey}`,
    disabled: disabled || readOnly,
    onChoose: commit,
    onBackspace: handleBackspace,
    onCreateShortcut: () => master.requestCreate(query),
    // Alt+A amends the most recent chip: the field holds no single "current" row.
    onEditShortcut: () =>
      master.requestEdit(valueRef.current[valueRef.current.length - 1]?.id ?? null, query),
  });

  const close = useCallback(() => {
    keys.closeMenu();
    setQuery("");
  }, [keys]);

  // Outside click, including the portaled popup — see NexDropdownSingle.
  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (fieldRef.current?.contains(target) || popupRef.current?.contains(target)) {
        return;
      }
      close();
    };
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [close, open]);

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const next = event.relatedTarget as Node | null;
      if (next && (event.currentTarget.contains(next) || popupRef.current?.contains(next))) {
        return;
      }
      close();
    },
    [close],
  );

  return (
    <div
      ref={fieldRef}
      className={cx(styles.field, styles.fieldMulti, invalid && styles.fieldMultiInvalid, className)}
      onBlur={handleBlur}
      // The chips wrap, so the frame grows; clicking anywhere in it is a click on
      // the field, and focus belongs in the search box.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !disabled && !readOnly) {
          inputRef.current?.focus();
          keys.openMenu();
        }
      }}
    >
      <div className={styles.tokens}>
        {value.map((selection, index) => (
          <span key={selection.id} className={styles.token}>
            <span className={styles.tokenText}>{selection.text || selection.id}</span>
            {disabled || readOnly ? null : (
              <button
                type="button"
                className={styles.tokenRemove}
                tabIndex={-1}
                aria-label={`Remove ${selection.text || selection.id}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  removeAt(index);
                  inputRef.current?.focus();
                }}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          id={controlId}
          name={name}
          className={styles.tokenInput}
          value={query}
          placeholder={value.length === 0 ? placeholder : undefined}
          disabled={disabled}
          readOnly={readOnly}
          autoComplete="off"
          data-uppercase="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          aria-activedescendant={
            open && keys.engaged && rows.length > 0
              ? `${controlId}-option-${keys.highlight}`
              : undefined
          }
          onChange={(event) => {
            setQuery(event.target.value);
            keys.engage();
          }}
          onKeyDown={keys.handleKeyDown}
          onMouseDown={() => {
            if (!disabled && !readOnly && !open) {
              keys.openMenu();
            }
          }}
        />
      </div>
      <button
        type="button"
        className={styles.chevron}
        disabled={disabled || readOnly}
        tabIndex={-1}
        aria-hidden="true"
        onMouseDown={(event) => {
          event.preventDefault();
          if (open) {
            close();
          } else {
            keys.openMenu();
            inputRef.current?.focus();
          }
        }}
      >
        <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open ? (
        <DropdownPopup
          anchorRef={fieldRef}
          columns={columns}
          config={config}
          emptyText={emptyText}
          errorMessage={errorMessage}
          hasMore={hasMore}
          highlight={keys.highlight}
          listId={listId}
          loading={loading}
          onChoose={commit}
          onHighlight={keys.setHighlight}
          onLoadMore={loadMore}
          onRetry={retry}
          optionId={(index) => `${controlId}-option-${index}`}
          popupRef={popupRef}
          rows={rows}
          total={total}
        />
      ) : null}
      {master.entry}
    </div>
  );
}
