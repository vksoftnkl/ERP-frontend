/**
 * Filters ⇄ URL ⇄ request query (plan §3.3).
 *
 * The URL IS the report's state. Show (F5) writes it, and the URL change is
 * what fetches, so the Back button, a pasted link and a refresh all reproduce
 * the same report. The selected party, the sort and the tab ride along, so
 * Back from a drilled-into bill lands on the same party with its bills open.
 *
 * `companyId` is never in the URL: it comes from the session, so a link opened
 * under another company re-scopes instead of leaking. There is NO `accYear`
 * anywhere in this feature. As on decides the year (backend §4.1).
 *
 * `branch=all` is "All branches (combined)". An absent `branch` means "no
 * choice made yet", and the session's branch fills in. The two must differ, or
 * a shared link for the combined view would open on one branch.
 *
 * An absent `group` is the side's default group (Sundry Debtors / Creditors).
 * The server reads an absent `groupId` the same way, so the URL stays clean.
 */
import { addDays, isIsoDate } from "@/features/reports/shared/wire/dates";
import {
  COLLECTION_DAYS,
  type AgeBy,
  type CollectionDay,
  type ExportShape,
  type OutstandingSide,
  type SummaryGroupBy,
} from "../wire/types";

export type Tab = "parties" | "bills" | "summary" | "calendar";
export const TABS: readonly Tab[] = ["parties", "bills", "summary", "calendar"];

export const PARTY_SORTS = [
  "net",
  "name",
  "overdue",
  "oldest",
  "owed",
  "bucket0",
  "bucket1",
  "bucket2",
  "bucket3",
  "bucket4",
  "bucket5",
  "bucket6",
  "bucket7",
] as const;
export type PartySort = (typeof PARTY_SORTS)[number];

export const BILL_SORTS = ["date", "party", "due", "refno", "pending", "age", "overdue"] as const;
export type BillSort = (typeof BILL_SORTS)[number];

export type SortDir = "asc" | "desc";

export const GROUP_BYS: readonly SummaryGroupBy[] = ["AREA", "GROUP", "SALESMAN", "BRANCH"];

export const DEFAULT_BUCKETS = "30,60,90,180";
export const PAGE_SIZE = 200;
/** The due calendar's default window: As on → As on + 30 (plan §11.3). */
export const CALENDAR_DEFAULT_DAYS = 30;

/** Every filter the SERVER sees. A change to any of these is a new report. */
export type ReportFilters = {
  side: OutstandingSide;
  asOn: string;
  /** null = All branches (combined). */
  branchId: string | null;
  /** null = the side's default group. */
  groupId: string | null;
  areaId: string | null;
  salesmanId: string | null;
  collectionDay: CollectionDay | null;
  /** More filters › Party: narrows the whole report to one party. */
  partyId: string | null;
  minDueDays: number | null;
  maxDueDays: number | null;
  ageBy: AgeBy;
  /** Normalised `30,60,90,180`. Validated by the server, not here. */
  buckets: string;
  onlyOverdue: boolean;
  includeOnAccount: boolean;
  deductPdc: boolean;
  hideZero: boolean;
};

/** Where the screen is looking: tab, sorts, the focused party, tab parameters. */
export type ViewState = {
  tab: Tab;
  sort: PartySort;
  dir: SortDir;
  /** The party focused in the party grid (its card and bills are shown). */
  selected: string | null;
  billSort: BillSort;
  billDir: SortDir;
  /** Bill-wise tab: only bills whose due date is this day (the calendar's day click). */
  dueOn: string | null;
  groupBy: SummaryGroupBy;
  calFrom: string | null;
  calTo: string | null;
};

export type Filters = ReportFilters & ViewState;

/** Where the report is scoped, from the session. Never from the URL. */
export type Session = {
  companyId: string;
  /** The session's branch: the Branch default. */
  branchId: string | null;
  /** The session's year: only the default for As on. */
  yearBegin: string | null;
  yearEnd: string | null;
};

export type FilterDefaults = { asOn: string; branchId: string | null };

const ALL_BRANCHES = "all";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(value: string | null): string | null {
  return value && UUID.test(value) ? value : null;
}

function flag(value: string | null, fallback: boolean): boolean {
  if (value === "1") return true;
  if (value === "0") return false;
  return fallback;
}

function wholeNumber(value: string | null): number | null {
  if (!value || !/^\d{1,5}$/.test(value)) return null;
  return Number(value);
}

