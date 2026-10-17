/**
 * Filters ⇄ URL ⇄ request query (plan §3).
 *
 * The URL IS the report's state. Show (F5) writes it, ◀ ▶ write it at once,
 * and the URL change is what fetches, so Back steps back a day and a pasted
 * link reproduces the report.
 *
 *     /reports/day-summary?date=2026-10-09&to=2026-10-09&branch=<uuid>&type=3
 *        &tab=summary&drafts=1&pairs=1&clr=1&zero=0&group=REPORT
 *        [&nature=SALES | &money=CASH] [&list=drafts] [&legs=1] [&by=TYPE]
 *
 * `tab` is summary · vouchers · daily · tender (By tender) · no-tender. The
 * two tender tabs share the dates and the branch, and ignore the rest.
 *
 * `companyId` and `accYear` are never in the URL: they come from the session,
 * so a link opened under another company re-scopes instead of leaking.
 *
 * `branch=all` is "All branches"; an ABSENT `branch` means "no choice made
 * yet", and the session's branch fills in (as the ledger statement). A shared
 * link for the combined view must not open on one branch.
 */
import { addDays, displayDate, isIsoDate } from "@/features/reports/shared/wire/dates";
import {
  GROUP_LEVELS,
  MONEY_KINDS,
  VOUCHER_NATURES,
  type GroupLevel,
  type MoneyKind,
  type TenderGroupBy,
} from "../wire/types";

export type Tab = "summary" | "vouchers" | "daily" | "tender" | "no-tender";

export const TABS: readonly Tab[] = ["summary", "vouchers", "daily", "tender", "no-tender"];

/** The Day Book by tender's two tabs (server notes 126 §4): dates and branch only. */
export function isTenderTab(tab: Tab): boolean {
  return tab === "tender" || tab === "no-tender";
}

export type Filters = {
  fromDate: string;
  toDate: string;
  /** null = All branches. */
  branchId: string | null;
  voucherTypeId: number | null;
  tab: Tab;
  /** Display only: the Draft column, the draft clauses and the DRAFTS check (§6). */
  countDrafts: boolean;
  /** `/vouchers` only; the summary always leaves in-range pairs out (D2). */
  includeCancelledPairs: boolean;
  clearingAsBank: boolean;
  zeroRows: boolean;
  groupLevel: GroupLevel;
  /** From a tile drill (Vouchers tab only): a `vchr_nature`, the only thing the server takes. */
  natureFilter: string | null;
  /** From the cash tile: only vouchers touching cash (Vouchers tab only). */
  moneyKind: MoneyKind | null;
  /** The Vouchers tab's Drafts view. */
  draftsOnly: boolean;
  /** The Vouchers tab's pages carry legs. */
  withLegs: boolean;
  /** By tender: each tender master on its own, or all of a tender type together. */
  tenderGroupBy: TenderGroupBy;
};

/** Where the report is scoped, from the session. Never from the URL. */
export type Session = {
  companyId: string;
  accYear: string;
  yearBegin: string | null;
  yearEnd: string | null;
  branchId: string | null;
};

/** Values used for any key the URL does not carry. */
export type FilterDefaults = { date: string; branchId: string | null };

const ALL_BRANCHES = "all";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function flag(value: string | null, fallback: boolean): boolean {
  if (value === "1") return true;
  if (value === "0") return false;
  return fallback;
}

/** A voucher type id from the URL or a combo: an id, not an amount (the feature's only number parse outside export/). */
export function parseTypeId(value: string | null): number | null {
  return value && /^\d{1,9}$/.test(value) ? Number(value) : null;
}

