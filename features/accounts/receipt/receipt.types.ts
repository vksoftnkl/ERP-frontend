/**
 * Receipt Entry (menu 99) — the wire contract and the draft model.
 *
 * The wire half is the server's own
 * `src/modules/accountsModule/receipt/types/receipt-api.types.ts` transcribed,
 * nothing more. The draft half is what the screen edits, and it is deliberately
 * NOT the wire shape: the grids hold one list of bills and one list of credits,
 * the payload builders turn those into `allocations[]`, `creditsApplied[]` and
 * `otherLineBills[]`, and no component ever touches a wire field.
 *
 * Two things to know before reading anything else:
 *
 *  - **`partyId` is the ledger.** `sales.customers.cus_id` IS
 *    `acc_ledger_master.led_id` — a customer is created by copying the new
 *    ledger's id — so nothing is bridged or resolved here, and a body carrying
 *    `customerId` is a 400.
 *  - **Amounts are positive and the side is a flag.** `ck_av_amount` and
 *    `ck_abl_amount` both require `> 0`, and the side travels as `'DR'`/`'CR'`.
 *    A minus never goes on the wire. (Opening Balance's `'D'`/`'C'` is a
 *    different column on a different table — do not reuse that helper here.)
 */

// ---------------------------------------------------------------------------
// Enumerations — `types/receipt-enum.ts`
// ---------------------------------------------------------------------------

export type VoucherStatus = "DRAFT" | "APPROVED" | "POSTED" | "CANCELLED";

/**
 * `avh_device_type`. The React client is WEB. (APPROVED is in the enum above
 * for completeness only: the approval step was withdrawn on 2026-09-15 for
 * every accounts screen, so a receipt goes DRAFT → POSTED → CANCELLED.)
 */
export type VoucherDeviceType = "PC" | "WEB" | "MOBILE" | "POS" | "DESKTOP";

export type DrCr = "DR" | "CR";

export type BillType =
  | "SALES"
  | "PURCHASE"
  | "SALES_RETURN"
  | "PURCHASE_RETURN"
  | "OPENING"
  | "ADVANCE"
  | "INTEREST"
  | "JOURNAL";

export type BillStatus = "OPEN" | "PARTIAL" | "CLOSED";

/**
 * `abj_adj_type` — how one adjustment row settled a bill. The screen routes a
 * loaded receipt's history into columns by this (`domain/adj-type.ts`), which is
 * the only reason the client needs to know the set at all.
 */
export type BillAdjType =
  | "ALLOCATION"
  | "ADVANCE_ADJUST"
  | "NOTE_ADJUST"
  | "DISCOUNT"
  | "WRITEOFF"
  | "ROUND_OFF"
  | "TRANSFER";

export type BillSettlementMode = string;

export type PdcStatus =
  | "HELD"
  | "DEPOSITED"
  | "CLEARED"
  | "BOUNCED"
  | "RETURNED"
  | "CANCELLED"
  | "REPLACED";

/**
 * `accounts.tcs_basis`. On SALES the invoice already carries the TCS and the
 * receipt raises nothing; on RECEIPT the receipt collects it as a TCS_PAYABLE
 * line. The two never both apply — see `domain/seeded-lines.ts`.
 */
export type TcsBasis = "SALES" | "RECEIPT";

/**
 * The posting roles this screen can put on a line (`av_role`), out of
 * `ReceiptLedgerRole`. A role is resolved to a ledger server-side through
 * `accounts.acc_ledger_map`, never by name, so the client sends the role and
 * never a ledger id for these.
 */
export type ReceiptRole =
  | "TDS_RECEIVABLE"
  | "BANK_CHARGES"
  | "SURCHARGE_RECOVERED"
  | "CLAIMS_ALLOWED"
  | "INTEREST_INCOME"
  | "DISCOUNT_ALLOWED"
  | "WRITE_OFF"
  | "ROUND_OFF"
  | "TCS_PAYABLE";

