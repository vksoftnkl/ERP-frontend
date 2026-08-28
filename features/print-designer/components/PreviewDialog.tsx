"use client";

/**
 * The authoritative view.
 *
 * The canvas is an approximation on purpose (see ElementBox); this dialog asks
 * the real engine to render and shows what it produced. That is the plan's F1:
 * never build a second renderer, make the first one reachable in one keystroke
 * instead.
 *
 * The raw output modes have no viewer — ESC/POS is a byte stream, not a
 * document — so those render as a readable dump with the control codes marked.
 * A user checking a thermal receipt is checking column alignment and cut
 * commands, and both are legible in that form.
 *
 * -- ONLY A HOST CAN RENDER -------------------------------------------------
 *
 * The host renders, because the server needs a REVISION ID and only the host
 * knows which revision the canvas is editing. See `host/canvas-host`.
 *
 * There is no fallback. This dialog used to post the canvas's definition to the
 * legacy `POST /reports/preview` when no host was mounted, and that endpoint
 * 404s along with the rest of `/reports/*` — the server has no reporting module.
 * Repointing it was never possible either: a hostless canvas has no revision to
 * name, and the renderer takes nothing else. So the button is only ever offered
 * where it can work (`DesignerShell` mounts this dialog only for a host with a
 * `preview`), and if one is opened without one it says so instead of firing a
 * request that is known to fail.
 *
 * -- THERE IS NO SAMPLE DATA ANY MORE --------------------------------------
 *
 * `/reports/preview` could render against provider sample rows with no database
 * access at all. The printing engine's renderer does not: a preview runs the
 * revision's REAL datasets, which is what makes it worth looking at. So a
 * design whose datasets read a document needs a document id, and the server
 * says which dataset wanted what when one is missing.
 */

import { useCallback, useEffect, useState } from "react";
import ModalPortal from "@/components/ui/modal-portal";
import { useAppSelector } from "@/store/hooks";
import { getApiErrorMessage } from "@/store/api";
import {
  useCanvasHost,
  type CanvasPreviewPrompt,
  type CanvasPreviewResult,
} from "@/features/print-designer/host/canvas-host";
import {
  selectDefinition,
  selectProblemCounts,
} from "@/features/print-designer/store/selectors";
import styles from "@/features/print-designer/components/designer.module.scss";

export type PreviewDialogProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * The modes with a renderer behind them, plus the one that means "don't ask".
 *
 * Not `OUTPUT_MODES` from the vocabulary: that list includes HTML, which no
 * renderer draws. AUTO is the honest default — a millimetre design renders as
 * PDF and a character-grid one as ESC/POS, the server decides from the
 * revision's engine, and asking for the other one is refused rather than
 * reinterpreted.
 */
const RENDER_MODES = ["AUTO", "PDF", "ESCPOS", "ESCP_DOTMATRIX"] as const;

/** One field-level refusal from the server: a path into the design, and why. */
type RefusalDetail = { field: string; message: string };

/**
 * The paths out of a refused render, which the shared error helper drops.
 *
 * `getApiErrorMessage` returns the envelope's top-level `message` and stops
 * there, which for this endpoint is the summary — "The stored design cannot be
 * rendered as it stands". The part worth reading is underneath it: every entry
 * in `errors` names a PLACE. `bands.3.elements.7.value` is a box on the canvas,
 * `datasets.items.ptdSql` is a query on the Data tab, `params.from_date` is a
 * prompt. Showing the summary alone would send the operator to read the whole
 * template.
 */
function refusalDetails(thrown: unknown): RefusalDetail[] {
  const data = (thrown as { data?: unknown } | null)?.data;
  const errors = (data as { errors?: unknown } | undefined)?.errors;
  if (!Array.isArray(errors)) {
    return [];
  }

  return errors.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message : "";
    if (!message) return [];
    return [{ field: typeof record.field === "string" ? record.field : "", message }];
  });
}

/**
 * The answers worth sending.
 *
 * A blank is OMITTED rather than sent as "". An absent optional prompt falls
 * back to whatever default the revision declared; an empty string would
 * override that default with nothing, which is a different instruction and
 * almost never the one the operator meant by leaving a box alone.
 */
function answered(answers: Record<string, string>): Record<string, string> | undefined {
  const filled = Object.entries(answers).filter(([, value]) => value.trim().length > 0);
  return filled.length > 0 ? Object.fromEntries(filled) : undefined;
}

/** Turn printer bytes into something a human can check alignment in. */
function describeBytes(text: string): string {
  return text
    .replace(/\x1b/g, "\n<ESC>")
    .replace(/\x1d/g, "\n<GS>")
    .replace(/\r/g, "");
}

