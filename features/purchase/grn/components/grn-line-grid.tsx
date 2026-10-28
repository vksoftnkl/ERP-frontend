"use client";

/**
 * The GRN line grid — ui_table 58, the Qt `NexTable` + `PurchaseInvoiceDelegate`
 * over `GrnCols`.
 *
 * Which cells open is the screen's rule (`isCellEditable`): on a blank line the
 * Barcode (a scan, or a name and ↓ for the item list) and the Item (the list);
 * on a line with an item Challan, Recd, Dmg, Free, Rate, Batch, Expiry and MRP.
 * Short and Value are the screen's arithmetic, Unit / PO / Pending come with the
 * item or the PO line.
 *
 * Keys: Enter walks the Qt focus stops (Barcode, Item, Challan, Recd, Dmg,
 * Rate), then the next line; Tab walks every open cell (Batch / Expiry
 * included); ↑ / ↓ keep the column and change the line; Alt+= goes to the blank
 * line, Alt+− removes the current one (bare + / − on a cell that types neither).
 */
import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
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
import type { GrnColumn } from "../grn.columns";
import { COL, GRN_GRID_NAME } from "../grn.constants";
import { cellReadOnlyWhy, isCellEditable, isEnterStop, lineShort, lineValue, rowHasItem } from "../grn.state";
import type { GrnDraft, GrnLine } from "../grn.types";
import styles from "../page.module.scss";

const QTY_PATTERN = /^\d*(\.\d{0,3})?$/;
const RATE_PATTERN = /^\d*(\.\d{0,4})?$/;
const DATE_PATTERN = /^[0-9/.-]{0,10}$/;
const ANY_PATTERN = /^.{0,100}$/;

const CELL_COLUMN_ATTR = "data-grn-column";

export type GrnLineGridProps = {
  draft: GrnDraft;
  columns: GrnColumn[];
  /** Keys of lines the save refused, for the row tint. */
  problemKeys: ReadonlySet<string>;
  onActiveRow: (key: string) => void;
  onEdit: (key: string, column: number, raw: string) => void;
  onOpenItemPicker: (key: string, initialQuery: string) => void;
  /** A code scanned (or typed) into a blank line's Barcode and committed. */
  onScanBarcode: (key: string, code: string) => void;
  /** ↓ in a blank line's Barcode — the item list, searched for what was typed there. */
  onSearchItems: (key: string, typed: string) => void;
  /** A read-only cell was keyed into: say why. */
  onRefused: (why: string) => void;
  onGoToBlank: () => void;
  onRemoveLine: (key: string) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
};

