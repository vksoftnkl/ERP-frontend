"use client";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
} from "react";
import { cx } from "@/components/design-system/cx";
import { focusNextInteractiveControl } from "@/components/design-system/ui/focus-next-control";
import { dropdownParamsKey } from "./api";
import { dropdownIdKey } from "./config";
import { DropdownPopup } from "./dropdown-popup";
import { toRawText } from "./format";
import styles from "./nex-dropdown.module.scss";
import type { DropdownParams, DropdownSelection } from "./types";
import { useDropdownKeys } from "./use-dropdown-keys";
import { useDropdownMaster } from "./use-dropdown-master";
import { useDropdownSearch } from "./use-dropdown-search";

export type NexDropdownSingleProps = {
  /** `fixed.dropdown_details.dropdown_id`. */
  dropdownId: string | number;
  /**
   * Controlled. `text` is what the field shows before the list has ever been
   * fetched, so a saved record renders its label without a lookup round-trip.
   *
   * Being controlled also removes a distinction the Qt widget has to make by hand:
   * there, `setSelection()` sets a value without emitting `selected` while
   * `handleRowChosen()` emits, because the load path must not re-trigger the side
   * effects a user's pick triggers. Here a programmatic change is a re-render and
   * fires no callback at all, so there is nothing to block.
   */
  value: DropdownSelection | null;
  /** Fired on a pick, and with `null` on a clear. Never for a value set by the caller. */
  onChange: (selection: DropdownSelection | null) => void;
  /**
   * Values for the dropdown's SQL placeholders. Required by the dropdowns that
   * declare one — 38 (EMPLOYEES) and 45 (SALES AGENTS) today — which fail to run
   * without them rather than returning an unfiltered list.
   */
  params?: DropdownParams;
  /**
   * Drop the selection when `params` change, on the grounds that a value chosen
   * under the old filter may not be in the new list (set a branch after picking an
   * employee and the field would otherwise keep showing an employee from another
   * branch). Never fires on mount, so loading a saved record does not clear it.
   * Set false if the screen re-validates the value itself.
   */
  clearOnParamsChange?: boolean;
  /** Move to the next control after a pick, as the rest of the form's Enter walk does. */
  advanceFocusOnSelect?: boolean;
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
  className?: string;
  emptyText?: string;
  "aria-label"?: string;
};

/**
 * A remote-search combobox over a server-configured dropdown.
 *
 * What it shows and what it stores are decided by the configuration, not by props:
 * the first configured column is the id, `dropdown_completion` names the column
 * whose value fills the input, and the visible columns, their headings, widths,
 * alignment and formatting all come from `fixed.dropdown_columns`. See `config.ts`.
 *
 * The input keeps focus at all times and the list is only a suggestion surface —
 * which is both the Qt behaviour and the ARIA combobox pattern, so correctness and
 * accessibility land together.
 */
