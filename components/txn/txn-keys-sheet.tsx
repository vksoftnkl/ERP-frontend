"use client";

/**
 * F1 — "Keys on this screen" (Qt `TxnKeys::installHelp()`, QDialog#TxnKeysDialog):
 * the screen's document keys, then its line keys, in two aligned columns with
 * the key drawn as a chip. Built from `keySheetRows()` so a screen lists
 * exactly the keys it binds.
 */
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import type { TxnKeyRow } from "@/lib/txn-keys";
import styles from "./txn-keys-sheet.module.scss";

export type TxnKeysSheetProps = {
  open: boolean;
  onClose: () => void;
  document: readonly TxnKeyRow[];
  lines?: readonly TxnKeyRow[];
};

function Section({ heading, rows }: { heading: string; rows: readonly TxnKeyRow[] }) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <section className={styles.section}>
      <h3 className={styles.heading}>{heading}</h3>
      <dl className={styles.rows}>
        {rows.map((row) => (
          <div key={`${row.label}|${row.keyText}`} className={styles.row}>
            <dt className={styles.label}>{row.label}</dt>
            <dd className={styles.cap}>{row.keyText}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function TxnKeysSheet({ open, onClose, document, lines = [] }: TxnKeysSheetProps) {
  return (
    <ModalShell
      title="Keys on this screen"
      isOpen={open}
      narrow
      onClose={onClose}
      footer={
        <button type="button" className={quotationStyles.button} autoFocus onClick={onClose}>
          Close · Esc
        </button>
      }
    >
      <div className={styles.sheet}>
        <Section heading="Document" rows={document} />
        <Section heading="Lines" rows={lines} />
      </div>
    </ModalShell>
  );
}
