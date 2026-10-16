/**
 * When a line document (bill, quotation, order) on screen is worth bringing back
 * after the operator leaves the screen — see `lib/screen-memory`.
 *
 * Kept:
 *   - operator work: anything dirty (a new document, a draft edit, an amend);
 *   - a resumed held cart — it carries a lease and parked content even before
 *     the first edit;
 *   - a document filled but not yet touched: an import, a recovered autosave,
 *     a copy-as-new.
 * Not kept — these reload from the server, or there is nothing to lose:
 *   - a blank document, even with the walk-in customer and the automatic
 *     charges seeded (both are non-edits);
 *   - a stored document being browsed, or a saved one that is no longer dirty;
 *   - a deleted one.
 */
import { screenMemory, type ScreenScope } from "@/lib/screen-memory";

/** Screen-memory slots of the line-document screens. */
export const SALE_BILL_MEMORY_KEY = "sales/sale-bill";
export const TESTBILL_MEMORY_KEY = "sales/testbill";
export const QUOTATION_MEMORY_KEY = "sales/quotation";
export const SALE_ORDER_MEMORY_KEY = "sales/sale-order";

export type RememberableLineDocument = {
  mode: string;
  isDirty: boolean;
  isDeleted?: boolean;
  docId: string | null;
  holdId?: string | null;
  companyId: string;
  branchId: string;
  accYear: string;
  lines: ReadonlyArray<{ itemId?: string | null }>;
};

export function isLineDocumentWorthRemembering(draft: RememberableLineDocument): boolean {
  if (draft.mode !== "entry" || draft.isDeleted) {
    return false;
  }
  if (draft.holdId || draft.isDirty) {
    return true;
  }
  return !draft.docId && draft.lines.some((line) => Boolean(line.itemId));
}

/** The tenant a document belongs to — its own, not the session's. */
export function documentScopeOf(draft: RememberableLineDocument): ScreenScope {
  return {
    companyId: draft.companyId,
    branchId: draft.branchId,
    accYear: draft.accYear,
  };
}

export function sameScope(a: ScreenScope, b: ScreenScope): boolean {
  return a.companyId === b.companyId && a.branchId === b.branchId && a.accYear === b.accYear;
}

/**
 * A slice-held document (Sale Bill, quotation, order live in Redux, so they
 * outlive the screen) can be resumed only when it is still worth it — a save
 * that finished after the screen was left has cleaned it — and belongs to the
 * tenant now on the header.
 */
export function canResumeLineDocument(
  draft: RememberableLineDocument,
  scope: ScreenScope,
): boolean {
  return isLineDocumentWorthRemembering(draft) && sameScope(documentScopeOf(draft), scope);
}

/**
 * Where a slice-held screen resumes from, if at all.
 *
 *   - nothing remembered for this tenant → no resume. The slice may still hold
 *     a dirty document, but the operator discarded it (Back) or a save landed
 *     after the screen was gone: it must not come back;
 *   - the slice still holds a document worth resuming in this tenant → the
 *     LIVE one: it is the same document, plus whatever async result (a price
 *     lookup) landed after the screen was gone;
 *   - otherwise the remembered one, put back into the slice — the slice has
 *     since been reused for another tenant's document.
 */
export function sliceResumeSource<T extends RememberableLineDocument>(
  live: T,
  recalled: T | null,
  scope: ScreenScope,
): "live" | "recalled" | null {
  if (!recalled) {
    return null;
  }
  if (canResumeLineDocument(live, scope)) {
    return "live";
  }
  return canResumeLineDocument(recalled, scope) ? "recalled" : null;
}

/**
 * `sliceResumeSource` against what screen memory holds for this screen — shared
 * by a page (open on the list / a new form, or on the remembered document?) and
 * its draft hook (which document?), so the two always agree.
 */
export function resumeFromScreenMemory<T extends RememberableLineDocument>(
  live: T,
  memoryKey: string,
  scope: ScreenScope,
): { source: "live" | "recalled"; recalled: T } | null {
  const recalled = screenMemory.recall<T>(memoryKey, scope);
  const source = sliceResumeSource(live, recalled, scope);
  return source && recalled ? { source, recalled } : null;
}

/** The restore notice — shared with every screen that uses screen memory. */
export { RESTORED_MESSAGE_OPTIONS, restoredMessage } from "@/lib/screen-memory";
