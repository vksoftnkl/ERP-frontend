"use client";

/**
 * The status bar.
 *
 * It answers the three questions a report designer asks constantly and that no
 * panel shows at a glance: what is selected, where exactly it sits, and whether
 * the template is currently valid. Geometry is here rather than only in the
 * property grid because a user dragging with the mouse is looking at the canvas,
 * not at the panel — the same reason every desktop designer puts it down here.
 *
 * The problems list hangs off this bar (upwards) instead of the toolbar: it is
 * a report about the document, and it belongs next to the document's state.
 */

import { useState } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { elementRect } from "@/features/print-designer/lib/geometry";
import { cellOf, gridMetrics } from "@/features/print-designer/lib/grid";
import { formatMm } from "@/features/print-designer/lib/units";
import { BAND_LABELS } from "@/features/print-designer/lib/vocabulary";
import { selectBand, selectElement } from "@/features/print-designer/store/designerSlice";
import {
  selectBands,
  selectDirty,
  selectLastSavedAt,
  selectLayoutMode,
  selectPaper,
  selectProblemCounts,
  selectProblems,
  selectSelectedBand,
  selectSelectedElements,
  selectSingleSelectedElement,
  selectView,
} from "@/features/print-designer/store/selectors";
import styles from "@/features/print-designer/components/designer.module.scss";

const CLOCK = new Intl.DateTimeFormat("en-IN", { timeStyle: "short", dateStyle: "medium" });

export function StatusBar() {
  const dispatch = useAppDispatch();

  const bands = useAppSelector(selectBands);
  const paper = useAppSelector(selectPaper);
  const layoutMode = useAppSelector(selectLayoutMode);
  const view = useAppSelector(selectView);
  const selectedBand = useAppSelector(selectSelectedBand);
  const selectedElements = useAppSelector(selectSelectedElements);
  const single = useAppSelector(selectSingleSelectedElement);
  const problems = useAppSelector(selectProblems);
  const counts = useAppSelector(selectProblemCounts);
  const dirty = useAppSelector(selectDirty);
  const lastSavedAt = useAppSelector(selectLastSavedAt);

  const [problemsOpen, setProblemsOpen] = useState(false);

  const isGridMode = layoutMode === "GRID";
  const elementCount = bands.reduce((total, band) => total + band.elements.length, 0);

  const what = single
    ? `${single.kind} · ${single.id}`
    : selectedElements.length > 1
      ? `${selectedElements.length} elements selected`
      : selectedBand
        ? `Band · ${BAND_LABELS[selectedBand.band.type]}`
        : "No selection";

  /** Geometry in the units the user edits in — millimetres, or cells in GRID. */
  const where = (() => {
    if (!single) {
      return null;
    }
    if (isGridMode) {
      const cell = cellOf(single);
      return `col ${cell.col}  row ${cell.row}  span ${cell.cols}`;
    }
    const rect = elementRect(single);
    return `x ${formatMm(rect.x)}  y ${formatMm(rect.y)}  w ${formatMm(rect.w)}  h ${formatMm(rect.h)} mm`;
  })();

  const paperLabel = isGridMode
    ? `${paper.code} · ${gridMetrics(paper).columns} cols`
    : `${paper.code} · ${paper.widthMm}×${paper.heightMm ?? "∞"} mm`;

  const savedLabel = (() => {
    if (dirty) {
      return "Unsaved changes";
    }
    if (!lastSavedAt) {
      return "Not saved";
    }
    const parsed = new Date(lastSavedAt);
    return Number.isNaN(parsed.getTime()) ? "Saved" : `Saved ${CLOCK.format(parsed)}`;
  })();

  return (
    <div className={styles.statusBar}>
      <span className={`${styles.statusCell} ${styles.statusCellSunken} ${styles.statusStrong}`}>
        {what}
      </span>

      {where ? (
        <span className={`${styles.statusCell} ${styles.statusCellSunken}`}>{where}</span>
      ) : null}

      <span className={styles.spacer} />

      <div className={styles.problemsWrap}>
        <button
          type="button"
          className={styles.statusButton}
          onClick={() => setProblemsOpen((open) => !open)}
        >
          {counts.errors ? (
            <span className={styles.problemsError}>
              {`${counts.errors} error${counts.errors === 1 ? "" : "s"}`}
            </span>
          ) : null}
          {counts.warnings ? (
            <span className={styles.problemsWarn}>
              {`${counts.warnings} warning${counts.warnings === 1 ? "" : "s"}`}
            </span>
          ) : null}
          {!counts.errors && !counts.warnings ? <span>No problems</span> : null}
        </button>

        {problemsOpen ? (
          <div className={styles.problemsPanel}>
            <div className={styles.panelHead}>
              <span>Problems</span>
              <span className={styles.spacer} />
              <button
                type="button"
                className={styles.bandCollapse}
                onClick={() => setProblemsOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className={styles.problemList}>
              {problems.length === 0 ? (
                <p className={styles.emptyPanel}>
                  Nothing to fix. The server would accept this definition.
                </p>
              ) : null}
              {problems.map((problem, index) => (
                <button
                  key={`${problem.message}-${index}`}
                  type="button"
                  className={styles.problemRow}
                  onClick={() => {
                    if (problem.bandIndex !== undefined && problem.elementId) {
                      dispatch(
                        selectElement({
                          bandIndex: problem.bandIndex,
                          elementId: problem.elementId,
                        }),
                      );
                    } else if (problem.bandIndex !== undefined) {
                      dispatch(selectBand(problem.bandIndex));
                    } else {
                      dispatch(selectBand(null));
                    }
                    setProblemsOpen(false);
                  }}
                >
                  <span
                    className={`${styles.problemDot} ${
                      problem.severity === "error"
                        ? styles.problemDotError
                        : styles.problemDotWarning
                    }`}
                  />
                  <span>{problem.message}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <span className={`${styles.statusCell} ${styles.statusCellSunken}`}>
        {`${bands.length} bands · ${elementCount} elements`}
      </span>
      <span className={`${styles.statusCell} ${styles.statusCellSunken}`}>{paperLabel}</span>
      <span className={`${styles.statusCell} ${styles.statusCellSunken}`}>
        {`${view.snapEnabled ? "SNAP" : "snap"} · ${view.showGrid ? "GRID" : "grid"}`}
      </span>
      <span className={`${styles.statusCell} ${styles.statusCellSunken}`}>
        {`${Math.round(view.zoom * 100)}%`}
      </span>
      <span
        className={`${styles.statusCell} ${styles.statusCellSunken} ${dirty ? styles.problemsWarn : ""}`}
      >
        {savedLabel}
      </span>
    </div>
  );
}

export default StatusBar;
