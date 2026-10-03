/**
 * Bill-wise Payment (menu 100) — the wire contract and the draft model.
 *
 * "Do as like receipt": the server's `/payments` module is `/receipts`
 * mirrored route for route and DTO for DTO (`payment-api.types.ts`), so this
 * file re-uses the receipt's shapes wherever the wire does, and only says what
 * DIFFERS:
 *
 *  - the PARTY is a supplier, and carries the TDS rate facts (we are the
 *    deductor), the bank a transfer goes to, and the name a cheque is written
 *    to;
 *  - a CHEQUE is ours: it comes from a BOOK, the leaf is the server's (taken
 *    at post — a `tdRefNo` on a cheque row is a 400), and it carries
 *    favouring and account-payee;
 *  - a TRANSFER (bank or UPI) carries a beneficiary snapshot;
 *  - the roles are the payment's, and a typed write-back carries `approvedBy`;
 *  - `/get` answers `chequesIssued[]` where the receipt answers `cheques[]`,
 *    and `/post` answers `cheques[]` as the leaves it took.
 *
 * The same two rules hold as on the receipt: `partyId` is the ledger, and
 * amounts are positive with the side as a flag.
 */
import type {
  AdjacentVoucherPayload,
  BillRow,
  CreditRow,
  DrCr,
  DuplicateCheckPayload,
  OpenBillWire,
  OpenCreditWire,
  PdcStatus,
  PostReceiptAllocationBody,
  PostReceiptBody,
  PostReceiptCreditBody,
  ReceiptAdvanceBill,
  ReceiptAllocationWire,
  ReceiptCancelPayload,
  ReceiptDeletePayload,
  ReceiptHeaderDraft,
  ReceiptHeaderWire,
  ReceiptKeys,
  ReceiptLeg,
  ReceiptOtherLineWire,
  ReceiptPdcVoucher,
  ReceiptScope,
  ReceiptTenderWire,
  TenderRow,
  VoucherDeviceType,
} from "@/features/accounts/receipt/receipt.types";

export type { AdjacentVoucherPayload, BillRow, CreditRow, DrCr, DuplicateCheckPayload };

// ---------------------------------------------------------------------------
// Enumerations — `types/payment-enum.ts`
// ---------------------------------------------------------------------------

/**
 * The roles a payment line can carry. TDS_PAYABLE, BANK_CHARGES,
 * INTEREST_PAID and BALANCES_WRITTEN_BACK travel; DISCOUNT_RECEIVED, WRITE_OFF
 * and a CR ROUND_OFF are the bills grid's columns mirrored, and stay home (a
 * DR ROUND_OFF — a bill rounded UP — travels).
 */
export type PaymentRole =
  | "TDS_PAYABLE"
  | "BANK_CHARGES"
  | "INTEREST_PAID"
  | "BALANCES_WRITTEN_BACK"
  | "DISCOUNT_RECEIVED"
  | "WRITE_OFF"
  | "ROUND_OFF";

// ---------------------------------------------------------------------------
// Wire — GET /payments/open-items
// ---------------------------------------------------------------------------

/**
 * A bill we OWE. The receipt's open bill less what a supplier's bill has no
 * use for (profit, TCS, temp credit) — those keys are simply absent here.
 * `usrRefno` is the SUPPLIER's invoice number: what their statement quotes.
 */
export type PayableBillWire = Omit<
  OpenBillWire,
  "billProfit" | "billProfitPreTax" | "tcsAmount" | "tcsPending"
>;

/** A DEBIT we hold of theirs — an advance we paid, a debit note, an opening Dr. */
export type HeldDebitWire = OpenCreditWire;

/**
 * The summary. The server kept the receipt's own key names (notes 62 D1):
 * `creditsHeld` here is the DEBITS held. `debitsHeld` is read too, so the
 * screen survives the day the key is renamed.
 */
export type PaymentOpenItemsSummary = {
  totalPending: number;
  billCount: number;
  overdueCount: number;
  creditsHeld?: number;
  debitsHeld?: number;
  pdcHeld: number;
};

export type PaymentPartyBank = {
  name: string | null;
  accountNo: string | null;
  ifsc: string | null;
};

