/**
 * Till Reports (menu 288, Sales › Till, till notes 133) — Qt `TillReportsEntry`
 * (NexERP 1d3e203, TILL_DESIGN.md §10; mockups share/till/till_report_
 * {variance,exceptions,approvals,safe_book}_ui_mockup.png, approved
 * 2026-10-17) without the widgets: one read-only screen, four tabs.
 *
 *   Cashier variance   grid 159 per cashier · 160 the picked cashier's sessions
 *   Exceptions         grid 161 per person · 162 by hour · 163 the events
 *   Approver activity  grid 164 per approver · 165 decisions · 166 not decided
 *   Safe book          grid 167 per day · 168 the picked day's lines · 157 remittances
 *
 * Every figure is the registered grid's: the screen only formats, totals the
 * rows it was sent and paints pills. Pickers: dropdown 61 (branches), grids
 * 133 / 136 (counters / safes), 169 (people, by role).
 *
 * Every token of grids 159–169 is QUOTED in their SQL, and a quoted token that
 * is not sent stays a literal word — the grid then compares a date with the
 * text `ifrom_date` and answers nothing, silently. So every builder below
 * sends every token its grid binds, `""` meaning "all".
 *
 * Money is integer paise (`../shared/money.ts`); a figure prints the Qt way —
 * Indian grouping, a TRUE minus (−) for a negative, `+` on a signed column.
 */
import { matchesSearchTokens, searchTokens } from "@/lib/search-text";
import { newestFirst } from "../cash-office/cash-office";
import { addDaysIso, ddmmyyyy, sortRowsBy, textOf } from "../shared/format";
import { formatMoney, toPaise } from "../shared/money";
import { sessionBadgeBucket, type SessionBadgeBucket } from "../shared/session-badges";
import type { GridRow } from "../shared/wire/types";
import type { SessionRow } from "../sessions/session-list";

/** The route this screen is governed by (menu 288, under 271 "Till"). */
export const TILL_REPORTS_HREF = "/sales/till/reports";

// ─── tabs ────────────────────────────────────────────────────────────────────

export type ReportTab = "variance" | "exceptions" | "approvers" | "safe";

export const REPORT_TABS: readonly { value: ReportTab; label: string }[] = [
  { value: "variance", label: "Cashier variance" },
  { value: "exceptions", label: "Exceptions" },
  { value: "approvers", label: "Approver activity" },
  { value: "safe", label: "Safe book" },
];

export function tabLabel(tab: ReportTab): string {
  return REPORT_TABS.find((entry) => entry.value === tab)?.label ?? "";
}

export function isReportTab(value: unknown): value is ReportTab {
  return REPORT_TABS.some((entry) => entry.value === value);
}

/** The Exceptions tab's event codes, in grid 161's column order (Qt `exceptionCodes`). */
export const EXCEPTION_CODES: readonly { code: string; label: string; field: string }[] = [
  { code: "PICKUP", label: "Pickups", field: "pickups" },
  { code: "TOP_UP", label: "Top-ups", field: "top_ups" },
  { code: "SESSION_RECOUNT", label: "Recounts", field: "recounts" },
  { code: "SESSION_FORCE_CLOSE", label: "Force closed", field: "force_closed" },
  { code: "SESSION_REOPEN", label: "Reopens", field: "reopens" },
  { code: "PIN_FAIL", label: "PIN fails", field: "pin_fails" },
  { code: "MOVEMENT_VOIDED", label: "Movement voids", field: "movement_voids" },
  { code: "RETENDER", label: "Re-tenders", field: "retenders" },
  { code: "SESSION_SUSPEND", label: "Suspends", field: "suspends" },
  { code: "OVER_MAX_HOURS", label: "Over max hours", field: "over_hours" },
  { code: "NO_SALE", label: "No sale", field: "no_sales" },
];

export function eventLabel(code: string): string {
  return EXCEPTION_CODES.find((entry) => entry.code === code)?.label ?? "";
}

// ─── filters and the grids' tokens ───────────────────────────────────────────

/** A week to today: the reports read a period (Qt `today.addDays(-6)`). */
export const DEFAULT_DAYS_BACK = 6;

/** The safe book reads at most three months at a time. */
export const SAFE_BOOK_MAX_DAYS = 92;

