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
 */
import { textOf, type TillTone } from "../shared/format";
import { toPaise } from "../shared/money";
import type { GridRow, TillSessionKey } from "../shared/wire/types";

/** Qt `defaultDaysBack = 7`. */
export const DEFAULT_DAYS_BACK = 7;

/** A castable uuid, so a pre-context request comes back empty instead of 400. */
export const NO_TENANT_ID = "00000000-0000-0000-0000-000000000000";

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

/**
 * The badge colours of the two badge columns (Qt badgeOverrides): a closed
 * session is the normal end, not a locked row; the treatments read as the
 * mockup's chips.
 */
export function badgeTone(column: "status_text" | "treatment", value: string): TillTone {
  const text = value.trim().toUpperCase();
  if (column === "status_text") {
    switch (text) {
      case "CLOSED":
        return "green";
      case "OPEN":
        return "blue";
      case "COUNTING":
      case "PENDING APPROVAL":
        return "amber";
      case "VOIDED":
        return "red";
      default:
        return "grey";
    }
  }
  switch (text) {
    case "EXPENSE":
      return "blue";
    case "SUSPENSE":
    case "PENDING":
      return "amber";
    case "RECOVER":
      return "red";
    default:
      return "grey";
  }
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
