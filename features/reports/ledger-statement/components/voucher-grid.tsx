"use client";
/**
 * The voucher grid (plan §8): virtualised, fed by pages of 200, with the
 * synthetic Opening / Total / Closing rows around the report's own.
 *
 * Nothing here computes a figure. Every amount printed is a string the server
 * sent: a row's own debit, credit and balance, or `header.period`'s.
 *
 * Keys (the viewport holds focus): ↑/↓ move, Home/End jump (End loads the
 * last page directly), Enter / double-click open the voucher, Space or → / ←
 * expand or fold an "as per details" row. Alt+F1 (the legs popover) and
 * PgUp/PgDn (the next ledger) belong to the screen.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import { indexSpan, pairOf, type GridModel, type GridRow } from "../grid/grid-model";
import { displayDate } from "../wire/dates";
import { formatAmount, formatBal, formatCell } from "../wire/money";
import type { VoucherRow } from "../wire/types";
import { TypeChip } from "./type-chip";

export const ROW_HEIGHT = 26;

export type GridDisplay = {
  showBranch: boolean;
  showNarration: boolean;
  showBalance: boolean;
};

type Props = {
  model: GridModel;
  display: GridDisplay;
  loadedRows: readonly VoucherRow[];
  expanded: ReadonlySet<string>;
  focusKey: string | null;
  /** A state setter: takes a key, or an updater over the current one. */
  onFocusKey: (key: string | ((current: string | null) => string | null)) => void;
  onToggle: (row: VoucherRow) => void;
  onDrill: (row: VoucherRow) => void;
  onRange: (first: number, last: number) => void;
  pageError: string | null;
  onRetryPages: () => void;
  viewportRef: MutableRefObject<HTMLDivElement | null>;
};

function columnsTemplate(display: GridDisplay): string {
  return [
    "22px",
    "84px",
    "minmax(92px, 132px)",
    "minmax(84px, 110px)",
    "minmax(130px, 1.2fr)",
    "minmax(150px, 1.7fr)",
    display.showBranch ? "minmax(80px, 110px)" : null,
    "minmax(96px, 118px)",
    "minmax(96px, 118px)",
    display.showBalance ? "minmax(118px, 140px)" : null,
    "minmax(64px, 96px)",
  ]
    .filter(Boolean)
    .join(" ");
}

function refText(row: VoucherRow, showNarration: boolean): string {
  const refs = row.billRefs.length ? `agst ${row.billRefs.join(", ")}` : "";
  const narration = showNarration ? (row.narration ?? "") : "";
  return [refs, narration].filter(Boolean).join(" · ");
}

