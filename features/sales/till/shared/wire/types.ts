/**
 * Wire shapes of `/till/sessions/*`, `/till/movements/*` and
 * `/till/denominations/list` — mirrored from the server's
 * `src/modules/till/types/till-api.types.ts` (read-only there; keep in step).
 *
 * The till routes send money as NUMBERS (two places, converted at the edge
 * from Prisma.Decimal). The configured grids (144–148, 134) send numerics as
 * STRINGS ("500.00"). Both go through `money.ts#toPaise` before any arithmetic.
 */

export type TillSessionStatus = "OPEN" | "SUSPENDED" | "COUNTING" | "PENDING_APPROVAL" | "CLOSED" | "VOIDED";

export type TillDayStatus = "OPEN" | "CLOSING" | "CLOSED";

export type TenderCloseMode = "DENOM" | "SLIPS" | "STATEMENT" | "NONE";

export type TillCountOutcome = "ACCEPTED" | "RECOUNT_REQUIRED" | "SENT_FOR_APPROVAL";

export type TillMovementKind = "DROP" | "PAID_IN" | "EXCHANGE" | "PICKUP" | "TOP_UP";

/** The house key on every session verb: company · branch · year · id. */
export type TillSessionKey = {
  companyId: string;
  branchId: string;
  accYear: string;
  tssId: string;
};

// ─── open-check ──────────────────────────────────────────────────────────────

export type TillCarriedFrom = {
  sessionId: string;
  accYear: string;
  sessionNo: string;
  floatLeft: number;
};

export type TillOpenCheckSession = {
  sessionId: string;
  accYear: string;
  sessionNo: string;
  counterId: string;
  counterCode: string;
  operatorId: string;
  operatorName: string;
  deviceId: string;
  deviceName: string | null;
  openedOn: string;
  status: TillSessionStatus;
};

export type TillOpenCheckCounter = {
  counterId: string;
  code: string;
  name: string;
  defaultFloat: number;
  carriedFrom: TillCarriedFrom | null;
};

export type TillOpenCheckLinked = TillOpenCheckCounter & {
  liveSessionId: string | null;
  inactive: boolean;
};

export type TillOpenCheckBusy = {
  counterId: string;
  code: string;
  name: string;
  session: TillOpenCheckSession;
};

export type TillOpenCheck = {
  requireSession: boolean;
  businessDay: {
    dayId: string | null;
    accYear: string;
    date: string;
    status: TillDayStatus | null;
    autoOpen: boolean;
  };
  linkedCounter: TillOpenCheckLinked | null;
  freeCounters: TillOpenCheckCounter[];
  busyCounters: TillOpenCheckBusy[];
  deviceSession: TillOpenCheckSession | null;
  userSessionElsewhere: TillOpenCheckSession | null;
  carriedFrom: TillCarriedFrom | null;
};

// ─── session ─────────────────────────────────────────────────────────────────

export type TillSessionTender = {
  tenderTypeId: number;
  tenderTypeName: string;
  tenderId: string | null;
  tenderName: string | null;
  closeMode: TenderCloseMode;
  openAmount: number | null;
  salesAmount: number | null;
  refundAmount: number | null;
  receiptAmount: number | null;
  paymentAmount: number | null;
  expenseAmount: number | null;
  movedIn: number | null;
  movedOut: number | null;
  paidFromBank: number | null;
  txnCount: number | null;
  noRefCount: number;
  expected: number | null;
  counted: number | null;
  variance: number | null;
};

export type TillVariance = {
  tvrId: string;
  tvrAccYear: string;
  /** RECEIVE (notes 113 / 114): a supervisor approved other than was handed over. */
  tvrStage: "OPEN" | "CLOSE" | "RECEIVE";
  /** Stage RECEIVE: the hand-over / drop received — decide-variance's `tcmId`. */
  tvrMovementId?: string | null;
  tvrTenderTypeId: number;
  tvrTenderId: string | null;
  tvrExpected: number;
  tvrCounted: number;
  tvrVariance: number;
  tvrTolerance: number;
  tvrTreatment: string;
  tvrReasonId: string | null;
  tvrStatus: string;
  tvrVoucherId: string | null;
  /** Notes 105: the till_approval row that decided it, who decided, and RECOVER's staff ledger. */
  tvrApprovalId?: string | null;
  tvrDecidedBy?: string | null;
  tvrRecoveryLedgerId?: string | null;
};