export function NexDropdownSingle({
  dropdownId,
  value,
  onChange,
  params,
  clearOnParamsChange = true,
  advanceFocusOnSelect = true,
  id,
  name,
  placeholder,
  disabled = false,
  readOnly = false,
  autoFocus = false,
  invalid = false,
  className,
  emptyText,
  "aria-label": ariaLabel,
}: NexDropdownSingleProps) {
  const generatedId = useId();
  const controlId = id ?? `nex-dropdown-${generatedId}`;
  const listId = `${controlId}-listbox`;
  const resolvedId = String(dropdownId ?? "").trim();
  const paramsKey = dropdownParamsKey(params);

  const fieldRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  /**
   * What has been typed, or `null` for "nothing typed since the last commit".
   *
   * The distinction is what keeps a picked value readable: `""` is a real search
   * (everything matches) that renders as an empty box, so collapsing the two makes
   * clicking into the field blank the name already chosen.
   */
  const [query, setQuery] = useState<string | null>(null);

  const { config, columns, rows, loading, errorMessage, hasMore, total, loadMore, retry } =
    useDropdownSearch({ dropdownId: resolvedId, open, search: query ?? "", params });

  // Read through a ref so committing does not have to re-memoize on every render
  // of the parent form.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  /**
   * Alt+C / Alt+A open the master behind this dropdown, when a feature has
   * registered one. A record the master reports back is selected outright; one it
   * only saved silently leaves the list to be refreshed, because the run SQL
   * filters on the configured text columns and a uuid matches none of them.
   */
  const master = useDropdownMaster({
    dropdownId: resolvedId,
    onSaved: (saved) => {
      retry();
      if (saved?.id) {
        onChangeRef.current({ id: saved.id, text: saved.text ?? "" });
        setQuery(null);
      }
      inputRef.current?.focus();
    },
  });

  const commit = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row || !config) {
        return;
      }
      const id = toRawText(row[dropdownIdKey(config)]).trim();
      if (!id) {
        return;
      }
      onChangeRef.current({ id, text: toRawText(row[config.completionKey]).trim() });
      setQuery(null);
      setOpen(false);
      if (advanceFocusOnSelect && inputRef.current) {
        // The same walk the form's Enter-as-Tab uses; skipWithin keeps focus off
        // this field's own chevron.
        focusNextInteractiveControl(inputRef.current, fieldRef.current);
      }
    },
    [advanceFocusOnSelect, config, rows],
  );

  const handleBackspace = useCallback(() => {
    // Mid-type: an ordinary character delete.
    if (query !== null || !value) {
      return false;
    }
    // A committed value is cleared whole — one keystroke, not a character edit —
    // and the list reopens on what is now an empty search.
    onChangeRef.current(null);
    setQuery("");
    setOpen(true);
    return true;
  }, [query, value]);

  const keys = useDropdownKeys({
    open,
    setOpen,
    rowCount: rows.length,
    resetKey: `${resolvedId}|${query ?? ""}|${paramsKey}`,
    disabled: disabled || readOnly,
    onChoose: commit,
    onBackspace: handleBackspace,
    onCreateShortcut: () => master.requestCreate(query ?? value?.text ?? ""),
    onEditShortcut: () => master.requestEdit(value?.id ?? null, query ?? value?.text ?? ""),
  });

  const close = useCallback(() => {
    keys.closeMenu();
    setQuery(null);
  }, [keys]);

  // A filter change can invalidate a value chosen under the previous one. Compared
  // by serialized key, so a params object rebuilt on every render is not a change,
  // and skipped on mount, so loading a saved record never clears it.
  const lastParamsKeyRef = useRef(paramsKey);
  useEffect(() => {
    if (lastParamsKeyRef.current === paramsKey) {
      return;
    }
    lastParamsKeyRef.current = paramsKey;
    if (clearOnParamsChange && value) {
      // Only the committed value goes. Text the operator is part-way through
      // typing is theirs, and survives a filter changing underneath it.
      onChangeRef.current(null);
    }
  }, [clearOnParamsChange, paramsKey, value]);

  // Outside click. The popup is portaled, so it is NOT inside the field's subtree
  // and has to be tested separately — a menu left out of this test swallows every
  // option click, a bug this codebase has already paid for once.
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
      // Tabbing out fires no mousedown, so without this the list stays open and the
      // input keeps rendering a half-typed search over the committed value.
      close();
    },
    [close],
  );

  return (
    <div ref={fieldRef} className={cx(styles.field, className)} onBlur={handleBlur}>
      <input
        ref={inputRef}
        id={controlId}
        name={name}
        className={cx(styles.input, invalid && styles.inputInvalid)}
        value={query ?? value?.text ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        autoFocus={autoFocus}
        autoComplete="off"
        // A search box is not a value to capitalize; the global capture-phase
        // listener rewrites free-text inputs per system.font_capitalization.
        data-uppercase="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-activedescendant={
          open && keys.engaged && rows.length > 0 ? `${controlId}-option-${keys.highlight}` : undefined
        }
        onChange={(event) => {
          setQuery(event.target.value);
          keys.engage();
        }}
        onKeyDown={keys.handleKeyDown}
        // Clicking into the field is the "let me browse" gesture, so it opens the
        // list; arriving by keyboard is not. Opening on focus instead looks
        // helpful and costs a request per field the operator walks past — and
        // because a pick advances focus to the next control, one pick then opens
        // and queries the dropdown after it, and so on down the form.
        onMouseDown={() => {
          if (!disabled && !readOnly && !open) {
            // Opened, but NOT engaged: an Enter arriving next belongs to the form's
            // Enter-as-Tab walk, not to the top row of this list.
            keys.openMenu();
          }
        }}
        onFocus={(event) => {
          // Select, so the first keystroke replaces a committed value rather than
          // appending to it.
          event.target.select();
        }}
      />
      <button
        type="button"
        className={styles.chevron}
        disabled={disabled || readOnly}
        tabIndex={-1}
        aria-hidden="true"
        onMouseDown={(event) => {
          // The input keeps focus; the chevron only toggles.
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
