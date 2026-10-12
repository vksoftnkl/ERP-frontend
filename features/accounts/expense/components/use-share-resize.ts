"use client";
/**
 * Drag-to-widen for grids drawn as SHARES of their width (`columns.ts`) — the
 * expense voucher's two, which fit their block as Qt's do.
 *
 * The house hook (`useColumnResize`) assumes a column is drawn at its stored
 * width; on a share layout that is not true, and a drag there runs ahead of
 * the mouse on a wide grid and lags it on a narrow one. This one works in the
 * share space, as Qt's header does with its last section stretched: the
 * dragged column grows by exactly what the mouse moved and the LAST visible
 * column gives it up, so the grid still fits. The last column's own edge is
 * the grid's edge and does not drag.
 *
 * Same contract as the house hook otherwise: a drag is LOCAL until "save
 * column width" commits it (`PUT /ui-table-masters/column-width`, the px each
 * changed column ended on), because `fixed.ui_table_columns` is the layout
 * every operator — and the Qt desktop — reads.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { MIN_RESIZED_COLUMN_PX } from "@/features/sales/quotation/quotation.utils";
import { useSaveQuotationColumnWidthsMutation } from "@/store/api/quotationApi";

type ShareColumn = { key: string; widthPx: number; columnId: string | null };

type Drag = {
  key: string;
  lastKey: string;
  startX: number;
  /** Stored px per screen px: Σ visible widths ÷ the table's drawn width. */
  ratio: number;
  startWidth: number;
  startLast: number;
};

export type ShareResize<TColumn> = {
  /** Every configured column, with any local drag applied. */
  columns: TColumn[];
  onResizeStart: (event: ReactMouseEvent<HTMLElement>, columnKey: string) => void;
  resizingKey: string | null;
  /** Columns dragged away from their saved width. */
  pendingCount: number;
  saving: boolean;
  saveWidths: () => void;
};

/**
 * The widths after moving `key`'s right edge by `storedDelta` (stored px), the
 * last visible column absorbing it — neither below the house floor. Pure.
 */
export function dragShare(
  startWidth: number,
  startLast: number,
  storedDelta: number,
): { width: number; last: number } {
  const floor = MIN_RESIZED_COLUMN_PX;
  // How far the edge may travel: until either column reaches the floor.
  const delta = Math.min(Math.max(storedDelta, floor - startWidth), startLast - floor);
  return { width: startWidth + delta, last: startLast - delta };
}

export function useShareResize<TColumn extends ShareColumn>(
  layout: TColumn[],
  visibleKeys: readonly string[],
  uiTableId: string,
): ShareResize<TColumn> {
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [resizingKey, setResizingKey] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [saveColumnWidths, saveState] = useSaveQuotationColumnWidthsMutation();

  const sized = useMemo(
    () => layout.map((column) => (widths[column.key] !== undefined ? { ...column, widthPx: widths[column.key] } : column)),
    [layout, widths],
  );

  // Measured against the layout: once a save lands, the patched layout matches
  // the local width and the column stops being pending on its own.
  const pending = useMemo(
    () =>
      layout.filter(
        (column) =>
          column.columnId !== null &&
          widths[column.key] !== undefined &&
          Math.round(widths[column.key]) !== Math.round(column.widthPx),
      ),
    [layout, widths],
  );

  const onResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLElement>, columnKey: string) => {
      const visible = sized.filter((column) => visibleKeys.includes(column.key));
      const column = visible.find((candidate) => candidate.key === columnKey);
      const last = visible.at(-1);
      const table = event.currentTarget.closest("table");
      if (!column || !last || last.key === columnKey || !table) {
        return;
      }
      const drawn = table.getBoundingClientRect().width;
      const total = visible.reduce((sum, candidate) => sum + candidate.widthPx, 0);
      if (drawn <= 0 || total <= 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      // Both the pointer and the table are in visual pixels, so their ratio is
      // free of the page's zoom (lib/ui-scale).
      dragRef.current = {
        key: columnKey,
        lastKey: last.key,
        startX: event.clientX,
        ratio: total / drawn,
        startWidth: column.widthPx,
        startLast: last.widthPx,
      };
      setResizingKey(columnKey);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    },
    [sized, visibleKeys],
  );

  useEffect(() => {
    const clearCursor = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    const onMouseMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = dragShare(drag.startWidth, drag.startLast, (event.clientX - drag.startX) * drag.ratio);
      setWidths((current) => ({ ...current, [drag.key]: next.width, [drag.lastKey]: next.last }));
    };
    const onMouseUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setResizingKey(null);
      clearCursor();
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (dragRef.current) {
        dragRef.current = null;
        clearCursor();
      }
    };
  }, []);

  const saveWidths = useCallback(() => {
    if (pending.length === 0 || saveState.isLoading) {
      return;
    }
    void saveColumnWidths({
      uiTableId,
      columns: pending.map((column) => ({
        // Non-null: `pending` keeps only columns with a configured row.
        columnId: column.columnId as string,
        widthPx: Math.round(widths[column.key]),
      })),
    });
  }, [pending, saveColumnWidths, saveState.isLoading, uiTableId, widths]);

  return {
    columns: sized,
    onResizeStart,
    resizingKey,
    pendingCount: pending.length,
    saving: saveState.isLoading,
    saveWidths,
  };
}
