"use client";

/**
 * The rendered document, in a popup, over whatever screen asked for it.
 *
 * -- WHY THIS IS NOT THE DESIGNER'S PREVIEW --------------------------------
 *
 * They render through the same endpoint and they are not the same dialog. The
 * designer's is a tool for the person DRAWING the design: it offers an output
 * mode, a document id to type, a prompt form, and it can send the canvas's
 * unsaved bands. This one is for the person PRINTING, who has already chosen a
 * document and a design and wants to look at the paper. It asks nothing, sends
 * no body, and renders on open.
 *
 * That difference is why an operator is not sent to the canvas route to see a
 * quotation. The canvas is a 1,000-element editor with a keyboard map and an
 * unsaved-changes guard; landing a till operator in it to look at one page
 * would be handing them a design tool as a document viewer, with the design
 * one stray keystroke away from being edited.
 *
 * -- IT RENDERS WHAT IS STORED --------------------------------------------
 *
 * `revisionForPreview` picks the revision — named, else published, else newest
 * — and `buildDocumentPreviewRequest` sends no body, so what appears here is
 * what the design would print. See `domain/printOptions.ts` for both rules.
 *
 * -- A REFUSAL IS THE MOST USEFUL THING IT CAN SHOW ------------------------
 *
 * The renderer's refusals name the place in the design that caused them —
 * `datasets.items.ptdSql`, `params.quote_id`, `bands.3.elements.7.value`. They
 * are shown verbatim, field and all, because "preview failed" would send an
 * administrator hunting for something the server already pointed at.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import ModalPortal from "@/components/ui/modal-portal";
import { getApiErrorMessage } from "@/store/api";
import { useGetPrintingTemplateQuery } from "@/features/printing/api/templates";
import {
  useRenderPrintPreviewMutation,
  type RenderPreviewResult,
} from "@/features/printing/api/render";
import {
  buildDocumentPreviewRequest,
  revisionForPreview,
} from "@/features/printing/domain/printOptions";
import { sendToPrinter } from "@/features/printing/print-delivery";
import styles from "@/features/printing/printing.module.scss";

export type DocumentPreviewDialogProps = {
  onClose: () => void;
  /** The design to render — `print_template.ptl_id`. */
  ptlId: string;
  /** A specific revision, or null to take the published one (else the newest). */
  ptvId?: string | null;
  /**
   * The documents to render, in the order they should appear on the paper.
   *
   * Usually one. SEVERAL when a list screen has ticked more than one row: the
   * server lays each out in turn and merges them into a single PDF, so the
   * viewer below shows one scrolling document rather than a stack of popups.
   */
  docIds: string[];
  /** The DOCUMENT's own company, off the row — see `DocumentPrintTarget`. */
  companyId?: string | null;
  /**
   * The DOCUMENT's own accounting year, where it may differ from the year the
   * session is working in. Left out for everything else: the server binds the
   * company's current fiscal year, so nothing here restates it.
   */
  accYear?: string | null;
  /** What the header calls this — "Quotation quo00034", or "3 Bills". */
  title: string;
  /** Filename stem the Download button saves under, without extension. */
  filename?: string | null;
  /**
   * Open the browser's print dialog as soon as the paper is on screen.
   *
   * Set by the Print button, which is Preview plus one act: the operator has
   * already said they want it printed, so making them press Print a second time
   * inside the popup would be asking the same question twice.
   *
   * The popup then CLOSES ITSELF. The print dialog is the thing to look at, and
   * a preview sitting behind it is a second window the operator has to dismiss
   * for no reason. The document survives that close because `sendToPrinter`
   * owns it at module scope — see `print-delivery.ts` for why it has to.
   */
  autoPrint?: boolean;
};

type RefusalDetail = { field: string; message: string };

function refusalDetails(thrown: unknown): RefusalDetail[] {
  const data = (thrown as { data?: unknown } | null)?.data;
  const errors = (data as { errors?: unknown } | undefined)?.errors;
  if (!Array.isArray(errors)) return [];

  return errors.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message : "";
    if (!message) return [];
    return [
      { field: typeof record.field === "string" ? record.field : "", message },
    ];
  });
}

