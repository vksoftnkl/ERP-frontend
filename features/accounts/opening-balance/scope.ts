/**
 * SCOPE — the thing to understand before anything else on this screen.
 *
 * `ux_op_scope` is `(company, COALESCE(branch, 0-uuid), year, ledger)`, so a
 * NULL branch is A SCOPE OF ITS OWN, not a wildcard:
 *
 *     "This branch"  → branchId sent     → that branch's own set
 *     "All branches" → branchId is null  → the COMPANY-LEVEL set (op_branch_id IS NULL)
 *
 * These are two different sets of rows. Neither trial balance can see the
 * other, and nothing merges them. "All branches" is the Qt screen's wording,
 * kept because the operators know it; every tooltip and subtitle beside it says
 * "company-level set" instead.
 *
 * `acc_bill_balance.abl_branch_id` is NOT NULL, so a bill always has a branch —
 * which is why a bill-wise party's opening can only live in a BRANCH set, and
 * the breakup panel is shut under the company-level one.
 */
import type { Scope } from "./opening-balance.types";

export type ScopeMode = "branch" | "company";

/** The combo's two labels, as the desktop screen words them. */
export const SCOPE_LABELS: Record<ScopeMode, string> = {
  branch: "This branch",
  company: "All branches",
};

/** What the label actually means, for the tooltip and the subtitle. */
export const SCOPE_DESCRIPTIONS: Record<ScopeMode, string> = {
  branch: "This branch's own opening set.",
  company:
    "The company-level set (op_branch_id IS NULL) — a set of its own, not every branch merged.",
};

export function scopeOf(
  mode: ScopeMode,
  companyId: string,
  branchId: string,
  accYear: string,
): Scope {
  return {
    companyId,
    branchId: mode === "branch" ? branchId || null : null,
    accYear,
  };
}

/** Two scopes are the same set when all three parts match. */
export function sameScope(left: Scope | null, right: Scope | null): boolean {
  if (!left || !right) {
    return left === right;
  }
  return (
    left.companyId === right.companyId &&
    left.branchId === right.branchId &&
    left.accYear === right.accYear
  );
}

/** A cache key / render key for one set. */
export function scopeSignature(scope: Scope): string {
  return `${scope.companyId}|${scope.branchId ?? ""}|${scope.accYear}`;
}

const ACC_YEAR = /^(\d{4})-(\d{4})$/;

/**
 * The year before an accounting year — arithmetic on the FIRST half, never a
 * date calculation.
 *
 * `ck_op_acc_year` requires the second half to be the first plus one, so
 * `"2026-2027"` → `"2025-2026"`. Anything that is not `YYYY-YYYY`, or whose
 * halves do not follow, returns null and the caller says so rather than sending
 * a year the check will refuse.
 */
export function previousAccYear(accYear: string): string | null {
  const match = ACC_YEAR.exec((accYear ?? "").trim());
  if (!match) {
    return null;
  }
  const first = Number(match[1]);
  const second = Number(match[2]);
  if (second !== first + 1) {
    return null;
  }
  return `${first - 1}-${first}`;
}

/** Whether a year string is one `ck_op_acc_year` would accept. */
export function isAccYear(accYear: string): boolean {
  const match = ACC_YEAR.exec((accYear ?? "").trim());
  return match !== null && Number(match[2]) === Number(match[1]) + 1;
}
