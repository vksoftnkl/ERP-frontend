"use client";

/**
 * One table of Till Reports (Qt `setupTable` + `PillDelegate`): the columns
 * are the report's own (`till-reports.ts`), not the grid's config — every
 * figure is formatted, summed and pilled by its key. Numbers right-aligned,
 * a signed figure bold in red (short) or green (excess), a pill cell drawn as
 * its pills, the totals row bold on a tint.
 *
 * A pick list: a click picks a row, ↑ / ↓ / Home / End move the pick while
 * the table has the focus, Enter and a double-click open it (the detail
 * tables: the session's Cockpit). `onCellClick` also says which column was
 * hit (the Exceptions counts pick the Event filter).
 */
import type { KeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import styles from "../shared/till.module.scss";
import { pickedIndexAfter } from "../sessions/cockpit";
import sessionStyles from "../sessions/sessions.module.scss";
import type { CellView, Pill, RowView, TableView } from "./till-reports";
import local from "./reports.module.scss";

export type ReportTableProps = {
  table: TableView;
  /** The picked row's key; null = none. */
  pickedKey: string | null;
  onPick?: (row: RowView) => void;
  onCellClick?: (row: RowView, columnIndex: number) => void;
  onOpen?: (row: RowView) => void;
  loading?: boolean;
  error?: string;
  emptyText: string;
  label: string;
};

export function ReportPill({ pill }: { pill: Pill }) {
  return (
    <span
      className={cx(
        styles.pill,
        pill.tone === "green" && styles.pillGreen,
        pill.tone === "amber" && styles.pillAmber,
        pill.tone === "red" && styles.pillRed,
        pill.tone === "blue" && styles.pillBlue,
        pill.tone === "slate" && sessionStyles.pillSlate,
      )}
    >
      {pill.text}
    </span>
  );
}

function Cell({ cell }: { cell: CellView }) {
  if (cell.pills.length > 0) {
    return (
      <span className={cx(local.pills, cell.numeric && local.pillsRight)}>
        {cell.pills.map((pill, index) => (
          <ReportPill key={index} pill={pill} />
        ))}
      </span>
    );
  }
  if (!cell.tone) return <>{cell.text}</>;
  return <span className={cx(local.signed, cell.tone === "red" ? styles.toneRed : styles.toneGreen)}>{cell.text}</span>;
}

export function ReportTable({
  table,
  pickedKey,
  onPick,
  onCellClick,
  onOpen,
  loading,
  error,
  emptyText,
  label,
}: ReportTableProps) {
  const rows = table.rows;
  const pickedIndex = pickedKey === null ? -1 : rows.findIndex((row) => !row.total && row.key === pickedKey);
  const selectable = Boolean(onPick || onCellClick);

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === "Enter") {
      if (!onOpen || pickedIndex < 0) return;
      event.preventDefault();
      onOpen(rows[pickedIndex]);
      return;
    }
    if (!onPick) return;
    const next = pickedIndexAfter(event.key, pickedIndex, rows.length);
    if (next < 0) return;
    event.preventDefault();
    onPick(rows[next]);
    event.currentTarget.querySelectorAll("tbody tr")[next]?.scrollIntoView({ block: "nearest" });
  };

  return (
    <table
      className={cx(styles.table, local.table, selectable && sessionStyles.pickTable)}
      tabIndex={selectable ? 0 : undefined}
      aria-label={label}
      onKeyDown={selectable ? onKeyDown : undefined}
    >
      <thead>
        <tr>
          {table.columns.map((column) => (
            <th key={column.key} scope="col" title={column.tip} className={cx(column.kind !== "text" && styles.right)}>
              {column.title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={row.key}
            aria-selected={selectable && !row.total ? index === pickedIndex : undefined}
            className={row.total ? cx(styles.totalRow, local.totalRow) : undefined}
            onClick={(event) => {
              if (onCellClick) {
                const cell = (event.target as HTMLElement).closest("td");
                const at = cell ? Array.prototype.indexOf.call(event.currentTarget.children, cell) : -1;
                onCellClick(row, at);
              } else {
                onPick?.(row);
              }
            }}
            onDoubleClick={onOpen && !row.total ? () => onOpen(row) : undefined}
          >
            {row.cells.map((cell, at) => (
              <td key={table.columns[at]?.key ?? at} className={cx(cell.numeric && styles.right)}>
                <Cell cell={cell} />
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
