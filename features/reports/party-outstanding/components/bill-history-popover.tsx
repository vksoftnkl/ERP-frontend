"use client";
/**
 * Alt+F1 on a bill: what settled it (plan §9.3, 3.0's third grid). Every
 * adjustment row, in date order, reversals included and signed. A post-dated
 * row that is not yet effective on As on says from when it counts. The
 * counter tender with no row of its own (backend §3.1) heads the list as
 * "paid at counter".
 *
 * Enter on a row opens that voucher, in the voucher's own scope. Esc closes.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/components/design-system/cx";
import { displayDate } from "@/features/reports/shared/wire/dates";
import { formatAmount } from "@/features/reports/shared/wire/money";
import { layoutViewportSize, type LayoutRect } from "@/lib/ui-scale";
import { Z_POPUP } from "@/lib/z-index";
import styles from "../page.module.scss";
import type { HistoryState } from "../query/use-bill-history";
import type { BillHistoryRow, BillRow } from "../wire/types";

type Props = {
  bill: BillRow;
  history: HistoryState | undefined;
  anchor: LayoutRect;
  onClose: () => void;
  onOpenVoucher: (row: BillHistoryRow) => void;
};

function typeWord(row: BillHistoryRow): string {
  const type = row.voucherType ?? row.adjType.replace(/_/g, " ").toLowerCase();
  return row.isReversal ? `${type} · reversal` : type;
}

/** `30-09`: from when a post-dated row counts. */
function dayMonth(iso: string): string {
  return displayDate(iso).slice(0, 5);
}

export function BillHistoryPopover({ bill, history, anchor, onClose, onOpenVoucher }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [top, setTop] = useState(anchor.bottom + 2);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [onClose]);

  // Below the row when it fits, above it otherwise.
  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 0;
    const viewport = layoutViewportSize();
    setTop(anchor.bottom + 2 + height > viewport.height - 8 ? Math.max(8, anchor.top - height - 2) : anchor.bottom + 2);
  }, [anchor, history]);

  const data = history?.status === "ready" ? history.data : null;

  const onRowKey = (event: KeyboardEvent<HTMLTableRowElement>, row: BillHistoryRow) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onOpenVoucher(row);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const sibling = event.key === "ArrowDown" ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling;
      (sibling as HTMLElement | null)?.focus();
    }
  };

  return createPortal(
    <div
      ref={ref}
      className={styles.popover}
      style={{ left: Math.max(8, anchor.left + 24), top, zIndex: Z_POPUP }}
      role="dialog"
      aria-label={`What settled ${bill.docRefno ?? "the bill"}`}
    >
      <div className={styles.popoverTitle}>
        <span>
          {bill.docRefno ?? "—"} · {displayDate(bill.docDate)} · bill {formatAmount(bill.billAmount)} · pending{" "}
          {formatAmount(data?.bill.pending ?? bill.pending)}
        </span>
        <button type="button" className={styles.popoverClose} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className={styles.popoverBody}>
        {!history || history.status === "loading" ? (
          <p className={styles.muted}>Loading what settled this bill…</p>
        ) : history.status === "error" ? (
          <p>{history.message}</p>
        ) : data && data.rows.length === 0 && !data.tenderAtBill ? (
          <p className={styles.muted}>Nothing has settled this bill yet.</p>
        ) : data ? (
          <table>
            <tbody>
              {data.tenderAtBill ? (
                <tr>
                  <td>{displayDate(data.bill.docDate)}</td>
                  <td colSpan={3}>paid at counter</td>
                  <td className={styles.num}>{formatAmount(data.tenderAtBill)}</td>
                </tr>
              ) : null}
              {data.rows.map((row, i) => (
                <tr
                  key={row.adjustmentId}
                  className={cx(styles.historyRow, (row.isReversal || !row.effective) && styles.historyMuted)}
                  tabIndex={0}
                  autoFocus={i === 0}
                  onKeyDown={(event) => onRowKey(event, row)}
                  onDoubleClick={() => onOpenVoucher(row)}
                >
                  <td>{displayDate(row.date)}</td>
                  <td>
                    {typeWord(row)}
                    {row.isPostDated && !row.effective ? (
                      <span className={styles.historySub}>PDC · from {dayMonth(row.date)}</span>
                    ) : null}
                    {row.reversalReason ? <span className={styles.historySub}>{row.reversalReason}</span> : null}
                  </td>
                  <td>
                    {row.voucherNo ?? "—"}
                    {row.chequeNo ? <span className={styles.historySub}>chq {row.chequeNo}</span> : null}
                  </td>
                  <td>{row.againstDocRefno ? `agst ${row.againstDocRefno}` : ""}</td>
                  <td className={styles.num}>{formatAmount(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {data?.dataWarning ? (
          <p className={styles.tAmber}>⚠ Data fault flagged by the server: {data.dataWarning}.</p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
