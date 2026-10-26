"use client";

/**
 * The line grid — ui_table 41, the Qt `NexTable` + `StockAdjustmentDelegate`.
 *
 * Which cells open depends on the LINE, not the column: an outward line's
 * batch comes from the holding it was picked from, an inward line's is keyed;
 * cost is the branch average going out and a typed figure coming in only under
 * MANUAL. That judgement is the screen's (`whyNotEditable`), so a refused cell
 * is drawn as plain text that SAYS why when it is clicked — never a dead cell.
 *
 * Painting: the Dir cell is a chip (OUT red, IN green, ± violet for a BOTH
 * reason not yet signed, MOVE amber), a positive Qty reads "+2", and rows the
 * server or the screen refused are tinted until they are fixed. Reason, Bucket
 * and To open a list: an editable one shows a ▾ at its right edge and a muted
 * "Select…" while blank (user, 2026-10-24) — never a locked one, whose arrow
 * would promise a list that refuses to open. On a move the bucket keeps its
 * chip colour under the ▾.
 *
 * ── Keys (as on Opening Stock, user 2026-10-24) ──────────────────────────
 * Barcode leads the keyed kinds: scan and Enter, or type a name and press ↓ —
 * the item list opens searched for it and the typed text is never resolved as
 * a code. Enter walks the screen's own stops (`isEnterStop`): Barcode and Item
 * on a blank line; Batch, Expiry, MRP, To, Qty and Cost where the line takes
 * them, then the next line. Reason and Remarks stay editable by click. ↑ / ↓
 * keep the column and change the line; Esc in a typed cell takes the typing
 * back; F12 (and Enter on an outward line's batch cell) picks from stock; + / −
 * add a line above / remove the current one on a cell that types neither
 * (Alt+= / Alt+− anywhere — a signed Qty cell cannot give them up); Tab leaves
 * the grid. A click on a blank line anywhere but its Barcode / Item lands on
 * its Barcode (its Item on a move, which has none).
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
import { BUCKETS, bucketLabel, COL, LINE_GRID_NAME } from "../stock-adjustment.constants";
import type { LineColumn } from "../stock-adjustment.columns";
import { cellNumber, money, qtyCell } from "../stock-adjustment.format";
import {
  blankLineEntryColumn,
  isEnterStop,
  isInward,
  listCellPlaceholder,
  rowHasItem,
  showsListArrow,
  whyNotEditable,
} from "../stock-adjustment.state";
import type { AdjustmentDraft, AdjustmentLine } from "../stock-adjustment.types";
import styles from "../page.module.scss";

const QTY_PATTERN = /^[-+]?\d*(\.\d{0,3})?$/;
const MONEY_PATTERN = /^\d*(\.\d{0,6})?$/;

/** The viewport's marker — what Tab leaves and what a read-only document focuses. */
export const LINE_GRID_VIEWPORT_ATTR = "data-stock-adjustment-viewport";

/** The td attribute naming its column — what a click on a blank line reads. */
const CELL_COLUMN_ATTR = "data-sa-column";

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Tab — leave the grid (Qt `leaveGrid()`): the next focusable thing after the
 * grid's viewport, or the last one before it on Shift+Tab, rather than the
 * next of the grid's own cells. The cell commits on the way out (blur).
 */
