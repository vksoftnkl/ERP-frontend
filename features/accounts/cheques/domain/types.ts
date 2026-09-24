/**
 * The cheque register's vocabulary — shared by Received Cheques (menu 51) and,
 * later, Issued Cheques (menu 52), which read the same table with
 * `apd_tra_type = 'P'`.
 *
 * Nothing here knows which of the two screens is asking. The words on the
 * buttons are the screen's business (`vocabulary.ts`); the statuses, the keys
 * and the row are the table's.
 */

/** `ck_apd_status`. A later migration may add one — see `stateMachine.ts`. */
export const KNOWN_STATUSES = [
  "HELD",
  "DEPOSITED",
  "BOUNCED",
  "CLEARED",
  "RETURNED",
  "CANCELLED",
  "REPLACED",
] as const;
export type KnownStatus = (typeof KNOWN_STATUSES)[number];
/** A status as it arrived. Unknown words are kept, never mapped to a default. */
export type ChequeStatus = KnownStatus | (string & {});

/**
 * The grid's `due_bucket`, computed in SQL from the instrument date and
 * TODAY — never stored. NULL once the cheque has left play.
 */
export type DueBucket = "FUTURE" | "DUE_TODAY" | "OVERDUE" | "STALE";

export type PostingMode = "ON_RECEIPT" | "ON_CLEARING";

/**
 * The scope the screen was OPENED in — company, branch, accounting year. It
 * decides which register is read. It does NOT decide which row an action
 * names: every action takes the row's own four keys (see `ChequeKeys`).
 */
export type ChequeScope = {
  companyId: string;
  branchId: string;
  accYear: string;
};

/**
 * How every route names a row: `apdId · apdAccYear · apdCompanyId ·
 * apdBranchId`, taken from the ROW, never from the session. `/get` answers a
 * correct id under the wrong branch with a 404 — scoping working, not a
 * missing row.
 */
export type ChequeKeys = {
  apdId: string;
  apdAccYear: string;
  apdCompanyId: string;
  apdBranchId: string;
};

/** One register row, parsed out of grid 109 (see `fromGridRow`). */
export type ChequeRow = {
  // ── the KEY ──
  apdId: string;
  /** The year the cheque was RECEIVED — the partition key, not the year it clears in. */
  accYear: string;
  companyId: string;
  branchId: string;
  // ── the paper ──
  instrumentNo: string;
  instrumentType: string;
  instrumentDate: string | null;
  amount: number;
  bankName: string;
  drawerName: string;
  partyName: string;
  // ── where it is ──
  status: ChequeStatus;
  bucket: DueBucket | null;
  postingMode: PostingMode;
  depositDate: string | null;
  depositSlipNo: string;
  depositBankName: string;
  presentCount: number;
  clearDate: string | null;
  bounceDate: string | null;
  bounceReason: string;
  bounceCharges: number;
  // ── what it links to ──
  receiptRefno: string;
  clearRefno: string;
  bounceRefno: string;
  replacedByNo: string;
  remarks: string;
};

// ─── What the /cheques routes answer with ────────────────────────────────────

/** A register row as `/cheques/*` returns it — money already a number here. */
export type ChequeApiRow = {
  apdId: string;
  apdAccYear: string;
  apdCompanyId: string;
  apdBranchId: string;
  apdTraType: string;
  apdPartyId: string;
  partyName: string;
  apdInstrumentType: string;
  apdInstrumentNo: string;
  apdInstrumentDate: string;
  apdAmount: number;
  apdBankName: string | null;
  apdBankBranch: string | null;
  apdIfsc: string | null;
  apdMicr: string | null;
  apdDrawerName: string | null;
  apdReceivedOn: string;
  /** The bank it was actually deposited into — deposit overwrites this. */
  apdBankLedgerId: string | null;
  bankLedgerName: string | null;
  apdPostingMode: PostingMode;
  apdStatus: ChequeStatus;
  dueBucket: DueBucket | null;
  apdPresentCount: number;
  apdDepositDate: string | null;
  apdDepositSlipNo: string | null;
  apdClearDate: string | null;
  apdBounceDate: string | null;
  apdBounceReason: string | null;
  apdBounceCharges: number;
  apdRemarks: string | null;
  apdStatusOn: string | null;
  apdStatusBy: string | null;
};

