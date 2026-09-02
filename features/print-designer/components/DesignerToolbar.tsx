"use client";

/**
 * The tool strip: what to place, how to align it, and how the canvas is drawn.
 *
 * Element buttons arm PLACING mode rather than inserting immediately — an
 * element dropped at a guessed position is an element the user has to move, and
 * the click that follows says exactly where it goes.
 */

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  ELEMENT_KINDS,
  ELEMENT_LABELS,
  ZOOM_LEVELS,
} from "@/features/print-designer/lib/vocabulary";
import {
  interactionEnded,
  placingStarted,
  selectionAligned,
  selectionDistributed,
  selectionReordered,
  setGridMm,
  setShowExpressions,
  setShowGrid,
  setSnapEnabled,
  setZoom,
  redo,
  undo,
} from "@/features/print-designer/store/designerSlice";
import {
  selectHistoryState,
  selectInteraction,
  selectSelection,
  selectView,
} from "@/features/print-designer/store/selectors";
import styles from "@/features/print-designer/components/designer.module.scss";

const ELEMENT_ICONS: Record<string, string> = {
  TEXT: "T",
  FIELD: "{}",
  LINE: "─",
  RECT: "▭",
  IMAGE: "🖼",
  BARCODE: "|||",
  QRCODE: "▦",
  PAGEBREAK: "⤓",
  CROSSTAB: "⊞",
};