// ---------------------------------------------------------------------------
// Wire — GET /receipts/open-items
// ---------------------------------------------------------------------------

export type OpenBillWire = {
  billId: string;
  billAccYear: string;
  billType: BillType;
  docRefno: string;
  /** The CUSTOMER's own reference — what their remittance advice quotes. */
  usrRefno: string | null;
  docDate: string;
  dueDate: string | null;
  billAmount: number;
  pendingAmount: number;
  status: BillStatus;
  daysOverdue: number;
  /**
   * `null` is NOT zero: the bill has no sale bill behind it, or one of its
   * lines carries no profit figure. Rendered blank, never `0.00` — an OPENING
   * bill was typed, not sold, and a zero there reads as "sold at cost".
   */
  billProfit: number | null;
  billProfitPreTax: number | null;
  /** Post-dated money already promised to this bill and not yet matured. */
  pdcHeld: number;
  /** What the prompt-payment slabs suggest AT THE RECEIPT'S DATE. */
  ppdSuggested: number;
  tcsAmount: number;
  tcsPending: number;
};

export type OpenCreditWire = {
  billId: string;
  billAccYear: string;
  billType: BillType;
  docRefno: string;
  docDate: string;
  billAmount: number;
  pendingAmount: number;
  srcModule: string | null;
  srcDocType: string | null;
  /** The voucher that created it. An amend uses this to drop its OWN advance. */
  srcDocId: string | null;
  srcAccYear: string | null;
  narration: string | null;
  status: BillStatus;
  drCr: DrCr;
  adjType: BillAdjType;
  settlementMode: BillSettlementMode;
};

export type OpenItemsSummary = {
  totalPending: number;
  billCount: number;
  overdueCount: number;
  creditsHeld: number;
  pdcHeld: number;
};

export type OpenItemsParty = {
  ledId: string;
  ledName: string;
  groupName: string | null;
  isBillByBill: boolean;
  isTdsApplicable: boolean;
  tdsDeducteeType: string | null;
  isTcsApplicable: boolean;
  tcsBasis: TcsBasis;
  tanNo: string | null;
};

export type OpenItemsPayload = {
  bills: OpenBillWire[];
  credits: OpenCreditWire[];
  summary: OpenItemsSummary;
  party: OpenItemsParty;
};

// ---------------------------------------------------------------------------
// Wire — GET /receipts/party-context
// ---------------------------------------------------------------------------

export type PartyRecentReceipt = {
  voucherId: string;
  accYear: string;
  voucherRefno: string | null;
  voucherDate: string;
  docAmount: number;
  adjustAmount: number;
  /** 'Cash, UPI' — the tender type names, de-duplicated. */
  instruments: string | null;
};

export type PartyPendingCheque = {
  pdcId: string;
  accYear: string;
  instrumentNo: string;
  instrumentDate: string;
  amount: number;
  bankName: string | null;
  status: PdcStatus;
  voucherId: string | null;
  voucherRefno: string | null;
};

/** The three party-wide figures nothing in `/open-items` can add up to. */
export type PartyContextSummary = {
  /** Net across everything, every year. Negative = we hold more than they owe. */
  totalBalance: number;
  totalOutstanding: number;
  totalCredits: number;
  chequesOutstanding: number;
};

export type PartyContextPayload = {
  partyId: string;
  partyName: string;
  summary: PartyContextSummary;
  lastReceipts: PartyRecentReceipt[];
  pendingCheques: PartyPendingCheque[];
};

// ---------------------------------------------------------------------------
// Wire — GET /receipts/adjacent, GET /receipts/duplicate-check
// ---------------------------------------------------------------------------

export type AdjacentVoucher = {
  voucherId: string;
  accYear: string;
  /** The WHOLE key comes back, so a neighbour in another branch opens right. */
  companyId: string;
  branchId: string;
  voucherRefno: string | null;
  voucherDate: string;
  partyId: string;
  partyName: string | null;
  docAmount: number;
  status: VoucherStatus;
};