export function parseFilters(search: URLSearchParams, defaults: FilterDefaults): Filters {
  const date = search.get("date");
  const to = search.get("to");
  const branch = search.get("branch");
  const tab = search.get("tab");
  const group = search.get("group");
  const nature = search.get("nature");
  const money = search.get("money");
  const fromDate = date && isIsoDate(date) ? date : defaults.date;
  return {
    fromDate,
    // No To = one day, the default.
    toDate: to && isIsoDate(to) ? to : fromDate,
    branchId: branch === ALL_BRANCHES ? null : branch && UUID.test(branch) ? branch : defaults.branchId,
    voucherTypeId: parseTypeId(search.get("type")),
    tab: (TABS as readonly string[]).includes(tab ?? "") ? (tab as Tab) : "summary",
    countDrafts: flag(search.get("drafts"), true),
    includeCancelledPairs: flag(search.get("pairs"), true),
    clearingAsBank: flag(search.get("clr"), true),
    zeroRows: flag(search.get("zero"), false),
    groupLevel: (GROUP_LEVELS as readonly string[]).includes(group ?? "") ? (group as GroupLevel) : "REPORT",
    natureFilter: (VOUCHER_NATURES as readonly string[]).includes(nature ?? "") ? nature : null,
    moneyKind: (MONEY_KINDS as readonly string[]).includes(money ?? "") ? (money as MoneyKind) : null,
    draftsOnly: search.get("list") === "drafts",
    withLegs: flag(search.get("legs"), false),
    tenderGroupBy: search.get("by") === "TYPE" ? "TYPE" : "TENDER",
  };
}

export function buildSearch(filters: Filters): URLSearchParams {
  const search = new URLSearchParams();
  search.set("date", filters.fromDate);
  search.set("to", filters.toDate);
  search.set("branch", filters.branchId ?? ALL_BRANCHES);
  if (filters.voucherTypeId !== null) search.set("type", String(filters.voucherTypeId));
  search.set("tab", filters.tab);
  search.set("drafts", filters.countDrafts ? "1" : "0");
  search.set("pairs", filters.includeCancelledPairs ? "1" : "0");
  search.set("clr", filters.clearingAsBank ? "1" : "0");
  search.set("zero", filters.zeroRows ? "1" : "0");
  search.set("group", filters.groupLevel);
  if (filters.natureFilter) search.set("nature", filters.natureFilter);
  if (filters.moneyKind) search.set("money", filters.moneyKind);
  if (filters.draftsOnly) search.set("list", "drafts");
  if (filters.withLegs) search.set("legs", "1");
  if (filters.tenderGroupBy === "TYPE") search.set("by", "TYPE");
  return search;
}

export function isRange(filters: Pick<Filters, "fromDate" | "toDate">): boolean {
  return filters.toDate > filters.fromDate;
}

/* ---------------------------------------------------------------- ◀ ▶ step */

export type Step = -1 | 1;

/**
 * ◀ ▶ (and Alt+← / Alt+→), plan §3.2: step the Date by one day and make To
 * equal it, as 3.0 did (`dEFrom ± 1`, `dETo = dEFrom`). So a range collapses
 * to one day. The fiscal year's edges stop it: null = no step.
 */
export function stepDay(
  dates: Pick<Filters, "fromDate" | "toDate">,
  dir: Step,
  session: Pick<Session, "yearBegin" | "yearEnd">,
): { fromDate: string; toDate: string } | null {
  if (!isIsoDate(dates.fromDate)) return null;
  const next = addDays(dates.fromDate, dir);
  if (session.yearBegin && next < session.yearBegin) return null;
  if (session.yearEnd && next > session.yearEnd) return null;
  return { fromDate: next, toDate: next };
}

/* ------------------------------------------------------------------ defaults */

/** Today, or the year's end when today is past it (or its begin when before it). */
export function defaultDate(session: Pick<Session, "yearBegin" | "yearEnd">, today: string): string {
  if (session.yearEnd && today > session.yearEnd) return session.yearEnd;
  if (session.yearBegin && today < session.yearBegin) return session.yearBegin;
  return today;
}

/**
 * The client's own check before Show. A convenience only: the server refuses
 * the same things (`RANGE_*`), and its answer is the rule.
 */
export function checkFilters(
  filters: Pick<Filters, "fromDate" | "toDate">,
  session: Session,
): { message: string; field: "dates" } | null {
  if (!isIsoDate(filters.fromDate)) return { message: "Enter the Date.", field: "dates" };
  if (!isIsoDate(filters.toDate)) return { message: "Enter the To date.", field: "dates" };
  if (filters.fromDate > filters.toDate) return { message: "The To date is before the Date.", field: "dates" };
  const { yearBegin, yearEnd } = session;
  if ((yearBegin && filters.fromDate < yearBegin) || (yearEnd && filters.toDate > yearEnd)) {
    const range = yearBegin && yearEnd ? ` (${displayDate(yearBegin)} – ${displayDate(yearEnd)})` : "";
    return { message: `The dates must be inside the year ${session.accYear}${range}.`, field: "dates" };
  }
  return null;
}

