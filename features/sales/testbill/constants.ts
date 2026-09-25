/**
 * Sale Bill Entry ("Sales Entry", menu 12) — constants.
 *
 * Everything the quotation and the sale order already state once is imported,
 * not restated. What lives here is what the BILL adds: its own routes, its own
 * grid (ui table 22), and the enum-shaped columns of `sale_bill`.
 *
 * The one structural note worth reading before editing this file: the item grid
 * is ui table **22** ("SALE BILL - ITEM"), which is a *Desktop* layout — its
 * widths are Qt-style percentages, not pixels — exactly like the sale order's
 * table 24. That is why `SALE_BILL_ITEM_COLUMN_WIDTH_UNIT` is `qtPercent`; the
 * quotation's table 23 is the odd one out, being the only web twin that has been
 * seeded so far.
 */
import {
  normalizeColumnToken,
  type ColumnAlign,
  type GridCellKind,
  type ItemColumnMeaning,
} from "@/features/sales/quotation/quotation.constants";
import type { UiTableKey } from "@/lib/ui-tables";
import type {
  ColumnWidthUnit,
  InjectedItemColumn,
} from "@/features/sales/quotation/quotation.utils";
import type { ConfiguredGridKey } from "@/lib/configured-grids";

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** `/api/v1` is already part of `API_BASE` — never write it in a path. */
export const BILL_SAVE_ENDPOINT = "/bills/create";
export const BILL_GET_ENDPOINT = "/bills/get";

// The lifecycle (§4.1). Every one takes the four keys; every body DTO runs
// `forbidNonWhitelisted`, so the bodies are built from state, never echoed.
/** Dry run: `{ok, refusals[], warnings[], rights, proposals}`, or 422 with the refusals. */
export const BILL_VALIDATE_ENDPOINT = "/bills/validate";
/** Keys + `overrides[]?` + `adjustments[]?` + `printAfter?`. Posts what the SERVER holds. */
export const BILL_POST_ENDPOINT = "/bills/post";
/** The whole payload + `baseRevision` + `editRemark`. Restates the voucher in place. */
export const BILL_AMEND_ENDPOINT = "/bills/amend";
/** POSTED only, by reversal, reason mandatory. The bill keeps its number. */
export const BILL_CANCEL_ENDPOINT = "/bills/cancel";
/** DRAFT only. A POSTED id is a 409 `SALES_BILL_POSTED` (use cancel). */
export const BILL_DELETE_ENDPOINT = "/bills/delete";
/** BARE keys: `partyId, companyId, branchId, accYear, billDate` (§7.3). */
export const BILL_PARTY_CONTEXT_ENDPOINT = "/bills/party-context";
export const BILL_OPEN_SOURCES_ENDPOINT = "/bills/open-sources";
export const BILL_TRANSPORT_ENDPOINT = "/bills/transport";
export const BILL_TENDER_CONTEXT_ENDPOINT = "/bills/tender-context";
export const BILL_RETENDER_ENDPOINT = "/bills/retender";
export const BILL_DELIVERY_STATUS_ENDPOINT = "/bills/delivery-status";
/** `POST /customers/create` — the quick add (§7.7). A 409 names the clashing ledger. */
export const CUSTOMER_CREATE_ENDPOINT = "/customers/create";

/** `GET /promotion-scheme/list?company=` — the whole graph. NEVER pass a branch (§11). */
export const PROMOTION_SCHEME_LIST_ENDPOINT = "/promotion-scheme/list";
/** `GET /branch-masters/get?brId` — the dispatch-from address (§20.2). */
export const BRANCH_GET_ENDPOINT = "/branch-masters/get";
/** `GET /temp-credits/open` and `PUT /temp-credits/follow-up` (§24). */
export const TEMP_CREDIT_OPEN_ENDPOINT = "/temp-credits/open";
export const TEMP_CREDIT_FOLLOW_UP_ENDPOINT = "/temp-credits/follow-up";
/** The GST actions (§21). Not on the test box (404); the screen shows the answer. */
export const GST_EINVOICE_GENERATE_ENDPOINT = "/gst/einvoice/generate";
export const GST_EWAYBILL_GENERATE_ENDPOINT = "/gst/ewaybill/generate";
export const GST_EWAYBILL_VEHICLE_ENDPOINT = "/gst/ewaybill/vehicle";

