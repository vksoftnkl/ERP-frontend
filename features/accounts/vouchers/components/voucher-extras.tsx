"use client";

/**
 * The lower frame of every voucher — the Qt `frameLower`, group boxes side by
 * side at one height, in Qt's order:
 *
 *   Cheques on this voucher   (a type with instruments) one row per cheque
 *                             line — a receipt's: party, number, date, drawee
 *                             bank, drawer; a payment's: favouring, bank ·
 *                             book, leaf, date, crossing — with its state
 *                             (HELD / ISSUED at Post, PDC, or the register's
 *                             own once posted).
 *   Cheque books              a payment's open books — of the banks its
 *                             cheques are drawn on, or every one.
 *   GST                       the type's GST band, handed in.
 *   Bill-wise                 the one-party bill card, handed in; on a posted
 *                             voucher, read-only, what it set against which
 *                             bill and the advance it raised.
 *   Balance                   THE ONE RULE, the two sums, each line that posts
 *                             later on a voucher of its own, what each party
 *                             bears in TDS. Always there: the whole width when
 *                             it is alone (a Journal, a Contra).
 */
import type { ReactNode } from "react";
import receiptStyles from "@/features/accounts/receipt/page.module.scss";
import styles from "../vouchers.module.scss";
import { amountPaise, formatPaise, type VoucherLine } from "../domain/lines";
import type { PostedRecord } from "../state/use-voucher-entry";
import type { VoucherChequeBook } from "../vouchers.types";

export type VoucherExtrasProps = {
  paying: boolean;
  instrumentsOn: boolean;
  billwiseOn: boolean;
  readOnly: boolean;
  lines: readonly VoucherLine[];
  books: readonly VoucherChequeBook[];
  tdsNotes: readonly string[];
  postDatedNotes: readonly string[];
  posted: PostedRecord | null;
  /** The type's GST band (Qt `grpGst`). */
  gst?: ReactNode;
  /** The one-party bill card (Qt `grpBillwise`, while the voucher is open). */
  billCard?: ReactNode;
  /** Balance's sums, in paise — the server's, or the typed ones (`fresh` false) dimmed. */
  totals: { debit: number; credit: number; fresh: boolean };
};

function displayDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

