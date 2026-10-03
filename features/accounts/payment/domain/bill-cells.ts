/**
 * One bill cell typed on a payment — the receipt's row cap, plus ROUNDING UP.
 *
 * ── Rounding up (notes 62 E2) ────────────────────────────────────────────
 * 5,000 paid on a 4,999.60 bill is not an over-payment to refuse — it is the
 * bill rounded up. The excess goes into R/off as a NEGATIVE figure, so the
 * bill settles exactly and After reads 0.00; on the wire it is a DR ROUND_OFF
 * line (money out on top, expensed to Round Off) and the bill's allocation
 * stays exact (`build-post.ts`). Only paise: a rupee or more over the bill is
 * a mistake, and the row cap refuses it.
 *
 * A negative R/off means exactly "what Pay is over the bill" and nothing else.
 * Typed on a bill that is not over-paid it would expense the paise AND leave
 * them pending; typed bigger or smaller than the overpayment the bill would
 * not close. So it is corrected to that figure, or cleared — and the operator
 * is told which.
 *
 * Pure: it returns the row and what to say, and reads nothing after saying it
 * — the Qt screen crashed doing this through a modal (see the receipt's
 * `clampBillCell`).
 */
import { settledPaise } from "@/features/accounts/receipt/domain/identity";
import { formatTotal, toPaise, toRupees } from "@/features/accounts/receipt/domain/money";
import type { BillRow } from "../payment.types";

export type PaymentBillColumn = "receive" | "discount" | "writeOff" | "roundOff";

export type BillCellResult = {
  bill: BillRow;
  /** A sentence for the operator, or null when the figure stood as typed. */
  message: string | null;
  /** Whether the message is a refusal (the excess was given back) or a note. */
  refused: boolean;
};

/** A paisa under a rupee: the most a round-up may be. */
const ROUND_UP_LIMIT = 99;

export function setPaymentBillCell(
  original: BillRow,
  column: PaymentBillColumn,
  typed: number,
): BillCellResult {
  const value = Number.isFinite(typed) ? typed : 0;
  // Only R/off may go negative, and only as a round-up; everything else is a
  // positive figure, as the server insists.
  const bill: BillRow = {
    ...original,
    [column]: column === "roundOff" ? toRupees(toPaise(value)) : toRupees(Math.max(0, toPaise(value))),
  };
  if (column === "receive") {
    // A typed Pay is an override: Auto-allocate works around it from now on.
    bill.receiveTyped = true;
  }

  let message: string | null = null;
  const pending = toPaise(bill.pendingAmount);

  if (column === "receive" || column === "roundOff") {
    if (column === "receive") {
      // A fresh Pay re-decides the round-up.
      bill.roundOff = toRupees(Math.max(0, toPaise(bill.roundOff)));
    }
    const plain =
      toPaise(bill.roundOff) <= 0 && toPaise(bill.discount) <= 0 && toPaise(bill.writeOff) <= 0;
    const excess = settledPaise(bill) - pending;
    if (excess > 0 && excess <= ROUND_UP_LIMIT && plain && toPaise(bill.roundOff) === 0) {
      bill.roundOff = toRupees(-excess);
      message =
        `${bill.docRefno} is paid ${formatTotal(toRupees(excess))} over its ` +
        `${formatTotal(bill.pendingAmount)} — rounded up; the ${formatTotal(toRupees(excess))} goes to Round Off.`;
    }
    if (toPaise(bill.roundOff) < -ROUND_UP_LIMIT) {
      bill.roundOff = 0;
      message =
        "Rounding up is for paise — under 1.00. Put a larger difference on account or on another bill.";
    }
    if (toPaise(bill.roundOff) < 0) {
      const over =
        toPaise(bill.receive) + toPaise(bill.discount) + toPaise(bill.writeOff) - pending;
      if (over <= 0 || toPaise(bill.discount) > 0 || toPaise(bill.writeOff) > 0) {
        bill.roundOff = 0;
        message =
          `A negative R/off rounds UP a bill paid a few paise over. ${bill.docRefno} is not paid ` +
          `over its ${formatTotal(bill.pendingAmount)} — raise Pay instead.`;
      } else if (over !== -toPaise(bill.roundOff)) {
        bill.roundOff = toRupees(-over);
        message =
          `${bill.docRefno} is paid ${formatTotal(toRupees(over))} over its ` +
          `${formatTotal(bill.pendingAmount)} — the round-up is that ` +
          `${formatTotal(toRupees(over))}, no more and no less.`;
      }
    }
  }

  // ── The row cap ───────────────────────────────────────────────────────────
  // Pay + Disc + W/back + R/off may not exceed what the bill has pending: the
  // server locks the bill and refuses the excess. Only the cell just typed is
  // given back, clamped to what still fits — the other three were deliberate.
  const settled = settledPaise(bill);
  if (settled > pending) {
    const others = settled - toPaise(bill[column]);
    const keepable = Math.max(0, pending - others);
    const refusal =
      `${bill.docRefno} has ${formatTotal(bill.pendingAmount)} pending, and ` +
      `${formatTotal(toRupees(settled))} has been placed against it. The server refuses the ` +
      "excess, so it is refused here.";
    return { bill: { ...bill, [column]: toRupees(keepable) }, message: refusal, refused: true };
  }

  return { bill, message, refused: false };
}

/** The same cap for a held debit: it may not be spent twice. */
export function clampHeldApply(
  docRefno: string,
  held: number,
  typed: number,
): { value: number; message: string | null } {
  const wanted = Math.max(0, toPaise(Number.isFinite(typed) ? typed : 0));
  const cap = toPaise(held);
  if (wanted <= cap) {
    return { value: toRupees(wanted), message: null };
  }
  return {
    value: toRupees(cap),
    message: `${docRefno} holds ${formatTotal(held)}. It cannot be spent twice.`,
  };
}
