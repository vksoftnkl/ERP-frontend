"use client";
/**
 * One read-only grid of the screen — Qt `NexTable` + `LoyaltyStatusDelegate`.
 *
 * Virtualised (a list route can bring up to 20,000 rows), a sticky heading
 * and a sticky Total row (Qt's footer). The current row is the screen's: a
 * click or the keys move it and the screen reacts (the member's statement,
 * the scheme's month-wise chart). Keys, with the grid focused: ↑ ↓ PgUp PgDn
 * Home End move, Enter is the grid's drill-down when it has one.
 *
 * Cell text and tone come from `view/*`; this paints them only.
 */
import { useEffect, useMemo, useRef, type KeyboardEvent, type MutableRefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import type { Cell, Column } from "../view/cells";
import { chipClass, toneClass } from "./tone";

export const ROW_HEIGHT = 26;

const U = "var(--erp-q-u, 1rem)";

function template(columns: readonly Column[]): string {
  return columns
    .map((c) => (c.fr ? `minmax(calc(${c.min} * ${U}), ${c.fr}fr)` : `calc(${c.min} * ${U})`))
    .join(" ");
}

function minWidth(columns: readonly Column[]): string {
  const total = columns.reduce((sum, c) => sum + c.min, 0);
  return `max(100%, calc(${total.toFixed(2)} * ${U}))`;
}

function CellView({ cell, num }: { cell: Cell; num?: boolean }) {
  if (cell.chip && cell.text) {
    return (
      <div className={cx(num && styles.num)} title={cell.text}>
        <span className={chipClass(cell.chip)}>{cell.text}</span>
      </div>
    );
  }
  if (cell.aside) {
    return (
      <div className={cx(styles.cellSplit, toneClass(cell.tone), cell.bold && styles.bold)} title={`${cell.text} · ${cell.aside.text}`}>
        <span>{cell.text}</span>
        <span className={cx(styles.aside, toneClass(cell.aside.tone))}>{cell.aside.text}</span>
      </div>
    );
  }
  if (cell.badge) {
    return (
      <div className={cx(num && styles.num, toneClass(cell.tone), cell.bold && styles.bold)}>
        <span>{cell.text}</span>
        <span className={cx(chipClass(cell.badge.tone), styles.badge)}>{cell.badge.text}</span>
      </div>
    );
  }
  return (
    <div className={cx(num && styles.num, toneClass(cell.tone), cell.bold && styles.bold)} title={cell.text || undefined}>
      {cell.text}
    </div>
  );
}

type Props<R> = {
  columns: readonly Column[];
  rows: readonly R[];
  rowKey: (row: R, index: number) => string;
  cellsOf: (row: R, index: number) => Cell[];
  totals?: readonly Cell[] | null;
  selectedKey?: string | null;
  onSelect?: (row: R, index: number) => void;
  onEnter?: (row: R, index: number) => void;
  emptyText: string;
  ariaLabel: string;
  /** The previous answer, dimmed, while the next one loads. */
  stale?: boolean;
  viewportRef?: MutableRefObject<HTMLDivElement | null>;
  testId?: string;
};

export function ReportGrid<R>({
  columns,
  rows,
  rowKey,
  cellsOf,
  totals,
  selectedKey = null,
  onSelect,
  onEnter,
  emptyText,
  ariaLabel,
  stale,
  viewportRef,
  testId,
}: Props<R>) {
  const ownRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = viewportRef ?? ownRef;
  const gridTemplate = useMemo(() => template(columns), [columns]);
  const tableMin = useMemo(() => minWidth(columns), [columns]);
  const count = rows.length;

  // TanStack Virtual hands back functions the React Compiler cannot memoise, so
  // it skips this component. Expected: the grid re-renders on scroll by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollPaddingStart: ROW_HEIGHT,
    scrollPaddingEnd: ROW_HEIGHT,
  });

  const selectedIndex = useMemo(() => {
    if (selectedKey === null) return -1;
    return rows.findIndex((row, i) => rowKey(row, i) === selectedKey);
  }, [rowKey, rows, selectedKey]);

  // Keep the current row in view when it moves (keys, a reload, a drill-in).
  const lastScrolled = useRef<number>(-1);
  useEffect(() => {
    if (selectedIndex < 0 || selectedIndex === lastScrolled.current) return;
    lastScrolled.current = selectedIndex;
    virtualizer.scrollToIndex(selectedIndex, { align: "auto" });
  }, [selectedIndex, virtualizer]);

  const moveTo = (index: number) => {
    if (count === 0 || !onSelect) return;
    const clamped = Math.max(0, Math.min(count - 1, index));
    onSelect(rows[clamped], clamped);
  };

  const pageRows = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? ROW_HEIGHT * 10) / ROW_HEIGHT) - 2);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const current = selectedIndex;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveTo(current + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveTo(Math.max(0, current - 1));
        break;
      case "PageDown":
        event.preventDefault();
        moveTo(current + pageRows);
        break;
      case "PageUp":
        event.preventDefault();
        moveTo(current - pageRows);
        break;
      case "Home":
        event.preventDefault();
        moveTo(0);
        break;
      case "End":
        event.preventDefault();
        moveTo(count - 1);
        break;
      case "Enter":
        if (onEnter && current >= 0) {
          event.preventDefault();
          onEnter(rows[current], current);
        }
        break;
      default:
    }
  };

  const items = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      className={cx(styles.gridViewport, stale && styles.gridStale)}
      tabIndex={0}
      role="grid"
      aria-label={ariaLabel}
      aria-rowcount={count + 1 + (totals ? 1 : 0)}
      data-testid={testId}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        if (event.target === event.currentTarget && selectedIndex < 0 && count > 0) moveTo(0);
      }}
    >
      <div className={styles.gridTable} style={{ minWidth: tableMin }}>
        <div className={styles.gridHead} style={{ gridTemplateColumns: gridTemplate }} role="row">
          {columns.map((c, i) => (
            <div key={`${c.title}-${i}`} role="columnheader" className={cx(c.num && styles.num)}>
              {c.title}
            </div>
          ))}
        </div>
        <div style={{ position: "relative", height: virtualizer.getTotalSize() }}>
          {items.map((item) => {
            const row = rows[item.index];
            if (row === undefined) return null;
            const key = rowKey(row, item.index);
            const selected = item.index === selectedIndex;
            const cells = cellsOf(row, item.index);
            return (
              <div
                key={key}
                className={cx(styles.gridRow, selected && styles.rowSelected)}
                style={{ transform: `translateY(${item.start}px)`, gridTemplateColumns: gridTemplate }}
                role="row"
                aria-selected={selected}
                data-row-key={key}
                onMouseDown={() => onSelect?.(row, item.index)}
                onDoubleClick={() => onEnter?.(row, item.index)}
              >
                {columns.map((c, i) => (
                  <CellView key={i} cell={cells[i] ?? { text: "" }} num={c.num} />
                ))}
              </div>
            );
          })}
        </div>
        {totals && count > 0 ? (
          <div className={styles.gridTotal} style={{ gridTemplateColumns: gridTemplate }} role="row">
            {columns.map((c, i) => (
              <CellView key={i} cell={totals[i] ?? { text: "" }} num={c.num} />
            ))}
          </div>
        ) : null}
      </div>
      {count === 0 ? <div className={styles.gridEmpty}>{emptyText}</div> : null}
    </div>
  );
}