export type AdjacentVoucherPayload = {
  direction: "prev" | "next";
  fromVoucherId: string;
  /** Null at the end of the register. That null is an ANSWER, not a failure. */
  voucher: AdjacentVoucher | null;
};

export type DuplicateReceipt = {
  voucherId: string;
  accYear: string;
  branchId: string;
  voucherRefno: string | null;
  voucherDate: string;
  docAmount: number;
  status: VoucherStatus;
  createdBy: string | null;
  createdOn: string;
};

export type DuplicateCheckPayload = {
  isDuplicate: boolean;
  matches: DuplicateReceipt[];
};

// ---------------------------------------------------------------------------
// Wire — the receipt itself
// ---------------------------------------------------------------------------

export type ReceiptTenderWire = {
  tdId: string;
  tdRowNo: number;
  tdTenderId: string;
  tdTenderName: string | null;
  tdTenderTypeId: number;
  tdTenderLedgerId: string;
  tdAmount: number;
  tdSurchargePerc: number;
  tdSurchargeAmt: number;
  tdMdrAmt: number;
  tdReceivedAmt: number;
  tdChangeAmt: number;
  tdRefNo: string | null;
  tdBankName: string | null;
  tdPayerVpa: string | null;
  tdInstrumentDate: string | null;
  /** SERVER-DERIVED from the dates. Never sent — see `payload/build-draft.ts`. */
  tdIsPdc: boolean;
  tdVoucherId: string | null;
};

export type ReceiptOtherLineWire = {
  lineNo: number;
  role: string | null;
  ledgerId: string;
  ledgerName: string | null;
  drCr: DrCr;
  amount: number;
  settlesBill: boolean;
  narration: string | null;
};

export type ReceiptLeg = {
  avId: string;
  avRowNo: number;
  avDrCr: DrCr;
  avLedgerId: string;
  avLedgerName: string | null;
  avAmount: number;
  avRole: string | null;
  avRemarks: string | null;
};

/**
 * One `acc_bill_adjustment` row — or, on a DRAFT, one settlement the operator
 * arranged and the draft merely REMEMBERS (`abjId` is null, and nothing has
 * been written).
 *
 * On a POSTED receipt this array is the voucher's HISTORY, not its current
 * state: `acc_bill_adjustment` never rewrites or soft-deletes a row, it
 * retracts by inserting the exact negative. So one bill can appear three times
 * — original, reversal, replacement — and netting them is the reader's job.
 * `domain/net-allocations.ts` does it.
 */
export type ReceiptAllocationWire = {
  abjId: string | null;
  billId: string;
  billAccYear: string;
  docRefno: string;
  docDate: string | null;
  billType: BillType | null;
  billAmount: number | null;
  /** Pending **as it stands NOW**, already net of this receipt. */
  pendingAmount: number | null;
  dueDate: string | null;
  status: BillStatus | null;
  adjType: BillAdjType;
  settlementMode: BillSettlementMode | null;
  drCr: DrCr;
  amount: number;
  adjDate: string;
  isPostDated: boolean;
  /** A post-dated row whose date has arrived. Absent means true. */
  matured?: boolean;
  voucherId: string | null;
  chequeId: string | null;
  againstBillId: string | null;
  againstBillRefno: string | null;
  reversalOfId: string | null;
  isReversed: boolean;
  approvedBy: string | null;
  remarks: string | null;
};

export type ReceiptChequeWire = {
  pdcId: string;
  accYear: string;
  tenderRowNo: number | null;
  instrumentType: string;
  instrumentNo: string;
  instrumentDate: string;
  amount: number;
  bankName: string | null;
  bankBranch: string | null;
  ifsc: string | null;
  drawerName: string | null;
  bankLedgerId: string | null;
  status: PdcStatus;
  postingMode: string;
  voucherId: string | null;
};

