"use client";

/**
 * One price change log grid — Qt `PriceLogView` (setup / fill / the delegate),
 * shared by the report and its item-history popup.
 *
 * Day header lines span the grid; each change is a row whose "What changed"
 * cell is a row of chips (green up, red down, amber "below cost") and whose
 * Source is a chip too. Virtualised: a range can hold 10,000 changes.
 *
 * Keys (the viewport holds focus): ↑ / ↓ move — day headers are skipped —,
 * PgUp / PgDn a screenful, Home / End the ends, Enter opens the change.
 * Double-click opens it too. The selection is the caller's (by `ipclId`).
 */
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type KeyboardEvent,
  type Ref,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import {
  buildLines,
  changeLineIndex,
  dayHeaderText,
  firstChangeIndex,
  firstChangeOfDay,
  lastChangeIndex,
  stepChange,
  type GridLine,
} from "../view/grid-model";
import {
  appliesText,
  branchText,
  changeChips,
  changeText,
  deviceText,
  itemText,
  sourceLabel,
  timeText,
  whoText,
  type ChipTone,
} from "../view/words";
import type { PriceLogDay, PriceLogRow } from "../wire/types";

/** Fixed line heights (layout px): the virtualiser never measures. */
export const CHANGE_ROW_HEIGHT = 30;
export const DAY_ROW_HEIGHT = 28;

const U = "var(--erp-q-u, 1rem)";

/** Time · Item · Unit · Branch · Applies to · What changed · By · Device · Source · Reason (Qt widths / 16). */
const COLUMNS: ReadonlyArray<{ label: string; min: number; fr?: number }> = [
  { label: "Time", min: 4.9 },
  { label: "Item", min: 11, fr: 1.4 },
  { label: "Unit", min: 4 },
  { label: "Branch", min: 8, fr: 0.6 },
  { label: "Applies to", min: 7 },
  { label: "What changed", min: 22, fr: 3 },
  { label: "By", min: 5.6 },
  { label: "Device", min: 6.9 },
  { label: "Source", min: 7.2 },
  { label: "Reason", min: 7.5, fr: 1 },
];

const TEMPLATE = COLUMNS.map((col) =>
  col.fr ? `minmax(calc(${col.min} * ${U}), ${col.fr}fr)` : `calc(${col.min} * ${U})`,
).join(" ");
const MIN_WIDTH = `max(100%, calc(${COLUMNS.reduce((sum, col) => sum + col.min, 0).toFixed(2)} * ${U}))`;

export const CHIP_TONE_CLASS: Record<ChipTone, string> = {
  up: styles.chipUp,
  down: styles.chipDown,
  warn: styles.chipWarn,
  info: styles.chipInfo,
  neutral: styles.chipNeutral,
};

export type PriceLogGridHandle = {
  focus: () => void;
  /** The day strip: scroll the day's header to the top and select its first change. */
  jumpToDay: (day: string) => void;
};

export type PriceLogGridProps = {
  rows: readonly PriceLogRow[];
  /** `/days`, for the header counts; without it they are counted from the rows. */
  days?: readonly PriceLogDay[] | null;
  selectedId: string | null;
  onSelect: (row: PriceLogRow) => void;
  /** Enter / double-click. */
  onOpen: (row: PriceLogRow) => void;
  ariaLabel: string;
  /** Shown in the body when there is no row. */
  emptyText: string;
  autoFocus?: boolean;
  handleRef?: Ref<PriceLogGridHandle>;
  /** Dims the rows while a newer answer is on its way. */
  stale?: boolean;
};

function Cell({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className} title={text}>
      {text}
    </div>
  );
}

function ChangeCells({ row }: { row: PriceLogRow }) {
  const chips = changeChips(row);
  const source = sourceLabel(row.source);
  return (
    <>
      <Cell text={timeText(row.changedOn)} className={styles.num} />
      <Cell text={itemText(row)} />
      <Cell text={row.unitName ?? ""} />
      <Cell text={branchText(row)} className={row.branchName ? undefined : styles.muted} />
      <Cell text={appliesText(row)} />
      <div className={styles.chipCell} title={changeText(row)}>
        {chips.map((chip, i) => (
          <span key={`${chip.text}-${i}`} className={cx(styles.chip, CHIP_TONE_CLASS[chip.tone])}>
            {chip.text}
          </span>
        ))}
      </div>
      <Cell text={whoText(row)} />
      <Cell text={deviceText(row)} className={row.deviceName ? undefined : styles.muted} />
      <div className={styles.chipCell} title={source}>
        {source ? <span className={cx(styles.chip, styles.chipNeutral)}>{source}</span> : null}
      </div>
      <Cell text={row.reason ?? ""} />
    </>
  );
}

