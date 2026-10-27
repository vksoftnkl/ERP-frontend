"use client";

/**
 * The line grid — ui_table 54, the Qt `NexTable` + `GodownTransferDelegate`.
 *
 * Few cells open: Barcode on a blank line (a scan, or a name and ↓ for the
 * item list), and on a line Qty, Free and the two labour rates. Everything else
 * is the picked holding's or the screen's arithmetic. Which cells open is the
 * SCREEN's judgement (`whyNotEditable`), so a refused cell is drawn as plain
 * text that SAYS why when it is clicked — never a dead cell.
 *
 * Keys: Enter walks the screen's stops (Barcode and Item on a blank line; Qty,
 * Free and the rates the ticked boxes show on a line), then the next line. ↑ / ↓
 * keep the column and change the line; F12 picks from stock for the line; + / −
 * add a line above / remove the current one on a cell that types neither
 * (Alt+= / Alt+− anywhere); Tab leaves the grid. A click on a blank line
 * anywhere but its Barcode / Item lands on its Barcode.
 */
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { cx } from "@/components/design-system/cx";
import { formatCurrency } from "@/domain/pricing";
import { focusCell, moveCellFocus } from "@/features/sales/quotation/components/grid-focus";
import {
  GRID_FIELD_ATTR,
  GRID_FOCUS_STOP_ATTR,
  GRID_GRID_ATTR,
  GRID_LOOKUP_ATTR,
  GRID_ROW_ATTR,
} from "@/features/sales/quotation/quotation.constants";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { qtyCell } from "@/features/stocks/stock-adjustment/stock-adjustment.format";
import type { LineColumn } from "../stock-transfer.columns";
import { COL, LINE_GRID_NAME, bucketLabel } from "../stock-transfer.constants";
import {
  batchExpiryText,
  isEnterStop,
  lineValue,
  postNote,
  rowHasItem,
  whyNotEditable,
} from "../stock-transfer.state";
import type { TransferDraft, TransferLine } from "../stock-transfer.types";
import styles from "../page.module.scss";

const QTY_PATTERN = /^\d*(\.\d{0,3})?$/;
const RATE_PATTERN = /^\d*(\.\d{0,4})?$/;

