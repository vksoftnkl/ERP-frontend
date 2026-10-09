"use client";
/**
 * The party grid (plan §8): virtualised, fed by server pages of 200, sorted
 * and paged BY THE SERVER, with the totals row pinned at the bottom.
 *
 * The totals row is `/parties.totals`, always: never a sum of loaded pages.
 * A header click sets `sort` / `dir` in the URL and the server re-sorts;
 * nothing here ever sorts loaded rows (with 3 of 12 pages in, that would sort
 * a sample and look right).
 *
 * Keys (the viewport holds focus): ↑/↓ move the selection, PgUp/PgDn a
 * screenful, Home/End the ends, Enter goes to the bills grid. The selection
 * itself is the screen's (`party=` in the URL).
 */
import { useEffect, useMemo, useRef, type KeyboardEvent, type MutableRefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import type { PartiesList } from "../query/outstanding-loader";
import { findLoaded, rowAt } from "../query/pages";
import type { PartySort, SortDir } from "../query/params";
import { partyCells, totalCells, type Cell, type GridContext, type PartyCells } from "../view/cells";
import type { PartyRow } from "../wire/types";
import { PartyFlags } from "./chips";
import { minWidth, partyColumns, template } from "./grid-columns";
import { toneClass } from "./tone";

export const ROW_HEIGHT = 26;

type Props = {
  list: PartiesList;
  ctx: GridContext;
  sort: PartySort;
  dir: SortDir;
  onSort: (sort: PartySort) => void;
  selectedId: string | null;
  onSelect: (row: PartyRow) => void;
  onRange: (first: number, last: number) => void;
  onEnter: () => void;
  pageError: string | null;
  onRetryPages: () => void;
  viewportRef: MutableRefObject<HTMLDivElement | null>;
};

type Heading = { label: string; sort?: PartySort; num?: boolean };

function headings(labels: readonly string[]): Heading[] {
  return [
    { label: "" },
    { label: "Party", sort: "name" },
    { label: "Area" },
    { label: "Cr days", num: true },
    { label: "Bills", num: true },
    { label: "Pending bills", sort: "owed", num: true },
    { label: "On-acct Cr", num: true },
    { label: "Net outstanding", sort: "net", num: true },
    ...labels.map((label, i): Heading => ({ label, sort: `bucket${i}` as PartySort, num: true })),
    { label: "Overdue", sort: "overdue", num: true },
    { label: "Oldest", sort: "oldest", num: true },
    { label: "PDC", num: true },
  ];
}

function CellView({ cell, strong }: { cell: Cell; strong?: boolean }) {
  return (
    <div className={cx(styles.num, toneClass(cell.tone), strong && styles.strong)} title={cell.title}>
      {cell.text}
    </div>
  );
}

function Line({ c, caret, total }: { c: PartyCells; caret: boolean; total?: boolean }) {
  return (
    <>
      <div className={styles.caret}>{caret ? "▼" : ""}</div>
      <div className={styles.partyName} title={c.name}>
        <span className={styles.partyNameText}>{c.name}</span>
        <PartyFlags flags={c.flags} />
      </div>
      <div title={c.area}>{c.area}</div>
      <div className={styles.num}>{c.crDays}</div>
      <div className={styles.num}>{c.bills}</div>
      <CellView cell={c.owed} />
      <CellView cell={c.onAccount} />
      <CellView cell={c.net} strong />
      {c.buckets.map((cell, i) => (
        <CellView key={i} cell={cell} />
      ))}
      <CellView cell={c.overdue} />
      <CellView cell={c.oldest} />
      <CellView cell={c.pdc} strong={total} />
    </>
  );
}

export function PartyGrid({
  list,
  ctx,
  sort,
  dir,
  onSort,
  selectedId,
  onSelect,
  onRange,
  onEnter,
  pageError,
  onRetryPages,
  viewportRef,
}: Props) {
  const labels = list.meta.head.bucketLabels;
  const cols = useMemo(() => partyColumns(labels.length), [labels.length]);
  const gridTemplate = template(cols);
  const heads = useMemo(() => headings(labels), [labels]);
  const count = list.totalRows;

  // TanStack Virtual hands back functions the React Compiler cannot memoise, so
  // it skips this component. Expected: the grid re-renders on scroll by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    // The sticky header sits above the rows inside the scroller.
    scrollPaddingStart: ROW_HEIGHT,
    scrollPaddingEnd: ROW_HEIGHT,
  });
  const items = virtualizer.getVirtualItems();
  const first = items[0]?.index ?? 0;
  const last = items[items.length - 1]?.index ?? -1;

  useEffect(() => {
    if (last >= first) onRange(first, last);
  }, [first, last, onRange]);

  const focusIndex = useMemo(
    () => (selectedId ? findLoaded(list, (row) => row.partyId === selectedId) : -1),
    [list, selectedId],
  );

  // A move onto a row whose page is not loaded yet waits for it, then selects.
  const pending = useRef<number | null>(null);
  useEffect(() => {
    const index = pending.current;
    if (index === null) return;
    const row = rowAt(list, index);
    if (row) {
      pending.current = null;
      onSelect(row);
    }
  }, [list, onSelect]);

  // Keep the selected row in view when it changes (arrow keys, Back).
  const lastScrolled = useRef<string | null>(null);
  useEffect(() => {
    if (focusIndex < 0 || !selectedId || lastScrolled.current === `${list.key}|${selectedId}`) return;
    lastScrolled.current = `${list.key}|${selectedId}`;
    virtualizer.scrollToIndex(focusIndex, { align: "auto" });
  }, [focusIndex, list.key, selectedId, virtualizer]);

  const moveTo = (index: number) => {
    if (count === 0) return;
    const clamped = Math.max(0, Math.min(count - 1, index));
    const row = rowAt(list, clamped);
    virtualizer.scrollToIndex(clamped, { align: "auto" });
    if (row) {
      pending.current = null;
      onSelect(row);
    } else {
      pending.current = clamped;
      onRange(clamped, clamped);
    }
  };

  const pageRows = Math.max(1, Math.floor((viewportRef.current?.clientHeight ?? ROW_HEIGHT * 10) / ROW_HEIGHT) - 2);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const current = focusIndex >= 0 ? focusIndex : -1;
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
        event.preventDefault();
        onEnter();
        break;
      default:
    }
  };

  const totals = totalCells(list.meta.totals, list.totalRows, ctx);

  return (
    <>
      <div
        ref={viewportRef}
        className={styles.gridViewport}
        tabIndex={0}
        role="grid"
        aria-label="Parties"
        aria-rowcount={count + 2}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (focusIndex < 0 && count > 0) moveTo(0);
        }}
      >
        <div className={styles.gridTable} style={{ minWidth: minWidth(cols) }}>
          <div className={styles.gridHead} style={{ gridTemplateColumns: gridTemplate }} role="row">
            {heads.map((head, i) => {
              const active = head.sort !== undefined && head.sort === sort;
              return (
                <div
                  key={`${head.label}-${i}`}
                  role="columnheader"
                  aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                  className={cx(head.num && styles.num, head.sort && styles.sortable, active && styles.sortActive)}
                  title={head.sort ? "Click to sort (the server sorts every row, not just the loaded ones)" : undefined}
                  onClick={head.sort ? () => onSort(head.sort as PartySort) : undefined}
                >
                  {head.label}
                  {active ? (dir === "asc" ? " ↑" : " ↓") : ""}
                </div>
              );
            })}
          </div>
          <div style={{ position: "relative", height: virtualizer.getTotalSize() }}>
            {items.map((item) => {
              const row = rowAt(list, item.index);
              const style = { transform: `translateY(${item.start}px)`, gridTemplateColumns: gridTemplate };
              if (!row) {
                return (
                  <div
                    key={item.key}
                    className={cx(styles.gridRow, styles.virtualRow, styles.rowPlaceholder)}
                    style={style}
                    role="row"
                    aria-busy="true"
                  >
                    <div />
                    <div>
                      <span className={styles.skeleton} />
                    </div>
                  </div>
                );
              }
              const selected = row.partyId === selectedId;
              return (
                <div
                  key={item.key}
                  className={cx(styles.gridRow, styles.virtualRow, selected && styles.rowFocused)}
                  style={style}
                  role="row"
                  aria-selected={selected}
                  data-party-id={row.partyId}
                  onMouseDown={() => onSelect(row)}
                  onDoubleClick={onEnter}
                >
                  <Line c={partyCells(row, ctx)} caret={selected} />
                </div>
              );
            })}
          </div>
          {count > 0 ? (
            <div className={styles.gridTotal} style={{ gridTemplateColumns: gridTemplate }} role="row">
              <Line c={totals} caret={false} total />
            </div>
          ) : null}
        </div>
        {count === 0 ? <div className={styles.emptyState}>No party has anything pending for these filters.</div> : null}
      </div>
      {pageError ? (
        <div className={styles.gridFoot}>
          <span>{pageError}</span>
          <button type="button" className={styles.linkButton} onClick={onRetryPages}>
            Retry
          </button>
        </div>
      ) : null}
    </>
  );
}
