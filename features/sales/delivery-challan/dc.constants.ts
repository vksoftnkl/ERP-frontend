/**
 * Delivery Challan (menu 182) — the Qt `DeliveryChallanEntry` +
 * `TxnDocTypes::deliveryChallan()` constants, verbatim where Qt states them.
 *
 * The goods leave on a challan: posting is a stock OUT (DC_ISSUE) and, under
 * PERPETUAL, a COGS pair. No party leg, no tender, no IRN, no tax liability.
 * The routes are `/delivery-challans/*`, header prefix `sdc`, lines `sdi`.
 */
import type { ConfiguredGridKey } from "@/lib/configured-grids";
import type { ConfiguredDropdownKey } from "@/lib/configured-dropdowns";
import type { UiTableKey } from "@/lib/ui-tables";

// ── Routes (Qt `ApiEndpoints::DeliveryChallans`) ───────────────────────────
export const DC_CREATE_ENDPOINT = "/delivery-challans/create";
export const DC_VALIDATE_ENDPOINT = "/delivery-challans/validate";
export const DC_CANCEL_ENDPOINT = "/delivery-challans/cancel";
export const DC_AMEND_ENDPOINT = "/delivery-challans/amend";
export const DC_DELETE_ENDPOINT = "/delivery-challans/delete";
export const DC_GET_ENDPOINT = "/delivery-challans/get";
export const DC_CONVERT_PURPOSE_ENDPOINT = "/delivery-challans/convert-purpose";
export const DC_TRANSPORT_ENDPOINT = "/delivery-challans/transport";

// ── Config rows, by NAME (ids are per deployment) ──────────────────────────
/** ui_table 38 "DELIVERY CHALLAN - LINES" — 101 columns, Qt `SalesItemCols`. */
export const DC_ITEM_GRID_UI_TABLE_KEY: UiTableKey = "deliveryChallanLines";
/** grid 116 "MAIN LIST - DELIVERY CHALLANS". */
export const DC_LIST_GRID_KEY: ConfiguredGridKey = "deliveryChallanList";
/** dropdown 57 "DC PURPOSES" — `unnest(comp_dc_purposes)`, bare `icomp_id`. */
export const DC_PURPOSE_DROPDOWN_KEY: ConfiguredDropdownKey = "dcPurposes";

// ── Document ───────────────────────────────────────────────────────────────
export const DC_DOC_TYPE = "DELIVERY_CHALLAN";
export const DC_MENU_ID = 182;
export const DC_ROUTE = "/sales/delivery-challan";
export const DC_PRINT_PURPOSE = "DELIVERY_CHALLAN";
/** The order a line is drawn from, when the source names none. */
export const DC_DEFAULT_SRC_DOC_TYPE = "SALES_ORDER";

export const DC_STATUSES = ["DRAFT", "POSTED", "CANCELLED"] as const;
export type DcStatus = (typeof DC_STATUSES)[number];

/** `DC_PURPOSES` in the server's lifecycle DTO — Convert offers exactly these. */
export const DC_PURPOSES = [
  "SUPPLY",
  "JOB_WORK",
  "APPROVAL",
  "EXHIBITION",
  "OWN_USE",
  "LINE_SALES",
  "OTHER",
] as const;
export const DC_DEFAULT_PURPOSE = "SUPPLY";

/** "JOB_WORK" → "Job work" — Qt `applyLoadedHeader`'s label for a stored purpose. */
export function purposeLabel(code: string): string {
  const lower = code.trim().toLowerCase().replace(/_/g, " ");
  return lower ? lower[0].toUpperCase() + lower.slice(1) : "";
}

export const DC_DEFAULT_BUCKET = "SALEABLE";

// ── The list (Qt `TxnMainViewConfig`) ──────────────────────────────────────
export const DC_TITLE = "Delivery Challan";
export const DC_LIST_TITLE = "Delivery Challans";
export const DC_LIST_SUBTITLE =
  "Goods sent out on a challan — what is open, billed, returned or closed.";
export const DC_SEARCH_HINT = "customer, DC no or phone";
/** A challan stays open until billed or returned, which can take weeks. */
export const DC_LIST_WINDOW_DAYS = 90;
/** `ifulfil` — ALWAYS sent: '' = every status, OPEN = OPEN + PARTIAL. */
export const DC_FULFIL_FILTER_OPTIONS = [
  { value: "", label: "All" },
  { value: "OPEN", label: "OPEN" },
  { value: "BILLED", label: "BILLED" },
  { value: "RETURNED", label: "RETURNED" },
  { value: "CLOSED", label: "CLOSED" },
] as const;

// ── Settings the Qt screen reads beyond the sale order's ───────────────────
export const DC_SETTING_KEYS = {
  dcRequiresOrder: "sales.dc_requires_order",
  quickAddCustomer: "sales.quick_add_customer",
} as const;

/** Qt's own tolerance on the order-cap comparison (`cap + 0.0005`). */
export const DC_ORDER_CAP_TOLERANCE = 0.0005;
