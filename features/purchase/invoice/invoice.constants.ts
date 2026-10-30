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
/** R4: a supplier's posted GRN lines not billed yet. */
export const PURCHASE_INVOICE_GRN_LINES_ENDPOINT = "/purchase/invoices/grn-lines";
/** DOC-04: a supplier's confirmed PO lines with qty pending. */
export const PURCHASE_INVOICE_PO_LINES_ENDPOINT = "/purchase/orders/pending-lines";
/** B9: last purchases, PO rate, stock, prices, the supplier's code and scheme. */
export const PURCHASE_INVOICE_ITEM_CONTEXT_ENDPOINT = "/purchase/lookup/item-context";
/** F4: the item's next unit (`{ item_id, iuc_id }`). */
export const PURCHASE_INVOICE_SWITCH_UOM_ENDPOINT = "/master-lookups/item-switch-uom";
/** ENT-16: an unknown barcode saved as the picked item's EAN. */
export const PURCHASE_INVOICE_EAN_CREATE_ENDPOINT = "/item-ean-codes/create";

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

/** ui_table 56 "PURCHASE INVOICE - LINES". */
export const LINE_GRID_UI_TABLE_KEY: UiTableKey = "purchaseInvoiceLines";
/** Dropdown 35 SUPPLIERS — `sup_id` / `sup_name`. */
export const SUPPLIER_DROPDOWN_KEY: ConfiguredDropdownKey = "supplier";
/** Dropdown 26 GODOWNS — `gdl_id` / `gdl_name`, narrowed by `ibranch_id`. */
export const GODOWN_DROPDOWN_KEY: ConfiguredDropdownKey = "godown";
/** Dropdowns 70 / 71 ITEM SIZES / ITEM COLOURS — the textile pick-lists (`isz_*` / `icl_*`). */
export const SIZE_DROPDOWN_KEY: ConfiguredDropdownKey = "itemSize";
export const COLOUR_DROPDOWN_KEY: ConfiguredDropdownKey = "itemColour";

/** The DOM name the line grid's cells carry for the shared Enter walk. */
export const LINE_GRID_NAME = "purchase-invoice-lines";

/** Qt `m_recalc->setInterval(350)`. */
export const RECALC_DELAY_MS = 350;

// ---------------------------------------------------------------------------
// The line grid — ui_table 56, columns by `ui_tbl_clm_no`
// ---------------------------------------------------------------------------

/**
 * `PurchaseInvoiceCols` (NexERP e0c56ef) — ui_table 56's 45 columns. The
 * hidden ones (ItemId … CostTyped) are line fields here, never columns.
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
  // 19–23 ItemId, UomId, Factor, Signature, LineId: line fields.
  /** "PO / GRN" — the source document's number (R4 / DOC-04). */
  Grn: 24,
  // 25–27 GrnItemId, GrnYear, Allocs: line fields.
  Size: 28,
  // 29 SizeId
  Colour: 30,
  // 31 ColourId
  Model: 32,
  SellA: 33,
  SellB: 34,
  SellC: 35,
  SellD: 36,
  // 37–38 PoItemId, PoYear: line fields.
  SchPct: 39,
  ExtraDisc: 40,
  CostIncl: 41,
  // 42 CostTyped: a line field.
  Markup: 43,
  Itc: 44,
} as const;

export type LineColumnNo = (typeof COL)[keyof typeof COL];

/**
 * The columns this screen can draw, in the mockup's order (Qt `applyColumns`
 * moveSection list, 2026-10-29 rebuild): # Barcode Item Unit [Model Size Colour]
 * Batch/Serial Expiry Billed Recd Dmg Short Free Rate Disc [Sch% Extra disc]
 * Taxable GST% ITC Tax Total Cost w/o [Cost incl.] [Markup% Sell A Sell B–D]
 * MRP [PO / GRN ref] Check. Qt forces this order whatever the layout says.
 */
export const SHOWN_COLUMNS: readonly LineColumnNo[] = [
  COL.Barcode,
  COL.Item,
  COL.Unit,
  COL.Model,
  COL.Size,
  COL.Colour,
  COL.Batch,
  COL.Expiry,
  COL.Billed,
  COL.Recd,
  COL.Dmg,
  COL.Short,
  COL.Free,
  COL.Rate,
  COL.DiscPct,
  COL.SchPct,
  COL.ExtraDisc,
  COL.Taxable,
  COL.GstPct,
  COL.Itc,
  COL.Tax,
  COL.Total,
  COL.CostWot,
  COL.CostIncl,
  COL.Markup,
  COL.SellA,
  COL.SellB,
  COL.SellC,
  COL.SellD,
  COL.Mrp,
  COL.Grn,
  COL.Check,
];

/**
 * "More columns" (mockup callout 10, Qt `moreColumns()`), in the mockup's
 * order. `column: null` = the mockup names it but ui_table 56 has no such
 * column yet — shown greyed, not pickable. Sell B–D only while the bill keys
 * selling prices.
 */
