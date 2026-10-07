"use client";

/**
 * A child list inside a GST dialog — services, endpoints, error map, field
 * map. The Qt lists' keys: ↑ ↓ move, Enter (or a double click) edits,
 * + adds, − deletes. The list itself takes focus, so the keys belong to the
 * list the operator is standing on.
 */
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/components/design-system/cx";
import styles from "../gst.module.scss";

export type GstColumn<Row> = {
  key: string;
  header: string;
  align?: "right" | "center";
  render?: (row: Row) => ReactNode;
};

export type GstTableProps<Row> = {
  columns: readonly GstColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onActivate?: (row: Row) => void;
  onAdd?: () => void;
  onDelete?: (row: Row) => void;
  loading?: boolean;
  emptyText: string;
  ariaLabel: string;
  className?: string;
};

function cellText(value: unknown): ReactNode {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
}

export function GstTable<Row extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  selectedKey,
  onSelect,
  onActivate,
  onAdd,
  onDelete,
  loading,
  emptyText,
  ariaLabel,
  className,
}: GstTableProps<Row>) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const selectedIndex = rows.findIndex((row) => rowKey(row) === selectedKey);
  const selectedRow = selectedIndex >= 0 ? rows[selectedIndex] : undefined;

  // Keep the highlighted row in view as the arrows walk.
  useEffect(() => {
    if (selectedIndex < 0) {
      return;
    }
    wrapRef.current
      ?.querySelector<HTMLTableRowElement>(`tbody tr:nth-child(${selectedIndex + 1})`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const move = (to: number) => {
      const row = rows[Math.max(0, Math.min(rows.length - 1, to))];
      if (row) {
        onSelect(rowKey(row));
      }
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(selectedIndex < 0 ? 0 : selectedIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(selectedIndex < 0 ? 0 : selectedIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        move(0);
        break;
      case "End":
        event.preventDefault();
        move(rows.length - 1);
        break;
      case "Enter":
        if (selectedRow && onActivate) {
          event.preventDefault();
          onActivate(selectedRow);
        }
        break;
      case "+":
        if (onAdd) {
          event.preventDefault();
          onAdd();
        }
        break;
      case "-":
        if (selectedRow && onDelete) {
          event.preventDefault();
          onDelete(selectedRow);
        }
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={wrapRef}
      className={cx(styles.tableWrap, className)}
      tabIndex={0}
      role="grid"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={cx(
                  column.align === "right" && styles.alignRight,
                  column.align === "center" && styles.alignCenter,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <tr
                key={key}
                className={cx(key === selectedKey && styles.rowSelected)}
                aria-selected={key === selectedKey}
                onClick={() => onSelect(key)}
                onDoubleClick={() => onActivate?.(row)}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cx(
                      column.align === "right" && styles.alignRight,
                      column.align === "center" && styles.alignCenter,
                    )}
                  >
                    {column.render ? column.render(row) : cellText(row[column.key])}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 ? <div className={styles.tableEmpty}>{loading ? "Loading…" : emptyText}</div> : null}
    </div>
  );
}
