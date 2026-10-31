/**
 * The screen's filters and the queries built from them — Qt
 * `resetFilters()`, `membersQuery()`, `expiringQuery()`, `schemesQuery()`,
 * `filterSummary()` and `refreshSubtitle()`.
 *
 * One builder per tab, so the grid and its export agree. An absent filter is
 * not sent (the server's defaults hold); the three booleans Qt always sends
 * are always sent.
 */
import { isIsoDate } from "@/features/reports/shared/wire/dates";
import { showDate } from "../view/format";
import type { ExportFormat, ExportTab, MemberStatus, SchemeItem } from "../wire/types";

export type Tab = "members" | "expiring" | "schemes";
export const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "members", label: "Members" },
  { id: "expiring", label: "Expiring soon" },
  { id: "schemes", label: "Scheme summary" },
];

export type BranchPick = { id: string; text: string } | null;

export type MembersFilters = {
  /** "" = all schemes. */
  lscId: string;
  branch: BranchPick;
  /** "" = All (the server then lists ACTIVE and SUSPENDED). */
  status: "" | MemberStatus;
  find: string;
  balanceGtZero: boolean;
  eligibleOnly: boolean;
  /** Digits only, "" = any. */
  pointsMin: string;
  pointsMax: string;
  includeMergedClosed: boolean;
  /** "Earned between" — governs the two dates. */
  earned: boolean;
  earnedFrom: string;
  earnedTo: string;
};

export type ExpiringFilters = {
  lscId: string;
  branch: BranchPick;
  find: string;
  /** As typed; read through `withinDaysOf` (1–365). */
  withinDays: string;
  hasMobile: boolean;
  activeOnly: boolean;
};

export type SchemeSplit = "scheme" | "scheme_branch" | "scheme_month";

export type SchemesFilters = {
  lscId: string;
  branch: BranchPick;
  from: string;
  to: string;
  includeClosedHolding: boolean;
  splitBy: SchemeSplit;
};

export type StatementFilters = { from: string; to: string; showReversals: boolean };

export type AllFilters = { members: MembersFilters; expiring: ExpiringFilters; schemes: SchemesFilters };

export const STATUS_CHOICES: ReadonlyArray<{ value: "" | MemberStatus; label: string }> = [
  { value: "", label: "All" },
  { value: "ACTIVE", label: "ACTIVE" },
  { value: "SUSPENDED", label: "SUSPENDED" },
  { value: "CLOSED", label: "CLOSED" },
  { value: "MERGED", label: "MERGED" },
];

export const SPLIT_CHOICES: ReadonlyArray<{ value: SchemeSplit; label: string }> = [
  { value: "scheme", label: "Scheme" },
  { value: "scheme_branch", label: "Scheme · Branch" },
  { value: "scheme_month", label: "Scheme · Month" },
];

/** The calendar's window, fixed in Qt (`days=90`). */
export const CALENDAR_DAYS = 90;

/** The financial year `today` falls in starts on 1 April (Qt `yearStart`). */
export function yearStartOf(today: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(today);
  if (!match) return today;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return `${month >= 4 ? year : year - 1}-04-01`;
}

/* --------------------------------------------------------------- defaults */

/** The screen's defaults for one tab — at open and on Reset (Qt `resetFilters`). */
export function defaultMembers(today: string): MembersFilters {
  return {
    lscId: "",
    branch: null,
    status: "ACTIVE",
    find: "",
    balanceGtZero: true,
    eligibleOnly: false,
    pointsMin: "",
    pointsMax: "",
    includeMergedClosed: false,
    earned: false,
    earnedFrom: yearStartOf(today),
    earnedTo: today,
  };
}

export function defaultExpiring(): ExpiringFilters {
  return { lscId: "", branch: null, find: "", withinDays: "30", hasMobile: true, activeOnly: true };
}

export function defaultSchemes(today: string): SchemesFilters {
  return {
    lscId: "",
    branch: null,
    from: yearStartOf(today),
    to: today,
    includeClosedHolding: true,
    splitBy: "scheme",
  };
}

export function defaultStatement(today: string): StatementFilters {
  return { from: yearStartOf(today), to: today, showReversals: true };
}

export function defaultFilters(today: string): AllFilters {
  return { members: defaultMembers(today), expiring: defaultExpiring(), schemes: defaultSchemes(today) };
}

/** Qt `QIntValidator(0, 99999999)` on Points min / max: digits only. */
export function digitsOnly(text: string, maxLength = 8): string {
  return text.replace(/\D/g, "").slice(0, maxLength);
}

