/**
 * The legacy print dialog's five choices, as data.
 *
 * -- WHAT THE FIVE BUTTONS ACTUALLY DIFFER BY ------------------------------
 *
 * Only two of them are different ACTIONS. Print renders through the ladder and
 * appends to `print_log`; Preview, Format and Pdf all end on the canvas's
 * preview with a template and a document, and differ only in WHICH template
 * they pick:
 *
 *   Preview  the ladder's winner, from `/print-template-assignments/resolve`
 *   Pdf      the first assignment configured for the purpose
 *   Format   whichever assignment the operator chose from the list
 *
 * So this module is about picking a template, not about five behaviours. The
 * one thing it must never do is RESOLVE — narrowest-wins is a generated column
 * plus a covering index on the server (`domain/ladder.ts` says why at length),
 * and `resolve` is the only thing that answers it. `firstAssignment` below
 * orders by the same rungs for a STABLE pick, which is a different question
 * from which row wins.
 *
 * -- WHY THE PREVIEW ROUTE CARRIES A DOCUMENT ------------------------------
 *
 * The canvas's preview renders the revision's real datasets — there is no
 * sample data anywhere in this engine — so a design whose queries read a
 * document needs one named. The quotation's id rides in the URL and is seeded
 * into the dialog, which is what makes "Preview" from a bills list show THAT
 * bill rather than an empty page asking for an id.
 */

import { parseParams } from "./draft";
import { RUNG_ORDER, rungOfServerScope } from "./ladder";
import type { RenderPreviewRequest } from "../api/render";
import type {
  PrintTemplateAssignmentPayload,
  PrintTemplatePayload,
} from "../types/printing";

/** One row of the "Choose Printing Format" list. */
export type FormatOption = {
  /** The value the dropdown carries: a DESIGN is what is being chosen. */
  ptlId: string;
  /** What the dropdown reads — code, then name, the legacy "43 - SS-Sales Order" shape. */
  label: string;
};

/**
 * The designs an operator may choose between, from `/print-templates/list`.
 *
 * -- TEMPLATES, NOT ASSIGNMENTS --------------------------------------------
 *
 * Format is the button for "print this on something else", so it offers every
 * design DRAWN for this purpose, not only the ones a scope is currently wired
 * to. Those are different sets and the difference is the point: an assignment
 * is what a counter gets by default, and Format exists precisely for the times
 * that is not what is wanted — a second copy on letterhead, a costed version
 * for the office. Restricting it to assigned designs would make it a slower way
 * of doing what Preview already does.
 *
 * Pdf still takes the first ASSIGNMENT (`firstAssignment` below), because
 * "print it the usual way, without asking" is the opposite question.
 *
 * -- INACTIVE DESIGNS ARE NOT CHOICES --------------------------------------
 *
 * `ptlIsActive` false is a design withdrawn from use. It is left in the table
 * so that history and `print_log` still resolve, which is exactly why it must
 * not appear in a list of things to print now.
 */
