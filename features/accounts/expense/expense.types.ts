/**
 * Expense Voucher (ExpV, menu 277) — the wire and the draft.
 *
 * The wire half mirrors the server's `accountsModule/expense` exactly
 * (`dto/save-expense.dto.ts`, `types/expense-api.types.ts`). Every request
 * body is whitelisted (`forbidNonWhitelisted: true`): a key the DTO does not
 * declare is a 400 on the whole request, so the bodies here carry only what
 * the DTO names.
 *
 * Amounts on the wire are NUMBERS both ways — the server parses a decimal
 * string too (`RequiredNumber` runs `Number(value)` first), and the builders
 * send `"1000.00"` strings made from integer paise so no float ever reaches it.
 */

// ═══════════════════════════════════════════════════════════════════════════
//  Keys and scope
// ═══════════════════════════════════════════════════════════════════════════

/** The house key of every expense verb — `acc_voucher_header` is keyed on all four. */
export type ExpenseKeys = {
  companyId: string;
  branchId: string;
  accYear: string;
  voucherId: string;
};

/** Where a NEW voucher is written: the header's business context. */
export type ExpenseScope = {
  companyId: string;
  branchId: string;
  accYear: string;
};

export type ExpenseStatus = "DRAFT" | "POSTED" | "CANCELLED";

/** Where a tender's money left from, as the server's derive names it. */
export type ExpenseMoneyFrom = "DRAWER" | "SAFE" | "LEDGER";

// ═══════════════════════════════════════════════════════════════════════════
//  Request bodies (SaveExpenseDto, ExpenseKeyDto, CancelExpenseDto)
// ═══════════════════════════════════════════════════════════════════════════

export type ExpenseLineBody = {
  rowNo: number;
  ledgerId: string;
  /** Without a GST bill the whole amount; with one, the taxable value. */
  amount: string;
  description: string | null;
  /** Only with a GST bill. */
  taxId?: string | null;
  /** Only with a GST bill. */
  itc?: boolean;
};

export type ExpenseTenderBody = {
  tdRowNo: number;
  tdTenderId: string;
  tdTenderTypeId: number;
  tdAmount: string;
  tdRefNo: string | null;
};

export type ExpenseGstBillBody = {
  supplierGstin: string | null;
  invoiceNo: string;
  invoiceDate: string;
  placeOfSupplyCode: string | null;
};

export type SaveExpenseBody = {
  voucherId?: string;
  companyId: string;
  branchId: string;
  accYear: string;
  voucherDate: string;
  partyId: string | null;
  remarks: string | null;
  reasonId: string | null;
  /** The client's till session; the server decides from the device anyway. */
  sessionId?: string;
  lines: ExpenseLineBody[];
  tenders: ExpenseTenderBody[];
  gstBill?: ExpenseGstBillBody;
};

export type CancelExpenseBody = ExpenseKeys & { reason: string };

// ═══════════════════════════════════════════════════════════════════════════
//  Responses
// ═══════════════════════════════════════════════════════════════════════════

/** `VoucherRefusal` — what /validate lists and /post raises together. */
export type ExpenseRefusal = {
  code: string;
  message: string;
  field?: string;
  line?: number;
};

/** `VoucherWarning` — INFO is shown and never blocks; WARN here never blocks either. */
export type ExpenseWarning = ExpenseRefusal & {
  level: "INFO" | "WARN";
  overridable: boolean;
};

/** `TillApprovalNeed` — what the EXPENSE rule would ask in a till session. */
export type ExpenseApproval = {
  event: string;
  ruleId: string;
  mode: string;
  threshold: number;
  amount: number;
  minRole: string;
  channel: string;
  twoPerson: boolean;
  blocksTill: boolean;
  enforced: false;
};

export type ExpenseLegPayload = {
  rowNo: number;
  drCr: "DR" | "CR";
  ledgerId: string | null;
  ledgerName: string | null;
  role: string | null;
  amount: number;
  remarks: string | null;
  line: number | null;
};

export type ExpenseLinePayload = {
  rowNo: number;
  ledgerId: string;
  amount: number;
  description: string | null;
  costCentreId: string | null;
  taxId: string | null;
  hsn: string | null;
  itc: boolean;
  ledgerName: string | null;
  taxName: string | null;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total: number;
  itcEligibility: string | null;
};