/**
 * The credits a customer already holds, for the adjustment panel (§10).
 *
 * Note the name: `party-balance`, on the TRANSACTION controller, not anything
 * bill-shaped. It answers every open ADVANCE and SALES_RETURN the party holds on
 * the CR side (the company owes them), oldest first, and it takes no accounting
 * year — credits are never carried forward, so a March advance really does
 * settle an April invoice and each row reports its own `billAccYear`.
 */
export const OPEN_CREDITS_ENDPOINT = "/transactions/party-balance";

/**
 * `PUT /sale-orders/cancel-lines` — what "Cancel on Order" calls (§8).
 *
 * `srcModule` is `SALES_ORDER` here: the bill holds the order only as its source
 * document, which is exactly the case this route was written for.
 */
export const SALE_ORDER_CANCEL_LINES_ENDPOINT = "/sale-orders/cancel-lines";
export const CANCEL_LINES_SRC_MODULE = "SALES_ORDER";

/** `GET /sale-orders/get` and `GET /quotations/get` — the two import sources (§13). */
export { SALE_ORDER_GET_ENDPOINT } from "@/features/sales/sale-order/sale-order.constants";
export { QUOTATION_GET_ENDPOINT } from "@/features/sales/quotation/quotation.constants";

// ---------------------------------------------------------------------------
// Grids and dropdowns
// ---------------------------------------------------------------------------

/**
 * The UI Table Master row this screen's item grid is laid out by —
 * "SALE BILL - LINES", 94 configured columns, one per
 * `SALE_BILL_ITEM_COLUMN_MEANINGS` entry in the same `ui_tbl_clm_no` order. 89 of
 * the 94 are visible by default; the five hidden ones are Code, AliasName,
 * SchemeName, CashDiscPerc and CashDiscAmt.
 *
 * `useUiTableId` turns this into a `fixed.ui_tables.ui_tbl_id` at runtime (22 on
 * the reference database) — the id is per-deployment, the name is not.
 */
export const SALE_BILL_ITEM_GRID_UI_TABLE_KEY: UiTableKey = "saleBillLines";

/**
 * That table is a Desktop layout (`ui_tbl_device_type = 'Desktop'`), so its
 * widths are Qt-style percentages of the viewport, not pixels — the same choice
 * the sale order's grid forces.
 */
export const SALE_BILL_ITEM_COLUMN_WIDTH_UNIT: ColumnWidthUnit = "qtPercent";

/**
 * `fixed.grid_details.grid_id` 86 — "TXN MAIN LIST - BILLS". Binds
 * `icompany_id`, `ibranch_id`, `iacc_year`, `ifrom_date`, `ito_date`.
 *
 * It has a YEAR token, unlike the sale order's grid 87 where the date window is
 * the whole scope — which is right: `sale_bill` is partitioned by
 * `sb_acc_year`, so a list that spanned years would scan every partition.
 */
export const BILL_LIST_GRID_KEY: ConfiguredGridKey = "billList";

/** How far back the F8 picker opens. A counter's bills are looked up by day. */
export const BILL_LIST_WINDOW_DAYS = 30;

/** Grid 113 — "MAIN LIST - BILL DELIVERY" (§24): `idelivery_status` filter, '' = the pending set. */
export const BILL_DELIVERY_LIST_GRID_KEY: ConfiguredGridKey = "billDeliveryList";
/** Grid 114 — "MAIN LIST - TEMP CREDITS" (§24): `istatus` + `ioverdue_only`; 365 days. */
export const TEMP_CREDIT_LIST_GRID_KEY: ConfiguredGridKey = "tempCreditList";
export const TEMP_CREDIT_LIST_WINDOW_DAYS = 365;
/** Grid 115 — "POPUP - RECENT BILLS FOR RE-TENDER" (§22): this device's bills, today. */
export const RETENDER_PICKER_GRID_KEY: ConfiguredGridKey = "retenderBillPopup";

/** ui table 25 — "ADVANCE ADJ", the adjust panel's layout (§14.2). */
export const ADJUST_GRID_UI_TABLE_KEY: UiTableKey = "advanceAdj";

