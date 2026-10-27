"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/notify";
import ReusableTable, {
  type ReusableTableColumn,
  type ReusableTableRowReorderEdge,
} from "@/components/ui/table";
import { useApi } from "@/hooks/useApi";
import type { ApiSuccessResponse } from "@/utils/types";
import styles from "./page.module.scss";
import type {
  UiTableApiErrorDetail,
  SaveUiTableMasterRequest,
  UiTableColumnRow,
  UiTableForm,
  UiTableOption,
  UiTablePayload,
} from "./type";
import { useDataRefresh } from "@/lib/data-freshness";
import {
  buildSaveUiTableRequest,
  createBlankForm,
  createColumnDraft,
  getUiTableErrorInfo,
  getUiTblId,
  mapUiTableColumnPayloadToRow,
  MAX_DEVICE_TYPE_LENGTH,
  moveColumn,
  moveColumnToPosition,
  NUMBER_STRING_PATTERN,
  parseColumnNumber,
  resequenceColumns,
  toNullableInteger,
} from "./ui-table-designer";
const UI_TABLE_MASTERS_LIST_ENDPOINT = "/ui-table-masters/get";
const UI_TABLE_MASTERS_CREATE_ENDPOINT = "/ui-table-masters/create";
const UI_TABLE_MASTERS_DELETE_ENDPOINT = "/ui-table-masters/delete";
const UI_TABLE_COLUMN_DELETE_ENDPOINT = "/ui-table-masters/column-delete";
const UI_TABLE_COLUMNS_TABLE_MIN_WIDTH = "1440px";
const INITIAL_FORM: UiTableForm = {
  uiTblId: "",
  uiTblName: "",
  uiTblDeviceType: "",
  uiTblEditable: false,
  uiTblIsActive: true,
};
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
  const [statusTone, setStatusTone] = useState<"info" | "success" | "error">("info");
  const [statusErrors, setStatusErrors] = useState<UiTableApiErrorDetail[]>([]);
  const didInitialLoadRef = useRef(false);
  const { getAll: listUiTables } = useApi<ApiSuccessResponse<UiTablePayload[]>>(
    UI_TABLE_MASTERS_LIST_ENDPOINT,
    { toast: { success: false, error: false } },
  );
  const { getAll: getUiTableById } = useApi<ApiSuccessResponse<UiTablePayload[]>>(
    UI_TABLE_MASTERS_LIST_ENDPOINT,
    { toast: { success: false, error: false } },
  );
  const { run: saveUiTable } = useApi<ApiSuccessResponse<UiTablePayload>, SaveUiTableMasterRequest>(
    UI_TABLE_MASTERS_CREATE_ENDPOINT,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      toast: { success: false, error: false },
    },
  );
  const { run: deleteUiTable } = useApi<ApiSuccessResponse<{ uiTblId: string; deleted: true }>>(
    UI_TABLE_MASTERS_DELETE_ENDPOINT,
    {
      method: "DELETE",
      toast: { success: false, error: false },
    },
  );
  const { run: deleteUiTableColumn } = useApi<
    ApiSuccessResponse<{ uiTblClmId: string; deleted: true }>
  >(
    UI_TABLE_COLUMN_DELETE_ENDPOINT,
    {
      method: "DELETE",
      toast: { success: false, error: false },
    },
  );
  const selectedColumn = useMemo(
    () => columns.find((column) => column.id === selectedColumnId) ?? null,
    [columns, selectedColumnId],
  );
  const isBusy = isTableLoading || isTableSaving || isTableDeleting || isColumnDeleting;
  const emptyColumnsMessage = 'No UI table columns yet. Use "Add Column" to create rows.';
  const showStatus = useCallback(
    (
      message: string,
      tone: "info" | "success" | "error" = "info",
      errors: UiTableApiErrorDetail[] = [],
    ) => {
      setStatusText(message);
      setStatusTone(tone);
      setStatusErrors(errors);
    },
    [],
  );
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
          className={`${styles.cellInput} erp-ms-cellctl`}
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
          className={`${styles.cellInput} erp-ms-cellctl`}
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
          className={`${styles.cellInput} erp-ms-cellctl`}
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
          className={`${styles.cellInput} erp-ms-cellctl`}
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
          className={`${styles.cellInput} erp-ms-cellctl`}
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
    if (!response) {
      throw new Error("UI table list request did not return a response.");
    }
    if (!Array.isArray(response?.data)) {
      throw new Error("UI table list response did not return data as an array.");
    }
    return response.data;
  }, [listUiTables]);

  const refreshTableOptions = useCallback(async () => {
    setIsTableListLoading(true);

    try {
      const fetchedTables = await fetchAllUiTables();
      const optionsById = new Map<string, UiTableOption>();

      for (const table of fetchedTables) {
        const uiTblId = getUiTblId(table);
        if (!uiTblId) {
          continue;
        }

        optionsById.set(uiTblId, {
          uiTblId,
          uiTblName: table.uiTblName ?? "",
          uiTblDeviceType: table.uiTblDeviceType,
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

        return left.uiTblId.localeCompare(right.uiTblId, undefined, {
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
  // The table picker lists rows from the ui_table master; keep it in step with what
  // the database holds while this designer stays open.
  useDataRefresh(() => {
    void refreshTableOptions();
  });

  const loadUiTableById = useCallback(
    async (uiTblId: string) => {
      const normalizedTableId = uiTblId.trim();
      if (!normalizedTableId) {
        const message = "Select a saved UI table.";
        showStatus(message, "error", [{ field: "uiTableId", message }]);
        toast.error(message);
        return;
      }

      if (!NUMBER_STRING_PATTERN.test(normalizedTableId)) {
        const message = "uiTableId must be a numeric string.";
        showStatus(message, "error", [{ field: "uiTableId", message }]);
        toast.error(message);
        return;
      }

      setIsTableLoading(true);
      showStatus(`Loading UI table ${normalizedTableId}...`);

      try {
        const detailResponse = await getUiTableById({ uiTableId: normalizedTableId });
        if (!detailResponse) {
          throw new Error("UI table detail request did not return a response.");
        }
        const detailData = detailResponse.data;
        const detail = Array.isArray(detailData)
          ? (detailData.find((t) => getUiTblId(t) === normalizedTableId) ?? detailData[0])
          : undefined;
        const detailTableId = detail ? getUiTblId(detail) : "";
        if (!detail || !detailTableId) {
          const message = `No UI table found with uiTableId ${normalizedTableId}.`;
          showStatus(message, "error", [{ field: "uiTableId", message }]);
          return;
        }

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
          uiTblId: detailTableId,
          uiTblName: detail.uiTblName ?? "",
          uiTblDeviceType: detail.uiTblDeviceType ?? "",
          uiTblEditable: detail.uiTblEditable,
          uiTblIsActive: detail.uiTblIsActive,
        });
        setColumns(resequenceColumns(nextColumns));
        setPositionDrafts({});
        setSelectedColumnId(nextColumns[0]?.id ?? "");
        showStatus(detailResponse.message, "success");
      } catch (error) {
        const errorInfo = getUiTableErrorInfo(
          error,
          `Unable to load UI table ${normalizedTableId}.`,
        );
        showStatus(errorInfo.message, "error", errorInfo.errors);
        toast.error(errorInfo.message);
      } finally {
        setIsTableLoading(false);
      }
    },
    [getUiTableById, showStatus],
  );

  const handleLoadTable = useCallback(async () => {
    await loadUiTableById(form.uiTblId);
  }, [form.uiTblId, loadUiTableById]);

  const handleTableSelectionChange = useCallback(
    async (nextUiTblId: string) => {
      if (!nextUiTblId) {
        setForm(createBlankForm());
        setColumns([]);
        setPositionDrafts({});
        setSelectedColumnId("");
        showStatus("Ready for a new UI table.");
        return;
      }

      setForm((current) => ({
        ...current,
        uiTblId: nextUiTblId,
      }));

      await loadUiTableById(nextUiTblId);
    },
    [loadUiTableById, showStatus],
  );

  const handleSaveTable = useCallback(async () => {
    const { request, errors } = buildSaveUiTableRequest(form, columns);
    if (!request) {
      const message = "Validation failed";
      showStatus(message, "error", errors);
      toast.error(message);
      return;
    }

    setIsTableSaving(true);
    showStatus("Saving UI table...");

    try {
      const tableResponse = await saveUiTable({
        body: request,
      });
      if (!tableResponse?.data) {
        throw new Error("UI table save did not return data.");
      }
      const savedTable = tableResponse.data;
      const savedTableId = getUiTblId(savedTable);
      if (!savedTableId) {
        throw new Error("UI table save did not return uiTblId.");
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
        uiTblId: savedTableId,
        uiTblName: savedTable.uiTblName ?? "",
        uiTblDeviceType: savedTable.uiTblDeviceType ?? "",
        uiTblEditable: savedTable.uiTblEditable,
        uiTblIsActive: savedTable.uiTblIsActive,
      });
      setColumns(resequencedColumns);
      setPositionDrafts({});
      setSelectedColumnId(resequencedColumns[0]?.id ?? "");
      try {
        await refreshTableOptions();
      } catch {}
      showStatus(tableResponse.message, "success");
      toast.success(tableResponse.message);
    } catch (error) {
      const errorInfo = getUiTableErrorInfo(error, "UI table save failed.");
      showStatus(errorInfo.message, "error", errorInfo.errors);
      toast.error(errorInfo.message);
    } finally {
      setIsTableSaving(false);
    }
  }, [columns, form, refreshTableOptions, saveUiTable, showStatus]);
  const handleDeleteTable = useCallback(async () => {
    const normalizedTableId = form.uiTblId.trim();
    if (!normalizedTableId) {
      const message = "No UI table selected.";
      showStatus(message, "error", [{ field: "uiTblId", message }]);
      toast.error(message);
      return;
    }
    if (!NUMBER_STRING_PATTERN.test(normalizedTableId)) {
      const message = "uiTblId must be a numeric string.";
      showStatus(message, "error", [{ field: "uiTblId", message }]);
      toast.error(message);
      return;
    }
    setIsTableDeleting(true);
    showStatus(`Deleting UI table ${normalizedTableId}...`);
    try {
      const deleteResponse = await deleteUiTable({
        query: {
          uiTblId: normalizedTableId,
        },
      });
      if (!deleteResponse) {
        throw new Error("UI table delete request did not return a response.");
      }
      setForm(createBlankForm());
      setColumns([]);
      setPositionDrafts({});
      setSelectedColumnId("");
      try {
        await refreshTableOptions();
      } catch {}
      showStatus(deleteResponse.message, "success");
      toast.success(deleteResponse.message);
    } catch (error) {
      const errorInfo = getUiTableErrorInfo(
        error,
        `Unable to delete UI table ${normalizedTableId}.`,
      );
      showStatus(errorInfo.message, "error", errorInfo.errors);
      toast.error(errorInfo.message);
    } finally {
      setIsTableDeleting(false);
    }
  }, [deleteUiTable, form.uiTblId, refreshTableOptions, showStatus]);
  const handleCreateNewTable = useCallback(() => {
    setForm(createBlankForm());
    setColumns([]);
    setPositionDrafts({});
    setSelectedColumnId("");
    showStatus("Ready for a new UI table.");
  }, [showStatus]);
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
      if (!NUMBER_STRING_PATTERN.test(savedColumnId)) {
        const message = "uiTblClmId must be a numeric string.";
        showStatus(message, "error", [{ field: "uiTblClmId", message }]);
        toast.error(message);
        return;
      }
      setIsColumnDeleting(true);
      showStatus(`Deleting UI table column ${savedColumnId}...`);
      try {
        const deleteResponse = await deleteUiTableColumn({
          query: {
            uiTblClmId: savedColumnId,
          },
        });
        if (!deleteResponse) {
          throw new Error("UI table column delete request did not return a response.");
        }
        showStatus(deleteResponse.message, "success");
        toast.success(deleteResponse.message);
      } catch (error) {
        const errorInfo = getUiTableErrorInfo(
          error,
          `Unable to delete UI table column ${savedColumnId}.`,
        );
        showStatus(errorInfo.message, "error", errorInfo.errors);
        toast.error(errorInfo.message);
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
      showStatus(`Deleted UI table column ${savedColumnId}.`, "success");
    }
  }, [clearAllPositionDrafts, columns, deleteUiTableColumn, selectedColumnId, showStatus]);
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
        const preferredTableId = initialUiTableId ?? savedTables[0]?.uiTblId ?? "";
        if (preferredTableId) {
          await loadUiTableById(preferredTableId);
          return;
        }
      } catch (error) {
        if (startNew) {
          handleCreateNewTable();
          return;
        }
        const errorInfo = getUiTableErrorInfo(error, "Unable to load saved UI table list.");
        showStatus(errorInfo.message, "error", errorInfo.errors);
        return;
      }
      setForm(createBlankForm());
      setColumns([]);
      setPositionDrafts({});
      setSelectedColumnId("");
      showStatus("No saved UI tables available. Ready for a new UI table.");
    };
    void loadInitialState();
  }, [
    handleCreateNewTable,
    initialUiTableId,
    loadUiTableById,
    refreshTableOptions,
    showStatus,
    startNew,
  ]);
  return (
    <main className={`${styles.page} erp-master-shell erp-ms-designer`}>
      <div className={`${styles.workspace} erp-ms-designer-main`}>
        <section className={`${styles.toolbar} erp-ms-toolbar`} aria-label="UI table actions">
          <div className={styles.toolbarGroup}>
            <button
              type="button"
              className={`${styles.desktopButton} erp-ms-tbtn erp-ms-tbtn--primary`}
              onClick={() => void handleSaveTable()}
              disabled={isBusy}
            >
              Save
            </button>
            <button
              type="button"
              className={`${styles.desktopButton} erp-ms-tbtn`}
              onClick={handleCreateNewTable}
              disabled={isBusy}
            >
              New
            </button>
            <button
              type="button"
              className={`${styles.desktopButton} erp-ms-tbtn`}
              onClick={() => void handleLoadTable()}
              disabled={isBusy || !form.uiTblId.trim()}
            >
              Load
            </button>
            <button
              type="button"
              className={`${styles.desktopButton} erp-ms-tbtn`}
              onClick={() => void handleDeleteTable()}
              disabled={isBusy || !form.uiTblId.trim()}
            >
              Delete
            </button>
          </div>
          <div
            className={`${styles.statusBadge} ${
              statusTone === "error"
                ? styles.statusBadgeError
                : statusTone === "success"
                  ? styles.statusBadgeSuccess
                  : ""
            }`}
            aria-live="polite"
          >
            {statusText}
          </div>
        </section>
        {statusErrors.length > 0 ? (
          <section className={`${styles.errorPanel} erp-ms-issues`} aria-live="polite">
            <ul className={styles.errorList}>
              {statusErrors.map((error, index) => (
                <li key={`${error.field}-${index}`}>
                  <strong>{error.field}</strong>: {error.message}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className={`${styles.topGrid} erp-ms-designer-top erp-ms-designer-top--single`}>
          <section className={`${styles.detailsPanel} erp-ms-panel`} aria-label="UI table details form">
            <p className={`${styles.panelTitle} erp-ms-panel-title`}>UI Table Details</p>
            <div className={styles.fieldStack}>
              <label className={`${styles.inlineField} erp-ms-frow`}>
                <span className={`${styles.fieldLabel} erp-ms-flabel`}>Table Id :</span>
                <select
                  className={`${styles.selectField} erp-ms-fctl`}
                  value={form.uiTblId}
                  onChange={(event) => void handleTableSelectionChange(event.target.value)}
                  disabled={isBusy || isTableListLoading}
                >
                  <option value="">
                    {isTableListLoading ? "Loading tables..." : "Select saved UI table"}
                  </option>
                  {tableOptions.map((tableOption) => (
                    <option key={tableOption.uiTblId} value={tableOption.uiTblId}>
                      {tableOption.uiTblName || `UI Table ${tableOption.uiTblId}`} ({tableOption.uiTblId})
                      {!tableOption.uiTblIsActive ? " [Inactive]" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className={`${styles.inlineField} erp-ms-frow`}>
                <span className={`${styles.fieldLabel} erp-ms-flabel`}>Table Name :</span>
                <input
                  className={`${styles.textField} erp-ms-fctl`}
                  value={form.uiTblName}
                  onChange={(event) => updateForm("uiTblName", event.target.value)}
                />
              </label>

              <label className={`${styles.inlineField} erp-ms-frow`}>
                <span className={`${styles.fieldLabel} erp-ms-flabel`}>Device Type :</span>
                <input
                  className={`${styles.textField} erp-ms-fctl`}
                  value={form.uiTblDeviceType}
                  maxLength={MAX_DEVICE_TYPE_LENGTH}
                  onChange={(event) => updateForm("uiTblDeviceType", event.target.value)}
                />
              </label>

              <label className={`${styles.checkboxField} erp-ms-fcheck`}>
                <input
                  type="checkbox"
                  checked={form.uiTblEditable}
                  onChange={(event) => updateForm("uiTblEditable", event.target.checked)}
                />
                <span>Table Editable</span>
              </label>

              <label className={`${styles.checkboxField} erp-ms-fcheck`}>
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

        <section className={`${styles.columnsSection} erp-ms-panel`} aria-label="UI table columns table">
            <div className={`${styles.sectionLabelRow} erp-ms-panel-title`}>
              <span className={styles.sectionLabel}>UI Table Columns :</span>
              <span className={`${styles.sectionMeta} erp-ms-panel-meta`}>
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
              wrapperClassName={`${styles.columnsUiTableShell} erp-ms-gridwrap`}
              tableClassName={`${styles.columnsUiTable} erp-ms-grid`}
              rowClassName={(row) =>
                row.id === selectedColumnId ? styles.uiTableSelectedRow : undefined
              }
              fullViewHeight={false}
              tableMaxHeight="100%"
              stickyHeader
              showActionsColumn={false}
              emptyText={emptyColumnsMessage}
            />

            <div className={`${styles.actionRow} erp-ms-panel-foot`}>
              <button
                type="button"
                className={`${styles.desktopButton} erp-ms-btn erp-ms-btn--primary`}
                onClick={handleAddColumn}
                disabled={isBusy}
              >
                Add Column
              </button>
              <button
                type="button"
                className={`${styles.desktopButton} erp-ms-btn`}
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
