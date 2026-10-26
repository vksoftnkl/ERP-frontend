/**
 * Opening Stock (menu 44) — the fixed vocabulary of the screen.
 *
 * Ported from the Qt screen (`inventory/stock/opening/`): the column numbers
 * are `OpeningStockCols` in `opening_stock_entity.h`, the lists are its
 * `buckets()` / `rateSources()` / `cancelReasons()`, and the routes are
 * `ApiEndpoints::OpeningStock` in `api_endpoints.h`.
 *
 * ── There is no opening stock table ───────────────────────────────────────
 * The screen writes `stock.stock_voucher` (header) and
 * `stock.stock_voucher_item` (lines); what makes a voucher an OPENING is the
 * route it is saved through, which pins `svh_voucher_type`.
 */

// ── Routes (API_BASE already carries `/api/v1`) ───────────────────────────
export const OPENING_STOCK_CREATE_ENDPOINT = "/stock/opening/create";
export const OPENING_STOCK_GET_ENDPOINT = "/stock/opening/get";
export const OPENING_STOCK_CANCEL_ENDPOINT = "/stock/opening/cancel";
/** One round trip fills a line: unit, base unit, factor, tax and the tracking signature. */
export const OPENING_STOCK_ITEM_LOOKUP_ENDPOINT = "/stock/opening/item-lookup";
/** A scanned EAN → item + the unit it was registered against (an iuc_id). */
export const ITEM_BY_BARCODE_ENDPOINT = "/master-lookups/item-by-barcode";
/** The configured dropdowns' rows — the Size and Colour lists. */
export const DROPDOWN_RUN_ENDPOINT = "/dropdown-details/run";
export const CONFIGURED_GRID_RUN_ENDPOINT = "/configured-grid-sql/run";

/** `MAIN LIST - OPENING STOCK` — grid 99, the list menu 44 opens on. */
export const OPENING_STOCK_LIST_GRID_KEY = "openingStockList" as const;
/** `POPUP - ITEMS` — grid 71, the same item search every voucher screen opens. */
export const ITEM_PICKER_GRID_KEY = "itemPickerPopup" as const;
/** `POPUP - SUPPLIERS` — grid 100, the Supplier cell's picker. */
export const SUPPLIER_PICKER_GRID_KEY = "supplierPickerPopup" as const;
/** `OPENING STOCK - LINES` — ui table 27, the line grid's column layout. */
export const OPENING_STOCK_LINES_UI_TABLE_KEY = "openingStockLines" as const;
/** `GODOWNS` — dropdown 26, the header godown (the same one Branch Master's default godown uses). */
export const GODOWN_DROPDOWN_KEY = "godown" as const;
/** `ITEM SIZES` / `ITEM COLOURS` — dropdowns 70 / 71, the Size and Colour cells' lists. */
export const SIZE_DROPDOWN_KEY = "itemSize" as const;
export const COLOUR_DROPDOWN_KEY = "itemColour" as const;
/** `/dropdown-details/run` caps `limit` at 100, so a long list is read page by page. */
export const CHOICE_PAGE_SIZE = 100;
/**
 * A stop for the page walk: a server that ignored `page` would hand back the
 * same full page for ever (Qt has no stop). 50 pages is 5 000 sizes.
 */
export const CHOICE_MAX_PAGES = 50;

/** The grid name the Enter walker (`grid-focus.ts`) knows the line grid by. */
export const OPENING_STOCK_GRID_NAME = "openingStockLines";

// ── The line grid's columns — `OpeningStockCols`, by number ───────────────
/**
 * A column NUMBER is the key `ui_table_columns.ui_tbl_clm_no` joins on, so the
 * layout (name, width, visibility, position, focus) is matched to a column by
 * this number and nothing else — the same join `NexTable::applyLayout()` makes.
 * `SupplierName` and `CostRate` were APPENDED (37, 38) rather than inserted, for
 * exactly that reason; where a column APPEARS is the layout's position.
 */
export const OS_COL = {
  Id: 0,
  LineNo: 1,
  SplitNo: 2,
  Barcode: 3,
  ItemCode: 4,
  Description: 5,
  UomName: 6,
  Qty: 7,
  FreeQty: 8,
  BatchNo: 9,
  MfgDate: 10,
  ExpiryDate: 11,
  Mrp: 12,
  SalePrice: 13,
  SerialNo: 14,
  Bucket: 15,
  CostPerUnit: 16,
  TaxPerc: 17,
  CostRateWot: 18,
  LandedRate: 19,
  WeightQty: 20,
  Value: 21,
  ValueWot: 22,
  TrackedBy: 23,
  Remarks: 24,
  ItemId: 25,
  UomId: 26,
  BaseUomId: 27,
  ToBaseFactor: 28,
  BaseQty: 29,
  FreeBaseQty: 30,
  GodownId: 31,
  GodownName: 32,
  LotId: 33,
  SupplierId: 34,
  DecimalCount: 35,
  TrackSignature: 36,
  SupplierName: 37,
  CostRate: 38,
  // ── Textile: what the batch IS (Qt 74b755c, plan-textile-auto-batch-2 E2) ──
  // Appended for the same reason SupplierName was. Shown only while the
  // company numbers its own batches (`stock.auto_batch_no`); ui table 27 puts
  // them straight after Batch No.
  SizeName: 39,
  /**
   * The Qt grid keeps the id beside its name as a hidden cell; here it is the
   * line's `sizeId` field and never a column. The number stays reserved, as
   * ColourId and BatchTyped do: a layout row keyed 40 must not land on
   * something else one day.
   */
  SizeId: 40,
  ColourName: 41,
  ColourId: 42,
  Model: 43,
  /** "1" once the operator TYPED the batch number — the line's `batchTyped`. */
  BatchTyped: 44,
} as const;