/** The charges grid is the quotation's own — shared, not similar. */
export { CHARGE_GRID_UI_TABLE_KEY } from "@/features/sales/quotation/quotation.constants";

/**
 * `fixed.menu_master.menu_id` 12 — "Sales Entry" (Ctrl+S), a direct child of
 * Sales. The widget-master header config is keyed by it, the same way the
 * quotation's is keyed by 14.
 */
export const SALE_BILL_WIDGET_MENU_ID = "12";

// ---------------------------------------------------------------------------
// Settings this screen reads (`fixed.app_setting_def`, resolved for the session)
// ---------------------------------------------------------------------------

/**
 * "Seed walk-in customer" — whether a new bill opens on a default party at all.
 * BOOL, catalogued `true`, and settable down to the DEVICE, because the walk-in
 * is a property of the counter rather than of the company.
 */
export const WALK_IN_CUSTOMER_ENABLED_SETTING_KEY = "sales.pop_default_customer";

/**
 * "Walk-in customer" — WHO that party is, as a `customer_master` id. Read as
 * text, like every setting value, and handed straight to the customer lookup:
 * an id that names no customer simply fails the lookup and leaves the picker
 * empty, which is the same place the operator would have started anyway.
 */
export const WALK_IN_CUSTOMER_ID_SETTING_KEY = "sales.default_customer_id";

// ---------------------------------------------------------------------------
// Enum-shaped columns (`ck_sb_*`, re-checked server-side per save)
// ---------------------------------------------------------------------------

/**
 * `sb_doc_type`. NOT the screen's name for itself — a bill is a TAX_INVOICE
 * unless the seller is composition-scheme or the goods are exempt, in which case
 * it is a BILL_OF_SUPPLY. The server defaults to TAX_INVOICE.
 */
export const BILL_DOC_TYPES = ["TAX_INVOICE", "BILL_OF_SUPPLY"] as const;
export type BillDocType = (typeof BILL_DOC_TYPES)[number];
export const DEFAULT_BILL_DOC_TYPE: BillDocType = "TAX_INVOICE";

/**
 * `sb_bill_type` — the TERM, and the single most consequential control on the
 * screen. CASH means the money is taken now and the settlement gate applies
 * (§14.6); CREDIT means the party debit stays open and due days / due date
 * become required (§14.5).
 */
export const BILL_TYPES = ["CASH", "CREDIT"] as const;
export type BillType = (typeof BILL_TYPES)[number];
export const DEFAULT_BILL_TYPE: BillType = "CASH";

/**
 * The lifecycle: DRAFT → POSTED → (amend → POSTED rev+1) → CANCELLED (§1). A
 * save is ALWAYS a draft — the server ignores whatever status is sent — and only
 * `/bills/post` moves it. A cancelled bill keeps its number and stays on the
 * list.
 */
export const BILL_STATUSES = ["DRAFT", "POSTED", "CANCELLED"] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];
export const DEFAULT_BILL_STATUS: BillStatus = "DRAFT";

/** `sb_bill_mode` — menu 12 is WHOLESALE; POS will be its own screen (§3.4). */
export const BILL_MODES = ["WHOLESALE", "POS"] as const;
export const DEFAULT_BILL_MODE = "WHOLESALE";

/**
 * `sales.auto_post` — Save is check → create → post, and a refused post leaves
 * NO draft behind (§17.4–17.6). Off, Save writes a draft and Post is F6.
 */
export const AUTO_POST_SETTING_KEY = "sales.auto_post";

// The rest of the settings this screen reads (§25). All `sales.*`; a TEXT /
// UUID override of `null` is read as `''`, only bools and numbers fall back to
// their compiled defaults.
/** `none | cash_bills | all_bills` (DEVICE): the tender route (§15.1). */
export const TENDER_TYPE_SETTING_KEY = "sales.tender_type";
export const TENDER_TYPES = ["none", "cash_bills", "all_bills"] as const;
export const DEFAULT_TENDER_TYPE = "all_bills";
/** Disables (never hides) the settle dialog's Save. */
export const TENDER_PRINT_ONLY_SETTING_KEY = "sales.tender_print_only";
/** Client check 7, the tender "cannot exceed" gate, and the server's `SALES_TENDER_MIN_MAX`. */
export const ALLOW_EXCESS_TENDER_SETTING_KEY = "sales.allow_excess_tender";
/**
 * BRANCH scope. Its definition row (SQL 38) is not applied on the box, so the
 * default "locked" holds (§7.6, §27 SET-38).
 */