/** The viewport's marker — what Tab leaves and what a read-only document focuses. */
export const LINE_GRID_VIEWPORT_ATTR = "data-stock-transfer-viewport";
const CELL_COLUMN_ATTR = "data-st-column";

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab — leave the grid: the next focusable thing after the viewport (the cell commits on blur). */
function leaveGrid(from: HTMLElement, forward: boolean): boolean {
  const viewport = from.closest<HTMLElement>(`[${LINE_GRID_VIEWPORT_ATTR}]`);
  if (!viewport) {
    return false;
  }
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (element) => element.tabIndex >= 0 && !viewport.contains(element) && element.getClientRects().length > 0,
  );
  const target = forward
    ? candidates.find((element) => (viewport.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
    : [...candidates]
        .reverse()
        .find((element) => (viewport.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING) !== 0);
  if (!target) {
    return false;
  }
  target.focus();
  return true;
}

export function focusLineGrid(): boolean {
  const viewport = document.querySelector<HTMLElement>(`[${LINE_GRID_VIEWPORT_ATTR}]`);
  viewport?.focus();
  return Boolean(viewport);
}

/** A blank line's entry cell — its Barcode, else its Item. */
export function focusBlankLineEntry(key: string, column: number): boolean {
  return focusCell(LINE_GRID_NAME, key, String(column)) || focusCell(LINE_GRID_NAME, key, String(COL.Description));
}

export type TransferLineGridProps = {
  draft: TransferDraft;
  columns: LineColumn[];
  lineNos: ReadonlyMap<string, number>;
  problemKeys: ReadonlySet<string>;
  problemText: ReadonlyMap<string, string>;
  /** False on a posted / cancelled document or in browse mode: nothing opens. */
  editable: boolean;
  onActiveRow: (key: string) => void;
  onEdit: (key: string, column: number, raw: string) => void;
  onOpenItemPicker: (key: string, initialQuery: string) => void;
  /** A code scanned (or typed) into a blank line's Barcode and committed. */
  onScanBarcode: (key: string, code: string) => void;
  /** ↓ in a blank line's Barcode — the item list, searched for what was typed there. */
  onSearchItems: (key: string, typed: string) => void;
  onOpenPick: (key: string) => void;
  /** A refused cell was clicked: say why. */
  onRefused: (why: string) => void;
  onInsertLine: (key: string) => void;
  onRemoveLine: (key: string) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
};

function cellAttrs(line: TransferLine, column: LineColumn, stop: boolean) {
  return {
    [GRID_GRID_ATTR]: LINE_GRID_NAME,
    [GRID_ROW_ATTR]: line.key,
    [GRID_FIELD_ATTR]: String(column.no),
    ...(stop ? { [GRID_FOCUS_STOP_ATTR]: "true" } : {}),
  };
}

/** + / − as line keys. With Alt, by the physical key too; bare, only the characters. */
function lineKeyOf(event: ReactKeyboardEvent): "add" | "remove" | null {
  if (event.altKey) {
    if (event.key === "=" || event.key === "+" || event.code === "Equal" || event.code === "NumpadAdd") {
      return "add";
    }
    if (event.key === "-" || event.code === "Minus" || event.code === "NumpadSubtract") {
      return "remove";
    }
    return null;
  }
  if (event.key === "+") {
    return "add";
  }
  return event.key === "-" || event.key === "−" ? "remove" : null;
}

/** A typed cell: edits a local copy, commits on Enter or on leaving it. */
function TextCell({
  line,
  column,
  stop,
  value,
  pattern,
  align,
  placeholder,
  title,
  onActive,
  onCommit,
}: {
  line: TransferLine;
  column: LineColumn;
  stop: boolean;
  value: string;
  pattern: RegExp;
  align?: "right" | "center";
  placeholder?: string;
  title?: string;
  onActive: () => void;
  onCommit: (raw: string) => void;
}) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const committed = useRef(value);
  // Enter commits and then moves focus, so the old cell's blur runs against a
  // stale closure and would commit again; the ref keeps that to one write.
  const textRef = useRef(value);

  useEffect(() => {
    if (!focused) {
      setText(value);
      textRef.current = value;
      committed.current = value;
    }
  }, [focused, value]);

  const commit = () => {
    if (textRef.current !== committed.current) {
      committed.current = textRef.current;
      onCommit(textRef.current);
    }
  };

  return (
    <input
      {...cellAttrs(line, column, stop)}
      className={cx(
        quotationStyles.cellInput,
        align === "right" && quotationStyles.alignRight,
        align === "center" && quotationStyles.alignCenter,
      )}
      value={text}
      placeholder={placeholder}
      title={title}
      autoComplete="off"
      inputMode="decimal"
      onFocus={(event) => {
        setFocused(true);
        onActive();
        event.currentTarget.select();
      }}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onChange={(event) => {
        const next = event.target.value;
        if (pattern.test(next)) {
          textRef.current = next;
          setText(next);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          // The first Esc takes back what was typed; only an Esc with nothing
          // to undo reaches the screen (Close).
          if (textRef.current !== committed.current) {
            event.preventDefault();
            textRef.current = committed.current;
            setText(committed.current);
          }
          return;
        }
        if (event.key === "Enter" && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          commit();
          moveCellFocus(LINE_GRID_NAME, event.currentTarget, event.shiftKey ? -1 : 1);
        }
      }}
    />
  );
}

/**
 * The Barcode cell of a line with no item yet — the scan field AND the item
 * search. Enter (or leaving it) hands the code over to be resolved; ↓ hands the
 * typed text to the item list instead and DROPS it, so the focus leaving for the
 * list commits nothing as a code. The text is read from a ref: the blur that
 * follows ↓ fires before React has re-rendered the cleared state.
 */
