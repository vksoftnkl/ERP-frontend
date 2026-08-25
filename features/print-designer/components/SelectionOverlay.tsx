"use client";

/**
 * Selection chrome: the bounding box and, for a single element, eight resize
 * handles.
 *
 * A multi-selection gets the box only. Resizing several elements at once means
 * choosing between scaling each box and scaling the group, and neither answer
 * is right often enough to be worth the ambiguity — the property panel edits
 * the whole selection's width when that is what the user wants.
 */

import type { PointerEvent as ReactPointerEvent } from "react";
import type { Rect, ResizeHandle } from "@/features/print-designer/lib/geometry";
import { RESIZE_HANDLES } from "@/features/print-designer/lib/geometry";
import { mmToPx } from "@/features/print-designer/lib/units";
import type { CanvasScale } from "@/features/print-designer/lib/grid";
import styles from "@/features/print-designer/components/designer.module.scss";

export type SelectionOverlayProps = {
  /** In canvas units — millimetres in GRAPHIC mode, cells in GRID mode. */
  rect: Rect;
  zoom: number;
  scale: CanvasScale;
  /** Handles are only drawn for a single-element selection. */
  resizable: boolean;
  onHandlePointerDown: (event: ReactPointerEvent<HTMLDivElement>, handle: ResizeHandle) => void;
};

const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

/** Handle centre as a fraction of the box, per compass point. */
const HANDLE_POSITION: Record<ResizeHandle, { fx: number; fy: number }> = {
  nw: { fx: 0, fy: 0 },
  n: { fx: 0.5, fy: 0 },
  ne: { fx: 1, fy: 0 },
  e: { fx: 1, fy: 0.5 },
  se: { fx: 1, fy: 1 },
  s: { fx: 0.5, fy: 1 },
  sw: { fx: 0, fy: 1 },
  w: { fx: 0, fy: 0.5 },
};

const HANDLE_SIZE_PX = 7;

export function SelectionOverlay({
  rect,
  zoom,
  scale,
  resizable,
  onHandlePointerDown,
}: SelectionOverlayProps) {
  const left = mmToPx(rect.x * scale.x, zoom);
  const top = mmToPx(rect.y * scale.y, zoom);
  const width = mmToPx(rect.w * scale.x, zoom);
  const height = mmToPx(rect.h * scale.y, zoom);

  return (
    <>
      <div className={styles.selectionBox} style={{ left, top, width, height }} />
      {resizable
        ? RESIZE_HANDLES.map((handle) => {
            const { fx, fy } = HANDLE_POSITION[handle];
            return (
              <div
                key={handle}
                className={styles.selectionHandle}
                style={{
                  left: left + width * fx - HANDLE_SIZE_PX / 2,
                  top: top + height * fy - HANDLE_SIZE_PX / 2,
                  cursor: HANDLE_CURSORS[handle],
                }}
                onPointerDown={(event) => onHandlePointerDown(event, handle)}
                data-resize-handle={handle}
              />
            );
          })
        : null}
    </>
  );
}

export default SelectionOverlay;
