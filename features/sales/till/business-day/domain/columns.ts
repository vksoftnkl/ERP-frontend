/**
 * The two grids' columns. Which columns appear, in what order, under what
 * heading and on which side is each grid's own config (`fixed.grid_columns`,
 * read through `/configured-grid-sql/columns`) — Grid Designer moves them
 * without a code change. The lists below are only the fallback for when that
 * config cannot be read, copied from the dev rows of grids 149 and 150.
 *
 * What a column's VALUE looks like is the screen's: money in Indian grouping,
 * a variance with its sign, the status as a pill. The session pills —
 * Treatment, Cash, Status — take the colours every session grid shares (Qt
 * c77f3f1 `tillSessionBadges`, `../../shared/session-badges.ts`).
 */
import { isSessionBadgeColumn, sessionBadgeBucket, type SessionBadgeBucket } from "../../shared/session-badges";
import { formatMoney, formatSignedMoney, signOf, toPaise } from "./decimal";
import { text, type GridRow } from "./wire";

export type ColumnAlign = "left" | "center" | "right";

export type GridColumn = {
  field: string;
  header: string;
  align: ColumnAlign;
  /** A dragged width from the grid's config ("120px"), else the table decides. */
  width?: string;
};

/** The configured-column shape this screen reads (`GridColumnConfig`). */
export type ConfiguredColumn = {
  key: string;
  accessorKey: string;
  header: string;
  visible: boolean;
  order: number;
  columnNumber?: number;
  sqlFieldName?: string;
  align?: ColumnAlign;
  width?: string;
};

/** TILL DAY SESSIONS (150), visible columns, by position. */
export const SESSION_COLUMNS_FALLBACK: readonly GridColumn[] = [
  { field: "tss_session_no", header: "Session", align: "left" },
  { field: "cashier", header: "Cashier", align: "left" },
  { field: "counter_code", header: "Counter", align: "left" },
  { field: "opened_at", header: "Opened", align: "left" },
  { field: "closed_at", header: "Closed", align: "left" },
  { field: "bills", header: "Bills", align: "right" },
  { field: "cash_variance", header: "Variance", align: "right" },
  { field: "treatment", header: "Treatment", align: "left" },
  // Notes 114: the hand-over waiting for a supervisor's Approve Cash.
  { field: "cash_receipt", header: "Cash", align: "left" },
  { field: "status_text", header: "Status", align: "left" },
];

/** MAIN LIST - TILL BUSINESS DAYS (149), visible columns, by position. */
export const DAY_COLUMNS_FALLBACK: readonly GridColumn[] = [
  { field: "bd_date", header: "Date", align: "left" },
  { field: "tbd_status", header: "Status", align: "left" },
  { field: "bd_opened", header: "Opened", align: "left" },
  { field: "bd_closed", header: "Closed", align: "left" },
  { field: "bd_sessions", header: "Sessions", align: "right" },
  { field: "bd_closed_sessions", header: "Closed sessions", align: "right" },
  { field: "bd_net_sales", header: "Net sales", align: "right" },
  { field: "bd_cash_variance", header: "Cash variance", align: "right" },
  { field: "bd_z", header: "Store Z", align: "left" },
  { field: "tbd_reopen_count", header: "Reopened", align: "right" },
];

/** Keys the grids carry for opening a row — never a column, whatever the config says. */
const KEY_FIELDS = new Set([
  "tss_id",
  "tss_company_id",
  "tss_branch_id",
  "tss_acc_year",
  "tbd_id",
  "tbd_company_id",
  "tbd_branch_id",
  "tbd_acc_year",
]);

