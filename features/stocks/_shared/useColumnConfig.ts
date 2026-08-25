"use client";

import {
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { extractRows } from "@/features/masters/shared/normalizers";
import { useApi } from "@/hooks/useApi";
import { UI_TABLE_COLUMNS_LIST_ENDPOINT, UI_TABLE_COLUMNS_CREATE_ENDPOINT, MIN_RESIZABLE_COLUMN_WIDTH } from "./constants";
import type { UiTableColumnPayload, SaveUiTableColumnRequest } from "./types";
import {
  findUiTableColumnConfig,
  upsertUiTableColumnConfig,
  buildUiTableColumnRequest,
  parseColumnWidth,
  reorderColumns,
} from "./stock-utils";
import { toLayoutPx } from "@/lib/ui-scale";

type UseColumnConfigOptions<TColumn extends { key: string; header: string; width: string }> = {
  tableId: string;
  defaultColumns: TColumn[];
  resolveConfiguredColumns: (configs: UiTableColumnPayload[]) => TColumn[];
};

/**
 * Manages UI table column config for any stock page:
 * - Loads saved column widths/order from the API on mount
 * - Handles mouse-drag column resize, persists via API
 * - Handles drag-to-reorder column headers, persists via API
 *
 * Both opening-stock and physical-stock share this exact pattern.
 */
export function useColumnConfig<TColumn extends { key: string; header: string; width: string }>({
  tableId,
  defaultColumns,
  resolveConfiguredColumns,
}: UseColumnConfigOptions<TColumn>) {
  const [columns, setColumns] = useState<TColumn[]>(defaultColumns);
  const [uiColumnConfigs, setUiColumnConfigs] = useState<UiTableColumnPayload[]>([]);

  const columnsRef = useRef<TColumn[]>(defaultColumns);
  const uiColumnConfigsRef = useRef<UiTableColumnPayload[]>([]);
  const draggingColumnKeyRef = useRef<string | null>(null);
  const resizingColumnRef = useRef<{
    key: string;
    startX: number;
    startWidth: number;
    currentWidth: number;
  } | null>(null);
  const columnSaveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => { columnsRef.current = columns; }, [columns]);
  useEffect(() => { uiColumnConfigsRef.current = uiColumnConfigs; }, [uiColumnConfigs]);

  const { getAll: listUiTableColumns } = useApi<unknown>(UI_TABLE_COLUMNS_LIST_ENDPOINT, {
    toast: { success: false, error: false },
  });

  const { run: saveUiTableColumn } = useApi<
    { data?: UiTableColumnPayload },
    SaveUiTableColumnRequest
  >(UI_TABLE_COLUMNS_CREATE_ENDPOINT, {
    method: "POST",
    toast: { success: false, error: false },
  });

  // ── Load on mount ──────────────────────────────────────────────────────────

  const loadColumnConfigs = useCallback(async () => {
    try {
      const payload = await listUiTableColumns({
        uiTblClmTableId: tableId,
      });
      const configuredColumns = extractRows<UiTableColumnPayload>(payload, [
        "data", "rows", "items", "results", "columns", "uiTableColumns",
      ]);
      uiColumnConfigsRef.current = configuredColumns;
      setUiColumnConfigs(configuredColumns);
      const resolvedColumns = resolveConfiguredColumns(configuredColumns);
      setColumns(resolvedColumns.length > 0 ? resolvedColumns : defaultColumns);
    } catch {
      uiColumnConfigsRef.current = [];
      setUiColumnConfigs([]);
      setColumns(defaultColumns);
    }
  }, [defaultColumns, listUiTableColumns, resolveConfiguredColumns, tableId]);

  // ── Persist helpers ────────────────────────────────────────────────────────

  const enqueueColumnSave = useCallback((task: () => Promise<void>) => {
    const saveTask = columnSaveQueueRef.current.catch(() => undefined).then(task);
    columnSaveQueueRef.current = saveTask;
    return saveTask;
  }, []);

  const persistColumnWidth = useCallback(
    async (columnKey: string, width: number) => {
      const renderedColumns = columnsRef.current;
      const columnIndex = renderedColumns.findIndex((c) => c.key === columnKey);
      const column = columnIndex >= 0 ? renderedColumns[columnIndex] : null;
      if (!column || !Number.isFinite(width) || width <= 0) return;

      const configuredColumn = findUiTableColumnConfig(uiColumnConfigsRef.current, columnKey);
      try {
        const response = await saveUiTableColumn({
          body: buildUiTableColumnRequest(column, configuredColumn, columnIndex, tableId, {
            uiTblClmColumnWidth: width,
          }),
        });
        const savedColumn = response?.data;
        if (!savedColumn) return;
        setUiColumnConfigs((current) => {
          const nextColumns = upsertUiTableColumnConfig(current, savedColumn, columnKey);
          uiColumnConfigsRef.current = nextColumns;
          return nextColumns;
        });
      } catch {
        // Keep the local resize even if persistence fails.
      }
    },
    [saveUiTableColumn, tableId],
  );

  const persistColumnOrder = useCallback(
    async (orderedColumns: TColumn[]) => {
      let nextColumnConfigs = uiColumnConfigsRef.current;
      for (const [columnIndex, column] of orderedColumns.entries()) {
        const configuredColumn = findUiTableColumnConfig(nextColumnConfigs, column.key);
        try {
          const response = await saveUiTableColumn({
            body: buildUiTableColumnRequest(column, configuredColumn, columnIndex, tableId, {
              uiTblClmColumnPosition: columnIndex + 1,
              uiTblClmColumnWidth: parseColumnWidth(column.width),
            }),
          });
          const savedColumn = response?.data;
          if (!savedColumn) continue;
          nextColumnConfigs = upsertUiTableColumnConfig(nextColumnConfigs, savedColumn, column.key);
        } catch {
          // Continue saving the rest of the order.
        }
      }
      uiColumnConfigsRef.current = nextColumnConfigs;
      setUiColumnConfigs(nextColumnConfigs);
    },
    [saveUiTableColumn, tableId],
  );

  // ── Drag-to-reorder ────────────────────────────────────────────────────────

  const handleColumnDragStart = useCallback(
    (event: ReactDragEvent<HTMLDivElement>, columnKey: string) => {
      draggingColumnKeyRef.current = columnKey;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", columnKey);
    },
    [],
  );

  const handleColumnDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleColumnDrop = useCallback(
    (targetKey: string) => {
      const sourceKey = draggingColumnKeyRef.current;
      draggingColumnKeyRef.current = null;
      if (!sourceKey || sourceKey === targetKey) return;
      setColumns((current) => {
        const nextColumns = reorderColumns(current, sourceKey, targetKey);
        if (nextColumns === current) return current;
        columnsRef.current = nextColumns;
        void enqueueColumnSave(() => persistColumnOrder(nextColumns));
        return nextColumns;
      });
    },
    [enqueueColumnSave, persistColumnOrder],
  );

  const handleColumnDragEnd = useCallback(() => {
    draggingColumnKeyRef.current = null;
  }, []);

  // ── Mouse-resize ───────────────────────────────────────────────────────────

  const handleColumnResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLSpanElement>, columnKey: string, width: string) => {
      event.preventDefault();
      event.stopPropagation();
      const startWidth = parseColumnWidth(width);
      resizingColumnRef.current = {
        key: columnKey,
        startX: event.clientX,
        startWidth,
        currentWidth: startWidth,
      };
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    },
    [],
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const activeResize = resizingColumnRef.current;
      if (!activeResize) return;
      // The pointer moves in visual pixels; the width it drives is a CSS
      // length under the global UI scale. See lib/ui-scale.ts.
      const delta = toLayoutPx(event.clientX - activeResize.startX);
      const nextWidth = Math.max(MIN_RESIZABLE_COLUMN_WIDTH, activeResize.startWidth + delta);
      activeResize.currentWidth = nextWidth;
      setColumns((current) =>
        current.map((column) =>
          column.key === activeResize.key ? { ...column, width: `${nextWidth}px` } : column,
        ),
      );
    };

    const handleMouseUp = () => {
      const activeResize = resizingColumnRef.current;
      if (!activeResize) return;
      resizingColumnRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (Math.round(activeResize.currentWidth) !== Math.round(activeResize.startWidth)) {
        void enqueueColumnSave(() => persistColumnWidth(activeResize.key, activeResize.currentWidth));
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      if (resizingColumnRef.current) {
        resizingColumnRef.current = null;
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      }
    };
  }, [enqueueColumnSave, persistColumnWidth]);

  return {
    columns,
    setColumns,
    columnsRef,
    uiColumnConfigs,
    // Load
    loadColumnConfigs,
    // Drag-to-reorder handlers
    handleColumnDragStart,
    handleColumnDragOver,
    handleColumnDrop,
    handleColumnDragEnd,
    // Resize handler
    handleColumnResizeStart,
    // Manual persist
    persistColumnWidth,
    persistColumnOrder,
    enqueueColumnSave,
  };
}
