/**
 * Account Day Summary — the wire shapes (plan §4.3, backend plan §5).
 *
 * Mirrors the SERVER's types file (`ERP server/src/modules/reports/
 * day-summary/types/day-summary.types.ts`, read 2026-10-12 while a peer
 * session was writing the module), which differs from the backend plan's
 * examples: balances are null under a voucher-type filter, `zNo` is a number,
 * `short` / `companyName` may be null, rows carry `branchId`, natureFilter is
 * a `vchr_nature`. No live response was read yet: when the routes are up,
 * read one per route and correct this file and `parse.ts`.
 *
 * Amounts are strings with two decimals and stay strings. A balance is the
 * magnitude and its side. Counts are whole numbers.
 *
 * Codes the server owns (tile codes, check codes, voucher natures) are typed
 * as `string`, not as unions: the server adds codes, and the client must show
 * an unknown one rather than drop it.
 */
import type { Bal, Side } from "@/features/reports/shared/wire/types";

export type { Bal, Side };

export const MONEY_KINDS = ["CASH", "BANK", "CLEARING"] as const;
export type MoneyKind = (typeof MONEY_KINDS)[number];

export const ROW_KINDS = ["NORMAL", "CANCELLED", "REVERSAL"] as const;
export type RowKind = (typeof ROW_KINDS)[number];

export const CHECK_LEVELS = ["FAIL", "WARN", "INFO", "OK"] as const;
export type CheckLevel = (typeof CHECK_LEVELS)[number];

export const GROUP_LEVELS = ["REPORT", "PRIMARY", "LEDGER_GROUP"] as const;
export type GroupLevel = (typeof GROUP_LEVELS)[number];

export const BUSINESS_DAY_STATUSES = ["OPEN", "CLOSING", "CLOSED", "NONE", "MIXED"] as const;
export type BusinessDayStatus = (typeof BUSINESS_DAY_STATUSES)[number];

/** What `natureFilter` accepts (the DTO's `@IsIn`): a `vchr_nature`, never a tile code. */
export const VOUCHER_NATURES = [
  "SALES",
  "PURCHASE",
  "RECEIPT",
  "PAYMENT",
  "JOURNAL",
  "CONTRA",
  "DEBIT_NOTE",
  "CREDIT_NOTE",
  "STOCK_JOURNAL",
] as const;
export type VoucherNature = (typeof VOUCHER_NATURES)[number];

/* ------------------------------------------------------------ /voucher-types */

export type VoucherTypeOption = {
  voucherTypeId: number;
  code: string;
  short: string;
  name: string;
  nature: string;
  category: string | null;
  sortOrder: number | null;
};

/* ------------------------------------------------------------------ /summary */

export type Scope = {
  companyId: string | null;
  companyName: string;
  /** null = All branches. */
  branchId: string | null;
  branchName: string;
  accYear: string | null;
  fromDate: string;
  toDate: string;
  days: number;
  asOf: string | null;
};

/** Only for one day (null for a range); MIXED when the branches differ. */
export type BusinessDay = {
  status: BusinessDayStatus;
  zNo: string | null;
  sessions: { total: number; closed: number } | null;
};

export type Tile = {
  code: string;
  amount: string | null;
  vouchers: number | null;
  drafts: number | null;
  cancelledPairs: number | null;
  opening: Bal | null;
  net: Bal | null;
  closing: Bal | null;
};

export type TypeRow = {
  voucherTypeId: number;
  code: string | null;
  /** The server's `short` may be null; the code (or name) stands in. */
  short: string;
  name: string;
  nature: string;
  category: string | null;
  vouchers: number;
  drafts: number;
  cancelledPairs: number;
  /** A cancel whose other half is outside the range: counted, and flagged. */
  loneHalves: number;
  amount: string;
  cashIn: string;
  cashOut: string;
  bankIn: string;
  bankOut: string;
};

export type TypeTotals = {
  vouchers: number;
  drafts: number;
  cancelledPairs: number;
  /** Not in the backend example; shown when sent. */
  loneHalves: number | null;
  amount: string;
  cashIn: string;
  cashOut: string;
  bankIn: string;
  bankOut: string;
};

export type MoneyRow = {
  ledgerId: string;
  ledgerName: string;
  kind: MoneyKind;
  /** null under a voucher-type filter: a balance has no voucher type. */
  opening: Bal | null;
  in: string;
  out: string;
  closing: Bal | null;
  /** `COMPANY_LEVEL_ONLY`, or a code the client does not know yet (shown as is). */
  openingNote: string | null;
};

