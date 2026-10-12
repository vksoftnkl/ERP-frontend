"use client";

/**
 * A configured list as a table — Qt's NexApiTableView as this screen uses it:
 * one current row, ↑↓ / PgUp / PgDn / Home / End walk it, a click or Enter
 * activates it, totals under the money columns the grid totals.
 */
import { useEffect, useRef, type KeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { cellText, columnTotals, type GridColumn } from "../domain/grid-columns";
import { formatPaise } from "../domain/money";
import type { GridRow } from "../domain/types";
import styles from "../page.module.scss";

export type GridTableProps = {
  columns: readonly GridColumn[];
  rows: readonly GridRow[];
  loading: boolean;
  error: string;
  /** -1 = none. */
  current: number;
  onCurrent: (index: number) => void;
  /** Enter, or a double-click (a single click when `activateOnClick`). */
  onActivate?: (index: number) => void;
  activateOnClick?: boolean;
  emptyText: string;
  ariaLabel: string;
  className?: string;
  autoFocus?: boolean;
};

const PAGE_STEP = 10;

function alignClass(column: GridColumn): string | undefined {
  if (column.align === "right") return styles.alignRight;
  if (column.align === "center") return styles.alignCenter;
  return undefined;
}

export function GridTable({
  columns,
  rows,
  loading,
  error,
  current,
  onCurrent,
  onActivate,
  activateOnClick,
  emptyText,
  ariaLabel,
  className,
  autoFocus,
}: GridTableProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const totals = columnTotals(rows, columns);
  const hasTotals = Object.keys(totals).length > 0 && rows.length > 0;

  // A div is not focused by React's `autoFocus`; this runs once the table is in
  // the DOM — inside a dialog that is after the portal has mounted it.
  useEffect(() => {
    if (autoFocus) viewportRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  useEffect(() => {
    if (current < 0) return;
    const row = viewportRef.current?.querySelector<HTMLElement>(`tr[data-index="${current}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || rows.length === 0) return;
    const last = rows.length - 1;
    const from = current < 0 ? -1 : current;
    let next: number | null = null;
    switch (event.key) {
      case "ArrowDown":
        next = Math.min(from + 1, last);
        break;
      case "ArrowUp":
        next = Math.max(from - 1, 0);
        break;
      case "PageDown":
        next = Math.min(from + PAGE_STEP, last);
        break;
      case "PageUp":
        next = Math.max(from - PAGE_STEP, 0);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      case "Enter":
        if (current >= 0 && onActivate) {
          event.preventDefault();
          onActivate(current);
        }
        return;
      default:
        return;
    }
    event.preventDefault();
    onCurrent(next);
  };

  const width = (column: GridColumn) => `calc(${(column.weight * 0.62).toFixed(2)} * var(--erp-q-u, 1rem))`;

  return (
    <div className={cx(styles.gridShell, className)}>
      <div
        ref={viewportRef}
        className={styles.gridViewport}
        tabIndex={0}
        role="grid"
        aria-label={ariaLabel}
        aria-busy={loading || undefined}
        onKeyDown={onKeyDown}
      >
        <table className={styles.table}>
          <colgroup>
            {columns.map((column) => (
              <col key={column.field} style={{ width: width(column) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.field} scope="col" className={alignClass(column)} title={column.header}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr>
                <td className={styles.errorCell} colSpan={Math.max(columns.length, 1)}>
                  {error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className={styles.emptyCell} colSpan={Math.max(columns.length, 1)}>
                  {loading ? "Loading…" : emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr
                  key={index}
                  data-index={index}
                  aria-selected={index === current}
                  className={cx(styles.row, index === current && styles.rowCurrent)}
                  onClick={() => {
                    onCurrent(index);
                    if (activateOnClick) onActivate?.(index);
                  }}
                  onDoubleClick={() => onActivate?.(index)}
                >
                  {columns.map((column) => {
                    const value = cellText(row, column);
                    return (
                      <td key={column.field} className={alignClass(column)} title={value}>
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
          {hasTotals && !error ? (
            <tfoot>
              <tr>
                {columns.map((column, index) => (
                  <td key={column.field} className={alignClass(column)}>
                    {column.field in totals ? formatPaise(totals[column.field]) : index === 0 ? "Total" : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <div className={styles.gridFoot}>
        <span>{loading ? "Loading…" : `${rows.length} row(s)`}</span>
      </div>
    </div>
  );
}
