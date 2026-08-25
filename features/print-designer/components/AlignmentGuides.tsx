"use client";

/**
 * The maroon lines that appear while a snap is active.
 *
 * Drawn from the live `interaction.guides`, which the pointer handler fills from
 * `lib/snap.ts`. Grid snaps deliberately produce no guide: the dotted grid
 * background already shows where they land, and a line on every millimetre
 * would be noise.
 */

import type { Guide } from "@/features/print-designer/lib/snap";
import { mmToPx } from "@/features/print-designer/lib/units";
import type { CanvasScale } from "@/features/print-designer/lib/grid";
import styles from "@/features/print-designer/components/designer.module.scss";

export type AlignmentGuidesProps = {
  guides: readonly Guide[];
  zoom: number;
  scale: CanvasScale;
  /** Band content box in canvas units, so a guide spans the whole band. */
  bounds: { widthMm: number; heightMm: number };
};

export function AlignmentGuides({ guides, zoom, scale, bounds }: AlignmentGuidesProps) {
  if (!guides.length) {
    return null;
  }

  return (
    <>
      {guides.map((guide, index) =>
        guide.orientation === "vertical" ? (
          <div
            key={`v-${guide.positionMm}-${index}`}
            className={styles.guideLine}
            style={{
              left: mmToPx(guide.positionMm * scale.x, zoom),
              top: 0,
              width: 1,
              height: mmToPx(bounds.heightMm * scale.y, zoom),
            }}
          />
        ) : (
          <div
            key={`h-${guide.positionMm}-${index}`}
            className={styles.guideLine}
            style={{
              top: mmToPx(guide.positionMm * scale.y, zoom),
              left: 0,
              height: 1,
              width: mmToPx(bounds.widthMm * scale.x, zoom),
            }}
          />
        ),
      )}
    </>
  );
}

export default AlignmentGuides;
