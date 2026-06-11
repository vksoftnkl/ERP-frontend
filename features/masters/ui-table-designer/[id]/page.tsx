"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import ReusableTable, {
  type ReusableTableColumn,
  type ReusableTableRowReorderEdge,
} from "@/components/ui/table";
import { useApi } from "@/hooks/useApi";
import type { ApiSuccessResponse } from "@/utils/types";
import styles from "./page.module.scss";
import type {
  SaveUiTableColumnRequest,
  SaveUiTableMasterRequest,
  UiTableColumnPayload,
  UiTableColumnRow,
  UiTableDeviceType,
  UiTableForm,
  UiTableOption,
  UiTablePayload,
} from "./type";
const UI_TABLE_MASTERS_LIST_ENDPOINT = "/ui-table-masters/get";
const UI_TABLE_MASTERS_CREATE_ENDPOINT = "/ui-table-masters/create";
const UI_TABLE_MASTERS_DELETE_ENDPOINT = "/ui-table-masters/delete";
const UI_TABLE_COLUMN_DELETE_ENDPOINT = "/ui-table-masters/column-delete";
const UI_TABLE_COLUMNS_TABLE_MIN_WIDTH = "1440px";
const UI_TABLE_DEVICE_TYPE_OPTIONS = [
  "web",
  "mobile",
  "desktop",
] as const satisfies readonly UiTableDeviceType[];
const DEFAULT_UI_TABLE_DEVICE_TYPE: UiTableDeviceType = "web";
const INITIAL_FORM: UiTableForm = {
  uiTableId: "",
  uiTblName: "",
  uiTblDeviceType: DEFAULT_UI_TABLE_DEVICE_TYPE,
  uiTblEditable: false,
  uiTblIsActive: true,
};
function createLocalColumnId(): string {
  return `ui-column-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function createColumnDraft(
  columnNumber: number,
  overrides: Partial<UiTableColumnRow> = {},
): UiTableColumnRow {
  return {
    id: createLocalColumnId(),
    uiTblClmId: null,
    columnNumber,
    columnName: "",
    width: "100",
    visible: true,
    focus: false,
    position: String(columnNumber),
    necessity: false,
    nextColumn: "",
    previousColumn: "",
    isActive: true,
    ...overrides,
  };
}
function createBlankForm(): UiTableForm {
  return {
    uiTableId: "",
    uiTblName: "",
    uiTblDeviceType: DEFAULT_UI_TABLE_DEVICE_TYPE,
    uiTblEditable: false,
    uiTblIsActive: true,
  };
}
function resequenceColumns(columns: UiTableColumnRow[]): UiTableColumnRow[] {
  return columns.map((column, index) => ({
    ...column,
    columnNumber: index + 1,
    position: String(index + 1),
  }));
}
function clampPosition(value: number, totalRows: number): number {
  if (totalRows <= 0) {
    return 1;
  }
  const normalizedValue = Number.isFinite(value) ? Math.trunc(value) : 1;
  return Math.min(Math.max(normalizedValue, 1), totalRows);
}
function moveColumn(
  columns: UiTableColumnRow[],
  sourceId: string,
  targetId: string,
  edge: ReusableTableRowReorderEdge,
): UiTableColumnRow[] {
  const sourceIndex = columns.findIndex((column) => column.id === sourceId);
  const targetIndex = columns.findIndex((column) => column.id === targetId);
  if (
    sourceIndex < 0 ||
    targetIndex < 0 ||
    sourceIndex === targetIndex ||
    sourceId === targetId
  ) {
    return columns;
  }
  const nextColumns = [...columns];
  const [sourceColumn] = nextColumns.splice(sourceIndex, 1);
  const targetIndexAfterRemoval = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  const insertionIndex = edge === "before" ? targetIndexAfterRemoval : targetIndexAfterRemoval + 1;
  if (!sourceColumn || insertionIndex === sourceIndex) {
    return columns;
  }
  nextColumns.splice(insertionIndex, 0, sourceColumn);
  return resequenceColumns(nextColumns);
}
function moveColumnToPosition(
  columns: UiTableColumnRow[],
  columnId: string,
  requestedPosition: number,
): UiTableColumnRow[] {
  const sourceIndex = columns.findIndex((column) => column.id === columnId);
  if (sourceIndex < 0) {
    return columns;
  }
  const targetIndex = clampPosition(requestedPosition, columns.length) - 1;
  if (targetIndex === sourceIndex) {
    return columns;
  }
  const nextColumns = [...columns];
  const [sourceColumn] = nextColumns.splice(sourceIndex, 1);
  if (!sourceColumn) {
    return columns;
  }
  nextColumns.splice(targetIndex, 0, sourceColumn);
  return resequenceColumns(nextColumns);
}
function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
function toNullableInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
}
function toDisplayString(value: number | null): string {
  return value === null ? "" : String(value);
}
function parseColumnNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function getUiTablePayloadId(payload: UiTablePayload): string {
  return (payload.uiTblId ?? payload.uiTableId ?? "").trim();
}
function normalizeUiTableDeviceType(value: string | null | undefined): UiTableDeviceType {
  return UI_TABLE_DEVICE_TYPE_OPTIONS.includes(value as UiTableDeviceType)
    ? (value as UiTableDeviceType)
    : DEFAULT_UI_TABLE_DEVICE_TYPE;
}
function mapUiTableColumnPayloadToRow(
  payload: UiTableColumnPayload,
  fallbackIndex: number,
): UiTableColumnRow {
  const fallbackColumnNumber = fallbackIndex + 1;
  return {
    id: createLocalColumnId(),
    uiTblClmId: payload.uiTblClmId,
    columnNumber: parseColumnNumber(payload.uiTblClmNo, fallbackColumnNumber),
    columnName: payload.uiTblClmName ?? "",
    width: toDisplayString(payload.uiTblClmColumnWidth),
    visible: payload.uiTblClmColumnVisibility ?? true,
    focus: payload.uiTblClmColumnFocus ?? false,
    position: String(payload.uiTblClmColumnPosition ?? fallbackColumnNumber),
    necessity: payload.uiTblClmColumnNecessity,
    nextColumn: toDisplayString(payload.uiTblClmNextColumn),
    previousColumn: toDisplayString(payload.uiTblClmPreviousColumn),
    isActive: payload.uiTblClmIsActive,
  };
}
function buildUiTableColumnRequest(
  column: UiTableColumnRow,
  rowIndex: number,
): SaveUiTableColumnRequest {
  const fallbackColumnNumber = rowIndex + 1;
  return {
    ...(column.uiTblClmId ? { uiTblClmId: column.uiTblClmId } : {}),
    uiTblClmNo: String(column.columnNumber || fallbackColumnNumber),
    uiTblClmName: column.columnName.trim() || `Column ${fallbackColumnNumber}`,
    uiTblClmColumnWidth: toNullableNumber(column.width),
    uiTblClmColumnVisibility: column.visible,
    uiTblClmColumnFocus: column.focus,
    uiTblClmColumnPosition: toNullableInteger(column.position) ?? fallbackColumnNumber,
    uiTblClmColumnNecessity: column.necessity,
    uiTblClmNextColumn: toNullableInteger(column.nextColumn),
    uiTblClmPreviousColumn: toNullableInteger(column.previousColumn),
    uiTblClmIsActive: column.isActive,
  };
}
export default function UiTableDesignerPage({
  initialUiTableId,
  startNew = false,
}: {
  initialUiTableId?: string;
  startNew?: boolean;
}) {
  const [form, setForm] = useState<UiTableForm>(INITIAL_FORM);
  const [columns, setColumns] = useState<UiTableColumnRow[]>([]);
  const [positionDrafts, setPositionDrafts] = useState<Record<string, string>>({});
  const [tableOptions, setTableOptions] = useState<UiTableOption[]>([]);
  const [selectedColumnId, setSelectedColumnId] = useState("");
  const [isTableListLoading, setIsTableListLoading] = useState(false);
  const [isTableLoading, setIsTableLoading] = useState(false);
  const [isTableSaving, setIsTableSaving] = useState(false);
  const [isTableDeleting, setIsTableDeleting] = useState(false);
  const [isColumnDeleting, setIsColumnDeleting] = useState(false);
  const [statusText, setStatusText] = useState("Ready.");
  const didInitialLoadRef = useRef(false);
  const { getAll: listUiTables } = useApi<ApiSuccessResponse<UiTablePayload[]>>(
    UI_TABLE_MASTERS_LIST_ENDPOINT,
    { toast: { success: false, error: true } },
  );
  const { getAll: getUiTableById } = useApi<
    ApiSuccessResponse<UiTablePayload | UiTablePayload[]>
  >(
    UI_TABLE_MASTERS_LIST_ENDPOINT,
    { toast: { success: false, error: true } },
  );
  const { run: saveUiTable } = useApi<ApiSuccessResponse<UiTablePayload>, SaveUiTableMasterRequest>(
    UI_TABLE_MASTERS_CREATE_ENDPOINT,
    {
      method: "POST",
      toast: { success: false, error: true },
    },
  );
  const { run: deleteUiTable } = useApi<ApiSuccessResponse<{ uiTblId: string; deleted: true }>>(
    UI_TABLE_MASTERS_DELETE_ENDPOINT,
    {
      method: "DELETE",
      toast: { success: false, error: true },
    },
  );
  const { run: deleteUiTableColumn } = useApi<
    ApiSuccessResponse<{ uiTblClmId: string; deleted: true }>
  >(
    UI_TABLE_COLUMN_DELETE_ENDPOINT,
    {
      method: "DELETE",
      toast: { success: false, error: true },
    },
  );
  const selectedColumn = useMemo(
    () => columns.find((column) => column.id === selectedColumnId) ?? null,
    [columns, selectedColumnId],
  );
  const isBusy = isTableLoading || isTableSaving || isTableDeleting || isColumnDeleting;
  const emptyColumnsMessage = 'No UI table columns yet. Use "Add Column" to create rows.';
  const updateForm = <K extends keyof UiTableForm>(key: K, value: UiTableForm[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };
  const updateColumn = <K extends keyof UiTableColumnRow>(
    id: string,
    key: K,
    value: UiTableColumnRow[K],
  ) => {
    setColumns((current) =>
      current.map((column) =>
        column.id === id
          ? {
              ...column,
              [key]: value,
            }
          : column,
      ),
    );
  };
  const clearPositionDraft = useCallback((id: string) => {
    setPositionDrafts((current) => {
      if (!(id in current)) {
        return current;
      }
      const nextDrafts = { ...current };
      delete nextDrafts[id];
      return nextDrafts;
    });
  }, []);
  const clearAllPositionDrafts = useCallback(() => {
    setPositionDrafts({});
  }, []);
  const handleColumnPositionChange = useCallback(
    (id: string, value: string) => {
      const parsedPosition = toNullableInteger(value);
      if (parsedPosition !== null && parsedPosition > 0) {
        clearAllPositionDrafts();
        setColumns((current) => moveColumnToPosition(current, id, parsedPosition));
        setSelectedColumnId(id);
        return;
      }
      setPositionDrafts((current) => ({
        ...current,
        [id]: value,
      }));
    },
    [clearAllPositionDrafts],
  );
  const handleColumnPositionBlur = useCallback(
    (id: string) => {
      clearPositionDraft(id);
    },
    [clearPositionDraft],
  );
  const handleRowReorder = useCallback(
    (
      sourceRow: UiTableColumnRow,
      _sourceIndex: number,
      targetRow: UiTableColumnRow,
      _targetIndex: number,
      edge: ReusableTableRowReorderEdge,
    ) => {
      clearAllPositionDrafts();
      setColumns((current) => moveColumn(current, sourceRow.id, targetRow.id, edge));
      setSelectedColumnId(sourceRow.id);
    },
    [clearAllPositionDrafts],
  );
  const tableColumnConfigs: ReusableTableColumn<UiTableColumnRow>[] = [
    {
      key: "dragHandle",
      header: "",
      width: "52px",
      align: "center",
      mobileLabel: "Move",
      render: (row) => (
        <button
          type="button"
          className={styles.rowDragHandle}
          draggable={!isBusy}
          disabled={isBusy}
          aria-label={`Drag ${row.columnName.trim() || `column ${row.columnNumber}`}`}
          title="Drag to reorder row"
          data-erp-row-drag-handle="true"
          onClick={(event) => {
            event.stopPropagation();
            setSelectedColumnId(row.id);
          }}
          onDragStart={(event) => {
            setSelectedColumnId(row.id);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", row.id);
          }}
        />
      ),
    },
    {
      key: "columnNumber",
      header: "No",
      accessor: "columnNumber",
      width: "56px",
      align: "center",
      mobileLabel: "No",
    },
    {
      key: "uiTblClmId",
      header: "Column Id",
      width: "118px",
      mobileLabel: "Column Id",
      render: (row) => <span className={styles.serialIdTag}>{row.uiTblClmId ?? "New"}</span>,
    },
    {
      key: "columnName",
      header: "Column Name",
      width: "220px",
      mobileLabel: "Column Name",
      render: (row) => (
        <input
          className={styles.cellInput}
          value={row.columnName}
          onChange={(event) => updateColumn(row.id, "columnName", event.target.value)}
        />
      ),
    },
    {
      key: "width",
      header: "Width",
      width: "96px",
      mobileLabel: "Width",
      render: (row) => (
        <input
          className={styles.cellInput}
          value={row.width}
          onChange={(event) => updateColumn(row.id, "width", event.target.value)}
        />
      ),
    },
    {
      key: "visible",
      header: "Visible",
      width: "86px",
      align: "center",
      mobileLabel: "Visible",
      render: (row) => (
        <div className={styles.centerCell}>
          <input
            type="checkbox"
            checked={row.visible}
            onChange={(event) => updateColumn(row.id, "visible", event.target.checked)}
          />
        </div>
      ),
    },
    {
      key: "focus",
      header: "Focus",
      width: "86px",
      align: "center",
      mobileLabel: "Focus",
      render: (row) => (
        <div className={styles.centerCell}>
          <input
            type="checkbox"
            checked={row.focus}
            onChange={(event) => updateColumn(row.id, "focus", event.target.checked)}
          />
        </div>
      ),
    },
    {
      key: "position",
      header: "Position",
      width: "96px",
      mobileLabel: "Position",
      render: (row) => (
        <input
          className={styles.cellInput}
          value={positionDrafts[row.id] ?? row.position}
          onChange={(event) => handleColumnPositionChange(row.id, event.target.value)}
          onBlur={() => handleColumnPositionBlur(row.id)}
        />
      ),
    },
    {
      key: "necessity",
      header: "Required",
      width: "96px",
      align: "center",
      mobileLabel: "Required",
      render: (row) => (
        <div className={styles.centerCell}>
          <input
            type="checkbox"
            checked={row.necessity}
            onChange={(event) => updateColumn(row.id, "necessity", event.target.checked)}
          />
        </div>
      ),
    },
    {
      key: "nextColumn",
      header: "Next",
      width: "92px",
      mobileLabel: "Next",
      render: (row) => (
        <input
          className={styles.cellInput}
          value={row.nextColumn}
          onChange={(event) => updateColumn(row.id, "nextColumn", event.target.value)}
        />
      ),
    },
    {
      key: "previousColumn",
      header: "Previous",
      width: "104px",
      mobileLabel: "Previous",
      render: (row) => (
        <input
          className={styles.cellInput}
          value={row.previousColumn}
          onChange={(event) => updateColumn(row.id, "previousColumn", event.target.value)}
        />
      ),
    },
    {
      key: "isActive",
      header: "Active",
      width: "86px",
      align: "center",
      mobileLabel: "Active",
      render: (row) => (
        <div className={styles.centerCell}>
          <input
            type="checkbox"
            checked={row.isActive}
            onChange={(event) => updateColumn(row.id, "isActive", event.target.checked)}
          />
        </div>
      ),
    },
  ];

  const fetchAllUiTables = useCallback(async (): Promise<UiTablePayload[]> => {
    const response = await listUiTables();
    return Array.isArray(response?.data) ? response.data : [];
  }, [listUiTables]);

  const refreshTableOptions = useCallback(async () => {
    setIsTableListLoading(true);

    try {
      const fetchedTables = await fetchAllUiTables();
      const optionsById = new Map<string, UiTableOption>();

      for (const table of fetchedTables) {
        const uiTableId = getUiTablePayloadId(table);
        if (!uiTableId) {
          continue;
        }

        optionsById.set(uiTableId, {
          uiTableId,
          uiTblName: table.uiTblName ?? "",
          uiTblDeviceType: normalizeUiTableDeviceType(table.uiTblDeviceType),
          uiTblEditable: table.uiTblEditable,
          uiTblIsActive: table.uiTblIsActive,
        });
      }

      const nextOptions = Array.from(optionsById.values()).sort((left, right) => {
        const nameCompare = left.uiTblName.localeCompare(right.uiTblName, undefined, {
          sensitivity: "base",
          numeric: true,
        });
        if (nameCompare !== 0) {
          return nameCompare;
        }

        return left.uiTableId.localeCompare(right.uiTableId, undefined, {
          sensitivity: "base",
          numeric: true,
        });
      });

      setTableOptions(nextOptions);
      return nextOptions;
    } finally {
      setIsTableListLoading(false);
    }
  }, [fetchAllUiTables]);

  const loadUiTableById = useCallback(
    async (uiTableId: string) => {
      const normalizedTableId = uiTableId.trim();
      if (!normalizedTableId) {
        toast.error("Select a saved UI table.");
        return;
      }

      if (!/^\d+$/.test(normalizedTableId)) {
        toast.error("UI table id must be numeric.");
        return;
      }

      setIsTableLoading(true);
      setStatusText(`Loading UI table ${normalizedTableId}...`);

      try {
        const detailResponse = await getUiTableById({ uiTableId: normalizedTableId });
        const detailData = detailResponse?.data;
        const detail = Array.isArray(detailData)
          ? (detailData.find((t) => getUiTablePayloadId(t) === normalizedTableId) ?? detailData[0])
          : detailData;
        const detailTableId = detail ? getUiTablePayloadId(detail) : "";
        if (!detail || !detailTableId) {
          throw new Error("No UI table details returned from API.");
        }

        // columns are included directly in the get response
        const loadedColumns = detail.columns ?? [];
        const nextColumns = loadedColumns
          .sort((left, right) => {
            if (left.uiTblClmColumnPosition !== right.uiTblClmColumnPosition) {
              return left.uiTblClmColumnPosition - right.uiTblClmColumnPosition;
            }

            return parseColumnNumber(left.uiTblClmNo, 0) - parseColumnNumber(right.uiTblClmNo, 0);
          })
          .map((column, index) => mapUiTableColumnPayloadToRow(column, index));

        setForm({
          uiTableId: detailTableId,
          uiTblName: detail.uiTblName ?? "",
          uiTblDeviceType: normalizeUiTableDeviceType(detail.uiTblDeviceType),
          uiTblEditable: detail.uiTblEditable,
          uiTblIsActive: detail.uiTblIsActive,
        });
        setColumns(resequenceColumns(nextColumns));
        setPositionDrafts({});
        setSelectedColumnId(nextColumns[0]?.id ?? "");
        setStatusText(`Loaded UI table ${detailTableId}.`);
      } catch {
        setStatusText(`Unable to load UI table ${normalizedTableId}.`);
      } finally {
        setIsTableLoading(false);
      }
    },
    [getUiTableById],
  );

  const handleLoadTable = useCallback(async () => {
    await loadUiTableById(form.uiTableId);
  }, [form.uiTableId, loadUiTableById]);

  const handleTableSelectionChange = useCallback(
    async (nextuiTableId: string) => {
      if (!nextuiTableId) {
        setForm(createBlankForm());
        setColumns([]);
        setPositionDrafts({});
        setSelectedColumnId("");
        setStatusText("Ready for a new UI table.");
        return;
      }

      setForm((current) => ({
        ...current,
        uiTableId: nextuiTableId,
      }));

      await loadUiTableById(nextuiTableId);
    },
    [loadUiTableById],
  );

  const handleSaveTable = useCallback(async () => {
    const normalizedTableId = form.uiTableId.trim();
    if (normalizedTableId && !/^\d+$/.test(normalizedTableId)) {
      toast.error("UI table id must be numeric.");
      return;
    }

    if (!form.uiTblName.trim()) {
      toast.error("UI Table Name is required.");
      return;
    }

    setIsTableSaving(true);
    setStatusText("Saving UI table...");

    try {
      // Save table + all columns in a single request.
      // The backend authoritatively syncs columns: existing columns not in the
      // array are soft-deleted, provided columns are created or updated.
      const tableResponse = await saveUiTable({
        body: {
          ...(normalizedTableId ? { uiTblId: normalizedTableId } : {}),
          uiTblName: form.uiTblName.trim(),
          uiTblDeviceType: form.uiTblDeviceType,
          uiTblEditable: form.uiTblEditable,
          uiTblIsActive: form.uiTblIsActive,
          uiTblColumns: columns.map((column, rowIndex) =>
            buildUiTableColumnRequest(column, rowIndex),
          ),
          replaceColumns: true,
        },
      });
      const savedTable = tableResponse?.data;
      const savedTableId = savedTable ? getUiTablePayloadId(savedTable) : "";
      if (!savedTable || !savedTableId) {
        throw new Error("UI table save did not return data.");
      }
      const nextColumns = (savedTable.columns ?? [])
        .sort((left, right) => {
          if (left.uiTblClmColumnPosition !== right.uiTblClmColumnPosition) {
            return left.uiTblClmColumnPosition - right.uiTblClmColumnPosition;
          }
          return parseColumnNumber(left.uiTblClmNo, 0) - parseColumnNumber(right.uiTblClmNo, 0);
        })
        .map((column, index) => mapUiTableColumnPayloadToRow(column, index));
      const resequencedColumns = resequenceColumns(nextColumns);
      setForm({
        uiTableId: savedTableId,
        uiTblName: savedTable.uiTblName ?? "",
        uiTblDeviceType: normalizeUiTableDeviceType(savedTable.uiTblDeviceType),
        uiTblEditable: savedTable.uiTblEditable,
        uiTblIsActive: savedTable.uiTblIsActive,
      });
      setColumns(resequencedColumns);
      setPositionDrafts({});
      setSelectedColumnId(resequencedColumns[0]?.id ?? "");
      try {
        await refreshTableOptions();
      } catch {}
      setStatusText(`Saved UI table ${savedTableId}.`);
      toast.success("UI table saved successfully.");
    } catch {
      setStatusText("UI table save failed.");
    } finally {
      setIsTableSaving(false);
    }
  }, [columns, form, refreshTableOptions, saveUiTable]);
  const handleDeleteTable = useCallback(async () => {
    const normalizedTableId = form.uiTableId.trim();
    if (!normalizedTableId) {
      toast.error("No UI table selected.");
      return;
    }
    if (!/^\d+$/.test(normalizedTableId)) {
      toast.error("UI table id must be numeric.");
      return;
    }
    setIsTableDeleting(true);
    setStatusText(`Deleting UI table ${normalizedTableId}...`);
    try {
      await deleteUiTable({
        query: {
          uiTblId: normalizedTableId,
        },
      });
      setForm(createBlankForm());
      setColumns([]);
      setPositionDrafts({});
      setSelectedColumnId("");
      try {
        await refreshTableOptions();
      } catch {}
      setStatusText(`Deleted UI table ${normalizedTableId}.`);
      toast.success("UI table deleted successfully.");
    } catch {
      setStatusText(`Unable to delete UI table ${normalizedTableId}.`);
    } finally {
      setIsTableDeleting(false);
    }
  }, [deleteUiTable, form.uiTableId, refreshTableOptions]);
  const handleCreateNewTable = useCallback(() => {
    setForm(createBlankForm());
    setColumns([]);
    setPositionDrafts({});
    setSelectedColumnId("");
    setStatusText("Ready for a new UI table.");
  }, []);
  const handleAddColumn = useCallback(() => {
    const nextColumn = createColumnDraft(columns.length + 1);
    clearAllPositionDrafts();
    setColumns((current) => resequenceColumns([...current, nextColumn]));
    setSelectedColumnId(nextColumn.id);
  }, [clearAllPositionDrafts, columns.length]);
  const handleDeleteColumn = useCallback(async () => {
    if (!selectedColumnId) {
      return;
    }
    const columnToDelete = columns.find((column) => column.id === selectedColumnId);
    if (!columnToDelete) {
      return;
    }
    const savedColumnId = columnToDelete.uiTblClmId?.trim() ?? "";
    if (savedColumnId) {
      setIsColumnDeleting(true);
      setStatusText(`Deleting UI table column ${savedColumnId}...`);
      try {
        await deleteUiTableColumn({
          query: {
            uiTblClmId: savedColumnId,
          },
        });
        toast.success("UI table column deleted successfully.");
      } catch {
        setStatusText(`Unable to delete UI table column ${savedColumnId}.`);
        return;
      } finally {
        setIsColumnDeleting(false);
      }
    }
    const nextColumns = resequenceColumns(
      columns.filter((column) => column.id !== selectedColumnId),
    );
    clearAllPositionDrafts();
    setColumns(nextColumns);
    setSelectedColumnId(nextColumns[0]?.id ?? "");
    if (savedColumnId) {
      setStatusText(`Deleted UI table column ${savedColumnId}.`);
    }
  }, [clearAllPositionDrafts, columns, deleteUiTableColumn, selectedColumnId]);
  useEffect(() => {
    if (didInitialLoadRef.current) {
      return;
    }
    didInitialLoadRef.current = true;
    const loadInitialState = async () => {
      try {
        const savedTables = await refreshTableOptions();
        if (startNew) {
          handleCreateNewTable();
          return;
        }
        const preferredTableId = initialUiTableId ?? savedTables[0]?.uiTableId ?? "";
        if (preferredTableId) {
          await loadUiTableById(preferredTableId);
          return;
        }
      } catch {
        if (startNew) {
          handleCreateNewTable();
          return;
        }
        setStatusText("Unable to load saved UI table list.");
        return;
      }
      setForm(createBlankForm());
      setColumns([]);
      setPositionDrafts({});
      setSelectedColumnId("");
      setStatusText("No saved UI tables available. Ready for a new UI table.");
    };
    void loadInitialState();
  }, [handleCreateNewTable, initialUiTableId, loadUiTableById, refreshTableOptions, startNew]);
  return (
    <main className={styles.page}>
      <div className={styles.workspace}>
        <section className={styles.toolbar} aria-label="UI table actions">
          <div className={styles.toolbarGroup}>
            <button
              type="button"
              className={styles.desktopButton}
              onClick={() => void handleLoadTable()}
              disabled={isBusy || !form.uiTableId.trim()}
            >
              Load Table
            </button>
            <button
              type="button"
              className={styles.desktopButton}
              onClick={() => void handleSaveTable()}
              disabled={isBusy}
            >
              Save Table
            </button>
            <button
              type="button"
              className={styles.desktopButton}
              onClick={handleCreateNewTable}
              disabled={isBusy}
            >
              New Table
            </button>
            <button
              type="button"
              className={styles.desktopButton}
              onClick={() => void handleDeleteTable()}
              disabled={isBusy || !form.uiTableId.trim()}
            >
              Delete Table
            </button>
          </div>
          <div className={styles.statusBadge} aria-live="polite">
            {statusText}
          </div>
        </section>

        <section className={styles.topGrid}>
          <section className={styles.detailsPanel} aria-label="UI table details form">
            <p className={styles.panelTitle}>UI Table Details</p>
            <div className={styles.fieldStack}>
              <label className={styles.inlineField}>
                <span className={styles.fieldLabel}>Table Id :</span>
                <select
                  className={styles.selectField}
                  value={form.uiTableId}
                  onChange={(event) => void handleTableSelectionChange(event.target.value)}
                  disabled={isBusy || isTableListLoading}
                >
                  <option value="">
                    {isTableListLoading ? "Loading tables..." : "Select saved UI table"}
                  </option>
                  {tableOptions.map((tableOption) => (
                    <option key={tableOption.uiTableId} value={tableOption.uiTableId}>
                      {tableOption.uiTblName || `UI Table ${tableOption.uiTableId}`} ({tableOption.uiTableId})
                      {!tableOption.uiTblIsActive ? " [Inactive]" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.inlineField}>
                <span className={styles.fieldLabel}>Table Name :</span>
                <input
                  className={styles.textField}
                  value={form.uiTblName}
                  onChange={(event) => updateForm("uiTblName", event.target.value)}
                />
              </label>

              <label className={styles.inlineField}>
                <span className={styles.fieldLabel}>Device Type :</span>
                <select
                  className={styles.selectField}
                  value={form.uiTblDeviceType}
                  onChange={(event) =>
                    updateForm("uiTblDeviceType", event.target.value as UiTableDeviceType)
                  }
                >
                  {UI_TABLE_DEVICE_TYPE_OPTIONS.map((deviceType) => (
                    <option key={deviceType} value={deviceType}>
                      {deviceType}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  checked={form.uiTblEditable}
                  onChange={(event) => updateForm("uiTblEditable", event.target.checked)}
                />
                <span>Table Editable</span>
              </label>

              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  checked={form.uiTblIsActive}
                  onChange={(event) => updateForm("uiTblIsActive", event.target.checked)}
                />
                <span>Table Status Active</span>
              </label>
            </div>
          </section>
        </section>

        <section className={styles.columnsSection} aria-label="UI table columns table">
            <div className={styles.sectionLabelRow}>
              <span className={styles.sectionLabel}>UI Table Columns :</span>
              <span className={styles.sectionMeta}>
                {columns.length} columns
                {selectedColumn ? ` | Selected: ${selectedColumn.columnName || "Untitled"}` : ""}
              </span>
            </div>

            <ReusableTable
              columns={tableColumnConfigs}
              rows={columns}
              rowKey="id"
              minWidth={UI_TABLE_COLUMNS_TABLE_MIN_WIDTH}
              activeRowKey={selectedColumnId}
              onRowClick={(row) => setSelectedColumnId(row.id)}
              reorderableRows
              onRowReorder={handleRowReorder}
              wrapperClassName={styles.columnsUiTableShell}
              tableClassName={styles.columnsUiTable}
              rowClassName={(row) =>
                row.id === selectedColumnId ? styles.uiTableSelectedRow : undefined
              }
              fullViewHeight={false}
              tableMaxHeight="100%"
              stickyHeader
              showActionsColumn={false}
              emptyText={emptyColumnsMessage}
            />

            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.desktopButton}
                onClick={handleAddColumn}
                disabled={isBusy}
              >
                Add Column
              </button>
              <button
                type="button"
                className={styles.desktopButton}
                onClick={() => void handleDeleteColumn()}
                disabled={isBusy || !selectedColumnId}
              >
                Delete Column
              </button>
            </div>
        </section>
      </div>
    </main>
  );
}
