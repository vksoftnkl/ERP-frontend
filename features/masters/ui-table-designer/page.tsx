"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import ReusableTable, { type ReusableTableColumn } from "@/components/ui/table";
import { useApi } from "@/hooks/useApi";
import styles from "./page.module.scss";

type UiTableForm = {
  uiTblId: string;
  uiTblName: string;
  uiTblEditable: boolean;
  uiTblIsActive: boolean;
};

type UiTableColumnRow = {
  id: string;
  uiTblClmId: string | null;
  columnNumber: number;
  columnName: string;
  width: string;
  visible: boolean;
  focus: boolean;
  position: string;
  necessity: boolean;
  nextColumn: string;
  previousColumn: string;
  isActive: boolean;
};

type UiTableOption = {
  uiTblId: string;
  uiTblName: string;
  uiTblEditable: boolean;
  uiTblIsActive: boolean;
};

type UiTablePayload = {
  uiTblId: string;
  uiTblName: string | null;
  uiTblEditable: boolean;
  uiTblIsActive: boolean;
  uiTblIsDeleted: boolean;
  uiTblSyncDate: string | null;
  uiTblCreatedOn: string;
  uiTblCreatedBy: string | null;
  uiTblModifiedOn: string;
  uiTblModifiedBy: string | null;
};

type UiTableColumnPayload = {
  uiTblClmId: string;
  uiTblClmNo: string;
  uiTblClmName: string | null;
  uiTblClmTableId: string | null;
  uiTblClmColumnWidth: number | null;
  uiTblClmColumnVisibility: boolean | null;
  uiTblClmColumnFocus: boolean | null;
  uiTblClmColumnPosition: number;
  uiTblClmColumnNecessity: boolean;
  uiTblClmNextColumn: number | null;
  uiTblClmPreviousColumn: number | null;
  uiTblClmIsActive: boolean;
  uiTblClmIsDeleted: boolean;
  uiTblClmSyncDate: string | null;
  uiTblClmCreatedOn: string;
  uiTblClmCreatedBy: string | null;
  uiTblClmModifiedOn: string;
  uiTblClmModifiedBy: string | null;
};

type ListMeta = {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

type ApiSuccessResponse<TData, TMeta = Record<string, unknown>> = {
  success: true;
  message: string;
  data: TData;
  meta?: TMeta;
};

type SaveUiTableMasterRequest = {
  uiTblId?: string;
  uiTblName: string;
  uiTblEditable: boolean;
  uiTblIsActive: boolean;
};

type SaveUiTableColumnRequest = {
  uiTblClmId?: string;
  uiTblClmNo?: string;
  uiTblClmName: string;
  uiTblClmTableId: string | null;
  uiTblClmColumnWidth: number | null;
  uiTblClmColumnVisibility: boolean;
  uiTblClmColumnFocus: boolean;
  uiTblClmColumnPosition: number;
  uiTblClmColumnNecessity: boolean;
  uiTblClmNextColumn: number | null;
  uiTblClmPreviousColumn: number | null;
  uiTblClmIsActive: boolean;
};

const UI_TABLE_MASTERS_LIST_ENDPOINT = "/ui-table-masters/list";
const UI_TABLE_MASTERS_GET_ENDPOINT = "/ui-table-masters/get";
const UI_TABLE_MASTERS_CREATE_ENDPOINT = "/ui-table-masters/create";
const UI_TABLE_MASTERS_DELETE_ENDPOINT = "/ui-table-masters/delete";
const UI_TABLE_COLUMNS_LIST_ENDPOINT = "/ui-table-columns/list";
const UI_TABLE_COLUMNS_CREATE_ENDPOINT = "/ui-table-columns/create";
const UI_TABLE_COLUMNS_DELETE_ENDPOINT = "/ui-table-columns/delete";

const UI_TABLES_PAGE_SIZE = "100";
const UI_TABLE_COLUMNS_PAGE_SIZE = "100";
const UI_TABLE_COLUMNS_TABLE_MIN_WIDTH = "1440px";

const INITIAL_FORM: UiTableForm = {
  uiTblId: "",
  uiTblName: "",
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
    uiTblId: "",
    uiTblName: "",
    uiTblEditable: false,
    uiTblIsActive: true,
  };
}