export const MORE_COLUMNS: readonly { key: string; label: string; column: LineColumnNo | null }[] = [
  { key: "gross", label: "Gross", column: null },
  { key: "discAmt", label: "Disc ₹", column: null },
  { key: "schPct", label: "Sch %", column: COL.SchPct },
  { key: "extraDisc", label: "Extra disc", column: COL.ExtraDisc },
  { key: "costIncl", label: "Cost incl.", column: COL.CostIncl },
  { key: "cessPct", label: "Cess %", column: null },
  { key: "cessUnit", label: "Cess / unit", column: null },
  { key: "mfg", label: "Mfg date", column: null },
  { key: "godown", label: "Godown", column: null },
  { key: "weight", label: "Weight", column: null },
  { key: "sellB", label: "Sell B", column: COL.SellB },
  { key: "sellC", label: "Sell C", column: COL.SellC },
  { key: "sellD", label: "Sell D", column: COL.SellD },
  { key: "oldPrices", label: "Old prices", column: null },
  { key: "poGrnRef", label: "PO / GRN ref", column: COL.Grn },
  { key: "remarks", label: "Remarks", column: null },
];

/** The columns hidden until picked under More columns. */
export const MORE_COLUMN_NOS: ReadonlySet<number> = new Set(
  MORE_COLUMNS.map((m) => m.column).filter((c): c is LineColumnNo => c !== null),
);

/** Where the choice is kept (Qt QSettings purchaseInvoice/moreColumns/<user>). */
export const MORE_COLUMNS_SCREEN_KEY = "purchaseInvoice";

/**
 * The mockup's headings where ui_table 56 words them differently (Qt
 * `applyHeaderTitles` — these win over the registration's titles).
 */
export const MOCKUP_COLUMN_TITLES: Readonly<Record<number, string>> = {
  [COL.Batch]: "Batch / Serial",
  [COL.DiscPct]: "Disc",
  [COL.GstPct]: "GST%",
  [COL.CostWot]: "Cost w/o",
  [COL.Markup]: "Markup%",
  [COL.Grn]: "PO / GRN ref",
  [COL.Model]: "Model / design",
};

/** Shown only while the bill keys selling prices (Qt `applyTextileColumns`: `m_priceUpdate`). */
export const PRICE_COLUMNS: ReadonlySet<number> = new Set([COL.SellA, COL.SellB, COL.SellC, COL.SellD, COL.Markup]);
/** Shown only while the company numbers its own batches (`m_autoBatchNo`). */
export const TEXTILE_COLUMNS: ReadonlySet<number> = new Set([COL.Size, COL.Colour, COL.Model]);

/**
 * `PurchaseInvoiceCols::isEditable` — the Item cell opens the item list, never
 * an editor; Size / Colour open their pick-list (not in this set).
 */
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
  COL.Model,
  COL.SellA,
  COL.SellB,
  COL.SellC,
  COL.SellD,
  COL.SchPct,
  COL.ExtraDisc,
  COL.CostIncl,
  COL.Markup,
]);

/** What a GRN line still keys (Qt edit predicate on `rowFromGrn`): the supplier's figures only. */
export const GRN_LINE_COLUMNS: ReadonlySet<number> = new Set([
  COL.Billed,
  COL.Rate,
  COL.DiscPct,
  COL.SchPct,
  COL.ExtraDisc,
  COL.CostIncl,
  COL.Markup,
  COL.SellA,
  COL.SellB,
  COL.SellC,
  COL.SellD,
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
  COL.SellA,
  COL.SellB,
  COL.SellC,
  COL.SellD,
  COL.SchPct,
  COL.ExtraDisc,
  COL.CostIncl,
  COL.Markup,
]);

/**
 * `PurchaseInvoiceCols::takesExpression` — money cells that take a little sum
 * (12/2, 3*45.5 — ENT-05) or, in Sell A–D, "10%" = MRP less 10 % (ENT-19).
 */
export const EXPRESSION_COLUMNS: ReadonlySet<number> = new Set([
  COL.Rate,
  COL.CostIncl,
  COL.ExtraDisc,
  COL.Mrp,
  COL.SellA,
  COL.SellB,
  COL.SellC,
  COL.SellD,
]);

export const SELL_COLUMNS: ReadonlySet<number> = new Set([COL.SellA, COL.SellB, COL.SellC, COL.SellD]);

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
  [COL.Grn]: "PO / GRN",
  [COL.Size]: "Size",
  [COL.Colour]: "Colour",
  [COL.Model]: "Model",
  [COL.SellA]: "Sell A",
  [COL.SellB]: "Sell B",
  [COL.SellC]: "Sell C",
  [COL.SellD]: "Sell D",
  [COL.SchPct]: "Sch %",
  [COL.ExtraDisc]: "Extra disc",
  [COL.CostIncl]: "Cost incl.",
  [COL.Markup]: "Markup %",
  [COL.Itc]: "ITC",
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
  [COL.Grn]: 4,
  [COL.Size]: 3,
  [COL.Colour]: 4,
  [COL.Model]: 5,
  [COL.SellA]: 5,
  [COL.SellB]: 5,
  [COL.SellC]: 5,
  [COL.SellD]: 5,
  [COL.SchPct]: 3,
  [COL.ExtraDisc]: 5,
  [COL.CostIncl]: 5,
  [COL.Markup]: 5,
  [COL.Itc]: 4,
};

/** Qt `m_stripTimer->setInterval(200)` — the item strip follows the cursor this long after it settles. */
export const ITEM_STRIP_DELAY_MS = 200;

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
  { label: "Batches / serials of the line", keyText: "F12" },
  { label: "The line's next unit", keyText: "F4" },
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
