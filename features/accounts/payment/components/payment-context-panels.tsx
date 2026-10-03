"use client";

/**
 * LAST PAYMENTS and OUR CHEQUES STILL OUT: what we last paid this party, and
 * which of our cheques they have not yet presented.
 *
 * Context, not truth: a failed `/party-context` simply empties them, because a
 * payment can be made without them.
 */
import { formatTotal } from "@/features/accounts/receipt/domain/money";
import { Chip } from "@/features/accounts/receipt/components/chip";
import styles from "@/features/accounts/receipt/page.module.scss";
import type { PartyChequeOut, PartyRecentPayment } from "../payment.types";

export function LastPaymentsPanel({
  rows,
  loaded,
}: {
  rows: readonly PartyRecentPayment[];
  loaded: boolean;
}) {
  return (
    <section className={styles.panel} aria-label="Last payments">
      <h2 className={styles.panelTitle}>Last payments</h2>
      <div className={styles.panelBody}>
        <table className={styles.panelTable}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Payment</th>
              <th>Amount</th>
              <th>Instruments</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((payment) => (
              <tr key={`${payment.voucherId}-${payment.accYear}`}>
                <td>{payment.voucherDate.slice(0, 10)}</td>
                <td>{payment.voucherRefno ?? "—"}</td>
                <td className={styles.alignRight}>{formatTotal(payment.docAmount)}</td>
                <td>{payment.instruments ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className={styles.panelEmpty}>{loaded ? "Nothing paid to this party yet." : ""}</p>
        ) : null}
      </div>
    </section>
  );
}

export function OurChequesOutPanel({
  rows,
  loaded,
}: {
  rows: readonly PartyChequeOut[];
  loaded: boolean;
}) {
  return (
    <section className={`${styles.panel} ${styles.panelAmber}`} aria-label="Our cheques still out">
      <h2 className={styles.panelTitle}>Our cheques still out</h2>
      <div className={styles.panelBody}>
        <table className={styles.panelTable}>
          <thead>
            <tr>
              <th>Leaf</th>
              <th>Book</th>
              <th>Cheque date</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((cheque) => (
              <tr key={`${cheque.pdcId}-${cheque.accYear}`}>
                <td>{cheque.instrumentNo}</td>
                <td>{cheque.bookNo ?? "—"}</td>
                <td>{cheque.instrumentDate.slice(0, 10)}</td>
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
            {loaded ? "No cheque of ours is waiting to be presented." : ""}
          </p>
        ) : null}
      </div>
    </section>
  );
}
