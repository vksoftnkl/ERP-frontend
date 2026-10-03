"use client";

/**
 * The line grid — ui table 27, "OPENING STOCK - LINES".
 *
 * Its own grid, not the sales item grid with flags: the two share no column
 * meanings, and this one's central rule has no sales equivalent — WHICH CELLS
 * ARE EDITABLE IS DECIDED BY THE ITEM (`isCellEditable`). A greyed batch cell is
 * the item saying it is not tracked batch-wise, and is painted grey before it is
 * clicked.
 *
 * The cells are the quotation's `GridCell`s, so the Enter walk (`grid-focus`)
 * and the edit buffer behave exactly as on every other voucher grid; the layout's
 * focus flags decide where Enter stops.
 *
 * Keys, as the Qt grid binds them: Enter commits and steps on; `+` / `-` add a
 * line above / remove the current one (on a figure or picker cell — a text cell
 * keeps them as characters, so Ctrl+`+` / Ctrl+`-` work anywhere); F4 is the
 * unit; typing on the Item or Supplier cell opens its picker with the key.
 */
import { useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { GridCell } from "@/features/sales/quotation/components/grid-cell";
import { focusCell, moveCellFocus } from "@/features/sales/quotation/components/grid-focus";
import type { GridCellKind } from "@/features/sales/quotation/quotation.constants";
import {
  GRID_FIELD_ATTR,
  GRID_GRID_ATTR,
  GRID_ROW_ATTR,
} from "@/features/sales/quotation/quotation.constants";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { scaledWidth } from "@/features/sales/quotation/quotation.utils";
import {
  isCellEditable,
  isCellGreyed,
  type OpeningStockColumnKind,
  type ResolvedOpeningStockColumn,
} from "../opening-stock.columns";
import { GRID_DATE_PLACEHOLDER, OPENING_STOCK_GRID_NAME, STOCK_BUCKETS } from "../opening-stock.constants";
import {
  hasItem,
  lineNumbersOf,
  qtyDecimals,
  ratePrecision,
  trackedBy,
} from "../opening-stock.lines";
import type { OpeningStockLine, OpeningStockLineField } from "../opening-stock.types";
import styles from "../page.module.scss";

const ROW_ACTION_PX = 30;

const BUCKET_OPTIONS = STOCK_BUCKETS.map((bucket) => ({ value: bucket, label: bucket }));

/** The cells where a bare `+` / `-` is a line key rather than a character. */
const LINE_KEY_KINDS = new Set<OpeningStockColumnKind>([
  "qty",
  "rate",
  "money",
  "perc",
  "int",
  "bucket",
  "itemLookup",
  "supplierLookup",
  "label",
]);

function cellKindOf(kind: OpeningStockColumnKind): GridCellKind {
  switch (kind) {
    case "qty":
      return "qty";
    case "rate":
      return "rate";
    case "money":
      return "currency";
    case "perc":
      return "perc";
    case "int":
      return "int";
    case "bucket":
      // A select over fixed options — the grid cell's option-list kind.
      return "unit";
    case "itemLookup":
      return "itemLookup";
    case "supplierLookup":
      // The second picker cell; same behaviour as the item one.
      return "chargeLookup";
    case "label":
      return "label";
    default:
      return "text";
  }
}

/** Shown text for a read-only reference figure: blank on a row with no item. */
function labelText(value: unknown, line: OpeningStockLine): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number") {
    return hasItem(line) && value !== 0 ? String(Math.round(value * 1e6) / 1e6) : "";
  }
  return String(value);
}

/** Lands on the first cell of a row the operator can key — `focusFirstEditableCell()`. */
export function focusFirstCellOfRow(rowKey: string): void {
  window.requestAnimationFrame(() => {
    const selector = `[${GRID_GRID_ATTR}="${OPENING_STOCK_GRID_NAME}"][${GRID_ROW_ATTR}="${rowKey}"][${GRID_FIELD_ATTR}]`;
    const target = Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(selector),
    ).find((cell) => !cell.disabled);
    target?.focus();
    if (target && "select" in target) {
      target.select();
    }
  });
}

/** Lands on a named cell once React has rendered the row it is on. */
export function focusCellAfterRender(rowKey: string, field: string): void {
  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      focusCell(OPENING_STOCK_GRID_NAME, rowKey, field);
    }, 0);
  });
}

export type OpeningStockGridProps = {
  columns: ResolvedOpeningStockColumn[];
  lines: OpeningStockLine[];
  /** The screen's gate: a frozen document opens no editor, whatever the item tracks. */
  editable: boolean;
  activeRowKey: string | null;
  /** The cell the last refusal pointed at. */
  flagged: { rowKey: string; field: string } | null;
  onActiveRowChange: (rowKey: string) => void;
  onSetField: (rowKey: string, field: OpeningStockLineField, raw: string) => void;
  onOpenItemPicker: (rowKey: string, typed: string) => void;
  onOpenSupplierPicker: (rowKey: string, typed: string) => void;
  onInsertLine: (rowKey: string) => void;
  onRemoveLine: (rowKey: string) => void;
  onSwitchUnit: () => void;
  /** Ctrl+Enter from inside a cell — save the draft. */
  onCtrlEnter: () => void;
  /** Right-click: "save column width" and "Admin settings". */
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
  /** A heading dragged to a new width — saved from the right-click menu. */
  resizingKey?: string | null;
  onColumnResizeStart?: (event: ReactMouseEvent<HTMLElement>, columnKey: string) => void;
};

