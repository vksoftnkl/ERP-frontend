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
  /** Only with a GST bill: the HSN/SAC (≤ 10 chars on the DTO; the cell takes 8 digits, as Qt). */
  hsn?: string | null;
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

/**
 * A row picked in grid 155 "POPUP - EXPENSE REASONS" — the EXPENSE till
 * reasons (a company copy replaces the shipped row), each with its ledger and
 * that ledger's GST facts. A ledger since deleted reads as none.
 */
export type ExpenseReasonPick = {
  reasonId: string;
  name: string;
  ledgerId: string;
  ledgerName: string;
  taxId: string;
  taxName: string;
  hsn: string;
};

/**
 * A row picked in grid 156 "POPUP - EXPENSE LEDGERS" — live ledgers under an
 * Expenses group, so a party, cash, bank or tax ledger is never offered.
 */
export type ExpenseLedgerPick = {
  ledgerId: string;
  name: string;
  taxId: string;
  taxName: string;
  hsn: string;
};

/** A GST rate the line's GST cell offers (`/vouchers/tax-rates`). */
export type ExpenseRateOption = {
  taxId: string;
  name: string;
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
  /**
   * The picked reason's name. A loaded voucher carries only the id; its name
   * is then read off grid 155 when the cell is drawn ("(saved reason)" until).
   */
  reasonName: string;
  ledgerId: string;
  /** A loaded line's ledger name, shown before (or without) the ledger list. */
  ledgerName: string;
  description: string;
  /** HSN/SAC — kept only with a GST bill; a picked ledger's own fills it when blank. */
  hsn: string;
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
  /**
   * The first tender of a NEW voucher, until its amount is typed: it takes
   * whatever the lines come to less the other tenders (Qt `autoAmount`). The
   * amount is then DERIVED (`withAutoTender`), never stored.
   */
  autoAmount: boolean;
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
  /** The place of supply the operator PICKED — meaningful only with `placeOfSupplyPicked`. */
  placeOfSupply: string;
  /**
   * The operator picked the place of supply. Until then it follows the
   * GSTIN's state (Qt `m_posOverride`); a cleared pick goes back to that.
   */
  placeOfSupplyPicked: boolean;
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
