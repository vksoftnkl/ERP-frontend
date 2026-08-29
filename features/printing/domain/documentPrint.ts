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
 * There is no company, no branch and no counter here, and there is deliberately
 * nowhere to put one: all three are claims on the access token, and the last two
 * are the rungs the assignment ladder resolves by, so a screen able to name them
 * would be a screen choosing its own design. The counter is the one that used to
 * bite — this client holds two ids called "device" and only `userInfo.deviceId`
 * is a real `fixed.device_master` row, so sending the other resolved nothing and
 * then failed `fk_plg_device` after the paper had already been rendered.
 */
export type DocumentPrintTarget = {
  /** The document. */
  docId: string;
  /**
   * The DOCUMENT's accounting year, where it may not be the current one — a
   * reprint of last year's paper reads last year's partition.
   *
   * Optional, and left out for anything printed in the year it was raised: the
   * server binds the company's own `fiscal_years.fy_is_current`, which is a
   * better answer than a screen restating what it read out of the same session.
   */
  accYear?: string;
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
  const accYear = trimmed(target.accYear);

  if (!docId) {
    throw new Error("There is no saved document to print yet.");
  }

  const srcModule = trimmed(target.srcModule);
  const srcDocType = trimmed(target.srcDocType);
  const filename = trimmed(target.filename);

  return {
    purposeId,
    docId,
    // Only when the document actually carries one. Blank means "the year this
    // session is working in", which the server answers better than this can.
    ...(accYear ? { accYear } : {}),
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
