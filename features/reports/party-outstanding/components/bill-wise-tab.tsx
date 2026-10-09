"use client";
/**
 * Bill-wise (plan §11.1): the open items of every party in the filter, the
 * bills-grid columns plus Party and Area, sorted and paged by the server, with
 * the totals row from the response. Enter opens the bill; Alt+F1 shows what
 * settled it. A day picked on the Due calendar arrives as `dueOn`.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cx } from "@/components/design-system/cx";
import { displayDate } from "@/features/reports/shared/wire/dates";
import { formatAmount } from "@/features/reports/shared/wire/money";
import styles from "../page.module.scss";
import type { BillWiseList } from "../query/outstanding-loader";
import { findLoaded, rowAt } from "../query/pages";
import type { BillSort, SortDir } from "../query/params";
import { billCells, netCell, type GridContext } from "../view/cells";
import type { BillWiseRow } from "../wire/types";
import { ChipView } from "./chips";
import { BILL_WISE_COLUMNS, minWidth, template } from "./grid-columns";
import { toneClass } from "./tone";

const ROW_HEIGHT = 26;
const GRID = template(BILL_WISE_COLUMNS);
const MIN_WIDTH = minWidth(BILL_WISE_COLUMNS);

const HEADINGS: Array<{ label: string; sort?: BillSort; num?: boolean }> = [
  { label: "Party", sort: "party" },
  { label: "Area" },
  { label: "Date", sort: "date" },
  { label: "Type" },
  { label: "Bill no", sort: "refno" },
  { label: "Branch" },
  { label: "Due", sort: "due" },
  { label: "Bill amt", num: true },
  { label: "Adjusted", num: true },
  { label: "Pending", sort: "pending", num: true },
  { label: "Age", sort: "age", num: true },
  { label: "Overdue", sort: "overdue", num: true },
  { label: "Remarks" },
];

type Props = {
  list: BillWiseList;
  ctx: GridContext;
  sort: BillSort;
  dir: SortDir;
  dueOn: string | null;
  onSort: (sort: BillSort) => void;
  onClearDueOn: () => void;
  onRange: (first: number, last: number) => void;
  onDrill: (row: BillWiseRow) => void;
  onHistory: (row: BillWiseRow, anchor: HTMLElement) => void;
  initialFocus: string | null;
  onFocusBill: (billId: string | null) => void;
  pageError: string | null;
  onRetryPages: () => void;
  viewportRef: MutableRefObject<HTMLDivElement | null>;
};

export function BillWiseTab({
  list,
  ctx,
  sort,
  dir,
  dueOn,
  onSort,
  onClearDueOn,
  onRange,
  onDrill,
  onHistory,
  initialFocus,
  onFocusBill,
  pageError,
  onRetryPages,
  viewportRef,
}: Props) {
  const count = list.totalRows;
  const [focusId, setFocusId] = useState<string | null>(initialFocus);
  const focusIndex = useMemo(
    () => (focusId ? findLoaded(list, (row) => row.billId === focusId) : -1),
    [focusId, list],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollPaddingStart: ROW_HEIGHT,
    scrollPaddingEnd: ROW_HEIGHT,
  });
  const items = virtualizer.getVirtualItems();
  const first = items[0]?.index ?? 0;
  const last = items[items.length - 1]?.index ?? -1;
  useEffect(() => {
    if (last >= first) onRange(first, last);
  }, [first, last, onRange]);

  const focus = (row: BillWiseRow | undefined) => {
    const id = row?.billId ?? null;
    setFocusId(id);
    onFocusBill(id);
  };

  const pending = useRef<number | null>(null);
  useEffect(() => {
    if (pending.current === null) return;
    const row = rowAt(list, pending.current);
    if (row) {
      pending.current = null;
      setFocusId(row.billId);
      onFocusBill(row.billId);
    }
  }, [list, onFocusBill]);

  const moveTo = (index: number) => {
    if (count === 0) return;
    const clamped = Math.max(0, Math.min(count - 1, index));
    virtualizer.scrollToIndex(clamped, { align: "auto" });
    const row = rowAt(list, clamped);
    if (row) focus(row);
    else {
      pending.current = clamped;
      onRange(clamped, clamped);
    }
  };

  const rowElement = (billId: string) =>
    viewportRef.current?.querySelector<HTMLElement>(`[data-bill-id="${CSS.escape(billId)}"]`) ?? null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) return;
    const row = focusIndex >= 0 ? rowAt(list, focusIndex) : undefined;
    if (event.altKey) {
      if (event.key === "F1" && row) {
        event.preventDefault();
        const element = rowElement(row.billId);
        if (element) onHistory(row, element);
      }
      return;
    }
    const pageRows = Math.max(1, Math.floor((viewportRef.current?.clientHeight ?? ROW_HEIGHT * 10) / ROW_HEIGHT) - 2);
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveTo(focusIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveTo(Math.max(0, focusIndex - 1));
        break;
      case "PageDown":
        event.preventDefault();
        moveTo(focusIndex + pageRows);
        break;
      case "PageUp":
        event.preventDefault();
        moveTo(focusIndex - pageRows);
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
        if (row) {
          event.preventDefault();
          onDrill(row);
        }
        break;
      default:
    }
  };

  const t = list.meta.totals;
  const net = netCell(t.net, ctx.side);

  return (
    <div className={styles.section} style={{ flex: "1 1 auto" }}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionTitle}>Bills</span>
        <span className={styles.sectionNote}>
          {count.toLocaleString("en-IN")} open items · sorted by the server · Enter opens the bill · Alt+F1 what settled it
        </span>
        {dueOn ? (
          <span className={styles.sectionTools}>
            <span className={`${styles.chip} ${styles.chipInfo}`}>due on {displayDate(dueOn)}</span>
            <button type="button" className={styles.linkButton} onClick={onClearDueOn}>
              Show every due date
            </button>
          </span>
        ) : null}
      </div>
      <div
        ref={viewportRef}
        className={styles.gridViewport}
        tabIndex={0}
        role="grid"
        aria-label="Bill-wise"
        aria-rowcount={count + 2}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (focusIndex < 0 && count > 0) moveTo(0);
        }}
      >
        <div className={styles.gridTable} style={{ minWidth: MIN_WIDTH }}>
          <div className={styles.gridHead} style={{ gridTemplateColumns: GRID }} role="row">
            {HEADINGS.map((head) => {
              const active = head.sort === sort;
              return (
                <div
                  key={head.label}
                  role="columnheader"
                  aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                  className={cx(head.num && styles.num, head.sort && styles.sortable, active && styles.sortActive)}
                  onClick={head.sort ? () => onSort(head.sort as BillSort) : undefined}
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
              const style = { transform: `translateY(${item.start}px)`, gridTemplateColumns: GRID };
              if (!row) {
                return (
                  <div key={item.key} className={cx(styles.gridRow, styles.virtualRow, styles.rowPlaceholder)} style={style}>
                    <div>
                      <span className={styles.skeleton} />
                    </div>
                  </div>
                );
              }
              const c = billCells(row, ctx);
              const focused = row.billId === focusId;
              return (
                <div
                  key={item.key}
                  className={cx(styles.gridRow, styles.virtualRow, focused && styles.rowFocused)}
                  style={style}
                  role="row"
                  aria-selected={focused}
                  data-bill-id={row.billId}
                  onMouseDown={() => focus(row)}
                  onDoubleClick={() => onDrill(row)}
                >
                  <div title={row.partyName}>{row.partyName}</div>
                  <div title={row.area ?? undefined}>{row.area ?? ""}</div>
                  <div>{c.date}</div>
                  <div>
                    <ChipView chip={c.chip} />
                  </div>
                  <div title={c.refno}>{c.refno}</div>
                  <div title={c.branch}>{c.branch}</div>
                  <div className={cx(toneClass(c.due.tone), c.due.italic && styles.italic)} title={c.due.title}>
                    {c.due.text}
                  </div>
                  <div className={styles.num}>{c.billAmount}</div>
                  <div className={cx(styles.num, styles.tMuted)}>{c.adjusted}</div>
                  <div className={cx(styles.num, styles.strong, toneClass(c.pending.tone))}>{c.pending.text}</div>
                  <div className={cx(styles.num, toneClass(c.age.tone))}>{c.age.text}</div>
                  <div className={cx(styles.num, toneClass(c.overdue.tone))}>{c.overdue.text}</div>
                  <div className={styles.tMuted} title={c.remarks || undefined}>
                    {c.remarks}
                    {c.warning ? (
                      <span className={styles.warnGlyph} title={`Data fault flagged by the server: ${c.warning}.`}>
                        ⚠
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          {count > 0 ? (
            <div className={styles.gridTotal} style={{ gridTemplateColumns: GRID }} role="row">
              <div style={{ gridColumn: "1 / 8" }}>
                Total · {count.toLocaleString("en-IN")} open {count === 1 ? "item" : "items"}
              </div>
              <div className={styles.num}>{formatAmount(t.billAmount)}</div>
              <div className={cx(styles.num, styles.tMuted)}>{formatAmount(t.adjusted)}</div>
              <div className={cx(styles.num, toneClass(net.tone))}>{net.text}</div>
              <div />
              <div />
              <div />
            </div>
          ) : null}
        </div>
        {count === 0 ? <div className={styles.emptyState}>No open items for these filters.</div> : null}
      </div>
      {pageError ? (
        <div className={styles.gridFoot}>
          <span>{pageError}</span>
          <button type="button" className={styles.linkButton} onClick={onRetryPages}>
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}
