/**
 * Quotation Entry — configuration constants.
 *
 * The two grids are laid out by the server (`fixed.ui_tables` rows 18 and 21):
 * the *layout* — order, width, visibility, heading — comes from
 * `GET /ui-table-masters/get`, and the column *meaning* lives here, because
 * `fixed.ui_table_columns` stores only a display name (no field token, no data
 * type, no editability). The two are bridged by `normalizeColumnToken`, exactly
 * as the stock grids do it.
 */
import type { ChargeApplyOn, ChargeMethod, ChargeRole, ChargeType } from "@/domain/pricing";
import type { DraftChargeRow, DraftLine } from "./quotation.types";

// ---------------------------------------------------------------------------
// Endpoints and configured ids
// ---------------------------------------------------------------------------

/** `/api/v1` is already part of `API_BASE` — never write it in a path. */
export const QUOTATION_SAVE_ENDPOINT = "/quotations/create";
export const QUOTATION_GET_ENDPOINT = "/quotations/get";
export const QUOTATION_DELETE_ENDPOINT = "/quotations/delete";
export const UI_TABLE_MASTERS_ENDPOINT = "/ui-table-masters/get";
/** PUT, `{ columns: [{ uiTblClmId, uiTblClmColumnWidth }] }` — dragged columns. */
export const UI_TABLE_COLUMN_WIDTH_ENDPOINT = "/ui-table-masters/column-width";
/** PUT, `{ columns: [{ uiTblClmId, uiTblClmColumnVisibility }] }` — admin settings. */
export const UI_TABLE_VISIBILITY_ENDPOINT = "/ui-table-masters/visibility-settings";
export const CONFIGURED_GRID_RUN_ENDPOINT = "/configured-grid-sql/run";
export const DROPDOWN_RUN_ENDPOINT = "/dropdown-details/run";
export const CHARGES_GET_ENDPOINT = "/charges/get";
export const CUSTOMER_DETAIL_ENDPOINT = "/master-lookups/customer-detail";
export const ITEM_PRICE_ENDPOINT = "/master-lookups/item-price";
export const ITEM_SWITCH_UOM_ENDPOINT = "/master-lookups/item-switch-uom";
export const ITEM_UNITS_ENDPOINT = "/master-lookups/units/by-item";
export const ITEM_BY_BARCODE_ENDPOINT = "/master-lookups/item-by-barcode";
export const FREIGHT_CHARGE_ENDPOINT = "/master-lookups/freight-charges/charge";
export const COMPANY_GET_ENDPOINT = "/company-masters/get";
export const USER_ADMINISTRATION_GET_ENDPOINT = "/user-administration/get";
/**
 * Hold / Pick held — `public.transaction_hold`. One route creates AND updates
 * (`thId`'s presence selects which), exactly like `/quotations/create`.
 */
export const TRANSACTION_HOLD_SAVE_ENDPOINT = "/transaction-holds/create";
export const TRANSACTION_HOLD_LIST_ENDPOINT = "/transaction-holds/list";
export const TRANSACTION_HOLD_GET_ENDPOINT = "/transaction-holds/get";
export const TRANSACTION_HOLD_DELETE_ENDPOINT = "/transaction-holds/delete";
/**
 * The edit lock — `HELD → LOCKED → CONVERTED`, with `release` (and the
 * `force-release` escape hatch) going back to `HELD`.
 *
 * These are NOT the save route with a different status: each is one conditional
 * UPDATE server-side, with the status it moves *from* — and, on release and
 * convert, `th_locked_by = this device` — inside the WHERE clause. That is what
 * makes two tills resuming one cart serialize on the row instead of both
 * winning, and what stops one till spending a lock another one holds.
 *
 * The lock holder is the DEVICE, named by the `X-Device-Id` header (never a
 * body field, so there is no second, disagreeing source of truth). See
 * `HOLD_DEVICE_ID_HEADER`.
 */
