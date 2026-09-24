/**
 * Opening Balances (menu 55) — the wire contract and the draft model.
 *
 * The wire types below are the server's own
 * `src/modules/accountsModule/openingBalance/types/opening-balance-api.types.ts`
 * transcribed, nothing more. Two spellings of Dr/Cr live here side by side on
 * purpose: `acc_opening_balance.op_dr_cr` is `char(1)` ('D'/'C') and
 * `acc_bill_balance.abl_dr_cr` is `char(2)` ('DR'/'CR'). They are two columns on
 * two tables with two CHECKs, and a client that "helpfully" unifies them gets a
 * 400 from whichever one it guessed wrong. `wire/side.ts` is the only place
 * either spelling is produced.
 */

// ---------------------------------------------------------------------------
// Wire — GET /opening-balances/list
// ---------------------------------------------------------------------------

export type OpeningDrCrWire = "D" | "C";
export type BillDrCrWire = "DR" | "CR";

export type OpeningSource = "CARRY_FORWARD" | "MANUAL" | "MIGRATION";

export type OpeningStaleReason =
  | "VOUCHER_POSTED"
  | "VOUCHER_CANCELLED"
  | "SOURCE_OPENING_EDITED"
  | "YEAR_REOPENED"
  | "MANUAL";

export type OpeningRowDto = {
  /** null = this ledger has no opening for the scope asked about. */
  opId: string | null;
  ledId: string;
  ledName: string;
  groupName: string | null;
  /** Always 'Assets' or 'Liabilities' here — the rest are in `unclassified`. */
  groupNature: string | null;
  ledIsBillByBill: boolean;
  opAmount: number;
  opDrCr: OpeningDrCrWire | null;
  opSource: OpeningSource | null;
  opIsStale: boolean;
  opStaleSince: string | null;
  opStaleReason: OpeningStaleReason | null;
  opRemarks: string | null;
  priorClosingAmount: number | null;
  priorClosingDrCr: OpeningDrCrWire | null;
  billCount: number;
};

export type UnclassifiedLedgerDto = {
  ledId: string;
  ledName: string;
  groupName: string | null;
};

export type TrialBalance = {
  totalDebit: number;
  totalCredit: number;
  /** debit − credit. SIGNED deliberately: it says which side is short. */
  difference: number;
  isBalanced: boolean;
  /** Ledgers under a NULL-nature group. They are not in the totals. */
  unmappedCount: number;
  /** The OPENING_DIFFERENCE role. null = unmapped, so nothing absorbs the plug. */
  differenceLedgerId: string | null;
  differenceLedgerName: string | null;
};

export type OpeningListPayload = {
  opCompanyId: string;
  opBranchId: string | null;
  opAccYear: string;
  rows: OpeningRowDto[];
  unclassified: UnclassifiedLedgerDto[];
  trialBalance: TrialBalance;
};

// ---------------------------------------------------------------------------
// Wire — POST /opening-balances/create
// ---------------------------------------------------------------------------

export type SaveOpeningBalanceRow = {
  opId?: string;
  opLedgerId: string;
  /** Always positive; the side is `opDrCr`, never a sign. */
  opAmount: number;
  opDrCr: OpeningDrCrWire;
  opSource?: OpeningSource;
  opRemarks?: string | null;
};

export type SaveOpeningBalance = {
  opCompanyId: string;
  opAccYear: string;
  /** EXPLICIT null = the company-level set. An omitted key is another request. */
  opBranchId: string | null;
  rows: SaveOpeningBalanceRow[];
  replace: true;
};

export type RetainedRow = {
  opId: string;
  ledId: string;
  ledName: string;
  billCount: number;
};

export type OpeningSavePayload = {
  opCompanyId: string;
  opBranchId: string | null;
  opAccYear: string;
  created: number;
  updated: number;
  skippedZero: number;
  deleted: number;
  retainedWithBills: RetainedRow[];
  flippedToManual: string[];
  trialBalance: TrialBalance;
  staledAccYears: string[];
};

// ---------------------------------------------------------------------------
// Wire — GET / POST /opening-balances/bills
// ---------------------------------------------------------------------------