function cellAttrs(line: GrnLine, column: number, stop: boolean) {
  return {
    [GRID_GRID_ATTR]: GRN_GRID_NAME,
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
  onActive,
  onCommit,
}: {
  line: GrnLine;
  column: number;
  stop: boolean;
  value: string;
  pattern: RegExp;
  align?: "right";
  placeholder?: string;
  numeric: boolean;
  onActive: () => void;
  onCommit: (raw: string) => void;
}) {
  // While focused the cell shows its own copy; otherwise the line's value, so a
  // load or a recalculation lands without an effect copying it in.
  const [editing, setEditing] = useState<string | null>(null);
  // Enter commits and then moves focus, so the old cell's blur runs against a
  // stale closure and would commit again; the refs keep that to one write.
  const committed = useRef(value);
  const textRef = useRef(value);

  const commit = () => {
    if (textRef.current !== committed.current) {
      committed.current = textRef.current;
      onCommit(textRef.current);
    }
  };

  return (
    <input
      {...cellAttrs(line, column, stop)}
      className={cx(quotationStyles.cellInput, align === "right" && quotationStyles.alignRight)}
      value={editing ?? value}
      placeholder={placeholder}
      autoComplete="off"
      inputMode={numeric ? "decimal" : undefined}
      // A batch number is kept as keyed, not title-cased.
      data-uppercase="off"
      onFocus={(event) => {
        textRef.current = value;
        committed.current = value;
        setEditing(value);
        onActive();
        event.currentTarget.select();
      }}
      onBlur={() => {
        commit();
        setEditing(null);
      }}
      onChange={(event) => {
        const next = event.target.value;
        if (pattern.test(next)) {
          textRef.current = next;
          setEditing(next);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          // The first Esc takes back what was typed; only an Esc with nothing
          // to undo reaches the screen (Close).
          if (textRef.current !== committed.current) {
            event.preventDefault();
            textRef.current = committed.current;
            setEditing(committed.current);
          }
          return;
        }
        if (event.key === "Enter" && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          commit();
          moveCellFocus(GRN_GRID_NAME, event.currentTarget, event.shiftKey ? -1 : 1);
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
  line: GrnLine;
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
            moveCellFocus(GRN_GRID_NAME, event.currentTarget, event.shiftKey ? -1 : 1);
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

/** Focus a line's first open cell: Barcode on a blank line, else Recd. */
export function focusGrnLine(line: GrnLine): boolean {
  if (!rowHasItem(line)) {
    return focusCell(GRN_GRID_NAME, line.key, String(COL.Barcode)) || focusCell(GRN_GRID_NAME, line.key, String(COL.Item));
  }
  return focusCell(GRN_GRID_NAME, line.key, String(COL.Recd));
}

export function GrnLineGrid(props: GrnLineGridProps) {
  const {
    draft,
    columns,
    problemKeys,
    onActiveRow,
    onEdit,
    onOpenItemPicker,
    onScanBarcode,
    onSearchItems,
    onRefused,
    onGoToBlank,
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
    if (next && !focusCell(GRN_GRID_NAME, next.key, field)) {
      focusGrnLine(next);
    }
    return true;
  };

  /** Alt+= / Alt+− anywhere; a bare + / − only on a cell that types neither. */
  const onRowLineKey = (event: ReactKeyboardEvent<HTMLTableRowElement>, line: GrnLine): boolean => {
    if (event.ctrlKey || event.metaKey) {
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
      onGoToBlank();
    } else if (line.key !== lastKey && rowHasItem(line)) {
      onRemoveLine(line.key);
    }
    return true;
  };

  /** A blank line takes nothing but a scan or an item pick (Qt edit predicate). */
  const onBlankRowMouseDown = (event: ReactMouseEvent<HTMLTableRowElement>, line: GrnLine) => {
    if (rowHasItem(line) || event.button !== 0 || !isCellEditable(draft, line, COL.Barcode)) {
      return;
    }
    const cell = (event.target as HTMLElement).closest<HTMLElement>(`[${CELL_COLUMN_ATTR}]`);
    const column = Number(cell?.getAttribute(CELL_COLUMN_ATTR));
    if (!cell || column === COL.Barcode || column === COL.Item) {
      return;
    }
    event.preventDefault();
    onActiveRow(line.key);
    focusGrnLine(line);
  };

  /** A cell that does not open: plain text, or — on a keyable line — a read-only input that SAYS why. */
  const readOnly = (line: GrnLine, column: number, value: string, className?: string) => {
    const why = cellReadOnlyWhy(draft, line, column);
    if (why) {
      return (
        <input
          {...cellAttrs(line, column, false)}
          className={cx(quotationStyles.cellInput, styles.cellReadOnly, className)}
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
              moveCellFocus(GRN_GRID_NAME, event.currentTarget, event.shiftKey ? -1 : 1);
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
    return <div className={cx(quotationStyles.cellText, className)}>{value || " "}</div>;
  };

  const renderCell = (line: GrnLine, column: number) => {
    const hasItem = rowHasItem(line);
    const open = isCellEditable(draft, line, column);
    const stop = open && isEnterStop(draft, line, column);
    const active = () => onActiveRow(line.key);
    const commit = (raw: string) => onEdit(line.key, column, raw);
    const spare = !hasItem && line.key === lastKey;

    const numberCell = (value: string, pattern: RegExp) =>
      open ? (
        <TextCell
          line={line}
          column={column}
          stop={stop}
          value={value}
          pattern={pattern}
          align="right"
          numeric
          onActive={active}
          onCommit={commit}
        />
      ) : (
        readOnly(line, column, value, quotationStyles.alignRight)
      );

    switch (column) {
      case COL.Barcode:
        return open ? (
          <BarcodeCell
            line={line}
            stop={stop}
            placeholder={spare ? "Scan, or type + ↓" : ""}
            onActive={active}
            onScan={(code) => onScanBarcode(line.key, code)}
            onSearch={(typed) => onSearchItems(line.key, typed)}
          />
        ) : (
          readOnly(line, column, line.barcode)
        );
      case COL.Item:
        if (!open) {
          return readOnly(line, column, line.itemName);
        }
        return (
          <input
            {...cellAttrs(line, column, stop)}
            {...{ [GRID_LOOKUP_ATTR]: "true" }}
            className={cx(quotationStyles.cellInput, styles.cellPlaceholder)}
            value={line.itemName}
            placeholder={spare ? "type to search the items" : ""}
            readOnly
            title={hasItem ? "Double-click (or F4) for another item" : "Type, or press Enter, for the item list"}
            onFocus={active}
            onDoubleClick={() => onOpenItemPicker(line.key, "")}
            onKeyDown={(event) => {
              if (event.ctrlKey || event.metaKey || event.altKey) {
                return;
              }
              if (event.key === "F4") {
                event.preventDefault();
                onOpenItemPicker(line.key, "");
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (!hasItem) {
                  onOpenItemPicker(line.key, "");
                } else {
                  moveCellFocus(GRN_GRID_NAME, event.currentTarget, event.shiftKey ? -1 : 1);
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
      case COL.Unit:
        return readOnly(line, column, line.unitName);
      case COL.PoRef:
        return readOnly(line, column, line.poRef);
      case COL.Pending:
        return readOnly(line, column, line.pending, quotationStyles.alignRight);
      case COL.Challan:
        return numberCell(line.challan, QTY_PATTERN);
      case COL.Recd:
        return numberCell(line.recd, QTY_PATTERN);
      case COL.Dmg:
        return numberCell(line.dmg, QTY_PATTERN);
      case COL.Free:
        return numberCell(line.free, QTY_PATTERN);
      case COL.Short: {
        const short = hasItem ? lineShort(line) : 0;
        return readOnly(line, column, short > 0 ? qtyText(short) : "", cx(quotationStyles.alignRight, styles.shortQty));
      }
      case COL.Rate:
        return numberCell(line.rate, RATE_PATTERN);
      case COL.Value:
        return readOnly(line, column, hasItem ? money(lineValue(line)) : "", quotationStyles.alignRight);
      case COL.Batch:
        return open ? (
          <TextCell
            line={line}
            column={column}
            stop={stop}
            value={line.batch}
            pattern={ANY_PATTERN}
            numeric={false}
            onActive={active}
            onCommit={commit}
          />
        ) : (
          readOnly(line, column, line.batch)
        );
      case COL.Expiry:
        return open ? (
          <TextCell
            line={line}
            column={column}
            stop={stop}
            value={line.expiry}
            pattern={DATE_PATTERN}
            placeholder={hasItem ? "dd/MM/yyyy" : ""}
            numeric={false}
            onActive={active}
            onCommit={commit}
          />
        ) : (
          readOnly(line, column, line.expiry)
        );
      case COL.Mrp:
        return numberCell(line.mrp, RATE_PATTERN);
      default:
        return null;
    }
  };

  return (
    <div className={cx(quotationStyles.gridViewport, styles.gridViewport)} tabIndex={-1} onContextMenu={onContextMenu}>
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
              className={cx(
                index % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven,
                problemKeys.has(line.key) && styles.problemRow,
              )}
              onMouseDown={(event) => onBlankRowMouseDown(event, line)}
              onKeyDown={(event) => {
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
