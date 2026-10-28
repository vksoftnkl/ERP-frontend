"use client";

/**
 * The line grid — ui_table 56, the Qt `NexTable` + `PurchaseInvoiceDelegate`.
 *
 * A blank line opens Barcode (a scan, or a name and ↓ for the item list) and
 * Item (the item list). A line with an item opens Batch, Expiry, Billed, Recd,
 * Dmg, Free, Rate, Disc % and MRP; Item re-opens the list to change the item.
 * Taxable onward are the server's figures — plain text, and a click on one
 * SAYS so instead of doing nothing.
 *
 * Keys: Enter walks Barcode, Item, Billed, Rate, Disc % (Qt `setFocusStops`),
 * then the next line. ↑ / ↓ keep the column and change the line; + / − add a
 * line / remove the current one on a cell that types neither (Alt+= / Alt+−
 * anywhere); Tab leaves the grid.
 */
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { cx } from "@/components/design-system/cx";
import { focusCell, moveCellFocus } from "@/features/sales/quotation/components/grid-focus";
import {
  GRID_FIELD_ATTR,
  GRID_FOCUS_STOP_ATTR,
  GRID_GRID_ATTR,
  GRID_LOOKUP_ATTR,
  GRID_ROW_ATTR,
} from "@/features/sales/quotation/quotation.constants";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { money, qtyText } from "../../shared/purchase.format";
import type { LineColumn } from "../invoice.columns";
import { COL, LINE_GRID_NAME, NUMBER_COLUMNS } from "../invoice.constants";
import { checkText, isEnterStop, rowHasItem, whyNotEditable } from "../invoice.state";
import type { InvoiceLine } from "../invoice.types";
import styles from "../page.module.scss";

const QTY_PATTERN = /^\d*(\.\d{0,3})?$/;
const RATE_PATTERN = /^\d*(\.\d{0,4})?$/;
const MONEY_PATTERN = /^\d*(\.\d{0,2})?$/;
const DATE_PATTERN = /^[\d/]{0,10}$/;
const ANY_PATTERN = /^.{0,100}$/;

/** The viewport's marker — what Tab leaves and what a read-only document focuses. */
export const LINE_GRID_VIEWPORT_ATTR = "data-purchase-invoice-viewport";
const CELL_COLUMN_ATTR = "data-pi-column";

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
export function focusBlankLineEntry(key: string): boolean {
  return focusCell(LINE_GRID_NAME, key, String(COL.Barcode)) || focusCell(LINE_GRID_NAME, key, String(COL.Item));
}

export function focusLineCell(key: string, column: number): boolean {
  return focusCell(LINE_GRID_NAME, key, String(column)) || focusBlankLineEntry(key);
}

export type InvoiceLineGridProps = {
  lines: readonly InvoiceLine[];
  columns: LineColumn[];
  /** False on a posted / cancelled bill or in browse mode: nothing opens. */
  editable: boolean;
  onActiveRow: (key: string) => void;
  onEdit: (key: string, column: number, raw: string) => void;
  onOpenItemPicker: (key: string, initialQuery: string) => void;
  /** A code scanned (or typed) into a blank line's Barcode and committed. */
  onScanBarcode: (key: string, code: string) => void;
  /** ↓ in a blank line's Barcode — the item list, searched for what was typed there. */
  onSearchItems: (key: string, typed: string) => void;
  /** A refused cell was clicked: say why. */
  onRefused: (why: string) => void;
  onAddLine: () => void;
  onRemoveLine: (key: string) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
};