export const transactionHoldLockEndpoint = (
  thId: string,
  action: "resume" | "release" | "force-release" | "convert",
): string => `/transaction-holds/${thId}/${action}`;
export const HOLD_DEVICE_ID_HEADER = "X-Device-Id";
/**
 * `fixed.ui_tables.ui_tbl_id` for the item grid — 23 ("Quotation-item", 89
 * columns, one per `ITEM_COLUMN_MEANINGS` entry and in the same order).
 *
 * NOT 18 ("Quotation"): that is the Qt screen's own layout, and its widths are
 * that grid's fractional percents rather than pixels — see `ColumnWidthUnit`.
 */
export const ITEM_GRID_UI_TABLE_ID = "23";
/** `fixed.ui_tables.ui_tbl_id` for the additional-charges grid ("CHARGES"). */
export const CHARGE_GRID_UI_TABLE_ID = "21";
/** `fixed.grid_details.grid_id` for the item picker popup ("POPUP - ITEMS"). */
export const ITEM_PICKER_GRID_ID = "71";
/**
 * `fixed.grid_details.grid_id` for the browse list — grid 84 ("Quotation").
 *
 * Two properties of this grid drive how the list is built:
 *
 *  - **No column has `grid_column_filter = true`**, so passing `search=` makes the
 *    runner inject `1 = 0` and return zero rows. Searching is therefore done
 *    client-side over the fetched window, never on the wire.
 *  - Its SQL has **no `WHERE` clause and no `grid_param`**, so soft-deleted rows
 *    and rows from every company, branch and year come back, and `meta.total`
 *    counts that unfiltered set. The list filters to the current tenant itself
 *    and reports what it actually holds rather than the server's total.
 *
 * (Grid 83, "QUOTATION - MAIN LIST", selects the same columns and does have four
 * filterable ones, but hides half the columns and is not the configured list for
 * this screen.)
 */
export const QUOTATION_LIST_GRID_ID = "84";
/** `fixed.dropdown_details.dropdown_id` for the customer combobox. */
export const CUSTOMER_DROPDOWN_ID = "39";
/**
 * Place of supply. Keyed on the 2-char GST `state_code` (`"33"`), matching what
 * `customer-detail` returns — NOT the `state_master` uuid that dropdowns 2/29
 * serve.
 */
export const POS_DROPDOWN_ID = "21";
export const AGENT_DROPDOWN_ID = "38";
/**
 * The Beat picker — dropdown 13 ("AREA LIST", active non-deleted rows ordered by
 * name). Beat IS the area on this screen: the voucher stores one route id,
 * `sq_cust_area_id`, which the customer master seeds and the operator can change.
 */
export const AREA_DROPDOWN_ID = "13";
/**
 * Dropdown 34 ("PRICE LEVELS") over `inventory.item_price_levels` — `ipl_id` is
 * the same 1..7 level the voucher and `/item-price` use, `ipl_name` is what the
 * deployment calls it ("WS Price", "Retail Price", …).
 */
export const PRICE_LEVEL_DROPDOWN_ID = "34";
export const SALESMAN_DROPDOWN_ID = "38";
/** Sales-side charges only: `chgModule IN ('S','B')`. */
export const CHARGE_MODULE_SALES = "S";
/** Default place of supply: Tamil Nadu. */
export const DEFAULT_POS_STATE_CODE = "33";
export const DEFAULT_POS_STATE_NAME = "Tamil Nadu";
/** `sale_quotation.sq_doc_type` for this screen. */
export const QUOTATION_DOC_TYPE = "QUOTATION";
/**
 * `ck_sq_status` is an upper-case CHECK constraint with no DTO validation — a
 * lower-case value is accepted by the API and then 500s from Postgres.
 */
