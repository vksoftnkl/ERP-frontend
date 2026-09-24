"use client";

/**
 * LAST RECEIPTS and CHEQUES STILL OUT: what they last paid, and what of theirs
 * we are still holding.
 *
 * They are CONTEXT, not truth. `/party-context` failing is silent — the panels
 * simply empty — because a receipt can be taken without them, and an error
 * banner over a working screen teaches operators to ignore banners.
 */
import { formatTotal } from "../domain/money";
import type { PartyPendingCheque, PartyRecentReceipt } from "../receipt.types";
import { Chip } from "./chip";
import styles from "../page.module.scss";

export type LastReceiptsPanelProps = {
  rows: readonly PartyRecentReceipt[];
  loaded: boolean;
};

export function LastReceiptsPanel({ rows, loaded }: LastReceiptsPanelProps) {
  return (
    <section className={styles.panel} aria-label="Last receipts">
      <h2 className={styles.panelTitle}>Last receipts</h2>
      <div className={styles.panelBody}>
        <table className={styles.panelTable}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Receipt</th>
              <th>Amount</th>
              <th>Instruments</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((receipt) => (
              <tr key={`${receipt.voucherId}-${receipt.accYear}`}>
                <td>{receipt.voucherDate.slice(0, 10)}</td>
                <td>{receipt.voucherRefno ?? "—"}</td>
                <td className={styles.alignRight}>{formatTotal(receipt.docAmount)}</td>
                <td>{receipt.instruments ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className={styles.panelEmpty}>
            {loaded ? "Nothing received from this customer yet." : ""}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export type ChequesOutPanelProps = {
  rows: readonly PartyPendingCheque[];
  loaded: boolean;
};

export function ChequesOutPanel({ rows, loaded }: ChequesOutPanelProps) {
  return (
    <section className={`${styles.panel} ${styles.panelAmber}`} aria-label="Cheques still out">
      <h2 className={styles.panelTitle}>Cheques still out</h2>
      <div className={styles.panelBody}>
        <table className={styles.panelTable}>
          <thead>
            <tr>
              <th>Cheque</th>
              <th>Cheque date</th>
              <th>Bank</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((cheque) => (
              <tr key={`${cheque.pdcId}-${cheque.accYear}`}>
                <td>{cheque.instrumentNo}</td>
                <td>{cheque.instrumentDate.slice(0, 10)}</td>
                <td>{cheque.bankName ?? "—"}</td>
                <td className={styles.alignRight}>{formatTotal(cheque.amount)}</td>
                <td className={styles.alignCenter}>
                  <Chip value={cheque.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className={styles.panelEmpty}>
            {loaded ? "No cheque of theirs is outstanding." : ""}
          </p>
        ) : null}
      </div>
    </section>
  );
}
