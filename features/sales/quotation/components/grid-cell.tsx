"use client";

/**
 * One cell of either grid.
 *
 * Two things make this worth a component of its own:
 *
 *  - **A numeric cell keeps a local edit buffer while it has focus.** Committing
 *    on every keystroke would reformat the text under the operator's cursor (and
 *    turn a half-typed `1.` into `1`); committing on blur/Enter and re-reading
 *    the draft afterwards is what makes the grid usable.
 *  - **Nothing is written back.** The value shown always comes from the draft or
 *    from the engine's output; a cell never holds derived state beyond the
 *    keystrokes not yet committed.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cx } from "@/components/design-system/cx";
import { formatCurrency, formatPerc, formatQty } from "@/domain/pricing";
import type { ColumnAlign, GridCellKind } from "../quotation.constants";
import {
  GRID_COLUMN_INDEX_ATTR,
  GRID_FIELD_ATTR,
  GRID_FOCUS_STOP_ATTR,
  GRID_GRID_ATTR,
  GRID_ROW_ATTR,
} from "../quotation.constants";
import {
  SIZE_FACTOR_COUNT,
  SIZE_FACTOR_LABELS,
  SIZE_FACTOR_PLACEHOLDERS,
  joinSizeFactors,
  sanitizeSizeFactorInput,
  sanitizeSizeInput,
  splitSizeFactors,
} from "../quotation.utils";
import styles from "../page.module.scss";

export type GridCellOption = { value: string; label: string };

export type GridCellProps = {
  kind: GridCellKind;
  value: unknown;
  align: ColumnAlign;
  precision?: number;
  editable: boolean;
  invalid?: boolean;
  /** Painted after the value, never stored in it (the charge grid's rate units). */
  suffix?: string;
  /** Hover text. Defaults to the raw value — the Size cell shows its CFT here. */
  title?: string;
  options?: GridCellOption[];
  placeholder?: string;
  /** Identifies the cell for the Enter-to-next-cell walker. */
  gridName: string;
  rowKey: string;
  fieldKey: string;
  columnIndex: number;
  /**
   * `ui_tbl_clm_column_focus` — whether Enter stops here. See `grid-focus.ts`:
   * on a layout that flags any column at all, the walk visits only the flagged
   * ones, so this is what keeps Enter from crawling through sixty read-outs.
   */
  focusStop?: boolean;
  onCommit: (raw: string) => void;
  onToggle?: (checked: boolean) => void;
  /** Opens the item / charge picker for a lookup cell. */
  onOpenPicker?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
};

const NUMERIC_KINDS: GridCellKind[] = ["qty", "currency", "rate", "perc", "int"];

function isNumericKind(kind: GridCellKind): boolean {
  return NUMERIC_KINDS.includes(kind);
}

function displayValue(kind: GridCellKind, value: unknown, precision?: number): string {
  if (value === null || value === undefined) {
    return "";
  }
  switch (kind) {
    case "currency":
      return formatCurrency(value as number, precision ?? 2, false);
    case "rate":
      return formatCurrency(value as number, precision ?? 2, false);
    case "qty":
      return formatQty(value as number, precision ?? 3);
    case "perc":
      return formatPerc(value as number, precision ?? 2);
    case "int":
      return value === 0 ? "" : String(value);
    default:
      return String(value);
  }
}

/** What a numeric input shows once it has focus: the bare number, ungrouped. */
function rawValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (typeof value === "number") {
    return value === 0 ? "" : String(value);
  }
  return String(value);
}

