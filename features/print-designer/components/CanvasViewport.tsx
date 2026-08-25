"use client";

/**
 * The canvas: rulers, the band caption gutter, and the page.
 *
 * All three are columns of ONE css grid sharing one row per band. That is the
 * whole trick: a band's ruler segment, its caption and its body are three cells
 * on the same grid row, so they cannot drift out of alignment no matter what
 * heights the bands take. Alignment is the thing a banded designer lives or dies
 * by, and the alternative — three independently scrolled columns kept in sync by
 * hand — is exactly how it dies.
 *
 * The page itself is a single white rectangle spanning every band row behind the
 * bodies, so the sheet reads as one piece of paper rather than as a stack of
 * strips.
 *
 * The rulers are structural rather than decorative. The horizontal one measures
 * the sheet in millimetres (or character columns in GRID mode) and is what a
 * user reads to line a column up with pre-printed stationery. The vertical one
 * restarts at zero inside every band, because element `y` is band-relative — a
 * continuous page ruler would show 143mm next to an element stored at 4mm, and
 * the user would then type 143 into the property panel.
 */

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { mmToPx, pxToMm, roundMm } from "@/features/print-designer/lib/units";
import { gridMetrics } from "@/features/print-designer/lib/grid";
import { ZOOM_LEVELS } from "@/features/print-designer/lib/vocabulary";
import { bandHeightSet, setZoom } from "@/features/print-designer/store/designerSlice";
import {
  selectBandWidthMm,
  selectLayoutMode,
  selectOrderedBands,
  selectPaper,
  selectSelection,
  selectView,
} from "@/features/print-designer/store/selectors";
import CanvasRuler from "@/features/print-designer/components/CanvasRuler";
import BandCaption from "@/features/print-designer/components/BandCaption";
import BandBody from "@/features/print-designer/components/BandBody";
import styles from "@/features/print-designer/components/designer.module.scss";

/** The draggable bottom edge of a band body. */
function BandHeightHandle({
  bandIndex,
  heightMm,
  zoom,
}: {
  bandIndex: number;
  heightMm: number;
  zoom: number;
}) {
  const dispatch = useAppDispatch();
  const gestureRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      gestureRef.current = { startY: event.clientY, startHeight: heightMm };

      const handleMove = (moveEvent: PointerEvent) => {
        const gesture = gestureRef.current;
        if (!gesture) {
          return;
        }
        const deltaMm = pxToMm(moveEvent.clientY - gesture.startY, zoom);
        dispatch(
          bandHeightSet({
            bandIndex,
            heightMm: roundMm(Math.max(0, gesture.startHeight + deltaMm)),
          }),
        );
      };
      const handleUp = () => {
        gestureRef.current = null;
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [bandIndex, dispatch, heightMm, zoom],
  );

  return (
    <div
      className={styles.bandResizer}
      onPointerDown={handlePointerDown}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize band height"
    />
  );
}

