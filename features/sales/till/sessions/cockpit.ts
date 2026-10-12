/**
 * The Session Cockpit (S5) — Qt `TillSessionCockpit` without the widgets: the
 * supervisor's / cash office's view of ONE till session, the only screen
 * that shows expected cash.
 *
 * Reads:
 *   GET /till/sessions/expected   header, tenders (open … out, expected,
 *                                 counted, variance), variances — Till
 *                                 Sessions (273) OVERRIDE; refused to the
 *                                 session's own cashier until it closes, then
 *                                 the blind GET /till/sessions/get.
 *   grids 146 bills + returns · 147 money documents · 148 counts ·
 *         145 timeline (till_event)
 *
 * Acts through the screens already built: Count / close (S4) on a COUNTING
 * session, Cash movement (S3: a supervisor's pickup / top-up) on a live one,
 * the Slip check on a counted one. Approve & close, Recount request, Force
 * close, Reopen, Re-tender from here, Print Z and X read wait for the server
 * and are shown greyed with why.
 */
import { clockOf, ddmmyyyy, durationText, textOf, type TillTone } from "../shared/format";
import { formatFigure, formatMoney, formatSignedMoney, paiseOf, toPaise } from "../shared/money";
import { CASH_TENDER_TYPE_ID } from "../shared/denom";
import type { GridRow, TillSessionPayload, TillSessionTender, TillVariance } from "../shared/wire/types";

/** The read that failed over to the blind one (Qt `fetch(false)`). */
export function shouldFallBackToBlind(status: number | null, code: string): boolean {
  return status === 403 || code === "TILL_BLIND_CLOSE";
}

export type CockpitHeader = {
  title: string;
  sub: string;
  pill: string;
  pillTone: TillTone;
};

export function cockpitHeader(s: TillSessionPayload): CockpitHeader {
  const status = s.tssStatus ?? "";
  return {
    title: `Till Session  ${s.tssSessionNo}`,
    sub: `${s.operatorName ?? ""} · ${s.counterName ?? ""} (${s.counterCode ?? ""}) · business date ${ddmmyyyy(s.tssBusinessDate)}`,
    pill: status.replace(/_/g, " "),
    pillTone:
      status === "PENDING_APPROVAL" ? "red" : status === "CLOSED" ? "green" : status === "COUNTING" ? "amber" : "blue",
  };
}

export type CockpitFacts = {
  opened: string;
  ended: string;
  duration: string;
  float: string;
  count: string;
  witness: string;
  z: string;
  reopened: string;
};

export function cockpitFacts(s: TillSessionPayload, now: Date): CockpitFacts {
  const attempts = Number(s.tssCountAttempts ?? 0) || 0;
  return {
    opened: clockOf(s.tssOpenedOn) || "—",
    ended: s.tssBillingEndedOn ? clockOf(s.tssBillingEndedOn) : "—",
    duration: durationText(s.tssOpenedOn, s.tssBillingEndedOn || s.tssClosedOn, now),
    float: `${s.tssFloatMode ?? ""} ${formatMoney(paiseOf(s.tssFloatIssued))} · counted ${formatMoney(paiseOf(s.tssFloatCounted))}`,
    count: s.tssCountMode
      ? `${s.tssCountMode} · at ${s.tssCountPlace === "CASH_OFFICE" ? "cash office" : "counter"} · ${attempts} attempt${attempts === 1 ? "" : "s"}`
      : "—",
    witness: "—",
    z: s.tssZNo === null || s.tssZNo === undefined || String(s.tssZNo) === "" ? "issued on close" : String(s.tssZNo),
    reopened: "—",
  };
}

// ─── the tender reconciliation ───────────────────────────────────────────────

export const TENDER_FIGURES = [
  ["openAmount", "Open"],
  ["salesAmount", "Sales"],
  ["refundAmount", "Refunds"],
  ["receiptAmount", "Receipts"],
  ["paymentAmount", "Payments"],
  ["expenseAmount", "Expenses"],
  ["movedIn", "In"],
  ["movedOut", "Out"],
  ["expected", "Expected"],
  ["counted", "Counted"],
  ["variance", "Variance"],
] as const satisfies readonly (readonly [keyof TillSessionTender, string])[];

export type TenderCell = { text: string; tone: "" | "red" | "green" | "amber" | "muted" };

export type TenderRow = {
  key: string;
  tender: string;
  mode: string;
  cells: TenderCell[];
  reason: string;
  treatment: string;
};

/** Reason / treatment: the tender's latest close-stage variance row. */
function latestCloseVariance(variances: readonly TillVariance[], tender: TillSessionTender): TillVariance | null {
  let latest: TillVariance | null = null;
  for (const v of variances) {
    if (v.tvrStage === "OPEN") continue;
    if (v.tvrTenderTypeId !== tender.tenderTypeId) continue;
    if ((v.tvrTenderId ?? "") !== (tender.tenderId ?? "")) continue;
    latest = v;
  }
  return latest;
}

