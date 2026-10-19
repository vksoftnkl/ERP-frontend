/**
 * Till Sessions (S6, menu 273) — Qt `TxnDocTypes::tillSessions()`: every
 * session of the branch over a business-date range, for supervisors —
 * expected, counted and the variance are shown here, never on the cashier's
 * blind screens. Grid 144 "MAIN LIST - TILL SESSIONS"; Ctrl+H = grid 145
 * (till_event). No Add: a session is opened at a till (S1), never from a list.
 *
 * Grid 144 binds every token QUOTED — `'icompany_id'`, `'ibranch_id'`,
 * `'ifrom_date'`, `'ito_date'`, `'istatus'`, `'ivariance'` — and a quoted token
 * that is not sent stays a literal word: the date filter then compares a date
 * with the text `ifrom_date` and the list is silently EMPTY. All six are
 * always sent, "" meaning "no bound".
 *
 * Qt c77f3f1: the Variance filter gains TO_APPROVE (notes 114 — the cash
 * awaiting Approve Cash; grid 144 tests it on its `cash_receipt` value), and
 * `cash_receipt` is the third pill column; the pill colours are the shared
 * session palette (`../shared/session-badges.ts`).
 *
 * Qt 3b5069d (`TillSessionsView::setBranch` — Cash Position's drill): the
 * URL's `?branch=<id>` lists that store instead of the header's; the live
 * line and the approval count follow, and the title names the store.
 */
import { textOf } from "../shared/format";
import { toPaise } from "../shared/money";
import { sessionBadgeBucket, type SessionBadgeBucket } from "../shared/session-badges";
import type { GridRow, TillSessionKey } from "../shared/wire/types";

/** Qt `defaultDaysBack = 7`. */
export const DEFAULT_DAYS_BACK = 7;

/** A castable uuid, so a pre-context request comes back empty instead of 400. */
export const NO_TENANT_ID = "00000000-0000-0000-0000-000000000000";

// ─── another store than the header's (Qt 3b5069d) ────────────────────────────

/** The URL's `?branch=<id>`, read once on mount; "" = the header's branch. */
export function scopeBranchOf(search: string): string {
  return (new URLSearchParams(search).get("branch") ?? "").trim();
}

/** A branch's name from the header's option list (value = id); the id itself when it is not there. */
export function branchLabelOf(options: readonly { value: string; label: string }[], branchId: string): string {
  if (!branchId) return "";
  return options.find((option) => option.value === branchId)?.label || branchId;
}

/** `Till Sessions — Zone store` when the list is on another store than the header's. */
export function sessionsTitle(scopedBranchName: string): string {
  return scopedBranchName ? `Till Sessions — ${scopedBranchName}` : "Till Sessions";
}

export const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "OPEN", label: "OPEN" },
  { value: "SUSPENDED", label: "SUSPENDED" },
  { value: "COUNTING", label: "COUNTING" },
  { value: "PENDING_APPROVAL", label: "PENDING_APPROVAL" },
  { value: "CLOSED", label: "CLOSED" },
  { value: "VOIDED", label: "VOIDED" },
] as const;

export const VARIANCE_OPTIONS = [
  { value: "", label: "Any" },
  { value: "SHORT", label: "SHORT" },
  { value: "EXCESS", label: "EXCESS" },
  { value: "PENDING", label: "PENDING" },
  { value: "NONE", label: "NONE" },
  // Notes 114: cash awaiting Approve Cash.
  { value: "TO_APPROVE", label: "TO_APPROVE" },
] as const;

export type SessionListFilters = {
  companyId: string;
  branchId: string;
  fromDate: string;
  toDate: string;
  status: string;
  variance: string;
};

export function sessionGridParams(filters: SessionListFilters): Record<string, string> {
  return {
    icompany_id: filters.companyId || NO_TENANT_ID,
    ibranch_id: filters.branchId || NO_TENANT_ID,
    ifrom_date: filters.fromDate,
    ito_date: filters.toDate,
    istatus: filters.status,
    ivariance: filters.variance,
  };
}

export type SessionRow = {
  key: TillSessionKey;
  sessionNo: string;
  status: string;
  cashier: string;
  counterCode: string;
  businessDate: string;
};

/** The row's own tenant context and identity — grid 144's aliases. */
export function sessionRowOf(row: GridRow | null | undefined): SessionRow | null {
  if (!row) return null;
  const tssId = textOf(row, "tss_id");
  if (!tssId) return null;
  return {
    key: {
      companyId: textOf(row, "tss_company_id"),
      branchId: textOf(row, "tss_branch_id"),
      accYear: textOf(row, "tss_acc_year"),
      tssId,
    },
    sessionNo: textOf(row, "tss_session_no"),
    status: textOf(row, "tss_status") || textOf(row, "status_text").replace(/ /g, "_"),
    cashier: textOf(row, "cashier"),
    counterCode: textOf(row, "counter_code"),
    businessDate: textOf(row, "business_date"),
  };
}

/** The cash office's count: S4 on a session whose billing has ended. */
export function awaitsCount(status: string): boolean {
  return status === "COUNTING";
}

/** The list's pill tones: the house five, and slate for the `locked` bucket. */
export type BadgeTone = "green" | "blue" | "grey" | "amber" | "red" | "slate";

const BUCKET_TONES: Record<SessionBadgeBucket, BadgeTone> = {
  success: "green",
  progress: "blue",
  neutral: "grey",
  warning: "amber",
  danger: "red",
  locked: "slate",
};

/**
 * A badge column's pill tone (Qt `tillSessionBadges`): the shared session
 * palette's bucket on this list's pill classes; a value the palette does not
 * know is a plain grey pill.
 */
export function badgeTone(value: string): BadgeTone {
  const bucket = sessionBadgeBucket(value);
  return bucket ? BUCKET_TONES[bucket] : "grey";
}

/** A variance cell's tone: short red, excess green, nil plain. */
export function varianceTone(value: unknown): "red" | "green" | "" {
  const paise = toPaise(value);
  if (paise === null || paise === 0) return "";
  return paise < 0 ? "red" : "green";
}

/** What the highlighted row allows, said in the hint bar. */
export function rowHint(row: SessionRow | null): string {
  const legend = "Enter opens the cockpit · F6 count / close · Ctrl+H journal";
  if (!row) return legend;
  let state: string;
  switch (row.status) {
    case "OPEN":
      // Never from the office (Qt a449b8c, notes 110).
      state = "Taking money — a pickup or top-up is signed at the counter, cashier and supervisor together.";
      break;
    case "SUSPENDED":
      state = "On a break — nothing is billed until the cashier resumes.";
      break;
    case "COUNTING":
      state = "Billing has ended — the drawer waits for its count (F6).";
      break;
    case "PENDING_APPROVAL":
      state = "Out of tolerance after the last recount — waits for an approver.";
      break;
    case "CLOSED":
      state = "Closed — the Z is issued.";
      break;
    default:
      state = row.status ? `${row.status.replace(/_/g, " ")}.` : "";
  }
  return state ? `${state}  ${legend}` : legend;
}

/** The journal dialog's summary line (Qt history summary). */
export function journalSummary(row: SessionRow, events: number): string[] {
  return [
    row.sessionNo,
    row.cashier,
    row.counterCode,
    `now ${row.status.replace(/_/g, " ")}`,
    `${events} event${events === 1 ? "" : "s"}`,
  ].filter((part) => part.trim() !== "");
}