/** What the filter bar holds; `""` is "all" for every id. */
export type ReportFilters = {
  companyId: string;
  /** `""` = every branch. */
  branchId: string;
  fromDate: string;
  toDate: string;
  counterId: string;
  cashierId: string;
  approverId: string;
  /** An `EXCEPTION_CODES` code, `""` = all (Exceptions only). */
  event: string;
  safeId: string;
  /** Cash + non-cash (grid 159 `inoncash` "1"); Cash only sends "". */
  withNonCash: boolean;
};

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function isIsoDay(value: string): boolean {
  const match = ISO_DAY.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const at = new Date(Date.UTC(y, m - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d;
}

/** Whole days from `from` to `to` (negative when backwards). */
export function daysBetween(from: string, to: string): number {
  if (!isIsoDay(from) || !isIsoDay(to)) return 0;
  const [a, b] = [from, to].map((day) => {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000);
}

/**
 * The period read (Qt `base()`): an unreadable From is today, an unreadable To
 * is From, and a backwards pair is read the right way round.
 */
export function reportRange(fromDate: string, toDate: string, today: string): { from: string; to: string } {
  const from = isIsoDay(fromDate) ? fromDate : today;
  const to = isIsoDay(toDate) ? toDate : from;
  return from <= to ? { from, to } : { from: to, to: from };
}

export function defaultRange(today: string): { fromDate: string; toDate: string } {
  return { fromDate: addDaysIso(today, -DEFAULT_DAYS_BACK), toDate: today };
}

type Params = Record<string, string>;

/** The tokens every report grid shares (159–167); each grid adds its own. */
export function baseParams(filters: ReportFilters, today: string): Params {
  const { from, to } = reportRange(filters.fromDate, filters.toDate, today);
  return {
    icompany_id: filters.companyId,
    ibranch_id: filters.branchId,
    ifrom_date: from,
    ito_date: to,
    icounter_id: filters.counterId,
    ioperator_id: filters.cashierId,
  };
}

/** Grid 159: + `inoncash`. */
export function varianceParams(filters: ReportFilters, today: string): Params {
  return { ...baseParams(filters, today), inoncash: filters.withNonCash ? "1" : "" };
}

/** Grid 160: the picked cashier's sessions. */
export function cashierSessionsParams(filters: ReportFilters, today: string, cashierId: string): Params {
  return { ...baseParams(filters, today), ioperator_id: cashierId };
}

/** Grid 161: it counts every code — the Event filter is the event list's, never the table's. */
export function exceptionsParams(filters: ReportFilters, today: string): Params {
  return { ...baseParams(filters, today), ievent: "" };
}

/** Grid 162: the heat strip follows the Event filter. */
export function exceptionHoursParams(filters: ReportFilters, today: string): Params {
  return { ...baseParams(filters, today), ievent: filters.event };
}

/** Grid 163: the picked person (else the Cashier filter), the Event filter, the hour picked on the strip. */
export function exceptionEventsParams(
  filters: ReportFilters,
  today: string,
  personId: string | null,
  hour: number | null,
): Params {
  return {
    ...baseParams(filters, today),
    ...(personId ? { ioperator_id: personId } : {}),
    ievent: filters.event,
    ihour: hour === null ? "" : String(hour),
  };
}

/** Grids 164 (per approver) and 166 (not decided): the Approver filter. */
export function approverParams(filters: ReportFilters, today: string): Params {
  return { ...baseParams(filters, today), iapprover_id: filters.approverId };
}

/** Grid 165: the picked approver, else the Approver filter. */
export function decisionsParams(filters: ReportFilters, today: string, approverId: string | null): Params {
  return { ...baseParams(filters, today), iapprover_id: approverId || filters.approverId };
}

/** Grid 167: + the safe. */
export function safeDaysParams(filters: ReportFilters, today: string): Params {
  return { ...baseParams(filters, today), isafe_id: filters.safeId };
}

/** Grid 168 binds only these four. */
export function safeDayLinesParams(filters: ReportFilters, day: string): Params {
  return { icompany_id: filters.companyId, ibranch_id: filters.branchId, isafe_id: filters.safeId, iday: day.slice(0, 10) };
}

/** Grid 157 (shared with the Cash Office): no counter or operator token; status "" = all. */
export function remittanceParams(filters: ReportFilters, today: string): Params {
  const { from, to } = reportRange(filters.fromDate, filters.toDate, today);
  return { icompany_id: filters.companyId, ibranch_id: filters.branchId, ifrom_date: from, ito_date: to, istatus: "" };
}

/** Grids 133 / 136: the branch's counters and safes, inactive ones too (an old range names them). */
export function branchPickerParams(companyId: string, branchId: string): Params {
  return { icompany_id: companyId, ibranch_id: branchId, iinactive: "true" };
}

export type PeopleRole = "CASHIER" | "APPROVER";

/** Grid 169: everyone who ran a session (CASHIER) or decided a request (APPROVER). */
export function peopleParams(companyId: string, branchId: string, role: PeopleRole): Params {
  return { icompany_id: companyId, ibranch_id: branchId, irole: role };
}

/** Why the safe book cannot be read as the filters stand, or "". */
export function safeBookProblem(filters: ReportFilters, today: string, safesLoading: boolean): string {
  if (!filters.branchId) return "Pick a branch: the safe book is one safe at a time.";
  if (!filters.safeId) return safesLoading ? "Reading the branch's safes…" : "This branch has no safe.";
  const { from, to } = reportRange(filters.fromDate, filters.toDate, today);
  if (daysBetween(from, to) > SAFE_BOOK_MAX_DAYS) {
    return "The safe book reads at most three months at a time — narrow From / To.";
  }
  return "";
}

// ─── pickers ─────────────────────────────────────────────────────────────────

export type PickerOption = { value: string; label: string };
export type SafeOption = PickerOption & { isDefault: boolean };

export function counterOptions(rows: readonly GridRow[]): PickerOption[] {
  return rows.map((row) => ({ value: textOf(row, "tcn_id"), label: textOf(row, "tcn_code") })).filter((o) => o.value);
}

export function safeOptions(rows: readonly GridRow[]): SafeOption[] {
  return rows
    .map((row) => ({
      value: textOf(row, "tsf_id"),
      label: `${textOf(row, "tsf_code")} · ${textOf(row, "tsf_name")}`,
      isDefault: row.tsf_is_default === true || textOf(row, "tsf_is_default") === "true",
    }))
    .filter((option) => option.value);
}

export function peopleOptions(rows: readonly GridRow[]): PickerOption[] {
  return rows.map((row) => ({ value: textOf(row, "person_id"), label: textOf(row, "person") })).filter((o) => o.value);
}

/**
 * A picker's value once its list has answered: kept while it is listed, else
 * "all" (Qt clears the combo and re-finds the old value). Before the answer
 * the value stands, so a remembered pick is not dropped while the list loads.
 */
export function listedValue(options: readonly PickerOption[], value: string, settled: boolean): string {
  if (!settled || !value) return value;
  return options.some((option) => option.value === value) ? value : "";
}

/** The safe read: the one picked while listed, else the branch's default, else the first. */
export function pickedSafeId(options: readonly SafeOption[], value: string, settled: boolean): string {
  if (!settled) return value;
  if (value && options.some((option) => option.value === value)) return value;
  return (options.find((option) => option.isDefault) ?? options[0])?.value ?? "";
}

// ─── the picked main row ─────────────────────────────────────────────────────

/** Variance: the cashier kept across a reload, else the first (Qt `pick = 0`). */
export function pickVarianceRow(rows: readonly GridRow[], keepId: string): GridRow | null {
  return rows.find((row) => keepId && textOf(row, "cashier_id") === keepId) ?? rows[0] ?? null;
}

/** Exceptions / approvers: the one kept, else nobody — the detail then reads everyone. */
export function pickRowById(rows: readonly GridRow[], field: string, keepId: string): GridRow | null {
  if (!keepId) return null;
  return rows.find((row) => textOf(row, field) === keepId) ?? null;
}

/** Safe book: the day kept, else the last day of the range. */
export function pickSafeDay(rows: readonly GridRow[], keepDay: string): GridRow | null {
  return rows.find((row) => keepDay && textOf(row, "day") === keepDay) ?? rows[rows.length - 1] ?? null;
}

// ─── the order rows are shown in ─────────────────────────────────────────────

/**
 * The time-ordered grids, put back in their SQL's order: the runner wraps the
 * statement, and its ORDER BY is not something to rely on through the wrap
 * (Cash Office, Business Day). The per-person grids (159 / 161 / 164 / 169,
 * ORDER BY the name) keep the server's collation order.
 */
export const ROW_ORDER = {
  sessions: (rows: readonly GridRow[]) => newestFirst(rows, "tss_opened_on"),
  hours: (rows: readonly GridRow[]) => [...rows].sort((a, b) => numberOf(a, "hr") - numberOf(b, "hr")),
  events: (rows: readonly GridRow[]) => newestFirst(rows, "at"),
  decisions: (rows: readonly GridRow[]) => newestFirst(rows, "tap_decided_on"),
  undecided: (rows: readonly GridRow[]) => newestFirst(rows, "tap_requested_on"),
  safeDays: (rows: readonly GridRow[]) => sortRowsBy(rows, "day"),
  dayLines: (rows: readonly GridRow[]) => sortRowsBy(rows, "sb_at"),
  remits: (rows: readonly GridRow[]) => newestFirst(rows, "tcm_created_on"),
} as const;

// ─── numbers and money ───────────────────────────────────────────────────────

/** A figure the grid sent, or null when it sent nothing (null / blank). Counts arrive as strings. */
function figureOf(row: GridRow | null | undefined, key: string): number | null {
  const value = row?.[key];
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = Number(text.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberOf(row: GridRow | null | undefined, key: string): number {
  return figureOf(row, key) ?? 0;
}

/**
 * Qt `money(v, sign)`: Indian grouping, a TRUE minus for a negative, `+` on a
 * signed column when positive.
 */
export function moneyText(paise: number, signed = false): string {
  if (paise < 0) return `−${formatMoney(-paise)}`;
  return `${signed && paise > 0 ? "+" : ""}${formatMoney(paise)}`;
}

// ─── columns ─────────────────────────────────────────────────────────────────

/** How a column's cells are written (Qt `Kind`). */
export type ColumnKind = "text" | "count" | "money" | "signed" | "hours";

export type ReportColumn = {
  key: string;
  title: string;
  kind: ColumnKind;
  /** Summed on the totals row. */
  total?: boolean;
  /** The heading's tooltip. */
  tip?: string;
};

function col(key: string, title: string, kind: ColumnKind = "text", total = false, tip?: string): ReportColumn {
  return { key, title, kind, ...(total ? { total } : {}), ...(tip ? { tip } : {}) };
}

export function isNumericColumn(column: ReportColumn): boolean {
  return column.kind !== "text";
}

export const VARIANCE_COLUMNS: readonly ReportColumn[] = [
  col("cashier", "Cashier"),
  col("sessions", "Sessions", "count", true),
  col("hours", "Hours", "hours", true),
  col("net_sales", "Net sales", "money", true),
  col("short_n", "Short", "count", true),
  col("short_amt", "Short ₹", "signed", true),
  col("excess_n", "Excess", "count", true),
  col("excess_amt", "Excess ₹", "signed", true),
  col("net_variance", "Net variance", "signed", true),
  col("per_lakh", "Per ₹1L", "signed"),
  col("recounts", "Recounts", "count", true),
  col("force_closed", "Force closed", "count", true),
  col("noncash_gap", "Non-cash gap", "signed", true),
  col("pending", "Pending", "count", true),
  col("treatments", "Treatment"),
];

export const SESSION_COLUMNS: readonly ReportColumn[] = [
  col("tss_session_no", "Session"),
  col("business_date", "Date"),
  col("counter_code", "Counter"),
  col("hours", "Hours", "hours"),
  col("net_sales", "Net sales", "money"),
  col("cash_expected", "Cash expected", "money"),
  col("cash_counted", "Counted", "money"),
  col("cash_variance", "Variance", "signed"),
  col("attempts", "Attempts", "count"),
  col("treatment", "Treatment"),
  col("decided_by", "Decided by"),
  col("status_text", "Status"),
  col("note", "Note"),
];

export const EXCEPTION_COLUMNS: readonly ReportColumn[] = [
  col("person", "Cashier"),
  ...EXCEPTION_CODES.map((entry) =>
    col(
      entry.field,
      entry.label,
      "count",
      true,
      entry.code === "NO_SALE" ? "Written by the Counter screen's No sale key (not built yet)." : undefined,
    ),
  ),
  col("total", "Total", "count", true),
];

export const EVENT_COLUMNS: readonly ReportColumn[] = [
  col("at_text", "When"),
  col("session_no", "Session"),
  col("counter_code", "Counter"),
  col("person", "Cashier"),
  col("event_code", "Event"),
  col("amount", "Amount", "money"),
  col("device", "Device"),
  col("detail", "Detail"),
];

export const APPROVER_COLUMNS: readonly ReportColumn[] = [
  col("approver", "Approver"),
  col("level", "Level (grant)"),
  col("decided", "Decided", "count", true),
  col("approved", "Approved", "count", true),
  col("recounts", "Recount", "count", true),
  col("rejected", "Rejected", "count", true),
  col("amount_approved", "Amount approved", "money", true),
  col("largest", "Largest", "money"),
  col(
    "own_session",
    "Own session",
    "count",
    true,
    "Decisions on the approver's own till session — allowed per company by Approval Rules 'Allow self'.",
  ),
  col("median_wait", "Median wait"),
  col("by_event", "By event"),
];

export const DECISION_COLUMNS: readonly ReportColumn[] = [
  col("decided_at", "Decided"),
  col("event_code", "Event"),
  col("ref", "Session / doc"),
  col("requested_by", "Requested by"),
  col("amount", "Amount", "money"),
  col("decision", "Decision"),
  col("wait", "Wait"),
  col("channel", "Channel"),
  col("own", "Own"),
  col("note", "Note"),
];

export const SAFE_DAY_COLUMNS: readonly ReportColumn[] = [
  col("day_text", "Date"),
  col("opening", "Opening", "money"),
  col("from_tills", "From tills", "money", true),
  col("floats_out", "Floats out", "money", true),
  col("topups_out", "Top-ups out", "money", true),
  col("remitted", "Remitted", "money", true),
  col("other", "Other", "signed", true),
  col("book_closing", "Book closing", "money"),
  col("counted", "Safe count", "money"),
  col("diff", "Difference", "signed", true),
  col("bags_awaiting", "Bags awaiting", "count"),
  col("bag_diff", "Bag diff.", "signed", true),
  col("limit_flag", "Limit"),
];

export const DAY_LINE_COLUMNS: readonly ReportColumn[] = [
  col("at_text", "Time"),
  col("doc_no", "Doc"),
  col("kind", "Kind"),
  col("who", "Session · who"),
  col("money_in", "In", "money"),
  col("money_out", "Out", "money"),
  col("balance", "Balance", "money"),
];

export const REMIT_COLUMNS: readonly ReportColumn[] = [
  col("tcm_doc_no", "Doc"),
  col("rm_date", "Date"),
  col("rm_mode", "Mode"),
  col("rm_amount", "Amount", "money", true),
  col("rm_status", "Status"),
  col("rm_age", "Age"),
];

/** A cell's text (Qt `cellText`): a count of 0 is blank, a missing figure is blank. */
export function cellText(column: ReportColumn, row: GridRow): string {
  switch (column.kind) {
    case "text":
      return textOf(row, column.key);
    case "count": {
      const value = figureOf(row, column.key);
      return value === null || value === 0 ? "" : String(Math.round(value));
    }
    case "hours": {
      const value = figureOf(row, column.key);
      return value === null ? "" : value.toFixed(1);
    }
    case "money":
    case "signed": {
      const paise = toPaise(row[column.key]);
      return paise === null ? "" : moneyText(paise, column.kind === "signed");
    }
  }
}

// ─── pills ───────────────────────────────────────────────────────────────────

/** The house pill tones; slate is Qt's Locked bucket. */
export type PillTone = "green" | "amber" | "red" | "blue" | "grey" | "slate";

export type Pill = { text: string; tone: PillTone };

const BUCKET_TONES: Record<SessionBadgeBucket, PillTone> = {
  success: "green",
  progress: "blue",
  neutral: "grey",
  warning: "amber",
  danger: "red",
  locked: "slate",
};

export function bucketTone(bucket: SessionBadgeBucket): PillTone {
  return BUCKET_TONES[bucket];
}

/**
 * Qt `TxnBadgePalette::styleFor`'s vocabulary — normalised to letters and
 * digits, the most specific bucket first (VOID before everything, PENDING
 * before the OPEN inside PENDINGAPPROVAL…). Qt hashes an unmatched word to a
 * stable hue of its own; the web has no such hues, so it is a grey pill.
 */
const PALETTE_WORDS: readonly (readonly [SessionBadgeBucket, readonly string[]])[] = [
  ["danger", ["CANCELLED", "CANCELED", "REJECTED", "VOID", "FAILED", "BOUNCED", "RETURNED", "REVERSED", "DELETED"]],
  ["locked", ["FILED", "GSTR", "IRN", "EINVOICE", "LOCKED", "CLOSED", "POSTED", "FROZEN", "AUDITED"]],
  ["warning", ["UNVERIFIED", "PENDING", "EXPIRED", "OVERDUE", "HOLD", "HELD", "AWAITING", "DUE", "REVISED", "NARRATION"]],
  ["progress", ["PART", "SENT", "OPEN", "PROGRESS", "INVOICED", "BILLED", "SHIPPED", "DISPATCH", "PRINTED", "SUBMITTED"]],
  [
    "success",
    ["ACCEPTED", "APPROVED", "CONVERTED", "PAID", "COMPLETED", "DELIVERED", "VERIFIED", "SETTLED", "EDITABLE", "ACTIVE", "YES"],
  ],
  ["neutral", ["DRAFT", "NEW", "NONE", "NO"]],
];

export function paletteBucket(text: string): SessionBadgeBucket {
  const key = text.toUpperCase().replace(/[^\p{L}\p{N}]/gu, "");
  if (!key) return "neutral";
  for (const [bucket, words] of PALETTE_WORDS) {
    if (words.some((word) => key.includes(word))) return bucket;
  }
  return "neutral";
}

function pill(text: string, tone: PillTone): Pill[] {
  return text ? [{ text, tone }] : [];
}

/** A treatment word in the till's own colours: "EXPENSE 3" is EXPENSE's (Qt `treatmentStyle`). */
export function treatmentTone(text: string): PillTone {
  const word = text.trim().toUpperCase().replace(/[\d\s]+$/, "");
  return bucketTone(sessionBadgeBucket(word) ?? paletteBucket(word));
}

/** A session status (`status_text`), as the Sessions list draws it. */
export function statusTone(text: string): PillTone {
  return bucketTone(sessionBadgeBucket(text) ?? paletteBucket(text));
}

/** Grid 163's event code: a red flag, a cash movement, or something to look at. */
export function eventCodeTone(code: string): PillTone {
  switch (code) {
    case "PIN_FAIL":
    case "SESSION_FORCE_CLOSE":
    case "MOVEMENT_VOIDED":
    case "OVER_MAX_HOURS":
      return "red";
    case "PICKUP":
    case "TOP_UP":
    case "RETENDER":
      return "blue";
    default:
      return "amber";
  }
}

/**
 * A remittance's status. Qt paints it through the palette, which knows only
 * VOIDED (red) and hashes the rest to hues the web does not have; here the
 * Cash Office's reading: on the way amber, with the bank green.
 */
export function remitStatusTone(text: string): PillTone {
  switch (text.trim().toUpperCase().replace(/_/g, " ")) {
    case "IN TRANSIT":
      return "amber";
    case "CONFIRMED":
    case "DEPOSITED":
      return "green";
    default:
      return bucketTone(paletteBucket(text));
  }
}

type PillRule = (key: string, row: GridRow) => Pill[];

const positive = (row: GridRow, key: string) => numberOf(row, key) > 0;

const variancePills: PillRule = (key, row) => {
  if (key === "treatments") {
    return textOf(row, "treatments")
      .split(" · ")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => ({ text: part, tone: treatmentTone(part) }));
  }
  if (key === "force_closed" && positive(row, key)) return pill(textOf(row, key), "red");
  if (key === "pending" && positive(row, key)) return pill(textOf(row, key), "amber");
  return [];
};

const sessionPills: PillRule = (key, row) => {
  if (key === "treatment") return pill(textOf(row, key), treatmentTone(textOf(row, key)));
  if (key === "status_text") return pill(textOf(row, key), statusTone(textOf(row, key)));
  return [];
};

const exceptionPills: PillRule = (key, row) => {
  if ((key === "force_closed" || key === "over_hours") && positive(row, key)) return pill(textOf(row, key), "red");
  if (key === "pin_fails" && numberOf(row, key) >= 3) return pill(textOf(row, key), "red");
  return [];
};

const eventPills: PillRule = (key, row) =>
  key === "event_code" ? pill(textOf(row, key), eventCodeTone(textOf(row, key))) : [];

const approverPills: PillRule = (key, row) => {
  if (key === "level" && textOf(row, key) !== "—") return pill(textOf(row, key), "blue");
  if (key === "own_session" && positive(row, key)) return pill(textOf(row, key), "amber");
  if (key === "rejected" && positive(row, key)) return pill(textOf(row, key), "red");
  return [];
};

const decisionPills: PillRule = (key, row) => {
  if (key === "decision") {
    const decision = textOf(row, key);
    return pill(decision, decision === "APPROVED" ? "green" : decision === "RECOUNT" ? "amber" : "red");
  }
  if (key === "own") return pill(textOf(row, key), "amber");
  return [];
};

const safeDayPills: PillRule = (key, row) => {
  if (key === "limit_flag") return pill(textOf(row, key), "red");
  if (key === "bags_awaiting" && positive(row, key)) return pill(textOf(row, key), "blue");
  return [];
};

const dayLinePills: PillRule = (key, row) => {
  if (key !== "kind") return [];
  if (textOf(row, "cat") === "SAFE_COUNT") return pill("SAFE COUNT", "amber");
  const kind = textOf(row, "kind");
  return kind.endsWith(" VOID") ? pill(kind, "red") : [];
};

const remitPills: PillRule = (key, row) =>
  key === "rm_status" ? pill(textOf(row, key), remitStatusTone(textOf(row, key))) : [];

// ─── tables ──────────────────────────────────────────────────────────────────

export type CellView = {
  text: string;
  numeric: boolean;
  /** A signed figure: short red, excess green (and bold). */
  tone: "" | "red" | "green";
  pills: readonly Pill[];
};

export type RowView = {
  key: string;
  /** The grid row; null on the totals row. */
  row: GridRow | null;
  cells: readonly CellView[];
  total: boolean;
};

export type TableView = { columns: readonly ReportColumn[]; rows: readonly RowView[] };

function signTone(paise: number | null): "" | "red" | "green" {
  if (paise === null || paise === 0) return "";
  return paise < 0 ? "red" : "green";
}

function bodyCell(column: ReportColumn, row: GridRow, pills: PillRule | undefined): CellView {
  return {
    text: cellText(column, row),
    numeric: isNumericColumn(column),
    tone: column.kind === "signed" ? signTone(toPaise(row[column.key])) : "",
    pills: pills ? pills(column.key, row) : [],
  };
}

type TableOptions = {
  rowKey: (row: GridRow, index: number) => string;
  pills?: PillRule;
  /** The totals row's first cell; no caption, no totals row (and none under an empty table). */
  totalsCaption?: (count: number) => string;
};

/** Qt `fillTable`: the rows and, given a caption, a totals row summing the columns marked total. */
export function buildTable(columns: readonly ReportColumn[], rows: readonly GridRow[], options: TableOptions): TableView {
  const body: RowView[] = rows.map((row, index) => ({
    key: options.rowKey(row, index),
    row,
    cells: columns.map((column) => bodyCell(column, row, options.pills)),
    total: false,
  }));
  if (!options.totalsCaption || rows.length === 0) return { columns, rows: body };

  const cells: CellView[] = columns.map((column, index) => {
    const numeric = isNumericColumn(column);
    if (index === 0) return { text: options.totalsCaption?.(rows.length) ?? "", numeric, tone: "", pills: [] };
    if (!column.total) return { text: "", numeric, tone: "", pills: [] };
    switch (column.kind) {
      case "count": {
        const sum = rows.reduce((acc, row) => acc + numberOf(row, column.key), 0);
        return { text: String(Math.round(sum)), numeric, tone: "", pills: [] };
      }
      case "hours": {
        const tenths = rows.reduce((acc, row) => acc + Math.round(numberOf(row, column.key) * 10), 0);
        return { text: (tenths / 10).toFixed(1), numeric, tone: "", pills: [] };
      }
      case "money":
      case "signed": {
        const paise = rows.reduce((acc, row) => acc + (toPaise(row[column.key]) ?? 0), 0);
        const signed = column.kind === "signed";
        return { text: moneyText(paise, signed), numeric, tone: signed ? signTone(paise) : "", pills: [] };
      }
      default:
        return { text: "", numeric, tone: "", pills: [] };
    }
  });
  return { columns, rows: [...body, { key: "__total", row: null, cells, total: true }] };
}

/** The totals row with one cell rewritten (a figure that is not a sum). */
function withTotalCell(table: TableView, key: string, text: string, tone: CellView["tone"] = ""): TableView {
  const at = table.columns.findIndex((column) => column.key === key);
  if (at < 0) return table;
  return {
    ...table,
    rows: table.rows.map((row) =>
      row.total ? { ...row, cells: row.cells.map((cell, index) => (index === at ? { ...cell, text, tone } : cell)) } : row,
    ),
  };
}

/** `1 cashier`, `2 cashiers` — Qt's `%n cashier(s)`. */
export function countLabel(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

const byField = (field: string) => (row: GridRow, index: number) => textOf(row, field) || `#${index}`;
const byIndex = (_row: GridRow, index: number) => String(index);

/**
 * Cashier variance (grid 159). The totals row's per ₹1 lakh is the whole
 * range's — net variance ÷ net sales × 1,00,000 over every cashier — not a sum.
 */
export function varianceTable(rows: readonly GridRow[]): TableView {
  const table = buildTable(VARIANCE_COLUMNS, rows, {
    rowKey: byField("cashier_id"),
    pills: variancePills,
    totalsCaption: (n) => countLabel(n, "cashier"),
  });
  const net = rows.reduce((acc, row) => acc + (toPaise(row.net_variance) ?? 0), 0);
  const sales = rows.reduce((acc, row) => acc + (toPaise(row.net_sales) ?? 0), 0);
  if (rows.length === 0 || sales <= 0) return table;
  const perLakh = Math.round((net / sales) * 10_000_000);
  return withTotalCell(table, "per_lakh", moneyText(perLakh, true), signTone(perLakh));
}

/** The picked cashier's sessions (grid 160). */
export function sessionsTable(rows: readonly GridRow[]): TableView {
  return buildTable(SESSION_COLUMNS, rows, { rowKey: byField("tss_id"), pills: sessionPills });
}

/** Exceptions per person (grid 161). */
export function exceptionsTable(rows: readonly GridRow[]): TableView {
  return buildTable(EXCEPTION_COLUMNS, rows, {
    rowKey: byField("person_id"),
    pills: exceptionPills,
    totalsCaption: (n) => countLabel(n, "person", "people"),
  });
}

/** The events (grid 163): no id of their own, so a row's place is its key. */
export function eventsTable(rows: readonly GridRow[]): TableView {
  return buildTable(EVENT_COLUMNS, rows, { rowKey: byIndex, pills: eventPills });
}

/** Approver activity (grid 164). */
export function approversTable(rows: readonly GridRow[]): TableView {
  return buildTable(APPROVER_COLUMNS, rows, {
    rowKey: byField("approver_id"),
    pills: approverPills,
    totalsCaption: (n) => countLabel(n, "approver"),
  });
}

/** The decisions (grid 165). */
export function decisionsTable(rows: readonly GridRow[]): TableView {
  return buildTable(DECISION_COLUMNS, rows, { rowKey: byField("tap_id"), pills: decisionPills });
}

/**
 * The safe book per day (grid 167). The totals row: the range's FIRST opening
 * and its LAST closing (book closing + that day's difference), not sums.
 */
export function safeDaysTable(rows: readonly GridRow[]): TableView {
  const table = buildTable(SAFE_DAY_COLUMNS, rows, {
    rowKey: byField("day"),
    pills: safeDayPills,
    totalsCaption: (n) => countLabel(n, "day"),
  });
  if (rows.length === 0) return table;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const opening = withTotalCell(table, "opening", moneyText(toPaise(first.opening) ?? 0));
  const closing = (toPaise(last.book_closing) ?? 0) + (toPaise(last.diff) ?? 0);
  return withTotalCell(opening, "book_closing", moneyText(closing));
}

/** The picked day's lines (grid 168). */
export function dayLinesTable(rows: readonly GridRow[]): TableView {
  return buildTable(DAY_LINE_COLUMNS, rows, { rowKey: byIndex, pills: dayLinePills });
}

/** Age: on the way for n days, or the bank's credit date (`bank 17-10`). */
export function remitAge(row: GridRow): string {
  if (textOf(row, "rm_status") === "IN TRANSIT") return countLabel(Math.round(numberOf(row, "rm_age")), "day");
  const bankDate = textOf(row, "rm_bank_date");
  return bankDate ? `bank ${bankDate.slice(0, 5)}` : "";
}

/** The branch's remittances (grid 157), raised against bank-credited. */
export function remitsTable(rows: readonly GridRow[]): TableView {
  const shown = rows.map((row) => ({ ...row, rm_age: remitAge(row) }));
  return buildTable(REMIT_COLUMNS, shown, {
    rowKey: byField("tcm_id"),
    pills: remitPills,
    totalsCaption: (n) => countLabel(n, "remittance"),
  });
}

/**
 * Search narrows the rows already loaded (Qt `applySearch`): every typed word
 * has to be found in some cell's text (or pill) — the app's loose rule, so
 * `pin fail` finds PIN_FAIL. The totals row always stays.
 */
export function searchTable(table: TableView, needle: string): TableView {
  const tokens = searchTokens(needle);
  if (tokens.length === 0) return table;
  return {
    ...table,
    rows: table.rows.filter(
      (row) =>
        row.total ||
        matchesSearchTokens(tokens, ...row.cells.flatMap((cell) => [cell.text, ...cell.pills.map((p) => p.text)])),
    ),
  };
}

/** A cell as print and export write it: its text, else its pills' (Qt `tableHtml` / `exportTab`). */
export function cellOutputText(cell: CellView): string {
  return cell.text || cell.pills.map((entry) => entry.text).join(" · ");
}

// ─── heads, hints and bands ──────────────────────────────────────────────────

export const VARIANCE_HINT =
  "short / excess = any cash difference at close · per ₹1 lakh = net variance ÷ net sales × 1,00,000";
export const HOURS_HINT = "By hour — darker = more events in that hour · click an hour to list its events";
export const REMIT_HEAD = "Remittance register — raised vs bank-credited";
export const SUBTITLE = "Read-only · supervisors and above — the figures are not blind.";
export const SEARCH_PLACEHOLDER = "cashier / session / doc no";

/** Above the picked cashier's sessions. */
export function sessionsHead(cashier: string | null, varianceEmpty: boolean): string {
  if (varianceEmpty) return "No till session in this range.";
  if (cashier === null) return "";
  return `${cashier} — every session in the range · Enter opens the Session Cockpit · Ctrl+H its history`;
}

/** `10 AM` — Qt `QTime(hr, 0).toString("h AP")`. */
export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
}

/** Above the events: whose, which, when — and how many. */
export function eventsHead(person: string | null, event: string, hour: number | null, count: number): string {
  const whom = person || "Everyone";
  const what = event ? eventLabel(event) || event : "every exception";
  const when = hour === null ? "" : ` · ${hourLabel(hour)} hour`;
  return `${whom} · ${what}${when} — ${countLabel(count, "event")} · Enter opens the session's Cockpit`;
}

export function decisionsHead(approver: string | null, count: number): string {
  return `${approver || "Everyone"} — ${countLabel(count, "decision")} · Enter opens the request's session (Cockpit)`;
}

export function dayHead(day: GridRow | null): string {
  if (!day) return "";
  return `${textOf(day, "day_text")} — the day's lines · opening ${moneyText(toPaise(day.opening) ?? 0)}`;
}

/** The not-decided band under the approvers (grid 166): amber while any wait, green when none. */
export function undecidedLine(rows: readonly GridRow[]): { text: string; tone: "amber" | "green" } {
  if (rows.length === 0) return { text: "Every request in the range was decided.", tone: "green" };
  let expired = 0;
  const parts: string[] = [];
  for (const row of rows) {
    const isExpired = textOf(row, "tap_status") === "EXPIRED";
    if (isExpired) expired += 1;
    if (parts.length < 4) {
      const waited = textOf(row, "waited");
      parts.push(
        `${isExpired ? "expired" : "pending"} ${textOf(row, "event_code")} ${moneyText(toPaise(row.amount) ?? 0)} ` +
          `(${textOf(row, "ref")}, ${textOf(row, "requested_at")} · ${isExpired ? "waited" : "waiting"} ${waited})`,
      );
    }
  }
  const pending = rows.length - expired;
  return {
    text:
      `NOT DECIDED — ${countLabel(rows.length, "request")}: ${expired} expired, ${pending} still pending.  ` +
      parts.join(" · "),
    tone: "amber",
  };
}

/** Under the safe book: its insured limit, and what Opening means. */
export function safeHint(rows: readonly GridRow[]): string {
  const limit = rows.length > 0 ? (toPaise(rows[0].tsf_insured_limit) ?? 0) : 0;
  const head =
    limit > 0
      ? `Insured limit ${moneyText(limit)} (safe master) · a day is OVER LIMIT when the safe held more than that before its remittance left. `
      : "No insured limit on this safe. ";
  return `${head}Opening = the last safe count + what moved after it; next opening = book closing + difference.`;
}

/** Under the remittances: what is still on the way. */
export function remitHint(rows: readonly GridRow[]): string {
  const inTransit = rows
    .filter((row) => textOf(row, "rm_status") === "IN TRANSIT")
    .reduce((acc, row) => acc + (toPaise(row.rm_amount) ?? 0), 0);
  return (
    `In transit ${moneyText(inTransit)} — handed to the CIT agency, not yet credited by the bank. ` +
    "CONFIRMED when Remit confirm (Cash Office) books the bank date and amount."
  );
}

// ─── the heat strip ──────────────────────────────────────────────────────────

export type HourCell = {
  hour: number;
  count: number;
  /** 0 … 1: this hour's share of the busiest hour — the shade. */
  heat: number;
  label: string;
  tip: string;
};

/**
 * One button per hour from 8 AM to 10 PM — wider when an event fell outside —
 * shaded by its count against the busiest hour (Qt `fillHours`). The heat is
 * data, not theme: each hour its own shade.
 */
export function hourStrip(rows: readonly GridRow[]): HourCell[] {
  const counts = new Map<number, number>();
  let lo = 8;
  let hi = 22;
  let top = 0;
  for (const row of rows) {
    const hour = Math.round(numberOf(row, "hr"));
    const count = Math.round(numberOf(row, "events"));
    counts.set(hour, count);
    lo = Math.min(lo, hour);
    hi = Math.max(hi, hour);
    top = Math.max(top, count);
  }
  const cells: HourCell[] = [];
  for (let hour = lo; hour <= hi; hour += 1) {
    const count = counts.get(hour) ?? 0;
    const label = hourLabel(hour);
    cells.push({
      hour,
      count,
      heat: top > 0 ? count / top : 0,
      label,
      tip: `${countLabel(count, "event")} between ${label} and ${hourLabel(hour + 1)} — click to list them`,
    });
  }
  return cells;
}

/** Past this share the shade is dark enough for white text (Qt 0.55). */
export const HEAT_WHITE_TEXT = 0.55;

// ─── the session a detail row names ──────────────────────────────────────────

/**
 * The session a detail row names — 160's own, 163's, 165's — with its own
 * tenant key, for the Cockpit (Enter) and its journal (Ctrl+H). Null when the
 * row names none (168's lines never do).
 */
export function sessionTarget(row: GridRow | null | undefined): SessionRow | null {
  const tssId = textOf(row, "tss_id");
  if (!row || !tssId) return null;
  return {
    key: {
      companyId: textOf(row, "tss_company_id"),
      branchId: textOf(row, "tss_branch_id"),
      accYear: textOf(row, "tss_acc_year"),
      tssId,
    },
    sessionNo: textOf(row, "tss_session_no") || textOf(row, "session_no") || textOf(row, "ref"),
    status: textOf(row, "status_text").replace(/ /g, "_"),
    cashier: textOf(row, "cashier") || textOf(row, "person") || textOf(row, "requested_by"),
    counterCode: textOf(row, "counter_code"),
    businessDate: textOf(row, "business_date"),
  };
}

export const OPEN_TIP_ON = "Open this session's cockpit (read the figures, approve, re-tender)";
export const OPEN_TIP_OFF = "Pick a row below that names a session";

// ─── print and export ────────────────────────────────────────────────────────

export type ReportSection = { caption: string; table: TableView };

/** `Till Reports — Cashier variance · 11-10-2026 to 17-10-2026 · Every branch`. */
export function printTitle(tab: ReportTab, fromDate: string, toDate: string, branchText: string): string {
  return `Till Reports — ${tabLabel(tab)} · ${ddmmyyyy(fromDate)} to ${ddmmyyyy(toDate)} · ${branchText}`;
}

/** `till-cashier-variance-2026-10-17.csv`. */
export function exportFileName(tab: ReportTab, toDate: string): string {
  return `till-${tabLabel(tab).toLowerCase().replace(/ /g, "-")}-${toDate}.csv`;
}

function csvField(text: string): string {
  return `"${text.replace(/−/g, "-").replace(/"/g, '""')}"`;
}

/**
 * The tab's tables as CSV (Qt `exportTab`): each its heading row, the rows the
 * search left and the totals, then a blank line; every field quoted, the true
 * minus written as "-". A byte-order mark leads, so a spreadsheet reads ₹ right.
 */
export function csvText(tables: readonly TableView[]): string {
  const lines: string[] = [];
  for (const table of tables) {
    lines.push(table.columns.map((column) => csvField(column.title)).join(","));
    for (const row of table.rows) lines.push(row.cells.map((cell) => csvField(cellOutputText(cell))).join(","));
    lines.push("");
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

function html(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function tableHtml(section: ReportSection): string {
  const head = section.table.columns
    .map((column) => `<th${isNumericColumn(column) ? ' class="r"' : ""}>${html(column.title)}</th>`)
    .join("");
  const body = section.table.rows
    .map((row) => {
      const cells = row.cells
        .map((cell) => `<td${cell.numeric ? ' class="r"' : ""}>${html(cellOutputText(cell))}</td>`)
        .join("");
      return `<tr${row.total ? ' class="t"' : ""}>${cells}</tr>`;
    })
    .join("");
  return `<h3>${html(section.caption)}</h3><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** The printable page of the tab (Qt `printTab`): landscape, the title, then each table under its caption. */
export function printDocument(title: string, sections: readonly ReportSection[]): string {
  const style =
    "@page{size:A4 landscape;margin:10mm}" +
    "body{font:8pt Arial,Helvetica,sans-serif;color:#000;margin:0}" +
    "h2{font-size:11pt;margin:0 0 6px}h3{font-size:9pt;margin:10px 0 4px}" +
    "table{width:100%;border-collapse:collapse}" +
    "th,td{border:1px solid #888;padding:2px 4px;text-align:left;vertical-align:top}" +
    "th{background:#eee}.r{text-align:right}tr.t td{font-weight:bold;background:#f4f4f4}" +
    "thead{display:table-header-group}tr{break-inside:avoid}";
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${html(title)}</title><style>${style}</style></head>` +
    `<body><h2>${html(title)}</h2>${sections.map(tableHtml).join("")}</body></html>`
  );
}

// ─── back from the Cockpit ───────────────────────────────────────────────────

/**
 * What the screen showed when Enter took it to a Cockpit. Qt opens the Cockpit
 * as a dialog over the report; here it is a route, so the report is left —
 * and on the way back it comes up as it was (tab, filters, picks).
 */
export type ReportView = {
  tab: ReportTab;
  branch: { id: string; text: string } | null;
  fromDate: string;
  toDate: string;
  counterId: string;
  cashierId: string;
  approverId: string;
  event: string;
  safeId: string;
  withNonCash: boolean;
  search: string;
  picks: ReportPicks;
};

/** The main rows picked, by id (`""` = none), and the hour picked on the strip. */
export type ReportPicks = { cashier: string; person: string; approver: string; day: string; hour: number | null };

export const NO_PICKS: ReportPicks = { cashier: "", person: "", approver: "", day: "", hour: null };

const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** A stored view, checked field by field; null when it is not one. */
export function parseReportView(raw: unknown): ReportView | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (!isReportTab(value.tab)) return null;
  const branch = value.branch as Record<string, unknown> | null | undefined;
  const picks = (value.picks ?? {}) as Record<string, unknown>;
  const hour = typeof picks.hour === "number" && Number.isInteger(picks.hour) ? picks.hour : null;
  return {
    tab: value.tab,
    branch: branch && str(branch.id) ? { id: str(branch.id), text: str(branch.text) } : null,
    fromDate: str(value.fromDate),
    toDate: str(value.toDate),
    counterId: str(value.counterId),
    cashierId: str(value.cashierId),
    approverId: str(value.approverId),
    event: EXCEPTION_CODES.some((entry) => entry.code === value.event) ? str(value.event) : "",
    safeId: str(value.safeId),
    withNonCash: value.withNonCash === true,
    search: str(value.search),
    picks: {
      cashier: str(picks.cashier),
      person: str(picks.person),
      approver: str(picks.approver),
      day: str(picks.day),
      hour,
    },
  };
}