export type ExpenseTenderPayload = {
  tdId: string | null;
  rowNo: number;
  tenderId: string;
  tenderName: string;
  tenderTypeId: number;
  tenderTypeName: string;
  amount: number;
  refNo: string | null;
  ledgerId: string;
  ledgerName: string | null;
  moneyFrom: ExpenseMoneyFrom;
};

export type ExpenseTaxSplit = { cgst: number; sgst: number; igst: number; cess: number };

export type ExpenseDerived = {
  total: number;
  taxable: number;
  tax: ExpenseTaxSplit;
  supplyNature: "INTRA" | "INTER" | null;
  placeOfSupplyCode: string | null;
  lines: ExpenseLinePayload[];
  tenders: ExpenseTenderPayload[];
  legs: ExpenseLegPayload[];
  session: { sessionId: string; accYear: string } | null;
  safeName: string | null;
};

export type ExpenseValidatePayload = {
  ok: boolean;
  derived: ExpenseDerived;
  refusals: ExpenseRefusal[];
  warnings: ExpenseWarning[];
  approval: ExpenseApproval | null;
};

export type ExpensePayload = {
  voucherId: string;
  companyId: string;
  branchId: string;
  accYear: string;
  status: ExpenseStatus;
  voucherNo: string | null;
  voucherDate: string;
  partyId: string | null;
  partyName: string | null;
  usrRefno: string | null;
  remarks: string | null;
  reasonId: string | null;
  sessionId: string | null;
  gstBill: ExpenseGstBillBody | null;
  amount: number;
  derived: ExpenseDerived;
  postedOn: string | null;
  cancelReason: string | null;
  reversalVoucherId: string | null;
  createdOn: string;
};

export type ExpensePostPayload = ExpensePayload & {
  warnings: ExpenseWarning[];
  approval: ExpenseApproval | null;
};

/** `GET /expenses/ledger-pick` — live ledgers under an Expenses group. */
export type ExpenseLedgerOption = {
  ledgerId: string;
  name: string;
  groupName: string;
  taxId: string | null;
  itcEligibility: string | null;
};

/**
 * One EXPENSE quick-pick, in `/expenses/quick-reasons`' shape — whichever
 * source filled it (the screen reads grid 134, as Qt does; `domain/reasons.ts`).
 */
export type ExpenseQuickReason = {
  reasonId: string;
  code: string;
  name: string;
  ledgerId: string | null;
  ledgerName: string | null;
  needsNote: boolean;
  needsRef: boolean;
  maxAmount: number | null;
};

/** A tender the voucher may be paid by — CASH, BANK or UPI, never a cheque. */
export type ExpenseTenderOption = {
  tenderId: string;
  name: string;
  typeId: number;
  /** CASH / BANK / UPI. */
  typeCode: string;
  ledgerName: string;
};

// ═══════════════════════════════════════════════════════════════════════════
//  The draft — what the operator typed
// ═══════════════════════════════════════════════════════════════════════════

/** One "WHAT WAS SPENT" row. Amounts are the TEXT typed; `domain/money` reads them. */
export type ExpenseLineDraft = {
  key: string;
  reasonId: string;
  ledgerId: string;
  /** A loaded line's ledger name, shown before (or without) the ledger list. */
  ledgerName: string;
  description: string;
  amount: string;
  taxId: string;
  taxName: string;
  itc: boolean;
};

/** One "HOW IT WAS PAID" row. */
export type ExpenseTenderDraft = {
  key: string;
  tenderId: string;
  /** A loaded row's own tender name, before (or without) the masters. */
  tenderName: string;
  refNo: string;
  amount: string;
};

export type ExpenseHeaderDraft = {
  voucherDate: string;
  partyId: string;
  partyName: string;
  paidTo: string;
  notes: string;
  gstBill: boolean;
  supplierGstin: string;
  invoiceNo: string;
  invoiceDate: string;
  placeOfSupply: string;
};

export type ExpenseDraft = {
  /** Set once saved; the keys of the document on the server. */
  keys: ExpenseKeys | null;
  /** `null` = NEW. */
  status: ExpenseStatus | null;
  voucherNo: string | null;
  header: ExpenseHeaderDraft;
  lines: ExpenseLineDraft[];
  tenders: ExpenseTenderDraft[];
  /** Something was typed since the last load / save. */
  dirty: boolean;
};

/**
 * The till session this device runs in, as the screen needs it. Supplied by
 * `till-session.ts` — the single integration point with the till's session
 * state (built elsewhere).
 */
export type ExpenseTillSession = {
  sessionId: string;
  sessionNo: string;
};
