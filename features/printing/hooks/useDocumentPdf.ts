"use client";

/**
 * One saved document, rendered to a PDF and held — for a screen that sends the
 * file somewhere rather than printing it (WhatsApp, today).
 *
 * -- THE SAME DESIGN THE PRINT DIALOG WOULD PICK ---------------------------
 *
 * It asks the assignment ladder, never names a template. Output mode is part of
 * the resolution key (`print-options-dialog.tsx`), so the carrier's own mode is
 * asked first — an installation may assign a lighter design for WhatsApp than
 * for the paper — then PDF ("the file it mails"), then the plain PRINT design
 * that every installation has. All three run together; the first that answers,
 * in that order, wins.
 *
 * -- ALWAYS A PDF ----------------------------------------------------------
 *
 * The render is asked for `outputMode: "PDF"` outright. Left to the design, a
 * GRID one renders to ESCPOS, which is bytes for a receipt printer and not a
 * file anybody can open; asked for PDF, the server refuses it with a sentence
 * that says so, and that refusal is what the operator sees.
 *
 * -- THE BYTES ARE OURS ----------------------------------------------------
 *
 * The object URL is revoked when the hook unmounts or renders again. Anything
 * that has to outlive the caller — a download in flight, a share sheet — takes
 * the `file`, which the browser keeps alive on its own.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { getApiErrorMessage } from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { selectBusinessContext } from "@/store/slices/authSlice";
import { useResolvePrintingAssignmentQuery } from "@/features/printing/api/assignments";
import { useGetPrintPurposeOptionsQuery } from "@/features/printing/api/purposes";
import {
  useRecordPrintMutation,
  useRenderPrintPreviewMutation,
  type RenderPreviewRequest,
  type RenderPreviewResult,
} from "@/features/printing/api/render";
import { useGetPrintingTemplateQuery } from "@/features/printing/api/templates";
import {
  findPurposeByCode,
  purposeNotConfigured,
  type DocumentPrintTarget,
} from "@/features/printing/domain/documentPrint";
import {
  buildDocumentPreviewRequest,
  revisionForPreview,
} from "@/features/printing/domain/printOptions";
import type { PtaOutputMode } from "@/features/printing/types/printing.generated";

export type DocumentPdf = {
  status: "loading" | "ready" | "error";
  /** What it is waiting on, or why it failed — always a sentence for the operator. */
  message: string | null;
  /** The rendered PDF, as a File the browser keeps alive by itself. */
  file: File | null;
  /** The same bytes as a URL, for a download link. Revoked on unmount. */
  objectUrl: string | null;
  pageCount: number | null;
  /** Put the send in `print_log` as a FILE — the PDF left as a file. */
  recordFile: () => void;
  /** Render again after a refusal (a design fixed meanwhile, a timeout). */
  retry: () => void;
};

type Resolution = { ptaTemplateId: string; publishedRevId?: string | null };

type ResolutionState = {
  isUninitialized: boolean;
  isFetching: boolean;
  /** For THESE args only — `data` would hand back a previous company's answer. */
  currentData?: Resolution;
};

/** The first resolution, in order, that answered — or "still asking". */
function firstResolved(
  resolutions: ResolutionState[],
): { pending: true } | { pending: false; winner: Resolution | null } {
  for (const resolution of resolutions) {
    if (resolution.isUninitialized || resolution.isFetching) {
      return { pending: true };
    }
    if (resolution.currentData) {
      return { pending: false, winner: resolution.currentData };
    }
  }
  return { pending: false, winner: null };
}

type Rendered = {
  /** Which render this was, so a stale one is never shown for a new document. */
  key: string;
  request: RenderPreviewRequest;
  result: RenderPreviewResult;
  file: File;
};

