/**
 * Sale Order Entry — configuration constants.
 *
 * Same architecture as the quotation screen: the grid LAYOUT (order, width,
 * visibility) comes from `GET /ui-table-masters/get`, the column MEANING lives
 * here, and `normalizeColumnToken` bridges the two. The charge grid, the item
 * picker and the charge master are literally the quotation's — same ui table
 * 21, same grid 71, same `chgModule=S` — so those constants are imported, not
 * restated.
 */
import type {
  GridCellKind,
  ColumnAlign,
  ItemColumnMeaning,
} from "@/features/sales/quotation/quotation.constants";
import { normalizeColumnToken } from "@/features/sales/quotation/quotation.constants";

// ---------------------------------------------------------------------------
// Endpoints and configured ids
// ---------------------------------------------------------------------------
/** `/api/v1` is already part of `API_BASE` — never write it in a path. */
export const SALE_ORDER_SAVE_ENDPOINT = "/sale-orders/create";
export const SALE_ORDER_GET_ENDPOINT = "/sale-orders/get";
export const SALE_ORDER_DELETE_ENDPOINT = "/sale-orders/delete";
/**
 * The tender master. The list filters ONLY `tndIsDeleted` — inactive rows come
 * back, and there is no tenant scoping and no paging; the client narrows.
 */
export const TENDER_MASTERS_LIST_ENDPOINT = "/tender-masters/list";
/**
 * The credit panel. `partyId` is the CUSTOMER id; camelCase params (unlike the
 * snake_case customer-detail on the same controller); never cached server-side.
 */
export const PARTY_CREDIT_ENDPOINT = "/master-lookups/party-credit";

/**
 * `fixed.ui_tables.ui_tbl_id` 24 — "Sale Order Item Table", 96 columns, one per
 * `SALES_ITEM_COLUMN_MEANINGS` entry in the same `ui_tbl_clm_no` order. The
 * four reserve columns the entity dropped (IsReserved, ReservedQty,
 * ReserveExpiresOn, LineDeliveryDate) are NOT in the live layout — 96 is the
 * whole table, verified against the database, so a 100-entry map here would
 * mislabel everything past index 91.
 */
export const SALE_ORDER_ITEM_GRID_UI_TABLE_ID = "24";
/** The charges grid is the quotation's own ui table 26 — shared, not similar. */
export { CHARGE_GRID_UI_TABLE_ID } from "@/features/sales/quotation/quotation.constants";
/**
 * `fixed.grid_details.grid_id` 87 — "SO - MAIN LIST". Binds `icompany_id`,
 * `ibranch_id`, `ifrom_date`, `ito_date` (no year token — the dates scope it).
 * Its SELECT projects neither `so_src_doc_type` nor `so_is_deleted`, so the
 * list cannot badge converted-from-quotation rows (backend gap §11.7) and a
 * deleted order shows only through its CANCELLED status.
 */
export const SALE_ORDER_LIST_GRID_ID = "87";
/**
 * Orders outlive bills: the F8 list opens on a 90-day window (the quotation's
 * uses the grid default).
 */
export const SALE_ORDER_LIST_WINDOW_DAYS = 90;

// ---------------------------------------------------------------------------
// Enum-shaped columns (`ck_so_*`, re-checked server-side per save)
// ---------------------------------------------------------------------------
export const SALE_ORDER_DOC_TYPE = "SALES_ORDER";
export const SALE_ORDER_DOC_TYPES = ["SALES_ORDER", "BOOKING", "CUSTOM_ORDER"] as const;

export const ORDER_TYPES = ["CASH", "CREDIT"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];
export const DEFAULT_ORDER_TYPE: OrderType = "CASH";

export const ORDER_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type OrderPriority = (typeof ORDER_PRIORITIES)[number];
export const DEFAULT_ORDER_PRIORITY: OrderPriority = "NORMAL";

export const DELIVERY_MODES = [
  "STORE_PICKUP",
  "HOME_DELIVERY",
  "SHIP_FROM_STORE",
  "COURIER",
  "TRANSPORT",
] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];
export const DEFAULT_DELIVERY_MODE: DeliveryMode = "STORE_PICKUP";
export const DELIVERY_MODE_LABELS: Record<DeliveryMode, string> = {
  STORE_PICKUP: "Store Pickup",
  HOME_DELIVERY: "Home Delivery",
  SHIP_FROM_STORE: "Ship from Store",
  COURIER: "Courier",
  TRANSPORT: "Transport",
};

export const SALE_ORDER_STATUSES = [
  "DRAFT",
  "CONFIRMED",
  "PARTIAL",
  "COMPLETED",
  "CANCELLED",
  "CLOSED",
  "EXPIRED",
] as const;
export type SaleOrderStatus = (typeof SALE_ORDER_STATUSES)[number];
export const DEFAULT_SALE_ORDER_STATUS: SaleOrderStatus = "DRAFT";

