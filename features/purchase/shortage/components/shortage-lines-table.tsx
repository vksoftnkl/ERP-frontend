"use client";

/**
 * The line grid — ui_table 61, the Qt `NexTable` + `PurchaseInvoiceDelegate`
 * with `ShortageReceiptCols`. One row = one open shortage (a new receipt) or
 * one saved line. Received, Batch, Expiry and MRP are keyed on a draft; the
 * rest is the shortage's own. Short is red while anything is short; Value is a
 * preview (Received × cost).
 *
 * Keys: Enter walks the Focus columns (Received and Batch unless the layout
 * flags others) and steps to the next row; ↑ / ↓ keep the column and change the
 * row; Esc on a cell puts back what it held. A click or the cursor on a row
 * makes it the row Supplier CN… / Write off… / Undo close… act on.
 */
import { useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { moveCellFocus } from "@/features/sales/quotation/components/grid-focus";
import {
  GRID_FIELD_ATTR,
  GRID_FOCUS_STOP_ATTR,
  GRID_GRID_ATTR,
  GRID_ROW_ATTR,
} from "@/features/sales/quotation/quotation.constants";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { money, qtyText } from "../../shared/purchase.format";
import { BATCH_MAX_LENGTH, COL, LINE_GRID_NAME, NUMBER_COLUMNS } from "../shortage.constants";
import { lineValue, reasonText, type LineColumn, type LinePatch } from "../shortage.state";
import type { ShortageLine } from "../shortage.types";
import styles from "../page.module.scss";

const QTY_PATTERN = /^\d*\.?\d{0,3}$/;
const MRP_PATTERN = /^\d*\.?\d{0,2}$/;
const DATE_PATTERN = /^[\d/-]{0,10}$/;

type CellKind = { field: keyof LinePatch; pattern?: RegExp; upper?: boolean; maxLength?: number; placeholder?: string };

const KEYED: Readonly<Partial<Record<number, CellKind>>> = {
  [COL.Received]: { field: "received", pattern: QTY_PATTERN },
  [COL.Batch]: { field: "batch", upper: true, maxLength: BATCH_MAX_LENGTH },
  [COL.Expiry]: { field: "expiry", pattern: DATE_PATTERN, placeholder: "dd/MM/yyyy" },
  [COL.Mrp]: { field: "mrp", pattern: MRP_PATTERN },
};

/**
 * One keyed cell: what is typed is held here and committed on blur or Enter.
 * Read through refs — Enter commits and moves focus, so this cell's blur runs
 * with the render's closure and must still see what was typed (the Enter
 * double-fire of Qt 74b755c's port).
 */
function KeyedCell({
  lineKey,
  column,
  kind,
  value,
  focusStop,
  numeric,
  onCommit,
  onFocusRow,
}: {
  lineKey: string;
  column: number;
  kind: CellKind;
  value: string;
  focusStop: boolean;
  numeric: boolean;
  onCommit: (text: string) => void;
  onFocusRow: () => void;
}) {
  // null = not being keyed: the cell shows the draft's value.
  const [text, setText] = useState<string | null>(null);
  const typed = useRef(value);
  const committed = useRef(value);

  const commit = () => {
    if (typed.current !== committed.current) {
      committed.current = typed.current;
      onCommit(typed.current.trim());
    }
  };

  return (
    <input
      {...{
        [GRID_GRID_ATTR]: LINE_GRID_NAME,
        [GRID_ROW_ATTR]: lineKey,
        [GRID_FIELD_ATTR]: String(column),
        ...(focusStop ? { [GRID_FOCUS_STOP_ATTR]: "" } : {}),
      }}
      className={cx(quotationStyles.cellInput, numeric && quotationStyles.alignRight)}
      value={text ?? value}
      maxLength={kind.maxLength}
      placeholder={kind.placeholder}
      inputMode={numeric ? "decimal" : undefined}
      autoComplete="off"
      data-uppercase={kind.upper || numeric || kind.pattern ? "off" : undefined}
      onFocus={(event) => {
        typed.current = value;
        committed.current = value;
        setText(value);
        onFocusRow();
        event.currentTarget.select();
      }}
      onBlur={() => {
        commit();
        setText(null);
      }}
      onChange={(event) => {
        const next = kind.upper ? event.target.value.toUpperCase() : event.target.value;
        if (!kind.pattern || kind.pattern.test(next)) {
          typed.current = next;
          setText(next);
        }
      }}
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) {
          return;
        }
        if (event.key === "Escape" && typed.current !== committed.current) {
          event.preventDefault();
          event.stopPropagation();
          typed.current = committed.current;
          setText(committed.current);
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          moveCellFocus(LINE_GRID_NAME, event.currentTarget, event.shiftKey ? -1 : 1);
          return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const cells = Array.from(
            document.querySelectorAll<HTMLInputElement>(
              `[${GRID_GRID_ATTR}="${LINE_GRID_NAME}"][${GRID_FIELD_ATTR}="${column}"]`,
            ),
          );
          const at = cells.indexOf(event.currentTarget);
          const target = cells[at + (event.key === "ArrowDown" ? 1 : -1)];
          if (target) {
            commit();
            target.focus();
          }
        }
      }}
    />
  );
}

