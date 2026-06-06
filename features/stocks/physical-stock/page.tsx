"use client";
import {
  type CSSProperties,
  type DragEvent as ReactDragEvent,
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
import {
  FiCalendar,
  FiDownload,
  FiList,
  FiRotateCcw,
  FiSave,
  FiSearch,
  FiTrash2,
} from "react-icons/fi";
import { toast } from "react-toastify";
import type { ERPDynamicSelectOption } from "@/components/design-system/ui";
import {
  KeyboardShortcutHints,
  type KeyboardShortcutDefinition,
} from "@/components/design-system/ui/keyboard-shortcut-hints";
import dynamicModalStyles from "@/components/design-system/ui/dynamic-modal-form.module.scss";
import { useBusinessContext } from "@/components/layout/business-context";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import type { CrudMasterPageController } from "@/components/master/crud-master-page";
import ItemMasterPageContent from "@/features/masters/item/item-master-page";
import { extractRows } from "@/features/masters/shared/normalizers";
import { useApi } from "@/hooks/useApi";
import {
  getAuthSessionId,
  getAuthUserId,
  getOrCreateClientDeviceId,
} from "@/lib/auth/session";
import {
  type ItemPriceDetailsPayload,
  useLazyGetItemOptionsQuery,
  useLazyGetItemPriceDetailsByBarcodeQuery,
  useLazyGetItemPriceDetailsQuery,
  useLazyGetUnitOptionsQuery,
} from "@/store/api/lookupsApi";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  listModalToggled,
  selectedDocumentIdSet,
  selectPhysicalStockIsListModalOpen,
  selectPhysicalStockSelectedDocId,
} from "@/store/slices/physicalStockSlice";
import {
  DEFAULT_GODOWN_OPTION,
  DEFAULT_ITEM_OPTION,
  DELETE_ACTION_COLUMN_WIDTH,
  GODOWN_LIST_ENDPOINT,
  GODOWN_LOOKUP_QUERY,
  MIN_RESIZABLE_COLUMN_WIDTH,
  QUANTITY_FORMATTER,
  SERIAL_NUMBER_COLUMN_WIDTH,
  VALUE_FORMATTER,
} from "@/features/stocks/_shared/constants";
import { LookupCell } from "@/features/stocks/_shared/LookupCell";
import type {
  ColumnAlign,
  ColumnKind,
  LookupCellState,
  LookupKind,
} from "@/features/stocks/_shared/types";
import {
  PhysicalStockListModal,
  type PhysicalStockListRow,
} from "./PhysicalStockListModal";
import {
  BulkLoadItemsModal,
  type BulkLoadParams,
} from "./BulkLoadItemsModal";
import {
  buildLoadedLookupOptions,
  buildGodownLookupOptions,
  buildUomOptions,
  cx,
  filterLookupOptions,
  formatAccountingYear,
  formatDateEntry,
  formatDateForDisplay,
  formatQuantityValue,
  focusOpeningStockField,
  getTodayInputValue,
  moveOpeningStockFieldFocus,
  normalizeColumnName,
  openDatePicker,
  parseDecimal,
  resolveDefaultItemPriceRecord,
  resolveItemPriceRecordByUnitId,
  resolveTrackingType,
  mergeLookupOptions,
  toCanonicalDateValue,
  toInputValue,
  toIsoDateTime,
  toNullableTrimmedString,
} from "@/features/stocks/opening-stock/opening-stock.utils";
import styles from "@/features/stocks/_shared/stock-page.module.scss";
import type {
  PhysicalStockColumn,
  PhysicalStockRow,
  PhysicalStockSaveDetail,
  PhysicalStockSaveRequest,
  PhysicalStockSuccessResponse,
  PhysicalStockListMeta,
  PhysicalStockHeaderPayload,
  PhysicalStockBatchDetailPayload,
  PhysicalStockDetailPayload,
  PhysicalStockDocumentResponse,
  ItemStockBalancePayload,
  ItemBatchStockLookupPayload,
  ItemStockBalanceRowScope,
  RowValidationIssue,
  UiTableColumnPayload,
  SavePhysicalStockUiTableColumnRequest,
  PhysicalStockColumnSettingsDraftEntry,
  PhysicalStockLoadRequest,
  PhysicalStockListFilters,
  LoadedPhysicalStockMeta,
  StockAdjReasonPayload,
  BulkItemStockPayload,
} from "./physical-stock.types";
import {
  PHYSICAL_STOCK_SAVE_ENDPOINT,
  PHYSICAL_STOCK_LIST_ENDPOINT,
  PHYSICAL_STOCK_GET_ENDPOINT,
  PHYSICAL_STOCK_DELETE_ENDPOINT,
  ITEM_STOCK_BALANCE_GET_ENDPOINT,
  ITEM_STOCK_BALANCE_BULK_LIST_ENDPOINT,
  ITEM_BATCH_STOCK_OPTIONS_ENDPOINT,
  ITEM_STOCK_BALANCE_BUCKET,
  STOCK_ADJ_REASONS_ENDPOINT,
  UI_TABLE_COLUMNS_LIST_ENDPOINT,
  UI_TABLE_COLUMNS_CREATE_ENDPOINT,
  UI_TABLE_COLUMNS_QUERY,
  LOOKUP_SEARCH_DEBOUNCE_MS,
  PHYSICAL_STOCK_TABLE_SHORTCUTS,
  TRACKING_OPTIONS,
  TRACKING_TYPE_OPTION_LABELS,
  PHYSICAL_STOCK_COLUMNS,
  PHYSICAL_STOCK_COLUMN_SCHEMA,
  HIDDEN_ROW_VALUE_DEFAULTS,
  UUID_PATTERN,
  DATE_FIELD_KEYS,
  QUANTITY_FIELD_KEYS,
  DERIVED_FIELD_KEYS,
  NON_NEGATIVE_NUMBER_FIELD_KEYS,
  DEFAULT_BATCH_OPTION,
  DEFAULT_PHYSICAL_STOCK_LIST_FILTERS,
  EMPTY_PHYSICAL_STOCK_LIST_META,
} from "./physical-stock.constants";
import {
  DEFAULT_ROW_VALUES,
  createEmptyRow,
  createRow,
  getNextRowId,
  isPristineRow,
  getDraftRows,
  formatAmountInput,
  getActualConvFactor,
  withDerivedPhysicalValues,
  parseOptionalStockNumber,
  buildStockBalanceQuantityValues,
  isBatchLookupTrackingType,
  getBatchLookupOptionLabel,
  buildBatchLookupOptions,
  hasBatchLookupScope,
  ensureTrailingEmptyRow,
  buildInvalidFieldState,
  getAlignClass,
  handleFieldNavigationKeyDown,
  getTrackingOptionFromItem,
  getTrackingPayloadValue,
  getColumnMinWidth,
  parseColumnWidth,
  toColumnWidth,
  reorderColumns,
  buildPhysicalStockColumnSettingsRows,
  findPhysicalStockUiTableColumnConfig,
  buildPhysicalStockUiTableColumnRequest,
  buildPhysicalStockUiTableColumnSettingsRequest,
  upsertPhysicalStockUiTableColumnConfig,
  resolveConfiguredColumns,
  buildDocumentNumber,
  toOptionalUuid,
  getReasonRemarks,
  getRowValidationIssues,
  renderValidationToastContent,
  buildPhysicalStockDetailPayload,
  createPhysicalStockListFiltersForToday,
  getPhysicalStockLabel,
  getPhysicalStockListErrorMessage,
  getTrackingOptionFromPayload,
  mapPhysicalStockDocumentToRows,
} from "./physical-stock.utils";
type TableSettingsContextMenuPosition = Pick<CSSProperties, "left" | "top">;
type InlineItemMasterRequest = {
  itemId: string;
  mode: "create" | "update";
  query: string;
  rowId: number;
};
const TABLE_SETTINGS_CONTEXT_MENU_WIDTH = 190;
const TABLE_SETTINGS_CONTEXT_MENU_HEIGHT = 64;
const TABLE_SETTINGS_CONTEXT_MENU_PADDING = 8;
function clampContextMenuPosition(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
export default function PhysicalStockPage() {
  const [voucherDate, setVoucherDate] = useState(() => getTodayInputValue());
  const [voucherRefNo, setVoucherRefNo] = useState("");
  const [rows, setRows] = useState<PhysicalStockRow[]>(() => [createEmptyRow(1)]);
  const [loadedPhysicalStockId, setLoadedPhysicalStockId] = useState<string | null>(null);
  const [loadedDocumentMeta, setLoadedDocumentMeta] = useState<LoadedPhysicalStockMeta | null>(
    null,
  );
  const [isLoadingStock, setIsLoadingStock] = useState(false);
  const [pendingLoadRequest, setPendingLoadRequest] = useState<PhysicalStockLoadRequest | null>(
    null,
  );
  const [isDeleteLoadedStockConfirmOpen, setIsDeleteLoadedStockConfirmOpen] = useState(false);
  const [isBulkLoadModalOpen, setIsBulkLoadModalOpen] = useState(false);
  const [isBulkLoadingStock, setIsBulkLoadingStock] = useState(false);
  const dispatch = useAppDispatch();
  const isPhysicalStockListOpen = useAppSelector(selectPhysicalStockIsListModalOpen);
  const [physicalStockListFilters, setPhysicalStockListFilters] =
    useState<PhysicalStockListFilters>(DEFAULT_PHYSICAL_STOCK_LIST_FILTERS);
  const [physicalStockListRows, setPhysicalStockListRows] = useState<PhysicalStockHeaderPayload[]>(
    [],
  );
  const [physicalStockListMeta, setPhysicalStockListMeta] = useState<PhysicalStockListMeta>(
    EMPTY_PHYSICAL_STOCK_LIST_META,
  );
  const [physicalStockListPage, setPhysicalStockListPage] = useState(1);
  const [physicalStockListPageSize, setPhysicalStockListPageSize] = useState(20);
  const [isPhysicalStockListLoading, setIsPhysicalStockListLoading] = useState(false);
  const [physicalStockListError, setPhysicalStockListError] = useState<string | null>(null);
  const selectedPhysicalStockListId = useAppSelector(selectPhysicalStockSelectedDocId);
  const [invalidFieldKeys, setInvalidFieldKeys] = useState<Record<string, true>>({});
  const [itemOptions, setItemOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_ITEM_OPTION]);
  const [godownOptions, setGodownOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_GODOWN_OPTION,
  ]);
  const [unitOptions, setUnitOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [columns, setColumns] = useState<PhysicalStockColumn[]>(PHYSICAL_STOCK_COLUMNS);
  const [uiColumnConfigs, setUiColumnConfigs] = useState<UiTableColumnPayload[]>([]);
  const [tableSettingsContextMenuPosition, setTableSettingsContextMenuPosition] =
    useState<TableSettingsContextMenuPosition | null>(null);
  const [headerSettingsContextMenuPosition, setHeaderSettingsContextMenuPosition] =
    useState<TableSettingsContextMenuPosition | null>(null);
  const [headerSettingsColumnKey, setHeaderSettingsColumnKey] = useState<string | null>(null);
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const [columnSettingsDraft, setColumnSettingsDraft] = useState<
    Record<string, PhysicalStockColumnSettingsDraftEntry>
  >({});
  const [isColumnSettingsSaving, setIsColumnSettingsSaving] = useState(false);
  const [itemDetailsByItemId, setItemDetailsByItemId] = useState<
    Record<string, ItemPriceDetailsPayload>
  >({});
  const [batchOptions, setBatchOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_BATCH_OPTION,
  ]);
  const [reasonOptions, setReasonOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [batchDetailsByBatchId, setBatchDetailsByBatchId] = useState<
    Record<string, ItemBatchStockLookupPayload>
  >({});
  const [openLookupCell, setOpenLookupCell] = useState<LookupCellState | null>(null);
  const [lookupSearchQuery, setLookupSearchQuery] = useState("");
  const [isInlineItemMasterOpen, setIsInlineItemMasterOpen] = useState(false);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const voucherDatePickerRef = useRef<HTMLInputElement | null>(null);
  const rowDatePickerRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const lookupRootRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lookupSearchInputRef = useRef<HTMLInputElement | null>(null);
  const itemSearchTimeoutRef = useRef<number | null>(null);
  const godownSearchTimeoutRef = useRef<number | null>(null);
  const batchSearchTimeoutRef = useRef<number | null>(null);
  const reasonSearchTimeoutRef = useRef<number | null>(null);
  const physicalStockListRequestRef = useRef(0);
  const {
    activeCompany,
    activeBranch,
    loading: isBusinessContextLoading,
  } = useBusinessContext();
  const columnsRef = useRef<PhysicalStockColumn[]>(PHYSICAL_STOCK_COLUMNS);
  const uiColumnConfigsRef = useRef<UiTableColumnPayload[]>([]);
  const draggingColumnKeyRef = useRef<string | null>(null);
  const resizingColumnRef = useRef<{
    key: string;
    startX: number;
    startWidth: number;
    currentWidth: number;
  } | null>(null);
  const columnSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const inlineItemMasterControllerRef = useRef<CrudMasterPageController | null>(null);
  const pendingInlineItemMasterRequestRef = useRef<InlineItemMasterRequest | null>(null);
  const [triggerItemOptions, { isFetching: isItemLookupLoading }] =
    useLazyGetItemOptionsQuery();
  const [triggerUnitOptions] = useLazyGetUnitOptionsQuery();
  const [triggerItemPriceDetails] = useLazyGetItemPriceDetailsQuery();
  const [triggerItemPriceDetailsByBarcode] = useLazyGetItemPriceDetailsByBarcodeQuery();
  const { getAll: listUiTableColumns } = useApi<unknown>(UI_TABLE_COLUMNS_LIST_ENDPOINT, {
    toast: {
      success: false,
      error: false,
    },
  });
  const { run: saveUiTableColumn } = useApi<
    { data?: UiTableColumnPayload },
    SavePhysicalStockUiTableColumnRequest
  >(UI_TABLE_COLUMNS_CREATE_ENDPOINT, {
    method: "POST",
    toast: {
      success: false,
      error: false,
    },
  });
  const { run: listGodowns, loading: isGodownLookupLoading } = useApi<unknown>(
    GODOWN_LIST_ENDPOINT,
    {
      toast: {
        success: false,
        error: false,
      },
    },
  );
  const { run: savePhysicalStock, loading: isSavingPhysicalStock } = useApi<
    PhysicalStockSuccessResponse<PhysicalStockDocumentResponse>,
    PhysicalStockSaveRequest
  >(PHYSICAL_STOCK_SAVE_ENDPOINT, {
    method: "POST",
    toast: {
      successMessage: "Physical stock updated successfully.",
    },
  });
  const { run: listPhysicalStocks } = useApi<
    PhysicalStockSuccessResponse<PhysicalStockHeaderPayload[]>
  >(PHYSICAL_STOCK_LIST_ENDPOINT, {
    toast: {
      success: false,
    },
  });
  const { run: listPhysicalStockRecords } = useApi<
    PhysicalStockSuccessResponse<PhysicalStockHeaderPayload[]>
  >(PHYSICAL_STOCK_LIST_ENDPOINT, {
    toast: {
      success: false,
      error: false,
    },
  });
  const { run: getPhysicalStockDocument } = useApi<
    PhysicalStockSuccessResponse<PhysicalStockDocumentResponse>
  >(PHYSICAL_STOCK_GET_ENDPOINT, {
    toast: {
      success: false,
    },
  });
  const { run: getPhysicalStockDocumentByRefNo } = useApi<
    PhysicalStockSuccessResponse<PhysicalStockDocumentResponse>
  >(PHYSICAL_STOCK_LIST_ENDPOINT, {
    toast: {
      success: false,
    },
  });
  const { run: deletePhysicalStock, loading: isDeletingPhysicalStock } = useApi<unknown>(
    PHYSICAL_STOCK_DELETE_ENDPOINT,
    {
      method: "DELETE",
      toast: {
        successMessage: "Physical stock deleted successfully.",
      },
    },
  );
  const { run: getBulkItemStockList } = useApi<
    PhysicalStockSuccessResponse<BulkItemStockPayload[]>
  >(ITEM_STOCK_BALANCE_BULK_LIST_ENDPOINT, {
    toast: {
      success: false,
      error: false,
    },
  });
  const { run: getItemStockBalance } = useApi<
    PhysicalStockSuccessResponse<ItemStockBalancePayload[]>
  >(ITEM_STOCK_BALANCE_GET_ENDPOINT, {
    toast: {
      success: false,
      error: false,
    },
  });
  const { run: listItemBatchStockOptions, loading: isBatchLookupLoading } = useApi<
    PhysicalStockSuccessResponse<ItemBatchStockLookupPayload[]>
  >(ITEM_BATCH_STOCK_OPTIONS_ENDPOINT, {
    toast: {
      success: false,
      error: false,
    },
  });
  const { getAll: listStockAdjReasons, loading: isReasonLookupLoading } =
    useApi<{ success: true; data: StockAdjReasonPayload[] }>(STOCK_ADJ_REASONS_ENDPOINT, {
      toast: {
        success: false,
        error: false,
      },
    });
  const itemOptionsByValue = useMemo(
    () => new Map(itemOptions.map((option) => [option.value, option.label])),
    [itemOptions],
  );
  const godownOptionsByValue = useMemo(
    () => new Map(godownOptions.map((option) => [option.value, option.label])),
    [godownOptions],
  );
  const unitOptionsByValue = useMemo(
    () => new Map(unitOptions.map((option) => [option.value, option.label])),
    [unitOptions],
  );
  const reasonOptionsByValue = useMemo(
    () => new Map(reasonOptions.map((option) => [option.value, option.label])),
    [reasonOptions],
  );
  const draftRows = useMemo(() => getDraftRows(rows), [rows]);
  const accountingYear = useMemo(() => formatAccountingYear(voucherDate), [voucherDate]);
  const selectedPhysicalStockListRow = useMemo(
    () =>
      physicalStockListRows.find((row) => row.psc_id === selectedPhysicalStockListId) ?? null,
    [physicalStockListRows, selectedPhysicalStockListId],
  );
  const tableMinWidth = useMemo(
    () => getColumnMinWidth(columns),
    [columns],
  );
  const columnSettingsRows = useMemo(
    () => buildPhysicalStockColumnSettingsRows(uiColumnConfigs, columns),
    [columns, uiColumnConfigs],
  );
  const totals = useMemo(
    () =>
      draftRows.reduce(
        (accumulator, row) => ({
          bookQty: accumulator.bookQty + parseDecimal(row.values.bookqty),
          physicalQty: accumulator.physicalQty + parseDecimal(row.values.physicalqty),
          diffQty: accumulator.diffQty + parseDecimal(row.values.diffqty),
          value: accumulator.value + parseDecimal(row.values.total),
        }),
        { bookQty: 0, physicalQty: 0, diffQty: 0, value: 0 },
      ),
    [draftRows],
  );
  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);
  useEffect(() => {
    uiColumnConfigsRef.current = uiColumnConfigs;
  }, [uiColumnConfigs]);
  const applyPhysicalStockColumnConfigs = useCallback((configuredColumns: UiTableColumnPayload[]) => {
    uiColumnConfigsRef.current = configuredColumns;
    setUiColumnConfigs(configuredColumns);
    const resolvedColumns = resolveConfiguredColumns(configuredColumns);
    const nextColumns =
      configuredColumns.length > 0 ? resolvedColumns : PHYSICAL_STOCK_COLUMNS;
    columnsRef.current = nextColumns;
    setColumns(nextColumns);
  }, []);
  const loadItemOptions = useCallback(
    async (search = "") => {
      const normalizedSearch = search.trim();
      const nextOptions = await triggerItemOptions(
        normalizedSearch ? { search: normalizedSearch } : undefined,
        true,
      ).unwrap();
      setItemOptions(nextOptions);
    },
    [triggerItemOptions],
  );
  const loadGodownOptions = useCallback(
    async (search = "") => {
      const normalizedSearch = search.trim();
      const payload = await listGodowns({
        query: {
          ...GODOWN_LOOKUP_QUERY,
          ...(normalizedSearch ? { search: normalizedSearch } : {}),
        },
      });
      setGodownOptions(buildGodownLookupOptions(payload, activeBranch?.brId));
    },
    [activeBranch?.brId, listGodowns],
  );
  const loadReasonOptions = useCallback(
    async () => {
      const response = await listStockAdjReasons({ activeOnly: "true" });
      const reasons: StockAdjReasonPayload[] = response?.data ?? [];
      setReasonOptions(
        reasons.map((r) => ({ value: r.sarId, label: r.sarName })),
      );
    },
    [listStockAdjReasons],
  );
  const loadBatchOptions = useCallback(
    async (row: PhysicalStockRow, search = "") => {
      const accountingYear = formatAccountingYear(voucherDate);
      const companyId = activeCompany?.compId?.trim() ?? "";
      const branchId = activeBranch?.brId?.trim() ?? "";
      const itemId = row.values.oslitemid?.trim() ?? "";
      const unitId = row.values.oslunitid?.trim() ?? "";
      const godownId = row.values.oslgodownid?.trim() ?? "";
      if (!accountingYear || !companyId || !branchId || !itemId || !unitId || !godownId) {
        setBatchOptions([DEFAULT_BATCH_OPTION]);
        return;
      }
      try {
        const response = await listItemBatchStockOptions({
          query: {
            ibs_acc_year: accountingYear,
            ibs_company_id: companyId,
            ibs_branch_id: branchId,
            ibs_godown_id: godownId,
            ibs_item_id: itemId,
            ibs_unit_id: unitId,
            ibs_stock_bucket: ITEM_STOCK_BALANCE_BUCKET,
            limit: "50",
            ...(search.trim() ? { search: search.trim() } : {}),
          },
        });
        const batches = response?.data ?? [];
        setBatchOptions(buildBatchLookupOptions(batches));
        setBatchDetailsByBatchId((current) => {
          const next = { ...current };
          for (const batch of batches) {
            if (batch.ibs_batch_id) {
              next[batch.ibs_batch_id] = batch;
            }
          }
          return next;
        });
      } catch {
        setBatchOptions([DEFAULT_BATCH_OPTION]);
      }
    },
    [
      activeBranch?.brId,
      activeCompany?.compId,
      listItemBatchStockOptions,
      voucherDate,
    ],
  );
  useEffect(() => {
    void (async () => {
      try {
        const payload = await listUiTableColumns(UI_TABLE_COLUMNS_QUERY);
        const configuredColumns = extractRows<UiTableColumnPayload>(payload, [
          "data",
          "rows",
          "items",
          "results",
          "columns",
          "uiTableColumns",
        ]);
        applyPhysicalStockColumnConfigs(configuredColumns);
      } catch {
        applyPhysicalStockColumnConfigs([]);
      }
    })();
  }, [applyPhysicalStockColumnConfigs, listUiTableColumns]);
  useEffect(() => {
    void loadItemOptions();
  }, [loadItemOptions]);
  useEffect(() => {
    void loadGodownOptions();
  }, [loadGodownOptions]);
  useEffect(() => {
    void loadReasonOptions();
  }, [loadReasonOptions]);
  useEffect(() => {
    void (async () => {
      try {
        const options = await triggerUnitOptions(undefined, true).unwrap();
        setUnitOptions(options);
      } catch {
        setUnitOptions([]);
      }
    })();
  }, [triggerUnitOptions]);
  useEffect(() => {
    if (!openLookupCell) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const activeRoot = lookupRootRefs.current[openLookupCell.key];
      if (activeRoot?.contains(event.target as Node)) {
        return;
      }
      setOpenLookupCell(null);
      setLookupSearchQuery("");
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openLookupCell]);
  useEffect(() => {
    return () => {
      if (itemSearchTimeoutRef.current !== null) {
        window.clearTimeout(itemSearchTimeoutRef.current);
      }
      if (godownSearchTimeoutRef.current !== null) {
        window.clearTimeout(godownSearchTimeoutRef.current);
      }
      if (batchSearchTimeoutRef.current !== null) {
        window.clearTimeout(batchSearchTimeoutRef.current);
      }
    };
  }, []);
  const handleRowChange = useCallback((rowId: number, fieldKey: string, value: string) => {
    setRows((currentRows) => {
      const nextRows = currentRows.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        const baseValues = {
          ...row.values,
          [fieldKey]: value,
        };
        const shouldClearBatchSelection =
          fieldKey === "batchno" ||
          fieldKey === "itemname" ||
          fieldKey === "godown" ||
          fieldKey === "uom" ||
          fieldKey === "oslitemid" ||
          fieldKey === "oslgodownid" ||
          fieldKey === "oslunitid";
        const batchAwareValues =
          fieldKey === "osltrackingtype" && !isBatchLookupTrackingType(value)
            ? {
                ...baseValues,
                batchid: "",
                batchno: "",
                mfgbatchno: "",
                serialno: "",
                batchdate: "",
                mfgdate: "",
                expirydate: "",
              }
            : shouldClearBatchSelection
              ? {
                  ...baseValues,
                  batchid: "",
                  ...(fieldKey === "batchno" ? {} : { batchno: "" }),
                  mfgbatchno: "",
                }
              : baseValues;
        const nextValues = withDerivedPhysicalValues(batchAwareValues);
        return {
          ...row,
          values: nextValues,
        };
      });
      return ensureTrailingEmptyRow(nextRows, rowId);
    });
    setInvalidFieldKeys((current) => {
      const invalidKey = `${rowId}:${fieldKey}`;
      if (!current[invalidKey]) {
        return current;
      }
      const next = { ...current };
      delete next[invalidKey];
      return next;
    });
  }, []);
  const handleRemoveRow = useCallback((rowId: number) => {
    setRows((currentRows) => {
      if (currentRows.length <= 1) {
        return [createEmptyRow(1)];
      }
      const nextRows = currentRows.filter((row) => row.id !== rowId);
      return nextRows.length > 0 ? nextRows : [createEmptyRow(1)];
    });
    setInvalidFieldKeys((current) => {
      const prefix = `${rowId}:`;
      const next = Object.fromEntries(
        Object.entries(current).filter(([key]) => !key.startsWith(prefix)),
      ) as Record<string, true>;
      return next;
    });
  }, []);
  const applyItemStockBalanceToRow = useCallback(
    (rowId: number, balance: ItemStockBalancePayload, scope: ItemStockBalanceRowScope) => {
      setRows((currentRows) =>
        currentRows.map((row) => {
          if (row.id !== rowId) {
            return row;
          }
          if (
            row.values.oslitemid.trim() !== scope.itemId ||
            row.values.oslunitid.trim() !== scope.unitId ||
            row.values.oslgodownid.trim() !== scope.godownId
          ) {
            return row;
          }
          return {
            ...row,
            values: buildStockBalanceQuantityValues(row.values, balance),
          };
        }),
      );
    },
    [],
  );
  const loadAndApplyItemStockBalance = useCallback(
    async (rowId: number, values: Record<string, string>) => {
      const accountingYear = formatAccountingYear(voucherDate);
      const companyId = activeCompany?.compId?.trim() ?? "";
      const branchId = activeBranch?.brId?.trim() ?? "";
      const scope: ItemStockBalanceRowScope = {
        itemId: values.oslitemid?.trim() ?? "",
        unitId: values.oslunitid?.trim() ?? "",
        godownId: values.oslgodownid?.trim() ?? "",
      };
      if (
        !accountingYear ||
        !companyId ||
        !branchId ||
        !scope.itemId ||
        !scope.unitId ||
        !scope.godownId
      ) {
        return;
      }
      try {
        const response = await getItemStockBalance({
          query: {
            isb_acc_year: accountingYear,
            isb_company_id: companyId,
            isb_branch_id: branchId,
            isb_godown_id: scope.godownId,
            isb_item_id: scope.itemId,
            isb_unit_id: scope.unitId,
            isb_stock_bucket: ITEM_STOCK_BALANCE_BUCKET,
          },
        });
        const [balance] = response?.data ?? [];
        if (!balance) {
          return;
        }
        applyItemStockBalanceToRow(rowId, balance, scope);
      } catch {
        // The balance lookup is an autofill aid; keep the row editable if it fails.
      }
    },
    [
      activeBranch?.brId,
      activeCompany?.compId,
      applyItemStockBalanceToRow,
      getItemStockBalance,
      voucherDate,
    ],
  );
  const applyItemDetailToRow = useCallback(
    (
      rowId: number,
      selectedLabel: string,
      detail: ItemPriceDetailsPayload,
      preferredUnitId?: string,
    ) => {
      const priceRecord = preferredUnitId
        ? resolveItemPriceRecordByUnitId(detail, preferredUnitId)
        : resolveDefaultItemPriceRecord(detail.item_prices);
      const unitId = priceRecord?.ipm_unit_id ?? detail.item.item_base_unit_id ?? "";
      const baseUnitId = priceRecord?.ipm_base_unit_id ?? detail.item.item_base_unit_id ?? unitId;
      const displayConvFactor = priceRecord?.ipm_unit_factor ?? priceRecord?.ipm_to_base_factor ?? 1;
      const toBaseFactor = priceRecord?.ipm_to_base_factor ?? displayConvFactor;
      const godownId = priceRecord?.ipm_godown_id ?? "";
      const currentRowValues = rows.find((row) => row.id === rowId)?.values;
      const resolvedGodownId = godownId || currentRowValues?.oslgodownid?.trim() || "";
      setRows((currentRows) => {
        const nextRows = currentRows.map((row) => {
          if (row.id !== rowId) {
            return row;
          }
          const nextValues = withDerivedPhysicalValues({
            ...row.values,
            itemname: detail.item.item_name_en?.trim() || selectedLabel,
            oslitemid: detail.item.item_id,
            barcode: toInputValue(detail.item.item_default_barcode),
            code: toInputValue(detail.item.item_code),
            uom: unitOptionsByValue.get(unitId) ?? "",
            godown: godownId ? godownOptionsByValue.get(godownId) ?? "" : row.values.godown,
            convfactor: toInputValue(toBaseFactor || displayConvFactor || 1),
            costprice: toInputValue(priceRecord?.ipm_cost_price),
            costwot: toInputValue(priceRecord?.ipm_cost_wot),
            mrp: toInputValue(priceRecord?.ipm_max_price),
            remarks: toInputValue(
              priceRecord?.ipm_uom_remarks ??
                priceRecord?.ipm_cost_remarks ??
                detail.item.item_notes,
            ),
            oslunitid: unitId,
            oslbaseuomid: toInputValue(priceRecord?.ipm_id),
            oslgodownid: godownId || row.values.oslgodownid,
            osltrackingtype: getTrackingOptionFromItem(detail),
            baseunitid: baseUnitId,
            batchid: "",
            batchno: "",
            mfgbatchno: "",
            serialno: "",
            batchdate: "",
            mfgdate: "",
            expirydate: "",
          });
          return {
            ...row,
            values: nextValues,
          };
        });
        return ensureTrailingEmptyRow(nextRows, rowId);
      });
      void loadAndApplyItemStockBalance(rowId, {
        ...DEFAULT_ROW_VALUES,
        ...(currentRowValues ?? {}),
        oslitemid: detail.item.item_id,
        oslunitid: unitId,
        oslgodownid: resolvedGodownId,
      });
    },
    [godownOptionsByValue, loadAndApplyItemStockBalance, rows, unitOptionsByValue],
  );
  const handleLookupSelection = useCallback(
    async (rowId: number, lookupKind: LookupKind, option: ERPDynamicSelectOption) => {
      setOpenLookupCell(null);
      setLookupSearchQuery("");
      if (lookupKind === "batch") {
        const batchDetail = option.value ? batchDetailsByBatchId[option.value] : undefined;
        setRows((currentRows) => {
          const nextRows = currentRows.map((row) => {
            if (row.id !== rowId) {
              return row;
            }
            if (!option.value) {
              return {
                ...row,
                values: withDerivedPhysicalValues({
                  ...row.values,
                  batchid: "",
                  batchno: "",
                  mfgbatchno: "",
                  serialno: "",
                  batchdate: "",
                  mfgdate: "",
                  expirydate: "",
                }),
              };
            }
            const batchDate = formatDateForDisplay(batchDetail?.ibs_batch_date);
            const mfgDate = formatDateForDisplay(batchDetail?.ibs_mfg_date);
            const expiryDate = formatDateForDisplay(batchDetail?.ibs_expiry_date);
            const nextValues = {
              ...row.values,
              batchid: batchDetail?.ibs_batch_id ?? option.value,
              batchno: batchDetail ? getBatchLookupOptionLabel(batchDetail) : option.label,
              mfgbatchno: toInputValue(batchDetail?.ibs_mfg_batch_no),
              ...(batchDate ? { batchdate: batchDate } : {}),
              ...(mfgDate ? { mfgdate: mfgDate } : {}),
              ...(expiryDate ? { expirydate: expiryDate } : {}),
              mrp: toInputValue(batchDetail?.ibs_mrp) || row.values.mrp,
              barcode: toInputValue(batchDetail?.ibs_barcode) || row.values.barcode,
              serialno: toInputValue(batchDetail?.ibs_serial_no),
            };
            return {
              ...row,
              values: batchDetail
                ? buildStockBalanceQuantityValues(nextValues, batchDetail)
                : withDerivedPhysicalValues(nextValues),
            };
          });
          return ensureTrailingEmptyRow(nextRows, rowId);
        });
        setInvalidFieldKeys((current) => {
          const invalidKey = `${rowId}:batchno`;
          if (!current[invalidKey]) {
            return current;
          }
          const next = { ...current };
          delete next[invalidKey];
          return next;
        });
        return;
      }
      if (lookupKind === "godown") {
        const currentRowValues = rows.find((row) => row.id === rowId)?.values;
        const nextRowValues = {
          ...DEFAULT_ROW_VALUES,
          ...(currentRowValues ?? {}),
          godown: option.value ? option.label : "",
          oslgodownid: option.value,
          batchid: "",
          batchno: "",
          mfgbatchno: "",
          serialno: "",
          batchdate: "",
          mfgdate: "",
          expirydate: "",
        };
        setRows((currentRows) => {
          const nextRows = currentRows.map((row) =>
            row.id === rowId
              ? {
                  ...row,
                  values: {
                    ...row.values,
                    godown: option.value ? option.label : "",
                    oslgodownid: option.value,
                    batchid: "",
                    batchno: "",
                    mfgbatchno: "",
                    serialno: "",
                    batchdate: "",
                    mfgdate: "",
                    expirydate: "",
                  },
                }
              : row,
          );
          return ensureTrailingEmptyRow(nextRows, rowId);
        });
        void loadAndApplyItemStockBalance(rowId, nextRowValues);
        return;
      }
      if (lookupKind === "reason") {
        setRows((currentRows) => {
          const nextRows = currentRows.map((row) =>
            row.id === rowId
              ? {
                  ...row,
                  values: {
                    ...row.values,
                    reason: option.value ? option.label : "",
                    oslreasonid: option.value,
                  },
                }
              : row,
          );
          return ensureTrailingEmptyRow(nextRows, rowId);
        });
        return;
      }
      if (!option.value) {
        setRows((currentRows) =>
          currentRows.map((row) =>
            row.id === rowId
              ? createRow(row.id, {
                  bookqty: row.values.bookqty,
                  bookfreeqty: row.values.bookfreeqty,
                  physicalqty: row.values.physicalqty,
                  physicalfreeqty: row.values.physicalfreeqty,
                })
              : row,
          ),
        );
        return;
      }
      setRows((currentRows) => {
        const nextRows = currentRows.map((row) =>
          row.id === rowId
            ? {
                ...row,
                values: {
                  ...row.values,
                  itemname: option.label,
                  oslitemid: option.value,
                },
              }
            : row,
        );
        return ensureTrailingEmptyRow(nextRows, rowId);
      });
      try {
        const detail = await triggerItemPriceDetails({ itemId: option.value }, true).unwrap();
        setItemDetailsByItemId((current) => ({
          ...current,
          [detail.item.item_id]: detail,
        }));
        applyItemDetailToRow(rowId, option.label, detail);
      } catch {
        toast.error("Failed to load item price details.", {
          toastId: "physical-stock:item-detail-failed",
        });
      }
    },
    [
      applyItemDetailToRow,
      batchDetailsByBatchId,
      loadAndApplyItemStockBalance,
      rows,
      triggerItemPriceDetails,
    ],
  );
  const handleUomChange = useCallback(
    (rowId: number, unitId: string) => {
      const row = rows.find((entry) => entry.id === rowId);
      const itemId = row?.values.oslitemid?.trim() ?? "";
      const itemDetail = itemId ? itemDetailsByItemId[itemId] : undefined;
      if (itemDetail) {
        applyItemDetailToRow(rowId, row?.values.itemname ?? "", itemDetail, unitId);
        return;
      }
      handleRowChange(rowId, "oslunitid", unitId);
      handleRowChange(rowId, "uom", unitOptionsByValue.get(unitId) ?? "");
      void loadAndApplyItemStockBalance(rowId, {
        ...DEFAULT_ROW_VALUES,
        ...(row?.values ?? {}),
        oslunitid: unitId,
        uom: unitOptionsByValue.get(unitId) ?? "",
      });
    },
    [
      applyItemDetailToRow,
      handleRowChange,
      itemDetailsByItemId,
      loadAndApplyItemStockBalance,
      rows,
      unitOptionsByValue,
    ],
  );
  const handleBarcodeEnter = useCallback(
    async (rowId: number, barcode: string) => {
      const normalized = barcode.trim();
      if (!normalized) {
        return;
      }
      try {
        const detail = await triggerItemPriceDetailsByBarcode({ barcode: normalized }, true).unwrap();
        setItemDetailsByItemId((current) => ({
          ...current,
          [detail.item.item_id]: detail,
        }));
        const label = detail.item.item_name_en?.trim() || normalized;
        setItemOptions((current) => {
          const exists = current.some((opt) => opt.value === detail.item.item_id);
          if (exists) {
            return current;
          }
          return [...current, { value: detail.item.item_id, label }];
        });
        applyItemDetailToRow(rowId, label, detail);
      } catch {
        toast.error("No item found for the entered barcode.", {
          toastId: "physical-stock:barcode-not-found",
        });
      }
    },
    [applyItemDetailToRow, triggerItemPriceDetailsByBarcode],
  );
  const handleLookupToggle = useCallback(
    (cellKey: string, lookupKind: LookupKind, row?: PhysicalStockRow) => {
      const isClosing = openLookupCell?.key === cellKey;
      setOpenLookupCell(isClosing ? null : { key: cellKey, kind: lookupKind });
      setLookupSearchQuery("");
      if (!isClosing) {
        if (lookupKind === "item") {
          void loadItemOptions();
        } else if (lookupKind === "batch" && row) {
          void loadBatchOptions(row);
        } else if (lookupKind === "reason") {
          void loadReasonOptions();
        } else {
          void loadGodownOptions();
        }
      }
    },
    [loadBatchOptions, loadGodownOptions, loadItemOptions, loadReasonOptions, openLookupCell?.key],
  );
  const openColumnSettings = useCallback(() => {
    const nextDraft: Record<string, PhysicalStockColumnSettingsDraftEntry> = {};
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
    setHeaderSettingsContextMenuPosition(null);
    setHeaderSettingsColumnKey(null);
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
      field: keyof PhysicalStockColumnSettingsDraftEntry,
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
    const nextDraft: Record<string, PhysicalStockColumnSettingsDraftEntry> = {};
    for (const row of columnSettingsRows) {
      nextDraft[row.key] = {
        visible: true,
        focus: false,
        necessity: false,
      };
    }
    setColumnSettingsDraft(nextDraft);
  }, [columnSettingsRows]);
  const saveColumnSettings = useCallback(async () => {
    if (!isColumnSettingsOpen || columnSettingsRows.length === 0) {
      return;
    }
    setIsColumnSettingsSaving(true);
    try {
      for (const row of columnSettingsRows) {
        const draft =
          columnSettingsDraft[row.key] ??
          ({
            visible: row.visible,
            focus: row.focus,
            necessity: row.necessity,
          } satisfies PhysicalStockColumnSettingsDraftEntry);
        await saveUiTableColumn({
          body: buildPhysicalStockUiTableColumnSettingsRequest(row, draft),
        });
      }
      const payload = await listUiTableColumns(UI_TABLE_COLUMNS_QUERY);
      const nextColumnConfigs = extractRows<UiTableColumnPayload>(payload, [
        "data",
        "rows",
        "items",
        "results",
        "columns",
        "uiTableColumns",
      ]);
      applyPhysicalStockColumnConfigs(nextColumnConfigs);
      setIsColumnSettingsOpen(false);
    } catch {
      // useApi handles error toast behavior.
    } finally {
      setIsColumnSettingsSaving(false);
    }
  }, [
    applyPhysicalStockColumnConfigs,
    columnSettingsDraft,
    columnSettingsRows,
    isColumnSettingsOpen,
    listUiTableColumns,
    saveUiTableColumn,
  ]);
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
          event.clientX,
          TABLE_SETTINGS_CONTEXT_MENU_PADDING,
          window.innerWidth - TABLE_SETTINGS_CONTEXT_MENU_WIDTH,
        ),
        top: clampContextMenuPosition(
          event.clientY,
          TABLE_SETTINGS_CONTEXT_MENU_PADDING,
          window.innerHeight - TABLE_SETTINGS_CONTEXT_MENU_HEIGHT,
        ),
      });
      setHeaderSettingsContextMenuPosition(null);
      setHeaderSettingsColumnKey(null);
    },
    [columnSettingsRows.length],
  );
  const handleColumnHeaderContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLTableCellElement>, column: PhysicalStockColumn) => {
      event.preventDefault();
      event.stopPropagation();
      setOpenLookupCell(null);
      setTableSettingsContextMenuPosition(null);
      setHeaderSettingsColumnKey(column.key);
      setHeaderSettingsContextMenuPosition({
        left: clampContextMenuPosition(
          event.clientX,
          TABLE_SETTINGS_CONTEXT_MENU_PADDING,
          window.innerWidth - TABLE_SETTINGS_CONTEXT_MENU_WIDTH,
        ),
        top: clampContextMenuPosition(
          event.clientY,
          TABLE_SETTINGS_CONTEXT_MENU_PADDING,
          window.innerHeight - TABLE_SETTINGS_CONTEXT_MENU_HEIGHT,
        ),
      });
    },
    [],
  );
  const handleHideHeaderColumn = useCallback(
    async (column: PhysicalStockColumn) => {
      setHeaderSettingsContextMenuPosition(null);
      setHeaderSettingsColumnKey(null);
      setOpenLookupCell(null);

      const renderedColumns = columnsRef.current;
      const columnIndex = renderedColumns.findIndex((entry) => entry.key === column.key);
      if (columnIndex < 0) {
        return;
      }

      setColumns((current) => current.filter((entry) => entry.key !== column.key));

      const configuredColumn = findPhysicalStockUiTableColumnConfig(
        uiColumnConfigsRef.current,
        column.key,
      );
      try {
        const response = await saveUiTableColumn({
          body: buildPhysicalStockUiTableColumnRequest(
            column,
            configuredColumn,
            columnIndex,
            {
              uiTblClmColumnWidth: parseColumnWidth(column.width),
              uiTblClmColumnVisibility: false,
            },
          ),
        });
        const savedColumn = response?.data;
        if (!savedColumn) {
          return;
        }
        setUiColumnConfigs((current) => {
          const nextColumns = upsertPhysicalStockUiTableColumnConfig(
            current,
            savedColumn,
            column.key,
          );
          uiColumnConfigsRef.current = nextColumns;
          return nextColumns;
        });
      } catch {
        // Keep the local hide even if persistence fails.
      }
    },
    [saveUiTableColumn],
  );
  useEffect(() => {
    if (
      tableSettingsContextMenuPosition === null &&
      headerSettingsContextMenuPosition === null
    ) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest('[data-physical-stock-settings-context-menu="true"]') ||
        target?.closest('[data-physical-stock-header-context-menu="true"]')
      ) {
        return;
      }
      setTableSettingsContextMenuPosition(null);
      setHeaderSettingsContextMenuPosition(null);
      setHeaderSettingsColumnKey(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTableSettingsContextMenuPosition(null);
        setHeaderSettingsContextMenuPosition(null);
        setHeaderSettingsColumnKey(null);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [headerSettingsContextMenuPosition, tableSettingsContextMenuPosition]);
  useEffect(() => {
    if (
      tableSettingsContextMenuPosition === null &&
      headerSettingsContextMenuPosition === null
    ) {
      return;
    }
    const closeContextMenu = () => {
      setTableSettingsContextMenuPosition(null);
      setHeaderSettingsContextMenuPosition(null);
      setHeaderSettingsColumnKey(null);
    };
    window.addEventListener("resize", closeContextMenu);
    window.addEventListener("scroll", closeContextMenu, true);
    return () => {
      window.removeEventListener("resize", closeContextMenu);
      window.removeEventListener("scroll", closeContextMenu, true);
    };
  }, [headerSettingsContextMenuPosition, tableSettingsContextMenuPosition]);
  useEffect(() => {
    if (!isColumnSettingsOpen) {
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
  const enqueueColumnConfigSave = useCallback((task: () => Promise<void>) => {
    const saveTask = columnSaveQueueRef.current.catch(() => undefined).then(task);
    columnSaveQueueRef.current = saveTask;
    return saveTask;
  }, []);
  const persistPhysicalStockColumnWidth = useCallback(
    async (columnKey: string, width: number) => {
      const renderedColumns = columnsRef.current;
      const columnIndex = renderedColumns.findIndex((column) => column.key === columnKey);
      const column = columnIndex >= 0 ? renderedColumns[columnIndex] : null;
      if (!column || !Number.isFinite(width) || width <= 0) {
        return;
      }
      const configuredColumn = findPhysicalStockUiTableColumnConfig(
        uiColumnConfigsRef.current,
        columnKey,
      );
      try {
        const response = await saveUiTableColumn({
          body: buildPhysicalStockUiTableColumnRequest(column, configuredColumn, columnIndex, {
            uiTblClmColumnWidth: width,
          }),
        });
        const savedColumn = response?.data;
        if (!savedColumn) {
          return;
        }
        setUiColumnConfigs((current) => {
          const nextColumns = upsertPhysicalStockUiTableColumnConfig(
            current,
            savedColumn,
            columnKey,
          );
          uiColumnConfigsRef.current = nextColumns;
          return nextColumns;
        });
      } catch {
        // Keep the local resize even if persistence fails.
      }
    },
    [saveUiTableColumn],
  );
  const persistPhysicalStockColumnOrder = useCallback(
    async (orderedColumns: PhysicalStockColumn[]) => {
      let nextColumnConfigs = uiColumnConfigsRef.current;
      for (const [columnIndex, column] of orderedColumns.entries()) {
        const configuredColumn = findPhysicalStockUiTableColumnConfig(
          nextColumnConfigs,
          column.key,
        );
        try {
          const response = await saveUiTableColumn({
            body: buildPhysicalStockUiTableColumnRequest(column, configuredColumn, columnIndex, {
              uiTblClmColumnPosition: columnIndex + 1,
              uiTblClmColumnWidth: parseColumnWidth(column.width),
            }),
          });
          const savedColumn = response?.data;
          if (!savedColumn) {
            continue;
          }
          nextColumnConfigs = upsertPhysicalStockUiTableColumnConfig(
            nextColumnConfigs,
            savedColumn,
            column.key,
          );
        } catch {
          // Continue saving the rest of the order; the local order remains usable.
        }
      }
      uiColumnConfigsRef.current = nextColumnConfigs;
      setUiColumnConfigs(nextColumnConfigs);
    },
    [saveUiTableColumn],
  );
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
      if (!sourceKey || sourceKey === targetKey) {
        return;
      }
      setColumns((current) => {
        const nextColumns = reorderColumns(current, sourceKey, targetKey);
        if (nextColumns === current) {
          return current;
        }
        columnsRef.current = nextColumns;
        void enqueueColumnConfigSave(() => persistPhysicalStockColumnOrder(nextColumns));
        return nextColumns;
      });
    },
    [enqueueColumnConfigSave, persistPhysicalStockColumnOrder],
  );
  const handleColumnDragEnd = useCallback(() => {
    draggingColumnKeyRef.current = null;
  }, []);
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
      const delta = event.clientX - activeResize.startX;
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
        void enqueueColumnConfigSave(() =>
          persistPhysicalStockColumnWidth(activeResize.key, activeResize.currentWidth),
        );
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
  }, [enqueueColumnConfigSave, persistPhysicalStockColumnWidth]);
  const handleLookupSearchInputChange = useCallback(
    (lookupKind: LookupKind, search: string, row?: PhysicalStockRow) => {
      setLookupSearchQuery(search);
      const timeoutRef =
        lookupKind === "item"
          ? itemSearchTimeoutRef
          : lookupKind === "batch"
            ? batchSearchTimeoutRef
            : lookupKind === "reason"
              ? reasonSearchTimeoutRef
              : godownSearchTimeoutRef;
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => {
        if (lookupKind === "item") {
          void loadItemOptions(search);
        } else if (lookupKind === "batch" && row) {
          void loadBatchOptions(row, search);
        } else if (lookupKind !== "reason") {
          void loadGodownOptions(search);
        }
      }, LOOKUP_SEARCH_DEBOUNCE_MS);
    },
    [loadBatchOptions, loadGodownOptions, loadItemOptions],
  );
  const clearPhysicalStockEditor = useCallback(() => {
    setRows([createEmptyRow(1)]);
    setInvalidFieldKeys({});
    setBatchOptions([DEFAULT_BATCH_OPTION]);
    setBatchDetailsByBatchId({});
    setLookupSearchQuery("");
    setOpenLookupCell(null);
    setVoucherRefNo("");
    setLoadedPhysicalStockId(null);
    setLoadedDocumentMeta(null);
    setPendingLoadRequest(null);
    setIsDeleteLoadedStockConfirmOpen(false);
  }, []);
  const handleClearRows = useCallback(() => {
    clearPhysicalStockEditor();
  }, [clearPhysicalStockEditor]);
  const resolveLoadContext = useCallback(() => {
    if (!activeCompany) {
      toast.error("Select a company in the header before loading stock.", {
        toastId: "physical-stock-load:missing-company",
      });
      return null;
    }
    if (!activeBranch) {
      toast.error("Select a branch in the header before loading stock.", {
        toastId: "physical-stock-load:missing-branch",
      });
      return null;
    }
    if (!accountingYear) {
      toast.error("Select a valid voucher date before loading stock.", {
        toastId: "physical-stock-load:missing-date",
      });
      return null;
    }
    return {
      accountingYear,
      companyId: activeCompany.id,
      branchId: activeBranch.id,
    };
  }, [accountingYear, activeBranch, activeCompany]);
  const prefetchLoadedItemDetails = useCallback(
    async (details: PhysicalStockDocumentResponse["details"]) => {
      const itemIds = Array.from(
        new Set(
          details
            .map((detail) => detail.psd_item_id?.trim() ?? "")
            .filter((itemId) => itemId.length > 0),
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
  const applyLoadedPhysicalStockDocument = useCallback(
    (document: PhysicalStockDocumentResponse) => {
      const documentRows = mapPhysicalStockDocumentToRows(document);
      const nextVoucherDate = formatDateForDisplay(document.header.psc_date) || voucherDate;
      const nextVoucherRefNo = document.header.psc_refno || "";
      const loadedItems = buildLoadedLookupOptions(
        document.details.map((detail) => ({
          value: detail.psd_item_id,
          label: detail.psd_item_name,
        })),
      );
      const loadedGodowns = buildLoadedLookupOptions(
        document.details.map((detail) => ({
          value: detail.psd_godown_id,
          label: detail.psd_godown_name,
        })),
      );
      const loadedUnits = buildLoadedLookupOptions(
        document.details.map((detail) => ({
          value: detail.psd_unit_id,
          label: detail.psd_unit_name,
        })),
      );
      setRows(documentRows);
      setVoucherDate(nextVoucherDate);
      setVoucherRefNo(nextVoucherRefNo);
      setInvalidFieldKeys({});
      setLookupSearchQuery("");
      setOpenLookupCell(null);
      setLoadedPhysicalStockId(document.header.psc_id);
      setLoadedDocumentMeta({
        stockId: document.header.psc_id,
        stockLabel: getPhysicalStockLabel(document.header),
        stockDate: nextVoucherDate,
        stockDocNo: document.header.psc_doc_no ?? null,
        companyId: document.header.psc_company_id ?? null,
        branchId: document.header.psc_branch_id ?? null,
      });
      setItemOptions((current) => mergeLookupOptions(current, loadedItems));
      setGodownOptions((current) => mergeLookupOptions(current, loadedGodowns));
      setUnitOptions((current) => mergeLookupOptions(current, loadedUnits));
      void prefetchLoadedItemDetails(document.details);
    },
    [prefetchLoadedItemDetails, voucherDate],
  );
  const loadPhysicalStockList = useCallback(async () => {
    if (!isPhysicalStockListOpen) {
      return;
    }
    const requestId = physicalStockListRequestRef.current + 1;
    physicalStockListRequestRef.current = requestId;
    setIsPhysicalStockListLoading(true);
    setPhysicalStockListError(null);
    try {
      const payload = await listPhysicalStockRecords({
        query: {
          page: String(physicalStockListPage),
          limit: String(physicalStockListPageSize),
          ...(physicalStockListFilters.search.trim()
            ? { search: physicalStockListFilters.search.trim() }
            : {}),
          ...(physicalStockListFilters.dateFrom
            ? { date_from: physicalStockListFilters.dateFrom }
            : {}),
          ...(physicalStockListFilters.dateTo
            ? { date_to: physicalStockListFilters.dateTo }
            : {}),
        },
      });
      if (physicalStockListRequestRef.current !== requestId) {
        return;
      }
      const nextRows = Array.isArray(payload?.data) ? payload.data : [];
      const nextMeta = payload?.meta;
      setPhysicalStockListRows(nextRows);
      setPhysicalStockListMeta({
        page:
          typeof nextMeta?.page === "number" && Number.isFinite(nextMeta.page)
            ? nextMeta.page
            : physicalStockListPage,
        limit:
          typeof nextMeta?.limit === "number" && Number.isFinite(nextMeta.limit)
            ? nextMeta.limit
            : physicalStockListPageSize,
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
      if (physicalStockListRequestRef.current !== requestId) {
        return;
      }
      setPhysicalStockListRows([]);
      setPhysicalStockListMeta({
        ...EMPTY_PHYSICAL_STOCK_LIST_META,
        page: physicalStockListPage,
        limit: physicalStockListPageSize,
      });
      setPhysicalStockListError(getPhysicalStockListErrorMessage(error));
    } finally {
      if (physicalStockListRequestRef.current === requestId) {
        setIsPhysicalStockListLoading(false);
      }
    }
  }, [
    isPhysicalStockListOpen,
    listPhysicalStockRecords,
    physicalStockListFilters.dateFrom,
    physicalStockListFilters.dateTo,
    physicalStockListFilters.search,
    physicalStockListPage,
    physicalStockListPageSize,
  ]);
  const handleOpenPhysicalStockList = useCallback(() => {
    setPhysicalStockListPage(1);
    setPhysicalStockListFilters(createPhysicalStockListFiltersForToday());
    dispatch(listModalToggled(true));
    setPhysicalStockListError(null);
  }, []);
  const handleClosePhysicalStockList = useCallback(() => {
    physicalStockListRequestRef.current += 1;
    dispatch(listModalToggled(false));
    setIsPhysicalStockListLoading(false);
    setPhysicalStockListError(null);
    setPhysicalStockListPage(1);
    setPhysicalStockListFilters(DEFAULT_PHYSICAL_STOCK_LIST_FILTERS);
    dispatch(selectedDocumentIdSet(null));
  }, []);
  const handlePhysicalStockListSearchChange = useCallback((search: string) => {
    setPhysicalStockListPage(1);
    setPhysicalStockListFilters((current) => ({ ...current, search }));
  }, []);
  const handlePhysicalStockListDateFromChange = useCallback((dateFrom: string) => {
    setPhysicalStockListPage(1);
    setPhysicalStockListFilters((current) => ({ ...current, dateFrom }));
  }, []);
  const handlePhysicalStockListDateToChange = useCallback((dateTo: string) => {
    setPhysicalStockListPage(1);
    setPhysicalStockListFilters((current) => ({ ...current, dateTo }));
  }, []);
  const handlePhysicalStockListPageSizeChange = useCallback((pageSize: number) => {
    setPhysicalStockListPage(1);
    setPhysicalStockListPageSize(pageSize);
  }, []);
  const handlePhysicalStockListRowSelect = useCallback((row: PhysicalStockListRow) => {
    dispatch(selectedDocumentIdSet(row.psc_id));
  }, []);

  useEffect(() => {
    if (!isPhysicalStockListOpen) {
      return;
    }
    void loadPhysicalStockList();
  }, [isPhysicalStockListOpen, loadPhysicalStockList]);

  useEffect(() => {
    if (!isPhysicalStockListOpen) {
      return;
    }
    const shouldKeep =
      selectedPhysicalStockListId &&
      physicalStockListRows.some((row) => row.psc_id === selectedPhysicalStockListId);
    if (!shouldKeep) {
      dispatch(selectedDocumentIdSet(physicalStockListRows[0]?.psc_id ?? null));
    }
  }, [dispatch, isPhysicalStockListOpen, physicalStockListRows, selectedPhysicalStockListId]);

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
      if (isPhysicalStockListOpen) {
        void loadPhysicalStockList();
        return;
      }
      handleOpenPhysicalStockList();
    };
    window.addEventListener("keydown", handleF5KeyDown);
    return () => {
      window.removeEventListener("keydown", handleF5KeyDown);
    };
  }, [handleOpenPhysicalStockList, isPhysicalStockListOpen, loadPhysicalStockList]);

  const handleCloseInlineItemMaster = useCallback(() => {
    setIsInlineItemMasterOpen(false);
    inlineItemMasterControllerRef.current = null;
    pendingInlineItemMasterRequestRef.current = null;
  }, []);

  const handleInlineItemMasterControllerReady = useCallback(
    (controller: CrudMasterPageController | null) => {
      inlineItemMasterControllerRef.current = controller;
      if (!controller) return;
      const pending = pendingInlineItemMasterRequestRef.current;
      if (!pending) {
        return;
      }
      if (pending.mode === "create") {
        controller.openCreate({ values: { item_name_en: pending.query } });
      } else {
        controller.openUpdateById(pending.itemId);
      }
    },
    [],
  );

  const handleInlineItemMasterModalOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        handleCloseInlineItemMaster();
      }
    },
    [handleCloseInlineItemMaster],
  );

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
      pendingInlineItemMasterRequestRef.current = nextRequest;
      setIsInlineItemMasterOpen(true);
    };
    window.addEventListener("keydown", handleAltAKeyDown);
    return () => {
      window.removeEventListener("keydown", handleAltAKeyDown);
    };
  }, [rows]);

  const loadPhysicalStockById = useCallback(
    async (stockId: string) => {
      const normalizedStockId = stockId.trim();
      if (!normalizedStockId) {
        return;
      }
      setPendingLoadRequest(null);
      setIsLoadingStock(true);
      try {
        const documentPayload = await getPhysicalStockDocument({
          query: {
            ps_id: normalizedStockId,
          },
        });
        const document = documentPayload?.data;
        if (!document) {
          toast.info("No saved physical stock was found for the selected record.", {
            toastId: "physical-stock-load:empty-document",
          });
          return;
        }
        applyLoadedPhysicalStockDocument(document);
        dispatch(listModalToggled(false));
      } catch {
        // Toasting is handled in useApi.
      } finally {
        setIsLoadingStock(false);
      }
    },
    [applyLoadedPhysicalStockDocument, getPhysicalStockDocument],
  );
  const loadLatestPhysicalStock = useCallback(async () => {
    const loadContext = resolveLoadContext();
    if (!loadContext) {
      return;
    }
    setPendingLoadRequest(null);
    setIsLoadingStock(true);
    try {
      const listPayload = await listPhysicalStocks({
        query: {
          ps_company_id: loadContext.companyId,
          ps_branch_id: loadContext.branchId,
          ps_acc_year: loadContext.accountingYear,
          page: "1",
          limit: "1",
        },
      });
      const latestDocumentHeader = Array.isArray(listPayload?.data) ? listPayload.data[0] : null;
      if (!latestDocumentHeader?.psc_id) {
        toast.info("No saved physical stock was found for the selected company and branch.", {
          toastId: "physical-stock-load:not-found",
        });
        return;
      }
      await loadPhysicalStockById(latestDocumentHeader.psc_id);
    } catch {
      // Toasting is handled in useApi.
    } finally {
      setIsLoadingStock(false);
    }
  }, [listPhysicalStocks, loadPhysicalStockById, resolveLoadContext]);
  const loadPhysicalStockByRefNo = useCallback(
    async (refNo?: string) => {
      const normalizedRefNo = (refNo ?? voucherRefNo).trim();
      if (!normalizedRefNo) {
        toast.error("Enter a reference no before loading stock.", {
          toastId: "physical-stock-load:missing-refno",
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
        const documentPayload = await getPhysicalStockDocumentByRefNo({
          query: {
            ps_doc_refno: normalizedRefNo,
            ps_company_id: loadContext.companyId,
            ps_branch_id: loadContext.branchId,
            ps_acc_year: loadContext.accountingYear,
          },
        });
        const document = documentPayload?.data;
        if (!document) {
          toast.info("No saved physical stock was found for the provided reference no.", {
            toastId: "physical-stock-load:empty-refno-document",
          });
          return;
        }
        applyLoadedPhysicalStockDocument(document);
      } catch {
        // Toasting is handled in useApi.
      } finally {
        setIsLoadingStock(false);
      }
    },
    [
      applyLoadedPhysicalStockDocument,
      getPhysicalStockDocumentByRefNo,
      resolveLoadContext,
      voucherRefNo,
    ],
  );
  const handleLoadStock = useCallback(() => {
    if (isLoadingStock || isSavingPhysicalStock || isDeletingPhysicalStock || isBulkLoadingStock || isBusinessContextLoading) {
      return;
    }
    setIsBulkLoadModalOpen(true);
  }, [
    isBusinessContextLoading,
    isDeletingPhysicalStock,
    isBulkLoadingStock,
    isLoadingStock,
    isSavingPhysicalStock,
  ]);
  const handleBulkLoadStock = useCallback(
    async (params: BulkLoadParams) => {
      if (!params.companyId || !params.branchId) {
        toast.error("Select a company and branch before loading stock.", {
          toastId: "bulk-stock-load:missing-context",
        });
        return;
      }
      setIsBulkLoadingStock(true);
      try {
        const query: Record<string, string> = {
          isb_acc_year: params.accYear,
          isb_company_id: params.companyId,
          isb_branch_id: params.branchId,
          isb_stock_bucket: ITEM_STOCK_BALANCE_BUCKET,
          stock_type: params.stockType,
          limit: "500",
        };
        if (params.godownId) query.isb_godown_id = params.godownId;
        if (params.itemGroupId) query.item_group_id = params.itemGroupId;
        if (params.itemBrandId) query.item_brand_id = params.itemBrandId;
        if (params.itemSectionId) query.item_section_id = params.itemSectionId;
        if (params.itemCategoryId) query.item_category_id = params.itemCategoryId;

        const response = await getBulkItemStockList({ query });
        const items = response?.data ?? [];
        if (items.length === 0) {
          toast.info("No stock items found for the selected filters.", {
            toastId: "bulk-stock-load:empty",
          });
          return;
        }
        const loadedItemOptions = buildLoadedLookupOptions(
          items.map((item) => ({ value: item.isb_item_id, label: item.item_name })),
        );
        const loadedGodownOptions = buildLoadedLookupOptions(
          items.map((item) => ({ value: item.isb_godown_id, label: item.godown_name })),
        );
        const loadedUnitOptions = buildLoadedLookupOptions(
          items.map((item) => ({ value: item.isb_unit_id, label: item.unit_name })),
        );
        const newRows: PhysicalStockRow[] = items.map((item, index) => {
          const toBaseFactor = item.isb_to_base_factor > 0 ? item.isb_to_base_factor : 1;
          return createRow(index + 1, {
            itemname: item.item_name || "",
            code: item.item_code || "",
            barcode: item.item_default_barcode || "",
            godown: item.godown_name || "",
            uom: item.unit_name || "",
            bookqty: toInputValue(item.book_qty),
            bookfreeqty: toInputValue(item.book_free_qty),
            bookbaseqty: toInputValue(item.book_base_qty),
            bookfreebaseqty: toInputValue(item.book_free_base_qty),
            convfactor: toInputValue(toBaseFactor),
            costprice: toInputValue(item.cost_price),
            costwot: toInputValue(item.cost_wot),
            mrp: toInputValue(item.mrp),
            oslitemid: item.isb_item_id,
            oslunitid: item.isb_unit_id,
            oslbaseuomid: item.isb_price_master_id || "",
            oslgodownid: item.isb_godown_id,
            baseunitid: item.isb_base_unit_id || item.isb_unit_id,
            osltrackingtype: getTrackingOptionFromPayload(item.tracking_type),
          });
        });
        const trailingRow = createEmptyRow(newRows.length + 1);
        setRows([...newRows, trailingRow]);
        setInvalidFieldKeys({});
        setLookupSearchQuery("");
        setOpenLookupCell(null);
        setItemOptions((current) => mergeLookupOptions(current, loadedItemOptions));
        setGodownOptions((current) => mergeLookupOptions(current, loadedGodownOptions));
        setUnitOptions((current) => mergeLookupOptions(current, loadedUnitOptions));
        setIsBulkLoadModalOpen(false);
        toast.success(`Loaded ${items.length} item(s) from stock.`, {
          toastId: "bulk-stock-load:success",
        });
      } catch {
        toast.error("Failed to load bulk stock items.", {
          toastId: "bulk-stock-load:error",
        });
      } finally {
        setIsBulkLoadingStock(false);
      }
    },
    [getBulkItemStockList],
  );
  const handleLoadByRefNo = useCallback(() => {
    if (isLoadingStock || isSavingPhysicalStock || isDeletingPhysicalStock || isBusinessContextLoading) {
      return;
    }
    const normalizedRefNo = voucherRefNo.trim();
    if (!normalizedRefNo) {
      toast.error("Enter a reference no before loading stock.", {
        toastId: "physical-stock-load:missing-refno",
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
    void loadPhysicalStockByRefNo(normalizedRefNo);
  }, [
    draftRows.length,
    isBusinessContextLoading,
    isDeletingPhysicalStock,
    isLoadingStock,
    isSavingPhysicalStock,
    loadPhysicalStockByRefNo,
    voucherRefNo,
  ]);
  const handleLoadPhysicalStockListRow = useCallback(
    (row: PhysicalStockListRow) => {
      if (
        isLoadingStock ||
        isSavingPhysicalStock ||
        isDeletingPhysicalStock ||
        isBusinessContextLoading
      ) {
        return;
      }
      const stockId = row.psc_id?.trim() ?? "";
      if (!stockId) {
        return;
      }
      const stockLabel = getPhysicalStockLabel(row);
      dispatch(selectedDocumentIdSet(stockId));
      if (draftRows.length > 0) {
        setPendingLoadRequest({
          type: "stock",
          stockId,
          label: stockLabel,
        });
        return;
      }
      void loadPhysicalStockById(stockId);
    },
    [
      draftRows.length,
      isBusinessContextLoading,
      isDeletingPhysicalStock,
      isLoadingStock,
      isSavingPhysicalStock,
      loadPhysicalStockById,
    ],
  );
  const handleLoadSelectedPhysicalStockListRow = useCallback(() => {
    if (!selectedPhysicalStockListRow) {
      return;
    }
    handleLoadPhysicalStockListRow(selectedPhysicalStockListRow);
  }, [handleLoadPhysicalStockListRow, selectedPhysicalStockListRow]);
  const handleConfirmLoad = useCallback(() => {
    if (!pendingLoadRequest || isLoadingStock) {
      return;
    }
    if (pendingLoadRequest.type === "latest") {
      void loadLatestPhysicalStock();
      return;
    }
    if (pendingLoadRequest.type === "refno") {
      void loadPhysicalStockByRefNo(pendingLoadRequest.refNo);
      return;
    }
    void loadPhysicalStockById(pendingLoadRequest.stockId);
  }, [
    isLoadingStock,
    loadLatestPhysicalStock,
    loadPhysicalStockById,
    loadPhysicalStockByRefNo,
    pendingLoadRequest,
  ]);
  const handleDeleteLoadedStock = useCallback(() => {
    if (
      !loadedPhysicalStockId ||
      isLoadingStock ||
      isSavingPhysicalStock ||
      isDeletingPhysicalStock ||
      isBusinessContextLoading
    ) {
      return;
    }
    setIsDeleteLoadedStockConfirmOpen(true);
  }, [
    isBusinessContextLoading,
    isDeletingPhysicalStock,
    isLoadingStock,
    isSavingPhysicalStock,
    loadedPhysicalStockId,
  ]);
  const handleConfirmDeleteLoadedStock = useCallback(async () => {
    if (!loadedPhysicalStockId) {
      setIsDeleteLoadedStockConfirmOpen(false);
      toast.error("Load a physical stock document before deleting it.", {
        toastId: "physical-stock-delete:missing-document",
      });
      return;
    }
    try {
      await deletePhysicalStock({
        query: {
          ps_id: loadedPhysicalStockId,
        },
      });
      clearPhysicalStockEditor();
    } catch {
      // Toasting is handled in useApi.
    }
  }, [clearPhysicalStockEditor, deletePhysicalStock, loadedPhysicalStockId]);
  const handleSavePhysicalStock = useCallback(async () => {
    if (!activeCompany) {
      toast.error("Select a company in the header before updating physical stock.", {
        toastId: "physical-stock-save:missing-company",
      });
      return;
    }
    if (!activeBranch) {
      toast.error("Select a branch in the header before updating physical stock.", {
        toastId: "physical-stock-save:missing-branch",
      });
      return;
    }
    if (!accountingYear) {
      toast.error("Select a valid voucher date before updating physical stock.", {
        toastId: "physical-stock-save:missing-date",
      });
      return;
    }
    const voucherDateIso = toIsoDateTime(voucherDate);
    if (!voucherDateIso) {
      toast.error("Select a valid voucher date before updating physical stock.", {
        toastId: "physical-stock-save:invalid-date",
      });
      return;
    }
    const userId = getAuthUserId();
    if (!userId) {
      toast.error("User session is missing. Please login again.", {
        toastId: "physical-stock-save:missing-user",
      });
      return;
    }
    if (draftRows.length === 0) {
      toast.error("Add at least one physical stock row before updating stock.", {
        toastId: "physical-stock-save:no-rows",
      });
      return;
    }
    const validationIssues = draftRows.flatMap((row, index) =>
      getRowValidationIssues(row, index + 1),
    );
    const headerGodownId = draftRows[0]?.values.oslgodownid?.trim() ?? "";
    const hasMixedGodowns = draftRows.some(
      (row) => row.values.oslgodownid.trim() !== headerGodownId,
    );
    if (hasMixedGodowns) {
      validationIssues.push({
        rowId: draftRows.find((row) => row.values.oslgodownid.trim() !== headerGodownId)?.id ?? 0,
        fieldKey: "godown",
        message: "Physical stock save currently supports one godown per document.",
      });
    }
    if (validationIssues.length > 0) {
      setInvalidFieldKeys(buildInvalidFieldState(validationIssues));
      const [firstIssue] = validationIssues;
      if (firstIssue) {
        window.requestAnimationFrame(() => {
          focusOpeningStockField(tableRef.current, firstIssue.rowId, firstIssue.fieldKey);
        });
      }
      toast.dismiss("physical-stock-save:validation");
      toast.error(renderValidationToastContent(validationIssues), {
        toastId: "physical-stock-save:validation",
        autoClose: 8000,
      });
      return;
    }
    setInvalidFieldKeys({});
    const loadedDocNo = Number.parseInt(loadedDocumentMeta?.stockDocNo ?? "", 10);
    const docNo =
      loadedPhysicalStockId && Number.isInteger(loadedDocNo) && loadedDocNo > 0
        ? loadedDocNo
        : buildDocumentNumber(voucherRefNo);
    const totalBookValue = draftRows.reduce(
      (sum, row) => sum + parseDecimal(row.values.bookbaseqty) * parseDecimal(row.values.costwot),
      0,
    );
    const totalCountedValue = draftRows.reduce(
      (sum, row) =>
        sum + parseDecimal(row.values.physicalbaseqty) * parseDecimal(row.values.costwot),
      0,
    );
    const normalizedRefNo = toNullableTrimmedString(voucherRefNo) ?? `PHY-STK-${docNo}`;
    const requestPayload: PhysicalStockSaveRequest = {
      ...(loadedPhysicalStockId ? { psId: loadedPhysicalStockId } : {}),
      psAccYear: accountingYear,
      psCompanyId: activeCompany.id,
      psBranchId: activeBranch.id,
      psGodownId: headerGodownId,
      psDocNo: docNo,
      psDocRefNo: normalizedRefNo,
      psDocDate: voucherDateIso,
      psCountType: "FULL",
      psStockCutoffAt: voucherDateIso,
      psFreezeStock: true,
      psPostingMode: "ADJUST_DIFFERENCE_ONLY",
      psRateSource: "MANUAL",
      psTotalLines: draftRows.length,
      psTotalBookValue: Number(totalBookValue.toFixed(2)),
      psTotalCountedValue: Number(totalCountedValue.toFixed(2)),
      psNetVarianceValue: Number((totalCountedValue - totalBookValue).toFixed(2)),
      psStatus: "DRAFT",
      psApprovalRequired: true,
      psDeviceType: "WEB",
      psDeviceId: getOrCreateClientDeviceId(),
      psCounterId: "COUNTER-1",
      psSessionId: toOptionalUuid(getAuthSessionId()),
      psRemarks:
        draftRows.map(getReasonRemarks).filter((value): value is string => Boolean(value)).join(" | ") ||
        null,
      psCreatedBy: userId,
      psModifiedBy: loadedPhysicalStockId ? userId : null,
      details: draftRows.map((row, index) =>
        buildPhysicalStockDetailPayload(row, index, {
          accountingYear,
          companyId: activeCompany.id,
          branchId: activeBranch.id,
        }),
      ),
    };
    try {
      const response = await savePhysicalStock({ body: requestPayload });
      const document = response?.data;
      if (document) {
        applyLoadedPhysicalStockDocument(document);
      }
    } catch {
      // useApi already shows the API error toast.
    }
  }, [
    accountingYear,
    activeBranch,
    activeCompany,
    applyLoadedPhysicalStockDocument,
    draftRows,
    loadedPhysicalStockId,
    loadedDocumentMeta?.stockDocNo,
    savePhysicalStock,
    voucherDate,
    voucherRefNo,
  ]);
  const renderCell = (row: PhysicalStockRow, rowIndex: number, column: PhysicalStockColumn) => {
    const value = row.values[column.key] ?? "";
    const invalid = Boolean(invalidFieldKeys[`${row.id}:${column.key}`]);
    const lookupKind = column.lookupKind;
    const cellKey = `${row.id}:${column.key}`;
    const isLookupOpen = openLookupCell?.key === cellKey;
    const isNumeric = column.kind === "number";
    const isReadOnly = column.readOnly || DERIVED_FIELD_KEYS.has(column.key);
    const sharedClassName = cx(
      styles.cellInput,
      isNumeric && styles.numericInput,
      invalid && styles.requiredField,
    );
    if (column.key === "batchno" && isBatchLookupTrackingType(row.values.osltrackingtype)) {
      const canSearchBatches = hasBatchLookupScope(row.values);
      const visibleBatchOptions = canSearchBatches
        ? filterLookupOptions(batchOptions, lookupSearchQuery)
        : [];
      return (
        <LookupCell
          rowId={row.id}
          fieldKey={column.key}
          cellKey={cellKey}
          lookupKind="batch"
          isOpen={isLookupOpen}
          isLoading={isBatchLookupLoading}
          selectedId={row.values.batchid || row.values.batchno || ""}
          selectedLabel={row.values.batchno ?? ""}
          placeholder={`Search ${column.header}`}
          header={column.header}
          emptyMessage={
            canSearchBatches ? "No batches found." : "Select item, godown and Uom first."
          }
          options={visibleBatchOptions}
          searchQuery={lookupSearchQuery}
          shortcutValues={row.values}
          hasValidationError={invalid}
          styles={styles}
          searchInputRef={lookupSearchInputRef}
          rootRef={(element) => {
            lookupRootRefs.current[cellKey] = element;
          }}
          onToggle={() => handleLookupToggle(cellKey, "batch", row)}
          onTriggerKeyDown={handleFieldNavigationKeyDown}
          onSearchChange={(search) => handleLookupSearchInputChange("batch", search, row)}
          onSelect={(option) => void handleLookupSelection(row.id, "batch", option)}
        />
      );
    }
    if (column.kind === "lookup" && lookupKind) {
      const selectedId =
        lookupKind === "item"
          ? row.values.oslitemid ?? ""
          : lookupKind === "reason"
            ? row.values.oslreasonid ?? ""
            : row.values.oslgodownid ?? "";
      const selectedLabel =
        lookupKind === "item"
          ? itemOptionsByValue.get(selectedId) ?? row.values.itemname
          : lookupKind === "reason"
            ? reasonOptionsByValue.get(selectedId) ?? row.values.reason
            : godownOptionsByValue.get(selectedId) ?? row.values.godown;
      const options =
        lookupKind === "item"
          ? filterLookupOptions(itemOptions, lookupSearchQuery)
          : lookupKind === "reason"
            ? filterLookupOptions(reasonOptions, lookupSearchQuery)
            : filterLookupOptions(godownOptions, lookupSearchQuery);
      const emptyMessage =
        lookupKind === "item"
          ? "No items found."
          : lookupKind === "reason"
            ? "No reasons found."
            : "No godowns found.";
      const isLoadingLookup =
        lookupKind === "item"
          ? isItemLookupLoading
          : lookupKind === "reason"
            ? isReasonLookupLoading
            : isGodownLookupLoading;
      return (
        <LookupCell
          rowId={row.id}
          fieldKey={column.key}
          cellKey={cellKey}
          lookupKind={lookupKind}
          isOpen={isLookupOpen}
          isLoading={isLoadingLookup}
          selectedId={selectedId}
          selectedLabel={selectedLabel}
          placeholder={`Search ${column.header}`}
          header={column.header}
          emptyMessage={emptyMessage}
          options={options}
          searchQuery={lookupSearchQuery}
          shortcutValues={row.values}
          hasValidationError={invalid}
          styles={styles}
          searchInputRef={lookupSearchInputRef}
          rootRef={(element) => {
            lookupRootRefs.current[cellKey] = element;
          }}
          onToggle={() => handleLookupToggle(cellKey, lookupKind, row)}
          onTriggerKeyDown={handleFieldNavigationKeyDown}
          onSearchChange={(search) => handleLookupSearchInputChange(lookupKind, search, row)}
          onSelect={(option) => void handleLookupSelection(row.id, lookupKind, option)}
        />
      );
    }
    if (column.key === "uom") {
      const currentItemId = row.values.oslitemid?.trim() ?? "";
      const itemDetail = currentItemId ? itemDetailsByItemId[currentItemId] : undefined;
      const rowUomOptions = itemDetail
        ? buildUomOptions(itemDetail, unitOptionsByValue)
        : unitOptions.filter((option) => option.value);
      return (
        <select
          data-opening-stock-field-control="true"
          data-opening-stock-row-id={row.id}
          data-opening-stock-field-key={column.key}
          value={row.values.oslunitid ?? ""}
          onChange={(event) => handleUomChange(row.id, event.target.value)}
          onKeyDown={handleFieldNavigationKeyDown}
          className={cx(styles.cellSelect, invalid && styles.requiredField)}
          disabled={rowUomOptions.length === 0}
          aria-invalid={invalid || undefined}
        >
          <option value="">{itemDetail ? "Select Uom" : "Select item first"}</option>
          {rowUomOptions.map((option) => (
            <option
              key={`${row.id}-uom-${option.value}`}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    if (column.kind === "select") {
      const isTrackingTypeSelect = column.key === "osltrackingtype";
      return (
        <select
          data-opening-stock-field-control="true"
          data-opening-stock-row-id={row.id}
          data-opening-stock-field-key={column.key}
          value={value}
          onChange={(event) => handleRowChange(row.id, column.key, event.target.value)}
          onKeyDown={handleFieldNavigationKeyDown}
          className={cx(
            styles.cellSelect,
            isTrackingTypeSelect && styles.cellSelectNoArrow,
            invalid && styles.requiredField,
          )}
          disabled={isTrackingTypeSelect}
          aria-invalid={invalid || undefined}
        >
          {(column.options ?? []).map((option) => (
            <option
              key={option}
              value={option}
            >
              {TRACKING_TYPE_OPTION_LABELS[option as keyof typeof TRACKING_TYPE_OPTION_LABELS] ??
                option}
            </option>
          ))}
        </select>
      );
    }
    if (column.kind === "date") {
      const datePickerKey = `${row.id}:${column.key}`;
      const isBatchDateField = (DATE_FIELD_KEYS as readonly string[]).includes(column.key);
      return (
        <div className={cx(styles.dateInputWrap, invalid && styles.requiredDateWrap)}>
          <input
            data-opening-stock-field-control="true"
            data-opening-stock-row-id={row.id}
            data-opening-stock-field-key={column.key}
            type="text"
            value={value}
            onChange={(event) =>
              handleRowChange(row.id, column.key, formatDateEntry(event.target.value))
            }
            onKeyDown={handleFieldNavigationKeyDown}
            className={cx(sharedClassName, styles.dateInputWithPicker)}
            placeholder="dd/mm/yyyy"
            inputMode="numeric"
            maxLength={10}
            disabled={isBatchDateField}
            aria-invalid={invalid || undefined}
          />
          <input
            ref={(element) => {
              rowDatePickerRefs.current[datePickerKey] = element;
            }}
            type="date"
            value={toCanonicalDateValue(value)}
            onChange={(event) =>
              handleRowChange(row.id, column.key, formatDateForDisplay(event.target.value))
            }
            tabIndex={-1}
            aria-hidden="true"
            className={styles.hiddenDatePickerInput}
            disabled={isBatchDateField}
          />
          <button
            type="button"
            className={cx(
              styles.datePickerTrigger,
              invalid && styles.requiredDatePickerTrigger,
            )}
            onClick={() => openDatePicker(rowDatePickerRefs.current[datePickerKey] ?? null)}
            aria-label={`Open ${column.header} calendar for row ${rowIndex + 1}`}
            disabled={isBatchDateField}
          >
            <FiCalendar
              className={styles.datePickerIcon}
              aria-hidden="true"
            />
          </button>
        </div>
      );
    }
    const isBarcodeField = column.key === "barcode";
    return (
      <input
        data-opening-stock-field-control="true"
        data-opening-stock-row-id={row.id}
        data-opening-stock-field-key={column.key}
        type={isNumeric ? "number" : "text"}
        value={value}
        onChange={(event) => handleRowChange(row.id, column.key, event.target.value)}
        onKeyDown={(event) => {
          if (isBarcodeField && event.key === "Enter") {
            event.preventDefault();
            void handleBarcodeEnter(row.id, event.currentTarget.value);
            return;
          }
          if (handleFieldNavigationKeyDown(event)) {
            return;
          }
          if (isNumeric && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            event.preventDefault();
          }
          if (QUANTITY_FIELD_KEYS.has(column.key) && event.key === "-") {
            event.preventDefault();
          }
        }}
        onWheel={
          isNumeric
            ? (event) => {
                event.currentTarget.blur();
              }
            : undefined
        }
        className={sharedClassName}
        readOnly={isReadOnly}
        disabled={isReadOnly}
        aria-invalid={invalid || undefined}
        inputMode={isNumeric ? "decimal" : undefined}
        step={isNumeric ? "any" : undefined}
        autoComplete="off"
        spellCheck={false}
      />
    );
  };
  const tableSettingsContextMenu =
    tableSettingsContextMenuPosition && typeof document !== "undefined"
      ? createPortal(
          <div
            className={styles.tableSettingsContextMenu}
            data-physical-stock-settings-context-menu="true"
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
  const headerSettingsColumn =
    headerSettingsColumnKey === null
      ? null
      : columns.find((column) => column.key === headerSettingsColumnKey) ?? null;
  const headerSettingsContextMenu =
    headerSettingsContextMenuPosition && headerSettingsColumn && typeof document !== "undefined"
      ? createPortal(
          <div
            className={styles.tableSettingsContextMenu}
            data-physical-stock-header-context-menu="true"
            style={headerSettingsContextMenuPosition}
            role="menu"
            aria-label="Column actions"
          >
            <button
              type="button"
              className={styles.tableSettingsContextMenuItem}
              onClick={() => void handleHideHeaderColumn(headerSettingsColumn)}
            >
              Hide column
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
                "--erp-modal-overlay-z-index": 10001,
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
              aria-labelledby="physical-stock-column-settings-title"
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
                        id="physical-stock-column-settings-title"
                        className={dynamicModalStyles.headerTitle}
                      >
                        Table Settings
                      </h3>
                      <p className={dynamicModalStyles.headerDescription}>
                        Configure Physical Stock table columns.
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
                <div className={dynamicModalStyles.footerShortcuts}>
                  <div className={dynamicModalStyles.footerShortcutList}>
                    <span className={dynamicModalStyles.footerShortcutItem}>
                      <span className={dynamicModalStyles.footerShortcutTitle}>
                        {columnSettingsRows.length} columns
                      </span>
                    </span>
                    <span className={dynamicModalStyles.footerShortcutItem}>
                      <span className={dynamicModalStyles.footerShortcutAction}>
                        F5 saves settings
                      </span>
                    </span>
                  </div>
                </div>
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
                    {isColumnSettingsSaving ? "Saving..." : "Save (F5)"}
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
      {headerSettingsContextMenu}
      {columnSettingsModal}
      <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headingBlock}>
          <div className={styles.headingRow}>
            <h1 className={styles.title}>
              {loadedPhysicalStockId && draftRows.length > 0
                ? "Physical Stock (Edit)"
                : "Physical Stock"}
            </h1>
          </div>
        </div>
      </header>
      <div className={styles.tableShell}>
        <div className={styles.toolbar}>
          <div className={styles.tableTools}>
            <label className={styles.toolbarDateField}>
              <span className={styles.toolbarDateLabel}>Voucher Date</span>
              <div className={styles.toolbarDateControl}>
                <input
                  type="text"
                  value={voucherDate}
                  onChange={(event) => setVoucherDate(formatDateEntry(event.target.value))}
                  className={cx(styles.toolbarDateInput, styles.dateInputWithPicker)}
                  placeholder="dd/mm/yyyy"
                  inputMode="numeric"
                  maxLength={10}
                />
                <input
                  ref={voucherDatePickerRef}
                  type="date"
                  value={toCanonicalDateValue(voucherDate)}
                  onChange={(event) => setVoucherDate(formatDateForDisplay(event.target.value))}
                  tabIndex={-1}
                  aria-hidden="true"
                  className={styles.hiddenDatePickerInput}
                />
                <button
                  type="button"
                  className={styles.datePickerTrigger}
                  onClick={() => openDatePicker(voucherDatePickerRef.current)}
                  aria-label="Open voucher date calendar"
                >
                  <FiCalendar
                    className={styles.datePickerIcon}
                    aria-hidden="true"
                  />
                </button>
              </div>
            </label>
            <label className={styles.toolbarDateField}>
              <span className={styles.toolbarDateLabel}>Ref No</span>
              <div className={styles.toolbarDateControl}>
                <input
                  type="text"
                  value={voucherRefNo}
                  onChange={(event) => setVoucherRefNo(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                    }
                  }}
                  className={cx(styles.toolbarDateInput, styles.toolbarRefInput)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </label>
            <button
              type="button"
              className={cx(styles.createButton, styles.refLoadButton)}
              onClick={handleLoadByRefNo}
              disabled={
                isLoadingStock ||
                isSavingPhysicalStock ||
                isDeletingPhysicalStock ||
                isBusinessContextLoading
              }
            >
              <FiSearch
                className={styles.createIcon}
                aria-hidden="true"
              />
              <span>{isLoadingStock ? "Loading..." : "Load Ref No"}</span>
            </button>
            <button
              type="button"
              className={cx(styles.createButton, styles.loadButton)}
              onClick={handleLoadStock}
              disabled={
                isLoadingStock ||
                isBulkLoadingStock ||
                isSavingPhysicalStock ||
                isDeletingPhysicalStock ||
                isBusinessContextLoading
              }
            >
              <FiDownload
                className={styles.createIcon}
                aria-hidden="true"
              />
              <span>{isBulkLoadingStock ? "Loading..." : "Load Stock"}</span>
            </button>
            <button
              type="button"
              className={cx(styles.createButton, styles.updateButton)}
              onClick={() => void handleSavePhysicalStock()}
              disabled={
                isSavingPhysicalStock ||
                isLoadingStock ||
                isDeletingPhysicalStock ||
                isBusinessContextLoading
              }
            >
              <FiSave
                className={styles.createIcon}
                aria-hidden="true"
              />
              <span>{isSavingPhysicalStock ? "Updating..." : "Update Stock"}</span>
            </button>
            <button
              type="button"
              className={cx(styles.createButton, styles.deleteStockButton)}
              onClick={handleDeleteLoadedStock}
              disabled={
                !loadedPhysicalStockId ||
                isDeletingPhysicalStock ||
                isSavingPhysicalStock ||
                isLoadingStock ||
                isBusinessContextLoading
              }
            >
              <FiTrash2
                className={styles.createIcon}
                aria-hidden="true"
              />
              <span>{isDeletingPhysicalStock ? "Deleting..." : "Delete Stock"}</span>
            </button>
            <button
              type="button"
              className={cx(styles.createButton, styles.loadButton)}
              onClick={handleOpenPhysicalStockList}
              disabled={
                isLoadingStock ||
                isSavingPhysicalStock ||
                isDeletingPhysicalStock ||
                isBusinessContextLoading
              }
            >
              <FiList
                className={styles.createIcon}
                aria-hidden="true"
              />
              <span>Open List</span>
            </button>
            <button
              type="button"
              className={cx(styles.createButton, styles.clearRowsButton)}
              onClick={handleClearRows}
              disabled={
                isSavingPhysicalStock ||
                isLoadingStock ||
                isDeletingPhysicalStock ||
                draftRows.length === 0
              }
            >
              <FiRotateCcw
                className={styles.createIcon}
                aria-hidden="true"
              />
              <span>Clear Rows</span>
            </button>
          </div>
        </div>
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
                  style={{ width: SERIAL_NUMBER_COLUMN_WIDTH, left: 0 }}
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
                    onContextMenu={(event) => handleColumnHeaderContextMenu(event, column)}
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
              {rows.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  className={cx(
                    styles.dataRow,
                    styles.row,
                    rowIndex % 2 === 0 ? styles.rowOdd : styles.rowEven,
                  )}
                >
                  <td
                    data-label="S.No"
                    className={cx(
                      styles.cell,
                      styles.compactCell,
                      styles.alignLeft,
                      styles.stickySerialCell,
                    )}
                    style={{ left: 0 }}
                  >
                    <div className={styles.serialCellContent}>
                      <span className={styles.rowNumber}>{rowIndex + 1}</span>
                    </div>
                  </td>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      data-label={column.header}
                      className={cx(
                        styles.cell,
                        styles.compactCell,
                        getAlignClass(column.align),
                      )}
                    >
                      {renderCell(row, rowIndex, column)}
                    </td>
                  ))}
                  <td
                    data-label=""
                    className={cx(
                      styles.cell,
                      styles.compactCell,
                      styles.alignCenter,
                      styles.stickyActionCell,
                    )}
                    style={{ right: 0 }}
                  >
                    <div className={styles.actionCellContent}>
                      <button
                        type="button"
                        className={styles.rowDeleteButton}
                        aria-label={`Delete row ${rowIndex + 1}`}
                        onClick={() => handleRemoveRow(row.id)}
                      >
                        <FiTrash2
                          className={styles.actionIcon}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.paginationBar}>
          <div className={styles.paginationInfo} />
          <div className={styles.footerValue}>
            <strong className={styles.footerLabel}>book qty</strong>
            <strong>{QUANTITY_FORMATTER.format(totals.bookQty)}</strong>
            <strong className={styles.footerLabel}>physical qty</strong>
            <strong>{QUANTITY_FORMATTER.format(totals.physicalQty)}</strong>
            <strong className={styles.footerLabel}>diff qty</strong>
            <strong>{QUANTITY_FORMATTER.format(totals.diffQty)}</strong>
            <strong className={styles.footerLabel}>total</strong>
            <strong>{VALUE_FORMATTER.format(totals.value)}</strong>
          </div>
        </div>
      </div>
      <DeleteConfirmModal
        isOpen={pendingLoadRequest !== null}
        title="Replace current rows?"
        message=""
        iconVariant="replace"
        confirmLabel={
          pendingLoadRequest?.type === "latest"
            ? "Load Stock"
            : pendingLoadRequest?.type === "refno"
              ? "Load Ref No"
              : "Load Selected"
        }
        cancelLabel="Keep current rows"
        loading={isLoadingStock}
        loadingLabel="Loading..."
        onConfirm={handleConfirmLoad}
        onCancel={() => {
          if (!isLoadingStock) {
            setPendingLoadRequest(null);
          }
        }}
      />
      <DeleteConfirmModal
        isOpen={isDeleteLoadedStockConfirmOpen}
        itemName={
          loadedDocumentMeta?.stockLabel || voucherRefNo || loadedPhysicalStockId || undefined
        }
        title="Delete Physical Stock?"
        message={
          loadedDocumentMeta?.stockLabel || voucherRefNo
            ? `Do you really want to delete the loaded physical stock "${loadedDocumentMeta?.stockLabel || voucherRefNo}"? This action cannot be undone.`
            : "Do you really want to delete the loaded physical stock? This action cannot be undone."
        }
        confirmLabel="Delete Stock"
        cancelLabel="Cancel"
        loading={isDeletingPhysicalStock}
        loadingLabel="Deleting..."
        onConfirm={handleConfirmDeleteLoadedStock}
        onCancel={() => {
          if (!isDeletingPhysicalStock) {
            setIsDeleteLoadedStockConfirmOpen(false);
          }
        }}
      />
      {isInlineItemMasterOpen ? (
        <ItemMasterPageContent
          inlineModalOnly
          onCrudControllerReady={handleInlineItemMasterControllerReady}
          onModalOpenChange={handleInlineItemMasterModalOpenChange}
        />
      ) : null}
      <BulkLoadItemsModal
        isOpen={isBulkLoadModalOpen}
        accYear={accountingYear ?? ""}
        defaultCompanyId={activeCompany?.compId ?? ""}
        defaultBranchId={activeBranch?.brId ?? ""}
        loading={isBulkLoadingStock}
        onClose={() => setIsBulkLoadModalOpen(false)}
        onLoadStock={(params) => void handleBulkLoadStock(params)}
      />
      <PhysicalStockListModal
        isOpen={isPhysicalStockListOpen}
        suspendKeyboardShortcuts={pendingLoadRequest !== null}
        filters={physicalStockListFilters}
        rows={physicalStockListRows}
        loading={isPhysicalStockListLoading}
        error={physicalStockListError}
        totalEntries={physicalStockListMeta.total}
        currentPage={physicalStockListPage}
        pageSize={physicalStockListPageSize}
        selectedStockId={selectedPhysicalStockListId}
        selectedStockLabel={
          selectedPhysicalStockListRow ? getPhysicalStockLabel(selectedPhysicalStockListRow) : null
        }
        onClose={handleClosePhysicalStockList}
        onSearchChange={handlePhysicalStockListSearchChange}
        onDateFromChange={handlePhysicalStockListDateFromChange}
        onDateToChange={handlePhysicalStockListDateToChange}
        onPageChange={setPhysicalStockListPage}
        onPageSizeChange={handlePhysicalStockListPageSizeChange}
        onSelectRow={handlePhysicalStockListRowSelect}
        onLoadRow={handleLoadPhysicalStockListRow}
        onLoadSelected={handleLoadSelectedPhysicalStockListRow}
      />
      </section>
    </>
  );
}