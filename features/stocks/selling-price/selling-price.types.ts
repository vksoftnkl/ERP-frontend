/**
 * Change Selling Price (bulk), menu 30 — the wire contract.
 *
 * Mirrored from the server module `src/modules/stocks/selling-price-bulk`
 * (`types/selling-price-bulk.types.ts`, `dto/*.ts`). Every grid row is ONE row
 * of `inventory.item_price_master` as the price resolver answers it for this
 * branch: a bucket (this item at THIS MRP / sale price) or the headline.
 */

/** BUCKET = the bucket's own row answered; MASTER = the headline answered. */
export type PriceSource = "BUCKET" | "MASTER";

/** BRANCH = an override of one branch; CHAIN = the row every branch without one reads. */
export type PriceScope = "BRANCH" | "CHAIN";

/** Which figure `costRate` is (notes 75). */
export type CostBasis = "MRP" | "ITEM" | "PRICE_ROW";

/** `inventory.below_cost_price`, as the catalog spells it. */
export type BelowCostPolicy = "restrict" | "warning" | "allow";

export type PriceVerdictCode = "ABOVE_MRP" | "BELOW_MIN" | "BELOW_COST";

/** One level's four numbers, as the server sends them (price is authoritative). */
export type SellingPriceLevelValue = {
  level: number;
  markupPerc: number;
  priceWot: number;
  price: number;
  marginPerc: number;
};

/** `GET /stock/price-bulk` and `GET /stock/price-buckets/:itemId` — one row. */
export type SellingPriceRow = {
  lineNo: number;
  itemId: string;
  itemCode: string | null;
  /** item_default_barcode — display only, never sent back. */
  barcode: string | null;
  itemName: string;
  /** `item_unit_conversion.iuc_id`, never a unit_id. */
  uomId: string;
  unitName: string | null;
  /** On hand at the branch for this bucket, in this row's own unit. */
  stockQty: number;
  /** The bucket dimension (null on the headline) — echoed back on save. */
  mrp: number | null;
  salePrice: number | null;
  /** What the MRP column SHOWS: the answering row's max price, 0 when nothing answers. */
  maxPrice: number;
  priceSource: PriceSource | string;
  priceScope: PriceScope | string | null;
  bucketId: string | null;
  costRate: number;
  costWot: number;
  costBasis: CostBasis | string | null;
  minPrice: number;
  roundOff: number;
  taxPerc: number;
  inclTax: boolean;
  hasCess: boolean;
  levels: SellingPriceLevelValue[];
};

export type SellingPricePage = {
  items: SellingPriceRow[];
  meta: { limit: number; offset: number; count: number };
};

/** The query `GET /stock/price-bulk` takes — only the keys that are set are sent. */
export type SellingPriceGridQuery = {
  companyId: string;
  branchId: string;
  itemGroupId?: string;
  itemBrandId?: string;
  itemSectionId?: string;
  supplierId?: string;
  itemId?: string;
  search?: string;
  itemCategoryId?: string;
  trackPresetId?: string;
  taxId?: string;
  /** Sent only as "false" — the server's default is true. */
  activeOnly?: "false";
  limit: number;
  offset: number;
};

export type SaveSellingPriceLevel = {
  level: number;
  /** Authoritative. */
  price: number;
  /** Discarded by the server — sent so a log reads whole. */
  priceWot: number;
  markupPerc: number;
};

export type SaveSellingPriceRow = {
  lineNo: number;
  itemId: string;
  uomId: string;
  bucketId: string | null;
  /** The scope the row was LOADED with, unchanged; absent = no price yet. */
  priceScope?: string;
  mrp: number | null;
  salePrice: number | null;
  levels: SaveSellingPriceLevel[];
  minPrice: number;
  roundOff: number;
  /**
   * Notes 147 B — the PRICE ROW's own cost for one of this unit, tax inclusive
   * (the quick rate popup). Absent or null = unchanged; sent only when the
   * operator changed it, and only where `costBasis` is PRICE_ROW.
   */
  costPrice?: number | null;
};

export type SaveSellingPriceBulkPayload = {
  companyId: string;
  branchId: string;
  scope: PriceScope;
  confirmed: boolean;
  /**
   * Notes 140 A — the day the new prices start, `YYYY-MM-DD`. Absent (or
   * today): today's row is updated, as always. A later day leaves today's
   * price alone and SCHEDULES the new one; before today is a 400
   * STOCK_PRICE_FROM_IN_PAST, more than a year ahead STOCK_PRICE_FROM_TOO_FAR.
   */
  effectiveFrom?: string;
  rows: SaveSellingPriceRow[];
  /**
   * Notes 146 B — the quick rate popup: the menu of the screen it was opened
   * from (12 Sale Bill, 14 Quotation, 11 Sales Order, 29 the item list). The
   * Price Change Log adds "via <menu> (menu N)" to the change's reason. Omitted
   * on menu 30 itself.
   */
  originMenuId?: number;
};

