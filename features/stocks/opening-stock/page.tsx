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
import { toast } from "react-toastify";
import { useBusinessContext } from "@/components/layout/business-context";
import type { ERPDynamicSelectOption } from "@/components/library/ui";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
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
  useLazyGetItemPriceDetailsQuery,
  useLazyGetItemTaxByIdQuery,
  useLazyGetTaxOptionsQuery,
  useLazyGetUnitOptionsQuery,
} from "@/store/api/lookupsApi";
import type { ApiSuccessResponse, ListMeta } from "@/utils/types";
import { StockTableRow } from "./StockTableRow";
import { StockToolbar } from "./StockToolbar";
import type {
  OpeningStockDocumentPayload,
  OpeningStockHeaderPayload,
  OpeningStockListMeta,
  OpeningStockSaveRequest,
  OpeningStockSuccessResponse,
} from "./opening-stock.types";
import styles from "./page.module.scss";
import type {
  AccountLedgerRecord,
  ColumnDefinition,
  GodownLookupRecord,
  LoadedOpeningStockMeta,
  LookupCellState,
  LookupKind,
  OpeningStockRow,
  UiTableColumnPayload,
} from "./Types";
import {
  ACCOUNT_LEDGER_LIST_ENDPOINT,
  DEFAULT_GODOWN_OPTION,
  DEFAULT_ITEM_OPTION,
  DELETE_ACTION_COLUMN_WIDTH,
  GODOWN_LIST_ENDPOINT,
  GODOWN_LOOKUP_QUERY,
  LOOKUP_FIELD_CONFIG,
  LOOKUP_SEARCH_DEBOUNCE_MS,
  MIN_RESIZABLE_COLUMN_WIDTH,
  OPENING_STOCK_GET_ENDPOINT,
  OPENING_STOCK_LEDGER_NAME,
  OPENING_STOCK_LIST_ENDPOINT,
  OPENING_STOCK_SAVE_ENDPOINT,
  QUANTITY_FORMATTER,
  SERIAL_NUMBER_COLUMN_WIDTH,
  TRACKING_VALIDATION_FIELD_KEYS,
  UI_TABLE_COLUMNS_LIST_ENDPOINT,
  UI_TABLE_COLUMNS_QUERY,
  UI_TABLE_COLUMNS_TOAST_OPTIONS,
  VALUE_FORMATTER,
} from "./constants";
import {
  INITIAL_ROWS,
  buildGodownLookupOptions,
  buildInvalidFieldState,
  buildItemAutofillValues,
  buildLoadedLookupOptions,
  buildOpeningStockDetailPayload,
  buildOpeningStockNarration,
  buildPendingItemSelectionValues,
  buildPriceSelectionValues,
  buildTaxSelectionValues,
  clearInvalidFieldKeys,
  createEmptyRow,
  cx,
  DEFAULT_ROW_VALUES,
  ensureTrailingEmptyRow,
  filterLookupOptions,
  focusOpeningStockField,
  formatAccountingYear,
  formatQuantityValue,
  getRowValidationIssues,
  getTableMinWidth,
  getTodayInputValue,
  getTotals,
  isPristineRow,
  isValidationFieldSatisfied,
  mapOpeningStockDocumentToRows,
  mergeLookupOptions,
  mergeResolvedColumns,
  parseColumnWidth,
  parseDecimal,
  reorderColumns,
  resolveConfiguredColumns,
  resolveItemPriceRecordByUnitId,
  toInputDateValue,
  toIsoDateTime,
  toNullableTrimmedString,
} from "./Utils";