/* ------------------------------------------------------------ request queries */

/** `DaySummaryScopeDto` (backend §5), the part every route takes. */
export type ScopeQuery = {
  companyId: string;
  accYear: string;
  branchId?: string;
  fromDate: string;
  toDate: string;
  voucherTypeId?: number;
};

export type SummaryQuery = ScopeQuery & { clearingAsBank: boolean; groupLevel: GroupLevel; zeroRows: boolean };
export type VouchersQuery = ScopeQuery & {
  clearingAsBank: boolean;
  page: number;
  pageSize: number;
  withLegs: boolean;
  includeCancelledPairs: boolean;
  natureFilter?: string;
  moneyKind?: MoneyKind;
  draftsOnly?: boolean;
};
export type DailyQuery = ScopeQuery & { clearingAsBank: boolean; zeroRows: boolean };
export type GroupLedgersQuery = SummaryQuery & { groupId: string };
export type CheckDetailQuery = ScopeQuery & { code: string };
export type ExportQuery = SummaryQuery & { includeCancelledPairs: boolean; withLegs: boolean };

export function scopeQuery(session: Session, filters: Filters): ScopeQuery {
  const query: ScopeQuery = {
    companyId: session.companyId,
    accYear: session.accYear,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
  };
  // Absent = All branches / all types. Never an empty string: the DTO wants a UUID / an int.
  if (filters.branchId) query.branchId = filters.branchId;
  if (filters.voucherTypeId !== null) query.voucherTypeId = filters.voucherTypeId;
  return query;
}

export function summaryQuery(session: Session, filters: Filters): SummaryQuery {
  return {
    ...scopeQuery(session, filters),
    clearingAsBank: filters.clearingAsBank,
    groupLevel: filters.groupLevel,
    zeroRows: filters.zeroRows,
  };
}

export function vouchersQuery(session: Session, filters: Filters, page: number, pageSize: number): VouchersQuery {
  const query: VouchersQuery = {
    ...scopeQuery(session, filters),
    clearingAsBank: filters.clearingAsBank,
    page,
    pageSize,
    // Drafts have no legs (backend §5.3).
    withLegs: filters.withLegs && !filters.draftsOnly,
    includeCancelledPairs: filters.includeCancelledPairs,
  };
  if (filters.natureFilter) query.natureFilter = filters.natureFilter;
  if (filters.moneyKind) query.moneyKind = filters.moneyKind;
  if (filters.draftsOnly) query.draftsOnly = true;
  return query;
}

export function dailyQuery(session: Session, filters: Filters): DailyQuery {
  return { ...scopeQuery(session, filters), clearingAsBank: filters.clearingAsBank, zeroRows: filters.zeroRows };
}

export function groupLedgersQuery(session: Session, filters: Filters, groupId: string): GroupLedgersQuery {
  return { ...summaryQuery(session, filters), groupId };
}

export function checkDetailQuery(session: Session, filters: Filters, code: string): CheckDetailQuery {
  return { ...scopeQuery(session, filters), code };
}

export function exportQuery(session: Session, filters: Filters): ExportQuery {
  return { ...summaryQuery(session, filters), includeCancelledPairs: filters.includeCancelledPairs, withLegs: true };
}

/** The No tender list's row cap (the Qt screen's `kNoTenderLimit`); `count` is always the whole range's. */
export const NO_TENDER_LIMIT = 500;

/**
 * `TenderBooksScopeDto`: company, year, dates, branch. No voucher type: the
 * DTO has none, and the server's whitelist refuses a key it does not declare.
 */
export type TenderScopeQuery = { companyId: string; accYear: string; branchId?: string; fromDate: string; toDate: string };
export type TenderDayBookQuery = TenderScopeQuery & { groupBy: TenderGroupBy; withRows: false; limit: number };
export type NoTenderQuery = TenderScopeQuery & { limit: number };