/** A post-dated cheque's own voucher (R2) — dated the cheque, not the receipt. */
export type ReceiptPdcVoucher = {
  voucherId: string;
  accYear: string;
  voucherRefno: string | null;
  voucherDate: string;
  docAmount: number;
  adjustAmount: number;
  status: VoucherStatus;
  legs: ReceiptLeg[];
};

export type ReceiptAdvanceBill = {
  billId: string;
  billAccYear: string;
  docRefno: string;
  docDate: string;
  billAmount: number;
  pendingAmount: number;
  voucherId: string | null;
};

export type ReceiptHeaderWire = {
  avhVoucherId: string;
  avhCompanyId: string;
  avhBranchId: string;
  avhTenantId: string | null;
  avhAccYear: string;
  avhVoucherTypeId: number;
  avhVoucherNo: string | null;
  avhVoucherSlno: string | null;
  avhVoucherRefno: string | null;
  avhVoucherDate: string;
  avhPartyId: string;
  avhPartyName: string | null;
  avhEmployeeId: string[];
  avhUsrRefno: string | null;
  avhDocRefno: string | null;
  avhDocDate: string | null;
  avhDocAmount: number;
  avhAdjustAmount: number;
  avhRoundOff: number;
  avhTotalDebit: number;
  avhTotalCredit: number;
  avhRemarks: string | null;
  avhVoucherStatus: VoucherStatus;
  avhStatusOn: string | null;
  avhStatusBy: string | null;
  avhPostedOn: string | null;
  avhCancelReason: string | null;
  /** R20 — the optimistic lock an amend sends straight back as `baseRevision`. */
  avhRevisionNo: number;
  avhReversalVoucherId: string | null;
  avhAgainstVoucherId: string | null;
  avhPrintCount: number;
  avhDeviceType: string | null;
  avhUserId: string;
  avhCreatedOn: string;
  avhCreatedBy: string | null;
  avhModifiedOn: string | null;
  avhModifiedBy: string | null;
};

/** What `POST /receipts/create` answers with. */
export type ReceiptDraftPayload = {
  header: ReceiptHeaderWire;
  tenders: ReceiptTenderWire[];
  otherLines: ReceiptOtherLineWire[];
  /**
   * Roles the PARTY's flags imply a line for that this payload has none of.
   * Reported rather than seeded because there is no TDS or TCS RATE anywhere in
   * the schema — only booleans — so the server has no amount to put on one.
   */
  expectedRoles: string[];
};

/** What `GET /receipts/get` answers with. */
export type ReceiptPayload = {
  header: ReceiptHeaderWire;
  tenders: ReceiptTenderWire[];
  otherLines: ReceiptOtherLineWire[];
  legs: ReceiptLeg[];
  /** HISTORY. See `ReceiptAllocationWire`. */
  allocations: ReceiptAllocationWire[];
  creditsApplied: ReceiptAllocationWire[];
  cheques: ReceiptChequeWire[];
  pdcVouchers: ReceiptPdcVoucher[];
  advanceBills: ReceiptAdvanceBill[];
};

export type ReceiptPostPayload = ReceiptPayload & {
  numberedVouchers: Array<{
    voucherId: string;
    accYear: string;
    voucherRefno: string | null;
    voucherDate: string;
    docAmount: number;
    adjustAmount: number;
    isPdcVoucher: boolean;
  }>;
  billsAfter: Array<{
    billId: string;
    billAccYear: string;
    docRefno: string;
    billAmount: number;
    pendingAmount: number;
    postDatedHeld: number;
  }>;
  totalOnAccount: number;
};

export type ReceiptAmendPayload = ReceiptPostPayload & {
  fromRevision: number;
  toRevision: number;
  editRemark: string;
  unwound: {
    adjustmentsReversed: number;
    legsRemoved: number;
    pdcVouchersRemoved: number;
    chequesRemoved: number;
    advanceBillsRemoved: number;
    tendersRemoved: number;
  };
};

