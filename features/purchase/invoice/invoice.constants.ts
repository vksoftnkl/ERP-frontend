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
 * `PurchaseInvoiceCols` (NexERP dd59c2c) — ui_table 56's 54 columns (45–53 by
 * server migration 20261102140000). The hidden ones (ItemId … CostTyped) are
 * line fields here, never columns.
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
  /** The server's `amount`: taxable + GST + the after-tax charge share (P10). */
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
  /** Markup A — Sell A's markup % on the cost without tax (ENT-18). */
  Markup: 43,
  Itc: 44,
  // ── 2026-11-02 (Qt dd59c2c P7–P10) ──
  /** Disc as an amount: typing it clears Disc %, and the other way round (P7). */
  DiscAmt: 45,
  /** Sch as an amount (P7). */
  SchAmt: 46,
  /** The item's HSN (the server's `hsn`; read-only, P9). */
  Hsn: 47,
  /** The line's MSP, sent as minPrice (P9). */
  Msp: 48,
  /** Sell B–D's markups, as Markup A (P8). */
  MarkupB: 49,
  MarkupC: 50,
  MarkupD: 51,
  /** The line's share of the bill's charges (the server's, P10). */
  ChrgBeforeTax: 52,
  ChrgAfterTax: 53,
} as const;

export type LineColumnNo = (typeof COL)[keyof typeof COL];

/**
 * Every column this screen can draw. Which of them show, in what order and
 * under what title is ui_table 56's (Qt dd59c2c P4: no "More columns" chooser) —
 * the screen only takes away what its settings rule out (`PRICE_COLUMNS`,
 * `TEXTILE_COLUMNS`). The technical columns (19–23, 25–27, 29, 31, 37, 38, 42)
 * are never drawn.
 */
export const DRAWN_COLUMNS: ReadonlySet<number> = new Set<number>(Object.values(COL));

/**
 * The order before (or without) the layout — ui_table 56's own registration
 * (server Ui_Table_Columns.sql, positions 0–40). Qt shows every column then
 * (`m_layoutKnown` false), the rules aside.
 */
export const FALLBACK_ORDER: readonly LineColumnNo[] = [
  COL.Barcode,
  COL.Item,
  COL.Hsn,
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
  COL.DiscAmt,
  COL.SchPct,
  COL.SchAmt,
  COL.ExtraDisc,
  COL.ChrgBeforeTax,
  COL.Taxable,
  COL.GstPct,
  COL.Itc,
  COL.Tax,
  COL.ChrgAfterTax,
  COL.Total,
  COL.CostWot,
  COL.CostIncl,
  COL.Mrp,
  COL.Msp,
  COL.Markup,
  COL.SellA,
  COL.MarkupB,
  COL.SellB,
  COL.MarkupC,
  COL.SellC,
  COL.MarkupD,
  COL.SellD,
  COL.Check,
  COL.Grn,
];

/** Sell A–D and their markups: shown and keyed only while the bill writes prices (purchase.allow_price_update + UPDATE_PRICES). */
export const PRICE_COLUMNS: ReadonlySet<number> = new Set([
  COL.SellA,
  COL.SellB,
  COL.SellC,
  COL.SellD,
  COL.Markup,
  COL.MarkupB,
  COL.MarkupC,
  COL.MarkupD,
]);
/** Shown only while the company numbers its own batches (`m_autoBatchNo`). */
export const TEXTILE_COLUMNS: ReadonlySet<number> = new Set([COL.Size, COL.Colour, COL.Model]);

export const SELL_COLUMNS: ReadonlySet<number> = new Set([COL.SellA, COL.SellB, COL.SellC, COL.SellD]);
export const MARKUP_COLUMNS: ReadonlySet<number> = new Set([COL.Markup, COL.MarkupB, COL.MarkupC, COL.MarkupD]);

/** One price level: its Sell and Markup columns and the keys the server answers / takes (Qt `paintServerLine` levels). */
export type PriceLevel = {
  level: "A" | "B" | "C" | "D";
  sell: number;
  markup: number;
};
export const PRICE_LEVELS: readonly PriceLevel[] = [
  { level: "A", sell: COL.SellA, markup: COL.Markup },
  { level: "B", sell: COL.SellB, markup: COL.MarkupB },
  { level: "C", sell: COL.SellC, markup: COL.MarkupC },
  { level: "D", sell: COL.SellD, markup: COL.MarkupD },
];

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
  COL.DiscAmt,
  COL.Mrp,
  COL.Msp,
  COL.Model,
  ...SELL_COLUMNS,
  ...MARKUP_COLUMNS,
  COL.SchPct,
  COL.SchAmt,
  COL.ExtraDisc,
  COL.CostIncl,
]);

/** What a GRN line still keys (Qt edit predicate on `rowFromGrn`): the supplier's figures only. */
export const GRN_LINE_COLUMNS: ReadonlySet<number> = new Set([
  COL.Billed,
  COL.Rate,
  COL.DiscPct,
  COL.DiscAmt,
  COL.SchPct,
  COL.SchAmt,
  COL.ExtraDisc,
  COL.CostIncl,
  COL.Msp,
  ...MARKUP_COLUMNS,
  ...SELL_COLUMNS,
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
  COL.DiscAmt,
  COL.Taxable,
  COL.GstPct,
  COL.Tax,
  COL.Total,
  COL.CostWot,
  COL.Mrp,
  COL.Msp,
  ...SELL_COLUMNS,
  ...MARKUP_COLUMNS,
  COL.SchPct,
  COL.SchAmt,
  COL.ExtraDisc,
  COL.CostIncl,
  COL.ChrgBeforeTax,
  COL.ChrgAfterTax,
]);