export const PAY_STATUSES = ["UNPAID", "PARTIAL", "PAID"] as const;
export const FULFIL_STATUSES = ["PENDING", "PARTIAL", "COMPLETED", "CANCELLED"] as const;
export const LINE_STATUSES = ["PENDING", "PARTIAL", "DELIVERED", "CANCELLED"] as const;

/** How long a new order stays open for by default (`soValidUntil`). */
export const DEFAULT_ORDER_VALIDITY_DAYS = 30;

// ---------------------------------------------------------------------------
// The item grid — all 96 configured columns of ui table 24, in `uiTblClmNo`
// order. Columns 0–88 are the quotation grid's vocabulary (grid 24 names a few
// differently: `Id`, `Size` at 4, `OrderQty` at 12); 89–91 are display-only
// stubs the order entity has no field for; 92–95 are the fulfilment quartet —
// painted from the GET, never editable, never in the POST.
// ---------------------------------------------------------------------------
function col(
  token: string,
  kind: GridCellKind,
  align: ColumnAlign,
  extra: Omit<ItemColumnMeaning, "token" | "key" | "kind" | "align"> = {},
): ItemColumnMeaning {
  return { token, key: normalizeColumnToken(token), kind, align, ...extra };
}

export const SALES_ITEM_COLUMN_MEANINGS: ItemColumnMeaning[] = [
  // 0 — configured as "Id" on this deployment; resolves via isSerialColumnName.
  col("Id", "serial", "right"),
  col("Barcode", "text", "left", { write: "barcode", read: "barcode" }),
  col("Code", "text", "left", { read: "itemCode" }),
  col("Description", "itemLookup", "left", { read: "itemName" }),
  // 4 — free text `soi_size`; the quotation grid calls the same field ItemSize.
  col("Size", "size", "left", { write: "itemSize", read: "itemSize" }),
  col("Hsn", "text", "left", { read: "hsnCode" }),
  col("BatchNo", "text", "left", { write: "batchNo", read: "batchNo", editableWhen: "batchConfig" }),
  col("ExpiryDate", "date", "center", {
    write: "expiryDate",
    read: "expiryDate",
    editableWhen: "batchConfig",
  }),
  col("GodownName", "text", "left", { read: "godownName" }),
  col("StockQty", "qty", "right", { read: "stockQty", precision: 3 }),
  col("Uom", "unit", "left", { write: "itemUnitId", read: "unitName" }),
  col("ToBaseFactor", "qty", "right", { read: "toBaseFactor", precision: 6 }),
  // 12 — the ORDERED quantity is this grid's business (soi_order_qty).
  col("OrderQty", "qty", "right", { write: "orderQty", read: "orderQty", precision: 3 }),
  col("Case Qty", "qty", "right", { write: "caseQty", read: "caseQty", precision: 3 }),
  col("Bill Qty", "qty", "right", { write: "billQty", read: "billQty", precision: 3 }),
  col("Length Qty", "qty", "right", { write: "lengthQty", read: "lengthQty", precision: 3 }),
  col("NetQty", "qty", "right", { read: "netQty", precision: 3 }),
  col("Sch", "check", "center", { write: "schemeFlag", read: "schemeFlag" }),
  col("IsFree", "check", "center", { write: "isFree", read: "isFree" }),
  col("Weight", "qty", "right", { read: "weight", precision: 3 }),
  col("PriceLevel", "priceLevel", "center", {
    write: "priceLevel",
    read: "priceLevel",
    editableWhen: "editPrice",
  }),
  col("Mrp", "currency", "right", { read: "mrp" }),
  col("Rate", "currency", "right", { write: "rate", read: "rate", editableWhen: "editPrice" }),
  col("Rate.BTax", "rate", "right", { read: "rateBeforeTax", precision: 4 }),
  col("Gross", "currency", "right", { read: "grossAmt" }),
  col("DiscPerc", "perc", "right", { write: "discPerc", read: "discPerc" }),
  col("DiscPerQty", "rate", "right", { write: "discPerQty", read: "discPerQty" }),
  col("DiscAmt", "currency", "right", { write: "discAmt", read: "discAmt" }),
  col("SplDiscPerc", "perc", "right", { write: "splDiscPerc", read: "splDiscPerc" }),
  col("SplDiscPerQty", "rate", "right", { write: "splDiscPerQty", read: "splDiscPerQty" }),
  col("SplDiscAmt", "currency", "right", { write: "splDiscAmt", read: "splDiscAmt" }),
  col("SchemeName", "text", "left", { read: "schemeName" }),
  col("SchPerc", "perc", "right", { write: "schPerc", read: "schPerc" }),
  col("SchPerQty", "rate", "right", { write: "schPerQty", read: "schPerQty" }),
  col("SchAmt", "currency", "right", { write: "schAmt", read: "schAmt" }),
  col("BillSchDiscPerc", "perc", "right", { write: "billSchDiscPerc", read: "billSchDiscPerc" }),
  col("BillSchDiscAmt", "currency", "right", { read: "billSchDiscAmt" }),
  col("NetGross", "currency", "right", { read: "netGross" }),
  col("ChrgBeforeTax", "currency", "right", { read: "chrgBeforeTax" }),
  col("CashDiscPerc", "perc", "right", { write: "cashDiscPerc", read: "cashDiscPerc" }),
  col("CashDiscAmt", "currency", "right", { read: "cashDiscAmt" }),
  col("Taxable", "currency", "right", { read: "taxableAmt" }),
  col("Gst %", "perc", "right", { read: "gstPerc" }),
  col("GstAmt", "currency", "right", { read: "gstAmt" }),
  col("Cgst %", "perc", "right", { read: "cgstPerc" }),
  col("CgstAmt", "currency", "right", { read: "cgstAmt" }),
  col("Sgst %", "perc", "right", { read: "sgstPerc" }),
  col("SgstAmt", "currency", "right", { read: "sgstAmt" }),
  col("Igst %", "perc", "right", { read: "igstPerc" }),
  col("IgstAmt", "currency", "right", { read: "igstAmt" }),
  col("Cess %", "perc", "right", { read: "cessPerc" }),
  col("CessUom", "rate", "right", { read: "cessPerUnit" }),
  col("CessAmt", "currency", "right", { read: "cessAmt" }),
  col("HasFreight", "check", "center", { read: "hasFreight" }),
  col("FreightPerQty", "rate", "right", {
    write: "freightPerQty",
    read: "freightPerQty",
    editableWhen: "hasFreight",
  }),
  col("FreightAmt", "currency", "right", { read: "freightAmt" }),
  col("CoolyPerQty", "rate", "right", { write: "loadingPerQty", read: "loadingPerQty" }),
  col("CoolyAmt", "currency", "right", { read: "loadingAmt" }),
  col("ChrgAfterTax", "currency", "right", { read: "chrgAfterTax" }),
  col("Total", "currency", "right", { read: "total" }),
  col("NetPrice", "currency", "right", { read: "netPrice" }),
  col("CostPrice", "currency", "right", { read: "costPrice" }),
  col("SavingsPerc", "perc", "right", { read: "savingsPerc" }),
  col("Remarks", "text", "left", { write: "remarks", read: "remarks" }),
  col("DecimalCount", "int", "center", { read: "decimalCount" }),
  col("BatchConfig", "int", "center", { read: "batchConfig" }),
  col("AllowNegative", "check", "center", { read: "allowNegative" }),
  col("Reorder", "qty", "right", { read: "reorderQty", precision: 3 }),
  col("ActualPrice", "currency", "right", { read: "actualPrice" }),
  col("MinPrice", "currency", "right", { read: "minPrice" }),
  col("CostBeforeTax", "currency", "right", { read: "costBeforeTax" }),
  col("Profit", "currency", "right", { read: "profit" }),
  col("ProfitBeforeTax", "currency", "right", { read: "profitBeforeTax" }),
  col("LoyaltyPv", "rate", "right", { read: "loyaltyPv" }),
  col("SalesmanName", "text", "left", { read: "salesmanName" }),
  col("ServiceItem", "check", "center", { read: "isService" }),
  col("SrcDocId", "label", "left", { read: "srcDocId" }),
  col("ItemId", "label", "left", { read: "itemId" }),
  col("GroupId", "label", "left", { read: "groupId" }),
  col("BrandId", "label", "left", { read: "brandId" }),
  col("SectionId", "label", "left", { read: "sectionId" }),
  col("CategoryId", "label", "left", { read: "categoryId" }),
  col("GodownId", "label", "left", { read: "godownId" }),
  col("UnitId", "label", "left", { read: "unitId" }),
  col("SchemeId", "label", "left", { read: "schemeId" }),
  col("SalesmanId", "label", "left", { read: "salesmanId" }),
  col("IsInclusiveTax", "check", "center", { read: "isInclusiveTax" }),
  col("NetB.Tax", "rate", "right", { read: "netPriceBeforeTax", precision: 4 }),
  col("Diff", "currency", "right", { read: "rateDiff" }),
  // 89–91 — the order entity has no stock allocation, no batch date of its own
  // and no serial capture; the columns exist in the layout and render blank.
  col("StockId", "label", "left"),
  col("BatchDate", "date", "center", {
    write: "batchDate",
    read: "batchDate",
    editableWhen: "batchConfig",
  }),
  col("SerialNo", "label", "left"),
  // 92–95 — the fulfilment quartet: display-only, server-owned. Their values
  // reach the grid flattened out of the line's readonly `fulfilment` branch;
  // no `write` key exists, so no edit can ever land on them.
  col("DeliveredQty", "qty", "right", { read: "deliveredQty", precision: 3 }),
  col("CancelledQty", "qty", "right", { read: "cancelledQty", precision: 3 }),
  col("PendingQty", "qty", "right", { read: "pendingQty", precision: 3 }),
  col("LineStatus", "label", "center", { read: "lineStatus" }),
];

/**
 * The grid the layout must declare. If `/ui-table-masters/get` returns any
 * other count for table 24, the client warns (the reserve columns coming back,
 * or a column added server-side, would mislabel everything after it).
 */
export const SALES_ITEM_COLUMN_COUNT = 96;