function tenderScopeQuery(session: Session, filters: Filters): TenderScopeQuery {
  const query: TenderScopeQuery = {
    companyId: session.companyId,
    accYear: session.accYear,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
  };
  // Absent = every branch.
  if (filters.branchId) query.branchId = filters.branchId;
  return query;
}

/**
 * The groups only. `withRows=false` should leave the lines out, but the
 * server reads that flag after the global pipe has turned "false" into `true`
 * (its DTO takes `value`, not the raw `obj[key]` that `OptionalQueryBoolean`
 * reads), so the lines come anyway; `limit=1` keeps them to one until the
 * flag is fixed. Rows are a separate query and do not touch the groups.
 */
export function tenderDayBookQuery(session: Session, filters: Filters): TenderDayBookQuery {
  return { ...tenderScopeQuery(session, filters), groupBy: filters.tenderGroupBy, withRows: false, limit: 1 };
}

export function noTenderQuery(session: Session, filters: Filters): NoTenderQuery {
  return { ...tenderScopeQuery(session, filters), limit: NO_TENDER_LIMIT };
}

/**
 * A part's identity = exactly what its route is asked. So a filter a route
 * does not take (the group level, for `/vouchers`) never refetches it, and a
 * tab switch keeps what is already held for the current URL.
 */
export function queryKey(route: string, query: object): string {
  const entries = Object.entries(query)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `${route}?${entries.map(([k, v]) => `${k}=${String(v)}`).join("&")}`;
}

/** The vouchers report without its page: every page of one list shares it. */
export function vouchersKey(session: Session, filters: Filters): string {
  const { page: _page, pageSize: _size, ...rest } = vouchersQuery(session, filters, 1, 0);
  return queryKey("vouchers", rest);
}

export function summaryKey(session: Session, filters: Filters): string {
  return queryKey("summary", summaryQuery(session, filters));
}

export function dailyKey(session: Session, filters: Filters): string {
  return queryKey("daily", dailyQuery(session, filters));
}

export function tenderKey(session: Session, filters: Filters): string {
  return queryKey("tender", tenderDayBookQuery(session, filters));
}

/** The group-by is not in it: switching it never asks the No tender list again. */
export function noTenderKey(session: Session, filters: Filters): string {
  return queryKey("no-tender", noTenderQuery(session, filters));
}

/* --------------------------------------------------------------- drill-downs */

/** A tile's vouchers, as the server defines the tile (backend §6.4) in `natureFilter` terms. */
const TILE_NATURE: Record<string, string> = {
  SALES: "SALES",
  SALE_RETURNS: "CREDIT_NOTE",
  RECEIPTS: "RECEIPT",
  // Includes the expense vouchers (nature PAYMENT): the server has no "PAYMENT but not ExpV" filter.
  PAYMENTS: "PAYMENT",
};

/**
 * Tile → the Vouchers tab. `natureFilter` takes a `vchr_nature`, never a tile
 * code, so each tile maps onto one; EXPENSES is one voucher TYPE (ExpV), so it
 * drills by that type's id (resolved by code from `/voucher-types`), falling
 * back to its nature while the list has not come. The cash tile: only
 * vouchers touching cash. An unknown tile opens the list unfiltered.
 */
export function tileDrill(filters: Filters, code: string, expenseTypeId: number | null = null): Filters {
  const base = { ...filters, tab: "vouchers" as const, draftsOnly: false, natureFilter: null, moneyKind: null };
  if (code === "CASH_IN_HAND") return { ...base, moneyKind: "CASH" };
  if (code === "EXPENSES") {
    return expenseTypeId !== null ? { ...base, voucherTypeId: expenseTypeId } : { ...base, natureFilter: "PAYMENT" };
  }
  const nature = TILE_NATURE[code] ?? ((VOUCHER_NATURES as readonly string[]).includes(code) ? code : null);
  return { ...base, natureFilter: nature };
}

/** Type row → the Vouchers tab, that type. */
export function typeDrill(filters: Filters, voucherTypeId: number): Filters {
  return { ...filters, tab: "vouchers", voucherTypeId, natureFilter: null, moneyKind: null, draftsOnly: false };
}

/** Day row → the Summary tab, that one day. */
export function dayDrill(filters: Filters, date: string): Filters {
  return { ...filters, tab: "summary", fromDate: date, toDate: date };
}
