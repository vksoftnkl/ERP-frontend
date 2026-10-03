"use client";

/**
 * The instrument on one party line — the Qt `VoucherInstrumentDialog`
 * (Ctrl+Q, Enter or a double-click on the Instrument cell).
 *
 * The choices are the tender masters `/vouchers/instruments` offers for the
 * type (a payment is offered only cash, UPI, a bank transfer and a cheque).
 * What it then asks depends on the side:
 *
 *   receiving   a cheque: its number, date and drawee bank (dropdown 46,
 *               "INDIAN BANKS LIST" — a picked name, never a spelling), with
 *               branch, drawer and IFSC; a UPI / card: its reference.
 *   paying      anything but cash: OUR bank account; a cheque: a book on it
 *               (the leaf shown is its next, taken at Post), the date,
 *               favouring and the crossing; a transfer: its UTR.
 *
 * Enter moves to the next field (no default button, as the Qt popup rule
 * has it); Ctrl+Enter is OK from anywhere, and OK checks what the server
 * would refuse so the operator stays where the fields are.
 */
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { DropdownCombo } from "@/features/sales/quotation/components/fields";
import { useDropdownId } from "@/lib/configured-dropdowns";
import receiptStyles from "@/features/accounts/receipt/page.module.scss";
import styles from "../vouchers.module.scss";
import {
  acceptInstrument,
  bookLabel,
  formOf,
  instrumentFields,
  isPostDatedCheque,
  payingBanks,
  type InstrumentForm,
  type LineInstrument,
} from "../domain/instruments";
import { formatPaise } from "../domain/lines";
import type { InstrumentTenderRow, VoucherChequeBook } from "../vouchers.types";

export type InstrumentDialogProps = {
  title: string;
  paying: boolean;
  tenders: readonly InstrumentTenderRow[];
  books: readonly VoucherChequeBook[];
  current: LineInstrument | null;
  voucherDate: string;
  /** The line's party — a payment cheque's favouring by default. */
  partyName: string;
  linePaise: number;
  onCancel: () => void;
  onOk: (instrument: LineInstrument | null) => void;
};

function displayDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : iso;
}

