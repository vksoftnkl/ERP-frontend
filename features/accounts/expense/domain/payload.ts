/**
 * The draft → the body of `/expenses/create` and `/expenses/validate` (the
 * same `SaveExpenseDto`), and the one sentence that says why it cannot go yet.
 *
 * Mirrors Qt `ExpenseVoucherEntry::body()` / `problem()`:
 *  - a line with neither a ledger nor an amount is an empty row and is left
 *    out; a half-filled one is a problem (the server refuses it whole);
 *  - a tender row with no master, or with a zero amount, is left out (the
 *    server 400s a zero tender rather than ignoring it);
 *  - `rowNo` / `tdRowNo` are the row's position on screen, gaps and all, so a
 *    refusal "Row 3: …" and the server's derived line 3 land on the row the
 *    operator sees as 3;
 *  - "Paid to" and the notes travel as the header's remarks,
 *    `"<paid to> — <notes>"` (split back by `parse.ts`);
 *  - the tax fields go only with a GST bill.
 */
import type {
  ExpenseDraft,
  ExpenseGstBillBody,
  ExpenseLineBody,
  ExpenseScope,
  ExpenseTenderBody,
  ExpenseTenderOption,
  ExpenseTillSession,
  SaveExpenseBody,
} from "../expense.types";
import { isEditable } from "./draft";
import { paiseOfText, paiseToDecimal, parseAmountText } from "./money";

/** The separator between "Paid to" and the notes inside `remarks`. */
export const REMARKS_SEPARATOR = " — ";

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** `"<paid to> — <notes>"`, either part optional; null when both are blank. */
export function joinRemarks(paidTo: string, notes: string): string | null {
  const parts = [paidTo.trim(), notes.trim()].filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join(REMARKS_SEPARATOR) : null;
}

/** A row that carries nothing: neither a ledger nor an amount. Left out of the body. */
export function isEmptyLine(line: { ledgerId: string; amount: string }): boolean {
  return !line.ledgerId && paiseOfText(line.amount) === 0 && parseAmountText(line.amount) !== null;
}

export type ExpenseBodyInput = {
  draft: ExpenseDraft;
  /** Where a NEW voucher goes; a saved one goes back to its own keys. */
  scope: ExpenseScope;
  /** The tenders on offer — a row's type id comes from its master. */
  tenders: readonly ExpenseTenderOption[];
  /** The till session this device runs in, if any (`till-session.ts`). */
  session: ExpenseTillSession | null;
};

export function buildExpenseBody({ draft, scope, tenders, session }: ExpenseBodyInput): SaveExpenseBody {
  const keys = draft.keys;
  const { header } = draft;
  const gst = header.gstBill;

  const lines: ExpenseLineBody[] = [];
  draft.lines.forEach((line, index) => {
    if (isEmptyLine(line)) {
      return;
    }
    const body: ExpenseLineBody = {
      rowNo: index + 1,
      ledgerId: line.ledgerId,
      amount: paiseToDecimal(paiseOfText(line.amount)),
      description: textOrNull(line.description),
    };
    if (gst) {
      body.taxId = line.taxId ? line.taxId : null;
      body.itc = line.itc;
    }
    lines.push(body);
  });

  const tenderRows: ExpenseTenderBody[] = [];
  draft.tenders.forEach((row, index) => {
    const master = tenders.find((option) => option.tenderId === row.tenderId);
    const paise = paiseOfText(row.amount);
    if (!master || paise === 0) {
      return;
    }
    tenderRows.push({
      tdRowNo: index + 1,
      tdTenderId: master.tenderId,
      tdTenderTypeId: master.typeId,
      tdAmount: paiseToDecimal(paise),
      tdRefNo: textOrNull(row.refNo),
    });
  });

  const body: SaveExpenseBody = {
    ...(keys ? { voucherId: keys.voucherId } : {}),
    companyId: keys?.companyId ?? scope.companyId,
    branchId: keys?.branchId ?? scope.branchId,
    accYear: keys?.accYear ?? scope.accYear,
    voucherDate: header.voucherDate,
    partyId: header.partyId ? header.partyId : null,
    remarks: joinRemarks(header.paidTo, header.notes),
    reasonId: draft.lines[0]?.reasonId ? draft.lines[0].reasonId : null,
    ...(session ? { sessionId: session.sessionId } : {}),
    lines,
    tenders: tenderRows,
  };
  if (gst) {
    const bill: ExpenseGstBillBody = {
      supplierGstin: textOrNull(header.supplierGstin.toUpperCase()),
      invoiceNo: header.invoiceNo.trim().toUpperCase(),
      invoiceDate: header.invoiceDate,
      placeOfSupplyCode: textOrNull(header.placeOfSupply),
    };
    body.gstBill = bill;
  }
  return body;
}

/**
 * Why the voucher cannot be saved or checked as it stands, in Qt's words — or
 * null. The server is asked nothing while this answers: a half-filled line
 * would only come back as a 400.
 */
export function expenseProblem(input: ExpenseBodyInput): string | null {
  const { draft } = input;
  if (!isEditable(draft.status)) {
    return `The voucher is ${draft.status}.`;
  }
  const body = buildExpenseBody(input);
  if (!body.companyId || !body.branchId || !body.accYear) {
    return "Choose the company, branch and year in the header first.";
  }
  // A blank date is a DTO 400 ("must be a valid ISO 8601 date string"); say it plainly.
  if (!draft.header.voucherDate) {
    return "Enter the voucher date.";
  }
  if (draft.header.gstBill && !draft.header.invoiceDate) {
    return "With a GST bill: enter the invoice date.";
  }
  if (body.lines.length === 0) {
    return "Add what was spent.";
  }
  for (let index = 0; index < draft.lines.length; index += 1) {
    const line = draft.lines[index];
    if (isEmptyLine(line)) {
      continue;
    }
    const paise = parseAmountText(line.amount);
    if (paise === null) {
      return `Line ${index + 1}: the amount is not a number.`;
    }
    if (!line.ledgerId) {
      return `Line ${index + 1}: pick the expense ledger.`;
    }
    if (paise < 1) {
      return `Line ${index + 1}: enter the amount.`;
    }
  }
  for (let index = 0; index < draft.tenders.length; index += 1) {
    if (parseAmountText(draft.tenders[index].amount) === null) {
      return `Tender ${index + 1}: the amount is not a number.`;
    }
  }
  if (body.tenders.length === 0) {
    return "Add how it was paid.";
  }
  return null;
}

/**
 * What only POST adds to that: a GST bill's invoice number. The server's
 * derive does not refuse a blank one (its README says it should —
 * EXPENSE_GST_INCOMPLETE), and a GSTR-2 row with no invoice number is one the
 * supplier's return can never match, so the screen holds Post back itself. A
 * draft may still be saved without it.
 */
export function expensePostProblem(input: ExpenseBodyInput): string | null {
  const problem = expenseProblem(input);
  if (problem) {
    return problem;
  }
  const { header } = input.draft;
  if (header.gstBill && !header.invoiceNo.trim()) {
    return "With a GST bill: enter the supplier's invoice no.";
  }
  return null;
}

/** A stable fingerprint of a body: the validate answer is current only for this exact body. */
export function bodyKeyOf(body: SaveExpenseBody): string {
  return JSON.stringify(body);
}
