/**
 * The `/tender-settlement/*` payloads as this screen holds them — the server's
 * `types/tender-settlement-api.types.ts`, with every amount in integer paise
 * (see `money.ts`) and every enum kept as the string the server sent, so a
 * value added there shows as itself instead of breaking a parse.
 */

export const LINE_KINDS = ["SALE", "REFUND", "CHARGEBACK", "FEE", "ADJUSTMENT"] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export const SETTLEMENT_SOURCES = ["CARD", "UPI", "WALLET", "BANK"] as const;
export type SettlementSource = (typeof SETTLEMENT_SOURCES)[number];

export const MATCH_STATUSES = ["UNMATCHED", "SUGGESTED", "MATCHED", "IGNORED", "RESOLVED"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export type ImportStatus = "IMPORTED" | "MATCHED" | "POSTED" | "VOIDED";
export type Resolution = "LINKED" | "REFUNDED" | "INCOME" | "SUSPENSE";
export type WriteOffTreatment = "RECOVER" | "SUSPENSE" | "LOSS";

/** The tender row a line points at, as a person checks it. */
export type TenderRowInfo = {
  tdId: string;
  tdAccYear: string;
  srcDocType: string;
  srcDocId: string;
  docRefno: string;
  docDate: string;
  /** paise */
  amount: number;
  refNo: string;
  authCode: string;
  cardLast4: string;
  settleStatus: string;
  sessionId: string;
  createdOn: string;
};

export type SettlementLine = {
  aslId: string;
  rowNo: number;
  kind: string;
  txnOn: string;
  terminalId: string;
  vpa: string;
  tenderId: string;
  refNo: string;
  authCode: string;
  cardLast4: string;
  payer: string;
  gross: number;
  fee: number;
  tax: number;
  net: number;
  matchStatus: string;
  matchRule: string;
  /** gross − the row's amount, signed, paise */
  amountDiff: number;
  tenderRow: TenderRowInfo | null;
  resolution: string;
  reasonId: string;
  resolutionVoucherId: string;
  notes: string;
};

/** One payout — an import — with its lines (GET get). */
export type Payout = {
  asiId: string;
  accYear: string;
  companyId: string;
  branchId: string;
  source: string;
  provider: string;
  tenderId: string;
  fileName: string;
  payoutRef: string;
  payoutDate: string;
  periodFrom: string;
  periodTo: string;
  lineCount: number;
  totalGross: number;
  totalFee: number;
  totalTax: number;
  totalNet: number;
  status: string;
  bankLedgerId: string;
  bankLedgerName: string;
  voucherId: string;
  voucherRefno: string;
  importedOn: string;
  postedOn: string;
  voidReason: string;
  notes: string;
  /** Customer lines (SALE, REFUND, CHARGEBACK) by match status. */
  counts: Record<MatchStatus, number>;
  lines: SettlementLine[];
};

/** One leg of a TSet / resolve / write-off voucher, as written. */
export type Leg = {
  drCr: "DR" | "CR";
  ledgerId: string;
  ledgerName: string;
  role: string;
  /** paise */
  amount: number;
};

/** `POST post` answers the payout plus the legs it wrote. */
export type PostedPayout = { payout: Payout; legs: Leg[] };

/** The column map — `settlement-format.ts` `StatementFormat`. */
export type StatementFormat = {
  version: 1;
  source: string;
  provider: string;
  columns: Record<string, string>;
  kindMap?: Record<string, string[]>;
  dateFormat?: string;
  negativeIsRefund?: boolean;
};

/** GET / POST format. */
export type FormatPayload = {
  tenderId: string;
  tenderName: string;
  terminalId: string;
  upiVpa: string;
  settlementLedgerId: string;
  settlementDays: number;
  format: StatementFormat | null;
};

export type TestLine = {
  lineNo: number;
  kind: string;
  txnOn: string;
  terminalId: string;
  refNo: string;
  authCode: string;
  cardLast4: string;
  gross: number;
  fee: number;
  tax: number;
  net: number;
  payoutRef: string;
  payoutDate: string;
};

/** POST format/test — what the saved map reads out of a file; nothing written. */
export type FormatTestResult = {
  /** 200 at most */
  lines: TestLine[];
  problems: { lineNo: number; message: string }[];
  payouts: { payoutRef: string; payoutDate: string; lines: number; net: number }[];
};

export type ResolveResult = {
  line: SettlementLine | null;
  voucherId: string;
  voucherRefno: string;
  legs: Leg[];
};

export type WriteOffResult = {
  tdId: string;
  tdAccYear: string;
  treatment: string;
  /** paise */
  amount: number;
  voucherId: string;
  voucherRefno: string;
  voucherAccYear: string;
  sessionId: string;
};

/** A configured-grid row, as the runner answers it. */
export type GridRow = Record<string, unknown>;

/** The rights this screen reads off menu 278. */
export type SettlementRights = {
  canCreate: boolean;
  canEdit: boolean;
  canPost: boolean;
  canCancel: boolean;
  /** Not in the client's permission index yet — absent reads as allowed; the server judges (403). */
  canOverride: boolean;
};