export function DocumentPreviewDialog(props: DocumentPreviewDialogProps) {
  const {
    onClose,
    ptlId,
    ptvId,
    docIds,
    companyId,
    accYear,
    title,
    filename,
    autoPrint,
  } = props;

  /*
   * A stable identity for the set being rendered.
   *
   * `docIds` is a fresh array on every parent render, so it cannot be a
   * dependency or the render-once guard below would fire forever. The joined
   * string is what actually changes when the operator ticks a different set.
   */
  const docKey = docIds.join(",");

  // `/print-template/get` — the revisions live on the template, and which one
  // to render is not something a print button can know.
  const template = useGetPrintingTemplateQuery(ptlId, { skip: !ptlId });
  const [renderPreview] = useRenderPrintPreviewMutation();

  /*
   * Once a document is handed to the printer its blob belongs to
   * `print-delivery`, and this dialog must not revoke it on the way out.
   */
  const handedOver = useRef(false);

  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [stats, setStats] = useState<RenderPreviewResult | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [details, setDetails] = useState<RefusalDetail[]>([]);

  /**
   * Swap in a new blob URL, revoking whatever it replaces — every render
   * allocates one the browser holds until it is told otherwise.
   */
  const replaceObjectUrl = useCallback((next: string | null) => {
    setObjectUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return next;
    });
  }, []);

  const versionId = revisionForPreview(template.data, ptvId);

  const run = useCallback(async () => {
    if (!versionId) return;

    try {
      setMessage(null);
      setDetails([]);
      setIsRendering(true);

      const result = await renderPreview(
        buildDocumentPreviewRequest({
          versionId,
          // Split back out of the joined key so the request carries the ids,
          // not the string the effects compare by.
          docIds: docKey.split(","),
          companyId,
          accYear,
          filename,
        }),
      ).unwrap();

      setStats(result);
      setRawText(result.text);
      replaceObjectUrl(result.objectUrl);
    } catch (thrown) {
      setMessage(
        getApiErrorMessage(thrown as never) ?? "The render was refused.",
      );
      setDetails(refusalDetails(thrown));
      replaceObjectUrl(null);
      setRawText(null);
      setStats(null);
    } finally {
      setIsRendering(false);
    }
  }, [
    accYear,
    companyId,
    docKey,
    filename,
    renderPreview,
    replaceObjectUrl,
    versionId,
  ]);

  /*
   * Render ONCE, as soon as there is a revision to render.
   *
   * The operator already asked for this by pressing Preview, so there is no
   * button to find. Guarded by a ref rather than by `versionId` alone: the
   * template query re-emits on cache updates, and a preview is a real engine
   * run against real data — re-firing it on a refetch would hammer the server
   * for a page that is already on screen.
   */
  const rannedFor = useRef<string | null>(null);
  useEffect(() => {
    // Keyed on the DOCUMENTS as well as the revision. Keyed on the revision
    // alone, reopening the popup on a different set of ticked rows would find
    // the guard already satisfied and leave the previous render on screen.
    const renderKey = `${versionId}::${docKey}`;
    if (versionId && rannedFor.current !== renderKey) {
      rannedFor.current = renderKey;
      void run();
    }
  }, [docKey, run, versionId]);

  // The blob outlives this component unless it is revoked; the viewer is gone
  // by then, so nothing can be reading it — UNLESS it was handed to the
  // printer, whose dialog is still reading it and whose bytes are no longer
  // ours to take back.
  useEffect(
    () => () => {
      if (handedOver.current) return;
      setObjectUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    },
    [],
  );

  /**
   * Hand the rendered page to the printer and step out of the way.
   *
   * The document goes to `print-delivery`'s own frame rather than being printed
   * from the one on screen, which is what lets this dialog close while the
   * print dialog is still open on it.
   */
  const printIt = useCallback((): void => {
    if (!objectUrl) return;
    handedOver.current = true;
    sendToPrinter(objectUrl);
    onClose();
  }, [objectUrl, onClose]);

  /**
   * Save the rendered document to a file, under a name that says what it is.
   *
   * The viewer below has its own download button, but it saves a BLOB URL and
   * names the file after the uuid in it — unreadable for one document and
   * useless for a batch of five. The `download` attribute is the only way to
   * put a real name on it: `Content-Disposition` never reaches a blob, so the
   * `filename` the server was sent cannot do this on its own.
   *
   * The URL is NOT handed over. A download reads it there and then, and the
   * dialog still needs it for the iframe and for Print.
   */
  const saveIt = useCallback((): void => {
    if (!objectUrl) return;
    const stem =
      (filename ?? "").trim() ||
      title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
      "document";
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `${stem}.pdf`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [filename, objectUrl, title]);

  /*
   * Print asked for paper, so the moment there is paper it goes to the printer.
   *
   * Keyed on the object URL rather than a bare flag, so Re-render prints the
   * new document instead of being suppressed as already-done — and so a second
   * effect pass over one render cannot print twice.
   */
  const autoPrintedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!autoPrint || !objectUrl || autoPrintedFor.current === objectUrl)
      return;
    autoPrintedFor.current = objectUrl;
    printIt();
  }, [autoPrint, objectUrl, printIt]);

  const templateError = template.error
    ? (getApiErrorMessage(template.error as never) ??
      "The design could not be loaded.")
    : null;
  const noRevision = !template.isLoading && !templateError && !versionId;

  return (
    <ModalPortal>
      <div className={styles.overlay}>
        <div className={styles.backdrop} onClick={onClose} />
        <div
          className={styles.modal}
          style={{ width: "min(100%, 980px)", height: "min(92vh, 900px)" }}
          role="dialog"
          aria-modal="true"
          aria-label={`Print preview — ${title}`}
        >
          <header className={styles.modalHead}>
            <h2 className={styles.modalTitle}>{`Preview — ${title}`}</h2>
            {/* Shown only for a batch: "1 document" on every ordinary print
                would be stating the obvious on every screen in the app. */}
            {docIds.length > 1 ? (
              <span className={styles.chip}>{`${docIds.length} documents`}</span>
            ) : null}
            {stats?.pageCount ? (
              <span className={styles.chip}>
                {`${stats.pageCount} page${stats.pageCount === 1 ? "" : "s"}`}
              </span>
            ) : null}
            {stats?.revNo ? (
              <span className={styles.chip}>{`rev ${stats.revNo}`}</span>
            ) : null}
            {template.data?.ptlName ? (
              <span className={styles.chip}>{template.data.ptlName}</span>
            ) : null}
          </header>

          <div
            className={styles.modalBody}
            style={{ flex: 1, minHeight: 0, padding: 0 }}
          >
            {template.isLoading || isRendering ? (
              <p className={styles.muted} style={{ padding: 16 }}>
                {template.isLoading ? "Loading the design…" : "Rendering…"}
              </p>
            ) : templateError ? (
              <p className={styles.muted} style={{ padding: 16 }}>
                {templateError}
              </p>
            ) : noRevision ? (
              <p className={styles.muted} style={{ padding: 16 }}>
                This design has no revision yet, so there is nothing to render.
              </p>
            ) : message ? (
              <div
                style={{
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <p style={{ margin: 0, fontWeight: 600 }}>{message}</p>
                {details.map((detail) => (
                  <p
                    key={`${detail.field}:${detail.message}`}
                    className={styles.muted}
                    style={{ margin: 0 }}
                  >
                    {detail.field ? <code>{detail.field}</code> : null}
                    {detail.field ? " — " : null}
                    {detail.message}
                  </p>
                ))}
              </div>
            ) : objectUrl ? (
              <iframe
                src={objectUrl}
                title={`Print preview — ${title}`}
                style={{ width: "100%", height: "100%", border: 0 }}
              />
            ) : rawText ? (
              // A GRID design renders to a raw printer stream, which has no
              // viewer. Showing the bytes is more use than showing nothing.
              <pre
                style={{
                  margin: 0,
                  padding: 16,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {rawText}
              </pre>
            ) : (
              <p className={styles.muted} style={{ padding: 16 }}>
                Nothing was rendered.
              </p>
            )}
          </div>

          <footer className={styles.modalFoot}>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={!objectUrl}
              onClick={printIt}
            >
              Print
            </button>
            <button
              type="button"
              className={styles.btn}
              disabled={!objectUrl}
              onClick={saveIt}
            >
              Download
            </button>
            <button
              type="button"
              className={styles.btn}
              disabled={!versionId || isRendering}
              onClick={() => void run()}
            >
              {isRendering ? "Rendering…" : "Re-render"}
            </button>
            <button type="button" className={styles.btn} onClick={onClose}>
              Close
            </button>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}

export default DocumentPreviewDialog;
