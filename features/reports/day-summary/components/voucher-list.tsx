"use client";
/**
 * The Vouchers tab's list (plan §8.1): virtualised, fed by pages of 200.
 * Columns ▸, Date, Type, Voucher no, Party / particulars, Narration, Amount,
 * Branch (hidden for one branch), By. A cancelled original is struck through
 * with "· CANCELLED" on its chip; its mirror wears a red chip. The server's
 * order keeps an in-range pair together.
 *
 * ▸ (or Space / → / ←) folds a voucher's legs; the legs come with the page
 * (`withLegs=true`, one round trip), so the first ▸ asks the list again with
 * legs. Nothing here computes a figure.
 *
 * Keys (the viewport holds focus): ↑/↓ move, Home/End jump (End asks for the
 * last page directly), Enter / double-click open the voucher.
 */
import { useEffect, useMemo, useRef, type KeyboardEvent, type MutableRefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cx } from "@/components/design-system/cx";
import { formatAmount } from "@/features/reports/shared/wire/money";
import styles from "../page.module.scss";
import { pageOf, type PagesState } from "../query/pages";
import { voucherCells } from "../view/cells";
import type { Leg, VoucherRow } from "../wire/types";
import { TypeChip } from "./type-chip";

export const ROW_HEIGHT = 26;

type ListRow =
  | { kind: "voucher"; key: string; index: number; row: VoucherRow }
  | { kind: "placeholder"; key: string; index: number }
  | { kind: "leg"; key: string; parent: VoucherRow; leg: Leg }
  | { kind: "legs-pending"; key: string; parent: VoucherRow };

/** The list as drawn: loaded vouchers, holes for unloaded pages, legs under the open ones. */
export function buildList(pages: PagesState, isOpen: (row: VoucherRow) => boolean): ListRow[] {
  const out: ListRow[] = [];
  for (let index = 0; index < pages.totalRows; index += 1) {
    const row = pages.pages.get(pageOf(pages, index))?.rows[index % pages.pageSize];
    if (!row) {
      out.push({ kind: "placeholder", key: `p:${index}`, index });
      continue;
    }
    out.push({ kind: "voucher", key: `v:${row.voucherId}`, index, row });
    if (!row.draft && isOpen(row)) {
      if (row.legs === null) out.push({ kind: "legs-pending", key: `lp:${row.voucherId}`, parent: row });
      else row.legs.forEach((leg, i) => out.push({ kind: "leg", key: `l:${row.voucherId}:${i}`, parent: row, leg }));
    }
  }
  return out;
}

type Props = {
  pages: PagesState;
  showBranch: boolean;
  isOpen: (row: VoucherRow) => boolean;
  onToggle: (row: VoucherRow) => void;
  onDrill: (row: VoucherRow) => void;
  onRange: (first: number, last: number) => void;
  focusId: string | null;
  onFocusId: (voucherId: string | null) => void;
  viewportRef: MutableRefObject<HTMLDivElement | null>;
};

function template(showBranch: boolean): string {
  return [
    "22px",
    "84px",
    "minmax(96px, 150px)",
    "minmax(90px, 110px)",
    "minmax(140px, 1.3fr)",
    "minmax(140px, 1.5fr)",
    "minmax(100px, 124px)",
    showBranch ? "minmax(90px, 120px)" : null,
    "minmax(64px, 90px)",
  ]
    .filter(Boolean)
    .join(" ");
}

