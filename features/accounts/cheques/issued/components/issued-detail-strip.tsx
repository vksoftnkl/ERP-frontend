"use client";

/**
 * The current row's `/issued-cheques/get`, in one strip: what it was written
 * on, its book, who it is to, how it is crossed, and — once it has moved —
 * what moved it and which voucher reversed it.
 */
import type { ReactNode } from "react";
import { formatAmount, formatDate } from "../../domain/chequeRow";
import { describeIssued } from "../domain/row";
import type { IssuedChequePayload, IssuedChequeRow } from "../issued.types";
import styles from "../../cheques.module.scss";

export type IssuedDetailStripProps = {
  row: IssuedChequeRow | null;
  /** Only ever the detail OF `row` — the screen drops anyone else's. */
  detail: IssuedChequePayload | null;
  loading: boolean;
  /** The server's sentence on a 403, or a generic line on anything else. */
  error: string | null;
};

export function IssuedDetailStrip({ row, detail, loading, error }: IssuedDetailStripProps) {
  if (!row) {
    return (
      <section className={styles.detailStrip}>
        <span className={styles.detailMuted}>No cheque selected.</span>
      </section>
    );
  }

  const items: { key: string; node: ReactNode; tone?: string }[] = [];
  if (detail) {
    if (detail.voucherRefno) {
      items.push({
        key: "voucher",
        node: (
          <>
            written on <b>{detail.voucherRefno}</b>
            {detail.typeCode ? ` (${detail.typeCode})` : ""}
          </>
        ),
      });
    }
    if (detail.bookNo) {
      items.push({
        key: "book",
        node: (
          <>
            {detail.bankName ?? "bank"} · book <b>{detail.bookNo}</b>
          </>
        ),
      });
    }
    if (detail.favouring) {
      items.push({ key: "fav", node: <>favouring <b>{detail.favouring}</b></> });
    }
    items.push({ key: "payee", node: detail.acPayee ? "A/c payee" : "bearer" });
    items.push({
      key: "print",
      node:
        detail.printCount > 0
          ? `printed ${detail.printCount} time${detail.printCount === 1 ? "" : "s"}`
          : "not printed",
    });
    if (detail.presentedOn) {
      items.push({ key: "presented", node: <>presented {formatDate(detail.presentedOn)}</> });
    }
    if (detail.returnedOn) {
      items.push({
        key: "returned",
        tone: styles.detailWarn,
        node: (
          <>
            returned {formatDate(detail.returnedOn)}
            {detail.returnReason ? ` — ${detail.returnReason}` : ""}
            {detail.charges && detail.charges > 0 ? `, charges ${formatAmount(detail.charges)}` : ""}
          </>
        ),
      });
    }
    if (detail.cancelReason) {
      items.push({
        key: "cancel",
        tone: styles.detailWarn,
        node: (
          <>
            {detail.cancelReason}
            {detail.cancelledOn ? ` on ${formatDate(detail.cancelledOn)}` : ""}
          </>
        ),
      });
    }
    if (detail.reversalRefno) {
      items.push({ key: "reversal", node: <>reversed by <b>{detail.reversalRefno}</b></> });
    }
    if (detail.replacedByLeaf) {
      items.push({ key: "replacedBy", node: <>replaced by leaf <b>{detail.replacedByLeaf}</b></> });
    }
    if (detail.replacesId) {
      items.push({ key: "replaces", node: "a replacement cheque" });
    }
    if (detail.remarks) {
      items.push({ key: "remarks", node: <span className={styles.detailMuted}>{detail.remarks}</span> });
    }
  }

  return (
    <section className={styles.detailStrip} aria-live="polite">
      <span className={styles.detailHead}>{describeIssued(row)}</span>
      {loading && !detail ? <span className={styles.detailMuted}>reading…</span> : null}
      {error && !detail ? <span className={styles.detailWarn}>{error}</span> : null}
      {items.map((item) => (
        <span key={item.key} className={`${styles.detailItem} ${item.tone ?? ""}`}>
          {item.node}
        </span>
      ))}
    </section>
  );
}
