/**
 * Filters ⇄ URL ⇄ request query (plan §3.3).
 *
 * The URL IS the report's state. Show (F5) writes it, and the URL change is
 * what fetches, so the Back button and the Show button cannot disagree.
 *
 * `companyId` and `accYear` are never in the URL. They come from the session,
 * so a link opened under another company re-scopes instead of leaking.
 *
 * `branch=all` is "All branches (combined)". An absent `branch` key means "no
 * choice made yet", and the screen fills in the session's branch. The two must
 * differ, or a shared link for the combined view would open on one branch.
 */
import { displayDate, isIsoDate } from "../wire/dates";

export type Tab = "vouchers" | "daily" | "monthly";

export const TABS: readonly Tab[] = ["vouchers", "daily", "monthly"];

export type Filters = {
  ledgerId: string | null;
  fromDate: string;
  toDate: string;
  /** null = All branches (combined). */
  branchId: string | null;
  tab: Tab;
  includeCancelled: boolean;
  withBillRefs: boolean;
  withLegs: boolean;
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
export type FilterDefaults = {
  fromDate: string;
  toDate: string;
  branchId: string | null;
};

const ALL_BRANCHES = "all";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function flag(value: string | null, fallback: boolean): boolean {
  if (value === "1") return true;
  if (value === "0") return false;
  return fallback;
}

export function parseFilters(search: URLSearchParams, defaults: FilterDefaults): Filters {
  const ledger = search.get("ledger");
  const from = search.get("from");
  const to = search.get("to");
  const branch = search.get("branch");
  const tab = search.get("tab");
  return {
    ledgerId: ledger && UUID.test(ledger) ? ledger : null,
    fromDate: from && isIsoDate(from) ? from : defaults.fromDate,
    toDate: to && isIsoDate(to) ? to : defaults.toDate,
    branchId:
      branch === ALL_BRANCHES ? null : branch && UUID.test(branch) ? branch : defaults.branchId,
    tab: (TABS as readonly string[]).includes(tab ?? "") ? (tab as Tab) : "vouchers",
    includeCancelled: flag(search.get("cancelled"), true),
    withBillRefs: flag(search.get("refs"), true),
    withLegs: flag(search.get("legs"), false),
  };
}

export function buildSearch(filters: Filters): URLSearchParams {
  const search = new URLSearchParams();
  if (filters.ledgerId) search.set("ledger", filters.ledgerId);
  search.set("from", filters.fromDate);
  search.set("to", filters.toDate);
  search.set("branch", filters.branchId ?? ALL_BRANCHES);
  search.set("tab", filters.tab);
  search.set("cancelled", filters.includeCancelled ? "1" : "0");
  search.set("refs", filters.withBillRefs ? "1" : "0");
  search.set("legs", filters.withLegs ? "1" : "0");
  return search;
}

/**
 * The identity of a report: every filter the SERVER sees. The tab is left
 * out, so switching tabs keeps the voucher pages already loaded.
 */
export function reportKey(filters: Filters): string {
  return [
    filters.ledgerId ?? "",
    filters.fromDate,
    filters.toDate,
    filters.branchId ?? ALL_BRANCHES,
    filters.includeCancelled ? 1 : 0,
    filters.withBillRefs ? 1 : 0,
    filters.withLegs ? 1 : 0,
  ].join("|");
}

/* ------------------------------------------------------------ request queries */

export type YearQuery = { companyId: string; accYear: string; branchId?: string };
export type ScopeQuery = YearQuery & { ledgerId: string };
export type RangeQuery = ScopeQuery & { fromDate: string; toDate: string };
export type ExportQuery = RangeQuery & {
  includeCancelled: boolean;
  withBillRefs: boolean;
  withLegs: boolean;
};
export type VouchersQuery = ExportQuery & { page: number; pageSize: number };
export type LedgersQuery = { companyId: string; search?: string; groupId?: string; limit?: number };
export type VoucherLegsQuery = { companyId: string; accYear: string; voucherId: string; ledgerId: string };

function yearQuery(session: Session, filters: Filters): YearQuery {
  const query: YearQuery = { companyId: session.companyId, accYear: session.accYear };
  // Absent = All branches (combined). Never an empty string: the DTO wants a UUID.
  if (filters.branchId) query.branchId = filters.branchId;
  return query;
}

export function scopeQuery(session: Session, filters: Filters, ledgerId: string): ScopeQuery {
  return { ...yearQuery(session, filters), ledgerId };
}

export function rangeQuery(session: Session, filters: Filters, ledgerId: string): RangeQuery {
  return {
    ...scopeQuery(session, filters, ledgerId),
    fromDate: filters.fromDate,
    toDate: filters.toDate,
  };
}

export function exportQuery(session: Session, filters: Filters, ledgerId: string): ExportQuery {
  return {
    ...rangeQuery(session, filters, ledgerId),
    includeCancelled: filters.includeCancelled,
    withBillRefs: filters.withBillRefs,
    withLegs: filters.withLegs,
  };
}

export function vouchersQuery(
  session: Session,
  filters: Filters,
  ledgerId: string,
  page: number,
  pageSize: number,
): VouchersQuery {
  return { ...exportQuery(session, filters, ledgerId), page, pageSize };
}

/* ------------------------------------------------------------------ defaults */

/** From = year begin; To = today, or the year's end when today is past it. */
export function defaultRange(session: Session, today: string): { fromDate: string; toDate: string } {
  const begin = session.yearBegin ?? today;
  let to = today;
  if (session.yearEnd && to > session.yearEnd) to = session.yearEnd;
  if (to < begin) to = session.yearEnd ?? begin;
  return { fromDate: begin, toDate: to };
}

/**
 * The client's own check before Show. A convenience only: the server refuses
 * the same things (`RANGE_*`), and its answer is the rule.
 */
export function checkFilters(
  filters: Filters,
  session: Session,
): { message: string; field: "ledger" | "dates" } | null {
  if (!filters.ledgerId) return { message: "Choose a ledger.", field: "ledger" };
  if (!isIsoDate(filters.fromDate) || !isIsoDate(filters.toDate)) {
    return { message: "Enter both dates.", field: "dates" };
  }
  if (filters.fromDate > filters.toDate) return { message: "From is after To.", field: "dates" };
  const { yearBegin, yearEnd } = session;
  if ((yearBegin && filters.fromDate < yearBegin) || (yearEnd && filters.toDate > yearEnd)) {
    const range =
      yearBegin && yearEnd ? `${displayDate(yearBegin)} – ${displayDate(yearEnd)}` : "the fiscal year";
    return { message: `Both dates must fall inside ${range}.`, field: "dates" };
  }
  return null;
}
