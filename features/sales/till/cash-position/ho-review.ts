/**
 * Add HO review — Qt `TillHoReviewDialog` (S11, mockup share/till/
 * till_ho_review_ui_mockup.png) without the widgets: head office's verdict on
 * one store's business day or one of its sessions, POST /till/reviews/create
 * (notes 134, Cash Position 289 CREATE).
 *
 *   facts    the store's row of grid 170 again, so the reviewer writes with
 *            it in view; the chip is the store's last review
 *   target   the day (tbd_id) or a session of it (grid 150 for the as-on
 *            date + the store's live sessions of grid 171)
 *   outcome  ck_tsr_outcome's seven; the note is required unless OK
 *   voucher  WRITTEN_OFF / SUSPENSE_CLEARED name the posted journal HO raised
 *            (grid 117, Jrl, the store's branch and the user's own)
 *   history  grid 174, newest first — a review is never edited, a new one
 *            supersedes it
 *
 * The server's refusals (not this branch's, note, voucher not posted) show on
 * the dialog's red line; nothing is written.
 */
import { buildTable, moneyText, type Pill, type ReportColumn, type TableView } from "../reports/till-reports";
import type { TillReviewCreateBody } from "../shared/api/till-session-api";
import { addDaysIso, ddmmyyyy, displayText, textOf } from "../shared/format";
import { toPaise } from "../shared/money";
import type { GridRow, TillReviewOutcome } from "../shared/wire/types";
import { numberOf, reviewWord } from "./cash-position";

export const WRITES_LINE = "writes till_session_review · never a store's own rows";
export const TARGET_HINT = "or one of its sessions";
export const NOTE_PLACEHOLDER = "What the store must do, or why it is fine";
export const NOTE_MAX_LENGTH = 1000;
export const VOUCHER_NONE = "— (only for written off / suspense cleared)";

/** Journals offered: the last 90 days to the as-on date. */
export const VOUCHER_DAYS = 90;

/** `Add HO review — Acme Foods - Coimbatore Branch · 17-10-2026`. */
export function reviewTitle(storeName: string, asOn: string): string {
  return `Add HO review — ${storeName} · ${ddmmyyyy(asOn)}`;
}

// ─── outcomes ────────────────────────────────────────────────────────────────

export type OutcomeEntry = { code: TillReviewOutcome; hint: string };

/** ck_tsr_outcome, in the mockup's order. */
export const OUTCOMES: readonly OutcomeEntry[] = [
  { code: "OK", hint: "nothing to do" },
  { code: "QUERY", hint: "ask the store a question" },
  { code: "ESCALATED", hint: "for the owner / finance head" },
  { code: "RECOVERY_ORDERED", hint: "recover the short from the cashier" },
  { code: "WRITTEN_OFF", hint: "the short is the company's loss" },
  { code: "SUSPENSE_CLEARED", hint: "suspense journalled out" },
  { code: "BANK_MATCHED", hint: "the remittance reached the bank" },
];

/** Two columns (Qt `grid->addLayout(line, i / 2, i % 2)`): OK, ESCALATED, WRITTEN_OFF, BANK_MATCHED left; the rest right. */
export const OUTCOME_COLUMNS: readonly (readonly OutcomeEntry[])[] = [
  OUTCOMES.filter((_entry, index) => index % 2 === 0),
  OUTCOMES.filter((_entry, index) => index % 2 === 1),
];

export function isOutcome(value: unknown): value is TillReviewOutcome {
  return OUTCOMES.some((entry) => entry.code === value);
}

export type OutcomeTone = "green" | "amber" | "red" | "blue";

/** Qt `outcomeBucket`: OK and BANK_MATCHED green, QUERY amber, ESCALATED red, the rest blue. */
export function outcomeTone(word: string): OutcomeTone {
  switch (word) {
    case "OK":
    case "BANK_MATCHED":
      return "green";
    case "QUERY":
      return "amber";
    case "ESCALATED":
      return "red";
    default:
      return "blue";
  }
}

/** The chip's tone from `OK 17-10`. */
export function lastReviewChipTone(lastReview: string): OutcomeTone {
  return outcomeTone(reviewWord(lastReview));
}

export function needsVoucher(outcome: TillReviewOutcome | ""): boolean {
  return outcome === "WRITTEN_OFF" || outcome === "SUSPENSE_CLEARED";
}

/** "Note" is "Note *" unless the outcome is OK. */
export function noteCaption(outcome: TillReviewOutcome | ""): string {
  return outcome === "OK" ? "Note" : "Note *";
}

// ─── the facts row ───────────────────────────────────────────────────────────

export type FactTone = "" | "red" | "amber" | "green";

export type Fact = { key: string; caption: string; value: string; tone: FactTone };

