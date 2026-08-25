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
import type { TemplateDefinition, TemplatePayload } from "@/features/print-designer/types/template-definition";
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
    };

export function DesignerShell(props: DesignerShellProps) {
  const dispatch = useAppDispatch();

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

  const { data: vocabulary } = useGetPrintTemplateSchemaQuery();
  const { data: providers } = useGetPrintDatasetsQuery(
    props.mode === "EDIT" ? (template?.ptDocType ?? undefined) : props.draft.docType,
  );

  // ── Loading ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (template) {
      dispatch(templateLoaded(template));
    }
  }, [dispatch, template]);

  useEffect(() => {
    if (props.mode !== "NEW") {
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
      }),
    );
    // A draft is seeded once; re-seeding on every render would discard the
    // user's work on the next state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, props.mode]);

  useEffect(() => {
    if (providers) {
      dispatch(datasetsLoaded(providers));
    }
  }, [dispatch, providers]);

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
        setPreviewOpen(true);
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

      <PreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)} />

      <RevisionsDrawer
        open={revisionsOpen}
        templateId={templateId}
        currentVersion={meta.version}
        onClose={() => setRevisionsOpen(false)}
        onRestored={(restored: TemplatePayload) => dispatch(templateSaved(restored))}
      />

      <ShortcutSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}

export default DesignerShell;
