"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { useBusinessContext } from "@/components/layout/business-context";
import type { ERPDynamicSelectOption } from "@/components/library/ui";
import { extractRows } from "@/features/masters/shared/normalizers";
import { useApi } from "@/hooks/useApi";
import {
  getAuthSessionId,
  getAuthUserId,
  getOrCreateClientDeviceId,
} from "@/lib/auth/session";
import type {
  ItemPriceDetailsPayload,
  ItemTaxDetailPayload,
} from "@/store/api/lookupsApi";
import {
  useLazyGetGodownOptionsQuery,
  useLazyGetItemOptionsQuery,
  useLazyGetItemPriceDetailsQuery,
  useLazyGetItemTaxByIdQuery,
  useLazyGetTaxOptionsQuery,
  useLazyGetUnitOptionsQuery,
} from "@/store/api/lookupsApi";
import type { ApiSuccessResponse, ListMeta } from "@/utils/types";
import type {
  OpeningStockDocumentPayload,
  OpeningStockHeaderPayload,
  OpeningStockListMeta,
  OpeningStockSaveRequest,
  OpeningStockSuccessResponse,
} from "./opening-stock.types";
import {
  ACCOUNT_LEDGER_LIST_ENDPOINT,
  DEFAULT_GODOWN_OPTION,
  DEFAULT_ITEM_OPTION,
  LOOKUP_FIELD_CONFIG,
  LOOKUP_SEARCH_DEBOUNCE_MS,
  OPENING_STOCK_GET_ENDPOINT,
  OPENING_STOCK_LEDGER_NAME,
  OPENING_STOCK_LIST_ENDPOINT,
  OPENING_STOCK_SAVE_ENDPOINT,
  UI_TABLE_COLUMNS_LIST_ENDPOINT,
  UI_TABLE_COLUMNS_QUERY,
  UI_TABLE_COLUMNS_TOAST_OPTIONS,
} from "./constants";
import type {
  AccountLedgerRecord,
  LoadedOpeningStockMeta,
  LookupKind,
  OpeningStockRow,
  UiTableColumnPayload,
} from "./Types";
import {
  buildItemAutofillValues,
  buildLoadedLookupOptions,
  buildOpeningStockDetailPayload,
  buildOpeningStockNarration,
  buildPendingItemSelectionValues,
  buildPriceSelectionValues,
  buildTaxSelectionValues,
  createDefaultRowValues,
  createItemAutofillResetValues,
  createRow,
  filterLookupOptions,
  formatAccountingYear,
  formatQuantityValue,
  getTodayInputValue,
  getTotals,
  getNextRowId,
  getRowValidationMessage,
  isPristineRow,
  mapOpeningStockDocumentToRows,
  mergeLookupOptions,
  parseDecimal,
  resolveItemPriceRecordByUnitId,
  toInputDateValue,
  toIsoDateTime,
  toNullableTrimmedString,
} from "./Utils";

const DEFAULT_ROW_VALUES = createDefaultRowValues();
const ITEM_AUTOFILL_RESET_VALUES = createItemAutofillResetValues(DEFAULT_ROW_VALUES);