export const ALLOW_PAYMENT_TERM_CHANGE_SETTING_KEY = "sales.allow_payment_term_change";
/** A bill with a source document locks Customer and Beat unless this is on (§7.7). */
export const ALLOW_CUSTOMER_CHANGE_ON_IMPORT_SETTING_KEY = "sales.allow_customer_change_on_import";
/** Off → a re-pick bumps the existing line's qty; on → confirm "add it again?" (§8.3). */
export const ALLOW_DUPLICATE_ITEM_SETTING_KEY = "sales.allow_duplicate_item";
/** The order cap (§8.6). */
export const ALLOW_BILL_OVER_ORDER_QTY_SETTING_KEY = "sales.allow_bill_over_order_qty";
export const SALESMAN_MANDATORY_SETTING_KEY = "sales.salesman_mandatory";
/** A second order may be appended to a bill (§13.3). */
export const MULTI_ORDER_BILL_SETTING_KEY = "sales.multi_order_bill";
/** JSON `{prefix, itemLen, valueLen, valueKind, divisor}` (§9.2). */
export const WEIGHT_BARCODE_SETTING_KEY = "sales.weight_barcode";
/** DEVICE: a scan lands with qty 1 (§9.1). */
export const AUTO_POP_QTY_SETTING_KEY = "sales.auto_pop_qty";
export const AUTO_SAVE_TEMP_BILL_SETTING_KEY = "sales.auto_save_temp_bill";
/** DEVICE: Clear drops the crew too. Off, a trip keeps its van across customers (§7.9). */
export const CLEAR_DELIVERY_ON_CLEAR_SETTING_KEY = "sales.clear_delivery_on_clear";
export const TEMP_CREDIT_MAX_DAYS_SETTING_KEY = "sales.temp_credit_max_days";
export const TEMP_CREDIT_MAX_AMOUNT_SETTING_KEY = "sales.temp_credit_max_amount";
/** Read as an ENUM `OFF | WARN | REFUSE` (§15.7 D7); the catalogue types it BOOL, so `true` = REFUSE. */
export const TEMP_CREDIT_BLOCK_OPEN_SETTING_KEY = "sales.temp_credit_block_open";
/** A free line may still carry tax (the "rate 0" client check exempts it). */
export const FREE_ITEM_TAX_SETTING_KEY = "sales.free_item_tax";
export const REQUIRE_VERIFICATION_BEFORE_DISPATCH_SETTING_KEY =
  "sales.require_verification_before_dispatch";
export const DELIVERY_STATUS_TRACKING_SETTING_KEY = "sales.delivery_status_tracking";
/** The policy snapshot's defaults, taken once per document (§25). */
export const DEFAULT_PRICE_LEVEL_SETTING_KEY = "sales.default_price_level";
export const ROUND_OFF_STEP_SETTING_KEY = "sales.round_off_step";
export const FREIGHT_CALC_TYPE_SETTING_KEY = "sales.freight_calc_type";
export const LOADING_CALC_TYPE_SETTING_KEY = "sales.loading_calc_type";
export const DISC_ALTER_BASE_RATE_SETTING_KEY = "sales.disc_alter_base_rate";

/** The colour a source kind's tag paints (§13.6). */
export const SOURCE_KIND_COLOURS: Record<string, string> = {
  ORDER: "#1a5fb4",
  SALES_ORDER: "#1a5fb4",
  DC: "#7048e8",
  DELIVERY_CHALLAN: "#7048e8",
  QUOTATION: "#0b7285",
};
export const SOURCE_KIND_TAGS: Record<string, string> = {
  ORDER: "SO",
  SALES_ORDER: "SO",
  DC: "DC",
  DELIVERY_CHALLAN: "DC",
  QUOTATION: "QT",
};

/** The transport modes the band accepts (§20.2): '' = unset. */
export const TRANSPORT_MODES = ["", "ROAD", "RAIL", "AIR", "SHIP"] as const;

