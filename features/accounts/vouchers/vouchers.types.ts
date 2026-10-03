/**
 * The Voucher Register (`/vouchers`) — the wire contract, as far as Contra
 * (menu 104, `Con`), the Receipt Voucher (260, `RcpV`) and the Payment
 * Voucher (261, `PmtV`) use it.
 *
 * One server module serves nine voucher types (Journal, Contra, the notes,
 * the accounting Sales / Purchase, the Receipt / Payment vouchers); a type's
 * behaviour is DATA — `/vouchers/types` hands each one its rules. Contra's
 * rules are the plainest of them: no party, no bill-wise, no GST, no TDS, no
 * instruments. A one-party type (the accounting Sales / Purchase, the notes)
 * names its party on the header — the server generates the party's leg, the
 * GST legs (tax on top of each taxed line's amount) and the TDS leg, and
 * raises a bill for the party leg. The Receipt / Payment vouchers put MANY
 * parties on the lines,
 * settle their bills on demand (`allocations[]`, keyed by the line's rowNo),
 * carry an instrument per party line (cash, UPI, a cheque — the money leg is
 * GENERATED from it) and, on a payment, deduct TDS (the party leg is grossed
 * up; the operator keys the net).
 *
 * Two things a port gets wrong if it copies the Bill-wise screens:
 *
 *  - a voucher is addressed by BARE keys — `companyId · branchId · accYear ·
 *    voucherId` — not the receipt's `avh`-prefixed ones;
 *  - a line's `amount` travels as a decimal STRING (`"25000.00"`).
 *
 * The DTOs are whitelisted (`forbidNonWhitelisted`), so a key this file does
 * not declare is a 400.
 */

export type DrCr = "DR" | "CR";
export type VoucherStatus = "DRAFT" | "POSTED" | "CANCELLED";
export type PartyMode = "NONE" | "ONE" | "MANY";
export type BillwiseMode = "OFF" | "DEMAND" | "RAISE" | "OPTIONAL";

// ─── /vouchers/types ─────────────────────────────────────────────────────────

/** The caller's rights on the TYPE's menu (Contra: 104). */
export type VoucherRights = {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  post: boolean;
  cancel: boolean;
  print: boolean;
  override: boolean;
};

export type VoucherGroupRef = { groupId: string; name: string };

/** One type's rules (`acc_voucher_types.vchr_*`). */
export type VoucherTypeRules = {
  typeId: number;
  typeCode: string;
  typeName: string;
  nature: string;
  /** `con` → `con00001` at Post. */
  numberPrefix: string | null;
  menuId: number | null;
  partyMode: PartyMode;
  partySide: "DR" | "CR" | "ANY";
  billwiseMode: BillwiseMode;
  raiseBillType: string | null;
  /** Empty = any group. A sub-group of a listed group counts. */
  drGroups: VoucherGroupRef[];
  crGroups: VoucherGroupRef[];
  gstRegister: string | null;
  gstSide: "INPUT" | "OUTPUT" | null;
  tdsMode: "OFF" | "DEDUCT";
  inRegister: boolean;
  affectsInventory: boolean;
  instruments: boolean;
};

export type VoucherTypeWithRights = VoucherTypeRules & { rights: VoucherRights };

export type VoucherTypesPayload = {
  menuId: number | null;
  types: VoucherTypeWithRights[];
};

// ─── The payload (/create, /validate, /post) ─────────────────────────────────

/** The four keys every voucher route takes — BARE. */
export type VoucherKeys = {
  companyId: string;
  branchId: string;
  accYear: string;
  voucherId: string;
};

