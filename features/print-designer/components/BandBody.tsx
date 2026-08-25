"use client";

/**
 * A band's content area, and the designer's entire pointer surface.
 *
 * Everything positional happens here: drag, resize, marquee, click-to-place and
 * the drop target for the dataset tree. Every pointer delta converts to
 * millimetres through `pxToMm(px, zoom)` exactly once, at the top of each move
 * handler — the single call site the plan's F2 asks for.
 *
 * A gesture commits ONE history entry. The live offset lives in
 * `interaction.dragDelta`, which is why 200 stationary elements do not
 * re-render while one moves: they receive `dragDelta: null` and the memoised
 * ElementBox bails out.
 */

import {
  useCallback,
  useMemo,
  useRef,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import type { Band, FieldMeta } from "@/features/print-designer/types/template-definition";
import {
  clampRectToBand,
  elementRect,
  rectFromPoints,
  rectsIntersect,
  resizeRect,
  unionRect,
  type Rect,
  type ResizeHandle,
} from "@/features/print-designer/lib/geometry";
import { mmToPx, pxToMm, roundMm } from "@/features/print-designer/lib/units";
import { snapRect, snapResizedRect, type Guide, type SnapContext } from "@/features/print-designer/lib/snap";
import { GRAPHIC_SCALE, gridMetrics, gridScale } from "@/features/print-designer/lib/grid";
import { createSampleResolver } from "@/features/print-designer/lib/sample-data";
import {
  clipboardPasted,
  dragMoved,
  dragStarted,
  elementAdded,
  fieldDropped,
  interactionEnded,
  marqueeMoved,
  marqueeStarted,
  moveCommitted,
  resizeCommitted,
  resizeMoved,
  resizeStarted,
  selectBand,
  selectElement,
  selectElements,
} from "@/features/print-designer/store/designerSlice";
import {
  selectDatasetBindings,
  selectDatasetCatalogue,
  selectInteraction,
  selectLayoutMode,
  selectPaper,
  selectSelection,
  selectView,
} from "@/features/print-designer/store/selectors";
import ElementBox from "@/features/print-designer/components/ElementBox";
import SelectionOverlay from "@/features/print-designer/components/SelectionOverlay";
import AlignmentGuides from "@/features/print-designer/components/AlignmentGuides";
import styles from "@/features/print-designer/components/designer.module.scss";

export type BandBodyProps = {
  bandIndex: number;
  band: Band;
  /**
   * The band's drawing width in CANVAS UNITS: the page width in millimetres in
   * GRAPHIC mode (element `x` is page-relative), or the printable character
   * columns in GRID mode.
   */
  widthMm: number;
  /** Page margins, offered as snap targets. Omitted in GRID mode. */
  margins?: { left: number; right: number };
};

/** Payload the dataset tree puts on the drag, read back on drop. */
export const FIELD_DRAG_MIME = "application/x-vknex-report-field";

export type FieldDragPayload = {
  datasetName: string;
  cardinality: "one" | "many";
  field: FieldMeta;
};

type Gesture =
  | {
      kind: "drag";
      movingIds: string[];
      anchorRect: Rect;
      originClientX: number;
      originClientY: number;
      delta: { dx: number; dy: number };
      cells: { dCol: number; dRow: number };
    }
  | {
      kind: "resize";
      handle: ResizeHandle;
      anchorRect: Rect;
      originClientX: number;
      originClientY: number;
      delta: { dx: number; dy: number };
      cells: { dCols: number };
    }
  | {
      kind: "marquee";
      originMm: { x: number; y: number };
      rect: Rect;
    };

export function BandBody({ bandIndex, band, widthMm, margins }: BandBodyProps) {
  const dispatch = useAppDispatch();
  const view = useAppSelector(selectView);
  const selection = useAppSelector(selectSelection);
  const interaction = useAppSelector(selectInteraction);
  const layoutMode = useAppSelector(selectLayoutMode);
  const paper = useAppSelector(selectPaper);
  const bindings = useAppSelector(selectDatasetBindings);
  const providers = useAppSelector(selectDatasetCatalogue);

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<Gesture | null>(null);

  const isGridMode = layoutMode === "GRID";
  const metrics = useMemo(() => gridMetrics(paper), [paper]);

  /**
   * Millimetres per canvas unit. Everything below this line works in units and
   * multiplies by the scale exactly once, at the pixel boundary — which is what
   * lets one set of components draw both a millimetre sheet and a character
   * grid. Memoised so the ElementBox memo is not invalidated every render.
   */
  const scale = useMemo(
    () => (isGridMode ? gridScale(metrics) : GRAPHIC_SCALE),
    [isGridMode, metrics],
  );

  /** Band height in canvas units: rows in GRID mode, millimetres otherwise. */
  const heightUnits = isGridMode ? Math.max(band.heightRows ?? 1, 1) : band.heightMm;

  const bounds = useMemo(
    () => ({ widthMm, heightMm: heightUnits }),
    [widthMm, heightUnits],
  );

  const resolveSample = useMemo(
    () => createSampleResolver({ datasets: bindings, providers, bandDataset: band.dataset }),
    [bindings, providers, band.dataset],
  );

  const selectedIds = useMemo(
    () => (selection.bandIndex === bandIndex ? new Set(selection.elementIds) : new Set<string>()),
    [selection.bandIndex, selection.elementIds, bandIndex],
  );

  const isDraggingHere =
    interaction.mode === "DRAGGING" && selection.bandIndex === bandIndex ? interaction.dragDelta : null;

  /**
   * Pointer client coordinates to band-relative CANVAS UNITS.
   *
   * The px -> mm conversion happens here and nowhere else (the plan's F2), and
   * the scale divides it into units immediately after, so a gesture in GRID
   * mode is measured in cells rather than in a millimetre figure no printer
   * could honour.
   */
  const toBandUnits = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const box = bodyRef.current?.getBoundingClientRect();
      if (!box) {
        return { x: 0, y: 0 };
      }
      return {
        x: pxToMm(clientX - box.left, view.zoom) / scale.x,
        y: pxToMm(clientY - box.top, view.zoom) / scale.y,
      };
    },
    [scale.x, scale.y, view.zoom],
  );

  const snapContext = useCallback(
    (excluded: ReadonlySet<string>): SnapContext => ({
      // In GRID mode the only meaningful step is one character cell.
      gridMm: isGridMode ? 1 : view.gridMm,
      snapEnabled: view.snapEnabled,
      zoom: view.zoom,
      bounds,
      margins,
      neighbours: band.elements
        .filter((element) => !excluded.has(element.id))
        .map(elementRect),
    }),
    [band.elements, bounds, isGridMode, margins, view.gridMm, view.snapEnabled, view.zoom],
  );

  /** One listener pair per gesture, removed on pointerup. */
  const runGesture = useCallback(
    (onMove: (event: PointerEvent) => void, onUp: () => void) => {
      const handleMove = (event: PointerEvent) => onMove(event);
      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("pointercancel", handleUp);
        onUp();
      };
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleUp);
    },
    [],
  );

  const handleElementPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, elementId: string) => {
      if (event.button !== 0) {
        return;
      }
      event.stopPropagation();
      const additive = event.ctrlKey || event.metaKey || event.shiftKey;
      dispatch(selectElement({ bandIndex, elementId, additive }));

      // Ctrl-click is a selection change, not the start of a drag: dragging on
      // the same gesture would move an element the user was only adding.
      if (additive) {
        return;
      }

      const alreadySelected = selectedIds.has(elementId) && selectedIds.size > 1;
      const movingIds = alreadySelected ? [...selectedIds] : [elementId];
      const moving = new Set(movingIds);
      const anchor = band.elements.find((element) => element.id === movingIds[0]);
      if (!anchor) {
        return;
      }

      const anchorRect = elementRect(anchor);
      gestureRef.current = {
        kind: "drag",
        movingIds,
        anchorRect,
        originClientX: event.clientX,
        originClientY: event.clientY,
        delta: { dx: 0, dy: 0 },
        cells: { dCol: 0, dRow: 0 },
      };
      dispatch(dragStarted());

      const context = snapContext(moving);

      runGesture(
        (moveEvent) => {
          const gesture = gestureRef.current;
          if (gesture?.kind !== "drag") {
            return;
          }
          const dxUnits =
            pxToMm(moveEvent.clientX - gesture.originClientX, view.zoom) / scale.x;
          const dyUnits =
            pxToMm(moveEvent.clientY - gesture.originClientY, view.zoom) / scale.y;

          if (isGridMode) {
            // Whole cells: a dot-matrix field can only land on a character
            // position, so the preview must not promise otherwise.
            const dCol = Math.round(dxUnits);
            const dRow = Math.round(dyUnits);
            gesture.cells = { dCol, dRow };
            gesture.delta = { dx: dCol, dy: dRow };
            dispatch(dragMoved({ ...gesture.delta, guides: [] }));
            return;
          }

          const dxMm = dxUnits;
          const dyMm = dyUnits;
          const proposed: Rect = {
            ...gesture.anchorRect,
            x: gesture.anchorRect.x + dxMm,
            y: gesture.anchorRect.y + dyMm,
          };
          const snapped = snapRect(proposed, context);
          const clamped = clampRectToBand(snapped.rect, bounds);
          const guides: Guide[] =
            clamped.x === snapped.rect.x && clamped.y === snapped.rect.y ? snapped.guides : [];
          gesture.delta = {
            dx: roundMm(clamped.x - gesture.anchorRect.x),
            dy: roundMm(clamped.y - gesture.anchorRect.y),
          };
          dispatch(dragMoved({ ...gesture.delta, guides }));
        },
        () => {
          const gesture = gestureRef.current;
          gestureRef.current = null;
          if (gesture?.kind !== "drag") {
            dispatch(interactionEnded());
            return;
          }
          dispatch(
            moveCommitted({
              ...gesture.delta,
              dCol: gesture.cells.dCol,
              dRow: gesture.cells.dRow,
              label:
                gesture.movingIds.length > 1
                  ? `Move ${gesture.movingIds.length} elements`
                  : "Move element",
            }),
          );
        },
      );
    },
    [
      band.elements,
      bandIndex,
      bounds,
      dispatch,
      isGridMode,
      runGesture,
      scale.x,
      scale.y,
      selectedIds,
      snapContext,
      view.zoom,
    ],
  );

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, handle: ResizeHandle) => {
      if (event.button !== 0) {
        return;
      }
      event.stopPropagation();
      const anchor = band.elements.find((element) => selectedIds.has(element.id));
      if (!anchor) {
        return;
      }
      const anchorRect = elementRect(anchor);
      gestureRef.current = {
        kind: "resize",
        handle,
        anchorRect,
        originClientX: event.clientX,
        originClientY: event.clientY,
        delta: { dx: 0, dy: 0 },
        cells: { dCols: 0 },
      };
      dispatch(resizeStarted(handle));

      const context = snapContext(new Set([anchor.id]));

      runGesture(
        (moveEvent) => {
          const gesture = gestureRef.current;
          if (gesture?.kind !== "resize") {
            return;
          }
          const dxMm =
            pxToMm(moveEvent.clientX - gesture.originClientX, view.zoom) / scale.x;
          const dyMm =
            pxToMm(moveEvent.clientY - gesture.originClientY, view.zoom) / scale.y;

          if (isGridMode) {
            const dCols = Math.round(dxMm);
            gesture.cells = { dCols: handle.includes("w") ? -dCols : dCols };
            gesture.delta = { dx: dCols, dy: 0 };
            dispatch(resizeMoved({ ...gesture.delta, guides: [] }));
            return;
          }

          const resized = resizeRect(gesture.anchorRect, handle, dxMm, dyMm);
          const snapped = snapResizedRect(resized, handle, context);
          gesture.delta = { dx: dxMm, dy: dyMm };
          // The committed geometry is recomputed in the reducer from the raw
          // delta, so store the SNAPPED delta rather than the pointer's.
          const snappedRect = clampRectToBand(snapped.rect, bounds);
          gesture.delta = {
            dx: handle.includes("w")
              ? snappedRect.x - gesture.anchorRect.x
              : snappedRect.w - gesture.anchorRect.w,
            dy: handle.includes("n")
              ? snappedRect.y - gesture.anchorRect.y
              : snappedRect.h - gesture.anchorRect.h,
          };
          dispatch(
            resizeMoved({
              dx: snappedRect.x - gesture.anchorRect.x,
              dy: snappedRect.y - gesture.anchorRect.y,
              guides: snapped.guides,
            }),
          );
        },
        () => {
          const gesture = gestureRef.current;
          gestureRef.current = null;
          if (gesture?.kind !== "resize") {
            dispatch(interactionEnded());
            return;
          }
          dispatch(
            resizeCommitted({
              handle: gesture.handle,
              dx: gesture.delta.dx,
              dy: gesture.delta.dy,
              dCols: gesture.cells.dCols,
            }),
          );
        },
      );
    },
    [
      band.elements,
      bounds,
      dispatch,
      isGridMode,
      runGesture,
      scale.x,
      scale.y,
      selectedIds,
      snapContext,
      view.zoom,
    ],
  );

  const handleBodyPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      const start = toBandUnits(event.clientX, event.clientY);

      // PLACING: the toolbar armed an element kind and this click is where it goes.
      if (interaction.mode === "PLACING" && interaction.placingKind) {
        dispatch(
          elementAdded({
            bandIndex,
            kind: interaction.placingKind,
            xMm: roundMm(Math.max(0, start.x)),
            yMm: roundMm(Math.max(0, start.y)),
            col: isGridMode ? Math.max(0, Math.round(start.x)) : undefined,
            row: isGridMode ? Math.max(0, Math.round(start.y)) : undefined,
          }),
        );
        return;
      }

      dispatch(selectBand(bandIndex));
      gestureRef.current = { kind: "marquee", originMm: start, rect: { ...start, w: 0, h: 0 } };
      dispatch(marqueeStarted({ bandIndex, x: start.x, y: start.y }));

      runGesture(
        (moveEvent) => {
          const gesture = gestureRef.current;
          if (gesture?.kind !== "marquee") {
            return;
          }
          const current = toBandUnits(moveEvent.clientX, moveEvent.clientY);
          gesture.rect = rectFromPoints(
            gesture.originMm.x,
            gesture.originMm.y,
            current.x,
            current.y,
          );
          dispatch(marqueeMoved(gesture.rect));
        },
        () => {
          const gesture = gestureRef.current;
          gestureRef.current = null;
          if (gesture?.kind !== "marquee") {
            dispatch(interactionEnded());
            return;
          }
          // A marquee smaller than a millimetre is a click on empty space, and
          // a click on empty space clears the selection.
          if (gesture.rect.w < 1 && gesture.rect.h < 1) {
            dispatch(selectBand(bandIndex));
            dispatch(interactionEnded());
            return;
          }
          const hit = band.elements
            .filter((element) => rectsIntersect(elementRect(element), gesture.rect))
            .map((element) => element.id);
          dispatch(selectElements({ bandIndex, elementIds: hit }));
          dispatch(interactionEnded());
        },
      );
    },
    [
      band.elements,
      bandIndex,
      dispatch,
      interaction.mode,
      interaction.placingKind,
      isGridMode,
      runGesture,
      toBandUnits,
    ],
  );

  // ── Dataset tree drop ───────────────────────────────────────────────
  const handleDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes(FIELD_DRAG_MIME)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      const raw = event.dataTransfer.getData(FIELD_DRAG_MIME);
      if (!raw) {
        return;
      }
      event.preventDefault();
      let payload: FieldDragPayload;
      try {
        payload = JSON.parse(raw) as FieldDragPayload;
      } catch {
        return;
      }
      const at = toBandUnits(event.clientX, event.clientY);
      dispatch(
        fieldDropped({
          bandIndex,
          xMm: roundMm(Math.max(0, at.x)),
          yMm: roundMm(Math.max(0, at.y)),
          datasetName: payload.datasetName,
          cardinality: payload.cardinality,
          field: payload.field,
          col: isGridMode ? Math.max(0, Math.round(at.x)) : undefined,
          row: isGridMode ? Math.max(0, Math.round(at.y)) : undefined,
        }),
      );
    },
    [bandIndex, dispatch, isGridMode, toBandUnits],
  );

  const handleDoubleClick = useCallback(() => {
    // Double-clicking empty band space pastes, which is the fastest way to
    // repeat a styled field down a column.
    dispatch(clipboardPasted({ bandIndex }));
  }, [bandIndex, dispatch]);

  // ── Render ──────────────────────────────────────────────────────────
  const selectedElements = band.elements.filter((element) => selectedIds.has(element.id));
  const selectionRect = unionRect(selectedElements.map(elementRect));
  const liveSelectionRect = selectionRect
    ? {
        ...selectionRect,
        x: selectionRect.x + (isDraggingHere?.dx ?? 0),
        y: selectionRect.y + (isDraggingHere?.dy ?? 0),
      }
    : null;

  const gridBackground = view.showGrid
    ? isGridMode
      ? {
          backgroundImage:
            "repeating-linear-gradient(to right, rgba(15,34,51,0.10) 0 1px, transparent 1px 100%), repeating-linear-gradient(to bottom, rgba(15,34,51,0.10) 0 1px, transparent 1px 100%)",
          backgroundSize: `${mmToPx(scale.x, view.zoom)}px ${mmToPx(scale.y, view.zoom)}px`,
        }
      : {
          backgroundImage: "radial-gradient(rgba(15,34,51,0.18) 0.5px, transparent 0.5px)",
          backgroundSize: `${mmToPx(view.gridMm, view.zoom)}px ${mmToPx(view.gridMm, view.zoom)}px`,
        }
    : undefined;

  return (
    <div
      ref={bodyRef}
      className={styles.bandBody}
      style={{
        width: mmToPx(widthMm * scale.x, view.zoom),
        height: mmToPx(heightUnits * scale.y, view.zoom),
        cursor: interaction.mode === "PLACING" ? "crosshair" : "default",
        ...gridBackground,
      }}
      onPointerDown={handleBodyPointerDown}
      onDoubleClick={handleDoubleClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      data-band-index={bandIndex}
    >
      {band.elements.map((element) => (
        <ElementBox
          key={element.id}
          element={element}
          zoom={view.zoom}
          scale={scale}
          isGridMode={isGridMode}
          selected={selectedIds.has(element.id)}
          showExpressions={view.showExpressions}
          resolveSample={resolveSample}
          dragDelta={selectedIds.has(element.id) ? isDraggingHere : null}
          onPointerDown={handleElementPointerDown}
        />
      ))}

      {liveSelectionRect ? (
        <SelectionOverlay
          rect={liveSelectionRect}
          zoom={view.zoom}
          scale={scale}
          resizable={selectedElements.length === 1}
          onHandlePointerDown={handleResizePointerDown}
        />
      ) : null}

      {interaction.mode === "MARQUEE" && interaction.marquee?.bandIndex === bandIndex ? (
        <div
          className={styles.marqueeBox}
          style={{
            left: mmToPx(interaction.marquee.x * scale.x, view.zoom),
            top: mmToPx(interaction.marquee.y * scale.y, view.zoom),
            width: mmToPx(interaction.marquee.w * scale.x, view.zoom),
            height: mmToPx(interaction.marquee.h * scale.y, view.zoom),
          }}
        />
      ) : null}

      {selection.bandIndex === bandIndex ? (
        <AlignmentGuides
          guides={interaction.guides}
          zoom={view.zoom}
          scale={scale}
          bounds={bounds}
        />
      ) : null}

      {band.autoGrow ? <span className={styles.autoGrowMark}>autoGrow ↧</span> : null}
    </div>
  );
}

export default BandBody;
