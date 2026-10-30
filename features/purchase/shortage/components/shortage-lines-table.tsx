"use client";

/**
 * The line grid — Qt `ShortageReceiptCols` (16 columns, laid out locally to the
 * approved mockup; ui_table 61 is not loaded): ✓ · From · Date · Age · Item ·
 * Why · Short · Recd · Closed · Open · Receive now · Batch / Serial · Expiry ·
 * Cost · GST held · Outcome. One row = one open shortage (a new receipt) or one
 * saved line.
 *
 * Keys: Space on the tick or in Receive now ticks / unticks the row (a tick
 * receives the open qty); Enter walks Receive now → Batch → Expiry and on to the
 * next row; ↑ / ↓ keep the column and change the row; Esc on a cell puts back
 * what it held. A click or the cursor on a row makes it the current one (F12,
 * Close row… with nothing ticked).
 */
import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { DateInput } from "@/components/design-system/ui";
import { moveCellFocus } from "@/features/sales/quotation/components/grid-focus";
import { GRID_FIELD_ATTR, GRID_FOCUS_STOP_ATTR, GRID_GRID_ATTR, GRID_ROW_ATTR } from "@/features/sales/quotation/quotation.constants";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { PurchaseCheckChip } from "../../shared/components/purchase-parts";
import { money, qtyText, isoFromTyped } from "../../shared/purchase.format";
import { BATCH_MAX_LENGTH, COL, COLUMNS, LINE_GRID_NAME, type ColumnNo } from "../shortage.constants";
import { batchCellText, displayDate, isSerial, isSplit, outcomeChips, type LinePatch } from "../shortage.state";
import type { ShortageLine } from "../shortage.types";
import styles from "../page.module.scss";

const QTY_PATTERN = /^\d*\.?\d{0,3}$/;
const TOTAL_WEIGHT = COLUMNS.reduce((sum, column) => sum + column.weight, 0);

function cellAttrs(lineKey: string, column: number) {
  return {
    [GRID_GRID_ATTR]: LINE_GRID_NAME,
    [GRID_ROW_ATTR]: lineKey,
    [GRID_FIELD_ATTR]: String(column),
    [GRID_FOCUS_STOP_ATTR]: "",
  };
}

/** ↑ / ↓: the same column, the row above / below. */
function stepRow(event: ReactKeyboardEvent<HTMLInputElement>, column: number): boolean {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
    return false;
  }
  const cells = Array.from(
    document.querySelectorAll<HTMLInputElement>(`[${GRID_GRID_ATTR}="${LINE_GRID_NAME}"][${GRID_FIELD_ATTR}="${column}"]`),
  );
  const target = cells[cells.indexOf(event.currentTarget) + (event.key === "ArrowDown" ? 1 : -1)];
  if (target) {
    event.preventDefault();
    target.focus();
    return true;
  }
  return false;
}

/**
 * One typed cell (Receive now, Batch): held here, committed on blur or Enter.
 * Read through refs — Enter commits and moves focus, so the blur runs with the
 * render's closure and must still see what was typed.
 */
function KeyedCell({
  lineKey,
  column,
  value,
  numeric,
  upper,
  boxTone,
  onCommit,
  onFocusRow,
  onSpace,
}: {
  lineKey: string;
  column: number;
  value: string;
  numeric?: boolean;
  upper?: boolean;
  boxTone?: boolean;
  onCommit: (text: string) => void;
  onFocusRow: () => void;
  onSpace?: () => void;
}) {
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
      {...cellAttrs(lineKey, column)}
      className={cx(quotationStyles.cellInput, styles.boxedCell, boxTone && styles.boxedCurrent, numeric && quotationStyles.alignRight)}
      value={text ?? value}
      maxLength={upper ? BATCH_MAX_LENGTH : undefined}
      inputMode={numeric ? "decimal" : undefined}
      autoComplete="off"
      data-uppercase="off"
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
        const next = upper ? event.target.value.toUpperCase() : event.target.value;
        if (!numeric || QTY_PATTERN.test(next)) {
          typed.current = next;
          setText(next);
        }
      }}
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) {
          return;
        }
        if (event.key === " " && onSpace) {
          event.preventDefault();
          onSpace();
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
          commit();
          stepRow(event, column);
        }
      }}
    />
  );
}

export type ShortageLinesTableProps = {
  lines: readonly ShortageLine[];
  /** A DRAFT open for keying. */
  editable: boolean;
  /** The receipt is a DRAFT (saved or new): ticks and the "serials — F12" text. */
  isDraft: boolean;
  activeKey: string;
  problemKeys: ReadonlySet<string>;
  emptyText: string;
  onTick: (key: string, on?: boolean) => void;
  onReceive: (key: string, typed: string) => void;
  onEdit: (key: string, patch: LinePatch) => void;
  onSelect: (key: string) => void;
};