export type VoucherHeaderBody = {
  /** Absent on the first save; present = that draft. */
  voucherId?: string;
  companyId: string;
  branchId: string;
  accYear: string;
  typeCode: string;
  /** yyyy-mm-dd — the year it falls in must be `accYear`. */
  date: string;
  docRefno?: string;
  docDate?: string;
  remarks?: string;
  /** A one-party type only — required there, refused elsewhere. */
  partyId?: string;
  /** Place of supply, two digits — sent only when the operator chose one; the server defaults it. */
  posStcd?: string;
  /** The INPUT side (a purchase) only: the tax is ours to pay. */
  reverseCharge?: boolean;
  /**
   * Collected by (a receipt) / Paid by (a payment) — on a type with
   * instruments only. Stored on the voucher and, first one, as each cheque's
   * salesman. `/get` does not hand it back; a draft's stored payload does.
   */
  employeeIds?: string[];
};

/** The cheque a customer gave us — a received cheque only. */
export type InstrumentChequeBody = {
  drawerName?: string;
  bankBranch?: string;
  /** `^[A-Z]{4}0[A-Z0-9]{6}$` or the whole body is a 400. */
  ifsc?: string;
  micr?: string;
};

/**
 * The instrument on a party line (`VoucherInstrumentDto`). What a tender reads
 * differs by side — see `instrumentBody`: a received cheque names its number,
 * date and drawee bank; OUR cheque names the bank ledger and the book, and its
 * number is the book's next leaf, taken at Post.
 */
export type InstrumentBody = {
  tenderId: string;
  refNo?: string;
  instrumentDate?: string;
  /** The drawee bank of a received cheque. Never sent beside `bankLedgerId`. */
  bankName?: string;
  cheque?: InstrumentChequeBody;
  /** A payment: the bank account the money leaves. */
  bankLedgerId?: string;
  chequeBookId?: string;
  favouring?: string;
  acPayee?: boolean;
};

/** A taxed line, on a GST-band type: the line's amount is the TAXABLE value; tax goes on top. */
export type VoucherLineGstBody = {
  /** `inventory.tax_rate_master.tax_id` — `/vouchers/tax-rates`. */
  taxId: string;
  hsn?: string;
  /** INPUT side only: INPUTS · INPUT_SERVICES · CAPITAL_GOODS · INELIGIBLE. */
  itcEligibility?: string;
};

export type VoucherLineBody = {
  /** 1-based, unique. A refusal names its line by this. */
  rowNo: number;
  drCr: DrCr;
  ledgerId: string;
  /** A decimal STRING, two places: `"25000.00"`. */
  amount: string;
  remarks?: string;
  /** A payment's TDS base, said by hand; absent = the ledger's own flag. */
  tdsBase?: boolean;
  instrument?: InstrumentBody;
  /** On a GST-band type, on the lines opposite the party only. */
  gst?: VoucherLineGstBody;
};

/** One bill a party line settles — keyed by the TYPED line's rowNo. */
export type VoucherAllocationBody = {
  lineRowNo: number;
  billId: string;
  /** The BILL's own year, not the voucher's. */
  billAccYear: string;
  amount: string;
};

export type VoucherPayloadBody = {
  header: VoucherHeaderBody;
  lines: VoucherLineBody[];
  /**
   * Bill-wise types only. `/create` stores the body wholesale, so a draft's
   * allocations are always sent again — what is not sent is lost.
   */
  allocations?: VoucherAllocationBody[];
  /** A type that raises a bill: its due days (else the party's credit days). */
  newBill?: { dueDays: number };
  /** `/validate` and `/post` only — never `/create`. */
  overrides?: string[];
};

// ─── /vouchers/validate ──────────────────────────────────────────────────────

export type VoucherRefusal = {
  code: string;
  message: string;
  field?: string;
  /** The typed line's `rowNo`, when the refusal is about one. */
  line?: number;
};

export type VoucherWarning = VoucherRefusal & {
  level: "INFO" | "WARN";
  overridable: boolean;
};