export type TillCashLimit = {
  state: "NORMAL" | "ALERT" | "BLOCKED";
  gauge: number | null;
  alertLimit: number;
  blockLimit: number;
};

export type TillSessionPayload = {
  tssId: string;
  tssAccYear: string;
  tssCompanyId: string;
  tssBranchId: string;
  tssDayId: string;
  tssBusinessDate: string;
  tssCounterId: string;
  counterCode: string;
  counterName: string;
  /**
   * Notes 110 §3 — the counter's own safe when it is a drop safe, else null: a
   * DROP is refused (TILL_NO_DROP_SAFE) and the screen disables its tile. A
   * server from before notes 110 leaves the key out (a drop works as it did).
   */
  dropSafeName?: string | null;
  tssDeviceId: string;
  tssOperatorId: string;
  operatorName: string | null;
  tssSessionNo: string;
  tssDaySeq: number;
  tssStatus: TillSessionStatus;
  tssOpenedOn: string;
  tssFloatMode: string;
  tssPrevSessionId: string | null;
  tssFloatIssued: number;
  tssFloatCounted: number;
  tssFloatVariance: number;
  tssSuspendCount: number;
  tssSuspendedOn: string | null;
  tssBillingEndedOn: string | null;
  tssCountMode: "BLIND" | "OPEN" | null;
  tssCountPlace: "COUNTER" | "CASH_OFFICE" | null;
  tssCountAttempts: number;
  tssCountedOn: string | null;
  tssClosedOn: string | null;
  tssClosedBy: string | null;
  tssZNo: number | null;
  /** Notes 117 — closed by a supervisor in the cashier's place, and why (a FORCE_CLOSE reason). */
  tssForceClosed?: boolean;
  tssForceReasonId?: string | null;
  /** Notes 117 — times reopened; the Z number stays the first close's. */
  tssReopenCount?: number;
  tssPrintCount?: number;
  tssVarianceStatus: string;
  totals: {
    billCount: number;
    returnCount: number;
    receiptCount: number;
    paymentCount: number;
    expenseCount: number;
    netSales: number | null;
    cashExpected: number | null;
    cashCounted: number | null;
    cashVariance: number | null;
    noncashExpected: number | null;
    noncashCounted: number | null;
    noncashVariance: number | null;
    handedOver: number;
    floatLeft: number;
  };
  expectedVisible: boolean;
  cashLimit: TillCashLimit | null;
  tenders: TillSessionTender[];
  /** The vouchers this session posted itself (float, hand-over, variance) and its drawer movements. */
  movements: TillSessionMovement[];
  variances: TillVariance[];
  /**
   * Notes 113 / 114 — the cash receipt over the session's hand-over and drops:
   * NONE when none waited (setting NONE, nothing handed over, closed before
   * notes 113) · AWAITING while any is unreceived (the TO APPROVE pill) ·
   * DIFFERENCE when all are received and the total differs from what was
   * handed over · else APPROVED. Absent from a server before notes 113.
   */
  receiptState?: TillCashReceiptState;
  /** Handed over (hand-over + drops) and not yet received; 0 when nothing waits. */
  cashAwaiting?: number;
  /** The supervisor of the latest receipt; null until one. */
  receivedBy?: string | null;
  receivedByName?: string | null;
  receivedOn?: string | null;
};

export type TillCashReceiptState = "NONE" | "AWAITING" | "APPROVED" | "DIFFERENCE";

/** One of `TillSessionPayload.movements` (server `TillMovementPayload`). */
export type TillSessionMovement = {
  tcmId: string;
  tcmAccYear: string;
  tcmKind: string;
  tcmDocNo: string;
  tcmDocDate?: string;
  tcmAmount: number;
  tcmSafeId?: string | null;
  tcmVoucherId?: string | null;
  tcmStatus: "POSTED" | "VOIDED" | string;
  tcmCreatedOn?: string;
  /** Notes 113: null = straight into the safe · AWAITING a supervisor's receive · RECEIVED. */
  tcmReceiptStatus?: "AWAITING" | "RECEIVED" | null;
  /** What the receiver counted, once RECEIVED (≠ tcmAmount = a RECEIVE-stage variance). */
  tcmReceivedAmount?: number | null;
  tcmReceivedOn?: string | null;
};

