"use client";

/**
 * The stores table of Cash Position — the report table (`../reports/
 * report-table.tsx`) with what Qt's `PillDelegate` paints over a cell that
 * the report cells cannot say: the insured fill bar before its percent, amber
 * text (awaiting receipt, approvals), a tooltip (a till figure some sessions
 * are hidden from, a flagged store's flags on its name).
 *
 * A pick list: a click picks a store, ↑ / ↓ / Home / End move the pick while
 * the table has the focus, Enter and a double-click open its Business Day.
 */
import type { KeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { ReportPill } from "../reports/report-table";
import { pickedIndexAfter } from "../sessions/cockpit";
import sessionStyles from "../sessions/sessions.module.scss";
import styles from "../shared/till.module.scss";
import type { BarTone, StoreCellView, StoreRowView, StoreTableView } from "./cash-position";
import local from "./cash-position.module.scss";

export type StoresTableProps = {
  table: StoreTableView;
  /** The picked store's key (its branch id); null = none. */
  pickedKey: string | null;
  onPick: (row: StoreRowView) => void;
  onOpen: (row: StoreRowView) => void;
  loading: boolean;
  error: string;
  emptyText: string;
  label: string;
};

const BAR_CLASS: Record<BarTone, string> = { green: local.barGreen, amber: local.barAmber, red: local.barRed };

function Cell({ cell, bold }: { cell: StoreCellView; bold: boolean }) {
  if (cell.pills.length > 0) {
    return (
      <span className={cx(local.pills, cell.numeric && local.pillsRight)}>
        {cell.pills.map((pill, index) => (
          <ReportPill key={index} pill={pill} />
        ))}
      </span>
    );
  }
  const tone =
    cell.tone === "red" ? styles.toneRed : cell.tone === "green" ? styles.toneGreen : cell.amber ? local.amber : undefined;
  const text = <span className={cx(bold && cell.tone && local.signed, tone)}>{cell.text}</span>;
  if (!cell.bar) return text;
  return (
    <span className={local.barCell}>
      <span className={local.bar} aria-hidden="true">
        <span
          className={cx(local.barFill, BAR_CLASS[cell.bar.tone])}
          style={{ width: `${Math.round(Math.min(1, Math.max(0, cell.bar.fraction)) * 100)}%` }}
        />
      </span>
      {text}
    </span>
  );
}

export function StoresTable({ table, pickedKey, onPick, onOpen, loading, error, emptyText, label }: StoresTableProps) {
  const rows = table.rows;
  const pickedIndex = pickedKey === null ? -1 : rows.findIndex((row) => !row.total && row.key === pickedKey);

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === "Enter") {
      if (pickedIndex < 0) return;
      event.preventDefault();
      onOpen(rows[pickedIndex]);
      return;
    }
    const next = pickedIndexAfter(event.key, pickedIndex, rows.length);
    if (next < 0 || rows[next].total) return;
    event.preventDefault();
    onPick(rows[next]);
    event.currentTarget.querySelectorAll("tbody tr")[next]?.scrollIntoView({ block: "nearest" });
  };

  return (
    <table
      className={cx(styles.table, local.table, sessionStyles.pickTable)}
      tabIndex={0}
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      <thead>
        <tr>
          {table.columns.map((column) => (
            <th key={column.key} scope="col" className={cx(column.kind !== "text" && styles.right)}>
              {column.title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={row.key}
            aria-selected={row.total ? undefined : index === pickedIndex}
            className={row.total ? cx(styles.totalRow, local.totalRow) : undefined}
            onClick={row.total ? undefined : () => onPick(row)}
            onDoubleClick={row.total ? undefined : () => onOpen(row)}
          >
            {row.cells.map((cell, at) => (
              <td key={table.columns[at]?.key ?? at} className={cx(cell.numeric && styles.right)} title={cell.title}>
                <Cell cell={cell} bold={table.columns[at]?.kind === "signed"} />
              </td>
            ))}
          </tr>
        ))}
        {rows.length === 0 ? (
          <tr>
            <td colSpan={Math.max(1, table.columns.length)} className={styles.emptyCell}>
              {error ? error : loading ? "Loading…" : emptyText}
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}