export type PaymentOpenItemsParty = {
  ledId: string;
  ledName: string;
  groupName: string | null;
  isBillByBill: boolean;
  /** A cash or bank ledger of our own — that is a Contra (menu 104), not a payment. */
  isMoneyLedger: boolean;
  isTdsApplicable: boolean;
  tdsSection: string | null;
  tdsDeducteeType: string | null;
  /** Already the NO_PAN rate when the PAN is missing. `null` = nothing in force. */
  tdsRate: number | null;
  tdsRateSource: "MASTER" | "NO_PAN" | null;
  tdsThresholdSingle: number | null;
  tdsThresholdAnnual: number | null;
  /** The year's running TDS BASE so far — not the tax. */
  tdsPaidThisYear: number;
  panPresent: boolean;
  /** The default (else the first) active bank account on the ledger. */
  bank: PaymentPartyBank | null;
  /** The bank row's cheque name, else its holder, else the ledger's name. */
  favouringName: string | null;
};

export type PaymentOpenItemsPayload = {
  bills: PayableBillWire[];
  credits: HeldDebitWire[];
  summary: PaymentOpenItemsSummary;
  party: PaymentOpenItemsParty;
};

// ---------------------------------------------------------------------------
// Wire — GET /payments/party-context
// ---------------------------------------------------------------------------

export type PartyRecentPayment = {
  voucherId: string;
  accYear: string;
  voucherRefno: string | null;
  voucherDate: string;
  docAmount: number;
  adjustAmount: number;
  instruments: string | null;
};

/** One of OUR cheques the party has not yet presented. */
export type PartyChequeOut = {
  pdcId: string;
  accYear: string;
  instrumentNo: string;
  instrumentDate: string;
  amount: number;
  bankName: string | null;
  bookNo: string | null;
  status: PdcStatus;
  voucherId: string | null;
  voucherRefno: string | null;
};

/** `totalCredits` is the debits we hold (notes 62 D1); `totalDebits` read too. */
export type PaymentContextSummary = {
  /** What we owe the party, net of what they hold of ours. */
  totalBalance: number;
  totalOutstanding: number;
  totalCredits?: number;
  totalDebits?: number;
  chequesOutstanding: number;
};

export type PaymentPartyContextPayload = {
  partyId: string;
  partyName: string;
  summary: PaymentContextSummary;
  lastPayments: PartyRecentPayment[];
  ourChequesOut: PartyChequeOut[];
};

// ---------------------------------------------------------------------------
// Wire — GET /vouchers/cheque-books
// ---------------------------------------------------------------------------

/** One open cheque book: active, not deleted, with a leaf left. */
export type ChequeBook = {
  chequeBookId: string;
  bankLedgerId: string;
  /** The bank LEDGER's name. */
  bankName: string;
  bookNo: string;
  leafFrom: string;
  leafTo: string;
  /** Shown, not promised: two payments posting on one book take leaves in POST order. */
  nextLeaf: string;
  left: number;
  format: string | null;
};

export type ChequeBooksPayload = {
  companyId: string;
  books: ChequeBook[];
};

// ---------------------------------------------------------------------------
// Wire — the payment itself
// ---------------------------------------------------------------------------

export type PaymentChequeWire = {
  chequeBookId: string | null;
  bookNo: string | null;
  favouring: string | null;
  acPayee: boolean | null;
  bankBranch?: string | null;
  ifsc?: string | null;
  micr?: string | null;
  drawerName?: string | null;
};

export type PaymentBeneficiaryWire = {
  name: string | null;
  accountNo: string | null;
  ifsc: string | null;
};

/**
 * A tender row as `/get` returns it. On a posted cheque row `tdRefNo` is the
 * LEAF and `tdBankName` the book's bank; on a draft `cheque{}` is what the
 * draft remembered.
 */
export type PaymentTenderWire = ReceiptTenderWire & {
  beneficiary: PaymentBeneficiaryWire | null;
  cheque: PaymentChequeWire | null;
};

export type PaymentOtherLineWire = ReceiptOtherLineWire & {
  approvedBy: string | null;
};

