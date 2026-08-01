"use client";

/**
 * The draggable divider between the Items grid and the Additional charges grid.
 *
 * The charges pane owns the explicit height and the items pane simply takes what
 * is left, so the split needs no recomputation when the window resizes — but the
 * stored height is re-clamped against the live container on every resize, or a
 * value saved on a taller window would squeeze the items grid out of view.
 *
 * The height is per-browser (localStorage), not part of the draft: it is a view
 * preference, and persisting it per document would fight the operator.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";

const STORAGE_KEY = "erp.quotation.chargesPaneHeight";
/** Head band plus one row, so a collapsed pane still shows what it is. */
const MIN_CHARGES_PANE_HEIGHT = 92;
/** Head band, the column header and a couple of rows kept on the items side. */
const MIN_ITEMS_PANE_HEIGHT = 110;
/** The row's own gaps around the handle — not usable by either pane. */
const ROW_GAP_ALLOWANCE = 16;
/** Nudge per arrow key; Shift takes a coarser step. */
const KEY_STEP = 16;
const KEY_STEP_COARSE = 64;

/** The tallest the charges pane may be inside a row of `available` px. */
function ceilingFor(available: number): number {
  return Math.max(
    MIN_CHARGES_PANE_HEIGHT,
    available - MIN_ITEMS_PANE_HEIGHT - ROW_GAP_ALLOWANCE,
  );
}

export type ChargesPaneSplit = {
  /** `null` until the operator resizes: the pane then sizes to its rows. */
  height: number | null;
  dragging: boolean;
  minHeight: number;
  maxHeight: number;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  onDoubleClick: () => void;
};

export function useChargesPaneSplit(
  containerRef: RefObject<HTMLElement | null>,
  paneRef: RefObject<HTMLElement | null>,
): ChargesPaneSplit {
  // Untouched, the pane keeps the content-driven height it has always had; a
  // resize is what pins it, so a two-charge quotation does not open with an
  // acre of empty grid.
  const [height, setHeight] = useState<number | null>(null);
  const [maxHeight, setMaxHeight] = useState(MIN_CHARGES_PANE_HEIGHT);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const clamp = useCallback(
    (next: number) => {
      const available = containerRef.current?.getBoundingClientRect().height ?? 0;
      // Before the first measurement there is nothing to clamp against; the
      // resize effect re-clamps as soon as the row has a height.
      const ceiling = available > 0 ? ceilingFor(available) : Number.POSITIVE_INFINITY;
      return Math.round(Math.min(Math.max(next, MIN_CHARGES_PANE_HEIGHT), ceiling));
    },
    [containerRef],
  );

  /** The pane's live height, whether it is pinned or still content-sized. */
  const currentHeight = useCallback(
    () => height ?? paneRef.current?.getBoundingClientRect().height ?? 0,
    [height, paneRef],
  );

  const persist = useCallback((value: number | null) => {
    try {
      if (value === null) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, String(value));
      }
    } catch {
      // A blocked storage (private mode, quota) just means the split is per-visit.
    }
  }, []);

  // Restore on mount rather than during render: the server has no localStorage
  // and a differing first paint would trip hydration.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    const parsed = Number(stored);
    if (Number.isFinite(parsed) && parsed > 0) {
      setHeight(clamp(parsed));
    }
  }, [clamp]);

  // Keep both the height and the reported ceiling honest as the window changes.
  useEffect(() => {
    const measure = () => {
      const available = containerRef.current?.getBoundingClientRect().height ?? 0;
      if (available > 0) {
        setMaxHeight(Math.round(ceilingFor(available)));
      }
      setHeight((current) => (current === null ? null : clamp(current)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [clamp, containerRef]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { startY: event.clientY, startHeight: currentHeight() };
      setDragging(true);
    },
    [currentHeight],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }
      // Dragging the handle up grows the charges pane.
      setHeight(clamp(drag.startHeight + (drag.startY - event.clientY)));
    },
    [clamp],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!dragRef.current) {
        return;
      }
      dragRef.current = null;
      setDragging(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setHeight((current) => {
        persist(current);
        return current;
      });
    },
    [persist],
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      const step = event.shiftKey ? KEY_STEP_COARSE : KEY_STEP;
      const delta =
        event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0;
      if (delta === 0) {
        return;
      }
      event.preventDefault();
      const next = clamp(currentHeight() + delta);
      setHeight(next);
      persist(next);
    },
    [clamp, currentHeight, persist],
  );

  /** Back to the content-driven height the pane opens with. */
  const onDoubleClick = useCallback(() => {
    setHeight(null);
    persist(null);
  }, [persist]);

  return {
    height,
    dragging,
    minHeight: MIN_CHARGES_PANE_HEIGHT,
    maxHeight,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onKeyDown,
    onDoubleClick,
  };
}

export type GridSplitterProps = {
  split: ChargesPaneSplit;
};

export function GridSplitter({ split }: GridSplitterProps) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the items and additional charges grids"
      aria-valuenow={split.height ?? undefined}
      aria-valuemin={split.minHeight}
      aria-valuemax={split.maxHeight}
      tabIndex={0}
      title="Drag to resize the grids · double-click to reset"
      className={cx(styles.paneSplitter, split.dragging && styles.paneSplitterActive)}
      onPointerDown={split.onPointerDown}
      onPointerMove={split.onPointerMove}
      onPointerUp={split.onPointerUp}
      onPointerCancel={split.onPointerUp}
      onKeyDown={split.onKeyDown}
      onDoubleClick={split.onDoubleClick}
    >
      <span className={styles.paneSplitterGrip} aria-hidden="true" />
    </div>
  );
}
