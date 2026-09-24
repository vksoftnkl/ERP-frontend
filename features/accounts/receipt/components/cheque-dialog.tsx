"use client";

/**
 * F4 — the rest of a cheque's details.
 *
 * ── Nothing in here is required ──────────────────────────────────────────
 * `SaveReceiptChequeDto` requires none of these fields, and the three that ARE
 * mandatory — the number, the date written on the cheque and the bank — are
 * typed in the ROW, where the operator is already looking. A dialog that had
 * to be opened to key a mandatory field would be a dialog that gets opened on
 * every cheque.
 *
 * Every cheque gets an `acc_pdc_register` row server-side, post-dated or not.
 * Managing them afterwards is the Received Cheques screen's job (menu 51), not
 * this one's.
 */
import { useState } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { isPdc } from "../domain/tenders";
import type { ChequeExtras, TenderRow } from "../receipt.types";
import styles from "../page.module.scss";

export type ChequeDialogProps = {
  /** Never null: the parent mounts this only for the row being edited, keyed
   * on that row, so the draft below is initialised once per opening and needs
   * no effect to stay in step. */
  row: TenderRow;
  receiptDate: string;
  editable: boolean;
  onClose: () => void;
  onSave: (rowKey: string, extras: ChequeExtras) => void;
};

export function ChequeDialog({ row, receiptDate, editable, onClose, onSave }: ChequeDialogProps) {
  const [draft, setDraft] = useState<ChequeExtras>(row.cheque);

  const postDated = isPdc(row.instrumentDate || null, receiptDate);

  return (
    <ModalShell
      title={`Cheque ${row.refNo || "details"}`}
      isOpen
      narrow
      onClose={onClose}
      footer={
        <div className={styles.dialogActions}>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!editable}
            onClick={() => {
              onSave(row.key, draft);
              onClose();
            }}
          >
            Keep
          </button>
        </div>
      }
    >
      <div className={styles.dialogBody}>
        {postDated ? (
          <p className={`${styles.dialogNote} ${styles.dialogNoteWarn}`}>
            This cheque is dated after the receipt, so it will be posted as a voucher of its own
            dated {row.instrumentDate}. The bills it covers do not settle until it matures.
          </p>
        ) : (
          <p className={styles.dialogNote}>
            Every cheque is registered whether or not it is post-dated. These details are
            optional — they travel with the register entry.
          </p>
        )}
        <div className={styles.dialogGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Branch</span>
            <input
              className={styles.input}
              value={draft.bankBranch}
              maxLength={100}
              disabled={!editable}
              onChange={(event) => setDraft({ ...draft, bankBranch: event.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>IFSC</span>
            <input
              className={styles.input}
              value={draft.ifsc}
              maxLength={11}
              disabled={!editable}
              placeholder="KVBL0001234"
              onChange={(event) => setDraft({ ...draft, ifsc: event.target.value })}
            />
          </label>
          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span className={styles.fieldLabel}>Drawer</span>
            <input
              className={styles.input}
              value={draft.drawerName}
              maxLength={150}
              disabled={!editable}
              placeholder="whose account the cheque is drawn on"
              onChange={(event) => setDraft({ ...draft, drawerName: event.target.value })}
            />
          </label>
        </div>
      </div>
    </ModalShell>
  );
}