export type OpeningBillDto = {
  ablId: string;
  ablDocRefno: string;
  ablDocDate: string;
  ablDueDate: string | null;
  ablCreditDays: number;
  ablGraceDays: number;
  ablDrCr: BillDrCrWire;
  ablBillAmount: number;
  ablAllocAmount: number;
  ablDiscAmount: number;
  ablWriteoffAmount: number;
  ablPendingAmount: number;
  ablStatus: string | null;
  ablNarration: string | null;
  /** Receipted against. Its money cells are fixed — see `BILL_FROZEN_FIELDS`. */
  isFrozen: boolean;
};

export type OpeningBillsPayload = {
  companyId: string;
  branchId: string;
  accYear: string;
  partyId: string;
  partyName: string;
  opId: string | null;
  bills: OpeningBillDto[];
  billTotalAmount: number;
  billTotalDrCr: OpeningDrCrWire | null;
  openingAmount: number;
  openingDrCr: OpeningDrCrWire | null;
  isTied: boolean;
};

export type SaveOpeningBillRow = {
  /** Present = update. ABSENT = insert — see `payload/build-bills-payload.ts`. */
  ablId?: string;
  ablDocRefno: string;
  ablDocDate: string;
  ablDueDate?: string | null;
  ablCreditDays?: number;
  ablGraceDays?: number;
  ablDrCr: BillDrCrWire;
  ablBillAmount: number;
  ablNarration?: string | null;
};

export type SaveOpeningBills = {
  companyId: string;
  /** REQUIRED: `abl_branch_id` is NOT NULL, so a bill always has a branch. */
  branchId: string;
  accYear: string;
  partyId: string;
  opId?: string;
  bills: SaveOpeningBillRow[];
  replace: true;
};

export type OpeningBillsSavePayload = OpeningBillsPayload & {
  created: number;
  updated: number;
  deleted: number;
  frozenUnchanged: number;
  staledAccYears: string[];
};

// ---------------------------------------------------------------------------
// Wire — POST /opening-balances/carry-forward
// ---------------------------------------------------------------------------

export type CarryForwardRequest = {
  companyId: string;
  fromAccYear: string;
  toAccYear: string;
  /** null = the company-level set. */
  branchId: string | null;
};

export type CarryForwardPayload = {
  runId: string;
  companyId: string;
  branchId: string | null;
  fromAccYear: string;
  toAccYear: string;
  created: number;
  updated: number;
  /** MANUAL / MIGRATION rows left alone. Always reported, even at 0. */
  skippedManual: number;
  billsCarried: number;
  totalDebit: number;
  totalCredit: number;
  difference: number;
  isBalanced: boolean;
  profitAndLossResult: number;
  retainedEarningsLedgerId: string | null;
};

// ---------------------------------------------------------------------------
// Draft — what the screen edits
// ---------------------------------------------------------------------------

/** How a side reads on screen. Empty = no opening, so no side (never "Dr"). */
export type ShownSide = "Dr" | "Cr" | "";

export type LedgerRow = {
  /** Stable across a re-sort and a reload; the reducer addresses rows by it. */
  key: string;
  /** Empty on the trailing blank row — the picker row, which is furniture. */
  ledId: string;
  ledName: string;
  /** null = no opening on the server yet. Present = `replace:true` can delete it. */
  opId: string | null;
  groupName: string;
  groupNature: string;
  isBillWise: boolean;
  amount: number;
  drCr: ShownSide;
  source: OpeningSource | null;
  isStale: boolean;
  staleSince: string | null;
  staleReason: OpeningStaleReason | null;
  remarks: string;
  /** What the row arrived with, so an emptied remark can be cleared explicitly. */
  loadedRemarks: string;
  priorClosingAmount: number | null;
  priorClosingSide: ShownSide;
  billCount: number;
};

export type BillRow = {
  key: string;
  /** null on a row this screen created. LOAD-BEARING: see the payload builder. */
  ablId: string | null;
  docRefno: string;
  docDate: string;
  dueDate: string;
  creditDays: number;
  graceDays: number;
  drCr: Exclude<ShownSide, "">;
  amount: number;
  narration: string;
  /** Server-derived; displayed, never sent. */
  allocated: number;
  pending: number;
  status: string;
  isFrozen: boolean;
};

export type Scope = {
  companyId: string;
  /** null = the COMPANY-LEVEL set (`op_branch_id IS NULL`), not "every branch". */
  branchId: string | null;
  accYear: string;
};