/** The re-tender void reasons (§22), `OTHER` included — the server accepts it. */
export const RETENDER_VOID_REASONS = [
  { value: "UPI_FAILED", label: "UPI failed" },
  { value: "CARD_DECLINED", label: "Card declined" },
  { value: "CHEQUE_REFUSED", label: "Cheque refused" },
  { value: "KEYED_WRONG", label: "Keyed wrong" },
  { value: "CUSTOMER_CHANGED", label: "Customer changed" },
  { value: "OTHER", label: "Other" },
] as const;

/** Delivery events (§24), in the order the server enforces. */
export const DELIVERY_EVENTS = ["VERIFIED", "PACKED", "DISPATCHED", "DELIVERED"] as const;
export type DeliveryEvent = (typeof DELIVERY_EVENTS)[number];

/** Menu ids for the registers Shift+F2 / Shift+F3 open (§21). */
export const EINVOICE_REGISTER_MENU_ID = 152;
export const EWAYBILL_REGISTER_MENU_ID = 153;
/** The temp-credit follow-up list's "Receive" opens the receipt (menu 99). */
export const RECEIPT_ROUTE = "/accounts/receipt";

/** The reasons a cancel offers ready-made (§17.9). Free text is always allowed. */
export const CANCEL_REASON_PRESETS = [
  "Keyed wrong",
  "Wrong customer",
  "Duplicate bill",
  "Customer cancelled the purchase",
] as const;

/** `sb_cancel_reason` / `editRemark` — varchar(250) on both. */
export const REMARK_MAX_LENGTH = 250;

export const PAY_STATUSES = ["UNPAID", "PARTIAL", "PAID"] as const;
export const DEFAULT_PAY_STATUS = "UNPAID";

/** `sbi_line_status`, mirrored from the source order line. Display only here. */
export const LINE_STATUSES = ["PENDING", "PARTIAL", "DELIVERED", "CANCELLED"] as const;

/** `sb_src_doc_type` — what a bill may be raised from (§13). */
export const BILL_SOURCE_DOC_TYPES = ["QUOTATION", "SALES_ORDER", "DELIVERY_CHALLAN"] as const;
export type BillSourceDocType = (typeof BILL_SOURCE_DOC_TYPES)[number];

/**
 * How many days a CREDIT bill runs by default when the customer master says
 * nothing. The master's own `debit_days` wins whenever it is set.
 */
export const DEFAULT_DUE_DAYS = 0;

// ---------------------------------------------------------------------------
// The item grid — all 94 configured columns of ui table 22, in `uiTblClmNo`
// order.
//
// Columns 0–88 are the sales vocabulary the quotation and the order also speak,
// with two differences from the order's table 24: column 4 is `AliasName` here
// (the order puts `Size` there), and column 14 is named `Bill Qty` rather than
// `Quote Qty` — the same `billQty` field either way.
//
// Columns 89–93 are the bill's own: the batch allocation (`StockId`,
// `BatchDate`, `SerialNo`) and the source order line's echo (`PendingQty`,
// `LineStatus`).
//
// NOTE: **table 22 configures no Size column at all** — it is the Qt client's
// own Desktop layout, and seeding a column into it would move that screen too.
// `sbi_size` / `sbi_size_uom` exist on the item DTO and §7.4 specifies the
// size → cubic-feet → Bill Qty conversion, so rather than seed, the cell is
// INJECTED client-side: `SALE_BILL_INJECTED_ITEM_COLUMNS` below, spliced in
// after Description by `resolveItemColumnsWith`. It is deliberately not a
// member of the list below, because `SALE_BILL_ITEM_COLUMN_NUMBERS` is derived
// from that list's order and every number after an inserted one would shift.
// ---------------------------------------------------------------------------

function col(
  token: string,
  kind: GridCellKind,
  align: ColumnAlign,
  extra: Omit<ItemColumnMeaning, "token" | "key" | "kind" | "align"> = {},
): ItemColumnMeaning {
  return { token, key: normalizeColumnToken(token), kind, align, ...extra };
}