export type ReceiptCancelPayload = {
  avhVoucherId: string;
  avhAccYear: string;
  avhVoucherRefno: string | null;
  fromStatus: VoucherStatus;
  toStatus: VoucherStatus;
  avhStatusOn: string | null;
  avhStatusBy: string | null;
  reversals: Array<{
    ofVoucherId: string;
    reversalVoucherId: string;
    accYear: string;
    voucherRefno: string | null;
    legCount: number;
    adjustmentCount: number;
  }>;
  billsReopened: Array<{
    billId: string;
    billAccYear: string;
    docRefno: string;
    pendingAmount: number;
  }>;
  chequesCancelled: string[];
  advanceBillsRemoved: string[];
};

/**
 * A DRAFT thrown away. NOT a status move: the status column is left at DRAFT
 * and the row leaves play through `avh_is_deleted`, because a draft never took
 * a number to cancel (R10).
 */
export type ReceiptDeletePayload = {
  avhVoucherId: string;
  avhAccYear: string;
  /** Always null. */
  avhVoucherRefno: string | null;
  status: VoucherStatus;
  deletedOn: string;
  deletedBy: string;
  tendersDeleted: number;
  otherLinesDeleted: number;
};

// ---------------------------------------------------------------------------
// Wire — request bodies
// ---------------------------------------------------------------------------

/**
 * The four keys that address an existing receipt on EVERY route. Never a bare
 * id: `acc_voucher_header` is keyed on all four, and `acc_bill_balance` is
 * partitioned by the year the bill originated in.
 *
 * `/adjacent` and `/duplicate-check` spell them without the `avh` prefix. That
 * is their spelling, not a second concept — see `api/receipt-api.ts`.
 */
export type ReceiptKeys = {
  avhVoucherId: string;
  avhCompanyId: string;
  avhBranchId: string;
  avhAccYear: string;
};

export type SaveReceiptChequeBody = {
  bankBranch?: string | null;
  ifsc?: string | null;
  micr?: string | null;
  drawerName?: string | null;
  bankLedgerId?: string | null;
};

export type SaveReceiptTenderBody = {
  tdId?: string;
  tdRowNo: number;
  tdTenderId: string;
  tdTenderTypeId: number;
  tdTenderLedgerId?: string;
  tdAmount: number;
  tdReceivedAmt?: number;
  tdChangeAmt?: number;
  tdMdrAmt?: number;
  tdRefNo?: string | null;
  tdBankName?: string | null;
  tdPayerVpa?: string | null;
  /** ISO. Later than the receipt's date is what MAKES it a PDC, server-side. */
  tdInstrumentDate?: string | null;
  cheque?: SaveReceiptChequeBody;
};

/**
 * One other-ledger line. **`role` or `ledgerId`, never both** — a body carrying
 * the two is a 400.
 */
export type SaveReceiptOtherLineBody = {
  role?: string;
  ledgerId?: string;
  drCr: DrCr;
  amount: number;
  settlesBill?: boolean;
  narration?: string | null;
};

/**
 * `POST /receipts/create`.
 *
 * **Nothing may be added to this shape.** The server runs its ValidationPipe
 * with `forbidNonWhitelisted: true`, so one unknown key fails the whole
 * request — which is why the beat (`areaId`) is NOT sent, although the Qt
 * screen's plan lists it: `SaveDraftReceiptDto` has no such property, and the
 * beat filters the customer dropdown and nothing else.
 */