/** One of our cheques, from the register — `/get`'s `chequesIssued[]`. */
export type PaymentIssuedChequeWire = {
  pdcId: string;
  accYear: string;
  tenderRowNo: number | null;
  instrumentType: string;
  /** The leaf. */
  instrumentNo: string;
  instrumentDate: string;
  amount: number;
  bankName: string | null;
  bankLedgerId: string | null;
  chequeBookId: string | null;
  bookNo: string | null;
  favouring: string | null;
  acPayee: boolean | null;
  printed: boolean | null;
  printCount: number | null;
  status: PdcStatus;
  voucherId: string | null;
};

/** What `POST /payments/create` answers with. `expectedRoles` is always []. */
export type PaymentDraftPayload = {
  header: ReceiptHeaderWire;
  tenders: PaymentTenderWire[];
  otherLines: PaymentOtherLineWire[];
  expectedRoles: string[];
};

/** What `GET /payments/get` answers with. */
export type PaymentPayload = {
  header: ReceiptHeaderWire;
  tenders: PaymentTenderWire[];
  /** The server's canonical lines on a DRAFT, seeded ones included. EMPTY once posted. */
  otherLines: PaymentOtherLineWire[];
  legs: ReceiptLeg[];
  /** HISTORY on a posted payment; the remembered memo on a draft. */
  allocations: ReceiptAllocationWire[];
  creditsApplied: ReceiptAllocationWire[];
  chequesIssued: PaymentIssuedChequeWire[];
  pdcVouchers: ReceiptPdcVoucher[];
  advanceBills: ReceiptAdvanceBill[];
};

/** One leaf the post took from a book. */
export type PaymentLeafTaken = {
  tdRowNo: number;
  apdId: string;
  apdAccYear: string;
  leaf: string;
  bookNo: string | null;
};

export type PaymentPostPayload = PaymentPayload & {
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
  /** The leaves taken — NOT the register rows `/receipts` calls `cheques`. */
  cheques: PaymentLeafTaken[];
};

export type PaymentAmendPayload = PaymentPostPayload & {
  fromRevision: number;
  toRevision: number;
  editRemark: string;
};

export type PaymentCancelPayload = ReceiptCancelPayload & { tdsReversed?: number };
export type PaymentDeletePayload = ReceiptDeletePayload;

// ---------------------------------------------------------------------------
// Wire — request bodies
// ---------------------------------------------------------------------------

/** The same four keys as a receipt. */
export type PaymentKeys = ReceiptKeys;

/** `SavePaymentChequeDto` — the book is required; the leaf is the server's. */
export type SavePaymentChequeBody = {
  chequeBookId: string;
  favouring?: string | null;
  acPayee?: boolean;
};

/** `PaymentBeneficiaryDto` — a snapshot, never written back to the ledger. */
export type SavePaymentBeneficiaryBody = {
  name?: string | null;
  accountNo?: string | null;
  ifsc?: string | null;
};

/**
 * `SavePaymentTenderDto`. **Nothing may be added**: `forbidNonWhitelisted`
 * refuses `tdSurchargePerc`, `tdSurchargeAmt`, `tdAuthCode`, `tdCardLast4` and
 * `cheque.bankLedgerId`, all of which the receipt's DTO accepts.
 */
export type SavePaymentTenderBody = {
  tdId?: string;
  tdRowNo: number;
  tdTenderId: string;
  tdTenderTypeId: number;
  /** Ignored on a cheque row, where the ledger is the book's bank. */
  tdTenderLedgerId?: string;
  /** GROSS of the bank charge — what leaves our bank. */
  tdAmount: number;
  /** The bank's charge, INSIDE `tdAmount`. */
  tdMdrAmt?: number;
  /** The UTR on a transfer. Never on a cheque row — that is a 400. */
  tdRefNo?: string | null;
  tdBankName?: string | null;
  tdPayerVpa?: string | null;
  /** Earlier than the payment's date is a 400; later makes a post-dated cheque. */
  tdInstrumentDate?: string | null;
  cheque?: SavePaymentChequeBody;
  beneficiary?: SavePaymentBeneficiaryBody;
};

/** `SavePaymentOtherLineDto` — `role` OR `ledgerId`, never both. */
export type SavePaymentOtherLineBody = {
  role?: string;
  ledgerId?: string;
  drCr: DrCr;
  amount: number;
  settlesBill?: boolean;
  narration?: string | null;
  /** A USER id; required on BALANCES_WRITTEN_BACK above the approval threshold. */
  approvedBy?: string | null;
};

