"use client";

/**
 * The count grid — NexTable + PhysicalStockDelegate. Its job is mostly to
 * REFUSE: a count cannot change what it is counting, so the only cells that
 * take typing are Counted Qty and Remarks (on a holding) and Barcode (on the
 * blank row, because scanning is how a row gets its holding). Item and Reason
 * are picker cells: Enter on an empty one, or any printable key, opens the
 * popup with that key as the search.
 *
 * Enter walks the layout's focus chain (ui table 28 flags Counted Qty alone,
 * so it runs straight down the column); ↑↓ change row; ←→ and Backspace move
 * between read-only cells. Ctrl+Enter is left to bubble — it saves.
 */
import {
  useEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { cx } from "@/components/design-system/cx";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import {
  canOpenPicker,
  cellText,
  focusStops,
  isCellEditable,
  nextStop,
  previousStop,
  varianceTone,
  type CountColumn,
} from "../physical-stock.columns";
import { PhysicalStockCols as Cols } from "../physical-stock.constants";
import { sanitizeCountedInput } from "../physical-stock.format";
import type { CountLine } from "../physical-stock.types";
import type { FocusRequest } from "../use-physical-stock-draft";
import styles from "../page.module.scss";

export type PickerKind = "item" | "reason";

export type CountGridProps = {
  columns: CountColumn[];
  lines: CountLine[];
  editable: boolean;
  blind: boolean;
  focusRequest: FocusRequest | null;
  onCountedChange: (rowKey: string, text: string) => void;
  onRemarksChange: (rowKey: string, text: string) => void;
  onBarcodeChange: (rowKey: string, text: string) => void;
  onBarcodeCommit: (rowKey: string, text: string) => void;
  onOpenPicker: (kind: PickerKind, rowKey: string, initialQuery: string) => void;
};

/** Each cell's address, `row:column-number` — how focus finds its way back. */
export const CELL_ATTR = "data-physical-stock-cell";

/** Puts the cursor back on a cell after a popup that did not move it closes. */
export function focusGridCell(row: number, col: number): void {
  if (typeof window === "undefined" || row < 0) {
    return;
  }
  window.requestAnimationFrame(() =>
    document.querySelector<HTMLElement>(`[${CELL_ATTR}="${row}:${col}"]`)?.focus(),
  );
}

function alignClass(align: CountColumn["align"]): string | undefined {
  if (align === "right") {
    return quotationStyles.alignRight;
  }
  return align === "center" ? quotationStyles.alignCenter : undefined;
}

function widthOf(column: CountColumn): string | undefined {
  if (column.widthPx !== null) {
    return `${column.widthPx}px`;
  }
  return column.widthPct !== null ? `${column.widthPct}%` : undefined;
}

function isPrintable(event: ReactKeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

export function CountGrid(props: CountGridProps) {
  const {
    columns,
    lines,
    editable,
    blind,
    focusRequest,
    onCountedChange,
    onRemarksChange,
    onBarcodeChange,
    onBarcodeCommit,
    onOpenPicker,
  } = props;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<{ row: number; col: number } | null>(null);
  // The last barcode committed per row, so Enter and the blur that follows it
  // do not resolve the same scan twice.
  const committedRef = useRef(new Map<string, string>());

  const focusCell = (row: number, col: number): boolean => {
    const element = viewportRef.current?.querySelector<HTMLElement>(
      `[${CELL_ATTR}="${row}:${col}"]`,
    );
    if (!element) {
      return false;
    }
    element.focus();
    if (element instanceof HTMLInputElement) {
      element.select();
    }
    return true;
  };

  // Somewhere for the cursor to go after a sheet is drawn, a pick lands, or a
  // reason is chosen — the row asked for, at the column asked for, or the
  // row's first stop when that column is not on screen.
  useEffect(() => {
    if (!focusRequest) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      if (!focusCell(focusRequest.row, focusRequest.col)) {
        const stops = focusStops(columns);
        if (stops.length > 0) {
          focusCell(focusRequest.row, stops[0]);
        }
      }
    });
    return () => window.cancelAnimationFrame(frame);
    // Only a new request moves the cursor; a re-render must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  const moveNext = (row: number, col: number) => {
    const target = nextStop(columns, { row, col }, lines.length);
    if (target) {
      focusCell(target.row, target.col);
    }
  };

  const moveColumn = (row: number, col: number, delta: 1 | -1) => {
    const order = columns.map((column) => column.no);
    const index = order.indexOf(col) + delta;
    if (index >= 0 && index < order.length) {
      focusCell(row, order[index]);
    }
  };

  const onCellKeyDown = (
    event: ReactKeyboardEvent<HTMLElement>,
    rowIndex: number,
    column: CountColumn,
    line: CountLine,
    isInput: boolean,
  ) => {
    const picker = column.kind === "item" || column.kind === "reason";
    const pickerOpens = picker && canOpenPicker(column.kind, line, editable);
    switch (event.key) {
      case "Enter": {
        if (event.ctrlKey || event.metaKey || event.altKey) {
          return; // Ctrl+Enter saves — the screen's, not the grid's
        }
        event.preventDefault();
        // A picker cell whose key is still empty opens its popup on Enter.
        if (pickerOpens && (column.kind === "item" || !line.reasonId)) {
          onOpenPicker(column.kind as PickerKind, line.key, "");
          return;
        }
        if (column.kind === "barcode" && isInput) {
          const value = (event.currentTarget as HTMLInputElement).value;
          committedRef.current.set(line.key, value.trim());
          onBarcodeCommit(line.key, value);
          return;
        }
        moveNext(rowIndex, column.no);
        return;
      }
      case "ArrowDown":
        event.preventDefault();
        if (rowIndex < lines.length - 1) {
          focusCell(rowIndex + 1, column.no);
        }
        return;
      case "ArrowUp":
        event.preventDefault();
        if (rowIndex > 0) {
          focusCell(rowIndex - 1, column.no);
        }
        return;
      case "ArrowLeft":
      case "ArrowRight":
        if (!isInput) {
          event.preventDefault();
          moveColumn(rowIndex, column.no, event.key === "ArrowRight" ? 1 : -1);
        }
        return;
      case "Backspace":
        if (!isInput) {
          event.preventDefault();
          const target = previousStop(columns, { row: rowIndex, col: column.no });
          if (target) {
            focusCell(target.row, target.col);
          }
        }
        return;
      default:
        // A printable key on a picker cell opens the popup with it as the search.
        if (pickerOpens && isPrintable(event)) {
          event.preventDefault();
          onOpenPicker(column.kind as PickerKind, line.key, event.key);
        }
    }
  };

  const renderCell = (line: CountLine, rowIndex: number, column: CountColumn) => {
    const address = `${rowIndex}:${column.no}`;
    const text = cellText(line, column.no);
    const onFocus = () => setActive({ row: rowIndex, col: column.no });
    if (isCellEditable(column.kind, line, editable)) {
      const common = {
        [CELL_ATTR]: address,
        className: cx(quotationStyles.cellInput, alignClass(column.align)),
        autoComplete: "off",
        onFocus: (event: ReactFocusEvent<HTMLInputElement>) => {
          onFocus();
          event.currentTarget.select();
        },
        onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) =>
          onCellKeyDown(event, rowIndex, column, line, true),
      };
      if (column.kind === "counted") {
        return (
          <input
            {...common}
            value={line.countedText}
            inputMode="decimal"
            aria-label={`Counted quantity, line ${rowIndex + 1}`}
            onChange={(event) => {
              const accepted = sanitizeCountedInput(event.target.value);
              if (accepted !== null) {
                onCountedChange(line.key, accepted);
              }
            }}
          />
        );
      }
      if (column.kind === "remarks") {
        return (
          <input
            {...common}
            value={line.remarks}
            maxLength={250}
            aria-label={`Remarks, line ${rowIndex + 1}`}
            onChange={(event) => onRemarksChange(line.key, event.target.value)}
          />
        );
      }
      return (
        <input
          {...common}
          value={line.barcode}
          maxLength={100}
          aria-label="Scan a barcode"
          onChange={(event) => onBarcodeChange(line.key, event.target.value)}
          onBlur={(event) => {
            const value = event.target.value.trim();
            if (value && committedRef.current.get(line.key) !== value) {
              committedRef.current.set(line.key, value);
              onBarcodeCommit(line.key, value);
            }
          }}
        />
      );
    }
    const pickerOpens =
      (column.kind === "item" || column.kind === "reason") &&
      canOpenPicker(column.kind, line, editable);
    return (
      <div
        {...{ [CELL_ATTR]: address }}
        tabIndex={-1}
        className={cx(
          styles.countCell,
          alignClass(column.align),
          pickerOpens && styles.pickerCell,
        )}
        title={text || undefined}
        onFocus={onFocus}
        onKeyDown={(event) => onCellKeyDown(event, rowIndex, column, line, false)}
        onDoubleClick={() => {
          if (pickerOpens) {
            onOpenPicker(column.kind as PickerKind, line.key, "");
          }
        }}
      >
        {text}
      </div>
    );
  };

  return (
    <div className={quotationStyles.gridViewport} ref={viewportRef}>
      <table className={cx(quotationStyles.grid, styles.countTable)}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.no} style={{ width: widthOf(column) }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.no} scope="col" title={column.label}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, rowIndex) => {
            const tone = varianceTone(line, blind);
            const isActiveRow = active?.row === rowIndex;
            return (
              <tr
                key={line.key}
                className={cx(
                  tone === "short" && styles.rowShort,
                  tone === "over" && styles.rowOver,
                  !tone && (rowIndex % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven),
                  !tone && isActiveRow && quotationStyles.rowActive,
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.no}
                    className={cx(
                      isActiveRow && active?.col === column.no && styles.cellActive,
                      column.no === Cols.CountedQty && quotationStyles.alignCenter,
                    )}
                  >
                    {renderCell(line, rowIndex, column)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