function dayMonth(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}-${match[2]}` : "";
}

export type BoxProps = {
  title: string;
  /** Qt's hint label: under the box's contents, or (`hintAt` "top") above them. */
  hint?: string;
  hintAt?: "top" | "bottom";
  /** A table's viewport: framed, so its empty part reads as the table's. */
  framed?: boolean;
  /** `boxWide` / `boxRule`: the box's share of the frame. */
  className?: string;
  /** Controls above / below a framed table, outside its frame (Bill-wise's Due days, GST's reverse charge). */
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

/** One group box of the lower frame: its caption on the frame, as Qt's QGroupBox. */
export function Box({ title, hint, hintAt = "bottom", framed = false, className, header, footer, children }: BoxProps) {
  const hintLine = hint ? <p className={styles.boxHint}>{hint}</p> : null;
  return (
    <section className={[styles.box, className ?? ""].join(" ")} aria-label={title}>
      <h2 className={styles.boxTitle}>{title}</h2>
      <div className={styles.boxFrame}>
        {hintAt === "top" ? hintLine : null}
        {header}
        <div className={[styles.boxBody, framed ? styles.boxBodyFramed : ""].join(" ")}>{children}</div>
        {footer}
        {hintAt === "bottom" ? hintLine : null}
      </div>
    </section>
  );
}

export function VoucherExtras(props: VoucherExtrasProps) {
  const { paying, instrumentsOn, billwiseOn, readOnly, lines, books, tdsNotes, postDatedNotes, posted, gst, billCard, totals } =
    props;
  const boxes: ReactNode[] = [];

  if (instrumentsOn) {
    const cheques = lines
      .map((line, index) => ({ line, lineNo: index + 1 }))
      .filter(({ line }) => line.instrument?.isCheque);
    const statusOf = (line: VoucherLine): string => {
      const ins = line.instrument;
      if (!ins) {
        return "";
      }
      if (ins.pdcStatus) {
        return ins.pdcStatus;
      }
      if (ins.isPostDated) {
        return `PDC · ${dayMonth(ins.postsOn || ins.instrumentDate)}`;
      }
      return paying ? "ISSUED at Post" : "HELD after Post";
    };
    boxes.push(
      <Box
        key="cheques"
        title="Cheques on this voucher"
        className={styles.boxWide}
        framed
        hint={
          paying
            ? "The leaves shown are the books' NEXT ones; they are taken at Post. Print, presented, returned unpaid, stop, void, replace: Issued Cheques (menu 52)."
            : "No bank is asked for here: it is chosen at Deposit in Received Cheques (menu 51). A cheque belongs to one customer line; a bounce reopens only that customer's bills."
        }
      >
        {/* The headings stay up with no cheque under them, as Qt's table does. */}
        <table className={receiptStyles.panelTable}>
          <thead>
            {paying ? (
              <tr>
                <th>Line</th>
                <th>Favouring</th>
                <th>Bank · book</th>
                <th>Leaf</th>
                <th>Date</th>
                <th>Amount</th>
                <th>A/c payee</th>
                <th>Status</th>
              </tr>
            ) : (
              <tr>
                <th>Line</th>
                <th>Party</th>
                <th>Cheque no</th>
                <th>Date</th>
                <th>Drawee bank</th>
                <th>Drawer</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            )}
          </thead>
          <tbody>
            {cheques.map(({ line, lineNo }) => {
              const ins = line.instrument!;
              const amount = formatPaise(Number.isFinite(amountPaise(line.amount)) ? amountPaise(line.amount) : 0);
              return paying ? (
                <tr key={line.key}>
                  <td className={styles.alignRight}>{lineNo}</td>
                  <td>{ins.favouring || line.ledgerName}</td>
                  <td>{[ins.bankName, ins.bookNo].filter(Boolean).join(" · ")}</td>
                  <td>{ins.leaf || (ins.nextLeaf ? `${ins.nextLeaf} (next)` : "")}</td>
                  <td>{displayDate(ins.instrumentDate)}</td>
                  <td className={styles.alignRight}>{amount}</td>
                  <td>{ins.acPayee === false ? "no" : "yes"}</td>
                  <td>{statusOf(line)}</td>
                </tr>
              ) : (
                <tr key={line.key}>
                  <td className={styles.alignRight}>{lineNo}</td>
                  <td>{line.ledgerName}</td>
                  <td>{ins.refNo}</td>
                  <td>{displayDate(ins.instrumentDate)}</td>
                  <td>{ins.bankName}</td>
                  <td>{ins.drawerName}</td>
                  <td className={styles.alignRight}>{amount}</td>
                  <td>{statusOf(line)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Box>,
    );
  }

  if (instrumentsOn && paying && !readOnly) {
    const banks = new Set(
      lines
        .filter((line) => line.instrument?.isCheque && line.instrument.bankLedgerId)
        .map((line) => line.instrument!.bankLedgerId),
    );
    const shown = books.filter((book) => banks.size === 0 || banks.has(book.bankLedgerId));
    boxes.push(
      <Box key="books" title="Cheque books" framed hint="Open one in Issued Cheques (menu 52) · Cheque Books (263).">
        <table className={receiptStyles.panelTable}>
          <thead>
            <tr>
              <th>Bank</th>
              <th>Book</th>
              <th>From</th>
              <th>To</th>
              <th>Next</th>
              <th>Left</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((book) => (
              <tr key={book.chequeBookId}>
                <td>{book.bankName}</td>
                <td>{book.bookNo}</td>
                <td>{book.leafFrom}</td>
                <td>{book.leafTo}</td>
                <td>{book.nextLeaf}</td>
                <td className={styles.alignRight}>{book.left}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>,
    );
  }

  if (gst) {
    boxes.push(gst);
  }
  if (billCard) {
    boxes.push(billCard);
  }

  if (readOnly && billwiseOn && posted) {
    boxes.push(
      <Box key="bills" title="Bill-wise" hint="What this voucher set against each bill — read-only." hintAt="top">
        {posted.settled.length === 0 && posted.advances.length === 0 ? (
          <p className={receiptStyles.panelEmpty}>Nothing was set against a bill.</p>
        ) : (
          <table className={receiptStyles.panelTable}>
            <thead>
              <tr>
                <th>Bill / Ref</th>
                <th>Type</th>
                <th>Date</th>
                <th>This voucher</th>
              </tr>
            </thead>
            <tbody>
              {posted.settled.map((bill) => (
                <tr key={bill.key}>
                  <td>{bill.refno}</td>
                  <td>{bill.billType}</td>
                  <td>
                    {displayDate(bill.date)}
                    {bill.postDated ? " · post-dated" : ""}
                  </td>
                  <td className={styles.alignRight}>{formatPaise(bill.paise)}</td>
                </tr>
              ))}
              {posted.advances.map((advance) => (
                <tr key={advance.key}>
                  <td>{advance.refno}</td>
                  <td>
                    {advance.billType} {advance.side === "DR" ? "Dr" : "Cr"} · raised
                  </td>
                  <td>{advance.closed ? "closed" : `pending ${formatPaise(advance.pendingPaise)}`}</td>
                  <td className={styles.alignRight}>{formatPaise(advance.paise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Box>,
    );
  }

  return (
    <div className={styles.extras}>
      {boxes}
      <section className={`${styles.box} ${styles.boxRule}`} aria-label="Balance">
        <h2 className={styles.boxTitle}>Balance</h2>
        <div className={styles.boxFrame}>
          <p className={styles.ruleHead}>THE ONE RULE — Σ DEBIT = Σ CREDIT</p>
          <p className={`${styles.ruleTotals} ${totals.fresh ? "" : styles.ruleTotalsStale}`}>
            {`Σ Debit  ${formatPaise(totals.debit)}\nΣ Credit ${formatPaise(totals.credit)}`}
          </p>
          {postDatedNotes.length > 0 || tdsNotes.length > 0 ? (
            <ul className={styles.notes}>
              {postDatedNotes.map((text) => (
                <li key={`pdc-${text}`} className={styles.notePdc}>
                  {text}
                </li>
              ))}
              {tdsNotes.map((text) => (
                <li key={`tds-${text}`} className={styles.noteTds}>
                  {text}
                </li>
              ))}
            </ul>
          ) : null}
          {/* Save stays pressable (Qt, 2026-09-28): the server's answer says why it is refused. */}
          <p className={styles.ruleHint}>Save is refused until the difference is 0.00.</p>
        </div>
      </section>
    </div>
  );
}
