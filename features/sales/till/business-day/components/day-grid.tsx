"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";

import { cx } from "@/components/design-system/cx";
import { useConfiguredGridSettings } from "@/components/master/use-configured-grid-settings";
import { useGridId, type ConfiguredGridKey } from "@/lib/configured-grids";
import { useGetGridColumnsQuery } from "@/store/api/metadataApi";
import { cellOf, resolveColumns, type CellTone, type GridColumn } from "../domain/columns";
import type { RowsState } from "../domain/day-reading";
import type { GridRow } from "../domain/wire";
import styles from "../page.module.scss";

const PAGE_STEP = 10;

type Props = {
  grid: ConfiguredGridKey;
  fallbackColumns: readonly GridColumn[];
  state: RowsState;
  rowKey: (row: GridRow, index: number) => string;
  /** Enter or a double-click on a row. */
  onOpen: (row: GridRow) => void;
  onRetry?: () => void;
  label: string;
  emptyText: string;
  /** The focusable grid itself — the screen moves the keyboard here on a tab change. */
  gridRef?: Ref<HTMLDivElement>;
  autoFocus?: boolean;
};

const TONE_CLASS: Record<Exclude<CellTone, "">, string> = {
  danger: styles.toneDanger,
  success: styles.toneSuccess,
  warning: styles.toneWarning,
  info: styles.toneInfo,
  muted: styles.toneMuted,
  locked: styles.toneLocked,
};

function toneClass(tone: CellTone): string | undefined {
  return tone ? TONE_CLASS[tone] : undefined;
}

function alignClass(column: GridColumn): string | undefined {
  if (column.align === "right") return styles.alignRight;
  if (column.align === "center") return styles.alignCenter;
  return undefined;
}

/**
 * One configured grid of the screen (TILL DAY SESSIONS, MAIN LIST - TILL
 * BUSINESS DAYS): columns from the grid's own config, ↑/↓ PgUp/PgDn Home/End
 * move the current row, Enter or a double-click opens it — the Qt
 * `NexApiTableView`'s `enterPressed` / `doubleClicked`. Right-click is the
 * house grid-settings menu (filter, visibility, Admin).
 */
export function DayGrid({
  grid,
  fallbackColumns,
  state,
  rowKey,
  onOpen,
  onRetry,
  label,
  emptyText,
  gridRef,
  autoFocus,
}: Props) {
  const gridId = useGridId(grid);
  const { data: config, refetch } = useGetGridColumnsQuery({ gridId: Number(gridId) }, { skip: !gridId });
  const columns = useMemo(() => resolveColumns(config, fallbackColumns), [config, fallbackColumns]);
  const settings = useConfiguredGridSettings({ gridId, columns: config, onSaved: () => void refetch() });

  const rows = state.rows;
  // The current row belongs to the rows it was picked in: a fresh list starts on its first row.
  const [cursor, setCursor] = useState<{ rows: readonly GridRow[]; index: number }>({ rows, index: 0 });
  const current = cursor.rows === rows ? cursor.index : 0;
  const setCurrent = (index: number) => setCursor({ rows, index });
  const at = rows.length === 0 ? -1 : Math.min(current, rows.length - 1);
  const bodyRef = useRef<HTMLTableSectionElement | null>(null);

  useEffect(() => {
    if (at < 0 || !bodyRef.current) return;
    bodyRef.current.querySelector<HTMLElement>(`[data-row-index="${at}"]`)?.scrollIntoView({ block: "nearest" });
  }, [at]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (rows.length === 0) return;
    const last = rows.length - 1;
    let next: number | null = null;
    switch (event.key) {
      case "ArrowDown":
        next = Math.min(last, at + 1);
        break;
      case "ArrowUp":
        next = Math.max(0, at - 1);
        break;
      case "PageDown":
        next = Math.min(last, at + PAGE_STEP);
        break;
      case "PageUp":
        next = Math.max(0, at - PAGE_STEP);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      case "Enter":
        event.preventDefault();
        if (at >= 0) onOpen(rows[at]);
        return;
      default:
        return;
    }
    event.preventDefault();
    setCurrent(next);
  };

  let empty: ReactNode = null;
  if (rows.length === 0) {
    if (state.status === "error") {
      empty = (
        <>
          <span>The list could not be read.</span>
          {onRetry ? (
            <button type="button" className={styles.linkButton} onClick={onRetry}>
              Try again
            </button>
          ) : null}
        </>
      );
    } else {
      empty = state.status === "loading" ? "Reading…" : emptyText;
    }
  }

  return (
    <>
      {settings.overlays}
      <div
        ref={gridRef}
        className={styles.tableWrap}
        tabIndex={0}
        role="grid"
        aria-label={label}
        aria-busy={state.status === "loading"}
        data-bd-grid-settings-active={settings.active ? "true" : undefined}
        // The screen's keyboard starts on its grid (Enter opens the cockpit).
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        onContextMenu={settings.onContextMenu}
      >
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.field}
                  className={alignClass(column)}
                  style={column.width ? { width: column.width } : undefined}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {rows.map((row, index) => (
              <tr
                key={rowKey(row, index)}
                data-row-index={index}
                aria-selected={index === at}
                className={cx(index === at && styles.rowCurrent)}
                onClick={() => setCurrent(index)}
                onDoubleClick={() => onOpen(row)}
              >
                {columns.map((column) => {
                  const cell = cellOf(column.field, row);
                  return (
                    <td
                      key={column.field}
                      className={cx(alignClass(column), cell.kind === "text" && toneClass(cell.tone))}
                    >
                      {cell.kind === "pill" ? (
                        <span className={cx(styles.pill, styles.pillSmall, toneClass(cell.tone))}>{cell.text}</span>
                      ) : (
                        cell.text
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {empty !== null ? <div className={styles.tableEmpty}>{empty}</div> : null}
      </div>
    </>
  );
}