/** Qt `qBound(1, txtWithinDays->text().toInt(), 365)`. */
export function withinDaysOf(text: string): number {
  const parsed = Number.parseInt(text.trim(), 10);
  const n = Number.isFinite(parsed) ? parsed : 0;
  return Math.min(365, Math.max(1, n));
}

const bool = (value: boolean) => (value ? "true" : "false");

/* ---------------------------------------------------------------- queries */

export type Query = Record<string, string>;

export function membersQuery(companyId: string, f: MembersFilters): Query {
  const q: Query = { companyId };
  if (f.branch) q.branchId = f.branch.id;
  if (f.lscId) q.lscId = f.lscId;
  if (f.status) q.status = f.status;
  const find = f.find.trim();
  if (find) q.search = find;
  q.balanceGtZero = bool(f.balanceGtZero);
  if (f.eligibleOnly) q.eligibleOnly = "true";
  if (f.pointsMin) q.pointsMin = f.pointsMin;
  if (f.pointsMax) q.pointsMax = f.pointsMax;
  if (f.includeMergedClosed) q.includeMergedClosed = "true";
  if (f.earned && isIsoDate(f.earnedFrom) && isIsoDate(f.earnedTo)) {
    q.earnedFrom = f.earnedFrom;
    q.earnedTo = f.earnedTo;
  }
  return q;
}

export function expiringQuery(companyId: string, f: ExpiringFilters): Query {
  const q: Query = { companyId };
  if (f.branch) q.branchId = f.branch.id;
  if (f.lscId) q.lscId = f.lscId;
  const find = f.find.trim();
  if (find) q.search = find;
  q.withinDays = String(withinDaysOf(f.withinDays));
  q.hasMobile = bool(f.hasMobile);
  q.activeOnly = bool(f.activeOnly);
  return q;
}

/** The expiry calendar: the tab's branch and scheme, 90 days. */
export function calendarQuery(companyId: string, f: ExpiringFilters): Query {
  const q: Query = { companyId };
  if (f.branch) q.branchId = f.branch.id;
  if (f.lscId) q.lscId = f.lscId;
  q.days = String(CALENDAR_DAYS);
  return q;
}

export function schemesQuery(companyId: string, f: SchemesFilters): Query {
  const q: Query = { companyId };
  if (f.branch) q.branchId = f.branch.id;
  if (f.lscId) q.lscId = f.lscId;
  q.from = f.from;
  q.to = f.to;
  q.includeClosedHolding = bool(f.includeClosedHolding);
  q.splitBy = f.splitBy;
  return q;
}

/** `…/schemes/monthly` and `…/schemes/gifts` for the scheme under the cursor. */
export function schemeDetailQuery(companyId: string, f: SchemesFilters, lscId: string): Query {
  const q: Query = { companyId };
  if (f.branch) q.branchId = f.branch.id;
  q.lscId = lscId;
  q.from = f.from;
  q.to = f.to;
  return q;
}

export function memberQuery(companyId: string, memberId: string): Query {
  return { companyId, memberId };
}

export function statementQuery(companyId: string, memberId: string, st: StatementFilters): Query {
  const q: Query = { companyId, memberId };
  if (isIsoDate(st.from)) q.from = st.from;
  if (isIsoDate(st.to)) q.to = st.to;
  q.showReversals = bool(st.showReversals);
  return q;
}

/** The scheme pickers' list: every scheme the company's points sit on, this year. */
export function schemeChoicesQuery(companyId: string, today: string): Query {
  return { companyId, from: yearStartOf(today), to: today };
}

export function exportQuery(tab: Tab, companyId: string, filters: AllFilters, format: ExportFormat): Query {
  const base =
    tab === "expiring"
      ? expiringQuery(companyId, filters.expiring)
      : tab === "schemes"
        ? schemesQuery(companyId, filters.schemes)
        : membersQuery(companyId, filters.members);
  const exportTab: ExportTab = tab;
  return { ...base, tab: exportTab, format };
}

/* --------------------------------------------------------- scheme choices */

export type SchemeChoice = { value: string; label: string };

/**
 * The scheme pickers (Qt `loadSchemeChoices`): "All schemes", then every
 * scheme the schemes route lists — a deleted or closed one too, while it
 * holds points. The same name twice gets its code; a deleted one says so.
 */