export type SaveDraftReceiptBody = {
  /** Absent on the first save. Present = update that draft. */
  avhVoucherId?: string;
  avhCompanyId: string;
  avhBranchId: string;
  avhAccYear: string;
  avhVoucherDate: string;
  avhPartyId: string;
  /** ONE element. "Collected by ONE person" is the whole rule. */
  avhEmployeeId?: string[];
  avhUsrRefno?: string | null;
  avhDocRefno?: string | null;
  avhDocDate?: string | null;
  avhRemarks?: string | null;
  avhDeviceType?: VoucherDeviceType;
  avhUserId?: string;
  tenders: SaveReceiptTenderBody[];
  /** Only `linesThatTravel` — see `domain/roles.ts`. */
  otherLines?: SaveReceiptOtherLineBody[];
  /** The MEMO (notes 30), which carries the RAW receive. Not the post shape. */
  allocations?: PostReceiptAllocationBody[];
  creditsApplied?: PostReceiptCreditBody[];
  replace: true;
};

export type PostReceiptAllocationBody = {
  billId: string;
  billAccYear: string;
  /**
   * This bill's TOTAL settlement EXCLUDING discount, write-off and round-off —
   * money, TDS, claims and credits together. Folding a round-off in makes the
   * receipt claim to have collected more than it did, and the post is refused
   * by exactly that amount.
   */
  amount: number;
  discount?: number;
  writeoff?: number;
  roundoff?: number;
  /** A USER id (`OptionalUuid`), not a typed name. */
  writeoffApprovedBy?: string | null;
};

export type PostReceiptCreditBody = {
  billId: string;
  billAccYear: string;
  amount: number;
};

/** Pins one other-line to one bill. `lineNo` is 1-based in the SENT array. */
export type PostReceiptOtherLinePinBody = {
  lineNo: number;
  billId: string;
  billAccYear: string;
  amount: number;
};

export type PostReceiptBody = ReceiptKeys & {
  /** IN ORDER — the server's own bill order, which is the order money fills. */
  allocations: PostReceiptAllocationBody[];
  creditsApplied: PostReceiptCreditBody[];
  otherLineBills: PostReceiptOtherLinePinBody[];
  /** The one figure that proves client and server read the same receipt. */
  onAccount: number;
};

export type AmendReceiptBody = SaveDraftReceiptBody &
  Omit<PostReceiptBody, "avhVoucherId"> & {
    avhVoucherId: string;
    /** The `avhRevisionNo` that was LOADED. Never computed, never incremented. */
    baseRevision: number;
    editRemark: string;
  };

export type CancelReceiptBody = ReceiptKeys & { reason: string };

// ---------------------------------------------------------------------------
// The draft — what the screen edits
// ---------------------------------------------------------------------------

/** Company, branch and year, captured ONCE and never re-read from the session. */
export type ReceiptScope = {
  companyId: string;
  branchId: string;
  accYear: string;
};

/**
 * One bill the party owes, as the grid holds it.
 *
 * `receive` is what this receipt PLACES on the bill — cash and applied credit
 * together — and `discount` / `writeOff` / `roundOff` sit beside it because
 * they settle the bill without being money. The four together are `settled()`,
 * and their sum may not exceed `pendingAmount` (§6.4).
 */
export type BillRow = {
  billId: string;
  billAccYear: string;
  billType: BillType;
  docRefno: string;
  usrRefno: string;
  docDate: string;
  dueDate: string | null;
  daysOverdue: number;
  billAmount: number;
  pendingAmount: number;
  status: BillStatus;
  pdcHeld: number;
  ppdSuggested: number;
  tcsAmount: number;
  tcsPending: number;
  /** null ≠ 0. Rendered blank. */
  billProfit: number | null;
  receive: number;
  discount: number;
  writeOff: number;
  roundOff: number;
  /**
   * The operator typed this Receive by hand, so Auto-allocate works AROUND it
   * instead of overwriting it. Undoing a deliberate figure is the complaint
   * accountants make most about the systems they are migrating from.
   */
  receiveTyped: boolean;
  /** A USER id, required above `accounts.writeoff_approval_above` (§6.5). */
  writeoffApprovedBy: string | null;
  /** A scratch column. It GOES NOWHERE: there is no per-bill narration. */
  note: string;
};

