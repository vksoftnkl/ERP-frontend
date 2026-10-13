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
  tvrStage: "OPEN" | "CLOSE";
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
  movements: unknown[];
  variances: TillVariance[];
};

// ─── decide-variance (notes 105 A1) ─────────────────────────────────────────

export type TillVarianceDecision = "APPROVE" | "RECOUNT";

/** The treatments an approver may choose; WITHIN_TOLERANCE and RETENDERED are the system's. */
export type TillApprovableTreatment = "EXPENSE" | "RECOVER" | "SUSPENSE";

/** The decision as recorded, and the session after it. */
export type TillVarianceDecisionResult = {
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
