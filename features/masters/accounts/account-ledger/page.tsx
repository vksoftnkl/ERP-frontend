"use client";
import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import ReusableTable, {
  type ReusableTableBodyContextMenuPayload,
  type ReusableTableColumn,
  type ReusableTableColumnResizeEndPayload,
} from "@/components/ui/table";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import { getApiErrorMessage } from "@/store/api/baseApi";
import { useGetGridColumnsQuery } from "@/store/api/metadataApi";
import type { GridColumnConfig } from "@/store/slices/gridColumnsSlice";
import styles from "@/app/master/state-master/page.module.scss";
import dynamicFormStyles from "@/components/design-system/ui/dynamic-modal-form.module.scss";
import { RecordHistoryModal } from "@/features/masters/record-history/page";
import {
  FiClock,
  FiDownload,
  FiEdit2,
  FiPlusCircle,
  FiPrinter,
  FiRefreshCw,
  FiSearch,
  FiTrash2,
  FiUpload,
} from "react-icons/fi";
// Import all modular logic
import {
  API_ENDPOINTS,
  DEBOUNCE_MS,
  SEARCHABLE_SELECT_OPTIONS_MAX_HEIGHT,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  ACCOUNT_LEDGER_GRID_ID,
  GRID_DETAILS_ENDPOINT,
  GRID_COLUMNS_CREATE_ENDPOINT,
  GRID_COLUMN_WIDTH_ENDPOINT,
  GRID_FILTER_SETTINGS_ENDPOINT,
  GRID_VISIBILITY_SETTINGS_ENDPOINT,
  GRID_DETAILS_QUERY,
  GST_LOOKUP_ENDPOINT,
  GST_LOOKUP_PATTERN,
  STATE_NAME_SEARCH_FIELD_NAMES,
  REQUEST_PAYLOAD_KEYS,
  LEDGER_COMPANY_NAME_KEYS,
  LEDGER_BRANCH_NAME_KEYS,
  LEDGER_GROUP_NAME_KEYS,
  LEDGER_ASIDE_SECTION_KEYS,
} from "./constants";
import type {
  ModalMode,
  LedgerFormFieldName,
  LedgerFormValues,
  LedgerTableRow,
} from "./types";
import {
  toDisplayValue,
  getFirstDefinedValue,
  buildStateNameOptions,
  buildStateCodeByName,
  buildStateNameByCode,
  extractGstLookupSource,
  buildLedgerGstLookupValues,
  getLookupErrorMessage,
  extractPaginationInfo,
  resolveAccountLedgerGridDetails,
  toSafePageNumber,
  toSafePageSize,
} from "./transformers";
import {
  isLedgerFieldName,
  createInitialLedgerFormValues,
  toLedgerFormValues,
  buildLedgerRequestPayload,
  getLedgerValidationError,
} from "./form-builder";
import {
  buildLedgerFormFields,
  toLedgerFormSections,
} from "./fields-schema";
import BankAccountsEditor from "./bank-accounts-editor";
import {
  createEmptyBankAccountRow,
  extractLedgerBankAccountRows,
  getBankAccountValidationError,
  type LedgerBankAccountFieldName,
  type LedgerBankAccountFormRow,
} from "./bank-accounts";
import {
  DROPDOWN_RUN_ENDPOINT,
  LEDGER_DROPDOWN_FIELD_CONFIG,
  LEDGER_DROPDOWN_FIELD_NAMES,
  buildDropdownRunQuery,
  buildDropdownOptions,
} from "./dropdowns";
import {
  buildLedgerRows,
  resolveLedgerRecordId,
  buildColumnsFromGridColumns,
  resolveGridColumnForLedgerTableColumn,
} from "./table-builder";
import {
  getLedgerFocusableFieldControl,
  getLedgerFocusableFieldTargets,
  findNextLedgerFieldTarget,
  getFirstLedgerFocusableFieldTarget,
  focusLedgerFieldControl,
} from "./form-navigation";
const GRID_SETTINGS_CONTEXT_MENU_WIDTH = 190;
const GRID_SETTINGS_CONTEXT_MENU_HEIGHT = 130;
const GRID_SETTINGS_CONTEXT_MENU_PADDING = 8;
// Synthetic form tab (no scalar fields) that hosts the nested bank-accounts editor.
const BANK_ACCOUNTS_SECTION_KEY = "__bank_accounts";
type ContextMenuPosition = Pick<CSSProperties, "left" | "top">;
function clampContextMenuPosition(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
function toCsvCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}
function escapeCsvValue(value: unknown): string {
  const normalized = toCsvCellValue(value);
  if (/[",\n\r]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}
function reactNodeToCsvHeader(value: ReactNode, fallback: string): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return fallback;
}
function getColumnExportValue(
  column: ReusableTableColumn<LedgerTableRow>,
  row: LedgerTableRow,
  rowIndex: number,
): unknown {
  if (column.searchAccessor) {
    return column.searchAccessor(row, rowIndex);
  }
  if (column.sortAccessor) {
    return column.sortAccessor(row, rowIndex);
  }
  if (column.accessor) {
    return row[column.accessor];
  }
  return "";
}
type GridColumnWidthUpdate = { grid_column_id: string; grid_column_width: number };
type GridColumnFilterUpdate = { grid_column_id: string; grid_column_filter: boolean };
type GridColumnVisibilityUpdate = {
  grid_column_id: string;
  grid_column_visibility: boolean;
};
function buildLedgerGridColumnBasePayload(
  gridColumn: GridColumnConfig,
  fallbackGridId: number,
): Record<string, unknown> | null {
  if (!gridColumn.serialId) {
    return null;
  }
  const columnNumber =
    gridColumn.columnNumber && gridColumn.columnNumber > 0
      ? gridColumn.columnNumber
      : Math.max(1, gridColumn.order + 1);
  const columnName = (gridColumn.columnName ?? gridColumn.header).trim();
  if (!columnName) {
    return null;
  }
  return {
    grid_column_id: gridColumn.serialId,
    grid_id: gridColumn.gridId ?? String(fallbackGridId),
    grid_column_number: columnNumber,
    grid_column_name: columnName,
  };
}
function downloadLedgerCsv(
  title: string,
  columns: ReusableTableColumn<LedgerTableRow>[],
  rows: LedgerTableRow[],
): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  const exportColumns = columns.filter((column) => column.key !== "actions");
  const csv = [
    exportColumns.map((column) => escapeCsvValue(reactNodeToCsvHeader(column.header, column.key))),
    ...rows.map((row, rowIndex) =>
      exportColumns.map((column) =>
        escapeCsvValue(getColumnExportValue(column, row, rowIndex)),
      ),
    ),
  ]
    .map((row) => row.join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `account-ledger-master-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}
// Form rendering component
function LedgerFieldRenderer({
  field,
  formValues,
  isReadOnlyMode,
  detailsLoading,
  saveLoading,
  validationFieldName,
  openSearchField,
  searchQueries,
  searchActiveOptionIndex,
  handleFieldChange,
  handleCheckboxKeyDown,
  handleSearchableFieldInput,
  handleSearchableFieldKeyDown,
  handleSearchableFieldPointerToggle,
  handleSearchableOptionSelect,
  handleSearchableFieldClear,
  searchInputRefs,
  serverSearchFieldNames,
  loadingFieldNames,
}: {
  field: ERPDynamicModalField;
  formValues: LedgerFormValues;
  isReadOnlyMode: boolean;
  detailsLoading: boolean;
  saveLoading: boolean;
  validationFieldName: LedgerFormFieldName | null;
  openSearchField: string | null;
  searchQueries: Record<string, string>;
  searchActiveOptionIndex: Record<string, number>;
  serverSearchFieldNames: Set<string>;
  loadingFieldNames: Set<string>;
  handleFieldChange: (fieldName: LedgerFormFieldName, value: string) => void;
  handleCheckboxKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  handleSearchableFieldInput: (
    fieldName: LedgerFormFieldName,
    query: string,
  ) => void;
  handleSearchableFieldKeyDown: (
    fieldName: LedgerFormFieldName,
    event: ReactKeyboardEvent<HTMLElement>,
    filteredOptions: ERPDynamicSelectOption[],
    fieldValue: string,
  ) => void;
  handleSearchableFieldPointerToggle: (
    fieldName: LedgerFormFieldName,
  ) => void;
  handleSearchableOptionSelect: (
    fieldName: LedgerFormFieldName,
    option: ERPDynamicSelectOption,
  ) => void;
  handleSearchableFieldClear: (fieldName: LedgerFormFieldName) => void;
  searchInputRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
}) {
  if (!isLedgerFieldName(field.name)) {
    return null;
  }
  const fieldName = field.name;
  const inputType = field.type ?? "text";
  const fieldValue = formValues[fieldName] ?? "";
  const disabled = isReadOnlyMode || detailsLoading || saveLoading;
  const isValidationInvalid = validationFieldName === fieldName;
  const wrapperClassName = dynamicFormStyles.field;
  const wrapperInlineStyle: CSSProperties = {
    gridTemplateColumns: "1fr",
    rowGap: "0.35rem",
    gridColumn:
      field.colSpan && field.colSpan > 1 ? `span ${Math.min(3, field.colSpan)}` : undefined,
  };
  const labelInlineStyle: CSSProperties = { paddingTop: 0 };
  const controlInlineStyle: CSSProperties = { gridColumn: "1" };
  // Checkbox type
  if (inputType === "checkbox") {
    const isChecked = fieldValue === "true";
    return (
      <div
        key={field.name}
        data-ledger-modal-field-name={fieldName}
        className={wrapperClassName}
        style={wrapperInlineStyle}
      >
        <label
          className={dynamicFormStyles.checkboxWrapper}
          htmlFor={field.name}
          style={{ ...controlInlineStyle, display: "inline-flex", alignItems: "center", justifyContent: "flex-start", width: "100%" }}
        >
          <input
            id={field.name}
            data-ledger-modal-field-control="true"
            className={`${dynamicFormStyles.checkboxControl} ${isValidationInvalid ? dynamicFormStyles.checkboxControlInvalid : ""}`}
            type="checkbox"
            autoComplete="off"
            checked={isChecked}
            disabled={disabled}
            onKeyDown={handleCheckboxKeyDown}
            style={{ marginRight: "4px", width: "14px", height: "14px" }}
            onChange={(event) =>
              handleFieldChange(fieldName, event.target.checked ? "true" : "false")
            }
          />
          <span className={dynamicFormStyles.label} style={labelInlineStyle}>
            {field.label}
            {field.required ? <span className={dynamicFormStyles.requiredMark}>*</span> : null}
          </span>
        </label>
      </div>
    );
  }
  // Searchable select
  if (inputType === "select" && field.searchable) {
    const options = field.options ?? [];
    const selectedOption = options.find((option) => option.value === fieldValue);
    const isSearchOpen = openSearchField === fieldName;
    const selectedLabel = fieldValue ? selectedOption?.label ?? "" : "";
    const typedQuery = searchQueries[fieldName] ?? "";
    const normalizedQuery = typedQuery.trim().toLowerCase();
    // Server-backed dropdowns already filter via the `search` param, so render their
    // options as-is (client filtering would hide rows matched on non-label columns).
    const isServerSearch = serverSearchFieldNames.has(fieldName);
    const isLoadingOptions = loadingFieldNames.has(fieldName);
    const filteredOptions = isServerSearch
      ? options
      : options.filter((option) => {
          if (!normalizedQuery) return true;
          return (
            option.label.toLowerCase().includes(normalizedQuery) ||
            option.value.toLowerCase().includes(normalizedQuery)
          );
        });
    const highlightedOptionIndexRaw = searchActiveOptionIndex[fieldName];
    const highlightedOptionIndex =
      highlightedOptionIndexRaw !== undefined &&
      highlightedOptionIndexRaw >= 0 &&
      highlightedOptionIndexRaw < filteredOptions.length
        ? highlightedOptionIndexRaw
        : -1;
    const activeDescendantId =
      isSearchOpen && highlightedOptionIndex >= 0
        ? `${field.name}-search-option-${highlightedOptionIndex}`
        : undefined;
    return (
      <div
        key={field.name}
        data-ledger-modal-field-name={fieldName}
        className={wrapperClassName}
        style={wrapperInlineStyle}
      >
        <label className={dynamicFormStyles.label} htmlFor={field.name} style={labelInlineStyle}>
          {field.label}
          {field.required ? <span className={dynamicFormStyles.requiredMark}>*</span> : null}
        </label>
        <div className={dynamicFormStyles.searchSelect} data-ledger-search-select-root="true" style={controlInlineStyle}>
          <button
            id={field.name}
            type="button"
            data-ledger-modal-field-control="true"
            className={`${dynamicFormStyles.searchSelectTrigger} ${
              isValidationInvalid ? dynamicFormStyles.controlInvalid : ""
            } ${fieldValue ? dynamicFormStyles.searchSelectTriggerClearable : ""} ${
              isSearchOpen ? dynamicFormStyles.searchSelectTriggerOpen : ""
            }`}
            disabled={disabled}
            role="combobox"
            aria-expanded={isSearchOpen}
            aria-controls={`${field.name}-search-list`}
            aria-activedescendant={activeDescendantId}
            onKeyDown={(event) =>
              handleSearchableFieldKeyDown(fieldName, event, filteredOptions, fieldValue)
            }
            onMouseDown={(event) => {
              event.preventDefault();
              if (disabled) {
                return;
              }
              handleSearchableFieldPointerToggle(fieldName);
            }}
          >
            <span
              className={`${dynamicFormStyles.searchSelectTriggerSingleValue} ${
                !selectedLabel ? dynamicFormStyles.searchSelectTriggerPlaceholder : ""
              }`}
            >
              {selectedLabel || field.placeholder || `Select ${field.label}`}
            </span>
            <span className={dynamicFormStyles.searchSelectChevronSlot} aria-hidden="true">
              <svg viewBox="0 0 20 20" className={dynamicFormStyles.searchSelectChevron}>
                <path
                  d="M5 7.5 10 12.5 15 7.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
          {fieldValue && !disabled ? (
            <button
              type="button"
              className={dynamicFormStyles.searchSelectClearButton}
              aria-label={`Clear ${field.label}`}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                handleSearchableFieldClear(fieldName);
              }}
            >
              x
            </button>
          ) : null}
          {isSearchOpen && !disabled ? (
            <div
              id={`${field.name}-search-list`}
              data-ledger-modal-search-dropdown="true"
              className={dynamicFormStyles.searchSelectList}
              role="listbox"
            >
              <div className={dynamicFormStyles.searchSelectSearchWrap}>
                <input
                  ref={(element) => {
                    searchInputRefs.current[fieldName] = element;
                  }}
                  type="text"
                  autoComplete="off"
                  value={typedQuery}
                  placeholder={`Search ${field.label}`}
                  className={dynamicFormStyles.searchSelectSearchInput}
                  role="searchbox"
                  onMouseDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) =>
                    handleSearchableFieldKeyDown(
                      fieldName,
                      event,
                      filteredOptions,
                      fieldValue,
                    )
                  }
                  onChange={(event) =>
                    handleSearchableFieldInput(
                      fieldName,
                      event.target.value,
                    )
                  }
                />
                <span className={dynamicFormStyles.searchSelectSearchIcon} aria-hidden="true">
                  <svg viewBox="0 0 20 20">
                    <path
                      d="M8.6 3.5a5.1 5.1 0 1 1 0 10.2 5.1 5.1 0 0 1 0-10.2Zm0 1.6a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm4.7 8.7 3.2 3.2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </div>
              {isLoadingOptions ? (
                <div className={dynamicFormStyles.searchSelectEmpty}>Loading...</div>
              ) : filteredOptions.length ? (
                <ul
                  className={dynamicFormStyles.searchSelectOptions}
                  style={{ maxHeight: `${SEARCHABLE_SELECT_OPTIONS_MAX_HEIGHT}px` }}
                >
                  {filteredOptions.map((option, optionIndex) => (
                    <li
                      id={`${field.name}-search-option-${optionIndex}`}
                      key={`${fieldName}-${option.value}`}
                      className={`${dynamicFormStyles.searchSelectOption} ${
                        option.value === fieldValue || optionIndex === highlightedOptionIndex
                          ? dynamicFormStyles.searchSelectOptionActive
                          : ""
                      }`}
                      role="option"
                      aria-selected={option.value === fieldValue}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        handleSearchableOptionSelect(fieldName, option);
                      }}
                    >
                      {option.label}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={dynamicFormStyles.searchSelectEmpty}>No options found.</div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  // Textarea
  if (inputType === "textarea") {
    return (
      <div
        key={field.name}
        data-ledger-modal-field-name={fieldName}
        className={wrapperClassName}
        style={wrapperInlineStyle}
      >
        <label className={dynamicFormStyles.label} htmlFor={field.name} style={labelInlineStyle}>
          {field.label}
          {field.required ? <span className={dynamicFormStyles.requiredMark}>*</span> : null}
        </label>
        <textarea
          id={field.name}
          data-ledger-modal-field-control="true"
          className={`${dynamicFormStyles.control} ${dynamicFormStyles.textarea} ${
            isValidationInvalid ? dynamicFormStyles.controlInvalid : ""
          }`}
          style={controlInlineStyle}
          autoComplete="off"
          value={fieldValue}
          placeholder={field.placeholder}
          required={field.required}
          disabled={disabled}
          rows={4}
          onChange={(event) => handleFieldChange(fieldName, event.target.value)}
        />
      </div>
    );
  }
  // Regular select
  if (inputType === "select") {
    const options = field.options ?? [];
    return (
      <div
        key={field.name}
        data-ledger-modal-field-name={fieldName}
        className={wrapperClassName}
        style={wrapperInlineStyle}
      >
        <label className={dynamicFormStyles.label} htmlFor={field.name} style={labelInlineStyle}>
          {field.label}
          {field.required ? <span className={dynamicFormStyles.requiredMark}>*</span> : null}
        </label>
        <select
          id={field.name}
          data-ledger-modal-field-control="true"
          className={`${dynamicFormStyles.control} ${
            isValidationInvalid ? dynamicFormStyles.controlInvalid : ""
          }`}
          style={controlInlineStyle}
          value={fieldValue}
          required={field.required}
          disabled={disabled}
          onChange={(event) => handleFieldChange(fieldName, event.target.value)}
        >
          <option value="">{field.placeholder ?? `Select ${field.label}`}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }
  // Default text input
  return (
    <div
      key={field.name}
      data-ledger-modal-field-name={fieldName}
      className={wrapperClassName}
      style={wrapperInlineStyle}
    >
      <label className={dynamicFormStyles.label} htmlFor={field.name} style={labelInlineStyle}>
        {field.label}
        {field.required ? <span className={dynamicFormStyles.requiredMark}>*</span> : null}
      </label>
      <input
        id={field.name}
        data-ledger-modal-field-control="true"
        className={`${dynamicFormStyles.control} ${
          isValidationInvalid ? dynamicFormStyles.controlInvalid : ""
        }`}
        style={controlInlineStyle}
        type={inputType}
        autoComplete="off"
        value={fieldValue}
        placeholder={field.placeholder}
        required={field.required}
        disabled={disabled}
        min={field.min}
        max={field.max}
        step={field.step}
        onChange={(event) => handleFieldChange(fieldName, event.target.value)}
      />
    </div>
  );
}
export default function AccountLedgerMasterPage() {
  const { data, error, loading, getAll } = useApi<unknown>(API_ENDPOINTS.list);
  const { getAll: getGridDetails } = useApi<unknown>(GRID_DETAILS_ENDPOINT);
  const { run: saveGridColumnWidth } = useApi<unknown, Record<string, unknown>>(
    GRID_COLUMNS_CREATE_ENDPOINT,
    {
      method: "POST",
      toast: { success: false },
    },
  );
  // Bulk PUT settings savers (each takes { columns: [...] }).
  const { run: saveColumnWidthsApi } = useApi<
    unknown,
    { columns: GridColumnWidthUpdate[] }
  >(GRID_COLUMN_WIDTH_ENDPOINT, { method: "PUT", toast: { success: false } });
  const { run: saveFilterSettingsApi } = useApi<
    unknown,
    { columns: GridColumnFilterUpdate[] }
  >(GRID_FILTER_SETTINGS_ENDPOINT, { method: "PUT", toast: { success: false } });
  const { run: saveVisibilitySettingsApi } = useApi<
    unknown,
    { columns: GridColumnVisibilityUpdate[] }
  >(GRID_VISIBILITY_SETTINGS_ENDPOINT, { method: "PUT", toast: { success: false } });
  const {
    run: getById,
    loading: detailsLoading,
    error: detailsError,
    reset: resetDetailsState,
  } = useApi<unknown, Record<string, unknown>>(API_ENDPOINTS.getById, {
    method: "GET",
    toast: { success: false },
  });
  const {
    run: upsertRecord,
    loading: saveLoading,
    error: saveError,
    reset: resetSaveState,
  } = useApi<unknown, Record<string, unknown>>(API_ENDPOINTS.create, {
    method: "POST",
  });
  const {
    run: deleteRecord,
    loading: deleteLoading,
    error: deleteError,
  } = useApi<unknown>(API_ENDPOINTS.delete, { method: "DELETE" });
  // Per-row bank-account soft delete, used when saved bank accounts are removed in the modal.
  const { run: deleteBankAccountRecord } = useApi<unknown>(
    API_ENDPOINTS.bankAccountDelete,
    { method: "DELETE", toast: { success: false } },
  );
  // Lazy server dropdowns (fixed.dropdown_details via /dropdown-details/run). One hook
  // per kind so each fetch has an independent abort/loading lifecycle. Errors are not
  // toasted — a failed dropdown fetch should not interrupt the form.
  const { run: runCompanyDropdown } = useApi<unknown>(DROPDOWN_RUN_ENDPOINT, {
    toast: { error: false },
  });
  const { run: runBranchDropdown } = useApi<unknown>(DROPDOWN_RUN_ENDPOINT, {
    toast: { error: false },
  });
  const { run: runAccountGroupDropdown } = useApi<unknown>(DROPDOWN_RUN_ENDPOINT, {
    toast: { error: false },
  });
  const { run: runStateDropdown } = useApi<unknown>(DROPDOWN_RUN_ENDPOINT, {
    toast: { error: false },
  });
  // State for options
  const [companyOptions, setCompanyOptions] = useState<ERPDynamicSelectOption[]>([
    { value: "", label: "" },
  ]);
  const [branchOptions, setBranchOptions] = useState<ERPDynamicSelectOption[]>([
    { value: "", label: "" },
  ]);
  const [accountGroupOptions, setAccountGroupOptions] = useState<ERPDynamicSelectOption[]>([
    { value: "", label: "" },
  ]);
  const [stateNameOptions, setStateNameOptions] = useState<ERPDynamicSelectOption[]>([
    { value: "", label: "" },
  ]);
  const [stateCodeByName, setStateCodeByName] = useState<Record<string, string>>({});
  const [stateNameByCode, setStateNameByCode] = useState<Record<string, string>>({});
  // Per-kind in-flight flag for the lazy dropdowns, keyed by LedgerDropdownKind.
  const [dropdownLoading, setDropdownLoading] = useState<Record<string, boolean>>({});
  // State for table and search
  const [searchTerm, setSearchTerm] = useState("");
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted account ledgers. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  const [currentPage, setCurrentPage] = useState(DEFAULT_PAGE);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalEntries, setTotalEntries] = useState(0);
  const [selectedRowId, setSelectedRowId] = useState<string | number | null>(null);
  const [recordHistoryModal, setRecordHistoryModal] = useState<{
    displayName: string | null;
    recordPk: string;
    screenName: string;
  } | null>(null);
  const router = useRouter();
  // State for grid details
  const [accountLedgerGridId, setAccountLedgerGridId] =
    useState<number | null>(ACCOUNT_LEDGER_GRID_ID);
  const [accountLedgerGridName, setAccountLedgerGridName] = useState<string | null>(null);
  // State for modal form
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [formValues, setFormValues] = useState<LedgerFormValues>(
    createInitialLedgerFormValues,
    );
  const [editingItemId, setEditingItemId] = useState<string | number | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [gstLookupError, setGstLookupError] = useState<string | null>(null);
  const [validationFieldName, setValidationFieldName] = useState<LedgerFormFieldName | null>(null);
  // Nested bank accounts edited alongside the ledger. `removedBankAccountIds` tracks
  // saved rows the user deleted so they can be soft-deleted on submit.
  const [bankAccounts, setBankAccounts] = useState<LedgerBankAccountFormRow[]>([]);
  const [removedBankAccountIds, setRemovedBankAccountIds] = useState<string[]>([]);
  const [bankAccountError, setBankAccountError] = useState<{
    rowKey: string;
    field: LedgerBankAccountFieldName;
  } | null>(null);
  // State for search fields
  const [openSearchField, setOpenSearchField] = useState<string | null>(null);
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [searchActiveOptionIndex, setSearchActiveOptionIndex] = useState<Record<string, number>>({});
  // State for form sections
  const [activeSectionKey, setActiveSectionKey] = useState("general");
  // State for delete
  const [pendingDeleteRow, setPendingDeleteRow] = useState<LedgerTableRow | null>(null);
  const [gridSettingsContextMenuPosition, setGridSettingsContextMenuPosition] =
    useState<ContextMenuPosition | null>(null);
  const [gridSettingsMode, setGridSettingsMode] = useState<"filter" | "visibility" | null>(null);
  const [gridSettingsSelections, setGridSettingsSelections] = useState<Record<string, boolean>>({});
  const [gridSettingsSaving, setGridSettingsSaving] = useState(false);
  const pendingColumnWidthsRef = useRef<Record<string, GridColumnWidthUpdate>>({});
  // Refs
  const searchInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const formRef = useRef<HTMLFormElement | null>(null);
  const sectionTabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const gstLookupCacheRef = useRef<Record<string, Partial<LedgerFormValues>>>({});
  const gstLookupRequestIdRef = useRef(0);
  // Grid columns query. Seed from the known grid id so headers load immediately,
  // independent of the grid-details resolution; refines to the resolved id when ready.
  const selectedGridId = accountLedgerGridId ?? ACCOUNT_LEDGER_GRID_ID;
  const {
    data: gridColumnsData,
    error: gridColumnsQueryError,
    isFetching: gridColumnsLoading,
    refetch: refetchGridColumns,
  } = useGetGridColumnsQuery({ gridId: selectedGridId });
  const gridColumns = gridColumnsData ?? [];
  const gridColumnsError = getApiErrorMessage(gridColumnsQueryError);
  const gridSettingsColumns = useMemo(
    () =>
      gridColumns
        .filter((column) => Boolean(column.serialId))
        .sort((left, right) => left.order - right.order),
    [gridColumns],
  );
  const gridSettingsTitle =
    gridSettingsMode === "visibility" ? "Grid Visible Columns" : "Grid Search Columns";
  const gridSettingsCloseLabel =
    gridSettingsMode === "visibility"
      ? "Close grid visible columns"
      : "Close grid search columns";
  // Load grid details
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const payload = await getGridDetails(GRID_DETAILS_QUERY);
        if (!mounted) return;
        const resolvedGrid = resolveAccountLedgerGridDetails(payload);
        setAccountLedgerGridId(resolvedGrid.gridId ?? ACCOUNT_LEDGER_GRID_ID);
        setAccountLedgerGridName(resolvedGrid.gridName);
      } catch {
        if (mounted) {
          // Keep the known grid id so the table/columns still load; only the name is unknown.
          setAccountLedgerGridName(null);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getGridDetails]);
  const effectiveTitle = useMemo(() => {
    const normalized = accountLedgerGridName?.trim();
    return normalized || "Account Ledger";
  }, [accountLedgerGridName]);
  // Handle search field interactions
  useEffect(() => {
    if (openSearchField === null) return;
    const activeField = openSearchField;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-ledger-search-select-root="true"]')) return;
      setOpenSearchField(null);
      setSearchActiveOptionIndex((current) => {
        if (!(activeField in current)) return current;
        const nextState = { ...current };
        delete nextState[activeField];
        return nextState;
      });
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpenSearchField(null);
        setSearchActiveOptionIndex((current) => {
          if (!(activeField in current)) return current;
          const nextState = { ...current };
          delete nextState[activeField];
          return nextState;
        });
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [openSearchField]);
  // Focus search input
  useEffect(() => {
    if (!openSearchField) return;
    const input = searchInputRefs.current[openSearchField];
    if (!input) return;
    window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }, [openSearchField]);
  // Lazily fetch a dropdown's options from /dropdown-details/run for the given field and
  // (server-side) search term. Called when the field is opened and on debounced typing —
  // nothing is loaded up front. A superseded request returns undefined (aborted) and is
  // skipped so it never wipes the options the latest request set.
  const fetchLedgerDropdown = useCallback(
    async (fieldName: string, search: string) => {
      const config = LEDGER_DROPDOWN_FIELD_CONFIG[fieldName];
      if (!config) return;
      const query = buildDropdownRunQuery(config.dropdownId, search);
      setDropdownLoading((current) => ({ ...current, [config.kind]: true }));
      try {
        switch (config.kind) {
          case "company": {
            const payload = await runCompanyDropdown({ query });
            if (payload === undefined) return;
            setCompanyOptions(buildDropdownOptions(payload, config.idKeys, config.labelKeys));
            break;
          }
          case "branch": {
            const payload = await runBranchDropdown({ query });
            if (payload === undefined) return;
            setBranchOptions(buildDropdownOptions(payload, config.idKeys, config.labelKeys));
            break;
          }
          case "accountGroup": {
            const payload = await runAccountGroupDropdown({ query });
            if (payload === undefined) return;
            setAccountGroupOptions(
              buildDropdownOptions(payload, config.idKeys, config.labelKeys),
            );
            break;
          }
          case "state": {
            const payload = await runStateDropdown({ query });
            if (payload === undefined) return;
            setStateNameOptions(buildStateNameOptions(payload));
            // Merge so a previously seeded selected state's code mapping survives.
            setStateCodeByName((prev) => ({ ...prev, ...buildStateCodeByName(payload) }));
            setStateNameByCode((prev) => ({ ...prev, ...buildStateNameByCode(payload) }));
            break;
          }
        }
      } catch {
        // Keep whatever options are currently shown (e.g. the seeded selected value).
      } finally {
        setDropdownLoading((current) => ({ ...current, [config.kind]: false }));
      }
    },
    [runAccountGroupDropdown, runBranchDropdown, runCompanyDropdown, runStateDropdown],
  );
  // Fetch on open (immediate) and on typed search (debounced). Only the currently open
  // lazy dropdown is fetched, so "open = one API call" with no up-front loading.
  useEffect(() => {
    const fieldName = openSearchField;
    if (!fieldName || !LEDGER_DROPDOWN_FIELD_NAMES.has(fieldName)) {
      return;
    }
    const query = searchQueries[fieldName] ?? "";
    const delay = query.trim() ? DEBOUNCE_MS : 0;
    const handle = window.setTimeout(() => {
      void fetchLedgerDropdown(fieldName, query);
    }, delay);
    return () => {
      window.clearTimeout(handle);
    };
  }, [openSearchField, searchQueries, fetchLedgerDropdown]);
  // Reset the lazy dropdowns to just the blank option (e.g. when opening the create modal
  // or before a record loads) so no stale list from a previous record/search lingers.
  const resetLedgerDropdownOptions = useCallback(() => {
    setCompanyOptions([{ value: "", label: "" }]);
    setBranchOptions([{ value: "", label: "" }]);
    setAccountGroupOptions([{ value: "", label: "" }]);
    setStateNameOptions([{ value: "", label: "" }]);
    setStateCodeByName({});
    setStateNameByCode({});
    setDropdownLoading({});
  }, []);
  // Seed each lazy dropdown with just its currently-selected option so the trigger shows
  // the saved name on edit/view before the user opens (and lazily loads) the full list.
  const seedLedgerDropdownOptions = useCallback(
    (detailSource: Record<string, unknown>, values: LedgerFormValues) => {
      const blank: ERPDynamicSelectOption = { value: "", label: "" };
      const seedOne = (id: string, name: string): ERPDynamicSelectOption[] =>
        id ? [blank, { value: id, label: name || id }] : [blank];
      const companyName = toDisplayValue(
        getFirstDefinedValue(detailSource, LEDGER_COMPANY_NAME_KEYS),
      );
      const branchName = toDisplayValue(
        getFirstDefinedValue(detailSource, LEDGER_BRANCH_NAME_KEYS),
      );
      const groupName = toDisplayValue(
        getFirstDefinedValue(detailSource, LEDGER_GROUP_NAME_KEYS),
      );
      setCompanyOptions(seedOne(values.ledCompanyId, companyName));
      setBranchOptions(seedOne(values.ledBranchId, branchName));
      setAccountGroupOptions(seedOne(values.ledGroupId, groupName));
      // State name + region state name both store the state name as their value and share
      // stateNameOptions, so seed both selected names.
      const stateSeed: ERPDynamicSelectOption[] = [blank];
      if (values.ledStateName) {
        stateSeed.push({ value: values.ledStateName, label: values.ledStateName });
      }
      if (values.ledRegionStateName && values.ledRegionStateName !== values.ledStateName) {
        stateSeed.push({ value: values.ledRegionStateName, label: values.ledRegionStateName });
      }
      setStateNameOptions(stateSeed);
      setStateCodeByName(
        values.ledStateName && values.ledStateCode
          ? { [values.ledStateName]: values.ledStateCode }
          : {},
      );
      setStateNameByCode(
        values.ledStateName && values.ledStateCode
          ? { [values.ledStateCode]: values.ledStateName }
          : {},
      );
    },
    [],
  );
  // Load form fields
  const ledgerFormFields = useMemo(
    () =>
      buildLedgerFormFields(companyOptions, branchOptions, accountGroupOptions, stateNameOptions),
    [accountGroupOptions, branchOptions, companyOptions, stateNameOptions],
  );
  const ledgerFormSections = useMemo(
    () => [
      ...toLedgerFormSections(ledgerFormFields),
      { key: BANK_ACCOUNTS_SECTION_KEY, title: "Bank Accounts", fields: [] },
    ],
    [ledgerFormFields],
  );
  const activeLedgerSection =
    ledgerFormSections.find((section) => section.key === activeSectionKey) ??
    ledgerFormSections[0] ??
    null;
  // Field names whose lazy dropdown is currently fetching (derived from the per-kind flag),
  // so the searchable select can show a Loading state.
  const loadingDropdownFieldNames = useMemo(() => {
    const names = new Set<string>();
    for (const fieldName of LEDGER_DROPDOWN_FIELD_NAMES) {
      if (dropdownLoading[LEDGER_DROPDOWN_FIELD_CONFIG[fieldName].kind]) {
        names.add(fieldName);
      }
    }
    return names;
  }, [dropdownLoading]);
  // Validate active section
  useEffect(() => {
    if (ledgerFormSections.length === 0) return;
    if (ledgerFormSections.some((section) => section.key === activeSectionKey)) return;
    setActiveSectionKey(ledgerFormSections[0]?.key ?? "general");
  }, [activeSectionKey, ledgerFormSections]);
  // Load records
  const loadRecords = useCallback(
    async (term: string, page: number, limit: number) => {
      const normalizedTerm = term.trim();
      const query: Record<string, string> = {
        page: String(Math.max(1, page)),
        limit: String(Math.max(1, limit)),
        // The server JSON-parses this and binds each key into the matching named
        // token in grid 26's stored SQL; keys with no matching token are ignored.
        grid_param: JSON.stringify({ wantdelete: wantDelete }),
      };
      if (normalizedTerm) {
        query.search = normalizedTerm;
      }
      const payload = await getAll(query);
      const paginationInfo = extractPaginationInfo(payload);
      const rows = extractRows(payload, [
        "data",
        "items",
        "results",
        "rows",
        "list",
        "accountLedgers",
        "account_ledgers",
      ]);
      const fallbackTotal = rows.length;
      const resolvedTotal = paginationInfo.totalEntries ?? fallbackTotal;
      setTotalEntries(Math.max(0, resolvedTotal));
      if (paginationInfo.currentPage !== null) {
        const nextPage = paginationInfo.currentPage;
        setCurrentPage((existingPage) =>
          existingPage === nextPage ? existingPage : toSafePageNumber(nextPage),
        );
      }
      if (paginationInfo.pageSize !== null) {
        const nextPageSize = paginationInfo.pageSize;
        setPageSize((existingPageSize) =>
          existingPageSize === nextPageSize ? existingPageSize : toSafePageSize(nextPageSize),
        );
      }
    },
    [getAll, wantDelete],
  );
  // Debounced load records
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadRecords(searchTerm, currentPage, pageSize);
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentPage, loadRecords, pageSize, searchTerm]);
  // Build rows
  const serialOffset = Math.max(0, (currentPage - 1) * pageSize);
  const rows = useMemo(() => {
    const extractedRows = extractRows(data, [
      "data",
      "items",
      "results",
      "rows",
      "list",
      "accountLedgers",
      "account_ledgers",
    ]);
    return buildLedgerRows(data, serialOffset);
  }, [data, serialOffset]);
  // Build columns
  // Headers come solely from /configured-grid-sql/columns (grid_id); no hardcoded defaults.
  const columns = useMemo<ReusableTableColumn<LedgerTableRow>[]>(
    () => buildColumnsFromGridColumns(gridColumns),
    [gridColumns],
  );
  const renderedColumns = columns;
  const renderedRows = rows;
  const renderedTotalEntries = totalEntries;
  // Validate selected row
  useEffect(() => {
    if (selectedRowId === null) return;
    if (!renderedRows.some((row) => row.__rowId === selectedRowId)) {
      setSelectedRowId(null);
    }
  }, [renderedRows, selectedRowId]);
  // Modal handlers
  const openCreateModal = useCallback(() => {
    resetSaveState();
    resetDetailsState();
    setModalError(null);
    setGstLookupError(null);
    setValidationFieldName(null);
    setOpenSearchField(null);
    setSearchQueries({});
    setSearchActiveOptionIndex({});
    gstLookupRequestIdRef.current += 1;
    setActiveSectionKey(ledgerFormSections[0]?.key ?? "general");
    setModalMode("create");
    setEditingItemId(null);
    setFormValues(createInitialLedgerFormValues());
    setBankAccounts([]);
    setRemovedBankAccountIds([]);
    setBankAccountError(null);
    resetLedgerDropdownOptions();
    setIsFormModalOpen(true);
  }, [ledgerFormSections, resetDetailsState, resetLedgerDropdownOptions, resetSaveState]);
  useEffect(() => {
    const handleCreateShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      if (event.key.toLowerCase() !== "c") {
        return;
            }
      event.preventDefault();
      openCreateModal();
    };
    window.addEventListener("keydown", handleCreateShortcut);
    return () => {
      window.removeEventListener("keydown", handleCreateShortcut);
    };
  }, [openCreateModal]);
  const openExistingModal = useCallback(
    async (row: LedgerTableRow, mode: Exclude<ModalMode, "create">) => {
      resetSaveState();
      resetDetailsState();
      setModalError(null);
      setGstLookupError(null);
      setValidationFieldName(null);
      setOpenSearchField(null);
      setSearchQueries({});
      setSearchActiveOptionIndex({});
      gstLookupRequestIdRef.current += 1;
      setActiveSectionKey(ledgerFormSections[0]?.key ?? "general");
      setModalMode(mode);
      setFormValues(createInitialLedgerFormValues());
      setBankAccounts([]);
      setRemovedBankAccountIds([]);
      setBankAccountError(null);
      resetLedgerDropdownOptions();
      setIsFormModalOpen(true);
      setSelectedRowId(row.__rowId);
      const recordId = resolveLedgerRecordId(row);
      setEditingItemId(mode === "update" ? recordId : null);
      try {
        const payload = await getById({
          query: { [REQUEST_PAYLOAD_KEYS.id]: String(recordId) },
        });
        const detailSource = extractDetailSource(payload) ?? row.__source;
        const nextValues = toLedgerFormValues(detailSource);
        setFormValues(nextValues);
        seedLedgerDropdownOptions(detailSource ?? {}, nextValues);
        setBankAccounts(extractLedgerBankAccountRows(detailSource));
        if (mode === "update" && detailSource) {
          const detailId = getFirstDefinedValue(detailSource, ["ledId", "led_id", "id", "_id"]);
          if (typeof detailId === "string" || typeof detailId === "number") {
            setEditingItemId(detailId);
          }
        }
      } catch {
        setModalError("Unable to load selected account ledger details.");
      }
    },
    [
      getById,
      ledgerFormSections,
      resetDetailsState,
      resetLedgerDropdownOptions,
      resetSaveState,
      seedLedgerDropdownOptions,
    ],
  );
  const closeModal = useCallback(() => {
    if (saveLoading) return;
    setIsFormModalOpen(false);
    setModalError(null);
    setGstLookupError(null);
    setEditingItemId(null);
    setValidationFieldName(null);
    setOpenSearchField(null);
    setSearchQueries({});
    setSearchActiveOptionIndex({});
    gstLookupRequestIdRef.current += 1;
    setActiveSectionKey("general");
    setBankAccounts([]);
    setRemovedBankAccountIds([]);
    setBankAccountError(null);
  }, [saveLoading]);
  useEffect(() => {
    if (!isFormModalOpen) return;
    const handleModalShortcuts = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }
      if (
        modalMode === "view" ||
        saveLoading ||
        detailsLoading ||
        event.key !== "Enter" ||
        event.altKey ||
        event.shiftKey ||
        (!event.ctrlKey && !event.metaKey)
      ) {
        return;
      }
      const formElement = formRef.current;
      if (!formElement) return;
      event.preventDefault();
      formElement.requestSubmit();
    };
    window.addEventListener("keydown", handleModalShortcuts);
    return () => window.removeEventListener("keydown", handleModalShortcuts);
  }, [closeModal, detailsLoading, isFormModalOpen, modalMode, saveLoading]);
  // Form field handlers
  const runLedgerGstinLookup = useCallback(
    (value: string) => {
      const normalizedGstin = value.trim().toUpperCase();
      const requestId = gstLookupRequestIdRef.current + 1;
      gstLookupRequestIdRef.current = requestId;

      if (!GST_LOOKUP_PATTERN.test(normalizedGstin)) {
        setGstLookupError(null);
        return;
      }

      const applyLookupValues = (values: Partial<LedgerFormValues>) => {
        setFormValues((current) => {
          if ((current.ledGstinNo ?? "").trim().toUpperCase() !== normalizedGstin) {
            return current;
          }
          return {
            ...current,
            ...values,
          };
        });
        setGstLookupError(null);
        setValidationFieldName((current) =>
          current === "ledGstinNo" ? null : current,
        );
      };

      const cachedValues = gstLookupCacheRef.current[normalizedGstin];
      if (cachedValues) {
        applyLookupValues(cachedValues);
        return;
      }

      void (async () => {
        try {
          const response = await fetch(
            `${GST_LOOKUP_ENDPOINT}?gstin=${encodeURIComponent(normalizedGstin)}`,
            {
              method: "GET",
              cache: "no-store",
              headers: {
                Accept: "application/json",
              },
            },
          );
          const payload = (await response.json().catch(() => null)) as unknown;
          if (gstLookupRequestIdRef.current !== requestId) {
            return;
          }
          if (!response.ok) {
            setGstLookupError(
              getLookupErrorMessage(
                payload,
                "Unable to load GST details for this GSTIN.",
              ),
            );
            setValidationFieldName("ledGstinNo");
            return;
          }
          const lookupSource = extractGstLookupSource(payload);
          if (!lookupSource) {
            setGstLookupError("GST details were not available for this GSTIN.");
            setValidationFieldName("ledGstinNo");
            return;
          }
          const resolvedValues = buildLedgerGstLookupValues(
            normalizedGstin,
            lookupSource,
            stateNameByCode,
          );
          gstLookupCacheRef.current[normalizedGstin] = resolvedValues;
          applyLookupValues(resolvedValues);
        } catch {
          if (gstLookupRequestIdRef.current !== requestId) {
            return;
          }
          setGstLookupError(
            "Unable to load GST details right now. Please try again.",
          );
          setValidationFieldName("ledGstinNo");
        }
      })();
    },
    [stateNameByCode],
  );

  const handleFieldChange = useCallback(
    (fieldName: LedgerFormFieldName, value: string) => {
      const nextValue =
        fieldName === "ledGstinNo" ? value.trim().toUpperCase() : value;
      setFormValues((current) => ({ ...current, [fieldName]: nextValue }));
      setValidationFieldName((current) => (current === fieldName ? null : current));
      if (fieldName === "ledGstinNo") {
        runLedgerGstinLookup(nextValue);
      }
    },
    [runLedgerGstinLookup],
  );
  const handleCheckboxKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (event.currentTarget.disabled) return;
    event.currentTarget.click();
  }, []);
  // ----- Bank account handlers -----
  const handleBankAccountAdd = useCallback(() => {
    setBankAccounts((rows) => [...rows, createEmptyBankAccountRow()]);
  }, []);
  const handleBankAccountChange = useCallback(
    (rowKey: string, patch: Partial<LedgerBankAccountFormRow>) => {
      setBankAccounts((rows) =>
        rows.map((row) => (row.rowKey === rowKey ? { ...row, ...patch } : row)),
      );
      setBankAccountError((current) => (current?.rowKey === rowKey ? null : current));
    },
    [],
  );
  const handleBankAccountRemove = useCallback((rowKey: string) => {
    setBankAccounts((rows) => {
      const target = rows.find((row) => row.rowKey === rowKey);
      if (target?.lbaId) {
        const removedId = target.lbaId;
        setRemovedBankAccountIds((ids) =>
          ids.includes(removedId) ? ids : [...ids, removedId],
        );
      }
      return rows.filter((row) => row.rowKey !== rowKey);
    });
    setBankAccountError((current) => (current?.rowKey === rowKey ? null : current));
  }, []);
  const handleBankAccountSetDefault = useCallback((rowKey: string) => {
    setBankAccounts((rows) =>
      rows.map((row) => ({ ...row, lbaIsDefault: row.rowKey === rowKey })),
    );
  }, []);
  const clearSearchableFieldActiveIndex = useCallback((fieldName: LedgerFormFieldName) => {
    setSearchActiveOptionIndex((current) => {
      if (!(fieldName in current)) {
        return current;
      }
      const nextState = { ...current };
      delete nextState[fieldName];
      return nextState;
    });
  }, []);
  const handleSearchableFieldInput = useCallback(
    (fieldName: LedgerFormFieldName, query: string) => {
      setOpenSearchField(fieldName);
      setSearchQueries((current) => ({
        ...current,
        [fieldName]: query,
      }));
      clearSearchableFieldActiveIndex(fieldName);
    },
    [clearSearchableFieldActiveIndex],
  );
  const handleSearchableFieldPointerToggle = useCallback(
    (fieldName: LedgerFormFieldName) => {
      setOpenSearchField((current) => (current === fieldName ? null : fieldName));
      clearSearchableFieldActiveIndex(fieldName);
    },
    [clearSearchableFieldActiveIndex],
  );
  const handleSearchableFieldClear = useCallback(
    (fieldName: LedgerFormFieldName) => {
      setFormValues((current) => {
        if (fieldName === "ledStateName") {
          return {
            ...current,
            ledStateName: "",
            ledStateCode: "",
          };
        }
        return {
          ...current,
          [fieldName]: "",
        };
      });
      setSearchQueries((current) => {
        if (!(fieldName in current)) {
          return current;
        }
        const nextState = { ...current };
        delete nextState[fieldName];
        return nextState;
      });
      setOpenSearchField(null);
      clearSearchableFieldActiveIndex(fieldName);
      setValidationFieldName((current) => (current === fieldName ? null : current));
    },
    [clearSearchableFieldActiveIndex],
  );
  const handleSearchableOptionSelect = useCallback(
    (fieldName: LedgerFormFieldName, option: ERPDynamicSelectOption) => {
      if (fieldName === "ledStateName") {
        const nextStateName = option.value;
        const nextStateCode = nextStateName ? stateCodeByName[nextStateName] ?? "" : "";
        setFormValues((current) => ({
          ...current,
          ledStateName: nextStateName,
          ledStateCode: nextStateCode,
        }));
      } else {
        handleFieldChange(fieldName, option.value);
      }
      setSearchQueries((current) => {
        if (!(fieldName in current)) {
          return current;
        }
        const nextState = { ...current };
        delete nextState[fieldName];
        return nextState;
      });
      setOpenSearchField(null);
      clearSearchableFieldActiveIndex(fieldName);
    },
    [clearSearchableFieldActiveIndex, handleFieldChange, stateCodeByName],
  );
  const handleSearchableFieldKeyDown = useCallback(
    (
      fieldName: LedgerFormFieldName,
      event: ReactKeyboardEvent<HTMLElement>,
      filteredOptions: ERPDynamicSelectOption[],
      fieldValue: string,
    ) => {
      const isSearchOpen = openSearchField === fieldName;
      const optionCount = filteredOptions.length;
      const currentIndex = searchActiveOptionIndex[fieldName] ?? -1;
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Home" ||
        event.key === "End"
      ) {
        event.preventDefault();
        if (!isSearchOpen) {
          setOpenSearchField(fieldName);
        }
        if (optionCount === 0) {
          clearSearchableFieldActiveIndex(fieldName);
          return;
        }
        const selectedIndex = filteredOptions.findIndex(
          (option) => option.value === fieldValue,
        );
        const baseIndex = currentIndex >= 0 && currentIndex < optionCount ? currentIndex : selectedIndex;
        let nextIndex = baseIndex;
        if (event.key === "ArrowDown") nextIndex = baseIndex + 1;
        else if (event.key === "ArrowUp") nextIndex = baseIndex - 1;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = optionCount - 1;
        if (nextIndex < 0) nextIndex = optionCount - 1;
        else if (nextIndex >= optionCount) nextIndex = 0;
        setSearchActiveOptionIndex((current) => ({ ...current, [fieldName]: nextIndex }));
        return;
      }
      if (event.key === "Enter") {
        if (!isSearchOpen) {
          event.preventDefault();
          setOpenSearchField(fieldName);
          return;
        }
        event.preventDefault();
        if (optionCount === 0) return;

        const selectedIndex = filteredOptions.findIndex(
          (option) => option.value === fieldValue,
        );
        const resolvedIndex =
          currentIndex >= 0 && currentIndex < optionCount
            ? currentIndex
            : selectedIndex >= 0
              ? selectedIndex
              : 0;
        const nextOption = filteredOptions[resolvedIndex];
        if (nextOption) {
          handleSearchableOptionSelect(fieldName, nextOption);
        }
        return;
      }
      if (event.key === " " && !isSearchOpen) {
        event.preventDefault();
        setOpenSearchField(fieldName);
        return;
      }
      if (event.key === "Escape" && isSearchOpen) {
        event.preventDefault();
        setOpenSearchField(null);
        clearSearchableFieldActiveIndex(fieldName);
        return;
      }
      if (event.key === "Tab" && isSearchOpen) {
        clearSearchableFieldActiveIndex(fieldName);
      }
    },
    [
      clearSearchableFieldActiveIndex,
      handleSearchableOptionSelect,
      openSearchField,
      searchActiveOptionIndex,
    ],
  );

  const handleSectionTabKeyDown = useCallback(
    (
      event: ReactKeyboardEvent<HTMLButtonElement>,
      sectionIndex: number,
      sectionKey: string,
    ) => {
      if (ledgerFormSections.length === 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (activeSectionKey !== sectionKey) {
          setActiveSectionKey(sectionKey);
        }
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            const formElement = formRef.current;
            if (!formElement) return;
            const firstFieldTarget = getFirstLedgerFocusableFieldTarget(formElement);
            if (!firstFieldTarget) return;
            focusLedgerFieldControl(firstFieldTarget.control);
          });
        });
        return;
      }
      let nextIndex = sectionIndex;
      if (event.key === "ArrowRight") {
        nextIndex = (sectionIndex + 1) % ledgerFormSections.length;
      } else if (event.key === "ArrowLeft") {
        nextIndex =
          (sectionIndex - 1 + ledgerFormSections.length) % ledgerFormSections.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = ledgerFormSections.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      const nextSection = ledgerFormSections[nextIndex];
      if (!nextSection) return;
      setActiveSectionKey(nextSection.key);
      window.requestAnimationFrame(() => {
        sectionTabRefs.current[nextSection.key]?.focus();
      });
    },
    [activeSectionKey, ledgerFormSections],
  );
  const handleLedgerFieldArrowNavigation = useCallback(
    (event: ReactKeyboardEvent<HTMLFormElement>) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const direction =
        event.key === "ArrowLeft"
          ? "left"
          : event.key === "ArrowRight"
            ? "right"
            : event.key === "ArrowUp"
              ? "up"
              : event.key === "ArrowDown"
                ? "down"
                : null;
      if (!direction) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (
        target.closest('[data-ledger-modal-search-dropdown="true"]') ||
        target.getAttribute("role") === "searchbox"
      ) {
        return;
      }
      const currentContainer = target.closest<HTMLElement>(
        "[data-ledger-modal-field-name]",
      );
      if (!currentContainer) return;
      const formElement = formRef.current;
      if (!formElement) return;
      const currentFieldName = currentContainer.dataset.ledgerModalFieldName;
      const targets = getLedgerFocusableFieldTargets(formElement);
      const currentFieldTarget = currentFieldName
        ? targets.find((entry) => entry.fieldName === currentFieldName)
        : undefined;
      if (!currentFieldTarget) return;
      const nextTarget = findNextLedgerFieldTarget(
        targets,
        currentFieldTarget,
        direction,
      );
      if (!nextTarget) {
        if (direction === "up" && activeSectionKey) {
          const activeTab = sectionTabRefs.current[activeSectionKey];
          if (activeTab) {
            event.preventDefault();
            activeTab.focus();
          }
        }
        return;
      }
      event.preventDefault();
      focusLedgerFieldControl(nextTarget.control);
    },
    [activeSectionKey],
  );
  const handleModalSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (modalMode === "view") {
        closeModal();
        return;
      }
      const validationError = getLedgerValidationError(formValues);
      if (validationError) {
        setModalError(null);
        setValidationFieldName(validationError.fieldName);
        window.requestAnimationFrame(() => {
          const invalidField = document.getElementById(validationError.fieldName);
          if (!(invalidField instanceof HTMLElement)) return;
          invalidField.focus();
          invalidField.scrollIntoView({ block: "nearest", inline: "nearest" });
        });
        return;
      }
      const bankAccountValidationError = getBankAccountValidationError(bankAccounts);
      if (bankAccountValidationError) {
        setModalError(bankAccountValidationError.message);
        setBankAccountError({
          rowKey: bankAccountValidationError.rowKey,
          field: bankAccountValidationError.field,
        });
        setActiveSectionKey(BANK_ACCOUNTS_SECTION_KEY);
        window.requestAnimationFrame(() => {
          const invalidField = document.getElementById(
            `${bankAccountValidationError.rowKey}-${bankAccountValidationError.field}`,
          );
          if (!(invalidField instanceof HTMLElement)) return;
          invalidField.focus();
          invalidField.scrollIntoView({ block: "nearest", inline: "nearest" });
        });
        return;
      }
      setValidationFieldName(null);
      setBankAccountError(null);
      const shouldUpdate = modalMode === "update";
      const payload = buildLedgerRequestPayload(
        formValues,
        shouldUpdate,
        editingItemId,
        bankAccounts,
      );
      const idsToDelete = shouldUpdate ? removedBankAccountIds : [];
      void (async () => {
        try {
          await upsertRecord({ body: payload });
          // The nested upsert is non-destructive, so saved rows removed in the modal
          // must be soft-deleted explicitly. Failures here are non-fatal to the save.
          if (idsToDelete.length > 0) {
            await Promise.all(
              idsToDelete.map((lbaId) =>
                deleteBankAccountRecord({ query: { lbaId } }).catch(() => null),
              ),
            );
          }
          setIsFormModalOpen(false);
          setModalError(null);
          setEditingItemId(null);
          setBankAccounts([]);
          setRemovedBankAccountIds([]);
          setBankAccountError(null);
          await loadRecords(searchTerm, currentPage, pageSize);
        } catch {
          setModalError("Unable to save account ledger.");
        }
      })();
    },
    [
      bankAccounts,
      closeModal,
      currentPage,
      deleteBankAccountRecord,
      editingItemId,
      formValues,
      loadRecords,
      modalMode,
      pageSize,
      removedBankAccountIds,
      searchTerm,
      upsertRecord,
    ],
  );
  const handleDeleteRow = useCallback(
    (row: LedgerTableRow) => {
      if (deleteLoading || saveLoading || detailsLoading) return;
      setPendingDeleteRow(row);
    },
    [deleteLoading, detailsLoading, saveLoading],
  );
  const handleRowLogs = useCallback(
    (row: LedgerTableRow) => {
      const recordPk = `${row.__recordId}`.trim();
      if (!recordPk) {
        return;
      }
      setRecordHistoryModal({
        screenName: "Account Ledger Master",
        recordPk,
        displayName: row.ledgerName || row.ledgerCode || row.ledgerId,
      });
    },
    [],
  );
  const handleDeleteCancel = useCallback(() => {
    if (deleteLoading) return;
    setPendingDeleteRow(null);
  }, [deleteLoading]);
  const handleDeleteConfirm = useCallback(() => {
    if (!pendingDeleteRow || deleteLoading || saveLoading || detailsLoading) return;
    void (async () => {
      try {
        const row = pendingDeleteRow;
        const deleteId = resolveLedgerRecordId(row);
        await deleteRecord({
          query: { [REQUEST_PAYLOAD_KEYS.id]: String(deleteId) },
        });
        setPendingDeleteRow(null);
        setSelectedRowId((current) => (current === row.__rowId ? null : current));
        if (editingItemId === deleteId) {
          setEditingItemId(null);
          setIsFormModalOpen(false);
        }
        await loadRecords(searchTerm, currentPage, pageSize);
      } catch {
        // Error UI is driven by deleteError.
      }
    })();
  }, [
    currentPage,
    deleteLoading,
    deleteRecord,
    detailsLoading,
    editingItemId,
    loadRecords,
    pageSize,
    pendingDeleteRow,
    saveLoading,
    searchTerm,
  ]);
  const handleSearchChange = useCallback((query: string) => {
    setCurrentPage(DEFAULT_PAGE);
    setSearchTerm(query);
  }, []);
  const handleWantDeleteChange = useCallback((checked: boolean) => {
    setCurrentPage(DEFAULT_PAGE);
    setWantDelete(checked);
  }, []);
  const handlePageSizeChange = useCallback((nextPageSize: number) => {
    setCurrentPage(DEFAULT_PAGE);
    setPageSize(nextPageSize);
  }, []);
  const listHeading = `${effectiveTitle} List`;
  const handleDownloadRows = useCallback(() => {
    downloadLedgerCsv(listHeading, renderedColumns, renderedRows);
  }, [listHeading, renderedColumns, renderedRows]);
  const selectedRow = useMemo(
    () => renderedRows.find((row) => row.__rowId === selectedRowId) ?? null,
    [renderedRows, selectedRowId],
  );
  const handleRefresh = useCallback(() => {
    void loadRecords(searchTerm, currentPage, pageSize);
  }, [loadRecords, searchTerm, currentPage, pageSize]);
  const handleToolbarEdit = useCallback(() => {
    if (selectedRow) {
      void openExistingModal(selectedRow, "update");
    }
  }, [openExistingModal, selectedRow]);
  const handleToolbarDelete = useCallback(() => {
    if (selectedRow) {
      handleDeleteRow(selectedRow);
    }
  }, [handleDeleteRow, selectedRow]);
  const handleToolbarLogs = useCallback(() => {
    if (selectedRow) {
      handleRowLogs(selectedRow);
    }
  }, [handleRowLogs, selectedRow]);
  const isToolbarLogsDisabled =
    !selectedRow || `${selectedRow.__recordId}`.trim().length === 0;
  const handleGridColumnResizeEnd = useCallback(
    (payload: ReusableTableColumnResizeEndPayload<LedgerTableRow>) => {
      if (payload.tableWidthPx <= 0) {
        return;
      }
      const gridColumn = resolveGridColumnForLedgerTableColumn(payload.column, gridColumns);
      if (!gridColumn?.serialId) {
        return;
      }
      const widthPercent = Number(((payload.widthPx * 100) / payload.tableWidthPx).toFixed(4));
      if (!Number.isFinite(widthPercent) || widthPercent <= 0) {
        return;
      }
      pendingColumnWidthsRef.current = {
        ...pendingColumnWidthsRef.current,
        [gridColumn.serialId]: {
          grid_column_id: gridColumn.serialId,
          grid_column_width: widthPercent,
        },
      };
    },
    [gridColumns],
  );
  const saveColumnWidths = useCallback(async () => {
    const columns = Object.values(pendingColumnWidthsRef.current);
    if (columns.length === 0) {
      return;
    }
    try {
      await saveColumnWidthsApi({ body: { columns } });
      pendingColumnWidthsRef.current = {};
      void refetchGridColumns();
    } catch {
      // useApi handles the visible error toast.
    }
  }, [refetchGridColumns, saveColumnWidthsApi]);
  const handleGridColumnReorder = useCallback(
    (nextColumns: ReusableTableColumn<LedgerTableRow>[]) => {
      if (accountLedgerGridId === null || gridSettingsColumns.length === 0) {
        return;
      }
      // Map the dragged table columns back to their grid columns, in new order.
      const nextVisibleGridColumns: GridColumnConfig[] = [];
      const seenSerialIds = new Set<string>();
      for (const tableColumn of nextColumns) {
        const gridColumn = resolveGridColumnForLedgerTableColumn(tableColumn, gridColumns);
        if (!gridColumn?.serialId || seenSerialIds.has(gridColumn.serialId)) {
          continue;
        }
        seenSerialIds.add(gridColumn.serialId);
        nextVisibleGridColumns.push(gridColumn);
      }
      if (nextVisibleGridColumns.length === 0) {
        return;
      }
      // Slot the reordered (visible) columns back into the full grid order,
      // leaving any hidden columns in their existing positions.
      const visibleSerialIds = new Set(nextVisibleGridColumns.map((column) => column.serialId));
      const visibleQueue = [...nextVisibleGridColumns];
      const nextGridColumnOrder: GridColumnConfig[] = [];
      for (const gridColumn of gridSettingsColumns) {
        if (!gridColumn.serialId) {
          continue;
        }
        if (visibleSerialIds.has(gridColumn.serialId)) {
          const nextVisibleColumn = visibleQueue.shift();
          if (nextVisibleColumn) {
            nextGridColumnOrder.push(nextVisibleColumn);
          }
          continue;
        }
        nextGridColumnOrder.push(gridColumn);
      }
      nextGridColumnOrder.push(...visibleQueue);
      void (async () => {
        try {
          const saves: Array<Promise<unknown>> = [];
          nextGridColumnOrder.forEach((gridColumn, index) => {
            const basePayload = buildLedgerGridColumnBasePayload(gridColumn, accountLedgerGridId);
            if (!basePayload) {
              return;
            }
            saves.push(
              saveGridColumnWidth({
                body: { ...basePayload, grid_column_position: index + 1 },
              }),
            );
          });
          if (saves.length === 0) {
            return;
          }
          await Promise.all(saves);
          void refetchGridColumns();
          await loadRecords(searchTerm, currentPage, pageSize);
        } catch {
          // useApi handles the visible error toast.
        }
      })();
    },
    [
      accountLedgerGridId,
      currentPage,
      gridColumns,
      gridSettingsColumns,
      loadRecords,
      pageSize,
      refetchGridColumns,
      saveGridColumnWidth,
      searchTerm,
    ],
  );
  const openGridSettingsModal = useCallback(
    (mode: "filter" | "visibility") => {
      const nextSelections: Record<string, boolean> = {};
      for (const column of gridSettingsColumns) {
        if (!column.serialId) {
          continue;
        }
        nextSelections[column.serialId] =
          mode === "visibility" ? column.visible !== false : column.sortable !== false;
      }
      setGridSettingsSelections(nextSelections);
      setGridSettingsMode(mode);
    },
    [gridSettingsColumns],
  );
  const openGridSettingsModalFromContextMenu = useCallback(
    (mode: "filter" | "visibility") => {
      setGridSettingsContextMenuPosition(null);
      openGridSettingsModal(mode);
    },
    [openGridSettingsModal],
  );
  const openGridSettingsContextMenu = useCallback(
    (event: Pick<ReactMouseEvent, "clientX" | "clientY" | "preventDefault" | "stopPropagation">) => {
      if (gridSettingsColumns.length === 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setGridSettingsContextMenuPosition({
        left: clampContextMenuPosition(
          event.clientX,
          GRID_SETTINGS_CONTEXT_MENU_PADDING,
          window.innerWidth - GRID_SETTINGS_CONTEXT_MENU_WIDTH,
        ),
        top: clampContextMenuPosition(
          event.clientY,
          GRID_SETTINGS_CONTEXT_MENU_PADDING,
          window.innerHeight - GRID_SETTINGS_CONTEXT_MENU_HEIGHT,
        ),
      });
    },
    [gridSettingsColumns.length],
  );
  // Right-click on a data row.
  const handleTableBodyContextMenu = useCallback(
    ({ event }: ReusableTableBodyContextMenuPayload<LedgerTableRow>) => {
      openGridSettingsContextMenu(event);
    },
    [openGridSettingsContextMenu],
  );
  // Right-click anywhere else in the table region (column header, empty area).
  // Body rows call stopPropagation above, so this never double-fires for them.
  const handleTableWrapperContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      openGridSettingsContextMenu(event);
    },
    [openGridSettingsContextMenu],
  );
  const closeGridSettingsModal = useCallback(() => {
    if (gridSettingsSaving) {
      return;
    }
    setGridSettingsMode(null);
  }, [gridSettingsSaving]);
  const handleGridSettingsSelectionChange = useCallback(
    (serialId: string, checked: boolean) => {
      setGridSettingsSelections((current) => ({
        ...current,
        [serialId]: checked,
      }));
    },
    [],
  );
  useEffect(() => {
    if (gridSettingsContextMenuPosition === null || typeof document === "undefined") {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-master-grid-settings-context-menu="true"]')) {
        return;
      }
      setGridSettingsContextMenuPosition(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setGridSettingsContextMenuPosition(null);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [gridSettingsContextMenuPosition]);
  useEffect(() => {
    if (gridSettingsContextMenuPosition === null || typeof window === "undefined") {
      return;
    }
    const closeContextMenu = () => setGridSettingsContextMenuPosition(null);
    window.addEventListener("resize", closeContextMenu);
    window.addEventListener("scroll", closeContextMenu, true);
    return () => {
      window.removeEventListener("resize", closeContextMenu);
      window.removeEventListener("scroll", closeContextMenu, true);
    };
  }, [gridSettingsContextMenuPosition]);
  const saveGridSettings = useCallback(async () => {
    if (gridSettingsMode === null || gridSettingsColumns.length === 0) {
      return;
    }
    const serialIds = gridSettingsColumns
      .map((column) => column.serialId)
      .filter((serialId): serialId is string => Boolean(serialId));
    if (serialIds.length === 0) {
      return;
    }
    setGridSettingsSaving(true);
    try {
      if (gridSettingsMode === "visibility") {
        const columns: GridColumnVisibilityUpdate[] = serialIds.map((serialId) => ({
          grid_column_id: serialId,
          grid_column_visibility: gridSettingsSelections[serialId] === true,
        }));
        await saveVisibilitySettingsApi({ body: { columns } });
      } else {
        const columns: GridColumnFilterUpdate[] = serialIds.map((serialId) => ({
          grid_column_id: serialId,
          grid_column_filter: gridSettingsSelections[serialId] === true,
        }));
        await saveFilterSettingsApi({ body: { columns } });
      }
      void refetchGridColumns();
      await loadRecords(searchTerm, currentPage, pageSize);
      setGridSettingsMode(null);
    } catch {
      // useApi handles the visible error toast.
    } finally {
      setGridSettingsSaving(false);
    }
  }, [
    currentPage,
    gridSettingsColumns,
    gridSettingsMode,
    gridSettingsSelections,
    loadRecords,
    pageSize,
    refetchGridColumns,
    saveFilterSettingsApi,
    saveVisibilitySettingsApi,
    searchTerm,
  ]);
  useEffect(() => {
    if (gridSettingsMode === null || typeof document === "undefined") {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeGridSettingsModal();
      }
      if (event.key === "F5") {
        event.preventDefault();
        void saveGridSettings();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeGridSettingsModal, gridSettingsMode, saveGridSettings]);
  const gridSettingsContextMenu =
    gridSettingsContextMenuPosition && typeof document !== "undefined"
      ? createPortal(
          <div
            className={`${styles.masterSearchSettingsTooltip} ${styles.masterTableContextTooltip}`}
            data-master-grid-settings-context-menu="true"
            style={gridSettingsContextMenuPosition}
            role="tooltip"
          >
            <button
              type="button"
              className={styles.masterSearchSettingsItem}
              onClick={() => openGridSettingsModalFromContextMenu("filter")}
            >
              grid filter setting
            </button>
            <button
              type="button"
              className={styles.masterSearchSettingsItem}
              onClick={() => openGridSettingsModalFromContextMenu("visibility")}
            >
              column visibility setting
            </button>
            <button
              type="button"
              className={styles.masterSearchSettingsItem}
              onClick={() => { setGridSettingsContextMenuPosition(null); void saveColumnWidths(); }}
            >
              save column width
            </button>
            <button
              type="button"
              className={styles.masterSearchSettingsItem}
              onClick={() => {
                setGridSettingsContextMenuPosition(null);
                if (accountLedgerGridId !== null) {
                  router.push(`/master/grid-designer/${accountLedgerGridId}`);
                }
              }}
            >
              Admin settings
            </button>
          </div>,
          document.body,
        )
      : null;
  const pendingDeleteLabel = useMemo(() => {
    if (!pendingDeleteRow) return "";
    return (
      pendingDeleteRow.ledgerName ||
      pendingDeleteRow.ledgerCode ||
      pendingDeleteRow.ledgerId
    );
  }, [pendingDeleteRow]);
  const isReadOnlyMode = modalMode === "view";
  const effectiveModalError = modalError ?? gstLookupError ?? saveError ?? detailsError;
  const modalTitle =
    modalMode === "create"
      ? `New ${effectiveTitle}`
      : modalMode === "update"
        ? `Edit ${effectiveTitle}`
        : `${effectiveTitle} Details`;
  const modalStyle = {
    "--erp-modal-accent": "#2563eb",
    "--erp-modal-accent-soft-ring": "#2563eb33",
    "--erp-modal-border": "#cfdae6",
    "--erp-modal-surface": "#ffffff",
  } as CSSProperties;
  const modalPanelStyle = {
    width: "min(62vw,62rem)",
    height: "75vh",
    maxHeight: "75vh",
  } as CSSProperties;
  const modalFormId = "account-ledger-master-form";
  // Helper function to extract rows
  function extractRows(payload: unknown, arrayKeys: string[]): unknown[] {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    const objectPayload = payload as Record<string, unknown>;
    for (const key of arrayKeys) {
      const value = objectPayload[key];
      if (Array.isArray(value)) return value;
    }
    return [];
  }
  // Helper function to extract detail source
  function extractDetailSource(payload: unknown): Record<string, unknown> | null {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const objectPayload = payload as Record<string, unknown>;
    const nestedData = objectPayload.data;
    if (nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)) {
      return nestedData as Record<string, unknown>;
    }
    return objectPayload;
  }
  return (
    <>
      {gridSettingsContextMenu}
      <main className={styles.page}>
      <div className={styles.viewport}>
        <div className={styles.board}>
          <section className={styles.content}>
            {/* Page Header */}
            <div className={styles.pageHeader}>
              <div className={styles.pageHeaderText}>
                <h1 className={styles.pageTitle}>{listHeading}</h1>
                <p className={styles.pageSubtitle}>
                  Manage all account ledgers in your organization
                </p>
              </div>
            </div>
            {/* Icon Toolbar */}
            <div className={styles.iconToolbar}>
              <button
                type="button"
                className={`${styles.iconBtn} ${styles.iconBtnAdd}`}
                onClick={openCreateModal}
                disabled={saveLoading || detailsLoading}
                title="Add"
              >
                <span className={styles.iconBtnBox}><FiPlusCircle aria-hidden="true" /></span>
                <span>Add</span>
              </button>
              <button
                type="button"
                className={`${styles.iconBtn} ${styles.iconBtnEdit}`}
                onClick={handleToolbarEdit}
                disabled={!selectedRow || saveLoading || detailsLoading}
                title="Edit selected row"
              >
                <span className={styles.iconBtnBox}><FiEdit2 aria-hidden="true" /></span>
                <span>Edit</span>
              </button>
              <button
                type="button"
                className={`${styles.iconBtn} ${styles.iconBtnDelete}`}
                onClick={handleToolbarDelete}
                disabled={!selectedRow || deleteLoading || saveLoading || detailsLoading}
                title="Delete selected row"
              >
                <span className={styles.iconBtnBox}><FiTrash2 aria-hidden="true" /></span>
                <span>Delete</span>
              </button>
              <button
                type="button"
                className={`${styles.iconBtn} ${styles.iconBtnRefresh}`}
                onClick={handleRefresh}
                disabled={loading}
                title="Refresh"
              >
                <span className={styles.iconBtnBox}><FiRefreshCw aria-hidden="true" /></span>
                <span>Refresh</span>
              </button>
              <button
                type="button"
                className={`${styles.iconBtn} ${styles.iconBtnImport}`}
                title="Import"
                disabled
              >
                <span className={styles.iconBtnBox}><FiUpload aria-hidden="true" /></span>
                <span>Import</span>
              </button>
              <button
                type="button"
                className={`${styles.iconBtn} ${styles.iconBtnExcel}`}
                onClick={handleDownloadRows}
                disabled={renderedRows.length === 0}
                title={`Export ${listHeading} as CSV`}
              >
                <span className={styles.iconBtnBox}><FiDownload aria-hidden="true" /></span>
                <span>Export Excel</span>
              </button>
              <button
                type="button"
                className={`${styles.iconBtn} ${styles.iconBtnPrint}`}
                title="Print"
                disabled
              >
                <span className={styles.iconBtnBox}><FiPrinter aria-hidden="true" /></span>
                <span>Print</span>
              </button>
              <button
                type="button"
                className={`${styles.iconBtn} ${styles.iconBtnHistory}`}
                onClick={handleToolbarLogs}
                disabled={isToolbarLogsDisabled}
                title="View history"
              >
                <span className={styles.iconBtnBox}><FiClock aria-hidden="true" /></span>
                <span>History</span>
              </button>
            </div>
            {error ? (
              <div className={styles.errorBox}>
                <p className={styles.errorText}>
                  Unable to load account ledger data: {error}
                </p>
                <button
                  type="button"
                  className={styles.retryButton}
                  onClick={() => void loadRecords(searchTerm, currentPage, pageSize)}
                >
                  Retry
                </button>
              </div>
            ) : null}
            {deleteError ? (
              <div className={styles.errorBox}>
                <p className={styles.errorText}>
                  Unable to delete selected account ledger: {deleteError}
                </p>
              </div>
            ) : null}
            {gridColumnsError ? (
              <div className={styles.errorBox}>
                <p className={styles.errorText}>
                  Unable to load table headers: {gridColumnsError}. Retry to load the configured columns.
                </p>
                <button
                  type="button"
                  className={styles.retryButton}
                  onClick={() => {
                    if (accountLedgerGridId === null) return;
                    void refetchGridColumns();
                  }}
                  disabled={gridColumnsLoading || accountLedgerGridId === null}
                >
                  {gridColumnsLoading ? "Loading..." : "Retry Headers"}
                </button>
              </div>
            ) : null}
            {/* Filter Card */}
            <div className={styles.filterCard}>
              {searchTerm.trim() ? <span className={styles.filterBadge}>1</span> : null}
              <div className={styles.filterRow}>
                <div className={styles.filterGroup}>
                  <label className={styles.filterLabel} htmlFor="account-ledger-search-input">
                    Search
                  </label>
                  <div className={styles.filterSearchWrap}>
                    <span className={styles.masterSearchIconButton} aria-hidden="true">
                      <FiSearch className={styles.masterSearchIcon} />
                    </span>
                    <input
                      id="account-ledger-search-input"
                      type="text"
                      className={styles.masterSearchInput}
                      value={searchTerm}
                      onChange={(event) => handleSearchChange(event.target.value)}
                      placeholder="Search by account ledger name..."
                      autoComplete="off"
                      aria-label="Search account ledgers"
                    />
                  </div>
                </div>
                <div className={styles.filterCheckGroup}>
                  <label className={styles.filterCheckLabel}>
                    <input
                      type="checkbox"
                      checked={wantDelete}
                      onChange={(event) => handleWantDeleteChange(event.target.checked)}
                    />
                    Show deleted records
                  </label>
                </div>
              </div>
            </div>
            <ReusableTable
              columns={renderedColumns}
              rows={renderedRows}
              onWrapperContextMenu={handleTableWrapperContextMenu}
              rowKey="__rowId"
              wrapperClassName={styles.masterTable}
              tableClassName={styles.masterDataTable}
              tableLayout="fixed"
              minWidth="980px"
              reorderableColumns
              resizableColumns
              onColumnReorder={handleGridColumnReorder}
              onColumnResizeEnd={handleGridColumnResizeEnd}
              onBodyContextMenu={handleTableBodyContextMenu}
              activeRowKey={selectedRowId}
              onRowClick={(row) => setSelectedRowId(row.__rowId)}
              onRowDoubleClick={(row) => void openExistingModal(row, "view")}
              sortable
              paginated
              manualPagination
              totalEntries={renderedTotalEntries}
              currentPage={currentPage}
              onCurrentPageChange={setCurrentPage}
              pageSize={pageSize}
              onPageSizeChange={handlePageSizeChange}
              pageSizeOptions={[10, 20, 25, 50]}
              fullViewHeight={false}
              stickyHeader
              emptyText={
                loading
                  ? "Loading account ledger data..."
                  : "No account ledger data found"
              }
            />
          </section>
        </div>
      </div>
      {gridSettingsMode !== null ? (
        <div
          className={dynamicFormStyles.overlay}
          style={{
            "--erp-modal-accent": "#0f74c9",
            "--erp-modal-accent-soft-ring": "rgba(15, 116, 201, 0.2)",
            "--erp-modal-overlay-z-index": 330,
          } as CSSProperties}
        >
          <div
            className={dynamicFormStyles.backdrop}
            role="presentation"
            onMouseDown={closeGridSettingsModal}
          />
          <form
            className={`${dynamicFormStyles.panel} ${styles.gridSettingsDialog}`}
            aria-label={gridSettingsTitle}
            onSubmit={(event) => {
              event.preventDefault();
              void saveGridSettings();
            }}
          >
            <header className={dynamicFormStyles.header}>
              <div className={dynamicFormStyles.headerRow}>
                <div className={dynamicFormStyles.headerIntro}>
                  <span className={dynamicFormStyles.headerIcon} aria-hidden="true">
                    <FiSearch />
                  </span>
                  <div className={dynamicFormStyles.headerText}>
                    <h2 className={dynamicFormStyles.headerTitle}>
                      {gridSettingsTitle}
                    </h2>
                    <p className={dynamicFormStyles.headerDescription}>
                      Select columns for this grid setting.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className={dynamicFormStyles.closeButton}
                  onClick={closeGridSettingsModal}
                  disabled={gridSettingsSaving}
                  aria-label={gridSettingsCloseLabel}
                >
                  x
                </button>
              </div>
            </header>
            <div className={styles.gridSettingsBody}>
              {gridSettingsColumns.length > 0 ? (
                gridSettingsColumns.map((column) => {
                  const serialId = column.serialId ?? "";
                  return (
                    <label key={serialId} className={styles.gridSettingsRow}>
                      <input
                        type="checkbox"
                        checked={gridSettingsSelections[serialId] === true}
                        disabled={gridSettingsSaving}
                        onChange={(event) =>
                          handleGridSettingsSelectionChange(
                            serialId,
                            event.target.checked,
                          )
                        }
                      />
                      <span>{column.columnName ?? column.header}</span>
                    </label>
                  );
                })
              ) : (
                <p className={styles.gridSettingsEmpty}>
                  No saved grid columns found.
                </p>
              )}
            </div>
            <footer className={dynamicFormStyles.footer}>
              <div className={dynamicFormStyles.footerActions}>
                <button
                  type="submit"
                  className={dynamicFormStyles.submitButton}
                  disabled={
                    gridSettingsSaving ||
                    accountLedgerGridId === null ||
                    gridSettingsColumns.length === 0
                  }
                >
                  <span className={dynamicFormStyles.footerButtonIcon} aria-hidden="true">
                    OK
                  </span>
                  <span>{gridSettingsSaving ? "Saving..." : "Save"}</span>
                </button>
                <button
                  type="button"
                  className={dynamicFormStyles.cancelButton}
                  onClick={closeGridSettingsModal}
                  disabled={gridSettingsSaving}
                >
                  <span className={dynamicFormStyles.footerButtonIcon} aria-hidden="true">
                    x
                  </span>
                  <span>Cancel</span>
                </button>
              </div>
            </footer>
          </form>
        </div>
      ) : null}
      {isFormModalOpen ? (
        <div className={dynamicFormStyles.overlay} style={modalStyle}>
          <div
            className={dynamicFormStyles.backdrop}
            onClick={saveLoading ? undefined : closeModal}
            aria-hidden
          />
          <div
            className={dynamicFormStyles.panel}
            role="dialog"
            aria-modal="true"
            style={modalPanelStyle}
          >
            <header className={dynamicFormStyles.header}>
              <div className={dynamicFormStyles.headerRow}>
                <h2 className={dynamicFormStyles.headerTitle}>{modalTitle}</h2>
                <button
                  type="button"
                  className={dynamicFormStyles.closeButton}
                  onClick={closeModal}
                  disabled={saveLoading}
                  aria-label="Close modal"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                    <path
                      d="M6 18 18 6M6 6l12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            </header>
            <div className={dynamicFormStyles.scrollArea}>
              {ledgerFormSections.length > 0 ? (
                <div
                  className={dynamicFormStyles.sectionTabs}
                  role="tablist"
                  aria-label="Ledger form sections"
                >
                  {ledgerFormSections.map((section, sectionIndex) => (
                    <button
                      key={section.key}
                      ref={(element) => {
                        sectionTabRefs.current[section.key] = element;
                      }}
                      type="button"
                      role="tab"
                      aria-selected={section.key === activeSectionKey}
                      aria-controls={`${modalFormId}-${section.key}-panel`}
                      id={`${modalFormId}-${section.key}-tab`}
                      tabIndex={section.key === activeSectionKey ? 0 : -1}
                      className={`${dynamicFormStyles.sectionTab} ${
                        section.key === activeSectionKey
                          ? dynamicFormStyles.sectionTabActive
                          : ""
                      }`}
                      onClick={() => setActiveSectionKey(section.key)}
                      onKeyDown={(event) =>
                        handleSectionTabKeyDown(event, sectionIndex, section.key)
                      }
                    >
                      {section.title}
                    </button>
                  ))}
                </div>
              ) : null}
              <form
                id={modalFormId}
                ref={formRef}
                className={dynamicFormStyles.formGrid}
                onSubmit={handleModalSubmit}
                onKeyDown={handleLedgerFieldArrowNavigation}
                noValidate
                autoComplete="off"
                style={{
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  rowGap: "0.75rem",
                  columnGap: "2rem",
                }}
              >
                {activeLedgerSection ? (
                  <div
                    id={`${modalFormId}-${activeLedgerSection.key}-panel`}
                    role="tabpanel"
                    aria-labelledby={`${modalFormId}-${activeLedgerSection.key}-tab`}
                    className={dynamicFormStyles.sectionFields}
                    style={
                      LEDGER_ASIDE_SECTION_KEYS.has(activeLedgerSection.key)
                        ? ({
                            "--erp-modal-section-columns": "1",
                          } as CSSProperties)
                        : undefined
                    }
                  >
                    {activeLedgerSection.key === BANK_ACCOUNTS_SECTION_KEY ? (
                      <BankAccountsEditor
                        rows={bankAccounts}
                        disabled={isReadOnlyMode || detailsLoading || saveLoading}
                        invalidRowKey={bankAccountError?.rowKey ?? null}
                        invalidField={bankAccountError?.field ?? null}
                        onAddRow={handleBankAccountAdd}
                        onChangeRow={handleBankAccountChange}
                        onRemoveRow={handleBankAccountRemove}
                        onSetDefault={handleBankAccountSetDefault}
                      />
                    ) : (
                      activeLedgerSection.fields.map((field) => (
                        <LedgerFieldRenderer
                          key={field.name}
                          field={field as any}
                          formValues={formValues}
                          isReadOnlyMode={isReadOnlyMode}
                          detailsLoading={detailsLoading}
                          saveLoading={saveLoading}
                          validationFieldName={validationFieldName}
                          openSearchField={openSearchField}
                          searchQueries={searchQueries}
                          searchActiveOptionIndex={searchActiveOptionIndex}
                          handleFieldChange={handleFieldChange}
                          handleCheckboxKeyDown={handleCheckboxKeyDown}
                          handleSearchableFieldInput={handleSearchableFieldInput}
                          handleSearchableFieldKeyDown={handleSearchableFieldKeyDown}
                          handleSearchableFieldPointerToggle={
                            handleSearchableFieldPointerToggle
                          }
                          handleSearchableOptionSelect={handleSearchableOptionSelect}
                          handleSearchableFieldClear={handleSearchableFieldClear}
                          searchInputRefs={searchInputRefs}
                          serverSearchFieldNames={LEDGER_DROPDOWN_FIELD_NAMES}
                          loadingFieldNames={loadingDropdownFieldNames}
                        />
                      ))
                    )}
                  </div>
                ) : null}
                {effectiveModalError ? (
                  <p className={dynamicFormStyles.submitError} role="alert">
                    {effectiveModalError}
                  </p>
                ) : null}
              </form>
            </div>
            <footer className={dynamicFormStyles.footer}>
              <div className={dynamicFormStyles.footerActions}>
                <button
                  type="button"
                  className={dynamicFormStyles.cancelButton}
                  onClick={closeModal}
                  disabled={saveLoading}
                >
                  {isReadOnlyMode ? "Close" : "Cancel"}
                </button>
                {!isReadOnlyMode ? (
                  <button
                    type="submit"
                    form={modalFormId}
                    className={dynamicFormStyles.submitButton}
                    disabled={saveLoading || detailsLoading}
                  >
                    {saveLoading
                      ? modalMode === "update"
                        ? "Updating..."
                        : "Saving..."
                      : modalMode === "update"
                        ? "Update"
                        : "Save"}
                  </button>
                ) : null}
              </div>
            </footer>
          </div>
        </div>
      ) : null}
      <DeleteConfirmModal
        isOpen={pendingDeleteRow !== null}
        itemName={pendingDeleteLabel}
        title={`Delete ${effectiveTitle}?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={deleteLoading}
        loadingLabel="Deleting..."
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
      <RecordHistoryModal
        isOpen={recordHistoryModal !== null}
        screenName={recordHistoryModal?.screenName}
        recordPk={recordHistoryModal?.recordPk}
        displayName={recordHistoryModal?.displayName}
        onClose={() => setRecordHistoryModal(null)}
      />
      </main>
    </>
  );
}
