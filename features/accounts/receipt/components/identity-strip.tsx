"use client";

/**
 * The equation, permanently on screen:
 *
 *     RECEIVED + DEDUCTIONS + CREDITS = ALLOCATED + ON ACCOUNT + ADDITIONS
 *
 * with the DIFFERENCE at the right-hand end. Green when it balances, red when
 * it does not, and the hint below phrases the gap as the next thing to do
 * about it rather than as a number with a minus sign.
 *
 * It is not decoration: Post is refused while it is out by a paisa, because
 * the server recomputes all six figures and refuses the receipt anyway — so a
 * strip that disagreed with the server would send the operator to support
 * instead of to the cell that is wrong.
 */
import { formatTotal } from "../domain/money";
import type { ReceiptIdentity } from "../domain/identity";
import styles from "../page.module.scss";

export type IdentityStripProps = {
  identity: ReceiptIdentity;
  hint: string;
};

function Cell({ caption, value }: { caption: string; value: number }) {
  return (
    <div className={styles.identityCell}>
      <span className={styles.identityCaption}>{caption}</span>
      <span className={styles.identityValue}>{formatTotal(value)}</span>
    </div>
  );
}

export function IdentityStrip({ identity, hint }: IdentityStripProps) {
  return (
    <section
      className={`${styles.identityStrip} ${identity.balances ? "" : styles.identityOut}`}
      aria-label="Receipt identity"
      title={hint}
    >
      <Cell caption="Received" value={identity.received} />
      <span className={styles.identityOperator} aria-hidden>
        +
      </span>
      <Cell caption="Deductions" value={identity.deductions} />
      <span className={styles.identityOperator} aria-hidden>
        +
      </span>
      <Cell caption="Credits" value={identity.creditsApplied} />
      <span className={styles.identityOperator} aria-hidden>
        =
      </span>
      <Cell caption="Allocated" value={identity.allocated} />
      <span className={styles.identityOperator} aria-hidden>
        +
      </span>
      <Cell caption="On account" value={identity.onAccount} />
      <span className={styles.identityOperator} aria-hidden>
        +
      </span>
      <Cell caption="Additions" value={identity.additions} />
      <div
        className={`${styles.identityCell} ${styles.identityDifference} ${
          identity.balances ? styles.identityDifferenceOk : styles.identityDifferenceOut
        }`}
      >
        <span className={styles.identityCaption}>Difference</span>
        <span className={styles.identityValue}>{formatTotal(Math.abs(identity.difference))}</span>
      </div>
    </section>
  );
}