export function VoucherGrid({
  model,
  display,
  loadedRows,
  expanded,
  focusKey,
  onFocusKey,
  onToggle,
  onDrill,
  onRange,
  pageError,
  onRetryPages,
  viewportRef,
}: Props) {
  const rows = model.rows;
  const template = columnsTemplate(display);
  const [hoverId, setHoverId] = useState<string | null>(null);

  // TanStack Virtual hands back functions the React Compiler cannot memoise, so
  // it skips this component. Expected, and harmless: the grid re-renders on
  // scroll by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
  });
  const items = virtualizer.getVirtualItems();
  const first = items[0]?.index ?? 0;
  const last = items[items.length - 1]?.index ?? -1;

  // Load the pages under the viewport. Legs sub-rows carry no index, so they
  // never enter this sum.
  useEffect(() => {
    const span = indexSpan(rows, first, last);
    if (span) onRange(span[0], span[1]);
  }, [first, last, rows, onRange]);

  const focusIndex = useMemo(() => rows.findIndex((r) => r.key === focusKey), [rows, focusKey]);

  // End asks for the last page, and the rows it brings (plus Total, Closing
  // and any expanded legs) land after the jump. Keep following the bottom
  // until they are all in, or until another key takes over.
  const followEnd = useRef(false);
  useEffect(() => {
    if (!followEnd.current || rows.length === 0) return;
    if (model.pendingRows === 0) followEnd.current = false;
    onFocusKey(rows[rows.length - 1].key);
    virtualizer.scrollToIndex(rows.length - 1, { align: "end" });
  }, [rows, model.pendingRows, onFocusKey, virtualizer]);

  const pairId = useMemo(() => {
    if (!hoverId) return null;
    const row = loadedRows.find((r) => r.voucherId === hoverId);
    return row ? (pairOf(row, loadedRows)?.voucherId ?? null) : null;
  }, [hoverId, loadedRows]);

  const moveTo = (index: number) => {
    const clamped = Math.max(0, Math.min(rows.length - 1, index));
    const row = rows[clamped];
    if (!row) return;
    onFocusKey(row.key);
    virtualizer.scrollToIndex(clamped, { align: "auto" });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const current = focusIndex >= 0 ? focusIndex : 0;
    const row = rows[current];
    followEnd.current = event.key === "End";
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveTo(focusIndex < 0 ? 0 : current + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveTo(current - 1);
        break;
      case "Home":
        event.preventDefault();
        moveTo(0);
        break;
      case "End": {
        event.preventDefault();
        // Straight to the last page: no page in between is loaded.
        const lastVoucher = [...rows].reverse().find((r) => r.kind === "voucher" || r.kind === "placeholder");
        if (lastVoucher && (lastVoucher.kind === "voucher" || lastVoucher.kind === "placeholder")) {
          onRange(lastVoucher.index, lastVoucher.index);
        }
        moveTo(rows.length - 1);
        break;
      }
      case "Enter":
        if (row?.kind === "voucher") {
          event.preventDefault();
          onDrill(row.row);
        }
        break;
      case " ":
      case "ArrowRight":
      case "ArrowLeft":
        if (row?.kind === "voucher" && row.row.asPerDetails) {
          const open = expanded.has(row.row.voucherId);
          if (event.key === " " || (event.key === "ArrowRight") !== open) {
            event.preventDefault();
            onToggle(row.row);
          }
        }
        break;
      default:
    }
  };

  return (
    <>
      <div
        ref={viewportRef}
        className={styles.gridViewport}
        tabIndex={0}
        role="grid"
        aria-label="Vouchers"
        aria-rowcount={rows.length}
        onKeyDown={onKeyDown}
        onFocus={() => {
          // Only when nothing is focused yet. An updater, because a restore
          // after Back sets the key and focuses the viewport in the same frame,
          // and a value read from this render would overwrite it.
          const firstKey = rows[0]?.key;
          if (firstKey) onFocusKey((current) => current ?? firstKey);
        }}
      >
        <div className={styles.gridTable}>
          <div className={styles.gridHead} style={{ gridTemplateColumns: template }} role="row">
            <div />
            <div>Date</div>
            <div>Type</div>
            <div>Voucher</div>
            <div>Particulars</div>
            <div>Ref / narration</div>
            {display.showBranch ? <div>Branch</div> : null}
            <div className={styles.num}>Debit</div>
            <div className={styles.num}>Credit</div>
            {display.showBalance ? <div className={styles.num}>Balance</div> : null}
            <div>By</div>
          </div>
          <div style={{ position: "relative", height: virtualizer.getTotalSize() }}>
            {items.map((item) => {
              const row = rows[item.index];
              return (
                <GridLine
                  key={row.key}
                  row={row}
                  gridIndex={item.index}
                  top={item.start}
                  template={template}
                  display={display}
                  focused={item.index === focusIndex}
                  expanded={row.kind === "voucher" && expanded.has(row.row.voucherId)}
                  pairHighlight={row.kind === "voucher" && row.row.voucherId === pairId}
                  onFocus={() => onFocusKey(row.key)}
                  onToggle={onToggle}
                  onDrill={onDrill}
                  onHover={setHoverId}
                />
              );
            })}
          </div>
        </div>
      </div>
      {model.pendingRows > 0 || pageError ? (
        <div className={styles.gridFoot}>
          {pageError ? (
            <>
              <span>{pageError}</span>
              <button type="button" className={styles.linkButton} onClick={onRetryPages}>
                Retry
              </button>
            </>
          ) : (
            <span>
              … {model.pendingRows.toLocaleString("en-IN")} more rows. Total and Closing appear when the last page
              loads. <kbd>End</kbd> jumps there.
            </span>
          )}
        </div>
      ) : null}
    </>
  );
}

type LineProps = {
  row: GridRow;
  gridIndex: number;
  top: number;
  template: string;
  display: GridDisplay;
  focused: boolean;
  expanded: boolean;
  pairHighlight: boolean;
  onFocus: () => void;
  onToggle: (row: VoucherRow) => void;
  onDrill: (row: VoucherRow) => void;
  onHover: (voucherId: string | null) => void;
};