/** The instrument as the derivation read it — on the typed line, and on the leg generated from it. */
export type DerivedInstrument = {
  tenderId: string;
  tenderName: string;
  tenderTypeId: number;
  tenderTypeName: string;
  ledgerId: string;
  ledgerName: string;
  refNo: string | null;
  instrumentDate: string | null;
  bankName: string | null;
  isCheque: boolean;
  /** Dated after the voucher: its legs post on `postsOn`, on a voucher of their own. */
  isPostDated: boolean;
  postsOn: string | null;
  cheque: { drawerName: string | null; bankBranch: string | null; ifsc: string | null; micr: string | null } | null;
  settlementMode: string;
  /** A payment's: money out of `bankLedgerId`. */
  issued: boolean;
  bankLedgerId: string | null;
  chequeBookId: string | null;
  bookNo: string | null;
  /** The leaf the cheque would take — shown, not promised. */
  nextLeaf: string | null;
  favouring: string | null;
  acPayee: boolean | null;
};

export type DerivedLeg = {
  rowNo: number;
  /** The typed line it came from; null on a generated leg. */
  lineRowNo: number | null;
  drCr: DrCr;
  ledgerId: string;
  ledgerName: string;
  groupName: string | null;
  /** On a payment's TDS line: the GROSS, not what was keyed. */
  amount: number;
  generated: boolean;
  /** TYPED · INSTRUMENT · TDS · PARTY · GST · RCM */
  source: string;
  role: string | null;
  remarks: string | null;
  /** The typed lines a generated leg was worked out from. */
  fromRows?: number[];
  /** A taxed typed line: what was SENT (a defaulted ITC is not echoed). */
  gst?: { taxId: string; hsn: string | null; itcEligibility: string | null; isTdsBase: boolean } | null;
  isTdsBase?: boolean;
  /** Posts on `postsOn`, on the post-dated cheque's own voucher. */
  postDated?: boolean;
  postsOn?: string | null;
  instrument?: DerivedInstrument | null;
};

export type DerivedPostDated = {
  lineRowNo: number;
  partyId: string;
  partyName: string;
  /** The gross, on a TDS line. */
  amount: number;
  postsOn: string;
  accYear: string;
  tenderName: string;
  refNo: string | null;
};

/** The one-party type's generated party leg. */
export type DerivedParty = { ledgerId: string; name: string; side: DrCr; amount: number; rowNo: number };

export type GstSummaryRow = {
  taxId: string;
  taxName: string;
  ratePerc: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  /** The typed lines (payload rowNo) at this rate. */
  lines: number[];
};

export type GstSummary = {
  register: string;
  side: "INPUT" | "OUTPUT";
  docType: string;
  supplyNature: "INTRA_STATE" | "INTER_STATE";
  placeOfSupply: string;
  reverseCharge: boolean;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total: number;
  rows: GstSummaryRow[];
};

/** A one-party type's deduction. */
export type TdsSummary = {
  section: string;
  deducteeType: string | null;
  rate: number;
  rateSource: string | null;
  base: number;
  tax: number;
  deducted: boolean;
  reason: string | null;
  fromRows: number[];
};

export type TdsLineSummary = {
  section: string;
  deducteeType: string | null;
  rate: number;
  rateSource: string | null;
  base: number;
  tax: number;
  deducted: boolean;
  reason: string | null;
  fromRows: number[];
  /** The party's first line; null on a one-party type (the party is the header's). */
  lineRowNo: number | null;
  partyId: string;
  partyName: string;
};

/** The unallocated rest of a party line, kept as an ADVANCE bill on the party. */
export type DerivedBill = {
  lineRowNo: number;
  partyId: string;
  partyName: string;
  billType: string;
  side: DrCr;
  amount: number;
  docRefno: string | null;
  dueDays: number;
  dueDate: string | null;
  isAdvance: boolean;
};

export type DerivedAllocation = {
  lineRowNo: number;
  billId: string;
  billAccYear: string;
  billRefno: string;
  billType: string;
  amount: number;
  pendingBefore: number;
  adjType: string;
};

