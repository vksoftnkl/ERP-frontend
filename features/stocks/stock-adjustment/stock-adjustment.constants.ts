/**
 * Stock Adjustment (menu 264) — the constants the Qt screen keeps in
 * `stock_adjustment_entity.h` (`StockAdjustmentCols`), and the routes it calls.
 *
 * ONE screen for six kinds, picked by the Type selector:
 *
 *     Adjustment        both signs on one sheet, each line under its reason
 *     Issue             out — internal use, samples, gifts
 *     Damage            out — written off
 *     Expiry write-off  out — an EXPIRED lot, which must be picked
 *     Re-lot            an OUT of the wrong lot + an IN to the right one,
 *                       balanced per item, no accounts voucher
 *     Move stock        one lot from one bucket to another in this godown,
 *                       no accounts voucher
 *
 * Six kinds on one screen and four stored `svh_voucher_type`s: a re-lot is an
 * ADJUSTMENT carrying RELOT_OUT / RELOT_IN, and a move is an ADJUSTMENT whose
 * lines name a toBucket. The server answers a load with the KIND (the six), so
 * the round trip is exact.
 */
import type { ConfiguredGridKey } from "@/lib/configured-grids";
import type { ConfiguredDropdownKey } from "@/lib/configured-dropdowns";
import type { UiTableKey } from "@/lib/ui-tables";

// ---------------------------------------------------------------------------
// Routes — WITHOUT `/api/v1`, which the base query adds.
// ---------------------------------------------------------------------------

/** POST saves (and, with header.status POSTED, posts), GET loads, DELETE removes a DRAFT. */
export const STOCK_ADJUSTMENT_ENDPOINT = "/stock/adjustment";
export const STOCK_ADJUSTMENT_VALIDATE_ENDPOINT = "/stock/adjustment/validate";
export const STOCK_ADJUSTMENT_POST_ENDPOINT = "/stock/adjustment/post";
export const STOCK_ADJUSTMENT_CANCEL_ENDPOINT = "/stock/adjustment/cancel";
export const STOCK_ADJUSTMENT_PICK_STOCK_ENDPOINT = "/stock/adjustment/pick-stock";
export const STOCK_REASONS_ENDPOINT = "/stock/reasons";
/** The stock module's item lookup — the one route that answers the base unit AND the tracking signature. */
export const STOCK_ITEM_LOOKUP_ENDPOINT = "/stock/opening/item-lookup";
export const ITEM_BY_BARCODE_ENDPOINT = "/master-lookups/item-by-barcode";
/** The ledger names behind the posting roles — the accounts card's labels. */
export const LEDGER_ROLES_ENDPOINT = "/ledger-map/roles";
export const CONFIGURED_GRID_RUN_ENDPOINT = "/configured-grid-sql/run";

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

/** Grid 122 "TXN MAIN LIST - STOCK ADJUSTMENT". */
export const STOCK_ADJUSTMENT_LIST_GRID_KEY: ConfiguredGridKey = "stockAdjustmentList";
/** Grid 71 "POPUP - ITEMS" — the one item search the whole product uses. */
export const ITEM_PICKER_GRID_KEY: ConfiguredGridKey = "itemPickerPopup";
/** ui_table 41 "STOCK ADJUSTMENT - ITEM". */
export const LINE_GRID_UI_TABLE_KEY: UiTableKey = "stockAdjustmentLines";
/** Dropdown 26 "GODOWNS". */
export const GODOWN_DROPDOWN_KEY: ConfiguredDropdownKey = "godown";

/** The DOM name the line grid's cells carry for the shared Enter walk. */
export const LINE_GRID_NAME = "stock-adjustment-lines";

/** The window the list opens on (TxnMainViewConfig.defaultDaysBack). */
export const LIST_DEFAULT_DAYS_BACK = 30;

// ---------------------------------------------------------------------------
// The Type selector
// ---------------------------------------------------------------------------

export type Kind = "Adjustment" | "Issue" | "Damage" | "Expiry" | "Relot" | "Move";

export const KINDS: readonly Kind[] = ["Adjustment", "Issue", "Damage", "Expiry", "Relot", "Move"];

/** What `header.voucherType` carries on a save — the server's STOCK_ADJUSTMENT_SAVE_KINDS. */
export type SaveKind = "ADJUSTMENT" | "ISSUE" | "DAMAGE" | "EXPIRY_WRITEOFF" | "BUCKET_MOVE";

