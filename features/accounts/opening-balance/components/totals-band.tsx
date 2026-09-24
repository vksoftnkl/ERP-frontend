"use client";

/**
 * Σ Dr, Σ Cr and the difference — the figure that decides whether saving makes
 * sense, standing next to the button that saves.
 *
 * The WHOLE band turns colour, not one number in it: an unbalanced opening is a
 * fact about the set, not about the difference cell. And it has a band of its
 * own rather than a line squeezed onto the button row, where totals read as a
 * caption instead of a total.
 *
 * **Save is not refused when the set is out.** A half-keyed opening is a normal
 * state for an afternoon's work; refusing to save it would make the operator
 * hold the morning in their head. So the band tells them, every time, and the
 * save goes through.
 */
import type { Agreement, Totals } from "../derived";
import { formatMoney } from "../derived";
import type { TrialBalance } from "../opening-balance.types";
import styles from "../page.module.scss";

export type TotalsBandProps = {
  totals: Totals;
  server: TrialBalance;
  agreement: Agreement;
};

export function TotalsBand({ totals, server, agreement }: TotalsBandProps) {
  const tone = totals.isBalanced ? styles.totalsBalanced : styles.totalsOut;

  return (
    <div className={`${styles.totalsBand} ${tone}`}>
      <div className={styles.totalsFigures}>
        <span className={styles.totalsCell}>
          <span className={styles.totalsCaption}>Σ Dr</span>
          <span className={styles.totalsValue}>{formatMoney(totals.debit)}</span>
        </span>
        <span className={styles.totalsCell}>
          <span className={styles.totalsCaption}>Σ Cr</span>
          <span className={styles.totalsValue}>{formatMoney(totals.credit)}</span>
        </span>
        <span className={styles.totalsCell}>
          <span className={styles.totalsCaption}>Difference</span>
          <span className={styles.totalsValue}>{formatMoney(Math.abs(totals.difference))}</span>
        </span>
      </div>

      <div className={styles.totalsNotes}>
        {/* The server writes the plug; the client only names it. */}
        {!totals.isBalanced ? (
          server.differenceLedgerName ? (
            <p className={styles.totalsNote}>
              &ldquo;{server.differenceLedgerName}&rdquo; will take the difference.
            </p>
          ) : (
            <p className={styles.totalsNote}>
              No OPENING_DIFFERENCE ledger is mapped for this company — nothing will absorb the
              difference.
            </p>
          )
        ) : null}

        {agreement.kind === "agrees" ? (
          <p className={styles.totalsNote}>Agrees with the server.</p>
        ) : agreement.kind === "unsaved" ? (
          <p className={styles.totalsNote}>
            Unsaved — the server last said Dr {formatMoney(agreement.serverDebit)} / Cr{" "}
            {formatMoney(agreement.serverCredit)}.
          </p>
        ) : (
          <p className={styles.totalsAlarm}>
            Nothing is unsaved, yet the server says Dr {formatMoney(agreement.serverDebit)} / Cr{" "}
            {formatMoney(agreement.serverCredit)}. That is a bug, not a rounding difference.
          </p>
        )}

        {server.unmappedCount > 0 ? (
          <p className={styles.totalsNote}>
            {server.unmappedCount} ledger(s) sit under a group with no nature and are outside these
            totals.
          </p>
        ) : null}
      </div>
    </div>
  );
}
