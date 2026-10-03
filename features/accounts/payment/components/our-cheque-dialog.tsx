"use client";

/**
 * F4 on a cheque row — OUR cheque.
 *
 * The receipt's cheque dialog asks for somebody else's cheque: its number, its
 * bank, its drawer. Ours is the other way round. The BOOK is chosen, and the
 * book decides the bank; the LEAF is never typed — the server takes the next
 * one from the book under its row lock at Post (and 400s a number on a cheque
 * row) — so it is shown as "auto" with the number it will probably be. What
 * the operator writes is what goes ON the cheque: its date, who it is to, and
 * whether it is crossed account-payee.
 *
 * Mounted only for the row being edited, keyed on it, so its local copy starts
 * from the row by construction.
 */
import { useMemo, useState } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { toDisplayDate } from "@/features/sales/quotation/quotation.utils";
import styles from "@/features/accounts/receipt/page.module.scss";
import { isPdc } from "../domain/tenders";
import type { ChequeBook, PaymentChequeExtras, PaymentTenderRow } from "../payment.types";

export type OurChequeResult = {
  cheque: PaymentChequeExtras;
  instrumentDate: string;
  /** The book's bank — painted on the row and sent as `tdBankName`. */
  bankName: string;
  bookNo: string | null;
};

export type OurChequeDialogProps = {
  row: PaymentTenderRow;
  books: readonly ChequeBook[];
  booksLoading: boolean;
  paymentDate: string;
  /** The party's cheque name, else its ledger name. */
  defaultFavouring: string;
  editable: boolean;
  onClose: () => void;
  onKeep: (rowKey: string, result: OurChequeResult) => void;
};

/** "SBI · 004 · 000101–000150 · 37 left" */
export function bookLabel(book: ChequeBook): string {
  return `${book.bankName} · ${book.bookNo} · ${book.leafFrom}–${book.leafTo} · ${book.left} left`;
}

export function OurChequeDialog(props: OurChequeDialogProps) {
  const { row, books, booksLoading, paymentDate, defaultFavouring, editable, onClose, onKeep } =
    props;
  const [bookId, setBookId] = useState<string>(
    row.cheque.chequeBookId ?? (books.length === 1 ? books[0].chequeBookId : ""),
  );
  // The date that goes on the cheque defaults to the payment's own.
  const [chequeDate, setChequeDate] = useState(row.instrumentDate || paymentDate);
  const [favouring, setFavouring] = useState(row.cheque.favouring || defaultFavouring);
  // Account-payee unless somebody said otherwise: it is how every cheque to a
  // supplier is crossed, and a bearer cheque is the exception.
  const [acPayee, setAcPayee] = useState(row.cheque.acPayee !== false);
  const [error, setError] = useState<string | null>(null);

  const book = useMemo(
    () => books.find((candidate) => candidate.chequeBookId === bookId) ?? null,
    [bookId, books],
  );
  const postDated = isPdc(chequeDate || null, paymentDate);

  const keep = () => {
    if (!book) {
      setError("Pick the book the cheque is written from.");
      return;
    }
    if (!chequeDate) {
      setError(
        "Write the date that goes on the cheque — a date after the payment makes it post-dated, " +
          "with a voucher of its own.",
      );
      return;
    }
    if (paymentDate && chequeDate < paymentDate) {
      setError("A cheque we write cannot be dated before the payment.");
      return;
    }
    if (!favouring.trim()) {
      setError("Who is the cheque made out to?");
      return;
    }
    onKeep(row.key, {
      cheque: { chequeBookId: book.chequeBookId, favouring: favouring.trim(), acPayee },
      instrumentDate: chequeDate,
      bankName: book.bankName,
      bookNo: book.bookNo,
    });
    onClose();
  };

  return (
    <ModalShell
      title="Cheque — ours"
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
            disabled={!editable || books.length === 0}
            onClick={keep}
          >
            Keep
          </button>
        </div>
      }
    >
      <div className={styles.dialogBody}>
        {books.length === 0 ? (
          <p className={`${styles.dialogNote} ${styles.dialogNoteWarn}`}>
            {booksLoading
              ? "Reading the open cheque books…"
              : "No cheque book is open. Open one on Cheque Books (menu 263) — a payment cheque's number always comes from a book."}
          </p>
        ) : postDated ? (
          <p className={`${styles.dialogNote} ${styles.dialogNoteWarn}`}>
            Post-dated. This cheque is posted as its own payment voucher dated{" "}
            {toDisplayDate(chequeDate)}, and the bills it covers stay pending until then.
          </p>
        ) : (
          <p className={styles.dialogNote}>
            The leaf is taken from the book when the payment is posted. Every cheque goes on the
            issued-cheque register (menu 52).
          </p>
        )}
        {error ? <p className={`${styles.dialogNote} ${styles.dialogNoteWarn}`}>{error}</p> : null}
        <div className={styles.dialogGrid}>
          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span className={styles.fieldLabel}>Cheque book *</span>
            <select
              className={styles.select}
              value={bookId}
              disabled={!editable || books.length === 0}
              onChange={(event) => {
                setBookId(event.target.value);
                setError(null);
              }}
            >
              <option value="">— pick the book —</option>
              {books.map((candidate) => (
                <option key={candidate.chequeBookId} value={candidate.chequeBookId}>
                  {bookLabel(candidate)}
                </option>
              ))}
            </select>
          </label>
          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span className={styles.fieldLabel}>Leaf</span>
            <input
              className={`${styles.input} ${styles.inputReadOnly}`}
              readOnly
              value={
                row.leaf
                  ? `${row.leaf} (taken when it was posted)`
                  : book
                    ? `auto — next is ${book.nextLeaf}, taken at Post`
                    : "auto — taken at Post"
              }
              // "Probably": two payments posting on the same book take
              // consecutive leaves in the order they POST, not the order keyed.
              title="The server takes the next leaf from the book when the payment posts."
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Cheque date *</span>
            <input
              className={styles.input}
              type="date"
              value={chequeDate}
              min={paymentDate || undefined}
              disabled={!editable}
              onChange={(event) => {
                setChequeDate(event.target.value);
                setError(null);
              }}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>A/c payee only</span>
            <input
              type="checkbox"
              checked={acPayee}
              disabled={!editable}
              onChange={(event) => setAcPayee(event.target.checked)}
            />
          </label>
          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span className={styles.fieldLabel}>Favouring *</span>
            <input
              className={styles.input}
              value={favouring}
              maxLength={150}
              disabled={!editable}
              placeholder="who the cheque is made out to"
              onChange={(event) => {
                setFavouring(event.target.value);
                setError(null);
              }}
            />
          </label>
        </div>
      </div>
    </ModalShell>
  );
}