export type DerivedVoucher = {
  typeCode: string;
  date: string;
  legs: DerivedLeg[];
  /** TODAY's voucher only — a post-dated line posts later, on its own. */
  totals: { debit: number; credit: number; difference: number };
  party?: DerivedParty | null;
  gst?: GstSummary | null;
  tds?: TdsSummary | null;
  tdsLines?: TdsLineSummary[];
  bills?: DerivedBill[];
  allocations?: DerivedAllocation[];
  postDated?: DerivedPostDated[];
};

/** Always a 200 — `ok` and the two lists say how it went. */
export type ValidatePayload = {
  ok: boolean;
  derived: DerivedVoucher;
  refusals: VoucherRefusal[];
  warnings: VoucherWarning[];
};

// ─── The stored voucher (/get, /post) ────────────────────────────────────────

export type VoucherHeaderPayload = {
  voucherId: string;
  companyId: string;
  branchId: string;
  accYear: string;
  typeId: number;
  typeCode: string;
  typeName: string;
  voucherNo: number | null;
  voucherRefno: string | null;
  date: string;
  partyId: string | null;
  partyName: string | null;
  docRefno: string | null;
  docDate: string | null;
  usrRefno: string | null;
  remarks: string | null;
  docAmount: number;
  totalDebit: number;
  totalCredit: number;
  status: VoucherStatus;
  statusOn: string | null;
  postedOn: string | null;
  cancelReason: string | null;
  /** On the original: the Rev voucher that reversed it. */
  reversalVoucherId: string | null;
  reversalAccYear: string | null;
  reversalRefno: string | null;
  /** On a Rev voucher: the original. */
  againstVoucherId: string | null;
  againstAccYear: string | null;
  againstRefno: string | null;
  createdBy: string | null;
  createdOn: string | null;
  modifiedBy: string | null;
  modifiedOn: string | null;
};

/** An instrument the voucher took, with its cheque's state. Gone once the voucher is cancelled. */
export type VoucherInstrumentPayload = {
  tdId: string;
  tdAccYear: string;
  /** The TYPED line it rode on — the original line's, on a post-dated cheque too. */
  lineRowNo: number;
  partyId: string;
  partyName: string | null;
  tenderId: string;
  tenderName: string | null;
  tenderTypeId: number;
  tenderTypeName: string | null;
  ledgerId: string;
  /** The net, on a payment with TDS. */
  amount: number;
  refNo: string | null;
  instrumentDate: string | null;
  bankName: string | null;
  isCheque: boolean;
  isPostDated: boolean;
  /** The voucher carrying its legs: today's, or the post-dated cheque's own. */
  voucherId: string | null;
  voucherRefno: string | null;
  voucherDate: string | null;
  cheque: { drawerName: string | null; bankBranch: string | null; ifsc: string | null; micr: string | null } | null;
  pdcId: string | null;
  pdcAccYear: string | null;
  /** HELD · DEPOSITED · CLEARED · BOUNCED · … */
  pdcStatus: string | null;
  pdcBankLedgerId: string | null;
  issued: boolean;
  bankLedgerId: string | null;
  /** The leaf the cheque took. */
  leaf: string | null;
  chequeBookId: string | null;
  bookNo: string | null;
  favouring: string | null;
  acPayee: boolean | null;
};

export type VoucherLegPayload = {
  avId: string;
  rowNo: number;
  drCr: DrCr;
  ledgerId: string;
  ledgerName: string;
  groupName: string | null;
  amount: number;
  role: string | null;
  generated: boolean;
  remarks: string | null;
  oppLedgerId?: string | null;
  /** Matched by position — trust `instruments[].lineRowNo` over it. */
  instrument?: VoucherInstrumentPayload | null;
};

