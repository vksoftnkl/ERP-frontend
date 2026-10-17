/**
 * Account Day Summary — the wire shapes (plan §4.3, backend plan §5), and
 * at the end the Day Book by tender's (server notes 126 §4).
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

/* ------------------------------------------- /reports/tender-day-book (§4) */

/*
 * The Day Book by tender (server notes 126 §4), its own module on the server
 * (`ERP server/src/modules/reports/tender-day-book/tender-day-book.types.ts`,
 * read 2026-10-17, and one live response of each route). Every leg on a CASH
 * or BANK ledger, labelled with the tender it moved by; a leg no tender row
 * labels is a "money line with no tender", a transaction to look into.
 *
 * Unlike `/reports/day-summary/*`, these routes send opening and closing as
 * SIGNED strings (Dr +, Cr −). The parser turns them into a `Bal` on the
 * string's sign, so the screen prints them the way every other balance here is
 * printed.
 */

/** `groupBy`: each tender master on its own ("CARD – HDFC machine 1"), or all of a tender type together. */
export const TENDER_GROUP_BYS = ["TENDER", "TYPE"] as const;
export type TenderGroupBy = (typeof TENDER_GROUP_BYS)[number];

/** One tender (or tender type) on one cash / bank ledger. tenderId and tenderTypeId both null = NO tender. */
export type TenderGroup = {
  key: string;
  /** Always null under groupBy TYPE. */
  tenderId: string | null;
  tenderName: string | null;
  tenderTypeId: number | null;
  tenderTypeName: string | null;
  ledgerId: string;
  ledgerName: string;
  /** `CASH` or `BANK` (the ledger's `led_ledger_type`); shown, never branched on. */
  ledgerType: string;
  /** The year's labelled lines before fromDate. The opening SET has no tender, so it is in no group. */
  opening: Bal;
  debit: string;
  credit: string;
  closing: Bal;
};

/** Per cash / bank ledger: Σ its groups + `openingSet` = the ledger's books. */
export type TenderLedger = {
  ledgerId: string;
  ledgerName: string;
  ledgerType: string;
  /** The year's opening set (acc_opening_balance): not a transaction, so in no tender group. */
  openingSet: Bal;
  opening: Bal;
  debit: string;
  credit: string;
  closing: Bal;
  /** Σ of this ledger's no-tender lines in the range. */
  noTender: string;
};

/**
 * GET /reports/tender-day-book. Asked `withRows=false`, so its `rows` are not
 * read (the server sends them anyway today: see `tenderDayBookQuery`).
 */
export type TenderDayBookPayload = {
  branchId: string | null;
  fromDate: string;
  toDate: string;
  groupBy: TenderGroupBy;
  groups: TenderGroup[];
  ledgers: TenderLedger[];
};

/**
 * One money line of the range (the server's `TenderBookRow`). Only what the
 * No tender list shows or drills on is read: its rows all have no tender, and
 * a field nobody looks at must not be able to fail the list that finds them.
 */
export type TenderLine = {
  voucherDate: string;
  voucherId: string;
  accYear: string | null;
  voucherNo: string | null;
  voucherTypeId: number | null;
  voucherTypeCode: string | null;
  branchId: string | null;
  partyName: string | null;
  ledgerId: string;
  ledgerName: string;
  /** A reversal mirror (a cancel's Rev): labelled by the voucher it undoes. */
  isMirror: boolean;
  /** One of the two is "0.00": a line is one side of one leg. */
  debit: string;
  credit: string;
};

/** GET /reports/tender-day-book/no-tender. `count` should be 0: each line is a transaction to look into. */
export type NoTenderPayload = {
  branchId: string | null;
  fromDate: string;
  toDate: string;
  /** Every such line in the range, not just the rows sent. */
  count: number;
  amount: string;
  byVoucherType: Array<{ voucherTypeCode: string | null; count: number; amount: string }>;
  /** The first `limit` of them. */
  rows: TenderLine[];
  rowsTruncated: boolean;
};