export function InstrumentDialog(props: InstrumentDialogProps) {
  const { title, paying, tenders, books, current, voucherDate, partyName, linePaise, onCancel, onOk } = props;
  const bankDropdownId = useDropdownId("bank");
  const [form, setForm] = useState<InstrumentForm>(() => {
    const start = formOf(current, voucherDate, partyName, tenders);
    // A payment: the bank already chosen, else the first one with a book.
    if (paying && !start.bankLedgerId) {
      start.bankLedgerId = payingBanks(books, tenders)[0]?.ledgerId ?? "";
    }
    if (paying && !start.chequeBookId) {
      start.chequeBookId = books.find((book) => book.bankLedgerId === start.bankLedgerId)?.chequeBookId ?? "";
    }
    return start;
  });
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const okRef = useRef<HTMLButtonElement | null>(null);

  const tender = tenders.find((candidate) => candidate.tenderId === form.tenderId) ?? null;
  const fields = instrumentFields(tender, paying);
  const banks = useMemo(() => payingBanks(books, tenders), [books, tenders]);
  const bankBooks = useMemo(
    () => books.filter((book) => book.bankLedgerId === form.bankLedgerId),
    [books, form.bankLedgerId],
  );
  const book = bankBooks.find((candidate) => candidate.chequeBookId === form.chequeBookId) ?? null;
  const postDated = isPostDatedCheque(tender, form.instrumentDate, voucherDate);

  const patch = (change: Partial<InstrumentForm>) => {
    setForm((currentForm) => ({ ...currentForm, ...change }));
    setError(null);
  };

  const ok = () => {
    const result = acceptInstrument(form, { paying, tenders, books, banks });
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onOk(result.instrument);
  };

  /** Enter walks the fields; Ctrl+Enter is OK. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.defaultPrevented || event.altKey || event.shiftKey) {
      return;
    }
    event.preventDefault();
    if (event.ctrlKey) {
      ok();
      return;
    }
    const target = event.target as HTMLElement;
    if (target instanceof HTMLButtonElement) {
      target.click();
      return;
    }
    const focusable = Array.from(
      bodyRef.current?.querySelectorAll<HTMLElement>("input:not([readonly]):not([disabled]), select:not([disabled])") ?? [],
    );
    const at = focusable.indexOf(target);
    const next = at >= 0 ? focusable[at + 1] : undefined;
    // Past the last field: OK, which Enter then presses.
    (next ?? okRef.current)?.focus();
  };

  return (
    <ModalShell
      title={title}
      isOpen
      narrow
      onClose={onCancel}
      footer={
        <div className={receiptStyles.dialogActions}>
          {current ? (
            <button
              type="button"
              className={receiptStyles.dangerButton}
              title="Take the instrument off this line: its money side is then keyed by hand."
              onClick={() => onOk(null)}
            >
              No instrument
            </button>
          ) : null}
          <button type="button" className={receiptStyles.button} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" ref={okRef} className={receiptStyles.primaryButton} title="OK (Ctrl+Enter)" onClick={ok}>
            OK
          </button>
        </div>
      }
    >
      <div className={receiptStyles.dialogBody} ref={bodyRef} onKeyDown={onKeyDown}>
        <p className={styles.hint}>
          {paying
            ? "A payment cheque is OURS: pick the bank account and its book. The leaf is the book's next, taken at Post — a spoilt leaf is voided in Issued Cheques (52)."
            : "The choices are the tender masters; the ledger each one posts to comes with it. No bank is asked for a cheque — that is chosen at Deposit (menu 51)."}
        </p>
        <div className={styles.formGrid}>
          <label className={styles.formLabel} htmlFor="ins-tender">
            Instrument
          </label>
          <select
            id="ins-tender"
            className={receiptStyles.select}
            value={form.tenderId}
            autoFocus
            onChange={(event) => patch({ tenderId: event.target.value })}
          >
            {tenders.map((candidate) => (
              <option key={candidate.tenderId} value={candidate.tenderId}>
                {candidate.name}
              </option>
            ))}
          </select>

          {fields.bankAccount ? (
            <>
              <label className={styles.formLabel} htmlFor="ins-bank">
                Bank account *
              </label>
              <select
                id="ins-bank"
                className={receiptStyles.select}
                value={form.bankLedgerId}
                onChange={(event) => {
                  const bankLedgerId = event.target.value;
                  patch({
                    bankLedgerId,
                    chequeBookId: books.find((candidate) => candidate.bankLedgerId === bankLedgerId)?.chequeBookId ?? "",
                  });
                }}
              >
                <option value="">—</option>
                {banks.map((bank) => (
                  <option key={bank.ledgerId} value={bank.ledgerId}>
                    {bank.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}

          {fields.book ? (
            <>
              <label className={styles.formLabel} htmlFor="ins-book">
                Cheque book *
              </label>
              <select
                id="ins-book"
                className={receiptStyles.select}
                value={form.chequeBookId}
                onChange={(event) => patch({ chequeBookId: event.target.value })}
              >
                {bankBooks.length === 0 ? <option value="">no open book for this bank</option> : null}
                {bankBooks.map((candidate) => (
                  <option key={candidate.chequeBookId} value={candidate.chequeBookId}>
                    {bookLabel(candidate)}
                  </option>
                ))}
              </select>
              <span className={styles.formLabel}>Leaf</span>
              <input
                className={`${receiptStyles.input} ${receiptStyles.inputReadOnly}`}
                readOnly
                tabIndex={-1}
                value={book ? `${book.nextLeaf}  (next)` : "no open book for this bank"}
              />
            </>
          ) : null}

          {fields.reference ? (
            <>
              <label className={styles.formLabel} htmlFor="ins-ref">
                {fields.referenceCaption}
              </label>
              <input
                id="ins-ref"
                className={receiptStyles.input}
                value={form.refNo}
                maxLength={30}
                data-uppercase="off"
                onChange={(event) => patch({ refNo: event.target.value })}
              />
            </>
          ) : null}

          {fields.date ? (
            <>
              <label className={styles.formLabel} htmlFor="ins-date">
                {fields.dateCaption}
              </label>
              <input
                id="ins-date"
                className={receiptStyles.input}
                type="date"
                value={form.instrumentDate}
                onChange={(event) => patch({ instrumentDate: event.target.value })}
              />
            </>
          ) : null}

          {fields.book ? (
            <>
              <label className={styles.formLabel} htmlFor="ins-favouring">
                Favouring
              </label>
              <input
                id="ins-favouring"
                className={receiptStyles.input}
                value={form.favouring}
                maxLength={120}
                onChange={(event) => patch({ favouring: event.target.value })}
              />
              <span />
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={form.acPayee}
                  onChange={(event) => patch({ acPayee: event.target.checked })}
                />
                Crossed — A/c payee only
              </label>
            </>
          ) : null}

          {fields.receivedCheque ? (
            <>
              <span className={styles.formLabel}>Drawee bank *</span>
              <DropdownCombo
                id="ins-drawee"
                label=""
                dropdownId={bankDropdownId}
                valueKey="bnk_name"
                labelKey="bnk_name"
                value={form.draweeBank}
                selectedLabel={form.draweeBank}
                placeholder="Search banks…"
                onSelect={(value) => patch({ draweeBank: value })}
              />
              <label className={styles.formLabel} htmlFor="ins-branch">
                Branch
              </label>
              <input
                id="ins-branch"
                className={receiptStyles.input}
                value={form.bankBranch}
                maxLength={100}
                onChange={(event) => patch({ bankBranch: event.target.value })}
              />
              <label className={styles.formLabel} htmlFor="ins-drawer">
                Drawer
              </label>
              <input
                id="ins-drawer"
                className={receiptStyles.input}
                value={form.drawerName}
                maxLength={150}
                onChange={(event) => patch({ drawerName: event.target.value })}
              />
              <label className={styles.formLabel} htmlFor="ins-ifsc">
                IFSC
              </label>
              <input
                id="ins-ifsc"
                className={receiptStyles.input}
                value={form.ifsc}
                maxLength={11}
                onChange={(event) => patch({ ifsc: event.target.value.toUpperCase() })}
              />
            </>
          ) : null}
        </div>

        <p className={styles.hint} style={{ marginTop: "0.6em", marginBottom: 0 }}>
          Amount {formatPaise(linePaise)} — the line&apos;s (one line, one instrument)
        </p>
        {postDated ? (
          <p className={styles.pdc}>
            {paying
              ? `Post-dated: its leaf is taken now, and this line posts as its own voucher on ${displayDate(
                  form.instrumentDate,
                )} — the bank is credited, and the TDS deducted, on that date.`
              : `Post-dated: this line posts as its own voucher on ${displayDate(
                  form.instrumentDate,
                )}, and the customer's bills settle on that date, not today.`}
          </p>
        ) : null}
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    </ModalShell>
  );
}
