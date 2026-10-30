/**
 * Purchase Order (menu 23) — the constants of the Qt `PurchaseOrderEntry`
 * (src/modules/purchase/order, NexERP fc46bde): its routes, the line grid's
 * columns (`PurchaseOrderCols`, ui_table 57 "PURCHASE ORDER - LINES") and the
 * registries it reads.
 */
import type { ConfiguredDropdownKey } from "@/lib/configured-dropdowns";
import type { UiTableKey } from "@/lib/ui-tables";

// ---------------------------------------------------------------------------
// Routes — WITHOUT `/api/v1`, which the base query adds.
// ---------------------------------------------------------------------------

export const PURCHASE_ORDER_SAVE_ENDPOINT = "/purchase/orders/save";
/** The server's figures for the PO being keyed. Writes nothing. */
export const PURCHASE_ORDER_VALIDATE_ENDPOINT = "/purchase/orders/validate";
export const PURCHASE_ORDER_GET_ENDPOINT = "/purchase/orders/get";
export const PURCHASE_ORDER_CANCEL_ENDPOINT = "/purchase/orders/cancel";
export const PURCHASE_ORDER_SHORT_CLOSE_ENDPOINT = "/purchase/orders/short-close";
// DOC-01 (Qt 6c6b5c2).
export const PURCHASE_ORDER_CLONE_ENDPOINT = "/purchase/orders/clone";
export const PURCHASE_ORDER_MERGE_ENDPOINT = "/purchase/orders/merge";
/** OVERRIDE on menu 23. */
export const PURCHASE_ORDER_APPROVE_ENDPOINT = "/purchase/orders/approve";
export const PURCHASE_ORDER_REVISIONS_ENDPOINT = "/purchase/orders/revisions";
/** A supplier's confirmed POs with qty still pending — Merge… and the new-PO note. */
export const PURCHASE_ORDER_PENDING_LINES_ENDPOINT = "/purchase/orders/pending-lines";
/** The item's default unit, GST % and MRP — the lookup the bill uses (Qt `fetchItem`). */
export const PURCHASE_ORDER_ITEM_LOOKUP_ENDPOINT = "/stock/opening/item-lookup";
export const PURCHASE_ORDER_ITEM_BY_BARCODE_ENDPOINT = "/master-lookups/item-by-barcode";
export const PURCHASE_ORDER_DROPDOWN_RUN_ENDPOINT = "/dropdown-details/run";

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

export const PURCHASE_ORDER_LINES_UI_TABLE_KEY: UiTableKey = "purchaseOrderLines";
export const SUPPLIER_DROPDOWN_KEY: ConfiguredDropdownKey = "supplier";
export const GODOWN_DROPDOWN_KEY: ConfiguredDropdownKey = "godown";

/** The print purpose (seeded by server migration 20261028160000; Qt `PurchaseDocNav`). */
export const PURCHASE_ORDER_PRINT_PURPOSE = "PURCHASE_ORDER";

/** The DOM name the line grid's cells carry for the shared Enter walk. */
export const PO_LINE_GRID_NAME = "purchase-order-lines";

/** Qt's 350 ms recalc timer: an edit asks the server for its figures once typing pauses. */
export const PO_RECALC_DELAY_MS = 350;

// ---------------------------------------------------------------------------
// The line grid — ui_table 57, by column number (`PurchaseOrderCols`)
// ---------------------------------------------------------------------------

export const COL = {
  Barcode: 0,
  Item: 1,
  Unit: 2,
  Qty: 3,
  Free: 4,
  Rate: 5,
  DiscPct: 6,
  Taxable: 7,
  GstPct: 8,
  Tax: 9,
  Total: 10,
  Recd: 11,
  Pending: 12,
  Mrp: 13,
  // 14 ItemId, 15 UomId, 16 LineId are hidden carriers in Qt; here they live on the line.
  // 17.. the mockup's columns ui_table 57 does not register yet (Qt titles and shows them itself).
  SchPct: 17,
  ShortClosed: 18,
  LastRate: 19,
  Stock: 20,
  Reorder: 21,
  Status: 22,
} as const;

export type PoColumnNo = (typeof COL)[keyof typeof COL];