/** A post-dated cheque's own voucher, under today's. */
export type VoucherPdcVoucherPayload = {
  voucherId: string;
  accYear: string;
  voucherRefno: string | null;
  date: string;
  status: VoucherStatus;
  partyId: string | null;
  partyName: string | null;
  reversalRefno: string | null;
  legs: VoucherLegPayload[];
  allocations: VoucherAllocationPayload[];
};

export type VoucherAllocationPayload = {
  abjId: string;
  rowNo: number;
  billId: string;
  billAccYear: string;
  billRefno: string | null;
  billType: string | null;
  againstBillId: string | null;
  againstBillAccYear: string | null;
  adjType: string;
  drCr: DrCr;
  amount: number;
  adjDate: string;
  /** A counter-row (a cancel, a bounce) — not what the voucher settled. */
  isReversal: boolean;
  reversalOfId: string | null;
};

/** A bill this voucher raised — on a receipt / payment, an ADVANCE. */
export type VoucherBillPayload = {
  ablId: string;
  ablAccYear: string;
  billType: string;
  docRefno: string;
  docDate: string;
  dueDate: string | null;
  side: DrCr;
  billAmount: number;
  allocAmount: number;
  pendingAmount: number;
  status: string | null;
  isDeleted: boolean;
};

/** The GST document a posted voucher wrote (null without a GST band). */
export type VoucherGstDocPayload = {
  gdrId: string;
  docType: string;
  docStatus: string;
  docNo: string;
  docDate: string;
  supplyNature: string | null;
  placeOfSupply: string | null;
  isReverseCharge: boolean;
  isEinvoiceApplicable: boolean;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  billValue: number;
  lines: Array<{
    /** The typed leg's position. */
    rowNo: number;
    taxId: string | null;
    hsn: string | null;
    isService: boolean;
    taxable: number;
    ratePerc: number;
    cgst: number;
    sgst: number;
    igst: number;
    cess: number;
    itcEligibility: string | null;
  }>;
};

export type VoucherTdsPayload = {
  atdId: string;
  section: string;
  deducteeType: string | null;
  rate: number;
  rateSource: string;
  base: number;
  tax: number;
  challanNo: string | null;
  isReversal: boolean;
};

export type VoucherLocks = {
  editable: boolean;
  dayClosed: boolean;
  periodLocked: boolean;
  allocatedElsewhere: boolean;
  chequeMoved: boolean;
};

/** The typed payload a DRAFT was saved with, verbatim — lines carry ids, not names. */
export type StoredDraft = {
  header?: Partial<Omit<VoucherHeaderBody, "posStcd">> & { posStcd?: string | null };
  lines?: Array<
    Omit<Partial<VoucherLineBody>, "amount" | "tdsBase" | "instrument" | "gst"> & {
      amount?: string | number;
      tdsBase?: boolean | null;
      instrument?: (Partial<InstrumentBody> & { cheque?: InstrumentChequeBody | null }) | null;
      gst?: { taxId?: string; hsn?: string | null; itcEligibility?: string | null } | null;
    }
  >;
  newBill?: { dueDays?: number | null } | null;
  allocations?: Array<Partial<Omit<VoucherAllocationBody, "amount">> & { amount?: string | number }>;
};

export type VoucherPayload = {
  header: VoucherHeaderPayload;
  rules: VoucherTypeRules;
  rights: VoucherRights;
  locks: VoucherLocks;
  legs: VoucherLegPayload[];
  allocations?: VoucherAllocationPayload[];
  bills?: VoucherBillPayload[];
  tds?: VoucherTdsPayload[];
  gstDoc?: VoucherGstDocPayload | null;
  instruments?: VoucherInstrumentPayload[];
  pdcVouchers?: VoucherPdcVoucherPayload[];
  /** Present on a DRAFT only. */
  draft: StoredDraft | null;
};

export type DraftSavedPayload = {
  voucherId: string;
  companyId: string;
  branchId: string;
  accYear: string;
  typeCode: string;
  status: "DRAFT";
  created: boolean;
};