export const SALE_BILL_ITEM_COLUMN_MEANINGS: ItemColumnMeaning[] = [
  // 0 — configured as "Id" on this deployment; resolves via isSerialColumnName.
  col("Id", "serial", "right"),
  col("Barcode", "text", "left", { write: "barcode", read: "barcode" }),
  col("Code", "text", "left", { read: "itemCode" }),
  col("Description", "itemLookup", "left", { read: "itemName" }),
  // 4 — where the order's grid carries Size. This layout carries neither a Size
  // nor an ItemSize row, so the bill's Size cell is injected instead and sits
  // just BEFORE this column; see `SALE_BILL_INJECTED_ITEM_COLUMNS`.
  col("AliasName", "text", "left", { read: "aliasName" }),
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
  // 12 — on an imported line this is the PENDING quantity of the order line,
  // not the ordered one, and the cell is read-only (§7.3). The read-only half is
  // enforced on the draft line, not here: a column is editable or not for the
  // whole grid, and a hand-keyed line has nothing to cap.
  col("OrderQty", "qty", "right", { write: "orderQty", read: "orderQty", precision: 3 }),
  col("Case Qty", "qty", "right", { write: "caseQty", read: "caseQty", precision: 3 }),
  // 14 — "Bill Qty" on this layout; the same `billQty` the quotation's grid
  // calls "Quote Qty" and the order's calls "Bill Qty" as well.
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
  // Writes the keyed amount, shows the computed one — see `ItemColumnMeaning`.
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
  // Read-only, and deliberately so: `AllowNegative` belongs to the ITEM master
  // and reaches the line through the price lookup. The Qt screen wrote it by
  // hand on three different paths and produced three different behaviours
  // (§7.2); a cell nobody can key is the cheapest way not to inherit that.
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
  // 89–91 — the batch allocation. `sbi_godown_id` is REQUIRED server-side and is
  // filled by the price lookup; these three are the rest of it, and nothing
  // fills them yet (the plan's §18.2 — there is no godown or batch picker).
  //
  // StockId and SerialNo are therefore DISPLAY-ONLY, exactly as they are on the
  // sale order's grid 24: they read the line's own fields so the cells paint the
  // moment a picker starts filling them, but `ItemColumnMeaning.write` is keyed
  // to the shared `DraftLine`, and widening that shared type for two columns
  // nothing can yet write into would buy nothing. When the picker lands it will
  // write them through its own dispatch, not through a grid cell.
  //
  // BatchDate is the exception, and only because `batchDate` is already a shared
  // field: it is keyed like BatchNo and ExpiryDate, under the same
  // `batchConfig` gate.
  col("StockId", "label", "left", { read: "stockId" }),
  col("BatchDate", "date", "center", {
    write: "batchDate",
    read: "batchDate",
    editableWhen: "batchConfig",
  }),
  col("SerialNo", "label", "left", { read: "serialNo" }),
  // 92–93 — the source order line's echo: what is still pending on it and what
  // state it is in. Display-only and server-owned, reaching the grid flattened
  // out of each line's readonly `source` branch, exactly as the sale order's
  // fulfilment quartet does. No `write` key exists, so no edit can land on them.
  col("PendingQty", "qty", "right", { read: "pendingQty", precision: 3 }),
  col("LineStatus", "label", "center", { read: "lineStatus" }),
];

/**
 * The Size cell, which table 22 does not configure (see the note above).
 *
 * Same meaning the quotation's grid 23 and the order's grid 24 carry at their
 * own column 4: keyed as four boxes (L × W × T – Pcs), stored verbatim in
 * `sbi_size` as one `*` product, and what it works out to lands in Bill Qty —
 * that CFT is the quantity the line is priced on. `sbi_size_uom` follows from
 * the size itself (`SIZE_UOM`, "CFT") in `salebill.payload.ts`.
 *
 * `ItemSize` is an alias so a seeded row under either name is matched, in which
 * case the configured column wins and nothing is injected.
 */
export const SALE_BILL_SIZE_COLUMN_MEANING: ItemColumnMeaning = col("Size", "size", "left", {
  write: "itemSize",
  read: "itemSize",
  aliases: ["ItemSize"],
});