function BarcodeCell({
  line,
  column,
  stop,
  placeholder,
  onActive,
  onScan,
  onSearch,
}: {
  line: TransferLine;
  column: LineColumn;
  stop: boolean;
  placeholder?: string;
  onActive: () => void;
  onScan: (code: string) => void;
  onSearch: (typed: string) => void;
}) {
  const [text, setText] = useState("");
  const textRef = useRef("");
  const put = (next: string) => {
    textRef.current = next;
    setText(next);
  };
  const handOff = (): boolean => {
    const code = textRef.current.trim();
    put("");
    if (code) {
      onScan(code);
    }
    return code !== "";
  };

  return (
    <input
      {...cellAttrs(line, column, stop)}
      className={cx(quotationStyles.cellInput, styles.cellPlaceholder)}
      value={text}
      placeholder={placeholder}
      title="Scan a barcode, or type a name and press ↓ for the item list"
      autoComplete="off"
      onFocus={(event) => {
        onActive();
        event.currentTarget.select();
      }}
      onBlur={() => {
        handOff();
      }}
      onChange={(event) => put(event.target.value)}
      onKeyDown={(event) => {
        const modified = event.ctrlKey || event.metaKey || event.altKey;
        if (event.key === "Escape" && textRef.current) {
          event.preventDefault();
          put("");
          return;
        }
        if (event.key === "Enter" && !modified) {
          event.preventDefault();
          if (!handOff()) {
            moveCellFocus(LINE_GRID_NAME, event.currentTarget, event.shiftKey ? -1 : 1);
          }
          return;
        }
        if (event.key === "ArrowDown" && !modified && !event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          const typed = textRef.current;
          put("");
          onSearch(typed);
        }
      }}
    />
  );
}

function bucketChipClass(code: string): string {
  if (code === "SALEABLE") {
    return styles.bucketSaleable;
  }
  return code === "DAMAGED" ? styles.bucketDamaged : styles.bucketOther;
}

const money = (value: number) => formatCurrency(Number.isFinite(value) ? value : 0, 2, true);

