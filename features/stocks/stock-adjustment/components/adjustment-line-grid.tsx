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
 * server or the screen refused are tinted until they are fixed.
 *
 * Keys: Enter walks the layout's focus stops (the shared `grid-focus` walk);
 * ↑ / ↓ keep the column and change the line; Esc in a typed cell takes the
 * typing back; Enter on an outward line's batch cell, F2 or F12 picks from
 * stock; typing in the Item cell opens the item search; Alt+= / Alt+− add a
 * line above / remove the current one (the Qt grid's + / −, which a signed Qty
 * cell cannot give up).
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
import { isInward, rowHasItem, whyNotEditable } from "../stock-adjustment.state";
import type { AdjustmentDraft, AdjustmentLine } from "../stock-adjustment.types";
import styles from "../page.module.scss";

const QTY_PATTERN = /^[-+]?\d*(\.\d{0,3})?$/;
const MONEY_PATTERN = /^\d*(\.\d{0,6})?$/;

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
  onOpenPick: (key: string) => void;
  /** A refused cell was clicked: say why (or, an outward batch, pick). */
  onRefused: (key: string, column: number, why: string) => void;
  onInsertLine: (key: string) => void;
  onRemoveLine: (key: string) => void;
  /** Right-click: "Admin settings" — the layout's order, focus and visibility. */
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
};

function cellAttrs(line: AdjustmentLine, column: LineColumn) {
  return {
    [GRID_GRID_ATTR]: LINE_GRID_NAME,
    [GRID_ROW_ATTR]: line.key,
    [GRID_FIELD_ATTR]: String(column.no),
    ...(column.focus ? { [GRID_FOCUS_STOP_ATTR]: "true" } : {}),
  };
}

/** A typed cell: edits a local copy, commits on Enter or on leaving it (the delegate's editingFinished). */
function TextCell({
  line,
  column,
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
      {...cellAttrs(line, column)}
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

function SelectCell({
  line,
  column,
  value,
  options,
  onActive,
  onCommit,
}: {
  line: AdjustmentLine;
  column: LineColumn;
  value: string;
  options: { value: string; label: string }[];
  onActive: () => void;
  onCommit: (raw: string) => void;
}) {
  const known = options.some((option) => option.value === value);
  return (
    <select
      {...cellAttrs(line, column)}
      className={quotationStyles.cellSelect}
      value={value}
      onFocus={onActive}
      onChange={(event) => onCommit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          moveCellFocus(LINE_GRID_NAME, event.currentTarget, event.shiftKey ? -1 : 1);
        }
      }}
    >
      {!known ? (
        <option value={value} disabled>
          {value ? value : "—"}
        </option>
      ) : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
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
    onOpenPick,
    onRefused,
    onInsertLine,
    onRemoveLine,
    onContextMenu,
  } = props;
  const move = draft.kind === "Move";
  const reasonOptions = draft.reasons.map((reason) => ({ value: reason.id, label: reason.name }));
  const bucketOptions = BUCKETS.map((code) => ({ value: code, label: bucketLabel(code) }));
  const lastKey = draft.lines[draft.lines.length - 1]?.key;

  /**
   * ↑ / ↓ — the same column one line up or down (the typed cell commits as it
   * loses focus), else that line's item cell when the column is shut there —
   * the blank last line has nothing open but its item. A `<select>` keeps its
   * arrows: they choose its option.
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
      focusCell(LINE_GRID_NAME, next.key, String(COL.Description));
    }
    return true;
  };

  const onRowKeyDown = (event: ReactKeyboardEvent<HTMLTableRowElement>, line: AdjustmentLine) => {
    if (!editable || !event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    if (event.key === "=" || event.key === "+" || event.code === "Equal" || event.code === "NumpadAdd") {
      event.preventDefault();
      onInsertLine(line.key);
    } else if (event.key === "-" || event.code === "Minus" || event.code === "NumpadSubtract") {
      event.preventDefault();
      // Never the trailing blank "add new item" row — there is nothing on it.
      if (line.key !== lastKey && rowHasItem(line)) {
        onRemoveLine(line.key);
      }
    }
  };

  /**
   * A cell the editor refuses. On a line that can be keyed it is still a stop
   * the keyboard can reach — read-only, and an edit attempt (typing, a
   * double-click) SAYS why instead of doing nothing; Enter on an outward line's
   * batch cell picks from stock. Elsewhere it is plain text.
   */
  const refused = (line: AdjustmentLine, column: LineColumn, text: string, className?: string, why?: string) => {
    if (editable && rowHasItem(line) && why) {
      const pickOnEnter =
        column.no === COL.BatchNo && !isInward(draft.kind, line) && !line.lotId;
      return (
        <input
          {...cellAttrs(line, column)}
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
        {text || "\u00A0"}
      </div>
    );
  };

  const renderCell = (line: AdjustmentLine, column: LineColumn) => {
    const hasItem = rowHasItem(line);
    const why = editable ? whyNotEditable(draft, line, column.no) : "";
    const open = editable && hasItem && !why;
    const active = () => onActiveRow(line.key);
    const commit = (raw: string) => onEdit(line.key, column.no, raw);
    const outwardLotless =
      hasItem && !line.lotId && !line.batchNo.trim() && (line.direction === "OUT" || line.direction === "BOTH");

    switch (column.no) {
      case COL.LineNo:
        return (
          <div className={cx(quotationStyles.cellText, quotationStyles.alignCenter)}>
            {lineNos.get(line.key) ?? ""}
          </div>
        );
      case COL.Description: {
        if (!editable) {
          return refused(line, column, line.itemName);
        }
        const spare = !hasItem && line.key === lastKey;
        return (
          <input
            {...cellAttrs(line, column)}
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
          return <TextCell line={line} column={column} value={line.batchNo} onActive={active} onCommit={commit} />;
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
        if (open) {
          return (
            <SelectCell
              line={line}
              column={column}
              value={code}
              options={bucketOptions}
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
        if (open) {
          const options =
            line.reasonId && !reasonOptions.some((option) => option.value === line.reasonId)
              ? [...reasonOptions, { value: line.reasonId, label: line.reasonName || line.reasonId }]
              : reasonOptions;
          return (
            <SelectCell
              line={line}
              column={column}
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
      case COL.Barcode:
        return <div className={quotationStyles.cellText}>{line.barcode}</div>;
      default:
        return null;
    }
  };

  return (
    <div className={cx(quotationStyles.gridViewport, styles.gridViewport)} onContextMenu={onContextMenu}>
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
                onKeyDown={(event) => {
                  if ((event.key === "F2" || event.key === "F12") && editable) {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpenPick(line.key);
                    return;
                  }
                  if (onRowArrow(event, index)) {
                    return;
                  }
                  onRowKeyDown(event, line);
                }}
              >
                {columns.map((column) => (
                  <td key={column.no}>{renderCell(line, column)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
