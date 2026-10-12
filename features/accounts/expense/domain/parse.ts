/**
 * The server's answers → what the screen holds.
 *
 *  - `readValidate` / `readVoucher` take the `data` of a response and fill
 *    every array and object the screen walks, so a missing `legs` or `tax` on
 *    a partial answer renders as nothing rather than throwing mid-render.
 *  - `draftOfVoucher` is Qt `showVoucher()`: the voucher, back into the draft
 *    the operator edits — "Paid to" and the notes split back out of `remarks`,
 *    the reason on the first line, the lines and tenders as typed.
 */
import type {
  ExpenseApproval,
  ExpenseDerived,
  ExpenseDraft,
  ExpenseLegPayload,
  ExpenseLinePayload,
  ExpensePayload,
  ExpenseRefusal,
  ExpenseStatus,
  ExpenseTenderPayload,
  ExpenseValidatePayload,
  ExpenseWarning,
} from "../expense.types";
import { emptyLine, emptyTender } from "./draft";
import { paiseOfNumber, paiseToDecimal, tidyAmountText } from "./money";
import { REMARKS_SEPARATOR } from "./payload";

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : String(value);
}

function textOrNull(value: unknown): string | null {
  const read = text(value);
  return read ? read : null;
}

function num(value: unknown): number {
  const read = typeof value === "number" ? value : Number(value);
  return Number.isFinite(read) ? read : 0;
}

