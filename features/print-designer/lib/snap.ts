/**
 * Snapping and alignment guides.
 *
 * Two independent snap sources, resolved per axis: the millimetre grid, and the
 * edges and centres of everything else in the band plus the band's own bounds.
 * Neighbour snaps win ties, because aligning to the element above is what the
 * user is actually trying to do — the grid is only the fallback that keeps
 * free-floating drags tidy.
 */

import type { Rect } from "@/features/print-designer/lib/geometry";
import { roundMm } from "@/features/print-designer/lib/units";

/** Snap tolerance in millimetres at zoom 1. Scaled down as the user zooms in. */
export const SNAP_THRESHOLD_MM = 1.5;

export type GuideOrientation = "vertical" | "horizontal";

export type Guide = {
  orientation: GuideOrientation;
  /** Millimetres from the band content box's top-left. */
  positionMm: number;
  /** What produced it, for the guide's tooltip and for tests. */
  source: "grid" | "element" | "band";
};

export type SnapTarget = {
  /** Candidate coordinate on the axis. */
  positionMm: number;
  source: Guide["source"];
};

export type SnapContext = {
  gridMm: number;
  snapEnabled: boolean;
  zoom: number;
  bounds: { widthMm: number; heightMm: number };
  /**
   * The page's margin lines, in the same page-relative millimetres as `x`.
   * These are the most useful snap targets on the whole canvas: a column of
   * amounts is right-aligned to the right margin, not to the sheet edge.
   */
  margins?: { left: number; right: number };
  /** Rectangles of the other elements in the band. */
  neighbours: readonly Rect[];
};

export const snapThresholdMm = (zoom: number): number =>
  SNAP_THRESHOLD_MM / Math.max(zoom, 0.25);

function verticalTargets(context: SnapContext): SnapTarget[] {
  const targets: SnapTarget[] = [
    { positionMm: 0, source: "band" },
    { positionMm: context.bounds.widthMm, source: "band" },
    { positionMm: context.bounds.widthMm / 2, source: "band" },
  ];
  if (context.margins) {
    targets.push({ positionMm: context.margins.left, source: "band" });
    targets.push({ positionMm: context.bounds.widthMm - context.margins.right, source: "band" });
  }
  for (const rect of context.neighbours) {
    targets.push({ positionMm: rect.x, source: "element" });
    targets.push({ positionMm: rect.x + rect.w, source: "element" });
    targets.push({ positionMm: rect.x + rect.w / 2, source: "element" });
  }
  return targets;
}

function horizontalTargets(context: SnapContext): SnapTarget[] {
  const targets: SnapTarget[] = [
    { positionMm: 0, source: "band" },
    { positionMm: context.bounds.heightMm, source: "band" },
  ];
  for (const rect of context.neighbours) {
    targets.push({ positionMm: rect.y, source: "element" });
    targets.push({ positionMm: rect.y + rect.h, source: "element" });
    targets.push({ positionMm: rect.y + rect.h / 2, source: "element" });
  }
  return targets;
}

type AxisSnap = { delta: number; guide: Guide | null };

/**
 * Best snap for one axis.
 *
 * `candidates` are the moving rectangle's own interesting coordinates (left,
 * centre, right — or top, middle, bottom). The winner is the smallest
 * correction across every candidate x target pair, so dragging an element by
 * its centre snaps that centre, not its left edge.
 */
function snapAxis(
  candidates: readonly number[],
  targets: readonly SnapTarget[],
  threshold: number,
  gridMm: number,
  orientation: GuideOrientation,
): AxisSnap {
  let best: AxisSnap = { delta: 0, guide: null };
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    for (const target of targets) {
      const distance = Math.abs(target.positionMm - candidate);
      if (distance > threshold) {
        continue;
      }
      // Strictly less-than keeps the first (band/element) target on a tie,
      // which matters because targets are ordered neighbour-first.
      if (distance < bestDistance) {
        bestDistance = distance;
        best = {
          delta: target.positionMm - candidate,
          guide: { orientation, positionMm: target.positionMm, source: target.source },
        };
      }
    }
  }

  if (best.guide) {
    return best;
  }

  // No neighbour in range: fall back to the grid, which has no guide line of
  // its own — the dotted background already shows it.
  if (gridMm > 0) {
    const anchor = candidates[0] ?? 0;
    const snapped = Math.round(anchor / gridMm) * gridMm;
    if (Math.abs(snapped - anchor) <= threshold) {
      return { delta: snapped - anchor, guide: null };
    }
  }

  return { delta: 0, guide: null };
}

export type SnapResult = { rect: Rect; guides: Guide[] };

/** Snap a moving rectangle on both axes and report the guides that fired. */
export function snapRect(rect: Rect, context: SnapContext): SnapResult {
  if (!context.snapEnabled) {
    return { rect, guides: [] };
  }

  const threshold = snapThresholdMm(context.zoom);
  const x = snapAxis(
    [rect.x, rect.x + rect.w / 2, rect.x + rect.w],
    verticalTargets(context),
    threshold,
    context.gridMm,
    "vertical",
  );
  const y = snapAxis(
    [rect.y, rect.y + rect.h / 2, rect.y + rect.h],
    horizontalTargets(context),
    threshold,
    context.gridMm,
    "horizontal",
  );

  const guides: Guide[] = [];
  if (x.guide) {
    guides.push(x.guide);
  }
  if (y.guide) {
    guides.push(y.guide);
  }

  return {
    rect: { ...rect, x: roundMm(rect.x + x.delta), y: roundMm(rect.y + y.delta) },
    guides,
  };
}

/**
 * Snap a resize gesture: only the edges the handle actually moved may snap, so
 * dragging the east handle never nudges the element's left edge.
 */
export function snapResizedRect(
  rect: Rect,
  handle: string,
  context: SnapContext,
): SnapResult {
  if (!context.snapEnabled) {
    return { rect, guides: [] };
  }

  const threshold = snapThresholdMm(context.zoom);
  const guides: Guide[] = [];
  let { x, y, w, h } = rect;

  if (handle.includes("w") || handle.includes("e")) {
    const movingEdge = handle.includes("w") ? x : x + w;
    const axis = snapAxis([movingEdge], verticalTargets(context), threshold, context.gridMm, "vertical");
    if (axis.delta) {
      if (handle.includes("w")) {
        x += axis.delta;
        w -= axis.delta;
      } else {
        w += axis.delta;
      }
      if (axis.guide) {
        guides.push(axis.guide);
      }
    }
  }

  if (handle.includes("n") || handle.includes("s")) {
    const movingEdge = handle.includes("n") ? y : y + h;
    const axis = snapAxis([movingEdge], horizontalTargets(context), threshold, context.gridMm, "horizontal");
    if (axis.delta) {
      if (handle.includes("n")) {
        y += axis.delta;
        h -= axis.delta;
      } else {
        h += axis.delta;
      }
      if (axis.guide) {
        guides.push(axis.guide);
      }
    }
  }

  return {
    rect: { x: roundMm(x), y: roundMm(y), w: roundMm(w), h: roundMm(h) },
    guides,
  };
}
