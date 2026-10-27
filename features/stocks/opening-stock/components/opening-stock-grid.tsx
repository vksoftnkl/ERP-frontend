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
 * and the edit buffer behave exactly as on every other voucher grid. Where
 * Enter STOPS is this screen's rule, per row (`isEnterStop`, Qt
 * `setFocusCellFilter`): a blank row stops at Barcode then Item; a row with an
 * item at Qty, the identity cells its item is tracked by, Cost / Unit — and on
 * to the next row's Barcode.
 *
 * Keys, as the Qt grid binds them: Enter commits and steps on; `+` / `-` add a
 * line above / remove the current one (on a figure or picker cell — a text cell
 * keeps them as characters, so Ctrl+`+` / Ctrl+`-` work anywhere); F4 switches
 * the line's unit; ↓ in Barcode opens the item list with what was typed; typing
 * on the Item or Supplier cell opens its picker with the key; Tab leaves the
 * grid. The document keys (Ctrl+Enter, Ctrl+S …) are the screen's shared set —
 * this grid only lets them through.
 *
 * Textile (Qt 74b755c / 091bf5b): Size and Colour are `ChoicePickerCell`
 * pick-lists with "+ Add new …"; Model is a `BatchDetailCell` over a
 * `<datalist>` of the item's earlier models. They open (and are Enter stops) only while the company numbers its
 * own batches, on an item tracked by batch whose batch number was not typed.
 */
import { useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { GridCell } from "@/features/sales/quotation/components/grid-cell";
import { focusCell, focusNextStopFrom, moveCellFocus } from "@/features/sales/quotation/components/grid-focus";
import type { GridCellKind } from "@/features/sales/quotation/quotation.constants";
import {
  GRID_FIELD_ATTR,
  GRID_GRID_ATTR,
  GRID_LOOKUP_ATTR,
  GRID_ROW_ATTR,
} from "@/features/sales/quotation/quotation.constants";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { scaledWidth } from "@/features/sales/quotation/quotation.utils";
import {
  isCellEditable,
  isCellGreyed,
  isEnterStop,
  type OpeningStockColumnKind,
  type ResolvedOpeningStockColumn,
} from "../opening-stock.columns";
import {
  GRID_DATE_PLACEHOLDER,
  LINE_MODEL_MAX_LENGTH,
  OPENING_STOCK_GRID_NAME,
  STOCK_BUCKETS,
} from "../opening-stock.constants";
import {
  distinctChoices,
  hasItem,
  lineNumbersOf,
  qtyDecimals,
  ratePrecision,
  takesBatchDetail,
  trackedBy,
} from "../opening-stock.lines";
import type { BatchDetailChoices, OpeningStockLine, OpeningStockLineField } from "../opening-stock.types";
import { BatchDetailCell } from "./batch-detail-cell";
import { ChoicePickerCell } from "./choice-picker-cell";
import styles from "../page.module.scss";

const ROW_ACTION_PX = 30;

const BUCKET_OPTIONS = STOCK_BUCKETS.map((bucket) => ({ value: bucket, label: bucket }));

/** ↓ in the Barcode cell is the item search: the cell drops its typed text rather than commit it. */
const BARCODE_SEARCH_KEYS: readonly string[] = ["ArrowDown"];

/** The two cells a row with no item is keyed through. */
const BLANK_ROW_FIELDS = new Set(["barcode", "itemName"]);

/** The td attribute naming its column — what a click on a blank row reads. */
const CELL_COLUMN_ATTR = "data-os-column";

/** The `<datalist>` id the Model cells complete from (Size / Colour are pick-lists now). */
function modelListId(itemId: string): string {
  return `opening-stock-models-${itemId}`;
}

/**
 * Why a greyed cell is shut, for its hover text. Size / Colour / Model are shut
 * by the batch number, not only by the item.
 */
function greyedTitle(
  column: Pick<ResolvedOpeningStockColumn, "kind">,
  line: OpeningStockLine,
  autoBatchNo: boolean,
): string {
  if (column.kind === "choice" || column.kind === "model") {
    if (takesBatchDetail(autoBatchNo, line.trackSignature) && line.batchTyped) {
      return "This line's batch number was typed — size, colour and model go only with a batch number the system gives. Empty the batch cell to key them.";
    }
    return `Not tracked by batch — size, colour and model go only with a batch, and this item's tracking policy is ${trackedBy(line.trackSignature)}`;
  }
  return `Not tracked — this item's tracking policy is ${trackedBy(line.trackSignature)}`;
}

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Tab — leave the grid (Qt `leaveGrid()`): the next focusable thing after the
 * grid's viewport, or the last one before it on Shift+Tab, rather than the next
 * of the grid's own forty-odd cells. The cell commits on the way out (blur).
 */
function leaveGrid(from: HTMLElement, forward: boolean): boolean {
  const viewport = from.closest<HTMLElement>('[data-erp-table-viewport="true"]');
  if (!viewport) {
    return false;
  }
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (element) => element.tabIndex >= 0 && !viewport.contains(element) && element.getClientRects().length > 0,
  );
  const target = forward
    ? candidates.find(
        (element) => (viewport.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      )
    : [...candidates]
        .reverse()
        .find((element) => (viewport.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING) !== 0);
  if (!target) {
    return false;
  }
  target.focus();
  return true;
}

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

/**
 * Lands on the cell a row is keyed from: Barcode — the scan field AND the item
 * search — or the Item cell on a layout that hides Barcode.
 */
export function focusEntryCellOfRow(rowKey: string): void {
  if (!focusCell(OPENING_STOCK_GRID_NAME, rowKey, "barcode")) {
    focusCell(OPENING_STOCK_GRID_NAME, rowKey, "itemName");
  }
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
  /** Size / Colour: a row picked from the cell's list — or emptied (blank id and name). */
  onPickChoice: (rowKey: string, field: "sizeName" | "colourName", id: string, name: string) => void;
  /** Size / Colour: "+ Add new …" at the foot of the cell's list. */
  onAddNewChoice: (rowKey: string, field: "sizeName" | "colourName") => void;
  onOpenItemPicker: (rowKey: string, typed: string) => void;
  /** ↓ in a blank row's Barcode — the item list, searched for what was typed there. */
  onSearchItems: (rowKey: string, typed: string) => void;
  onOpenSupplierPicker: (rowKey: string, typed: string) => void;
  onInsertLine: (rowKey: string) => void;
  onRemoveLine: (rowKey: string) => void;
  /** F4 — the line's next unit. */
  onSwitchUnit: (rowKey: string) => void;
  /**
   * Save & Post (Ctrl+Enter), for the one place the shared key cannot reach:
   * a picker cell, whose Enter opens its picker and stops there. `null` while
   * the button is off. Every other cell lets the key through to the screen.
   */
  onPostKey: (() => void) | null;
  /** Right-click: "save column width" and "Admin settings". */
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
  /** A heading dragged to a new width — saved from the right-click menu. */
  resizingKey?: string | null;
  onColumnResizeStart?: (event: ReactMouseEvent<HTMLElement>, columnKey: string) => void;
  /** `stock.auto_batch_no` — Size / Colour / Model open only under it. */
  autoBatchNo?: boolean;
  /** The Size and Colour lists and each item's earlier models. */
  batchDetail?: BatchDetailChoices;
};

const NO_BATCH_DETAIL: BatchDetailChoices = { sizes: [], colours: [], modelsByItem: {} };

export function OpeningStockGrid(props: OpeningStockGridProps) {
  const {
    columns,
    lines,
    editable,
    activeRowKey,
    flagged,
    onActiveRowChange,
    onSetField,
    onPickChoice,
    onAddNewChoice,
    onOpenItemPicker,
    onSearchItems,
    onOpenSupplierPicker,
    onInsertLine,
    onRemoveLine,
    onSwitchUnit,
    onPostKey,
    onContextMenu,
    resizingKey = null,
    onColumnResizeStart,
    autoBatchNo = false,
    batchDetail = NO_BATCH_DETAIL,
  } = props;

  const visible = useMemo(() => columns.filter((column) => column.visible), [columns]);
  const kindByKey = useMemo(
    () => new Map(visible.map((column) => [column.key, column.kind])),
    [visible],
  );
  const lineNumbers = useMemo(() => lineNumbersOf(lines), [lines]);
  const sizeChoices = useMemo(() => distinctChoices(batchDetail.sizes), [batchDetail.sizes]);
  const colourChoices = useMemo(() => distinctChoices(batchDetail.colours), [batchDetail.colours]);
  /** A datalist per item on screen that has earlier models — a Model cell offers its own item's. */
  const modelLists = useMemo(() => {
    const ids = new Set(lines.filter(hasItem).map((line) => line.itemId));
    return [...ids].flatMap((itemId) => {
      const models = batchDetail.modelsByItem[itemId] ?? [];
      return models.length ? [{ itemId, models }] : [];
    });
  }, [batchDetail.modelsByItem, lines]);
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
      // Commit what is being typed first (the cell commits on blur), then hand
      // the cursor back: the switch reads the committed quantity and cost.
      target.blur();
      target.focus();
      onSwitchUnit(rowKey);
      return;
    }

    if (event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey) {
      if (leaveGrid(target, !event.shiftKey)) {
        event.preventDefault();
      }
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

    // Ctrl+Enter is Save & Post — the screen's key, not a cell step.
    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // The cell has already committed its buffer; move on.
      event.preventDefault();
      moveCellFocus(OPENING_STOCK_GRID_NAME, event.target, event.shiftKey ? -1 : 1);
    }
  };

  /**
   * A blank row has nothing but its Barcode and Item cells — every other cell
   * is shut until an item is picked. A click on one of those lands on the
   * row's Barcode instead of on a cell that would take nothing (Qt
   * `eventFilter`, user 2026-10-23). The row's disabled inputs are made
   * transparent to the pointer (`.blankEntryRow`) — Chromium fires no mouse
   * event on a disabled input, and none bubbles — so this sees the click.
   */
  const onBlankRowMouseDown = (event: ReactMouseEvent<HTMLTableRowElement>, line: OpeningStockLine) => {
    if (!editable || hasItem(line) || event.button !== 0) {
      return;
    }
    const cell = (event.target as HTMLElement).closest<HTMLElement>(`[${CELL_COLUMN_ATTR}]`);
    const column = cell?.getAttribute(CELL_COLUMN_ATTR);
    if (!column || BLANK_ROW_FIELDS.has(column)) {
      return; // the row action cell, or a cell the row is keyed through
    }
    event.preventDefault();
    focusEntryCellOfRow(line.key);
  };

  return (
    <div className={quotationStyles.gridViewport} data-erp-table-viewport="true" onContextMenu={onContextMenu}>
      {autoBatchNo ? (
        <>
          {modelLists.map(({ itemId, models }) => (
            <datalist key={itemId} id={modelListId(itemId)}>
              {models.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          ))}
        </>
      ) : null}
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
            // Ctrl+Enter is the screen's Save & Post (the shared keys), and it
            // reaches the screen from every cell — the cell commits first. A
            // picker cell is the exception: its Enter opens the picker and goes
            // no further, so the key is handed over from here instead.
            if (
              (event.ctrlKey || event.metaKey) &&
              event.key === "Enter" &&
              (event.target as HTMLElement).hasAttribute(GRID_LOOKUP_ATTR)
            ) {
              event.preventDefault();
              event.stopPropagation();
              lastKeyRef.current = null;
              if (!event.repeat) {
                onPostKey?.();
              }
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
                  // Only while it can be keyed: the class costs the row's shut
                  // cells their hover text, which a read-only document keeps.
                  editable && !hasItem(line) && styles.blankEntryRow,
                )}
                title={line.problem || undefined}
                onFocusCapture={() => onActiveRowChange(line.key)}
                onMouseDown={(event) => {
                  onActiveRowChange(line.key);
                  onBlankRowMouseDown(event, line);
                }}
              >
                {visible.map((column, columnIndex) => {
                  const cellEditable = isCellEditable(column, line, editable, autoBatchNo);
                  const greyed = isCellGreyed(column, line, autoBatchNo);
                  const raw =
                    column.read === "trackedBy"
                      ? hasItem(line)
                        ? trackedBy(line.trackSignature)
                        : ""
                      : column.read === "computedLineNo"
                        ? (lineNumbers.get(line.key)?.lineNo ?? "")
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
                      {...{ [CELL_COLUMN_ATTR]: column.key }}
                      className={cx(greyed && styles.untrackedCell)}
                      title={greyed ? greyedTitle(column, line, autoBatchNo) : undefined}
                    >
                      {column.kind === "choice" ? (
                        <ChoicePickerCell
                          word={column.key === "sizeName" ? "size" : "colour"}
                          value={String(raw ?? "")}
                          choices={column.key === "sizeName" ? sizeChoices : colourChoices}
                          editable={cellEditable}
                          invalid={invalid}
                          gridName={OPENING_STOCK_GRID_NAME}
                          rowKey={line.key}
                          fieldKey={column.key}
                          columnIndex={columnIndex}
                          focusStop={isEnterStop(column, line, autoBatchNo)}
                          onPick={(choice) => {
                            if (column.write === "sizeName" || column.write === "colourName") {
                              onPickChoice(line.key, column.write, choice.id, choice.name);
                            }
                          }}
                          onAddNew={() => {
                            if (column.write === "sizeName" || column.write === "colourName") {
                              onAddNewChoice(line.key, column.write);
                            }
                          }}
                        />
                      ) : column.kind === "model" ? (
                        <BatchDetailCell
                          value={String(raw ?? "")}
                          editable={cellEditable}
                          invalid={invalid}
                          listId={modelListId(line.itemId)}
                          // sbd_model's limit.
                          maxLength={LINE_MODEL_MAX_LENGTH}
                          gridName={OPENING_STOCK_GRID_NAME}
                          rowKey={line.key}
                          fieldKey={column.key}
                          columnIndex={columnIndex}
                          focusStop={isEnterStop(column, line, autoBatchNo)}
                          onCommit={(text) => {
                            if (column.write) {
                              onSetField(line.key, column.write, text);
                            }
                          }}
                        />
                      ) : (
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
                                : column.key === "barcode" && isTrailing && editable
                                  ? "Scan, or type + ↓"
                                  : undefined
                          }
                          gridName={OPENING_STOCK_GRID_NAME}
                          rowKey={line.key}
                          fieldKey={column.key}
                          columnIndex={columnIndex}
                          focusStop={isEnterStop(column, line, autoBatchNo)}
                          dropBufferOnKeys={column.key === "barcode" ? BARCODE_SEARCH_KEYS : undefined}
                          onOpenPicker={() => openPicker(column.kind, line, "")}
                          onCommit={(text) => {
                            if (column.write) {
                              onSetField(line.key, column.write, text);
                            }
                          }}
                          onKeyDown={(event) => {
                            const modified = event.ctrlKey || event.metaKey || event.altKey;
                            if (
                              column.key === "batchNo" &&
                              autoBatchNo &&
                              event.key === "Enter" &&
                              !modified &&
                              !event.shiftKey
                            ) {
                              // The commit just made may have opened or shut
                              // Size / Colour / Model (a typed number locks
                              // them, a blank one opens them), so the walk waits
                              // for the render and steps on from there — Qt's
                              // focus filter reads the line after the commit too.
                              event.preventDefault();
                              event.stopPropagation();
                              window.requestAnimationFrame(() =>
                                focusNextStopFrom(OPENING_STOCK_GRID_NAME, line.key, "batchNo"),
                              );
                              return;
                            }
                            if (column.key !== "barcode") {
                              return;
                            }
                            const input = event.target as HTMLInputElement;
                            if (event.key === "Enter" && !modified) {
                              // Enter is the BARCODE check and nothing else: the
                              // cell has committed the scan, and the commit
                              // resolves it. The walk does not move on from here
                              // — a resolved scan lands on the row's Qty itself.
                              event.preventDefault();
                              event.stopPropagation();
                              if (!input.value.trim()) {
                                moveCellFocus(OPENING_STOCK_GRID_NAME, input, 1);
                              }
                              return;
                            }
                            if (event.key === "ArrowDown" && !modified && !event.shiftKey) {
                              // The cell is the item SEARCH too: what was typed
                              // goes to the list. The cell has dropped it
                              // (`dropBufferOnKeys`), so nothing is committed as
                              // a code — the input still shows it here.
                              event.preventDefault();
                              event.stopPropagation();
                              onSearchItems(line.key, input.value);
                            }
                          }}
                        />
                      )}
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