export type ChequeVoucherRef = {
  voucherId: string;
  accYear: string;
  voucherRefno: string | null;
  voucherDate: string;
  voucherStatus: string;
  totalDebit: number;
  totalCredit: number;
};

export type ChequeBillRef = {
  billId: string;
  billAccYear: string;
  billType: string;
  docRefno: string;
  docDate: string;
  dueDate: string | null;
  billAmount: number;
  pendingAmount: number;
  /**
   * The NET of this cheque's rows on the bill. After a bounce this is 0 on
   * every bill, correctly — the rows are reversed. It is "what is it paying
   * now", not "what did it once pay".
   */
  settledByThisCheque: number;
};

/** `GET /cheques/get` — one snapshot of the row and everything hanging off it. */
export type ChequeDetail = {
  cheque: ChequeApiRow;
  chequesInHandLedgerId: string | null;
  chequesInHandLedgerName: string | null;
  receiptVoucher: ChequeVoucherRef | null;
  clearVoucher: ChequeVoucherRef | null;
  bounceVoucher: ChequeVoucherRef | null;
  reissueVoucher: ChequeVoucherRef | null;
  bills: ChequeBillRef[];
  chargeBill: ChequeBillRef | null;
  replaces: ChequeApiRow | null;
  replacedBy: ChequeApiRow | null;
};

/** `GET /cheques/list` → `data.summary`. Over the WHOLE register, not the filter. */
export type ChequeSummary = {
  inHandCount: number;
  inHandAmount: number;
  withBankCount: number;
  withBankAmount: number;
  bouncedCount: number;
  bouncedAmount: number;
  clearedCount: number;
  clearedAmount: number;
};

export type ChequeHistoryEntry = {
  seqNo: number;
  event: string;
  fromStatus: string | null;
  toStatus: string;
  changedOn: string;
  changedBy: string;
  remarks: string | null;
};

export type ChequeHistory = {
  apdId: string;
  apdAccYear: string;
  apdInstrumentNo: string;
  /** Newest first. Empty for a cheque that has only been received. */
  entries: ChequeHistoryEntry[];
};

export type DepositSlipKey = {
  companyId: string;
  branchId: string;
  bankLedgerId: string;
  depositDate: string;
  slipNo: string;
};

export type DepositSlipLine = {
  lineNo: number;
  apdId: string;
  apdAccYear: string;
  instrumentType: string;
  instrumentNo: string;
  instrumentDate: string;
  drawnOnBank: string | null;
  drawnOnBranch: string | null;
  micr: string | null;
  drawerName: string | null;
  partyName: string;
  amount: number;
};

export type DepositSlip = {
  companyId: string;
  branchId: string;
  depositDate: string;
  slipNo: string;
  bankAccount: {
    ledgerId: string;
    ledgerName: string;
    accountHolder: string | null;
    bankName: string | null;
    branchName: string | null;
    accountNo: string | null;
    ifscCode: string | null;
    micrCode: string | null;
  };
  lines: DepositSlipLine[];
  chequeCount: number;
  totalAmount: number;
};

/**
 * What every action route answers with, as far as this screen reads it: the
 * envelope's `message` is shown in the status line, and a deposit's `slip`
 * is kept so F6 can print what was just banked.
 */
export type ChequeActionResult = {
  message: string;
  data: {
    slip?: {
      bankLedgerId: string;
      bankLedgerName: string;
      depositDate: string;
      slipNo: string;
      chequeCount: number;
      totalAmount: number;
    };
  } & Record<string, unknown>;
};
