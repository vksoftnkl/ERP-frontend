"use client";
/**
 * Drag-to-widen for the two entry grids, the same gesture the master tables
 * have: grab the right edge of a header cell and pull.
 *
 * A drag is local only. `fixed.ui_table_columns` is the layout EVERY operator of
 * this screen renders from, so widening a column for yourself must not silently
 * re-lay-out the grid for everyone — the widths are held as pending until the
 * grid's "save column width" menu item commits them, which is how the master
 * pages behave. A failed save leaves the local widths alone.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useSaveQuotationColumnWidthsMutation } from "@/store/api/quotationApi";
import {
  CONFIG_PX_PER_UNIT,
  configWidthFromPx,
  MIN_RESIZED_COLUMN_PX,
  type ColumnWidthUnit,
  type ResolvedColumn,
} from "../quotation.utils";
import { toLayoutPx } from "@/lib/ui-scale";

type ResizeState = {
  key: string;
  startX: number;
  startWidth: number;
  /** Screen pixels per stored width unit, read when the drag starts. */
  scale: number;
};

/**
 * The grids draw their columns in the page's fluid unit, not in the pixels the
 * layout stores (`scaledWidth`), so a drag of N screen pixels is NOT a change of
 * N stored pixels. The table's computed font-size IS that unit, which makes it
 * the conversion factor — read once per drag, since a window resize mid-drag is
 * not worth the reflow.
 */
function unitScaleOf(element: HTMLElement): number {
  const table = element.closest("table");
  const fontSize = table ? Number.parseFloat(window.getComputedStyle(table).fontSize) : NaN;
  return Number.isFinite(fontSize) && fontSize > 0 ? fontSize / CONFIG_PX_PER_UNIT : 1;
}

export type ColumnResize<TColumn> = {
  /** The configured columns with any local drag applied. */
  columns: TColumn[];
  onResizeStart: (event: ReactMouseEvent<HTMLElement>, columnKey: string) => void;
  resizingKey: string | null;
  /** Columns dragged away from their saved width. */
  pendingCount: number;
  saving: boolean;
  saveWidths: () => void;
};

export function useColumnResize<TMeaning extends { key: string }>(
  columns: ResolvedColumn<TMeaning>[],
  uiTableId: string,
  widthUnit: ColumnWidthUnit,
): ColumnResize<ResolvedColumn<TMeaning>> {
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [resizingKey, setResizingKey] = useState<string | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  // The drag reads the column list on mouse-down only, so it must not pin a
  // stale render's copy.
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const [saveColumnWidths, saveState] = useSaveQuotationColumnWidthsMutation();

  const sized = useMemo(
    () =>
      columns.map((column) =>
        widths[column.key] ? { ...column, widthPx: widths[column.key] } : column,
      ),
    [columns, widths],
  );

  // "Pending" is measured against the layout, not against a flag: once a save
  // lands, the patched layout matches the local width and the list empties on
  // its own.
  const pending = useMemo(
    () =>
      columns.filter(
        (column) =>
          column.columnId !== null &&
          widths[column.key] !== undefined &&
          Math.round(widths[column.key]) !== Math.round(column.widthPx),
      ),
    [columns, widths],
  );

  const onResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLElement>, columnKey: string) => {
      const column = columnsRef.current.find((candidate) => candidate.key === columnKey);
      if (!column) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      resizeRef.current = {
        key: columnKey,
        startX: event.clientX,
        startWidth: widths[columnKey] ?? column.widthPx,
        scale: unitScaleOf(event.currentTarget),
      };
      setResizingKey(columnKey);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    },
    [widths],
  );

  useEffect(() => {
    const clearDragCursor = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    const onMouseMove = (event: MouseEvent) => {
      const resize = resizeRef.current;
      if (!resize) {
        return;
      }
      const nextWidth = Math.max(
        MIN_RESIZED_COLUMN_PX,
        // `resize.scale` is read from a computed style, which is in layout
        // pixels; the pointer delta is in visual ones. See lib/ui-scale.ts.
        resize.startWidth + toLayoutPx(event.clientX - resize.startX) / resize.scale,
      );
      setWidths((current) => ({ ...current, [resize.key]: nextWidth }));
    };

    const onMouseUp = () => {
      if (!resizeRef.current) {
        return;
      }
      resizeRef.current = null;
      setResizingKey(null);
      clearDragCursor();
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (resizeRef.current) {
        resizeRef.current = null;
        clearDragCursor();
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
        // Non-null: `pending` only keeps columns that have a configured row.
        columnId: column.columnId as string,
        configWidth: configWidthFromPx(widths[column.key], widthUnit),
      })),
    });
  }, [pending, saveColumnWidths, saveState.isLoading, uiTableId, widths, widthUnit]);

  return {
    columns: sized,
    onResizeStart,
    resizingKey,
    pendingCount: pending.length,
    saving: saveState.isLoading,
    saveWidths,
  };
}
