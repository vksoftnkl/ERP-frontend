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
};

export type SaveSellingPriceBulkPayload = {
  companyId: string;
  branchId: string;
  scope: PriceScope;
  confirmed: boolean;
  rows: SaveSellingPriceRow[];
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
export type SellingPriceSaveResult = {
  saved: number;
  /** Always 0 since the one price table; kept by the server for one release. */
  masterRowsSaved: number;
  noStock: SellingPriceNoStockRow[];
  /** True = NOTHING was written; re-post with `confirmed: true`. */
  needsConfirm: boolean;
  problems: SellingPriceProblem[];
  belowCostPolicy: BelowCostPolicy | string;
};

/** `GET /price-level-masters/get` — one level (only the names matter here). */
export type PriceLevelMasterRow = {
  priceLvlId: number;
  priceLvlName: string | null;
  priceLvlShort: string | null;
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

/** A server refusal, as the base query hands it over. */
export type ApiErrorLike = {
  status?: number;
  data?: unknown;
  message?: string;
};