export function useDocumentPdf(options: {
  purposeCode: string;
  /** Null renders nothing — the caller has no saved document yet. */
  target: DocumentPrintTarget | null;
  /** The carrier, asked of the ladder first: `WHATSAPP`, `EMAIL`. */
  outputMode: PtaOutputMode;
}): DocumentPdf {
  const { purposeCode, target, outputMode } = options;
  const docId = target?.docId?.trim() ?? "";
  const filename = target?.filename?.trim() || "document";

  // The catalogue is narrowed by the header company, the render scoped by the
  // DOCUMENT's — see `print-options-dialog.tsx` for why the two can differ.
  const headerCompanyId = useAppSelector(selectBusinessContext)?.companyId?.trim() ?? "";
  const companyId = target?.companyId?.trim() || headerCompanyId;
  const accYear = target?.accYear?.trim() ?? "";
  const branchId = target?.branchId?.trim() ?? "";

  const skip = !docId;
  const purposes = useGetPrintPurposeOptionsQuery(
    { companyId: headerCompanyId || null },
    { skip },
  );
  const purpose = findPurposeByCode(purposes.data, purposeCode);

  const resolveArgs = {
    purposeId: purpose?.ppoId ?? "",
    ...(companyId ? { companyId } : {}),
  };
  const skipResolve = { skip: skip || !purpose };
  const byMode = useResolvePrintingAssignmentQuery({ ...resolveArgs, outputMode }, skipResolve);
  const byPdf = useResolvePrintingAssignmentQuery({ ...resolveArgs, outputMode: "PDF" }, skipResolve);
  const byPrint = useResolvePrintingAssignmentQuery(resolveArgs, skipResolve);
  const resolved = firstResolved([byMode, byPdf, byPrint]);
  const winner = resolved.pending ? null : resolved.winner;

  const template = useGetPrintingTemplateQuery(winner?.ptaTemplateId ?? "", {
    skip: !winner?.ptaTemplateId,
  });
  const versionId = winner
    ? revisionForPreview(template.data, winner.publishedRevId ?? null)
    : null;

  const [renderPreview] = useRenderPrintPreviewMutation();
  const [recordPrint] = useRecordPrintMutation();

  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  /** Bumped by `retry` — part of the render key, so the same document renders again. */
  const [attempt, setAttempt] = useState(0);

  const renderKey = versionId && docId
    ? `${versionId}::${docId}::${companyId}::${accYear}::${branchId}::${attempt}`
    : null;

  /*
   * Mounted, held as a ref so a render that lands after the dialog closed
   * revokes its own blob instead of leaking it. Set inside the effect (not at
   * declaration) so StrictMode's mount → unmount → mount ends on `true`.
   */
  const mounted = useRef(false);
  const latestUrl = useRef<string | null>(null);
  useEffect(() => {
    latestUrl.current = rendered?.result.objectUrl ?? null;
  }, [rendered]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (latestUrl.current) {
        URL.revokeObjectURL(latestUrl.current);
        latestUrl.current = null;
      }
    };
  }, []);

  /*
   * Render ONCE per key. Guarded by a ref, not by effect cleanup: the template
   * query re-emits on every revalidation, StrictMode runs effects twice, and a
   * render is a real engine run against real data — none of that should reach
   * the server twice for a page already rendered.
   */
  const requestedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!renderKey || !versionId || requestedFor.current === renderKey) {
      return;
    }
    requestedFor.current = renderKey;
    const isCurrent = () => mounted.current && requestedFor.current === renderKey;

    void (async () => {
      try {
        const request: RenderPreviewRequest = {
          ...buildDocumentPreviewRequest({
            versionId,
            docIds: [docId],
            companyId,
            accYear,
            branchId,
            filename,
          }),
          outputMode: "PDF",
        };
        const result = await renderPreview(request).unwrap();
        if (!result.objectUrl) {
          throw new Error(
            "This design prints on a receipt printer and cannot be sent as a PDF. " +
              "Assign a PDF design for it under Settings › Printing.",
          );
        }
        // A File, so a share sheet or a download can outlive this hook. The
        // blob URL is this document's own, so reading it back is no round trip.
        const blob = await fetch(result.objectUrl).then((response) => response.blob());
        if (!isCurrent()) {
          URL.revokeObjectURL(result.objectUrl);
          return;
        }
        const file = new File([blob], `${filename}.pdf`, { type: "application/pdf" });
        setRendered((previous) => {
          if (previous?.result.objectUrl) {
            URL.revokeObjectURL(previous.result.objectUrl);
          }
          return { key: renderKey, request, result, file };
        });
      } catch (thrown) {
        if (!isCurrent()) {
          return;
        }
        setFailure({
          key: renderKey,
          message:
            getApiErrorMessage(thrown as never) ??
            (thrown instanceof Error ? thrown.message : "The PDF could not be rendered."),
        });
      }
    })();
  }, [accYear, branchId, companyId, docId, filename, renderKey, renderPreview, versionId]);

  const recordFile = useCallback(() => {
    if (!rendered) {
      return;
    }
    const { request, result } = rendered;
    recordPrint({
      versionId: request.versionId,
      outputMode: "FILE",
      ...(request.docId ? { docId: request.docId } : {}),
      ...(request.companyId ? { companyId: request.companyId } : {}),
      ...(request.accYear ? { accYear: request.accYear } : {}),
      ...(request.branchId ? { branchId: request.branchId } : {}),
      ...(result.pageCount !== null ? { pageCount: result.pageCount } : {}),
      byteCount: result.byteLength,
    })
      .unwrap()
      .catch((thrown: unknown) => {
        // The file is out either way; the log is the server's to worry about.
        console.warn("The send could not be recorded in print_log.", thrown);
      });
  }, [recordPrint, rendered]);

  /*
   * Ask everything again, not only the render: the usual refusal is "nothing
   * is assigned", and the fix for that is an administrator assigning a design
   * while this is still open. A query that never started cannot be refetched.
   */
  const retry = (): void => {
    setFailure(null);
    setAttempt((count) => count + 1);
    for (const query of [purposes, byMode, byPdf, byPrint, template]) {
      if (!query.isUninitialized) {
        void query.refetch();
      }
    }
  };

  const answer = (status: DocumentPdf["status"], message: string | null): DocumentPdf => {
    const isReady = status === "ready" && rendered !== null;
    return {
      status,
      message,
      file: isReady ? rendered.file : null,
      objectUrl: isReady ? rendered.result.objectUrl : null,
      pageCount: isReady ? rendered.result.pageCount : null,
      recordFile,
      retry,
    };
  };

  if (!docId) {
    return answer("error", "Save the document first — only a saved document can be sent.");
  }
  // A PDF already in hand stays ready while the catalogues revalidate behind
  // it — only a render for ANOTHER key (another document, a retry) replaces it.
  if (rendered && rendered.request.docId === docId && (!renderKey || rendered.key === renderKey)) {
    return answer("ready", null);
  }
  if (failure && failure.key === renderKey) {
    return answer("error", failure.message);
  }
  if (purposes.isLoading) {
    return answer("loading", "Finding the print design…");
  }
  if (!purpose) {
    return answer(
      "error",
      (purposes.error ? getApiErrorMessage(purposes.error as never) : null) ??
        purposeNotConfigured(purposeCode),
    );
  }
  if (resolved.pending) {
    return answer("loading", "Finding the print design…");
  }
  if (!winner) {
    // The PRINT refusal names the scope that resolved nothing — the one an
    // administrator has to go and fix.
    return answer(
      "error",
      getApiErrorMessage(byPrint.error as never) ??
        "Nothing is assigned to print this document at this counter.",
    );
  }
  if (template.isLoading) {
    return answer("loading", "Loading the design…");
  }
  if (template.error) {
    return answer(
      "error",
      getApiErrorMessage(template.error as never) ?? "The design could not be loaded.",
    );
  }
  if (!versionId) {
    return answer("error", "The assigned design has no revision yet, so there is nothing to render.");
  }
  return answer("loading", "Rendering the PDF…");
}