export function PreviewDialog({ open, onClose }: PreviewDialogProps) {
  const definition = useAppSelector(selectDefinition);
  const counts = useAppSelector(selectProblemCounts);
  const host = useCanvasHost();
  const preview = host?.preview ?? null;

  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [stats, setStats] = useState<CanvasPreviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [details, setDetails] = useState<RefusalDetail[]>([]);
  const [mode, setMode] = useState<string>("AUTO");
  const [docId, setDocId] = useState(preview?.defaults?.docId ?? "");
  const [accYear, setAccYear] = useState(preview?.defaults?.accYear ?? "");
  /** One answer per declared prompt, keyed by prompt name. */
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const prompts: readonly CanvasPreviewPrompt[] = preview?.prompts ?? [];

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
    // Nothing to render against: no host, or a host whose revision is not on the
    // server yet. Both say so in the body of the dialog rather than here.
    if (!preview || !preview.ready) {
      return;
    }

    try {
      setMessage(null);
      setDetails([]);
      setIsLoading(true);

      const result: CanvasPreviewResult = await preview.render({
        definition,
        docId: docId.trim() || undefined,
        accYear: accYear.trim() || undefined,
        outputMode: mode === "AUTO" ? undefined : mode,
        params: answered(answers),
      });

      setStats(result);

      // The render already consumed the blob: a PDF arrives as an object URL
      // this dialog now owns, and the raw printer modes as decoded text.
      setRawText(result.text === null ? null : describeBytes(result.text));
      replaceObjectUrl(result.objectUrl);
    } catch (thrown) {
      // A hosted render rejects with the server's own refusal, which names the
      // place in the design that caused it — `bands.3.elements.7.value`,
      // `datasets.items.ptdSql`, `params.from_date`. Far more useful than
      // "preview failed", so it is shown verbatim.
      setMessage(getApiErrorMessage(thrown as never) ?? "The render was refused.");
      setDetails(refusalDetails(thrown));
      cleanup();
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  }, [accYear, answers, cleanup, definition, docId, mode, preview, replaceObjectUrl]);

  // Render once on open, then only when the user asks: every preview is a real
  // engine run against real data, and re-running it on every keystroke would
  // hammer the server.
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
            {stats?.revNo ? <span className={styles.badge}>{`rev ${stats.revNo}`}</span> : null}
            {stats?.outputMode ? <span className={styles.badge}>{stats.outputMode}</span> : null}
            {stats?.byteLength ? (
              <span className={styles.badge}>{`${Math.round(stats.byteLength / 1024)} KB`}</span>
            ) : null}
            {stats?.warnings ? (
              <span
                className={styles.badge}
                title="The render finished, but the server logged problems it worked around."
              >
                {`${stats.warnings} warning${stats.warnings === 1 ? "" : "s"}`}
              </span>
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
                {RENDER_MODES.map((outputMode) => (
                  <option key={outputMode} value={outputMode}>
                    {outputMode === "AUTO" ? "Automatic" : outputMode}
                  </option>
                ))}
              </select>
              <input
                className={styles.input}
                style={{ width: 260 }}
                placeholder="Document id"
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
                disabled={isLoading || !preview?.ready}
              >
                {isLoading ? "Rendering…" : "Render"}
              </button>
            </div>

            {/*
              What the REVISION asks, not what this dialog wants to know.
              `ptv_params` is declared on the version precisely so the operator
              is asked ONCE for the whole render, and a required prompt left
              blank is refused by the server with this same label — so it is
              asked here rather than discovered as a 400.
            */}
            {prompts.length > 0 ? (
              <div className={styles.toggleRow}>
                {prompts.map((prompt) => (
                  <input
                    key={prompt.name}
                    className={styles.input}
                    style={{ width: 200 }}
                    type={
                      prompt.type === "DATE"
                        ? "date"
                        : prompt.type === "NUMBER"
                          ? "number"
                          : "text"
                    }
                    placeholder={`${prompt.label}${prompt.required ? " *" : ""}`}
                    title={`${prompt.label} — ${prompt.type}${prompt.required ? ", required" : ""}`}
                    value={answers[prompt.name] ?? ""}
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        [prompt.name]: event.target.value,
                      }))
                    }
                  />
                ))}
              </div>
            ) : null}

            {/*
              Said once, plainly, rather than discovered from a blank page: a
              frozen revision renders what is STORED, so the edit in front of
              the operator is not what they are looking at.
            */}
            {preview && !preview.previewsUnsaved ? (
              <p className={styles.issueLine}>
                This revision is published, so the preview shows the design as stored. Unsaved
                changes on the canvas are not included — save them as a new draft to see them.
              </p>
            ) : null}

            {!preview ? (
              <p className={styles.issueLine}>
                This canvas has no renderer behind it. A preview is rendered from a saved
                revision, so it is only available where the design has one — open the layout from
                its template in Settings → Printing Configuration.
              </p>
            ) : !preview.ready ? (
              <p className={styles.issueLine}>
                {preview.notReadyReason ?? "There is nothing saved to render yet."}
              </p>
            ) : null}

            {counts.errors > 0 ? (
              <p className={styles.issueLine}>
                {`${counts.errors} problem${counts.errors === 1 ? "" : "s"} will make the server reject this definition.`}
              </p>
            ) : null}

            {message ? <p className={styles.issueLine}>{message}</p> : null}

            {details.length > 0 ? (
              <ul className={styles.issueList}>
                {details.map((detail, index) => (
                  <li key={`${detail.field}-${index}`} className={styles.issueLine}>
                    {detail.field ? <code>{detail.field}</code> : null}
                    {detail.field ? " — " : null}
                    {detail.message}
                  </li>
                ))}
              </ul>
            ) : null}

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
