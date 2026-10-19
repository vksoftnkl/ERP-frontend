/**
 * Turning "print this quotation" into a request the renderer accepts.
 *
 * -- THE ONE THING A SCREEN CANNOT KNOW ------------------------------------
 *
 * `POST /print-render/print` is addressed by `purposeId`, a uuid, and a screen
 * has no business holding one. Section 12 is explicit that a hard-coded list of
 * purposes is exactly 3.0's `PrintUtil(this, 9)` — an integer that meant "sales
 * bill" at ten call sites with nothing anywhere saying so.
 *
 * A CODE is not that. `print_purpose.ppo_code` is a stable, readable key with a
 * UNIQUE index behind it, and `SALE_QUOTATION` at a call site says what it
 * prints. What must never be written down is the ID, which differs per install
 * (they are generated) and would silently print the wrong document if the seed
 * ran twice. So a screen names the code, this resolves it against the rows the
 * purposes dropdown actually returned, and a missing row is an error the
 * operator can act on rather than a 400 from the server.
 *
 * -- WHY THE LOOKUP CAN LEGITIMATELY FIND NOTHING --------------------------
 *
 * The catalogue comes from configured dropdown 47 (`api/purposes.ts`), which is
 * data: an unprovisioned environment answers empty. That is not a bug to throw
 * on, it is a deployment that has not been set up, and `purposeNotConfigured`
 * is the sentence that says so.
 */

import type { PrintDocumentRequest } from "@/features/printing/api/render";
import type { PrintPurposeRef } from "@/features/printing/types/printing";

/**
 * The purpose codes this client prints from, as codes.
 *
 * NOT a catalogue — the catalogue is a table and a site may add to it. This is
 * only the set of codes a screen in this build actually names, so that a typo
 * fails the build rather than the print.
 */
export const PURPOSE_CODE = {
  SALE_QUOTATION: "SALE_QUOTATION",
  SALE_ORDER: "SALE_ORDER",
  SALE_INVOICE: "SALE_INVOICE",
  RECEIPT_VOUCHER: "RECEIPT_VOUCHER",
  EXPENSE_VOUCHER: "EXPENSE_VOUCHER",
  /** docId = the ledger (led_id); the period and the screen's switches are the revision's prompts. */
  LEDGER_STATEMENT: "LEDGER_STATEMENT",
  /** docId = the company (the report names no document); the filters are the revision's prompts. */
  PARTY_OUTSTANDING: "PARTY_OUTSTANDING",
  /** Notes 117 §7 — docId = tss_id: a closed session's Z, a live one's X read. */
  TILL_SESSION_Z: "TILL_SESSION_Z",
  TILL_SESSION_X: "TILL_SESSION_X",
  /** Notes 117 §7 — docId = tbd_id: the day X while open, the store Z once closed. */
  TILL_DAY_Z: "TILL_DAY_Z",
  /**
   * Notes 135 — docId = tcm_id, accYear = tcm_acc_year: the slip of one cash
   * movement (every kind but a REMIT), and the memo that goes with a
   * remittance's cash (two copies: bank / agency, store).
   */
  TILL_MOVEMENT: "TILL_MOVEMENT",
  TILL_REMIT: "TILL_REMIT",
} as const;

export type PurposeCode = (typeof PURPOSE_CODE)[keyof typeof PURPOSE_CODE];

/** Case-insensitively, because `ppo_code` is seeded through `lower()` comparisons. */
export function findPurposeByCode(
  purposes: PrintPurposeRef[] | undefined,
  code: string,
): PrintPurposeRef | null {
  const wanted = code.trim().toLowerCase();
  if (!wanted) return null;
  return (purposes ?? []).find((purpose) => purpose.ppoCode?.toLowerCase() === wanted) ?? null;
}

/** What to tell an operator whose install has no such purpose row. */
export function purposeNotConfigured(code: string): string {
  return (
    `Nothing is set up to print "${code}" here. ` +
    "Add the purpose and assign a template under Settings › Printing."
  );
}