export const QUOTATION_STATUSES = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CONVERTED",
  "CANCELLED",
] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];
export const DEFAULT_QUOTATION_STATUS: QuotationStatus = "DRAFT";
// ---------------------------------------------------------------------------
// Transaction hold (F9 park / F10 recall)
// ---------------------------------------------------------------------------
/**
 * `th_doc_type` for a parked quotation.
 *
 * This screen shipped before the server's `TransactionHoldDocType` had a
 * `QUOTATION` member and parked its carts under `SALE_ORDER` — the closest
 * document the till-shaped enum offered. The member exists now, but **rows
 * written before it keep the old type**, so anything that goes looking for
 * parked quotations has to accept both. The picker does not filter on the
 * document type at all for exactly this reason: `isQuotationHold` reads the
 * `th_ui_state` stamp, which is the real test of "this screen wrote it" and is
 * blind to which type the row carries.
 *
 * `ux_th_hold_no` is scoped per document type, so quotation holds now get their
 * own number space rather than sharing the sale-order one.
 */
export const QUOTATION_HOLD_DOC_TYPE = "QUOTATION";
/** What this screen parked carts under before `QUOTATION` existed. */
export const LEGACY_QUOTATION_HOLD_DOC_TYPE = "SALE_ORDER";
/** `ck_th_device_type` — the hardware the hold was taken on. */
export const HOLD_DEVICE_TYPES = ["DESKTOP", "WEB", "MOBILE"] as const;
export type HoldDeviceType = (typeof HOLD_DEVICE_TYPES)[number];
/** This client is a browser; the session's own value only narrows it further. */
export const DEFAULT_HOLD_DEVICE_TYPE: HoldDeviceType = "WEB";
/**
 * `ck_th_status`. `CONVERTED` / `CANCELLED` / `EXPIRED` are terminal — the
 * server refuses to move a hold out of them, so nothing here ever tries.
 */
