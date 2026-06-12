"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import ReusableTable, { type ReusableTableColumn } from "@/components/ui/table";
import { useApi } from "@/hooks/useApi";
import type { ApiSuccessResponse } from "@/utils/types";
import styles from "./page.module.scss";
import type {
  Alignment,
  GridColumnPayload,
  GridColumnRow,
  GridDesignerForm,
  GridDetailPayload,
  GridDeviceType,
  GridListMeta,
  GridOption,
  SaveGridColumnRequest,
  SaveGridDetailRequest,
  SortOrder,
} from "./type";
const GRID_DETAILS_LIST_ENDPOINT = "/grid-details/get";
const GRID_DETAILS_GET_ENDPOINT = "/grid-details/get";
const GRID_DETAILS_CREATE_ENDPOINT = "/grid-details/create";
const GRID_DETAILS_DELETE_ENDPOINT = "/grid-details/delete";
const GRID_DETAILS_COLUMN_DELETE_ENDPOINT = "/grid-details/column-delete";
const SORT_ORDER_OPTIONS: SortOrder[] = ["Ascending", "Descending"];
const ALIGNMENT_OPTIONS: Alignment[] = ["Left", "Center", "Right"];
const DEVICE_TYPE_OPTIONS: GridDeviceType[] = ["desktop", "web", "mobile"];
const DEFAULT_DEVICE_TYPE: GridDeviceType = "desktop";
const DATA_TYPE_SUGGESTIONS = ["Text", "NumericTS", "Date", "Number", "Boolean"] as const;