/**
 * The document, and nothing about who is printing it.
 *
 * There is no counter here, and there is deliberately nowhere to put one: it
 * is a claim on the access token and a rung the assignment ladder resolves by,
 * so a screen able to name it would be a screen choosing its own design. The
 * branch is the same claim, and is left out by every screen but the till's
 * prints, which name the DOCUMENT's branch (Qt c77f3f1) because a session or a
 * day is printed from the office, not the counter it ran on. The counter is the
 * one that used to bite —
 * this client holds two ids called "device" and only `userInfo.deviceId` is a
 * real `fixed.device_master` row, so sending the other resolved nothing and then
 * failed `fk_plg_device` after the paper had already been rendered.
 *
 * The company IS here, and it is the DOCUMENT's — read off the row, never off
 * the header picker. The token carries the user's home company, the header may
 * be on another, and every dataset filters on `:company_id`: a bill raised in
 * the working company printed as blank paper until its own company travelled
 * with the request.
 */
export type DocumentPrintTarget = {
  /** The document. */
  docId: string;
  /**
   * The document's own company, from the row. Optional only for a caller that
   * has no row in hand; left out, the server binds the token's company.
   */
  companyId?: string;
  /**
   * The DOCUMENT's accounting year, where it may not be the current one — a
   * reprint of last year's paper reads last year's partition.
   *
   * Optional, and left out for anything printed in the year it was raised: the
   * server binds the company's own `fiscal_years.fy_is_current`, which is a
   * better answer than a screen restating what it read out of the same session.
   */
  accYear?: string;
  /**
   * The DOCUMENT's branch — binds :branch_id and the branch.profile letterhead
   * (Qt c77f3f1). Left out, the server binds the token's branch, which need not
   * be the document's: the till prints name it, every other screen leaves it.
   */
  branchId?: string;
  /** Recorded on the print log's source quad; each defaults to the purpose's own. */
  srcModule?: string;
  srcDocType?: string;
  copies?: number;
  isReprint?: boolean;
  /** Filename stem for the download, without extension. */
  filename?: string;
  params?: Record<string, unknown>;
};

/**
 * The request, with blanks omitted rather than sent empty.
 *
 * `accYear: ""` would fail the server's shape check, while an absent one is a
 * legitimate print — the current fiscal year is bound in its place. Same
 * reasoning as `buildPreviewRequest`, and the same rule.
 */
export function buildDocumentPrintRequest(
  purposeId: string,
  target: DocumentPrintTarget,
): PrintDocumentRequest {
  const trimmed = (value: string | null | undefined): string | undefined => {
    const text = (value ?? "").trim();
    return text.length > 0 ? text : undefined;
  };

  const docId = trimmed(target.docId);
  const companyId = trimmed(target.companyId);
  const accYear = trimmed(target.accYear);
  const branchId = trimmed(target.branchId);

  if (!docId) {
    throw new Error("There is no saved document to print yet.");
  }

  const srcModule = trimmed(target.srcModule);
  const srcDocType = trimmed(target.srcDocType);
  const filename = trimmed(target.filename);

  return {
    purposeId,
    docId,
    // The row's company. Blank means the token's, which is only right while
    // the header picker and the token agree.
    ...(companyId ? { companyId } : {}),
    // Only when the document actually carries one. Blank means "the year this
    // session is working in", which the server answers better than this can.
    ...(accYear ? { accYear } : {}),
    ...(branchId ? { branchId } : {}),
    ...(srcModule ? { srcModule } : {}),
    ...(srcDocType ? { srcDocType } : {}),
    ...(filename ? { filename } : {}),
    // Only when it actually overrides something: the assignment and the purpose
    // already agree on a copy count, and 1 is not the same as "leave it alone".
    ...(target.copies && target.copies > 0 ? { copies: target.copies } : {}),
    // Sent only when true — false is the server's default, and this subsystem's
    // query booleans have a history (`enableImplicitConversion`) of reading a
    // sent `false` as true. A body boolean is safe, but saying nothing is safer.
    ...(target.isReprint ? { isReprint: true } : {}),
    ...(target.params && Object.keys(target.params).length > 0 ? { params: target.params } : {}),
  };
}