/** `ZT2-261017-01 · 3 h (+1)` — the store's oldest live session, when known (today). */
export function liveSessionText(store: GridRow, live: readonly GridRow[], now: Date): string {
  const branchId = textOf(store, "branch_id");
  const liveCount = Math.round(numberOf(store, "live"));
  const session = live.find((row) => textOf(row, "tss_branch_id") === branchId);
  if (!session) return String(liveCount);
  const opened = Date.parse(textOf(session, "tss_opened_on"));
  const hours = Number.isNaN(opened) ? "" : ` · ${Math.round((now.getTime() - opened) / 3_600_000)} h`;
  const more = liveCount > 1 ? ` (+${liveCount - 1})` : "";
  return `${textOf(session, "tss_session_no")}${hours}${more}`;
}

/** The store's row again (Qt `buildFacts`): day, live, safe count, in transit, variance, approvals. */
export function reviewFacts(store: GridRow, live: readonly GridRow[], now: Date): Fact[] {
  const old = textOf(store, "old_open_day");
  const status = textOf(store, "day_status");
  const liveCount = Math.round(numberOf(store, "live"));
  const count = textOf(store, "safe_count");
  const transit = toPaise(store.in_transit) ?? 0;
  const transitDays = numberOf(store, "transit_days");
  const mtd = toPaise(store.var_mtd) ?? 0;
  const approvals = Math.round(numberOf(store, "approvals"));
  return [
    {
      key: "day",
      caption: "Day",
      value: old ? `${displayText(old)} OPEN` : status,
      tone: old ? "red" : status === "CLOSED" ? "green" : "",
    },
    {
      key: "live",
      caption: "Live session",
      value: liveCount > 0 ? liveSessionText(store, live, now) : "none",
      tone: numberOf(store, "over_hours") > 0 ? "red" : liveCount > 0 ? "amber" : "",
    },
    {
      key: "safeCount",
      caption: "Safe count",
      value: count,
      tone: count === "" || count === "today" ? "green" : "red",
    },
    {
      key: "transit",
      caption: "In transit",
      value: transit > 0 ? `${moneyText(transit)} · ${Math.round(transitDays)} d` : moneyText(0),
      tone: transitDays >= 2 ? "red" : "",
    },
    {
      key: "varMtd",
      caption: "Var. MTD",
      value: moneyText(mtd, true),
      tone: mtd < 0 ? "red" : mtd > 0 ? "green" : "",
    },
    { key: "approvals", caption: "Approvals", value: String(approvals), tone: approvals > 0 ? "amber" : "" },
  ];
}

// ─── what is reviewed ────────────────────────────────────────────────────────

export type ReviewTarget = {
  kind: "day" | "session";
  id: string;
  /** The year of the day / session (tbd_acc_year / tss_acc_year). */
  year: string;
  text: string;
};

export function targetKey(target: ReviewTarget): string {
  return `${target.kind}:${target.id}`;
}

type Params = Record<string, string>;

/** Grid 150 (TILL DAY SESSIONS) on the as-on day; status and variance "" = all. */
export function targetsParams(companyId: string, branchId: string, asOn: string): Params {
  return {
    icompany_id: companyId,
    ibranch_id: branchId,
    ifrom_date: asOn,
    ito_date: asOn,
    istatus: "",
    ivariance: "",
  };
}

/** Grid 174 (TILL CASH POSITION REVIEWS): one branch, the as-on day. */
export function historyParams(companyId: string, branchId: string, asOn: string): Params {
  return { icompany_id: companyId, ibranch_id: branchId, iday: asOn };
}

/**
 * The Reviewing list (Qt `loadTargets`): the business day first (when the
 * store has one), then the store's live sessions of grid 171 (which may be
 * from an older day still open), then grid 150's sessions of the as-on day —
 * a session once, by its id.
 */
export function reviewTargets(
  store: GridRow,
  asOn: string,
  live: readonly GridRow[],
  daySessions: readonly GridRow[],
): ReviewTarget[] {
  const branchId = textOf(store, "branch_id");
  const targets: ReviewTarget[] = [];
  const tbdId = textOf(store, "tbd_id");
  if (tbdId) {
    targets.push({
      kind: "day",
      id: tbdId,
      year: textOf(store, "tbd_acc_year"),
      text: `The business day ${ddmmyyyy(asOn).slice(0, 5)}`,
    });
  }
  const seen = new Set<string>();
  const add = (session: GridRow, status: string) => {
    const id = textOf(session, "tss_id");
    if (!id || seen.has(id)) return;
    seen.add(id);
    const parts = [textOf(session, "tss_session_no")];
    if (textOf(session, "cashier")) parts.push(textOf(session, "cashier"));
    if (status) parts.push(status);
    targets.push({ kind: "session", id, year: textOf(session, "tss_acc_year"), text: parts.join(" · ") });
  };
  for (const session of live) {
    if (textOf(session, "tss_branch_id") === branchId) add(session, textOf(session, "tss_status"));
  }
  for (const session of daySessions) add(session, textOf(session, "status_text"));
  return targets;
}

// ─── the journal ─────────────────────────────────────────────────────────────

export type VoucherOption = { id: string; year: string; text: string };