export type SellingPriceProblem = {
  lineNo: number;
  itemId: string;
  itemCode: string | null;
  itemName: string;
  uomId: string;
  bucketId: string | null;
  level: number | null;
  verdict: PriceVerdictCode | string;
  message: string;
};

export type SellingPriceNoStockRow = {
  bucketId: string;
  itemId: string;
  itemCode: string | null;
  itemName: string;
  uomId: string;
  unitName: string | null;
  mrp: number | null;
  salePrice: number | null;
};

/** `POST /stock/price-bulk` — data. */
/** Notes 140 A — one row a save wrote, and the period it prices. */
export type SellingPriceSavedRow = {
  lineNo: number;
  /** The item_price_master row written (for a split, the NEW row). */
  bucketId: string;
  /** True when the row starts after today: scheduled, not yet on the shelf. */
  scheduled: boolean;
  /** `YYYY-MM-DD`. */
  effectiveFrom: string;
  effectiveTo: string;
};

export type SellingPriceSaveResult = {
  saved: number;
  /** Notes 140 A — the day the saved prices start (`YYYY-MM-DD`): the body's, else today. */
  effectiveFrom: string;
  /** Notes 140 A — per row written, in the order sent; empty on `needsConfirm`. */
  rows: SellingPriceSavedRow[];
  /** Always 0 since the one price table; kept by the server for one release. */
  masterRowsSaved: number;
  noStock: SellingPriceNoStockRow[];
  /** True = NOTHING was written; re-post with `confirmed: true`. */
  needsConfirm: boolean;
  problems: SellingPriceProblem[];
  belowCostPolicy: BelowCostPolicy | string;
};

/** `GET /price-level-masters/get` — one level: its names, and whether it is on. */
export type PriceLevelMasterRow = {
  priceLvlId: number;
  priceLvlName: string | null;
  priceLvlShort: string | null;
  /**
   * A level the company has not switched on is not shown — not as a column,
   * not as a band, not in the scheduled list (Qt `m_levelActive`). Missing on
   * the wire reads as on.
   */
  priceLvlIsActive: boolean;
  /** A deleted level is never shown (the quick rate popup reads it; missing reads as not deleted). */
  priceLvlIsDeleted?: boolean;
};

/** Notes 140 B — the prices a scheduled row replaces: the row before it, else what the shelf showed. */
export type SellingPriceSchedulePrevious = {
  /** The ipm_id that priced the bucket the day before; null when nothing did. */
  bucketId: string | null;
  priceScope: PriceScope | string | null;
  levels: SellingPriceLevelValue[];
};

/**
 * Notes 140 B — `GET /stock/price-schedule`: one price saved to start after
 * today. A grid row (its `bucketId` is the scheduled ipm_id), its period, and
 * what it replaces — so a list can say "110 → 118 from 23-10".
 */
export type SellingPriceScheduleRow = SellingPriceRow & {
  /** `YYYY-MM-DD`, after today. */
  effectiveFrom: string;
  effectiveTo: string;
  previous: SellingPriceSchedulePrevious | null;
};

/** Notes 140 B — `POST /stock/price-schedule/cancel`: what a cancel did. */
export type SellingPriceScheduleCancelResult = {
  /** The scheduled row, now deleted. */
  bucketId: string;
  /** The row before it, which now runs to the cancelled row's end; null when there was none. */
  restoredId: string | null;
  /** `YYYY-MM-DD` — the restored row's new end, null with no restored row. */
  restoredTo: string | null;
};

/** `GET /branch-masters/get?brId=` — the two names the screen shows. */
export type BranchNames = { brName: string; brShort: string };

/** `GET /master-lookups/item-by-barcode` — the fields the scan needs. */
export type BarcodeItem = { itemId: string; itemName: string };

/** Configured grid 71 ("POPUP - ITEMS"): one row per item × unit conversion. */
export type ItemPickerRow = {
  item_id: string;
  item_uom_id: string;
  item_name_en: string;
  unit_name: string;
};

/**
 * `GET /stock/item-inward-history?companyId&branchId&itemId&limit` — one inward
 * movement (an opening or a purchase) of the item at this branch, newest first
 * (notes 146 A, the quick rate popup's "Recent inward").
 */
export type ItemInwardRow = {
  /** `YYYY-MM-DD`. */
  date: string;
  txnType: string;
  refno: string | null;
  supplierId: string | null;
  supplierName: string | null;
  /** In the unit the document was keyed in (`unitName`), free quantity apart. */
  qty: number;
  freeQty: number;
  unitName: string | null;
  baseQty: number;
  costWot: number;
  /** cost ÷ cost w/o tax − 1, as a percentage; null when the cost w/o tax is 0. */
  taxPerc: number | null;
  cost: number;
  mrp: number | null;
  batchNo: string | null;
};

/** A server refusal, as the base query hands it over. */
export type ApiErrorLike = {
  status?: number;
  data?: unknown;
  message?: string;
};
