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
  // 23.. the charge split and the landing costs (Qt bcd844a, user 2026-11-02 "like Sale Entry"): the SERVER's
  // figures (/validate), read-only. Registered in the dev DB's ui_table 57 under the same numbers.
  /** The line's share of before-tax charges — inside Taxable, so it carries GST. */
  ChrgBeforeTax: 23,
  /** The line's share of after-tax on-bill charges (signed) — added to Amount, no GST. */
  ChrgAfterTax: 24,
  /** Per unit of the line (the Rate's unit): landed value ÷ (qty + free), recoverable GST left out. */
  LandedCost: 25,
  /** The same with the line's GST in. */
  LandedCostIncl: 26,
  // 27 LineTotal is hidden in Qt (the server's `total`, taxable + tax); here it is `PoLine.lineTotal`.
} as const;

export type PoColumnNo = (typeof COL)[keyof typeof COL];

/**
 * The columns this screen draws, in the mockup's order (Qt `applyColumns`
 * moveSection list, bcd844a): # Barcode Item Unit Ordered Free Rate Disc% Sch%
 * GST% MRP — Chrg before tax · Tax · Chrg after tax · Amount · Landing cost ·
 * Landing cost incl. GST — Received Short-closed Pending Last rate Stock
 * Reorder Status. Taxable is hidden; Amount = the server's `amount` (line total
 * + the after-tax share).
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
  COL.ChrgBeforeTax,
  COL.Tax,
  COL.ChrgAfterTax,
  COL.Total,
  COL.LandedCost,
  COL.LandedCostIncl,
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
  COL.ChrgBeforeTax,
  COL.ChrgAfterTax,
  COL.LandedCost,
  COL.LandedCostIncl,
]);

/** Qt `isServerFigure` — the split / landing cells: muted while an edit waits for the server's answer. */
export const PO_SERVER_FIGURE_COLUMNS: ReadonlySet<number> = new Set([
  COL.ChrgBeforeTax,
  COL.ChrgAfterTax,
  COL.LandedCost,
  COL.LandedCostIncl,
]);

/** Qt `setFocusStops` — where Enter stops on a line. */
export const PO_FOCUS_STOPS: ReadonlySet<number> = new Set([COL.Barcode, COL.Item, COL.Qty, COL.Rate, COL.DiscPct]);

/**
 * The mockup's titles (Qt applyColumns sets every one), the two-line headings
 * (`heading`, bcd844a: 23 columns share the width, a heading of two or more
 * words takes two lines), the heading tooltips, and Qt's ColumnWeights — the
 * pixels each needs at 1560 px; only the proportions matter here.
 */
export const PO_FALLBACK_COLUMNS: Readonly<Record<number, { title: string; width: number; heading?: string; tip?: string }>> = {
  [COL.Barcode]: { title: "Barcode", width: 60 },
  [COL.Item]: { title: "Item", width: 104 },
  [COL.Unit]: { title: "Unit", width: 54 },
  [COL.Qty]: { title: "Ordered", width: 66 },
  [COL.Free]: { title: "Free", width: 42 },
  [COL.Rate]: { title: "Rate", width: 62 },
  [COL.DiscPct]: { title: "Disc%", width: 52 },
  [COL.SchPct]: { title: "Sch%", width: 48 },
  [COL.Taxable]: { title: "Taxable", width: 70 },
  [COL.GstPct]: { title: "GST%", width: 50 },
  [COL.Mrp]: { title: "MRP", width: 60 },
  [COL.ChrgBeforeTax]: {
    title: "Chrg before tax",
    heading: "Chrg\nbefore tax",
    width: 76,
    tip: "This line's share of the before-tax charges (freight on the bill …).\nIt is inside Taxable, so it raises Taxable and GST.",
  },
  [COL.Tax]: { title: "Tax", width: 66, tip: "GST on the goods and on the before-tax charge share" },
  [COL.ChrgAfterTax]: {
    title: "Chrg after tax",
    heading: "Chrg\nafter tax",
    width: 70,
    tip:
      "This line's share of the after-tax charges on the bill (minus = a deduction, e.g. cash discount).\n" +
      "Added to Amount; no GST on it.",
  },
  [COL.Total]: {
    title: "Amount",
    width: 78,
    tip: "Taxable + GST + the after-tax charge share — what this line costs on the supplier's bill",
  },
  [COL.LandedCost]: {
    title: "Landing cost",
    heading: "Landing\ncost",
    width: 66,
    tip:
      "Per unit of the line (the Rate's unit), free qty included:\n" +
      "net + the landing charges (before tax, after tax and our own off-bill costs) ÷ (ordered + free).\n" +
      "Recoverable GST left out. Charges marked not-landing in the charge master are left out.",
  },
  [COL.LandedCostIncl]: {
    title: "Landing cost incl. GST",
    heading: "Landing cost\nincl. GST",
    width: 90,
    tip: "Landing cost with the line's GST added — the cost per unit when the GST is not recovered",
  },
  [COL.Recd]: { title: "Received", width: 68 },
  [COL.ShortClosed]: { title: "Short-closed", heading: "Short-\nclosed", width: 56 },
  [COL.Pending]: { title: "Pending", width: 64 },
  [COL.LastRate]: { title: "Last rate", heading: "Last\nrate", width: 60 },
  [COL.Stock]: { title: "Stock", width: 50 },
  [COL.Reorder]: { title: "Reorder", width: 62 },
  [COL.Status]: { title: "Status", width: 90 },
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
