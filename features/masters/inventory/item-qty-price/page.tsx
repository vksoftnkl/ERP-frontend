"use client";
/**
 * Item Qty wise Price — menu 244 (Qt ItemQtyPriceEntry, rewritten in 4ae6575 to
 * "the promotion page's layout", user 2026-10-22).
 *
 * One item at a time, picked by barcode or by name: its saved slabs load into
 * a short grid — Uom · From · To · Mode · Value — and the slab under the
 * cursor's scope and dates are edited in the panel under it. The item's
 * prices today and what the current slab makes of them read underneath. Save
 * posts the edited slabs in one batch and clears the screen for the next item.
 *
 * Opened from the Item Master list as `?itemId=&itemName=` (Qt `openItem`):
 * that item, ready to edit.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FiRotateCcw, FiSave, FiTrash2, FiX } from "react-icons/fi";
import { getMessages, toast } from "@/lib/notify";
import { confirm, getConfirmations } from "@/lib/confirm";
import { apiRefusalOf } from "@/lib/api/error-text";
import { cx } from "@/components/design-system/cx";
import { NexDropdownSingle, type DropdownSelection } from "@/components/design-system/dropdown";
import type { ERPDynamicSelectOption } from "@/components/design-system/ui";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { getUserInfo } from "@/lib/auth/session";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { notifyGlobalNavigationStart } from "@/lib/navigation/global-loader";
import {
  RESTORED_MESSAGE_OPTIONS,
  restoredMessage,
  screenMemory,
  type ScreenScope,
} from "@/lib/screen-memory";
import { useUiTableId } from "@/lib/ui-tables";
import {
  useForgetIfWritingOnUnmount,
  useRecalledOnce,
  useRememberWrite,
  type ScreenMemoryOption,
} from "@/lib/use-screen-memory";
import { useGetEffectiveSettingsQuery } from "@/store/api/appSettingsApi";
import {
  itemQtyPriceApi,
  useDeleteItemQtyPriceMutation,
  useGetItemQtyPriceColumnConfigQuery,
  useSaveItemQtyPricesMutation,
  ITEM_QTY_PRICE_UI_TABLE_KEY,
  type ItemQtyPriceMode,
  type ItemQtyPricePayload,
} from "@/store/api/itemQtyPriceApi";
import { lookupsApi } from "@/store/api/lookupsApi";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectUserInfo } from "@/store/slices/authSlice";
import {
  sellingPriceApi,
  useGetSellingPriceLevelNamesQuery,
} from "@/features/stocks/selling-price/selling-price.api";
import { BarcodeInputField } from "./barcode-input-field";
import { SLAB_GRID_CELLS, resolveSlabHeaders } from "./item-qty-price.columns";
import {
  PRICE_MODE_OPTIONS,
  type ItemQtyPriceRow,
  type SlabCell,
  type SlabGridCell,
} from "./item-qty-price.types";
import {
  buildSavePayload,
  createBlankRow,
  defaultPriceLevelOf,
  describeSlabPreview,
  describeTodayLine,
  DUPLICATE_SLAB_MESSAGE,
  ensureTrailingRow,
  findDuplicateSlab,
  findSlabProblem,
  hasUnit,
  headlinePricesByUnit,
  isQtyPriceWorkWorthRemembering,
  isTrailingRow,
  ITEM_QTY_PRICE_MEMORY_KEY,
  ITEM_QTY_PRICE_MENU_ID,
  localTodayIso,
  locateSlabRefusal,
  mapPayloadToRow,
  normalizeListPayload,
  parseItemQtyPriceDeepLink,
  priceLevelInfoById,
  type ItemQtyPriceSnapshot,
} from "./item-qty-price.utils";
import {
  SLAB_PANEL_FIELD_ID,
  SectionHeading,
  SlabPanel,
  type SlabDateField,
  type SlabFlagField,
  type SlabScopeField,
} from "./slab-panel";
import { UnitPickerCell } from "./unit-picker-cell";
import styles from "./item-qty-price.module.scss";

// The grid is scoped to exactly one item at a time — picked by barcode or by
// name — and every row belongs to it.
type ActiveItem = { id: string; label: string };
// Screen memory (lib/screen-memory). The route page always reopens on rows left
// here unsaved; an empty slot recalls nothing, so a fresh visit starts blank.
const SCREEN_MEMORY: ScreenMemoryOption = { key: ITEM_QTY_PRICE_MEMORY_KEY, resume: true };
// One page of an item's saved slabs; the list endpoint caps limit at 100.
const SAVED_ROWS_PAGE_LIMIT = 100;
// The item's price rows at this branch: a handful per unit, well under a page.
const PRICE_ROWS_LIMIT = 100;
const SCREEN_TITLE = "Item Qty wise Price";
const DUPLICATE_TITLE = "Qty wise Price";
const GRID_COLUMN_COUNT = SLAB_GRID_CELLS.length + 1; // # + the five slab cells

function scopePatch(field: SlabScopeField, id: string, name: string): Partial<ItemQtyPriceRow> {
  const label = id ? name : "";
  switch (field) {
    case "company":
      return { companyId: id, companyName: label };
    case "branch":
      return { branchId: id, branchName: label };
    case "party":
      return { partyId: id, partyName: label };
    case "priceLevel":
      return { priceLevel: id, priceLevelName: label };
  }
}

// The screen's keys do nothing under a message or a question.
function anyOverlayUp(): boolean {
  return getConfirmations().length > 0 || getMessages().length > 0;
}

function isGridCell(cell: SlabCell): cell is SlabGridCell {
  return (SLAB_GRID_CELLS as readonly string[]).includes(cell);
}

function isUnavailable(element: HTMLElement): boolean {
  return (
    (element as HTMLInputElement).disabled === true ||
    element.getAttribute("aria-disabled") === "true"
  );
}

function focusElement(element: HTMLElement) {
  element.focus();
  if (element instanceof HTMLInputElement && element.type !== "checkbox") {
    try {
      element.select();
    } catch {
      // Not every input type can select its text — focus is enough.
    }
  }
}

export default function ItemQtyPricePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  // The header's tenant: the slot unsaved rows are remembered in, and the
  // company + branch today's prices are read at. Prices are not kept per
  // accounting year, but a slot is, so the session's year completes it.
  const { selectedCompanyId, selectedBranchId, activeFiscalYear } = useBusinessContext();
  const accYear = (activeFiscalYear?.name ?? "").trim() || "*";
  const tenant = useMemo<ScreenScope>(
    () => ({ companyId: selectedCompanyId, branchId: selectedBranchId, accYear }),
    [accYear, selectedBranchId, selectedCompanyId],
  );
  // The rows the operator left here unsaved, read once; null for a fresh visit.
  const recalled = useRecalledOnce<ItemQtyPriceSnapshot>(SCREEN_MEMORY, tenant);
  const resumed = recalled !== null;
  const [activeItem, setActiveItem] = useState<ActiveItem | null>(recalled?.activeItem ?? null);
  const [rows, setRows] = useState<ItemQtyPriceRow[]>(() => recalled?.rows ?? []);
  // The slab the panel follows: the row the cursor was last in.
  const [currentLocalId, setCurrentLocalId] = useState<string | null>(
    recalled?.currentLocalId ?? null,
  );
  const [barcode, setBarcode] = useState(recalled?.barcode ?? "");
  const [unitOptionsByItemId, setUnitOptionsByItemId] = useState<
    Record<string, ERPDynamicSelectOption[]>
  >(() => recalled?.unitOptionsByItemId ?? {});
  const [isLoadingRows, setIsLoadingRows] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const barcodeRef = useRef<HTMLInputElement | null>(null);
  const gridRef = useRef<HTMLTableSectionElement | null>(null);
  // Bumped by every item load and reset: a load that finds it moved on was
  // overtaken (Qt: "the item changed mid-load") and drops its answer.
  const loadTokenRef = useRef(0);
  // Stamped onto the save payload as created_by/modified_by. Redux is the live
  // source; the session-storage copy covers a hard refresh where the store has
  // rehydrated auth but this render happens before the selector settles.
  const userInfo = useAppSelector(selectUserInfo);
  const actorName = userInfo?.userName ?? null;
  // Save needs Create or Edit on menu 244; Delete slab its Delete (Qt applyPermissions).
  const { permissions, isLoading: rightsLoading } = usePagePermissions({
    menuId: ITEM_QTY_PRICE_MENU_ID,
  });
  const canSave = !rightsLoading && (permissions.canCreate || permissions.canEdit);
  const canDelete = !rightsLoading && permissions.canDelete;

  const uiTableId = useUiTableId(ITEM_QTY_PRICE_UI_TABLE_KEY);
  const { data: columnConfig } = useGetItemQtyPriceColumnConfigQuery({ uiTableId });
  const headers = useMemo(() => resolveSlabHeaders(columnConfig), [columnConfig]);
  const itemDropdownId = useDropdownId("item");
  const [saveItemQtyPrices] = useSaveItemQtyPricesMutation();
  const [deleteItemQtyPrice] = useDeleteItemQtyPriceMutation();

  // ── The item's prices today (Qt fetchItemPrices): this branch's price rows
  // of the item, Change Selling Price's own list — per unit, its levels and
  // MRP — with the price levels' short names and the house default level.
  const { data: levelRows } = useGetSellingPriceLevelNamesQuery();
  const levels = useMemo(() => priceLevelInfoById(levelRows), [levelRows]);
  const { data: settingRows } = useGetEffectiveSettingsQuery(
    { companyId: selectedCompanyId, branchId: selectedBranchId },
    { skip: !selectedCompanyId },
  );
  const defaultLevel = useMemo(() => defaultPriceLevelOf(settingRows), [settingRows]);
  const { currentData: pricePage } = sellingPriceApi.useListSellingPriceRowsQuery(
    {
      companyId: selectedCompanyId,
      branchId: selectedBranchId,
      itemId: activeItem?.id ?? "",
      limit: PRICE_ROWS_LIMIT,
      offset: 0,
    },
    {
      skip: !activeItem || !selectedCompanyId || !selectedBranchId,
      refetchOnMountOrArgChange: true,
    },
  );
  const pricesByUnit = useMemo(() => headlinePricesByUnit(pricePage?.items), [pricePage]);

  const units = useMemo(
    () => (activeItem ? (unitOptionsByItemId[activeItem.id] ?? []) : []),
    [activeItem, unitOptionsByItemId],
  );
  const currentIndex = rows.findIndex((row) => row.localId === currentLocalId);
  const currentRow = currentIndex >= 0 ? rows[currentIndex] : null;
  // The panel edits a REAL slab only — the blank line waits for its unit.
  const panelRow = currentRow && hasUnit(currentRow) ? currentRow : null;
  const hasRealRows = rows.some(hasUnit);
  const hasUnsavedChanges = rows.some((row) => row.isDirty);
  // The current slab's unit, else the item's first, for the two lines.
  const previewUnitId = currentRow?.itemUnitId || units[0]?.value || "";
  const previewUnitName =
    units.find((unit) => unit.value === previewUnitId)?.label ?? currentRow?.unitLabel ?? "";
  const previewPrices = pricesByUnit[previewUnitId] ?? null;
  const todayLine = describeTodayLine({
    hasItem: Boolean(activeItem),
    prices: previewPrices,
    unitName: previewUnitName,
    levels,
  });
  const preview = describeSlabPreview({
    hasItem: Boolean(activeItem),
    row: panelRow,
    unitName: previewUnitName,
    prices: previewPrices,
    levels,
    defaultLevel,
  });

  // ── Screen memory: written through on every change, so the rows are there
  // when the operator comes back from another menu screen; let go once no row
  // holds an edit (saved, cleared, item switched) — and when the screen goes
  // while a save is still in flight, since it lands after and would come back
  // as unsaved.
  const savingRef = useRef(false);
  const memorySnapshot = useMemo<ItemQtyPriceSnapshot>(
    () => ({ tenant, activeItem, rows, currentLocalId, barcode, unitOptionsByItemId }),
    [activeItem, barcode, currentLocalId, rows, tenant, unitOptionsByItemId],
  );
  useRememberWrite(SCREEN_MEMORY, memorySnapshot, {
    scopeOf: (value) => value.tenant,
    shouldKeep: isQtyPriceWorkWorthRemembering,
  });
  useForgetIfWritingOnUnmount(
    SCREEN_MEMORY,
    () => savingRef.current,
    () => tenant,
  );
  // The rows follow the header, so a switch lets go of the slot they were
  // remembered under.
  const lastTenantRef = useRef(tenant);
  useEffect(() => {
    const previous = lastTenantRef.current;
    lastTenantRef.current = tenant;
    if (previous !== tenant) {
      screenMemory.forget(ITEM_QTY_PRICE_MEMORY_KEY, previous);
    }
  }, [tenant]);
  // Reopened on rows left here unsaved: they are already on the grid, so all
  // that is left is to say so — once, a tick after mount.
  useEffect(() => {
    if (!resumed) return undefined;
    const timer = window.setTimeout(() => {
      toast.info(restoredMessage("qty-wise price entry"), RESTORED_MESSAGE_OPTIONS);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [resumed]);

  // What the listeners and the async loads read — the latest render's.
  const latestRef = useRef({ rows, activeItem, hasUnsavedChanges, hasRealRows, tenant });
  useLayoutEffect(() => {
    latestRef.current = { rows, activeItem, hasUnsavedChanges, hasRealRows, tenant };
  });

  // ── Focus. A cell is focused after the render that shows it: the request
  // waits here until its element exists.
  const pendingFocusRef = useRef<{ localId: string; cell: SlabCell } | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const requestFocus = useCallback((localId: string, cell: SlabCell) => {
    pendingFocusRef.current = { localId, cell };
    setFocusRequest((count) => count + 1);
  }, []);
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    const element = isGridCell(pending.cell)
      ? gridRef.current?.querySelector<HTMLElement>(
          `[data-iqp-row="${CSS.escape(pending.localId)}"][data-iqp-cell="${pending.cell}"]`,
        )
      : document.getElementById(SLAB_PANEL_FIELD_ID[pending.cell]);
    if (!element) return;
    pendingFocusRef.current = null;
    focusElement(element);
  }, [focusRequest, rows, currentLocalId, isLoadingRows]);
  const focusBarcodeSoon = useCallback(() => {
    window.setTimeout(() => barcodeRef.current?.focus(), 0);
  }, []);
  // First focus (Qt showEvent): the barcode box — or the grid when the screen
  // reopened on an item.
  useEffect(() => {
    const { activeItem: item, rows: openRows } = latestRef.current;
    if (!item) {
      focusBarcodeSoon();
      return;
    }
    const target =
      openRows.find((row) => row.localId === recalled?.currentLocalId) ?? openRows[openRows.length - 1];
    if (target) requestFocus(target.localId, "unit");
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Loading an item ────────────────────────────────────────────────────────
  // Through the store, not a lazy trigger: the deep link loads from a mount
  // effect, where a lazy trigger has no subscription and resolves undefined.
  const loadUnitsForItem = useCallback(
    async (itemId: string): Promise<ERPDynamicSelectOption[]> => {
      try {
        const options = await dispatch(
          lookupsApi.endpoints.getUnitsByItem.initiate({ itemId }, { subscribe: false }),
        ).unwrap();
        setUnitOptionsByItemId((current) => ({ ...current, [itemId]: options }));
        return options;
      } catch (error) {
        toast.apiError(error, { fallback: "Couldn't load this item's units." });
        setUnitOptionsByItemId((current) => ({ ...current, [itemId]: [] }));
        return [];
      }
    },
    [dispatch],
  );
  // The GET is paged (at most 100 a page). An item with more slabs than one
  // page would otherwise load truncated, and its overlaps go unchecked here.
  const loadSavedRowsForItem = useCallback(
    async (itemId: string): Promise<ItemQtyPriceRow[]> => {
      const saved: ItemQtyPricePayload[] = [];
      try {
        for (let page = 1; ; page += 1) {
          const response = await dispatch(
            itemQtyPriceApi.endpoints.listItemQtyPrices.initiate(
              { iqp_item_id: itemId, page, limit: SAVED_ROWS_PAGE_LIMIT },
              { subscribe: false, forceRefetch: true },
            ),
          ).unwrap();
          const pageRows = normalizeListPayload(response.data);
          saved.push(...pageRows);
          const totalPages = Number(response.meta?.total_pages) || 1;
          if (pageRows.length < SAVED_ROWS_PAGE_LIMIT || page >= totalPages) break;
        }
      } catch (error) {
        // No rows yet for this item is a normal state, not an error to surface.
        if ((error as { status?: unknown } | null)?.status !== 404) {
          toast.apiError(error, { fallback: "Couldn't load this item's saved slabs." });
        }
      }
      return saved.map(mapPayloadToRow);
    },
    [dispatch],
  );
  const loadItem = useCallback(
    async (item: ActiveItem) => {
      loadTokenRef.current += 1;
      const token = loadTokenRef.current;
      setActiveItem(item);
      setRows([]);
      setCurrentLocalId(null);
      setIsLoadingRows(true);
      const [, savedRows] = await Promise.all([
        loadUnitsForItem(item.id),
        loadSavedRowsForItem(item.id),
      ]);
      if (loadTokenRef.current !== token) return;
      // A deep link may come without a name: the saved slabs carry it.
      const label = item.label || savedRows[0]?.itemLabel || "";
      const loaded = { id: item.id, label };
      if (label !== item.label) setActiveItem(loaded);
      const blankRow = createBlankRow(loaded);
      setRows([...savedRows, blankRow]);
      // As Qt's populateGrid: the cursor on the blank line's Uom, in the grid.
      setCurrentLocalId(blankRow.localId);
      setIsLoadingRows(false);
      requestFocus(blankRow.localId, "unit");
    },
    [loadSavedRowsForItem, loadUnitsForItem, requestFocus],
  );
  // Switching items throws away whatever is in the grid, so confirm first when
  // it holds unsaved edits (Qt reloads without asking; the web screen asks).
  const applyItemSelection = useCallback(
    async (itemId: string, itemLabel: string, options: { clearBarcode?: boolean } = {}) => {
      const { activeItem: item, hasUnsavedChanges: unsaved, rows: openRows } = latestRef.current;
      if (!itemId) return;
      // The item already on screen: its grid stays as it is, edits and all.
      if (itemId === item?.id) {
        if (options.clearBarcode) setBarcode("");
        const blankLine = openRows[openRows.length - 1];
        if (blankLine) requestFocus(blankLine.localId, "unit");
        return;
      }
      if (
        unsaved &&
        !(await confirm({
          title: "Switch to another item?",
          message: "This grid has unsaved slabs. Loading another item's prices will discard them.",
          confirmLabel: "Switch Item",
          iconVariant: "replace",
        }))
      ) {
        return;
      }
      if (options.clearBarcode) setBarcode("");
      await loadItem({ id: itemId, label: itemLabel });
    },
    [loadItem, requestFocus],
  );
  // A name pick empties the barcode box; a scan keeps its code there.
  function handleItemPicked(selection: DropdownSelection | null) {
    if (!selection?.id) return;
    void applyItemSelection(selection.id, selection.text, { clearBarcode: true });
  }
  function handleBarcodeResolved(itemId: string, itemName: string) {
    void applyItemSelection(itemId, itemName);
  }

  // ── Deep link: `?itemId=&itemName=` from the Item Master list (Qt openItem).
  // Read through useSearchParams — on a client navigation the URL is pushed
  // after the first render, so window.location would still be the old one. A
  // remembered grid of the SAME item is kept; one of another item asks first,
  // as any switch does. The hand-over is consumed once and taken off the URL,
  // so a reload or Back lands on a plain screen.
  const deepLink = parseItemQtyPriceDeepLink(searchParams);
  const deepLinkItemId = deepLink?.itemId ?? "";
  const deepLinkItemName = deepLink?.itemName ?? "";
  const consumedDeepLinkRef = useRef("");
  useEffect(() => {
    if (!deepLinkItemId) {
      consumedDeepLinkRef.current = "";
      return undefined;
    }
    if (consumedDeepLinkRef.current === deepLinkItemId) return undefined;
    // A tick late, so StrictMode's simulated remount does not load it twice.
    const timer = window.setTimeout(() => {
      consumedDeepLinkRef.current = deepLinkItemId;
      void applyItemSelection(deepLinkItemId, deepLinkItemName, { clearBarcode: true });
      router.replace(pathname);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [applyItemSelection, deepLinkItemId, deepLinkItemName, pathname, router]);

  // ── Editing the grid ───────────────────────────────────────────────────────
  function patchRow(localId: string, patch: Partial<ItemQtyPriceRow>) {
    setRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, ...patch, isDirty: true } : row)),
    );
  }
  // A unit picked from the menu. The same (scope, unit, qty) twice is refused
  // and the unit stays as it was; a pick on the blank line opens the next one.
  // Either way the cursor goes on along the row (Qt advanceAfterPopupPick).
  function handleUnitPick(localId: string, unitId: string, unitLabel: string) {
    const index = rows.findIndex((row) => row.localId === localId);
    if (index < 0) return;
    if (unitId !== rows[index].itemUnitId) {
      const next = rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, itemUnitId: unitId, unitLabel, isDirty: true } : row,
      );
      if (findDuplicateSlab(next, index) >= 0) {
        toast.info(DUPLICATE_SLAB_MESSAGE, { title: DUPLICATE_TITLE });
        return;
      }
      setRows(ensureTrailingRow(next, activeItem));
    }
    setCurrentLocalId(localId);
    requestFocus(localId, "fromQty");
  }
  // From / To are judged once typed (Qt: after the editor commits): a clash
  // with another slab empties the field that made it.
  function handleQtyCommit(localId: string, field: "fromQty" | "toQty") {
    const index = rows.findIndex((row) => row.localId === localId);
    if (index < 0 || findDuplicateSlab(rows, index) < 0) return;
    patchRow(localId, field === "fromQty" ? { fromQty: "" } : { toQty: "" });
    toast.info(DUPLICATE_SLAB_MESSAGE, { title: DUPLICATE_TITLE });
  }
  function handleScopePick(field: SlabScopeField, id: string, name: string) {
    if (!panelRow) return;
    const index = rows.findIndex((row) => row.localId === panelRow.localId);
    const next = rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, ...scopePatch(field, id, name), isDirty: true } : row,
    );
    if (findDuplicateSlab(next, index) >= 0) {
      toast.info(DUPLICATE_SLAB_MESSAGE, { title: DUPLICATE_TITLE });
      return;
    }
    setRows(next);
  }
  function handleDateChange(field: SlabDateField, value: string) {
    if (!panelRow) return;
    patchRow(panelRow.localId, field === "effectiveFrom" ? { effectiveFrom: value } : { effectiveTo: value });
  }
  function handleFlagChange(field: SlabFlagField, checked: boolean) {
    if (!panelRow) return;
    patchRow(panelRow.localId, field === "isActive" ? { isActive: checked } : { isTaxIncl: checked });
  }
  function handleNoUnits() {
    toast.info("Add the item's units in Unit Conversion first.", { title: "Unit" });
  }

  // Enter walks the slab: Uom → From → To → Mode → Value → next slab. A cell
  // that is not open yet (Mode/Value before the unit) is stepped over.
  function moveOnFrom(localId: string, cell: SlabGridCell) {
    let rowIndex = rows.findIndex((row) => row.localId === localId);
    let cellIndex = SLAB_GRID_CELLS.indexOf(cell);
    if (rowIndex < 0 || cellIndex < 0) return;
    for (let step = 0; step < SLAB_GRID_CELLS.length * 2; step += 1) {
      cellIndex += 1;
      if (cellIndex >= SLAB_GRID_CELLS.length) {
        cellIndex = 0;
        rowIndex += 1;
      }
      const row = rows[rowIndex];
      if (!row) return;
      const element = gridRef.current?.querySelector<HTMLElement>(
        `[data-iqp-row="${CSS.escape(row.localId)}"][data-iqp-cell="${SLAB_GRID_CELLS[cellIndex]}"]`,
      );
      if (element && !isUnavailable(element)) {
        focusElement(element);
        return;
      }
    }
  }
  // "+" goes to the blank line's Uom (Qt lineCreateRequested).
  function focusBlankLine() {
    const lastRow = rows[rows.length - 1];
    if (lastRow && !hasUnit(lastRow)) {
      setCurrentLocalId(lastRow.localId);
      requestFocus(lastRow.localId, "unit");
    }
  }
  function handleGridKeyDown(event: ReactKeyboardEvent<HTMLTableSectionElement>) {
    // The Uom menu has had it.
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    const localId = target.dataset.iqpRow;
    const cell = target.dataset.iqpCell as SlabGridCell | undefined;
    if (!localId || !cell) return;
    const plain = !event.ctrlKey && !event.altKey && !event.metaKey;
    if (event.key === "Enter" && plain && !event.shiftKey) {
      event.preventDefault();
      moveOnFrom(localId, cell);
    } else if (event.key === "+" && plain) {
      event.preventDefault();
      focusBlankLine();
    } else if (event.key === "-" && plain) {
      event.preventDefault();
      void deleteRow(localId);
    }
  }

  // ── Delete slab (button, or − on the grid) ────────────────────────────────
  // Confirmed for any real row. A never-saved one just leaves the grid; a
  // saved one is (soft) deleted on the server first. The blank line is never
  // a row to delete.
  async function deleteRow(localId: string | null) {
    if (!localId || !canDelete) return;
    const row = rows.find((candidate) => candidate.localId === localId);
    if (!row || isTrailingRow(rows, localId)) return;
    const confirmed = await confirm({
      title: "Delete Row",
      message: "This cannot be undone. Delete this pricing row?",
      confirmLabel: "Delete",
    });
    if (!confirmed) return;
    if (row.iqpId) {
      try {
        await deleteItemQtyPrice(row.iqpId).unwrap();
      } catch (error) {
        toast.apiError(error, { refusedTitle: "Cannot delete" });
        return;
      }
    }
    // Re-found after the round trip rather than trusting the index from before.
    const current = latestRef.current.rows;
    const index = current.findIndex((candidate) => candidate.localId === localId);
    if (index < 0) return;
    const next = ensureTrailingRow(
      current.filter((candidate) => candidate.localId !== localId),
      latestRef.current.activeItem,
    );
    const neighbour = next[Math.min(index, next.length - 1)];
    setRows(next);
    setCurrentLocalId(neighbour?.localId ?? null);
    if (neighbour) requestFocus(neighbour.localId, "unit");
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  // Rule: a successful save resets the screen (item picker included) rather
  // than reloading the same item — the operator moves on to the next item.
  const resetScreen = useCallback(() => {
    loadTokenRef.current += 1;
    setActiveItem(null);
    setRows([]);
    setCurrentLocalId(null);
    setBarcode("");
    setIsLoadingRows(false);
    focusBarcodeSoon();
  }, [focusBarcodeSoon]);
  function putCursorOn(localId: string, cell: SlabCell | null) {
    setCurrentLocalId(localId);
    if (cell) requestFocus(localId, cell);
  }
  async function handleSave() {
    if (!canSave || isSaving) return;
    if (!activeItem) {
      toast.warn("Pick an item first.", { title: SCREEN_TITLE });
      return;
    }
    const today = localTodayIso();
    const problem = findSlabProblem(
      rows,
      units.map((unit) => unit.value),
      today,
    );
    if (problem) {
      if (problem.localId) putCursorOn(problem.localId, problem.cell);
      toast.info(problem.message, { title: "Validation" });
      return;
    }
    // The edited slabs go; the server judges overlaps against every live slab
    // of the item after the whole batch is written, so a ladder re-cut in one
    // save passes.
    const sending = rows.filter((row) => row.isDirty && hasUnit(row));
    if (sending.length === 0) {
      toast.info("Nothing to save.", { title: SCREEN_TITLE });
      return;
    }
    const savedByUser = actorName ?? getUserInfo()?.userName ?? null;
    const payload = sending.map((row) => buildSavePayload(row, savedByUser, today));
    setIsSaving(true);
    savingRef.current = true;
    try {
      await saveItemQtyPrices(payload).unwrap();
      // Saved: the remembered rows go now, not on the reset's commit — the
      // screen may be gone by then.
      screenMemory.forget(ITEM_QTY_PRICE_MEMORY_KEY, tenant);
      toast.success("Saved successfully.", { title: SCREEN_TITLE });
      resetScreen();
    } catch (error) {
      // An overlap names its batch row (`<i>.iqp_from_qty`), a DTO refusal
      // `items.<i>.<field>`, a per-row check the field alone.
      const { index, cell } = locateSlabRefusal(apiRefusalOf(error).field, sending.length);
      const refused = index !== null ? sending[index] : null;
      if (refused) putCursorOn(refused.localId, cell);
      toast.apiError(error);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }
  async function handleClear() {
    if (isSaving) return;
    const confirmed = await confirm({
      title: "Clear",
      message: "Clear all entered data?",
      confirmLabel: "Clear",
      iconVariant: "replace",
    });
    if (confirmed) resetScreen();
  }
  // Goes through the patched router, so Close asks exactly as any other way
  // back does.
  function handleClose() {
    router.back();
  }

  // ── Leaving ────────────────────────────────────────────────────────────────
  const allowUnsafeNavigationRef = useRef(false);
  const allowUnsafeNavigationTimeoutRef = useRef<number | null>(null);
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
  useEffect(() => {
    return () => {
      if (allowUnsafeNavigationTimeoutRef.current !== null) {
        window.clearTimeout(allowUnsafeNavigationTimeoutRef.current);
      }
    };
  }, []);
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!latestRef.current.hasUnsavedChanges || allowUnsafeNavigationRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);
  // Close goes back, and leaves the screen for good: with slabs on the grid it
  // asks first (Qt closeEvent), and a confirmed close discards them. A trip to
  // another menu screen (push, replace, an in-app link) does not ask — screen
  // memory keeps the rows and the screen reopens on them.
  useEffect(() => {
    const mutableRouter = router as typeof router & { back: typeof router.back };
    const originalBack = router.back;
    mutableRouter.back = (() => {
      if (allowUnsafeNavigationRef.current || !latestRef.current.hasRealRows) {
        originalBack.call(router);
        return;
      }
      void confirm({
        title: "Confirm Close",
        message: "This item's pricing hasn't been saved. Close anyway?",
        confirmLabel: "Close",
        cancelLabel: "Stay",
        iconVariant: "replace",
      }).then((confirmed) => {
        if (!confirmed) return;
        enableUnsafeNavigationBypass();
        screenMemory.forget(ITEM_QTY_PRICE_MEMORY_KEY, latestRef.current.tenant);
        originalBack.call(router);
      });
    }) as typeof router.back;
    return () => {
      mutableRouter.back = originalBack;
    };
  }, [enableUnsafeNavigationBypass, router]);
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
        !latestRef.current.hasUnsavedChanges
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const currentUrl = new URL(window.location.href);
      const nextUrl = new URL(anchor.href, currentUrl);
      if (nextUrl.href === currentUrl.href) return;
      // An in-app link keeps the rows in screen memory (and a full page load
      // still meets the beforeunload prompt); only leaving the app asks here.
      if (nextUrl.origin === currentUrl.origin) return;
      event.preventDefault();
      void confirm({
        title: "Leave Item Qty Wise Price?",
        message: "Unsaved changes will be lost if you leave this page.",
        confirmLabel: "Leave Page",
        cancelLabel: "Stay Here",
      }).then((confirmed) => {
        if (!confirmed) return;
        enableUnsafeNavigationBypass();
        screenMemory.forget(ITEM_QTY_PRICE_MEMORY_KEY, latestRef.current.tenant);
        notifyGlobalNavigationStart();
        window.location.assign(nextUrl.href);
      });
    };
    document.addEventListener("click", handleDocumentClickCapture, true);
    return () => document.removeEventListener("click", handleDocumentClickCapture, true);
  }, [enableUnsafeNavigationBypass]);

  // ── Keys: F5 / Ctrl+Enter save, F7 clears, Esc closes (Ctrl+S also saves).
  // Kept on a ref so the listener calls the current handlers without
  // rebinding every render.
  const shortcutsRef = useRef({ save: handleSave, clear: handleClear, close: handleClose });
  useLayoutEffect(() => {
    shortcutsRef.current = { save: handleSave, clear: handleClear, close: handleClose };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (anyOverlayUp()) {
        // F5 must not fall through to the browser's reload under a dialog.
        if (event.key === "F5" || event.key === "F7") event.preventDefault();
        return;
      }
      const shortcuts = shortcutsRef.current;
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void shortcuts.save();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void shortcuts.save();
        return;
      }
      if (event.repeat) return;
      if (event.key === "F5") {
        event.preventDefault();
        void shortcuts.save();
      } else if (event.key === "F7") {
        event.preventDefault();
        void shortcuts.clear();
      } else if (event.key === "Escape" && !event.defaultPrevented) {
        // A list or menu that closed on this Esc has already claimed it.
        event.preventDefault();
        shortcuts.close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // No button takes the focus (user, 2026-10-22): not on open, not by Tab,
  // not by a click. Each has its key.
  const keepFocus = (event: ReactMouseEvent) => event.preventDefault();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Qty-wise Price</h1>
        <p className={styles.subtitle}>Price breaks by quantity — buy more, pay less per unit.</p>
      </header>
      <div className={styles.body}>
        <SectionHeading>Item</SectionHeading>
        <div className={styles.itemGrid}>
          <label className={styles.fieldLabel} htmlFor="iqp-barcode">
            Barcode
          </label>
          <BarcodeInputField
            ref={barcodeRef}
            value={barcode}
            onChange={setBarcode}
            companyId={selectedCompanyId}
            onResolved={handleBarcodeResolved}
          />
          <label className={styles.fieldLabel} htmlFor="iqp-item">
            Item
          </label>
          <NexDropdownSingle
            id="iqp-item"
            dropdownId={itemDropdownId}
            value={activeItem ? { id: activeItem.id, text: activeItem.label } : null}
            onChange={handleItemPicked}
            advanceFocusOnSelect={false}
            placeholder="Search an item"
            aria-label="Item"
            className={styles.dropdown}
          />
          <p className={styles.todayLine}>{todayLine}</p>
        </div>
        <SectionHeading aside="+ adds a slab · − removes it · Uom: Enter or a letter picks">
          Quantity slabs
        </SectionHeading>
        <div className={styles.gridViewport}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th className={styles.cellIndex}>#</th>
                {SLAB_GRID_CELLS.map((cell) => (
                  <th key={cell}>{headers[cell]}</th>
                ))}
              </tr>
            </thead>
            <tbody ref={gridRef} onKeyDown={handleGridKeyDown}>
              {isLoadingRows ? (
                <tr>
                  <td colSpan={GRID_COLUMN_COUNT} className={styles.emptyState}>
                    Loading saved slabs…
                  </td>
                </tr>
              ) : !activeItem ? (
                <tr>
                  <td colSpan={GRID_COLUMN_COUNT} className={styles.emptyState}>
                    Scan a barcode or pick an item above to load its quantity slabs.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => {
                  const real = hasUnit(row);
                  return (
                    <tr
                      key={row.localId}
                      className={cx(
                        row.localId === currentLocalId && styles.rowCurrent,
                        row.isDirty && styles.rowDirty,
                      )}
                      onFocusCapture={() => setCurrentLocalId(row.localId)}
                      onMouseDown={() => setCurrentLocalId(row.localId)}
                    >
                      <td className={styles.cellIndex}>{index + 1}</td>
                      <td className={styles.unitTd}>
                        <UnitPickerCell
                          rowId={row.localId}
                          unitId={row.itemUnitId}
                          unitLabel={row.unitLabel}
                          units={units}
                          onPick={(unitId, unitLabel) => handleUnitPick(row.localId, unitId, unitLabel)}
                          onNoUnits={handleNoUnits}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          aria-label={headers.fromQty}
                          data-iqp-row={row.localId}
                          data-iqp-cell="fromQty"
                          className={styles.cellInput}
                          value={row.fromQty}
                          onChange={(event) => patchRow(row.localId, { fromQty: event.target.value })}
                          onBlur={() => handleQtyCommit(row.localId, "fromQty")}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          aria-label={headers.toQty}
                          placeholder={real ? "& above" : undefined}
                          data-iqp-row={row.localId}
                          data-iqp-cell="toQty"
                          className={styles.cellInput}
                          value={row.toQty}
                          onChange={(event) => patchRow(row.localId, { toQty: event.target.value })}
                          onBlur={() => handleQtyCommit(row.localId, "toQty")}
                        />
                      </td>
                      <td>
                        <select
                          aria-label={headers.mode}
                          data-iqp-row={row.localId}
                          data-iqp-cell="mode"
                          className={styles.cellSelect}
                          disabled={!real}
                          value={row.priceMode}
                          onChange={(event) =>
                            patchRow(row.localId, { priceMode: event.target.value as ItemQtyPriceMode })
                          }
                        >
                          {PRICE_MODE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {/* A figure means nothing until the slab has its unit and mode. */}
                        <input
                          type="number"
                          min={0}
                          max={row.priceMode === "P" ? 100 : undefined}
                          step="any"
                          inputMode="decimal"
                          aria-label={headers.value}
                          data-iqp-row={row.localId}
                          data-iqp-cell="value"
                          className={styles.cellInput}
                          disabled={!real}
                          value={row.value}
                          onChange={(event) => patchRow(row.localId, { value: event.target.value })}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <SlabPanel
          row={panelRow}
          rowNumber={panelRow ? currentIndex + 1 : null}
          onScope={handleScopePick}
          onDate={handleDateChange}
          onFlag={handleFlagChange}
        />
        <div className={styles.preview} aria-live="polite">
          {preview.kind === "hint" ? (
            preview.text
          ) : (
            <>
              {preview.lead}
              {preview.each ? (
                <>
                  {" → "}
                  <b>{preview.each} each</b>
                </>
              ) : null}
              {preview.today ? ` (today ${preview.today})` : null}
              {preview.dearer ? <span className={styles.dearer}> — dearer than today</span> : null}
              {preview.inactive ? (
                <>
                  {" · "}
                  <i>inactive</i>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
      <footer className={styles.footer}>
        <button
          type="button"
          tabIndex={-1}
          className={styles.buttonDanger}
          title="− (minus) on the grid — delete the current slab."
          disabled={!canDelete}
          onMouseDown={keepFocus}
          onClick={() => void deleteRow(currentLocalId)}
        >
          <FiTrash2 /> Delete slab
        </button>
        <span className={styles.footerSpacer} />
        <button
          type="button"
          tabIndex={-1}
          className={styles.buttonSecondary}
          title="F7 — start again with another item."
          disabled={isSaving}
          onMouseDown={keepFocus}
          onClick={() => void handleClear()}
        >
          <FiRotateCcw /> Clear
        </button>
        <button
          type="button"
          tabIndex={-1}
          className={styles.buttonPrimary}
          title="F5 / Ctrl+Enter — save this item's slabs."
          disabled={!canSave || isSaving}
          onMouseDown={keepFocus}
          onClick={() => void handleSave()}
        >
          <FiSave /> {isSaving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          tabIndex={-1}
          className={styles.buttonSecondary}
          title="Esc — close."
          onMouseDown={keepFocus}
          onClick={handleClose}
        >
          <FiX /> Close
        </button>
      </footer>
    </div>
  );
}
