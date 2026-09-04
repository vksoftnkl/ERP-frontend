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
export const UI_TABLE_VISIBILITY_ENDPOINT = "/ui-table-masters/layout-settings";
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
/** GET, `?sectionMenuId=…&sectionPlatform=…` — the header panel's field config. */
export const WIDGET_MASTERS_GET_ENDPOINT = "/widget-masters/get";
/**
 * PATCH, `{ data: [{ sectionId, sectionGuiName, sectionVisibility, fields: [{
 * fieldId, fieldSecondaryText, fieldVisibility }] }] }` — the Visible Settings
 * dialog. Both string fields are required by the DTO, so an unset one is sent as
 * `""` rather than the null the config carries.
 */
export const WIDGET_MASTERS_VISIBILITY_ENDPOINT = "/widget-masters/visibility";
/**
 * Hold / Pick held — `public.txn_hold`.
 *
 * The table the till was rebuilt around, and the successor to the old
 * `transaction_hold`: every column is `txh_*`, the routes moved to `/txn-holds`
 * with it, and the screen state now travels in `txh_payload` (the module stores
 * and returns it verbatim) rather than in `th_ui_state`.
 *
 * One route creates AND updates (`txhId`'s presence selects which), exactly like
 * `/quotations/create`.
 */
export const TXN_HOLD_SAVE_ENDPOINT = "/txn-holds/create";
export const TXN_HOLD_LIST_ENDPOINT = "/txn-holds/list";
export const TXN_HOLD_GET_ENDPOINT = "/txn-holds/get";
export const TXN_HOLD_DELETE_ENDPOINT = "/txn-holds/delete";
/**
 * The edit lease — `HELD → LOCKED → CONVERTED`, with `release` (and the
 * `force-release` escape hatch) going back to `HELD`.
 *
 * These are NOT the save route with a different status: each is one conditional
 * UPDATE server-side, with the status it moves *from* — and, on release and
 * convert, `txh_locked_device_id = this device` — inside the WHERE clause. That
 * is what makes two tills resuming one cart serialize on the row instead of both
 * winning, and what stops one till spending a lease another one holds.
 *
 * A lease also EXPIRES (`txh_lock_expires_on`), so a browser that died mid-edit
 * strands its cart only until the lease lapses; take-over is the way through
 * before that.
 *
 * The lease holder is the DEVICE, named by the `X-Device-Id` header (never a
 * body field, so there is no second, disagreeing source of truth). It is a
 * `fixed.device_master.dev_id` and a real foreign key — the browser's own local
 * uuid is not one. See `HOLD_DEVICE_ID_HEADER`.
 */
export const txnHoldLockEndpoint = (
  txhId: string,
  action: "resume" | "release" | "force-release" | "convert",
): string => `/txn-holds/${txhId}/${action}`;
export const HOLD_DEVICE_ID_HEADER = "X-Device-Id";
/**
 * `fixed.ui_tables.ui_tbl_id` for the item grid — 23 ("Quotation-item", 90
 * columns, one per `ITEM_COLUMN_MEANINGS` entry and in the same order).
 *
 * NOT 18 ("Quotation"): that is the Qt screen's own layout, and its widths are
 * that grid's fractional percents rather than pixels — see `ColumnWidthUnit`.
 */
export const ITEM_GRID_UI_TABLE_ID = "23";
/**
 * `fixed.ui_tables.ui_tbl_id` for the additional-charges grid — 26
 * ("QUOTATION - CHARGES", 33 columns, one per `CHARGE_COLUMN_MEANINGS` entry and
 * in the same order). Shared by this screen and Sale Order, which re-exports it.
 *
 * NOT 21 ("CHARGES") for the same reason the item grid is not 18: that is the Qt
 * screen's own layout, in that grid's fractional percents rather than pixels, and
 * it opens on three columns. Pointing the web screens at it also meant every save
 * from the browser's "Admin settings" rewrote the desktop screen's layout.
 * Provisioned by the server's `Quotation_Charges_Grid_Web.sql` seed.
 */