/**
 * `PurchaseInvoiceCols::takesExpression` — money cells that take a little sum
 * (12/2, 3*45.5 — ENT-05) or, in Sell A–D, "10%" = MRP less 10 % (ENT-19).
 */
export const EXPRESSION_COLUMNS: ReadonlySet<number> = new Set([
  COL.Rate,
  COL.CostIncl,
  COL.ExtraDisc,
  COL.DiscAmt,
  COL.SchAmt,
  COL.Mrp,
  COL.Msp,
  ...SELL_COLUMNS,
]);

/**
 * `PurchaseInvoiceCols::isServerFigure` — the server's figures a line keeps from
 * its last answer while an edit waits for the next one (muted meanwhile, P10 / P11).
 */
export const SERVER_FIGURE_COLUMNS: ReadonlySet<number> = new Set([COL.ChrgBeforeTax, COL.ChrgAfterTax, COL.CostWot]);

/**
 * Qt dd59c2c P15 `setFocusStops` — where Enter stops: Item → [Batch → Expiry]
 * → Billed → Free → Rate → Disc % → Sch % → Extra disc → the next line
 * (`lineStopOf` narrows it per line).
 */
export const FOCUS_STOPS: ReadonlySet<number> = new Set([
  COL.Item,
  COL.Batch,
  COL.Expiry,
  COL.Billed,
  COL.Free,
  COL.Rate,
  COL.DiscPct,
  COL.SchPct,
  COL.ExtraDisc,
]);

/** Titles for a layout that has not arrived (or lacks a row) — ui_table 56's own. */
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
  [COL.GstPct]: "GST%",
  [COL.Tax]: "Tax",
  [COL.Total]: "Total",
  [COL.CostWot]: "Cost w/o",
  [COL.Mrp]: "MRP",
  [COL.Check]: "Check",
  [COL.Grn]: "PO / GRN ref",
  [COL.Size]: "Size",
  [COL.Colour]: "Colour",
  [COL.Model]: "Model / design",
  [COL.SellA]: "Sell A",
  [COL.SellB]: "Sell B",
  [COL.SellC]: "Sell C",
  [COL.SellD]: "Sell D",
  [COL.SchPct]: "Sch %",
  [COL.ExtraDisc]: "Extra disc",
  [COL.CostIncl]: "Cost incl.",
  [COL.Markup]: "Markup A",
  [COL.Itc]: "ITC",
  [COL.DiscAmt]: "Disc",
  [COL.SchAmt]: "Sch",
  [COL.Hsn]: "HSN",
  [COL.Msp]: "MSP",
  [COL.MarkupB]: "Markup B",
  [COL.MarkupC]: "Markup C",
  [COL.MarkupD]: "Markup D",
  [COL.ChrgBeforeTax]: "Chrg before tax",
  [COL.ChrgAfterTax]: "Chrg after tax",
};

/**
 * Qt dd59c2c `ColumnWeights` with `setPixelFloor`: the PIXELS each column needs
 * (headings of two words on two lines). A grid wider than their sum shares the
 * spare out by them; a narrower one keeps each column at its pixels and scrolls
 * sideways. The layout's widths are not read — Qt's weights win.
 */
export const COLUMN_PX: Readonly<Record<number, number>> = {
  [COL.Barcode]: 70,
  [COL.Item]: 150,
  [COL.Hsn]: 80,
  [COL.Unit]: 58,
  [COL.Model]: 80,
  [COL.Size]: 48,
  [COL.Colour]: 56,
  [COL.Batch]: 86,
  [COL.Expiry]: 78,
  [COL.Billed]: 56,
  [COL.Recd]: 50,
  [COL.Dmg]: 48,
  [COL.Short]: 50,
  [COL.Free]: 48,
  [COL.Rate]: 68,
  [COL.DiscPct]: 50,
  [COL.DiscAmt]: 60,
  [COL.SchPct]: 50,
  [COL.SchAmt]: 60,
  [COL.ExtraDisc]: 56,
  [COL.ChrgBeforeTax]: 78,
  [COL.Taxable]: 80,
  [COL.GstPct]: 48,
  [COL.Itc]: 62,
  [COL.Tax]: 70,
  [COL.ChrgAfterTax]: 78,
  [COL.Total]: 82,
  [COL.CostWot]: 62,
  [COL.CostIncl]: 62,
  [COL.Mrp]: 58,
  [COL.Msp]: 58,
  [COL.Markup]: 56,
  [COL.SellA]: 64,
  [COL.MarkupB]: 56,
  [COL.SellB]: 64,
  [COL.MarkupC]: 56,
  [COL.SellC]: 64,
  [COL.MarkupD]: 56,
  [COL.SellD]: 64,
  [COL.Grn]: 72,
  [COL.Check]: 96,
};
/** Qt's fallback weight for a column it names no pixels for. */
export const COLUMN_PX_FALLBACK = 60;
/** Qt `ColumnWeights` minW. */
export const COLUMN_PX_MIN = 34;

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
