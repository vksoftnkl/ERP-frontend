"use client";

/**
 * The PO line grid — ui_table 57, the Qt `NexTable` + `PurchaseInvoiceDelegate`
 * in its PO set-up (`PurchaseOrderCols`).
 *
 * On a DRAFT a blank line takes a Barcode (a scan, or a name and ↓ for the item
 * list) or an Item pick; a line with an item opens Qty, Free, Rate, Disc % and
 * MRP. Taxable, GST %, Tax and Total are the server's; Recd and Pending come
 * with a loaded PO. A refused cell is drawn read-only and SAYS why when keyed.
 *
 * Keys: Enter walks Barcode / Item on a blank line and Qty → Rate → Disc % on a
 * line, then the next line (Qt `setFocusStops`); ↑ / ↓ keep the column; + / −
 * go to the blank line / remove the current one on a cell that types neither
 * (Alt+= / Alt+− anywhere); Tab leaves the grid.
 */
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { cx } from "@/components/design-system/cx";
import { money, qtyText } from "@/features/purchase/shared/purchase.format";
import { focusCell, moveCellFocus } from "@/features/sales/quotation/components/grid-focus";
import {
  GRID_FIELD_ATTR,
  GRID_FOCUS_STOP_ATTR,
  GRID_GRID_ATTR,
  GRID_LOOKUP_ATTR,
  GRID_ROW_ATTR,
} from "@/features/sales/quotation/quotation.constants";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import type { PoGridColumn } from "../purchase-order.columns";
import { COL, PO_LINE_GRID_NAME, PO_NUMBER_COLUMNS } from "../purchase-order.constants";
import { cellPattern, isEnterStop, rowHasItem, whyNotEditable } from "../purchase-order.state";
import type { PoDraft, PoLine } from "../purchase-order.types";
import styles from "../page.module.scss";

/** The viewport's marker — what Tab leaves and what a read-only document focuses. */
export const PO_GRID_VIEWPORT_ATTR = "data-purchase-order-viewport";
const CELL_COLUMN_ATTR = "data-po-column";

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab — leave the grid: the next focusable thing after the viewport (the cell commits on blur). */
function leaveGrid(from: HTMLElement, forward: boolean): boolean {
  const viewport = from.closest<HTMLElement>(`[${PO_GRID_VIEWPORT_ATTR}]`);
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

export function focusPoGrid(): boolean {
  const viewport = document.querySelector<HTMLElement>(`[${PO_GRID_VIEWPORT_ATTR}]`);
  viewport?.focus();
  return Boolean(viewport);
}

/** A blank line's entry cell — its Barcode, else its Item. */
export function focusPoBlankLine(key: string, column: number = COL.Barcode): boolean {
  return focusCell(PO_LINE_GRID_NAME, key, String(column)) || focusCell(PO_LINE_GRID_NAME, key, String(COL.Item));
}

export type PoLineGridProps = {
  draft: PoDraft;
  columns: PoGridColumn[];
  /** False on a confirmed / cancelled order or in browse mode: nothing opens. */
  editable: boolean;
  onActiveRow: (key: string) => void;
  onEdit: (key: string, column: number, raw: string) => void;
  onOpenItemPicker: (key: string, initialQuery: string) => void;
  /** A code scanned (or typed) into a blank line's Barcode and committed. */
  onScanBarcode: (key: string, code: string) => void;
  /** ↓ in a blank line's Barcode — the item list, searched for what was typed. */
  onSearchItems: (key: string, typed: string) => void;
  /** A refused cell was keyed: say why. */
  onRefused: (why: string) => void;
  onGoToBlankLine: () => void;
  onRemoveLine: (key: string) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
};

function cellAttrs(line: PoLine, column: PoGridColumn, stop: boolean) {
  return {
    [GRID_GRID_ATTR]: PO_LINE_GRID_NAME,
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

/** A typed number cell: edits a local copy, commits on Enter or on leaving it. */
function NumberCell({
  line,
  column,
  stop,
  value,
  onActive,
  onCommit,
}: {
  line: PoLine;
  column: PoGridColumn;
  stop: boolean;
  value: string;
  onActive: () => void;
  onCommit: (raw: string) => void;
}) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const committed = useRef(value);
  // Enter commits and then moves focus, so the old cell's blur runs against a
  // stale closure and would commit again; the ref keeps that to one write.
  const textRef = useRef(value);
  const pattern = cellPattern(column.no);

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
      className={cx(quotationStyles.cellInput, quotationStyles.alignRight)}
      value={text}
      autoComplete="off"
      inputMode="decimal"
      data-uppercase="off"
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
        const next = event.target.value.replace(/,/g, "");
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
          moveCellFocus(PO_LINE_GRID_NAME, event.currentTarget, event.shiftKey ? -1 : 1);
        }
      }}
    />
  );
}