/** GET /till/movements/supervisors — one person who can sign a pickup / top-up on the session (notes 110 §2). */
export type TillSupervisor = {
  userId: string;
  loginName: string;
  /** usr_full_name, else usr_display_name; null when both are blank. */
  fullName: string | null;
  /** False: a till PIN must be set in User Administration (menu 58) before they can sign. */
  hasPin: boolean;
};

// ─── decide-variance (notes 105 A1) ─────────────────────────────────────────

export type TillVarianceDecision = "APPROVE" | "RECOUNT";

/** The treatments an approver may choose; WITHIN_TOLERANCE and RETENDERED are the system's. */
export type TillApprovableTreatment = "EXPENSE" | "RECOVER" | "SUSPENSE";

/** The decision as recorded, and the session after it. */
export type TillVarianceDecisionResult = {
  /** Notes 113: the bag whose receive difference was decided; null for a close variance. */
  tcmId?: string | null;
  /** The till_approval row (A3). */
  tapId: string;
  decision: TillVarianceDecision;
  /** CASH_VARIANCE | NONCASH_VARIANCE */
  event: string;
  /** Σ|counted − expected| over the PENDING variances. */
  amount: number;
  /** The rule's level. */
  requiredRole: string;
  /** The level the approver's grant conferred — HO_FINANCE for a SUPER ADMIN. */
  approverRole: string;
  channel: "COUNTER" | "REMOTE";
  /** APPROVE: the treatment the variances took; null on RECOUNT. */
  treatment: TillApprovableTreatment | null;
  session: TillSessionPayload;
};

export type TillCountResult = {
  tssId: string;
  tssAccYear: string;
  tctId: string;
  attemptNo: number;
  attemptsLeft: number;
  outcome: TillCountOutcome;
  slipCheckRequired: boolean;
  tssStatus: TillSessionStatus;
  variances: TillVariance[] | null;
};

/** One line of a count (open, close, movement): a denomination, or an amount. */
export type TillCountLine = {
  tenderTypeId: number;
  tenderId?: string | null;
  denominationId?: string | null;
  qty?: number;
  enteredAmount?: number;
  batchRef?: string | null;
};

export type TillMovementDetail = {
  tcmId: string;
  tcmAccYear: string;
  tcmKind: string;
  tcmDocNo: string;
  tcmAmount: number;
  tcmStatus: string;
};

// ─── slip check ──────────────────────────────────────────────────────────────

export type TillSlipCheckRow = {
  tdId: string;
  tdAccYear: string;
  time: string;
  srcDocType: string;
  srcDocId: string;
  docRefno: string | null;
  drCr: "DR" | "CR";
  amount: number;
  authCode: string | null;
  cardLast4: string | null;
  refNo: string | null;
};

export type TillSlipCheckPayload = {
  tssId: string;
  tssSessionNo: string;
  tenderId: string;
  tenderName: string | null;
  expected: number | null;
  batchTotal: number | null;
  batchRef: string | null;
  slipCount: number | null;
  difference: number | null;
  rows: TillSlipCheckRow[];
};

export type TillSlipCheckResult = {
  tssId: string;
  tenderId: string;
  ticked: number;
  noSlip: number;
  slipsWithoutRow: number;
  amountDiffers: number;
};

// ─── denominations ───────────────────────────────────────────────────────────

export type TillDenominationRow = {
  tdnId: string;
  tdnCompanyId?: string | null;
  tdnCurrency?: string;
  tdnValue: number | string;
  tdnKind: string;
  tdnLabel: string;
  tdnSortOrder?: number;
  tdnIsActive?: boolean;
};

/** A configured-grid row: snake_case SQL aliases, numerics as strings. */
export type GridRow = Record<string, unknown>;

// ─── approve cash (notes 114) ────────────────────────────────────────────────