export function tenderRows(
  s: TillSessionPayload,
  reasonNames: ReadonlyMap<string, string>,
  expectedShown: boolean,
): { rows: TenderRow[]; totalVariance: TenderCell } {
  const variances = s.variances ?? [];
  let total = 0;
  const rows = (s.tenders ?? []).map((t, index) => {
    const cells: TenderCell[] = TENDER_FIGURES.map(([field]) => ({ text: formatFigure(t[field]), tone: "" as const }));
    const countedAt = TENDER_FIGURES.findIndex(([field]) => field === "counted");
    const expectedAt = TENDER_FIGURES.findIndex(([field]) => field === "expected");
    const varianceAt = TENDER_FIGURES.findIndex(([field]) => field === "variance");
    if (t.closeMode === "STATEMENT") {
      // Rows with no UTR can never be matched to the statement.
      const noRef = Number(t.noRefCount ?? 0) || 0;
      cells[countedAt] = {
        text: noRef > 0 ? `later · ${noRef} with no ref` : "later",
        tone: noRef > 0 ? "amber" : "muted",
      };
    } else if (t.closeMode === "NONE") {
      cells[expectedAt] = { text: "info", tone: "muted" };
    }
    const variance = toPaise(t.variance);
    if (variance !== null) {
      total += variance;
      cells[varianceAt] = { text: formatSignedMoney(variance), tone: variance < 0 ? "red" : variance > 0 ? "green" : "" };
    }
    const latest = latestCloseVariance(variances, t);
    return {
      key: `${t.tenderTypeId}|${t.tenderId ?? ""}|${index}`,
      tender: t.tenderName || t.tenderTypeName || "",
      mode: t.closeMode,
      cells,
      reason: latest?.tvrReasonId ? (reasonNames.get(latest.tvrReasonId) ?? "") : "",
      treatment: (latest?.tvrTreatment ?? "").replace(/_/g, " "),
    };
  });
  // The total of the counted tenders' variances — only where the figures are shown.
  return { rows, totalVariance: { text: expectedShown ? formatSignedMoney(total) : "", tone: "" } };
}

// ─── the approval band ───────────────────────────────────────────────────────

export type ApprovalBand = {
  code: string;
  amount: string;
  text: string;
  note: string;
};

/**
 * A variance waiting for an approver: a drawer variance first; a slip gap
 * (non-cash) is final with the count and waits for the slip check —
 * reported, not enforced.
 */
export function approvalBand(s: TillSessionPayload): ApprovalBand | null {
  let pending: TillVariance | null = null;
  for (const v of s.variances ?? []) {
    if (v.tvrTreatment !== "PENDING") continue;
    if (!pending || v.tvrTenderTypeId === CASH_TENDER_TYPE_ID) pending = v;
  }
  const status = s.tssStatus ?? "";
  if (status !== "PENDING_APPROVAL" && !pending) return null;
  const slips = pending !== null && pending.tvrTenderTypeId !== CASH_TENDER_TYPE_ID;
  const variance = pending ? paiseOf(pending.tvrVariance) : 0;
  return {
    code: pending?.tvrStage === "OPEN" ? "FLOAT_MISMATCH" : slips ? "NONCASH_VARIANCE" : "CASH_VARIANCE",
    amount: pending ? formatSignedMoney(variance) : "",
    text: !pending
      ? "The count is out of tolerance after the last recount."
      : slips
        ? `A slip total differs by ${formatSignedMoney(variance)} — check the slips (Slip check), re-tender what was keyed wrong; the rest waits for the approver.`
        : `${formatSignedMoney(variance)} against a tolerance of ${formatMoney(paiseOf(pending.tvrTolerance))} — waits for a supervisor.`,
    note:
      slips && status !== "PENDING_APPROVAL"
        ? "Reported, not enforced: the session closes and nothing posts for the gap. The card money's truth comes " +
          "with the statement — a row never paid shows in Settlement → Not received."
        : "Approver, PIN and the treatment are the approval gate (till build phase 3), not on the server yet. Until it " +
          "is, a PENDING_APPROVAL session holds its counter, cashier and device (notes 97 §1.2).",
  };
}

export function footNote(expectedShown: boolean, mine: boolean): string {
  if (expectedShown) return "Expected figures: the server's own.";
  return mine
    ? "You are this session's cashier: its expected figures stay hidden until it closes (blind close)."
    : "Expected figures hidden: they need the Till Sessions (273) override right while the session is open.";
}

// ─── the tiles ───────────────────────────────────────────────────────────────

export type CockpitTiles = {
  bills: number;
  returns: number;
  receipts: number;
  noSales: number;
  pickups: number;
  expenses: number;
  retenders: number;
  recounts: number;
  netSales: string;
  voids: string;
  /** Tab captions. */
  billsTab: string;
  moneyTab: string;
  countsTab: string;
  /** Open on the first tab with something in it. */
  firstTab: "bills" | "money" | null;
};