function cellAttrs(line: InvoiceLine, column: number, stop: boolean) {
  return {
    [GRID_GRID_ATTR]: LINE_GRID_NAME,
    [GRID_ROW_ATTR]: line.key,
    [GRID_FIELD_ATTR]: String(column),
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
  numeric,
  upper,
  onActive,
  onCommit,
}: {
  line: InvoiceLine;
  column: number;
  stop: boolean;
  value: string;
  pattern: RegExp;
  align?: "right";
  placeholder?: string;
  numeric?: boolean;
  /** Batch numbers are upper case; the app-wide title-casing must not touch them. */
  upper?: boolean;
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
      className={cx(quotationStyles.cellInput, align === "right" && quotationStyles.alignRight, upper && styles.upperCell)}
      value={text}
      placeholder={placeholder}
      autoComplete="off"
      inputMode={numeric ? "decimal" : undefined}
      {...(upper ? { "data-uppercase": "off" } : {})}
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
        const next = upper ? event.target.value.toUpperCase() : event.target.value;
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
  stop,
  placeholder,
  onActive,
  onScan,
  onSearch,
}: {
  line: InvoiceLine;
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
      {...cellAttrs(line, COL.Barcode, stop)}
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

/** What a typed number cell holds, by column. */
function typedValue(line: InvoiceLine, column: number): string {
  switch (column) {
    case COL.Billed:
      return line.billed;
    case COL.Recd:
      return line.recd;
    case COL.Dmg:
      return line.dmg;
    case COL.Free:
      return line.free;
    case COL.Rate:
      return line.rate;
    case COL.DiscPct:
      return line.discPct;
    case COL.Mrp:
      return line.mrp;
    case COL.Batch:
      return line.batch;
    case COL.Expiry:
      return line.expiry;
    default:
      return "";
  }
}

function patternOf(column: number): RegExp {
  switch (column) {
    case COL.Rate:
      return RATE_PATTERN;
    case COL.DiscPct:
    case COL.Mrp:
      return MONEY_PATTERN;
    case COL.Expiry:
      return DATE_PATTERN;
    case COL.Batch:
      return ANY_PATTERN;
    default:
      return QTY_PATTERN;
  }
}

/** The server's figures and the screen's own read-outs, by column. */
function shownValue(line: InvoiceLine, column: number): string {
  const calc = line.calc;
  switch (column) {
    case COL.Barcode:
      return line.itemCode;
    case COL.Item:
      return line.itemName;
    case COL.Unit:
      return line.unitName;
    case COL.Short:
      return calc && calc.shortQty > 0 ? qtyText(calc.shortQty) : "";
    case COL.Taxable:
      return calc ? money(calc.taxable) : "";
    case COL.GstPct:
      return rowHasItem(line) ? line.gstPct : "";
    case COL.Tax:
      return calc ? money(calc.tax) : "";
    case COL.Total:
      return calc ? money(calc.total) : "";
    case COL.CostWot:
      return calc ? calc.costWot.toFixed(2) : "";
    case COL.Check:
      return checkText(line);
    default:
      return typedValue(line, column);
  }
}

function toneOf(line: InvoiceLine, column: number): string | undefined {
  if (column === COL.Short && line.calc && line.calc.shortQty > 0) {
    return styles.toneBad;
  }
  if (column === COL.Check && line.calc) {
    return line.calc.shortQty > 0 ? styles.toneBad : styles.toneGood;
  }
  return undefined;
}

export function InvoiceLineGrid(props: InvoiceLineGridProps) {
  const {
    lines,
    columns,
    editable,
    onActiveRow,
    onEdit,
    onOpenItemPicker,
    onScanBarcode,
    onSearchItems,
    onRefused,
    onAddLine,
    onRemoveLine,
    onContextMenu,
  } = props;
  const lastKey = lines[lines.length - 1]?.key;

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
    const next = lines[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (next && !focusCell(LINE_GRID_NAME, next.key, field)) {
      focusBlankLineEntry(next.key);
    }
    return true;
  };

  /** Alt+= / Alt+− anywhere; a bare + / − only on a cell that types neither. */
  const onRowLineKey = (event: ReactKeyboardEvent<HTMLTableRowElement>, line: InvoiceLine): boolean => {
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
      onAddLine();
    } else if (rowHasItem(line)) {
      onRemoveLine(line.key);
    }
    return true;
  };

  /** A blank line takes nothing but a scan or an item pick. */
  const onBlankRowMouseDown = (event: ReactMouseEvent<HTMLTableRowElement>, line: InvoiceLine) => {
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
    focusBlankLineEntry(line.key);
  };

  /** A cell the editor refuses: read-only, and an edit attempt SAYS why. */
  const refused = (line: InvoiceLine, column: number, why: string) => {
    const text = shownValue(line, column);
    const className = cx(NUMBER_COLUMNS.has(column) && quotationStyles.alignRight, toneOf(line, column));
    if (editable && rowHasItem(line) && why) {
      return (
        <input
          {...cellAttrs(line, column, false)}
          className={cx(quotationStyles.cellInput, styles.cellReadOnly, className)}
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
      <div className={cx(quotationStyles.cellText, className)} title={text || undefined}>
        {text || " "}
      </div>
    );
  };

  const renderCell = (line: InvoiceLine, column: number) => {
    const hasItem = rowHasItem(line);
    const why = editable ? whyNotEditable(line, column) : "";
    const open = editable && !why;
    const stop = editable && isEnterStop(line, column);
    const active = () => onActiveRow(line.key);
    const spare = !hasItem && line.key === lastKey;

    if (column === COL.Barcode) {
      if (editable && !hasItem) {
        return (
          <BarcodeCell
            line={line}
            stop={stop}
            placeholder={spare ? "Scan, or type + ↓" : ""}
            onActive={active}
            onScan={(code) => onScanBarcode(line.key, code)}
            onSearch={(typed) => onSearchItems(line.key, typed)}
          />
        );
      }
      return refused(line, column, hasItem ? why : "");
    }
    if (column === COL.Item) {
      if (!editable) {
        return refused(line, column, "");
      }
      return (
        <input
          {...cellAttrs(line, column, stop)}
          {...{ [GRID_LOOKUP_ATTR]: "true" }}
          className={cx(quotationStyles.cellInput, styles.cellPlaceholder)}
          value={line.itemName}
          placeholder={spare ? "Enter for the item list" : hasItem ? "…" : ""}
          readOnly
          title={hasItem ? `${line.itemCode ? `${line.itemCode} · ` : ""}${line.itemName} — type or double-click to change the item` : undefined}
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
            if (event.key.length === 1 && event.key !== " ") {
              event.preventDefault();
              onOpenItemPicker(line.key, event.key);
            }
          }}
        />
      );
    }
    if (open && column !== COL.Unit) {
      return (
        <TextCell
          line={line}
          column={column}
          stop={stop}
          value={typedValue(line, column)}
          pattern={patternOf(column)}
          align={NUMBER_COLUMNS.has(column) ? "right" : undefined}
          numeric={NUMBER_COLUMNS.has(column)}
          upper={column === COL.Batch}
          placeholder={column === COL.Expiry ? "dd/MM/yyyy" : undefined}
          onActive={active}
          onCommit={(raw) => onEdit(line.key, column, raw)}
        />
      );
    }
    return refused(line, column, why);
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
              <th key={column.no} scope="col" className={cx(NUMBER_COLUMNS.has(column.no) && quotationStyles.alignRight)}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
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
                  {renderCell(line, column.no)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