/** POST /till/sessions/approve-cash — the closed session's hand-over and drops into the safe. */
export type TillCashApprovalResult = {
  tssId: string;
  tssAccYear: string;
  sessionNo: string;
  /** Σ of the hand-over and drops that were awaiting receipt. */
  handedOver: number;
  received: number;
  /** received − handed over. */
  difference: number;
  /**
   * APPROVED: no gap · WITHIN_TOLERANCE: posted at once to Cash Short & Excess ·
   * DECIDED: beyond tolerance, decided in the same step by the caller's grant ·
   * SENT_FOR_APPROVAL: a PENDING RECEIVE-stage variance for decide-variance with `tcmId`.
   */
  outcome: "APPROVED" | "WITHIN_TOLERANCE" | "DECIDED" | "SENT_FOR_APPROVAL";
  tvrId: string | null;
  tcmId: string | null;
  treatment: string | null;
  tapId: string | null;
  varianceVoucherId: string | null;
  varianceVoucherNo: string | null;
  receivedOn: string;
  session: TillSessionPayload;
};

// ─── session exceptions (notes 117) ──────────────────────────────────────────

/** POST /till/sessions/force-close. */
export type TillForceCloseResult = {
  /** CLOSED within tolerance · SENT_FOR_APPROVAL beyond it (PENDING_APPROVAL for Approve). */
  outcome: "CLOSED" | "SENT_FOR_APPROVAL";
  tapId: string;
  tctId: string;
  session: TillSessionPayload;
};

/** POST /till/sessions/reopen. */
export type TillSessionReopenResult = {
  tapId: string;
  /** The Rev vouchers mirroring the close's hand-over and its posted variances. */
  reversalVoucherIds: string[];
  session: TillSessionPayload;
};

/** POST /till/sessions/x-report — the sessions/expected payload, numbered and journalled. */
export type TillXReport = TillSessionPayload & {
  /** 1, 2, … — the session's X reads, this one included. */
  xNo: number;
  xReadOn: string;
};

// ─── the safe (notes 118, Cash Office 287 — Qt NexERP ec9d92d) ───────────────
// Mirrors `TillSafe*Payload` / `TillRemit*Payload` in the server's
// src/modules/till/types/till-api.types.ts. Money is a JSON number here.

export type TillVarianceStage = "OPEN" | "CLOSE" | "RECEIVE" | "SAFE" | "REMIT";
/** A safe gap is booked to Cash Short & Excess or held in suspense — never recovered. */
export type TillSafeGapTreatment = "EXPENSE" | "SUSPENSE";
export type TillSafeGapOutcome = "EXACT" | "WITHIN_TOLERANCE" | "DECIDED" | "SENT_FOR_APPROVAL";
/** BANK_DEPOSIT = staff paid it in (Dr Bank); CIT = an agency took it (Dr Cash in transit, then remit-confirm). */
export type TillRemitMode = "BANK_DEPOSIT" | "CIT";
export type TillRemitStatus = "DEPOSITED" | "IN_TRANSIT" | "CONFIRMED";

/** One remittance, as the balance lists the CIT ones still in transit. */
export type TillRemittance = {
  tcmId: string;
  tcmAccYear: string;
  docNo: string;
  /** The business date it left the safe. */
  docDate: string;
  safeId: string;
  safeName: string | null;
  mode: TillRemitMode;
  status: TillRemitStatus;
  amount: number;
  bankLedgerId: string;
  bankName: string | null;
  bagNo: string | null;
  sealNo: string | null;
  citAgency: string | null;
  slipNo: string | null;
  slipDate: string | null;
  /** Whole days since it left (IST). */
  ageDays: number;
  doneBy: string;
  createdOn: string;
};

/** A safe gap (stage SAFE / REMIT) still PENDING — decided on `/till/safes/decide-variance`. */
export type TillSafePendingGap = { tvrId: string; tvrAccYear: string; stage: TillVarianceStage; variance: number };

/**
 * One safe's figures. Money is null when the caller may not see it
 * (`figuresVisible` false: till.blind_close and no 287 / 273 OVERRIDE) — the count is blind.
 */
