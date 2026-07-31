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
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/components/design-system/cx";
import { formatCurrency, formatPerc, formatQty } from "@/domain/pricing";
import type { ColumnAlign, GridCellKind } from "../quotation.constants";
import {
  GRID_COLUMN_INDEX_ATTR,
  GRID_FIELD_ATTR,
  GRID_GRID_ATTR,
  GRID_ROW_ATTR,
} from "../quotation.constants";
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
  options?: GridCellOption[];
  placeholder?: string;
  /** Identifies the cell for the Enter-to-next-cell walker. */
  gridName: string;
  rowKey: string;
  fieldKey: string;
  columnIndex: number;
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
    options,
    placeholder,
    gridName,
    rowKey,
    fieldKey,
    columnIndex,
    onCommit,
    onToggle,
    onOpenPicker,
    onKeyDown,
  } = props;

  const [buffer, setBuffer] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** The draft value the live buffer was seeded from. */
  const seedRef = useRef<unknown>(undefined);
  /** The text the buffer was seeded with, to tell an edit from a pass-through. */
  const seedTextRef = useRef("");

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
    setBuffer(reseeded);
  }, [buffer, kind, value]);

  const alignClass = align === "right" ? styles.alignRight : align === "center" ? styles.alignCenter : undefined;
  const dataAttrs = {
    [GRID_GRID_ATTR]: gridName,
    [GRID_ROW_ATTR]: rowKey,
    [GRID_FIELD_ATTR]: fieldKey,
    [GRID_COLUMN_INDEX_ATTR]: columnIndex,
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
      title={typeof value === "string" ? value : undefined}
      onFocus={(event) => {
        if (!editable) {
          return;
        }
        const seeded = isNumeric ? rawValue(value) : String(value ?? "");
        seedRef.current = value;
        seedTextRef.current = seeded;
        setBuffer(seeded);
        event.currentTarget.select();
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