export const CHARGE_GRID_UI_TABLE_ID = "26";
/** `fixed.grid_details.grid_id` for the item picker popup ("POPUP - ITEMS"). */
export const ITEM_PICKER_GRID_ID = "71";
/**
 * `fixed.grid_details.grid_id` for the browse list — grid 84 ("Quotation").
 *
 * Two properties of this grid drive how the list is built:
 *
 *  - Its SQL is **parameterised, and the parameters are not optional**:
 *    `sq_company_id = 'icompany_id'::uuid`, `ibranch_id`, `iacc_year`, and an
 *    `ifrom_date` / `ito_date` window. The runner binds each named token from
 *    `grid_param`; one left unbound stays in the SQL as a literal, and the cast
 *    then fails the whole run (`invalid input syntax for type uuid`). Every
 *    caller of this grid therefore sends all five keys — the dates as `""`,
 *    which the SQL's `NULLIF(…) IS NULL OR` guards read as "no bound".
 *  - It does **not** filter `sq_is_deleted`, so soft-deleted rows come back and
 *    `meta.total` counts them; the list shows them, tagged, rather than hiding
 *    rows the grid plainly returned.
 *
 * (Grid 83, "QUOTATION - MAIN LIST", selects the same columns behind the same
 * parameters, but hides half of them and is not the configured list for this
 * screen.)
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
// Visible Settings — the header panel's configured fields
// ---------------------------------------------------------------------------
/**
 * `fixed.menu_master.menu_id` for Quotation. Its Web config is one section,
 * "Quoation entry" (`fixed.form_section` 61), holding one row per field in the
 * three header blocks.
 */
export const QUOTATION_WIDGET_MENU_ID = "14";
/**
 * Sections are scoped by platform as well as by menu, and the server validates
 * this against a case-sensitive enum (Mobile | Desktop | Web).
 */
export const QUOTATION_WIDGET_PLATFORM = "Web";
/**
 * Bridges each header field to the backend `fixed.form_field.field_name` it is
 * configured under (matched case-insensitively). A key missing from the config
 * keeps its hardcoded label and stays visible, so a failed or empty fetch leaves
 * the screen exactly as authored.
 *
 * The shipped config names every field after the label this screen already
 * showed, so the same string doubles as the fallback label — a configured
 * `fieldGuiName` / `fieldSecondaryText` overrides it, nothing else does.
 *
 * The header and the Terms block are what this config reaches; the two grids
 * take their column layout from `fixed.ui_table_columns` instead (their own
 * right-click "Admin settings").
 */
export const QUOTATION_HEADER_FIELD_NAMES = {
  existingCustomer: "Existing Customer",
  customerName: "Customer Name",
  address: "Address",
  place: "Place",
  phone: "Phone",
  gstin: "GSTIN",
  posStateCode: "POS State Code",
  beat: "Beat",
  salesman: "Salesman",
  agent: "Agent",
  contactPerson: "Contact Person",
  contactNo: "Contact No",
  freight: "Freight",
  load: "Load",
  unload: "Unload",
  promo: "Promo",
  quoteNo: "Quote No",
  quoteDate: "Quote Date",
  validUntil: "Valid Until",
  validityDays: "Validity Days",
  priceLevel: "Price Level",
} as const;
export type QuotationHeaderFieldKey = keyof typeof QUOTATION_HEADER_FIELD_NAMES;
/**
 * The same bridge for the Terms panel, configured under its own section
 * ("Quotation-terms") of the same menu. Its section carries the panel: hiding
 * the section hides every row in it, and the panel goes with them.
 *
 * The keys are `QuotationTerms`' own, so a row here is the field it names.
 */
export const QUOTATION_TERMS_FIELD_NAMES = {
  remarks: "Remarks",
  paymentTerms: "Payment Terms",
  deliveryTerms: "Delivery Terms",
  termsConditions: "Other Terms",
} as const;
export type QuotationTermsFieldKey = keyof typeof QUOTATION_TERMS_FIELD_NAMES;
// ---------------------------------------------------------------------------
// Transaction hold (F9 park / F10 recall)
// ---------------------------------------------------------------------------
/**
 * `txh_doc_type` for a parked quotation.
 *
 * `ux_txh_hold_no` is scoped per document type, so quotation holds have their
 * own number space rather than sharing anyone else's.
 */
