import type { UiTableColumnConfigRow } from "@/store/api/itemQtyPriceApi";
import type { SlabGridCell } from "./item-qty-price.types";
// The slab grid's columns. UI Table Master's "ITEM QTY WISE PRICE" still lists
// every field the old wide grid had (company … notes); the screen shows the
// slab only — Uom · From · To · Mode · Value — and everything else is in the
// panel under it (Qt applyGridColumns, which re-asserts this after the layout
// lands). So the layout contributes the headings of the three columns it
// names, and nothing more: Mode and Value are fixed, as Qt sets them.
export const SLAB_GRID_CELLS: readonly SlabGridCell[] = ["unit", "fromQty", "toQty", "mode", "value"];
export const DEFAULT_SLAB_HEADERS: Readonly<Record<SlabGridCell, string>> = {
  unit: "Uom",
  fromQty: "From Qty",
  toQty: "To Qty",
  mode: "Mode",
  value: "Value",
};
// Keyed by the normalized (alphanumeric-lowercased) `ui_tbl_clm_name`; the
// raw id-echo row `item_unit_id` names the same column as "Uom".
const CONFIGURED_HEADER_KEYS: Record<string, SlabGridCell> = {
  uom: "unit",
  itemunitid: "unit",
  fromqty: "fromQty",
  toqty: "toQty",
};
function normalizeColumnName(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
}
// First row by position wins, so the friendly "Uom" row beats the id echo
// that sits after it. A heading is taken whatever the row's visibility says:
// the five columns always show (Qt hides every other column and shows these).
export function resolveSlabHeaders(
  configRows: readonly UiTableColumnConfigRow[] | undefined,
): Record<SlabGridCell, string> {
  const headers: Record<SlabGridCell, string> = { ...DEFAULT_SLAB_HEADERS };
  const taken = new Set<SlabGridCell>();
  const sortedRows = [...(configRows ?? [])].sort(
    (left, right) => left.uiTblClmColumnPosition - right.uiTblClmColumnPosition,
  );
  for (const row of sortedRows) {
    const key = CONFIGURED_HEADER_KEYS[normalizeColumnName(row.uiTblClmName)];
    if (!key || taken.has(key)) continue;
    taken.add(key);
    // The id echo carries no friendly label of its own — keep the default.
    if (normalizeColumnName(row.uiTblClmName) !== "itemunitid") {
      headers[key] = row.uiTblClmName.trim() || headers[key];
    }
  }
  return headers;
}