/**
 * The columns this screen draws, in the mockup's order (Qt `applyColumns`
 * moveSection list, 2026-10-29): # Barcode Item Unit Ordered Free Rate Disc%
 * Sch% GST% MRP Tax Amount Received Short-closed Pending Last rate Stock
 * Reorder Status. Taxable is hidden (Amount = the line total).
 */
export const PO_COLUMN_NUMBERS: readonly PoColumnNo[] = [
  COL.Barcode,
  COL.Item,
  COL.Unit,
  COL.Qty,
  COL.Free,
  COL.Rate,
  COL.DiscPct,
  COL.SchPct,
  COL.GstPct,
  COL.Mrp,
  COL.Tax,
  COL.Total,
  COL.Recd,
  COL.ShortClosed,
  COL.Pending,
  COL.LastRate,
  COL.Stock,
  COL.Reorder,
  COL.Status,
];

/** `PurchaseOrderCols::isEditable` — on a DRAFT; Barcode / Item only on a blank line. */
export const PO_EDITABLE_COLUMNS: ReadonlySet<number> = new Set([
  COL.Barcode,
  COL.Item,
  COL.Qty,
  COL.Free,
  COL.Rate,
  COL.DiscPct,
  COL.SchPct,
  COL.Mrp,
]);

/** `PurchaseOrderCols::isNumber` — right-aligned. */
export const PO_NUMBER_COLUMNS: ReadonlySet<number> = new Set([
  COL.Qty,
  COL.Free,
  COL.Rate,
  COL.DiscPct,
  COL.SchPct,
  COL.Taxable,
  COL.GstPct,
  COL.Tax,
  COL.Total,
  COL.Recd,
  COL.Pending,
  COL.Mrp,
  COL.ShortClosed,
  COL.LastRate,
  COL.Stock,
  COL.Reorder,
]);

/** Qt `setFocusStops` — where Enter stops on a line. */
export const PO_FOCUS_STOPS: ReadonlySet<number> = new Set([COL.Barcode, COL.Item, COL.Qty, COL.Rate, COL.DiscPct]);

/** The mockup's titles (Qt applyColumns sets every one) and Qt ColumnWeights. */
export const PO_FALLBACK_COLUMNS: Readonly<Record<number, { title: string; width: number }>> = {
  [COL.Barcode]: { title: "Barcode", width: 7 },
  [COL.Item]: { title: "Item", width: 15 },
  [COL.Unit]: { title: "Unit", width: 6 },
  [COL.Qty]: { title: "Ordered", width: 6 },
  [COL.Free]: { title: "Free", width: 4 },
  [COL.Rate]: { title: "Rate", width: 6 },
  [COL.DiscPct]: { title: "Disc%", width: 5 },
  [COL.SchPct]: { title: "Sch%", width: 5 },
  [COL.Taxable]: { title: "Taxable", width: 8 },
  [COL.GstPct]: { title: "GST%", width: 4 },
  [COL.Mrp]: { title: "MRP", width: 5 },
  [COL.Tax]: { title: "Tax", width: 6 },
  [COL.Total]: { title: "Amount", width: 7 },
  [COL.Recd]: { title: "Received", width: 6 },
  [COL.ShortClosed]: { title: "Short-closed", width: 7 },
  [COL.Pending]: { title: "Pending", width: 6 },
  [COL.LastRate]: { title: "Last rate", width: 6 },
  [COL.Stock]: { title: "Stock", width: 5 },
  [COL.Reorder]: { title: "Reorder", width: 5 },
  [COL.Status]: { title: "Status", width: 8 },
};

/** Reorder suggestions = F7 (Qt; Ctrl+R is "change rate" on the sales screens — user 10-29). */
export const PO_REORDER_SUGGESTIONS_ENDPOINT = "/purchase/reorder/suggestions";
export const PO_SUPPLIER_CONTEXT_ENDPOINT = "/purchase/lookup/supplier-context";
export const PO_ITEM_CONTEXT_ENDPOINT = "/purchase/lookup/item-context";
/** Dropdown 73 — the PO terms master (purchase.pur_terms). */
export const PO_TERMS_DROPDOWN_KEY = "poTerms" as const;

export const PO_FALLBACK_TITLES: Readonly<Record<number, string>> = Object.fromEntries(
  Object.entries(PO_FALLBACK_COLUMNS).map(([no, column]) => [no, column.title]),
);
