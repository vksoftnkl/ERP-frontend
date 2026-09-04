"use client";

/**
 * The designer.
 *
 * Owns three things and delegates everything else: loading (template, dataset
 * catalogue, palette vocabulary), the keyboard map, and which overlay is open.
 *
 * `data-uppercase="off"` on the root is load-bearing, not cosmetic. The app
 * uppercases every free-text input through one capture-phase listener, and an
 * expression is case-sensitive — `{{ row.netAmount }}` uppercased is a template
 * that fails validation the moment it is saved.
 */

import { useCallback, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getApiErrorMessage } from "@/store/api";
import {
  useGetPrintDatasetsQuery,
  useGetPrintTemplateQuery,
  useGetPrintTemplateSchemaQuery,
} from "@/features/print-designer/api/printTemplateApi";
import type {
  ProviderDescriptor,
  TemplateDefinition,
  TemplatePayload,
} from "@/features/print-designer/types/template-definition";
import { useCanvasHost } from "@/features/print-designer/host/canvas-host";
import { reconcileVocabulary } from "@/features/print-designer/lib/vocabulary";
import {
  NUDGE_COARSE_MM,
  NUDGE_MM,
  isTypingTarget,
} from "@/features/print-designer/lib/shortcuts";
import {
  clearSelection,
  clipboardPasted,
  datasetsLoaded,
  designerClosed,
  draftStarted,
  interactionEnded,
  moveCommitted,
  redo,
  selectAllInBand,
  selectionCopied,
  selectionCut,
  selectionDeleted,
  selectionDuplicated,
  setShowExpressions,
  setShowGrid,
  setSnapEnabled,
  templateLoaded,
  templateSaved,
  undo,
  vocabularyLoaded,
} from "@/features/print-designer/store/designerSlice";
import {
  selectDirty,
  selectInteraction,
  selectLayoutMode,
  selectMeta,
  selectSelection,
  selectStatus,
  selectView,
} from "@/features/print-designer/store/selectors";
import { useTemplateSave } from "@/features/print-designer/hooks/useTemplateSave";
import DesignerMenuBar from "@/features/print-designer/components/DesignerMenuBar";
import DesignerTopBar from "@/features/print-designer/components/DesignerTopBar";
import DesignerToolbar from "@/features/print-designer/components/DesignerToolbar";
import StatusBar from "@/features/print-designer/components/StatusBar";
import ReportTree from "@/features/print-designer/components/ReportTree";
import DatasetTree from "@/features/print-designer/components/DatasetTree";
import CanvasViewport from "@/features/print-designer/components/CanvasViewport";
import PropertyPanel from "@/features/print-designer/components/PropertyPanel";
import PreviewDialog from "@/features/print-designer/components/PreviewDialog";
import RevisionsDrawer from "@/features/print-designer/components/RevisionsDrawer";
import ShortcutSheet from "@/features/print-designer/components/ShortcutSheet";
import UnsavedGuard from "@/features/print-designer/components/UnsavedGuard";
import styles from "@/features/print-designer/components/designer.module.scss";

export type DesignerShellProps =
  | { mode: "EDIT"; templateId: string }
  | {
      mode: "NEW";
      draft: { name: string; docType: string; outputMode: string; paperCode: string };
      definition: TemplateDefinition;
    }
  /**
   * Opened by a HOST that owns the storage -- today the printing module, whose
   * `print_template_version` holds the body. Nothing is fetched: the definition
   * and the dataset list are handed in, because the `/reports/*` routes this
   * designer was written against do not exist. See `host/canvas-host`.
   */
  | {
      mode: "EMBEDDED";
      draft: { name: string; docType: string; outputMode: string; paperCode: string };
      definition: TemplateDefinition;
      /** Stands in for `GET /reports/templates/datasets/catalogue`. */
      datasets: ProviderDescriptor[];
      /**
       * Changed by the host when it wants a DIFFERENT revision loaded.
       *
       * Not after a save. Re-seeding on save looks like the obvious way to
       * clear `dirty`, and it is how the canvas ended up one save behind: the
       * host's copy of the body is still the pre-save one when the save
       * resolves. `hostSaved` marks the design clean without replacing it.
       */
      seedKey: string;
    };

