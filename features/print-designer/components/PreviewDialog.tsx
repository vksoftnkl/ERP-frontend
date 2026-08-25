"use client";

/**
 * The authoritative view.
 *
 * The canvas is an approximation on purpose (see ElementBox); this dialog posts
 * the in-memory definition to the real engine and shows what it produced. That
 * is the plan's F1: never build a second renderer, make the first one reachable
 * in one keystroke instead.
 *
 * The raw output modes have no viewer — ESC/POS is a byte stream, not a
 * document — so those render as a readable dump with the control codes marked.
 * A user checking a thermal receipt is checking column alignment and cut
 * commands, and both are legible in that form.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import ModalPortal from "@/components/ui/modal-portal";
import { useAppSelector } from "@/store/hooks";
import { getApiErrorMessage } from "@/store/api";
import { useRenderPrintPreviewMutation } from "@/features/print-designer/api/printTemplateApi";
import { OUTPUT_MODES } from "@/features/print-designer/lib/vocabulary";
import {
  selectDefinition,
  selectMeta,
  selectProblemCounts,
} from "@/features/print-designer/store/selectors";
import styles from "@/features/print-designer/components/designer.module.scss";

export type PreviewDialogProps = {
  open: boolean;
  onClose: () => void;
};

/** Turn printer bytes into something a human can check alignment in. */
function describeBytes(text: string): string {
  return text
    .replace(/\x1b/g, "\n<ESC>")
    .replace(/\x1d/g, "\n<GS>")
    .replace(/\r/g, "");
}

export function PreviewDialog({ open, onClose }: PreviewDialogProps) {
  const definition = useAppSelector(selectDefinition);
  const meta = useAppSelector(selectMeta);
  const counts = useAppSelector(selectProblemCounts);

  const [renderPreview, { isLoading, error }] = useRenderPrintPreviewMutation();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    pageCount: number | null;
    renderMs: number | null;
    byteLength: number;
  } | null>(null);
  const [mode, setMode] = useState<string>(meta.outputMode);
  const [docId, setDocId] = useState("");
  const [accYear, setAccYear] = useState("");

  const useSampleData = docId.trim().length === 0;

  /**
   * Swap in a new blob URL, revoking whatever it replaces.
   *
   * Every render allocates a blob the browser holds until it is revoked, so a
   * dialog left open through ten previews would otherwise pin ten PDFs.
   */
  const replaceObjectUrl = useCallback((next: string | null) => {
    setObjectUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return next;
    });
  }, []);

  const cleanup = useCallback(() => {
    replaceObjectUrl(null);
    setRawText(null);
  }, [replaceObjectUrl]);

  const run = useCallback(async () => {
    try {
      const result = await renderPreview({
        definition,
        mode,
        useSampleData,
        docId: docId.trim() || undefined,
        accYear: accYear.trim() || undefined,
      }).unwrap();

      setStats({
        pageCount: result.pageCount,
        renderMs: result.renderMs,
        byteLength: result.byteLength,
      });

      // The response handler already consumed the blob (see PreviewResult): a
      // PDF arrives as an object URL this dialog now owns, and the raw printer
      // modes arrive as decoded text.
      setRawText(result.text === null ? null : describeBytes(result.text));
      replaceObjectUrl(result.objectUrl);
    } catch {
      // Surfaced from the mutation's own error state below.
    }
  }, [accYear, definition, docId, mode, renderPreview, replaceObjectUrl, useSampleData]);

  // Render once on open, then only when the user asks: every preview is a real
  // engine run, and re-running it on every keystroke would hammer the server.
  //
  // Both suppressions are deliberate. `exhaustive-deps` would add every render
  // parameter and re-fire the request as the user types a document id. The
  // set-state rule cannot see that `run` awaits the network before it touches
  // state — this is the "call an external system, store what it answers"
  // pattern the rule exists to allow, not a cascading render.
  /* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      void run();
    }
  }, [open]);
  /* eslint-enable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

  useEffect(() => cleanup, [cleanup]);

  const message = useMemo(() => getApiErrorMessage(error ?? null), [error]);

  if (!open) {
    return null;
  }

  return (
    <ModalPortal>
      <div className={`${styles.overlayTokens} ${styles.backdrop}`} onClick={onClose} />
      <div className={`${styles.overlayTokens} ${styles.dialogLayer}`}>
        <div className={`${styles.dialog} ${styles.dialogWide}`} data-uppercase="off">
          <header className={styles.dialogHead}>
            <span>Preview</span>
            {stats?.pageCount ? (
              <span className={styles.badge}>
                {`${stats.pageCount} page${stats.pageCount === 1 ? "" : "s"}`}
              </span>
            ) : null}
            {typeof stats?.renderMs === "number" ? (
              <span className={styles.badge}>{`${stats.renderMs}ms`}</span>
            ) : null}
            {stats?.byteLength ? (
              <span className={styles.badge}>{`${Math.round(stats.byteLength / 1024)} KB`}</span>
            ) : null}
            <span className={styles.spacer} />
            <button type="button" className={styles.button} onClick={onClose}>
              Close
            </button>
          </header>

          <div className={styles.dialogBody}>
            <div className={styles.toggleRow}>
              <select
                className={styles.toolSelect}
                value={mode}
                onChange={(event) => setMode(event.target.value)}
                aria-label="Output mode"
              >
                {OUTPUT_MODES.map((outputMode) => (
                  <option key={outputMode} value={outputMode}>
                    {outputMode}
                  </option>
                ))}
              </select>
              <input
                className={styles.input}
                style={{ width: 220 }}
                placeholder="Document id (blank = sample data)"
                value={docId}
                onChange={(event) => setDocId(event.target.value)}
              />
              <input
                className={styles.input}
                style={{ width: 120 }}
                placeholder="Acc year"
                value={accYear}
                onChange={(event) => setAccYear(event.target.value)}
              />
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                onClick={() => void run()}
                disabled={isLoading}
              >
                {isLoading ? "Rendering…" : "Render"}
              </button>
              <span className={styles.badge}>
                {useSampleData ? "provider sample data" : "real document"}
              </span>
            </div>

            {counts.errors > 0 ? (
              <p className={styles.issueLine}>
                {`${counts.errors} problem${counts.errors === 1 ? "" : "s"} will make the server reject this definition.`}
              </p>
            ) : null}

            {message ? <p className={styles.issueLine}>{message}</p> : null}

            {objectUrl ? (
              <iframe className={styles.previewFrame} src={objectUrl} title="Rendered preview" />
            ) : null}

            {rawText ? <pre className={styles.rawBytes}>{rawText}</pre> : null}

            {!objectUrl && !rawText && !isLoading && !message ? (
              <p className={styles.emptyPanel}>Nothing rendered yet.</p>
            ) : null}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

export default PreviewDialog;
