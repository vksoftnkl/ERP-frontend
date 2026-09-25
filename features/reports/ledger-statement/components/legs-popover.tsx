"use client";
/**
 * Alt+F1: every leg of the focused voucher, anchored to its row (plan §8.5).
 * This ledger's own leg(s) are bold at the foot; role legs (TDS, bank
 * charges…) carry their role as a caption. Esc closes it, and Alt+F1 on
 * another row moves it.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/components/design-system/cx";
import { layoutViewportSize, type LayoutRect } from "@/lib/ui-scale";
import { Z_POPUP } from "@/lib/z-index";
import styles from "../page.module.scss";
import type { LegsState } from "../grid/grid-model";
import { displayDate } from "../wire/dates";
import { formatAmount } from "../wire/money";
import type { VoucherLeg, VoucherRow } from "../wire/types";
import { typeText } from "./type-chip";

type Props = {
  row: VoucherRow;
  legs: LegsState | undefined;
  anchor: LayoutRect;
  onClose: () => void;
};

function LegLine({ leg }: { leg: VoucherLeg }) {
  return (
    <tr className={cx(leg.isThisLedger && styles.legSelf)}>
      <td>{leg.side === "DR" ? "Dr" : "Cr"}</td>
      <td>
        {leg.ledgerName ?? "—"}
        {leg.role ? <span className={styles.legRole}>{leg.role.replace(/_/g, " ")}</span> : null}
        {leg.remarks ? <span className={styles.legRole}>{leg.remarks}</span> : null}
      </td>
      <td className={styles.num}>{formatAmount(leg.amount)}</td>
    </tr>
  );
}

export function LegsPopover({ row, legs, anchor, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [top, setTop] = useState(anchor.bottom + 2);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
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
  }, [anchor, legs]);

  const all = legs?.status === "ready" ? legs.legs : [];
  const others = all.filter((leg) => !leg.isThisLedger);
  const own = all.filter((leg) => leg.isThisLedger);

  return createPortal(
    <div
      ref={ref}
      className={styles.popover}
      style={{ left: Math.max(8, anchor.left + 24), top, zIndex: Z_POPUP }}
      role="dialog"
      aria-label={`Legs of ${row.voucherNo ?? "voucher"}`}
    >
      <div className={styles.popoverTitle}>
        <span>
          {row.voucherNo ?? "—"} · {displayDate(row.date)} · {typeText(row)} · {row.status}
        </span>
        <button type="button" className={styles.popoverClose} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className={styles.popoverBody}>
        {!legs || legs.status === "loading" ? (
          <p className={styles.muted}>Loading the legs…</p>
        ) : legs.status === "error" ? (
          <p>{legs.message}</p>
        ) : (
          <table>
            <tbody>
              {others.map((leg) => (
                <LegLine key={leg.rowNo} leg={leg} />
              ))}
              {own.map((leg) => (
                <LegLine key={leg.rowNo} leg={leg} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>,
    document.body,
  );
}