function resequenceColumns(columns: UiTableColumnRow[]): UiTableColumnRow[] {
  return columns.map((column, index) => ({
    ...column,
    columnNumber: index + 1,
    position: column.position.trim() ? column.position : String(index + 1),
  }));
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
  uiTblId: string,
  rowIndex: number,
): SaveUiTableColumnRequest {
  const fallbackColumnNumber = rowIndex + 1;
  return {
    ...(column.uiTblClmId ? { uiTblClmId: column.uiTblClmId } : {}),
    uiTblClmNo: String(column.columnNumber || fallbackColumnNumber),
    uiTblClmName: column.columnName.trim() || `Column ${fallbackColumnNumber}`,
    uiTblClmTableId: uiTblId,
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

export default function UiTableDesignerPage() {
  const [form, setForm] = useState<UiTableForm>(INITIAL_FORM);
  const [columns, setColumns] = useState<UiTableColumnRow[]>([]);
  const [tableOptions, setTableOptions] = useState<UiTableOption[]>([]);
  const [selectedColumnId, setSelectedColumnId] = useState("");
  const [isTableListLoading, setIsTableListLoading] = useState(false);
  const [isTableLoading, setIsTableLoading] = useState(false);
  const [isTableSaving, setIsTableSaving] = useState(false);
  const [isTableDeleting, setIsTableDeleting] = useState(false);
  const [statusText, setStatusText] = useState("Ready.");

  const deletedColumnIdsRef = useRef<Set<string>>(new Set());
  const didInitialLoadRef = useRef(false);

  const { getAll: listUiTables } = useApi<ApiSuccessResponse<UiTablePayload[], ListMeta>>(
    UI_TABLE_MASTERS_LIST_ENDPOINT,
    { toast: { success: false, error: true } },
  );
  const { getAll: getUiTableById } = useApi<ApiSuccessResponse<UiTablePayload>>(
    UI_TABLE_MASTERS_GET_ENDPOINT,
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
  const { getAll: listUiTableColumns } = useApi<ApiSuccessResponse<UiTableColumnPayload[], ListMeta>>(
    UI_TABLE_COLUMNS_LIST_ENDPOINT,
    { toast: { success: false, error: true } },
  );
  const { run: saveUiTableColumn } = useApi<
    ApiSuccessResponse<UiTableColumnPayload>,
    SaveUiTableColumnRequest
  >(UI_TABLE_COLUMNS_CREATE_ENDPOINT, {
    method: "POST",
    toast: { success: false, error: true },
  });
  const { run: deleteUiTableColumn } = useApi<
    ApiSuccessResponse<{ uiTblClmId: string; deleted: true }>
  >(UI_TABLE_COLUMNS_DELETE_ENDPOINT, {
    method: "DELETE",
    toast: { success: false, error: true },
  });

  const selectedColumn = useMemo(
    () => columns.find((column) => column.id === selectedColumnId) ?? null,
    [columns, selectedColumnId],
  );

  const isBusy = isTableLoading || isTableSaving || isTableDeleting;
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

  const tableColumnConfigs: ReusableTableColumn<UiTableColumnRow>[] = [
    {
      key: "columnNumber",
      header: "No",
      accessor: "columnNumber",
      width: "56px",
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
          value={row.position}
          onChange={(event) => updateColumn(row.id, "position", event.target.value)}
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
    const allTables: UiTablePayload[] = [];
    let page = 1;

    while (true) {
      const response = await listUiTables({
        page: String(page),
        limit: UI_TABLES_PAGE_SIZE,
      });

      const pageItems = Array.isArray(response?.data) ? response.data : [];
      const totalPages = Math.max(1, Number(response?.meta?.total_pages ?? 1));
      allTables.push(...pageItems);

      if (page >= totalPages || pageItems.length === 0) {
        break;
      }

      page += 1;
    }

    return allTables;
  }, [listUiTables]);

  const refreshTableOptions = useCallback(async () => {
    setIsTableListLoading(true);

    try {
      const fetchedTables = await fetchAllUiTables();
      const nextOptions = fetchedTables
        .map((table) => ({
          uiTblId: table.uiTblId,
          uiTblName: table.uiTblName ?? "",
          uiTblEditable: table.uiTblEditable,
          uiTblIsActive: table.uiTblIsActive,
        }))
        .sort((left, right) => {
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

  const fetchAllUiTableColumns = useCallback(
    async (uiTblId: string): Promise<UiTableColumnPayload[]> => {
      const allColumns: UiTableColumnPayload[] = [];
      let page = 1;

      while (true) {
        const response = await listUiTableColumns({
          uiTblClmTableId: uiTblId,
          page: String(page),
          limit: UI_TABLE_COLUMNS_PAGE_SIZE,
        });

        const pageItems = Array.isArray(response?.data) ? response.data : [];
        const totalPages = Math.max(1, Number(response?.meta?.total_pages ?? 1));
        allColumns.push(...pageItems);

        if (page >= totalPages || pageItems.length === 0) {
          break;
        }

        page += 1;
      }

      return allColumns;
    },
    [listUiTableColumns],
  );

  const loadUiTableById = useCallback(
    async (uiTblId: string) => {
      const normalizedTableId = uiTblId.trim();
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
        const detailResponse = await getUiTableById({ uiTblId: normalizedTableId });
        const detail = detailResponse?.data;
        if (!detail) {
          throw new Error("No UI table details returned from API.");
        }

        const loadedColumns = await fetchAllUiTableColumns(detail.uiTblId);
        const nextColumns = loadedColumns
          .sort((left, right) => {
            if (left.uiTblClmColumnPosition !== right.uiTblClmColumnPosition) {
              return left.uiTblClmColumnPosition - right.uiTblClmColumnPosition;
            }

            return parseColumnNumber(left.uiTblClmNo, 0) - parseColumnNumber(right.uiTblClmNo, 0);
          })
          .map((column, index) => mapUiTableColumnPayloadToRow(column, index));

        deletedColumnIdsRef.current.clear();
        setForm({
          uiTblId: detail.uiTblId,
          uiTblName: detail.uiTblName ?? "",
          uiTblEditable: detail.uiTblEditable,
          uiTblIsActive: detail.uiTblIsActive,
        });
        setColumns(nextColumns);
        setSelectedColumnId(nextColumns[0]?.id ?? "");
        setStatusText(`Loaded UI table ${detail.uiTblId}.`);
      } catch {
        setStatusText(`Unable to load UI table ${normalizedTableId}.`);
      } finally {
        setIsTableLoading(false);
      }
    },
    [fetchAllUiTableColumns, getUiTableById],
  );

  const handleLoadTable = useCallback(async () => {
    await loadUiTableById(form.uiTblId);
  }, [form.uiTblId, loadUiTableById]);

  const handleTableSelectionChange = useCallback(
    async (nextUiTblId: string) => {
      if (!nextUiTblId) {
        deletedColumnIdsRef.current.clear();
        setForm(createBlankForm());
        setColumns([]);
        setSelectedColumnId("");
        setStatusText("Ready for a new UI table.");
        return;
      }

      setForm((current) => ({
        ...current,
        uiTblId: nextUiTblId,
      }));

      await loadUiTableById(nextUiTblId);
    },
    [loadUiTableById],
  );

  const handleSaveTable = useCallback(async () => {
    const normalizedTableId = form.uiTblId.trim();
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
      const tableResponse = await saveUiTable({
        body: {
          ...(normalizedTableId ? { uiTblId: normalizedTableId } : {}),
          uiTblName: form.uiTblName.trim(),
          uiTblEditable: form.uiTblEditable,
          uiTblIsActive: form.uiTblIsActive,
        },
      });

      const savedTable = tableResponse?.data;
      if (!savedTable) {
        throw new Error("UI table save did not return data.");
      }

      for (const deletedColumnId of deletedColumnIdsRef.current) {
        await deleteUiTableColumn({
          query: {
            uiTblClmId: deletedColumnId,
          },
        });
      }

      const savedColumns: UiTableColumnPayload[] = [];
      for (const [rowIndex, column] of columns.entries()) {
        const response = await saveUiTableColumn({
          body: buildUiTableColumnRequest(column, savedTable.uiTblId, rowIndex),
        });

        if (response?.data) {
          savedColumns.push(response.data);
        }
      }

      const nextColumns = savedColumns
        .sort((left, right) => {
          if (left.uiTblClmColumnPosition !== right.uiTblClmColumnPosition) {
            return left.uiTblClmColumnPosition - right.uiTblClmColumnPosition;
          }

          return parseColumnNumber(left.uiTblClmNo, 0) - parseColumnNumber(right.uiTblClmNo, 0);
        })
        .map((column, index) => mapUiTableColumnPayloadToRow(column, index));

      deletedColumnIdsRef.current.clear();
      setForm({
        uiTblId: savedTable.uiTblId,
        uiTblName: savedTable.uiTblName ?? "",
        uiTblEditable: savedTable.uiTblEditable,
        uiTblIsActive: savedTable.uiTblIsActive,
      });
      setColumns(nextColumns);
      setSelectedColumnId(nextColumns[0]?.id ?? "");

      try {
        await refreshTableOptions();
      } catch {}

      setStatusText(`Saved UI table ${savedTable.uiTblId}.`);
      toast.success("UI table saved successfully.");
    } catch {
      setStatusText("UI table save failed.");
    } finally {
      setIsTableSaving(false);
    }
  }, [columns, deleteUiTableColumn, form, refreshTableOptions, saveUiTable, saveUiTableColumn]);

  const handleDeleteTable = useCallback(async () => {
    const normalizedTableId = form.uiTblId.trim();
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
      for (const column of columns) {
        if (!column.uiTblClmId) {
          continue;
        }

        await deleteUiTableColumn({
          query: {
            uiTblClmId: column.uiTblClmId,
          },
        });
      }

      await deleteUiTable({
        query: {
          uiTblId: normalizedTableId,
        },
      });

      deletedColumnIdsRef.current.clear();
      setForm(createBlankForm());
      setColumns([]);
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
  }, [columns, deleteUiTable, deleteUiTableColumn, form.uiTblId, refreshTableOptions]);

  const handleCreateNewTable = useCallback(() => {
    deletedColumnIdsRef.current.clear();
    setForm(createBlankForm());
    setColumns([]);
    setSelectedColumnId("");
    setStatusText("Ready for a new UI table.");
  }, []);

  const handleAddColumn = useCallback(() => {
    const nextColumn = createColumnDraft(columns.length + 1);
    setColumns((current) => [...current, nextColumn]);
    setSelectedColumnId(nextColumn.id);
  }, [columns.length]);

  const handleDeleteColumn = useCallback(() => {
    if (!selectedColumnId) {
      return;
    }

    const deletedColumn = columns.find((column) => column.id === selectedColumnId) ?? null;
    if (deletedColumn?.uiTblClmId) {
      deletedColumnIdsRef.current.add(deletedColumn.uiTblClmId);
    }

    const nextColumns = resequenceColumns(
      columns.filter((column) => column.id !== selectedColumnId),
    );

    setColumns(nextColumns);
    setSelectedColumnId(nextColumns[0]?.id ?? "");
  }, [columns, selectedColumnId]);

  useEffect(() => {
    if (didInitialLoadRef.current) {
      return;
    }

    didInitialLoadRef.current = true;

    const loadInitialState = async () => {
      try {
        const savedTables = await refreshTableOptions();
        const preferredTableId = savedTables[0]?.uiTblId ?? "";

        if (preferredTableId) {
          await loadUiTableById(preferredTableId);
          return;
        }
      } catch {
        setStatusText("Unable to load saved UI table list.");
        return;
      }

      setForm(createBlankForm());
      setColumns([]);
      setSelectedColumnId("");
      setStatusText("No saved UI tables available. Ready for a new UI table.");
    };

    void loadInitialState();
  }, [loadUiTableById, refreshTableOptions]);

  return (
    <main className={styles.page}>
      <div className={styles.workspace}>
        <section className={styles.toolbar} aria-label="UI table actions">
          <div className={styles.toolbarGroup}>
            <button
              type="button"
              className={styles.desktopButton}
              onClick={() => void handleLoadTable()}
              disabled={isBusy || !form.uiTblId.trim()}
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
              disabled={isBusy || !form.uiTblId.trim()}
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

              <label className={styles.inlineField}>
                <span className={styles.fieldLabel}>Table Name :</span>
                <input
                  className={styles.textField}
                  value={form.uiTblName}
                  onChange={(event) => updateForm("uiTblName", event.target.value)}
                />
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

          <section className={styles.descriptionPanel} aria-label="UI table notes">
            <p className={styles.panelTitle}>Schema Notes</p>

            <div className={styles.schemaInfo}>
              <p className={styles.schemaInfoTitle}>Auto-managed by backend</p>
              <ul className={styles.schemaList}>
                <li>`uiTblId` is generated by the backend.</li>
                <li>`uiTblClmId` is generated per UI table column row.</li>
                <li>`uiTblClmTableId` is inferred from the selected UI table.</li>
                <li>`uiTblIsDeleted` and `uiTblClmIsDeleted` are handled by delete APIs.</li>
              </ul>
            </div>

            <div className={styles.schemaInfo}>
              <p className={styles.schemaInfoTitle}>Selected column</p>
              <ul className={styles.schemaList}>
                <li>Name: {selectedColumn?.columnName.trim() || "None selected"}</li>
                <li>Position: {selectedColumn?.position.trim() || "-"}</li>
                <li>Next Column: {selectedColumn?.nextColumn.trim() || "-"}</li>
                <li>Previous Column: {selectedColumn?.previousColumn.trim() || "-"}</li>
              </ul>
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
              onClick={handleDeleteColumn}
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