export function PriceLogGrid({
  rows,
  days,
  selectedId,
  onSelect,
  onOpen,
  ariaLabel,
  emptyText,
  autoFocus,
  handleRef,
  stale,
}: PriceLogGridProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  /**
   * `autoFocus` is focused when the element really attaches. React's own
   * `autoFocus` only covers form controls, and inside a portaled dialog a rAF
   * `focus()` can miss the late portal commit (memory: modal portal focus race).
   */
  const autoFocusRef = useRef(autoFocus);
  const attachViewport = useCallback((node: HTMLDivElement | null) => {
    viewportRef.current = node;
    if (node && autoFocusRef.current) {
      autoFocusRef.current = false;
      node.focus({ preventScroll: true });
    }
  }, []);
  const headRef = useRef<HTMLDivElement | null>(null);
  const lines = useMemo(() => buildLines(rows, days), [days, rows]);
  const selectedIndex = changeLineIndex(lines, selectedId);

  const sizeOf = useCallback(
    (index: number) => (lines[index]?.kind === "day" ? DAY_ROW_HEIGHT : CHANGE_ROW_HEIGHT),
    [lines],
  );
  const offsets = useMemo(() => {
    const out = new Array<number>(lines.length + 1);
    out[0] = 0;
    for (let i = 0; i < lines.length; i += 1) {
      out[i + 1] = out[i] + (lines[i].kind === "day" ? DAY_ROW_HEIGHT : CHANGE_ROW_HEIGHT);
    }
    return out;
  }, [lines]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is used the same way across the reports.
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: sizeOf,
    overscan: 12,
    getItemKey: (index) => lines[index]?.key ?? index,
  });
  const items = virtualizer.getVirtualItems();

  /** Keep line `index` in view below the sticky header (`top` puts it at the top). */
  const reveal = useCallback(
    (index: number, align: "auto" | "top" = "auto") => {
      const viewport = viewportRef.current;
      if (!viewport || index < 0 || index >= lines.length) return;
      const head = headRef.current?.offsetHeight ?? 0;
      const top = offsets[index];
      const bottom = offsets[index + 1] + head;
      if (align === "top") {
        viewport.scrollTop = top;
        return;
      }
      if (top < viewport.scrollTop) {
        viewport.scrollTop = top;
      } else if (bottom > viewport.scrollTop + viewport.clientHeight) {
        viewport.scrollTop = bottom - viewport.clientHeight;
      }
    },
    [lines.length, offsets],
  );

  const selectLine = useCallback(
    (index: number) => {
      const line: GridLine | undefined = lines[index];
      if (!line || line.kind !== "change") return;
      onSelect(line.row);
      reveal(index);
    },
    [lines, onSelect, reveal],
  );

  useImperativeHandle(
    handleRef,
    () => ({
      focus: () => viewportRef.current?.focus({ preventScroll: true }),
      jumpToDay: (day: string) => {
        const first = firstChangeOfDay(lines, day);
        if (first < 0) return;
        reveal(first - 1, "top");
        const line = lines[first];
        if (line.kind === "change") onSelect(line.row);
        viewportRef.current?.focus({ preventScroll: true });
      },
    }),
    [lines, onSelect, reveal],
  );

  // A selection made from outside (the first row after a load) is brought into view.
  const lastRevealed = useRef<string | null>(null);
  useEffect(() => {
    if (selectedIndex < 0 || !selectedId || lastRevealed.current === selectedId) return;
    lastRevealed.current = selectedId;
    reveal(selectedIndex);
  }, [reveal, selectedId, selectedIndex]);

  const pageSteps = Math.max(
    1,
    Math.floor((viewportRef.current?.clientHeight ?? CHANGE_ROW_HEIGHT * 12) / CHANGE_ROW_HEIGHT) - 2,
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        selectLine(stepChange(lines, selectedIndex, 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        selectLine(stepChange(lines, selectedIndex, -1));
        break;
      case "PageDown":
        event.preventDefault();
        selectLine(stepChange(lines, selectedIndex, pageSteps));
        break;
      case "PageUp":
        event.preventDefault();
        selectLine(stepChange(lines, selectedIndex, -pageSteps));
        break;
      case "Home":
        event.preventDefault();
        selectLine(firstChangeIndex(lines));
        break;
      case "End":
        event.preventDefault();
        selectLine(lastChangeIndex(lines));
        break;
      case "Enter": {
        if (event.shiftKey) return;
        const line = lines[selectedIndex];
        if (line?.kind === "change") {
          event.preventDefault();
          onOpen(line.row);
        }
        break;
      }
      default:
    }
  };

  return (
    <div
      ref={attachViewport}
      className={cx(styles.gridViewport, stale && styles.stale)}
      tabIndex={0}
      role="grid"
      aria-label={ariaLabel}
      aria-rowcount={lines.length + 1}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        if (event.target === event.currentTarget && selectedIndex < 0) {
          selectLine(firstChangeIndex(lines));
        }
      }}
    >
      <div className={styles.gridTable} style={{ minWidth: MIN_WIDTH }}>
        <div ref={headRef} className={styles.gridHead} style={{ gridTemplateColumns: TEMPLATE }} role="row">
          {COLUMNS.map((col) => (
            <div key={col.label} role="columnheader">
              {col.label}
            </div>
          ))}
        </div>
        <div style={{ position: "relative", height: virtualizer.getTotalSize() }}>
          {items.map((item) => {
            const line = lines[item.index];
            if (!line) return null;
            if (line.kind === "day") {
              return (
                <div
                  key={item.key}
                  className={cx(styles.dayRow, styles.virtualRow)}
                  style={{ transform: `translateY(${item.start}px)`, height: DAY_ROW_HEIGHT }}
                  role="row"
                  title={dayHeaderText(line)}
                >
                  <span className={styles.dayRowDay}>{line.dayLabel}</span>
                  <span className={styles.dayRowSep}>·</span>
                  <span>{line.counts}</span>
                </div>
              );
            }
            const selected = item.index === selectedIndex;
            return (
              <div
                key={item.key}
                className={cx(styles.gridRow, styles.virtualRow, selected && styles.rowFocused)}
                style={{
                  transform: `translateY(${item.start}px)`,
                  height: CHANGE_ROW_HEIGHT,
                  gridTemplateColumns: TEMPLATE,
                }}
                role="row"
                aria-selected={selected}
                data-ipcl-id={line.row.ipclId}
                onMouseDown={() => onSelect(line.row)}
                onDoubleClick={() => onOpen(line.row)}
              >
                <ChangeCells row={line.row} />
              </div>
            );
          })}
        </div>
      </div>
      {lines.length === 0 ? <div className={styles.emptyState}>{emptyText}</div> : null}
    </div>
  );
}
