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
 * -- WHY AN IFRAME AND NOT `window.open` -----------------------------------
 *
 * A render is a round trip, so the object URL exists only inside an async
 * callback — by then the click's user-activation is spent and every popup
 * blocker treats `window.open` as unsolicited. A same-origin blob in a hidden
 * iframe needs no activation, and `contentWindow.print()` opens the operating
 * system's print dialog on the PDF directly, which is what the legacy screen's
 * button did.
 *
 * The URL and the frame therefore CANNOT be cleaned up when the call returns:
 * the dialog is still reading them. They live until the next print replaces
 * them, or the screen unmounts — which is also why this is a hook with a ref
 * and not a free function.
 *
 * -- A RAW PRINTER STREAM HAS NOWHERE TO GO --------------------------------
 *
 * A GRID design renders to ESCPOS, which is bytes for a queue rather than a
 * document a browser can display. There is no browser API that reaches a
 * printer queue, so this says so plainly instead of showing an operator a
 * window full of control codes and letting them think it failed silently.
 */

import { useCallback, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import { usePrintDocumentMutation } from "@/features/printing/api/render";
import { useGetPrintPurposeOptionsQuery } from "@/features/printing/api/purposes";
import {
  buildDocumentPrintRequest,
  findPurposeByCode,
  purposeNotConfigured,
  type DocumentPrintTarget,
} from "@/features/printing/domain/documentPrint";
import { getApiErrorMessage } from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { selectUserInfo } from "@/store/slices/authSlice";

type Delivery = { frame: HTMLIFrameElement; objectUrl: string };

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

export function useDocumentPrint(options: UseDocumentPrintOptions): UseDocumentPrintResult {
  const { companyId, purposeCode } = options;

  const { data: purposes, isLoading: purposesLoading } = useGetPrintPurposeOptionsQuery({
    companyId: companyId?.trim() ? companyId : null,
  });
  /*
   * The counter this session signed in as — the login response's `device_id`,
   * which IS a `fixed.device_master` row. Supplied here rather than by every
   * caller so no screen has to know which of this client's two device ids is
   * the real one; a caller may still override it on the target.
   */
  const sessionDeviceId = useAppSelector(selectUserInfo)?.deviceId?.trim() || undefined;
  const [printDocument, { isLoading: isPrinting }] = usePrintDocumentMutation();

  const delivery = useRef<Delivery | null>(null);

  const release = useCallback(() => {
    const current = delivery.current;
    if (!current) return;
    delivery.current = null;
    current.frame.remove();
    URL.revokeObjectURL(current.objectUrl);
  }, []);

  // The last render is still held when the screen goes away — a blob URL that
  // outlives its document is a leak the tab keeps until it is closed.
  useEffect(() => release, [release]);

  const deliver = useCallback(
    (objectUrl: string) => {
      // Only now: the previous dialog has had its bytes, and this is the first
      // moment it is safe to take them back.
      release();

      const frame = document.createElement("iframe");
      // Off-screen rather than `display: none` — a display-none iframe does not
      // lay out in every browser, and a PDF viewer that never laid out has
      // nothing to print.
      frame.setAttribute("aria-hidden", "true");
      frame.style.position = "fixed";
      frame.style.width = "1px";
      frame.style.height = "1px";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.opacity = "0";
      frame.style.border = "0";
      frame.style.pointerEvents = "none";

      frame.onload = () => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
        } catch {
          // Some builds refuse `print()` on a plugin-rendered PDF. The bytes are
          // good either way, so fall back to handing the operator the document
          // rather than reporting a failure that did not happen.
          window.open(objectUrl, "_blank", "noopener");
        }
      };

      delivery.current = { frame, objectUrl };
      frame.src = objectUrl;
      document.body.appendChild(frame);
    },
    [release],
  );

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
        toast.error(error instanceof Error ? error.message : "This document cannot be printed.");
        return false;
      }

      try {
        const result = await printDocument(request).unwrap();

        if (result.objectUrl) {
          deliver(result.objectUrl);
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
        toast.error(getApiErrorMessage(error as never) ?? "The document could not be printed.");
        return false;
      }
    },
    [deliver, printDocument, purposeCode, purposes, purposesLoading, sessionDeviceId],
  );

  return { print, isPrinting, isReady: !purposesLoading };
}