export function VoucherList({ pages, showBranch, isOpen, onToggle, onDrill, onRange, focusId, onFocusId, viewportRef }: Props) {
  const rows = useMemo(() => buildList(pages, isOpen), [pages, isOpen]);
  const columns = template(showBranch);

  // TanStack Virtual hands back functions the React Compiler cannot memoise, so
  // it skips this component. Expected: the list re-renders on scroll by design.
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

  // Ask for the pages under the viewport. Leg rows carry no voucher index.
  useEffect(() => {
    let lo = -1;
    let hi = -1;
    for (let i = first; i <= last; i += 1) {
      const r = rows[i];
      if (r && (r.kind === "voucher" || r.kind === "placeholder")) {
        if (lo < 0) lo = r.index;
        hi = r.index;
      }
    }
    if (lo >= 0) onRange(lo, hi);
  }, [first, last, rows, onRange]);

  const focusIndex = useMemo(
    () => (focusId ? rows.findIndex((r) => r.kind === "voucher" && r.row.voucherId === focusId) : -1),
    [rows, focusId],
  );

  // After Back, the voucher left from is brought into view once it is loaded.
  const revealed = useRef<string | null>(null);
  useEffect(() => {
    if (focusIndex < 0 || revealed.current === focusId) return;
    revealed.current = focusId;
    virtualizer.scrollToIndex(focusIndex, { align: "center" });
  }, [focusId, focusIndex, virtualizer]);

  // End jumps to the last page; keep following the bottom until it is in.
  const followEnd = useRef(false);
  useEffect(() => {
    if (!followEnd.current || rows.length === 0) return;
    const lastVoucher = [...rows].reverse().find((r) => r.kind === "voucher");
    if (lastVoucher && lastVoucher.kind === "voucher" && lastVoucher.index === pages.totalRows - 1) {
      followEnd.current = false;
      onFocusId(lastVoucher.row.voucherId);
    }
    virtualizer.scrollToIndex(rows.length - 1, { align: "end" });
  }, [rows, onFocusId, pages.totalRows, virtualizer]);

  const voucherAt = (gridIndex: number, dir: 1 | -1): number => {
    for (let i = gridIndex; i >= 0 && i < rows.length; i += dir) if (rows[i].kind === "voucher") return i;
    return -1;
  };

  const moveTo = (gridIndex: number, dir: 1 | -1) => {
    const at = voucherAt(Math.max(0, Math.min(rows.length - 1, gridIndex)), dir);
    const target = at >= 0 ? at : voucherAt(Math.max(0, Math.min(rows.length - 1, gridIndex)), dir === 1 ? -1 : 1);
    const row = rows[target];
    if (!row || row.kind !== "voucher") return;
    onFocusId(row.row.voucherId);
    virtualizer.scrollToIndex(target, { align: "auto" });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const current = focusIndex >= 0 ? focusIndex : -1;
    const focused = current >= 0 ? rows[current] : undefined;
    followEnd.current = event.key === "End";
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveTo(current + 1, 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveTo(current < 0 ? 0 : current - 1, -1);
        break;
      case "Home":
        event.preventDefault();
        moveTo(0, 1);
        break;
      case "End":
        event.preventDefault();
        if (pages.totalRows > 0) onRange(pages.totalRows - 1, pages.totalRows - 1);
        moveTo(rows.length - 1, -1);
        break;
      case "Enter":
        if (focused?.kind === "voucher") {
          event.preventDefault();
          onDrill(focused.row);
        }
        break;
      case " ":
      case "ArrowRight":
      case "ArrowLeft":
        if (focused?.kind === "voucher" && !focused.row.draft) {
          const open = isOpen(focused.row);
          if (event.key === " " || (event.key === "ArrowRight") !== open) {
            event.preventDefault();
            onToggle(focused.row);
          }
        }
        break;
      default:
    }
  };

  return (
    <div
      ref={viewportRef}
      className={styles.gridViewport}
      tabIndex={0}
      role="grid"
      aria-label="Vouchers"
      aria-rowcount={rows.length}
      onKeyDown={onKeyDown}
      onFocus={() => {
        if (focusId) return;
        const firstVoucher = rows.find((r) => r.kind === "voucher");
        if (firstVoucher && firstVoucher.kind === "voucher") onFocusId(firstVoucher.row.voucherId);
      }}
    >
      <div className={styles.gridTable}>
        <div className={styles.gridHead} style={{ gridTemplateColumns: columns }} role="row">
          <div />
          <div>Date</div>
          <div>Type</div>
          <div>Voucher no</div>
          <div>Party / particulars</div>
          <div>Narration</div>
          <div className={styles.num}>Amount</div>
          {showBranch ? <div>Branch</div> : null}
          <div>By</div>
        </div>
        <div style={{ position: "relative", height: virtualizer.getTotalSize() }}>
          {pages.totalRows === 0 ? (
            <div className={styles.emptyState}>No vouchers for these filters.</div>
          ) : null}
          {items.map((item) => {
            const row = rows[item.index];
            const style = { transform: `translateY(${item.start}px)`, gridTemplateColumns: columns };
            switch (row.kind) {
              case "placeholder":
                return (
                  <div key={row.key} className={cx(styles.gridRow, styles.rowPlaceholder)} style={style} aria-busy="true">
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
                  </div>
                );
              case "legs-pending":
                return (
                  <div key={row.key} className={cx(styles.gridRow, styles.rowLeg)} style={style}>
                    <div />
                    <div style={{ gridColumn: "2 / -1" }} className={styles.legIndent}>
                      Loading the legs…
                    </div>
                  </div>
                );
              case "leg": {
                const { leg } = row;
                return (
                  <div key={row.key} className={cx(styles.gridRow, styles.rowLeg)} style={style}>
                    <div />
                    <div />
                    <div />
                    <div />
                    <div className={styles.legIndent} title={leg.ledgerName ?? undefined}>
                      {leg.side === "DR" ? "Dr" : "Cr"} {leg.ledgerName ?? "—"}
                      {leg.role ? <span className={styles.mutedCell}> · {leg.role.replace(/_/g, " ").toLowerCase()}</span> : null}
                    </div>
                    <div />
                    <div className={styles.num}>
                      {formatAmount(leg.amount)} {leg.side === "DR" ? "Dr" : "Cr"}
                    </div>
                    {showBranch ? <div /> : null}
                    <div />
                  </div>
                );
              }
              case "voucher": {
                const v = row.row;
                const c = voucherCells(v);
                const open = isOpen(v);
                return (
                  <div
                    key={row.key}
                    className={cx(
                      styles.gridRow,
                      styles.rowVoucher,
                      c.chip.variant === "cancelled" && styles.rowCancelled,
                      c.chip.variant === "reversal" && styles.rowReversal,
                      v.draft && styles.rowDraft,
                      item.index === focusIndex && styles.rowFocused,
                    )}
                    style={style}
                    role="row"
                    onMouseDown={() => onFocusId(v.voucherId)}
                    onDoubleClick={() => onDrill(v)}
                  >
                    <div>
                      {!v.draft ? (
                        <button
                          type="button"
                          className={styles.toggle}
                          tabIndex={-1}
                          aria-label={open ? "Fold the legs" : "Show the legs"}
                          aria-expanded={open}
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggle(v);
                          }}
                        >
                          {open ? "▾" : "▸"}
                        </button>
                      ) : null}
                    </div>
                    <div>{c.date}</div>
                    <div>
                      <TypeChip chip={c.chip} reversal={c.chip.variant === "reversal"} />
                    </div>
                    <div title={c.voucherNo}>{c.voucherNo}</div>
                    <div className={c.party.muted ? styles.mutedCell : undefined} title={c.party.text}>
                      {c.party.text}
                    </div>
                    <div title={c.narration || undefined}>{c.narration}</div>
                    <div className={styles.num}>
                      {c.amount}
                      {v.draft ? <span className={styles.draftTag}>draft</span> : null}
                    </div>
                    {showBranch ? <div title={c.branch}>{c.branch}</div> : null}
                    <div title={c.by || undefined}>{c.by}</div>
                  </div>
                );
              }
            }
          })}
        </div>
      </div>
    </div>
  );
}
