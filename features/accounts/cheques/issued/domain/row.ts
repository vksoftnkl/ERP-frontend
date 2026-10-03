/**
 * A grid 121 row, read into something the screen can trust — the received
 * side's rules (`../../domain/chequeRow.ts`): money arrives as a STRING, dates
 * as ISO strings cut to ten characters, and the KEY is read off the row
 * object, never off a cell an operator can hide.
 */
import { formatAmount, parseDate, parseMoney } from "../../domain/chequeRow";
import type {
  ChequeBookListRow,
  IssuedChequeKeys,
  IssuedChequePayload,
  IssuedChequeRow,
} from "../issued.types";

function text(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

/** `apd_ac_payee` defaults to TRUE — a crossed cheque is the rule, bearer the exception. */
function parseFlag(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  const raw = text(value).toLowerCase();
  if (["true", "t", "1", "yes"].includes(raw)) {
    return true;
  }
  if (["false", "f", "0", "no"].includes(raw)) {
    return false;
  }
  return fallback;
}

/** One row of grid 121, "MAIN LIST - ISSUED CHEQUES", under its SQL's own names. */
export function fromIssuedGridRow(raw: Record<string, unknown>): IssuedChequeRow {
  const status = text(raw.apd_status).toUpperCase();
  return {
    apdId: text(raw.apd_id),
    accYear: text(raw.apd_acc_year),
    companyId: text(raw.apd_company_id),
    branchId: text(raw.apd_branch_id),
    leaf: text(raw.apd_instrument_no),
    chequeDate: parseDate(raw.apd_instrument_date),
    issuedOn: parseDate(raw.issued_on),
    partyId: text(raw.apd_party_id),
    partyName: text(raw.party_name),
    favouring: text(raw.apd_favouring),
    amount: parseMoney(raw.apd_amount),
    bankLedgerId: text(raw.apd_bank_ledger_id),
    bankName: text(raw.bank_name),
    bookNo: text(raw.acb_book_no),
    acPayee: parseFlag(raw.apd_ac_payee, true),
    status,
    state: text(raw.state).toUpperCase() || status,
    presentedOn: parseDate(raw.apd_clear_date),
    returnedOn: parseDate(raw.apd_bounce_date),
    cancelReason: text(raw.apd_cancel_reason),
    voucherRefno: text(raw.avh_voucher_refno),
    typeCode: text(raw.vchr_type_code),
    printCount: Math.trunc(parseMoney(raw.apd_print_count)),
  };
}

/**
 * A row as an action answers it, in the register's shape — so the screen can
 * put the cursor on a replacement before the register has been re-read.
 */
export function fromIssuedPayload(payload: IssuedChequePayload, today: string): IssuedChequeRow {
  const status = text(payload.status).toUpperCase();
  const chequeDate = parseDate(payload.chequeDate);
  return {
    apdId: payload.apdId,
    accYear: text(payload.apdAccYear),
    companyId: payload.companyId,
    branchId: payload.branchId,
    leaf: text(payload.leaf),
    chequeDate,
    issuedOn: parseDate(payload.issuedOn),
    partyId: payload.partyId,
    partyName: text(payload.partyName),
    favouring: text(payload.favouring),
    amount: parseMoney(payload.amount),
    bankLedgerId: text(payload.bankLedgerId),
    bankName: text(payload.bankName),
    bookNo: text(payload.bookNo),
    acPayee: payload.acPayee !== false,
    status,
    // The grid's own rule, worked on the client's today.
    state:
      status === "HELD"
        ? chequeDate && chequeDate > today
          ? "POST-DATED"
          : "OUTSTANDING"
        : status,
    presentedOn: parseDate(payload.presentedOn),
    returnedOn: parseDate(payload.returnedOn),
    cancelReason: text(payload.cancelReason),
    voucherRefno: text(payload.voucherRefno),
    typeCode: text(payload.typeCode),
    printCount: Math.trunc(parseMoney(payload.printCount)),
  };
}

/** The four keys every route takes — BARE `companyId` / `branchId`. */
export function issuedKeysOf(row: Pick<IssuedChequeRow, "apdId" | "accYear" | "companyId" | "branchId">): IssuedChequeKeys {
  return {
    apdId: row.apdId,
    apdAccYear: row.accYear,
    companyId: row.companyId,
    branchId: row.branchId,
  };
}

/**
 * `"000124 — MURUGAN TRADERS — 5,000.00"`. The favouring, because that is the
 * name written ON the cheque, which is what the operator holds in their hand.
 */
export function describeIssued(row: Pick<IssuedChequeRow, "leaf" | "favouring" | "partyName" | "amount">): string {
  return [
    row.leaf || "(no leaf)",
    row.favouring || row.partyName || "(no payee)",
    formatAmount(row.amount),
  ].join(" — ");
}

/** One row of grid 120, "MAIN LIST - CHEQUE BOOKS". */
export function fromBookGridRow(raw: Record<string, unknown>): ChequeBookListRow {
  const next = text(raw.next_leaf);
  return {
    chequeBookId: text(raw.acb_id),
    bankName: text(raw.bank_name),
    bookNo: text(raw.acb_book_no),
    leafFrom: text(raw.leaf_from),
    leafTo: text(raw.leaf_to),
    nextLeaf: next || null,
    leavesLeft: Math.max(0, Math.trunc(parseMoney(raw.leaves_left))),
    status: text(raw.acb_status).toUpperCase(),
    remarks: text(raw.acb_remarks),
  };
}
