/**
 * Purchase Entry (menu 24) — the constants of the Qt `PurchaseInvoiceEntry`
 * (src/modules/purchase/invoice/purchase_invoice_entry.cpp, NexERP 3ce8487)
 * and its `PurchaseInvoiceCols` (purchase_invoice_cols.h).
 */
import type { ConfiguredDropdownKey } from "@/lib/configured-dropdowns";
import type { UiTableKey } from "@/lib/ui-tables";
import { keySheetRows, type TxnKeyRow } from "@/lib/txn-keys";

// ---------------------------------------------------------------------------
// Routes — WITHOUT `/api/v1`, which the base query adds.
// ---------------------------------------------------------------------------

export const PURCHASE_INVOICE_SAVE_ENDPOINT = "/purchase/invoices/save";
export const PURCHASE_INVOICE_VALIDATE_ENDPOINT = "/purchase/invoices/validate";
export const PURCHASE_INVOICE_GET_ENDPOINT = "/purchase/invoices/get";
export const PURCHASE_INVOICE_CANCEL_ENDPOINT = "/purchase/invoices/cancel";
/** The default unit, factor, tracking signature and GST % of an item (Qt `ApiEndpoints::OpeningStock::itemLookup`). */
export const PURCHASE_INVOICE_ITEM_LOOKUP_ENDPOINT = "/stock/opening/item-lookup";
export const PURCHASE_INVOICE_ITEM_BY_BARCODE_ENDPOINT = "/master-lookups/item-by-barcode";

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

/** ui_table 56 "PURCHASE INVOICE - LINES". */
export const LINE_GRID_UI_TABLE_KEY: UiTableKey = "purchaseInvoiceLines";
/** Dropdown 35 SUPPLIERS — `sup_id` / `sup_name`. */
export const SUPPLIER_DROPDOWN_KEY: ConfiguredDropdownKey = "supplier";
/** Dropdown 26 GODOWNS — `gdl_id` / `gdl_name`, narrowed by `ibranch_id`. */
export const GODOWN_DROPDOWN_KEY: ConfiguredDropdownKey = "godown";

/** The DOM name the line grid's cells carry for the shared Enter walk. */
export const LINE_GRID_NAME = "purchase-invoice-lines";

/** Qt `m_recalc->setInterval(350)`. */
export const RECALC_DELAY_MS = 350;

// ---------------------------------------------------------------------------
// The line grid — ui_table 56, columns by `ui_tbl_clm_no`
// ---------------------------------------------------------------------------

/**
 * `PurchaseInvoiceCols`. ui_table 56 has grown to 45 columns since (Sell A–D,
 * Size / Colour, Markup …); this port shows only the ones the Qt screen of
 * 3ce8487 knows — 0 to 18 — and keeps 19–23 as line fields, never columns.
 */
export const COL = {
  Barcode: 0,
  Item: 1,
  Unit: 2,
  Batch: 3,
  Expiry: 4,
  Billed: 5,
  Recd: 6,
  Dmg: 7,
  Short: 8,
  Free: 9,
  Rate: 10,
  DiscPct: 11,
  Taxable: 12,
  GstPct: 13,
  Tax: 14,
  Total: 15,
  CostWot: 16,
  Mrp: 17,
  Check: 18,
} as const;

export type LineColumnNo = (typeof COL)[keyof typeof COL];

/** The columns this screen draws, in their Qt order. */
export const SHOWN_COLUMNS: readonly LineColumnNo[] = [
  COL.Barcode,
  COL.Item,
  COL.Unit,
  COL.Batch,
  COL.Expiry,
  COL.Billed,
  COL.Recd,
  COL.Dmg,
  COL.Short,
  COL.Free,
  COL.Rate,
  COL.DiscPct,
  COL.Taxable,
  COL.GstPct,
  COL.Tax,
  COL.Total,
  COL.CostWot,
  COL.Mrp,
  COL.Check,
];