export function DesignerShell(props: DesignerShellProps) {
  const dispatch = useAppDispatch();
  const host = useCanvasHost();

  const status = useAppSelector(selectStatus);
  const meta = useAppSelector(selectMeta);
  const view = useAppSelector(selectView);
  const selection = useAppSelector(selectSelection);
  const interaction = useAppSelector(selectInteraction);
  const layoutMode = useAppSelector(selectLayoutMode);
  const dirty = useAppSelector(selectDirty);

  const { save } = useTemplateSave();

  const [previewOpen, setPreviewOpen] = useState(false);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  /** Which left dock is showing: the document's structure, or its data. */
  const [leftTab, setLeftTab] = useState<"REPORT" | "DATA">("REPORT");

  const templateId = props.mode === "EDIT" ? props.templateId : null;

  const {
    data: template,
    isFetching: loadingTemplate,
    error: templateError,
  } = useGetPrintTemplateQuery(templateId ?? "", { skip: !templateId });

  /*
   * Both of these are skipped when the canvas is hosted. The endpoints answer
   * 404, and everything they would supply is either a local constant
   * (`lib/vocabulary.ts`) or handed in by the host (`props.datasets`).
   */
  const { data: vocabulary } = useGetPrintTemplateSchemaQuery(undefined, { skip: Boolean(host) });
  const { data: providers } = useGetPrintDatasetsQuery(
    props.mode === "EDIT" ? (template?.ptDocType ?? undefined) : props.draft.docType,
    { skip: Boolean(host) },
  );

  // ── Loading ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (template) {
      dispatch(templateLoaded(template));
    }
  }, [dispatch, template]);

  const seedKey = props.mode === "EMBEDDED" ? props.seedKey : props.mode;
  useEffect(() => {
    if (props.mode === "EDIT") {
      return;
    }
    dispatch(
      draftStarted({
        meta: {
          name: props.draft.name,
          docType: props.draft.docType,
          outputMode: props.draft.outputMode,
          paperCode: props.draft.paperCode,
          version: 0,
        },
        definition: props.definition,
        // A hosted revision arrives already stored; only a brand new template
        // starts life as unsaved work.
        dirty: props.mode === "NEW",
      }),
    );
    // Seeded once per revision, never on every render -- re-seeding would
    // discard the operator's work on the next state change. `seedKey` is what
    // the host changes when it genuinely wants a different revision loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, props.mode, seedKey]);

  const hostedDatasets = props.mode === "EMBEDDED" ? props.datasets : null;
  useEffect(() => {
    if (hostedDatasets) {
      dispatch(datasetsLoaded(hostedDatasets));
      return;
    }
    if (providers) {
      dispatch(datasetsLoaded(providers));
    }
  }, [dispatch, hostedDatasets, providers]);

  useEffect(() => {
    if (!vocabulary) {
      return;
    }
    dispatch(vocabularyLoaded(vocabulary));

    if (process.env.NODE_ENV !== "production") {
      const drift = reconcileVocabulary(vocabulary);
      for (const entry of drift) {
        // A newer server is a reason to warn a developer, never to refuse to
        // open a template a customer needs fixed today.
        console.warn(
          `[print-designer] ${entry.kind} drift — server only: ${entry.serverOnly.join(", ") || "none"}; client only: ${entry.clientOnly.join(", ") || "none"}`,
        );
      }
    }
  }, [dispatch, vocabulary]);

  useEffect(() => () => {
    dispatch(designerClosed());
  }, [dispatch]);

  // ── Keyboard ────────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      const typing = isTypingTarget(event.target);

      // Save must work from anywhere, including mid-edit in a property field.
      if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
        return;
      }
      if (modifier && event.key.toLowerCase() === "p") {
        event.preventDefault();
        // Rendering is server-side, and it takes a REVISION id the canvas
        // does not know — only a host does. No host, no preview: the legacy
        // `POST /reports/preview` this used to fall back to is 404 with the
        // rest of `/reports/*`. See `host/canvas-host`.
        if (host?.preview) setPreviewOpen(true);
        return;
      }

      if (typing) {
        return;
      }

      if (modifier) {
        switch (event.key.toLowerCase()) {
          case "z":
            event.preventDefault();
            dispatch(event.shiftKey ? redo() : undo());
            return;
          case "y":
            event.preventDefault();
            dispatch(redo());
            return;
          case "c":
            dispatch(selectionCopied());
            return;
          case "x":
            dispatch(selectionCut());
            return;
          case "v":
            if (selection.bandIndex !== null) {
              dispatch(clipboardPasted({ bandIndex: selection.bandIndex }));
            }
            return;
          case "d":
            event.preventDefault();
            dispatch(selectionDuplicated());
            return;
          case "a":
            if (selection.bandIndex !== null) {
              event.preventDefault();
              dispatch(selectAllInBand(selection.bandIndex));
            }
            return;
          case "g":
            event.preventDefault();
            dispatch(setShowGrid(!view.showGrid));
            return;
          case "e":
            event.preventDefault();
            dispatch(setShowExpressions(!view.showExpressions));
            return;
          case ";":
            event.preventDefault();
            dispatch(setSnapEnabled(!view.snapEnabled));
            return;
          default:
            return;
        }
      }

      if (event.key === "Escape") {
        if (interaction.mode !== "IDLE") {
          dispatch(interactionEnded());
        } else {
          dispatch(clearSelection());
        }
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selection.elementIds.length) {
          event.preventDefault();
          dispatch(selectionDeleted());
        }
        return;
      }

      if (event.key === "?") {
        setShortcutsOpen(true);
        return;
      }

      const nudges: Record<string, { x: number; y: number }> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      };
      const direction = nudges[event.key];
      if (direction && selection.elementIds.length) {
        event.preventDefault();
        const step = event.shiftKey ? NUDGE_COARSE_MM : NUDGE_MM;
        dispatch(
          moveCommitted({
            dx: direction.x * step,
            dy: direction.y * step,
            // GRID moves by whole cells; a fraction of a character has no
            // meaning to the printer.
            dCol: layoutMode === "GRID" ? direction.x : 0,
            dRow: layoutMode === "GRID" ? direction.y : 0,
            // Coalesced so holding an arrow key is one undo, not forty.
            coalesceKey: "nudge",
            label: "Nudge",
          }),
        );
      }
    },
    [
      dispatch,
      interaction.mode,
      layoutMode,
      save,
      selection.bandIndex,
      selection.elementIds.length,
      view.showExpressions,
      view.showGrid,
      view.snapEnabled,
      host,
    ],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // ── Render ──────────────────────────────────────────────────────────
  const bodyClass = [
    styles.body,
    !view.leftPanelOpen && !view.rightPanelOpen
      ? styles.bodyNoSides
      : !view.leftPanelOpen
        ? styles.bodyNoLeft
        : !view.rightPanelOpen
          ? styles.bodyNoRight
          : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (templateError) {
    return (
      <div className={styles.page}>
        <div className={styles.centerState}>
          <h1>This template could not be opened</h1>
          <p>{getApiErrorMessage(templateError)}</p>
        </div>
      </div>
    );
  }

  if (props.mode === "EDIT" && (loadingTemplate || status === "EMPTY")) {
    return (
      <div className={styles.page}>
        <div className={styles.centerState}>
          <p>Loading template…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page} data-uppercase="off">
      <UnsavedGuard when={dirty} />

      <DesignerMenuBar
        onPreview={() => setPreviewOpen(true)}
        onOpenRevisions={() => setRevisionsOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />

      <DesignerTopBar
        onPreview={() => setPreviewOpen(true)}
        onOpenRevisions={() => setRevisionsOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />

      <DesignerToolbar />

      <div className={bodyClass}>
        <aside
          className={`${styles.sidePanel} ${styles.sidePanelLeft} ${
            view.leftPanelOpen ? "" : styles.sidePanelHidden
          }`}
        >
          {/* Two docks in one: the report's structure, and the data it prints.
              Tabbed rather than stacked because both are lists that want the
              full height of the panel. */}
          <div className={styles.dockTabs}>
            <button
              type="button"
              className={`${styles.dockTab} ${leftTab === "REPORT" ? styles.dockTabActive : ""}`}
              onClick={() => setLeftTab("REPORT")}
            >
              Report
            </button>
            <button
              type="button"
              className={`${styles.dockTab} ${leftTab === "DATA" ? styles.dockTabActive : ""}`}
              onClick={() => setLeftTab("DATA")}
            >
              Data
            </button>
          </div>

          {leftTab === "REPORT" ? (
            <div className={styles.panelScroll}>
              <ReportTree />
            </div>
          ) : (
            <DatasetTree />
          )}
        </aside>

        <div className={styles.canvasWrap}>
          <CanvasViewport />
        </div>

        <aside
          className={`${styles.sidePanel} ${styles.sidePanelRight} ${
            view.rightPanelOpen ? "" : styles.sidePanelHidden
          }`}
        >
          <PropertyPanel />
        </aside>
      </div>

      <StatusBar />

      <div className={styles.narrowNotice}>
        <h2>The designer needs a wider screen</h2>
        <p>
          Millimetre layout with a field tree and a property panel does not fit below 1280px. Open
          this template on a desktop.
        </p>
      </div>

      {/*
        PREVIEW renders through the HOST, and only through the host: the server's
        renderer takes a revision id, which is the one thing a bare canvas has
        no way to name. So the dialog is mounted for a host that can render and
        for nothing else — there is no `/reports/preview` to fall back to.

        REVISIONS stays a `/reports/*` client, and a hosted canvas has no row
        there — the host owns the revision history, and shows it in its own
        rail.
      */}
      {host?.preview ? (
        <PreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)} />
      ) : null}

      {host ? null : (
        <RevisionsDrawer
          open={revisionsOpen}
          templateId={templateId}
          currentVersion={meta.version}
          onClose={() => setRevisionsOpen(false)}
          onRestored={(restored: TemplatePayload) => dispatch(templateSaved(restored))}
        />
      )}

      <ShortcutSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}

export default DesignerShell;