export function CanvasViewport() {
  const dispatch = useAppDispatch();
  const view = useAppSelector(selectView);
  const paper = useAppSelector(selectPaper);
  const bands = useAppSelector(selectOrderedBands);
  const bandWidthMm = useAppSelector(selectBandWidthMm);
  const layoutMode = useAppSelector(selectLayoutMode);
  const selection = useAppSelector(selectSelection);

  const [collapsedBands, setCollapsedBands] = useState<ReadonlySet<number>>(new Set());

  const isGridMode = layoutMode === "GRID";
  const metrics = gridMetrics(paper);

  const toggleCollapsed = useCallback((bandIndex: number) => {
    setCollapsedBands((current) => {
      const next = new Set(current);
      if (next.has(bandIndex)) {
        next.delete(bandIndex);
      } else {
        next.add(bandIndex);
      }
      return next;
    });
  }, []);

  /**
   * Ctrl/Cmd + wheel zooms, matching every other canvas tool. A plain wheel
   * must keep scrolling: the sheet is taller than the viewport most of the time.
   */
  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();
      const closest = ZOOM_LEVELS.reduce((best, level) =>
        Math.abs(level - view.zoom) < Math.abs(best - view.zoom) ? level : best,
      );
      const currentIndex = ZOOM_LEVELS.indexOf(closest);
      const nextIndex = event.deltaY < 0 ? currentIndex + 1 : currentIndex - 1;
      const next = ZOOM_LEVELS[Math.min(Math.max(nextIndex, 0), ZOOM_LEVELS.length - 1)];
      if (next !== view.zoom) {
        dispatch(setZoom(next));
      }
    },
    [dispatch, view.zoom],
  );

  const sheetWidthPx = mmToPx(paper.widthMm, view.zoom);
  const marginLeftPx = mmToPx(paper.margins.left, view.zoom);

  /*
   * Where a band's drawing box starts on the sheet, and how wide it is.
   *
   * GRAPHIC: the whole page. Element `x` is page-relative, so the band box has
   * to start at the sheet's own left edge or every coordinate would be off by
   * the left margin.
   *
   * GRID: the character grid. `col` counts printable columns, which begin after
   * the margin, so the box is inset and exactly `columns` cells wide.
   */
  const bodyOriginPx = isGridMode ? marginLeftPx : 0;
  const bodyWidthUnits = isGridMode ? metrics.columns : bandWidthMm;

  const fixedHeightMm = bands.reduce((total, entry) => {
    const bandHeight = isGridMode
      ? Math.max(entry.band.heightRows ?? 1, 1) * metrics.lineHeightMm
      : entry.band.heightMm;
    return total + bandHeight;
  }, 0);
  const overflowsPage = paper.heightMm !== null && fixedHeightMm > paper.heightMm;

  return (
    <div className={styles.viewport} onWheel={handleWheel}>
      <div className={styles.viewportInner}>
        <div className={styles.rulerCorner} />

        <div className={styles.rulerH} style={{ width: sheetWidthPx, position: "sticky" }}>
          <CanvasRuler
            orientation="horizontal"
            lengthMm={paper.widthMm}
            zoom={view.zoom}
            offsetPx={bodyOriginPx}
            cells={
              isGridMode ? { widthMm: metrics.cellWidthMm, count: metrics.columns } : undefined
            }
          />
        </div>

        {/* The page: one sheet behind every band row. */}
        <div
          className={`${styles.sheet} ${overflowsPage ? styles.sheetOverflow : ""}`}
          style={{ width: sheetWidthPx }}
        >
          <div
            className={styles.marginGuide}
            style={{
              left: marginLeftPx,
              right: mmToPx(paper.margins.right, view.zoom),
              top: 0,
              bottom: 0,
            }}
          />
        </div>

        {bands.map((entry) => {
          const collapsed = collapsedBands.has(entry.index);
          const heightUnits = isGridMode
            ? Math.max(entry.band.heightRows ?? 1, 1)
            : entry.band.heightMm;
          const rulerLengthMm = isGridMode
            ? heightUnits * metrics.lineHeightMm
            : entry.band.heightMm;

          return (
            /* A fragment, so all three cells are direct children of the grid and
               land on the same row. */
            <div key={`${entry.band.type}-${entry.index}`} style={{ display: "contents" }}>
              <div className={styles.rulerV}>
                {collapsed ? null : (
                  <div className={styles.rulerVInner}>
                    <CanvasRuler
                      orientation="vertical"
                      lengthMm={rulerLengthMm}
                      zoom={view.zoom}
                      cells={
                        isGridMode
                          ? { widthMm: metrics.lineHeightMm, count: heightUnits }
                          : undefined
                      }
                    />
                  </div>
                )}
              </div>

              <BandCaption
                bandIndex={entry.index}
                band={entry.band}
                selected={selection.bandIndex === entry.index}
                collapsed={collapsed}
                isGridMode={isGridMode}
                onToggleCollapsed={toggleCollapsed}
              />

              {collapsed ? (
                <div className={styles.bandBody} style={{ width: sheetWidthPx, height: 4 }} />
              ) : (
                <div
                  className={styles.bandBody}
                  style={{ width: sheetWidthPx, paddingLeft: bodyOriginPx }}
                >
                  <BandBody
                    bandIndex={entry.index}
                    band={entry.band}
                    widthMm={bodyWidthUnits}
                    margins={isGridMode ? undefined : paper.margins}
                  />
                  {isGridMode ? null : (
                    <BandHeightHandle
                      bandIndex={entry.index}
                      heightMm={entry.band.heightMm}
                      zoom={view.zoom}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div className={styles.rulerV} />
        <div className={styles.sheetFootCaption}>Total</div>
        <div className={styles.sheetFoot} style={{ width: sheetWidthPx }}>
          <span>
            {isGridMode
              ? `${bands.reduce(
                  (total, entry) => total + Math.max(entry.band.heightRows ?? 1, 1),
                  0,
                )} rows of ${metrics.rows ?? "continuous"}`
              : `${roundMm(fixedHeightMm)}mm of ${
                  paper.heightMm === null ? "continuous" : `${paper.heightMm}mm`
                }`}
          </span>
          {overflowsPage ? (
            <span className={styles.problemsError}>bands exceed the page</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default CanvasViewport;
