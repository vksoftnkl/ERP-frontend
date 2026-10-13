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
  placingPresetStarted,
  placingStarted,
  selectionAligned,
  selectionDistributed,
  selectionGrouped,
  selectionReordered,
  selectionSized,
  selectionUngrouped,
  setGridMm,
  setShowExpressions,
  setShowGrid,
  setSnapEnabled,
  setUnit,
  setZoom,
  redo,
  undo,
  type DisplayUnit,
  type ElementPatch,
} from "@/features/print-designer/store/designerSlice";
import type { ElementKind } from "@/features/print-designer/types/template-definition";
import {
  selectHistoryState,
  selectInteraction,
  selectSelectedElements,
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
  CHART: "📊",
};

/**
 * QtRPT's "Add Drawing" menu: one element kind each, with the properties that
 * make it the shape asked for. A native select rather than a popup, because a
 * dropdown positioned inside the scrolling tool strip is clipped by it.
 */
const DRAWINGS: ReadonlyArray<{ key: string; label: string; kind: ElementKind; preset: ElementPatch }> = [
  { key: "line", label: "Line", kind: "LINE", preset: {} },
  { key: "arrow-end", label: "Line with arrow at the end", kind: "LINE", preset: { arrowEnd: true } },
  { key: "arrow-start", label: "Line with arrow at the start", kind: "LINE", preset: { arrowStart: true } },
  { key: "arrow-both", label: "Line with arrows at both ends", kind: "LINE", preset: { arrowStart: true, arrowEnd: true } },
  { key: "rect", label: "Rectangle", kind: "RECT", preset: {} },
  { key: "rounded", label: "Rounded rectangle", kind: "RECT", preset: { radiusMm: 3 } },
  { key: "ellipse", label: "Ellipse", kind: "RECT", preset: { shape: "ELLIPSE" } },
  { key: "triangle", label: "Triangle", kind: "RECT", preset: { shape: "TRIANGLE" } },
  { key: "rhombus", label: "Rhombus", kind: "RECT", preset: { shape: "RHOMBUS" } },
];

/** "Add Rich Text": a text element with markup on, seeded with an example. */
const RICH_TEXT_PRESET: ElementPatch = {
  markup: true,
  value: "<b>Bold</b> and <i>italic</i> text",
  w: 60,
};

export function DesignerToolbar() {
  const dispatch = useAppDispatch();
  const view = useAppSelector(selectView);
  const selection = useAppSelector(selectSelection);
  const interaction = useAppSelector(selectInteraction);
  const history = useAppSelector(selectHistoryState);

  const selectedElements = useAppSelector(selectSelectedElements);

  const hasSelection = selection.elementIds.length > 0;
  const canDistribute = selection.elementIds.length > 2;
  const canMatchSize = selection.elementIds.length > 1;
  const canUngroup = selectedElements.some((element) => element.group);
  const armedDrawing = DRAWINGS.find((drawing) => drawing.key === interaction.placingKey);

  return (
    <div className={`${styles.toolbar} ${styles.toolStrip}`}>
      <span className={styles.toolLabel}>Insert</span>
      <div className={styles.toolGroup}>
        {ELEMENT_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            title={`Place a ${ELEMENT_LABELS[kind].toLowerCase()}`}
            className={`${styles.toolButton} ${
              interaction.placingKey === kind ? styles.toolButtonActive : ""
            }`}
            onClick={() =>
              dispatch(
                interaction.placingKey === kind ? interactionEnded() : placingStarted(kind),
              )
            }
          >
            <span className={styles.toolIcon}>{ELEMENT_ICONS[kind]}</span>
          </button>
        ))}
        <button
          type="button"
          title="Place rich text (inline bold, italic, colour…)"
          className={`${styles.toolButton} ${
            interaction.placingKey === "rich-text" ? styles.toolButtonActive : ""
          }`}
          onClick={() =>
            dispatch(
              interaction.placingKey === "rich-text"
                ? interactionEnded()
                : placingPresetStarted({ kind: "TEXT", preset: RICH_TEXT_PRESET, key: "rich-text" }),
            )
          }
        >
          <span className={`${styles.toolIcon} ${styles.toolIconText}`}>
            <b>R</b>
            <i>t</i>
          </span>
        </button>
        <select
          className={`${styles.toolSelect} ${armedDrawing ? styles.toolButtonActive : ""}`}
          value={armedDrawing?.key ?? ""}
          title="Add a drawing: lines with arrows, rectangles, ellipses, triangles, rhombi"
          aria-label="Add drawing"
          onChange={(event) => {
            const drawing = DRAWINGS.find((candidate) => candidate.key === event.target.value);
            dispatch(
              drawing
                ? placingPresetStarted({ kind: drawing.kind, preset: drawing.preset, key: drawing.key })
                : interactionEnded(),
            );
          }}
        >
          <option value="">Drawing…</option>
          {DRAWINGS.map((drawing) => (
            <option key={drawing.key} value={drawing.key}>
              {drawing.label}
            </option>
          ))}
        </select>
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
        <button
          type="button"
          className={styles.toolButton}
          title="Same width — as the element selected first"
          disabled={!canMatchSize}
          onClick={() => dispatch(selectionSized("width"))}
        >
          <span className={`${styles.toolIcon} ${styles.toolIconText}`}>W=</span>
        </button>
        <button
          type="button"
          className={styles.toolButton}
          title="Same height — as the element selected first"
          disabled={!canMatchSize}
          onClick={() => dispatch(selectionSized("height"))}
        >
          <span className={`${styles.toolIcon} ${styles.toolIconText}`}>H=</span>
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
        <button
          type="button"
          className={styles.toolButton}
          title="Bring to front"
          disabled={!hasSelection}
          onClick={() => dispatch(selectionReordered("front"))}
        >
          <span className={styles.toolIcon}>⇈</span>
        </button>
        <button
          type="button"
          className={styles.toolButton}
          title="Send to back"
          disabled={!hasSelection}
          onClick={() => dispatch(selectionReordered("back"))}
        >
          <span className={styles.toolIcon}>⇊</span>
        </button>
      </div>

      <div className={styles.toolDivider} />

      <div className={styles.toolGroup}>
        <button
          type="button"
          className={styles.toolButton}
          title="Group: the selected elements select and move together (Ctrl+Shift+G)"
          disabled={!canMatchSize}
          onClick={() => dispatch(selectionGrouped())}
        >
          <span className={`${styles.toolIcon} ${styles.toolIconText}`}>group</span>
        </button>
        <button
          type="button"
          className={styles.toolButton}
          title="Ungroup (Ctrl+Shift+U)"
          disabled={!canUngroup}
          onClick={() => dispatch(selectionUngrouped())}
        >
          <span className={`${styles.toolIcon} ${styles.toolIconText}`}>ungroup</span>
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

      <select
        className={styles.toolSelect}
        style={{ minWidth: 44 }}
        value={view.unit}
        onChange={(event) => dispatch(setUnit(event.target.value as DisplayUnit))}
        aria-label="Measurement"
        title="Measurement units for rulers and positions (storage is always millimetres)"
      >
        <option value="mm">mm</option>
        <option value="in">inch</option>
      </select>

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