export type CancelVoucherPayload = {
  voucherId: string;
  accYear: string;
  voucherRefno: string | null;
  reversalVoucherId: string;
  reversalRefno: string | null;
  cancelledOn: string;
  billsClosed?: number;
  allocationsReversed?: number;
  tdsReversed?: number;
  chequesCancelled?: number;
  pdcVouchersReversed?: number;
};

export type DeleteVoucherPayload = { voucherId: string; accYear: string; deleted: true };

export type AdjacentVoucher = {
  voucherId: string;
  companyId: string;
  branchId: string;
  accYear: string;
  typeCode: string;
  voucherRefno: string | null;
  date: string;
  status: VoucherStatus;
};

export type AdjacentVoucherPayload = {
  direction: "prev" | "next";
  fromVoucherId: string | null;
  /** null at either end of the register — an answer, not a failure. */
  voucher: AdjacentVoucher | null;
};

// ─── Lookups for a receipt / payment ─────────────────────────────────────────

/** A tender master an instrument may name (`/vouchers/instruments`). */
export type InstrumentTenderRow = {
  tenderId: string;
  name: string;
  shortName: string | null;
  typeId: number;
  /** CASH · CARD · UPI · WALLET · CHEQUE · BANK · VOUCHER */
  typeName: string;
  ledgerId: string;
  ledgerName: string;
  settlementLedgerId: string | null;
  isCash: boolean;
  isCheque: boolean;
  /** A reference is required (UPI, card…) — a cheque always needs its number anyway. */
  needsRef: boolean;
  hotkey: string | null;
  displayPosition: number | null;
};

export type InstrumentsPayload = { companyId: string; tenders: InstrumentTenderRow[] };

/** A bill still open on a party (`/vouchers/open-bills`) — every year. */
export type OpenBillRow = {
  ablId: string;
  ablAccYear: string;
  refno: string | null;
  docRefno: string | null;
  date: string;
  dueDate: string | null;
  billType: string;
  side: DrCr;
  billAmount: number;
  pending: number;
};

export type OpenBillsPayload = { partyId: string; side: DrCr; bills: OpenBillRow[] };

/** An open cheque book (`/vouchers/cheque-books`). */
export type VoucherChequeBook = {
  chequeBookId: string;
  bankLedgerId: string;
  /** The bank LEDGER's name. */
  bankName: string;
  bookNo: string;
  leafFrom: string;
  leafTo: string;
  /** Shown, not promised: the leaf is taken at Post, under a lock. */
  nextLeaf: string;
  left: number;
  format: string | null;
};

export type VoucherChequeBooksPayload = { companyId: string; books: VoucherChequeBook[] };

/** `/vouchers/party-facts` — a one-party type's party, as on the voucher date. */
export type PartyFactsPayload = {
  partyId: string;
  name: string;
  gstin: string | null;
  gstType: string | null;
  stateCode: string | null;
  stateName: string | null;
  /** The customer's / supplier's credit days — a raised bill's default due days. */
  creditDays: number;
  isBillByBill: boolean;
  pan: string | null;
  tds: {
    applicable: boolean;
    section: string | null;
    deducteeType: string | null;
    rate: number | null;
    rateSource: "MASTER" | "NO_PAN" | null;
    thresholdSingle: number | null;
    thresholdAnnual: number | null;
  } | null;
  /** Σ pending DR − Σ pending CR, every year. */
  outstanding: { amount: number; side: DrCr };
};

/** `/vouchers/tax-rates` — the GST cell's choices. */
export type TaxRateRow = {
  taxId: string;
  name: string;
  ratePerc: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  isReverseCharge: boolean;
  taxability: string;
};

export type TaxRatesPayload = { rates: TaxRateRow[] };

export type LedgerBalancePayload = {
  ledgerId: string;
  asOn: string;
  amount: number;
  side: DrCr;
};