export const QUOTATION_HOLD_DOC_TYPE = "QUOTATION";
/**
 * `txh_src_module` — the module the parked screen belongs to, sharing its
 * vocabulary with `txn_status_log.tsl_src_module` so one join reads a hold's
 * whole trail. Required on create.
 */
export const QUOTATION_HOLD_SRC_MODULE = "SALES";
/**
 * `txh_kind`. `HOLD` is the operator-facing pick list; `AUTOSAVE` is a screen's
 * crash-recovery snapshot (upserted in place, invisible to the picker) and
 * `TEMPLATE` a starting point that is copied on resume rather than consumed.
 * This screen only ever writes `HOLD`.
 */
export const QUOTATION_HOLD_KIND = "HOLD";
/**
 * `ck_txh_party_type` — which master `txh_party_id` points into. The reference
 * is polymorphic (there is no FK), so the type travels with the id, and a
 * walk-in is a `CUSTOMER` with a name and no id at all.
 */
export const QUOTATION_HOLD_PARTY_TYPE = "CUSTOMER";
/**
 * `ck_txh_status`. `CONVERTED` / `EXPIRED` / `CANCELLED` / `ABANDONED` are
 * terminal — the server refuses to move a hold out of them, so nothing here ever
 * tries.
 */
export const HOLD_STATUSES = [
  "HELD",
  "LOCKED",
  "RESUMED",
  "CONVERTED",
  "EXPIRED",
  "CANCELLED",
  "ABANDONED",
] as const;
export type HoldStatus = (typeof HOLD_STATUSES)[number];
/**
 * The statuses a parked cart can still be picked up from, which is what the
 * held list shows.
 *
 * `HELD` is free and `LOCKED` is leased to a device — the lock endpoints move a
 * hold between exactly those two. `RESUMED` is neither: it is what a client that
 * drove the status through the CRUD route leaves behind, and the server treats
 * it as in use, so it is shown (and offered a take-over) rather than hidden.
 */
export const HOLD_LIVE_STATUSES = ["HELD", "LOCKED", "RESUMED"] as const;
/** In use by somebody — `LOCKED` by the lease, `RESUMED` by the CRUD route. */
export const HOLD_IN_USE_STATUSES = ["LOCKED", "RESUMED"] as const;
/**
 * What `txh_payload` holds, and how a reader knows it is ours. The server stores
 * and returns the object verbatim and never reads into it, so this envelope is
 * the only contract there is — hence a `kind` and a `version` on every write,
 * checked on every read.
 */
export const HOLD_UI_STATE_KIND = "erp.sales.quotation.hold";
export const HOLD_UI_STATE_VERSION = 1;
export const HOLD_UI_STATE_SCREEN = "QUOTATION";
/**
 * `txh_hold_no` is required on create, is NOT generated server-side, and is
 * unique per company / branch / year / document type. The till it was designed
 * for owns a counter; this screen has none, so the number is minted from the
 * clock plus a random tail — see `nextHoldNo`. `varchar(30)`, stored
 * upper-cased and trimmed (`ck_txh_hold_no_shape`).
 */
export const HOLD_NO_PREFIX = "QH";
export const HOLD_NO_MAX_LENGTH = 30;
/**
 * `txh_hold_slno` — the raw per-device counter behind the printed number, so an
 * offline till can number a hold with no server round trip. Required on create,
 * `>= 1`, and unique per company / branch / year / document type / DEVICE
 * (`ux_txh_device_slno`). This browser keeps it in `localStorage`; see
 * `nextHoldSlno`.
 */
export const HOLD_SLNO_STORAGE_PREFIX = "erp_quotation_hold_slno";
/**
 * `txh_acc_year` is `char(9)` — the partition key, written exactly as the fiscal
 * year names itself (`2026-2027`). It is half the primary key and immutable once
 * the row exists, which is why a draft with no resolved year is refused rather
 * than parked under a guess.
 */
