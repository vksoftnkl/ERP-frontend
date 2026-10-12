/**
 * The two exception tabs (Qt showNotReceived / writeOff / showUnexplained /
 * resolve / refreshExceptionButtons) and the row picker. Rows are configured
 * grid rows — grid 140 NOT RECEIVED, 141 UNEXPLAINED, 154 PICK ROW, 134 TILL
 * REASONS — read by their SQL aliases.
 */
import { istClock, shortDate } from "./dates";
import { formatMoney, formatPaise } from "./money";
import { text } from "./parse";
import type { GridRow, Resolution, WriteOffTreatment } from "./types";
import type { Scope } from "./match";

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// ── reasons ───────────────────────────────────────────────────────────────

export type ReasonOption = { id: string; label: string };

export const NONCASH_CATEGORY = "NONCASH";

/** Grid 134's tokens (every one bound: an unsent one stays literal text). */
export function reasonGridParams(companyId: string): Record<string, string> {
  return { icompany_id: companyId, icategory: NONCASH_CATEGORY, iinactive: "false" };
}

/** The live NONCASH reasons, "CODE — Name". */
export function reasonOptions(rows: readonly GridRow[]): ReasonOption[] {
  return rows
    .filter((row) => text(row, "trs_category") === NONCASH_CATEGORY && text(row, "trs_is_active") !== "false")
    .map((row) => ({ id: text(row, "trs_id"), label: `${text(row, "trs_code")} — ${text(row, "trs_name")}` }))
    .filter((option) => option.id !== "");
}

// ── Not received → write off ──────────────────────────────────────────────

export const NOT_RECEIVED_HINT =
  "Our tender rows with no money yet: PENDING / PARTIAL past the expected settlement date + tender.settle_grace_days.";

export const WRITE_OFF_NOTE =
  "RECOVER = the named ledger (the cashier's staff advance, a party); SUSPENSE = still chasing the bank; " +
  "LOSS = the WRITE_OFF role. The credit side is the row's own ledger (Tender suspense when the close parked it). " +
  "The row ends FAILED.";

export const WRITE_OFF_TREATMENTS: { value: WriteOffTreatment; label: string }[] = [
  { value: "RECOVER", label: "RECOVER from…" },
  { value: "SUSPENSE", label: "keep in SUSPENSE" },
  { value: "LOSS", label: "LOSS" },
];

export function notReceivedHead(row: GridRow | null): string {
  if (!row) return "Pick a row above";
  return [
    text(row, "doc_refno"),
    formatMoney(row.outstanding),
    text(row, "tender_name"),
    `keyed ${text(row, "td_ref_no")}`,
    text(row, "td_card_last4"),
  ].join(" · ");
}

export function notReceivedFacts(row: GridRow | null): string {
  if (!row) return "";
  return (
    `Billed ${formatMoney(row.td_total_amt)} on ${shortDate(text(row, "td_doc_date"))} · ` +
    `expected ${shortDate(text(row, "td_expected_settle_on"))} · ${text(row, "days_overdue")} day(s) overdue · ` +
    `session ${text(row, "session_no")} (${text(row, "cashier")}) · ${text(row, "td_settle_status")}`
  );
}

export type WriteOffForm = {
  treatment: WriteOffTreatment;
  reasonId: string;
  recoveryLedgerId: string;
  notes: string;
};

export function writeOffState(
  row: GridRow | null,
  form: WriteOffForm,
  options: { busy: boolean; canOverride: boolean },
): { canWriteOff: boolean; recoverEnabled: boolean } {
  const recoverOk = form.treatment !== "RECOVER" || form.recoveryLedgerId !== "";
  return {
    canWriteOff: !options.busy && row !== null && form.reasonId !== "" && recoverOk && options.canOverride,
    recoverEnabled: form.treatment === "RECOVER",
  };
}

export function writeOffQuestion(row: GridRow, treatment: WriteOffTreatment): string {
  return `Write off ${formatMoney(row.outstanding)} on ${text(row, "doc_refno")} as ${treatment}? A TVar posts and the row ends FAILED.`;
}

export function writeOffBody(scope: Scope, row: GridRow, form: WriteOffForm) {
  return {
    companyId: scope.companyId,
    branchId: scope.branchId,
    tdId: text(row, "td_id"),
    tdAccYear: text(row, "td_acc_year"),
    treatment: form.treatment,
    reasonId: form.reasonId,
    notes: nullable(form.notes),
    ...(form.treatment === "RECOVER" ? { recoveryLedgerId: form.recoveryLedgerId } : {}),
  };
}

export function writeOffDoneText(result: { voucherRefno: string; amount: number }): string {
  return result.voucherRefno
    ? `Written off — ${result.voucherRefno} ${formatPaise(result.amount)}`
    : "Written off — nothing posts (both sides are suspense).";
}

// ── Unexplained → resolve ─────────────────────────────────────────────────

export const UNEXPLAINED_HINT =
  "A provider line no bill explains: money arrived, nothing of ours says why — parked in Tender suspense by its TSet.";