export type TillSafeState = {
  safeId: string;
  code: string;
  name: string;
  ledgerId: string;
  ledgerName: string | null;
  isDefault: boolean;
  isDropSafe: boolean;
  isActive: boolean;
  insuredLimit: number;
  /** Expected over a non-zero insured limit (shown even when the figures are not). */
  overInsured: boolean;
  /** Another active safe posts to the same ledger: bookBalance / drift are the ledger's. */
  ledgerShared: boolean;
  /** COUNT = the last safe count; BOOK = no count yet, the ledger's balance; ZERO = no count, shared ledger. */
  openingFrom: "COUNT" | "BOOK" | "ZERO";
  opening: number | null;
  in: {
    handOvers: number;
    drops: number;
    pickups: number;
    transfersIn: number;
    receipts: number;
    total: number;
  } | null;
  out: {
    floatIssues: number;
    topUps: number;
    remittances: number;
    transfersOut: number;
    payments: number;
    total: number;
  } | null;
  /** Notes for notes with a drawer: net zero, counted only. */
  exchanges: number;
  expected: number | null;
  bookBalance: number | null;
  /** bookBalance − expected. */
  drift: number | null;
  lastCount: {
    tctId: string;
    tctAccYear: string;
    countedOn: string;
    countedBy: string;
    countedByName: string | null;
    witnessBy: string | null;
    counted: number | null;
    expected: number | null;
    difference: number | null;
  } | null;
  /** Counted on today's business day. */
  countedToday: boolean;
  inTransit: { count: number; amount: number };
  pendingGaps: TillSafePendingGap[];
};

/** GET /till/safes/balance?companyId&branchId[&safeId]. */
export type TillSafeBalance = {
  companyId: string;
  branchId: string;
  businessDate: string;
  figuresVisible: boolean;
  safes: TillSafeState[];
  /** CIT remittances not yet confirmed by the bank, oldest first. */
  inTransit: TillRemittance[];
};

/** POST /till/safes/count — the blind count, then what it was judged against. */
export type TillSafeCountResult = {
  tctId: string;
  tctAccYear: string;
  safeId: string;
  safeName: string;
  tbdId: string;
  businessDate: string;
  countedOn: string;
  counted: number;
  /** Shown only now, after the blind count. */
  expected: number;
  difference: number;
  outcome: TillSafeGapOutcome;
  tvrId: string | null;
  treatment: string | null;
  tapId: string | null;
  varianceVoucherId: string | null;
  varianceVoucherNo: string | null;
  witnessBy: string | null;
  safe: TillSafeState;
};

/** POST /till/safes/decide-variance. */
export type TillSafeDecisionResult = {
  tvrId: string;
  tvrAccYear: string;
  stage: TillVarianceStage;
  safeId: string;
  safeName: string | null;
  expected: number;
  counted: number;
  variance: number;
  treatment: TillSafeGapTreatment;
  tapId: string;
  secondBy: string | null;
  varianceVoucherId: string | null;
  varianceVoucherNo: string | null;
  decidedOn: string;
};

/** A movement as /remit, /remit-confirm, /change and /void answer it (the fields the screens read). */
export type TillMovementFull = TillMovementDetail & {
  safeName?: string | null;
  sessionNo?: string | null;
  tcmRemitMode?: TillRemitMode | null;
  tcmRemitStatus?: TillRemitStatus | null;
  tcmBankDate?: string | null;
  tcmBankRef?: string | null;
};

/** POST /till/movements/remit. */
export type TillRemitResult = {
  movement: TillMovementFull;
  tapId: string | null;
  countId: string | null;
  safe: TillSafeState;
};

/** POST /till/movements/remit-confirm. */
export type TillRemitConfirmResult = {
  tcmId: string;
  tcmAccYear: string;
  docNo: string;
  sent: number;
  credited: number;
  difference: number;
  outcome: TillSafeGapOutcome;
  confirmVoucherId: string | null;
  confirmVoucherNo: string | null;
  tvrId: string | null;
  treatment: string | null;
  tapId: string | null;
  varianceVoucherId: string | null;
  varianceVoucherNo: string | null;
  movement: TillMovementFull;
};

/** POST /till/movements/change — a PICKUP on the giving session and a TOP_UP on the taking one. */
export type TillChangeResult = { from: TillMovementFull; to: TillMovementFull };