export function GridCell(props: GridCellProps) {
  const {
    kind,
    value,
    align,
    precision,
    editable,
    invalid,
    suffix,
    title,
    options,
    placeholder,
    gridName,
    rowKey,
    fieldKey,
    columnIndex,
    focusStop,
    onCommit,
    onToggle,
    onOpenPicker,
    onKeyDown,
  } = props;

  const [buffer, setBuffer] = useState<string | null>(null);
  /** The Size cell's own buffer: one entry per box, live only while it has focus. */
  const [sizeBuffer, setSizeBuffer] = useState<string[] | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** The draft value the live buffer was seeded from. */
  const seedRef = useRef<unknown>(undefined);
  /** The text the buffer was seeded with, to tell an edit from a pass-through. */
  const seedTextRef = useRef("");
  /**
   * Set by `onFocus`, consumed by the layout effect below: re-select the value
   * once the seeded buffer has actually been painted.
   */
  const selectAfterSeedRef = useRef(false);

  useEffect(() => {
    if (buffer === null) {
      return;
    }
    if (document.activeElement !== inputRef.current) {
      // Focus moved on without a commit (a click elsewhere, a removed row):
      // the draft wins.
      setBuffer(null);
      return;
    }
    if (value === seedRef.current) {
      return;
    }
    // The draft changed *underneath* a focused editor. This is not the operator's
    // own commit — that clears the buffer first — it is something else writing
    // this field: keying DiscPerc clears DiscPerQty and DiscAmt, and Enter lands
    // focus on one of them. Re-seeding is what stops the stale text from being
    // committed back on blur and silently undoing the discount that was just
    // keyed.
    seedRef.current = value;
    const reseeded = isNumericKind(kind) ? rawValue(value) : String(value ?? "");
    seedTextRef.current = reseeded;
    // Re-select too: this is the Enter walk's own path — focus lands here while
    // the commit that triggered it is still in flight, so the text the operator
    // ends up looking at is the one painted by *this* re-seed, not the one
    // `onFocus` selected.
    selectAfterSeedRef.current = true;
    setBuffer(reseeded);
  }, [buffer, kind, value]);

  // Focusing a cell seeds the buffer, which swaps the painted text from the
  // formatted read-out ("1,000.00") to the bare number ("1000"). React writes
  // that through as a new `value` on the DOM input, and a browser collapses the
  // selection to the caret whenever an input's value is assigned — so the
  // `select()` `onFocus` (and `grid-focus`'s `land()`) just made is gone by the
  // time the operator sees the cell. Re-selecting here, after the commit, is
  // what actually leaves the value highlighted so the first keystroke replaces
  // it. Layout effect, not `useEffect`: the selection is painted with the value
  // rather than a frame later.
  useLayoutEffect(() => {
    if (!selectAfterSeedRef.current) {
      return;
    }
    selectAfterSeedRef.current = false;
    const input = inputRef.current;
    // Focus can have moved on already (a click straight through to another
    // cell); selecting then would steal the highlight from where it now is.
    if (!input || document.activeElement !== input) {
      return;
    }
    input.select();
  });

  const alignClass = align === "right" ? styles.alignRight : align === "center" ? styles.alignCenter : undefined;
  const dataAttrs = {
    [GRID_GRID_ATTR]: gridName,
    [GRID_ROW_ATTR]: rowKey,
    [GRID_FIELD_ATTR]: fieldKey,
    [GRID_COLUMN_INDEX_ATTR]: columnIndex,
    // Absent rather than `"false"`: the walker tests for the attribute, and
    // React drops an `undefined` one entirely.
    ...(focusStop ? { [GRID_FOCUS_STOP_ATTR]: "true" } : {}),
  };

  if (kind === "check") {
    // The attributes go on the INPUT, not on the wrapper: the Enter walker and
    // the grid's `data-quotation-row` lookup both read them off the focused
    // element, so a checkbox whose wrapper carried them ended the walk and made
    // F4 / Ctrl+± dead while focus sat on it.
    return (
      <span className={styles.cellCheckbox}>
        <input
          type="checkbox"
          checked={value === true}
          disabled={!editable}
          onChange={(event) => onToggle?.(event.target.checked)}
          onKeyDown={onKeyDown}
          {...dataAttrs}
        />
      </span>
    );
  }

  if (kind === "serial" || kind === "label") {
    return (
      <span className={cx(styles.cellText, alignClass)} title={String(value ?? "")}>
        {displayValue(kind, value)}
      </span>
    );
  }

  if (kind === "size") {
    // Four boxes — length, width, thickness, pieces — instead of one cell the
    // operator has to key `*` into. The `*` is put back on the way out, so
    // `sqi_size` / `soi_size` still store the product verbatim and a reprint is
    // unchanged; it is only never typed and never shown.
    const stored = typeof value === "string" ? value : "";
    const factors = sizeBuffer ?? splitSizeFactors(stored);
    const commitSize = (next: readonly string[]): void => {
      // Same rule the text cell follows: an untouched buffer is not written
      // back, so tabbing through the boxes cannot dispatch a no-op edit.
      const joined = joinSizeFactors(next);
      if (joined !== stored) {
        onCommit(joined);
      }
    };
    const editBox = (index: number, raw: string): void => {
      setSizeBuffer((current) => {
        const base = current ?? splitSizeFactors(stored);
        const next = [...base];
        // Only the last box tolerates a `*`: nothing keyed through the boxes can
        // produce one, but a size saved as free text before the boxes existed
        // keeps its extra factors there, and stripping them on the first
        // keystroke would rewrite the operator's saved value behind their back.
        next[index] =
          index === SIZE_FACTOR_COUNT - 1
            ? sanitizeSizeInput(raw)
            : sanitizeSizeFactorInput(raw);
        return next;
      });
    };
    return (
      <span
        className={styles.cellSizeBoxes}
        title={title}
        onBlur={(event) => {
          // Blur fires on every hop between the boxes too; only focus leaving
          // the cell altogether ends the edit.
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
            return;
          }
          if (sizeBuffer) {
            commitSize(sizeBuffer);
          }
          setSizeBuffer(null);
        }}
      >
        {factors.map((factor, index) => (
          <input
            key={SIZE_FACTOR_LABELS[index]}
            className={cx(
              styles.cellInput,
              styles.cellSizeBox,
              invalid && styles.cellInvalid,
            )}
            type="text"
            inputMode="decimal"
            value={factor}
            disabled={!editable}
            // The per-box hint, not the cell's `placeholder` prop: one string
            // cannot say what four boxes each mean.
            placeholder={SIZE_FACTOR_PLACEHOLDERS[index]}
            title={title ? `${SIZE_FACTOR_LABELS[index]} — ${title}` : SIZE_FACTOR_LABELS[index]}
            onFocus={(event) => {
              if (!editable) {
                return;
              }
              setSizeBuffer((current) => current ?? splitSizeFactors(stored));
              event.currentTarget.select();
            }}
            onChange={(event) => editBox(index, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && sizeBuffer) {
                event.preventDefault();
                setSizeBuffer(null);
                return;
              }
              if (event.key === "Enter" && sizeBuffer) {
                // Commit before the grid's own Enter handler walks focus on —
                // which lands on the next box, since all four carry the cell's
                // `data-quotation-*` attributes and the walker reads DOM order.
                commitSize(sizeBuffer);
              }
              onKeyDown?.(event);
            }}
            {...dataAttrs}
          />
        ))}
      </span>
    );
  }

  if (kind === "unit" || kind === "priceLevel") {
    if (!editable) {
      return (
        <span className={cx(styles.cellText, alignClass)}>
          {options?.find((option) => option.value === String(value ?? ""))?.label ??
            displayValue("text", value)}
        </span>
      );
    }
    return (
      <select
        className={cx(styles.cellSelect, alignClass, invalid && styles.cellInvalid)}
        value={String(value ?? "")}
        onChange={(event) => onCommit(event.target.value)}
        onKeyDown={onKeyDown}
        {...dataAttrs}
      >
        {(options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (kind === "itemLookup" || kind === "chargeLookup") {
    const label = String(value ?? "");
    return (
      <input
        ref={inputRef}
        className={cx(styles.cellInput, alignClass, invalid && styles.cellInvalid)}
        value={label}
        readOnly
        disabled={!editable}
        placeholder={placeholder ?? "Press Enter to pick…"}
        title={label}
        onFocus={(event) => event.currentTarget.select()}
        onClick={() => {
          if (editable) {
            onOpenPicker?.();
          }
        }}
        onKeyDown={(event) => {
          if (editable && (event.key === "Enter" || event.key === "F2")) {
            event.preventDefault();
            // Stopped here, or the grid's own Enter handler walks the chain on
            // as well and the pick lands against a row whose focus has already
            // moved off it. Opening the picker IS this cell's Enter.
            event.stopPropagation();
            onOpenPicker?.();
            return;
          }
          onKeyDown?.(event);
        }}
        {...dataAttrs}
      />
    );
  }

  const isNumeric = isNumericKind(kind);
  /**
   * Commit only what the operator actually changed. Writing an untouched buffer
   * back would be a no-op for most columns but not for the one-of-three discount
   * groups: tabbing through DiscPerQty would dispatch a write that clears
   * DiscPerc, silently undoing the percentage just keyed.
   */
  const commitBuffer = (): void => {
    if (buffer !== null && buffer !== seedTextRef.current) {
      onCommit(buffer);
    }
    setBuffer(null);
  };
  const focused = buffer !== null;
  const shown = focused
    ? buffer
    : `${displayValue(kind, value, precision)}${suffix && value ? suffix : ""}`;

  return (
    <input
      ref={inputRef}
      className={cx(styles.cellInput, alignClass, invalid && styles.cellInvalid)}
      type={kind === "date" ? "date" : "text"}
      inputMode={isNumeric ? "decimal" : undefined}
      value={shown}
      disabled={!editable}
      placeholder={placeholder}
      title={title ?? (typeof value === "string" ? value : undefined)}
      onFocus={(event) => {
        if (!editable) {
          return;
        }
        const seeded = isNumeric ? rawValue(value) : String(value ?? "");
        seedRef.current = value;
        seedTextRef.current = seeded;
        setBuffer(seeded);
        event.currentTarget.select();
        // The seeded text may differ from what is on screen right now; the
        // layout effect re-selects once it has been painted.
        selectAfterSeedRef.current = true;
      }}
      onChange={(event) => setBuffer(event.target.value)}
      onBlur={commitBuffer}
      // A wheel over a focused numeric input would otherwise scroll the value.
      onWheel={(event) => event.currentTarget.blur()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commitBuffer();
        }
        if (event.key === "Escape" && buffer !== null) {
          event.preventDefault();
          setBuffer(null);
          return;
        }
        onKeyDown?.(event);
      }}
      {...dataAttrs}
    />
  );
}

/** A read-only cell for a value the operator cannot touch. */
export function ReadOnlyCell({
  kind,
  value,
  align,
  precision,
  suffix,
}: {
  kind: GridCellKind;
  value: unknown;
  align: ColumnAlign;
  precision?: number;
  suffix?: string;
}): ReactNode {
  const alignClass =
    align === "right" ? styles.alignRight : align === "center" ? styles.alignCenter : undefined;
  const text = displayValue(kind, value, precision);
  return (
    <span className={cx(styles.cellText, alignClass)} title={text}>
      {text}
      {text && suffix ? suffix : ""}
    </span>
  );
}
