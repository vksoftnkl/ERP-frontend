"use client";

/**
 * Change Selling Price — the screen's state and every path the operator has
 * into it: F8's Apply & Load, the Item cell's picker, a barcode scanned on the
 * spare line, F12's bucket list, the grid's cell edits, the violet card, the
 * scope switch and the save with its below-cost round trip.
 *
 * The rules themselves are the pure modules beside this file; this hook only
 * sequences them against the server. Rows are held in state AND a ref: the
 * async paths (a page of the grid landing, a save answering) read the grid as
 * it is when the answer arrives, the way the Qt screen reads its cells.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { confirm, getConfirmations } from "@/lib/confirm";
import { getMessages, toast } from "@/lib/notify";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectUserInfo } from "@/store/slices/authSlice";
import { focusCell } from "@/features/sales/quotation/components/grid-focus";
import { todayIso } from "@/features/sales/quotation/quotation.utils";
import {
  sellingPriceApi,
  useGetSellingPriceBranchNamesQuery,
  useGetSellingPriceLevelNamesQuery,
  useSaveSellingPriceRowsMutation,
} from "./selling-price.api";
import { changedChipText, fourCard, rowCard, subtitleText } from "./selling-price.cards";
import {
  DEFAULT_LEVEL_NAMES,
  DEFAULT_LEVEL_SHORTS,
  GRID_PAGE_SIZE,
  GRID_ROW_CEILING,
  LEVEL_COUNT,
  PRICE_KEYS,
  SELLING_PRICE_GRID_NAME,
  isHqUserType,
  levelOfColumn,
  type ColumnKey,
} from "./selling-price.constants";
import {
  emptyFilterState,
  filterSummary,
  gridQuery,
  itemOnlyFilters,
  type FilterState,
} from "./selling-price.filter";
import {
  belowCostLines,
  buildSavePayload,
  describeApiError,
  filterNotAvailableMessage,
  refusedFilterKey,
  refusedLineNumbers,
  savedMessage,
  type BelowCostLine,
} from "./selling-price.payload";
import {
  applyCellEdit,
  applyFourEdit,
  branchCellText,
  cellNumber,
  changedCount,
  editorKindOf,
  hereName,
  insertNewBucketRow,
  isChanged,
  isSameFigure,
  newBucketTemplateIndex,
  parseAcceptable,
  refreshItemRows,
  rowFromServer,
  rowIndexOfItem,
  tracksOf,
  type FourField,
  type PriceGridRow,
} from "./selling-price.state";
import { SAVE_BLOCKED_TOOLTIP, SAVE_TOOLTIP, validateRows } from "./selling-price.validate";
import { useSellingPriceSettings } from "./use-selling-price-settings";
import { messageContent } from "./components/message-text";
import type { ApiErrorLike, PriceScope, SellingPriceRow } from "./selling-price.types";

/** The spare line's React key — it is not a row of the state. */
export const SPARE_ROW_KEY = "csp-spare";

export type BucketDialogState = {
  rowKey: string;
  itemId: string;
  itemName: string;
  rows: SellingPriceRow[];
  selectedBucketId: string;
};

export type BelowCostDialogState = {
  lines: BelowCostLine[];
  policy: string;
};

export type PickerState = { initialQuery: string } | null;

/** Which row and level a violet-card edit belongs to. */
export type FourTarget = { rowKey: string | null; level: number };

type CurrentCell = { rowKey: string | null; column: ColumnKey | null };

/** A server refusal shown the way Qt's handleError shows one: warning for 4xx, error otherwise. */
function showApiError(error: unknown): void {
  const typed = (error ?? {}) as ApiErrorLike;
  const text = describeApiError(typed);
  if (typeof typed.status === "number" && typed.status >= 400 && typed.status < 500) {
    toast.warn(messageContent(text));
  } else {
    toast.error(messageContent(text));
  }
}

function anyOverlayUp(): boolean {
  return getConfirmations().length > 0 || getMessages().length > 0;
}