/**
 * What the bill's grid adds to whatever ui table 22 configures. Sits where the
 * order's layout puts it — straight after Description.
 *
 * `focus` asks for the Enter chain, since this is how the quantity gets keyed on
 * a size-priced line. It only takes effect once table 22 flags stops of its own:
 * as seeded it flags none, which `grid-focus.ts` reads as "stop at every
 * editable cell" — so the cell is already in the walk, and flagging it would
 * collapse the whole chain onto it.
 */
export const SALE_BILL_INJECTED_ITEM_COLUMNS: InjectedItemColumn[] = [
  {
    meaning: SALE_BILL_SIZE_COLUMN_MEANING,
    afterKey: "description",
    // Four boxes and three separators; the same room grid 23 gives the cell.
    widthPx: 104,
    focus: true,
  },
];

/**
 * `ui_tbl_clm_no` for each meaning, keyed by the meaning's `key`.
 *
 * The layout join is by NAME, which is the one thing about a column a deployment
 * is free to change — rename `Bill Qty` in ui table master and no meaning answers
 * to the new name, so the column drops off the grid entirely rather than keeping
 * its old heading. This is the fallback that catches that: a column number is
 * assigned once and never moves.
 *
 * Derived from the list above rather than written out, because for table 22 the
 * two are the same sequence: the meanings are in `uiTblClmNo` order and the
 * numbering has no gaps and no duplicates (unlike table 24, which reuses 92 and
 * 93). `salebill.constants.test.ts` asserts that.
 */
export const SALE_BILL_ITEM_COLUMN_NUMBERS: Record<string, number> = Object.fromEntries(
  SALE_BILL_ITEM_COLUMN_MEANINGS.map((meaning, index) => [meaning.key, index]),
);

/**
 * The column count the layout must declare. If `/ui-table-masters/get` answers
 * with any other number for table 22, the client warns: a column added
 * server-side would mislabel everything after it.
 */
export const SALE_BILL_ITEM_COLUMN_COUNT = 94;

// ---------------------------------------------------------------------------
// Holds (§12)
// ---------------------------------------------------------------------------

/**
 * `ck_txh_doc_type` — the document a parked bill cart will become. SALE_BILL is
 * a value the constraint already allows; it is kept in step with
 * `ck_tsl_src_doc_type` so one join reads a hold's status trail.
 */
export const SALE_BILL_HOLD_DOC_TYPE = "SALE_BILL";
/** `ck_txh_src_module` — the same vocabulary `txn_status_log` uses. */
export const SALE_BILL_HOLD_SRC_MODULE = "SALES";
/**
 * `ck_txh_kind`. HOLD is the operator pressing Hold, and it appears in the pick
 * list. (AUTOSAVE is a kind the table also offers — see `salebill.hold.ts` for
 * why crash recovery does not use it.)
 */
export const SALE_BILL_HOLD_KIND = "HOLD";
/** `ck_txh_party_typed` wants a type wherever there is an id. */
export const SALE_BILL_HOLD_PARTY_TYPE = "CUSTOMER";

/**
 * The envelope stamped into `txh_payload`, and checked on the way back out.
 *
 * `txn_hold` is shared — the till parks carts in it, and so does the quotation
 * screen — so a hold with no envelope of ours, or one written by another screen,
 * is not a bill cart and must not appear in this picker. The version is bumped
 * when the stored shape changes in a way an older reader cannot survive.
 */
export const SALE_BILL_UI_STATE_KIND = "erp.sale-bill.hold";
export const SALE_BILL_UI_STATE_SCREEN = "sale-bill-entry";
export const SALE_BILL_UI_STATE_VERSION = 1;

/** How long the autosave debounce waits after the last edit. */
export const AUTOSAVE_DEBOUNCE_MS = 1500;

// ---------------------------------------------------------------------------
// Widget master — the header panel's configurable fields
// ---------------------------------------------------------------------------

/**
 * Sections are scoped by platform as well as by menu, and the server validates
 * this against a case-sensitive enum (Mobile | Desktop | Web).
 */
export const SALE_BILL_WIDGET_PLATFORM = "Web";