/** The load's `kind` and grid 122's kind_code — STOCK_ADJUSTMENT_DOC_KINDS. */
export type KindCode = SaveKind | "RELOT";

export function saveType(kind: Kind): SaveKind {
  switch (kind) {
    case "Issue":
      return "ISSUE";
    case "Damage":
      return "DAMAGE";
    case "Expiry":
      return "EXPIRY_WRITEOFF";
    case "Move":
      return "BUCKET_MOVE";
    default:
      return "ADJUSTMENT";
  }
}

export function kindCode(kind: Kind): KindCode {
  return kind === "Relot" ? "RELOT" : saveType(kind);
}

export function kindFromCode(code: string | null | undefined): Kind {
  switch ((code ?? "").trim().toUpperCase()) {
    case "ISSUE":
      return "Issue";
    case "DAMAGE":
      return "Damage";
    case "EXPIRY_WRITEOFF":
      return "Expiry";
    case "RELOT":
      return "Relot";
    case "BUCKET_MOVE":
      return "Move";
    default:
      return "Adjustment";
  }
}

export function kindName(kind: Kind): string {
  switch (kind) {
    case "Issue":
      return "Stock issue";
    case "Damage":
      return "Damage write-off";
    case "Expiry":
      return "Expiry write-off";
    case "Relot":
      return "Re-lot";
    case "Move":
      return "Move stock";
    default:
      return "Stock adjustment";
  }
}

/** The six Type buttons, with the .ui's own labels and tooltips. */
export const KIND_BUTTONS: readonly { kind: Kind; label: string; tooltip: string }[] = [
  {
    kind: "Adjustment",
    label: "Adjustment",
    tooltip: "A stock-taking correction: both signs on one sheet, each line under its reason.",
  },
  { kind: "Issue", label: "Issue", tooltip: "Stock going out for internal use, samples or gifts." },
  {
    kind: "Damage",
    label: "Damage",
    tooltip: "Write damaged stock off. To keep it for a supplier return, use Move stock instead.",
  },
  {
    kind: "Expiry",
    label: "Expiry write-off",
    tooltip:
      "Write off an EXPIRED lot. The lot must be picked, and must have expired by the document date.",
  },
  {
    kind: "Relot",
    label: "Re-lot",
    tooltip:
      "Fix stock received under the wrong batch / expiry / MRP: out of the wrong lot, into the right one. No accounts entry.",
  },
  {
    kind: "Move",
    label: "Move stock",
    tooltip:
      "Move a lot between buckets in this godown — Saleable to Damaged to hold it for a supplier return, or back. Still our stock: no accounts entry.",
  },
];

/** The line under the title — what this type is (applyKind's m_kindHint). */
export function kindHint(kind: Kind): string {
  switch (kind) {
    case "Issue":
      return "Stock going out — internal use, samples, gifts.";
    case "Damage":
      return "Damaged stock written off. To hold it for a supplier return, use Move stock.";
    case "Expiry":
      return "An EXPIRED lot written off — pick the lot (F2).";
    case "Relot":
      return "Out of the wrong lot, into the right one — balanced per item, no accounts voucher.";
    case "Move":
      return "A lot from one bucket to another in this godown — still our stock, no accounts voucher.";
    default:
      return "A stock-taking correction: both signs on one sheet, each line under its reason.";
  }
}

/** The per-type note under the grid (Move stock, Re-lot); empty for the rest. */
export function kindNote(kind: Kind): string {
  if (kind === "Move") {
    return (
      "One line per lot: the server takes it out of the From bucket and into the To bucket — " +
      "same lot, same cost, so the average does not move. The lot is required: it names the supplier."
    );
  }
  if (kind === "Relot") {
    return (
      "The IN line is a different lot (its own batch / expiry / MRP) and takes the OUT's cost. " +
      "Typing the OUT line fills the IN line's item and quantity; only the new identity is keyed."
    );
  }
  return "";
}

/**
 * The two reason codes that make an ADJUSTMENT a re-lot. The Adjustment kind
 * leaves them out of its reason list and the Re-lot kind offers nothing else,
 * so an operator cannot key half a re-lot into a plain adjustment.
 */