export const HOLD_ACC_YEAR_LENGTH = 9;
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
/**
 * The row-number column both grids open on. It is the one column whose configured
 * name is not a field at all, so deployments rename it freely — item grid 23 is
 * configured as `"sl.no"` here and as `"Id"` elsewhere, charge grid 26 as `"#"` —
 * and a name this list misses drops the column off the grid entirely rather than
 * rendering it blank.
 */
export const SERIAL_COLUMN_KEY = "slno";
const SERIAL_COLUMN_ALIASES = new Set([
  SERIAL_COLUMN_KEY,
  "id",
  "sl",
  "sno",
  "srno",
  "serial",
  "serialno",
  "rowno",
]);
/** Whether a normalised `ui_tbl_clm_name` names the serial column. */
export function isSerialColumnName(normalized: string): boolean {
  return SERIAL_COLUMN_ALIASES.has(normalized);
}
export type GridCellKind =
  | "serial"
  | "text"
  /** The item's dimensions, keyed as four boxes and stored as one `*` product. */
  | "size"
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
  /**
   * Further verbatim `ui_tbl_clm_name`s that mean this same column, for layouts
   * that name it differently. Normalised by the resolver, like `token` is; a
   * layout carrying both a token and an alias row keeps the lower column number
   * and drops the other as a duplicate.
   */
  aliases?: string[];
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
 * All 90 configured columns of ui table 23 ("Quotation-item"), broadly in
 * `uiTblClmNo` order — `ITEM_COLUMN_NUMBERS` above is the authority on the
 * numbering, not this list's order, which differs from it in three places:
 * `AliasName` is declared here but not configured on table 23 at all, and two
 * pairs are swapped (`StockQty`/`GodownName` 9-10, `NetB.Tax`/`IsInclusiveTax`
 * 86-88).
 *
 * Grouped by column NUMBER, not position: on ui table 18 (the Qt screen's own
 * layout, which these meanings also cover) position 58 is used twice
 * (`ChrgAfterTax` and `Total`) and 62 is unused, so sorting by position makes
 * those two swap non-deterministically.
 */
/**
 * `ui_tbl_clm_no` for each meaning of ui table 23, keyed by the meaning's `key`.
 *
 * The layout join is by NAME, which is the one thing about a column a deployment
 * is free to change: rename `Quote Qty` in ui table master and no meaning answers
 * to the new name, so the column does not just keep its old heading — it drops
 * off the grid entirely. This is the fallback that catches that. A column number
 * is assigned once and never moves, so a renamed column still finds its meaning
 * and then paints whatever heading the layout now carries.
 *
 * `AliasName` has no entry: it is a meaning for the other layouts these columns
 * also cover, and ui table 23 does not configure it. Neither does 90 (`ItemSize`),
 * which resolves through the `Size` alias and is dropped as its duplicate.
 *
 * Kept beside the meanings rather than on them so the list above stays readable;
 * `quotation.utils.test.ts` asserts the two never drift apart.
 */