/** `POST /payments/create`. The receipt's header keys, nothing added. */
export type SaveDraftPaymentBody = {
  avhVoucherId?: string;
  avhCompanyId: string;
  avhBranchId: string;
  avhAccYear: string;
  avhVoucherDate: string;
  avhPartyId: string;
  /** ONE element: who paid it. */
  avhEmployeeId?: string[];
  avhUsrRefno?: string | null;
  avhDocRefno?: string | null;
  avhDocDate?: string | null;
  avhRemarks?: string | null;
  avhDeviceType?: VoucherDeviceType;
  avhUserId?: string;
  tenders: SavePaymentTenderBody[];
  otherLines?: SavePaymentOtherLineBody[];
  allocations?: PostReceiptAllocationBody[];
  creditsApplied?: PostReceiptCreditBody[];
  replace: true;
};

/** `POST /payments/post` — field for field the receipt's. */
export type PostPaymentBody = PostReceiptBody;

export type AmendPaymentBody = SaveDraftPaymentBody &
  Omit<PostPaymentBody, "avhVoucherId"> & {
    avhVoucherId: string;
    baseRevision: number;
    editRemark: string;
  };

export type CancelPaymentBody = PaymentKeys & { reason: string };

// ---------------------------------------------------------------------------
// The draft — what the screen edits
// ---------------------------------------------------------------------------

export type PaymentScope = ReceiptScope;

/** The header strip: the receipt's, with no beat (a payee has none). */
export type PaymentHeaderDraft = ReceiptHeaderDraft;

/** F4 on a cheque row — OUR cheque: the book, and what goes ON the cheque. */
export type PaymentChequeExtras = {
  chequeBookId: string | null;
  favouring: string;
  /** Crossed account-payee unless somebody said otherwise. */
  acPayee: boolean;
};

/** F4 on a bank or UPI row — where the money goes. */
export type BeneficiaryDraft = {
  name: string;
  accountNo: string;
  ifsc: string;
};

/**
 * One instrument. The receipt's row with the receipt's cheque extras swapped
 * for ours and a beneficiary added. `mdrAmt` is the transfer's CHARGE here,
 * inside the amount; `receivedAmt`/`changeAmt` stay 0 — nothing is handed back
 * on a payment.
 */
export type PaymentTenderRow = Omit<TenderRow, "cheque"> & {
  cheque: PaymentChequeExtras;
  beneficiary: BeneficiaryDraft;
  /** Painted from a loaded payment: the leaf the post took, and its book. */
  leaf: string | null;
  bookNo: string | null;
};

/** One role line. */
export type PaymentLineRow = {
  key: string;
  role: PaymentRole | null;
  ledgerId: string | null;
  ledgerName: string;
  drCr: DrCr;
  amount: number;
  settlesBill: boolean;
  narration: string;
  /**
   * Rebuilt by `domain/seeded-lines.ts` from the grids: TDS from the
   * instruments, the bank charge from the Charge column, the mirrors from the
   * bill columns, a round-up from a negative R/off. Never typed, never removed.
   */
  seeded: boolean;
  againstBillId: string | null;
  againstBillAccYear: string | null;
  approvedBy: string | null;
};

/** What the payee's own flags say. False is a CLAIM, so `loaded` guards it. */
export type PaymentPartyFacts = {
  loaded: boolean;
  ledName: string;
  groupName: string;
  isBillByBill: boolean;
  isMoneyLedger: boolean;
  isTdsApplicable: boolean;
  tdsSection: string;
  tdsDeducteeType: string | null;
  /** `null` = no rate in force for the section. */
  tdsRate: number | null;
  tdsRateSource: "MASTER" | "NO_PAN" | null;
  tdsThresholdSingle: number;
  tdsThresholdAnnual: number;
  tdsPaidThisYear: number;
  panPresent: boolean;
  bankName: string;
  bankAccountNo: string;
  bankIfsc: string;
  favouringName: string;
};

/** The settings this screen obeys, read once per scope. */
export type PaymentSettings = {
  /** A write-back above this needs an approver. Default 0 = ALWAYS. */
  writeoffApprovalAbove: number;
  /** `accounts.payment_salesman_mandatory` — who paid it. */
  salesmanMandatory: boolean;
  allowPostedAmend: boolean;
};