function leaveGrid(from: HTMLElement, forward: boolean): boolean {
  const viewport = from.closest<HTMLElement>(`[${LINE_GRID_VIEWPORT_ATTR}]`);
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

/** The read-only document's cursor: the grid itself (Qt `grid->setFocus()`). */
export function focusLineGrid(): boolean {
  const viewport = document.querySelector<HTMLElement>(`[${LINE_GRID_VIEWPORT_ATTR}]`);
  viewport?.focus();
  return Boolean(viewport);
}

/** A blank line's entry cell — its Barcode, or its Item on a move (or a layout without Barcode). */
export function focusBlankLineEntry(key: string, column: number): boolean {
  return focusCell(LINE_GRID_NAME, key, String(column)) || focusCell(LINE_GRID_NAME, key, String(COL.Description));
}

export type AdjustmentLineGridProps = {
  draft: AdjustmentDraft;
  columns: LineColumn[];
  lineNos: Map<string, number>;
  problemKeys: ReadonlySet<string>;
  problemText: ReadonlyMap<string, string>;
  remarksRequired: ReadonlySet<string>;
  hints: ReadonlyMap<string, string>;
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
  /** A refused cell was clicked: say why (or, an outward batch, pick). */
  onRefused: (key: string, column: number, why: string) => void;
  onInsertLine: (key: string) => void;
  onRemoveLine: (key: string) => void;
  /** Right-click: "Admin settings" — the layout's order and visibility. */
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
};

function cellAttrs(line: AdjustmentLine, column: LineColumn, stop: boolean) {
  return {
    [GRID_GRID_ATTR]: LINE_GRID_NAME,
    [GRID_ROW_ATTR]: line.key,
    [GRID_FIELD_ATTR]: String(column.no),
    ...(stop ? { [GRID_FOCUS_STOP_ATTR]: "true" } : {}),
  };
}

/**
 * + / − as line keys (the Qt grid's). With Alt, by the physical key too —
 * Alt+= reads differently on some layouts; bare, only the characters.
 */
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

/** A typed cell: edits a local copy, commits on Enter or on leaving it (the delegate's editingFinished). */
function TextCell({
  line,
  column,
  stop,
  value,
  display,
  pattern,
  align,
  placeholder,
  className,
  title,
  onActive,
  onCommit,
  onEnter,
}: {
  line: AdjustmentLine;
  column: LineColumn;
  stop: boolean;
  value: string;
  display?: string;
  pattern?: RegExp;
  align?: "right" | "center";
  placeholder?: string;
  className?: string;
  title?: string;
  onActive: () => void;
  onCommit: (raw: string) => void;
  onEnter?: () => boolean;
}) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const committed = useRef(value);

  useEffect(() => {
    if (!focused) {
      setText(value);
      committed.current = value;
    }
  }, [focused, value]);

  const commit = () => {
    if (text !== committed.current) {
      committed.current = text;
      onCommit(text);
    }
  };

  return (
    <input
      {...cellAttrs(line, column, stop)}
      className={cx(
        quotationStyles.cellInput,
        align === "right" && quotationStyles.alignRight,
        align === "center" && quotationStyles.alignCenter,
        className,
      )}
      value={focused ? text : display ?? value}
      placeholder={placeholder}
      title={title}
      autoComplete="off"
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
        if (!pattern || pattern.test(next)) {
          setText(next);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          // The first Esc takes back what was typed; only an Esc with nothing
          // to undo reaches the screen (Close).
          if (text !== committed.current) {
            event.preventDefault();
            setText(committed.current);
          }
          return;
        }
        // Ctrl+Enter is the screen's Save & Post: it goes through (the shared
        // keys blur this cell first, which commits it).
        if (event.key === "Enter" && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          commit();
          if (onEnter?.()) {
            return;
          }
          moveCellFocus(LINE_GRID_NAME, event.currentTarget, event.shiftKey ? -1 : 1);
        }
      }}
    />
  );
}