export const HOLD_STATUSES = [
  "HELD",
  "LOCKED",
  "RESUMED",
  "CONVERTED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type HoldStatus = (typeof HOLD_STATUSES)[number];
/**
 * The statuses a parked cart can still be picked up from, which is what the
 * held list shows.
 *
 * `HELD` is free and `LOCKED` is open on a device — the lock endpoints move a
 * hold between exactly those two. `RESUMED` is neither: it is what this screen
 * wrote to mean "in use" BEFORE the lock existed, so pre-upgrade rows carry it
 * and are shown (and offered a take-over) rather than left invisible.
 */
export const HOLD_LIVE_STATUSES = ["HELD", "LOCKED", "RESUMED"] as const;
/** In use by somebody — `LOCKED` by this lock, `RESUMED` by the one before it. */
export const HOLD_IN_USE_STATUSES = ["LOCKED", "RESUMED"] as const;
/**
 * What `th_ui_state` holds, and how a reader knows it is ours. The server
 * stores and returns the object verbatim and never reads into it, so this
 * envelope is the only contract there is — hence a `kind` and a `version` on
 * every write, checked on every read.
 */
export const HOLD_UI_STATE_KIND = "erp.sales.quotation.hold";
export const HOLD_UI_STATE_VERSION = 1;
export const HOLD_UI_STATE_SCREEN = "QUOTATION";
/**
 * `th_hold_no` is required on create, is NOT generated server-side, and is
 * unique per company / branch / year / document type. The till it was designed
 * for owns a counter; this screen has none, so the number is minted from the
 * clock plus a random tail — see `nextHoldNo`. `varchar(30)`.
 */
export const HOLD_NO_PREFIX = "QH";
export const HOLD_NO_MAX_LENGTH = 30;
/**
 * How long a new quotation is valid for. The screen has no other source for it —
 * there is no company setting — so this is the standard window, counted onto the
 * quote date as `validUntil` the moment a draft is created.
 */
export const DEFAULT_VALIDITY_DAYS = 7;
/**
 * `sq_freight_calc_type` / `sq_loading_calc_type` share their vocabulary with
 * the `/item-price` `freight_type` / `loading_type` query params — lower case,
 * and NOT normalised by the DTO, so the client must send the case itself.
 * `freight` has no `auto`: distance slabs come from `/freight-charges/charge`.
 */
export const LOADING_CALC_TYPES = ["manual", "item_basis", "auto"] as const;
export const FREIGHT_CALC_TYPES = ["manual", "item_basis"] as const;
export const DEFAULT_LOADING_CALC_TYPE = "manual";
export const DEFAULT_FREIGHT_CALC_TYPE = "manual";
/** How many price levels the grid's CTRL+1..4 shortcuts can reach. */
export const PRICE_LEVEL_COUNT = 4;
export const PRICE_LEVEL_OPTIONS = [
  { value: "1", label: "A" },
  { value: "2", label: "B" },
  { value: "3", label: "C" },
  { value: "4", label: "D" },
  { value: "5", label: "MRP" },
  { value: "6", label: "Min" },
  { value: "7", label: "Cost" },
] as const;
/**
 * Permissions the Qt session carries and this client has no source for yet
 * (`grep` finds no runtime permission gating anywhere). Kept in one place, named,
 * so wiring them later is a one-line change rather than a hunt.
 */
export const SESSION_CAPABILITIES = {
  /** Operator may change a line's rate / price level. */
  editPrice: true,
  /** Operator may quote above MRP. */
  skipMrp: false,
  /** Names and addresses come from the regional-language columns. */
  regional: false,
} as const;

export const CHARGE_ROLE_OPTIONS: { value: ChargeRole; label: string }[] = [
  { value: "NONE", label: "None" },
  { value: "FREIGHT", label: "Freight" },
  { value: "LOADING", label: "Loading" },
  { value: "UNLOADING", label: "Unloading" },
  { value: "CASH_DISC", label: "Cash Discount" },
  { value: "OTHERS", label: "Others" },
];

export const CHARGE_METHOD_LABELS: Record<ChargeMethod, string> = {
  FIXED: "Fixed",
  PERCENT: "Percent",
  QTY: "Qty",
  NET_QTY: "Net Qty",
  KG: "Kg",
  QTL: "Qtl",
  TON: "Ton",
};

export const CHARGE_TYPE_LABELS: Record<ChargeType, string> = {
  ADD: "Add",
  DEDUCT: "Deduct",
};

export const CHARGE_APPLY_ON_LABELS: Record<ChargeApplyOn, string> = {
  FLAT: "Flat",
  QTY: "Qty",
  VALUE: "Value",
  WEIGHT: "Weight",
};

/**
 * The suffix a rate cell paints for each method — at paint time only. The cell
 * value stays a bare number so it round-trips through the reducer unchanged.
 */
export const CHARGE_RATE_SUFFIX: Record<ChargeMethod, string> = {
  FIXED: "",
  PERCENT: "%",
  QTY: "/Qty",
  NET_QTY: "/NetQ",
  KG: "/Kg",
  QTL: "/Qtl",
  TON: "/Ton",
};

// ---------------------------------------------------------------------------
// Column bridge
// ---------------------------------------------------------------------------

/**
 * `ui_table_columns` stores a display name, never a field token, so both stock
 * grids match on the name with punctuation and case stripped. Same function,
 * same behaviour: `"Case Qty" -> "caseqty"`, `"Rate.BTax" -> "ratebtax"`,
 * `"Gst %" -> "gst"`.
 *
 * Note the charge grid's first column is named `"#"`, which normalises to the
 * empty string — it is matched by its column number instead.
 */
export function normalizeColumnToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
}

export type GridCellKind =
  | "serial"
  | "text"
  | "qty"
  | "currency"
  | "rate"
  | "perc"
  | "int"
  | "check"
  | "date"
  | "unit"
  | "priceLevel"
  | "itemLookup"
  | "chargeLookup"
  | "label";

