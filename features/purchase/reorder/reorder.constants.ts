/**
 * Reorder → PO (menu 296) — the constants of the Qt `PurchaseReorderEntry`
 * (src/modules/purchase/reorder, NexERP 6c6b5c2; plan DOC-02): its routes, the
 * grid's columns (`PurchaseReorderCols`, ui_table 64 "PURCHASE REORDER -
 * LINES") and the registries it reads.
 *
 * The routes run on the Purchase Order rights (menu 23); the menu 296 row only
 * puts the screen on the menu (and governs it here).
 */
import type { ConfiguredDropdownKey } from "@/lib/configured-dropdowns";
import type { UiTableKey } from "@/lib/ui-tables";

// Routes — WITHOUT `/api/v1`, which the base query adds.
export const REORDER_SUGGESTIONS_ENDPOINT = "/purchase/reorder/suggestions";
export const REORDER_CREATE_POS_ENDPOINT = "/purchase/reorder/create-pos";

export const REORDER_LINES_UI_TABLE_KEY: UiTableKey = "purchaseReorderLines";
/** SUPPLIERS (Qt dropdown 35) — the filter and "Buy the ticked rows from". */
export const SUPPLIER_DROPDOWN_KEY: ConfiguredDropdownKey = "supplier";

/** Where the made drafts are checked and confirmed. */
export const PURCHASE_ORDER_ROUTE = "/purchase/purchase-order";

/** The DOM name the grid's cells carry. */
export const REORDER_GRID_NAME = "purchase-reorder-lines";

/** The tick mark (Qt `kTick`). */
export const TICK = "✓";

// ---------------------------------------------------------------------------
// The grid — ui_table 64, by column number (`PurchaseReorderCols`)
// ---------------------------------------------------------------------------

export const COL = {
  Tick: 0,
  Item: 1,
  Unit: 2,
  Godown: 3,
  OnHand: 4,
  OnOrder: 5,
  Level: 6,
  Max: 7,
  OrderQty: 8,
  Supplier: 9,
  Source: 10,
  Rate: 11,
  LastBought: 12,
  // 13 ItemId, 14 UomId, 15 SupplierId are hidden carriers in Qt; here they live on the row.
} as const;

export type ReorderColumnNo = (typeof COL)[keyof typeof COL];

/** The columns this screen draws, in the Qt order. */
export const REORDER_COLUMN_NUMBERS: readonly ReorderColumnNo[] = [
  COL.Tick,
  COL.Item,
  COL.Unit,
  COL.Godown,
  COL.OnHand,
  COL.OnOrder,
  COL.Level,
  COL.Max,
  COL.OrderQty,
  COL.Supplier,
  COL.Source,
  COL.Rate,
  COL.LastBought,
];

/** `PurchaseReorderCols::isNumber` — right-aligned. */
export const REORDER_NUMBER_COLUMNS: ReadonlySet<number> = new Set([
  COL.OnHand,
  COL.OnOrder,
  COL.Level,
  COL.Max,
  COL.OrderQty,
  COL.Rate,
]);

/** The titles and widths (fractions) used until ui_table 64's layout arrives. */
export const REORDER_FALLBACK_COLUMNS: Readonly<Record<number, { title: string; width: number }>> = {
  [COL.Tick]: { title: TICK, width: 3 },
  [COL.Item]: { title: "Item", width: 22 },
  [COL.Unit]: { title: "Unit", width: 6 },
  [COL.Godown]: { title: "Godown", width: 9 },
  [COL.OnHand]: { title: "On hand", width: 6 },
  [COL.OnOrder]: { title: "On order", width: 6 },
  [COL.Level]: { title: "Level", width: 5 },
  [COL.Max]: { title: "Max", width: 5 },
  [COL.OrderQty]: { title: "Order qty", width: 7 },
  [COL.Supplier]: { title: "Supplier", width: 16 },
  [COL.Source]: { title: "From", width: 6 },
  [COL.Rate]: { title: "Rate", width: 7 },
  [COL.LastBought]: { title: "Last bought", width: 8 },
};