export function DesignerToolbar() {
  const dispatch = useAppDispatch();
  const view = useAppSelector(selectView);
  const selection = useAppSelector(selectSelection);
  const interaction = useAppSelector(selectInteraction);
  const history = useAppSelector(selectHistoryState);

  const hasSelection = selection.elementIds.length > 0;
  const canDistribute = selection.elementIds.length > 2;

  return (
    <div className={`${styles.toolbar} ${styles.toolbarLast} ${styles.toolStrip}`}>
      <span className={styles.toolLabel}>Insert</span>
      <div className={styles.toolGroup}>
        {ELEMENT_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            title={`Place a ${ELEMENT_LABELS[kind].toLowerCase()}`}
            className={`${styles.toolButton} ${
              interaction.placingKind === kind ? styles.toolButtonActive : ""
            }`}
            onClick={() =>
              dispatch(
                interaction.placingKind === kind ? interactionEnded() : placingStarted(kind),
              )
            }
          >
            <span className={styles.toolIcon}>{ELEMENT_ICONS[kind]}</span>
          </button>
        ))}
      </div>

      <div className={styles.toolDivider} />
      <span className={styles.toolLabel}>Align</span>

      <div className={styles.toolGroup}>
        <button
          type="button"
          className={styles.toolButton}
          title="Align left"
          disabled={!hasSelection}
          onClick={() => dispatch(selectionAligned("left"))}
        >
          <span className={styles.toolIcon}>⇤</span>
        </button>
        <button
          type="button"
          className={styles.toolButton}
          title="Align centre"
          disabled={!hasSelection}
          onClick={() => dispatch(selectionAligned("hcenter"))}
        >
          <span className={styles.toolIcon}>↔</span>
        </button>
        <button
          type="button"
          className={styles.toolButton}
          title="Align right"
          disabled={!hasSelection}
          onClick={() => dispatch(selectionAligned("right"))}
        >
          <span className={styles.toolIcon}>⇥</span>
        </button>
        <button
          type="button"
          className={styles.toolButton}
          title="Align top"
          disabled={!hasSelection}
          onClick={() => dispatch(selectionAligned("top"))}
        >
          <span className={styles.toolIcon}>⤒</span>
        </button>
        <button
          type="button"
          className={styles.toolButton}
          title="Align middle"
          disabled={!hasSelection}
          onClick={() => dispatch(selectionAligned("vmiddle"))}
        >
          <span className={styles.toolIcon}>≡</span>
        </button>
        <button
          type="button"
          className={styles.toolButton}
          title="Align bottom"
          disabled={!hasSelection}
          onClick={() => dispatch(selectionAligned("bottom"))}
        >
          <span className={styles.toolIcon}>⤓</span>
        </button>
        <button
          type="button"
          className={styles.toolButton}
          title="Distribute horizontally (needs three)"
          disabled={!canDistribute}
          onClick={() => dispatch(selectionDistributed("horizontal"))}
        >
          <span className={styles.toolIcon}>⇹</span>
        </button>
        <button
          type="button"
          className={styles.toolButton}
          title="Distribute vertically (needs three)"
          disabled={!canDistribute}
          onClick={() => dispatch(selectionDistributed("vertical"))}
        >
          <span className={styles.toolIcon}>⇳</span>
        </button>
      </div>

      <div className={styles.toolDivider} />

      <div className={styles.toolGroup}>
        <button
          type="button"
          className={styles.toolButton}
          title="Bring forward"
          disabled={!hasSelection}
          onClick={() => dispatch(selectionReordered("forward"))}
        >
          <span className={styles.toolIcon}>↑z</span>
        </button>
        <button
          type="button"
          className={styles.toolButton}
          title="Send backward"
          disabled={!hasSelection}
          onClick={() => dispatch(selectionReordered("backward"))}
        >
          <span className={styles.toolIcon}>↓z</span>
        </button>
      </div>

      <div className={styles.toolDivider} />

      <div className={styles.toolGroup}>
        <button
          type="button"
          className={styles.toolButton}
          title={history.undoLabel ? `Undo ${history.undoLabel}` : "Undo"}
          disabled={!history.canUndo}
          onClick={() => dispatch(undo())}
        >
          <span className={styles.toolIcon}>↶</span>
        </button>
        <button
          type="button"
          className={styles.toolButton}
          title={history.redoLabel ? `Redo ${history.redoLabel}` : "Redo"}
          disabled={!history.canRedo}
          onClick={() => dispatch(redo())}
        >
          <span className={styles.toolIcon}>↷</span>
        </button>
      </div>

      <div className={styles.toolDivider} />

      <div className={styles.toolGroup}>
        <button
          type="button"
          className={`${styles.toolButton} ${view.showGrid ? styles.toolButtonActive : ""}`}
          title="Show the grid (Ctrl+G)"
          onClick={() => dispatch(setShowGrid(!view.showGrid))}
        >
          <span className={`${styles.toolIcon} ${styles.toolIconText}`}>grid</span>
        </button>
        <button
          type="button"
          className={`${styles.toolButton} ${view.snapEnabled ? styles.toolButtonActive : ""}`}
          title="Snap to the grid and to neighbours (Ctrl+;)"
          onClick={() => dispatch(setSnapEnabled(!view.snapEnabled))}
        >
          <span className={`${styles.toolIcon} ${styles.toolIconText}`}>snap</span>
        </button>
        <select
          className={styles.toolSelect}
          value={view.gridMm}
          onChange={(event) => dispatch(setGridMm(Number(event.target.value)))}
          aria-label="Grid size"
          title="Grid size"
        >
          {[0.5, 1, 2, 5].map((size) => (
            <option key={size} value={size}>
              {`${size}mm`}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`${styles.toolButton} ${view.showExpressions ? styles.toolButtonActive : ""}`}
          title="Show raw expressions instead of sample values (Ctrl+E)"
          onClick={() => dispatch(setShowExpressions(!view.showExpressions))}
        >
          <span className={`${styles.toolIcon} ${styles.toolIconText}`}>{"{{ }}"}</span>
        </button>
      </div>

      <span className={styles.spacer} />

      <span className={styles.toolLabel}>Zoom</span>
      <select
        className={styles.toolSelect}
        value={view.zoom}
        onChange={(event) => dispatch(setZoom(Number(event.target.value)))}
        aria-label="Zoom"
      >
        {ZOOM_LEVELS.map((level) => (
          <option key={level} value={level}>
            {`${Math.round(level * 100)}%`}
          </option>
        ))}
      </select>


    </div>
  );
}

export default DesignerToolbar;