export const RESOLVE_NOTE =
  "LINKED: the bill's row on this tender — re-tender the bill first if it was keyed as another tender. " +
  "INCOME: an unbilled sale (Dr Tender suspense / Cr the income ledger). SUSPENSE: decided, still parked. " +
  "REFUNDED: given back.";

export const RESOLUTIONS: { value: Resolution; label: string }[] = [
  { value: "LINKED", label: "LINKED to a bill" },
  { value: "REFUNDED", label: "REFUNDED" },
  { value: "INCOME", label: "INCOME" },
  { value: "SUSPENSE", label: "SUSPENSE" },
];

export function unexplainedHead(row: GridRow | null): string {
  if (!row) return "Pick a line above";
  return `Line ${istClock(text(row, "asl_txn_on"))} · ${formatMoney(row.asl_gross_amount)} · ${text(row, "tender_name")}`;
}

export function unexplainedFacts(row: GridRow | null): string {
  if (!row) return "";
  return (
    `Payout ${shortDate(text(row, "asi_payout_date"))} (${text(row, "asi_payout_ref")}) · ` +
    `RRN / UTR ${text(row, "asl_ref_no")} · payer ${text(row, "asl_payer")} · ${text(row, "age_days")} day(s) in suspense`
  );
}

export type ResolveForm = {
  resolution: Resolution;
  reasonId: string;
  /** LINKED: the bill's tender row, from the picker (grid 154). */
  linkRow: GridRow | null;
  incomeLedgerId: string;
  notes: string;
};

export const LINK_ROW_PLACEHOLDER = "pick a pending row of this tender…";

export function linkRowText(row: GridRow | null): string {
  if (!row) return LINK_ROW_PLACEHOLDER;
  return `${text(row, "doc_refno")} · ${text(row, "tender_name")} · ${formatMoney(row.outstanding)}`;
}

export const RESOLVE_OVERRIDE_TITLE =
  "Needs the Settlement Reconciliation override right (stands in for SETTLEMENT_RESOLVE)";
export const WRITE_OFF_OVERRIDE_TITLE =
  "Needs the Settlement Reconciliation override right (stands in for NONCASH_WRITE_OFF)";

export function resolveState(
  row: GridRow | null,
  form: ResolveForm,
  options: { busy: boolean; canOverride: boolean },
): { canResolve: boolean; title: string; incomeEnabled: boolean; pickEnabled: boolean } {
  const linkOk = form.resolution !== "LINKED" || form.linkRow !== null;
  const incomeOk = form.resolution !== "INCOME" || form.incomeLedgerId !== "";
  // A line is resolved only once its payout is posted (its money sits in Tender suspense).
  const posted = row !== null && text(row, "asi_status") === "POSTED";
  return {
    canResolve:
      !options.busy && row !== null && posted && form.reasonId !== "" && linkOk && incomeOk && options.canOverride,
    title:
      row !== null && !posted
        ? "Post the payout first (Match tab) — until then the line is not in suspense"
        : RESOLVE_OVERRIDE_TITLE,
    incomeEnabled: form.resolution === "INCOME",
    pickEnabled: form.resolution === "LINKED",
  };
}

export function resolveBody(scope: Scope, row: GridRow, form: ResolveForm) {
  return {
    companyId: scope.companyId,
    branchId: scope.branchId,
    accYear: text(row, "asl_acc_year"),
    aslId: text(row, "asl_id"),
    resolution: form.resolution,
    reasonId: form.reasonId,
    notes: nullable(form.notes),
    ...(form.resolution === "LINKED" && form.linkRow
      ? { tdId: text(form.linkRow, "td_id"), tdAccYear: text(form.linkRow, "td_acc_year") }
      : {}),
    ...(form.resolution === "INCOME" ? { incomeLedgerId: form.incomeLedgerId } : {}),
  };
}

export function resolveDoneText(voucherRefno: string): string {
  return voucherRefno ? `Resolved — ${voucherRefno}` : "Resolved — no voucher.";
}

// ── the two read-only lists ───────────────────────────────────────────────

export const DUPLICATES_HINT =
  "Card rows repeating another live row's approval code + last 4 + amount (company-wide).";
export const SUSPENSE_HINT = "Every Tender suspense leg and the document behind it.";

// ── the row picker (grid 154 PICK ROW) ────────────────────────────────────

export function pickerHint(lineKind: string): string {
  const kind = lineKind || "SALE";
  if (kind === "REFUND") return "Our refund rows still waiting to be paid out. Enter or double-click picks one.";
  if (kind === "CHARGEBACK") {
    return "Our rows already settled that a chargeback may take back. Enter or double-click picks one.";
  }
  return "Our tender rows still waiting for their money (PENDING / PARTIAL). Enter or double-click picks one.";
}

/** Grid 154 binds every token; blank = no bound. Only this payout's tender (TD_NOT_CANDIDATE otherwise). */
export function pickRowGridParams(
  scope: Scope,
  tenderId: string,
  lineKind: string,
): Record<string, string> {
  return {
    itd_company_id: scope.companyId,
    itd_branch_id: scope.branchId,
    itender_id: tenderId,
    iline_kind: lineKind || "SALE",
    ifrom_date: "",
    ito_date: "",
  };
}
