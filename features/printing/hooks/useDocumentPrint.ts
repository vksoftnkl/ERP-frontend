"use client";

/**
 * The print button, for any screen that has a saved document.
 *
 * -- WHAT THIS OWNS, AND WHY IT IS NOT IN THE SCREEN -----------------------
 *
 * Three things, none of which a sales screen should be carrying:
 *
 *   1. Turning a purpose CODE into the id the renderer is addressed by. See
 *      `domain/documentPrint.ts` for why the id is never written down.
 *   2. The request itself, and the fact that the company and the counter are
 *      NOT part of it (`api/render.ts` has both reasons).
 *   3. Getting bytes in front of a printer, which is the part below that looks
 *      like it should be one line and is not.
 *
 * -- GETTING THE BYTES TO A PRINTER IS NOT THIS HOOK'S JOB -----------------
 *
 * `print-delivery.ts` owns that, at module scope, and it explains at length why
 * it has to: the print dialog keeps reading the document for as long as the
 * operator takes to choose a printer, so a React tree that owned the frame
 * would revoke the blob mid-print on unmount and print a blank page.
 *
 * -- A RAW PRINTER STREAM HAS NOWHERE TO GO --------------------------------
 *
 * A GRID design renders to ESCPOS, which is bytes for a queue rather than a
 * document a browser can display. There is no browser API that reaches a
 * printer queue, so this says so plainly instead of showing an operator a
 * window full of control codes and letting them think it failed silently.
 */

import { useCallback } from "react";
import { toast } from "react-toastify";
import { usePrintDocumentMutation } from "@/features/printing/api/render";
import { useGetPrintPurposeOptionsQuery } from "@/features/printing/api/purposes";
import {
  buildDocumentPrintRequest,
  findPurposeByCode,
  purposeNotConfigured,
  type DocumentPrintTarget,
} from "@/features/printing/domain/documentPrint";
import { sendToPrinter } from "@/features/printing/print-delivery";
import { getApiErrorMessage } from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { selectUserInfo } from "@/store/slices/authSlice";

export type UseDocumentPrintOptions = {
  /** Scopes the purpose catalogue: the shipped rows plus this company's own. */
  companyId: string | null;
  /** `PURPOSE_CODE.SALE_QUOTATION` and friends — never an id. */
  purposeCode: string;
};

export type UseDocumentPrintResult = {
  /** Resolves true when a document reached a printer dialog. */
  print: (target: DocumentPrintTarget) => Promise<boolean>;
  /** A render is in flight; the button should say so and not fire twice. */
  isPrinting: boolean;
  /**
   * False only while the purpose catalogue is still loading. The button stays
   * clickable — a click during that window waits for the query rather than
   * being refused, because a disabled button an operator cannot interrogate is
   * the thing this codebase avoids elsewhere.
   */
  isReady: boolean;
};

export function useDocumentPrint(
  options: UseDocumentPrintOptions,
): UseDocumentPrintResult {
  const { companyId, purposeCode } = options;

  const { data: purposes, isLoading: purposesLoading } =
    useGetPrintPurposeOptionsQuery({
      companyId: companyId?.trim() ? companyId : null,
    });
  /*
   * The counter this session signed in as — the login response's `device_id`,
   * which IS a `fixed.device_master` row. Supplied here rather than by every
   * caller so no screen has to know which of this client's two device ids is
   * the real one; a caller may still override it on the target.
   */
  const sessionDeviceId =
    useAppSelector(selectUserInfo)?.deviceId?.trim() || undefined;
  const [printDocument, { isLoading: isPrinting }] = usePrintDocumentMutation();

  const print = useCallback(
    async (target: DocumentPrintTarget): Promise<boolean> => {
      const purpose = findPurposeByCode(purposes, purposeCode);
      if (!purpose) {
        toast.error(
          purposesLoading
            ? "Still loading what this installation can print — try again in a moment."
            : purposeNotConfigured(purposeCode),
        );
        return false;
      }

      let request;
      try {
        request = buildDocumentPrintRequest(purpose.ppoId, {
          deviceId: sessionDeviceId,
          // After the default, so a caller that names a counter wins.
          ...target,
        });
      } catch (error) {
        // The two throws in the builder are both sentences meant for an
        // operator: no saved document, or no accounting year on it.
        toast.error(
          error instanceof Error
            ? error.message
            : "This document cannot be printed.",
        );
        return false;
      }

      try {
        const result = await printDocument(request).unwrap();

        if (result.objectUrl) {
          sendToPrinter(result.objectUrl);
          return true;
        }

        // Rendered, logged, and unreachable from here. Named rather than
        // swallowed: the print log now has a row saying it printed.
        toast.warn(
          `The design assigned here renders to ${result.outputMode ?? "a raw printer stream"}, ` +
            "which a browser cannot send to a printer queue. Assign a PDF design to print from " +
            "this screen.",
        );
        return false;
      } catch (error) {
        // A 404 here usually means the printing module is unfinished for this
        // purpose — nothing assigned, or an assigned template with no published
        // revision. The server says which, in a sentence naming what to go and
        // do, so it is passed through rather than replaced.
        toast.error(
          getApiErrorMessage(error as never) ??
            "The document could not be printed.",
        );
        return false;
      }
    },
    [printDocument, purposeCode, purposes, purposesLoading, sessionDeviceId],
  );

  return { print, isPrinting, isReady: !purposesLoading };
}