export function TransferLineGrid(props: TransferLineGridProps) {
  const {
    draft,
    columns,
    lineNos,
    problemKeys,
    problemText,
    editable,
    onActiveRow,
    onEdit,
    onOpenItemPicker,
    onScanBarcode,
    onSearchItems,
    onOpenPick,
    onRefused,
    onInsertLine,
    onRemoveLine,
    onContextMenu,
  } = props;
  const lastKey = draft.lines[draft.lines.length - 1]?.key;

  /** ↑ / ↓ — the same column one line up or down, else that line's entry cell. */
  const onRowArrow = (event: ReactKeyboardEvent<HTMLTableRowElement>, index: number): boolean => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return false;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return false;
    }
    const target = event.target as HTMLElement;
    const field = target.getAttribute(GRID_FIELD_ATTR);
    if (!field) {
      return false;
    }
    event.preventDefault();
    const next = draft.lines[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (next && !focusCell(LINE_GRID_NAME, next.key, field)) {
      focusBlankLineEntry(next.key, COL.Barcode);
    }
    return true;
  };

  /** Alt+= / Alt+− anywhere; a bare + / − only on a cell that types neither. */
  const onRowLineKey = (event: ReactKeyboardEvent<HTMLTableRowElement>, line: TransferLine): boolean => {
    if (!editable || event.ctrlKey || event.metaKey) {
      return false;
    }
    const which = lineKeyOf(event);
    if (!which) {
      return false;
    }
    const target = event.target as HTMLElement;
    const typing = target instanceof HTMLInputElement && !target.readOnly;
    if (!event.altKey && typing) {
      return false;
    }
    event.preventDefault();
    if (which === "add") {
      onInsertLine(line.key);
    } else if (line.key !== lastKey && rowHasItem(line)) {
      onRemoveLine(line.key);
    }
    return true;
  };

  /** A blank line takes nothing but a scan or an item pick (Qt `eventFilter`). */
  const onBlankRowMouseDown = (event: ReactMouseEvent<HTMLTableRowElement>, line: TransferLine) => {
    if (!editable || rowHasItem(line) || event.button !== 0) {
      return;
    }
    const cell = (event.target as HTMLElement).closest<HTMLElement>(`[${CELL_COLUMN_ATTR}]`);
    const column = Number(cell?.getAttribute(CELL_COLUMN_ATTR));
    if (!cell || column === COL.Barcode || column === COL.Description) {
      return;
    }
    event.preventDefault();
    onActiveRow(line.key);
    focusBlankLineEntry(line.key, COL.Barcode);
  };

  /** A cell the editor refuses: read-only, and an edit attempt SAYS why instead of doing nothing. */
  const refused = (line: TransferLine, column: LineColumn, text: string, className?: string, why?: string) => {
    if (editable && rowHasItem(line) && why) {
      return (
        <input
          {...cellAttrs(line, column, false)}
          className={cx(quotationStyles.cellInput, styles.cellReadOnly, styles.cellMuted, className)}
          value={text}
          title={why}
          readOnly
          tabIndex={-1}
          onFocus={() => onActiveRow(line.key)}
          onDoubleClick={() => onRefused(why)}
          onKeyDown={(event) => {
            if (event.ctrlKey || event.metaKey || event.altKey) {
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              moveCellFocus(LINE_GRID_NAME, event.currentTarget, event.shiftKey ? -1 : 1);
              return;
            }
            if (lineKeyOf(event)) {
              return;
            }
            if (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete") {
              event.preventDefault();
              onRefused(why);
            }
          }}
        />
      );
    }
    return (
      <div className={cx(quotationStyles.cellText, className)} title={why || undefined}>
        {text || " "}
      </div>
    );
  };

  const renderCell = (line: TransferLine, column: LineColumn) => {
    const hasItem = rowHasItem(line);
    const why = editable ? whyNotEditable(draft, line, column.no) : "";
    const open = editable && hasItem && !why;
    const stop = editable && isEnterStop(draft, line, column.no);
    const active = () => onActiveRow(line.key);
    const commit = (raw: string) => onEdit(line.key, column.no, raw);
    const spare = !hasItem && line.key === lastKey;

    switch (column.no) {
      case COL.LineNo:
        return (
          <div className={cx(quotationStyles.cellText, quotationStyles.alignCenter)}>
            {lineNos.get(line.key) ?? ""}
          </div>
        );
      case COL.Barcode:
        if (editable && !hasItem) {
          return (
            <BarcodeCell
              line={line}
              column={column}
              stop={stop}
              placeholder={spare ? "Scan, or type + ↓" : ""}
              onActive={active}
              onScan={(code) => onScanBarcode(line.key, code)}
              onSearch={(typed) => onSearchItems(line.key, typed)}
            />
          );
        }
        return refused(line, column, line.barcode, undefined, hasItem ? why : "");
      case COL.Description:
        if (!editable) {
          return refused(line, column, line.itemName);
        }
        return (
          <input
            {...cellAttrs(line, column, stop)}
            {...{ [GRID_LOOKUP_ATTR]: "true" }}
            className={cx(quotationStyles.cellInput, styles.cellPlaceholder)}
            value={line.itemName}
            placeholder={spare ? "+ adds a line · type to search" : ""}
            readOnly
            title={line.itemCode ? `${line.itemCode} · ${line.itemName}` : undefined}
            onFocus={active}
            onDoubleClick={() => onOpenItemPicker(line.key, "")}
            onKeyDown={(event) => {
              if (event.ctrlKey || event.metaKey || event.altKey) {
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (!hasItem) {
                  onOpenItemPicker(line.key, "");
                } else {
                  moveCellFocus(LINE_GRID_NAME, event.currentTarget, event.shiftKey ? -1 : 1);
                }
                return;
              }
              if (lineKeyOf(event)) {
                return;
              }
              if (!hasItem && event.key.length === 1 && event.key !== " ") {
                event.preventDefault();
                onOpenItemPicker(line.key, event.key);
              }
            }}
          />
        );
      case COL.BatchExpiry:
        return refused(line, column, batchExpiryText(line), undefined, why);
      case COL.Bucket:
        return hasItem && line.bucket ? (
          <div className={quotationStyles.cellText} title={why || undefined}>
            <span className={cx(styles.bucketChip, bucketChipClass(line.bucket))}>{bucketLabel(line.bucket)}</span>
          </div>
        ) : (
          <div className={quotationStyles.cellText} />
        );
      case COL.UomName:
        return <div className={quotationStyles.cellText}>{line.uomName}</div>;
      case COL.Available:
        return (
          <div className={cx(quotationStyles.cellText, quotationStyles.alignRight)}>
            {hasItem && line.available !== null ? qtyCell(line.available) : ""}
          </div>
        );
      case COL.Qty:
        return open ? (
          <TextCell
            line={line}
            column={column}
            stop={stop}
            value={line.qty}
            pattern={QTY_PATTERN}
            align="right"
            onActive={active}
            onCommit={commit}
          />
        ) : (
          refused(line, column, line.qty, quotationStyles.alignRight, why)
        );
      case COL.FreeQty:
        return open ? (
          <TextCell
            line={line}
            column={column}
            stop={stop}
            value={line.freeQty}
            pattern={QTY_PATTERN}
            align="right"
            onActive={active}
            onCommit={commit}
          />
        ) : (
          refused(line, column, line.freeQty, quotationStyles.alignRight, hasItem ? why : "")
        );
      case COL.CostRate:
        // Shown to 2 decimals, never keyed.
        return refused(
          line,
          column,
          hasItem && line.costRate !== null ? money(line.costRate) : "",
          quotationStyles.alignRight,
          why,
        );
      case COL.Value:
        return (
          <div className={cx(quotationStyles.cellText, quotationStyles.alignRight)}>
            {hasItem ? money(lineValue(line)) : ""}
          </div>
        );
      case COL.LoadRate:
      case COL.UnloadRate: {
        const value = column.no === COL.LoadRate ? line.loadRate : line.unloadRate;
        return open ? (
          <TextCell
            line={line}
            column={column}
            stop={stop}
            value={value}
            pattern={RATE_PATTERN}
            align="right"
            onActive={active}
            onCommit={commit}
          />
        ) : (
          refused(line, column, value, quotationStyles.alignRight, hasItem ? why : "")
        );
      }
      case COL.PostNote:
        return <div className={cx(quotationStyles.cellText, styles.noteCell)}>{postNote(draft, line)}</div>;
      default:
        return null;
    }
  };

  return (
    <div
      className={cx(quotationStyles.gridViewport, styles.gridViewport)}
      {...{ [LINE_GRID_VIEWPORT_ATTR]: "true" }}
      // Focusable from script only: a read-only document puts its cursor here.
      tabIndex={-1}
      onContextMenu={onContextMenu}
    >
      <table className={cx(quotationStyles.grid, styles.lineGrid)}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.no} style={{ width: `${column.widthPct}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.no} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {draft.lines.map((line, index) => {
            const problem = problemKeys.has(line.key);
            return (
              <tr
                key={line.key}
                className={cx(
                  index % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven,
                  problem && styles.problemRow,
                )}
                title={problem ? problemText.get(line.key) : undefined}
                onMouseDown={(event) => onBlankRowMouseDown(event, line)}
                onKeyDown={(event) => {
                  const bare = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
                  // F12 — Pick from stock for this line.
                  if (event.key === "F12" && bare && editable) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!event.repeat) {
                      onOpenPick(line.key);
                    }
                    return;
                  }
                  if (event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey) {
                    if (leaveGrid(event.target as HTMLElement, !event.shiftKey)) {
                      event.preventDefault();
                    }
                    return;
                  }
                  if (onRowArrow(event, index)) {
                    return;
                  }
                  onRowLineKey(event, line);
                }}
              >
                {columns.map((column) => (
                  <td key={column.no} {...{ [CELL_COLUMN_ATTR]: String(column.no) }}>
                    {renderCell(line, column)}
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