/** `PurchaseInvoiceCols::isEditable` — the Item cell opens the item list, never an editor. */
export const EDITABLE_COLUMNS: ReadonlySet<number> = new Set([
  COL.Barcode,
  COL.Item,
  COL.Batch,
  COL.Expiry,
  COL.Billed,
  COL.Recd,
  COL.Dmg,
  COL.Free,
  COL.Rate,
  COL.DiscPct,
  COL.Mrp,
]);

/** `PurchaseInvoiceCols::isNumber` — right-aligned. */
export const NUMBER_COLUMNS: ReadonlySet<number> = new Set([
  COL.Billed,
  COL.Recd,
  COL.Dmg,
  COL.Short,
  COL.Free,
  COL.Rate,
  COL.DiscPct,
  COL.Taxable,
  COL.GstPct,
  COL.Tax,
  COL.Total,
  COL.CostWot,
  COL.Mrp,
]);

/** Qt `setFocusStops({ Barcode, Item, Billed, Rate, DiscPct })` — where Enter stops. */
export const FOCUS_STOPS: ReadonlySet<number> = new Set([COL.Barcode, COL.Item, COL.Billed, COL.Rate, COL.DiscPct]);

/** Titles and Qt widths for a layout that has not arrived (or lacks a row). */
export const FALLBACK_COLUMN_TITLES: Readonly<Record<number, string>> = {
  [COL.Barcode]: "Barcode",
  [COL.Item]: "Item",
  [COL.Unit]: "Unit",
  [COL.Batch]: "Batch / Serial",
  [COL.Expiry]: "Expiry",
  [COL.Billed]: "Billed",
  [COL.Recd]: "Recd",
  [COL.Dmg]: "Dmg",
  [COL.Short]: "Short",
  [COL.Free]: "Free",
  [COL.Rate]: "Rate",
  [COL.DiscPct]: "Disc %",
  [COL.Taxable]: "Taxable",
  [COL.GstPct]: "GST %",
  [COL.Tax]: "Tax",
  [COL.Total]: "Total",
  [COL.CostWot]: "Cost w/o tax",
  [COL.Mrp]: "MRP",
  [COL.Check]: "Check",
};

export const FALLBACK_COLUMN_WIDTHS: Readonly<Record<number, number>> = {
  [COL.Barcode]: 4,
  [COL.Item]: 9,
  [COL.Unit]: 3,
  [COL.Batch]: 5,
  [COL.Expiry]: 4,
  [COL.Billed]: 4,
  [COL.Recd]: 3,
  [COL.Dmg]: 3,
  [COL.Short]: 3,
  [COL.Free]: 3,
  [COL.Rate]: 4,
  [COL.DiscPct]: 4,
  [COL.Taxable]: 5,
  [COL.GstPct]: 3,
  [COL.Tax]: 4,
  [COL.Total]: 5,
  [COL.CostWot]: 6,
  [COL.Mrp]: 4,
  [COL.Check]: 5,
};

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/** F1 — the grid's own keys, under "Lines". */
export const LINE_KEYS: readonly TxnKeyRow[] = [
  { label: "Item list (type a name in Barcode)", keyText: "↓" },
  { label: "Item list (on Item)", keyText: "Enter / type" },
  { label: "Add a line", keyText: "+" },
  { label: "Remove a line", keyText: "−" },
  { label: "Next cell", keyText: "Enter" },
  { label: "Leave the grid", keyText: "Tab" },
];

/**
 * The document keys the Qt screen binds (`TxnKeys::bind`: New, Save Draft,
 * Post, Cancel, Show List, Close) — plus Edit, which the web's read-only
 * opening of a draft needs.
 */
export const KEY_SHEET = keySheetRows(["new", "saveDraft", "post", "edit", "cancelDoc", "open", "close"], LINE_KEYS);

export const STATUS = {
  draft: "DRAFT",
  posted: "POSTED",
  cancelled: "CANCELLED",
} as const;
