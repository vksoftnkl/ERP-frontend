"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { FiRefreshCw, FiSave, FiTrash2 } from "react-icons/fi";
import { toast } from "react-toastify";
import type { ERPDynamicSelectOption } from "@/components/design-system/ui";
import { SearchableSelect } from "@/components/design-system/ui/searchable-select";
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
  useListItemQtyPricesQuery,
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
  buildSavePayload,
  createBlankRow,
  mapPayloadToRow,
  validateRow,
} from "./item-qty-price.utils";
import styles from "./item-qty-price.module.scss";
type CellRenderCtx = {
  updateRow: (localId: string, patch: Partial<ItemQtyPriceRow>) => void;
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
            ctx.updateRow(row.localId, {
              itemUnitId: unitId,
              unitLabel: ctx.unitOptions.find((option) => option.value === unitId)?.label ?? "",
            })
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
            ctx.updateRow(row.localId, { priceMode: event.target.value as ItemQtyPriceMode })
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
export default function ItemQtyPricePage() {
  const [rows, setRows] = useState<ItemQtyPriceRow[]>([]);
  const [unitOptionsByItemId, setUnitOptionsByItemId] = useState<
    Record<string, ERPDynamicSelectOption[]>
  >({});
  const [isSaving, setIsSaving] = useState(false);
  const hasLoadedInitialRows = useRef(false);
  const {
    data: listResponse,
    isFetching: isListLoading,
    refetch,
  } = useListItemQtyPricesQuery({ page: 1, limit: 100 });
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
  const [saveItemQtyPrices] = useSaveItemQtyPricesMutation();
  const [deleteItemQtyPrice] = useDeleteItemQtyPriceMutation();
  const dynamicColumns =
    columnConfig && columnConfig.length > 0
      ? resolveConfiguredColumns(columnConfig)
      : DEFAULT_DYNAMIC_COLUMNS;
  useEffect(() => {
    if (!listResponse || hasLoadedInitialRows.current) return;
    hasLoadedInitialRows.current = true;
    setRows(listResponse.data.map(mapPayloadToRow));
  }, [listResponse]);
  function updateRow(localId: string, patch: Partial<ItemQtyPriceRow>) {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.localId === localId ? { ...row, ...patch, isDirty: true } : row,
      ),
    );
  }
  const loadUnitOptionsForItem = useCallback(
    async (itemId: string) => {
      if (!itemId || unitOptionsByItemId[itemId]) return;
      try {
        const options = await triggerUnitsByItem({ itemId }, true).unwrap();
        setUnitOptionsByItemId((current) => ({ ...current, [itemId]: options }));
      } catch {
        setUnitOptionsByItemId((current) => ({ ...current, [itemId]: [] }));
      }
    },
    [triggerUnitsByItem, unitOptionsByItemId],
  );
  function handleToolbarItemSelect(itemId: string, itemLabel: string, presetUnitId?: string) {
    const newRow: ItemQtyPriceRow = {
      ...createBlankRow(),
      itemId,
      itemLabel,
      itemUnitId: presetUnitId ?? "",
      isDirty: true,
    };
    setRows((currentRows) => [...currentRows, newRow]);
    void loadUnitOptionsForItem(itemId);
  }

  function handleBarcodeResolved(itemId: string, itemLabel: string, unitId: string) {
    handleToolbarItemSelect(itemId, itemLabel, unitId);
    toast.success(`Added ${itemLabel} from barcode.`);
  }
  async function handleRemoveRow(row: ItemQtyPriceRow) {
    if (!row.iqpId) {
      setRows((currentRows) => currentRows.filter((current) => current.localId !== row.localId));
      return;
    }
    try {
      await deleteItemQtyPrice(row.iqpId).unwrap();
      setRows((currentRows) => currentRows.filter((current) => current.localId !== row.localId));
      toast.success("Item qty price deleted.");
    } catch (error) {
      toast.error(extractApiErrorMessage(error));
    }
  }
  async function handleSaveAll() {
    const dirtyRows = rows.filter((row) => row.isDirty && (row.itemId || row.itemUnitId));
    if (dirtyRows.length === 0) {
      toast.info("No changes to save.");
      return;
    }
    for (const row of dirtyRows) {
      const validationError = validateRow(row);
      if (validationError) {
        toast.error(validationError);
        return;
      }
    }
    const payload: SaveItemQtyPriceDto[] = dirtyRows.map(buildSavePayload);
    setIsSaving(true);
    try {
      const response = await saveItemQtyPrices(payload).unwrap();
      const savedByIndex = response.data;
      setRows((currentRows) => {
        let savedCursor = 0;
        return currentRows.map((row) => {
          if (!row.isDirty || !(row.itemId || row.itemUnitId)) return row;
          const saved = savedByIndex[savedCursor];
          savedCursor += 1;
          if (!saved) return row;
          return { ...mapPayloadToRow(saved) };
        });
      });
      toast.success(`Saved ${dirtyRows.length} item qty price row(s).`);
    } catch (error) {
      toast.error(extractApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }
  const dirtyCount = rows.filter((row) => row.isDirty && (row.itemId || row.itemUnitId)).length;
  const columnCount = dynamicColumns.length + 2; // # + dynamic columns + Actions
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Item Qty Wise Price</h1>
          <p className={styles.subtitle}>
            Define quantity slab pricing per item — enter rows below and Save All.
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
              placeholder="Search item to add a row…"
              onSelect={handleToolbarItemSelect}
            />
          </div>
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              hasLoadedInitialRows.current = false;
              void refetch();
            }}
            disabled={isListLoading}
          >
            <FiRefreshCw /> Refresh
          </button>
          <button
            type="button"
            className={styles.buttonPrimary}
            onClick={handleSaveAll}
            disabled={isSaving || dirtyCount === 0}
          >
            <FiSave /> {isSaving ? "Saving…" : `Save All${dirtyCount ? ` (${dirtyCount})` : ""}`}
          </button>
          <span className={styles.summary}>{rows.length} row(s)</span>
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
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className={styles.emptyState}>
                    No item qty price rows yet. Search for an item above to add one.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => {
                  const ctx: CellRenderCtx = {
                    updateRow,
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
                          onClick={() => void handleRemoveRow(row)}
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
    </div>
  );
}