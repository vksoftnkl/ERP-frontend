"use client";
import {
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { useBusinessContext } from "@/components/layout/business-context";
import type { ERPDynamicSelectOption } from "@/components/design-system/ui";
import type { ERPDynamicSearchShortcutPayload } from "@/components/design-system/ui/dynamic-modal-form";
import dynamicModalStyles from "@/components/design-system/ui/dynamic-modal-form.module.scss";
import type { CrudMasterPageController } from "@/components/master/crud-master-page";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import GodownMasterPageContent from "@/features/masters/inventory/godown/page";
import ItemMasterPageContent from "@/features/masters/inventory/item/item-master-page";
import { resolveOptionFromShortcut } from "@/features/masters/shared";
import { extractRows } from "@/features/masters/shared/normalizers";
import { useApi } from "@/hooks/useApi";
import { notifyGlobalNavigationStart } from "@/lib/navigation/global-loader";
import {
  getAuthSessionId,
  getAuthUserId,
  getOrCreateClientDeviceId,
} from "@/lib/auth/session";
import {
  type ItemPriceDetailsPayload,
  useLazyGetItemOptionsQuery,
  useLazyGetItemPriceDetailsQuery,
  useLazyGetItemTaxByIdQuery,
  useLazyGetTaxOptionsQuery,
  useLazyGetUnitOptionsQuery,
} from "@/store/api/lookupsApi";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  listModalToggled,
  selectedDocumentIdSet,
  selectOpeningStockIsListModalOpen,
  selectOpeningStockSelectedDocId,
} from "@/store/slices/openingStockSlice";
import type { ApiSuccessResponse, ListMeta } from "@/utils/types";
import { OpeningStockAuditNotesModal } from "./opening-stock-audit-notes-modal";
import { OpeningStockListModal } from "./opening-stock-list-modal";
import { StockTableRow } from "./stock-table-row";
import { StockToolbar } from "./stock-toolbar";
import { BulkLoadItemsModal, type BulkLoadParams } from "./BulkLoadItemsModal";
import type {
  BulkOpeningStockItemPayload,
  OpeningStockDocumentPayload,
  OpeningStockHeaderPayload,
  OpeningStockListMeta,
  OpeningStockSaveRequest,
  OpeningStockSuccessResponse,
} from "./opening-stock.types";
import styles from "@/features/stocks/_shared/stock-page.module.scss";
import type {
  AccountLedgerRecord,
  ColumnDefinition,
  LoadedOpeningStockMeta,
  LookupCellState,
  LookupKind,
  OpeningStockRow,
  RowValidationIssue,
  StockLookupOption,
  UiTableColumnPayload,
  UiTableMasterResponse,
} from "./opening-stock.types";
import {
  ACCOUNT_LEDGER_LIST_ENDPOINT,
  ITEMS_BULK_LOAD_ENDPOINT,
  DEFAULT_GODOWN_OPTION,
  DEFAULT_ITEM_OPTION,
  DELETE_ACTION_COLUMN_WIDTH,
  GODOWN_GRID_LIST_ENDPOINT,
  GODOWN_GRID_LIST_QUERY,
  LOOKUP_FIELD_CONFIG,
  LOOKUP_SEARCH_DEBOUNCE_MS,
  MIN_RESIZABLE_COLUMN_WIDTH,
  OPENING_STOCK_DELETE_ENDPOINT,
  OPENING_STOCK_GET_ENDPOINT,
  OPENING_STOCK_LEDGER_NAME,
  OPENING_STOCK_LIST_ENDPOINT,
  OPENING_STOCK_SAVE_ENDPOINT,
  QUANTITY_FORMATTER,
  SERIAL_NUMBER_COLUMN_WIDTH,
  TRACKING_VALIDATION_FIELD_KEYS,
  UNIT_LIST_ENDPOINT,
  UNIT_LIST_QUERY,
  UI_TABLE_COLUMNS_CREATE_ENDPOINT,
  UI_TABLE_COLUMNS_LIST_ENDPOINT,
  UI_TABLE_COLUMNS_QUERY,
  UI_TABLE_COLUMNS_TOAST_OPTIONS,
  VALUE_FORMATTER,
} from "./constants";
import {
  INITIAL_ROWS,
  OPENING_STOCK_SALE_PRICE_FIELD_PAIRS,
  buildGodownLookupOptions,
  buildInvalidFieldState,
  buildItemAutofillValues,
  buildLoadedLookupOptions,
  buildOpeningStockDetailPayload,
  buildOpeningStockNarration,
  buildUnitDecimalCountById,
  buildPendingItemSelectionValues,
  buildPriceSelectionValues,
  buildTaxSelectionValues,
  clearInvalidFieldKeys,
  createEmptyRow,
  createRow,
  cx,
  DEFAULT_ROW_VALUES,
  ensureTrailingEmptyRow,
  filterLookupOptions,
  focusOpeningStockField,
  formatAccountingYear,
  formatQuantityValue,
  getOpeningStockActualConvFactor,
  getOpeningStockCostInputValue,
  getOpeningStockCostWotInputValue,
  getOpeningStockSalePairDerivedValues,
  getRowValidationIssues,
  getTableMinWidth,
  getTodayInputValue,
  getTotals,
  isOpeningStockBatchNumberEditable,
  isPristineRow,
  isValidationFieldSatisfied,
  mapOpeningStockDocumentToRows,
  mergeLookupOptions,
  mergeResolvedColumns,
  normalizeOpeningStockRowQuantitiesByUnit,
  normalizeOpeningStockTrackingType,
  normalizeColumnName,
  parseColumnWidth,
  parseDecimal,
  reorderColumns,
  resolveConfiguredColumns,
  resolveItemPriceRecordByUnitId,
  toInputDateValue,
  toInputValue,
  toIsoDateTime,
  toCanonicalDateValue,
  toNullableTrimmedString,
} from "./opening-stock.utils";
import type {
  OpeningStockLoadRequest,
  InlineItemMasterRequest,
  InlineGodownMasterRequest,
  OpeningStockListFilters,
  OpeningStockEditorState,
  OpeningStockColumnSettingsDraftEntry,
  TableSettingsContextMenuPosition,
  SaveOpeningStockUiTableMasterRequest,
} from "./opening-stock.column-settings";
import {
  createOpeningStockListFiltersForToday,
  clampContextMenuPosition,
  buildOpeningStockColumnSettingsRows,
  buildOpeningStockUiTableColumnSettingsRequest,
  findOpeningStockUiTableColumnConfig,
  buildOpeningStockUiTableColumnWidthRequest,
  upsertOpeningStockUiTableColumnConfig,
  buildOpeningStockEditorSignature,
  buildNavigationHref,
  isSameNavigationTarget,
  getOpeningStockVoucherLabel,
  getOpeningStockListErrorMessage,
  DEFAULT_OPENING_STOCK_LIST_FILTERS,
  EMPTY_OPENING_STOCK_LIST_META,
  TABLE_SETTINGS_CONTEXT_MENU_WIDTH,
  TABLE_SETTINGS_CONTEXT_MENU_HEIGHT,
  TABLE_SETTINGS_CONTEXT_MENU_PADDING,
} from "./opening-stock.column-settings";
import { Z_MODAL_NESTED } from "@/lib/z-index";
import { layoutPointer, layoutViewportSize, toLayoutPx } from "@/lib/ui-scale";
function renderValidationToastContent(
  issues: Array<{ rowId: number; fieldKey: string; message: string }>,
) {
  const visibleIssues = issues.slice(0, 5);
  const remainingCount = issues.length - visibleIssues.length;
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: "0.35rem" }}>
        Fix validation errors before updating stock.
      </div>
      {visibleIssues.map((issue) => (
        <div key={`${issue.rowId}-${issue.fieldKey}`}>{issue.message}</div>
      ))}
      {remainingCount > 0 ? <div>{`+${remainingCount} more issue(s).`}</div> : null}
    </div>
  );
}
export default function OpeningStockPage() {
  const router = useRouter();
  const [voucherDate, setVoucherDate] = useState(() => getTodayInputValue());
  const [voucherRefNo, setVoucherRefNo] = useState("");
  const [rows, setRows] = useState<OpeningStockRow[]>(INITIAL_ROWS);
  const [invalidFieldKeys, setInvalidFieldKeys] = useState<Record<string, true>>({});
  const [uiColumnConfigs, setUiColumnConfigs] = useState<UiTableColumnPayload[]>([]);
  const [tableSettingsContextMenuPosition, setTableSettingsContextMenuPosition] =
    useState<TableSettingsContextMenuPosition | null>(null);
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const [columnSettingsDraft, setColumnSettingsDraft] = useState<
    Record<string, OpeningStockColumnSettingsDraftEntry>
  >({});
  const [isColumnSettingsSaving, setIsColumnSettingsSaving] = useState(false);
  const [itemDetailsByItemId, setItemDetailsByItemId] = useState<
    Record<string, ItemPriceDetailsPayload>
  >({});
  const [unitDecimalCountById, setUnitDecimalCountById] = useState<Record<string, number>>({});
  const [itemOptions, setItemOptions] = useState<StockLookupOption[]>([DEFAULT_ITEM_OPTION]);
  const [taxOptions, setTaxOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [unitOptions, setUnitOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [godownOptions, setGodownOptions] = useState<StockLookupOption[]>([
    DEFAULT_GODOWN_OPTION,
  ]);
  const [loadedVoucherId, setLoadedVoucherId] = useState<string | null>(null);
  const [loadedDocumentMeta, setLoadedDocumentMeta] = useState<LoadedOpeningStockMeta | null>(
    null,
  );
  const [isLoadingStock, setIsLoadingStock] = useState(false);
  const [isBulkLoadModalOpen, setIsBulkLoadModalOpen] = useState(false);
  const [isBulkLoadingItems, setIsBulkLoadingItems] = useState(false);
  const [pendingLoadRequest, setPendingLoadRequest] =
    useState<OpeningStockLoadRequest | null>(null);
  const [isDeleteLoadedStockConfirmOpen, setIsDeleteLoadedStockConfirmOpen] = useState(false);
  const [pendingOpeningStockSaveRequest, setPendingOpeningStockSaveRequest] =
    useState<OpeningStockSaveRequest | null>(null);
  const [openingStockAuditNotes, setOpeningStockAuditNotes] = useState("");
  const [openingStockAuditNotesError, setOpeningStockAuditNotesError] = useState<string | null>(
    null,
  );
  const [isInlineItemMasterOpen, setIsInlineItemMasterOpen] = useState(false);
  const [inlineItemMasterSession, setInlineItemMasterSession] =
    useState<InlineItemMasterRequest | null>(null);
  const [isInlineGodownMasterOpen, setIsInlineGodownMasterOpen] = useState(false);
  const [inlineGodownMasterSession, setInlineGodownMasterSession] =
    useState<InlineGodownMasterRequest | null>(null);
  const [openLookupCell, setOpenLookupCell] = useState<LookupCellState | null>(null);
  const [lookupSearchQuery, setLookupSearchQuery] = useState("");
  const [columns, setColumns] = useState<ColumnDefinition[]>([]);
  const [isUnsavedChangesConfirmOpen, setIsUnsavedChangesConfirmOpen] = useState(false);
  const dispatch = useAppDispatch();
  const isOpeningStockListOpen = useAppSelector(selectOpeningStockIsListModalOpen);
  const [openingStockListFilters, setOpeningStockListFilters] = useState<OpeningStockListFilters>(
    DEFAULT_OPENING_STOCK_LIST_FILTERS,
  );
  const [openingStockListRows, setOpeningStockListRows] = useState<OpeningStockHeaderPayload[]>([]);
  const [openingStockListMeta, setOpeningStockListMeta] = useState<OpeningStockListMeta>(
    EMPTY_OPENING_STOCK_LIST_META,
  );
  const [openingStockListPage, setOpeningStockListPage] = useState(1);
  const [openingStockListPageSize, setOpeningStockListPageSize] = useState(20);
  const selectedOpeningStockListVoucherId = useAppSelector(selectOpeningStockSelectedDocId);
  const [isOpeningStockListLoading, setIsOpeningStockListLoading] = useState(false);
  const [openingStockListError, setOpeningStockListError] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const columnsRef = useRef<ColumnDefinition[]>([]);
  const uiColumnConfigsRef = useRef<UiTableColumnPayload[]>([]);
  const lookupRootRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lookupSearchInputRef = useRef<HTMLInputElement | null>(null);
  const voucherDatePickerRef = useRef<HTMLInputElement | null>(null);
  const rowDatePickerRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const itemSearchTimeoutRef = useRef<number | null>(null);
  const itemSearchRequestRef = useRef(0);
  const itemDetailRequestRef = useRef<Record<number, number>>({});
  const taxDetailRequestRef = useRef<Record<number, number>>({});
  const inlineItemMasterControllerRef = useRef<CrudMasterPageController | null>(null);
  const pendingInlineItemMasterRequestRef = useRef<InlineItemMasterRequest | null>(null);
  const inlineGodownMasterControllerRef = useRef<CrudMasterPageController | null>(null);
  const pendingInlineGodownMasterRequestRef = useRef<InlineGodownMasterRequest | null>(null);
  const godownSearchTimeoutRef = useRef<number | null>(null);
  const godownSearchRequestRef = useRef(0);
  const draggingColumnKeyRef = useRef<string | null>(null);
  const resizingColumnRef = useRef<{
    key: string;
    startX: number;
    startWidth: number;
    currentWidth: number;
  } | null>(null);
  const pendingUnsafeNavigationRef = useRef<(() => void) | null>(null);
  const allowUnsafeNavigationRef = useRef(false);
  const allowUnsafeNavigationTimeoutRef = useRef<number | null>(null);
  const hasUnsavedChangesRef = useRef(false);
  const openingStockListRequestRef = useRef(0);
  const columnWidthSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const cleanEditorSignatureRef = useRef(
    buildOpeningStockEditorSignature({
      loadedVoucherId: null,
      voucherDate,
      voucherRefNo,
      rows,
    }),
  );
  const {
    activeCompany,
    activeBranch,
    setCompanySelectionLocked,
    setBranchSelectionLocked,
    loading: isBusinessContextLoading,
  } = useBusinessContext();
  const { getAll: listUiTableColumns } = useApi<
    ApiSuccessResponse<UiTableMasterResponse[], ListMeta>
  >(UI_TABLE_COLUMNS_LIST_ENDPOINT, {
    toast: UI_TABLE_COLUMNS_TOAST_OPTIONS,
  });
  const { run: saveUiTableColumn } = useApi<
    ApiSuccessResponse<{ columns: UiTableColumnPayload[] }>,
    SaveOpeningStockUiTableMasterRequest
  >(UI_TABLE_COLUMNS_CREATE_ENDPOINT, {
    method: "POST",
    toast: UI_TABLE_COLUMNS_TOAST_OPTIONS,
  });
  const { run: listAccountLedgers } = useApi<unknown>(ACCOUNT_LEDGER_LIST_ENDPOINT, {
    toast: {
      success: false,
      error: false,
    },
  });
  const { run: getBulkItems } = useApi<
    OpeningStockSuccessResponse<BulkOpeningStockItemPayload[]>
  >(ITEMS_BULK_LOAD_ENDPOINT, {
    toast: {
      success: false,
      error: false,
    },
  });
  const { run: listGodowns, loading: isGodownLookupLoading } = useApi<unknown>(
    GODOWN_GRID_LIST_ENDPOINT, {
    toast: {
      success: false,
      error: false,
    },
  });
  const { run: listUnits } = useApi<unknown>(UNIT_LIST_ENDPOINT, {
    toast: {
      success: false,
      error: false,
    },
  });
  const { run: listOpeningStocks } = useApi<
    OpeningStockSuccessResponse<OpeningStockHeaderPayload[], OpeningStockListMeta>
  >(OPENING_STOCK_LIST_ENDPOINT, {
    toast: {
      success: false,
    },
  });
  const { run: listOpeningStockRecords } = useApi<
    OpeningStockSuccessResponse<OpeningStockHeaderPayload[], OpeningStockListMeta>
  >(OPENING_STOCK_LIST_ENDPOINT, {
    toast: {
      success: false,
      error: false,
    },
  });
  const { run: getOpeningStockDocument } = useApi<
    OpeningStockSuccessResponse<OpeningStockDocumentPayload>
  >(OPENING_STOCK_GET_ENDPOINT, {
    toast: {
      success: false,
    },
  });
  const { run: getOpeningStockDocumentByRefNo } = useApi<
    OpeningStockSuccessResponse<OpeningStockDocumentPayload>
  >(OPENING_STOCK_LIST_ENDPOINT, {
    toast: {
      success: false,
    },
  });
  const { run: saveOpeningStock, loading: isSavingOpeningStock } = useApi<
    unknown,
    OpeningStockSaveRequest
  >(OPENING_STOCK_SAVE_ENDPOINT, {
    method: "POST",
    toast: {
      successMessage: "Opening stock updated successfully.",
    },
  });
  const { run: deleteOpeningStock, loading: isDeletingOpeningStock } = useApi<unknown>(
    OPENING_STOCK_DELETE_ENDPOINT,
    {
      method: "DELETE",
      toast: {
        successMessage: "Opening stock deleted successfully.",
      },
    },
  );
  const [triggerItemOptions, { isFetching: isItemLookupLoading }] =
    useLazyGetItemOptionsQuery();
  const [triggerTaxOptions] = useLazyGetTaxOptionsQuery();
  const [triggerUnitOptions] = useLazyGetUnitOptionsQuery();
  const [triggerItemPriceDetails] = useLazyGetItemPriceDetailsQuery();
  const [triggerItemTaxById] = useLazyGetItemTaxByIdQuery();
  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);
  useEffect(() => {
    uiColumnConfigsRef.current = uiColumnConfigs;
  }, [uiColumnConfigs]);
  const loadLookupOptions = useCallback(
    async (lookupKind: LookupKind, search = ""): Promise<StockLookupOption[]> => {
      const normalizedSearch = search.trim();
      if (lookupKind === "item") {
        return triggerItemOptions(
          normalizedSearch ? { search: normalizedSearch } : undefined,
          true,
        ).unwrap();
      }
      const activeBranchId = activeBranch?.id?.trim() ?? "";
      const payload = await listGodowns({
        query: {
          ...GODOWN_GRID_LIST_QUERY,
          ...(normalizedSearch ? { search: normalizedSearch } : {}),
        },
      });
      return buildGodownLookupOptions(payload, activeBranchId);
    },
    [activeBranch?.id, listGodowns, triggerItemOptions],
  );
  const loadUnitOptions = useCallback(
    async (search = ""): Promise<ERPDynamicSelectOption[]> => {
      const normalizedSearch = search.trim();
      return triggerUnitOptions(
        normalizedSearch ? { search: normalizedSearch } : undefined,
        true,
      ).unwrap();
    },
    [triggerUnitOptions],
  );
  const loadTaxOptions = useCallback(
    async (): Promise<ERPDynamicSelectOption[]> => triggerTaxOptions(undefined, true).unwrap(),
    [triggerTaxOptions],
  );
  useEffect(() => {
    let cancelled = false;
    const loadUiColumnConfig = async () => {
      try {
        const payload = await listUiTableColumns({ ...UI_TABLE_COLUMNS_QUERY });
        if (!cancelled) {
          const allTables = Array.isArray(payload?.data) ? payload.data : [];
          const matchingTable = allTables.find(
            (table) => table.uiTblId === UI_TABLE_COLUMNS_QUERY.uiTableId,
          );
          const allColumns = Array.isArray(matchingTable?.columns) ? matchingTable.columns : [];
          const nextColumnConfigs = allColumns.filter((c) => c.uiTblClmIsActive !== false);
          uiColumnConfigsRef.current = nextColumnConfigs;
          setUiColumnConfigs(nextColumnConfigs);
        }
      } catch {
        if (!cancelled) {
          uiColumnConfigsRef.current = [];
          setUiColumnConfigs([]);
        }
      }
    };
    void loadUiColumnConfig();
    return () => {
      cancelled = true;
    };
  }, [listUiTableColumns]);
  const resetOpeningStockAuditNotesModal = useCallback(() => {
    setPendingOpeningStockSaveRequest(null);
    setOpeningStockAuditNotes("");
    setOpeningStockAuditNotesError(null);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [itemsPayload, taxesPayload, unitsPayload, unitDecimalsPayload, godownsPayload] =
        await Promise.allSettled([
          loadLookupOptions("item"),
          loadTaxOptions(),
          loadUnitOptions(),
          listUnits({ query: { ...UNIT_LIST_QUERY } }),
          loadLookupOptions("godown"),
        ]);
      if (cancelled) {
        return;
      }
      if (itemsPayload.status === "fulfilled") {
        setItemOptions(itemsPayload.value);
      }
      if (taxesPayload.status === "fulfilled") {
        setTaxOptions(taxesPayload.value);
      }
      if (unitsPayload.status === "fulfilled") {
        setUnitOptions(unitsPayload.value);
      }
      if (unitDecimalsPayload.status === "fulfilled") {
        setUnitDecimalCountById(buildUnitDecimalCountById(unitDecimalsPayload.value));
      }
      if (godownsPayload.status === "fulfilled") {
        setGodownOptions(godownsPayload.value);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listUnits, loadLookupOptions, loadTaxOptions, loadUnitOptions]);
  useEffect(() => {
    if (!openLookupCell) {
      return;
    }
    const animationFrame = window.requestAnimationFrame(() => {
      lookupSearchInputRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [openLookupCell]);
  useEffect(() => {
    if (!openLookupCell) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const lookupRootElement = openLookupCell ? lookupRootRefs.current[openLookupCell.key] : null;
      if (lookupRootElement && !lookupRootElement.contains(event.target as Node)) {
        setOpenLookupCell(null);
        setLookupSearchQuery("");
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenLookupCell(null);
        setLookupSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openLookupCell]);
  useEffect(() => {
    return () => {
      if (itemSearchTimeoutRef.current !== null) {
        window.clearTimeout(itemSearchTimeoutRef.current);
      }
      if (godownSearchTimeoutRef.current !== null) {
        window.clearTimeout(godownSearchTimeoutRef.current);
      }
    };
  }, []);
  const unitOptionsByValue = useMemo(
    () =>
      new Map(
        unitOptions
          .filter((option) => option.value.trim().length > 0)
          .map((option) => [option.value, option.label]),
      ),
    [unitOptions],
  );
  const taxOptionsByValue = useMemo(
    () =>
      new Map(
        taxOptions
          .filter((option) => option.value.trim().length > 0)
          .map((option) => [option.value, option.label]),
      ),
    [taxOptions],
  );
  const itemOptionsByValue = useMemo(
    () => new Map(itemOptions.map((option) => [option.value, option.label])),
    [itemOptions],
  );
  const godownOptionsByValue = useMemo(
    () => new Map(godownOptions.map((option) => [option.value, option.label])),
    [godownOptions],
  );
  const filteredItemOptions = useMemo(
    () => filterLookupOptions(itemOptions, lookupSearchQuery),
    [itemOptions, lookupSearchQuery],
  );
  const filteredGodownOptions = useMemo(
    () => filterLookupOptions(godownOptions, lookupSearchQuery),
    [godownOptions, lookupSearchQuery],
  );
  useEffect(() => {
    if (unitOptionsByValue.size === 0) {
      return;
    }
    setRows((currentRows) =>
      currentRows.map((row) => {
        const unitId = row.values.oslunitid?.trim() ?? "";
        if (!unitId) {
          return row;
        }
        const unitLabel = unitOptionsByValue.get(unitId);
        if (!unitLabel || row.values.uom === unitLabel) {
          return row;
        }
        return {
          ...row,
          values: {
            ...row.values,
            uom: unitLabel,
          },
        };
      }),
    );
  }, [unitOptionsByValue]);
  useEffect(() => {
    if (Object.keys(unitDecimalCountById).length === 0) {
      return;
    }
    setRows((currentRows) => {
      let changed = false;
      const nextRows = currentRows.map((row) => {
        const normalizedRow = normalizeOpeningStockRowQuantitiesByUnit(row, unitDecimalCountById);
        if (normalizedRow !== row) {
          changed = true;
        }
        return normalizedRow;
      });
      return changed ? nextRows : currentRows;
    });
  }, [rows, unitDecimalCountById]);
  const resolvedColumns = useMemo(
    () => resolveConfiguredColumns(uiColumnConfigs),
    [uiColumnConfigs],
  );
  const areConfiguredColumnsAllHidden = useMemo(
    () =>
      uiColumnConfigs.length > 0 &&
      uiColumnConfigs.every((column) => column.uiTblClmColumnVisibility === false),
    [uiColumnConfigs],
  );
  const renderedRows = areConfiguredColumnsAllHidden ? [] : rows;
  const columnSettingsRows = useMemo(
    () => buildOpeningStockColumnSettingsRows(uiColumnConfigs, columns),
    [columns, uiColumnConfigs],
  );
  const openColumnSettings = useCallback(() => {
    const nextDraft: Record<string, OpeningStockColumnSettingsDraftEntry> = {};
    for (const row of columnSettingsRows) {
      nextDraft[row.key] = {
        visible: row.visible,
        focus: row.focus,
        necessity: row.necessity,
      };
    }
    setColumnSettingsDraft(nextDraft);
    setIsColumnSettingsOpen(true);
    setTableSettingsContextMenuPosition(null);
  }, [columnSettingsRows]);
  const closeColumnSettings = useCallback(() => {
    if (isColumnSettingsSaving) {
      return;
    }
    setIsColumnSettingsOpen(false);
  }, [isColumnSettingsSaving]);
  const handleColumnSettingsSelectionChange = useCallback(
    (
      rowKey: string,
      field: keyof OpeningStockColumnSettingsDraftEntry,
      checked: boolean,
    ) => {
      setColumnSettingsDraft((current) => ({
        ...current,
        [rowKey]: {
          ...(current[rowKey] ?? {
            visible: true,
            focus: false,
            necessity: false,
          }),
          [field]: checked,
        },
      }));
    },
    [],
  );
  const handleDefaultColumnSettings = useCallback(() => {
    const nextDraft: Record<string, OpeningStockColumnSettingsDraftEntry> = {};
    for (const row of columnSettingsRows) {
      nextDraft[row.key] = {
        visible: true,
        focus: false,
        necessity: false,
      };
    }
    setColumnSettingsDraft(nextDraft);
  }, [columnSettingsRows]);
  const handleTableBodyContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLTableSectionElement>) => {
      if (columnSettingsRows.length === 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setOpenLookupCell(null);
      setTableSettingsContextMenuPosition({
        left: clampContextMenuPosition(
          layoutPointer(event).x,
          TABLE_SETTINGS_CONTEXT_MENU_PADDING,
          layoutViewportSize().width - TABLE_SETTINGS_CONTEXT_MENU_WIDTH,
        ),
        top: clampContextMenuPosition(
          layoutPointer(event).y,
          TABLE_SETTINGS_CONTEXT_MENU_PADDING,
          layoutViewportSize().height - TABLE_SETTINGS_CONTEXT_MENU_HEIGHT,
        ),
      });
    },
    [columnSettingsRows.length],
  );
  useEffect(() => {
    if (tableSettingsContextMenuPosition === null) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-opening-stock-settings-context-menu="true"]')) {
        return;
      }
      setTableSettingsContextMenuPosition(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTableSettingsContextMenuPosition(null);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [tableSettingsContextMenuPosition]);
  useEffect(() => {
    if (tableSettingsContextMenuPosition === null) {
      return;
    }
    const closeContextMenu = () => {
      setTableSettingsContextMenuPosition(null);
    };
    window.addEventListener("resize", closeContextMenu);
    window.addEventListener("scroll", closeContextMenu, true);
    return () => {
      window.removeEventListener("resize", closeContextMenu);
      window.removeEventListener("scroll", closeContextMenu, true);
    };
  }, [tableSettingsContextMenuPosition]);
  const saveColumnSettings = useCallback(async () => {
    if (!isColumnSettingsOpen || columnSettingsRows.length === 0) {
      return;
    }
    setIsColumnSettingsSaving(true);
    try {
      await saveUiTableColumn({
        body: {
          uiTblId: UI_TABLE_COLUMNS_QUERY.uiTableId,
          uiTblColumns: columnSettingsRows.map((row) => {
            const draft =
              columnSettingsDraft[row.key] ??
              ({
                visible: row.visible,
                focus: row.focus,
                necessity: row.necessity,
              } satisfies OpeningStockColumnSettingsDraftEntry);
            return buildOpeningStockUiTableColumnSettingsRequest(row, draft);
          }),
        },
      });
      const payload = await listUiTableColumns({ ...UI_TABLE_COLUMNS_QUERY });
      const allTables = Array.isArray(payload?.data) ? payload.data : [];
      const matchingTable = allTables.find(
        (table) => table.uiTblId === UI_TABLE_COLUMNS_QUERY.uiTableId,
      );
      const allColumns = Array.isArray(matchingTable?.columns) ? matchingTable.columns : [];
      const nextColumnConfigs = allColumns.filter((c) => c.uiTblClmIsActive !== false);
      uiColumnConfigsRef.current = nextColumnConfigs;
      setUiColumnConfigs(nextColumnConfigs);
      setIsColumnSettingsOpen(false);
    } catch {
      // useApi handles error toast behavior.
    } finally {
      setIsColumnSettingsSaving(false);
    }
  }, [
    columnSettingsDraft,
    columnSettingsRows,
    isColumnSettingsOpen,
    listUiTableColumns,
    saveUiTableColumn,
  ]);
  useEffect(() => {
    if (!isColumnSettingsOpen || typeof document === "undefined") {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeColumnSettings();
      }
      if (event.key === "F5") {
        event.preventDefault();
        void saveColumnSettings();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeColumnSettings, isColumnSettingsOpen, saveColumnSettings]);
  useEffect(() => {
    setColumns((current) => mergeResolvedColumns(current, resolvedColumns));
  }, [resolvedColumns]);
  const editorSignature = useMemo(
    () =>
      buildOpeningStockEditorSignature({
        loadedVoucherId,
        voucherDate,
        voucherRefNo,
        rows,
      }),
    [loadedVoucherId, rows, voucherDate, voucherRefNo],
  );
  const hasUnsavedChanges = editorSignature !== cleanEditorSignatureRef.current;
  const draftRows = useMemo(() => rows.filter((row) => !isPristineRow(row)), [rows]);
  const draftTotals = useMemo(() => getTotals(draftRows), [draftRows]);
  const visibleTotals = useMemo(() => getTotals(renderedRows), [renderedRows]);
  const selectedOpeningStockListRow = useMemo(
    () =>
      openingStockListRows.find(
        (row) => row.avh_voucher_id === selectedOpeningStockListVoucherId,
      ) ?? null,
    [openingStockListRows, selectedOpeningStockListVoucherId],
  );
  const hasSelectedGodown = useMemo(
    () => rows.some((row) => Boolean(row.values.oslgodownid?.trim())),
    [rows],
  );
  useEffect(() => {
    setCompanySelectionLocked(hasSelectedGodown);
    setBranchSelectionLocked(hasSelectedGodown);
    return () => {
      setCompanySelectionLocked(false);
      setBranchSelectionLocked(false);
    };
  }, [
    hasSelectedGodown,
    setBranchSelectionLocked,
    setCompanySelectionLocked,
  ]);
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);
  const markEditorStateAsClean = useCallback((nextState: OpeningStockEditorState) => {
    cleanEditorSignatureRef.current = buildOpeningStockEditorSignature(nextState);
  }, []);
  const enableUnsafeNavigationBypass = useCallback(() => {
    allowUnsafeNavigationRef.current = true;
    if (allowUnsafeNavigationTimeoutRef.current !== null) {
      window.clearTimeout(allowUnsafeNavigationTimeoutRef.current);
    }
    allowUnsafeNavigationTimeoutRef.current = window.setTimeout(() => {
      allowUnsafeNavigationRef.current = false;
      allowUnsafeNavigationTimeoutRef.current = null;
    }, 10_000);
  }, []);
  const requestUnsafeNavigationConfirmation = useCallback((navigate: () => void) => {
    pendingUnsafeNavigationRef.current = navigate;
    setIsUnsavedChangesConfirmOpen(true);
  }, []);
  const handleCancelUnsafeNavigation = useCallback(() => {
    pendingUnsafeNavigationRef.current = null;
    setIsUnsavedChangesConfirmOpen(false);
  }, []);
  const handleConfirmUnsafeNavigation = useCallback(() => {
    const pendingNavigation = pendingUnsafeNavigationRef.current;
    pendingUnsafeNavigationRef.current = null;
    setIsUnsavedChangesConfirmOpen(false);
    if (!pendingNavigation) {
      return;
    }
    enableUnsafeNavigationBypass();
    pendingNavigation();
  }, [enableUnsafeNavigationBypass]);
  useEffect(() => {
    return () => {
      if (allowUnsafeNavigationTimeoutRef.current !== null) {
        window.clearTimeout(allowUnsafeNavigationTimeoutRef.current);
      }
    };
  }, []);
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChangesRef.current || allowUnsafeNavigationRef.current) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);
  useEffect(() => {
    const mutableRouter = router as typeof router & {
      push: typeof router.push;
      replace: typeof router.replace;
      back: typeof router.back;
      forward: typeof router.forward;
    };
    const originalPush = router.push;
    const originalReplace = router.replace;
    const originalBack = router.back;
    const originalForward = router.forward;
    mutableRouter.push = ((href, options) => {
      if (
        allowUnsafeNavigationRef.current ||
        !hasUnsavedChangesRef.current ||
        isSameNavigationTarget(href)
      ) {
        originalPush.call(router, href, options);
        return;
      }
      requestUnsafeNavigationConfirmation(() => {
        originalPush.call(router, href, options);
      });
    }) as typeof router.push;
    mutableRouter.replace = ((href, options) => {
      if (
        allowUnsafeNavigationRef.current ||
        !hasUnsavedChangesRef.current ||
        isSameNavigationTarget(href)
      ) {
        originalReplace.call(router, href, options);
        return;
      }
      requestUnsafeNavigationConfirmation(() => {
        originalReplace.call(router, href, options);
      });
    }) as typeof router.replace;
    mutableRouter.back = (() => {
      if (allowUnsafeNavigationRef.current || !hasUnsavedChangesRef.current) {
        originalBack.call(router);
        return;
      }
      requestUnsafeNavigationConfirmation(() => {
        originalBack.call(router);
      });
    }) as typeof router.back;
    mutableRouter.forward = (() => {
      if (allowUnsafeNavigationRef.current || !hasUnsavedChangesRef.current) {
        originalForward.call(router);
        return;
      }
      requestUnsafeNavigationConfirmation(() => {
        originalForward.call(router);
      });
    }) as typeof router.forward;
    return () => {
      mutableRouter.push = originalPush;
      mutableRouter.replace = originalReplace;
      mutableRouter.back = originalBack;
      mutableRouter.forward = originalForward;
    };
  }, [requestUnsafeNavigationConfirmation, router]);
  useEffect(() => {
    const handleDocumentClickCapture = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        allowUnsafeNavigationRef.current ||
        !hasUnsavedChangesRef.current
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      if (anchor.target && anchor.target !== "_self") {
        return;
      }
      if (anchor.hasAttribute("download")) {
        return;
      }
      const currentUrl = new URL(window.location.href);
      const nextUrl = new URL(anchor.href, currentUrl);
      if (nextUrl.href === currentUrl.href) {
        return;
      }
      event.preventDefault();
      requestUnsafeNavigationConfirmation(() => {
        if (nextUrl.origin === currentUrl.origin) {
          notifyGlobalNavigationStart();
          router.push(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
          return;
        }
        notifyGlobalNavigationStart();
        window.location.assign(nextUrl.href);
      });
    };
    document.addEventListener("click", handleDocumentClickCapture, true);
    return () => {
      document.removeEventListener("click", handleDocumentClickCapture, true);
    };
  }, [requestUnsafeNavigationConfirmation, router]);
  const loadOpeningStockList = useCallback(async () => {
    if (!isOpeningStockListOpen) {
      return;
    }
    const requestId = openingStockListRequestRef.current + 1;
    openingStockListRequestRef.current = requestId;
    setIsOpeningStockListLoading(true);
    setOpeningStockListError(null);
    try {
      const payload = await listOpeningStockRecords({
        query: {
          page: String(openingStockListPage),
          limit: String(openingStockListPageSize),
          ...(openingStockListFilters.search.trim()
            ? { search: openingStockListFilters.search.trim() }
            : {}),
          ...(openingStockListFilters.dateFrom
            ? { date_from: openingStockListFilters.dateFrom }
            : {}),
          ...(openingStockListFilters.dateTo
            ? { date_to: openingStockListFilters.dateTo }
            : {}),
        },
      });
      if (openingStockListRequestRef.current !== requestId) {
        return;
      }
      const nextRows = Array.isArray(payload?.data) ? payload.data : [];
      const nextMeta = payload?.meta;
      setOpeningStockListRows(nextRows);
      setOpeningStockListMeta({
        page:
          typeof nextMeta?.page === "number" && Number.isFinite(nextMeta.page)
            ? nextMeta.page
            : openingStockListPage,
        limit:
          typeof nextMeta?.limit === "number" && Number.isFinite(nextMeta.limit)
            ? nextMeta.limit
            : openingStockListPageSize,
        total:
          typeof nextMeta?.total === "number" && Number.isFinite(nextMeta.total)
            ? nextMeta.total
            : nextRows.length,
        total_pages:
          typeof nextMeta?.total_pages === "number" && Number.isFinite(nextMeta.total_pages)
            ? nextMeta.total_pages
            : nextRows.length > 0
              ? 1
              : 0,
      });
    } catch (error) {
      const aborted =
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        (error as { name?: string }).name &&
        ["AbortError", "CanceledError"].includes((error as { name?: string }).name ?? "");
      if (aborted) {
        return;
      }
      if (openingStockListRequestRef.current !== requestId) {
        return;
      }
      setOpeningStockListRows([]);
      setOpeningStockListMeta({
        ...EMPTY_OPENING_STOCK_LIST_META,
        page: openingStockListPage,
        limit: openingStockListPageSize,
      });
      setOpeningStockListError(getOpeningStockListErrorMessage(error));
    } finally {
      if (openingStockListRequestRef.current === requestId) {
        setIsOpeningStockListLoading(false);
      }
    }
  }, [
    isOpeningStockListOpen,
    listOpeningStockRecords,
    openingStockListFilters.dateFrom,
    openingStockListFilters.dateTo,
    openingStockListFilters.search,
    openingStockListPage,
    openingStockListPageSize,
  ]);
  const handleOpenOpeningStockList = useCallback(() => {
    setOpeningStockListPage(1);
    setOpeningStockListFilters(createOpeningStockListFiltersForToday());
    dispatch(listModalToggled(true));
    setOpeningStockListError(null);
  }, []);
  const handleCloseOpeningStockList = useCallback(() => {
    openingStockListRequestRef.current += 1;
    dispatch(listModalToggled(false));
    setIsOpeningStockListLoading(false);
    setOpeningStockListError(null);
    setOpeningStockListPage(1);
    setOpeningStockListFilters(DEFAULT_OPENING_STOCK_LIST_FILTERS);
    dispatch(selectedDocumentIdSet(null));
  }, []);
  const handleOpeningStockListSearchChange = useCallback((search: string) => {
    setOpeningStockListPage(1);
    setOpeningStockListFilters((current) => ({ ...current, search }));
  }, []);
  const handleOpeningStockListDateFromChange = useCallback((dateFrom: string) => {
    setOpeningStockListPage(1);
    setOpeningStockListFilters((current) => ({ ...current, dateFrom }));
  }, []);
  const handleOpeningStockListDateToChange = useCallback((dateTo: string) => {
    setOpeningStockListPage(1);
    setOpeningStockListFilters((current) => ({ ...current, dateTo }));
  }, []);
  const handleOpeningStockListPageSizeChange = useCallback((pageSize: number) => {
    setOpeningStockListPage(1);
    setOpeningStockListPageSize(pageSize);
  }, []);
  const handleOpeningStockListRowSelect = useCallback((row: OpeningStockHeaderPayload) => {
    dispatch(selectedDocumentIdSet(row.avh_voucher_id));
  }, []);
  useEffect(() => {
    if (!isOpeningStockListOpen) {
      return;
    }
    void loadOpeningStockList();
  }, [isOpeningStockListOpen, loadOpeningStockList]);
  useEffect(() => {
    if (!isOpeningStockListOpen) {
      return;
    }
    const shouldKeep =
      selectedOpeningStockListVoucherId &&
      openingStockListRows.some((row) => row.avh_voucher_id === selectedOpeningStockListVoucherId);
    if (!shouldKeep) {
      dispatch(selectedDocumentIdSet(openingStockListRows[0]?.avh_voucher_id ?? null));
    }
  }, [dispatch, isOpeningStockListOpen, openingStockListRows, selectedOpeningStockListVoucherId]);
  useEffect(() => {
    const handleF5KeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "F5" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }
      event.preventDefault();
      if (isOpeningStockListOpen) {
        void loadOpeningStockList();
        return;
      }
      handleOpenOpeningStockList();
    };
    window.addEventListener("keydown", handleF5KeyDown);
    return () => {
      window.removeEventListener("keydown", handleF5KeyDown);
    };
  }, [handleOpenOpeningStockList, isOpeningStockListOpen, loadOpeningStockList]);
  useEffect(() => {
    const handleAltCKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "c" || !event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const activeEl = document.activeElement as HTMLElement | null;
      const rowIdStr = activeEl?.dataset?.openingStockRowId;
      if (!rowIdStr) {
        return;
      }
      const rowId = Number(rowIdStr);
      if (!Number.isFinite(rowId)) {
        return;
      }
      event.preventDefault();
      const nextRequest: InlineItemMasterRequest = {
        itemId: "",
        mode: "create",
        query: "",
        rowId,
      };
      setInlineItemMasterSession(nextRequest);
      pendingInlineItemMasterRequestRef.current = nextRequest;
      setIsInlineItemMasterOpen(true);
    };
    window.addEventListener("keydown", handleAltCKeyDown);
    return () => {
      window.removeEventListener("keydown", handleAltCKeyDown);
    };
  }, []);
  useEffect(() => {
    const handleAltAKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "a" || !event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const activeEl = document.activeElement as HTMLElement | null;
      const rowIdStr = activeEl?.dataset?.openingStockRowId;
      if (!rowIdStr) {
        return;
      }
      const rowId = Number(rowIdStr);
      if (!Number.isFinite(rowId)) {
        return;
      }
      const row = rows.find((r) => r.id === rowId);
      const itemId = row?.values.oslitemid?.trim() ?? "";
      if (!itemId) {
        toast.info("Select an existing item in the row, then press Alt+A.");
        return;
      }
      event.preventDefault();
      const nextRequest: InlineItemMasterRequest = {
        itemId,
        mode: "update",
        query: row?.values.itemname?.trim() ?? "",
        rowId,
      };
      setInlineItemMasterSession(nextRequest);
      pendingInlineItemMasterRequestRef.current = nextRequest;
      setIsInlineItemMasterOpen(true);
    };
    window.addEventListener("keydown", handleAltAKeyDown);
    return () => {
      window.removeEventListener("keydown", handleAltAKeyDown);
    };
  }, [rows]);
  useEffect(() => {
    if (Object.keys(invalidFieldKeys).length === 0) {
      return;
    }
    setInvalidFieldKeys((current) => {
      let changed = false;
      const next = { ...current };
      for (const invalidFieldKey of Object.keys(current)) {
        const separatorIndex = invalidFieldKey.indexOf(":");
        if (separatorIndex === -1) {
          continue;
        }
        const rowId = Number(invalidFieldKey.slice(0, separatorIndex));
        const fieldKey = invalidFieldKey.slice(separatorIndex + 1);
        const row = rows.find((candidate) => candidate.id === rowId);
        if (!row || isValidationFieldSatisfied(row, fieldKey)) {
          delete next[invalidFieldKey];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [invalidFieldKeys, rows]);
  const accountingYear = formatAccountingYear(voucherDate);
  useEffect(() => {
    if (!loadedVoucherId || !loadedDocumentMeta || isBusinessContextLoading) {
      return;
    }
    const currentCompanyId = activeCompany?.id ?? null;
    const currentBranchId = activeBranch?.id ?? null;
    if (
      currentCompanyId === loadedDocumentMeta.companyId &&
      currentBranchId === loadedDocumentMeta.branchId
    ) {
      return;
    }
    setLoadedVoucherId(null);
    setLoadedDocumentMeta(null);
  }, [
    activeBranch?.id,
    activeCompany?.id,
    isBusinessContextLoading,
    loadedDocumentMeta,
    loadedVoucherId,
  ]);
  const prefetchLoadedItemDetails = useCallback(
    async (details: OpeningStockDocumentPayload["details"]) => {
      const itemIds = Array.from(
        new Set(
          details
            .map((detail) => detail.osl_item_id.trim())
            .filter((itemId): itemId is string => itemId.length > 0),
        ),
      );
      if (itemIds.length === 0) {
        return;
      }
      const itemDetails = await Promise.allSettled(
        itemIds.map((itemId) => triggerItemPriceDetails({ itemId }, true).unwrap()),
      );
      const nextItemDetailsById: Record<string, ItemPriceDetailsPayload> = {};
      for (const itemDetail of itemDetails) {
        if (itemDetail.status !== "fulfilled") {
          continue;
        }
        nextItemDetailsById[itemDetail.value.item.item_id] = itemDetail.value;
      }
      if (Object.keys(nextItemDetailsById).length > 0) {
        setItemDetailsByItemId((current) => ({
          ...current,
          ...nextItemDetailsById,
        }));
      }
    },
    [triggerItemPriceDetails],
  );
  const getNextRowValuesWithDerivedPrices = useCallback(
    (values: OpeningStockRow["values"], sourceField?: string): OpeningStockRow["values"] => {
      const nextValues = {
        ...values,
      };
      if (sourceField === "costwot") {
        nextValues.costprice = getOpeningStockCostInputValue(values.costwot, values.osltaxperc);
      } else {
        nextValues.costwot = getOpeningStockCostWotInputValue(values.costprice, values.osltaxperc);
      }
      const changedSalePair = sourceField
        ? OPENING_STOCK_SALE_PRICE_FIELD_PAIRS.find(
          ({ markupField, saleField, saleWotField }) =>
            sourceField === saleField ||
            sourceField === saleWotField ||
            sourceField === markupField,
        )
        : undefined;
      if (changedSalePair) {
        Object.assign(
          nextValues,
          getOpeningStockSalePairDerivedValues(
            nextValues,
            changedSalePair,
            sourceField === changedSalePair.saleWotField
              ? "saleWot"
              : sourceField === changedSalePair.markupField
                ? "markup"
                : "sale",
          ),
        );
        return nextValues;
      }
      if (
        sourceField === "costwot" ||
        sourceField === "costprice" ||
        sourceField === "profittype" ||
        sourceField === "roundoff"
      ) {
        for (const salePair of OPENING_STOCK_SALE_PRICE_FIELD_PAIRS) {
          Object.assign(
            nextValues,
            getOpeningStockSalePairDerivedValues(nextValues, salePair, "markup"),
          );
        }
        return nextValues;
      }
      for (const salePair of OPENING_STOCK_SALE_PRICE_FIELD_PAIRS) {
        Object.assign(nextValues, getOpeningStockSalePairDerivedValues(nextValues, salePair));
      }
      return nextValues;
    },
    [],
  );
  const handleRowChange = useCallback(
    (rowId: number, field: string, value: string) => {
      setRows((currentRows) =>
        currentRows.map((row) =>
          row.id === rowId
            ? (() => {
              const nextValues = {
                ...row.values,
                [field]: value,
              };
              const itemId = nextValues.oslitemid?.trim() ?? "";
              const itemDetail = itemId ? itemDetailsByItemId[itemId] : undefined;
              if (field === "osltaxid") {
                const normalizedTaxId = value.trim();
                nextValues.taxname = normalizedTaxId
                  ? taxOptionsByValue.get(normalizedTaxId) ?? ""
                  : "";
                nextValues.osltaxperc = DEFAULT_ROW_VALUES.osltaxperc ?? "";
                nextValues.oslcesstype = DEFAULT_ROW_VALUES.oslcesstype ?? "NONE";
                nextValues.oslcessperc = DEFAULT_ROW_VALUES.oslcessperc ?? "";
                nextValues.oslcessperunit = DEFAULT_ROW_VALUES.oslcessperunit ?? "";
              }
              const changedSalePair = OPENING_STOCK_SALE_PRICE_FIELD_PAIRS.find(
                ({ markupField, saleField, saleWotField }) =>
                  field === saleField ||
                  field === saleWotField ||
                  field === markupField,
              );
              if (
                changedSalePair ||
                field === "costwot" ||
                field === "costprice" ||
                field === "profittype" ||
                field === "roundoff" ||
                field === "osltaxid" ||
                field === "osltaxperc"
              ) {
                Object.assign(
                  nextValues,
                  getNextRowValuesWithDerivedPrices(nextValues, field),
                );
              }
              if (field === "openingqty" || field === "freeqty" || field === "convfactor") {
                const convFactor =
                  field === "convfactor"
                    ? parseDecimal(nextValues.oslactualconvfactor) || parseDecimal(value) || 1
                    : getOpeningStockActualConvFactor(nextValues);
                nextValues.baseqty = formatQuantityValue(
                  parseDecimal(field === "openingqty" ? value : nextValues.openingqty) *
                  convFactor,
                );
                nextValues.freebaseqty = formatQuantityValue(
                  parseDecimal(field === "freeqty" ? value : nextValues.freeqty) * convFactor,
                );
              }
              if (field === "osltrackingtype") {
                const nextTrackingRow = {
                  ...row,
                  values: nextValues,
                };
                const normalizedTrackingType = normalizeOpeningStockTrackingType(value);
                if (!isOpeningStockBatchNumberEditable(nextTrackingRow, itemDetail)) {
                  nextValues.batchno = "";
                }
                if (normalizedTrackingType !== "2") {
                  nextValues.serialno = "";
                  nextValues.batchdate = "";
                  nextValues.mfgdate = "";
                  nextValues.expirydate = "";
                }
              }
              return {
                ...row,
                values: nextValues,
              };
            })()
            : row,
        ),
      );
      if (field === "osltaxid") {
        const normalizedTaxId = value.trim();
        const requestId = (taxDetailRequestRef.current[rowId] ?? 0) + 1;
        taxDetailRequestRef.current[rowId] = requestId;
        if (!normalizedTaxId) {
          return;
        }
        void (async () => {
          try {
            const taxDetail = await triggerItemTaxById({ taxId: normalizedTaxId }, true).unwrap();
            if (taxDetailRequestRef.current[rowId] !== requestId) {
              return;
            }
            setRows((currentRows) =>
              currentRows.map((row) =>
                row.id === rowId && (row.values.osltaxid ?? "").trim() === normalizedTaxId
                  ? (() => {
                    const nextTaxValues = buildTaxSelectionValues(taxDetail);
                    return {
                      ...row,
                      values: getNextRowValuesWithDerivedPrices({
                        ...row.values,
                        ...nextTaxValues,
                      }),
                    };
                  })()
                  : row,
              ),
            );
          } catch {
            // Keep the typed tax ID and cleared cess fields when tax lookup fails.
          }
        })();
      }
      if (field === "osltrackingtype") {
        setInvalidFieldKeys((current) =>
          clearInvalidFieldKeys(current, rowId, TRACKING_VALIDATION_FIELD_KEYS),
        );
        return;
      }
      if (!toNullableTrimmedString(value)) {
        return;
      }
      setInvalidFieldKeys((current) => clearInvalidFieldKeys(current, rowId, [field]));
    },
    [
      getNextRowValuesWithDerivedPrices,
      itemDetailsByItemId,
      taxOptionsByValue,
      triggerItemTaxById,
    ],
  );
  const handleUomChange = useCallback(
    (rowId: number, unitId: string) => {
      setRows((currentRows) =>
        currentRows.map((row) => {
          if (row.id !== rowId) {
            return row;
          }
          const itemId = row.values.oslitemid?.trim() ?? "";
          const itemDetail = itemId ? itemDetailsByItemId[itemId] : undefined;
          if (!itemDetail) {
            return row;
          }
          const priceRecord = resolveItemPriceRecordByUnitId(itemDetail, unitId);
          return {
            ...row,
            values: {
              ...row.values,
              ...buildPriceSelectionValues(
                itemDetail,
                priceRecord,
                unitOptionsByValue,
                godownOptionsByValue,
                row.values,
              ),
            },
          };
        }),
      );
      if (toNullableTrimmedString(unitId)) {
        setInvalidFieldKeys((current) => clearInvalidFieldKeys(current, rowId, ["uom"]));
      }
    },
    [godownOptionsByValue, itemDetailsByItemId, unitOptionsByValue],
  );
  const handleLookupSelection = useCallback(
    (rowId: number, lookupKind: LookupKind, option: ERPDynamicSelectOption) => {
      if (lookupKind !== "item") {
        const fieldConfig = LOOKUP_FIELD_CONFIG[lookupKind];
        setRows((currentRows) =>
          currentRows.map((row) =>
            row.id === rowId
              ? {
                ...row,
                values: {
                  ...row.values,
                  [fieldConfig.labelField]: option.value ? option.label : "",
                  [fieldConfig.idField]: option.value,
                },
              }
              : row,
          ),
        );
        if (option.value) {
          setInvalidFieldKeys((current) =>
            clearInvalidFieldKeys(current, rowId, [fieldConfig.labelField]),
          );
        }
        setOpenLookupCell(null);
        setLookupSearchQuery("");
        return;
      }
      const requestId = (itemDetailRequestRef.current[rowId] ?? 0) + 1;
      itemDetailRequestRef.current[rowId] = requestId;
      setRows((currentRows) =>
        ensureTrailingEmptyRow(
          currentRows.map((row) =>
            row.id === rowId
              ? {
                ...row,
                values: {
                  ...row.values,
                  ...buildPendingItemSelectionValues(option),
                },
              }
              : row,
          ),
          rowId,
        ),
      );
      if (option.value) {
        setInvalidFieldKeys((current) =>
          clearInvalidFieldKeys(current, rowId, ["itemname", ...TRACKING_VALIDATION_FIELD_KEYS]),
        );
      }
      setOpenLookupCell(null);
      setLookupSearchQuery("");
      if (!option.value) {
        return;
      }
      const cachedDetail = itemDetailsByItemId[option.value];
      if (cachedDetail) {
        setRows((currentRows) =>
          currentRows.map((row) => {
            if (row.id !== rowId || (row.values.oslitemid ?? "").trim() !== option.value) {
              return row;
            }
            return {
              ...row,
              values: {
                ...row.values,
                ...buildItemAutofillValues(
                  cachedDetail,
                  unitOptionsByValue,
                  godownOptionsByValue,
                  taxOptionsByValue,
                  row.values,
                  option.label,
                ),
              },
            };
          }),
        );
        const cachedDefaultTaxId = cachedDetail.item.item_default_tax_id?.trim() ?? "";
        if (!cachedDetail.item_tax && cachedDefaultTaxId) {
          void (async () => {
            try {
              const taxDetail = await triggerItemTaxById(
                { taxId: cachedDefaultTaxId },
                true,
              ).unwrap();
              if (itemDetailRequestRef.current[rowId] !== requestId) {
                return;
              }
              setRows((currentRows) =>
                currentRows.map((row) =>
                  row.id === rowId && (row.values.oslitemid ?? "").trim() === option.value
                    ? (() => {
                      const nextTaxValues = buildTaxSelectionValues(taxDetail);
                      return {
                        ...row,
                        values: getNextRowValuesWithDerivedPrices({
                          ...row.values,
                          ...nextTaxValues,
                        }),
                      };
                    })()
                    : row,
                ),
              );
            } catch {
              // Keep the fallback tax label and ID when tax detail lookup fails.
            }
          })();
        }
        return;
      }
      void (async () => {
        try {
          const detail = await triggerItemPriceDetails({ itemId: option.value }, true).unwrap();
          if (itemDetailRequestRef.current[rowId] !== requestId) {
            return;
          }
          setItemDetailsByItemId((current) => ({
            ...current,
            [detail.item.item_id]: detail,
          }));
          setRows((currentRows) =>
            currentRows.map((row) => {
              if (row.id !== rowId || (row.values.oslitemid ?? "").trim() !== option.value) {
                return row;
              }
              return {
                ...row,
                values: {
                  ...row.values,
                  ...buildItemAutofillValues(
                    detail,
                    unitOptionsByValue,
                    godownOptionsByValue,
                    taxOptionsByValue,
                    row.values,
                    option.label,
                  ),
                },
              };
            }),
          );
          const detailDefaultTaxId = detail.item.item_default_tax_id?.trim() ?? "";
          if (!detail.item_tax && detailDefaultTaxId) {
            try {
              const taxDetail = await triggerItemTaxById(
                { taxId: detailDefaultTaxId },
                true,
              ).unwrap();
              if (itemDetailRequestRef.current[rowId] !== requestId) {
                return;
              }
              setRows((currentRows) =>
                currentRows.map((row) =>
                  row.id === rowId && (row.values.oslitemid ?? "").trim() === option.value
                    ? (() => {
                      const nextTaxValues = buildTaxSelectionValues(taxDetail);
                      return {
                        ...row,
                        values: getNextRowValuesWithDerivedPrices({
                          ...row.values,
                          ...nextTaxValues,
                        }),
                      };
                    })()
                    : row,
                ),
              );
            } catch {
              // Keep the fallback tax label and ID when tax detail lookup fails.
            }
          }
        } catch (error) {
          if (itemDetailRequestRef.current[rowId] !== requestId) {
            return;
          }
          const message =
            error &&
              typeof error === "object" &&
              "message" in error &&
              typeof error.message === "string"
              ? error.message
              : "Failed to load item price details.";
          toast.error(message, {
            toastId: `opening-stock-item-price-details:${option.value}`,
          });
        }
      })();
    },
    [
      getNextRowValuesWithDerivedPrices,
      godownOptionsByValue,
      itemDetailsByItemId,
      taxOptionsByValue,
      triggerItemPriceDetails,
      triggerItemTaxById,
      unitOptionsByValue,
    ],
  );
  const handleCloseInlineItemMaster = useCallback((closeModal = true) => {
    if (closeModal) {
      inlineItemMasterControllerRef.current?.closeModal();
    }
    inlineItemMasterControllerRef.current = null;
    pendingInlineItemMasterRequestRef.current = null;
    setInlineItemMasterSession(null);
    setIsInlineItemMasterOpen(false);
  }, []);
  const handleCloseInlineGodownMaster = useCallback((closeModal = true) => {
    if (closeModal) {
      inlineGodownMasterControllerRef.current?.closeModal();
    }
    inlineGodownMasterControllerRef.current = null;
    pendingInlineGodownMasterRequestRef.current = null;
    setInlineGodownMasterSession(null);
    setIsInlineGodownMasterOpen(false);
  }, []);
  const handleInlineItemMasterControllerReady = useCallback(
    (controller: CrudMasterPageController | null) => {
      inlineItemMasterControllerRef.current = controller;
      if (!controller) {
        return;
      }
      const request = pendingInlineItemMasterRequestRef.current;
      if (!request) {
        return;
      }
      pendingInlineItemMasterRequestRef.current = null;
      if (request.mode === "create") {
        controller.openCreate({
          values: request.query
            ? {
              item_name_en: request.query,
            }
            : undefined,
        });
        return;
      }
      void controller.openUpdateById(request.itemId);
    },
    [],
  );
  const handleInlineGodownMasterControllerReady = useCallback(
    (controller: CrudMasterPageController | null) => {
      inlineGodownMasterControllerRef.current = controller;
      if (!controller) {
        return;
      }
      const request = pendingInlineGodownMasterRequestRef.current;
      if (!request) {
        return;
      }
      pendingInlineGodownMasterRequestRef.current = null;
      if (request.mode === "create") {
        controller.openCreate({
          values: request.query
            ? {
              masterName: request.query,
            }
            : undefined,
        });
        return;
      }
      void controller.openUpdateById(request.godownId);
    },
    [],
  );
  const handleInlineItemMasterModalOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        handleCloseInlineItemMaster(false);
      }
    },
    [handleCloseInlineItemMaster],
  );
  const handleInlineGodownMasterModalOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        handleCloseInlineGodownMaster(false);
      }
    },
    [handleCloseInlineGodownMaster],
  );
  const handleItemLookupCreateShortcut = useCallback(
    (rowId: number, payload: ERPDynamicSearchShortcutPayload) => {
      const nextRequest: InlineItemMasterRequest = {
        itemId: "",
        mode: "create",
        query: payload.query.trim(),
        rowId,
      };
      setInlineItemMasterSession(nextRequest);
      pendingInlineItemMasterRequestRef.current = nextRequest;
      setIsInlineItemMasterOpen(true);
    },
    [],
  );
  const handleItemLookupEditShortcut = useCallback(
    (rowId: number, payload: ERPDynamicSearchShortcutPayload) => {
      const matchedOption = resolveOptionFromShortcut(payload, itemOptions);
      const itemId = payload.value.trim() || matchedOption?.value.trim() || "";
      if (!itemId) {
        toast.info("Type/select an existing item, then press Alt+A.");
        return;
      }
      const nextRequest: InlineItemMasterRequest = {
        itemId,
        mode: "update",
        query: payload.query.trim(),
        rowId,
      };
      setInlineItemMasterSession(nextRequest);
      pendingInlineItemMasterRequestRef.current = nextRequest;
      setIsInlineItemMasterOpen(true);
    },
    [itemOptions],
  );
  const handleGodownLookupCreateShortcut = useCallback(
    (rowId: number, payload: ERPDynamicSearchShortcutPayload) => {
      const nextRequest: InlineGodownMasterRequest = {
        godownId: "",
        mode: "create",
        query: payload.query.trim(),
        rowId,
      };
      setInlineGodownMasterSession(nextRequest);
      pendingInlineGodownMasterRequestRef.current = nextRequest;
      setIsInlineGodownMasterOpen(true);
    },
    [],
  );
  const handleGodownLookupEditShortcut = useCallback(
    (rowId: number, payload: ERPDynamicSearchShortcutPayload) => {
      const matchedOption = resolveOptionFromShortcut(payload, godownOptions);
      const godownId = payload.value.trim() || matchedOption?.value.trim() || "";
      if (!godownId) {
        toast.info("Type/select an existing godown, then press Alt+A.");
        return;
      }
      const nextRequest: InlineGodownMasterRequest = {
        godownId,
        mode: "update",
        query: payload.query.trim(),
        rowId,
      };
      setInlineGodownMasterSession(nextRequest);
      pendingInlineGodownMasterRequestRef.current = nextRequest;
      setIsInlineGodownMasterOpen(true);
    },
    [godownOptions],
  );
  const handleInlineItemMasterSaved = useCallback(
    async (params: {
      itemId: string;
      shouldUpdate: boolean;
      values: Record<string, string>;
    }) => {
      const activeRequest = inlineItemMasterSession;
      if (!activeRequest) {
        handleCloseInlineItemMaster();
        return;
      }
      const itemName =
        params.values.item_name_en?.trim() ||
        params.values.masterName?.trim() ||
        activeRequest.query;
      let refreshedOptions: StockLookupOption[] = [];
      try {
        refreshedOptions = await loadLookupOptions("item", itemName);
      } catch {
        refreshedOptions = [];
      }
      let resolvedOption =
        refreshedOptions.find((option) => option.value.trim() === params.itemId) ??
        itemOptions.find((option) => option.value.trim() === params.itemId) ??
        null;
      if (!resolvedOption && params.itemId.trim()) {
        resolvedOption = {
          label: itemName || params.itemId,
          value: params.itemId,
        };
      }
      if (resolvedOption) {
        setItemOptions((currentOptions) =>
          mergeLookupOptions(
            currentOptions.filter((option) => option.value !== resolvedOption?.value),
            [resolvedOption],
          ),
        );
        handleLookupSelection(activeRequest.rowId, "item", resolvedOption);
      } else if (refreshedOptions.length > 0) {
        setItemOptions((currentOptions) => mergeLookupOptions(currentOptions, refreshedOptions));
      }
      setOpenLookupCell(null);
      setLookupSearchQuery("");
      handleCloseInlineItemMaster();
    },
    [
      handleCloseInlineItemMaster,
      handleLookupSelection,
      inlineItemMasterSession,
      itemOptions,
      loadLookupOptions,
    ],
  );
  const handleInlineGodownMasterSaved = useCallback(
    async (params: {
      godownId: string;
      shouldUpdate: boolean;
      values: Record<string, string>;
    }) => {
      const activeRequest = inlineGodownMasterSession;
      if (!activeRequest) {
        handleCloseInlineGodownMaster();
        return;
      }
      const godownName = params.values.masterName?.trim() || activeRequest.query;
      let refreshedOptions: StockLookupOption[] = [];
      try {
        refreshedOptions = await loadLookupOptions("godown", godownName);
      } catch {
        refreshedOptions = [];
      }
      let resolvedOption =
        refreshedOptions.find((option) => option.value.trim() === params.godownId) ??
        godownOptions.find((option) => option.value.trim() === params.godownId) ??
        null;
      if (!resolvedOption && params.godownId.trim()) {
        resolvedOption = {
          label: godownName || params.godownId,
          value: params.godownId,
        };
      }
      if (resolvedOption) {
        setGodownOptions((currentOptions) =>
          mergeLookupOptions(
            currentOptions.filter((option) => option.value !== resolvedOption?.value),
            [resolvedOption],
          ),
        );
        handleLookupSelection(activeRequest.rowId, "godown", resolvedOption);
      } else if (refreshedOptions.length > 0) {
        setGodownOptions((currentOptions) => mergeLookupOptions(currentOptions, refreshedOptions));
      }
      setOpenLookupCell(null);
      setLookupSearchQuery("");
      handleCloseInlineGodownMaster();
    },
    [
      godownOptions,
      handleCloseInlineGodownMaster,
      handleLookupSelection,
      inlineGodownMasterSession,
      loadLookupOptions,
    ],
  );
  const handleLookupSearchChange = useCallback(
    (lookupKind: LookupKind, search: string) => {
      const normalizedSearch = search.trim();
      if (lookupKind === "item") {
        if (itemSearchTimeoutRef.current !== null) {
          window.clearTimeout(itemSearchTimeoutRef.current);
        }
        if (!normalizedSearch) {
          return;
        }
        const requestId = itemSearchRequestRef.current + 1;
        itemSearchRequestRef.current = requestId;
        itemSearchTimeoutRef.current = window.setTimeout(() => {
          void (async () => {
            try {
              const searchedOptions = await loadLookupOptions("item", normalizedSearch);
              if (itemSearchRequestRef.current !== requestId) {
                return;
              }
              setItemOptions((currentOptions) =>
                mergeLookupOptions(currentOptions, searchedOptions),
              );
            } catch {
              // Keep existing options when live item lookup search fails.
            }
          })();
        }, LOOKUP_SEARCH_DEBOUNCE_MS);
        return;
      }
      if (godownSearchTimeoutRef.current !== null) {
        window.clearTimeout(godownSearchTimeoutRef.current);
      }
      if (!normalizedSearch) {
        return;
      }
      const requestId = godownSearchRequestRef.current + 1;
      godownSearchRequestRef.current = requestId;
      godownSearchTimeoutRef.current = window.setTimeout(() => {
        void (async () => {
          try {
            const searchedOptions = await loadLookupOptions("godown", normalizedSearch);
            if (godownSearchRequestRef.current !== requestId) {
              return;
            }
            setGodownOptions((currentOptions) =>
              mergeLookupOptions(currentOptions, searchedOptions),
            );
          } catch {
            // Keep existing options when live godown lookup search fails.
          }
        })();
      }, LOOKUP_SEARCH_DEBOUNCE_MS);
    },
    [loadLookupOptions],
  );
  const handleLookupSearchInputChange = useCallback(
    (lookupKind: LookupKind, search: string) => {
      setLookupSearchQuery(search);
      handleLookupSearchChange(lookupKind, search);
    },
    [handleLookupSearchChange],
  );
  const handleLookupToggle = useCallback((cellKey: string, lookupKind: LookupKind) => {
    setOpenLookupCell((currentCell) =>
      currentCell?.key === cellKey ? null : { key: cellKey, kind: lookupKind },
    );
    setLookupSearchQuery("");
  }, []);
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

  const handleColumnDrop = useCallback((targetKey: string) => {
    const sourceKey = draggingColumnKeyRef.current;
    draggingColumnKeyRef.current = null;

    if (!sourceKey || sourceKey === targetKey) {
      return;
    }

    setColumns((current) => reorderColumns(current, sourceKey, targetKey));
  }, []);

  const handleColumnDragEnd = useCallback(() => {
    draggingColumnKeyRef.current = null;
  }, []);

  const persistOpeningStockColumnWidth = useCallback(
    async (columnKey: string, width: number) => {
      const renderedColumns = columnsRef.current;
      const columnIndex = renderedColumns.findIndex((column) => column.key === columnKey);
      const column = columnIndex >= 0 ? renderedColumns[columnIndex] : null;

      if (!column || !Number.isFinite(width) || width <= 0) {
        return;
      }

      const configuredColumn = findOpeningStockUiTableColumnConfig(
        uiColumnConfigsRef.current,
        columnKey,
      );

      try {
        const columnRequest = buildOpeningStockUiTableColumnWidthRequest(
          column,
          configuredColumn,
          columnIndex,
          width,
        );
        const response = await saveUiTableColumn({
          body: { uiTblId: UI_TABLE_COLUMNS_QUERY.uiTableId, uiTblColumns: [columnRequest] },
        });
        const savedColumn = (response?.data?.columns ?? []).find(
          (c) =>
            (columnRequest.uiTblClmId && c.uiTblClmId === columnRequest.uiTblClmId) ||
            c.uiTblClmName === columnRequest.uiTblClmName,
        );
        if (!savedColumn) {
          return;
        }

        setUiColumnConfigs((current) => {
          const nextColumns = upsertOpeningStockUiTableColumnConfig(
            current,
            savedColumn,
            columnKey,
          );
          uiColumnConfigsRef.current = nextColumns;
          return nextColumns;
        });
      } catch {
        // useApi handles toast behavior; keep the local resize even if persistence fails.
      }
    },
    [saveUiTableColumn],
  );

  const enqueueOpeningStockColumnWidthSave = useCallback(
    (columnKey: string, width: number) => {
      const saveTask = columnWidthSaveQueueRef.current
        .catch(() => undefined)
        .then(() => persistOpeningStockColumnWidth(columnKey, width));
      columnWidthSaveQueueRef.current = saveTask;
      return saveTask;
    },
    [persistOpeningStockColumnWidth],
  );

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
      if (!activeResize) {
        return;
      }

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
      if (!activeResize) {
        return;
      }

      resizingColumnRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (Math.round(activeResize.currentWidth) !== Math.round(activeResize.startWidth)) {
        void enqueueOpeningStockColumnWidthSave(activeResize.key, activeResize.currentWidth);
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
  }, [enqueueOpeningStockColumnWidthSave]);

  const handleRemoveRow = useCallback((rowId: number) => {
    setRows((currentRows) => {
      const nextRows = currentRows.filter((row) => row.id !== rowId);
      return nextRows.length > 0 ? nextRows : [createEmptyRow(1)];
    });
    setOpenLookupCell((currentCell) =>
      currentCell?.key.startsWith(`${rowId}:`) ? null : currentCell,
    );
    setLookupSearchQuery("");
  }, []);

  const handleClearRows = useCallback(() => {
    setRows([createEmptyRow(1)]);
    setInvalidFieldKeys({});
    setLookupSearchQuery("");
    setOpenLookupCell(null);
  }, []);

  const clearOpeningStockEditor = useCallback(() => {
    const nextRows = [createEmptyRow(1)];
    markEditorStateAsClean({
      loadedVoucherId: null,
      voucherDate,
      voucherRefNo: "",
      rows: nextRows,
    });
    setInvalidFieldKeys({});
    setRows(nextRows);
    setLookupSearchQuery("");
    setOpenLookupCell(null);
    setLoadedVoucherId(null);
    setLoadedDocumentMeta(null);
    setVoucherRefNo("");
    setPendingLoadRequest(null);
    setIsDeleteLoadedStockConfirmOpen(false);
    resetOpeningStockAuditNotesModal();
  }, [markEditorStateAsClean, resetOpeningStockAuditNotesModal, voucherDate]);

  const submitOpeningStockSave = useCallback(
    async (requestPayload: OpeningStockSaveRequest, auditNotes?: string | null) => {
      try {
        await saveOpeningStock({
          body:
            auditNotes === undefined
              ? requestPayload
              : {
                ...requestPayload,
                audit_notes: auditNotes,
              },
        });
        clearOpeningStockEditor();
      } catch {
        // Toasting is handled in useApi.
      }
    },
    [clearOpeningStockEditor, saveOpeningStock],
  );

  const resolveLoadContext = useCallback(() => {
    if (!activeCompany) {
      toast.error("Select a company in the header before loading stock.", {
        toastId: "opening-stock-load:missing-company",
      });
      return null;
    }
    if (!activeBranch) {
      toast.error("Select a branch in the header before loading stock.", {
        toastId: "opening-stock-load:missing-branch",
      });
      return null;
    }
    if (!accountingYear) {
      toast.error("The selected company does not have a valid financial year.", {
        toastId: "opening-stock-load:missing-fin-year",
      });
      return null;
    }

    return {
      accountingYear,
      companyId: activeCompany.id,
      branchId: activeBranch.id,
    };
  }, [accountingYear, activeBranch, activeCompany]);

  const applyLoadedOpeningStockDocument = useCallback(
    (document: OpeningStockDocumentPayload) => {
      const documentRows = mapOpeningStockDocumentToRows(document);
      const nextVoucherDate =
        toInputDateValue(document.header.osh_voucher_date) || voucherDate;
      const nextVoucherRefNo = document.header.avh_voucher_refno || "";
      const loadedItems = buildLoadedLookupOptions(
        document.details.map((detail) => ({
          value: detail.osl_item_id,
          label: detail.osl_item_name,
          code: detail.osl_item_code,
        })),
      );
      const loadedGodowns = buildLoadedLookupOptions(
        document.details.map((detail) => ({
          value: detail.osl_godown_id,
          label: detail.osl_godown_name,
        })),
      );
      const loadedUnits = buildLoadedLookupOptions(
        document.details.map((detail) => ({
          value: detail.osl_unit_id,
          label: detail.osl_unit_name,
        })),
      );
      const loadedTaxes = buildLoadedLookupOptions(
        document.details.map((detail) => ({
          value: detail.osl_tax_id,
          label: detail.osl_tax_name,
        })),
      );

      markEditorStateAsClean({
        loadedVoucherId: document.header.avh_voucher_id,
        voucherDate: nextVoucherDate,
        voucherRefNo: nextVoucherRefNo,
        rows: documentRows,
      });
      setItemOptions((current) => mergeLookupOptions(current, loadedItems));
      setGodownOptions((current) => mergeLookupOptions(current, loadedGodowns));
      setUnitOptions((current) => mergeLookupOptions(current, loadedUnits));
      setTaxOptions((current) => mergeLookupOptions(current, loadedTaxes));
      setInvalidFieldKeys({});
      setRows(documentRows);
      setVoucherDate(nextVoucherDate);
      setVoucherRefNo(nextVoucherRefNo);
      setLookupSearchQuery("");
      setOpenLookupCell(null);
      setLoadedVoucherId(document.header.avh_voucher_id);
      setLoadedDocumentMeta({
        voucherId: document.header.avh_voucher_id,
        voucherLabel: document.header.avh_voucher_refno || document.header.osh_voucher_no,
        voucherDate: toInputDateValue(document.header.osh_voucher_date),
        companyId: document.header.osh_company_id,
        branchId: document.header.osh_branch_id,
      });
      void prefetchLoadedItemDetails(document.details);
    },
    [markEditorStateAsClean, prefetchLoadedItemDetails, voucherDate],
  );

  const loadOpeningStockByVoucherId = useCallback(
    async (voucherId: string) => {
      const normalizedVoucherId = voucherId.trim();
      if (!normalizedVoucherId) {
        return;
      }

      setPendingLoadRequest(null);
      setIsLoadingStock(true);
      try {
        const documentPayload = await getOpeningStockDocument({
          query: {
            avh_voucher_id: normalizedVoucherId,
          },
        });
        const document = documentPayload?.data;
        if (!document) {
          toast.info("No saved opening stock was found for the selected voucher.", {
            toastId: "opening-stock-load:empty-voucher-document",
          });
          return;
        }

        applyLoadedOpeningStockDocument(document);
        dispatch(listModalToggled(false));
      } catch {
        // Toasting is handled in useApi.
      } finally {
        setIsLoadingStock(false);
      }
    },
    [applyLoadedOpeningStockDocument, getOpeningStockDocument],
  );

  const loadLatestOpeningStock = useCallback(async () => {
    const loadContext = resolveLoadContext();
    if (!loadContext) {
      return;
    }

    setPendingLoadRequest(null);
    setIsLoadingStock(true);
    try {
      const listPayload = await listOpeningStocks({
        query: {
          osh_company_id: loadContext.companyId,
          osh_branch_id: loadContext.branchId,
          osh_acc_year: loadContext.accountingYear,
          page: "1",
          limit: "1",
        },
      });
      const latestDocumentHeader = Array.isArray(listPayload?.data) ? listPayload.data[0] : null;
      if (!latestDocumentHeader?.avh_voucher_id) {
        toast.info("No saved opening stock was found for the selected company and branch.", {
          toastId: "opening-stock-load:not-found",
        });
        return;
      }

      const documentPayload = await getOpeningStockDocument({
        query: {
          avh_voucher_id: latestDocumentHeader.avh_voucher_id,
        },
      });
      const document = documentPayload?.data;
      if (!document) {
        toast.info("No saved opening stock was found for the selected company and branch.", {
          toastId: "opening-stock-load:empty-document",
        });
        return;
      }

      applyLoadedOpeningStockDocument(document);
    } catch {
      // Toasting is handled in useApi.
    } finally {
      setIsLoadingStock(false);
    }
  }, [
    applyLoadedOpeningStockDocument,
    getOpeningStockDocument,
    listOpeningStocks,
    resolveLoadContext,
  ]);

  const loadOpeningStockByRefNo = useCallback(
    async (refNo?: string) => {
      const normalizedRefNo = (refNo ?? voucherRefNo).trim();
      if (!normalizedRefNo) {
        toast.error("Enter a reference no before loading stock.", {
          toastId: "opening-stock-load:missing-refno",
        });
        return;
      }

      const loadContext = resolveLoadContext();
      if (!loadContext) {
        return;
      }

      setPendingLoadRequest(null);
      setIsLoadingStock(true);
      try {
        const documentPayload = await getOpeningStockDocumentByRefNo({
          query: {
            avh_voucher_refno: normalizedRefNo,
            osh_company_id: loadContext.companyId,
            osh_branch_id: loadContext.branchId,
            osh_acc_year: loadContext.accountingYear,
          },
        });
        const document = documentPayload?.data;
        if (!document) {
          toast.info("No saved opening stock was found for the provided reference no.", {
            toastId: "opening-stock-load:empty-refno-document",
          });
          return;
        }

        applyLoadedOpeningStockDocument(document);
      } catch {
        // Toasting is handled in useApi.
      } finally {
        setIsLoadingStock(false);
      }
    },
    [
      applyLoadedOpeningStockDocument,
      getOpeningStockDocumentByRefNo,
      resolveLoadContext,
      voucherRefNo,
    ],
  );

  const handleLoadStock = useCallback(() => {
    if (isLoadingStock || isSavingOpeningStock || isBusinessContextLoading) {
      return;
    }

    if (draftRows.length > 0) {
      setPendingLoadRequest({ type: "latest" });
      return;
    }
    void loadLatestOpeningStock();
  }, [
    draftRows.length,
    isBusinessContextLoading,
    isLoadingStock,
    isSavingOpeningStock,
    loadLatestOpeningStock,
  ]);

  const handleOpenBulkLoadModal = useCallback(() => {
    if (isBulkLoadingItems || isSavingOpeningStock || isBusinessContextLoading) {
      return;
    }
    setIsBulkLoadModalOpen(true);
  }, [isBulkLoadingItems, isSavingOpeningStock, isBusinessContextLoading]);

  const handleBulkLoadItems = useCallback(
    async (params: BulkLoadParams) => {
      if (!params.companyId) {
        toast.error("Select a company before loading items.", {
          toastId: "bulk-load-items:missing-company",
        });
        return;
      }
      setIsBulkLoadingItems(true);
      try {
        const query: Record<string, string> = {
          item_company_id: params.companyId,
          limit: "500",
        };
        if (params.branchId) query.item_branch_id = params.branchId;
        if (params.godownId) query.godown_id = params.godownId;
        if (params.itemGroupId) query.item_group_id = params.itemGroupId;
        if (params.itemBrandId) query.item_brand_id = params.itemBrandId;
        if (params.itemSectionId) query.item_section_id = params.itemSectionId;
        if (params.itemCategoryId) query.item_category_id = params.itemCategoryId;

        const response = await getBulkItems({ query });
        const items = response?.data ?? [];
        if (items.length === 0) {
          toast.info("No items found for the selected filters.", {
            toastId: "bulk-load-items:empty",
          });
          return;
        }

        const loadedItemOptions = buildLoadedLookupOptions(
          items.map((item) => ({
            value: item.item_id,
            label: item.item_name,
            code: item.item_code,
          })),
        );
        const loadedGodownOptions = buildLoadedLookupOptions(
          items
            .filter((item) => item.godown_id)
            .map((item) => ({ value: item.godown_id, label: item.godown_name })),
        );
        const loadedUnitOptions = buildLoadedLookupOptions(
          items
            .filter((item) => item.unit_id)
            .map((item) => ({ value: item.unit_id, label: item.unit_name })),
        );

        const newRows = items.map((item, index) =>
          createRow(index + 1, {
            itemname: item.item_name,
            code: toInputValue(item.item_code),
            barcode: toInputValue(item.item_default_barcode),
            oslitemid: item.item_id,
            oslunitid: item.unit_id ?? "",
            oslbaseuomid: item.price_master_id ?? "",
            oslgodownid: item.godown_id ?? "",
            baseunitid: item.base_unit_id ?? item.item_base_unit_id ?? "",
            uom: item.unit_name ?? "",
            godown: item.godown_name ?? "",
            convfactor: toInputValue(item.to_base_factor || 1),
            costprice: toInputValue(item.cost_price),
            costwot: toInputValue(item.cost_wot),
            mrp: toInputValue(item.mrp),
            pricea: toInputValue(item.sales_price_a),
            priceb: toInputValue(item.sales_price_b),
            pricec: toInputValue(item.sales_price_c),
            priced: toInputValue(item.sales_price_d),
            priceawot: toInputValue(item.price_a_wot),
            pricebwot: toInputValue(item.price_b_wot),
            pricecwot: toInputValue(item.price_c_wot),
            pricedwot: toInputValue(item.price_d_wot),
            priceamarkup: toInputValue(item.price_a_markup),
            pricebmarkup: toInputValue(item.price_b_markup),
            pricecmarkup: toInputValue(item.price_c_markup),
            pricedmarkup: toInputValue(item.price_d_markup),
            profittype: item.profit_type ?? "MANUAL",
            roundoff: toInputValue(item.round_off),
            taxname: item.tax_name ?? "",
            osltaxid: item.tax_id ?? "",
            osltaxperc: toInputValue(item.tax_perc),
            oslcesstype: item.cess_type ?? "NONE",
            oslcessperc: toInputValue(item.cess_perc),
            oslcessperunit: toInputValue(item.cess_per_unit),
            osltrackingtype: normalizeOpeningStockTrackingType(item.tracking_type),
          }),
        );

        setRows([...newRows, createEmptyRow(newRows.length + 1)]);
        setInvalidFieldKeys({});
        setLookupSearchQuery("");
        setOpenLookupCell(null);
        setItemOptions((current) => mergeLookupOptions(current, loadedItemOptions));
        setGodownOptions((current) => mergeLookupOptions(current, loadedGodownOptions));
        setUnitOptions((current) => mergeLookupOptions(current, loadedUnitOptions));
        setIsBulkLoadModalOpen(false);
        toast.success(`Loaded ${items.length} item(s).`, {
          toastId: "bulk-load-items:success",
        });

        // Prefetch full item price details in the background for UOM-change support
        const uniqueItemIds = Array.from(new Set(items.map((item) => item.item_id)));
        void Promise.allSettled(
          uniqueItemIds.map((itemId) => triggerItemPriceDetails({ itemId }, true).unwrap()),
        ).then((results) => {
          const nextDetails: Record<string, ItemPriceDetailsPayload> = {};
          for (const result of results) {
            if (result.status === "fulfilled") {
              nextDetails[result.value.item.item_id] = result.value;
            }
          }
          if (Object.keys(nextDetails).length > 0) {
            setItemDetailsByItemId((current) => ({ ...current, ...nextDetails }));
          }
        });
      } catch {
        toast.error("Failed to load items.", {
          toastId: "bulk-load-items:error",
        });
      } finally {
        setIsBulkLoadingItems(false);
      }
    },
    [getBulkItems, triggerItemPriceDetails],
  );

  const handleLoadByRefNo = useCallback(() => {
    if (isLoadingStock || isSavingOpeningStock || isBusinessContextLoading) {
      return;
    }

    const normalizedRefNo = voucherRefNo.trim();
    if (!normalizedRefNo) {
      toast.error("Enter a reference no before loading stock.", {
        toastId: "opening-stock-load:missing-refno",
      });
      return;
    }

    if (draftRows.length > 0) {
      setPendingLoadRequest({
        type: "refno",
        refNo: normalizedRefNo,
      });
      return;
    }

    void loadOpeningStockByRefNo(normalizedRefNo);
  }, [
    draftRows.length,
    isBusinessContextLoading,
    isLoadingStock,
    isSavingOpeningStock,
    loadOpeningStockByRefNo,
    voucherRefNo,
  ]);

  const handleLoadOpeningStockListRow = useCallback(
    (row: OpeningStockHeaderPayload) => {
      if (
        isLoadingStock ||
        isSavingOpeningStock ||
        isDeletingOpeningStock ||
        isBusinessContextLoading
      ) {
        return;
      }

      const voucherId = row.avh_voucher_id?.trim() ?? "";
      if (!voucherId) {
        return;
      }

      const voucherLabel = getOpeningStockVoucherLabel(row);
      dispatch(selectedDocumentIdSet(voucherId));
      if (draftRows.length > 0) {
        setPendingLoadRequest({
          type: "voucher",
          voucherId,
          label: voucherLabel,
        });
        return;
      }

      void loadOpeningStockByVoucherId(voucherId);
    },
    [
      draftRows.length,
      isBusinessContextLoading,
      isDeletingOpeningStock,
      isLoadingStock,
      isSavingOpeningStock,
      loadOpeningStockByVoucherId,
    ],
  );

  const handleLoadSelectedOpeningStockListRow = useCallback(() => {
    if (!selectedOpeningStockListRow) {
      return;
    }

    handleLoadOpeningStockListRow(selectedOpeningStockListRow);
  }, [handleLoadOpeningStockListRow, selectedOpeningStockListRow]);

  const handleUpdateStock = useCallback(async () => {
    if (!activeCompany) {
      toast.error("Select a company in the header before updating stock.", {
        toastId: "opening-stock-save:missing-company",
      });
      return;
    }
    if (!activeBranch) {
      toast.error("Select a branch in the header before updating stock.", {
        toastId: "opening-stock-save:missing-branch",
      });
      return;
    }
    if (!accountingYear) {
      toast.error("The selected company does not have a valid financial year.", {
        toastId: "opening-stock-save:missing-fin-year",
      });
      return;
    }
    const voucherDateIso = toIsoDateTime(voucherDate);
    if (!voucherDateIso) {
      toast.error("Select a valid voucher date before updating stock.", {
        toastId: "opening-stock-save:missing-voucher-date",
      });
      return;
    }
    const userId = getAuthUserId();
    if (!userId) {
      toast.error("User session is missing. Please login again.", {
        toastId: "opening-stock-save:missing-user",
      });
      return;
    }
    if (draftRows.length === 0) {
      toast.error("Add at least one stock row before updating stock.", {
        toastId: "opening-stock-save:no-rows",
      });
      return;
    }
    const validationIssues = draftRows.flatMap<
      RowValidationIssue & { rowId: number }
    >((row, index) =>
      getRowValidationIssues(
        row,
        index + 1,
        itemDetailsByItemId[(row.values.oslitemid ?? "").trim()],
      ).map((issue) => ({
        rowId: row.id,
        ...issue,
      })),
    );
    if (validationIssues.length > 0) {
      setInvalidFieldKeys(buildInvalidFieldState(validationIssues));
      const [firstIssue] = validationIssues;
      if (firstIssue) {
        window.requestAnimationFrame(() => {
          focusOpeningStockField(tableRef.current, firstIssue.rowId, firstIssue.fieldKey);
        });
        toast.dismiss("opening-stock-save:validation");
        toast.error(renderValidationToastContent(validationIssues), {
          toastId: "opening-stock-save:validation",
          autoClose: 8000,
        });
      }
      return;
    }
    setInvalidFieldKeys({});
    let matchingLedgers: AccountLedgerRecord[] = [];
    try {
      const ledgerPayload = await listAccountLedgers({
        query: {
          ledCompanyId: activeCompany.id,
          ledIsActive: "true",
          page: "1",
          limit: "100",
        },
      });
      matchingLedgers = extractRows<AccountLedgerRecord>(ledgerPayload).filter(
        (ledger): ledger is AccountLedgerRecord =>
          typeof ledger?.ledId === "string" &&
          typeof ledger?.ledName === "string" &&
          ledger.ledName.trim().toLowerCase() === OPENING_STOCK_LEDGER_NAME,
      );
    } catch {
      toast.error("Failed to load the Opening Stock ledger.", {
        toastId: "opening-stock-save:ledger-request-failed",
      });
      return;
    }
    if (matchingLedgers.length === 0) {
      toast.error(
        "No active account ledger named Opening Stock was found for the selected company.",
        {
          toastId: "opening-stock-save:ledger-missing",
        },
      );
      return;
    }
    if (matchingLedgers.length > 1) {
      toast.error(
        "More than one active account ledger named Opening Stock exists for the selected company.",
        {
          toastId: "opening-stock-save:ledger-ambiguous",
        },
      );
      return;
    }
    const requestPayload: OpeningStockSaveRequest = {
      header: {
        avh_voucher_id: loadedVoucherId ?? undefined,
        avh_voucher_type_id: 20,
        osh_acc_year: accountingYear,
        osh_company_id: activeCompany.id,
        osh_branch_id: activeBranch.id,
        osh_voucher_date: voucherDateIso,
        avh_party_id: matchingLedgers[0].ledId,
        avh_bill_date: voucherDateIso,
        avh_opposite_ledger_id: null,
        avh_employee_id: [],
        osh_device_type: "WEB",
        osh_counter_id: "COUNTER-1",
        osh_session_id: getAuthSessionId(),
        osh_device_id: getOrCreateClientDeviceId(),
        osh_status: "DRAFT",
        osh_ref_no: null,
        osh_narration: buildOpeningStockNarration(draftRows),
        osh_total_lines: draftTotals.lines,
        osh_total_qty: draftTotals.qty,
        osh_total_value: draftTotals.value,
        osh_user_id: userId,
      },
      details: draftRows.map(buildOpeningStockDetailPayload),
    };

    if (loadedVoucherId?.trim()) {
      setPendingOpeningStockSaveRequest(requestPayload);
      setOpeningStockAuditNotes("");
      setOpeningStockAuditNotesError(null);
      return;
    }

    await submitOpeningStockSave(requestPayload);
  }, [
    accountingYear,
    activeBranch,
    activeCompany,
    draftRows,
    draftTotals.lines,
    draftTotals.qty,
    draftTotals.value,
    loadedVoucherId,
    listAccountLedgers,
    submitOpeningStockSave,
    voucherDate,
  ]);

  const handleOpeningStockAuditNotesChange = useCallback((value: string) => {
    setOpeningStockAuditNotes(value);
    setOpeningStockAuditNotesError(null);
  }, []);

  const handleCancelOpeningStockAuditNotes = useCallback(() => {
    if (isSavingOpeningStock) {
      return;
    }

    resetOpeningStockAuditNotesModal();
  }, [isSavingOpeningStock, resetOpeningStockAuditNotesModal]);

  const handleConfirmOpeningStockAuditNotes = useCallback(() => {
    if (!pendingOpeningStockSaveRequest || isSavingOpeningStock) {
      return;
    }

    const normalizedAuditNotes = openingStockAuditNotes.trim();
    if (!normalizedAuditNotes) {
      setOpeningStockAuditNotesError("Enter audit notes before saving the opening stock update.");
      return;
    }

    void submitOpeningStockSave(pendingOpeningStockSaveRequest, normalizedAuditNotes);
  }, [
    isSavingOpeningStock,
    openingStockAuditNotes,
    pendingOpeningStockSaveRequest,
    submitOpeningStockSave,
  ]);

  const handleDeleteLoadedStock = useCallback(() => {
    if (
      !loadedVoucherId ||
      isLoadingStock ||
      isSavingOpeningStock ||
      isDeletingOpeningStock ||
      isBusinessContextLoading
    ) {
      return;
    }

    setIsDeleteLoadedStockConfirmOpen(true);
  }, [
    isBusinessContextLoading,
    isDeletingOpeningStock,
    isLoadingStock,
    isSavingOpeningStock,
    loadedVoucherId,
  ]);

  const handleConfirmDeleteLoadedStock = useCallback(async () => {
    if (!loadedVoucherId) {
      setIsDeleteLoadedStockConfirmOpen(false);
      toast.error("Load an opening stock voucher before deleting it.", {
        toastId: "opening-stock-delete:missing-voucher",
      });
      return;
    }

    try {
      await deleteOpeningStock({
        query: {
          avh_voucher_id: loadedVoucherId,
        },
      });
      clearOpeningStockEditor();
    } catch {
      // Toasting is handled in useApi.
    }
  }, [clearOpeningStockEditor, deleteOpeningStock, loadedVoucherId]);

  const tableMinWidth = useMemo(() => getTableMinWidth(columns), [columns]);
  useEffect(() => {
    if (godownOptionsByValue.size === 0 && taxOptionsByValue.size === 0) {
      return;
    }
    setRows((currentRows) =>
      currentRows.map((row) => {
        const nextValues = { ...row.values };
        const godownId = row.values.oslgodownid?.trim() ?? "";
        const taxId = row.values.osltaxid?.trim() ?? "";
        const godownLabel = godownId ? godownOptionsByValue.get(godownId) : "";
        const taxLabel = taxId ? taxOptionsByValue.get(taxId) : "";
        let changed = false;

        if (godownLabel && nextValues.godown !== godownLabel) {
          nextValues.godown = godownLabel;
          changed = true;
        }
        if (taxLabel && nextValues.taxname !== taxLabel) {
          nextValues.taxname = taxLabel;
          changed = true;
        }
        return changed
          ? {
            ...row,
            values: nextValues,
          }
          : row;
      }),
    );
  }, [godownOptionsByValue, taxOptionsByValue]);

  const handleConfirmLoad = useCallback(() => {
    if (!pendingLoadRequest) {
      return;
    }

    if (pendingLoadRequest.type === "voucher") {
      void loadOpeningStockByVoucherId(pendingLoadRequest.voucherId);
      return;
    }

    if (pendingLoadRequest.type === "refno") {
      void loadOpeningStockByRefNo(pendingLoadRequest.refNo);
      return;
    }

    void loadLatestOpeningStock();
  }, [
    loadLatestOpeningStock,
    loadOpeningStockByRefNo,
    loadOpeningStockByVoucherId,
    pendingLoadRequest,
  ]);

  const loadConfirmLabel =
    pendingLoadRequest?.type === "voucher"
      ? "Load Voucher"
      : pendingLoadRequest?.type === "refno"
        ? "Load Ref No"
        : "Load Latest";
  const loadConfirmLoadingLabel =
    pendingLoadRequest?.type === "voucher"
      ? "Loading voucher..."
      : pendingLoadRequest?.type === "refno"
        ? "Loading ref no..."
        : "Loading stock...";
  const tableSettingsContextMenu =
    tableSettingsContextMenuPosition && typeof document !== "undefined"
      ? createPortal(
        <div
          className={styles.tableSettingsContextMenu}
          data-opening-stock-settings-context-menu="true"
          style={tableSettingsContextMenuPosition}
          role="tooltip"
        >
          <button
            type="button"
            className={styles.tableSettingsContextMenuItem}
            onClick={openColumnSettings}
          >
            Admin settings
          </button>
        </div>,
        document.body,
      )
      : null;
  const columnSettingsModal =
    isColumnSettingsOpen && typeof document !== "undefined"
      ? createPortal(
        <div
          className={dynamicModalStyles.overlay}
          style={
            {
              "--erp-modal-overlay-z-index": Z_MODAL_NESTED,
              "--erp-modal-accent": "var(--ds-primary, #0f74c9)",
            } as CSSProperties
          }
        >
          <div
            className={dynamicModalStyles.backdrop}
            onClick={closeColumnSettings}
            aria-hidden
          />
          <section
            className={cx(dynamicModalStyles.panel, styles.columnSettingsDialog)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="opening-stock-column-settings-title"
          >
            <header className={dynamicModalStyles.header}>
              <div className={dynamicModalStyles.headerRow}>
                <div className={dynamicModalStyles.headerIntro}>
                  <span className={dynamicModalStyles.headerIcon} aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path
                        d="M4 5h16M4 12h16M4 19h16"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeWidth="1.8"
                      />
                      <path
                        d="M8 5v14M16 5v14"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeWidth="1.4"
                      />
                    </svg>
                  </span>
                  <div className={dynamicModalStyles.headerText}>
                    <h3
                      id="opening-stock-column-settings-title"
                      className={dynamicModalStyles.headerTitle}
                    >
                      Table Settings
                    </h3>
                    <p className={dynamicModalStyles.headerDescription}>
                      Configure Opening Stock table columns.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className={dynamicModalStyles.closeButton}
                  onClick={closeColumnSettings}
                  aria-label="Close modal"
                  disabled={isColumnSettingsSaving}
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className={dynamicModalStyles.closeIcon}
                  >
                    <path
                      d="M6 18 18 6M6 6l12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth="1.8"
                    />
                  </svg>
                </button>
              </div>
            </header>
            <div
              className={cx(dynamicModalStyles.scrollArea, styles.columnSettingsBody)}
              data-erp-modal-scroll-area="true"
            >
              {columnSettingsRows.length > 0 ? (
                <div className={styles.columnSettingsTableWrap}>
                  <table className={styles.columnSettingsTable}>
                    <thead>
                      <tr>
                        <th className={styles.columnSettingsNumberHeader} />
                        <th>Column Name</th>
                        <th>Visible</th>
                        <th>Focus</th>
                        <th>Necessity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {columnSettingsRows.map((row, index) => {
                        const draft =
                          columnSettingsDraft[row.key] ?? {
                            visible: row.visible,
                            focus: row.focus,
                            necessity: row.necessity,
                          };
                        return (
                          <tr key={row.key}>
                            <td className={styles.columnSettingsNumberCell}>
                              {index + 1}
                            </td>
                            <td className={styles.columnSettingsNameCell}>
                              {row.label}
                            </td>
                            <td>
                              <input
                                type="checkbox"
                                checked={draft.visible}
                                disabled={isColumnSettingsSaving}
                                onChange={(event) =>
                                  handleColumnSettingsSelectionChange(
                                    row.key,
                                    "visible",
                                    event.currentTarget.checked,
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="checkbox"
                                checked={draft.focus}
                                disabled={isColumnSettingsSaving}
                                onChange={(event) =>
                                  handleColumnSettingsSelectionChange(
                                    row.key,
                                    "focus",
                                    event.currentTarget.checked,
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="checkbox"
                                checked={draft.necessity}
                                disabled={isColumnSettingsSaving}
                                onChange={(event) =>
                                  handleColumnSettingsSelectionChange(
                                    row.key,
                                    "necessity",
                                    event.currentTarget.checked,
                                  )
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={styles.columnSettingsEmpty}>No columns configured.</p>
              )}
            </div>
            <footer className={dynamicModalStyles.footer}>
              <div className={dynamicModalStyles.footerActions}>
                <button
                  type="button"
                  className={cx(
                    dynamicModalStyles.cancelButton,
                    styles.columnSettingsDefaultButton,
                  )}
                  onClick={handleDefaultColumnSettings}
                  disabled={isColumnSettingsSaving}
                >
                  Default
                </button>
                <button
                  type="button"
                  className={dynamicModalStyles.cancelButton}
                  onClick={closeColumnSettings}
                  disabled={isColumnSettingsSaving}
                >
                  Close
                </button>
                <button
                  type="button"
                  className={cx(
                    dynamicModalStyles.submitButton,
                    dynamicModalStyles.submitButtonSave,
                  )}
                  onClick={() => void saveColumnSettings()}
                  disabled={isColumnSettingsSaving}
                >
                  {isColumnSettingsSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </footer>
          </section>
        </div>,
        document.body,
      )
      : null;

  return (
    <>
      {tableSettingsContextMenu}
      {columnSettingsModal}
      <section className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headingBlock}>
            <div className={styles.headingRow}>
              <h1 className={styles.title}>
                {loadedVoucherId && draftRows.length > 0 ? "Opening Stock (Edit)" : "Opening Stock"}
              </h1>
            </div>
          </div>
        </header>
        <div className={styles.tableShell}>
          <StockToolbar
            voucherDate={voucherDate}
            voucherRefNo={voucherRefNo}
            voucherDatePickerRef={voucherDatePickerRef}
            isLoadingStock={isLoadingStock}
            isSavingOpeningStock={isSavingOpeningStock}
            isDeletingOpeningStock={isDeletingOpeningStock}
            isBulkLoadingItems={isBulkLoadingItems}
            isBusinessContextLoading={isBusinessContextLoading}
            canDeleteLoadedStock={Boolean(loadedVoucherId)}
            canClearRows={draftRows.length > 0}
            onVoucherDateChange={setVoucherDate}
            onVoucherRefNoChange={setVoucherRefNo}
            onBrowseStockList={handleOpenOpeningStockList}
            onLoadByRefNo={handleLoadByRefNo}
            onLoadStock={handleLoadStock}
            onBulkLoadItems={handleOpenBulkLoadModal}
            onClearRows={handleClearRows}
            onUpdateStock={handleUpdateStock}
            onDeleteStock={handleDeleteLoadedStock}
          />
          <div
            className={styles.tableViewport}
            data-erp-table-viewport="true"
          >
            <table
              ref={tableRef}
              className={cx(styles.table, styles.resizableTable, styles.columnStripedTable)}
              style={{ "--erp-table-min-width": tableMinWidth } as CSSProperties}
            >
              <colgroup>
                <col style={{ width: SERIAL_NUMBER_COLUMN_WIDTH }} />
                {columns.map((column) => (
                  <col
                    key={column.key}
                    style={{ width: column.width }}
                  />
                ))}
                <col style={{ width: DELETE_ACTION_COLUMN_WIDTH }} />
              </colgroup>
              <thead className={styles.head}>
                <tr>
                  <th
                    className={cx(
                      styles.headerCell,
                      styles.alignCenter,
                      styles.headerCellDark,
                      styles.stickySerialCell,
                      styles.stickySerialHeader,
                    )}
                    style={{
                      width: SERIAL_NUMBER_COLUMN_WIDTH,
                      left: 0,
                    }}
                  >
                    <span className={styles.headerText}>S.No</span>
                  </th>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className={cx(
                        styles.headerCell,
                        styles.alignCenter,
                        styles.headerCellDark,
                        styles.resizableHeaderCell,
                      )}
                      style={{ width: column.width }}
                    >
                      <div
                        draggable
                        className={styles.draggableHeaderContent}
                        onDragStart={(event) => handleColumnDragStart(event, column.key)}
                        onDragOver={handleColumnDragOver}
                        onDrop={() => handleColumnDrop(column.key)}
                        onDragEnd={handleColumnDragEnd}
                      >
                        <span className={styles.headerText}>{column.header}</span>
                      </div>
                      <span
                        className={styles.columnResizeHandle}
                        onMouseDown={(event) =>
                          handleColumnResizeStart(event, column.key, column.width)
                        }
                        onDragStart={(event) => event.preventDefault()}
                        role="presentation"
                      />
                    </th>
                  ))}
                  <th
                    className={cx(
                      styles.headerCell,
                      styles.alignCenter,
                      styles.headerCellDark,
                      styles.stickyActionCell,
                      styles.stickyActionHeader,
                    )}
                    style={{ width: DELETE_ACTION_COLUMN_WIDTH, right: 0 }}
                    aria-hidden="true"
                  />
                </tr>
              </thead>
              <tbody className={styles.body} onContextMenu={handleTableBodyContextMenu}>
                {renderedRows.map((row, index) => (
                  <StockTableRow
                    key={row.id}
                    row={row}
                    rowIndex={index}
                    columns={columns}
                    invalidFieldKeys={invalidFieldKeys}
                    itemDetailsByItemId={itemDetailsByItemId}
                    itemOptionsByValue={itemOptionsByValue}
                    godownOptionsByValue={godownOptionsByValue}
                    unitOptionsByValue={unitOptionsByValue}
                    unitDecimalCountById={unitDecimalCountById}
                    openLookupCell={openLookupCell}
                    lookupSearchQuery={lookupSearchQuery}
                    filteredItemOptions={filteredItemOptions}
                    filteredGodownOptions={filteredGodownOptions}
                    isItemLookupLoading={isItemLookupLoading}
                    isGodownLookupLoading={isGodownLookupLoading}
                    lookupSearchInputRef={lookupSearchInputRef}
                    lookupRootRefs={lookupRootRefs}
                    rowDatePickerRefs={rowDatePickerRefs}
                    onRemoveRow={handleRemoveRow}
                    onRowChange={handleRowChange}
                    onUomChange={handleUomChange}
                    onLookupSelection={handleLookupSelection}
                    onLookupSearchChange={handleLookupSearchInputChange}
                    onLookupToggle={handleLookupToggle}
                    onLookupCreateShortcut={(rowId, lookupKind, payload) => {
                      if (lookupKind === "item") {
                        void handleItemLookupCreateShortcut(rowId, payload);
                        return;
                      }
                      if (lookupKind === "godown") {
                        void handleGodownLookupCreateShortcut(rowId, payload);
                      }
                    }}
                    onLookupEditShortcut={(rowId, lookupKind, payload) => {
                      if (lookupKind === "item") {
                        void handleItemLookupEditShortcut(rowId, payload);
                        return;
                      }
                      if (lookupKind === "godown") {
                        void handleGodownLookupEditShortcut(rowId, payload);
                      }
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.paginationBar}>
            <div className={styles.footerValue}>
              <strong className={styles.footerLabel}>qty</strong>
              <strong>{QUANTITY_FORMATTER.format(visibleTotals.qty)} </strong>
              <strong className={styles.footerLabel}>free qty</strong>
              <strong>{QUANTITY_FORMATTER.format(visibleTotals.freeQty)}</strong>
              <strong className={styles.footerLabel}>stock value</strong>
              <strong>{VALUE_FORMATTER.format(visibleTotals.value)}</strong>
            </div>
          </div>
        </div>
        {isInlineItemMasterOpen ? (
          <ItemMasterPageContent
            inlineModalOnly
            onCrudControllerReady={handleInlineItemMasterControllerReady}
            onModalOpenChange={handleInlineItemMasterModalOpenChange}
            onItemSaved={handleInlineItemMasterSaved}
          />
        ) : null}
        {isInlineGodownMasterOpen ? (
          <GodownMasterPageContent
            inlineModalOnly
            onCrudControllerReady={handleInlineGodownMasterControllerReady}
            onModalOpenChange={handleInlineGodownMasterModalOpenChange}
            onGodownSaved={handleInlineGodownMasterSaved}
          />
        ) : null}
        <DeleteConfirmModal
          isOpen={pendingLoadRequest !== null}
          title="Replace current rows?"
          message=""
          iconVariant="replace"
          confirmLabel={loadConfirmLabel}
          cancelLabel="Keep current rows"
          loading={isLoadingStock}
          loadingLabel={loadConfirmLoadingLabel}
          onConfirm={handleConfirmLoad}
          onCancel={() => {
            if (!isLoadingStock) {
              setPendingLoadRequest(null);
            }
          }}
        />
        <DeleteConfirmModal
          isOpen={isDeleteLoadedStockConfirmOpen}
          itemName={loadedDocumentMeta?.voucherLabel || voucherRefNo || loadedVoucherId || undefined}
          title="Delete Opening Stock?"
          message={
            loadedDocumentMeta?.voucherLabel || voucherRefNo
              ? `Do you really want to delete the loaded opening stock voucher "${loadedDocumentMeta?.voucherLabel || voucherRefNo}"? This action cannot be undone.`
              : "Do you really want to delete the loaded opening stock voucher? This action cannot be undone."
          }
          confirmLabel="Delete Stock"
          cancelLabel="Cancel"
          loading={isDeletingOpeningStock}
          loadingLabel="Deleting..."
          onConfirm={handleConfirmDeleteLoadedStock}
          onCancel={() => {
            if (!isDeletingOpeningStock) {
              setIsDeleteLoadedStockConfirmOpen(false);
            }
          }}
        />
        <DeleteConfirmModal
          isOpen={isUnsavedChangesConfirmOpen}
          title="Leave Opening Stock?"
          message="Unsaved changes will be lost if you leave this page."
          confirmLabel="Leave Page"
          cancelLabel="Stay Here"
          onConfirm={handleConfirmUnsafeNavigation}
          onCancel={handleCancelUnsafeNavigation}
        />
        <OpeningStockAuditNotesModal
          isOpen={pendingOpeningStockSaveRequest !== null}
          notes={openingStockAuditNotes}
          error={openingStockAuditNotesError}
          loading={isSavingOpeningStock}
          voucherLabel={loadedDocumentMeta?.voucherLabel || voucherRefNo || loadedVoucherId}
          onChange={handleOpeningStockAuditNotesChange}
          onConfirm={handleConfirmOpeningStockAuditNotes}
          onCancel={handleCancelOpeningStockAuditNotes}
        />
        <BulkLoadItemsModal
          isOpen={isBulkLoadModalOpen}
          defaultCompanyId={activeCompany?.compId ?? ""}
          defaultBranchId={activeBranch?.id ?? ""}
          loading={isBulkLoadingItems}
          onClose={() => setIsBulkLoadModalOpen(false)}
          onLoadItems={(params) => void handleBulkLoadItems(params)}
        />
        <OpeningStockListModal
          isOpen={isOpeningStockListOpen}
          suspendKeyboardShortcuts={pendingLoadRequest !== null}
          filters={openingStockListFilters}
          rows={openingStockListRows}
          loading={isOpeningStockListLoading}
          error={openingStockListError}
          totalEntries={openingStockListMeta.total}
          currentPage={openingStockListPage}
          pageSize={openingStockListPageSize}
          selectedVoucherId={selectedOpeningStockListVoucherId}
          selectedVoucherLabel={
            selectedOpeningStockListRow
              ? getOpeningStockVoucherLabel(selectedOpeningStockListRow)
              : null
          }
          onClose={handleCloseOpeningStockList}
          onSearchChange={handleOpeningStockListSearchChange}
          onDateFromChange={handleOpeningStockListDateFromChange}
          onDateToChange={handleOpeningStockListDateToChange}
          onPageChange={setOpeningStockListPage}
          onPageSizeChange={handleOpeningStockListPageSizeChange}
          onSelectRow={handleOpeningStockListRowSelect}
          onLoadRow={handleLoadOpeningStockListRow}
          onLoadSelected={handleLoadSelectedOpeningStockListRow}
        />
      </section>
    </>
  );
}
