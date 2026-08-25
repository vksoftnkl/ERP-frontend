"use client";

/**
 * Canvas rulers.
 *
 * Two units, one component. A GRAPHIC template is measured in millimetres, and
 * a GRID template in character columns — a dot-matrix printer has no notion of
 * a millimetre, and a mm ruler over a character grid would invite the user to
 * place a field at 43.5mm when the printer can only reach column 17. So the
 * column ruler counts cells and labels every tenth, which is how every
 * dot-matrix form is specified.
 *
 * Tick spacing adapts to zoom: at 50% a tick every millimetre is a grey smear,
 * so minor ticks drop out below a legibility floor.
 */

import { memo } from "react";
import { mmToPx } from "@/features/print-designer/lib/units";
import styles from "@/features/print-designer/components/designer.module.scss";

export type CanvasRulerProps = {
  orientation: "horizontal" | "vertical";
  /** Total length of the ruled span. */
  lengthMm: number;
  zoom: number;
  /** Character-cell mode: cell size in mm, and how many cells fit. */
  cells?: { widthMm: number; count: number };
  /** Offset of the ruled area within the ruler strip, in pixels. */
  offsetPx?: number;
};

/** Minor ticks are only drawn while they stay this far apart. */
const MIN_TICK_GAP_PX = 4;

function CanvasRulerComponent({
  orientation,
  lengthMm,
  zoom,
  cells,
  offsetPx = 0,
}: CanvasRulerProps) {
  const horizontal = orientation === "horizontal";
  const ticks: Array<{ positionPx: number; major: boolean; label: string | null }> = [];

  if (cells) {
    const cellPx = mmToPx(cells.widthMm, zoom);
    const step = cellPx >= MIN_TICK_GAP_PX ? 1 : cellPx * 5 >= MIN_TICK_GAP_PX ? 5 : 10;
    for (let column = 0; column <= cells.count; column += step) {
      const major = column % 10 === 0;
      ticks.push({
        positionPx: offsetPx + column * cellPx,
        major,
        label: major ? String(column) : null,
      });
    }
  } else {
    const mmPx = mmToPx(1, zoom);
    const step = mmPx >= MIN_TICK_GAP_PX ? 1 : mmPx * 5 >= MIN_TICK_GAP_PX ? 5 : 10;
    for (let mm = 0; mm <= Math.ceil(lengthMm); mm += step) {
      const major = mm % 10 === 0;
      ticks.push({
        positionPx: offsetPx + mmToPx(mm, zoom),
        major,
        label: major ? String(mm) : null,
      });
    }
  }

  return (
    <>
      {ticks.map((tick) => (
        <div
          key={`${tick.positionPx}-${tick.label ?? ""}`}
          className={styles.rulerTick}
          style={
            horizontal
              ? {
                  left: tick.positionPx,
                  bottom: 0,
                  width: 1,
                  height: tick.major ? 8 : 4,
                }
              : {
                  top: tick.positionPx,
                  right: 0,
                  height: 1,
                  width: tick.major ? 8 : 4,
                }
          }
        />
      ))}
      {ticks
        .filter((tick) => tick.label !== null)
        .map((tick) => (
          <span
            key={`label-${tick.positionPx}`}
            className={styles.rulerLabel}
            style={
              horizontal
                ? { left: tick.positionPx + 2, top: 2 }
                : { top: tick.positionPx + 1, left: 1, fontSize: 7 }
            }
          >
            {tick.label}
          </span>
        ))}
    </>
  );
}

export const CanvasRuler = memo(CanvasRulerComponent);

export default CanvasRuler;
