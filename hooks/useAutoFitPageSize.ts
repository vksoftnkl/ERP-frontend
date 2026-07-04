"use client";
import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

// Used until at least one real data row has rendered and can be measured.
// Derived from the table cell metrics (0.72rem vertical padding + 1.35
// line-height at 0.92rem font size + row border).
const FALLBACK_ROW_HEIGHT_PX = 44;
const MIN_AUTO_PAGE_SIZE = 1;
const MAX_AUTO_PAGE_SIZE = 100;

// Last row height sampled from real rows anywhere in the app. Tables share
// the same cell metrics, so seeding new mounts with it lets the first request
// usually carry the right limit instead of estimate-then-correct.
let lastSampledRowHeight: number | null = null;

type RowHeightSample = {
  value: number;
  fromRealRows: boolean;
};

type RemeasureOptions = {
  /**
   * Drop the cached row height and re-sample it from the rendered rows.
   * Pass when the column layout changed (resize/reorder/visibility), since
   * that can change text wrapping and therefore row height.
   */
  invalidateRowHeight?: boolean;
};

type UseAutoFitPageSizeArgs = {
  enabled: boolean;
  /** Scrollable element that hosts the table; its client box is the budget. */
  viewportRef: RefObject<HTMLElement | null>;
  /** Fixed header row block (thead); subtracted from the viewport budget. */
  headerRef: RefObject<HTMLElement | null>;
  /** Table body whose rows are sampled for the per-row height. */
  bodyRef: RefObject<HTMLTableSectionElement | null>;
  /** Filters out non-data rows (e.g. the empty-state placeholder row). */
  isDataRow?: (row: HTMLTableRowElement) => boolean;
};

/**
 * Computes how many table rows fit in the viewport without vertical
 * scrolling: floor((viewport height - header height) / row height).
 *
 * The row height is sampled from rendered data rows (averaged) and then
 * locked, so paging through records with occasional taller rows does not
 * oscillate the page size. It is re-sampled when the viewport width changes
 * (window resize / breakpoint / zoom) or when the caller invalidates it
 * after a column-layout change.
 *
 * The first measurement runs in a layout effect so it lands before the
 * data-loading effects of the page, letting the very first request already
 * carry the fitted limit instead of a hardcoded default.
 */
export function useAutoFitPageSize({
  enabled,
  viewportRef,
  headerRef,
  bodyRef,
  isDataRow,
}: UseAutoFitPageSizeArgs): {
  autoPageSize: number | null;
  remeasure: (options?: RemeasureOptions) => void;
} {
  const [autoPageSize, setAutoPageSize] = useState<number | null>(null);
  const appliedRef = useRef<number | null>(null);
  const rowHeightRef = useRef<RowHeightSample | null>(null);
  const viewportWidthRef = useRef<number | null>(null);
  const isDataRowRef = useRef(isDataRow);
  isDataRowRef.current = isDataRow;
  const measure = useCallback(
    (options?: RemeasureOptions) => {
      if (!enabled) {
        return;
      }
      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }
      const headerHeight = headerRef.current?.offsetHeight ?? 0;
      const availableHeight = viewport.clientHeight - headerHeight;
      if (availableHeight <= 0) {
        // Hidden (display: none) or not laid out yet; keep the last value.
        return;
      }
      if (options?.invalidateRowHeight) {
        rowHeightRef.current = null;
      }
      const viewportWidth = viewport.clientWidth;
      if (
        viewportWidthRef.current !== null &&
        Math.abs(viewportWidth - viewportWidthRef.current) > 1
      ) {
        rowHeightRef.current = null;
      }
      viewportWidthRef.current = viewportWidth;
      if (!rowHeightRef.current?.fromRealRows) {
        const body = bodyRef.current;
        const dataRows = body
          ? Array.from(body.rows).filter(
              (row) => isDataRowRef.current?.(row) ?? true,
            )
          : [];
        if (dataRows.length > 0) {
          const totalHeight = dataRows.reduce(
            (sum, row) => sum + row.offsetHeight,
            0,
          );
          if (totalHeight > 0) {
            rowHeightRef.current = {
              value: totalHeight / dataRows.length,
              fromRealRows: true,
            };
            lastSampledRowHeight = rowHeightRef.current.value;
          }
        }
        if (!rowHeightRef.current) {
          rowHeightRef.current = {
            value: lastSampledRowHeight ?? FALLBACK_ROW_HEIGHT_PX,
            fromRealRows: false,
          };
        }
      }
      const next = Math.min(
        MAX_AUTO_PAGE_SIZE,
        Math.max(
          MIN_AUTO_PAGE_SIZE,
          Math.floor(availableHeight / rowHeightRef.current.value),
        ),
      );
      if (appliedRef.current !== next) {
        appliedRef.current = next;
        setAutoPageSize(next);
      }
    },
    [bodyRef, enabled, headerRef, viewportRef],
  );
  useLayoutEffect(() => {
    measure();
  }, [measure]);
  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }
    const viewport = viewportRef.current;
    if (viewport && typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => measure());
      observer.observe(viewport);
      return () => observer.disconnect();
    }
    const handleResize = () => measure();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [enabled, measure, viewportRef]);
  return {
    autoPageSize: enabled ? autoPageSize : null,
    remeasure: measure,
  };
}