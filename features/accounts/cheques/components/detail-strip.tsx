"use client";

/**
 * The current row's `/cheques/get`, in one strip.
 *
 * It is the only place the bills a cheque settled are NAMED — an operator
 * about to bounce one reads it here — so it is never left blank by a reload:
 * the screen fetches whenever the current row's KEY, or the data under it,
 * changes, and drops a reply for a row the cursor has already left.
 */
import type { ReactNode } from "react";
import { formatAmount, formatDate } from "../domain/chequeRow";
import type { ChequeDetail, ChequeRow, ChequeVoucherRef } from "../domain/types";
import styles from "../cheques.module.scss";

export type DetailStripProps = {
  row: ChequeRow | null;
  /** Only ever the detail OF `row` — the screen drops anyone else's. */
  detail: ChequeDetail | null;
  loading: boolean;
  failed: boolean;
  tickedCount: number;
};

function refno(voucher: ChequeVoucherRef | null): string {
  return voucher ? voucher.voucherRefno || "(unnumbered)" : "";
}

export function DetailStrip({ row, detail, loading, failed, tickedCount }: DetailStripProps) {
  if (!row) {
    return (
      <section className={styles.detailStrip}>
        <span className={styles.detailMuted}>No cheque selected.</span>
      </section>
    );
  }

  const settled = (detail?.bills ?? []).filter((bill) => bill.settledByThisCheque > 0);
  const items: { key: string; node: ReactNode; tone?: string }[] = [];

  if (detail) {
    if (detail.receiptVoucher) {
      items.push({ key: "rct", node: <>came in on <b>{refno(detail.receiptVoucher)}</b></> });
    }
    if (detail.clearVoucher) {
      items.push({ key: "clr", node: <>cleared by <b>{refno(detail.clearVoucher)}</b></> });
    }
    if (detail.bounceVoucher) {
      items.push({
        key: "bnc",
        tone: styles.detailWarn,
        node: <>bounced on <b>{refno(detail.bounceVoucher)}</b></>,
      });
    }
    if (detail.reissueVoucher) {
      items.push({ key: "rei", node: <>re-issued on <b>{refno(detail.reissueVoucher)}</b></> });
    }
    if (detail.chargeBill) {
      items.push({
        key: "chg",
        node: <>bounce charge billed as <b>{detail.chargeBill.docRefno}</b></>,
      });
    }
    items.push({
      key: "bills",
      node:
        settled.length === 0 ? (
          <span className={styles.detailMuted}>settled no bill</span>
        ) : (
          <>
            settled{" "}
            {settled.map((bill, index) => (
              <span key={`${bill.billId}-${bill.billAccYear}`}>
                {index > 0 ? "; " : ""}
                <b>{bill.docRefno}</b> — {formatAmount(bill.settledByThisCheque)}, with{" "}
                {formatAmount(bill.pendingAmount)} of {formatAmount(bill.billAmount)} still open
              </span>
            ))}
          </>
        ),
    });
    if (detail.replaces) {
      items.push({
        key: "replaces",
        node: <>replaces cheque <b>{detail.replaces.apdInstrumentNo}</b></>,
      });
    }
    if (detail.replacedBy) {
      items.push({
        key: "replacedBy",
        node: <>replaced by cheque <b>{detail.replacedBy.apdInstrumentNo}</b></>,
      });
    }
    if (detail.cheque.apdDepositSlipNo) {
      items.push({
        key: "slip",
        node: (
          <>
            slip <b>{detail.cheque.apdDepositSlipNo}</b>
            {detail.cheque.bankLedgerName ? <> into {detail.cheque.bankLedgerName}</> : null}
            {detail.cheque.apdDepositDate ? <> on {formatDate(detail.cheque.apdDepositDate)}</> : null}
            {detail.cheque.apdPresentCount > 1 ? <> (presentation {detail.cheque.apdPresentCount})</> : null}
          </>
        ),
      });
    }
    if (detail.cheque.apdBounceReason) {
      items.push({
        key: "reason",
        tone: styles.detailWarn,
        node: <>bounce reason: {detail.cheque.apdBounceReason}</>,
      });
    }
  }

  return (
    <section className={styles.detailStrip} aria-live="polite">
      <span className={styles.detailHead}>
        {row.instrumentNo} · {row.partyName} · {formatAmount(row.amount)}
      </span>
      {tickedCount > 0 ? (
        <span className={styles.detailMuted}>
          ({tickedCount} ticked — the actions act on the ticked rows)
        </span>
      ) : null}
      {loading && !detail ? <span className={styles.detailMuted}>reading…</span> : null}
      {failed && !detail ? (
        <span className={styles.detailWarn}>could not load this cheque&apos;s detail</span>
      ) : null}
      {items.map((item) => (
        <span key={item.key} className={`${styles.detailItem} ${item.tone ?? ""}`}>
          {item.node}
        </span>
      ))}
    </section>
  );
}
