"use client";

/**
 * Branch Outward's transit rows — "IN TRANSIT — what the receiving branch has
 * keyed so far": one row per `stock_transit` row, shown once the transfer is
 * despatched, with Settle short when every row has been received at least in
 * part (Qt `fillTransit`).
 */
import { cx } from "@/components/design-system/cx";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { qtyCell } from "@/features/stocks/stock-adjustment/stock-adjustment.format";
import { statusText } from "../stock-transfer.state";
import type { TransitRow } from "../stock-transfer.types";
import styles from "../page.module.scss";

const STATUS_CLASS: Record<string, string> = {
  RECEIVED: styles.stReceived,
  PARTIAL: styles.stPartial,
};

export function TransitPanel({
  rows,
  canSettle,
  busy,
  onSettle,
}: {
  rows: readonly TransitRow[];
  canSettle: boolean;
  busy: boolean;
  onSettle: () => void;
}) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <section className={styles.card} aria-label="In transit">
      <div className={styles.transitHead}>
        <h3 className={styles.cardTitle}>IN TRANSIT — what the receiving branch has keyed so far</h3>
        {canSettle ? (
          <button
            type="button"
            className={cx(quotationStyles.button)}
            disabled={busy}
            title="Close this transfer: what is still short will never arrive. It stays on the loss report and is written off at the cost it left with."
            onClick={onSettle}
          >
            Settle short…
          </button>
        ) : null}
      </div>
      <table className={styles.transitTable}>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Batch</th>
            <th scope="col">To godown</th>
            <th scope="col" className={styles.num}>Sent</th>
            <th scope="col" className={styles.num}>Received</th>
            <th scope="col" className={styles.num}>Damaged</th>
            <th scope="col" className={styles.num}>Short</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const short = row.sentQty - row.receivedQty - row.damageQty;
            return (
              <tr key={row.sttId}>
                <td>{row.itemName}</td>
                <td>{row.batchNo || "—"}</td>
                <td>{row.toGodownName ?? ""}</td>
                <td className={styles.num}>{qtyCell(row.sentQty)}</td>
                <td className={styles.num}>{qtyCell(row.receivedQty)}</td>
                <td className={styles.num}>{qtyCell(row.damageQty)}</td>
                <td className={cx(styles.num, short > 0.0000005 && row.status !== "IN_TRANSIT" && styles.shortRed)}>
                  {qtyCell(short)}
                </td>
                <td className={STATUS_CLASS[row.status] ?? styles.stTransit}>{statusText(row.status)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
