/**
 * Decide the safe difference — Qt `TillSafeDecideDialog` (ec9d92d, notes 118
 * §2) without the widgets: a safe gap still PENDING, from the Cash Office's
 * Decide — a safe count's difference (stage SAFE) or a bank that credited
 * other than a CIT remittance sent (stage REMIT).
 *
 * POST /till/safes/decide-variance: EXPENSE (Cash Short & Excess) or SUSPENSE
 * (clear it later by a journal — never RECOVER: a safe has no cashier), a
 * VARIANCE reason, the caller's till PIN under the SAFE_VARIANCE rule (their
 * Till Approval Authority grant must cover the amount). The rule as shipped is
 * two-person: a second person — never the caller, never whoever raised the
 * gap — signs with their own PIN. Grant, limit, PIN and the second signature
 * are the server's calls. Cash Office (287) OVERRIDE.
 */
import type { DropdownSelection } from "@/components/design-system/dropdown";
import type { TillSafeDecideBody } from "../shared/api/till-session-api";
import type { TillError } from "../shared/errors";
import { formatSignedMoney, paiseOf } from "../shared/money";
import { reasonsOf, type TillReason } from "../shared/reasons";
import type { TillSafeGapTreatment, TillSafePendingGap } from "../shared/wire/types";
import type { CashOfficeScope } from "./cash-office";

export type SafeDecideRequest = {
  scope: CashOfficeScope;
  /** One of the picked safe's `pendingGaps`. */
  gap: TillSafePendingGap;
  safeName: string;
};

export type SafeDecideForm = {
  treatment: TillSafeGapTreatment;
  reasonId: string;
  note: string;
  pin: string;
  /** Dropdown 68 (TILL APPROVER USERS): who signs with the caller. */
  second: DropdownSelection | null;
  secondPin: string;
};

export const EMPTY_SAFE_DECIDE: SafeDecideForm = {
  treatment: "EXPENSE",
  reasonId: "",
  note: "",
  pin: "",
  second: null,
  secondPin: "",
};

export const SAFE_TREATMENTS: readonly { value: TillSafeGapTreatment; label: string }[] = [
  { value: "EXPENSE", label: "Expense — Cash Short & Excess" },
  { value: "SUSPENSE", label: "Suspense — clear it later by a journal" },
];

export const SAFE_DECIDE_HINT =
  "Your approval limit must cover this amount. The safe rule needs two people: a second person, not you, " +
  "types their own till PIN.";

/** The usable VARIANCE reasons, "Pick a reason" first. */
export function safeDecideReasons(reasons: readonly TillReason[]): { value: string; label: string }[] {
  return [
    { value: "", label: "Pick a reason" },
    ...reasonsOf(reasons, "VARIANCE").map((reason) => ({ value: reason.id, label: reason.name })),
  ];
}

/** Where the gap came from. */
export function gapFromText(gap: TillSafePendingGap): string {
  if (gap.stage !== "REMIT") return "Safe count";
  return paiseOf(gap.variance) > 0 ? "Bank credited more than was sent" : "Bank credited less than was sent";
}

/** `−100.00  short` / `+50.00  extra`. */
export function gapDifference(gap: TillSafePendingGap): { text: string; short: boolean } {
  const paise = paiseOf(gap.variance);
  return { text: `${formatSignedMoney(paise)}${paise < 0 ? "  short" : "  extra"}`, short: paise < 0 };
}

/** Why it cannot be decided yet, or "" — the button's tooltip (Qt `problem`). */
export function safeDecideProblem(form: SafeDecideForm): string {
  if (!form.reasonId) return "Pick the reason.";
  if (!form.pin) return "Type your till PIN.";
  if (form.second?.id && !form.secondPin) return "The second person types their till PIN.";
  return "";
}

export function safeDecideBody(request: SafeDecideRequest, form: SafeDecideForm): TillSafeDecideBody {
  const body: TillSafeDecideBody = {
    companyId: request.scope.companyId,
    branchId: request.scope.branchId,
    accYear: request.gap.tvrAccYear,
    tvrId: request.gap.tvrId,
    treatment: form.treatment,
    reasonId: form.reasonId,
    approverPin: form.pin,
  };
  if (form.second?.id) {
    body.secondId = form.second.id;
    body.secondPin = form.secondPin;
  }
  const note = form.note.trim();
  if (note) body.notes = note;
  return body;
}

/**
 * Which PIN a refusal is about, typed again from empty (Qt): the second
 * person's (`secondPin` / `secondId`), else the caller's (any code naming
 * PIN, or `approverPin`), else none.
 */
export function safeDecideRefusalTarget(error: Pick<TillError, "code" | "field">): "second" | "pin" | null {
  if (error.field === "secondPin" || error.field === "secondId") return "second";
  if (error.code.includes("PIN") || error.field === "approverPin") return "pin";
  return null;
}
