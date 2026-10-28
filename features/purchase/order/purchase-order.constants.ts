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
} as const;

export type PoColumnNo = (typeof COL)[keyof typeof COL];

/** The columns this screen draws, in the Qt order. */
export const PO_COLUMN_NUMBERS: readonly PoColumnNo[] = [
  COL.Barcode,
  COL.Item,
  COL.Unit,
  COL.Qty,
  COL.Free,
  COL.Rate,
  COL.DiscPct,
  COL.Taxable,
  COL.GstPct,
  COL.Tax,
  COL.Total,
  COL.Recd,
  COL.Pending,
  COL.Mrp,
];

/** `PurchaseOrderCols::isEditable` — on a DRAFT; Barcode / Item only on a blank line. */
export const PO_EDITABLE_COLUMNS: ReadonlySet<number> = new Set([
  COL.Barcode,
  COL.Item,
  COL.Qty,
  COL.Free,
  COL.Rate,
  COL.DiscPct,
  COL.Mrp,
]);

/** `PurchaseOrderCols::isNumber` — right-aligned. */
export const PO_NUMBER_COLUMNS: ReadonlySet<number> = new Set([
  COL.Qty,
  COL.Free,
  COL.Rate,
  COL.DiscPct,
  COL.Taxable,
  COL.GstPct,
  COL.Tax,
  COL.Total,
  COL.Recd,
  COL.Pending,
  COL.Mrp,
]);

/** Qt `setFocusStops` — where Enter stops on a line. */
export const PO_FOCUS_STOPS: ReadonlySet<number> = new Set([COL.Barcode, COL.Item, COL.Qty, COL.Rate, COL.DiscPct]);

/** The titles and Qt widths (fractions) used until ui_table 57's layout arrives. */
export const PO_FALLBACK_COLUMNS: Readonly<Record<number, { title: string; width: number }>> = {
  [COL.Barcode]: { title: "Barcode", width: 9 },
  [COL.Item]: { title: "Item", width: 22 },
  [COL.Unit]: { title: "Unit", width: 6 },
  [COL.Qty]: { title: "Qty", width: 6 },
  [COL.Free]: { title: "Free", width: 5 },
  [COL.Rate]: { title: "Rate", width: 7 },
  [COL.DiscPct]: { title: "Disc %", width: 5 },
  [COL.Taxable]: { title: "Taxable", width: 8 },
  [COL.GstPct]: { title: "GST %", width: 5 },
  [COL.Tax]: { title: "Tax", width: 7 },
  [COL.Total]: { title: "Total", width: 8 },
  [COL.Recd]: { title: "Recd", width: 5 },
  [COL.Pending]: { title: "Pending", width: 6 },
  [COL.Mrp]: { title: "MRP", width: 6 },
};

export const PO_FALLBACK_TITLES: Readonly<Record<number, string>> = Object.fromEntries(
  Object.entries(PO_FALLBACK_COLUMNS).map(([no, column]) => [no, column.title]),
);