/** Qt `OpeningStockCols::ColumnCount`. */
export const OS_COLUMN_COUNT = 45;

/**
 * The slots the Qt grid holds as hidden cells and this screen holds as line
 * fields (`sizeId`, `colourId`, `batchTyped`) — the only numbers below
 * `OS_COLUMN_COUNT` with no column meaning.
 */
export const OS_LINE_FIELD_SLOTS: readonly number[] = [OS_COL.SizeId, OS_COL.ColourId, OS_COL.BatchTyped];

// ── Tracking signature letters ────────────────────────────────────────────
/**
 * `stp_track_signature` — the database's own encoding, read letter by letter.
 * Spelled here once so no caller writes a bare `"B"`.
 */
export const TRACK = {
  Batch: "B",
  Mrp: "M",
  SalePrice: "S",
  Expiry: "E",
  Serial: "R",
  Supplier: "P",
  Nothing: "N",
} as const;

export type TrackFacet = (typeof TRACK)[keyof typeof TRACK];

// ── Lists ─────────────────────────────────────────────────────────────────
/** The five buckets `ck_svi_bucket` allows. */
export const STOCK_BUCKETS = ["SALEABLE", "DAMAGED", "QUARANTINE", "EXPIRED", "SAMPLE"] as const;
export type StockBucket = (typeof STOCK_BUCKETS)[number];
export const DEFAULT_BUCKET: StockBucket = "SALEABLE";

/**
 * What `fn_svh_post`'s rate resolution accepts, in the Qt combo's order. MANUAL
 * first, because it is the honest default on an opening: on go-live day
 * `stock_item_cost` is empty, so AVG_COST and LAST_PURCHASE have nothing to read.
 */
export const RATE_SOURCES = ["MANUAL", "AVG_COST", "LAST_PURCHASE", "LOT_COST", "MRP"] as const;
export type RateSource = (typeof RATE_SOURCES)[number];
export const DEFAULT_RATE_SOURCE: RateSource = "MANUAL";

/**
 * The reasons an opening is usually reversed, offered by the cancel prompt with
 * "Other" beside them — so the ones that recur arrive spelled the same way.
 */
export const CANCEL_REASONS = [
  "Keyed against the wrong godown",
  "Quantities were wrong",
  "Cost rates were wrong",
  "Batch or expiry details were wrong",
  "Entered twice — duplicate of another opening",
  "Raised in the wrong branch",
  "Superseded by a corrected opening",
] as const;

/** `svh_cancel_reason` / the DTO's `reason` — `@TrimmedString(250)`. */
export const CANCEL_REASON_MAX_LENGTH = 250;

/** ck_svh_status — there is no fourth state. */
export const VOUCHER_STATUSES = ["DRAFT", "POSTED", "CANCELLED"] as const;
export type VoucherStatus = (typeof VOUCHER_STATUSES)[number];

/** The list's Status filter: "All" sends `""`, which grid 99's NULLIF reads as no filter. */
export const LIST_STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "DRAFT", label: "DRAFT" },
  { value: "POSTED", label: "POSTED" },
  { value: "CANCELLED", label: "CANCELLED" },
] as const;

/** TxnMainView's `defaultDaysBack` for this document type. */
export const LIST_DEFAULT_DAYS_BACK = 30;

/** Header field limits, from the .ui (and the DTO's `@NullableStringStrict`). */
export const USR_REFNO_MAX_LENGTH = 100;
export const REMARKS_MAX_LENGTH = 250;
/** `svi_batch_no` / `svi_serial_no` — `@NullableStringStrict(100)`. */
export const LINE_IDENTITY_MAX_LENGTH = 100;
/** `svi_remarks` — `@NullableStringStrict(250)`. */
export const LINE_REMARKS_MAX_LENGTH = 250;
/** `sbd_model` varchar(100) — the Qt editor's `setMaxLength(100)`. */
export const LINE_MODEL_MAX_LENGTH = 100;

/** What the date cells are keyed and shown in — NexDateEdit's mask. */
export const GRID_DATE_PLACEHOLDER = "dd-mm-yyyy";

/** The screen-memory slot (lib/screen-memory) an unsaved opening waits in. */
export const OPENING_STOCK_MEMORY_KEY = "stocks/opening-stock";
