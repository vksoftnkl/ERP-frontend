"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import ReusableTable, { type ReusableTableColumn } from "@/components/ui/table";
import { useApi } from "@/hooks/useApi";
import type { ApiSuccessResponse } from "@/utils/types";
import styles from "../grid-designer/[id]/page.module.scss";
import responsiveStyles from "./page.module.scss";
import type {
  Alignment,
  DropdownColumnPayload,
  DropdownColumnRow,
  DropdownDesignerForm,
  DropdownDetailPayload,
  DropdownOption,
  SaveDropdownColumnRequest,
  SaveDropdownDetailRequest,
  SortOrder,
} from "./type";
const DROPDOWN_DETAILS_GET_ENDPOINT = "/dropdown-details/get";
const DROPDOWN_DETAILS_CREATE_ENDPOINT = "/dropdown-details/create";
const DROPDOWN_DETAILS_DELETE_ENDPOINT = "/dropdown-details/delete";
const DROPDOWN_COLUMNS_TABLE_MIN_WIDTH = "1120px";
const SORT_ORDER_OPTIONS: Array<{ value: SortOrder; label: string }> = [
  { value: "ASC", label: "Ascending" },
  { value: "DESC", label: "Descending" },
];
const ALIGNMENT_OPTIONS: Alignment[] = ["Left", "Center", "Right"];
const DATA_TYPE_SUGGESTIONS = [
  "Text",
  "Number",
  "Decimal",
  "Date",
  "Boolean",
  "Lookup",
] as const;
const INITIAL_FORM: DropdownDesignerForm = {
  dropdownId: "",
  dropdownName: "",
  dropdownDescription: "",
  sortColumn: "",
  sortOrder: "ASC",
  dropdownCompletion: "",
  dropdownSql: "",
  dropdownSqlRegional: "",
  maxVisibleItems: "10",
  showHeader: true,
  dropdownWidth: "",
};
function cx(...tokens: Array<string | undefined | false>): string {
  return tokens.filter(Boolean).join(" ");
}
function createLocalColumnId(): string {
  return `dropdown-column-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function createColumnDraft(
  columnNumber: number,
  overrides: Partial<DropdownColumnRow> = {},
): DropdownColumnRow {
  return {
    id: createLocalColumnId(),
    serialId: null,
    columnNumber,
    columnName: "",
    columnAlias: "",
    dataType: "Text",
    width: "",
    alignment: "Left",
    visible: true,
    filter: false,
    ...overrides,
  };
}
function normalizeSortOrder(value: string | null | undefined): SortOrder {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "desc" || normalized === "descending") {
    return "DESC";
  }
  return "ASC";
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
function resequenceColumns(columns: DropdownColumnRow[]): DropdownColumnRow[] {
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
function toPositiveInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
function toNullablePositiveInteger(value: string): number | null {
  const parsed = toPositiveInteger(value);
  return parsed ?? null;
}
function formatNullableNumber(value: number | null): string {
  return value === null ? "" : String(value);
}
function mapDropdownColumnPayloadToRow(payload: DropdownColumnPayload): DropdownColumnRow {
  return {
    id: createLocalColumnId(),
    serialId: payload.drop_columns_id,
    columnNumber: payload.drop_columns_column_no,
    columnName: payload.drop_columns_column_name,
    columnAlias: payload.drop_columns_column_alias ?? "",
    dataType: payload.drop_columns_data_type,
    width: formatNullableNumber(payload.drop_columns_column_width),
    alignment: normalizeAlignment(payload.drop_columns_column_allignment),
    visible: payload.drop_columns_column_visiblity,
    filter: payload.drop_columns_column_filter,
  };
}
function buildDropdownColumnRequest(
  column: DropdownColumnRow,
  rowIndex: number,
): SaveDropdownColumnRequest {
  return {
    ...(column.serialId ? { drop_columns_id: column.serialId } : {}),
    drop_columns_column_no: rowIndex + 1,
    drop_columns_data_type: column.dataType.trim() || "Text",
    drop_columns_column_name: column.columnName.trim() || `Column ${rowIndex + 1}`,
    drop_columns_column_alias: toNullableString(column.columnAlias),
    drop_columns_column_width: toNullableNumber(column.width),
    drop_columns_column_visiblity: column.visible,
    drop_columns_column_allignment: column.alignment,
    drop_columns_column_filter: column.filter,
  };
}
function createBlankForm(): DropdownDesignerForm {
  return {
    dropdownId: "",
    dropdownName: "",
    dropdownDescription: "",
    sortColumn: "",
    sortOrder: "ASC",
    dropdownCompletion: "",
    dropdownSql: "",
    dropdownSqlRegional: "",
    maxVisibleItems: "10",
    showHeader: true,
    dropdownWidth: "",
  };
}

type DropdownDesignerPageProps = {
  initialDropdownId?: string;
  startNew?: boolean;
};

export default function DropdownDesignerPage({
  initialDropdownId,
  startNew = false,
}: DropdownDesignerPageProps = {}) {
  const [form, setForm] = useState<DropdownDesignerForm>(INITIAL_FORM);
  const [columns, setColumns] = useState<DropdownColumnRow[]>([]);
  const [dropdownOptions, setDropdownOptions] = useState<DropdownOption[]>([]);
  const [selectedColumnId, setSelectedColumnId] = useState("");
  const [isDropdownListLoading, setIsDropdownListLoading] = useState(false);
  const [isDropdownLoading, setIsDropdownLoading] = useState(false);
  const [isDropdownSaving, setIsDropdownSaving] = useState(false);
  const [isDropdownDeleting, setIsDropdownDeleting] = useState(false);
  const [statusText, setStatusText] = useState("Ready.");
  const didInitialLoadRef = useRef(false);
  const normalizedInitialDropdownId = useMemo(
    () => initialDropdownId?.trim() ?? "",
    [initialDropdownId],
  );
  const { getAll: getDropdownDetails } = useApi<ApiSuccessResponse<DropdownDetailPayload[]>>(
    DROPDOWN_DETAILS_GET_ENDPOINT,
    { toast: { success: false, error: true } },
  );
  const { run: saveDropdownDetails } = useApi<
    ApiSuccessResponse<DropdownDetailPayload>,
    SaveDropdownDetailRequest
  >(DROPDOWN_DETAILS_CREATE_ENDPOINT, {
    method: "POST",
    toast: { success: false, error: true },
  });
  const { run: deleteDropdownDetails } = useApi<
    ApiSuccessResponse<{ dropdown_id: string; deleted: true }>
  >(DROPDOWN_DETAILS_DELETE_ENDPOINT, {
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
    const activeSortColumn = form.sortColumn.trim();
    if (activeSortColumn && !seen.has(activeSortColumn)) {
      options.unshift(activeSortColumn);
    }
    return options;
  }, [columns, form.sortColumn]);
  const isBusy = isDropdownLoading || isDropdownSaving || isDropdownDeleting;
  const updateForm = <K extends keyof DropdownDesignerForm>(
    key: K,
    value: DropdownDesignerForm[K],
  ) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };
  const updateColumn = useCallback(
    <K extends keyof DropdownColumnRow>(id: string, key: K, value: DropdownColumnRow[K]) => {
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
    },
    [columns, form.sortColumn],
  );
  const dropdownTableColumns = useMemo<ReusableTableColumn<DropdownColumnRow>[]>(
    () => [
      {
        key: "columnNumber",
        header: "No",
        accessor: "columnNumber",
        width: "56px",
        mobileLabel: "No",
      },
      {
        key: "serialId",
        header: "Serial Id",
        width: "118px",
        mobileLabel: "Serial Id",
        render: (row) => <span className={styles.serialIdTag}>{row.serialId ?? "New"}</span>,
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
        key: "columnAlias",
        header: "Alias",
        width: "200px",
        mobileLabel: "Alias",
        render: (row) => (
          <input
            className={styles.cellInput}
            value={row.columnAlias}
            onChange={(event) => updateColumn(row.id, "columnAlias", event.target.value)}
          />
        ),
      },
      {
        key: "dataType",
        header: "Data Type",
        width: "160px",
        mobileLabel: "Data Type",
        render: (row) => (
          <input
            className={styles.cellInput}
            value={row.dataType}
            list="dropdown-column-data-type-options"
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
        key: "alignment",
        header: "Alignment",
        width: "112px",
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
        width: "82px",
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
        width: "82px",
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
    ],
    [updateColumn],
  );
  const fetchAllDropdownDetails = useCallback(async (): Promise<DropdownDetailPayload[]> => {
    const response = await getDropdownDetails({});
    return Array.isArray(response?.data) ? response.data : [];
  }, [getDropdownDetails]);
  const refreshDropdownOptions = useCallback(async () => {
    setIsDropdownListLoading(true);
    try {
      const dropdownDetails = await fetchAllDropdownDetails();
      const nextOptions = dropdownDetails
        .map((dropdown) => ({
          dropdownId: dropdown.dropdown_id,
          dropdownName: dropdown.dropdown_name,
          showHeader: dropdown.dropdown_show_header,
        }))
        .sort((left, right) => {
          const nameCompare = left.dropdownName.localeCompare(right.dropdownName, undefined, {
            sensitivity: "base",
            numeric: true,
          });
          if (nameCompare !== 0) {
            return nameCompare;
          }
          return left.dropdownId.localeCompare(right.dropdownId, undefined, {
            sensitivity: "base",
            numeric: true,
          });
        });
      setDropdownOptions(nextOptions);
      return nextOptions;
    } finally {
      setIsDropdownListLoading(false);
    }
  }, [fetchAllDropdownDetails]);
  const loadDropdownById = useCallback(
    async (dropdownId: string) => {
      const normalizedDropdownId = dropdownId.trim();
      if (!normalizedDropdownId) {
        toast.error("Select a saved dropdown.");
        return;
      }
      if (!/^\d+$/.test(normalizedDropdownId)) {
        toast.error("Dropdown id must be numeric.");
        return;
      }
      setIsDropdownLoading(true);
      setStatusText(`Loading dropdown ${normalizedDropdownId}...`);
      try {
        const detailResponse = await getDropdownDetails({
          dropdown_id: normalizedDropdownId,
        });
        const detail = Array.isArray(detailResponse?.data) ? detailResponse.data[0] : undefined;
        if (!detail) {
          throw new Error("No dropdown details returned from API.");
        }
        const nextColumns = [...(detail.columns ?? [])]
          .sort((left, right) => left.drop_columns_column_no - right.drop_columns_column_no)
          .map(mapDropdownColumnPayloadToRow);
        setForm({
          dropdownId: detail.dropdown_id,
          dropdownName: detail.dropdown_name,
          dropdownDescription: detail.dropdown_description ?? "",
          sortColumn: detail.dropdown_sort_column ?? "",
          sortOrder: normalizeSortOrder(detail.dropdown_sort_order),
          dropdownCompletion: detail.dropdown_completion ?? "",
          dropdownSql: detail.dropdown_sql,
          dropdownSqlRegional: detail.dropdown_sql_regional ?? "",
          maxVisibleItems: String(detail.dropdown_max_visible_items),
          showHeader: detail.dropdown_show_header,
          dropdownWidth: formatNullableNumber(detail.dropdown_width),
        });
        setColumns(nextColumns);
        setSelectedColumnId(nextColumns[0]?.id ?? "");
        setStatusText(`Loaded dropdown ${detail.dropdown_id}.`);
      } catch {
        setStatusText(`Unable to load dropdown ${normalizedDropdownId}.`);
      } finally {
        setIsDropdownLoading(false);
      }
    },
    [getDropdownDetails],
  );
  const handleLoadDropdown = useCallback(async () => {
    await loadDropdownById(form.dropdownId);
  }, [form.dropdownId, loadDropdownById]);
  const handleDropdownSelectionChange = useCallback(
    async (nextDropdownId: string) => {
      if (!nextDropdownId) {
        setForm(createBlankForm());
        setColumns([]);
        setSelectedColumnId("");
        setStatusText("Ready for a new dropdown.");
        return;
      }
      setForm((current) => ({
        ...current,
        dropdownId: nextDropdownId,
      }));
      await loadDropdownById(nextDropdownId);
    },
    [loadDropdownById],
  );
  const handleSaveDropdown = useCallback(async () => {
    const normalizedDropdownId = form.dropdownId.trim();
    if (normalizedDropdownId && !/^\d+$/.test(normalizedDropdownId)) {
      toast.error("Dropdown id must be numeric.");
      return;
    }
    if (!form.dropdownName.trim()) {
      toast.error("Dropdown Name is required.");
      return;
    }
    if (!form.dropdownSql.trim()) {
      toast.error("Dropdown SQL is required.");
      return;
    }
    setIsDropdownSaving(true);
    setStatusText("Saving dropdown...");
    try {
      const normalizedSortColumn = toNullableString(form.sortColumn);
      const dropdownDetailResponse = await saveDropdownDetails({
        body: {
          ...(normalizedDropdownId ? { dropdown_id: normalizedDropdownId } : {}),
          dropdown_name: form.dropdownName.trim(),
          dropdown_description: toNullableString(form.dropdownDescription),
          dropdown_sql: form.dropdownSql.trim(),
          dropdown_sort_order: normalizedSortColumn ? form.sortOrder : null,
          dropdown_sort_column: normalizedSortColumn,
          dropdown_completion: toNullableString(form.dropdownCompletion),
          dropdown_sql_regional: toNullableString(form.dropdownSqlRegional),
          dropdown_max_visible_items: toPositiveInteger(form.maxVisibleItems) ?? 10,
          dropdown_show_header: form.showHeader,
          dropdown_width: toNullablePositiveInteger(form.dropdownWidth),
          dropdown_columns: columns.map((column, rowIndex) =>
            buildDropdownColumnRequest(column, rowIndex),
          ),
          replace_columns: true,
        },
      });
      const savedDropdown = dropdownDetailResponse?.data;
      if (!savedDropdown) {
        throw new Error("Dropdown save did not return data.");
      }
      const nextColumns = [...(savedDropdown.columns ?? [])]
        .sort((left, right) => left.drop_columns_column_no - right.drop_columns_column_no)
        .map(mapDropdownColumnPayloadToRow);
      setForm({
        dropdownId: savedDropdown.dropdown_id,
        dropdownName: savedDropdown.dropdown_name,
        dropdownDescription: savedDropdown.dropdown_description ?? "",
        sortColumn: savedDropdown.dropdown_sort_column ?? "",
        sortOrder: normalizeSortOrder(savedDropdown.dropdown_sort_order),
        dropdownCompletion: savedDropdown.dropdown_completion ?? "",
        dropdownSql: savedDropdown.dropdown_sql,
        dropdownSqlRegional: savedDropdown.dropdown_sql_regional ?? "",
        maxVisibleItems: String(savedDropdown.dropdown_max_visible_items),
        showHeader: savedDropdown.dropdown_show_header,
        dropdownWidth: formatNullableNumber(savedDropdown.dropdown_width),
      });
      setColumns(nextColumns);
      setSelectedColumnId(nextColumns[0]?.id ?? "");
      try {
        await refreshDropdownOptions();
      } catch {}
      setStatusText(`Saved dropdown ${savedDropdown.dropdown_id}.`);
      toast.success("Dropdown saved successfully.");
    } catch {
      setStatusText("Dropdown save failed.");
    } finally {
      setIsDropdownSaving(false);
    }
  }, [columns, form, refreshDropdownOptions, saveDropdownDetails]);
  const handleDeleteDropdown = useCallback(async () => {
    const normalizedDropdownId = form.dropdownId.trim();
    if (!normalizedDropdownId) {
      toast.error("No dropdown selected.");
      return;
    }
    if (!/^\d+$/.test(normalizedDropdownId)) {
      toast.error("Dropdown id must be numeric.");
      return;
    }
    setIsDropdownDeleting(true);
    setStatusText(`Deleting dropdown ${normalizedDropdownId}...`);
    try {
      await deleteDropdownDetails({
        query: {
          dropdown_id: normalizedDropdownId,
        },
      });
      setForm(createBlankForm());
      setColumns([]);
      setSelectedColumnId("");
      try {
        await refreshDropdownOptions();
      } catch {}
      setStatusText(`Deleted dropdown ${normalizedDropdownId}.`);
      toast.success("Dropdown deleted successfully.");
    } catch {
      setStatusText(`Unable to delete dropdown ${normalizedDropdownId}.`);
    } finally {
      setIsDropdownDeleting(false);
    }
  }, [deleteDropdownDetails, form.dropdownId, refreshDropdownOptions]);
  const handleCreateNewDropdown = useCallback(() => {
    setForm(createBlankForm());
    setColumns([]);
    setSelectedColumnId("");
    setStatusText("Ready for a new dropdown.");
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
    const nextColumns = resequenceColumns(columns.filter((column) => column.id !== selectedColumnId));
    setColumns(nextColumns);
    setSelectedColumnId(nextColumns[0]?.id ?? "");
    if (deletedColumn && form.sortColumn === deletedColumn.columnName) {
      setForm((current) => ({
        ...current,
        sortColumn: nextColumns[0]?.columnName ?? "",
      }));
    }
  }, [columns, form.sortColumn, selectedColumnId]);
  useEffect(() => {
    if (didInitialLoadRef.current) {
      return;
    }
    didInitialLoadRef.current = true;
    const loadInitialState = async () => {
      try {
        const savedDropdownOptions = await refreshDropdownOptions();
        if (startNew) {
          setForm(createBlankForm());
          setColumns([]);
          setSelectedColumnId("");
          setStatusText("Ready for a new dropdown.");
          return;
        }
        const preferredDropdownId =
          normalizedInitialDropdownId || savedDropdownOptions[0]?.dropdownId || "";
        if (preferredDropdownId) {
          await loadDropdownById(preferredDropdownId);
          return;
        }
      } catch {
        setStatusText("Unable to load saved dropdown list.");
        return;
      }
      setForm(createBlankForm());
      setColumns([]);
      setSelectedColumnId("");
      setStatusText("No saved dropdowns available. Ready for a new dropdown.");
    };
    void loadInitialState();
  }, [loadDropdownById, normalizedInitialDropdownId, refreshDropdownOptions, startNew]);
  return (
    <main className={styles.page}>
      <div className={styles.workspace}>
        <section className={styles.toolbar} aria-label="Dropdown actions">
          <div className={styles.toolbarGroup}>
            <button
              type="button"
              className={styles.desktopButton}
              onClick={() => void handleLoadDropdown()}
              disabled={isBusy || !form.dropdownId.trim()}
            >
              Load Dropdown
            </button>
            <button
              type="button"
              className={styles.desktopButton}
              onClick={() => void handleSaveDropdown()}
              disabled={isBusy}
            >
              Save Dropdown
            </button>
            <button
              type="button"
              className={styles.desktopButton}
              onClick={handleCreateNewDropdown}
              disabled={isBusy}
            >
              New Dropdown
            </button>
            <button
              type="button"
              className={styles.desktopButton}
              onClick={() => void handleDeleteDropdown()}
              disabled={isBusy || !form.dropdownId.trim()}
            >
              Delete Dropdown
            </button>
          </div>
          <div className={styles.statusBadge} aria-live="polite">
            {statusText}
          </div>
        </section>
        <section className={responsiveStyles.headerGrid}>
          <section className={styles.detailsPanel} aria-label="Dropdown details form">
            <p className={styles.panelTitle}>Dropdown Details</p>
            <div className={styles.fieldStack}>
              <label className={styles.inlineField}>
                <span className={styles.fieldLabel}>Dropdown Id :</span>
                <select
                  className={styles.selectField}
                  value={form.dropdownId}
                  onChange={(event) => void handleDropdownSelectionChange(event.target.value)}
                  disabled={isBusy || isDropdownListLoading}
                >
                  <option value="">
                    {isDropdownListLoading ? "Loading dropdowns..." : "Select saved dropdown"}
                  </option>
                  {dropdownOptions.map((dropdownOption) => (
                    <option key={dropdownOption.dropdownId} value={dropdownOption.dropdownId}>
                      {dropdownOption.dropdownName} ({dropdownOption.dropdownId})
                      {!dropdownOption.showHeader ? " [Header Off]" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.inlineField}>
                <span className={styles.fieldLabel}>Dropdown Name :</span>
                <input
                  className={styles.textField}
                  value={form.dropdownName}
                  onChange={(event) => updateForm("dropdownName", event.target.value)}
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
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>            
          </section>
          <section className={styles.descriptionPanel} aria-label="Dropdown settings">
            <p className={styles.panelTitle}>Dropdown Settings</p>
            <div className={responsiveStyles.settingsGrid}>
              <label className={styles.inlineField}>
                <span className={styles.fieldLabel}>Visible Items :</span>
                <input
                  className={styles.textField}
                  inputMode="numeric"
                  value={form.maxVisibleItems}
                  onChange={(event) => updateForm("maxVisibleItems", event.target.value)}
                />
              </label>
              <label className={styles.inlineField}>
                <span className={styles.fieldLabel}>Dropdown Width :</span>
                <input
                  className={styles.textField}
                  inputMode="numeric"
                  value={form.dropdownWidth}
                  onChange={(event) => updateForm("dropdownWidth", event.target.value)}
                />
              </label>
            </div>
            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={form.showHeader}
                onChange={(event) => updateForm("showHeader", event.target.checked)}
              />
              <span>Show Header Row</span>
            </label>
            <label className={styles.blockField}>
              <span className={styles.fieldLabel}>Description :</span>
              <textarea
                className={styles.largeTextField}
                value={form.dropdownDescription}
                onChange={(event) => updateForm("dropdownDescription", event.target.value)}
              />
            </label>
            <label className={styles.blockField}>
              <span className={styles.fieldLabel}>Completion Logic :</span>
              <textarea
                className={styles.cardTextarea}
                value={form.dropdownCompletion}
                onChange={(event) => updateForm("dropdownCompletion", event.target.value)}
              />
            </label>
          </section>
          <section className={styles.sqlSection} aria-label="Dropdown SQL">
            <p className={styles.panelTitle}>Dropdown SQL</p>
            <div className={responsiveStyles.sqlGrid}>
              <label className={styles.blockField}>
                <span className={styles.fieldLabel}>Primary SQL :</span>
                <textarea
                  className={styles.sqlEditor}
                  value={form.dropdownSql}
                  onChange={(event) => updateForm("dropdownSql", event.target.value)}
                />
              </label>
              <label className={styles.blockField}>
                <span className={styles.fieldLabel}>Regional SQL :</span>
                <textarea
                  className={styles.sqlEditor}
                  value={form.dropdownSqlRegional}
                  onChange={(event) => updateForm("dropdownSqlRegional", event.target.value)}
                />
              </label>
            </div>
          </section>
        </section>
        <section className={styles.columnsSection} aria-label="Dropdown columns table">
          <div className={styles.sectionLabelRow}>
            <span className={styles.sectionLabel}>Dropdown Columns :</span>
            <span className={styles.sectionMeta}>
              {columns.length} columns
              {selectedColumn ? ` | Selected: ${selectedColumn.columnName || "Untitled"}` : ""}
            </span>
          </div>
          <div className={responsiveStyles.desktopColumnsTable}>
            <ReusableTable
              columns={dropdownTableColumns}
              rows={columns}
              rowKey="id"
              minWidth={DROPDOWN_COLUMNS_TABLE_MIN_WIDTH}
              activeRowKey={selectedColumnId}
              onRowClick={(row) => setSelectedColumnId(row.id)}
              wrapperClassName={styles.columnsUiTableShell}
              rowClassName={(row) =>
                row.id === selectedColumnId ? styles.uiTableSelectedRow : undefined
              }
              fullViewHeight={false}
              tableMaxHeight="100%"
              stickyHeader
              showActionsColumn={false}
              emptyText='No dropdown columns yet. Use "Add Column" to create schema-backed rows.'
            />
          </div>
          <div className={styles.mobileColumnsList}>
            {columns.length === 0 ? (
              <div className={styles.emptyColumnsState}>
                No dropdown columns yet. Use "Add Column" to create schema-backed rows.
              </div>
            ) : (
              columns.map((column) => (
                <article
                  key={column.id}
                  className={cx(
                    styles.columnCard,
                    column.id === selectedColumnId && styles.selectedColumnCard,
                  )}
                  onClick={() => setSelectedColumnId(column.id)}
                  onFocusCapture={() => setSelectedColumnId(column.id)}
                >
                  <div className={styles.columnCardHeader}>
                    <div className={styles.columnCardTitleGroup}>
                      <p className={styles.columnCardTitle}>Column {column.columnNumber}</p>
                      <p className={styles.columnCardSubtitle}>
                        {column.columnName.trim() || "Untitled Column"}
                      </p>
                    </div>
                    <span className={styles.serialIdTag}>{column.serialId ?? "New"}</span>
                  </div>
                  <div className={styles.columnCardGrid}>
                    <label className={styles.cardField}>
                      <span className={styles.cardFieldLabel}>Column Name</span>
                      <input
                        className={styles.cardInput}
                        value={column.columnName}
                        onChange={(event) =>
                          updateColumn(column.id, "columnName", event.target.value)
                        }
                      />
                    </label>
                    <label className={styles.cardField}>
                      <span className={styles.cardFieldLabel}>Alias</span>
                      <input
                        className={styles.cardInput}
                        value={column.columnAlias}
                        onChange={(event) =>
                          updateColumn(column.id, "columnAlias", event.target.value)
                        }
                      />
                    </label>
                    <label className={styles.cardField}>
                      <span className={styles.cardFieldLabel}>Data Type</span>
                      <input
                        className={styles.cardInput}
                        value={column.dataType}
                        list="dropdown-column-data-type-options"
                        onChange={(event) => updateColumn(column.id, "dataType", event.target.value)}
                      />
                    </label>
                    <label className={styles.cardField}>
                      <span className={styles.cardFieldLabel}>Width</span>
                      <input
                        className={styles.cardInput}
                        value={column.width}
                        onChange={(event) => updateColumn(column.id, "width", event.target.value)}
                      />
                    </label>
                    <label className={styles.cardField}>
                      <span className={styles.cardFieldLabel}>Alignment</span>
                      <select
                        className={styles.cardSelect}
                        value={column.alignment}
                        onChange={(event) =>
                          updateColumn(column.id, "alignment", event.target.value as Alignment)
                        }
                      >
                        {ALIGNMENT_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className={cx(styles.cardField, styles.cardFieldWide)}>
                      <span className={styles.cardFieldLabel}>Options</span>
                      <div className={styles.cardToggleGrid}>
                        <label className={styles.cardToggle}>
                          <input
                            type="checkbox"
                            checked={column.visible}
                            onChange={(event) =>
                              updateColumn(column.id, "visible", event.target.checked)
                            }
                          />
                          <span>Visible</span>
                        </label>
                        <label className={styles.cardToggle}>
                          <input
                            type="checkbox"
                            checked={column.filter}
                            onChange={(event) =>
                              updateColumn(column.id, "filter", event.target.checked)
                            }
                          />
                          <span>Filter</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
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
        <datalist id="dropdown-column-data-type-options">
          {DATA_TYPE_SUGGESTIONS.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </div>
    </main>
  );
}