export function ShortageLinesTable({
  lines,
  editable,
  isDraft,
  activeKey,
  problemKeys,
  emptyText,
  onTick,
  onReceive,
  onEdit,
  onSelect,
}: ShortageLinesTableProps) {
  const renderCell = (line: ShortageLine, no: ColumnNo) => {
    const live = editable && line.shortageId !== "";
    switch (no) {
      case COL.Tick:
        return (
          <input
            type="checkbox"
            className={styles.tick}
            checked={line.ticked}
            disabled={!live}
            aria-label={`Received: ${line.itemName}`}
            onChange={(event) => onTick(line.key, event.target.checked)}
            onFocus={() => onSelect(line.key)}
          />
        );
      case COL.Receive:
        return live ? (
          <KeyedCell
            lineKey={line.key}
            column={no}
            value={line.receive}
            numeric
            boxTone={line.key === activeKey}
            onCommit={(value) => onReceive(line.key, value)}
            onFocusRow={() => onSelect(line.key)}
            onSpace={() => onTick(line.key)}
          />
        ) : (
          <div className={cx(quotationStyles.cellText, quotationStyles.alignRight)}>{line.receive}</div>
        );
      case COL.Batch: {
        if (live && line.ticked && !isSplit(line) && !isSerial(line)) {
          return (
            <KeyedCell
              lineKey={line.key}
              column={no}
              value={line.batch}
              upper
              onCommit={(value) => onEdit(line.key, { batch: value })}
              onFocusRow={() => onSelect(line.key)}
            />
          );
        }
        const shown = batchCellText(line, isDraft);
        return (
          <div className={cx(quotationStyles.cellText, (isSplit(line) || (isSerial(line) && isDraft)) && styles.infoText)} title={isSplit(line) ? "F12 shows the split" : undefined}>
            {shown}
          </div>
        );
      }
      case COL.Expiry: {
        if (live && line.ticked && !isSplit(line)) {
          return (
            <DateInput
              {...cellAttrs(line.key, no)}
              className={cx(quotationStyles.cellInput, styles.boxedCell)}
              value={isoFromTyped(line.expiry)}
              noPicker
              arrowStep={false}
              block
              aria-label="Expiry"
              onFocus={() => onSelect(line.key)}
              onChange={(iso) => onEdit(line.key, { expiry: displayDate(iso) })}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.altKey && !event.ctrlKey && !event.metaKey) {
                  event.preventDefault();
                  moveCellFocus(LINE_GRID_NAME, event.currentTarget, event.shiftKey ? -1 : 1);
                }
              }}
            />
          );
        }
        return <div className={quotationStyles.cellText}>{isSplit(line) ? "—" : line.expiry}</div>;
      }
      case COL.Outcome:
        return (
          <div className={styles.chips}>
            {outcomeChips(line).map((chip) => (
              <PurchaseCheckChip key={chip.text} text={chip.text} tone={chip.tone} />
            ))}
          </div>
        );
      default:
        break;
    }
    let shown = "";
    let title: string | undefined;
    let tone: string | undefined;
    switch (no) {
      case COL.From:
        shown = line.from;
        title = line.fromTip;
        break;
      case COL.Date:
        shown = line.srcDate;
        break;
      case COL.Age:
        shown = line.ageDays === null ? "" : String(line.ageDays);
        break;
      case COL.Item:
        shown = line.itemName;
        title = line.unitName ? `${line.itemName} — base unit ${line.unitName}` : undefined;
        break;
      case COL.Why:
        shown = line.why;
        break;
      case COL.Short:
        shown = line.shortQty === null ? "" : qtyText(line.shortQty);
        break;
      case COL.Recd:
        shown = line.receivedSoFar === null ? "" : qtyText(line.receivedSoFar);
        break;
      case COL.Closed:
        shown = line.closedSoFar === null ? "" : qtyText(line.closedSoFar);
        title = line.closedTip || undefined;
        break;
      case COL.Open:
        shown = line.openQty === null ? "" : qtyText(line.openQty);
        break;
      case COL.Cost:
        shown = money(line.cost);
        title = line.openValue > 0 ? `Open value ${money(line.openValue)} at the original bill cost` : undefined;
        break;
      case COL.GstHeld:
        shown = line.gstHeld === null ? "—" : money(line.gstHeld);
        tone = line.gstHeld === null ? styles.mutedText : undefined;
        title =
          line.gstHeld === null && isDraft && line.shortageId
            ? "Its GST is still claimed (not parked) — nothing is released when it comes"
            : undefined;
        break;
      default:
        break;
    }
    const numeric = COLUMNS.find((column) => column.no === no)?.number;
    return (
      <div className={cx(quotationStyles.cellText, numeric && quotationStyles.alignRight, tone)} title={title}>
        {shown}
      </div>
    );
  };

  return (
    <div className={cx(quotationStyles.gridViewport, styles.gridViewport)}>
      <table className={cx(quotationStyles.grid, styles.lineGrid)}>
        <colgroup>
          {COLUMNS.map((column) => (
            <col key={column.no} style={{ width: `${(column.weight / TOTAL_WEIGHT) * 100}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column.no} scope="col" className={column.number ? styles.num : undefined}>
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length} className={styles.emptyRow}>
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
                data-shortage-id={line.shortageId}
                onMouseDown={() => onSelect(line.key)}
              >
                {COLUMNS.map((column) => (
                  <td key={column.no} className={column.no === COL.Tick ? styles.tickCell : undefined}>
                    {renderCell(line, column.no)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
