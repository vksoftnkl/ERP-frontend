/**
 * The opening stock list — grid 99, "MAIN LIST - OPENING STOCK" — as data:
 * what the grid is asked for, what each row may have done to it, and the period
 * presets of its From / To filter. `TxnDocTypes::openingStock()` and the shared
 * `TxnMainView`, in pure functions.
 */
import { addDays } from "@/features/sales/quotation/quotation.utils";
import { LIST_DEFAULT_DAYS_BACK } from "./opening-stock.constants";
import type { OpeningStockDocKey } from "./opening-stock.types";

// ---------------------------------------------------------------------------
// Period presets — TxnMainView's, anchored on today
// ---------------------------------------------------------------------------

export const PERIOD_PRESETS = [
  "today",
  "yesterday",
  "thisWeek",
  "thisMonth",
  "lastNDays",
  "thisQuarter",
  "thisYear",
  "custom",
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export function periodLabel(preset: PeriodPreset, daysBack = LIST_DEFAULT_DAYS_BACK): string {
  switch (preset) {
    case "today":
      return "Today";
    case "yesterday":
      return "Yesterday";
    case "thisWeek":
      return "This week";
    case "thisMonth":
      return "This month";
    case "lastNDays":
      return `Last ${daysBack} days`;
    case "thisQuarter":
      return "This quarter";
    case "thisYear":
      return "This year";
    default:
      return "Custom";
  }
}

function isoParts(today: string): { year: number; month: number; day: number } {
  const [year, month, day] = today.split("-").map((part) => Number.parseInt(part, 10));
  return { year, month, day };
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * The From / To a preset computes. Each only fills the two dates — they stay the
 * source of truth and stay editable, so a preset is a shortcut for typing them.
 * `custom` returns null: the operator drives the dates.
 */
export function presetRange(
  preset: PeriodPreset,
  today: string,
  daysBack = LIST_DEFAULT_DAYS_BACK,
): { from: string; to: string } | null {
  const { year, month } = isoParts(today);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const yesterday = addDays(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case "thisWeek": {
      // Monday of this week.
      const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
      const sinceMonday = (weekday + 6) % 7;
      return { from: addDays(today, -sinceMonday), to: today };
    }
    case "thisMonth":
      return { from: iso(year, month, 1), to: today };
    case "lastNDays":
      return { from: addDays(today, -Math.max(0, daysBack - 1)), to: today };
    case "thisQuarter":
      return { from: iso(year, Math.floor((month - 1) / 3) * 3 + 1, 1), to: today };
    case "thisYear":
      return { from: iso(year, 1, 1), to: today };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Grid params
// ---------------------------------------------------------------------------

/** A castable uuid, so a pre-context request comes back empty instead of failing the cast. */
export const NO_TENANT_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Grid 99's tokens, every one of them, every time. They are BARE and
 * svh-prefixed (`isvh_company_id`), and the runner substitutes by name — a token
 * left unbound stays in the statement and fails the whole query. The status and
 * both dates travel as "" for "no filter", which the SELECT's NULLIF reads.
 *
 * The company / branch / year trio is not a convenience: stock_voucher is
 * partitioned by acc_year, and a query without it reads every partition.
 */
export function listGridParams(args: {
  companyId: string;
  branchId: string;
  accYear: string;
  fromDate: string;
  toDate: string;
  status: string;
}): Record<string, string> {
  return {
    isvh_company_id: args.companyId || NO_TENANT_ID,
    isvh_branch_id: args.branchId || NO_TENANT_ID,
    isvh_acc_year: args.accYear,
    isvh_from_date: args.fromDate,
    isvh_to_date: args.toDate,
    isvh_status: args.status,
  };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

export function rowStatus(row: Record<string, unknown> | null | undefined): string {
  return text(row?.svh_status).trim().toUpperCase();
}

/**
 * The row's whole key. Grid 99 SELECTs the tenant fields, so a row carries its
 * own company / branch / year — which is what lets a voucher from another year
 * load, save and cancel against the partition it belongs to.
 */
export function docKeyOfRow(
  row: Record<string, unknown>,
  fallback: { companyId: string; branchId: string; accYear: string },
): OpeningStockDocKey {
  return {
    svhId: text(row.svh_id),
    companyId: text(row.svh_company_id) || fallback.companyId,
    branchId: text(row.svh_branch_id) || fallback.branchId,
    accYear: text(row.svh_acc_year).trim() || fallback.accYear,
    refno: text(row.svh_refno),
    status: rowStatus(row),
  };
}

/**
 * What may be done to one voucher, from its own row — `openingStockRowPolicy()`.
 * Only a DRAFT opens for change; a posted one is read and, if wrong, cancelled.
 * There is no delete route, so nothing is ever deleted.
 */
export function rowPolicy(row: Record<string, unknown> | null | undefined): {
  canEdit: boolean;
  reason: string;
} {
  const status = rowStatus(row);
  if (status === "POSTED") {
    return { canEdit: false, reason: "Posted — stock has moved. Cancel it to reverse." };
  }
  if (status === "CANCELLED") {
    return { canEdit: false, reason: "Cancelled — its reversal is part of the history." };
  }
  return { canEdit: true, reason: "" };
}

/** The hint bar's sentence about the highlighted row — and what Enter does instead. */
export function rowHint(row: Record<string, unknown> | null | undefined): string {
  if (!row) {
    return "";
  }
  const policy = rowPolicy(row);
  return policy.reason ? `${policy.reason}  Enter opens it read-only.` : "";
}

/** The list's Cancel is live on a DRAFT and on a POSTED voucher; dead only on one already cancelled. */
export function canCancelRow(row: Record<string, unknown> | null | undefined): boolean {
  const status = rowStatus(row);
  return status === "POSTED" || status === "DRAFT";
}

// ---------------------------------------------------------------------------
// Cancel — what each status means
// ---------------------------------------------------------------------------

/** The confirmation's consequence, by what the document IS. */
export function cancelConsequence(wasPosted: boolean): string {
  return wasPosted
    ? "This writes one reversing ledger row for every row the document posted. Nothing is deleted — the voucher stays in the list as CANCELLED.\n\nIt will be refused if the stock has since been sold."
    : "This draft has moved no stock, so there is nothing to reverse. Nothing is deleted — the document stays in the list as CANCELLED, with the reason against it.";
}

/** What the operator is told once it is done. */
export function cancelledMessage(label: string, wasPosted: boolean): string {
  return wasPosted
    ? `${label} cancelled. Its reversing rows carry the original document date, so an as-on-date report now reads that this document never moved stock.`
    : `${label} cancelled. It was a draft, so no stock ever moved and nothing was reversed.`;
}
