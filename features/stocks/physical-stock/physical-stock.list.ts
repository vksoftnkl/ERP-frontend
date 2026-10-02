/**
 * The list menu 45 opens (grid 101) — `TxnDocTypes::physicalStock()` and the
 * shared TxnMainView's period presets, as pure functions.
 */
import { STATUS_CANCELLED, STATUS_DRAFT, STATUS_POSTED } from "./physical-stock.constants";
import type { PhysicalStockDocKey } from "./physical-stock.types";

// ---------------------------------------------------------------------------
// Period presets — each only computes a From/To pair; the two dates stay the
// truth and stay editable, and typing them makes the period "Custom".
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

export function presetLabel(preset: PeriodPreset, daysBack: number): string {
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

function parseIso(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? "").trim());
  if (!match) {
    return null;
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function iso(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * The From/To a preset stands for, anchored on `today` (yyyy-mm-dd). Null for
 * Custom — the operator drives the dates.
 */
export function presetRange(
  preset: PeriodPreset,
  daysBack: number,
  today: string,
): { from: string; to: string } | null {
  const anchor = parseIso(today);
  if (!anchor || preset === "custom") {
    return null;
  }
  let from = anchor;
  let to = anchor;
  switch (preset) {
    case "today":
      break;
    case "yesterday":
      from = addDaysUtc(anchor, -1);
      to = from;
      break;
    case "thisWeek": {
      // Monday. getUTCDay(): Sunday 0 … Saturday 6; Qt's dayOfWeek(): Monday 1 … Sunday 7.
      const dayOfWeek = anchor.getUTCDay() === 0 ? 7 : anchor.getUTCDay();
      from = addDaysUtc(anchor, -(dayOfWeek - 1));
      break;
    }
    case "thisMonth":
      from = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
      break;
    case "lastNDays":
      from = addDaysUtc(anchor, -Math.max(0, daysBack - 1));
      break;
    case "thisQuarter":
      from = new Date(
        Date.UTC(anchor.getUTCFullYear(), Math.floor(anchor.getUTCMonth() / 3) * 3, 1),
      );
      break;
    case "thisYear":
      from = new Date(Date.UTC(anchor.getUTCFullYear(), 0, 1));
      break;
    default:
      break;
  }
  return { from: iso(from), to: iso(to) };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** The Status filter — "All" travels as "", which the SELECT's NULLIF reads as no filter. */
export const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All" },
  { value: STATUS_DRAFT, label: STATUS_DRAFT },
  { value: STATUS_POSTED, label: STATUS_POSTED },
  { value: STATUS_CANCELLED, label: STATUS_CANCELLED },
] as const;

export type ListRow = Record<string, unknown>;

function textOf(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

export function rowStatus(row: ListRow | null | undefined): string {
  return textOf(row?.svh_status).trim().toUpperCase();
}

function isTrue(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  const text = textOf(value).trim().toLowerCase();
  return text === "true" || text === "t" || text === "1" || text === "yes";
}

export function rowIsFrozen(row: ListRow | null | undefined): boolean {
  return isTrue(row?.svh_freeze_stock);
}

/** The document a list row names — the row carries its own tenant and year. */
export function docKeyOfRow(row: ListRow | null | undefined): PhysicalStockDocKey {
  return {
    svhId: textOf(row?.svh_id),
    companyId: textOf(row?.svh_company_id),
    branchId: textOf(row?.svh_branch_id),
    accYear: textOf(row?.svh_acc_year),
  };
}

export type RowPolicy = {
  canEdit: boolean;
  canDelete: boolean;
  canPrint: boolean;
  /** Said in the hint bar — why something is blocked, or what to watch for. */
  reason: string;
};

/**
 * physicalStockRowPolicy. A POSTED sheet is frozen by tr_svh_post_lock and a
 * CANCELLED one is history; neither opens for change, and Enter falls through
 * to the read-only open. A DRAFT that froze its godown is still editable — the
 * note is a warning, because it is holding up everyone else's billing.
 */
export function rowPolicy(row: ListRow | null | undefined): RowPolicy {
  const policy: RowPolicy = { canEdit: true, canDelete: false, canPrint: false, reason: "" };
  const status = rowStatus(row);
  if (status === STATUS_POSTED) {
    policy.canEdit = false;
    policy.reason = "Posted — the variance has moved stock. Cancel it to reverse.";
  } else if (status === STATUS_CANCELLED) {
    policy.canEdit = false;
    policy.reason = "Cancelled — its reversal is part of the history.";
  } else if (rowIsFrozen(row)) {
    policy.reason =
      "Draft with the godown FROZEN — nothing else can move that stock until this is posted or cancelled.";
  }
  return policy;
}

/** The hint bar's sentence about the highlighted row. */
export function rowHint(row: ListRow | null | undefined): string {
  if (!row) {
    return "";
  }
  const policy = rowPolicy(row);
  if (!policy.reason) {
    return "";
  }
  return policy.canEdit ? policy.reason : `${policy.reason}  Enter opens it read-only.`;
}

/** Cancel is live on a DRAFT and on a POSTED sheet; one already cancelled is dead. */
export function canCancelRow(row: ListRow | null | undefined): boolean {
  const status = rowStatus(row);
  return status === STATUS_POSTED || status === STATUS_DRAFT;
}