function list(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function statusOf(value: unknown): ExpenseStatus {
  const read = text(value).trim().toUpperCase();
  return read === "POSTED" || read === "CANCELLED" ? read : "DRAFT";
}

function readRefusal(raw: Json): ExpenseRefusal {
  return {
    code: text(raw.code),
    message: text(raw.message),
    ...(raw.field === undefined ? {} : { field: text(raw.field) }),
    ...(typeof raw.line === "number" ? { line: raw.line } : {}),
  };
}

function readWarning(raw: Json): ExpenseWarning {
  return {
    ...readRefusal(raw),
    level: text(raw.level) === "WARN" ? "WARN" : "INFO",
    overridable: raw.overridable === true,
  };
}

function readApproval(raw: unknown): ExpenseApproval | null {
  if (!isRecord(raw)) {
    return null;
  }
  return {
    event: text(raw.event),
    ruleId: text(raw.ruleId),
    mode: text(raw.mode),
    threshold: num(raw.threshold),
    amount: num(raw.amount),
    minRole: text(raw.minRole),
    channel: text(raw.channel),
    twoPerson: raw.twoPerson === true,
    blocksTill: raw.blocksTill === true,
    enforced: false,
  };
}

function readLine(raw: Json): ExpenseLinePayload {
  return {
    rowNo: num(raw.rowNo),
    ledgerId: text(raw.ledgerId),
    amount: num(raw.amount),
    description: textOrNull(raw.description),
    costCentreId: textOrNull(raw.costCentreId),
    taxId: textOrNull(raw.taxId),
    hsn: textOrNull(raw.hsn),
    itc: raw.itc !== false,
    ledgerName: textOrNull(raw.ledgerName),
    taxName: textOrNull(raw.taxName),
    cgst: num(raw.cgst),
    sgst: num(raw.sgst),
    igst: num(raw.igst),
    cess: num(raw.cess),
    total: num(raw.total),
    itcEligibility: textOrNull(raw.itcEligibility),
  };
}

function readTender(raw: Json): ExpenseTenderPayload {
  const from = text(raw.moneyFrom).toUpperCase();
  return {
    tdId: textOrNull(raw.tdId),
    rowNo: num(raw.rowNo),
    tenderId: text(raw.tenderId),
    tenderName: text(raw.tenderName),
    tenderTypeId: num(raw.tenderTypeId),
    tenderTypeName: text(raw.tenderTypeName),
    amount: num(raw.amount),
    refNo: textOrNull(raw.refNo),
    ledgerId: text(raw.ledgerId),
    ledgerName: textOrNull(raw.ledgerName),
    moneyFrom: from === "DRAWER" || from === "SAFE" ? from : "LEDGER",
  };
}

function readLeg(raw: Json): ExpenseLegPayload {
  return {
    rowNo: num(raw.rowNo),
    drCr: text(raw.drCr).trim().toUpperCase() === "CR" ? "CR" : "DR",
    ledgerId: textOrNull(raw.ledgerId),
    ledgerName: textOrNull(raw.ledgerName),
    role: textOrNull(raw.role),
    amount: num(raw.amount),
    remarks: textOrNull(raw.remarks),
    line: typeof raw.line === "number" ? raw.line : null,
  };
}

export function readDerived(raw: unknown): ExpenseDerived {
  const d = isRecord(raw) ? raw : {};
  const tax = isRecord(d.tax) ? d.tax : {};
  const nature = text(d.supplyNature).toUpperCase();
  const session = isRecord(d.session) && text(d.session.sessionId)
    ? { sessionId: text(d.session.sessionId), accYear: text(d.session.accYear) }
    : null;
  return {
    total: num(d.total),
    taxable: num(d.taxable),
    tax: { cgst: num(tax.cgst), sgst: num(tax.sgst), igst: num(tax.igst), cess: num(tax.cess) },
    supplyNature: nature === "INTRA" || nature === "INTER" ? nature : null,
    placeOfSupplyCode: textOrNull(d.placeOfSupplyCode),
    lines: list(d.lines).map(readLine),
    tenders: list(d.tenders).map(readTender),
    legs: list(d.legs).map(readLeg),
    session,
    safeName: textOrNull(d.safeName),
  };
}

/** `/expenses/validate`'s `data`. */
export function readValidate(raw: unknown): ExpenseValidatePayload {
  const v = isRecord(raw) ? raw : {};
  return {
    ok: v.ok === true,
    derived: readDerived(v.derived),
    refusals: list(v.refusals).map(readRefusal),
    warnings: list(v.warnings).map(readWarning),
    approval: readApproval(v.approval),
  };
}

/** `/expenses/get`, `/create`, `/post` and `/cancel`'s `data`. */
export function readVoucher(raw: unknown): ExpensePayload & { warnings: ExpenseWarning[]; approval: ExpenseApproval | null } {
  const v = isRecord(raw) ? raw : {};
  const bill = isRecord(v.gstBill) ? v.gstBill : null;
  return {
    voucherId: text(v.voucherId),
    companyId: text(v.companyId),
    branchId: text(v.branchId),
    accYear: text(v.accYear),
    status: statusOf(v.status),
    voucherNo: textOrNull(v.voucherNo),
    voucherDate: text(v.voucherDate).slice(0, 10),
    partyId: textOrNull(v.partyId),
    partyName: textOrNull(v.partyName),
    usrRefno: textOrNull(v.usrRefno),
    remarks: textOrNull(v.remarks),
    reasonId: textOrNull(v.reasonId),
    sessionId: textOrNull(v.sessionId),
    gstBill: bill
      ? {
          supplierGstin: textOrNull(bill.supplierGstin),
          invoiceNo: text(bill.invoiceNo),
          invoiceDate: text(bill.invoiceDate).slice(0, 10),
          placeOfSupplyCode: textOrNull(bill.placeOfSupplyCode),
        }
      : null,
    amount: num(v.amount),
    derived: readDerived(v.derived),
    postedOn: textOrNull(v.postedOn),
    cancelReason: textOrNull(v.cancelReason),
    reversalVoucherId: textOrNull(v.reversalVoucherId),
    createdOn: text(v.createdOn),
    // Only /post carries these; elsewhere they read as nothing.
    warnings: list(v.warnings).map(readWarning),
    approval: readApproval(v.approval),
  };
}

/** `"<paid to> — <notes>"` → its two parts (Qt splits on the same separator). */
export function splitRemarks(remarks: string | null): { paidTo: string; notes: string } {
  const parts = (remarks ?? "").split(REMARKS_SEPARATOR);
  return { paidTo: parts[0] ?? "", notes: parts.slice(1).join(REMARKS_SEPARATOR) };
}

/** A voucher from the server → the draft the screen edits (or reads, once posted). */
export function draftOfVoucher(voucher: ExpensePayload, today: string): ExpenseDraft {
  const remarks = splitRemarks(voucher.remarks);
  const bill = voucher.gstBill;
  const lines = voucher.derived.lines.map((line) => ({
    ...emptyLine(),
    ledgerId: line.ledgerId,
    ledgerName: line.ledgerName ?? "",
    description: line.description ?? "",
    amount: tidyAmountText(paiseToDecimal(paiseOfNumber(line.amount))),
    taxId: line.taxId ?? "",
    taxName: line.taxName ?? "",
    itc: line.itc,
  }));
  if (lines.length > 0 && voucher.reasonId) {
    lines[0] = { ...lines[0], reasonId: voucher.reasonId };
  }
  const tenders = voucher.derived.tenders.map((row) => ({
    ...emptyTender(row.tenderId, tidyAmountText(paiseToDecimal(paiseOfNumber(row.amount)))),
    tenderName: row.tenderName,
    refNo: row.refNo ?? "",
  }));
  return {
    keys: {
      companyId: voucher.companyId,
      branchId: voucher.branchId,
      accYear: voucher.accYear,
      voucherId: voucher.voucherId,
    },
    status: voucher.status,
    voucherNo: voucher.voucherNo,
    header: {
      voucherDate: voucher.voucherDate || today,
      partyId: voucher.partyId ?? "",
      partyName: voucher.partyName ?? "",
      paidTo: remarks.paidTo,
      notes: remarks.notes,
      gstBill: bill !== null,
      supplierGstin: bill?.supplierGstin ?? "",
      invoiceNo: bill?.invoiceNo ?? "",
      invoiceDate: bill?.invoiceDate || today,
      placeOfSupply: bill?.placeOfSupplyCode ?? "",
    },
    lines: lines.length > 0 ? lines : [emptyLine()],
    tenders: tenders.length > 0 ? tenders : [emptyTender()],
    dirty: false,
  };
}