export const ITEM_COLUMN_NUMBERS: Record<string, number> = {
  slno: 1,
  barcode: 2,
  code: 3,
  description: 4,
  size: 5,
  hsn: 6,
  batchno: 7,
  expirydate: 8,
  stockqty: 9,
  godownname: 10,
  uom: 11,
  tobasefactor: 12,
  orderqty: 13,
  caseqty: 14,
  quoteqty: 15,
  lengthqty: 16,
  netqty: 17,
  sch: 18,
  isfree: 19,
  weight: 20,
  pricelevel: 21,
  mrp: 22,
  rate: 23,
  ratebtax: 24,
  gross: 25,
  discperc: 26,
  discperqty: 27,
  discamt: 28,
  spldiscperc: 29,
  spldiscperqty: 30,
  spldiscamt: 31,
  schemename: 32,
  schperc: 33,
  schperqty: 34,
  schamt: 35,
  billschdiscperc: 36,
  billschdiscamt: 37,
  netgross: 38,
  chrgbeforetax: 39,
  cashdiscperc: 40,
  cashdiscamt: 41,
  taxable: 42,
  gst: 43,
  gstamt: 44,
  cgst: 45,
  cgstamt: 46,
  sgst: 47,
  sgstamt: 48,
  igst: 49,
  igstamt: 50,
  cess: 51,
  cessuom: 52,
  cessamt: 53,
  hasfreight: 54,
  freightperqty: 55,
  freightamt: 56,
  coolyperqty: 57,
  coolyamt: 58,
  chrgaftertax: 59,
  total: 60,
  netprice: 61,
  costprice: 62,
  savingsperc: 63,
  remarks: 64,
  decimalcount: 65,
  batchconfig: 66,
  allownegative: 67,
  reorder: 68,
  actualprice: 69,
  minprice: 70,
  costbeforetax: 71,
  profit: 72,
  profitbeforetax: 73,
  loyaltypv: 74,
  salesmanname: 75,
  serviceitem: 76,
  srcdocid: 77,
  itemid: 78,
  groupid: 79,
  brandid: 80,
  sectionid: 81,
  categoryid: 82,
  godownid: 83,
  unitid: 84,
  schemeid: 85,
  netbtax: 86,
  salesmanid: 87,
  isinclusivetax: 88,
  diff: 89,
};
export const ITEM_COLUMN_MEANINGS: ItemColumnMeaning[] = [
  // The row number. Named `"sl.no"` on this deployment and `"Id"` on others —
  // both resolve here through `isSerialColumnName`, and each paints the heading
  // the layout carries. This token is only what a grid with no layout at all
  // falls back to.
  itemColumn("Sl.No", "serial", "right"),
  itemColumn("Barcode", "text", "left", { write: "barcode", read: "barcode" }),
  itemColumn("Code", "text", "left", { read: "itemCode" }),
  itemColumn("Description", "itemLookup", "left", { read: "itemName" }),
  // Grids 18, 23 and 24 all carry the item's free-text size here, named "Size".
  // Grid 23 additionally carries a second row for the same field named
  // "ItemSize" (column 90), which resolves to this meaning through the alias and
  // is then dropped as a duplicate — the lower column number wins.
  itemColumn("Size", "size", "left", {
    write: "itemSize",
    read: "itemSize",
    aliases: ["ItemSize"],
  }),
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
  itemColumn("Quote Qty", "qty", "right", { write: "billQty", read: "billQty", precision: 3 }),
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
function chargeColumn(
  token: string,
  kind: GridCellKind,
  align: ColumnAlign,
  extra: Omit<ChargeColumnMeaning, "token" | "key" | "kind" | "align"> = {},
): ChargeColumnMeaning {
  // `"#"` normalises to the empty string — an unusable map key, so the serial
  // column takes the shared sentinel the item grid's own one does.
  return { token, key: normalizeColumnToken(token) || SERIAL_COLUMN_KEY, kind, align, ...extra };
}
/** All 33 configured columns of ui table 26, in `uiTblClmNo` order. */
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
/**
 * What marks a header field. Two readers: `validate` sends the operator to the
 * field it rejected, and `header-focus.ts` walks them on Enter.
 */
export const HEADER_FOCUS_ATTR = "data-quotation-focus";
export const GRID_ROW_ATTR = "data-quotation-row";
export const GRID_GRID_ATTR = "data-quotation-grid";
export const GRID_COLUMN_INDEX_ATTR = "data-quotation-column-index";
/**
 * Marks a cell whose column carries `ui_tbl_clm_column_focus` — the layout's own
 * Enter chain. Grid 23 flags four of its ninety columns (Description, Size,
 * Quote Qty, Rate) and grid 26 three of its thirty-three (Charge Name, Rate,
 * Amount): the handful an operator actually keys, which is why Enter stops at
 * those and runs past the read-outs between them. A layout that flags nothing
 * (grid 24) falls back to stopping at every editable cell.
 */
export const GRID_FOCUS_STOP_ATTR = "data-quotation-focus-stop";
/**
 * Marks one panel of the entry screen for the F1 walk — Header, Items, Charges,
 * Terms. Read off the DOM like every other walk here, so a panel Visible
 * Settings hides is simply not in the cycle, and the order is the order the
 * panels are laid out in.
 */
export const SECTION_ATTR = "data-quotation-section";