/** Opening / closing null under a voucher-type filter. */
export type MoneyTotal = { opening: Bal | null; in: string; out: string; closing: Bal | null };

export type GroupRow = {
  groupId: string;
  groupName: string;
  nature: string | null;
  debit: string;
  credit: string;
  net: Bal;
  hasChildren: boolean;
};

export type GroupTotals = {
  debit: string;
  credit: string;
  /** Not in the backend example; printed when sent, else the BALANCED check decides. */
  net: Bal | null;
};

export type Check = { code: string; level: CheckLevel; facts: Record<string, unknown> };

export type SummaryPayload = {
  scope: Scope;
  businessDay: BusinessDay | null;
  tiles: Tile[];
  types: TypeRow[];
  typeTotals: TypeTotals;
  moneyLedgers: MoneyRow[];
  /** `ALL` is always there; a kind with no ledger may be absent. */
  moneyTotals: Partial<Record<MoneyKind, MoneyTotal>> & { ALL: MoneyTotal };
  groups: GroupRow[];
  groupTotals: GroupTotals;
  checks: Check[];
};

/* ----------------------------------------------------------------- /vouchers */

export type Src = { module: string; docType: string; docId: string };

export type Leg = {
  ledgerId: string | null;
  ledgerName: string | null;
  side: Side;
  amount: string;
  role: string | null;
};

export type VoucherRow = {
  voucherId: string;
  accYear: string | null;
  date: string;
  voucherTypeId: number | null;
  short: string | null;
  name: string | null;
  nature: string | null;
  voucherNo: string | null;
  /** The server sends it on posted rows (not in the backend plan); a draft row has none. */
  branchId: string | null;
  branchName: string | null;
  party: string | null;
  particulars: string | null;
  asPerDetails: boolean;
  legCount: number | null;
  narration: string | null;
  /** Σ DR legs; on a draft, the document's own amount. */
  amount: string;
  status: string | null;
  rowKind: RowKind;
  pairInRange: boolean;
  createdBy: string | null;
  src: Src | null;
  /** Only when the page was asked `withLegs=true`. */
  legs: Leg[] | null;
  /** A row of the `draftsOnly` view: no legs, no number, not in any figure. */
  draft: boolean;
};

export type PageInfo = { page: number; pageSize: number; totalRows: number };

export type VoucherPage = {
  page: PageInfo;
  /** For the WHOLE filtered set, not this page. */
  totals: { amount: string; cancelledPairs: number | null };
  rows: VoucherRow[];
};

/* -------------------------------------------------------------------- /daily */

export type DailyRow = {
  date: string;
  vouchers: number;
  drafts: number;
  cancelledPairs: number;
  amount: string;
  cashIn: string;
  cashOut: string;
  /** null under a voucher-type filter. */
  cashClosing: Bal | null;
  bankIn: string;
  bankOut: string;
  bankClosing: Bal | null;
  businessDay: BusinessDayStatus | null;
};

export type DailyTotals = {
  vouchers: number;
  drafts: number;
  cancelledPairs: number;
  amount: string;
  cashIn: string;
  cashOut: string;
  bankIn: string;
  bankOut: string;
};

/**
 * The range's opening (null under a type filter), then one row per day.
 * `totals` is in neither plan nor server: a Total row is drawn only when sent.
 */
export type DailyPayload = {
  cashOpening: Bal | null;
  bankOpening: Bal | null;
  rows: DailyRow[];
  totals: DailyTotals | null;
};

/* ------------------------------------------------------------- /group-ledgers */

export type GroupLedgerRow = {
  ledgerId: string;
  ledgerName: string;
  groupName: string | null;
  debit: string;
  credit: string;
  net: Bal;
};

export type GroupLedgersPayload = {
  rows: GroupLedgerRow[];
  /** The react plan's "total row from the response"; null when the server sends a bare list. */
  totals: { debit: string; credit: string; net: Bal | null } | null;
};

/* ------------------------------------------------------------- /checks/detail */

/** The rows behind one check. Their shape is per check and not yet specified, so they stay generic. */
export type CheckDetailPayload = {
  code: string;
  rows: Array<Record<string, unknown>>;
  totalRows: number | null;
  truncated: boolean;
};

/* ------------------------------------------------------------------- /export */

export type ExportPayload = {
  summary: SummaryPayload;
  vouchers: VoucherRow[];
  /** The server's `/export` sends `totalRows`, not an amount total; the sheet then has no Total row. */
  totals: { amount: string } | null;
  totalRows: number | null;
};