/**
 * Bridges each header field to the backend `fixed.form_field.field_name` it is
 * configured under (matched case-insensitively). A key missing from the config
 * keeps its hardcoded label and stays VISIBLE, so a failed or empty fetch leaves
 * the screen exactly as authored — which is what makes shipping this config
 * optional.
 *
 * The shipped config names every field after the label this screen already
 * showed, so the same string doubles as the fallback label; a configured
 * `fieldGuiName` / `fieldSecondaryText` overrides it, nothing else does.
 *
 * Names are deliberately the QUOTATION's wherever the field is the same one
 * (Existing Customer, Customer Name, Address, Place, Phone, GSTIN, POS State
 * Code, Salesman, Agent, Contact Person, Contact No, Freight, Load, Unload,
 * Promo, Price Level). An operator who has configured one sales screen should
 * recognise the next.
 *
 * What this config reaches is the header and the Terms block. The two grids take
 * their column layout from `fixed.ui_table_columns` instead, through their own
 * right-click "Admin settings" — and the credit column is not here at all,
 * because every figure in it is the server's answer about the party rather than
 * something this document states.
 */
export const SALE_BILL_HEADER_FIELD_NAMES = {
  // --- customer ---
  existingCustomer: "Existing Customer",
  customerName: "Customer Name",
  address: "Address",
  place: "Place",
  phone: "Phone",
  gstin: "GSTIN",
  /**
   * Two different facts since 2026-09-11 (§5), so two rows: the customer's own
   * state is a snapshot that decides nothing, and the place of supply is what
   * splits CGST+SGST from IGST. A site may hide the first; hiding the second
   * takes the tax decision off the screen, which is its choice to make.
   */
  customerState: "Customer State",
  posStateCode: "POS State Code",
  // --- the bill ---
  billNo: "Bill No",
  usrRefno: "Ref No",
  billDate: "Bill Date",
  docType: "Document Type",
  billType: "Term",
  dueDays: "Due Days",
  dueDate: "Due Date",
  priceLevel: "Price Level",
  freight: "Freight",
  load: "Load",
  unload: "Unload",
  promo: "Promo",
  // --- people ---
  salesman: "Salesman",
  agent: "Agent",
  driver: "Driver",
  loadman: "Loadman",
  packedBy: "Packed By",
  supervisor: "Supervisor",
  vehicleNo: "Vehicle No",
  contactPerson: "Contact Person",
  contactNo: "Contact No",
  loyalty: "Loyalty",
  commission: "Commission",
  // --- the credit column ---
  //
  // Read-only figures — every one is the server's answer about the party rather
  // than something this document states — but configurable all the same: a
  // counter that never sells on credit has five read-outs it does not want the
  // screen width spent on.
  //
  // The KEY is the label, because that is what `OrderCreditBlock` addresses its
  // rows by; the two must stay in step (`CreditFieldLabel`).
  creditOutstanding: "Outstanding",
  creditOverdue: "Overdue",
  creditOverdueBy: "Overdue By",
  creditLimit: "Credit Limit",
  creditAvailable: "Available",
} as const;
export type SaleBillHeaderFieldKey = keyof typeof SALE_BILL_HEADER_FIELD_NAMES;

/**
 * The bill's five credit rows, keyed the way `OrderCreditBlock` addresses them —
 * by their shipped label — and mapped back to this screen's own field keys.
 *
 * The indirection exists because the credit block is the SALE ORDER's component,
 * shared rather than copied, and it knows nothing about this screen's key
 * vocabulary.
 */
export const SALE_BILL_CREDIT_FIELD_KEYS = {
  Outstanding: "creditOutstanding",
  Overdue: "creditOverdue",
  "Overdue By": "creditOverdueBy",
  "Credit Limit": "creditLimit",
  Available: "creditAvailable",
} as const satisfies Record<string, SaleBillHeaderFieldKey>;

/**
 * The same bridge for the Terms panel, configured under its own section of the
 * same menu. The section carries the panel: hiding the section hides every row
 * in it, and the panel goes with them.
 */
export const SALE_BILL_TERMS_FIELD_NAMES = {
  remarks: "Remarks",
  paymentTerms: "Payment Terms",
  deliveryTerms: "Delivery Terms",
  termsConditions: "Other Terms",
} as const;
export type SaleBillTermsFieldKey = keyof typeof SALE_BILL_TERMS_FIELD_NAMES;