const GRID_COLUMNS_TABLE_MIN_WIDTH = "2050px";
const HEX_COLOR_CODE_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const INITIAL_FORM: GridDesignerForm = {
  gridId: "",
  gridName: "",
  gridDescription: "",
  sortColumn: "",
  sortOrder: "Ascending",
  gridSql: "",
  gridStatus: true,
  gridDeviceType: DEFAULT_DEVICE_TYPE,
};
function createLocalColumnId(): string {
  return `column-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function createColumnDraft(
  columnNumber: number,
  overrides: Partial<GridColumnRow> = {},
): GridColumnRow {
  return {
    id: createLocalColumnId(),
    gridColumnId: null,
    columnNumber,
    columnName: "",
    sqlFieldName: "",
    width: "",
    position: String(columnNumber),
    alignment: "Left",
    visible: true,
    filter: false,
    condition: "",
    conditionColor: "",
    grouping: false,
    total: false,
    dataType: "Text",
    columnColor: "",
    notes: "",
    ...overrides,
  };
}
function normalizeSortOrder(value: string | null | undefined): SortOrder {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "descending" || normalized === "desc") {
    return "Descending";
  }
  return "Ascending";
}
function normalizeAlignment(value: string | null | undefined): Alignment {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "center") {
    return "Center";
  }
  if (normalized === "right") {
    return "Right";
  }
  return "Left";
}
function resequenceColumns(columns: GridColumnRow[]): GridColumnRow[] {
  return columns.map((column, index) => ({
    ...column,
    columnNumber: index + 1,
  }));
}
function toNullableString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
function formatNullableNumber(value: number | null): string {
  return value === null ? "" : String(value);
}
function compareGridColumnsByPosition(left: GridColumnPayload, right: GridColumnPayload): number {
  const leftPosition = left.grid_column_position ?? left.grid_column_number;
  const rightPosition = right.grid_column_position ?? right.grid_column_number;
  if (leftPosition !== rightPosition) {
    return leftPosition - rightPosition;
  }
  return left.grid_column_number - right.grid_column_number;
}
function resolveColorPickerValue(value: string): string {
  const normalized = value.trim();
  if (!HEX_COLOR_CODE_PATTERN.test(normalized)) {
    return "#000000";
  }
  if (normalized.length === 4) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }
  return normalized;
}
function mapGridColumnPayloadToRow(payload: GridColumnPayload): GridColumnRow {
  return {
    id: createLocalColumnId(),
    gridColumnId: payload.grid_column_id,
    columnNumber: payload.grid_column_number,
    columnName: payload.grid_column_name ?? "",
    sqlFieldName: payload.grid_column_sql_field_name ?? "",
    width: formatNullableNumber(payload.grid_column_width),
    position: formatNullableNumber(payload.grid_column_position),
    alignment: normalizeAlignment(payload.grid_column_alignment),
    visible: payload.grid_column_visibility,
    filter: payload.grid_column_filter,
    condition: payload.grid_column_condition ?? "",
    conditionColor: payload.grid_column_condition_color ?? "",
    grouping: payload.grid_column_group,
    total: payload.grid_column_total,
    dataType: payload.grid_column_data_type ?? "",
    columnColor: payload.grid_column_color ?? "",
    notes: payload.grid_column_notes ?? "",
  };
}
function buildGridColumnRequest(
  column: GridColumnRow,
  rowIndex: number,
): SaveGridColumnRequest {
  return {
    ...(column.gridColumnId ? { grid_column_id: column.gridColumnId } : {}),
    grid_column_number: rowIndex + 1,
    grid_column_name: column.columnName.trim() || `Column ${rowIndex + 1}`,
    grid_column_width: toNullableNumber(column.width),
    grid_column_position: toNullableNumber(column.position),
    grid_column_alignment: column.alignment,
    grid_column_visibility: column.visible,
    grid_column_filter: column.filter,
    grid_column_condition: toNullableString(column.condition),
    grid_column_condition_color: toNullableString(column.conditionColor),
    grid_column_group: column.grouping,
    grid_column_total: column.total,
    grid_column_data_type: toNullableString(column.dataType),
    grid_column_color: toNullableString(column.columnColor),
    grid_column_notes: toNullableString(column.notes),
    grid_column_sql_field_name: toNullableString(column.sqlFieldName),
  };
}
function createBlankForm(): GridDesignerForm {
  return {
    gridId: "",
    gridName: "",
    gridDescription: "",
    sortColumn: "",
    sortOrder: "Ascending",
    gridSql: "",
    gridStatus: true,
    gridDeviceType: DEFAULT_DEVICE_TYPE,
  };
}
function normalizeGridDeviceType(value: string | null | undefined): GridDeviceType {
  if (value === "web" || value === "mobile" || value === "desktop") return value;
  return DEFAULT_DEVICE_TYPE;
}
export default function GridDesignerPage({
  initialGridId,
  startNew = false,
}: {
  initialGridId?: string;
  startNew?: boolean;
}) {
  const [form, setForm] = useState<GridDesignerForm>(INITIAL_FORM);
  const [columns, setColumns] = useState<GridColumnRow[]>([]);
  const [gridOptions, setGridOptions] = useState<GridOption[]>([]);
  const [selectedColumnId, setSelectedColumnId] = useState("");
  const [gridSearchText, setGridSearchText] = useState("");
  const [isGridListLoading, setIsGridListLoading] = useState(false);
  const [isGridLoading, setIsGridLoading] = useState(false);
  const [isGridSaving, setIsGridSaving] = useState(false);
  const [isGridDeleting, setIsGridDeleting] = useState(false);
  const [isColumnDeleting, setIsColumnDeleting] = useState(false);
  const [statusText, setStatusText] = useState("Ready.");
  const didInitialLoadRef = useRef(false);
  const { getAll: listGridDetails } = useApi<ApiSuccessResponse<GridDetailPayload[], GridListMeta>>(
    GRID_DETAILS_LIST_ENDPOINT,
    { toast: { success: false, error: true } },
  );
  const { getAll: getGridDetailsById } = useApi<ApiSuccessResponse<GridDetailPayload>>(
    GRID_DETAILS_GET_ENDPOINT,
    { toast: { success: false, error: true } },
  );
  const { run: saveGridDetails } = useApi<
    ApiSuccessResponse<GridDetailPayload>,
    SaveGridDetailRequest
  >(GRID_DETAILS_CREATE_ENDPOINT, {
    method: "POST",
    toast: { success: false, error: true },
  });
  const { run: deleteGridDetails } = useApi<
    ApiSuccessResponse<{ grid_id: string; deleted: true }>
  >(GRID_DETAILS_DELETE_ENDPOINT, {
    method: "DELETE",
    toast: { success: false, error: true },
  });
  const { run: deleteGridColumn } = useApi<
    ApiSuccessResponse<{ grid_column_id: string; deleted: true }>
  >(GRID_DETAILS_COLUMN_DELETE_ENDPOINT, {
    method: "DELETE",
    toast: { success: false, error: true },
  });
  const selectedColumn = useMemo(
    () => columns.find((column) => column.id === selectedColumnId) ?? null,
    [columns, selectedColumnId],
  );
  const sortColumnOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: string[] = [];
    for (const column of columns) {
      const columnName = column.columnName.trim();
      if (!columnName || seen.has(columnName)) {
        continue;
      }
      seen.add(columnName);
      options.push(columnName);
    }
    return options;
  }, [columns]);
  const isBusy = isGridLoading || isGridSaving || isGridDeleting || isColumnDeleting;
  const updateForm = <K extends keyof GridDesignerForm>(key: K, value: GridDesignerForm[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };
  const updateColumn = <K extends keyof GridColumnRow>(
    id: string,
    key: K,
    value: GridColumnRow[K],
  ) => {
    const currentColumn = columns.find((column) => column.id === id) ?? null;
    if (
      key === "columnName" &&
      currentColumn &&
      form.sortColumn === currentColumn.columnName &&
      typeof value === "string"
    ) {
      setForm((current) => ({
        ...current,
        sortColumn: value,
      }));
    }
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
  const gridTableColumns = useMemo<ReusableTableColumn<GridColumnRow>[]>(
    () => [
      {
        key: "columnNumber",
        header: "No",
        accessor: "columnNumber",
        width: "54px",
        mobileLabel: "No",
      },
      {
        key: "gridColumnId",
        header: "Column Id",
        width: "112px",
        mobileLabel: "Column Id",
        render: (row) => <span className={styles.serialIdTag}>{row.gridColumnId ?? "New"}</span>,
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
        key: "sqlFieldName",
        header: "SQL Field Name",
        width: "180px",
        mobileLabel: "SQL Field Name",
        render: (row) => (
          <input
            className={styles.cellInput}
            value={row.sqlFieldName}
            onChange={(event) => updateColumn(row.id, "sqlFieldName", event.target.value)}
          />
        ),
      },
      {
        key: "dataType",
        header: "Data Type",
        width: "140px",
        mobileLabel: "Data Type",
        render: (row) => (
          <input
            className={styles.cellInput}
            value={row.dataType}
            list="grid-column-data-type-options"
            onChange={(event) => updateColumn(row.id, "dataType", event.target.value)}
          />
        ),
      },
      {
        key: "width",
        header: "Width",
        width: "100px",
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
        key: "position",
        header: "Position",
        width: "104px",
        mobileLabel: "Position",
        render: (row) => (
          <input
            className={styles.cellInput}
            value={row.position}
            inputMode="decimal"
            onChange={(event) => updateColumn(row.id, "position", event.target.value)}
          />
        ),
      },
      {
        key: "alignment",
        header: "Alignment",
        width: "102px",
        mobileLabel: "Alignment",
        render: (row) => (
          <select
            className={styles.cellSelect}
            value={row.alignment}
            onChange={(event) => updateColumn(row.id, "alignment", event.target.value as Alignment)}
          >
            {ALIGNMENT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ),
      },
      {
        key: "visible",
        header: "Visible",
        width: "78px",
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
        key: "filter",
        header: "Filter",
        width: "78px",
        align: "center",
        mobileLabel: "Filter",
        render: (row) => (
          <div className={styles.centerCell}>
            <input
              type="checkbox"
              checked={row.filter}
              onChange={(event) => updateColumn(row.id, "filter", event.target.checked)}
            />
          </div>
        ),
      },
      {
        key: "grouping",
        header: "Group",
        width: "78px",
        align: "center",
        mobileLabel: "Group",
        render: (row) => (
          <div className={styles.centerCell}>
            <input
              type="checkbox"
              checked={row.grouping}
              onChange={(event) => updateColumn(row.id, "grouping", event.target.checked)}
            />
          </div>
        ),
      },
      {
        key: "total",
        header: "Total",
        width: "78px",
        align: "center",
        mobileLabel: "Total",
        render: (row) => (
          <div className={styles.centerCell}>
            <input
              type="checkbox"
              checked={row.total}
              onChange={(event) => updateColumn(row.id, "total", event.target.checked)}
            />
          </div>
        ),
      },
      {
        key: "condition",
        header: "Condition",
        width: "170px",
        mobileLabel: "Condition",
        render: (row) => (
          <input
            className={styles.cellInput}
            value={row.condition}
            onChange={(event) => updateColumn(row.id, "condition", event.target.value)}
          />
        ),
      },
      {
        key: "conditionColor",
        header: "Condition Color",
        width: "136px",
        mobileLabel: "Condition Color",
        render: (row) => (
          <input
            className={styles.cellInput}
            value={row.conditionColor}
            onChange={(event) => updateColumn(row.id, "conditionColor", event.target.value)}
          />
        ),
      },
      {
        key: "columnColor",
        header: "Column Color",
        width: "196px",
        mobileLabel: "Column Color",
        render: (row) => (
          <div className={styles.colorCodeField}>
            <input
              type="color"
              className={styles.colorPicker}
              value={resolveColorPickerValue(row.columnColor)}
              aria-label={`Select column color for ${row.columnName || `column ${row.columnNumber}`}`}
              onChange={(event) => updateColumn(row.id, "columnColor", event.target.value)}
            />
            <input
              className={`${styles.cellInput} ${styles.colorCodeInput}`}
              value={row.columnColor}
              placeholder="#RRGGBB"
              spellCheck={false}
              onChange={(event) => updateColumn(row.id, "columnColor", event.target.value)}
            />
          </div>
        ),
      },
      {
        key: "notes",
        header: "Notes",
        width: "220px",
        mobileLabel: "Notes",
        render: (row) => (
          <input
            className={styles.cellInput}
            value={row.notes}
            onChange={(event) => updateColumn(row.id, "notes", event.target.value)}
          />
        ),
      },
    ],
    [updateColumn],
  );
  const fetchAllGridDetails = useCallback(async (gridId?: string): Promise<GridDetailPayload[]> => {
    const params: Record<string, string> = gridId ? { gridId } : {};
    const response = await listGridDetails(params);
    const data = response?.data;
    if (Array.isArray(data)) return data;
    if (data) return [data as unknown as GridDetailPayload];
    return [];
  }, [listGridDetails]);
  const refreshGridOptions = useCallback(async (gridId?: string) => {
    setIsGridListLoading(true);
    try {
      const gridDetails = await fetchAllGridDetails(gridId);
      const nextOptions = gridDetails
        .map((grid) => ({
          gridId: grid.grid_id,
          gridName: grid.grid_name,
          gridStatus: grid.grid_status,
        }))
        .sort((left, right) => {
          const nameCompare = left.gridName.localeCompare(right.gridName, undefined, {
            sensitivity: "base",
            numeric: true,
          });
          if (nameCompare !== 0) {
            return nameCompare;
          }
          return left.gridId.localeCompare(right.gridId, undefined, {
            sensitivity: "base",
            numeric: true,
          });
        });
      setGridOptions(nextOptions);
      return nextOptions;
    } finally {
      setIsGridListLoading(false);
    }
  }, [fetchAllGridDetails]);
  const loadGridById = useCallback(
    async (gridId: string) => {
      const normalizedGridId = gridId.trim();
      if (!normalizedGridId) {
        toast.error("Select a saved grid.");
        return;
      }
      if (!/^\d+$/.test(normalizedGridId)) {
        toast.error("Grid id must be numeric.");
        return;
      }
      setIsGridLoading(true);
      setStatusText(`Loading grid ${normalizedGridId}...`);
      try {
        const detailResponse = await getGridDetailsById({ gridId: normalizedGridId });
        const rawData = detailResponse?.data;
        const detail = Array.isArray(rawData) ? (rawData[0] ?? null) : (rawData ?? null);
        if (!detail) {
          throw new Error("No grid details returned from API.");
        }
        const loadedColumns = Array.isArray(detail.columns) ? detail.columns : [];
        const nextColumns = loadedColumns
          .sort(compareGridColumnsByPosition)
          .map(mapGridColumnPayloadToRow);
        setForm({
          gridId: detail.grid_id ?? "",
          gridName: detail.grid_name ?? "",
          gridDescription: detail.grid_description ?? "",
          sortColumn: detail.grid_sort_column ?? "",
          sortOrder: normalizeSortOrder(detail.grid_sort_order),
          gridSql: detail.grid_sql ?? "",
          gridStatus: detail.grid_status ?? false,
          gridDeviceType: normalizeGridDeviceType(detail.grid_device_type),
        });
        setColumns(nextColumns);
        setSelectedColumnId(nextColumns[0]?.id ?? "");
        setStatusText(`Loaded grid ${detail.grid_id}.`);
      } catch {
        setStatusText(`Unable to load grid ${normalizedGridId}.`);
      } finally {
        setIsGridLoading(false);
      }
    },
    [getGridDetailsById],
  );
  const handleLoadGrid = useCallback(async () => {
    await loadGridById(form.gridId);
  }, [form.gridId, loadGridById]);
  const handleGridSelectionChange = useCallback(
    async (nextGridId: string) => {
      if (!nextGridId) {
        setForm(createBlankForm());
        setColumns([]);
        setSelectedColumnId("");
        setStatusText("Ready for a new grid.");
        return;
      }
      setForm((current) => ({
        ...current,
        gridId: nextGridId,
      }));
      await loadGridById(nextGridId);
    },
    [loadGridById],
  );
  const handleSaveGrid = useCallback(async () => {
    const normalizedGridId = (form.gridId ?? "").trim();
    if (normalizedGridId && !/^\d+$/.test(normalizedGridId)) {
      toast.error("Grid id must be numeric.");
      return;
    }
    if (!form.gridName.trim()) {
      toast.error("Grid Name is required.");
      return;
    }
    setIsGridSaving(true);
    setStatusText("Saving grid...");
    try {
      const gridDetailResponse = await saveGridDetails({
        body: {
          ...(normalizedGridId ? { grid_id: normalizedGridId } : {}),
          grid_name: form.gridName.trim(),
          grid_description: toNullableString(form.gridDescription),
          grid_sort_column: toNullableString(form.sortColumn),
          grid_sort_order: toNullableString(form.sortOrder),
          grid_sql: toNullableString(form.gridSql),
          grid_status: form.gridStatus,
          grid_device_type: form.gridDeviceType,
          grid_columns: columns.map((column, rowIndex) => buildGridColumnRequest(column, rowIndex)),
        },
      });
      const savedGrid = gridDetailResponse?.data;
      if (!savedGrid) {
        throw new Error("Grid details save did not return data.");
      }
      const nextColumns = (Array.isArray(savedGrid.columns) ? savedGrid.columns : [])
        .sort(compareGridColumnsByPosition)
        .map(mapGridColumnPayloadToRow);
      setForm({
        gridId: savedGrid.grid_id ?? "",
        gridName: savedGrid.grid_name ?? "",
        gridDescription: savedGrid.grid_description ?? "",
        sortColumn: savedGrid.grid_sort_column ?? "",
        sortOrder: normalizeSortOrder(savedGrid.grid_sort_order),
        gridSql: savedGrid.grid_sql ?? "",
        gridStatus: savedGrid.grid_status ?? false,
        gridDeviceType: normalizeGridDeviceType(savedGrid.grid_device_type),
      });
      setColumns(nextColumns);
      setSelectedColumnId(nextColumns[0]?.id ?? "");
      try {
        await refreshGridOptions();
      } catch { }
      setStatusText(`Saved grid ${savedGrid.grid_id}.`);
      toast.success("Grid saved successfully.");
    } catch {
      setStatusText("Grid save failed.");
    } finally {
      setIsGridSaving(false);
    }
  }, [columns, form, refreshGridOptions, saveGridDetails]);
  const handleDeleteGrid = useCallback(async () => {
    const normalizedGridId = (form.gridId ?? "").trim();
    if (!normalizedGridId) {
      toast.error("No grid selected.");
      return;
    }
    if (!/^\d+$/.test(normalizedGridId)) {
      toast.error("Grid id must be numeric.");
      return;
    }
    setIsGridDeleting(true);
    setStatusText(`Deleting grid ${normalizedGridId}...`);
    try {
      await deleteGridDetails({
        query: {
          grid_id: normalizedGridId,
        },
      });
      setForm(createBlankForm());
      setColumns([]);
      setSelectedColumnId("");
      try {
        await refreshGridOptions();
      } catch { }
      setStatusText(`Deleted grid ${normalizedGridId}.`);
      toast.success("Grid deleted successfully.");
    } catch {
      setStatusText(`Unable to delete grid ${normalizedGridId}.`);
    } finally {
      setIsGridDeleting(false);
    }
  }, [deleteGridDetails, form.gridId, refreshGridOptions]);
  const handleCreateNewGrid = useCallback(() => {
    setForm(createBlankForm());
    setColumns([]);
    setSelectedColumnId("");
    setStatusText("Ready for a new grid.");
  }, []);
  const handleAddColumn = useCallback(() => {
    const nextColumn = createColumnDraft(columns.length + 1);
    setColumns((current) => [...current, nextColumn]);
    setSelectedColumnId(nextColumn.id);
  }, [columns.length]);
  const handleDeleteColumn = useCallback(async () => {
    if (!selectedColumnId) {
      return;
    }
    const deletedColumn = columns.find((column) => column.id === selectedColumnId) ?? null;
    if (!deletedColumn) {
      return;
    }
    const savedSerialId = deletedColumn.gridColumnId?.trim() ?? "";
    if (savedSerialId) {
      setIsColumnDeleting(true);
      setStatusText(`Deleting grid column ${savedSerialId}...`);
      try {
        await deleteGridColumn({
          query: {
            grid_column_id: savedSerialId,
          },
        });
        toast.success("Grid column deleted successfully.");
      } catch {
        setStatusText(`Unable to delete grid column ${savedSerialId}.`);
        return;
      } finally {
        setIsColumnDeleting(false);
      }
    }
    const nextColumns = resequenceColumns(
      columns.filter((column) => column.id !== selectedColumnId),
    );
    setColumns(nextColumns);
    setSelectedColumnId(nextColumns[0]?.id ?? "");
    if (form.sortColumn === deletedColumn.columnName) {
      setForm((current) => ({
        ...current,
        sortColumn: nextColumns[0]?.columnName ?? "",
      }));
    }
    if (savedSerialId) {
      setStatusText(`Deleted grid column ${savedSerialId}.`);
    }
  }, [columns, deleteGridColumn, form.sortColumn, selectedColumnId]);
  useEffect(() => {
    if (!form.gridId) {
      setGridSearchText("");
      return;
    }
    const option = gridOptions.find((o) => o.gridId === form.gridId);
    if (option) {
      setGridSearchText(`${option.gridName} (${option.gridId})`);
    }
  }, [form.gridId, gridOptions]);

  useEffect(() => {
    if (didInitialLoadRef.current) {
      return;
    }
    didInitialLoadRef.current = true;
    const loadInitialState = async () => {
      try {
        const savedGridOptions = await refreshGridOptions(initialGridId);
        if (startNew) {
          handleCreateNewGrid();
          return;
        }
        const preferredGridId = initialGridId ?? savedGridOptions[0]?.gridId ?? "";
        if (preferredGridId) {
          await loadGridById(preferredGridId);
          return;
        }
      } catch {
        if (startNew) {
          handleCreateNewGrid();
          return;
        }
        setStatusText("Unable to load saved grid list.");
        return;
      }
      setForm(createBlankForm());
      setColumns([]);
      setSelectedColumnId("");
      setStatusText("No saved grids available. Ready for a new grid.");
    };
    void loadInitialState();
  }, [handleCreateNewGrid, initialGridId, loadGridById, refreshGridOptions, startNew]);
  return (
    <main className={styles.page}>
      <div className={styles.workspace}>
        <section className={styles.toolbar} aria-label="Grid actions">
          <div className={styles.toolbarGroup}>
            <button
              type="button"
              className={styles.desktopButton}
              onClick={() => void handleLoadGrid()}
              disabled={isBusy || !(form.gridId ?? "").trim()}
            >
              Load Grid
            </button>
            <button
              type="button"
              className={styles.desktopButton}
              onClick={() => void handleSaveGrid()}
              disabled={isBusy}
            >
              Save Grid
            </button>
            <button
              type="button"
              className={styles.desktopButton}
              onClick={handleCreateNewGrid}
              disabled={isBusy}
            >
              New Grid
            </button>
            <button
              type="button"
              className={styles.desktopButton}
              onClick={() => void handleDeleteGrid()}
              disabled={isBusy || !(form.gridId ?? "").trim()}
            >
              Delete Grid
            </button>
          </div>
          <div className={styles.statusBadge} aria-live="polite">
            {statusText}
          </div>
        </section>
        <section className={styles.topGrid}>
          <section className={styles.detailsPanel} aria-label="Grid details form">
            <p className={styles.panelTitle}>Grid Details</p>
            <div className={styles.fieldStack}>
              <label className={styles.inlineField}>
                <span className={styles.fieldLabel}>Grid Id :</span>
                <input
                  className={styles.textField}
                  value={gridSearchText}
                  list="grid-id-options"
                  placeholder={isGridListLoading ? "Loading grids..." : "Search grids..."}
                  disabled={isBusy || isGridListLoading}
                  onChange={(event) => {
                    const text = event.target.value;
                    setGridSearchText(text);
                    if (!text) {
                      void handleGridSelectionChange("");
                      return;
                    }
                    const match = gridOptions.find(
                      (o) => `${o.gridName} (${o.gridId})${!o.gridStatus ? " [Inactive]" : ""}` === text,
                    );
                    if (match) {
                      void handleGridSelectionChange(match.gridId);
                    }
                  }}
                />
                <datalist id="grid-id-options">
                  {gridOptions.map((option) => (
                    <option
                      key={option.gridId}
                      value={`${option.gridName} (${option.gridId})${!option.gridStatus ? " [Inactive]" : ""}`}
                    />
                  ))}
                </datalist>
              </label>
              <label className={styles.inlineField}>
                <span className={styles.fieldLabel}>Grid Name :</span>
                <input
                  className={styles.textField}
                  value={form.gridName}
                  onChange={(event) => updateForm("gridName", event.target.value)}
                />
              </label>
              <label className={styles.inlineField}>
                <span className={styles.fieldLabel}>Sort Column :</span>
                <select
                  className={styles.selectField}
                  value={form.sortColumn}
                  onChange={(event) => updateForm("sortColumn", event.target.value)}
                >
                  <option value=""> </option>
                  {sortColumnOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.inlineField}>
                <span className={styles.fieldLabel}>Sort Order :</span>
                <select
                  className={styles.selectField}
                  value={form.sortOrder}
                  onChange={(event) => updateForm("sortOrder", event.target.value as SortOrder)}
                >
                  {SORT_ORDER_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.inlineField}>
                <span className={styles.fieldLabel}>Device Type :</span>
                <select
                  className={styles.selectField}
                  value={form.gridDeviceType}
                  onChange={(event) => updateForm("gridDeviceType", event.target.value as GridDeviceType)}
                >
                  {DEVICE_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  checked={form.gridStatus}
                  onChange={(event) => updateForm("gridStatus", event.target.checked)}
                />
                <span>Grid Status Active</span>
              </label>
            </div>
            <label className={styles.inlineField}>
                <span className={styles.fieldLabel}>Grid Description :</span>
                <input
                  className={styles.textField}
                  value={form.gridDescription}
                onChange={(event) => updateForm("gridDescription", event.target.value)}
              />
            </label>
          </section>
          <section className={styles.sqlSection} aria-label="Grid SQL">
            <p className={styles.panelTitle}>Grid SQL</p>
            <label className={styles.blockField}>
              <span className={styles.fieldLabel}>Grid Sql :</span>
              <textarea
                className={styles.sqlEditor}
                value={form.gridSql}
                onChange={(event) => updateForm("gridSql", event.target.value)}
              />
            </label>
          </section>
        </section>
        <section className={styles.columnsSection} aria-label="Grid columns table">
          <div className={styles.sectionLabelRow}>
            <span className={styles.sectionLabel}>Grid Columns :</span>
            <span className={styles.sectionMeta}>
              {columns.length} columns
              {selectedColumn ? ` | Selected: ${selectedColumn.columnName || "Untitled"}` : ""}
            </span>
          </div>
          <ReusableTable
            columns={gridTableColumns}
            rows={columns}
            rowKey="id"
            minWidth={GRID_COLUMNS_TABLE_MIN_WIDTH}
            activeRowKey={selectedColumnId}
            onRowClick={(row) => setSelectedColumnId(row.id)}
            wrapperClassName={styles.columnsUiTableShell}
            tableClassName={styles.columnsUiTable}
            rowClassName={(row) => (row.id === selectedColumnId ? styles.uiTableSelectedRow : undefined)}
            fullViewHeight={false}
            tableMaxHeight="100%"
            stickyHeader
            showActionsColumn={false}
            emptyText='No grid columns yet. Use "Add Column" to create schema-backed rows.'
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
        <datalist id="grid-column-data-type-options">
          {DATA_TYPE_SUGGESTIONS.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </div>
    </main>
  );
}