function GridLine({
  row,
  gridIndex,
  top,
  template,
  display,
  focused,
  expanded,
  pairHighlight,
  onFocus,
  onToggle,
  onDrill,
  onHover,
}: LineProps) {
  const style = { transform: `translateY(${top}px)`, gridTemplateColumns: template };
  const common = {
    role: "row" as const,
    "data-grid-index": gridIndex,
    onMouseDown: onFocus,
    style,
  };
  const branchCell = display.showBranch ? <div /> : null;
  const balanceCell = (content: string) => (display.showBalance ? <div className={styles.num}>{content}</div> : null);

  switch (row.kind) {
    case "opening":
    case "closing": {
      const isOpening = row.kind === "opening";
      const label = isOpening ? `b/f from ${displayDate(row.asOf)}` : "c/f";
      return (
        <div {...common} className={cx(styles.gridRow, isOpening ? styles.rowSynthetic : styles.rowClosing, focused && styles.rowFocused)}>
          <div />
          <div>{displayDate(row.asOf)}</div>
          <div />
          <div />
          <div>{isOpening ? "Opening balance" : "Closing balance"}</div>
          {/* With the Balance column hidden, these two rows still ARE the balance. */}
          <div>{display.showBalance ? label : `${label} · ${formatBal(row.bal)}`}</div>
          {branchCell}
          <div />
          <div />
          {balanceCell(formatBal(row.bal))}
          <div />
        </div>
      );
    }
    case "total":
      return (
        <div {...common} className={cx(styles.gridRow, styles.rowSynthetic, focused && styles.rowFocused)}>
          <div />
          <div />
          <div />
          <div />
          <div>Total for the period</div>
          <div />
          {branchCell}
          <div className={styles.num}>{formatAmount(row.debit)}</div>
          <div className={styles.num}>{formatAmount(row.credit)}</div>
          {balanceCell("")}
          <div />
        </div>
      );
    case "empty":
      return (
        <div {...common} className={cx(styles.gridRow, focused && styles.rowFocused)}>
          <div />
          <div style={{ gridColumn: "2 / -1" }} className={styles.muted}>
            No vouchers in this period.
          </div>
        </div>
      );
    case "placeholder":
      return (
        <div {...common} className={cx(styles.gridRow, styles.rowPlaceholder, focused && styles.rowFocused)} aria-busy="true">
          <div />
          <div>
            <span className={styles.skeleton} />
          </div>
          <div>
            <span className={styles.skeleton} />
          </div>
          <div>
            <span className={styles.skeleton} />
          </div>
          <div>
            <span className={styles.skeleton} />
          </div>
          <div />
        </div>
      );
    case "legs-status":
      return (
        <div {...common} className={cx(styles.gridRow, styles.rowLeg)}>
          <div />
          <div style={{ gridColumn: "2 / -1" }} className={styles.legIndent}>
            {row.status === "loading" ? "Loading the legs…" : (row.message ?? "The legs could not be loaded.")}
          </div>
        </div>
      );
    case "leg": {
      const { leg } = row;
      return (
        <div {...common} className={cx(styles.gridRow, styles.rowLeg, focused && styles.rowFocused)}>
          <div />
          <div />
          <div />
          <div />
          <div className={styles.legIndent} title={leg.remarks ?? undefined}>
            {leg.side === "DR" ? "Dr" : "Cr"} {leg.ledgerName ?? "—"}
            {leg.role ? <span className={styles.muted}> · {leg.role.replace(/_/g, " ").toLowerCase()}</span> : null}
          </div>
          <div />
          {branchCell}
          <div className={styles.num}>{leg.side === "DR" ? formatAmount(leg.amount) : ""}</div>
          <div className={styles.num}>{leg.side === "CR" ? formatAmount(leg.amount) : ""}</div>
          {balanceCell("")}
          <div />
        </div>
      );
    }
    case "voucher": {
      const v = row.row;
      const muted = v.rowKind !== "NORMAL";
      return (
        <div
          {...common}
          className={cx(
            styles.gridRow,
            styles.rowVoucher,
            muted && styles.rowMuted,
            focused && styles.rowFocused,
            pairHighlight && styles.rowPairHover,
          )}
          onDoubleClick={() => onDrill(v)}
          onMouseEnter={muted ? () => onHover(v.voucherId) : undefined}
          onMouseLeave={muted ? () => onHover(null) : undefined}
        >
          <div>
            {v.asPerDetails ? (
              <button
                type="button"
                className={styles.toggle}
                tabIndex={-1}
                aria-label={expanded ? "Fold the legs" : "Show the legs"}
                aria-expanded={expanded}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle(v);
                }}
              >
                {expanded ? "▾" : "▸"}
              </button>
            ) : null}
          </div>
          <div>{displayDate(v.date)}</div>
          <div>
            <TypeChip row={v} />
            {v.pairOutsideRange ? (
              <span className={styles.pairGlyph} title="The other half of this cancel is outside the dates shown.">
                ⇢
              </span>
            ) : null}
          </div>
          <div title={v.voucherNo ?? undefined}>{v.voucherNo ?? "—"}</div>
          <div title={v.particulars ?? "(as per details)"}>
            {v.particulars ?? <span className={styles.muted}>(as per details)</span>}
          </div>
          <div title={refText(v, true) || undefined}>{refText(v, display.showNarration)}</div>
          {display.showBranch ? <div title={v.branchName ?? undefined}>{v.branchName ?? "—"}</div> : null}
          <div className={styles.num}>{formatCell(v.debit)}</div>
          <div className={styles.num}>{formatCell(v.credit)}</div>
          {balanceCell(formatBal(v.balance))}
          <div title={v.createdBy ?? undefined}>{v.createdBy ?? ""}</div>
        </div>
      );
    }
  }
}