export type ColumnAlign = "left" | "center" | "right";

/**
 * One column's meaning. `read` names the field the cell displays and `write` the
 * draft field an edit lands on — they differ for the three discount amount
 * columns, which show the engine's computed amount but write the operator's
 * keyed one.
 */
export type ItemColumnMeaning = {
  /** The verbatim `ui_tbl_clm_name`, for cross-referencing the DB row. */
  token: string;
  key: string;
  kind: GridCellKind;
  align: ColumnAlign;
  /** Draft field an edit writes to. Absent → display only. */
  write?: keyof DraftLine;
  /** Field the cell reads. A `PricedLine` key when the value is derived. */
  read?: string;
  precision?: number;
  /** Only editable while this predicate holds (beyond the screen-wide gate). */
  editableWhen?: "batchConfig" | "hasFreight" | "editPrice";
};

function itemColumn(
  token: string,
  kind: GridCellKind,
  align: ColumnAlign,
  extra: Omit<ItemColumnMeaning, "token" | "key" | "kind" | "align"> = {},
): ItemColumnMeaning {
  return { token, key: normalizeColumnToken(token), kind, align, ...extra };
}

/**
 * All 89 configured columns of ui table 23 ("Quotation-item"), in `uiTblClmNo`
 * order — the same order this list declares them in.
 *
 * Sorted by column NUMBER, not position: on ui table 18 (the Qt screen's own
 * layout, which these meanings also cover) position 58 is used twice
 * (`ChrgAfterTax` and `Total`) and 62 is unused, so sorting by position makes
 * those two swap non-deterministically.
 */