export function templateFormatOptions(
  templates: readonly PrintTemplatePayload[] | undefined,
): FormatOption[] {
  return (templates ?? [])
    .filter((template) => template.ptlIsActive !== false)
    .map((template) => {
      const code = template.ptlCode?.trim();
      const name = template.ptlName?.trim();
      return {
        ptlId: template.ptlId,
        label: [code, name].filter(Boolean).join(" — ") || template.ptlId,
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}

/**
 * The assignments worth offering, narrowest rung first.
 *
 * Sorted rather than left in server order so that "the first one" means
 * something an operator can predict — the counter's own design before the
 * branch's, the branch's before the company's. Inactive and deleted rows are
 * dropped: they are not choices, they are history.
 *
 * NOT a resolution. Two rows can share a rung here (one PRINT, one PDF) and
 * neither beats the other; the ladder's tie-break is output mode, which is the
 * server's to apply.
 */
export function printableAssignments(
  assignments: readonly PrintTemplateAssignmentPayload[] | undefined,
  purposeId: string,
): PrintTemplateAssignmentPayload[] {
  return (assignments ?? [])
    .filter(
      (assignment) =>
        assignment.ptaPurposeId === purposeId &&
        assignment.ptaIsActive &&
        !assignment.ptaIsDeleted,
    )
    .slice()
    .sort((left, right) => {
      const byRung =
        RUNG_ORDER[rungOfServerScope(right.ptaScope)] -
        RUNG_ORDER[rungOfServerScope(left.ptaScope)];
      if (byRung !== 0) return byRung;
      // A stable, readable tie-break so the list does not reshuffle between
      // fetches — two rows on one rung differ by the paper they produce.
      return (left.ptaOutputMode ?? "").localeCompare(
        right.ptaOutputMode ?? "",
      );
    });
}

/** What "Pdf" prints without asking: the narrowest configured design. */
export function firstAssignment(
  assignments: readonly PrintTemplateAssignmentPayload[] | undefined,
  purposeId: string,
): PrintTemplateAssignmentPayload | null {
  return printableAssignments(assignments, purposeId)[0] ?? null;
}

/**
 * WHICH revision a document preview renders.
 *
 * In order: the one the caller named, then the PUBLISHED one, then the newest.
 *
 * The published one comes before the newest deliberately — a preview is
 * supposed to show what would actually print, and the newest revision of a
 * design under active editing is a draft nobody has approved. The newest is the
 * last resort rather than the first choice, and it is what makes a design with
 * NOTHING published still previewable: `publishedRevId` is null until somebody
 * publishes, and a DRAFT is the only thing there is to look at until then.
 *
 * Deleted revisions are never chosen; they are history, not candidates.
 */
export function revisionForPreview(
  template: PrintTemplatePayload | undefined,
  preferredPtvId?: string | null,
): string | null {
  const versions = (template?.versions ?? []).filter(
    (version) => !version.ptvIsDeleted,
  );
  if (versions.length === 0) return null;

  const named = preferredPtvId
    ? versions.find((version) => version.ptvId === preferredPtvId)
    : undefined;
  if (named) return named.ptvId ?? null;

  const published = template?.ptlPublishedRevId
    ? versions.find((version) => version.ptvId === template.ptlPublishedRevId)
    : undefined;
  if (published) return published.ptvId ?? null;

  const newest = versions.reduce((best, version) =>
    version.ptvRevNo > best.ptvRevNo ? version : best,
  );
  return newest.ptvId ?? null;
}

/**
 * The screen's prompt answers that the revision being rendered actually asks for.
 *
 * A report screen (the Ledger Statement) answers the prompts of the design it
 * was built against, but the design that prints is whatever the assignment
 * ladder or the operator's Format choice lands on, which may declare fewer of
 * them or none. The server refuses an answer to a prompt the revision lacks
 * (it is usually a typo when typed by hand), so sending the screen's whole set
 * would make every such design unprintable from the screen. Only the declared
 * names go, which is exactly what that design can use anyway.
 *
 * Returns undefined when the revision is not known yet. The dialog renders only
 * once a revision is chosen, so that state never reaches the wire.
 */
export function answersForRevision(
  template: PrintTemplatePayload | undefined,
  versionId: string | null,
  answers: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  if (!answers || !versionId) return undefined;
  const version = (template?.versions ?? []).find((one) => one.ptvId === versionId);
  if (!version) return undefined;

  const declared = new Set(parseParams(version.ptvParams).map((param) => param.name));
  return Object.fromEntries(Object.entries(answers).filter(([name]) => declared.has(name)));
}

export type DocumentPreviewInput = {
  /** The revision to render — `print_template_version.ptv_id`. */
  versionId: string;
  /**
   * The documents to render, in the order they should appear on the paper.
   *
   * One for the ordinary print button. SEVERAL when a list screen has ticked
   * more than one row and wants a single file out of them — see
   * `buildDocumentPreviewRequest` for which shape goes on the wire.
   */
  docIds: string[];
  /**
   * The DOCUMENT's company, from the row — binds :company_id.
   *
   * Left out, the server binds the token's company, which is the user's home
   * company and not necessarily the one the header picker is on. A document
   * raised in the working company reads as nothing under the wrong one.
   */
  companyId?: string | null;
  /**
   * The DOCUMENT's accounting year, so the render reads the right partition.
   *
   * Only where the document carries one that may not be the year the session is
   * working in — a quotation raised last year. Left out, the server binds the
   * company's current fiscal year, which is right for everything else.
   */
  accYear?: string | null;
  /**
   * The DOCUMENT's branch — binds :branch_id and the branch.profile letterhead.
   * Left out, the server binds the token's branch (the till prints send it).
   */
  branchId?: string | null;
  /** Answers to this revision's own prompts, by prompt name. */
  params?: Record<string, unknown>;
  /** Filename stem for the rendered file, without extension. */
  filename?: string | null;
};

/**
 * What a print button's Preview asks the renderer for.
 *
 * -- IT NEVER SENDS A BODY -------------------------------------------------
 *
 * The designer's own Preview may send the canvas's unsaved bands, because
 * somebody is editing them and wants to see them. THIS preview is a reading of
 * a document through a design that is already configured, and there is no
 * canvas in the room. Sending a body would be inventing one.
 *
 * That is also why there is no `editable` flag here: with no body to send, the
 * DRAFT-versus-published rule the server enforces cannot be tripped, so a
 * frozen revision and a draft are rendered by exactly the same request.
 *
 * The company is the DOCUMENT's, off the row. The counter is absent — a claim
 * on the access token and a rung of the assignment ladder. The branch is absent
 * too, except where a screen prints a document of a branch it may not be sat
 * at (the till's session Z / X and day Z, Qt c77f3f1): there the DOCUMENT's
 * branch binds :branch_id and the letterhead, and narrows the ladder with it.
 *
 * -- ONE DOCUMENT SENDS `docId`; SEVERAL SEND `docIds` ---------------------
 *
 * The server refuses both at once, and it is right to: they name the same
 * thing, and a render told its subject twice cannot report which answer it
 * used. So this picks exactly one of them, and the single-document request goes
 * on the wire byte-for-byte as it always has — a batch is a new shape for a new
 * case, not a re-spelling of the old one.
 */
export function buildDocumentPreviewRequest(
  input: DocumentPreviewInput,
): RenderPreviewRequest {
  const trimmed = (value: string | null | undefined): string | undefined => {
    const text = (value ?? "").trim();
    return text.length > 0 ? text : undefined;
  };

  // Blank ids are dropped rather than sent: a row whose id never loaded would
  // otherwise reach the server as an empty string and fail UUID validation for
  // the whole batch, losing the documents that were fine.
  const docIds = (input.docIds ?? [])
    .map((value) => trimmed(value))
    .filter((value): value is string => Boolean(value));

  if (docIds.length === 0) {
    throw new Error("There is no saved document to preview yet.");
  }

  const companyId = trimmed(input.companyId);
  const accYear = trimmed(input.accYear);
  const branchId = trimmed(input.branchId);
  const filename = trimmed(input.filename);

  return {
    versionId: input.versionId,
    ...(docIds.length === 1 ? { docId: docIds[0] } : { docIds }),
    ...(companyId ? { companyId } : {}),
    ...(accYear ? { accYear } : {}),
    ...(branchId ? { branchId } : {}),
    ...(filename ? { filename } : {}),
    ...(input.params && Object.keys(input.params).length > 0
      ? { params: input.params }
      : {}),
  };
}