export function OpeningStockGrid(props: OpeningStockGridProps) {
  const {
    columns,
    lines,
    editable,
    activeRowKey,
    flagged,
    onActiveRowChange,
    onSetField,
    onOpenItemPicker,
    onOpenSupplierPicker,
    onInsertLine,
    onRemoveLine,
    onSwitchUnit,
    onCtrlEnter,
    onContextMenu,
    resizingKey = null,
    onColumnResizeStart,
  } = props;

  const visible = useMemo(() => columns.filter((column) => column.visible), [columns]);
  const kindByKey = useMemo(
    () => new Map(visible.map((column) => [column.key, column.kind])),
    [visible],
  );
  const lineNumbers = useMemo(() => lineNumbersOf(lines), [lines]);
  const tableWidth = useMemo(
    () => visible.reduce((total, column) => total + column.widthPx, ROW_ACTION_PX),
    [visible],
  );
  /**
   * The key that is about to reach a picker cell. Enter on a picker that
   * already names something steps on (the Qt grid's rule — its key column is
   * filled); F2, a click or Enter on an empty one opens the picker.
   */
  const lastKeyRef = useRef<string | null>(null);

  const openPicker = (kind: OpeningStockColumnKind, line: OpeningStockLine, typed: string) => {
    const viaEnter = lastKeyRef.current === "Enter";
    lastKeyRef.current = null;
    const filled = kind === "itemLookup" ? hasItem(line) : line.supplierName.trim() !== "";
    if (viaEnter && filled) {
      moveCellFocus(OPENING_STOCK_GRID_NAME, document.activeElement, 1);
      return;
    }
    if (kind === "itemLookup") {
      onOpenItemPicker(line.key, typed);
    } else {
      onOpenSupplierPicker(line.key, typed);
    }
  };

  const onGridKeyDown = (event: ReactKeyboardEvent<HTMLTableSectionElement>) => {
    if (!editable) {
      return;
    }
    const target = event.target as HTMLElement;
    const rowKey = target.getAttribute(GRID_ROW_ATTR);
    const field = target.getAttribute(GRID_FIELD_ATTR) ?? "";
    if (!rowKey) {
      return;
    }
    const kind = kindByKey.get(field);
    const line = lines.find((candidate) => candidate.key === rowKey);

    if (event.key === "F4") {
      event.preventDefault();
      onSwitchUnit();
      return;
    }

    const plus = event.key === "+" || (event.ctrlKey && event.key === "=");
    const minus = event.key === "-";
    if ((plus || minus) && !event.altKey && !event.metaKey) {
      const bare = !event.ctrlKey;
      if (!bare || (kind !== undefined && LINE_KEY_KINDS.has(kind))) {
        event.preventDefault();
        if (plus) {
          onInsertLine(rowKey);
        } else {
          onRemoveLine(rowKey);
        }
        return;
      }
    }

    // Typing on a picker cell opens its picker with that key, as the Qt grid's
    // popup takes the first keystroke.
    if (
      line &&
      (kind === "itemLookup" || kind === "supplierLookup") &&
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      event.key.trim() !== ""
    ) {
      const column = visible.find((candidate) => candidate.key === field);
      if (column && isCellEditable(column, line, editable)) {
        event.preventDefault();
        lastKeyRef.current = null;
        if (kind === "itemLookup") {
          onOpenItemPicker(rowKey, event.key);
        } else {
          onOpenSupplierPicker(rowKey, event.key);
        }
      }
      return;
    }

    if (event.key === "Enter") {
      // The cell has already committed its buffer; move on.
      event.preventDefault();
      moveCellFocus(OPENING_STOCK_GRID_NAME, event.target, event.shiftKey ? -1 : 1);
    }
  };

  return (
    <div className={quotationStyles.gridViewport} data-erp-table-viewport="true" onContextMenu={onContextMenu}>
      <table className={quotationStyles.grid} style={{ width: scaledWidth(tableWidth) }}>
        <colgroup>
          {visible.map((column) => (
            <col key={column.key} style={{ width: scaledWidth(column.widthPx) }} />
          ))}
          <col style={{ width: scaledWidth(ROW_ACTION_PX) }} />
        </colgroup>
        <thead>
          <tr>
            {visible.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cx(
                  quotationStyles.gridHeaderCell,
                  resizingKey === column.key && quotationStyles.gridHeaderCellResizing,
                )}
              >
                {column.header}
                {onColumnResizeStart ? (
                  <span
                    className={quotationStyles.columnResizeHandle}
                    role="presentation"
                    title="Drag to resize the column"
                    onMouseDown={(event) => onColumnResizeStart(event, column.key)}
                  />
                ) : null}
              </th>
            ))}
            <th scope="col" aria-label="Row actions" className={quotationStyles.gridHeaderActionCell} />
          </tr>
        </thead>
        <tbody
          onKeyDownCapture={(event) => {
            // Ctrl+Enter saves the draft from inside a cell (a window shortcut
            // in Qt). Taken here, before the cell's own Enter commits-and-walks
            // or a picker cell opens its picker; the save blurs the cell, which
            // commits what is being typed.
            if (event.ctrlKey && event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              lastKeyRef.current = null;
              onCtrlEnter();
              return;
            }
            lastKeyRef.current = event.key;
          }}
          onMouseDownCapture={() => {
            lastKeyRef.current = null;
          }}
          onKeyDown={onGridKeyDown}
        >
          {lines.map((line, rowIndex) => {
            const isActive = line.key === activeRowKey;
            const isTrailing = rowIndex === lines.length - 1 && !hasItem(line);
            return (
              <tr
                key={line.key}
                className={cx(
                  rowIndex % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven,
                  isActive && quotationStyles.rowActive,
                  line.problem && styles.problemRow,
                )}
                title={line.problem || undefined}
                onFocusCapture={() => onActiveRowChange(line.key)}
                onMouseDown={() => onActiveRowChange(line.key)}
              >
                {visible.map((column, columnIndex) => {
                  const cellEditable = isCellEditable(column, line, editable);
                  const greyed = isCellGreyed(column, line);
                  const raw =
                    column.read === "trackedBy"
                      ? hasItem(line)
                        ? trackedBy(line.trackSignature)
                        : ""
                      : column.read === "computedLineNo"
                        ? (lineNumbers.get(line.key) ?? "")
                        : line[column.read];
                  const invalid =
                    (flagged?.rowKey === line.key && flagged.field === column.key) ||
                    (Boolean(line.problem) && column.kind === "itemLookup");

                  // Figures on a row with no item stay blank, never "0.00".
                  let value: unknown = raw;
                  let precision: number | undefined = column.decimals;
                  if (column.kind === "label") {
                    value = labelText(raw, line);
                  } else if (!hasItem(line) && typeof raw === "number") {
                    value = null;
                  } else if (column.kind === "qty") {
                    precision = qtyDecimals(line);
                  } else if (column.kind === "rate") {
                    precision = ratePrecision(typeof raw === "number" ? raw : 0);
                  } else if (column.kind === "perc") {
                    precision = 2;
                  }

                  return (
                    <td
                      key={column.key}
                      className={cx(greyed && styles.untrackedCell)}
                      title={
                        greyed
                          ? `Not tracked — this item's tracking policy is ${trackedBy(line.trackSignature)}`
                          : undefined
                      }
                    >
                      <GridCell
                        kind={cellKindOf(column.kind)}
                        value={column.kind === "bucket" ? String(raw ?? "") : value}
                        align={column.align}
                        precision={precision}
                        editable={cellEditable}
                        invalid={invalid}
                        options={column.kind === "bucket" ? BUCKET_OPTIONS : undefined}
                        placeholder={
                          column.kind === "date" && cellEditable
                            ? GRID_DATE_PLACEHOLDER
                            : column.kind === "itemLookup"
                              ? isTrailing && editable
                                ? "Press Enter to pick…"
                                : ""
                              : undefined
                        }
                        gridName={OPENING_STOCK_GRID_NAME}
                        rowKey={line.key}
                        fieldKey={column.key}
                        columnIndex={columnIndex}
                        focusStop={column.focus}
                        onOpenPicker={() => openPicker(column.kind, line, "")}
                        onCommit={(text) => {
                          if (column.write) {
                            onSetField(line.key, column.write, text);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (column.key !== "barcode") {
                            return;
                          }
                          const input = event.target as HTMLInputElement;
                          if (event.key === "Enter") {
                            // The cell has committed the scan, and the commit
                            // resolves it; the walk does not move on from here —
                            // a resolved scan lands on the row's Qty itself.
                            event.preventDefault();
                            event.stopPropagation();
                            if (!input.value.trim()) {
                              moveCellFocus(OPENING_STOCK_GRID_NAME, input, 1);
                            }
                            return;
                          }
                          if (event.key === "ArrowDown") {
                            // Bail out of the scanner into the item picker.
                            event.preventDefault();
                            event.stopPropagation();
                            onOpenItemPicker(line.key, "");
                          }
                        }}
                      />
                    </td>
                  );
                })}
                <td className={quotationStyles.actionCell}>
                  <button
                    type="button"
                    className={quotationStyles.rowButton}
                    disabled={!editable || isTrailing}
                    title="Remove this line (-)"
                    aria-label={`Remove ${line.itemName || "line"}`}
                    onClick={() => onRemoveLine(line.key)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
          {lines.length === 0 ? (
            <tr>
              <td className={quotationStyles.emptyGrid} colSpan={visible.length + 1}>
                No lines on this opening.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