/** The store's branch, and the user's own when it is another (head office raises the journal where it sits). */
export function voucherBranches(storeBranchId: string, ownBranchId: string): string[] {
  return ownBranchId && ownBranchId !== storeBranchId ? [storeBranchId, ownBranchId] : [storeBranchId];
}

/** The store's open day's year, else the header's. */
export function voucherYear(store: GridRow, headerYear: string): string {
  return textOf(store, "tbd_acc_year") || headerYear;
}

export type VoucherScope = {
  userId: string;
  companyId: string;
  branchId: string;
  year: string;
  asOn: string;
  today: string;
};

/** Grid 117 (voucher register): Jrl, from as-on − 90 days to today. */
export function voucherParams({ userId, companyId, branchId, year, asOn, today }: VoucherScope): Params {
  return {
    iuser_id: userId,
    icompany_id: companyId,
    ibranch_id: branchId,
    iacc_year: year,
    itype_code: "Jrl",
    ifrom_date: addDaysIso(asOn, -VOUCHER_DAYS),
    ito_date: today,
  };
}

/** `JV/0012 · 10-10-2026 · 8,000.00 · the first forty of the remarks` — POSTED journals only. */
export function voucherOptions(rows: readonly GridRow[]): VoucherOption[] {
  const options: VoucherOption[] = [];
  for (const row of rows) {
    if (textOf(row, "avh_voucher_status") !== "POSTED") continue;
    const id = textOf(row, "avh_voucher_id");
    if (!id) continue;
    const parts = [
      textOf(row, "avh_voucher_refno"),
      ddmmyyyy(textOf(row, "avh_voucher_date").slice(0, 10)),
      moneyText(toPaise(row.avh_total_debit) ?? 0),
    ];
    const remarks = textOf(row, "avh_remarks");
    if (remarks) parts.push(remarks.slice(0, 40));
    options.push({ id, year: textOf(row, "avh_acc_year"), text: parts.join(" · ") });
  }
  return options;
}

// ─── the rules and the body ──────────────────────────────────────────────────

export type ReviewForm = {
  target: ReviewTarget | null;
  outcome: TillReviewOutcome | "";
  note: string;
  /** The journal picked; ignored unless the outcome needs one. */
  voucher: VoucherOption | null;
};

export const EMPTY_REVIEW_FORM: ReviewForm = { target: null, outcome: "", note: "", voucher: null };

/** Why Save is off (Qt `problem`), or "". */
export function reviewProblem(form: ReviewForm, targetCount: number): string {
  if (targetCount === 0 || !form.target) {
    return "Nothing to review: the store has no business day or session on this date.";
  }
  if (!form.outcome) return "Pick an outcome.";
  if (form.outcome !== "OK" && form.note.trim() === "") return "Type a note: what the store must do, or why.";
  if (needsVoucher(form.outcome) && !form.voucher) return "Pick the journal head office raised for it.";
  return "";
}

/** `CreateTillReviewDto` (Qt `body`); null until the form names a target and an outcome. */
export function reviewBody(companyId: string, branchId: string, form: ReviewForm): TillReviewCreateBody | null {
  if (!form.target || !form.outcome) return null;
  const body: TillReviewCreateBody = {
    companyId,
    branchId,
    accYear: form.target.year,
    outcome: form.outcome,
  };
  if (form.target.kind === "day") body.dayId = form.target.id;
  else body.sessionId = form.target.id;
  const note = form.note.trim();
  if (note) body.note = note;
  if (needsVoucher(form.outcome) && form.voucher) {
    body.refVoucherId = form.voucher.id;
    body.refVoucherAccYear = form.voucher.year;
  }
  return body;
}

// ─── earlier reviews ─────────────────────────────────────────────────────────

export const HISTORY_COLUMNS: readonly ReportColumn[] = [
  { key: "on_text", title: "On", kind: "text" },
  { key: "reviewing", title: "Reviewing", kind: "text" },
  { key: "tsr_outcome", title: "Outcome", kind: "text" },
  { key: "reviewer", title: "By", kind: "text" },
  { key: "note", title: "Note", kind: "text" },
];

function historyPills(key: string, row: GridRow): Pill[] {
  if (key !== "tsr_outcome") return [];
  const outcome = textOf(row, key);
  return outcome ? [{ text: outcome, tone: outcomeTone(outcome) }] : [];
}

/** Grid 174's rows, newest first as sent. */
export function historyTable(rows: readonly GridRow[]): TableView {
  return buildTable(HISTORY_COLUMNS, rows, {
    rowKey: (row, index) => textOf(row, "tsr_id") || `#${index}`,
    pills: historyPills,
  });
}

/** `EARLIER REVIEWS OF ACME — newest first`, ` — none yet` once the grid answered empty. */
export function historyHead(storeName: string, empty: boolean): string {
  const head = `EARLIER REVIEWS OF ${storeName.toUpperCase()}`;
  return empty ? `${head} — none yet` : `${head} — newest first`;
}
