"use client";

/**
 * WHAT ARRIVED — the receipt's lines. Only Receiving now, Bucket and (with
 * Unloading ticked) the rate are keyed; everything else is read from the
 * transit row. Enter walks the keyed cells; "+" on a line adds a Damaged line
 * for broken units, "−" removes it.
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { qtyCell } from "../../stock-adjustment/stock-adjustment.format";
import { COL, DAMAGED_BUCKET } from "../branch-inward.constants";
import type { LineColumn } from "../branch-inward.columns";
import { bucketOptions } from "../branch-inward.state";
import type { InwardLine } from "../branch-inward.types";
import styles from "../page.module.scss";

/** Marks a keyed cell: `<lineKey>:<column>`. */
const CELL_ATTR = "data-bi-cell";

const QTY_PATTERN = /^\d*\.?\d{0,3}$/;
const RATE_PATTERN = /^\d*\.?\d{0,4}$/;

/** A number cell: typed text is held locally and committed on blur / Enter. */
function NumberCell({
  cell,
  value,
  pattern,
  disabled,
  title,
  onCommit,
  onEnter,
}: {
  cell: string;
  value: string;
  pattern: RegExp;
  disabled: boolean;
  title?: string;
  onCommit: (text: string) => void;
  onEnter: (element: HTMLInputElement) => void;
}) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  // Read through a ref: Enter commits and moves focus, so the old cell's blur
  // runs with this render's closure — it must still see what was typed.
  const typed = useRef(value);
  const committed = useRef(value);

  useEffect(() => {
    if (!focused) {
      setText(value);
      typed.current = value;
      committed.current = value;
    }
  }, [focused, value]);

  const commit = () => {
    if (typed.current !== committed.current) {
      committed.current = typed.current;
      onCommit(typed.current === "" || typed.current === "." ? "0" : typed.current);
    }
  };

  return (
    <input
      {...{ [CELL_ATTR]: cell }}
      className={cx(quotationStyles.cellInput, quotationStyles.alignRight)}
      value={text}
      disabled={disabled}
      title={title}
      inputMode="decimal"
      autoComplete="off"
      onFocus={(event) => {
        setFocused(true);
        event.currentTarget.select();
      }}
      onBlur={() => {
        commit();
        setFocused(false);
      }}
      onChange={(event) => {
        const next = event.target.value;
        if (pattern.test(next)) {
          typed.current = next;
          setText(next);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && typed.current !== committed.current) {
          event.preventDefault();
          typed.current = committed.current;
          setText(committed.current);
          return;
        }
        if (event.key === "Enter" && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          commit();
          onEnter(event.currentTarget);
        }
      }}
    />
  );
}

