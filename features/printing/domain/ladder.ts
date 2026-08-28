/**
 * The resolution ladder: which design a counter actually gets.
 *
 * -- THE ONE RULE THIS FILE EXISTS TO ENFORCE ------------------------------
 *
 * NOTHING HERE DECODES `ptaSpecificity`. The number is derived in the database,
 * and it has ALREADY CHANGED ONCE under a client that was reading it:
 *
 *   applied migration (20260827121000)   CASE device -> 2, branch -> 1, else 0
 *   the correction    (20260827140000)   counter 3, branch 2, company 1,
 *                                        every company 0
 *
 * The correction is applied and the numbering is settled, but the rule stands
 * for the reason the rewrite proves rather than despite it: a decode would have
 * silently relabelled every counter override as a branch override the morning
 * that migration ran, on a screen whose whole job is telling those apart.
 *
 * So the rung is derived from THE ROW'S OWN SCOPE COLUMNS, which mean the same
 * thing under every numbering. The server now also decodes the number itself --
 * `ptaScope` on every list row, `scope` on a resolution -- and those words are
 * what a resolved winner is labelled with. `ptaSpecificity` is carried through
 * untouched, for display only, and is never compared, sorted on, or switched
 * on.
 *
 * -- AND THE ONE THIS FILE REFUSES TO DO -----------------------------------
 *
 * It does not resolve. Narrowest-wins is a generated column plus a covering
 * index (`ix_pta_resolve`) on the server, and `GET /print-template-assignments/
 * resolve` answers with it. A front-end that re-derives the winner drifts from
 * the thing that actually prints. `rungOf` classifies a row you already have;
 * it never picks between rows.
 */

import type { PrintTemplateAssignmentPayload, PtaScope, Scope } from "../types/printing";

/**
 * Four rungs, narrowest first.
 *
 * EVERY_COMPANY is a shipped assignment that resolves for every tenant, and it
 * is REAL now: `20260827140000_correct_print_template_assignment` made
 * `pta_company_id` nullable, so rows arrive on this rung and the save DTO
 * accepts them. It may only ever name a SHIPPED design -- `ck_pta_template_scope`
 * refuses a private one, because otherwise one company's logo and address would
 * print on every other company's paper.
 *
 * The server calls this rung GLOBAL. The word here is the one the screen shows;
 * `rungOfServerScope` is the boundary between the two vocabularies.
 */
export const RUNGS = ["COUNTER", "BRANCH", "COMPANY", "EVERY_COMPANY"] as const;
export type Rung = (typeof RUNGS)[number];

export const RUNG_LABEL: Record<Rung, string> = {
  COUNTER: "Counter",
  BRANCH: "Branch",
  COMPANY: "Company",
  EVERY_COMPANY: "Every company",
};

/** How narrow a rung is; higher wins. Ordinal, and unrelated to `ptaSpecificity`. */
export const RUNG_ORDER: Record<Rung, number> = {
  EVERY_COMPANY: 0,
  COMPANY: 1,
  BRANCH: 2,
  COUNTER: 3,
};

/** The three scope columns, as either an assignment payload or a form in progress. */
export type AssignmentScope = {
  ptaCompanyId?: string | null;
  ptaBranchId?: string | null;
  ptaDeviceId?: string | null;
};

/**
 * Which rung a row sits on, read off its own scope columns.
 *
 * A device implies a branch (`ck_pta_device_needs_branch`) and a branch implies
 * a company (`ck_pta_branch_needs_company` in the authoritative schema), so the
 * narrowest id that is set is the answer. A row that violates those -- a device
 * with no branch -- is classified by the device anyway: it is what the row says
 * it is, and `scopeIncoherence` below is what reports it.
 */
export function rungOf(scope: AssignmentScope): Rung {
  if (scope.ptaDeviceId) return "COUNTER";
  if (scope.ptaBranchId) return "BRANCH";
  if (scope.ptaCompanyId) return "COMPANY";
  return "EVERY_COMPANY";
}

export function rungLabelOf(scope: AssignmentScope): string {
  return RUNG_LABEL[rungOf(scope)];
}

/**
 * The CHECK constraints a scope has to satisfy, as a sentence or null.
 *
 * Both are real CHECKs on the table now (`ck_pta_device_needs_branch`,
 * `ck_pta_branch_needs_company`) and the service states both as field-level
 * errors. This is here so a form can say it BEFORE the round trip, not because
 * the server would miss it.
 */
export function scopeIncoherence(scope: AssignmentScope): string | null {
  if (scope.ptaDeviceId && !scope.ptaBranchId) {
    return "A counter belongs to a branch — name the branch too.";
  }
  if (scope.ptaBranchId && !scope.ptaCompanyId) {
    return "A branch belongs to a company — name the company too.";
  }
  return null;
}

/**
 * The server's decoded scope word, widened to a rung.
 *
 * It reads both vocabularies because they are the same one: `scope` on a
 * resolution and `ptaScope` on a list row are generated from a single
 * `PTA_SCOPE_BY_SPECIFICITY` map on the server. GLOBAL is its name for the rung
 * this screen calls "every company".
 *
 * The `never` below is load-bearing: it is what failed to compile the morning
 * the server gained GLOBAL, instead of letting an every-company row fall
 * through to a wrong label.
 */
export function rungOfServerScope(scope: Scope | PtaScope): Rung {
  switch (scope) {
    case "COUNTER":
      return "COUNTER";
    case "BRANCH":
      return "BRANCH";
    case "COMPANY":
      return "COMPANY";
    case "GLOBAL":
      return "EVERY_COMPANY";
    default: {
      const unreachable: never = scope;
      return unreachable;
    }
  }
}

/**
 * The previous name for the same function, kept so a call site that only ever
 * sees a resolution reads as what it is.
 */
export const rungOfResolvedScope = rungOfServerScope;

/**
 * Group a company's assignments by purpose and rung, for the section 8 matrix.
 *
 * Deliberately NOT a resolution: the returned cells are what is CONFIGURED at
 * each rung, and "Effective here" is a separate column fed by `/resolve`. The
 * two disagreeing is exactly the thing the screen exists to show -- a
 * company-wide row that a counter override quietly beats.
 *
 * Only rows in scope for the selected branch and counter are placed. A row for
 * some other branch is not a blank cell in this branch's column; it belongs to
 * a different question and is dropped.
 */
export type MatrixCell = PrintTemplateAssignmentPayload | null;
export type MatrixRow = { purposeId: string; cells: Record<Rung, MatrixCell> };

export function buildAssignmentMatrix(
  assignments: PrintTemplateAssignmentPayload[],
  view: { branchId: string | null; deviceId: string | null },
): Map<string, Record<Rung, MatrixCell>> {
  const byPurpose = new Map<string, Record<Rung, MatrixCell>>();

  for (const assignment of assignments) {
    const rung = rungOf(assignment);
    if (rung === "BRANCH" && assignment.ptaBranchId !== view.branchId) continue;
    if (rung === "COUNTER" && assignment.ptaDeviceId !== view.deviceId) continue;

    const cells =
      byPurpose.get(assignment.ptaPurposeId) ??
      ({ COUNTER: null, BRANCH: null, COMPANY: null, EVERY_COMPANY: null } as Record<
        Rung,
        MatrixCell
      >);
    // `ux_pta_scope` makes a second row on one rung impossible in the database;
    // if one arrives anyway the first is kept rather than silently overwritten.
    if (cells[rung] === null) {
      cells[rung] = assignment;
    }
    byPurpose.set(assignment.ptaPurposeId, cells);
  }

  return byPurpose;
}