export const ITEM_COLUMN_MEANINGS: ItemColumnMeaning[] = [
  itemColumn("Id", "serial", "right"),
  itemColumn("Barcode", "text", "left", { write: "barcode", read: "barcode" }),
  itemColumn("Code", "text", "left", { read: "itemCode" }),
  itemColumn("Description", "itemLookup", "left", { read: "itemName" }),
  itemColumn("AliasName", "text", "left", { read: "aliasName" }),
  itemColumn("Hsn", "text", "left", { read: "hsnCode" }),
  itemColumn("BatchNo", "text", "left", {
    write: "batchNo",
    read: "batchNo",
    editableWhen: "batchConfig",
  }),
  itemColumn("ExpiryDate", "date", "center", {
    write: "expiryDate",
    read: "expiryDate",
    editableWhen: "batchConfig",
  }),
  itemColumn("GodownName", "text", "left", { read: "godownName" }),
  itemColumn("StockQty", "qty", "right", { read: "stockQty", precision: 3 }),
  itemColumn("Uom", "unit", "left", { write: "itemUnitId", read: "unitName" }),
  itemColumn("ToBaseFactor", "qty", "right", { read: "toBaseFactor", precision: 6 }),
  itemColumn("OrderQty", "qty", "right", { write: "orderQty", read: "orderQty", precision: 3 }),
  itemColumn("Case Qty", "qty", "right", { write: "caseQty", read: "caseQty", precision: 3 }),
  itemColumn("Bill Qty", "qty", "right", { write: "billQty", read: "billQty", precision: 3 }),
  itemColumn("Length Qty", "qty", "right", { write: "lengthQty", read: "lengthQty", precision: 3 }),
  itemColumn("NetQty", "qty", "right", { read: "netQty", precision: 3 }),
  itemColumn("Sch", "check", "center", { write: "schemeFlag", read: "schemeFlag" }),
  itemColumn("IsFree", "check", "center", { write: "isFree", read: "isFree" }),
  itemColumn("Weight", "qty", "right", { read: "weight", precision: 3 }),
  itemColumn("PriceLevel", "priceLevel", "center", {
    write: "priceLevel",
    read: "priceLevel",
    editableWhen: "editPrice",
  }),
  itemColumn("Mrp", "currency", "right", { read: "mrp" }),
  itemColumn("Rate", "currency", "right", {
    write: "rate",
    read: "rate",
    editableWhen: "editPrice",
  }),
  itemColumn("Rate.BTax", "rate", "right", { read: "rateBeforeTax", precision: 4 }),
  itemColumn("Gross", "currency", "right", { read: "grossAmt" }),
  itemColumn("DiscPerc", "perc", "right", { write: "discPerc", read: "discPerc" }),
  itemColumn("DiscPerQty", "rate", "right", { write: "discPerQty", read: "discPerQty" }),
  // Writes the keyed amount, shows the computed one — see `ItemColumnMeaning`.
  itemColumn("DiscAmt", "currency", "right", { write: "discAmt", read: "discAmt" }),
  itemColumn("SplDiscPerc", "perc", "right", { write: "splDiscPerc", read: "splDiscPerc" }),
  itemColumn("SplDiscPerQty", "rate", "right", { write: "splDiscPerQty", read: "splDiscPerQty" }),
  itemColumn("SplDiscAmt", "currency", "right", { write: "splDiscAmt", read: "splDiscAmt" }),
  itemColumn("SchemeName", "text", "left", { read: "schemeName" }),
  itemColumn("SchPerc", "perc", "right", { write: "schPerc", read: "schPerc" }),
  itemColumn("SchPerQty", "rate", "right", { write: "schPerQty", read: "schPerQty" }),
  itemColumn("SchAmt", "currency", "right", { write: "schAmt", read: "schAmt" }),
  itemColumn("BillSchDiscPerc", "perc", "right", {
    write: "billSchDiscPerc",
    read: "billSchDiscPerc",
  }),
  itemColumn("BillSchDiscAmt", "currency", "right", { read: "billSchDiscAmt" }),
  itemColumn("NetGross", "currency", "right", { read: "netGross" }),
  itemColumn("ChrgBeforeTax", "currency", "right", { read: "chrgBeforeTax" }),
  itemColumn("CashDiscPerc", "perc", "right", { write: "cashDiscPerc", read: "cashDiscPerc" }),
  itemColumn("CashDiscAmt", "currency", "right", { read: "cashDiscAmt" }),
  itemColumn("Taxable", "currency", "right", { read: "taxableAmt" }),
  itemColumn("Gst %", "perc", "right", { read: "gstPerc" }),
  itemColumn("GstAmt", "currency", "right", { read: "gstAmt" }),
  itemColumn("Cgst %", "perc", "right", { read: "cgstPerc" }),
  itemColumn("CgstAmt", "currency", "right", { read: "cgstAmt" }),
  itemColumn("Sgst %", "perc", "right", { read: "sgstPerc" }),
  itemColumn("SgstAmt", "currency", "right", { read: "sgstAmt" }),
  itemColumn("Igst %", "perc", "right", { read: "igstPerc" }),
  itemColumn("IgstAmt", "currency", "right", { read: "igstAmt" }),
  itemColumn("Cess %", "perc", "right", { read: "cessPerc" }),
  itemColumn("CessUom", "rate", "right", { read: "cessPerUnit" }),
  itemColumn("CessAmt", "currency", "right", { read: "cessAmt" }),
  itemColumn("HasFreight", "check", "center", { read: "hasFreight" }),
  itemColumn("FreightPerQty", "rate", "right", {
    write: "freightPerQty",
    read: "freightPerQty",
    editableWhen: "hasFreight",
  }),
  itemColumn("FreightAmt", "currency", "right", { read: "freightAmt" }),
  itemColumn("CoolyPerQty", "rate", "right", { write: "loadingPerQty", read: "loadingPerQty" }),
  itemColumn("CoolyAmt", "currency", "right", { read: "loadingAmt" }),
  itemColumn("ChrgAfterTax", "currency", "right", { read: "chrgAfterTax" }),
  itemColumn("Total", "currency", "right", { read: "total" }),
  itemColumn("NetPrice", "currency", "right", { read: "netPrice" }),
  itemColumn("CostPrice", "currency", "right", { read: "costPrice" }),
  itemColumn("SavingsPerc", "perc", "right", { read: "savingsPerc" }),
  itemColumn("Remarks", "text", "left", { write: "remarks", read: "remarks" }),
  itemColumn("DecimalCount", "int", "center", { read: "decimalCount" }),
  itemColumn("BatchConfig", "int", "center", { read: "batchConfig" }),
  itemColumn("AllowNegative", "check", "center", { read: "allowNegative" }),
  itemColumn("Reorder", "qty", "right", { read: "reorderQty", precision: 3 }),
  itemColumn("ActualPrice", "currency", "right", { read: "actualPrice" }),
  itemColumn("MinPrice", "currency", "right", { read: "minPrice" }),
  itemColumn("CostBeforeTax", "currency", "right", { read: "costBeforeTax" }),
  itemColumn("Profit", "currency", "right", { read: "profit" }),
  itemColumn("ProfitBeforeTax", "currency", "right", { read: "profitBeforeTax" }),
  itemColumn("LoyaltyPv", "rate", "right", { read: "loyaltyPv" }),
  itemColumn("SalesmanName", "text", "left", { read: "salesmanName" }),
  itemColumn("ServiceItem", "check", "center", { read: "isService" }),
  itemColumn("SrcDocId", "label", "left", { read: "srcDocId" }),
  itemColumn("ItemId", "label", "left", { read: "itemId" }),
  itemColumn("GroupId", "label", "left", { read: "groupId" }),
  itemColumn("BrandId", "label", "left", { read: "brandId" }),
  itemColumn("SectionId", "label", "left", { read: "sectionId" }),
  itemColumn("CategoryId", "label", "left", { read: "categoryId" }),
  itemColumn("GodownId", "label", "left", { read: "godownId" }),
  itemColumn("UnitId", "label", "left", { read: "unitId" }),
  itemColumn("SchemeId", "label", "left", { read: "schemeId" }),
  itemColumn("SalesmanId", "label", "left", { read: "salesmanId" }),
  itemColumn("IsInclusiveTax", "check", "center", { read: "isInclusiveTax" }),
  itemColumn("NetB.Tax", "rate", "right", { read: "netPriceBeforeTax", precision: 4 }),
  itemColumn("Diff", "currency", "right", { read: "rateDiff" }),
];

