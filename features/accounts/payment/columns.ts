/**
 * The Payment screen's two grids: what each column MEANS, joined to what
 * `ui_tables` 42 "PAYMENT - BILLS" and 43 "PAYMENT - TENDERS" say about order,
 * heading, width and visibility — through the receipt's own join
 * (`resolveReceiptColumns`), so the two screens read their layouts alike.
 *
 * Both layouts are the Qt client's Desktop rows: widths are Qt fractions, and
 * the hidden key columns (BillId, DrCr, TenderId, ChequeJson, …) have no
 * meaning here because a React row carries them as fields.
 */
import {
  resolveReceiptColumns,
  type ReceiptColumnMeaning,
  type ResolvedReceiptColumn,
} from "@/features/accounts/receipt/columns";
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";

// ---------------------------------------------------------------------------
// ui table 42 — "PAYMENT - BILLS"
// ---------------------------------------------------------------------------

export type PaymentBillColumnKey =
  | "docDate"
  | "docRefno"
  | "usrRefno"
  | "billType"
  | "dueDate"
  | "daysOverdue"
  | "billAmount"
  | "paid"
  | "pendingAmount"
  | "pdcOut"
  | "pay"
  | "discount"
  | "writeBack"
  | "roundOff"
  | "after"
  | "note";

export const PAYMENT_BILL_COLUMN_MEANINGS: ReceiptColumnMeaning<PaymentBillColumnKey>[] = [
  { key: "docDate", token: "Date", kind: "date", align: "center" },
  { key: "docRefno", token: "Ref", kind: "text", align: "left" },
  // OUR reference is `docRefno`; this is the SUPPLIER's invoice number —
  // what their statement quotes.
  { key: "usrRefno", token: "Their ref", kind: "text", align: "left" },
  { key: "billType", token: "Type", kind: "chip", align: "center" },
  { key: "dueDate", token: "Due", kind: "date", align: "center" },
  { key: "daysOverdue", token: "Days", kind: "int", align: "right" },
  { key: "billAmount", token: "Bill amount", kind: "money", align: "right" },
  { key: "paid", token: "Paid", kind: "money", align: "right" },
  { key: "pendingAmount", token: "Pending / Held", kind: "money", align: "right" },
  { key: "pdcOut", token: "PDC out", kind: "money", align: "right" },
  { key: "pay", token: "Pay / Apply", kind: "money", align: "right" },
  { key: "discount", token: "Disc recd", kind: "money", align: "right" },
  { key: "writeBack", token: "W/back", kind: "money", align: "right" },
  { key: "roundOff", token: "R/off", kind: "money", align: "right" },
  { key: "after", token: "After", kind: "money", align: "right" },
  { key: "note", token: "Note", kind: "text", align: "left" },
];

export const PAYMENT_BILL_COLUMN_NUMBERS: Record<PaymentBillColumnKey, number> = {
  docDate: 0,
  docRefno: 1,
  usrRefno: 2,
  billType: 3,
  dueDate: 4,
  daysOverdue: 5,
  billAmount: 6,
  paid: 7,
  pendingAmount: 8,
  pdcOut: 9,
  pay: 10,
  discount: 11,
  writeBack: 12,
  roundOff: 13,
  after: 14,
  note: 15,
};

// ---------------------------------------------------------------------------
// ui table 43 — "PAYMENT - TENDERS"
// ---------------------------------------------------------------------------

export type PaymentTenderColumnKey =
  | "rowNo"
  | "type"
  | "amount"
  | "refNote"
  | "instrDate"
  | "bankName"
  | "charge"
  | "drCr"
  | "settlesBill"
  | "against"
  | "pdcVoucher";

export const PAYMENT_TENDER_COLUMN_MEANINGS: ReceiptColumnMeaning<PaymentTenderColumnKey>[] = [
  { key: "rowNo", token: "#", kind: "serial", align: "right" },
  { key: "type", token: "Type", kind: "picker", align: "left" },
  { key: "amount", token: "Amount", kind: "money", align: "right" },
  { key: "refNote", token: "Ref / narration", kind: "text", align: "left" },
  { key: "instrDate", token: "Instr. date", kind: "date", align: "center" },
  { key: "bankName", token: "Bank / book", kind: "text", align: "left" },
  { key: "charge", token: "Charge", kind: "money", align: "right" },
  { key: "drCr", token: "Dr/Cr", kind: "flag", align: "center" },
  { key: "settlesBill", token: "Settles bill", kind: "flag", align: "center" },
  { key: "against", token: "Against", kind: "picker", align: "left" },
  { key: "pdcVoucher", token: "PDC / voucher", kind: "chip", align: "center" },
];

export const PAYMENT_TENDER_COLUMN_NUMBERS: Record<PaymentTenderColumnKey, number> = {
  rowNo: 0,
  type: 1,
  amount: 2,
  refNote: 3,
  instrDate: 4,
  bankName: 5,
  charge: 6,
  drCr: 7,
  settlesBill: 8,
  against: 9,
  pdcVoucher: 10,
};

export function resolvePaymentBillColumns(
  rows: UiTableColumnRow[] | undefined,
): ResolvedReceiptColumn<PaymentBillColumnKey>[] {
  return resolveReceiptColumns(rows, PAYMENT_BILL_COLUMN_MEANINGS, PAYMENT_BILL_COLUMN_NUMBERS);
}

export function resolvePaymentTenderColumns(
  rows: UiTableColumnRow[] | undefined,
): ResolvedReceiptColumn<PaymentTenderColumnKey>[] {
  return resolveReceiptColumns(rows, PAYMENT_TENDER_COLUMN_MEANINGS, PAYMENT_TENDER_COLUMN_NUMBERS);
}
