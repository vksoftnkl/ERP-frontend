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

export type DocumentPrintTarget = {
  /** The document. */
  docId: string;
  /** The DOCUMENT's accounting year, not today's — a reprint of last year's paper. */
  accYear: string;
  branchId?: string | null;
  /** Recorded on the print log's source quad; each defaults to the purpose's own. */
  srcModule?: string;
  srcDocType?: string;
  copies?: number;
  isReprint?: boolean;
  /** Filename stem for the download, without extension. */
  filename?: string;
  params?: Record<string, unknown>;
  /**
   * The COUNTER — a real `fixed.device_master` row, and the narrowest rung of
   * the assignment ladder.
   *
   * It is the id the LOGIN RESPONSE carries (`userInfo.deviceId`), never
   * `getOrCreateClientDeviceId()`: that one is a localStorage `randomUUID`
   * minted for the transaction-hold lock and names no device row, so sending it
   * would resolve nothing and then fail `fk_plg_device` after the paper had
   * been rendered. Omitted when the session has none, which resolves the ladder
   * from the branch up.
   */
  deviceId?: string | null;
};

/**
 * The request, with blanks omitted rather than sent empty.
 *
 * `branchId: ""` would reach the server as a uuid that fails validation, while
 * an absent branch is a legitimate render — it simply resolves the ladder one
 * rung wider. Same reasoning as `buildPreviewRequest`, and the same rule.
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
  if (!accYear) {
    throw new Error(
      "This document carries no accounting year, and the renderer needs it to find the rows.",
    );
  }

  const branchId = trimmed(target.branchId);
  const deviceId = trimmed(target.deviceId);
  const srcModule = trimmed(target.srcModule);
  const srcDocType = trimmed(target.srcDocType);
  const filename = trimmed(target.filename);

  return {
    purposeId,
    docId,
    accYear,
    ...(branchId ? { branchId } : {}),
    ...(deviceId ? { deviceId } : {}),
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
