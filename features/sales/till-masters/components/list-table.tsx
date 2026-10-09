"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

import { cx } from "@/components/design-system/cx";
import type { GridRow } from "../domain/till-masters";
import styles from "../page.module.scss";

export type ListColumn = {
  key: string;
  label: string;
  align?: "right" | "center";
  /** The column that takes the spare width. */
  stretch?: boolean;
  text: (row: GridRow) => string;
  title?: (row: GridRow) => string | undefined;
  tone?: (row: GridRow) => "danger" | undefined;
};

type Props = {
  label: string;
  columns: readonly ListColumn[];
  rows: readonly GridRow[];
  rowKey: (row: GridRow) => string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Inactive (or replaced) rows are greyed. */
  muted?: (row: GridRow) => boolean;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  emptyText: string;
};

/**
 * One master's list. A click or ↑/↓ opens a row on the form (the tab asks
 * first when the form has unsaved changes); the selected row is the one on
 * the form, and none is while a new row is being keyed.
 */
export function ListTable({
  label,
  columns,
  rows,
  rowKey,
  selectedId,
  onSelect,
  muted,
  loading,
  error,
  onRetry,
  emptyText,
}: Props) {
  const bodyRef = useRef<HTMLTableSectionElement | null>(null);

  // Keep the selected row in view when the selection moves by key or re-read.
  useEffect(() => {
    if (!selectedId || !bodyRef.current) return;
    const row = bodyRef.current.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(selectedId)}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [selectedId, rows]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (rows.length === 0) return;
    event.preventDefault();
    const index = rows.findIndex((row) => rowKey(row) === selectedId);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = index < 0 ? (step > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, index + step));
    if (next !== index) onSelect(rowKey(rows[next]));
  };

  return (
    <div className={styles.tableWrap} tabIndex={0} role="grid" aria-label={label} onKeyDown={onKeyDown}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={cx(
                  column.align === "right" && styles.alignRight,
                  column.align === "center" && styles.alignCenter,
                  column.stretch && styles.stretch,
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {rows.map((row) => {
            const id = rowKey(row);
            return (
              <tr
                key={id}
                data-row-id={id}
                aria-selected={id === selectedId}
                className={cx(id === selectedId && styles.rowSelected, muted?.(row) && styles.rowMuted)}
                onClick={() => onSelect(id)}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    title={column.title?.(row)}
                    className={cx(
                      column.align === "right" && styles.alignRight,
                      column.align === "center" && styles.alignCenter,
                      column.tone?.(row) === "danger" && styles.toneDanger,
                    )}
                  >
                    {column.text(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <div className={styles.tableEmpty}>
          {error ? (
            <>
              <span>The list could not be read.</span>
              {onRetry ? (
                <button type="button" className={styles.linkButton} onClick={onRetry}>
                  Try again
                </button>
              ) : null}
            </>
          ) : loading ? (
            "Loading…"
          ) : (
            emptyText
          )}
        </div>
      ) : null}
    </div>
  );
}
