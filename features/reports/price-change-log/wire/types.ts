/**
 * The Price Change Log contract — `/item-price-log/*` (server notes 144 / 145,
 * `src/modules/Inventory/item-price-log`). Mirrored from the server's
 * `item-price-log.service.ts` and `dto/item-price-log-query.dto.ts`.
 *
 * Read only: the server writes the log in the same transaction as each price
 * write (item card, Change Selling Price, Qty price, a bucket re-key). Every
 * route needs View on menu 290 — 403 `IPCL_RIGHT_VIEW` without it.
 */

/** ck_ipcl_table — IPM item_price_master, IQP item_qty_price. */
export type PriceTable = "IPM" | "IQP";
/** The report's Show filter. */
export type PriceTableFilter = PriceTable | "BOTH";

export const PRICE_CHANGE_ACTIONS = ["CREATE", "UPDATE", "DELETE", "RESTORE", "REKEY"] as const;
export type PriceChangeAction = (typeof PRICE_CHANGE_ACTIONS)[number];

export const PRICE_CHANGE_SOURCES = [
  "ITEM_CARD",
  "CHANGE_SELLING_PRICE",
  "QTY_PRICE",
  "BUCKET_REKEY",
  "IMPORT",
] as const;
export type PriceChangeSource = (typeof PRICE_CHANGE_SOURCES)[number];

export type PriceChangeApp = "DESKTOP" | "WEB" | "API" | "SYSTEM";

/** Notes 145 — one changed column, with its report label, before → after. */
export type PriceLogField = {
  column: string;
  label: string;
  before: unknown;
  after: unknown;
};

/** One change, as `/list` and `/item-history` answer it. */
export type PriceLogRow = {
  ipclId: string;
  /** IST, with its offset. */
  changedOn: string;
  /** YYYY-MM-DD — the day the report files it under. */
  day: string;
  /** Every row one save wrote shares it. */
  changeSetId: string;
  priceTable: PriceTable;
  rowId: string;
  action: PriceChangeAction | string;
  source: PriceChangeSource | string;
  menuId: number | null;
  companyId: string | null;
  branchId: string | null;
  /** null = an all-branches (chain) price. */
  branchName: string | null;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  unitId: string | null;
  unitName: string | null;
  godownId: string | null;
  godownName: string | null;
  partyId: string | null;
  partyName: string | null;
  priceLevel: number | null;
  priceLevelName: string | null;
  bucketMrp: number | null;
  bucketSp: number | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  userId: string | null;
  userName: string | null;
  deviceId: string | null;
  deviceName: string | null;
  ip: string | null;
  app: PriceChangeApp | string | null;
  reason: string | null;
  /** The columns the change touched, and their report labels. */
  changed: string[];
  changedLabels: string[];
  /** Notes 145 — may be absent on an older server; the chips then fall back to the headline pairs. */
  fields?: PriceLogField[];
  oldPriceA: number | null;
  newPriceA: number | null;
  oldMrp: number | null;
  newMrp: number | null;
  oldCost: number | null;
  newCost: number | null;
  oldSlabPrice: number | null;
  newSlabPrice: number | null;
  slabFromQty: number | null;
  slabToQty: number | null;
  /** The headline figure's move, % of the old. */
  changePct: number | null;
};

/** `/get` — one change with the whole row before and after (raw column names). */
export type PriceLogDetail = PriceLogRow & {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

/** `/days` — one day with changes. */
export type PriceLogDay = {
  day: string;
  changes: number;
  priceChanges: number;
  slabChanges: number;
  items: number;
  users: number;
  saves: number;
};

export type PriceLogGap = {
  priceTable: PriceTable;
  rowId: string;
  itemId: string;
  reason: "NOT_LOGGED" | "DIFFERS";
};

/** `/gaps` — price rows changed outside the log since it began. 0 is the healthy answer. */
export type PriceLogGaps = {
  since: string | null;
  total: number;
  priceRows: number;
  slabRows: number;
  sample: PriceLogGap[];
};

/**
 * The report's filters. Empty = not sent (no filter). Dates are IST days,
 * inclusive, at most 366 apart (400 `IPCL_BAD_RANGE` otherwise).
 */
export type PriceLogFilters = {
  companyId: string;
  branchId?: string;
  /** YYYY-MM-DD. */
  fromDate: string;
  toDate: string;
  priceTable?: PriceTableFilter;
  itemId?: string;
  userId?: string;
  /** Notes 145 — made on this device. */
  deviceId?: string;
  /** Notes 145 — only changes that touched this column (`ipm_sales_price_b`). */
  field?: string;
  source?: PriceChangeSource | "";
  action?: PriceChangeAction | "";
  /** Item code or name, as it was at the time. */
  search?: string;
};

export type PriceLogListPage = {
  items: PriceLogRow[];
  meta: { page: number; limit: number; total: number };
};

export type PriceLogHistoryQuery = {
  itemId: string;
  /** With the shared prices. Omit for every company. */
  companyId?: string;
  /** With the all-branches prices. Omit for every branch. */
  branchId?: string;
  priceTable?: PriceTableFilter;
  /** ≤ 1000; the server's default is 200. */
  limit?: number;
};

/** The refusal codes, which the screens word by code. */
export const IPCL_CODE = {
  RIGHT_VIEW: "IPCL_RIGHT_VIEW",
  NOT_FOUND: "IPCL_NOT_FOUND",
  BAD_RANGE: "IPCL_BAD_RANGE",
} as const;

/** `fixed.menu_master` — the report; its View right is the routes' access. */
export const PRICE_CHANGE_LOG_MENU_ID = 290;
export const PRICE_CHANGE_LOG_HREF = "/reports/price-change-log";
/** `/list` caps `limit` here. */
export const PRICE_LOG_PAGE_LIMIT = 500;
