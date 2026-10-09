/**
 * Party-wise Outstanding — the response shapes of `/reports/party-outstanding/*`.
 *
 * Mirrors the SERVER's `party-outstanding.types.ts` (read 2026-10-09, the day
 * the module was written), not the plan's sketch. Where the two differ, the
 * server wins:
 *
 * - Every payload carries `ReportHead`: `asOn`, `side`, `isFuture`, `accYear`
 *   (the year `asOn` falls in) and `bucketLabels`.
 * - `creditDays` is nullable (a ledger with no customer / supplier row).
 * - `/bills` totals carry `bills`; `/bills` names its `partyId`.
 * - `lastSettlement` carries `voucherId` + `voucherAccYear` for the drill.
 * - The due calendar lists only days with something due.
 *
 * Fields marked FORWARD are not sent yet. They are what the drill-down needs
 * to open a keyed screen (the bill's branch, the voucher's type), and are
 * parsed as optional so the drill lights up the day the server adds them.
 *
 * Amounts are strings with two decimals, and they stay strings (plan §4.2).
 */
import type { Bal, Side } from "@/features/reports/shared/wire/types";

export type { Bal, Side };

export type OutstandingSide = "RECEIVABLE" | "PAYABLE";
export type AgeBy = "BILL_DATE" | "DUE_DATE";
export type PartyFlag = "CHQ_BOUNCED" | "OVER_LIMIT" | "OVER_180" | "ADVANCE";
export type BillSide = "OWED" | "ON_ACCOUNT";
export type SummaryGroupBy = "AREA" | "GROUP" | "SALESMAN" | "BRANCH";
export type CollectionDay = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export const PARTY_FLAGS: readonly PartyFlag[] = ["CHQ_BOUNCED", "OVER_LIMIT", "OVER_180", "ADVANCE"];
export const COLLECTION_DAYS: readonly CollectionDay[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/** What every payload says about the report it belongs to. */
export type ReportHead = {
  asOn: string;
  side: OutstandingSide;
  /** asOn is after today: post-dated cheques up to asOn count as settled. */
  isFuture: boolean;
  /** The fiscal year asOn falls in. Shown, never sent back. */
  accYear: string;
  bucketLabels: string[];
};

export type PageInfo = { page: number; pageSize: number; totalRows: number };

/* ------------------------------------------------------------ /options */

export type GroupOption = { groupId: string; name: string; depth: number; isDefault: boolean };
export type AreaOption = { areaId: string; name: string; collectionDays: string[] };
export type SalesmanOption = { salesmanId: string; name: string };
export type BranchOption = { branchId: string; name: string };

export type OptionsPayload = {
  groups: GroupOption[];
  areas: AreaOption[];
  salesmen: SalesmanOption[];
  branches: BranchOption[];
};

/* ------------------------------------------------------------ /parties */

export type PartyRow = {
  partyId: string;
  name: string;
  area: string | null;
  phone: string | null;
  creditDays: number | null;
  creditLimit: string | null;
  /** Owed-side open bills. */
  bills: number;
  owed: string;
  onAccount: string;
  net: Bal;
  /** Same length as bucketLabels — `parse.ts` refuses anything else. */
  buckets: string[];
  overdue: string;
  oldestDays: number | null;
  pdcInHand: string;
  flags: PartyFlag[];
};

export type PartyTotals = {
  bills: number;
  owed: string;
  onAccount: string;
  net: Bal;
  buckets: string[];
  overdue: string;
  pdcInHand: string;
};

export type PartyTiles = {
  net: Bal;
  parties: number;
  bills: number;
  overdue: string;
  overduePctOfOwed: string;
  aboveDays: { days: number; amount: string; parties: number };
  onAccount: string;
  pdcInHand: { amount: string; cheques: number };
  dueNext: { days: number; amount: string; from: string; to: string };
};

export type PartiesPayload = ReportHead & {
  tiles: PartyTiles;
  rows: PartyRow[];
  totals: PartyTotals;
  page: PageInfo;
};

/* -------------------------------------------------------------- /party */

export type PartyFacts = {
  partyId: string;
  name: string;
  ledgerGroup: string | null;
  area: string | null;
  phone: string | null;
  gstin: string | null;
  creditDays: number | null;
  creditLimit: string | null;
  creditBillLimit: number | null;
  /** The ledger has a customer row AND a supplier row (O3). */
  isDualRole: boolean;
};

export type PdcItem = {
  pdcId: string;
  accYear: string;
  chequeNo: string | null;
  bank: string | null;
  chequeDate: string;
  amount: string;
  status: string;
};

export type OnAccountItem = {
  billId: string;
  accYear: string;
  docRefno: string | null;
  date: string;
  type: string;
  amount: string;
};

export type LastSettlement = {
  date: string;
  voucherId: string;
  voucherAccYear: string;
  voucherNo: string | null;
  voucherType: string | null;
  /** FORWARD: the voucher's branch and type, for the drill. */
  voucherBranchId: string | null;
  voucherTypeId: number | null;
  amount: string;
};

export type PartyCardPayload = ReportHead & {
  party: PartyFacts;
  ageing: { labels: string[]; amounts: string[] };
  owed: string;
  onAccount: string;
  net: Bal;
  onAccountItems: OnAccountItem[];
  pdcInHand: PdcItem[];
  /** Dated on or before asOn, not yet cleared: ALREADY counted as settled (§4.5). Info only. */
  pdcEffectiveUncleared: PdcItem[];
  lastSettlement: LastSettlement | null;
};

/* ------------------------------------------------- /bills, /bill-wise */

export type BillRow = {
  billId: string;
  accYear: string;
  /** FORWARD: the bill's branch, the key a keyed screen opens under. */
  branchId: string | null;
  branchName: string | null;
  docDate: string;
  docRefno: string | null;
  billType: string;
  srcDocType: string | null;
  srcDocId: string | null;
  srcAccYear: string | null;
  voucherId: string | null;
  /** FORWARD: `acc_voucher_types.vchr_type_id` of `voucherId`. */
  voucherTypeId: number | null;
  side: BillSide;
  dueDate: string | null;
  dueEff: string;
  billAmount: string;
  adjusted: string;
  pending: string;
  ageDays: number;
  overdueDays: number | null;
  remarks: string | null;
  tenderDerived: boolean;
  dataWarning: string | null;
};

export type BillTotals = {
  bills: number;
  billAmount: string;
  adjusted: string;
  net: Bal;
};

export type BillsPayload = ReportHead & {
  partyId: string;
  rows: BillRow[];
  totals: BillTotals;
  /** The party ledger's balance on asOn, ledger-statement definition (§5.4). */
  ledgerClosing: Bal;
};

export type BillWiseRow = BillRow & {
  partyId: string;
  partyName: string;
  area: string | null;
};

export type BillWisePayload = ReportHead & {
  rows: BillWiseRow[];
  totals: BillTotals;
  page: PageInfo;
};

/* ------------------------------------------------------- /bill-history */

export type BillHistoryRow = {
  adjustmentId: string;
  date: string;
  adjType: string;
  voucherId: string | null;
  voucherAccYear: string | null;
  voucherNo: string | null;
  voucherType: string | null;
  /** FORWARD: for the drill, as on `LastSettlement`. */
  voucherBranchId: string | null;
  voucherTypeId: number | null;
  againstDocRefno: string | null;
  /** Signed: a reversal row is negative. */
  amount: string;
  isReversal: boolean;
  reversalReason: string | null;
  isPostDated: boolean;
  chequeNo: string | null;
  /** abj_adj_date <= asOn. */
  effective: boolean;
};

export type BillHistoryPayload = {
  asOn: string;
  bill: {
    billId: string;
    accYear: string;
    partyId: string;
    docRefno: string | null;
    docDate: string;
    billType: string;
    side: Side;
    billAmount: string;
    pending: string;
  };
  rows: BillHistoryRow[];
  /** §4.3's derived counter tender ("paid at counter"), or null. */
  tenderAtBill: string | null;
  dataWarning: string | null;
};

/* ------------------------------------------------------------ /summary */

export type SummaryRow = {
  key: string | null;
  name: string;
  parties: number;
  owed: string;
  onAccount: string;
  net: Bal;
  buckets: string[];
  overdue: string;
};

export type SummaryPayload = ReportHead & {
  groupBy: SummaryGroupBy;
  rows: SummaryRow[];
  totals: Omit<SummaryRow, "key" | "name">;
};

/* ------------------------------------------------------- /due-calendar */

export type DueDay = { date: string; amount: string; bills: number; parties: number };

export type DueCalendarPayload = {
  asOn: string;
  side: OutstandingSide;
  from: string;
  to: string;
  /** Only days with something due; the client lays out the empty ones. */
  days: DueDay[];
  /** Owed bills pending on asOn whose dueEff is before `from`. */
  overdueBefore: { amount: string; bills: number };
};

/* ------------------------------------------------------------- /export */

export type ExportShape = "PARTIES" | "BILLS" | "PARTY_STATEMENT";

type ExportHead = ReportHead & {
  /** The applied filters as one sentence. */
  printedAs: string;
  companyName: string | null;
  branchName: string | null;
  totalRows: number;
};

export type PartiesExportPayload = ExportHead & {
  shape: "PARTIES";
  rows: PartyRow[];
  totals: PartyTotals;
  tiles: PartyTiles;
};

export type BillsExportPayload = ExportHead & {
  shape: "BILLS";
  rows: BillWiseRow[];
  totals: BillTotals;
};

export type StatementExportPayload = ExportHead & {
  shape: "PARTY_STATEMENT";
  party: PartyFacts;
  rows: BillRow[];
  totals: BillTotals;
  ageing: { labels: string[]; amounts: string[] };
  owed: string;
  onAccount: string;
  net: Bal;
  pdcInHand: PdcItem[];
};

export type ExportPayload = PartiesExportPayload | BillsExportPayload | StatementExportPayload;