export function cockpitTiles(
  s: TillSessionPayload | null,
  rows: { bills: readonly GridRow[]; money: readonly GridRow[]; counts: readonly GridRow[]; events: readonly GridRow[] },
): CockpitTiles {
  let bills = 0;
  let returns = 0;
  let net = 0;
  for (const row of rows.bills) {
    // A draft or a cancelled bill took no money: listed, never counted.
    if (textOf(row, "tb_status") !== "POSTED") continue;
    if (textOf(row, "tb_kind") === "RETURN") returns += 1;
    else bills += 1;
    net += paiseOf(row.tb_amount);
  }
  let receipts = 0;
  let expenses = 0;
  let pickups = 0;
  for (const row of rows.money) {
    const status = textOf(row, "md_status").toUpperCase();
    if (status === "CANCELLED" || status === "VOIDED" || status === "DRAFT") continue;
    const kind = textOf(row, "md_kind").toUpperCase();
    if (kind.includes("RECEIPT")) receipts += 1;
    else if (kind.includes("EXPENSE")) expenses += 1;
    else if (kind === "PICKUP") pickups += 1;
  }
  let noSales = 0;
  let retenders = 0;
  for (const row of rows.events) {
    const code = textOf(row, "tev_event_code").toUpperCase();
    if (code === "NO_SALE") noSales += 1;
    else if (code === "RETENDER") retenders += 1;
  }
  const attempts = s ? Number(s.tssCountAttempts ?? 0) || 0 : 0;
  const closed = s?.tssStatus === "CLOSED";
  return {
    bills,
    returns,
    receipts,
    noSales,
    pickups,
    expenses,
    retenders,
    recounts: Math.max(0, attempts - 1),
    netSales: formatMoney(closed ? paiseOf(s?.totals?.netSales) : net),
    voids: "— (void module)",
    billsTab: `Bills ${bills + returns}`,
    moneyTab: `Money documents ${rows.money.length}`,
    countsTab: `Counts ${rows.counts.length}`,
    firstTab: bills + returns > 0 ? "bills" : rows.money.length > 0 ? "money" : null,
  };
}

// ─── the buttons ─────────────────────────────────────────────────────────────

export type SlipTender = { tenderId: string; name: string };

/** The session's SLIPS tenders that name a terminal (an unnamed line cannot be checked by tender). */
export function slipTenders(s: TillSessionPayload | null): SlipTender[] {
  return (s?.tenders ?? [])
    .filter((t) => t.closeMode === "SLIPS" && t.tenderId)
    .map((t) => ({ tenderId: t.tenderId as string, name: t.tenderName || t.tenderTypeName || "" }));
}

export type CockpitButtons = {
  count: boolean;
  movement: boolean;
  slipCheck: boolean;
};

export function cockpitButtons(s: TillSessionPayload | null): CockpitButtons {
  const status = s?.tssStatus ?? "";
  const checkable = status === "COUNTING" || status === "PENDING_APPROVAL" || status === "CLOSED";
  // Only on a mismatch: a SLIPS line whose variance is not zero — or not known
  // here (hidden from the cashier until the close).
  let mismatch = false;
  for (const t of s?.tenders ?? []) {
    if (t.closeMode !== "SLIPS") continue;
    const variance = toPaise(t.variance);
    mismatch = mismatch || variance === null || variance !== 0;
  }
  return {
    count: status === "COUNTING",
    movement: status === "OPEN" || status === "SUSPENDED",
    slipCheck: checkable && mismatch && slipTenders(s).length > 0,
  };
}

export const WAITING_TIPS = {
  approve: "Comes with the approval gate (till build phase 3) — not on the server yet",
  retender: "Re-tender a bill from the sale bill (Ctrl+F6) for now",
  forceClose: "No server route for this yet",
  reopen: "No server route for this yet",
  printZ: "No Z print template yet",
  xRead: "No server route for this yet",
} as const;

export const REC_NOTE =
  "Card is one line per terminal (batch total at End Shift). A non-cash gap → re-tender first, then SUSPENSE — never " +
  "short & excess. UPI is matched to the statement later; NONE rows are information.";

export const REC_HINT = "expected = open + sales − refunds + receipts − payments − expenses + in − out  (server)";

// ─── the grids under the reconciliation ──────────────────────────────────────

/** The money columns of grids 145–148, by SQL alias — the runner sends them as strings. */
export const MONEY_FIELDS: ReadonlySet<string> = new Set([
  "tb_amount",
  "md_amount",
  "tct_total_counted",
  "tct_expected",
  "tev_amount",
]);

/** A grid cell's text: money as money, the rest as sent. */
export function gridCellText(row: GridRow, field: string): string {
  if (MONEY_FIELDS.has(field)) return formatFigure(row[field]);
  return textOf(row, field);
}