export function useSellingPriceScreen() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const business = useBusinessContext();
  const companyId = business.selectedCompanyId;
  const branchId = business.selectedBranchId;
  const userInfo = useAppSelector(selectUserInfo);
  const { settings } = useSellingPriceSettings(companyId, branchId);
  const belowCostPolicy = settings.belowCostPrice;
  const { permissions } = usePagePermissions();
  const canSaveRight = permissions.canEdit || permissions.canCreate;

  const levelQuery = useGetSellingPriceLevelNamesQuery();
  const branchQuery = useGetSellingPriceBranchNamesQuery(branchId, { skip: !branchId });
  const [saveRows] = useSaveSellingPriceRowsMutation();

  // ------------------------------------------------------------- names
  const { levelNames, levelShorts } = useMemo(() => {
    const names: string[] = [...DEFAULT_LEVEL_NAMES];
    const shorts: string[] = [...DEFAULT_LEVEL_SHORTS];
    for (const level of levelQuery.data ?? []) {
      const id = level.priceLvlId;
      if (id < 1 || id > LEVEL_COUNT) {
        continue;
      }
      if (level.priceLvlName?.trim()) names[id - 1] = level.priceLvlName.trim();
      if (level.priceLvlShort?.trim()) shorts[id - 1] = level.priceLvlShort.trim();
    }
    return { levelNames: names, levelShorts: shorts };
  }, [levelQuery.data]);

  const branchName = branchQuery.data?.brName || business.activeBranch?.name || "";
  const branchShort = branchQuery.data?.brShort || "";
  const here = hereName(branchShort, branchName);
  const companyName = business.activeCompany?.name ?? "";

  // ------------------------------------------------------------- the switch
  const userType = userInfo?.userType ?? "";
  const isHq = isHqUserType(userType);
  const [scopeChoice, setScopeChoice] = useState<PriceScope | null>(null);
  // All branches is the default for the user types the server lets save a
  // chain row; everyone else is fixed to This branch.
  const scope: PriceScope = isHq ? (scopeChoice ?? "CHAIN") : "BRANCH";
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  // ------------------------------------------------------------- rows
  const [rows, setRowsState] = useState<PriceGridRow[]>([]);
  const rowsRef = useRef<PriceGridRow[]>([]);
  const commitRows = useCallback((next: PriceGridRow[]) => {
    rowsRef.current = next;
    setRowsState(next);
  }, []);
  /** Items added by search (or scan) — they survive a reload. */
  const addedItemsRef = useRef<Set<string>>(new Set());

  const [filter, setFilterState] = useState<FilterState>(() => emptyFilterState());
  const [current, setCurrent] = useState<CurrentCell>({ rowKey: null, column: null });
  const [lastLevel, setLastLevel] = useState(0);
  const lastLevelRef = useRef(0);
  lastLevelRef.current = lastLevel;
  const [serverProblemKeys, setServerProblemKeys] = useState<ReadonlySet<string>>(() => new Set());

  const serverProblemKeysRef = useRef(serverProblemKeys);
  serverProblemKeysRef.current = serverProblemKeys;

  const [loading, setLoadingState] = useState(false);
  const loadingRef = useRef(false);
  const setLoading = useCallback((value: boolean) => {
    loadingRef.current = value;
    setLoadingState(value);
  }, []);
  const [saving, setSavingState] = useState(false);
  const savingRef = useRef(false);
  const setSaving = useCallback((value: boolean) => {
    savingRef.current = value;
    setSavingState(value);
  }, []);
  const loadSeqRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [hint, setHint] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [bucketDialog, setBucketDialog] = useState<BucketDialogState | null>(null);
  const [belowCost, setBelowCost] = useState<BelowCostDialogState | null>(null);
  const [picker, setPicker] = useState<PickerState>(null);
  /** The spare line's scan field. */
  const [spareBarcode, setSpareBarcode] = useState("");

  // ------------------------------------------------------------- focus
  /** The grid's "scroll this row into the drawn window" — it registers itself. */
  const revealRef = useRef<((rowKey: string) => boolean) | null>(null);
  const registerReveal = useCallback((reveal: (rowKey: string) => boolean) => {
    revealRef.current = reveal;
    return () => {
      if (revealRef.current === reveal) {
        revealRef.current = null;
      }
    };
  }, []);

  const focusLater = useCallback((rowKey: string | null, column: ColumnKey) => {
    const key = rowKey ?? SPARE_ROW_KEY;
    const attempt = (triesLeft: number) => {
      window.requestAnimationFrame(() => {
        if (!mountedRef.current || focusCell(SELLING_PRICE_GRID_NAME, key, column)) {
          return;
        }
        // Not drawn (a long grid draws a window of it): bring it into view, try again.
        if (triesLeft > 0 && revealRef.current?.(key)) {
          window.requestAnimationFrame(() => attempt(triesLeft - 1));
          return;
        }
        // A column the layout hides: the row's Item cell is always there.
        focusCell(SELLING_PRICE_GRID_NAME, key, "itemName");
      });
    };
    attempt(2);
  }, []);

  // ------------------------------------------------------------- derived
  const changed = changedCount(rows);
  const problemIndices = useMemo(() => {
    const set = new Set<number>();
    rows.forEach((row, index) => {
      if (serverProblemKeys.has(row.key)) set.add(index);
    });
    return set;
  }, [rows, serverProblemKeys]);
  const validation = useMemo(
    () => validateRows(rows, levelNames, belowCostPolicy, problemIndices),
    [belowCostPolicy, levelNames, problemIndices, rows],
  );
  const saveEnabled = !validation.blocked && !saving && changed > 0 && canSaveRight;
  const saveTooltip = validation.blocked ? SAVE_BLOCKED_TOOLTIP : SAVE_TOOLTIP;

  // What the save path reads at the moment it runs, not at the last render.
  const liveRef = useRef({ levelNames, belowCostPolicy, canSaveRight, companyId, branchId });
  liveRef.current = { levelNames, belowCostPolicy, canSaveRight, companyId, branchId };

  const currentIndex = current.rowKey ? rows.findIndex((row) => row.key === current.rowKey) : -1;
  const currentRow = currentIndex >= 0 ? rows[currentIndex] : null;
  const currentLevel =
    current.column && levelOfColumn(current.column) >= 0 ? levelOfColumn(current.column) : lastLevel;

  const subtitle = subtitleText(companyName, branchName, rows);
  const changedChip = changed > 0 ? changedChipText(changed) : "";
  const card = rowCard(currentRow, currentIndex, scope);
  const four = fourCard(currentRow, currentIndex, currentLevel, levelNames, saving);
  const summary = filterSummary(filter);

  const branchCell = useCallback(
    (row: PriceGridRow) => branchCellText(row, scope, here),
    [here, scope],
  );

  // ------------------------------------------------------------- discard guard
  const confirmDiscard = useCallback(async (action: string): Promise<boolean> => {
    const count = changedCount(rowsRef.current);
    if (count === 0) {
      return true;
    }
    return confirm({
      title: action,
      message: `${count} changed row(s) have not been saved. ${action} anyway? Their edits are lost.`,
      confirmLabel: "Yes",
      cancelLabel: "No",
    });
  }, []);

  // ------------------------------------------------------------- reading
  const fetchGridPage = useCallback(
    (filters: FilterState["filters"], offset: number) =>
      dispatch(
        sellingPriceApi.endpoints.listSellingPriceRows.initiate(
          gridQuery(liveRef.current.companyId, liveRef.current.branchId, filters, GRID_PAGE_SIZE, offset),
          { subscribe: false, forceRefetch: true },
        ),
      ).unwrap(),
    [dispatch],
  );

  const fetchBuckets = useCallback(
    (itemId: string) =>
      dispatch(
        sellingPriceApi.endpoints.listSellingPriceBuckets.initiate(
          { itemId, companyId: liveRef.current.companyId, branchId: liveRef.current.branchId },
          { subscribe: false, forceRefetch: true },
        ),
      ).unwrap(),
    [dispatch],
  );

  // ------------------------------------------------------------- adding items
  /**
   * A NEW bucket row for an item already on the grid — a price typed for an
   * MRP no stock carries yet. The item's tracking policy decides which of MRP
   * and sale price it may carry.
   */
  const addNewBucketRow = useCallback(
    async (itemId: string) => {
      const source = newBucketTemplateIndex(rowsRef.current, itemId);
      if (source < 0) {
        return;
      }
      const template = rowsRef.current[source];
      const { uomId, itemName: name } = template;
      let signature: string;
      try {
        signature = await dispatch(
          sellingPriceApi.endpoints.getSellingPriceTrackSignature.initiate(
            {
              itemId,
              uomId,
              onDate: todayIso(),
              companyId: liveRef.current.companyId,
              branchId: liveRef.current.branchId,
            },
            { subscribe: false, forceRefetch: true },
          ),
        ).unwrap();
      } catch (error) {
        if (mountedRef.current) showApiError(error);
        return;
      }
      if (!mountedRef.current) {
        return;
      }
      const tracks = tracksOf(signature);
      if (!tracks.mrp && !tracks.salePrice) {
        toast.warn(
          messageContent(
            `${name} is tracked by neither MRP nor sale price (tracking policy "${
              signature || "N"
            }"), so it has one price row per unit — and it is already on the grid. Edit that row.`,
            "No bucket to add",
          ),
        );
        return;
      }
      const inserted = insertNewBucketRow(rowsRef.current, itemId, uomId, signature);
      if (!inserted) {
        return;
      }
      commitRows(inserted.rows);
      const added = inserted.rows[inserted.index];
      setCurrent({ rowKey: added.key, column: tracks.mrp ? "mrpShown" : "salePx" });
      focusLater(added.key, tracks.mrp ? "mrpShown" : "salePx");
    },
    [commitRows, dispatch, focusLater],
  );

  /** The item's rows, a page at a time, put on the grid once the last page is in. */
  const fetchItemRows = useCallback(
    async (itemId: string, itemName: string) => {
      const found: SellingPriceRow[] = [];
      let offset = 0;
      try {
        for (;;) {
          const page = await fetchGridPage(itemOnlyFilters(itemId), offset);
          if (!mountedRef.current || rowIndexOfItem(rowsRef.current, itemId) >= 0) {
            return;
          }
          for (const row of page.items) {
            if (row.itemId === itemId) found.push(row);
          }
          if (page.items.length === GRID_PAGE_SIZE && offset < GRID_ROW_CEILING) {
            offset += GRID_PAGE_SIZE;
            continue;
          }
          break;
        }
      } catch (error) {
        if (mountedRef.current) showApiError(error);
        return;
      }
      if (found.length === 0) {
        toast.warn(
          messageContent(
            `${itemName || "This item"} has no unit to price. Give it a unit on the item card first.`,
            "No price rows",
          ),
        );
        return;
      }
      addedItemsRef.current.add(itemId);
      const fresh = found.map((row) => rowFromServer(row));
      commitRows([...rowsRef.current, ...fresh]);
      setCurrent({ rowKey: fresh[0].key, column: "priceA" });
      focusLater(fresh[0].key, "priceA");
    },
    [commitRows, fetchGridPage, focusLater],
  );

  /**
   * One item by search. Not on the grid yet: its rows, as this branch sees
   * them. Already on the grid: a NEW bucket row for it.
   */
  const addItem = useCallback(
    (itemId: string, itemName: string) => {
      if (!itemId) {
        return;
      }
      if (rowIndexOfItem(rowsRef.current, itemId) >= 0) {
        void addNewBucketRow(itemId);
        return;
      }
      void fetchItemRows(itemId, itemName);
    },
    [addNewBucketRow, fetchItemRows],
  );

  /**
   * The scan on the spare line. The cell is only the input: it is emptied
   * whatever the answer. An item already on the grid is shown, not added
   * again (another bucket is F12).
   */
  const resolveBarcode = useCallback(
    async (barcode: string) => {
      const code = barcode.trim();
      setSpareBarcode("");
      if (!code) {
        return;
      }
      let item: { itemId: string; itemName: string };
      try {
        item = await dispatch(
          sellingPriceApi.endpoints.getSellingPriceItemByBarcode.initiate(
            { barcode: code, companyId: liveRef.current.companyId },
            { subscribe: false, forceRefetch: true },
          ),
        ).unwrap();
      } catch (error) {
        if (!mountedRef.current) return;
        focusLater(null, "barcodeText");
        showApiError(error);
        return;
      }
      if (!mountedRef.current || !item.itemId) {
        return;
      }
      const at = rowIndexOfItem(rowsRef.current, item.itemId);
      if (at >= 0) {
        const row = rowsRef.current[at];
        setCurrent({ rowKey: row.key, column: "priceA" });
        focusLater(row.key, "priceA");
        return;
      }
      addItem(item.itemId, item.itemName);
    },
    [addItem, dispatch, focusLater],
  );

  // ------------------------------------------------------------- loading
  /**
   * The grid for the filter, every page of it, then any item added by search
   * that the filter did not bring.
   */
  const loadPrices = useCallback(
    async (state: FilterState) => {
      if (loadingRef.current || !(await confirmDiscard("Load"))) {
        return;
      }
      setLoading(true);
      const seq = ++loadSeqRef.current;
      setHint("Loading…");
      const all: SellingPriceRow[] = [];
      let offset = 0;
      try {
        for (;;) {
          const page = await fetchGridPage(state.filters, offset);
          if (!mountedRef.current || seq !== loadSeqRef.current) {
            return;
          }
          all.push(...page.items);
          // A full page may have more behind it; a short one is the end.
          if (page.items.length === GRID_PAGE_SIZE && all.length < GRID_ROW_CEILING) {
            offset += GRID_PAGE_SIZE;
            continue;
          }
          break;
        }
      } catch (error) {
        if (!mountedRef.current || seq !== loadSeqRef.current) {
          return;
        }
        setLoading(false);
        setHint("");
        const key = refusedFilterKey(error as ApiErrorLike);
        if (key) {
          toast.warn(messageContent(filterNotAvailableMessage(key), "Filter not available yet"));
          return;
        }
        showApiError(error);
        return;
      }
      setLoading(false);
      const loaded = all.map((row) => rowFromServer(row));
      commitRows(loaded);
      setServerProblemKeys(new Set());
      setHint(all.length === 0 ? "Nothing matches these filters." : "");
      // Items added by search stay on the grid across a reload.
      for (const itemId of Array.from(addedItemsRef.current)) {
        if (rowIndexOfItem(rowsRef.current, itemId) < 0) {
          addItem(itemId, "");
        }
      }
      if (loaded.length > 0) {
        setCurrent({ rowKey: loaded[0].key, column: "priceA" });
        focusLater(loaded[0].key, "priceA");
      } else {
        setCurrent({ rowKey: null, column: null });
      }
    },
    [addItem, commitRows, confirmDiscard, fetchGridPage, focusLater, setLoading],
  );

  /** F8: the filter popup. Apply & Load keeps the filter and loads it; Cancel changes nothing. */
  const openFilterDialog = useCallback(() => {
    if (loadingRef.current) {
      return;
    }
    setFilterOpen(true);
  }, []);

  const applyFilter = useCallback(
    (state: FilterState) => {
      setFilterOpen(false);
      setFilterState(state);
      void loadPrices(state);
    },
    [loadPrices],
  );

  // ------------------------------------------------------------- grid edits
  const onCellFocus = useCallback((rowKey: string | null, column: ColumnKey) => {
    setCurrent((previous) =>
      previous.rowKey === rowKey && previous.column === column ? previous : { rowKey, column },
    );
    const level = levelOfColumn(column);
    if (level >= 0) {
      setLastLevel(level);
    }
  }, []);

  /** A finished edit of one of a row's number cells (the delegate's setModelData). */
  const onCellCommit = useCallback(
    (rowKey: string, column: ColumnKey, text: string) => {
      if (loadingRef.current) {
        return;
      }
      const index = rowsRef.current.findIndex((row) => row.key === rowKey);
      if (index < 0) {
        return;
      }
      const row = rowsRef.current[index];
      const kind = editorKindOf(column);
      if (!kind) {
        return;
      }
      const value = parseAcceptable(kind, text);
      if (value === null || isSameFigure(cellNumber(row, column), value)) {
        return;
      }
      const next = [...rowsRef.current];
      next[index] = applyCellEdit(row, column, value);
      commitRows(next);
      setServerProblemKeys((keys) => {
        if (!keys.has(rowKey)) return keys;
        const copy = new Set(keys);
        copy.delete(rowKey);
        return copy;
      });
    },
    [commitRows],
  );

  const onCellRefused = useCallback((why: string) => {
    setHint(why);
  }, []);

  const onBarcodeCommit = useCallback(
    (text: string) => {
      if (loadingRef.current) {
        return;
      }
      void resolveBarcode(text);
    },
    [resolveBarcode],
  );

  /** The Item cell: the product's one item search (grid 71). */
  const openPicker = useCallback((initialQuery: string) => {
    setPicker({ initialQuery });
  }, []);

  /** Back to the cell the operator was on, once a dialog is dismissed. */
  const currentRef = useRef(current);
  currentRef.current = current;
  const refocusCurrent = useCallback(() => {
    const { rowKey, column } = currentRef.current;
    if (column) {
      focusLater(rowKey, column);
    }
  }, [focusLater]);

  const closePicker = useCallback(() => {
    setPicker(null);
    refocusCurrent();
  }, [refocusCurrent]);

  const closeFilterDialog = useCallback(() => {
    setFilterOpen(false);
    refocusCurrent();
  }, [refocusCurrent]);

  const closeBucketDialog = useCallback(() => {
    setBucketDialog(null);
    refocusCurrent();
  }, [refocusCurrent]);

  const onPickItem = useCallback(
    (itemId: string, itemName: string) => {
      setPicker(null);
      addItem(itemId, itemName);
    },
    [addItem],
  );

  /**
   * The violet card: one level of the current row, typed as any of its four
   * numbers. The row and level are the ones the typing STARTED on — leaving the
   * box by clicking another row must not land the figure there.
   */
  const onFourEdit = useCallback(
    (field: FourField, text: string, target: FourTarget) => {
      const index = target.rowKey ? rowsRef.current.findIndex((row) => row.key === target.rowKey) : -1;
      if (index < 0 || savingRef.current) {
        return;
      }
      const value = parseAcceptable(field === "markup" || field === "margin" ? "percent" : "amount", text);
      if (value === null) {
        return;
      }
      const result = applyFourEdit(rowsRef.current[index], target.level, field, value);
      if ("hint" in result) {
        setHint(result.hint);
        return;
      }
      const next = [...rowsRef.current];
      next[index] = result.row;
      commitRows(next);
      const key = next[index].key;
      setServerProblemKeys((keys) => {
        if (!keys.has(key)) return keys;
        const copy = new Set(keys);
        copy.delete(key);
        return copy;
      });
    },
    [commitRows],
  );
  const fourTarget = useMemo<FourTarget>(
    () => ({ rowKey: current.rowKey, level: currentLevel }),
    [current.rowKey, currentLevel],
  );

  // ------------------------------------------------------------- rows
  /** − on the grid: take the current row off. Nothing is deleted. */
  const removeCurrentRow = useCallback(async () => {
    const rowKey = current.rowKey;
    const index = rowKey ? rowsRef.current.findIndex((row) => row.key === rowKey) : -1;
    if (index < 0) {
      return;
    }
    const row = rowsRef.current[index];
    if (
      isChanged(row) &&
      !(await confirm({
        title: "Remove row",
        message: `Row ${index + 1} has unsaved changes. Take it off the grid? Nothing is deleted from the price table — its edits are just not saved.`,
        confirmLabel: "Yes",
        cancelLabel: "No",
      }))
    ) {
      return;
    }
    const at = rowsRef.current.findIndex((candidate) => candidate.key === row.key);
    if (at < 0) {
      return;
    }
    const next = rowsRef.current.filter((candidate) => candidate.key !== row.key);
    commitRows(next);
    if (rowIndexOfItem(next, row.itemId) < 0) {
      addedItemsRef.current.delete(row.itemId);
    }
    setServerProblemKeys(new Set());
    // The cursor stays at that line — on the row that moved up into it.
    const landing = next[at] ?? null;
    const column = current.column ?? "priceA";
    setCurrent({ rowKey: landing?.key ?? null, column });
    focusLater(landing?.key ?? null, landing ? column : "itemName");
  }, [commitRows, current.column, current.rowKey, focusLater]);

  /** + on the grid: the spare line's Barcode cell — scan there, or move to Item and type. */
  const goToSpareLine = useCallback(() => {
    setCurrent({ rowKey: null, column: "barcodeText" });
    focusLater(null, "barcodeText");
  }, [focusLater]);

  /** F7: empty the grid. */
  const clearGrid = useCallback(async () => {
    if (!(await confirmDiscard("Clear the grid"))) {
      return;
    }
    addedItemsRef.current.clear();
    commitRows([]);
    setServerProblemKeys(new Set());
    setCurrent({ rowKey: null, column: null });
  }, [commitRows, confirmDiscard]);

  // ------------------------------------------------------------- F12
  /** Every live price row of the current row's item, chain and branch. */
  const openBucketList = useCallback(async () => {
    const rowKey = current.rowKey;
    const row = rowKey ? rowsRef.current.find((candidate) => candidate.key === rowKey) : undefined;
    if (!row || !row.itemId) {
      setHint("F12 lists the buckets of the current row's item — pick a row first.");
      return;
    }
    let data: SellingPriceRow[];
    try {
      data = await fetchBuckets(row.itemId);
    } catch (error) {
      if (mountedRef.current) showApiError(error);
      return;
    }
    const still = rowsRef.current.find((candidate) => candidate.key === row.key);
    if (!mountedRef.current || !still || still.itemId !== row.itemId) {
      return;
    }
    setBucketDialog({
      rowKey: row.key,
      itemId: row.itemId,
      itemName: row.itemName,
      rows: data,
      selectedBucketId: still.bucketId,
    });
  }, [current.rowKey, fetchBuckets]);

  /** Picking in F12 loads the row into the grid line and resets its before-values. */
  const pickBucketRow = useCallback(
    async (picked: SellingPriceRow) => {
      const dialog = bucketDialog;
      setBucketDialog(null);
      if (!dialog) {
        return;
      }
      const index = rowsRef.current.findIndex((row) => row.key === dialog.rowKey);
      if (index < 0 || rowsRef.current[index].itemId !== dialog.itemId) {
        return;
      }
      if (
        isChanged(rowsRef.current[index]) &&
        !(await confirm({
          title: "Use this row",
          message: `Row ${index + 1} has unsaved changes. Loading the picked row replaces them.`,
          confirmLabel: "Yes",
          cancelLabel: "No",
        }))
      ) {
        return;
      }
      const at = rowsRef.current.findIndex((row) => row.key === dialog.rowKey);
      if (at < 0) {
        return;
      }
      const next = [...rowsRef.current];
      next[at] = rowFromServer(picked, next[at]);
      commitRows(next);
      setServerProblemKeys((keys) => {
        if (!keys.has(dialog.rowKey)) return keys;
        const copy = new Set(keys);
        copy.delete(dialog.rowKey);
        return copy;
      });
      const column = PRICE_KEYS[lastLevelRef.current];
      setCurrent({ rowKey: dialog.rowKey, column });
      focusLater(dialog.rowKey, column);
    },
    [bucketDialog, commitRows, focusLater],
  );

  // ------------------------------------------------------------- the switch
  const onScopeClick = useCallback(
    async (next: PriceScope) => {
      if (!isHq || next === scopeRef.current) {
        return;
      }
      const count = changedCount(rowsRef.current);
      if (
        count > 0 &&
        !(await confirm({
          title: "Switch scope",
          message: `${count} changed row(s) are waiting. Switching to ${
            next === "CHAIN" ? "All branches" : "This branch"
          } changes what Save does to them — which row each edit lands on. Continue?`,
          confirmLabel: "Yes",
          cancelLabel: "No",
        }))
      ) {
        return;
      }
      setScopeChoice(next);
    },
    [isHq],
  );

  // ------------------------------------------------------------- saving
  /**
   * After a save every row of the saved items is re-read, so each shows the
   * row that now wins. Rows of OTHER items keep their edits.
   */
  const refreshItemsAfterSave = useCallback(
    async (itemIds: readonly string[]) => {
      // All at once, each applied to the grid as it lands.
      await Promise.all(
        itemIds.map(async (itemId) => {
          try {
            const data = await fetchBuckets(itemId);
            if (!mountedRef.current) return;
            commitRows(refreshItemRows(rowsRef.current, itemId, data));
          } catch (error) {
            if (mountedRef.current) showApiError(error);
          }
        }),
      );
    },
    [commitRows, fetchBuckets],
  );

  /** 422 names "rows.<lineNo>"; 403 is a CHAIN save by a non-HQ user — shown as it comes. */
  const showServerRefusal = useCallback(
    (error: unknown, rowKeyByLine: Map<number, string>) => {
      const lines = refusedLineNumbers(error as ApiErrorLike);
      const keys = new Set<string>();
      for (const lineNo of lines) {
        const key = rowKeyByLine.get(lineNo) ?? rowsRef.current[lineNo - 1]?.key;
        if (key) keys.add(key);
      }
      setServerProblemKeys(keys);
      if (keys.size > 0) {
        const first = rowsRef.current.find((row) => keys.has(row.key));
        if (first) {
          const column = PRICE_KEYS[lastLevelRef.current];
          setCurrent({ rowKey: first.key, column });
          focusLater(first.key, column);
        }
      }
      showApiError(error);
    },
    [focusLater],
  );

  const postSave = useCallback(
    async (confirmed: boolean): Promise<void> => {
      const { companyId: company, branchId: branch, levelNames: names } = liveRef.current;
      const built = buildSavePayload(rowsRef.current, company, branch, scopeRef.current, confirmed);
      if (built.payload.rows.length === 0) {
        return;
      }
      setSaving(true);
      setHint("Saving…");
      let result;
      try {
        result = await saveRows(built.payload).unwrap();
      } catch (error) {
        if (!mountedRef.current) return;
        setSaving(false);
        setHint("");
        showServerRefusal(error, built.rowKeyByLine);
        return;
      }
      if (!mountedRef.current) {
        return;
      }
      setSaving(false);
      setHint("");
      if (result.needsConfirm) {
        // Below cost under "warning": nothing was written. Ask, and re-post
        // confirmed — the server re-runs every check.
        const rowAt = (lineNo: number) => {
          const key = built.rowKeyByLine.get(lineNo);
          return rowsRef.current.find((row) => row.key === key) ?? null;
        };
        setBelowCost({
          lines: belowCostLines(result, rowAt, names),
          policy: String(result.belowCostPolicy ?? ""),
        });
        return;
      }
      // Saved. Never a plain "Saved" when a row has no stock behind it.
      toast.info(messageContent(savedMessage(result, confirmed), "Change Selling Price"));
      setServerProblemKeys(new Set());
      await refreshItemsAfterSave(built.itemIds);
    },
    [refreshItemsAfterSave, saveRows, setSaving, showServerRefusal],
  );

  /** F5 / Ctrl+Enter — save the changed rows in one transaction. */
  const save = useCallback(() => {
    if (savingRef.current || loadingRef.current) {
      return;
    }
    // From inside an open cell (or the violet card): moving focus off it
    // commits the typed value before anything is sent.
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active.closest('[data-selling-price-grid="true"], [data-selling-price-commit="true"]')
    ) {
      active.blur();
    }
    // A frame later the commit has rendered, and the rows are what is sent.
    window.requestAnimationFrame(() => {
      if (!mountedRef.current || savingRef.current || loadingRef.current) {
        return;
      }
      const live = liveRef.current;
      const count = changedCount(rowsRef.current);
      const indices = new Set<number>();
      rowsRef.current.forEach((row, index) => {
        if (serverProblemKeysRef.current.has(row.key)) indices.add(index);
      });
      const strip = validateRows(rowsRef.current, live.levelNames, live.belowCostPolicy, indices);
      if (count === 0) {
        setHint("Nothing has changed — there is nothing to save.");
        return;
      }
      if (strip.blocked || !live.canSaveRight) {
        return;
      }
      void postSave(false);
    });
  }, [postSave]);

  const confirmBelowCost = useCallback(() => {
    setBelowCost(null);
    void postSave(true);
  }, [postSave]);

  const cancelBelowCost = useCallback(() => {
    setBelowCost(null);
    refocusCurrent();
  }, [refocusCurrent]);

  // ------------------------------------------------------------- close
  const close = useCallback(async () => {
    if (!(await confirmDiscard("Close"))) {
      return;
    }
    router.back();
  }, [confirmDiscard, router]);

  useEffect(() => {
    if (changed === 0) {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [changed]);

  // ------------------------------------------------------------- shortcuts
  const modalOpen = filterOpen || bucketDialog !== null || belowCost !== null || picker !== null;
  const shortcuts = { save, clearGrid, openFilterDialog, openBucketList, modalOpen };
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shortcutsRef.current.modalOpen || anyOverlayUp()) {
        // The screen's keys do nothing under a dialog — and F5 must not fall
        // through to the browser's reload either.
        if (event.key === "F5" || event.key === "F7" || event.key === "F8") {
          event.preventDefault();
        }
        return;
      }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        // Ctrl+Enter saves — Return and the keypad's Enter alike.
        event.preventDefault();
        shortcutsRef.current.save();
        return;
      }
      if (event.repeat) {
        return;
      }
      switch (event.key) {
        case "F5":
          event.preventDefault();
          shortcutsRef.current.save();
          break;
        case "F7":
          event.preventDefault();
          void shortcutsRef.current.clearGrid();
          break;
        case "F8":
          event.preventDefault();
          shortcutsRef.current.openFilterDialog();
          break;
        case "F12":
          event.preventDefault();
          void shortcutsRef.current.openBucketList();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return {
    // context
    companyId,
    branchId,
    levelNames,
    levelShorts,
    branchName,
    here,
    belowCostPolicy,
    // the switch
    scope,
    isHq,
    userType,
    onScopeClick,
    // header
    subtitle,
    changedChip,
    summary,
    // grid
    rows,
    current,
    currentIndex,
    serverProblemKeys,
    registerReveal,
    currentLevel,
    lastLevel,
    saving,
    loading,
    spareBarcode,
    setSpareBarcode,
    branchCell,
    onCellFocus,
    onCellCommit,
    onCellRefused,
    onBarcodeCommit,
    openPicker,
    goToSpareLine,
    removeCurrentRow,
    // panels
    validation,
    card,
    four,
    fourTarget,
    onFourEdit,
    hint,
    // buttons
    saveEnabled,
    saveTooltip,
    save,
    clearGrid,
    openFilterDialog,
    openBucketList,
    close,
    // dialogs
    filter,
    filterOpen,
    closeFilterDialog,
    applyFilter,
    bucketDialog,
    closeBucketDialog,
    pickBucketRow,
    belowCost,
    confirmBelowCost,
    cancelBelowCost,
    picker,
    closePicker,
    onPickItem,
  };
}

export type SellingPriceScreen = ReturnType<typeof useSellingPriceScreen>;