export function LinesTable({
  lines,
  columns,
  editable,
  problemKeys,
  notes,
  focusRequest,
  onEdit,
  onAddDamaged,
  onRemove,
}: {
  lines: readonly InwardLine[];
  columns: readonly LineColumn[];
  editable: boolean;
  problemKeys: ReadonlySet<string>;
  notes: ReadonlyMap<string, string>;
  focusRequest: { key: string; seq: number } | null;
  onEdit: (key: string, patch: Partial<Pick<InwardLine, "qty" | "bucket" | "unloadRate">>) => void;
  onAddDamaged: (key: string) => void;
  onRemove: (key: string) => void;
}) {
  const root = useRef<HTMLDivElement | null>(null);

  /** The keyed cells Enter stops on: Receiving now and the rate, as the Qt grid's focus stops — not Bucket. */
  const stopsOf = (): HTMLElement[] =>
    Array.from(root.current?.querySelectorAll<HTMLElement>(`[${CELL_ATTR}]:not([${CELL_ATTR}$=":${COL.Bucket}"])`) ?? []).filter(
      (element) => !(element as HTMLInputElement).disabled,
    );

  /** Enter: the next keyed cell after this one, row by row. */
  const walkFrom = (from: HTMLElement | null) => {
    if (!from) {
      return;
    }
    const next = stopsOf().find((stop) => from.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING);
    next?.focus();
  };

  // A line added with "+" takes the cursor on its Receiving now.
  const lastFocus = useRef(0);
  useEffect(() => {
    if (!focusRequest || focusRequest.seq === lastFocus.current) {
      return;
    }
    lastFocus.current = focusRequest.seq;
    root.current?.querySelector<HTMLElement>(`[${CELL_ATTR}="${focusRequest.key}:${COL.Qty}"]`)?.focus();
  }, [focusRequest, lines]);

  const rowKey = (event: ReactKeyboardEvent<HTMLTableRowElement>, line: InwardLine) => {
    if (!editable || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    if (event.key === "+" || event.key === "Add") {
      event.preventDefault();
      onAddDamaged(line.key);
    } else if (event.key === "-" || event.key === "−" || event.key === "Subtract") {
      event.preventDefault();
      onRemove(line.key);
    }
  };

  const renderCell = (line: InwardLine, column: LineColumn) => {
    const cell = `${line.key}:${column.no}`;
    switch (column.no) {
      case COL.Item:
        return (
          <div className={quotationStyles.cellText} title={line.unitName ? `Unit ${line.unitName}` : undefined}>
            {line.itemName}
          </div>
        );
      case COL.Batch:
        return <div className={quotationStyles.cellText}>{line.batchNo}</div>;
      case COL.Sent:
        return <div className={cx(quotationStyles.cellText, quotationStyles.alignRight)}>{qtyCell(line.sentQty)}</div>;
      case COL.Received:
        return (
          <div className={cx(quotationStyles.cellText, quotationStyles.alignRight)}>{qtyCell(line.receivedQty)}</div>
        );
      case COL.Remaining:
        return (
          <div className={cx(quotationStyles.cellText, quotationStyles.alignRight)}>{qtyCell(line.remainingQty)}</div>
        );
      case COL.Qty:
        return (
          <NumberCell
            cell={cell}
            value={line.qty}
            pattern={QTY_PATTERN}
            disabled={!editable}
            onCommit={(qty) => onEdit(line.key, { qty })}
            onEnter={(element) => walkFrom(element)}
          />
        );
      case COL.Bucket:
        return editable ? (
          <select
            {...{ [CELL_ATTR]: cell }}
            className={cx(quotationStyles.cellSelect, styles.bucketSelect)}
            value={line.bucket}
            title="The transit row's own bucket, or DAMAGED — any other would launder broken goods clean."
            onChange={(event) => onEdit(line.key, { bucket: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.ctrlKey && !event.altKey && !event.metaKey) {
                event.preventDefault();
                walkFrom(event.currentTarget);
              }
            }}
          >
            {bucketOptions(line).map((bucket) => (
              <option key={bucket} value={bucket}>
                {bucket}
              </option>
            ))}
          </select>
        ) : (
          <div className={quotationStyles.cellText}>{line.bucket}</div>
        );
      case COL.UnloadRate:
        return (
          <NumberCell
            cell={cell}
            value={line.unloadRate}
            pattern={RATE_PATTERN}
            disabled={!editable}
            onCommit={(unloadRate) => onEdit(line.key, { unloadRate })}
            onEnter={(element) => walkFrom(element)}
          />
        );
      case COL.PostNote: {
        const note = notes.get(line.key) ?? "";
        return (
          <div className={cx(quotationStyles.cellText, styles.noteCell, note.startsWith("not received") && styles.noteWarn)}>
            {note}
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className={cx(quotationStyles.gridViewport, styles.gridViewport)} ref={root}>
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
              <th key={column.no} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr
              key={line.key}
              className={cx(
                index % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven,
                line.bucket === DAMAGED_BUCKET && styles.damagedRow,
                problemKeys.has(line.key) && styles.problemRow,
              )}
              onKeyDown={(event) => rowKey(event, line)}
            >
              <td className={styles.rowNo}>{index + 1}</td>
              {columns.map((column) => (
                <td key={column.no}>{renderCell(line, column)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