/**
 * The Barcode cell of a line with no item yet — the scan field AND the item
 * search (Qt delegate `nexBarcodeRow`). Enter (or leaving it) hands the code
 * over to be resolved; ↓ hands the typed text to the item list instead and
 * DROPS it, so the focus leaving for the list commits nothing as a code (the
 * Opening Stock GridCell's `dropBufferOnKeys`). The text is read from a ref: the
 * blur that follows ↓ fires before React has re-rendered the cleared state.
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
  line: AdjustmentLine;
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
  /** Hands the typed code over and empties the cell. False when there was none. */
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
          // Enter is the BARCODE check: a resolved scan lands on the line's Qty
          // (or its lot) itself. A blank cell steps on to Item.
          event.preventDefault();
          if (!handOff()) {
            moveCellFocus(LINE_GRID_NAME, event.currentTarget, event.shiftKey ? -1 : 1);
          }
          return;
        }
        if (event.key === "ArrowDown" && !modified && !event.shiftKey) {
          // The item SEARCH: the text goes to the list, not to the row below.
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

/**
 * A list cell (Reason, Bucket, To) open for a choice: the ▾ at its right edge
 * and, while blank, a muted placeholder. On a move the chosen bucket keeps its
 * chip colour.
 */
function ListCell({
  line,
  column,
  stop,
  value,
  options,
  chipClass,
  onActive,
  onCommit,
}: {
  line: AdjustmentLine;
  column: LineColumn;
  stop: boolean;
  value: string;
  options: { value: string; label: string }[];
  chipClass?: string;
  onActive: () => void;
  onCommit: (raw: string) => void;
}) {
  const blank = value === "";
  const known = options.some((option) => option.value === value);
  return (
    <span className={cx(styles.listCell, chipClass && styles.listChip, chipClass)}>
      <select
        {...cellAttrs(line, column, stop)}
        className={cx(quotationStyles.cellSelect, styles.listSelect, blank && styles.listSelectBlank)}
        value={value}
        onFocus={onActive}
        onChange={(event) => onCommit(event.target.value)}
        onKeyDown={(event) => {
          // Ctrl+Enter goes through to the screen (Save & Post).
          if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            moveCellFocus(LINE_GRID_NAME, event.currentTarget, event.shiftKey ? -1 : 1);
          }
        }}
      >
        {blank ? (
          <option value="" disabled hidden>
            {listCellPlaceholder(column.no)}
          </option>
        ) : null}
        {!blank && !known ? (
          <option value={value} disabled>
            {value}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className={styles.dropArrow} aria-hidden="true">
        ▾
      </span>
    </span>
  );
}

function Chip({ direction }: { direction: string }) {
  const map: Record<string, { text: string; className: string }> = {
    OUT: { text: "OUT", className: styles.chipOut },
    IN: { text: "IN", className: styles.chipIn },
    BOTH: { text: "±", className: styles.chipBoth },
    MOVE: { text: "MOVE", className: styles.chipMove },
  };
  const chip = map[direction];
  return chip ? <span className={cx(styles.chip, chip.className)}>{chip.text}</span> : null;
}

function bucketChipClass(code: string): string {
  if (code === "SALEABLE") {
    return styles.bucketSaleable;
  }
  if (code === "DAMAGED") {
    return styles.bucketDamaged;
  }
  return styles.bucketOther;
}

export function AdjustmentLineGrid(props: AdjustmentLineGridProps) {
  const {
    draft,
    columns,
    lineNos,
    problemKeys,
    problemText,
    remarksRequired,
    hints,
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
  const move = draft.kind === "Move";
  const entryColumn = blankLineEntryColumn(draft.kind);
  const reasonOptions = draft.reasons.map((reason) => ({ value: reason.id, label: reason.name }));
  const bucketOptions = BUCKETS.map((code) => ({ value: code, label: bucketLabel(code) }));
  const lastKey = draft.lines[draft.lines.length - 1]?.key;

  /**
   * ↑ / ↓ — the same column one line up or down (the typed cell commits as it
   * loses focus), else that line's entry cell when the column is shut there —
   * the blank last line has nothing open but its Barcode and Item. A `<select>`
   * keeps its arrows: they choose its option.
   */
  const onRowArrow = (event: ReactKeyboardEvent<HTMLTableRowElement>, index: number): boolean => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return false;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return false;
    }
    const target = event.target as HTMLElement;
    const field = target.getAttribute(GRID_FIELD_ATTR);
    if (!field || target instanceof HTMLSelectElement) {
      return false;
    }
    event.preventDefault();
    const next = draft.lines[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (next && !focusCell(LINE_GRID_NAME, next.key, field)) {
      focusBlankLineEntry(next.key, entryColumn);
    }
    return true;
  };

  /**
   * The line keys. Alt+= / Alt+− anywhere; a bare + / − only on a cell that
   * types neither — the Item cell, a list, a read-only cell — since Qty is
   * signed and a batch label carries a dash.
   */
  const onRowLineKey = (event: ReactKeyboardEvent<HTMLTableRowElement>, line: AdjustmentLine): boolean => {
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
      // Never the trailing blank "add new item" row — there is nothing on it.
      onRemoveLine(line.key);
    }
    return true;
  };

  /**
   * A blank line takes nothing but a scan or an item pick: a click (or a
   * double-click) anywhere else on it lands on its Barcode — its Item on a
   * move (Qt `eventFilter`, user 2026-10-24). Its other cells are plain text,
   * never disabled inputs, so the row sees the click.
   */
  const onBlankRowMouseDown = (event: ReactMouseEvent<HTMLTableRowElement>, line: AdjustmentLine) => {
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
    focusBlankLineEntry(line.key, entryColumn);
  };

  /**
   * A cell the editor refuses. On a line that can be keyed it is still a cell
   * the keyboard can reach — read-only, and an edit attempt (typing, a
   * double-click) SAYS why instead of doing nothing; Enter on an outward line's
   * batch cell picks from stock. Elsewhere it is plain text.
   */
  const refused = (line: AdjustmentLine, column: LineColumn, text: string, className?: string, why?: string) => {
    if (editable && rowHasItem(line) && why) {
      const pickOnEnter = column.no === COL.BatchNo && !isInward(draft.kind, line) && !line.lotId;
      return (
        <input
          {...cellAttrs(line, column, false)}
          className={cx(quotationStyles.cellInput, styles.cellReadOnly, className)}
          value={text}
          title={why}
          readOnly
          tabIndex={-1}
          onFocus={() => onActiveRow(line.key)}
          onDoubleClick={() => onRefused(line.key, column.no, why)}
          onKeyDown={(event) => {
            if (event.ctrlKey || event.metaKey || event.altKey) {
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (pickOnEnter) {
                onOpenPick(line.key);
                return;
              }
              moveCellFocus(LINE_GRID_NAME, event.currentTarget, event.shiftKey ? -1 : 1);
              return;
            }
            if (lineKeyOf(event)) {
              return; // a line key — the row's
            }
            if (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete") {
              event.preventDefault();
              onRefused(line.key, column.no, why);
            }
          }}
        />
      );
    }
    return (
      <div className={cx(quotationStyles.cellText, className)} title={why || undefined}>
        {text || " "}
      </div>
    );
  };

  const renderCell = (line: AdjustmentLine, column: LineColumn) => {
    const hasItem = rowHasItem(line);
    const why = editable ? whyNotEditable(draft, line, column.no) : "";
    const open = editable && hasItem && !why;
    const stop = editable && isEnterStop(draft, line, column.no);
    const active = () => onActiveRow(line.key);
    const commit = (raw: string) => onEdit(line.key, column.no, raw);
    const spare = !hasItem && line.key === lastKey;
    const outwardLotless =
      hasItem && !line.lotId && !line.batchNo.trim() && (line.direction === "OUT" || line.direction === "BOTH");

    switch (column.no) {
      case COL.LineNo:
        return (
          <div className={cx(quotationStyles.cellText, quotationStyles.alignCenter)}>
            {lineNos.get(line.key) ?? ""}
          </div>
        );
      case COL.Barcode: {
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
      }
      case COL.Description: {
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
                return; // a line key — the row's
              }
              if (event.key.length === 1 && event.key !== " ") {
                event.preventDefault();
                onOpenItemPicker(line.key, event.key);
              }
            }}
          />
        );
      }
      case COL.BatchNo: {
        if (open) {
          return (
            <TextCell
              line={line}
              column={column}
              stop={stop}
              value={line.batchNo}
              onActive={active}
              onCommit={commit}
            />
          );
        }
        if (outwardLotless) {
          return refused(line, column, "auto · FEFO", styles.cellAuto, why);
        }
        return refused(line, column, line.batchNo, undefined, why);
      }
      case COL.ExpiryDate:
      case COL.MfgDate: {
        const value = column.no === COL.ExpiryDate ? line.expiryDate : line.mfgDate;
        if (open) {
          return (
            <TextCell
              line={line}
              column={column}
              stop={stop}
              value={value}
              align="center"
              placeholder="dd-MM-yyyy"
              onActive={active}
              onCommit={commit}
            />
          );
        }
        if (column.no === COL.ExpiryDate && outwardLotless && !value) {
          return refused(line, column, "—", cx(quotationStyles.alignCenter, styles.cellMuted), why);
        }
        return refused(line, column, value, quotationStyles.alignCenter, why);
      }
      case COL.Mrp: {
        const shown = line.mrp !== null && line.mrp > 0 ? money(line.mrp) : "";
        if (open) {
          return (
            <TextCell
              line={line}
              column={column}
              stop={stop}
              value={line.mrp !== null ? String(line.mrp) : ""}
              display={shown}
              pattern={MONEY_PATTERN}
              align="right"
              onActive={active}
              onCommit={commit}
            />
          );
        }
        return refused(line, column, shown, quotationStyles.alignRight, why);
      }
      case COL.SupplierName:
        return refused(line, column, line.supplierName, undefined, hasItem ? why : "");
      case COL.Bucket:
      case COL.ToBucket: {
        const code = column.no === COL.Bucket ? line.bucket : line.toBucket;
        if (showsListArrow(draft, line, column.no)) {
          return (
            <ListCell
              line={line}
              column={column}
              stop={stop}
              value={code}
              options={bucketOptions}
              chipClass={move && code ? bucketChipClass(code) : undefined}
              onActive={active}
              onCommit={commit}
            />
          );
        }
        if (move && code) {
          return (
            <div className={quotationStyles.cellText} title={why || undefined}>
              <span className={cx(styles.bucketChip, bucketChipClass(code))}>{bucketLabel(code)}</span>
            </div>
          );
        }
        return refused(line, column, bucketLabel(code), undefined, why);
      }
      case COL.Arrow:
        return <div className={cx(quotationStyles.cellText, styles.arrowCell)}>{hasItem ? "→" : ""}</div>;
      case COL.Available:
        return (
          <div className={cx(quotationStyles.cellText, quotationStyles.alignCenter)}>
            {hasItem && line.available !== null ? qtyCell(line.available) : ""}
          </div>
        );
      case COL.Qty: {
        const qty = cellNumber(line.qty);
        // "+2" for stock coming in, so the column reads as a signed ledger.
        const shown =
          line.qty && qty > 0 && !line.qty.startsWith("+") && line.direction !== "MOVE" ? `+${line.qty}` : line.qty;
        if (open) {
          return (
            <TextCell
              line={line}
              column={column}
              stop={stop}
              value={line.qty}
              display={shown}
              pattern={QTY_PATTERN}
              align="center"
              onActive={active}
              onCommit={commit}
            />
          );
        }
        return refused(line, column, shown, quotationStyles.alignCenter, why);
      }
      case COL.UomName:
        return <div className={quotationStyles.cellText}>{line.uomName}</div>;
      case COL.BaseQty:
        return (
          <div className={cx(quotationStyles.cellText, quotationStyles.alignCenter)}>
            {hasItem && line.baseQty !== null ? qtyCell(line.baseQty) : ""}
          </div>
        );
      case COL.CostRate: {
        // Shown to 2 decimals; the line keeps the full numeric(18,6) average.
        const shown = hasItem && line.costRate !== null ? formatCurrency(line.costRate, 2, true) : "";
        // Outward cost is the engine's (branch average) — shown, not keyed.
        const grey = line.direction === "OUT" || line.direction === "MOVE";
        if (open) {
          return (
            <TextCell
              line={line}
              column={column}
              stop={stop}
              value={line.costRate !== null ? String(line.costRate) : ""}
              display={shown}
              pattern={MONEY_PATTERN}
              align="right"
              onActive={active}
              onCommit={commit}
            />
          );
        }
        return refused(line, column, shown, cx(quotationStyles.alignRight, grey && styles.cellMuted), why);
      }
      case COL.Value:
        return (
          <div className={cx(quotationStyles.cellText, quotationStyles.alignRight)}>
            {hasItem && line.value !== null ? formatCurrency(line.value, 2, true) : ""}
          </div>
        );
      case COL.ReasonName: {
        if (showsListArrow(draft, line, column.no)) {
          const options =
            line.reasonId && !reasonOptions.some((option) => option.value === line.reasonId)
              ? [...reasonOptions, { value: line.reasonId, label: line.reasonName || line.reasonId }]
              : reasonOptions;
          return (
            <ListCell
              line={line}
              column={column}
              stop={stop}
              value={line.reasonId}
              options={options}
              onActive={active}
              onCommit={commit}
            />
          );
        }
        return refused(line, column, line.reasonName, undefined, why);
      }
      case COL.Remarks: {
        const required = remarksRequired.has(line.key) && !line.remarks.trim();
        if (open) {
          return (
            <TextCell
              line={line}
              column={column}
              stop={stop}
              value={line.remarks}
              placeholder={required ? (line.reasonName ? `required by ${line.reasonName}` : "required by this reason") : ""}
              className={required ? styles.cellRequired : undefined}
              onActive={active}
              onCommit={commit}
            />
          );
        }
        return refused(line, column, line.remarks, undefined, why);
      }
      case COL.Direction:
        return (
          <div className={cx(quotationStyles.cellText, styles.chipCell)}>
            {hasItem ? <Chip direction={line.direction} /> : null}
          </div>
        );
      case COL.Hint: {
        const hint = hints.get(line.key) ?? "";
        return (
          <div
            className={cx(quotationStyles.cellText, styles.hintCell, hint.startsWith("⚠") && styles.hintWarn)}
            title={hint || undefined}
          >
            {hint}
          </div>
        );
      }
      case COL.LotId:
        return <div className={quotationStyles.cellText}>{line.lotId}</div>;
      case COL.ItemCode:
        return <div className={quotationStyles.cellText}>{line.itemCode}</div>;
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
                  // F12 — Pick from stock for this line (F2 is Edit on every screen).
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
