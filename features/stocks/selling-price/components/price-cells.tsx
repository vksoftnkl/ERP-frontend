"use client";

/**
 * The grid's cells — the Qt delegate's editors and paint.
 *
 *  - A number cell keeps a local edit buffer while it has focus and commits on
 *    Enter or on leaving it, and only when something was TYPED: Enter straight
 *    through is not an edit (the delegate's setModelData rule), so walking the
 *    Enter chain never re-derives a price.
 *  - A cell that will not open SAYS why: it stays focusable (read-only), and
 *    the first keystroke puts the reason on the hint line instead of being
 *    swallowed silently.
 *  - The Item cell is the picker (grid 71): a printable key opens it with that
 *    key as the search, Enter on the spare line opens it empty.
 */
import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { cx } from "@/components/design-system/cx";
import {
  GRID_FIELD_ATTR,
  GRID_FOCUS_STOP_ATTR,
  GRID_GRID_ATTR,
  GRID_LOOKUP_ATTR,
  GRID_ROW_ATTR,
} from "@/features/sales/quotation/quotation.constants";
import { chipColours, isMkupKey, SELLING_PRICE_GRID_NAME, type ColumnKey } from "../selling-price.constants";
import { cellText, deltaFits, deltaOf, deltaText, DASH } from "../selling-price.display";
import {
  acceptsTyping,
  editorKindOf,
  editorText,
  isChanged,
  srcOfRow,
  verdictOf,
  whyNotEditable,
  type CellEditorKind,
  type PriceGridRow,
} from "../selling-price.state";
import type { BelowCostPolicy } from "../selling-price.types";
import type { SellingPriceColumn } from "../selling-price.columns";
import styles from "../page.module.scss";

type Align = "left" | "right" | "center";

function alignClass(align: Align): string {
  return align === "right" ? styles.alignRight : align === "center" ? styles.alignCenter : styles.alignLeft;
}

/** Whether this keystroke is the operator starting to type into the cell. */
export function startsEditing(event: ReactKeyboardEvent<HTMLElement>): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }
  return event.key.length === 1 || event.key === "Backspace" || event.key === "Delete" || event.key === "F2";
}

function cellAttrs(rowKey: string, column: ColumnKey, focusStop: boolean, lookup = false) {
  return {
    [GRID_GRID_ATTR]: SELLING_PRICE_GRID_NAME,
    [GRID_ROW_ATTR]: rowKey,
    [GRID_FIELD_ATTR]: column,
    ...(focusStop ? { [GRID_FOCUS_STOP_ATTR]: "true" } : {}),
    ...(lookup ? { [GRID_LOOKUP_ATTR]: "true" } : {}),
  };
}

// ---------------------------------------------------------------------------
// Number cell
// ---------------------------------------------------------------------------

type NumberCellProps = {
  rowKey: string;
  column: ColumnKey;
  display: string;
  seed: string;
  kind: CellEditorKind;
  why: string;
  focusStop: boolean;
  align: Align;
  tone?: string;
  delta: number | null;
  onFocus: (rowKey: string, column: ColumnKey) => void;
  onCommit: (rowKey: string, column: ColumnKey, text: string) => void;
  onRefused: (why: string) => void;
};

