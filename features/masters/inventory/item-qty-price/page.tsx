"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FiPlus, FiRotateCcw, FiSave, FiTrash2, FiX } from "react-icons/fi";
import { toast } from "react-toastify";
import type { ERPDynamicSelectOption } from "@/components/design-system/ui";
import { SearchableSelect } from "@/components/design-system/ui/searchable-select";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import { notifyGlobalNavigationStart } from "@/lib/navigation/global-loader";
import { getUserInfo } from "@/lib/auth/session";
import { useAppSelector } from "@/store/hooks";
import { selectUserInfo } from "@/store/slices/authSlice";
import {
  useGetBranchOptionsQuery,
  useGetCompanyOptionsQuery,
  useGetCustomerOptionsQuery,
  useGetPriceLevelOptionsQuery,
  useLazyGetUnitsByItemQuery,
} from "@/store/api/lookupsApi";
import {
  useDeleteItemQtyPriceMutation,
  useGetItemQtyPriceColumnConfigQuery,
  useLazyListItemQtyPricesQuery,
  useSaveItemQtyPricesMutation,
  ITEM_QTY_PRICE_UI_TABLE_ID,
  type ItemQtyPriceMode,
  type SaveItemQtyPriceDto,
} from "@/store/api/itemQtyPriceApi";
import { extractApiErrorMessage } from "@/lib/api/client";
import { BarcodeInputField } from "./barcode-input-field";
import { ItemSearchCell } from "./item-search-cell";
import {
  DEFAULT_DYNAMIC_COLUMNS,
  resolveConfiguredColumns,
  type DynamicColumnKey,
} from "./item-qty-price.columns";
import { PRICE_MODE_OPTIONS, type ItemQtyPriceRow } from "./item-qty-price.types";
import {
  applyPriceModeChange,
  buildRowUniquenessKey,
  buildSavePayload,
  createBlankRow,
  describeRowScope,
  isFilledRow,
  mapPayloadToRow,
  normalizeListPayload,
  validateRow,
} from "./item-qty-price.utils";
import styles from "./item-qty-price.module.scss";
// The grid is scoped to exactly one item at a time — picked by barcode or by
// name — and every row belongs to it.
type ActiveItem = { id: string; label: string };
// One page of an item's saved slabs; the list endpoint caps limit at 100.
const SAVED_ROWS_PAGE_LIMIT = 100;
type CellRenderCtx = {
  updateRow: (localId: string, patch: Partial<ItemQtyPriceRow>) => void;
  onUnitSelect: (row: ItemQtyPriceRow, unitId: string, unitLabel: string) => void;
  companyOptions: ERPDynamicSelectOption[];
  branchOptions: ERPDynamicSelectOption[];
  partyOptions: ERPDynamicSelectOption[];
  priceLevelOptions: ERPDynamicSelectOption[];
  unitOptions: ERPDynamicSelectOption[];
};
const DYNAMIC_CELL_CLASS_NAME: Record<DynamicColumnKey, string> = {
  company: styles.selectCell,
  branch: styles.selectCell,
  party: styles.selectCell,
  priceLevel: styles.selectCell,
  unit: styles.selectCell,
  fromQty: styles.numberCell,
  toQty: styles.numberCell,
  priceMode: styles.smallSelectCell,
  discPct: styles.numberCell,
  flatOff: styles.numberCell,
  price: styles.numberCell,
  effectiveFrom: styles.dateCell,
  effectiveTo: styles.dateCell,
  isActive: "",
  isTaxIncl: "",
};
function renderDynamicCell(key: DynamicColumnKey, row: ItemQtyPriceRow, ctx: CellRenderCtx): ReactNode {
  switch (key) {
    case "company":
      return (
        <SearchableSelect
          value={row.companyId}
          options={ctx.companyOptions}
          placeholder="None"
          onChange={(value) => ctx.updateRow(row.localId, { companyId: value })}
        />
      );
    case "branch":
      return (
        <SearchableSelect
          value={row.branchId}
          options={ctx.branchOptions}
          placeholder="None"
          onChange={(value) => ctx.updateRow(row.localId, { branchId: value })}
        />
      );
    case "party":
      return (
        <SearchableSelect
          value={row.partyId}
          options={ctx.partyOptions}
          placeholder="None"
          onChange={(value) => ctx.updateRow(row.localId, { partyId: value })}
        />
      );
    case "priceLevel":
      return (
        <SearchableSelect
          value={row.priceLevel}
          options={ctx.priceLevelOptions}
          placeholder="None"
          onChange={(value) => ctx.updateRow(row.localId, { priceLevel: value })}
        />
      );
    case "unit":
      return (
        <SearchableSelect
          value={row.itemUnitId}
          options={ctx.unitOptions}
          disabled={!row.itemId}
          placeholder={row.itemId ? "Select unit" : "Select item first"}
          onChange={(unitId) =>
            ctx.onUnitSelect(
              row,
              unitId,
              ctx.unitOptions.find((option) => option.value === unitId)?.label ?? "",
            )
          }
        />
      );
    case "fromQty":
      return (
        <input
          type="number"
          min={0}
          step="0.001"
          className={styles.cellInput}
          value={row.fromQty}
          onChange={(event) => ctx.updateRow(row.localId, { fromQty: event.target.value })}
        />
      );
    case "toQty":
      return (
        <input
          type="number"
          min={0}
          step="0.001"
          placeholder="& above"
          className={styles.cellInput}
          value={row.toQty}
          onChange={(event) => ctx.updateRow(row.localId, { toQty: event.target.value })}
        />
      );
    case "priceMode":
      return (
        <select
          className={styles.cellSelect}
          value={row.priceMode}
          onChange={(event) =>
            ctx.updateRow(
              row.localId,
              applyPriceModeChange(row, event.target.value as ItemQtyPriceMode),
            )
          }
        >
          {PRICE_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    case "discPct":
      return (
        <input
          type="number"
          min={0}
          step="0.01"
          className={styles.cellInput}
          disabled={row.priceMode !== "P"}
          value={row.discPct}
          onChange={(event) => ctx.updateRow(row.localId, { discPct: event.target.value })}
        />
      );
    case "flatOff":
      return (
        <input
          type="number"
          min={0}
          step="0.01"
          className={styles.cellInput}
          disabled={row.priceMode !== "R"}
          value={row.flatOff}
          onChange={(event) => ctx.updateRow(row.localId, { flatOff: event.target.value })}
        />
      );
    case "price":
      return (
        <input
          type="number"
          min={0}
          step="0.01"
          className={styles.cellInput}
          disabled={row.priceMode !== "F"}
          value={row.price}
          onChange={(event) => ctx.updateRow(row.localId, { price: event.target.value })}
        />
      );
    case "effectiveFrom":
      return (
        <input
          type="date"
          className={styles.cellInput}
          value={row.effectiveFrom}
          onChange={(event) => ctx.updateRow(row.localId, { effectiveFrom: event.target.value })}
        />
      );
    case "effectiveTo":
      return (
        <input
          type="date"
          className={styles.cellInput}
          value={row.effectiveTo}
          onChange={(event) => ctx.updateRow(row.localId, { effectiveTo: event.target.value })}
        />
      );
    case "isActive":
      return (
        <div className={styles.cellCheckboxWrap}>
          <input
            type="checkbox"
            className={styles.cellCheckbox}
            checked={row.isActive}
            onChange={(event) => ctx.updateRow(row.localId, { isActive: event.target.checked })}
          />
        </div>
      );
    case "isTaxIncl":
      return (
        <div className={styles.cellCheckboxWrap}>
          <input
            type="checkbox"
            className={styles.cellCheckbox}
            checked={row.isTaxIncl}
            onChange={(event) => ctx.updateRow(row.localId, { isTaxIncl: event.target.checked })}
          />
        </div>
      );
    default:
      return null;
  }
}
// Qty-wise slabs are usually several ranges for the SAME item (0-10, 10-50,
// 50+ ...) and the grid is scoped to exactly one item, so the auto-added row
// after completing one carries that item — enough for its Uom dropdown to
// already have real options ready (unitOptionsByItemId[itemId] is cached from
// the row above, no disabled "Select item first" state, no refetch) — while
// every other field resets to createBlankRow defaults and must be chosen
// again for this row.
function ensureTrailingRow(
  list: ItemQtyPriceRow[],
  item: ActiveItem | null,
): ItemQtyPriceRow[] {
  const lastRow = list[list.length - 1];
  return list.length === 0 || isFilledRow(lastRow) ? [...list, createBlankRow(item)] : list;
}
function isSameNavigationTarget(targetHref: string | URL): boolean {
  if (typeof window === "undefined") return false;
  const currentUrl = new URL(window.location.href);
  const nextUrl = new URL(targetHref.toString(), currentUrl);
  return nextUrl.href === currentUrl.href;
}
export default function ItemQtyPricePage() {
  const router = useRouter();
  const [activeItem, setActiveItem] = useState<ActiveItem | null>(null);
  const [rows, setRows] = useState<ItemQtyPriceRow[]>([createBlankRow()]);
  const [unitOptionsByItemId, setUnitOptionsByItemId] = useState<
    Record<string, ERPDynamicSelectOption[]>
  >({});
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeleteRow, setPendingDeleteRow] = useState<ItemQtyPriceRow | null>(null);
  const [pendingItemSelection, setPendingItemSelection] = useState<{
    itemId: string;
    itemLabel: string;
    presetUnitId?: string;
    successMessage?: string;
  } | null>(null);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const hasUnsavedChangesRef = useRef(false);
  const allowUnsafeNavigationRef = useRef(false);
  const allowUnsafeNavigationTimeoutRef = useRef<number | null>(null);
  const pendingUnsafeNavigationRef = useRef<(() => void) | null>(null);
  // Stamped onto the save payload as created_by/modified_by. Redux is the live
  // source; the session-storage copy covers a hard refresh where the store has
  // rehydrated auth but this render happens before the selector settles.
  const userInfo = useAppSelector(selectUserInfo);
  const actorName = userInfo?.userName ?? null;
  const { data: columnConfig } = useGetItemQtyPriceColumnConfigQuery({
    uiTableId: ITEM_QTY_PRICE_UI_TABLE_ID,
  });
  const { data: rawCompanyOptions = [] } = useGetCompanyOptionsQuery();
  const { data: rawBranchOptions = [] } = useGetBranchOptionsQuery();
  const { data: rawPartyOptions = [] } = useGetCustomerOptionsQuery();
  const { data: rawPriceLevelOptions = [] } = useGetPriceLevelOptionsQuery();
  // These lookups seed a blank placeholder option (value ""), but the cells
  // already render their own "None" placeholder via SearchableSelect — drop
  // the redundant blank row so it doesn't show up as a second selectable
  // "clear" entry in the open list.
  const companyOptions = rawCompanyOptions.filter((option) => option.value !== "");
  const branchOptions = rawBranchOptions.filter((option) => option.value !== "");
  const partyOptions = rawPartyOptions.filter((option) => option.value !== "");
  const priceLevelOptions = rawPriceLevelOptions.filter((option) => option.value !== "");
  const [triggerUnitsByItem] = useLazyGetUnitsByItemQuery();
  const [triggerListItemQtyPrices, { isFetching: isLoadingRows }] = useLazyListItemQtyPricesQuery();
  const [saveItemQtyPrices] = useSaveItemQtyPricesMutation();
  const [deleteItemQtyPrice, { isLoading: isDeletingRow }] = useDeleteItemQtyPriceMutation();
  // Rows that take part in a save: the ones the operator edited (posted) plus
  // the item's already-saved rows (which still have to be checked for
  // duplicates against the edits). A pristine trailing row — including the one
  // a barcode pre-fills the unit on — is neither.
  const participatingRows = rows.filter((row) => row.isDirty || row.iqpId);
  const dirtyRows = rows.filter((row) => row.isDirty);
  const dirtyCount = dirtyRows.length;
  const hasUnsavedChanges = dirtyCount > 0;
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);
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
  const requestLeaveConfirmation = useCallback((navigate: () => void) => {
    pendingUnsafeNavigationRef.current = navigate;
    setIsLeaveConfirmOpen(true);
  }, []);
  const handleCancelLeave = useCallback(() => {
    pendingUnsafeNavigationRef.current = null;
    setIsLeaveConfirmOpen(false);
  }, []);
  const handleConfirmLeave = useCallback(() => {
    const pendingNavigation = pendingUnsafeNavigationRef.current;
    pendingUnsafeNavigationRef.current = null;
    setIsLeaveConfirmOpen(false);
    if (!pendingNavigation) return;
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
      if (!hasUnsavedChangesRef.current || allowUnsafeNavigationRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
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
      requestLeaveConfirmation(() => originalPush.call(router, href, options));
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
      requestLeaveConfirmation(() => originalReplace.call(router, href, options));
    }) as typeof router.replace;
    mutableRouter.back = (() => {
      if (allowUnsafeNavigationRef.current || !hasUnsavedChangesRef.current) {
        originalBack.call(router);
        return;
      }
      requestLeaveConfirmation(() => originalBack.call(router));
    }) as typeof router.back;
    mutableRouter.forward = (() => {
      if (allowUnsafeNavigationRef.current || !hasUnsavedChangesRef.current) {
        originalForward.call(router);
        return;
      }
      requestLeaveConfirmation(() => originalForward.call(router));
    }) as typeof router.forward;
    return () => {
      mutableRouter.push = originalPush;
      mutableRouter.replace = originalReplace;
      mutableRouter.back = originalBack;
      mutableRouter.forward = originalForward;
    };
  }, [requestLeaveConfirmation, router]);
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
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const currentUrl = new URL(window.location.href);
      const nextUrl = new URL(anchor.href, currentUrl);
      if (nextUrl.href === currentUrl.href) return;
      event.preventDefault();
      requestLeaveConfirmation(() => {
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
    return () => document.removeEventListener("click", handleDocumentClickCapture, true);
  }, [requestLeaveConfirmation, router]);
  const dynamicColumns =
    columnConfig && columnConfig.length > 0
      ? resolveConfiguredColumns(columnConfig)
      : DEFAULT_DYNAMIC_COLUMNS;
  function updateRow(localId: string, patch: Partial<ItemQtyPriceRow>) {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.localId === localId ? { ...row, ...patch, isDirty: true } : row,
      ),
    );
  }
  // Resolves (and caches) the item's unit list, returning it so the barcode
  // path can match its unit against real options instead of guessing.
  const ensureUnitOptionsForItem = useCallback(
    async (itemId: string): Promise<ERPDynamicSelectOption[]> => {
      if (!itemId) return [];
      const cached = unitOptionsByItemId[itemId];
      if (cached) return cached;
      try {
        const options = await triggerUnitsByItem({ itemId }, true).unwrap();
        setUnitOptionsByItemId((current) => ({ ...current, [itemId]: options }));
        return options;
      } catch {
        setUnitOptionsByItemId((current) => ({ ...current, [itemId]: [] }));
        return [];
      }
    },
    [triggerUnitsByItem, unitOptionsByItemId],
  );
  // Picking an item scopes the whole grid to it: its saved slabs are loaded
  // for editing and a blank row is appended to enter the next one. A barcode
  // carries its own unit too (item_ean_codes.ean_uc_unit_id — an
  // item_unit_conversion PK, the same id domain the unit dropdown is built
  // from), so that blank row starts with the unit already chosen. The unit
  // list is awaited first: filling itemUnitId with an id the dropdown doesn't
  // know about renders as an empty cell, so an unmatched barcode unit (an
  // inactive or deleted conversion) falls back to the item's base unit —
  // first in the list, which the server returns in unit-slno order — with a
  // warning rather than leaving the row silently unusable.
  async function applyItemSelectionNow(itemId: string, itemLabel: string, presetUnitId?: string) {
    const item: ActiveItem = { id: itemId, label: itemLabel };
    setActiveItem(item);
    setRows([createBlankRow(item)]);
    const unitOptions = await ensureUnitOptionsForItem(itemId);
    let presetUnit: ERPDynamicSelectOption | null = null;
    if (presetUnitId) {
      const exactMatch = unitOptions.find((option) => option.value === presetUnitId) ?? null;
      presetUnit = exactMatch ?? unitOptions[0] ?? null;
      if (!presetUnit) {
        toast.warn(`Couldn't load units for ${itemLabel} — pick the unit before saving.`);
      } else if (!exactMatch) {
        toast.warn(
          `The barcode's unit isn't available for ${itemLabel} — defaulted to ${presetUnit.label}.`,
        );
      }
    }
    const savedRows = await loadSavedRowsForItem(itemId);
    // Left pristine on purpose: a scan pre-selects the unit but hasn't
    // entered a rate yet, so this row is neither saved nor counted as
    // unsaved work until the operator types into it.
    const entryRow: ItemQtyPriceRow = presetUnit
      ? {
          ...createBlankRow(item),
          itemUnitId: presetUnit.value,
          unitLabel: presetUnit.label,
        }
      : createBlankRow(item);
    setRows([...savedRows, entryRow]);
  }
  // Existing slabs for the item, loaded straight into the grid so the screen
  // edits what's already saved instead of only ever appending.
  async function loadSavedRowsForItem(itemId: string): Promise<ItemQtyPriceRow[]> {
    try {
      const response = await triggerListItemQtyPrices(
        { iqp_item_id: itemId, limit: SAVED_ROWS_PAGE_LIMIT },
        true,
      ).unwrap();
      const savedRows = normalizeListPayload(response.data).map(mapPayloadToRow);
      const total = response.meta?.total ?? savedRows.length;
      if (total > savedRows.length) {
        toast.info(
          `Showing the first ${savedRows.length} of ${total} saved rows for this item.`,
        );
      }
      return savedRows;
    } catch (error) {
      toast.error(extractApiErrorMessage(error, "Couldn't load this item's saved rates."));
      return [];
    }
  }
  // Switching items throws away whatever is in the grid, so confirm first
  // when it holds unsaved edits. The success toast is deferred along with it
  // so it never fires ahead of actual confirmation.
  async function applyItemSelection(
    itemId: string,
    itemLabel: string,
    presetUnitId?: string,
    successMessage?: string,
  ) {
    if (itemId === activeItem?.id && !presetUnitId) return;
    if (hasUnsavedChanges) {
      setPendingItemSelection({ itemId, itemLabel, presetUnitId, successMessage });
      return;
    }
    await applyItemSelectionNow(itemId, itemLabel, presetUnitId);
    if (successMessage) toast.success(successMessage);
  }
  function handleToolbarItemSelect(itemId: string, itemLabel: string) {
    void applyItemSelection(itemId, itemLabel);
  }
  function handleBarcodeResolved(itemId: string, itemLabel: string, unitId: string) {
    void applyItemSelection(itemId, itemLabel, unitId, `Loaded ${itemLabel} from barcode.`);
  }
  async function handleConfirmItemSelection() {
    if (!pendingItemSelection) return;
    setPendingItemSelection(null);
    await applyItemSelectionNow(
      pendingItemSelection.itemId,
      pendingItemSelection.itemLabel,
      pendingItemSelection.presetUnitId,
    );
    if (pendingItemSelection.successMessage) toast.success(pendingItemSelection.successMessage);
  }
  function handleCancelItemSelection() {
    setPendingItemSelection(null);
  }
  function handleUnitSelect(row: ItemQtyPriceRow, unitId: string, unitLabel: string) {
    setRows((currentRows) => {
      const index = currentRows.findIndex((current) => current.localId === row.localId);
      if (index === -1) return currentRows;
      const nextRows = currentRows.map((current, currentIndex) =>
        currentIndex === index
          ? { ...current, itemUnitId: unitId, unitLabel, isDirty: true }
          : current,
      );
      const isLastRow = index === currentRows.length - 1;
      return isLastRow && unitId ? ensureTrailingRow(nextRows, activeItem) : nextRows;
    });
  }
  function handleAddRow() {
    if (!activeItem) return;
    setRows((currentRows) => [...currentRows, createBlankRow(activeItem)]);
  }
  function removeRowLocally(localId: string) {
    setRows((currentRows) => {
      const nextRows = currentRows.filter((current) => current.localId !== localId);
      return nextRows.length === 0 ? [createBlankRow(activeItem)] : nextRows;
    });
  }
  async function handleRemoveRow(row: ItemQtyPriceRow) {
    if (!row.iqpId) {
      removeRowLocally(row.localId);
      return;
    }
    try {
      await deleteItemQtyPrice(row.iqpId).unwrap();
      removeRowLocally(row.localId);
      toast.success("Item qty price deleted.");
    } catch (error) {
      toast.error(extractApiErrorMessage(error));
    }
  }
  // A saved row means a real (soft) delete on the server, and an edited row
  // holds work worth losing — both confirm. A pristine trailing/template row
  // has nothing to lose, so it just disappears.
  function requestRemoveRow(row: ItemQtyPriceRow) {
    if (row.iqpId || row.isDirty) {
      setPendingDeleteRow(row);
      return;
    }
    void handleRemoveRow(row);
  }
  async function handleConfirmDeleteRow() {
    if (!pendingDeleteRow) return;
    await handleRemoveRow(pendingDeleteRow);
    setPendingDeleteRow(null);
  }
  function handleCancelDeleteRow() {
    if (isDeletingRow) return;
    setPendingDeleteRow(null);
  }
  // Validates every filled row (not just the edited ones) — a duplicate only
  // exists relative to its neighbours, and an untouched saved row is just as
  // able to clash with a new one.
  function findRowsError(): string | null {
    if (participatingRows.length === 0) return "Enter at least one rate row before saving.";
    const seenKeys = new Map<string, number>();
    // Numbered by grid position, so the message points at the row the
    // operator is actually looking at.
    for (const [index, row] of rows.entries()) {
      if (!row.isDirty && !row.iqpId) continue;
      const rowNumber = index + 1;
      const validationError = validateRow(row);
      if (validationError) return `Row ${rowNumber}: ${validationError}`;
      const unitOptions = unitOptionsByItemId[row.itemId] ?? [];
      if (unitOptions.length > 0 && !unitOptions.some((o) => o.value === row.itemUnitId)) {
        return `Row ${rowNumber}: the selected unit doesn't belong to this item.`;
      }
      const key = buildRowUniquenessKey(row);
      const clashingRow = seenKeys.get(key);
      if (clashingRow !== undefined) {
        return `Row ${rowNumber} duplicates row ${clashingRow} — same company, branch, customer, price level, ${describeRowScope(row)}.`;
      }
      seenKeys.set(key, rowNumber);
    }
    return null;
  }
  // Rule: a successful save resets the screen (item picker included) rather
  // than reloading the same item — the operator moves on to the next item.
  function resetScreen() {
    setActiveItem(null);
    setRows([createBlankRow()]);
    setPendingDeleteRow(null);
    setPendingItemSelection(null);
  }
  async function handleSaveAll() {
    if (dirtyCount === 0) {
      toast.info("No changes to save.");
      return;
    }
    const rowsError = findRowsError();
    if (rowsError) {
      toast.error(rowsError);
      return;
    }
    const savedByUser = actorName ?? getUserInfo()?.userName ?? null;
    const payload: SaveItemQtyPriceDto[] = dirtyRows.map((row) =>
      buildSavePayload(row, savedByUser),
    );
    setIsSaving(true);
    try {
      await saveItemQtyPrices(payload).unwrap();
      toast.success(`Saved ${payload.length} item qty price row(s).`);
      resetScreen();
    } catch (error) {
      toast.error(extractApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }
  function handleClear() {
    if (hasUnsavedChanges) {
      setIsClearConfirmOpen(true);
      return;
    }
    resetScreen();
  }
  function handleConfirmClear() {
    setIsClearConfirmOpen(false);
    resetScreen();
  }
  // Goes through the patched router, so the unsaved-changes guard prompts
  // exactly as it does for any other navigation away from this page.
  function handleClose() {
    router.back();
  }
  // Ctrl/Cmd+S saves, the way the desktop screen does. Kept on a ref so the
  // listener always calls the current handler without rebinding every render.
  const saveHandlerRef = useRef(handleSaveAll);
  useEffect(() => {
    saveHandlerRef.current = handleSaveAll;
  });
  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      void saveHandlerRef.current();
    };
    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, []);
  const columnCount = dynamicColumns.length + 2; // # + dynamic columns + Actions
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Item Qty Wise Price</h1>
          <p className={styles.subtitle}>
            {activeItem
              ? `Quantity slab pricing for ${activeItem.label} — edit the rows below and Save.`
              : "Scan a barcode or search an item to load and edit its quantity slab pricing."}
          </p>
        </div>
      </div>
      <div className={styles.shell}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarBarcodeField}>
            <BarcodeInputField onResolved={handleBarcodeResolved} />
          </div>
          <div className={styles.toolbarItemPicker}>
            <ItemSearchCell
              placeholder="Search item to load its rates…"
              selectedLabel={activeItem?.label ?? ""}
              onSelect={handleToolbarItemSelect}
            />
          </div>
          <button
            type="button"
            className={styles.buttonSecondary}
            onClick={handleAddRow}
            disabled={!activeItem || isLoadingRows}
          >
            <FiPlus /> Add Row
          </button>
          <button
            type="button"
            className={styles.buttonPrimary}
            onClick={handleSaveAll}
            disabled={isSaving || dirtyCount === 0}
          >
            <FiSave /> {isSaving ? "Saving…" : `Save${dirtyCount ? ` (${dirtyCount})` : ""}`}
          </button>
          <button
            type="button"
            className={styles.buttonSecondary}
            onClick={handleClear}
            disabled={isSaving || (!activeItem && !hasUnsavedChanges)}
          >
            <FiRotateCcw /> Clear
          </button>
          <button type="button" className={styles.buttonSecondary} onClick={handleClose}>
            <FiX /> Close
          </button>
          <span className={styles.summary}>
            {isLoadingRows
              ? "Loading rows…"
              : `${participatingRows.length} of ${rows.length} row(s)`}
          </span>
        </div>
        <div className={styles.tableViewport}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.cellIndex}>#</th>
                {dynamicColumns.map((column) => (
                  <th key={column.key} style={{ minWidth: "9rem" }}>
                    {column.header}
                  </th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingRows ? (
                <tr>
                  <td colSpan={columnCount} className={styles.emptyState}>
                    Loading saved rates…
                  </td>
                </tr>
              ) : !activeItem ? (
                <tr>
                  <td colSpan={columnCount} className={styles.emptyState}>
                    Scan a barcode or search an item above to load its quantity slab rates.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => {
                  const ctx: CellRenderCtx = {
                    updateRow,
                    onUnitSelect: handleUnitSelect,
                    companyOptions,
                    branchOptions,
                    partyOptions,
                    priceLevelOptions,
                    unitOptions: unitOptionsByItemId[row.itemId] ?? [],
                  };
                  return (
                    <tr key={row.localId} className={row.isDirty ? styles.rowDirty : undefined}>
                      <td className={styles.cellIndex} title={row.itemLabel || row.itemId}>
                        {index + 1}
                      </td>
                      {dynamicColumns.map((column) => (
                        <td key={column.key} className={DYNAMIC_CELL_CLASS_NAME[column.key]}>
                          {renderDynamicCell(column.key, row, ctx)}
                        </td>
                      ))}
                      <td>
                        <button
                          type="button"
                          className={styles.removeButton}
                          onClick={() => requestRemoveRow(row)}
                          aria-label="Remove row"
                        >
                          <FiTrash2 />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <DeleteConfirmModal
        isOpen={pendingDeleteRow !== null}
        title="Delete this row?"
        itemName={
          pendingDeleteRow
            ? `${pendingDeleteRow.itemLabel || pendingDeleteRow.itemId} · ${describeRowScope(pendingDeleteRow)}`
            : undefined
        }
        message={
          pendingDeleteRow?.iqpId
            ? "This saved rate row will be deleted. This cannot be undone."
            : "This row has entered data that hasn't been saved yet."
        }
        loading={isDeletingRow}
        onConfirm={() => void handleConfirmDeleteRow()}
        onCancel={handleCancelDeleteRow}
      />
      <DeleteConfirmModal
        isOpen={pendingItemSelection !== null}
        title="Switch to another item?"
        itemName={pendingItemSelection?.itemLabel || undefined}
        message="This grid has unsaved rows. Loading another item's rates will discard them."
        iconVariant="replace"
        confirmLabel="Switch Item"
        onConfirm={() => void handleConfirmItemSelection()}
        onCancel={handleCancelItemSelection}
      />
      <DeleteConfirmModal
        isOpen={isClearConfirmOpen}
        title="Clear this screen?"
        itemName={activeItem?.label || undefined}
        message="Unsaved rows will be discarded and the item picker reset."
        iconVariant="replace"
        confirmLabel="Clear"
        onConfirm={handleConfirmClear}
        onCancel={() => setIsClearConfirmOpen(false)}
      />
      <DeleteConfirmModal
        isOpen={isLeaveConfirmOpen}
        title="Leave Item Qty Wise Price?"
        message="Unsaved changes will be lost if you leave this page."
        confirmLabel="Leave Page"
        cancelLabel="Stay Here"
        onConfirm={handleConfirmLeave}
        onCancel={handleCancelLeave}
      />
    </div>
  );
}