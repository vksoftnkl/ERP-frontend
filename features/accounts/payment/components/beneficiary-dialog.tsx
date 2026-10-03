"use client";

/**
 * F4 on a bank-transfer or UPI row — where the money goes.
 *
 * A SNAPSHOT on this payment: seeded from the party's default bank account
 * (what the row already carries wins; the party's account only fills what is
 * still blank), and never written back to the ledger. A UPI row also carries
 * the payee's VPA.
 *
 * The server does not check the IFSC's shape on a beneficiary — but a wrong
 * one on a transfer is money sent nowhere, so it is caught here.
 */
import { useState } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import styles from "@/features/accounts/receipt/page.module.scss";
import { IFSC_PATTERN, lastFour } from "../domain/tenders";
import type { BeneficiaryDraft, PaymentPartyFacts, PaymentTenderRow } from "../payment.types";

export type BeneficiaryDialogProps = {
  row: PaymentTenderRow;
  party: PaymentPartyFacts;
  /** The payee's name as picked, for a party whose facts carry none. */
  partyName: string;
  isUpi: boolean;
  editable: boolean;
  onClose: () => void;
  onKeep: (rowKey: string, beneficiary: BeneficiaryDraft, payerVpa: string) => void;
};

export function BeneficiaryDialog(props: BeneficiaryDialogProps) {
  const { row, party, partyName, isUpi, editable, onClose, onKeep } = props;
  const [name, setName] = useState(
    row.beneficiary.name || party.favouringName || party.ledName || partyName,
  );
  const [accountNo, setAccountNo] = useState(row.beneficiary.accountNo || party.bankAccountNo);
  const [ifsc, setIfsc] = useState(row.beneficiary.ifsc || party.bankIfsc);
  const [vpa, setVpa] = useState(row.payerVpa);
  const [error, setError] = useState<string | null>(null);

  const keep = () => {
    const code = ifsc.trim().toUpperCase();
    if (code && !IFSC_PATTERN.test(code)) {
      setError("An IFSC is 4 letters, a 0, then 6 letters or digits (SBIN0001234).");
      return;
    }
    onKeep(
      row.key,
      { name: name.trim(), accountNo: accountNo.trim(), ifsc: code },
      isUpi ? vpa.trim() : "",
    );
    onClose();
  };

  return (
    <ModalShell
      title="Beneficiary — where the money goes"
      isOpen
      narrow
      onClose={onClose}
      footer={
        <div className={styles.dialogActions}>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!editable}
            onClick={keep}
          >
            Keep
          </button>
        </div>
      }
    >
      <div className={styles.dialogBody}>
        <p className={styles.dialogNote}>
          {party.bankAccountNo
            ? `Seeded from the party's default account (${party.bankName || "bank"} ····${lastFour(
                party.bankAccountNo,
              )}). A change here is kept on this payment only, never written back to the ledger.`
            : "The party's ledger has no default bank account — key it here. It is kept on this payment only."}
        </p>
        {error ? <p className={`${styles.dialogNote} ${styles.dialogNoteWarn}`}>{error}</p> : null}
        <div className={styles.dialogGrid}>
          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span className={styles.fieldLabel}>Name</span>
            <input
              className={styles.input}
              value={name}
              maxLength={150}
              disabled={!editable}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Account no</span>
            <input
              className={styles.input}
              value={accountNo}
              maxLength={50}
              disabled={!editable}
              onChange={(event) => setAccountNo(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>IFSC</span>
            <input
              className={styles.input}
              value={ifsc}
              maxLength={11}
              disabled={!editable}
              placeholder="SBIN0001234"
              onChange={(event) => {
                setIfsc(event.target.value.toUpperCase());
                setError(null);
              }}
            />
          </label>
          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span className={styles.fieldLabel}>UPI id</span>
            <input
              className={styles.input}
              value={vpa}
              maxLength={100}
              disabled={!editable || !isUpi}
              placeholder={isUpi ? "payee@bank" : "only for a UPI row"}
              onChange={(event) => setVpa(event.target.value)}
            />
          </label>
        </div>
      </div>
    </ModalShell>
  );
}
