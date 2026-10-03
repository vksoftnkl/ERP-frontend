/**
 * Which tenders a payment may go out on, and what each kind of row carries.
 *
 * ── Four kinds, and only four ────────────────────────────────────────────
 * Money leaves as CASH, a BANK transfer, a CHEQUE from one of our books, or
 * UPI. The server's own instrument list for a payment voucher filters to
 * exactly these (`/vouchers/instruments?typeCode=PmtV` → types 1, 3, 5, 6), and
 * the Qt screen offers the same: a card, a wallet or a gift voucher is money
 * coming IN.
 *
 * ── What each kind carries ───────────────────────────────────────────────
 *  - CHEQUE — the BOOK it is written from, its date, who it is to and whether
 *    it is crossed. NEVER a number: the leaf is the server's, taken from the
 *    book under its row lock at post, and a `tdRefNo` on a cheque row is a 400.
 *  - BANK / UPI — a TRANSFER: the UTR (optional), the bank's CHARGE (inside the
 *    amount) and a beneficiary snapshot; a UPI row also the payee's VPA.
 *  - CASH — an amount and an optional reference.
 *
 * The tender master's own rules (usable on a date, display order) are the
 * receipt's, which are the counter's — not restated here.
 */
import type { TenderMasterRow } from "@/features/sales/sale-order/sale-order.types";
import { isTenderUsable, typeDefaultsOf } from "@/features/sales/sale-order/tender/rows";
import { isPdc } from "@/features/sales/sale-order/tender/instruments";
import type { BeneficiaryDraft, PaymentChequeExtras, PaymentTenderRow } from "../payment.types";

export { isPdc };

export type PaymentTenderKind = "CASH" | "CHEQUE" | "TRANSFER";

/** The tender TYPE codes a payment may go out on. */
const PAYABLE_CODES: ReadonlySet<string> = new Set(["CASH", "BANK", "CHEQUE", "UPI"]);

function codeOf(typeId: number): string {
  return typeDefaultsOf(typeId).code;
}

export function isChequeType(typeId: number): boolean {
  return codeOf(typeId) === "CHEQUE";
}

/** A bank transfer or UPI — the rows with a beneficiary and a charge. */
export function isTransferType(typeId: number): boolean {
  const code = codeOf(typeId);
  return code === "BANK" || code === "UPI";
}

export function isUpiType(typeId: number): boolean {
  return codeOf(typeId) === "UPI";
}

export function kindOf(typeId: number): PaymentTenderKind {
  if (isChequeType(typeId)) {
    return "CHEQUE";
  }
  return isTransferType(typeId) ? "TRANSFER" : "CASH";
}

function typeIdOf(master: TenderMasterRow): number {
  return Number.parseInt(master.tndTypeId, 10) || 0;
}

/**
 * The tenders offered on a payment dated `onDate`, in display order.
 *
 * An EMPTY list is an answer the screen has to show, not a reason to invent a
 * cash row: the tender's own ledger is what the posting engine credits.
 */
export function payableTenders(
  masters: readonly TenderMasterRow[],
  onDate: string,
): TenderMasterRow[] {
  return masters
    .filter((master) => isTenderUsable(master, onDate))
    .filter((master) => PAYABLE_CODES.has(codeOf(typeIdOf(master))))
    .sort(
      (left, right) =>
        left.tndDisplayPosition - right.tndDisplayPosition ||
        left.tndName.localeCompare(right.tndName),
    );
}

/** The master a fresh payment starts on: the default, else the first offered. */
export function defaultPaymentTender(
  masters: readonly TenderMasterRow[],
): TenderMasterRow | null {
  return masters.find((master) => master.tndIsDefault) ?? masters[0] ?? null;
}

export function emptyCheque(): PaymentChequeExtras {
  return { chequeBookId: null, favouring: "", acPayee: true };
}

export function emptyBeneficiary(): BeneficiaryDraft {
  return { name: "", accountNo: "", ifsc: "" };
}

let tenderKeySequence = 0;

/** A blank instrument row on one master. */
export function paymentTenderRowFrom(master: TenderMasterRow): PaymentTenderRow {
  tenderKeySequence += 1;
  return {
    key: `payment-tender-${tenderKeySequence}`,
    tdId: null,
    tenderId: master.tndId,
    tenderTypeId: typeIdOf(master),
    tenderName: master.tndName,
    tenderLedgerId: master.tndLedgerId || null,
    amount: 0,
    receivedAmt: 0,
    changeAmt: 0,
    mdrAmt: 0,
    refNo: "",
    bankName: "",
    payerVpa: "",
    instrumentDate: "",
    cheque: emptyCheque(),
    beneficiary: emptyBeneficiary(),
    pdcVoucherRefno: null,
    leaf: null,
    bookNo: null,
  };
}

/**
 * Move a row onto another tender, DROPPING what the new kind cannot hold —
 * the Qt screen's rule: off a cheque the date and the book go; off a transfer
 * the beneficiary, the VPA and the charge go; the painted bank always goes.
 * Carrying them over would send a cheque book on a cash row.
 */
export function retargetPaymentTender(
  row: PaymentTenderRow,
  master: TenderMasterRow,
): PaymentTenderRow {
  const typeId = typeIdOf(master);
  const cheque = isChequeType(typeId);
  const transfer = isTransferType(typeId);
  return {
    ...row,
    tenderId: master.tndId,
    tenderTypeId: typeId,
    tenderName: master.tndName,
    tenderLedgerId: master.tndLedgerId || null,
    instrumentDate: cheque ? row.instrumentDate : "",
    cheque: cheque ? row.cheque : emptyCheque(),
    // A cheque's reference is the server's leaf; a typed one would be a 400.
    refNo: cheque ? "" : row.refNo,
    beneficiary: transfer ? row.beneficiary : emptyBeneficiary(),
    payerVpa: isUpiType(typeId) ? row.payerVpa : "",
    mdrAmt: transfer ? row.mdrAmt : 0,
    bankName: "",
    receivedAmt: 0,
    changeAmt: 0,
    leaf: null,
    bookNo: null,
  };
}

/** The Default button: back on the default tender with nothing carried over. */
export function resetToTender(row: PaymentTenderRow, master: TenderMasterRow): PaymentTenderRow {
  return {
    ...retargetPaymentTender(row, master),
    refNo: "",
    mdrAmt: 0,
    payerVpa: "",
    beneficiary: emptyBeneficiary(),
  };
}

/** Last four of an account number, for "→ name ····1234". */
export function lastFour(accountNo: string): string {
  const digits = (accountNo ?? "").replace(/\s/g, "");
  return digits.length <= 4 ? digits : digits.slice(-4);
}

/** The IFSC shape — 4 letters, a 0, then 6 letters or digits. */
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
