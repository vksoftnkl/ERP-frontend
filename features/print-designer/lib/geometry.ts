/**
 * Element geometry in band-relative millimetres.
 *
 * Every element kind stores its extent differently — QRCODE has `size`, LINE has
 * two endpoints, TEXT has optional `w`/`h` — and the selection overlay, the
 * alignment tools and the bounds validator all need one rectangle regardless.
 * `elementRect` is that normalisation, and `withRect` is its inverse.
 */

import type {
  Band,
  ReportElement,
  TemplateDefinition,
} from "@/features/print-designer/types/template-definition";
import { clamp, roundMm } from "@/features/print-designer/lib/units";

export type Rect = { x: number; y: number; w: number; h: number };

/** Smallest extent the designer will let a drag produce. */
export const MIN_ELEMENT_MM = 2;

/** Fallback box for a text element that has never been sized. */
export const DEFAULT_TEXT_W_MM = 40;
export const DEFAULT_TEXT_H_MM = 5;

export function elementRect(element: ReportElement): Rect {
  switch (element.kind) {
    case "LINE": {
      const x = Math.min(element.x1, element.x2);
      const y = Math.min(element.y1, element.y2);
      return {
        x,
        y,
        w: Math.abs(element.x2 - element.x1),
        h: Math.abs(element.y2 - element.y1),
      };
    }
    case "QRCODE":
      return { x: element.x, y: element.y, w: element.size, h: element.size };
    case "PAGEBREAK":
      // A page break has no extent; give it a visible strip so it can be
      // selected and moved like anything else.
      return { x: element.x, y: element.y, w: element.w ?? 20, h: element.h ?? 4 };
    case "RECT":
    case "IMAGE":
    case "BARCODE":
      return { x: element.x, y: element.y, w: element.w, h: element.h };
    default:
      return {
        x: element.x,
        y: element.y,
        w: element.w ?? DEFAULT_TEXT_W_MM,
        h: element.h ?? DEFAULT_TEXT_H_MM,
      };
  }
}

/**
 * Write a rectangle back onto an element, preserving each kind's own storage.
 * Returns a new element; callers are reducers working on drafts and rely on
 * this being pure.
 */
export function withRect<T extends ReportElement>(element: T, rect: Rect): T {
  const x = roundMm(rect.x);
  const y = roundMm(rect.y);
  const w = roundMm(rect.w);
  const h = roundMm(rect.h);

  switch (element.kind) {
    case "LINE": {
      // Keep the line's direction: dragging a diagonal must not silently flip
      // it to point the other way.
      const flippedX = element.x2 < element.x1;
      const flippedY = element.y2 < element.y1;
      return {
        ...element,
        x,
        y,
        x1: flippedX ? x + w : x,
        x2: flippedX ? x : x + w,
        y1: flippedY ? y + h : y,
        y2: flippedY ? y : y + h,
      };
    }
    case "QRCODE":
      // Square by definition; the smaller axis wins so a drag never grows the
      // element past where the pointer went.
      return { ...element, x, y, size: Math.max(MIN_ELEMENT_MM, Math.min(w, h)) };
    default:
      return { ...element, x, y, w, h };
  }
}

export function moveElement<T extends ReportElement>(element: T, dx: number, dy: number): T {
  const rect = elementRect(element);
  return withRect(element, { ...rect, x: rect.x + dx, y: rect.y + dy });
}

/** The union box of a set of elements — the multi-selection bounding box. */
export function unionRect(rects: readonly Rect[]): Rect | null {
  if (!rects.length) {
    return null;
  }
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const rect of rects) {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.w);
    bottom = Math.max(bottom, rect.y + rect.h);
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

export function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

/** A rectangle from two corners, in either order. */
export function rectFromPoints(ax: number, ay: number, bx: number, by: number): Rect {
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    w: Math.abs(bx - ax),
    h: Math.abs(by - ay),
  };
}

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const RESIZE_HANDLES: readonly ResizeHandle[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

/**
 * Apply a resize gesture. `dx`/`dy` are the pointer delta in millimetres; the
 * handle decides which edges move. The minimum size is enforced by holding the
 * opposite edge still, which is what stops a fast drag past the anchor from
 * inverting the box.
 */
export function resizeRect(rect: Rect, handle: ResizeHandle, dx: number, dy: number): Rect {
  let { x, y, w, h } = rect;

  if (handle.includes("w")) {
    const nextX = Math.min(x + dx, x + w - MIN_ELEMENT_MM);
    w += x - nextX;
    x = nextX;
  }
  if (handle.includes("e")) {
    w = Math.max(MIN_ELEMENT_MM, w + dx);
  }
  if (handle.includes("n")) {
    const nextY = Math.min(y + dy, y + h - MIN_ELEMENT_MM);
    h += y - nextY;
    y = nextY;
  }
  if (handle.includes("s")) {
    h = Math.max(MIN_ELEMENT_MM, h + dy);
  }

  return { x, y, w, h };
}

/**
 * A band's drawing box.
 *
 * The two axes are NOT symmetrical, and this is the fact the whole canvas is
 * built on: the layout engine emits an element at `x` directly and at
 * `bandTop + y`. So `x` is measured from the PAGE's left edge — margins do not
 * shift it — while `y` is relative to the band. The shipped GST invoice proves
 * it: with 8mm margins its frame sits at x=8 and runs 194mm, exactly to the
 * right margin.
 *
 * That is why the box is the full paper width. Margins are guides the user can
 * snap to, not a coordinate origin.
 */
export function bandContentSize(
  definition: TemplateDefinition,
  band: Band,
): { widthMm: number; heightMm: number } {
  return { widthMm: definition.paper.widthMm, heightMm: band.heightMm };
}

/**
 * Hold a rectangle inside the page.
 *
 * Horizontally this is a hard clamp — the server rejects an element whose right
 * edge passes the page width, so letting one out there only defers the failure
 * to save time. Crossing a MARGIN is allowed: a full-bleed rule or a frame
 * drawn to the margin line is ordinary invoice stationery, and `lib/validate.ts`
 * warns about it rather than the canvas preventing it.
 *
 * Vertically nothing is clamped: an autoGrow band reflows at render time, and
 * the designer would otherwise fight the user over an element that will fit
 * once the band grows.
 */
export function clampRectToBand(
  rect: Rect,
  bounds: { widthMm: number; heightMm: number },
): Rect {
  const w = Math.min(rect.w, bounds.widthMm);
  return {
    x: clamp(rect.x, 0, Math.max(0, bounds.widthMm - w)),
    y: Math.max(0, rect.y),
    w,
    h: rect.h,
  };
}