export const RELOT_OUT_CODE = "RELOT_OUT";
export const RELOT_IN_CODE = "RELOT_IN";

/**
 * MOVE_REASON_DEFAULT_BUCKET on the server: the to-bucket a move reason
 * suggests. The operator may change it on the line.
 */
export function defaultToBucket(reasonCode: string): string {
  if (reasonCode === "MOVE_DAMAGED") {
    return "DAMAGED";
  }
  if (reasonCode === "MOVE_SALEABLE") {
    return "SALEABLE";
  }
  return "";
}

/** ck_svi_bucket's five. */
export const BUCKETS = ["SALEABLE", "DAMAGED", "QUARANTINE", "EXPIRED", "SAMPLE"] as const;

/** SALEABLE -> Saleable. The wire keeps the codes; this is what a cell SHOWS. */
export function bucketLabel(code: string | null | undefined): string {
  const text = (code ?? "").trim();
  if (!text) {
    return "";
  }
  return text.charAt(0) + text.slice(1).toLowerCase();
}

/**
 * svh_rate_source. It values INWARD lines only — an outward line is always
 * stamped at the branch average — so AVG_COST is the default: stock found on a
 * shelf is worth what the rest of that item is worth.
 */
export const RATE_SOURCES = ["AVG_COST", "LAST_PURCHASE", "LOT_COST", "MRP", "MANUAL"] as const;

export function rateSourceLabel(code: string): string {
  switch (code) {
    case "AVG_COST":
      return "Average cost";
    case "LAST_PURCHASE":
      return "Last purchase";
    case "LOT_COST":
      return "Lot cost";
    case "MRP":
      return "MRP";
    case "MANUAL":
      return "Manual";
    default:
      return code;
  }
}

/** The cancel prompt's presets (askText's list). */
export const CANCEL_REASONS: readonly string[] = [
  "Keyed against the wrong godown",
  "Quantities were wrong",
  "Wrong reason cited",
  "Wrong batch picked",
  "Entered twice — duplicate of another adjustment",
  "The stock turned up after all",
];

/** The server's CancelStockAdjustmentDto: `@MinLength(3)`. */
export const CANCEL_REASON_MIN_LENGTH = 3;

// ---------------------------------------------------------------------------
// The line grid — ui_table 41
// ---------------------------------------------------------------------------

/**
 * Column numbers of ui_table 41. A column number is the key
 * `ui_tbl_clm_no` joins on, so the layout's titles, widths and order land on
 * the right meaning whatever the column is called. 21–30 are hidden ids the Qt
 * screen reads its line back from — the draft line carries them as fields here
 * — and 31 / 32 are screen-made (the row note and Move stock's arrow).
 */
export const COL = {
  LineNo: 0,
  Barcode: 1,
  ItemCode: 2,
  Description: 3,
  BatchNo: 4,
  MfgDate: 5,
  ExpiryDate: 6,
  Mrp: 7,
  SupplierName: 8,
  Bucket: 9,
  ToBucket: 10,
  Available: 11,
  Qty: 12,
  UomName: 13,
  BaseQty: 14,
  CostRate: 15,
  Value: 16,
  ReasonName: 17,
  Remarks: 18,
  LotId: 19,
  Direction: 20,
  Hint: 31,
  Arrow: 32,
} as const;

export type ColumnNo = (typeof COL)[keyof typeof COL];

/** The .ui's own titles — what a column shows when the layout cannot be read. */
export const FALLBACK_COLUMN_TITLES: Record<number, string> = {
  [COL.LineNo]: "#",
  [COL.Barcode]: "Barcode",
  [COL.ItemCode]: "Code",
  [COL.Description]: "Item",
  [COL.BatchNo]: "Batch / lot",
  [COL.MfgDate]: "Mfg",
  [COL.ExpiryDate]: "Expiry",
  [COL.Mrp]: "MRP",
  [COL.SupplierName]: "Supplier (of the lot)",
  [COL.Bucket]: "Bucket",
  [COL.ToBucket]: "To",
  [COL.Available]: "Available",
  [COL.Qty]: "Qty",
  [COL.UomName]: "Unit",
  [COL.BaseQty]: "Base qty",
  [COL.CostRate]: "Cost",
  [COL.Value]: "Value",
  [COL.ReasonName]: "Reason",
  [COL.Remarks]: "Remarks",
  [COL.LotId]: "LotId",
  [COL.Direction]: "Dir",
  [COL.Hint]: "",
  [COL.Arrow]: "",
};