function oneOf<T extends string>(value: string | null, values: readonly T[], fallback: T): T {
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

function collectionDay(value: string | null): CollectionDay | null {
  return value !== null && (COLLECTION_DAYS as readonly string[]).includes(value) ? (value as CollectionDay) : null;
}

function isoOrNull(value: string | null): string | null {
  return value && isIsoDate(value) ? value : null;
}

/**
 * `30 60 90 180`, `30,60,90,180` and `30·60·90·180` → `30,60,90,180`. Only
 * the separators are normalised. Order and range are the server's to judge
 * (`BAD_BUCKETS`): one rule, in one place.
 */
export function normaliseBuckets(text: string): string {
  return text
    .trim()
    .replace(/[^0-9]+/g, ",")
    .replace(/^,+|,+$/g, "");
}

/** `30,60,90,180` → `30 · 60 · 90 · 180`, as the Buckets field shows it. */
export function bucketsText(buckets: string): string {
  return buckets.split(",").filter(Boolean).join(" · ");
}

/**
 * The applied edges, for COLOUR only (the Oldest column's amber / red). They
 * are the user's own input, already accepted by the server; no figure is
 * derived from them.
 */
export function bucketEdges(buckets: string): number[] {
  return buckets
    .split(",")
    .filter((part) => /^\d+$/.test(part))
    .map((part) => Number(part));
}

export function parseFilters(search: URLSearchParams, defaults: FilterDefaults): Filters {
  const side: OutstandingSide = search.get("side") === "P" ? "PAYABLE" : "RECEIVABLE";
  const receivable = side === "RECEIVABLE";
  const branch = search.get("branch");
  const asOn = search.get("asOn");
  return {
    side,
    asOn: asOn && isIsoDate(asOn) ? asOn : defaults.asOn,
    branchId: branch === ALL_BRANCHES ? null : (uuid(branch) ?? defaults.branchId),
    groupId: uuid(search.get("group")),
    // The server refuses these on Payable (NOT_FOR_PAYABLE), and the fields are
    // hidden there, so a hand-edited link cannot send them either.
    areaId: receivable ? uuid(search.get("area")) : null,
    salesmanId: receivable ? uuid(search.get("salesman")) : null,
    collectionDay: receivable ? collectionDay(search.get("cday")) : null,
    partyId: uuid(search.get("pf")),
    minDueDays: wholeNumber(search.get("dmin")),
    maxDueDays: wholeNumber(search.get("dmax")),
    ageBy: search.get("age") === "DUE" ? "DUE_DATE" : "BILL_DATE",
    buckets: search.has("b") ? normaliseBuckets(search.get("b") ?? "") : DEFAULT_BUCKETS,
    onlyOverdue: flag(search.get("oo"), false),
    includeOnAccount: flag(search.get("oa"), true),
    deductPdc: flag(search.get("pdc"), false),
    hideZero: flag(search.get("hz"), true),

    tab: oneOf(search.get("tab"), TABS, "parties"),
    sort: oneOf(search.get("sort"), PARTY_SORTS, "net"),
    dir: search.get("dir") === "asc" ? "asc" : "desc",
    selected: uuid(search.get("party")),
    billSort: oneOf(search.get("bsort"), BILL_SORTS, "date"),
    billDir: search.get("bdir") === "desc" ? "desc" : "asc",
    dueOn: isoOrNull(search.get("due")),
    groupBy: oneOf(search.get("gb"), GROUP_BYS, receivable ? "AREA" : "GROUP"),
    calFrom: isoOrNull(search.get("cf")),
    calTo: isoOrNull(search.get("ct")),
  };
}

export function buildSearch(filters: Filters): URLSearchParams {
  const search = new URLSearchParams();
  const set = (key: string, value: string | number | null | undefined) => {
    if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
  };
  search.set("side", filters.side === "PAYABLE" ? "P" : "R");
  search.set("asOn", filters.asOn);
  search.set("branch", filters.branchId ?? ALL_BRANCHES);
  set("group", filters.groupId);
  set("area", filters.areaId);
  set("salesman", filters.salesmanId);
  set("cday", filters.collectionDay);
  set("pf", filters.partyId);
  set("dmin", filters.minDueDays);
  set("dmax", filters.maxDueDays);
  search.set("age", filters.ageBy === "DUE_DATE" ? "DUE" : "BILL");
  search.set("b", filters.buckets);
  search.set("oo", filters.onlyOverdue ? "1" : "0");
  search.set("oa", filters.includeOnAccount ? "1" : "0");
  search.set("pdc", filters.deductPdc ? "1" : "0");
  search.set("hz", filters.hideZero ? "1" : "0");
  search.set("tab", filters.tab);
  search.set("sort", filters.sort);
  search.set("dir", filters.dir);
  set("party", filters.selected);
  if (filters.billSort !== "date" || filters.billDir !== "asc") {
    search.set("bsort", filters.billSort);
    search.set("bdir", filters.billDir);
  }
  set("due", filters.dueOn);
  set("gb", filters.groupBy);
  set("cf", filters.calFrom);
  set("ct", filters.calTo);
  return search;
}

/**
 * A Side change clears every id that belongs to one side (group, area,
 * salesman, collection day, party). The new side's default group then
 * applies, because an absent group IS the default. It does not fetch: the
 * caller only edits the draft, and Show applies it.
 */
type SideScoped = Pick<ReportFilters, "side" | "groupId" | "areaId" | "salesmanId" | "collectionDay" | "partyId">;

export function changeSide<T extends SideScoped>(filters: T, side: OutstandingSide): T {
  if (filters.side === side) return filters;
  return {
    ...filters,
    side,
    groupId: null,
    areaId: null,
    salesmanId: null,
    collectionDay: null,
    partyId: null,
  };
}

/** The report filters alone, without the view state. */
export function reportFiltersOf(f: ReportFilters): ReportFilters {
  return {
    side: f.side,
    asOn: f.asOn,
    branchId: f.branchId,
    groupId: f.groupId,
    areaId: f.areaId,
    salesmanId: f.salesmanId,
    collectionDay: f.collectionDay,
    partyId: f.partyId,
    minDueDays: f.minDueDays,
    maxDueDays: f.maxDueDays,
    ageBy: f.ageBy,
    buckets: f.buckets,
    onlyOverdue: f.onlyOverdue,
    includeOnAccount: f.includeOnAccount,
    deductPdc: f.deductPdc,
    hideZero: f.hideZero,
  };
}

/* ---------------------------------------------------------------- keys */

/** The identity of a report: every filter the SERVER sees. */
export function reportKey(f: ReportFilters): string {
  return [
    f.side,
    f.asOn,
    f.branchId ?? ALL_BRANCHES,
    f.groupId ?? "",
    f.areaId ?? "",
    f.salesmanId ?? "",
    f.collectionDay ?? "",
    f.partyId ?? "",
    f.minDueDays ?? "",
    f.maxDueDays ?? "",
    f.ageBy,
    f.buckets,
    f.onlyOverdue ? 1 : 0,
    f.includeOnAccount ? 1 : 0,
    f.deductPdc ? 1 : 0,
    f.hideZero ? 1 : 0,
  ].join("|");
}

export function partiesKey(f: Filters): string {
  return `${reportKey(f)}#${f.sort}:${f.dir}`;
}

export function billWiseKey(f: Filters): string {
  return `${reportKey(f)}#${f.billSort}:${f.billDir}:${f.dueOn ?? ""}`;
}

export function summaryKey(f: Filters): string {
  return `${reportKey(f)}#${f.groupBy}`;
}

/** The calendar window, with the default filled in. */
export function calendarWindow(f: Filters): { from: string; to: string } {
  const from = f.calFrom ?? f.asOn;
  const to = f.calTo ?? addDays(from, CALENDAR_DEFAULT_DAYS);
  return { from, to };
}

export function calendarKey(f: Filters): string {
  const { from, to } = calendarWindow(f);
  return `${reportKey(f)}#${from}:${to}`;
}

/* ------------------------------------------------------- request queries */

export type FilterQuery = {
  companyId: string;
  asOn: string;
  side: OutstandingSide;
  branchId?: string;
  groupId?: string;
  areaId?: string;
  collectionDay?: CollectionDay;
  salesmanId?: string;
  partyId?: string;
  ageBy: AgeBy;
  buckets: string;
  onlyOverdue: boolean;
  includeOnAccount: boolean;
  deductPdc: boolean;
  hideZero: boolean;
  minDueDays?: number;
  maxDueDays?: number;
};
export type OptionsQuery = { companyId: string; side: OutstandingSide };
export type PartiesQuery = FilterQuery & { sort: PartySort; dir: SortDir; page: number; pageSize: number };
export type PartyQuery = FilterQuery & { partyId: string };
export type BillWiseQuery = FilterQuery & {
  sort: BillSort;
  dir: SortDir;
  page: number;
  pageSize: number;
  dueOn?: string;
};
export type SummaryQuery = FilterQuery & { groupBy: SummaryGroupBy };
export type CalendarQuery = FilterQuery & { from: string; to: string };
export type ExportQuery = FilterQuery & { shape: ExportShape; sort?: PartySort | BillSort; dir?: SortDir };
export type BillHistoryQuery = { companyId: string; billId: string; accYear: string; asOn: string };

/** Absent keys are omitted, never sent empty: the DTOs want UUIDs. */
export function filterQuery(session: Session, f: ReportFilters): FilterQuery {
  const q: FilterQuery = {
    companyId: session.companyId,
    asOn: f.asOn,
    side: f.side,
    ageBy: f.ageBy,
    buckets: f.buckets,
    onlyOverdue: f.onlyOverdue,
    includeOnAccount: f.includeOnAccount,
    deductPdc: f.deductPdc,
    hideZero: f.hideZero,
  };
  if (f.branchId) q.branchId = f.branchId;
  if (f.groupId) q.groupId = f.groupId;
  if (f.side === "RECEIVABLE") {
    if (f.areaId) q.areaId = f.areaId;
    if (f.salesmanId) q.salesmanId = f.salesmanId;
    if (f.collectionDay) q.collectionDay = f.collectionDay;
  }
  if (f.partyId) q.partyId = f.partyId;
  if (f.minDueDays !== null) q.minDueDays = f.minDueDays;
  if (f.maxDueDays !== null) q.maxDueDays = f.maxDueDays;
  return q;
}

export function optionsQuery(session: Session, side: OutstandingSide): OptionsQuery {
  return { companyId: session.companyId, side };
}

export function partiesQuery(session: Session, f: Filters, page: number, pageSize = PAGE_SIZE): PartiesQuery {
  return { ...filterQuery(session, f), sort: f.sort, dir: f.dir, page, pageSize };
}

/** `/party` and `/bills`: the focused party, whatever the party filter says. */
export function partyQuery(session: Session, f: ReportFilters, partyId: string): PartyQuery {
  return { ...filterQuery(session, f), partyId };
}

export function billWiseQuery(session: Session, f: Filters, page: number, pageSize = PAGE_SIZE): BillWiseQuery {
  const q: BillWiseQuery = { ...filterQuery(session, f), sort: f.billSort, dir: f.billDir, page, pageSize };
  if (f.dueOn) q.dueOn = f.dueOn;
  return q;
}

export function summaryQuery(session: Session, f: Filters): SummaryQuery {
  return { ...filterQuery(session, f), groupBy: f.groupBy };
}

export function calendarQuery(session: Session, f: Filters): CalendarQuery {
  return { ...filterQuery(session, f), ...calendarWindow(f) };
}

export function exportQuery(session: Session, f: Filters, shape: ExportShape): ExportQuery {
  const base = filterQuery(session, f);
  if (shape === "PARTIES") return { ...base, shape, sort: f.sort, dir: f.dir };
  // No `dueOn` here: the export DTO does not take it (a calendar-day list
  // exports the whole bill-wise list, and says so).
  if (shape === "BILLS") return { ...base, shape, sort: f.billSort, dir: f.billDir };
  return { ...base, shape, partyId: f.selected ?? base.partyId };
}

export function billHistoryQuery(
  session: Session,
  bill: { billId: string; accYear: string },
  asOn: string,
): BillHistoryQuery {
  return { companyId: session.companyId, billId: bill.billId, accYear: bill.accYear, asOn };
}

/* ------------------------------------------------------------- defaults */

/** As on = today, or the session year's end when today is past it (§3.1). */
export function defaultAsOn(session: Pick<Session, "yearEnd">, today: string): string {
  return session.yearEnd && today > session.yearEnd ? session.yearEnd : today;
}

/** The client's own check before Show. A convenience: the server's answer is the rule. */
export function checkFilters(f: ReportFilters): { message: string; field: "asOn" | "dueDays" } | null {
  if (!isIsoDate(f.asOn)) return { message: "Enter the As on date.", field: "asOn" };
  if (f.minDueDays !== null && f.maxDueDays !== null && f.minDueDays > f.maxDueDays) {
    return { message: "Due days ≥ is more than Due days ≤.", field: "dueDays" };
  }
  return null;
}