function NumberCell(props: NumberCellProps) {
  const { rowKey, column, display, seed, kind, why, focusStop, align, tone, delta, onFocus, onCommit, onRefused } =
    props;
  const editable = why === "";
  const [buffer, setBuffer] = useState<string | null>(null);
  const typedRef = useRef(false);
  const selectAfterRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // The row changed under a focused editor nobody has typed into (the violet
  // card, a refill): show the new figure, not the stale one.
  useEffect(() => {
    if (buffer !== null && !typedRef.current && buffer !== seed) {
      setBuffer(seed);
      selectAfterRef.current = true;
    }
  }, [buffer, seed]);

  // Seeding swaps "1,000.00" for "1000.00", which collapses the selection the
  // focus made; select again once the seeded text is painted.
  useLayoutEffect(() => {
    if (!selectAfterRef.current) {
      return;
    }
    selectAfterRef.current = false;
    const input = inputRef.current;
    if (input && document.activeElement === input) {
      input.select();
    }
  });

  const commit = () => {
    if (typedRef.current && buffer !== null) {
      typedRef.current = false;
      onCommit(rowKey, column, buffer);
    }
    typedRef.current = false;
  };

  return (
    <div className={styles.numCell}>
      {delta !== null && buffer === null ? (
        <span className={cx(styles.delta, delta > 0 ? styles.deltaUp : styles.deltaDown)}>
          {deltaText(delta)}
        </span>
      ) : null}
      <input
        ref={inputRef}
        className={cx(styles.cellInput, alignClass(align), tone)}
        value={buffer ?? display}
        readOnly={!editable}
        inputMode="decimal"
        autoComplete="off"
        title={editable ? undefined : why}
        {...cellAttrs(rowKey, column, focusStop)}
        onFocus={(event) => {
          onFocus(rowKey, column);
          if (editable) {
            typedRef.current = false;
            setBuffer(seed);
            selectAfterRef.current = true;
          } else {
            event.currentTarget.select();
          }
        }}
        onBlur={() => {
          commit();
          setBuffer(null);
        }}
        onChange={(event) => {
          if (!editable) {
            return;
          }
          const text = event.target.value;
          if (acceptsTyping(kind, text)) {
            typedRef.current = true;
            setBuffer(text);
          }
        }}
        onKeyDown={(event) => {
          if (!editable) {
            if (startsEditing(event) && event.key !== "+" && event.key !== "-") {
              event.preventDefault();
              onRefused(why);
            }
            return;
          }
          if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey) {
            // Commit, then let the grid walk the Enter chain.
            commit();
            return;
          }
          if (event.key === "Escape" && typedRef.current) {
            event.preventDefault();
            event.stopPropagation();
            typedRef.current = false;
            setBuffer(seed);
            selectAfterRef.current = true;
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item cell — the picker
// ---------------------------------------------------------------------------

type ItemCellProps = {
  rowKey: string;
  code: string;
  name: string;
  spare: boolean;
  focusStop: boolean;
  onFocus: (rowKey: string, column: ColumnKey) => void;
  onOpenPicker: (initialQuery: string) => void;
};

function ItemCell({ rowKey, code, name, spare, focusStop, onFocus, onOpenPicker }: ItemCellProps) {
  const hasItem = Boolean(name || code);
  return (
    <div className={styles.itemCell}>
      <div className={styles.itemOverlay}>
        {hasItem ? (
          <>
            {code ? <span className={styles.itemCode}>{code}</span> : null}
            <span className={styles.itemName}>{name}</span>
          </>
        ) : spare ? (
          <span className={styles.sparePlaceholder}>+ adds a row · type an item · F12 lists its buckets</span>
        ) : null}
      </div>
      <input
        className={cx(styles.cellInput, styles.itemInput)}
        value={hasItem ? `${code}  ${name}`.trim() : ""}
        readOnly
        autoComplete="off"
        aria-label={hasItem ? `${code} ${name}` : "Item — type to search"}
        title={hasItem ? `${code}  ${name}`.trim() : undefined}
        {...cellAttrs(rowKey, "itemName", focusStop, true)}
        onFocus={() => onFocus(rowKey, "itemName")}
        onDoubleClick={() => onOpenPicker("")}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey) {
            // An Item cell with no item opens the picker; one with an item
            // walks on, like any other cell.
            if (!hasItem) {
              event.preventDefault();
              event.stopPropagation();
              onOpenPicker("");
            }
            return;
          }
          if (event.key === "+" || event.key === "-") {
            return;
          }
          if (startsEditing(event) && event.key.length === 1 && event.key.trim()) {
            event.preventDefault();
            onOpenPicker(event.key);
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barcode cell — the spare line's scan field
// ---------------------------------------------------------------------------

type BarcodeCellProps = {
  value: string;
  focusStop: boolean;
  onChange: (value: string) => void;
  onFocus: (rowKey: string | null, column: ColumnKey) => void;
  onCommit: (text: string) => void;
};

export function BarcodeCell({ value, focusStop, onChange, onFocus, onCommit }: BarcodeCellProps) {
  const committedRef = useRef(false);
  return (
    <input
      className={cx(styles.cellInput, styles.alignLeft)}
      value={value}
      autoComplete="off"
      // Text, not a number: leading zeros are part of the symbol.
      inputMode="text"
      placeholder="scan…"
      {...cellAttrs("csp-spare", "barcodeText", focusStop)}
      onFocus={() => {
        committedRef.current = false;
        onFocus(null, "barcodeText");
      }}
      onChange={(event) => {
        committedRef.current = false;
        onChange(event.target.value);
      }}
      onBlur={(event) => {
        if (!committedRef.current && event.currentTarget.value.trim()) {
          committedRef.current = true;
          onCommit(event.currentTarget.value);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          if (event.currentTarget.value.trim()) {
            committedRef.current = true;
            onCommit(event.currentTarget.value);
          }
        }
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// A whole row
// ---------------------------------------------------------------------------

/** The drawn width of each column and the page unit, for the delta chip's fit. */
export type CellFit = { unitPx: number; widths: Readonly<Record<string, number>> };

export type PriceRowProps = {
  row: PriceGridRow;
  index: number;
  columns: readonly SellingPriceColumn[];
  fit: CellFit;
  current: boolean;
  problem: boolean;
  saving: boolean;
  belowCostPolicy: BelowCostPolicy;
  branchText: string;
  onFocus: (rowKey: string | null, column: ColumnKey) => void;
  onCommit: (rowKey: string, column: ColumnKey, text: string) => void;
  onRefused: (why: string) => void;
  onOpenPicker: (initialQuery: string) => void;
};

function PriceRowView(props: PriceRowProps) {
  const {
    row,
    index,
    columns,
    fit,
    current,
    problem,
    saving,
    belowCostPolicy,
    branchText,
    onFocus,
    onCommit,
    onRefused,
    onOpenPicker,
  } = props;
  const changed = isChanged(row);

  const renderCell = (column: SellingPriceColumn) => {
    const key = column.key as ColumnKey;
    const align = column.align as Align;
    const kind = editorKindOf(key);
    if (kind) {
      const why = whyNotEditable(row, key, saving);
      const verdict = verdictOf(row, key, belowCostPolicy);
      const text = cellText(row, key);
      let tone: string | undefined;
      if (key === "minPrice") {
        tone = verdict === "red" ? styles.minRed : undefined;
      } else if (verdict === "red") {
        tone = styles.verdictRed;
      } else if (verdict === "amber") {
        tone = styles.verdictAmber;
      } else if (text === DASH) {
        tone = styles.muted;
      }
      const delta = deltaOf(row, key);
      return (
        <NumberCell
          rowKey={row.key}
          column={key}
          display={text}
          seed={editorText(row, key)}
          kind={kind}
          why={why}
          focusStop={column.focus}
          align={align}
          tone={tone}
          delta={
            delta !== null &&
            deltaFits(deltaText(delta), text, fit.widths[key] ?? column.widthPx, fit.unitPx)
              ? delta
              : null
          }
          onFocus={onFocus}
          onCommit={onCommit}
          onRefused={onRefused}
        />
      );
    }
    switch (key) {
      case "lineNo":
        return <span className={cx(styles.cellText, styles.alignCenter)}>{index + 1}</span>;
      case "itemName":
        return (
          <ItemCell
            rowKey={row.key}
            code={row.itemCode}
            name={row.itemName}
            spare={false}
            focusStop={column.focus}
            onFocus={onFocus}
            onOpenPicker={onOpenPicker}
          />
        );
      case "srcChip": {
        const src = srcOfRow(row);
        const colours = chipColours(src);
        return (
          <span className={styles.chipCell}>
            <span className={styles.chip} style={{ color: colours.fg, background: colours.bg }}>
              {src}
            </span>
          </span>
        );
      }
      case "branchName":
        return (
          <span
            className={cx(
              styles.cellText,
              styles.alignLeft,
              branchText === "All branches" && styles.chainText,
            )}
            title={branchText}
          >
            {branchText}
          </span>
        );
      case "barcodeText": {
        const why = whyNotEditable(row, key, saving);
        return (
          <input
            className={cx(styles.cellInput, styles.alignLeft)}
            value={row.barcode}
            readOnly
            title={why}
            {...cellAttrs(row.key, key, column.focus)}
            onFocus={() => onFocus(row.key, key)}
            onKeyDown={(event) => {
              if (startsEditing(event) && event.key !== "+" && event.key !== "-") {
                event.preventDefault();
                onRefused(why);
              }
            }}
          />
        );
      }
      default: {
        const text = cellText(row, key);
        return (
          <span className={cx(styles.cellText, alignClass(align))} title={text}>
            {text}
          </span>
        );
      }
    }
  };

  return (
    <tr
      // The grid reads its row height off a drawn row (the window maths).
      data-row-index={index}
      className={cx(
        styles.row,
        changed && styles.rowChanged,
        current && styles.rowCurrent,
        problem && styles.rowProblem,
      )}
    >
      {columns.map((column) => (
        <td
          key={column.key}
          onMouseDown={() => {
            // A click on a read-out still makes this the current row.
            if (!editorKindOf(column.key as ColumnKey) && column.key !== "itemName") {
              onFocus(row.key, column.key as ColumnKey);
            }
          }}
        >
          {renderCell(column)}
        </td>
      ))}
    </tr>
  );
}

export const PriceRow = memo(PriceRowView);

// ---------------------------------------------------------------------------
// The spare line
// ---------------------------------------------------------------------------

export type SpareRowProps = {
  columns: readonly SellingPriceColumn[];
  barcode: string;
  current: boolean;
  onBarcodeChange: (value: string) => void;
  onBarcodeCommit: (text: string) => void;
  onFocus: (rowKey: string | null, column: ColumnKey) => void;
  onOpenPicker: (initialQuery: string) => void;
  onRefused: (why: string) => void;
};

/**
 * The blank line the Qt grid always keeps last: scan a barcode into it, or
 * type in its Item cell to search. Every other cell is shut until it names an
 * item — and says so.
 */
export function SpareRow(props: SpareRowProps) {
  const { columns, barcode, current, onBarcodeChange, onBarcodeCommit, onFocus, onOpenPicker, onRefused } = props;
  return (
    <tr className={cx(styles.row, current && styles.rowCurrent)}>
      {columns.map((column) => {
        const key = column.key as ColumnKey;
        let content = null;
        if (key === "barcodeText") {
          content = (
            <BarcodeCell
              value={barcode}
              focusStop={column.focus}
              onChange={onBarcodeChange}
              onFocus={onFocus}
              onCommit={onBarcodeCommit}
            />
          );
        } else if (key === "itemName") {
          content = (
            <ItemCell
              rowKey="csp-spare"
              code=""
              name=""
              spare
              focusStop={column.focus}
              onFocus={(_rowKey, field) => onFocus(null, field)}
              onOpenPicker={onOpenPicker}
            />
          );
        }
        return (
          <td
            key={column.key}
            onMouseDown={() => {
              if (key !== "barcodeText" && key !== "itemName") {
                onFocus(null, key);
                if (editorKindOf(key) || isMkupKey(key)) {
                  onRefused(whyNotEditable(null, key, false));
                }
              }
            }}
          >
            {content}
          </td>
        );
      })}
    </tr>
  );
}
