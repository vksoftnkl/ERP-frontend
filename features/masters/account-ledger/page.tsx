"use client";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import ReusableTable, {
  type ReusableTableColumn,
  type ReusableTableColumnResizeEndPayload,
} from "@/components/ui/table";
import {
  KeyboardShortcutHints,
  type KeyboardShortcutDefinition,
} from "@/components/library/ui/keyboard-shortcut-hints";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import { getApiErrorMessage } from "@/store/api/baseApi";
import { useGetGridColumnsQuery } from "@/store/api/metadataApi";
import type { GridColumnConfig } from "@/store/slices/gridColumnsSlice";
import styles from "@/app/master/state-master/page.module.scss";
import dynamicFormStyles from "@/components/library/ui/dynamic-modal-form.module.scss";
import { RecordHistoryModal } from "@/features/masters/record-history/page";
import { FiDownload, FiSearch } from "react-icons/fi";
// Import all modular logic
import {
  API_ENDPOINTS,
  DEBOUNCE_MS,
  SEARCHABLE_SELECT_OPTIONS_MAX_HEIGHT,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  LOOKUP_ENDPOINT,
  GRID_DETAILS_ENDPOINT,
  GRID_COLUMNS_CREATE_ENDPOINT,
  STATE_CODE_LOOKUP_ENDPOINT,
  GRID_DETAILS_QUERY,
  GRID_COLUMNS_PAGE,
  GRID_COLUMNS_LIMIT,
  LOOKUP_QUERY_COMPANIES,
  LOOKUP_QUERY_BRANCHES,
  LOOKUP_QUERY_ACCOUNT_GROUPS,
  LOOKUP_QUERY_STATE_CODES,
  STATE_NAME_SEARCH_FIELD_NAMES,
  REQUEST_PAYLOAD_KEYS,
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
  buildLookupOptions,
  buildStateNameOptions,
  buildStateCodeByName,
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
import {
  buildLedgerRows,
  resolveLedgerRecordId,
  buildColumnsFromGridColumns,
  buildColumnsFromResponseStyles,
  resolveGridColumnForLedgerTableColumn,
} from "./table-builder";
import {
  getLedgerFocusableFieldControl,
  getLedgerFocusableFieldTargets,
  findNextLedgerFieldTarget,
  getFirstLedgerFocusableFieldTarget,
  focusLedgerFieldControl,
} from "./form-navigation";
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
const LEDGER_SECTION_SHORTCUTS: readonly KeyboardShortcutDefinition[] = [
  {
    label: "Prev",
    keys: ["ArrowLeft"],
  },
  {
    label: "Next",
    keys: ["ArrowRight"],
  },
  {
    label: "First",
    keys: ["Home"],
  },
  {
    label: "Last",
    keys: ["End"],
  },
];
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
  searchInputRefs,
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
    const filteredOptions = options.filter((option) => {
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
            } ${isSearchOpen ? dynamicFormStyles.searchSelectTriggerOpen : ""}`}
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
              {filteredOptions.length ? (
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
  const { getAll: getCompanyLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getBranchLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getAccountGroupLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getStateCodeLookup } = useApi<unknown>(STATE_CODE_LOOKUP_ENDPOINT);
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
  // State for table and search
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(DEFAULT_PAGE);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalEntries, setTotalEntries] = useState(0);
  const [selectedRowId, setSelectedRowId] = useState<string | number | null>(null);
  const [recordHistoryModal, setRecordHistoryModal] = useState<{
    displayName: string | null;
    recordPk: string;
    screenName: string;
  } | null>(null);
  // State for grid details
  const [accountLedgerGridId, setAccountLedgerGridId] = useState<number | null>(null);
  const [accountLedgerGridName, setAccountLedgerGridName] = useState<string | null>(null);
  // State for modal form
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [formValues, setFormValues] = useState<LedgerFormValues>(
    createInitialLedgerFormValues,
    );
  const [editingItemId, setEditingItemId] = useState<string | number | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [validationFieldName, setValidationFieldName] = useState<LedgerFormFieldName | null>(null);
  // State for search fields
  const [openSearchField, setOpenSearchField] = useState<string | null>(null);
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [searchActiveOptionIndex, setSearchActiveOptionIndex] = useState<Record<string, number>>({});
  // State for form sections
  const [activeSectionKey, setActiveSectionKey] = useState("general");
  // State for delete
  const [pendingDeleteRow, setPendingDeleteRow] = useState<LedgerTableRow | null>(null);
  // Refs
  const searchInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const formRef = useRef<HTMLFormElement | null>(null);
  const sectionTabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  // Grid columns query
  const selectedGridId = accountLedgerGridId ?? -1;
  const {
    data: gridColumnsData,
    error: gridColumnsQueryError,
    isFetching: gridColumnsLoading,
    refetch: refetchGridColumns,
  } = useGetGridColumnsQuery(
    { gridId: selectedGridId, page: GRID_COLUMNS_PAGE, limit: GRID_COLUMNS_LIMIT },
    { skip: accountLedgerGridId === null },
  );
  const gridColumns = gridColumnsData ?? [];
  const gridColumnsError = getApiErrorMessage(gridColumnsQueryError);
  // Load grid details
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const payload = await getGridDetails(GRID_DETAILS_QUERY);
        if (!mounted) return;
        const resolvedGrid = resolveAccountLedgerGridDetails(payload);
        setAccountLedgerGridId(resolvedGrid.gridId);
        setAccountLedgerGridName(resolvedGrid.gridName);
      } catch {
        if (mounted) {
          setAccountLedgerGridId(null);
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
  // Load lookup data
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const [companiesPayload, branchesPayload, accountGroupsPayload, stateCodesPayload] =
          await Promise.all([
            getCompanyLookup(LOOKUP_QUERY_COMPANIES),
            getBranchLookup(LOOKUP_QUERY_BRANCHES),
            getAccountGroupLookup(LOOKUP_QUERY_ACCOUNT_GROUPS),
            getStateCodeLookup(LOOKUP_QUERY_STATE_CODES),
          ]);
        if (!mounted) return;
        setCompanyOptions(buildLookupOptions(companiesPayload, true));
        setBranchOptions(buildLookupOptions(branchesPayload, true));
        setAccountGroupOptions(buildLookupOptions(accountGroupsPayload, true));
        setStateNameOptions(buildStateNameOptions(stateCodesPayload));
        setStateCodeByName(buildStateCodeByName(stateCodesPayload));
      } catch {
        if (!mounted) return;
        setCompanyOptions([{ value: "", label: "" }]);
        setBranchOptions([{ value: "", label: "" }]);
        setAccountGroupOptions([{ value: "", label: "" }]);
        setStateNameOptions([{ value: "", label: "" }]);
        setStateCodeByName({});
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getAccountGroupLookup, getBranchLookup, getCompanyLookup, getStateCodeLookup]);
  // Load form fields
  const ledgerFormFields = useMemo(
    () =>
      buildLedgerFormFields(companyOptions, branchOptions, accountGroupOptions, stateNameOptions),
    [accountGroupOptions, branchOptions, companyOptions, stateNameOptions],
  );
  const ledgerFormSections = useMemo(
    () => toLedgerFormSections(ledgerFormFields),
    [ledgerFormFields],
  );
  const activeLedgerSection =
    ledgerFormSections.find((section) => section.key === activeSectionKey) ??
    ledgerFormSections[0] ??
    null;
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
    [getAll],
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
  const renderedRows = rows;
  const renderedTotalEntries = totalEntries;
  // Validate selected row
  useEffect(() => {
    if (selectedRowId === null) return;
    if (!renderedRows.some((row) => row.__rowId === selectedRowId)) {
      setSelectedRowId(null);
    }
  }, [renderedRows, selectedRowId]);
  // Build columns
  const columns = useMemo<ReusableTableColumn<LedgerTableRow>[]>(
    () => {
      const styledColumns = buildColumnsFromResponseStyles(data);
      return styledColumns.length > 0 ? styledColumns : buildColumnsFromGridColumns(gridColumns);
    },
    [data, gridColumns],
  );
  const renderedColumns = columns;
  // Modal handlers
  const openCreateModal = useCallback(() => {
    resetSaveState();
    resetDetailsState();
    setModalError(null);
    setValidationFieldName(null);
    setOpenSearchField(null);
    setSearchQueries({});
    setSearchActiveOptionIndex({});
    setActiveSectionKey(ledgerFormSections[0]?.key ?? "general");
    setModalMode("create");
    setEditingItemId(null);
    setFormValues(createInitialLedgerFormValues());
    setIsFormModalOpen(true);
  }, [ledgerFormSections, resetDetailsState, resetSaveState]);
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
      setValidationFieldName(null);
      setOpenSearchField(null);
      setSearchQueries({});
      setSearchActiveOptionIndex({});
      setActiveSectionKey(ledgerFormSections[0]?.key ?? "general");
      setModalMode(mode);
      setFormValues(createInitialLedgerFormValues());
      setIsFormModalOpen(true);
      setSelectedRowId(row.__rowId);
      const recordId = resolveLedgerRecordId(row);
      setEditingItemId(mode === "update" ? recordId : null);
      try {
        const payload = await getById({
          query: { [REQUEST_PAYLOAD_KEYS.id]: String(recordId) },
        });
        const detailSource = extractDetailSource(payload) ?? row.__source;
        setFormValues(toLedgerFormValues(detailSource));
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
    [getById, ledgerFormSections, resetDetailsState, resetSaveState],
  );
  const closeModal = useCallback(() => {
    if (saveLoading) return;
    setIsFormModalOpen(false);
    setModalError(null);
    setEditingItemId(null);
    setValidationFieldName(null);
    setOpenSearchField(null);
    setSearchQueries({});
    setSearchActiveOptionIndex({});
    setActiveSectionKey("general");
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
  const handleFieldChange = useCallback(
    (fieldName: LedgerFormFieldName, value: string) => {
      setFormValues((current) => ({ ...current, [fieldName]: value }));
      setValidationFieldName((current) => (current === fieldName ? null : current));
    },
    [],
  );
  const handleCheckboxKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (event.currentTarget.disabled) return;
    event.currentTarget.click();
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
      setValidationFieldName(null);
      const shouldUpdate = modalMode === "update";
      const payload = buildLedgerRequestPayload(formValues, shouldUpdate, editingItemId);
      void (async () => {
        try {
          await upsertRecord({ body: payload });
          setIsFormModalOpen(false);
          setModalError(null);
          setEditingItemId(null);
          await loadRecords(searchTerm, currentPage, pageSize);
        } catch {
          setModalError("Unable to save account ledger.");
        }
      })();
    },
    [
      closeModal,
      currentPage,
      editingItemId,
      formValues,
      loadRecords,
      modalMode,
      pageSize,
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
  const handlePageSizeChange = useCallback((nextPageSize: number) => {
    setCurrentPage(DEFAULT_PAGE);
    setPageSize(nextPageSize);
  }, []);
  const listHeading = `${effectiveTitle} List`;
  const handleDownloadRows = useCallback(() => {
    downloadLedgerCsv(listHeading, renderedColumns, renderedRows);
  }, [listHeading, renderedColumns, renderedRows]);
  const handleGridColumnResizeEnd = useCallback(
    (payload: ReusableTableColumnResizeEndPayload<LedgerTableRow>) => {
      if (accountLedgerGridId === null || payload.tableWidthPx <= 0) {
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
      const columnNumber =
        gridColumn.columnNumber && gridColumn.columnNumber > 0
          ? gridColumn.columnNumber
          : Math.max(1, gridColumn.order + 1);
      const columnName = (gridColumn.columnName ?? gridColumn.header).trim();
      if (!columnName) {
        return;
      }
      void (async () => {
        try {
          await saveGridColumnWidth({
            body: {
              grid_serialid: gridColumn.serialId,
              grid_id: gridColumn.gridId ?? String(accountLedgerGridId),
              grid_column_number: columnNumber,
              grid_column_name: columnName,
              grid_column_width: widthPercent,
            },
          });
          void refetchGridColumns();
        } catch {
          // useApi handles the visible error toast.
        }
      })();
    },
    [accountLedgerGridId, gridColumns, refetchGridColumns, saveGridColumnWidth],
  );
  const handleGridColumnHide = useCallback(
    (payload: { column: ReusableTableColumn<LedgerTableRow> }) => {
      if (accountLedgerGridId === null) {
        return;
      }
      const gridColumn = resolveGridColumnForLedgerTableColumn(payload.column, gridColumns);
      if (!gridColumn?.serialId) {
        return;
      }
      const columnNumber =
        gridColumn.columnNumber && gridColumn.columnNumber > 0
          ? gridColumn.columnNumber
          : Math.max(1, gridColumn.order + 1);
      const columnName = (gridColumn.columnName ?? gridColumn.header).trim();
      if (!columnName) {
        return;
      }
      void (async () => {
        try {
          await saveGridColumnWidth({
            body: {
              grid_serialid: gridColumn.serialId,
              grid_id: gridColumn.gridId ?? String(accountLedgerGridId),
              grid_column_number: columnNumber,
              grid_column_name: columnName,
              grid_column_visibility: false,
            },
          });
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
      loadRecords,
      pageSize,
      refetchGridColumns,
      saveGridColumnWidth,
      searchTerm,
    ],
  );
  const toolbarContent = (
    <div className={styles.masterHeader}>
      <div className={styles.masterTitleWrap}>
        <h1 className={styles.masterTitle}>{listHeading}</h1>
      </div>
      <div className={styles.masterSearchWrap}>
        <FiSearch className={styles.masterSearchIcon} aria-hidden="true" />
        <input
          type="text"
          className={styles.masterSearchInput}
          value={searchTerm}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Search..."
          autoComplete="off"
          aria-label="Search account ledgers"
        />
      </div>
    </div>
  );
  const pendingDeleteLabel = useMemo(() => {
    if (!pendingDeleteRow) return "";
    return (
      pendingDeleteRow.ledgerName ||
      pendingDeleteRow.ledgerCode ||
      pendingDeleteRow.ledgerId
    );
  }, [pendingDeleteRow]);
  const isReadOnlyMode = modalMode === "view";
  const effectiveModalError = modalError ?? saveError ?? detailsError;
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
  const ledgerModalFooterShortcuts: KeyboardShortcutDefinition[] = [
    ...(ledgerFormSections.length > 1 ? LEDGER_SECTION_SHORTCUTS : []),
    {
      label: isReadOnlyMode ? "Close" : "Cancel",
      keys: ["Escape"],
    },
    ...(!isReadOnlyMode && !saveLoading && !detailsLoading
      ? [
          {
            label: modalMode === "update" ? "Update" : "Save",
            keys: ["Ctrl/Cmd", "Enter"],
          },
        ]
      : []),
  ];
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
    <main className={styles.page}>
      <div className={styles.viewport}>
        <div className={styles.board}>
          <section className={styles.content}>
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
                  Unable to load table headers: {gridColumnsError}. Showing default headers.
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
            <ReusableTable
              columns={renderedColumns}
              rows={renderedRows}
              rowKey="__rowId"
              toolbarContent={toolbarContent}
              toolbarActions={
                <button
                  type="button"
                  className={styles.masterDownloadButton}
                  onClick={handleDownloadRows}
                  disabled={renderedRows.length === 0}
                  aria-label={`Download ${listHeading}`}
                  title={`Download ${listHeading}`}
                >
                  <FiDownload aria-hidden="true" />
                </button>
              }
              wrapperClassName={styles.masterTable}
              tableClassName={styles.masterDataTable}
              tableLayout="fixed"
              minWidth="980px"
              reorderableColumns
              resizableColumns
              onColumnResizeEnd={handleGridColumnResizeEnd}
              onColumnHide={handleGridColumnHide}
              activeRowKey={selectedRowId}
              onRowClick={(row) => setSelectedRowId(row.__rowId)}
              onRowDoubleClick={(row) => void openExistingModal(row, "view")}
              onCreate={openCreateModal}
              createLabel="Add"
              onView={(row) => void openExistingModal(row, "view")}
              onUpdate={(row) => void openExistingModal(row, "update")}
              onDelete={handleDeleteRow}
              onLogs={handleRowLogs}
              isViewDisabled={() => saveLoading || detailsLoading}
              isUpdateDisabled={() => saveLoading || detailsLoading}
              isDeleteDisabled={() => deleteLoading || saveLoading || detailsLoading}
              isLogsDisabled={(row) => `${row.__recordId}`.trim().length === 0}
              actionsAsIcons
              updateLabel="Update"
              deleteLabel={deleteLoading ? "Deleting..." : "Delete"}
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
                    {activeLedgerSection.fields.map((field) => (
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
                        searchInputRefs={searchInputRefs}
                      />
                    ))}
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
              <div className={dynamicFormStyles.footerShortcuts}>
                <KeyboardShortcutHints
                  shortcuts={ledgerModalFooterShortcuts}
                  dense
                />
              </div>
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
  );
}