/** One credit the party holds. In the same grid, above the bills, tinted. */
export type CreditRow = {
  billId: string;
  billAccYear: string;
  billType: BillType;
  docRefno: string;
  docDate: string;
  billAmount: number;
  pendingAmount: number;
  srcDocType: string | null;
  /** The voucher that raised it — an amend drops its OWN advance by this. */
  srcDocId: string | null;
  /** How much of it this receipt spends. "Receive" means Apply on a credit. */
  apply: number;
  applyTyped: boolean;
};

/** The optional cheque extras behind F4. Nothing in here is mandatory. */
export type ChequeExtras = {
  bankBranch: string;
  ifsc: string;
  drawerName: string;
  bankLedgerId: string | null;
};

/** One instrument — cash, card, UPI, cheque. Writes an `acc_tender_detail` row. */
export type TenderRow = {
  /** Stable across re-orders and reloads; the reducer addresses rows by it. */
  key: string;
  /** Present on a row the server already holds. */
  tdId: string | null;
  tenderId: string;
  tenderTypeId: number;
  tenderName: string;
  tenderLedgerId: string | null;
  amount: number;
  receivedAmt: number;
  changeAmt: number;
  /** What the acquirer kept. A SPLIT OF THE BANK LEG, not a deduction (§7.4). */
  mdrAmt: number;
  refNo: string;
  bankName: string;
  payerVpa: string;
  instrumentDate: string;
  cheque: ChequeExtras;
  /** Painted after a post: the PDC voucher this row's cheque got (§10.5). */
  pdcVoucherRefno: string | null;
};

/** One role line — writes one `acc_vouchers` leg carrying `av_role`. */
export type OtherLineRow = {
  key: string;
  /** A role OR a picked ledger. Never both. */
  role: ReceiptRole | null;
  ledgerId: string | null;
  ledgerName: string;
  drCr: DrCr;
  amount: number;
  /** Whether it comes off what the party owes, or is money on top. */
  settlesBill: boolean;
  narration: string;
  /**
   * Rebuilt by `domain/seeded-lines.ts` rather than typed. A seeded line may be
   * re-amounted but never deleted: the server seeds it again at post and then
   * refuses the receipt as a disagreement.
   */
  seeded: boolean;
  /** An optional pin to ONE bill. Travels in `otherLineBills[]`, not on the line. */
  againstBillId: string | null;
  againstBillAccYear: string | null;
};

/** The header fields the strip edits, plus what the loaded document carries. */
export type ReceiptHeaderDraft = {
  /** Null until the first `/create`. */
  voucherId: string | null;
  scope: ReceiptScope;
  voucherDate: string;
  partyId: string;
  partyName: string;
  /** The beat. Filters the customer dropdown; NEVER sent (see the body type). */
  areaId: string;
  /** ONE salesman, or empty. */
  employeeId: string;
  usrRefno: string;
  docRefno: string;
  docDate: string;
  remarks: string;
  status: VoucherStatus;
  voucherRefno: string | null;
  /** R20's optimistic lock, held exactly as loaded. */
  revisionNo: number;
  againstVoucherId: string | null;
  cancelReason: string | null;
};

/** What the party's own flags say. False is a CLAIM, so `loaded` guards it. */
export type PartyFacts = {
  loaded: boolean;
  ledName: string;
  groupName: string;
  isBillByBill: boolean;
  isTdsApplicable: boolean;
  tdsDeducteeType: string | null;
  isTcsApplicable: boolean;
  tcsBasis: TcsBasis;
  tanNo: string | null;
};

/** The settings this screen obeys, read once per scope. */
export type ReceiptSettings = {
  /** A write-off above this needs an approver. Default 0 = ALWAYS. */
  writeoffApprovalAbove: number;
  salesmanMandatory: boolean;
  /** R20 — default false. When off, the Amend button is HIDDEN, not greyed. */
  allowPostedAmend: boolean;
  tcsBasis: TcsBasis;
};
