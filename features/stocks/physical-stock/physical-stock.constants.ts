/**
 * Physical Stock Update (menu 45) — the fixed vocabulary of the screen, ported
 * from the Qt `PhysicalStockEntry` / `PhysicalStockCols` / `TxnDocTypes::
 * physicalStock()` trio. Nothing here talks to the network.
 */
import type { ConfiguredDropdownKey } from "@/lib/configured-dropdowns";
import type { ConfiguredGridKey } from "@/lib/configured-grids";
import type { UiTableKey } from "@/lib/ui-tables";

// ---------------------------------------------------------------------------
// Routes — `/api/v1` is the base query's, never spelled here.
// ---------------------------------------------------------------------------

export const PHYSICAL_STOCK_ENDPOINTS = {
  create: "/stock/physical/create",
  get: "/stock/physical/get",
  validate: "/stock/physical/validate",
  post: "/stock/physical/post",
  cancel: "/stock/physical/cancel",
  /** One row per godown × lot × bucket, straight off stock_balance. */
  countSheet: "/stock/physical/count-sheet",
  /** The scan path's first hop: symbol → item. */
  itemByBarcode: "/master-lookups/item-by-barcode",
  /** The configured-grid runner the two line pickers read through. */
  gridRun: "/configured-grid-sql/run",
} as const;

// ---------------------------------------------------------------------------
// Registry keys — the numbers the Qt screen hard-codes, by name.
// ---------------------------------------------------------------------------

/** "MAIN LIST - PHYSICAL STOCK" — grid 101, what menu 45 opens. */
export const PHYSICAL_STOCK_LIST_GRID_KEY: ConfiguredGridKey = "physicalStockList";
/** "POPUP - STOCK REASONS" — grid 102, the per-line reason picker. */
export const STOCK_REASON_POPUP_GRID_KEY: ConfiguredGridKey = "stockReasonPopup";
/** "POPUP - ITEMS" — grid 71, the same item search every voucher opens. */
export const ITEM_POPUP_GRID_KEY: ConfiguredGridKey = "itemPickerPopup";
/** "PHYSICAL STOCK - LINES" — ui table 28, 30 columns in PhysicalStockCols order. */
export const PHYSICAL_STOCK_LINES_UI_TABLE_KEY: UiTableKey = "physicalStockLines";
/** "GODOWNS" — dropdown 26. */
export const GODOWN_DROPDOWN_KEY: ConfiguredDropdownKey = "godown";
/** "STOCK REASONS" — dropdown 50, filtered to PHYSICAL_* server-side. */
export const STOCK_REASON_DROPDOWN_KEY: ConfiguredDropdownKey = "stockReason";

/** What the server stamps on `stock_voucher` audit rows for this type. */
export const PHYSICAL_STOCK_AUDIT_SCREEN = "Physical Stock Count";

// ---------------------------------------------------------------------------
// The line grid's column numbers — `PhysicalStockCols`, verbatim.
//
// A column NUMBER is the slot the layout's `ui_tbl_clm_no` joins on, so these
// are never renumbered; where a column APPEARS is `ui_tbl_clm_column_position`'s
// job. Barcode is 29 for exactly that reason.
// ---------------------------------------------------------------------------

export const PhysicalStockCols = {
  Id: 0,
  LineNo: 1,
  ItemCode: 2,
  Description: 3,
  UomName: 4,
  BatchNo: 5,
  ExpiryDate: 6,
  Mrp: 7,
  SerialNo: 8,
  SupplierName: 9,
  Bucket: 10,
  BookQty: 11,
  CountedQty: 12,
  DiffQty: 13,
  AvgCostRate: 14,
  DiffValue: 15,
  ReasonName: 16,
  Remarks: 17,
  ItemId: 18,
  LotId: 19,
  GodownId: 20,
  GodownName: 21,
  BaseUomId: 22,
  SupplierId: 23,
  ReasonId: 24,
  SplitNo: 25,
  MfgDate: 26,
  SalePrice: 27,
  StockValue: 28,
  Barcode: 29,
} as const;

export const PHYSICAL_STOCK_COLUMN_COUNT = 30;

/** The three columns a blind count hides — the ones that give the book figure away. */
export const BLIND_HIDDEN_COLUMNS: readonly number[] = [
  PhysicalStockCols.BookQty,
  PhysicalStockCols.DiffQty,
  PhysicalStockCols.DiffValue,
];

// ---------------------------------------------------------------------------
// Header vocabularies
// ---------------------------------------------------------------------------

/**
 * What `svh_rate_source` may be. AVG_COST FIRST: found stock is worth what the
 * rest of that item is worth, and nobody can say what three bags discovered on
 * a shelf cost. Only the OVERAGE side reads it.
 */
export const RATE_SOURCES = ["AVG_COST", "LAST_PURCHASE", "LOT_COST", "MRP", "MANUAL"] as const;
export type RateSource = (typeof RATE_SOURCES)[number];
export const DEFAULT_RATE_SOURCE: RateSource = "AVG_COST";

/** ck_svi_bucket — display only on a count: the bucket is part of the holding. */
export const STOCK_BUCKETS = ["SALEABLE", "DAMAGED", "QUARANTINE", "EXPIRED", "SAMPLE"] as const;

export const STATUS_DRAFT = "DRAFT";
export const STATUS_POSTED = "POSTED";
export const STATUS_CANCELLED = "CANCELLED";

/** The cancel prompt's presets — the same five on the screen and on the list. */
export const CANCEL_REASON_PRESETS: readonly string[] = [
  "Counted against the wrong godown",
  "Counting error — the sheet was wrong",
  "Counted before an unposted receipt was entered",
  "Counted twice — duplicate sheet",
  "Superseded by a recount",
];

/** A freeze window defaults to "now, for the next three hours". */
export const DEFAULT_FREEZE_HOURS = 3;

/** The count sheet is paged server-side (default 200, max 1000). */
export const COUNT_SHEET_PAGE_SIZE = 1000;
/** A runaway guard on the page walk — 50 000 holdings is no godown anybody walks. */
export const COUNT_SHEET_MAX_PAGES = 50;

/** The list's default window — `defaultDaysBack` on the Qt descriptor. */
export const LIST_DEFAULT_DAYS_BACK = 30;

/** A castable uuid, so a pre-context list request comes back empty instead of failing. */
export const NO_TENANT_ID = "00000000-0000-0000-0000-000000000000";