/** The visible configured columns in their order, or the fallback when there are none. */
export function resolveColumns(
  configured: readonly ConfiguredColumn[] | undefined,
  fallback: readonly GridColumn[],
): readonly GridColumn[] {
  const visible = (configured ?? [])
    .filter((column) => column.visible)
    .slice()
    .sort((a, b) => a.order - b.order || (a.columnNumber ?? a.order) - (b.columnNumber ?? b.order))
    .map((column) => {
      const field = column.sqlFieldName || column.accessorKey || column.key;
      const known = fallback.find((entry) => entry.field === field);
      return {
        field,
        header: column.header || known?.header || field,
        align: column.align ?? known?.align ?? "left",
        width: column.width,
      };
    })
    .filter((column) => column.field && !KEY_FIELDS.has(column.field));
  return visible.length > 0 ? visible : fallback;
}

// ── Cells ─────────────────────────────────────────────────────────────────

/** `locked` is the slate of a parked figure (a SUSPENSE treatment). */
export type CellTone = "" | "danger" | "success" | "warning" | "info" | "muted" | "locked";

export type Cell = { kind: "text"; text: string; tone: CellTone } | { kind: "pill"; text: string; tone: CellTone };

/** Money columns (grid type Currency). */
const MONEY_FIELDS = new Set(["net_sales", "cash_expected", "cash_counted", "bd_net_sales"]);
/** Variance columns: the sign is the point. */
const VARIANCE_FIELDS = new Set(["cash_variance", "bd_cash_variance"]);
/** Status columns a session badge does not cover (the raw status, the day's): a pill. */
const STATUS_FIELDS = new Set(["tss_status", "tbd_status"]);

/** A session's or a day's status → the pill's tone. */
export function statusTone(value: string): CellTone {
  switch (value.trim().toUpperCase().replace(/_/g, " ")) {
    case "CLOSED":
      return "success";
    case "PENDING APPROVAL":
    case "COUNTING":
    case "CLOSING":
      return "warning";
    case "OPEN":
      return "info";
    case "SUSPENDED":
    case "VOIDED":
      return "muted";
    default:
      return "";
  }
}

/** A variance treatment (EXPENSE, SUSPENSE, …) → its chip's tone. */
function treatmentTone(value: string): CellTone {
  const word = value.trim().toUpperCase();
  if (!word) return "";
  if (word === "SUSPENSE" || word === "PENDING") return "warning";
  if (word.startsWith("WITHIN")) return "muted";
  return "info";
}

/** The shared session buckets on this screen's pill tones. */
const BUCKET_TONE: Record<SessionBadgeBucket, CellTone> = {
  success: "success",
  progress: "info",
  neutral: "muted",
  warning: "warning",
  danger: "danger",
  locked: "locked",
};

/** A Treatment / Cash / Status value as a pill: the shared colour, else the screen's own. */
function sessionBadgeCell(field: string, value: string): Cell {
  const bucket = sessionBadgeBucket(value);
  let own: CellTone = "";
  if (field === "treatment") own = treatmentTone(value);
  else if (field === "status_text") own = statusTone(value);
  return {
    kind: "pill",
    text: field === "status_text" ? value.replace(/_/g, " ") : value,
    tone: bucket ? BUCKET_TONE[bucket] : own,
  };
}

export function cellOf(field: string, row: GridRow): Cell {
  const raw = row[field];
  if (isSessionBadgeColumn(field)) {
    const value = text(raw).trim();
    return value ? sessionBadgeCell(field, value) : { kind: "text", text: "", tone: "" };
  }
  if (MONEY_FIELDS.has(field)) {
    const paise = toPaise(raw);
    return { kind: "text", text: paise === null ? "" : formatMoney(paise), tone: "" };
  }
  if (VARIANCE_FIELDS.has(field)) {
    const paise = toPaise(raw);
    if (paise === null) return { kind: "text", text: "", tone: "" };
    const sign = signOf(paise);
    return { kind: "text", text: formatSignedMoney(paise), tone: sign < 0 ? "danger" : sign > 0 ? "success" : "" };
  }
  if (STATUS_FIELDS.has(field)) {
    const value = text(raw).trim();
    return value
      ? { kind: "pill", text: value.replace(/_/g, " "), tone: statusTone(value) }
      : { kind: "text", text: "", tone: "" };
  }
  return { kind: "text", text: text(raw), tone: "" };
}