/**
 * The Barcode cell of a line with no item yet — the scan field AND the item
 * search. Enter (or leaving it) hands the code over; ↓ hands the typed text to
 * the item list instead and DROPS it. The text is read from a ref: the blur that
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
  line: PoLine;
  column: PoGridColumn;
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
      data-uppercase="off"
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
            moveCellFocus(PO_LINE_GRID_NAME, event.currentTarget, event.shiftKey ? -1 : 1);
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

function figure(value: number | null, asMoney: boolean): string {
  if (value === null || !Number.isFinite(value)) {
    return "";
  }
  return asMoney ? money(value) : qtyText(value);
}

export function PoLineGrid(props: PoLineGridProps) {
  const {
    draft,
    columns,
    editable,
    onActiveRow,
    onEdit,
    onOpenItemPicker,
    onScanBarcode,
    onSearchItems,
    onRefused,
    onGoToBlankLine,
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
    const field = (event.target as HTMLElement).getAttribute(GRID_FIELD_ATTR);
    if (!field) {
      return false;
    }
    event.preventDefault();
    const next = draft.lines[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (next && !focusCell(PO_LINE_GRID_NAME, next.key, field)) {
      focusPoBlankLine(next.key);
    }
    return true;
  };

  /** Alt+= / Alt+− anywhere; a bare + / − only on a cell that types neither. */
  const onRowLineKey = (event: ReactKeyboardEvent<HTMLTableRowElement>, line: PoLine): boolean => {
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
      onGoToBlankLine();
    } else if (line.key !== lastKey && rowHasItem(line)) {
      onRemoveLine(line.key);
    }
    return true;
  };

  /** A blank line takes nothing but a scan or an item pick. */
  const onBlankRowMouseDown = (event: ReactMouseEvent<HTMLTableRowElement>, line: PoLine) => {
    if (!editable || rowHasItem(line) || event.button !== 0) {
      return;
    }
    const cell = (event.target as HTMLElement).closest<HTMLElement>(`[${CELL_COLUMN_ATTR}]`);
    const column = Number(cell?.getAttribute(CELL_COLUMN_ATTR));
    if (!cell || column === COL.Barcode || column === COL.Item) {
      return;
    }
    event.preventDefault();
    onActiveRow(line.key);
    focusPoBlankLine(line.key);
  };

  /** A cell the editor refuses: read-only, and an edit attempt SAYS why instead of doing nothing. */
  const refused = (line: PoLine, column: PoGridColumn, value: string, why: string) => {
    const numeric = PO_NUMBER_COLUMNS.has(column.no);
    if (editable && rowHasItem(line) && why) {
      return (
        <input
          {...cellAttrs(line, column, false)}
          className={cx(quotationStyles.cellInput, styles.cellReadOnly, numeric && quotationStyles.alignRight)}
          value={value}
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
              moveCellFocus(PO_LINE_GRID_NAME, event.currentTarget, event.shiftKey ? -1 : 1);
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
      <div className={cx(quotationStyles.cellText, numeric && quotationStyles.alignRight)} title={why || undefined}>
        {value || " "}
      </div>
    );
  };

  const renderCell = (line: PoLine, column: PoGridColumn) => {
    const hasItem = rowHasItem(line);
    const why = editable ? whyNotEditable(draft, line, column.no) : "";
    const open = editable && hasItem && !why;
    const stop = editable && isEnterStop(line, column.no);
    const active = () => onActiveRow(line.key);
    const commit = (raw: string) => onEdit(line.key, column.no, raw);
    const spare = !hasItem && line.key === lastKey;

    switch (column.no) {
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
        return refused(line, column, "", hasItem ? why : "");
      case COL.Item:
        if (!editable) {
          return refused(line, column, line.itemName, "");
        }
        return (
          <input
            {...cellAttrs(line, column, stop)}
            {...{ [GRID_LOOKUP_ATTR]: "true" }}
            className={cx(quotationStyles.cellInput, styles.cellPlaceholder)}
            value={line.itemName}
            placeholder={spare ? "Enter or type for the item list" : ""}
            readOnly
            title={hasItem ? why : "Enter, a double-click or a letter opens the item list"}
            onFocus={active}
            onDoubleClick={() => (hasItem ? onRefused(why) : onOpenItemPicker(line.key, ""))}
            onKeyDown={(event) => {
              if (event.ctrlKey || event.metaKey || event.altKey) {
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (!hasItem) {
                  onOpenItemPicker(line.key, "");
                } else {
                  moveCellFocus(PO_LINE_GRID_NAME, event.currentTarget, event.shiftKey ? -1 : 1);
                }
                return;
              }
              if (lineKeyOf(event)) {
                return;
              }
              if (!hasItem && event.key.length === 1 && event.key !== " ") {
                event.preventDefault();
                onOpenItemPicker(line.key, event.key);
              } else if (hasItem && (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete")) {
                event.preventDefault();
                onRefused(why);
              }
            }}
          />
        );
      case COL.Unit:
        return <div className={quotationStyles.cellText}>{line.unitName}</div>;
      case COL.Qty:
      case COL.Free:
      case COL.Rate:
      case COL.DiscPct:
      case COL.Mrp: {
        const value =
          column.no === COL.Qty
            ? line.qty
            : column.no === COL.Free
              ? line.free
              : column.no === COL.Rate
                ? line.rate
                : column.no === COL.DiscPct
                  ? line.discPct
                  : line.mrp;
        return open ? (
          <NumberCell line={line} column={column} stop={stop} value={value} onActive={active} onCommit={commit} />
        ) : (
          refused(line, column, value, hasItem ? why : "")
        );
      }
      case COL.Taxable:
        return refused(line, column, hasItem ? figure(line.taxable, true) : "", "");
      case COL.GstPct:
        return refused(line, column, hasItem ? figure(line.gstPct, false) : "", "");
      case COL.Tax:
        return refused(line, column, hasItem ? figure(line.tax, true) : "", "");
      case COL.Total:
        return refused(line, column, hasItem ? figure(line.total, true) : "", "");
      case COL.Recd:
        return refused(line, column, hasItem ? figure(line.received, false) : "", "");
      case COL.Pending:
        return (
          <div
            className={cx(
              quotationStyles.cellText,
              quotationStyles.alignRight,
              (line.pending ?? 0) > 0 && (line.received ?? 0) > 0 && styles.pendingOpen,
            )}
          >
            {hasItem ? figure(line.pending, false) : ""}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div
      className={cx(quotationStyles.gridViewport, styles.gridViewport)}
      {...{ [PO_GRID_VIEWPORT_ATTR]: "true" }}
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
          {draft.lines.map((line, index) => (
            <tr
              key={line.key}
              className={index % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven}
              onMouseDown={(event) => onBlankRowMouseDown(event, line)}
              onKeyDown={(event) => {
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