export type ShortageLinesTableProps = {
  lines: readonly ShortageLine[];
  columns: readonly LineColumn[];
  editable: boolean;
  activeKey: string;
  problemKeys: ReadonlySet<string>;
  emptyText: string;
  onEdit: (key: string, patch: LinePatch) => void;
  onSelect: (key: string) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
};

export function ShortageLinesTable({
  lines,
  columns,
  editable,
  activeKey,
  problemKeys,
  emptyText,
  onEdit,
  onSelect,
  onContextMenu,
}: ShortageLinesTableProps) {
  const renderCell = (line: ShortageLine, column: LineColumn) => {
    const kind = KEYED[column.no];
    const numeric = NUMBER_COLUMNS.has(column.no);
    if (kind && editable && line.shortageId) {
      return (
        <KeyedCell
          lineKey={line.key}
          column={column.no}
          kind={kind}
          value={line[kind.field]}
          focusStop={column.focus}
          numeric={numeric}
          onCommit={(value) => onEdit(line.key, { [kind.field]: value })}
          onFocusRow={() => onSelect(line.key)}
        />
      );
    }
    let shown = "";
    switch (column.no) {
      case COL.Source:
        shown = line.source;
        break;
      case COL.Reason:
        shown = reasonText(line.reason);
        break;
      case COL.Item:
        shown = line.itemName;
        break;
      case COL.Unit:
        shown = line.unitName;
        break;
      case COL.Short:
        shown = line.shortQty === null ? "" : qtyText(line.shortQty);
        break;
      case COL.Received:
        shown = line.received;
        break;
      case COL.Batch:
        shown = line.batch;
        break;
      case COL.Expiry:
        shown = line.expiry;
        break;
      case COL.Mrp:
        shown = line.mrp;
        break;
      case COL.Cost:
        shown = line.cost.toFixed(2);
        break;
      case COL.Value: {
        const value = lineValue(line);
        shown = value === null ? "" : money(value);
        break;
      }
      default:
        shown = "";
    }
    const short = column.no === COL.Short && line.shortQty !== null && line.shortQty > 0;
    return (
      <div
        className={cx(quotationStyles.cellText, numeric && quotationStyles.alignRight, short && styles.shortText)}
        title={column.no === COL.Item && line.unitName ? `${line.itemName} · ${line.unitName}` : undefined}
      >
        {shown}
      </div>
    );
  };

  return (
    <div className={cx(quotationStyles.gridViewport, styles.gridViewport)} onContextMenu={onContextMenu}>
      <table className={cx(quotationStyles.grid, styles.lineGrid)}>
        <colgroup>
          <col style={{ width: "3%" }} />
          {columns.map((column) => (
            <col key={column.no} style={{ width: `${column.widthPct * 0.97}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col">#</th>
            {columns.map((column) => (
              <th key={column.no} scope="col" className={NUMBER_COLUMNS.has(column.no) ? styles.num : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} className={styles.emptyRow}>
                {emptyText}
              </td>
            </tr>
          ) : (
            lines.map((line, index) => (
              <tr
                key={line.key}
                className={cx(
                  index % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven,
                  line.key === activeKey && styles.activeRow,
                  problemKeys.has(line.key) && styles.problemRow,
                )}
                aria-selected={line.key === activeKey}
                onMouseDown={() => onSelect(line.key)}
              >
                <td className={styles.rowNo}>{index + 1}</td>
                {columns.map((column) => (
                  <td key={column.no}>{renderCell(line, column)}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