export function useOpeningStock() {
  // ── State ────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [voucherDate, setVoucherDate] = useState(() => getTodayInputValue());
  const [rows, setRows] = useState<OpeningStockRow[]>([createRow(1, DEFAULT_ROW_VALUES)]);
  const [uiColumnConfigs, setUiColumnConfigs] = useState<UiTableColumnPayload[]>([]);
  const [itemDetailsByItemId, setItemDetailsByItemId] = useState<
    Record<string, ItemPriceDetailsPayload>
  >({});
  const [itemOptions, setItemOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_ITEM_OPTION]);
  const [taxOptions, setTaxOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [unitOptions, setUnitOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [godownOptions, setGodownOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_GODOWN_OPTION]);
  const [loadedVoucherId, setLoadedVoucherId] = useState<string | null>(null);
  const [loadedDocumentMeta, setLoadedDocumentMeta] = useState<LoadedOpeningStockMeta | null>(null);
  const [isLoadingStock, setIsLoadingStock] = useState(false);
  const [isLoadConfirmOpen, setIsLoadConfirmOpen] = useState(false);
  const [openLookupCell, setOpenLookupCell] = useState<{ key: string; kind: LookupKind } | null>(null);
  const [openRowActionMenuId, setOpenRowActionMenuId] = useState<number | null>(null);
  const [lookupSearchQuery, setLookupSearchQuery] = useState("");

  // ── Refs ─────────────────────────────────────────────────────────────────
  const tableRef = useRef<HTMLTableElement | null>(null);
  const lookupRootRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const rowActionRootRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const lookupSearchInputRef = useRef<HTMLInputElement | null>(null);
  const itemSearchTimeoutRef = useRef<number | null>(null);
  const itemSearchRequestRef = useRef(0);
  const itemDetailRequestRef = useRef<Record<number, number>>({});
  const godownSearchTimeoutRef = useRef<number | null>(null);
  const godownSearchRequestRef = useRef(0);

  // ── Business context ─────────────────────────────────────────────────────
  const {
    activeCompany,
    activeBranch,
    loading: isBusinessContextLoading,
    error: businessContextError,
  } = useBusinessContext();

  // ── API hooks ─────────────────────────────────────────────────────────────
  const { getAll: listUiTableColumns, loading: isConfigLoading, error: configError } = useApi<
    ApiSuccessResponse<UiTableColumnPayload[], ListMeta>
  >(UI_TABLE_COLUMNS_LIST_ENDPOINT, { toast: UI_TABLE_COLUMNS_TOAST_OPTIONS });

  const { run: listAccountLedgers } = useApi<unknown>(ACCOUNT_LEDGER_LIST_ENDPOINT, {
    toast: { success: false, error: false },
  });

  const { run: listOpeningStocks } = useApi<
    OpeningStockSuccessResponse<OpeningStockHeaderPayload[], OpeningStockListMeta>
  >(OPENING_STOCK_LIST_ENDPOINT, { toast: { success: false } });

  const { run: getOpeningStockDocument } = useApi<
    OpeningStockSuccessResponse<OpeningStockDocumentPayload>
  >(OPENING_STOCK_GET_ENDPOINT, { toast: { success: false } });

  const { run: saveOpeningStock, loading: isSavingOpeningStock } = useApi<
    unknown,
    OpeningStockSaveRequest
  >(OPENING_STOCK_SAVE_ENDPOINT, {
    method: "POST",
    toast: { successMessage: "Opening stock updated successfully." },
  });

  const [triggerItemOptions, { isFetching: isItemLookupLoading }] = useLazyGetItemOptionsQuery();
  const [triggerTaxOptions] = useLazyGetTaxOptionsQuery();
  const [triggerUnitOptions] = useLazyGetUnitOptionsQuery();
  const [triggerGodownOptions, { isFetching: isGodownLookupLoading }] = useLazyGetGodownOptionsQuery();
  const [triggerItemPriceDetails] = useLazyGetItemPriceDetailsQuery();
  const [triggerItemTaxById] = useLazyGetItemTaxByIdQuery();

  // ── Derived ───────────────────────────────────────────────────────────────
  const accountingYear = formatAccountingYear(voucherDate);
  const draftRows = useMemo(
    () => rows.filter((row) => !isPristineRow(row, DEFAULT_ROW_VALUES)),
    [rows],
  );
  const draftTotals = useMemo(() => getTotals(draftRows), [draftRows]);

  const unitOptionsByValue = useMemo(
    () => new Map(unitOptions.filter((o) => o.value.trim()).map((o) => [o.value, o.label])),
    [unitOptions],
  );
  const taxOptionsByValue = useMemo(
    () => new Map(taxOptions.filter((o) => o.value.trim()).map((o) => [o.value, o.label])),
    [taxOptions],
  );
  const taxSelectOptions = useMemo(
    () => taxOptions.filter((o) => o.value.trim().length > 0),
    [taxOptions],
  );
  const itemOptionsByValue = useMemo(
    () => new Map(itemOptions.map((o) => [o.value, o.label])),
    [itemOptions],
  );
  const godownOptionsByValue = useMemo(
    () => new Map(godownOptions.map((o) => [o.value, o.label])),
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

  // ── Lookup loaders ─────────────────────────────────────────────────────────
  const loadLookupOptions = useCallback(
    async (lookupKind: LookupKind, search = ""): Promise<ERPDynamicSelectOption[]> => {
      const normalizedSearch = search.trim();
      return lookupKind === "item"
        ? triggerItemOptions(normalizedSearch ? { search: normalizedSearch } : undefined, true).unwrap()
        : triggerGodownOptions(normalizedSearch ? { search: normalizedSearch } : undefined, true).unwrap();
    },
    [triggerGodownOptions, triggerItemOptions],
  );

  const loadUnitOptions = useCallback(
    async (search = ""): Promise<ERPDynamicSelectOption[]> => {
      const normalizedSearch = search.trim();
      return triggerUnitOptions(normalizedSearch ? { search: normalizedSearch } : undefined, true).unwrap();
    },
    [triggerUnitOptions],
  );

  const loadTaxOptions = useCallback(
    async (): Promise<ERPDynamicSelectOption[]> => triggerTaxOptions(undefined, true).unwrap(),
    [triggerTaxOptions],
  );

  // ── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await listUiTableColumns({ ...UI_TABLE_COLUMNS_QUERY });
        if (!cancelled) setUiColumnConfigs(Array.isArray(payload?.data) ? payload.data : []);
      } catch {
        if (!cancelled) setUiColumnConfigs([]);
      }
    })();
    return () => { cancelled = true; };
  }, [listUiTableColumns]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [itemsPayload, taxesPayload, unitsPayload, godownsPayload] = await Promise.allSettled([
        loadLookupOptions("item"),
        loadTaxOptions(),
        loadUnitOptions(),
        loadLookupOptions("godown"),
      ]);
      if (cancelled) return;
      if (itemsPayload.status === "fulfilled") setItemOptions(itemsPayload.value);
      if (taxesPayload.status === "fulfilled") setTaxOptions(taxesPayload.value);
      if (unitsPayload.status === "fulfilled") setUnitOptions(unitsPayload.value);
      if (godownsPayload.status === "fulfilled") setGodownOptions(godownsPayload.value);
    })();
    return () => { cancelled = true; };
  }, [loadLookupOptions, loadTaxOptions, loadUnitOptions]);

  // Focus lookup search input when lookup opens
  useEffect(() => {
    if (!openLookupCell) return;
    const animationFrame = window.requestAnimationFrame(() => {
      lookupSearchInputRef.current?.focus();
    });
    return () => { window.cancelAnimationFrame(animationFrame); };
  }, [openLookupCell]);

  // Click-outside and Escape to close popups
  useEffect(() => {
    if (!openLookupCell && openRowActionMenuId === null) return;
    const handlePointerDown = (event: MouseEvent) => {
      const lookupRoot = openLookupCell ? lookupRootRefs.current[openLookupCell.key] : null;
      if (lookupRoot && !lookupRoot.contains(event.target as Node)) {
        setOpenLookupCell(null);
        setLookupSearchQuery("");
      }
      const actionRoot =
        openRowActionMenuId !== null ? rowActionRootRefs.current[openRowActionMenuId] : null;
      if (actionRoot && !actionRoot.contains(event.target as Node)) {
        setOpenRowActionMenuId(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenLookupCell(null);
        setLookupSearchQuery("");
        setOpenRowActionMenuId(null);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openLookupCell, openRowActionMenuId]);

  // Cleanup search timeouts on unmount
  useEffect(() => {
    return () => {
      if (itemSearchTimeoutRef.current !== null) window.clearTimeout(itemSearchTimeoutRef.current);
      if (godownSearchTimeoutRef.current !== null) window.clearTimeout(godownSearchTimeoutRef.current);
    };
  }, []);

  // Sync unit label when unit options load
  useEffect(() => {
    if (unitOptionsByValue.size === 0) return;
    setRows((currentRows) =>
      currentRows.map((row) => {
        const unitId = row.values.oslunitid?.trim() ?? "";
        if (!unitId) return row;
        const unitLabel = unitOptionsByValue.get(unitId);
        if (!unitLabel || row.values.uom === unitLabel) return row;
        return { ...row, values: { ...row.values, uom: unitLabel } };
      }),
    );
  }, [unitOptionsByValue]);

  // Sync godown / tax labels when options load
  useEffect(() => {
    if (godownOptionsByValue.size === 0 && taxOptionsByValue.size === 0) return;
    setRows((currentRows) =>
      currentRows.map((row) => {
        const nextValues = { ...row.values };
        let changed = false;
        const godownId = row.values.oslgodownid?.trim() ?? "";
        const taxId = row.values.osltaxid?.trim() ?? "";
        const godownLabel = godownId ? godownOptionsByValue.get(godownId) : "";
        const taxLabel = taxId ? taxOptionsByValue.get(taxId) : "";
        if (godownLabel && nextValues.godown !== godownLabel) { nextValues.godown = godownLabel; changed = true; }
        if (taxLabel && nextValues.taxname !== taxLabel) { nextValues.taxname = taxLabel; changed = true; }
        return changed ? { ...row, values: nextValues } : row;
      }),
    );
  }, [godownOptionsByValue, taxOptionsByValue]);

  // Reset loaded document when company/branch changes
  useEffect(() => {
    if (!loadedVoucherId || !loadedDocumentMeta || isBusinessContextLoading) return;
    const currentCompanyId = activeCompany?.compId ?? null;
    const currentBranchId = activeBranch?.brId ?? null;
    if (currentCompanyId === loadedDocumentMeta.companyId && currentBranchId === loadedDocumentMeta.branchId) return;
    setLoadedVoucherId(null);
    setLoadedDocumentMeta(null);
  }, [activeBranch?.brId, activeCompany?.compId, isBusinessContextLoading, loadedDocumentMeta, loadedVoucherId]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleRowChange = useCallback((rowId: number, field: string, value: string) => {
    setRows((currentRows) =>
      currentRows.map((row) => {
        if (row.id !== rowId) return row;
        const nextValues = { ...row.values, [field]: value };
        if (field === "openingqty" || field === "convfactor") {
          nextValues.baseqty = formatQuantityValue(
            parseDecimal(field === "openingqty" ? value : nextValues.openingqty) *
              parseDecimal(field === "convfactor" ? value : nextValues.convfactor),
          );
        }
        return { ...row, values: nextValues };
      }),
    );
  }, []);

  const handleUomChange = useCallback(
    (rowId: number, unitId: string) => {
      setRows((currentRows) =>
        currentRows.map((row) => {
          if (row.id !== rowId) return row;
          const itemId = row.values.oslitemid?.trim() ?? "";
          const itemDetail = itemId ? itemDetailsByItemId[itemId] : undefined;
          if (!itemDetail) return row;
          const priceRecord = resolveItemPriceRecordByUnitId(itemDetail, unitId);
          return {
            ...row,
            values: {
              ...row.values,
              ...buildPriceSelectionValues(itemDetail, priceRecord, unitOptionsByValue, godownOptionsByValue, row.values),
            },
          };
        }),
      );
    },
    [godownOptionsByValue, itemDetailsByItemId, unitOptionsByValue],
  );

  const handleTaxChange = useCallback(
    (rowId: number, taxId: string) => {
      if (!taxId.trim()) {
        setRows((currentRows) =>
          currentRows.map((row) =>
            row.id === rowId
              ? { ...row, values: { ...row.values, ...buildTaxSelectionValues({ tax_id: "", tax_name: "", tax_gst_rate_total: 0, tax_cess_type: "NONE", tax_cess_perc: 0, tax_cess_unit: 0 }) } }
              : row,
          ),
        );
        return;
      }
      void (async () => {
        try {
          const taxDetail = await triggerItemTaxById({ taxId }, true).unwrap();
          setRows((currentRows) =>
            currentRows.map((row) =>
              row.id === rowId
                ? { ...row, values: { ...row.values, ...buildTaxSelectionValues(taxDetail) } }
                : row,
            ),
          );
        } catch (error) {
          const message =
            error && typeof error === "object" && "message" in error && typeof error.message === "string"
              ? error.message
              : "Failed to load tax details.";
          toast.error(message, { toastId: `opening-stock-tax-details:${taxId}` });
        }
      })();
    },
    [triggerItemTaxById],
  );

  const handleLookupSelection = useCallback(
    (rowId: number, lookupKind: LookupKind, option: ERPDynamicSelectOption) => {
      if (lookupKind !== "item") {
        const fieldConfig = LOOKUP_FIELD_CONFIG[lookupKind];
        setRows((currentRows) =>
          currentRows.map((row) =>
            row.id === rowId
              ? { ...row, values: { ...row.values, [fieldConfig.labelField]: option.value ? option.label : "", [fieldConfig.idField]: option.value } }
              : row,
          ),
        );
        setOpenLookupCell(null);
        setLookupSearchQuery("");
        return;
      }
      const requestId = (itemDetailRequestRef.current[rowId] ?? 0) + 1;
      itemDetailRequestRef.current[rowId] = requestId;
      setRows((currentRows) =>
        currentRows.map((row) =>
          row.id === rowId
            ? { ...row, values: { ...row.values, ...buildPendingItemSelectionValues(option, ITEM_AUTOFILL_RESET_VALUES) } }
            : row,
        ),
      );
      setOpenLookupCell(null);
      setLookupSearchQuery("");
      if (!option.value) return;
      const cachedDetail = itemDetailsByItemId[option.value];
      if (cachedDetail) {
        setRows((currentRows) =>
          currentRows.map((row) => {
            if (row.id !== rowId || (row.values.oslitemid ?? "").trim() !== option.value) return row;
            return { ...row, values: { ...row.values, ...buildItemAutofillValues(cachedDetail, unitOptionsByValue, godownOptionsByValue, row.values, option.label, ITEM_AUTOFILL_RESET_VALUES) } };
          }),
        );
        return;
      }
      void (async () => {
        try {
          const detail = await triggerItemPriceDetails({ itemId: option.value }, true).unwrap();
          if (itemDetailRequestRef.current[rowId] !== requestId) return;
          setItemDetailsByItemId((current) => ({ ...current, [detail.item.item_id]: detail }));
          setRows((currentRows) =>
            currentRows.map((row) => {
              if (row.id !== rowId || (row.values.oslitemid ?? "").trim() !== option.value) return row;
              return { ...row, values: { ...row.values, ...buildItemAutofillValues(detail, unitOptionsByValue, godownOptionsByValue, row.values, option.label, ITEM_AUTOFILL_RESET_VALUES) } };
            }),
          );
        } catch (error) {
          if (itemDetailRequestRef.current[rowId] !== requestId) return;
          const message =
            error && typeof error === "object" && "message" in error && typeof error.message === "string"
              ? error.message
              : "Failed to load item price details.";
          toast.error(message, { toastId: `opening-stock-item-price-details:${option.value}` });
        }
      })();
    },
    [godownOptionsByValue, itemDetailsByItemId, triggerItemPriceDetails, unitOptionsByValue],
  );

  const handleLookupSearchChange = useCallback(
    (lookupKind: LookupKind, search: string) => {
      const normalizedSearch = search.trim();
      if (lookupKind === "item") {
        if (itemSearchTimeoutRef.current !== null) window.clearTimeout(itemSearchTimeoutRef.current);
        if (!normalizedSearch) return;
        const requestId = ++itemSearchRequestRef.current;
        itemSearchTimeoutRef.current = window.setTimeout(() => {
          void (async () => {
            try {
              const searchedOptions = await loadLookupOptions("item", normalizedSearch);
              if (itemSearchRequestRef.current !== requestId) return;
              setItemOptions((current) => mergeLookupOptions(current, searchedOptions));
            } catch { /* keep existing */ }
          })();
        }, LOOKUP_SEARCH_DEBOUNCE_MS);
        return;
      }
      if (godownSearchTimeoutRef.current !== null) window.clearTimeout(godownSearchTimeoutRef.current);
      if (!normalizedSearch) return;
      const requestId = ++godownSearchRequestRef.current;
      godownSearchTimeoutRef.current = window.setTimeout(() => {
        void (async () => {
          try {
            const searchedOptions = await loadLookupOptions("godown", normalizedSearch);
            if (godownSearchRequestRef.current !== requestId) return;
            setGodownOptions((current) => mergeLookupOptions(current, searchedOptions));
          } catch { /* keep existing */ }
        })();
      }, LOOKUP_SEARCH_DEBOUNCE_MS);
    },
    [loadLookupOptions],
  );

  const handleAddRow = useCallback(() => {
    setRows((currentRows) => [...currentRows, createRow(getNextRowId(currentRows), DEFAULT_ROW_VALUES)]);
  }, []);

  const handleRemoveRow = useCallback((rowId: number) => {
    setOpenRowActionMenuId((currentId) => (currentId === rowId ? null : currentId));
    setRows((currentRows) => {
      const nextRows = currentRows.filter((row) => row.id !== rowId);
      return nextRows.length > 0 ? nextRows : [createRow(1, DEFAULT_ROW_VALUES)];
    });
  }, []);

  const prefetchLoadedItemDetails = useCallback(
    async (details: OpeningStockDocumentPayload["details"]) => {
      const itemIds = Array.from(
        new Set(details.map((d) => d.osl_item_id.trim()).filter((id): id is string => id.length > 0)),
      );
      if (itemIds.length === 0) return;
      const itemDetails = await Promise.allSettled(
        itemIds.map((itemId) => triggerItemPriceDetails({ itemId }, true).unwrap()),
      );
      const nextItemDetailsById: Record<string, ItemPriceDetailsPayload> = {};
      for (const itemDetail of itemDetails) {
        if (itemDetail.status !== "fulfilled") continue;
        nextItemDetailsById[itemDetail.value.item.item_id] = itemDetail.value;
      }
      if (Object.keys(nextItemDetailsById).length > 0) {
        setItemDetailsByItemId((current) => ({ ...current, ...nextItemDetailsById }));
      }
    },
    [triggerItemPriceDetails],
  );

  const loadLatestOpeningStock = useCallback(async () => {
    if (!activeCompany) { toast.error("Select a company in the header before loading stock.", { toastId: "opening-stock-load:missing-company" }); return; }
    if (!activeBranch) { toast.error("Select a branch in the header before loading stock.", { toastId: "opening-stock-load:missing-branch" }); return; }
    if (!accountingYear) { toast.error("The selected company does not have a valid financial year.", { toastId: "opening-stock-load:missing-fin-year" }); return; }
    setIsLoadConfirmOpen(false);
    setIsLoadingStock(true);
    try {
      const listPayload = await listOpeningStocks({ query: { osh_company_id: activeCompany.compId, osh_branch_id: activeBranch.brId, osh_acc_year: accountingYear, page: "1", limit: "1" } });
      const latestDocumentHeader = Array.isArray(listPayload?.data) ? listPayload.data[0] : null;
      if (!latestDocumentHeader?.avh_voucher_id) { toast.info("No saved opening stock was found for the selected company and branch.", { toastId: "opening-stock-load:not-found" }); return; }
      const documentPayload = await getOpeningStockDocument({ query: { avh_voucher_id: latestDocumentHeader.avh_voucher_id } });
      const document = documentPayload?.data;
      if (!document) { toast.info("No saved opening stock was found for the selected company and branch.", { toastId: "opening-stock-load:empty-document" }); return; }
      const documentRows = mapOpeningStockDocumentToRows(document, DEFAULT_ROW_VALUES);
      setItemOptions((current) => mergeLookupOptions(current, buildLoadedLookupOptions(document.details.map((d) => ({ value: d.osl_item_id, label: d.osl_item_name })))));
      setGodownOptions((current) => mergeLookupOptions(current, buildLoadedLookupOptions(document.details.map((d) => ({ value: d.osl_godown_id, label: d.osl_godown_name })))));
      setUnitOptions((current) => mergeLookupOptions(current, buildLoadedLookupOptions(document.details.map((d) => ({ value: d.osl_unit_id, label: d.osl_unit_name })))));
      setTaxOptions((current) => mergeLookupOptions(current, buildLoadedLookupOptions(document.details.map((d) => ({ value: d.osl_tax_id, label: d.osl_tax_name })))));
      setRows(documentRows);
      setVoucherDate(toInputDateValue(document.header.osh_voucher_date) || voucherDate);
      setSearchQuery("");
      setLookupSearchQuery("");
      setOpenLookupCell(null);
      setOpenRowActionMenuId(null);
      setLoadedVoucherId(document.header.avh_voucher_id);
      setLoadedDocumentMeta({ voucherId: document.header.avh_voucher_id, voucherLabel: document.header.avh_voucher_refno || document.header.osh_voucher_no, voucherDate: toInputDateValue(document.header.osh_voucher_date), companyId: document.header.osh_company_id, branchId: document.header.osh_branch_id });
      void prefetchLoadedItemDetails(document.details);
    } catch { /* useApi handles toasting */ } finally {
      setIsLoadingStock(false);
    }
  }, [accountingYear, activeBranch, activeCompany, getOpeningStockDocument, listOpeningStocks, prefetchLoadedItemDetails, voucherDate]);

  const handleLoadStock = useCallback(() => {
    if (draftRows.length > 0) { setIsLoadConfirmOpen(true); return; }
    void loadLatestOpeningStock();
  }, [draftRows.length, loadLatestOpeningStock]);

  const handleUpdateStock = useCallback(async () => {
    if (!activeCompany) { toast.error("Select a company in the header before updating stock.", { toastId: "opening-stock-save:missing-company" }); return; }
    if (!activeBranch) { toast.error("Select a branch in the header before updating stock.", { toastId: "opening-stock-save:missing-branch" }); return; }
    if (!accountingYear) { toast.error("The selected company does not have a valid financial year.", { toastId: "opening-stock-save:missing-fin-year" }); return; }
    const voucherDateIso = toIsoDateTime(voucherDate);
    if (!voucherDateIso) { toast.error("Select a valid voucher date before updating stock.", { toastId: "opening-stock-save:missing-voucher-date" }); return; }
    const userId = getAuthUserId();
    if (!userId) { toast.error("User session is missing. Please login again.", { toastId: "opening-stock-save:missing-user" }); return; }
    if (draftRows.length === 0) { toast.error("Add at least one stock row before updating stock.", { toastId: "opening-stock-save:no-rows" }); return; }
    for (const [index, row] of draftRows.entries()) {
      const msg = getRowValidationMessage(row, index + 1);
      if (msg) { toast.error(msg, { toastId: `opening-stock-save:row-${index + 1}` }); return; }
    }
    let matchingLedgers: AccountLedgerRecord[] = [];
    try {
      const ledgerPayload = await listAccountLedgers({ query: { ledCompanyId: activeCompany.compId, ledIsActive: "true", page: "1", limit: "100" } });
      matchingLedgers = extractRows<AccountLedgerRecord>(ledgerPayload).filter(
        (ledger): ledger is AccountLedgerRecord =>
          typeof ledger?.ledId === "string" && typeof ledger?.ledName === "string" && ledger.ledName.trim().toLowerCase() === OPENING_STOCK_LEDGER_NAME,
      );
    } catch { toast.error("Failed to load the Opening Stock ledger.", { toastId: "opening-stock-save:ledger-request-failed" }); return; }
    if (matchingLedgers.length === 0) { toast.error("No active account ledger named Opening Stock was found for the selected company.", { toastId: "opening-stock-save:ledger-missing" }); return; }
    if (matchingLedgers.length > 1) { toast.error("More than one active account ledger named Opening Stock exists for the selected company.", { toastId: "opening-stock-save:ledger-ambiguous" }); return; }
    const requestPayload: OpeningStockSaveRequest = {
      header: { avh_voucher_id: loadedVoucherId ?? undefined, avh_voucher_type_id: 1, osh_acc_year: accountingYear, osh_company_id: activeCompany.compId, osh_branch_id: activeBranch.brId, osh_voucher_date: voucherDateIso, avh_party_id: matchingLedgers[0].ledId, avh_bill_date: voucherDateIso, avh_opposite_ledger_id: null, avh_employee_id: [], osh_device_type: "WEB", osh_counter_id: "COUNTER-1", osh_session_id: getAuthSessionId(), osh_device_id: getOrCreateClientDeviceId(), osh_status: "DRAFT", osh_ref_no: null, osh_narration: buildOpeningStockNarration(draftRows), osh_total_lines: draftTotals.lines, osh_total_qty: draftTotals.qty, osh_total_value: draftTotals.value, osh_user_id: userId },
      details: draftRows.map(buildOpeningStockDetailPayload),
    };
    try {
      await saveOpeningStock({ body: requestPayload });
      setRows([createRow(1, DEFAULT_ROW_VALUES)]);
      setSearchQuery("");
      setLookupSearchQuery("");
      setOpenLookupCell(null);
      setOpenRowActionMenuId(null);
      setLoadedVoucherId(null);
      setLoadedDocumentMeta(null);
      setIsLoadConfirmOpen(false);
    } catch { /* useApi handles toasting */ }
  }, [accountingYear, activeBranch, activeCompany, draftRows, draftTotals, loadedVoucherId, listAccountLedgers, saveOpeningStock, voucherDate]);

  const closeLookup = useCallback(() => {
    setOpenLookupCell(null);
    setLookupSearchQuery("");
  }, []);

  return {
    // State
    searchQuery, setSearchQuery,
    voucherDate, setVoucherDate,
    rows,
    uiColumnConfigs,
    itemDetailsByItemId,
    itemOptions,
    taxOptions,
    unitOptions,
    godownOptions,
    loadedVoucherId,
    loadedDocumentMeta,
    isLoadingStock,
    isLoadConfirmOpen, setIsLoadConfirmOpen,
    openLookupCell, setOpenLookupCell,
    openRowActionMenuId, setOpenRowActionMenuId,
    lookupSearchQuery, setLookupSearchQuery,
    // Refs
    tableRef,
    lookupRootRefs,
    rowActionRootRefs,
    lookupSearchInputRef,
    // Context
    activeCompany,
    activeBranch,
    isBusinessContextLoading,
    businessContextError,
    // Derived
    accountingYear,
    draftRows,
    draftTotals,
    isConfigLoading,
    configError,
    isSavingOpeningStock,
    isItemLookupLoading,
    isGodownLookupLoading,
    unitOptionsByValue,
    taxSelectOptions,
    itemOptionsByValue,
    godownOptionsByValue,
    filteredItemOptions,
    filteredGodownOptions,
    // Handlers
    handleRowChange,
    handleUomChange,
    handleTaxChange,
    handleLookupSelection,
    handleLookupSearchChange,
    handleAddRow,
    handleRemoveRow,
    handleLoadStock,
    handleUpdateStock,
    loadLatestOpeningStock,
    closeLookup,
  };
}