export type ChargeColumnMeaning = {
  token: string;
  key: string;
  kind: GridCellKind;
  align: ColumnAlign;
  write?: keyof DraftChargeRow;
  read?: string;
  precision?: number;
  /** A FIXED row's rate is the lump sum and is priced through Amount instead. */
  readOnlyWhenFixed?: boolean;
};

/**
 * The charge grid's first column is named `"#"`, which normalises to the empty
 * string — an unusable map key. It gets this sentinel instead, and the configured
 * row is matched to it by its column number.
 */
export const CHARGE_SERIAL_KEY = "slno";

function chargeColumn(
  token: string,
  kind: GridCellKind,
  align: ColumnAlign,
  extra: Omit<ChargeColumnMeaning, "token" | "key" | "kind" | "align"> = {},
): ChargeColumnMeaning {
  return { token, key: normalizeColumnToken(token) || CHARGE_SERIAL_KEY, kind, align, ...extra };
}

/** All 33 configured columns of ui table 21, in `uiTblClmNo` order. */
export const CHARGE_COLUMN_MEANINGS: ChargeColumnMeaning[] = [
  // `"#"` normalises to "" — matched by column number, see `resolveChargeColumns`.
  chargeColumn("#", "serial", "right"),
  chargeColumn("Charge Name", "chargeLookup", "left", { read: "chgName" }),
  chargeColumn("Ledger Name", "text", "left", { read: "ledgerName" }),
  chargeColumn("Method", "label", "left", { read: "method" }),
  chargeColumn("Type", "label", "left", { read: "type" }),
  chargeColumn("Apply On", "label", "left", { read: "applyOn" }),
  chargeColumn("Unit", "text", "left", { write: "unit", read: "unit" }),
  chargeColumn("QtyVal", "qty", "right", { read: "qtyVal", precision: 3 }),
  chargeColumn("Weight", "qty", "right", { read: "weight", precision: 3 }),
  chargeColumn("Rate", "rate", "right", { write: "rate", read: "rate", readOnlyWhenFixed: true }),
  chargeColumn("Amount", "currency", "right", { write: "amount", read: "amountValue" }),
  chargeColumn("Hsn", "text", "left", { read: "hsn" }),
  chargeColumn("TaxPerc", "perc", "right", { read: "taxPercApplied" }),
  chargeColumn("TaxAmt", "currency", "right", { read: "taxAmt" }),
  chargeColumn("SgstPerc", "perc", "right", { read: "sgstPercApplied" }),
  chargeColumn("SgstAmt", "currency", "right", { read: "sgstAmt" }),
  chargeColumn("CgstPerc", "perc", "right", { read: "cgstPercApplied" }),
  chargeColumn("CgstAmt", "currency", "right", { read: "cgstAmt" }),
  chargeColumn("IgstPerc", "perc", "right", { read: "igstPercApplied" }),
  chargeColumn("IgstAmt", "currency", "right", { read: "igstAmt" }),
  chargeColumn("CessPerc", "perc", "right", { read: "cessPerc" }),
  chargeColumn("CessAmt", "currency", "right", { read: "cessAmt" }),
  chargeColumn("NetAmt", "currency", "right", { read: "netAmt" }),
  chargeColumn("Remarks", "text", "left", { write: "remarks", read: "remarks" }),
  chargeColumn("Role", "label", "left", { read: "role" }),
  chargeColumn("LandingCost", "check", "center", { read: "landingCost" }),
  chargeColumn("CostAlloc", "label", "left", { read: "costAlloc" }),
  chargeColumn("BeforeTax", "check", "center", { read: "beforeTax" }),
  chargeColumn("SepPost", "check", "center", { read: "sepPost" }),
  chargeColumn("ChargeId", "label", "left", { read: "chgId" }),
  chargeColumn("LedgerCode", "label", "left", { read: "ledgerCode" }),
  chargeColumn("TaxCode", "label", "left", { read: "taxCode" }),
  chargeColumn("TaxApl", "check", "center", { read: "taxApl" }),
];

/**
 * The one-of-three discount groups. Editing any member clears its siblings, so
 * `applyLineDiscounts`'s "percent, else per-qty, else the keyed amount" choice is
 * never ambiguous.
 */
export const DISCOUNT_ALTERNATES: Partial<Record<keyof DraftLine, (keyof DraftLine)[]>> = {
  discPerc: ["discPerQty", "discAmt"],
  discPerQty: ["discPerc", "discAmt"],
  discAmt: ["discPerc", "discPerQty"],
  splDiscPerc: ["splDiscPerQty", "splDiscAmt"],
  splDiscPerQty: ["splDiscPerc", "splDiscAmt"],
  splDiscAmt: ["splDiscPerc", "splDiscPerQty"],
  schPerc: ["schPerQty", "schAmt"],
  schPerQty: ["schPerc", "schAmt"],
  schAmt: ["schPerc", "schPerQty"],
};

/** Data attributes the Enter-to-next-cell walker reads off each editable cell. */
export const GRID_FIELD_ATTR = "data-quotation-field";
export const GRID_ROW_ATTR = "data-quotation-row";
export const GRID_GRID_ATTR = "data-quotation-grid";
export const GRID_COLUMN_INDEX_ATTR = "data-quotation-column-index";