export function schemeChoicesOf(items: readonly SchemeItem[]): SchemeChoice[] {
  const seen = new Map<string, number>();
  for (const item of items) seen.set(item.schemeName ?? "", (seen.get(item.schemeName ?? "") ?? 0) + 1);
  const choices: SchemeChoice[] = [{ value: "", label: "All schemes" }];
  for (const item of items) {
    let label = item.schemeName ?? "";
    if ((seen.get(label) ?? 0) > 1) label += ` · ${item.schemeCode ?? ""}`;
    if (item.status === "DELETED") label += " (deleted)";
    choices.push({ value: item.lscId ?? "", label });
  }
  return choices;
}

/** A picked scheme that has gone from the list falls back to "All" (Qt `findData` → 0). */
export function keepScheme(lscId: string, choices: readonly SchemeChoice[]): string {
  return lscId && choices.some((c) => c.value === lscId) ? lscId : "";
}

/* ------------------------------------------------------------- the lines */

function schemeWord(lscId: string, choices: readonly SchemeChoice[]): string {
  if (!lscId) return "All";
  return choices.find((c) => c.value === lscId)?.label ?? "All";
}

function branchWord(branch: BranchPick): string {
  return branch ? branch.text : "All";
}

/** The line beside Filter F8: the filters in force, in words (Qt `filterSummary`). */
export function filterSummary(tab: Tab, filters: AllFilters, choices: readonly SchemeChoice[]): string {
  const p: string[] = [];
  if (tab === "expiring") {
    const f = filters.expiring;
    p.push(`Scheme: ${schemeWord(f.lscId, choices)}`, `Branch: ${branchWord(f.branch)}`);
    p.push(`Expiring within ${withinDaysOf(f.withinDays)} days`);
    if (f.hasMobile) p.push("Has mobile");
    if (f.activeOnly) p.push("Active only");
    if (f.find.trim()) p.push(`Find: ${f.find.trim()}`);
  } else if (tab === "schemes") {
    const f = filters.schemes;
    p.push(`Scheme: ${schemeWord(f.lscId, choices)}`, `Branch: ${branchWord(f.branch)}`);
    p.push(`${showDate(f.from)} → ${showDate(f.to)}`);
    p.push(`split by ${SPLIT_CHOICES.find((c) => c.value === f.splitBy)?.label ?? f.splitBy}`);
    if (f.includeClosedHolding) p.push("incl. closed / deleted holding points");
  } else {
    const f = filters.members;
    p.push(`Scheme: ${schemeWord(f.lscId, choices)}`, `Branch: ${branchWord(f.branch)}`);
    p.push(`Status: ${STATUS_CHOICES.find((c) => c.value === f.status)?.label ?? f.status}`);
    if (f.balanceGtZero) p.push("Balance > 0");
    if (f.eligibleOnly) p.push("Eligible for a gift");
    if (f.pointsMin || f.pointsMax) p.push(`Points ${f.pointsMin || "any"} – ${f.pointsMax || "any"}`);
    if (f.earned) p.push(`Earned ${showDate(f.earnedFrom)} → ${showDate(f.earnedTo)}`);
    if (f.includeMergedClosed) p.push("incl. merged / closed");
    if (f.find.trim()) p.push(`Find: ${f.find.trim()}`);
  }
  return p.join("  ·  ");
}

/** `2026-10-31` + 30 → `2026-11-30`, in UTC so no zone moves the day. */
export function addIsoDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + days));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-${String(at.getUTCDate()).padStart(2, "0")}`;
}

/** The line under the title (Qt `refreshSubtitle`). */
export function subtitleOf(tab: Tab, filters: AllFilters, companyName: string, today: string): string {
  const branch =
    tab === "expiring" ? filters.expiring.branch : tab === "schemes" ? filters.schemes.branch : filters.members.branch;
  const parts = [companyName, branch ? branch.text : "All branches"];
  if (tab === "expiring") {
    const days = withinDaysOf(filters.expiring.withinDays);
    parts.push(`lots expiring ${showDate(today)} → ${showDate(addIsoDays(today, days))}`);
  } else if (tab === "schemes") {
    parts.push(`${showDate(filters.schemes.from)} → ${showDate(filters.schemes.to)}`);
  } else {
    parts.push(`as on ${showDate(today)}`);
  }
  return parts.join("  ·  ");
}

/** Days from `from` to `to` (calendar days, UTC). */
export function daysBetween(from: string, to: string): number {
  if (!isIsoDate(from) || !isIsoDate(to)) return 0;
  const [a, b] = [from, to].map((iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000);
}