export default function OpeningStockPage() {
  const [voucherDate, setVoucherDate] = useState(() => getTodayInputValue());
  const [rows, setRows] = useState<OpeningStockRow[]>(INITIAL_ROWS);
  const [invalidFieldKeys, setInvalidFieldKeys] = useState<Record<string, true>>({});
  const [uiColumnConfigs, setUiColumnConfigs] = useState<UiTableColumnPayload[]>([]);
  const [itemDetailsByItemId, setItemDetailsByItemId] = useState<
    Record<string, ItemPriceDetailsPayload>
  >({});
  const [itemOptions, setItemOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_ITEM_OPTION]);
  const [taxOptions, setTaxOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [unitOptions, setUnitOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [godownOptions, setGodownOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_GODOWN_OPTION,
  ]);
  const [loadedVoucherId, setLoadedVoucherId] = useState<string | null>(null);
  const [loadedDocumentMeta, setLoadedDocumentMeta] = useState<LoadedOpeningStockMeta | null>(
    null,
  );
  const [isLoadingStock, setIsLoadingStock] = useState(false);
  const [isLoadConfirmOpen, setIsLoadConfirmOpen] = useState(false);
  const [openLookupCell, setOpenLookupCell] = useState<LookupCellState | null>(null);
  const [lookupSearchQuery, setLookupSearchQuery] = useState("");
  const [columns, setColumns] = useState<ColumnDefinition[]>([]);

  const tableRef = useRef<HTMLTableElement | null>(null);
  const lookupRootRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lookupSearchInputRef = useRef<HTMLInputElement | null>(null);
  const voucherDatePickerRef = useRef<HTMLInputElement | null>(null);
  const rowDatePickerRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const itemSearchTimeoutRef = useRef<number | null>(null);
  const itemSearchRequestRef = useRef(0);
  const itemDetailRequestRef = useRef<Record<number, number>>({});
  const taxDetailRequestRef = useRef<Record<number, number>>({});
  const godownSearchTimeoutRef = useRef<number | null>(null);
  const godownSearchRequestRef = useRef(0);
  const draggingColumnKeyRef = useRef<string | null>(null);
  const resizingColumnRef = useRef<{
    key: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const {
    activeCompany,
    activeBranch,
    loading: isBusinessContextLoading,
  } = useBusinessContext();

  const { getAll: listUiTableColumns } = useApi<
    ApiSuccessResponse<UiTableColumnPayload[], ListMeta>
  >(UI_TABLE_COLUMNS_LIST_ENDPOINT, {
    toast: UI_TABLE_COLUMNS_TOAST_OPTIONS,
  });
  const { run: listAccountLedgers } = useApi<unknown>(ACCOUNT_LEDGER_LIST_ENDPOINT, {
    toast: {
      success: false,
      error: false,
    },
  });
  const { run: listGodowns, loading: isGodownLookupLoading } = useApi<
    ApiSuccessResponse<GodownLookupRecord[], ListMeta>
  >(GODOWN_LIST_ENDPOINT, {
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
  const { run: getOpeningStockDocument } = useApi<
    OpeningStockSuccessResponse<OpeningStockDocumentPayload>
  >(OPENING_STOCK_GET_ENDPOINT, {
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

  const [triggerItemOptions, { isFetching: isItemLookupLoading }] =
    useLazyGetItemOptionsQuery();
  const [triggerTaxOptions] = useLazyGetTaxOptionsQuery();
  const [triggerUnitOptions] = useLazyGetUnitOptionsQuery();
  const [triggerItemPriceDetails] = useLazyGetItemPriceDetailsQuery();
  const [triggerItemTaxById] = useLazyGetItemTaxByIdQuery();

  const loadLookupOptions = useCallback(
    async (lookupKind: LookupKind, search = ""): Promise<ERPDynamicSelectOption[]> => {
      const normalizedSearch = search.trim();
      if (lookupKind === "item") {
        return triggerItemOptions(
          normalizedSearch ? { search: normalizedSearch } : undefined,
          true,
        ).unwrap();
      }

      const activeBranchId = activeBranch?.brId?.trim() ?? "";
      if (!activeBranchId) {
        return [DEFAULT_GODOWN_OPTION];
      }

      const payload = await listGodowns({
        query: {
          ...GODOWN_LOOKUP_QUERY,
          gdl_branch_id: activeBranchId,
          ...(normalizedSearch ? { search: normalizedSearch } : {}),
        },
      });
      return buildGodownLookupOptions(payload, activeBranchId);
    },
    [activeBranch?.brId, listGodowns, triggerItemOptions],
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
          setUiColumnConfigs(Array.isArray(payload?.data) ? payload.data : []);
        }
      } catch {
        if (!cancelled) {
          setUiColumnConfigs([]);
        }
      }
    };

    void loadUiColumnConfig();
    return () => {
      cancelled = true;
    };
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
      if (godownsPayload.status === "fulfilled") {
        setGodownOptions(godownsPayload.value);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadLookupOptions, loadTaxOptions, loadUnitOptions]);

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

  const resolvedColumns = useMemo(
    () => resolveConfiguredColumns(uiColumnConfigs),
    [uiColumnConfigs],
  );

  useEffect(() => {
    setColumns((current) => mergeResolvedColumns(current, resolvedColumns));
  }, [resolvedColumns]);

  const draftRows = useMemo(() => rows.filter((row) => !isPristineRow(row)), [rows]);
  const draftTotals = useMemo(() => getTotals(draftRows), [draftRows]);
  const visibleTotals = useMemo(() => getTotals(rows), [rows]);

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

    const currentCompanyId = activeCompany?.compId ?? null;
    const currentBranchId = activeBranch?.brId ?? null;
    if (
      currentCompanyId === loadedDocumentMeta.companyId &&
      currentBranchId === loadedDocumentMeta.branchId
    ) {
      return;
    }

    setLoadedVoucherId(null);
    setLoadedDocumentMeta(null);
  }, [
    activeBranch?.brId,
    activeCompany?.compId,
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

                if (field === "openingqty" || field === "freeqty" || field === "convfactor") {
                  const convFactor = parseDecimal(
                    field === "convfactor" ? value : nextValues.convfactor,
                  );
                  nextValues.baseqty = formatQuantityValue(
                    parseDecimal(field === "openingqty" ? value : nextValues.openingqty) *
                      convFactor,
                  );
                  nextValues.freebaseqty = formatQuantityValue(
                    parseDecimal(field === "freeqty" ? value : nextValues.freeqty) * convFactor,
                  );
                }

                if (field === "osltrackingtype" && value !== "2") {
                  nextValues.batchno = "";
                  nextValues.serialno = "";
                  nextValues.batchdate = "";
                  nextValues.mfgdate = "";
                  nextValues.expirydate = "";
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
                  ? {
                      ...row,
                      values: {
                        ...row.values,
                        ...buildTaxSelectionValues(taxDetail),
                      },
                    }
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
    [taxOptionsByValue, triggerItemTaxById],
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
        setInvalidFieldKeys((current) => clearInvalidFieldKeys(current, rowId, ["itemname"]));
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
                    ? {
                        ...row,
                        values: {
                          ...row.values,
                          ...buildTaxSelectionValues(taxDetail),
                        },
                      }
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
                    ? {
                        ...row,
                        values: {
                          ...row.values,
                          ...buildTaxSelectionValues(taxDetail),
                        },
                      }
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
      godownOptionsByValue,
      itemDetailsByItemId,
      taxOptionsByValue,
      triggerItemPriceDetails,
      triggerItemTaxById,
      unitOptionsByValue,
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

  const handleColumnResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLSpanElement>, columnKey: string, width: string) => {
      event.preventDefault();
      event.stopPropagation();

      resizingColumnRef.current = {
        key: columnKey,
        startX: event.clientX,
        startWidth: parseColumnWidth(width),
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

      setColumns((current) =>
        current.map((column) =>
          column.key === activeResize.key ? { ...column, width: `${nextWidth}px` } : column,
        ),
      );
    };

    const handleMouseUp = () => {
      if (!resizingColumnRef.current) {
        return;
      }

      resizingColumnRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

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

  const loadLatestOpeningStock = useCallback(async () => {
    if (!activeCompany) {
      toast.error("Select a company in the header before loading stock.", {
        toastId: "opening-stock-load:missing-company",
      });
      return;
    }
    if (!activeBranch) {
      toast.error("Select a branch in the header before loading stock.", {
        toastId: "opening-stock-load:missing-branch",
      });
      return;
    }
    if (!accountingYear) {
      toast.error("The selected company does not have a valid financial year.", {
        toastId: "opening-stock-load:missing-fin-year",
      });
      return;
    }

    setIsLoadConfirmOpen(false);
    setIsLoadingStock(true);
    try {
      const listPayload = await listOpeningStocks({
        query: {
          osh_company_id: activeCompany.compId,
          osh_branch_id: activeBranch.brId,
          osh_acc_year: accountingYear,
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

      const documentRows = mapOpeningStockDocumentToRows(document);
      const loadedItems = buildLoadedLookupOptions(
        document.details.map((detail) => ({
          value: detail.osl_item_id,
          label: detail.osl_item_name,
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
      setItemOptions((current) => mergeLookupOptions(current, loadedItems));
      setGodownOptions((current) => mergeLookupOptions(current, loadedGodowns));
      setUnitOptions((current) => mergeLookupOptions(current, loadedUnits));
      setTaxOptions((current) => mergeLookupOptions(current, loadedTaxes));
      setInvalidFieldKeys({});
      setRows(documentRows);
      setVoucherDate(toInputDateValue(document.header.osh_voucher_date) || voucherDate);
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
    } catch {
      // Toasting is handled in useApi.
    } finally {
      setIsLoadingStock(false);
    }
  }, [
    accountingYear,
    activeBranch,
    activeCompany,
    getOpeningStockDocument,
    listOpeningStocks,
    prefetchLoadedItemDetails,
    voucherDate,
  ]);

  const handleLoadStock = useCallback(() => {
    if (draftRows.length > 0) {
      setIsLoadConfirmOpen(true);
      return;
    }
    void loadLatestOpeningStock();
  }, [draftRows.length, loadLatestOpeningStock]);
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
    const validationIssues = draftRows.flatMap((row, index) =>
      getRowValidationIssues(row, index + 1).map((issue) => ({
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
        toast.error(firstIssue.message, {
          toastId: `opening-stock-save:row-${firstIssue.rowId}-${firstIssue.fieldKey}`,
        });
      }
      return;
    }
    setInvalidFieldKeys({});
    let matchingLedgers: AccountLedgerRecord[] = [];
    try {
      const ledgerPayload = await listAccountLedgers({
        query: {
          ledCompanyId: activeCompany.compId,
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
        osh_company_id: activeCompany.compId,
        osh_branch_id: activeBranch.brId,
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
    try {
      await saveOpeningStock({
        body: requestPayload,
      });
      setInvalidFieldKeys({});
      setRows([createEmptyRow(1)]);
      setLookupSearchQuery("");
      setOpenLookupCell(null);
      setLoadedVoucherId(null);
      setLoadedDocumentMeta(null);
      setIsLoadConfirmOpen(false);
    } catch {
      // Toasting is handled in useApi.
    }
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
    saveOpeningStock,
    voucherDate,
  ]);
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
  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headingBlock}>
          <div className={styles.headingRow}>
            <h1 className={styles.title}>Opening Stock</h1>
          </div>
        </div>
      </header>
      <div className={styles.tableShell}>
        <StockToolbar
          voucherDate={voucherDate}
          voucherDatePickerRef={voucherDatePickerRef}
          isLoadingStock={isLoadingStock}
          isSavingOpeningStock={isSavingOpeningStock}
          isBusinessContextLoading={isBusinessContextLoading}
          onVoucherDateChange={setVoucherDate}
          onLoadStock={handleLoadStock}
          onUpdateStock={handleUpdateStock}
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
              <col style={{ width: DELETE_ACTION_COLUMN_WIDTH }} />
              <col style={{ width: SERIAL_NUMBER_COLUMN_WIDTH }} />
              {columns.map((column) => (
                <col
                  key={column.key}
                  style={{ width: column.width }}
                />
              ))}
            </colgroup>
            <thead className={styles.head}>
              <tr>
                <th
                  className={cx(
                    styles.headerCell,
                    styles.alignCenter,
                    styles.headerCellDark,
                    styles.stickyActionCell,
                    styles.stickyActionHeader,
                  )}
                  style={{ width: DELETE_ACTION_COLUMN_WIDTH, left: 0 }}
                  aria-hidden="true"
                />
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
                    left: DELETE_ACTION_COLUMN_WIDTH,
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
              </tr>
            </thead>
            <tbody className={styles.body}>
              {rows.map((row, index) => (
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
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.paginationBar}>
          <div className={styles.paginationInfo} />
          <div className={styles.footerValue}>
            <span>{QUANTITY_FORMATTER.format(visibleTotals.qty)} qty</span>
            <span>{QUANTITY_FORMATTER.format(visibleTotals.freeQty)} free qty</span>
            <span className={styles.footerLabel}>stock value</span>
            <strong>{VALUE_FORMATTER.format(visibleTotals.value)}</strong>
          </div>
        </div>
      </div>
      <DeleteConfirmModal
        isOpen={isLoadConfirmOpen}
        title="Replace current rows?"
        message="Loading stock will replace the current non-empty rows with the latest saved opening stock from the backend."
        confirmLabel="Load stock"
        cancelLabel="Keep current rows"
        loading={isLoadingStock}
        loadingLabel="Loading stock..."
        onConfirm={() => {
          void loadLatestOpeningStock();
        }}
        onCancel={() => {
          if (!isLoadingStock) {
            setIsLoadConfirmOpen(false);
          }
        }}
      />
    </section>
  );
}