/**
 * The layout as the Qt screen registered it (20260930110000): width (a share
 * of the grid), position, and whether Enter stops there. Used when ui_table 41
 * cannot be read, and for the two screen-made columns it never carries.
 */
export const FALLBACK_COLUMN_LAYOUT: Record<number, { width: number; position: number; focus: boolean }> = {
  [COL.LineNo]: { width: 3.8, position: 0, focus: false },
  [COL.Barcode]: { width: 5.5, position: 1, focus: false },
  [COL.ItemCode]: { width: 7, position: 2, focus: false },
  [COL.Description]: { width: 15, position: 3, focus: true },
  [COL.BatchNo]: { width: 7, position: 4, focus: false },
  [COL.MfgDate]: { width: 6, position: 5, focus: false },
  [COL.ExpiryDate]: { width: 6, position: 6, focus: false },
  [COL.Mrp]: { width: 5, position: 7, focus: false },
  [COL.SupplierName]: { width: 7, position: 8, focus: false },
  [COL.Bucket]: { width: 6.5, position: 9, focus: false },
  [COL.ToBucket]: { width: 6, position: 10, focus: true },
  [COL.Available]: { width: 5.5, position: 11, focus: false },
  [COL.Qty]: { width: 5.5, position: 13, focus: true },
  [COL.UomName]: { width: 4, position: 14, focus: false },
  [COL.BaseQty]: { width: 6, position: 15, focus: false },
  [COL.CostRate]: { width: 6.5, position: 16, focus: false },
  [COL.Value]: { width: 7, position: 17, focus: false },
  [COL.ReasonName]: { width: 10, position: 18, focus: true },
  [COL.Remarks]: { width: 8, position: 19, focus: true },
  [COL.LotId]: { width: 0, position: 20, focus: false },
  [COL.Direction]: { width: 4.5, position: 12, focus: false },
  [COL.Hint]: { width: 9, position: 99, focus: false },
  [COL.Arrow]: { width: 2.2, position: 9.5, focus: false },
};

/**
 * Which columns each kind shows — applyKindColumns. The Type selector does not
 * change the columns, only which of them open; the layout supplies titles,
 * widths and order. Barcode is never on the mockup: a scan is typed into the
 * Item cell's search like any other code.
 */
export function kindColumns(kind: Kind): ReadonlySet<number> {
  switch (kind) {
    case "Move":
      return new Set([
        COL.LineNo,
        COL.Description,
        COL.BatchNo,
        COL.SupplierName,
        COL.Bucket,
        COL.Arrow,
        COL.ToBucket,
        COL.Available,
        COL.Qty,
        COL.CostRate,
        COL.ReasonName,
        COL.Remarks,
      ]);
    case "Relot":
      return new Set([
        COL.LineNo,
        COL.Description,
        COL.BatchNo,
        COL.ExpiryDate,
        COL.Mrp,
        COL.Direction,
        COL.Qty,
        COL.CostRate,
        COL.ReasonName,
        COL.Remarks,
      ]);
    default:
      return new Set([
        COL.LineNo,
        COL.Description,
        COL.BatchNo,
        COL.ExpiryDate,
        COL.Mrp,
        COL.Bucket,
        COL.Available,
        COL.Direction,
        COL.Qty,
        COL.UomName,
        COL.CostRate,
        COL.Value,
        COL.ReasonName,
        COL.Remarks,
        COL.Hint,
      ]);
  }
}

/** The list's Type filter, as grid 122's kind_code — the same six as the selector. */
export const LIST_KIND_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "ADJUSTMENT", label: "ADJUSTMENT" },
  { value: "ISSUE", label: "ISSUE" },
  { value: "DAMAGE", label: "DAMAGE" },
  { value: "EXPIRY_WRITEOFF", label: "EXPIRY_WRITEOFF" },
  { value: "RELOT", label: "RELOT" },
  { value: "BUCKET_MOVE", label: "BUCKET_MOVE" },
];

export const LIST_STATUS_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "DRAFT", label: "DRAFT" },
  { value: "POSTED", label: "POSTED" },
  { value: "CANCELLED", label: "CANCELLED" },
];
