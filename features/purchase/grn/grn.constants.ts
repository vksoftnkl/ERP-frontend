/**
 * GRN (menu 196) — the routes and the line grid's columns: the Qt `GrnEntry`
 * (src/modules/purchase/grn/, NexERP fc46bde) and its `GrnCols`.
 */
import type { ConfiguredDropdownKey } from "@/lib/configured-dropdowns";
import type { UiTableKey } from "@/lib/ui-tables";

// ---------------------------------------------------------------------------
// Routes — WITHOUT `/api/v1`, which the base query adds.
// ---------------------------------------------------------------------------

/** POST — save a draft; `header.post = true` saves and posts in one go. */
export const GRN_SAVE_ENDPOINT = "/purchase/grns/save";
/** POST `{ grnId, accYear }` — post a saved draft as it stands. */
export const GRN_POST_ENDPOINT = "/purchase/grns/post";
/** GET `?grnId&accYear` — header, lines with their allocation rows, bill status. */
export const GRN_GET_ENDPOINT = "/purchase/grns/get";
/** POST `{ grnId, accYear, reason }` — a posted, un-billed GRN. */
export const GRN_CANCEL_ENDPOINT = "/purchase/grns/cancel";
/** GET `?companyId&branchId&supplierId` — the supplier's confirmed PO lines with qty still pending (menu 23 view). */
export const GRN_PENDING_PO_LINES_ENDPOINT = "/purchase/orders/pending-lines";
/** GET `?barcode&company_id` — `unitId` is an iuc_id. */
export const GRN_ITEM_BY_BARCODE_ENDPOINT = "/master-lookups/item-by-barcode";
/** GET — the item's unit (default, or the one asked for) and MRP; returns no cost. */
export const GRN_ITEM_LOOKUP_ENDPOINT = "/stock/opening/item-lookup";

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

/** ui_table 58 "GRN - LINES". */
export const GRN_LINES_UI_TABLE_KEY: UiTableKey = "grnLines";
export const SUPPLIER_DROPDOWN_KEY: ConfiguredDropdownKey = "supplier";
export const GODOWN_DROPDOWN_KEY: ConfiguredDropdownKey = "godown";
/** Dropdown 72 EMPLOYEES BY DESIGNATION — the loadmen (Qt kCrewDropdown). */
export const CREW_DROPDOWN_KEY: ConfiguredDropdownKey = "employeeByDesignation";
/** Both tokens are NULLIF-guarded: sent even when blank. */
export const CREW_EMPTY_PARAMS = ["iemp_branch_id", "iemp_role"] as const;
export const LOADMAN_ROLE = "LOADMAN";

/** The DOM name the line grid's cells carry for the shared Enter walk. */
export const GRN_GRID_NAME = "grn-lines";

// ---------------------------------------------------------------------------
// The line grid — ui_table 58, by column number (Qt `GrnCols`)
// ---------------------------------------------------------------------------

export const COL = {
  Barcode: 0,
  Item: 1,
  Unit: 2,
  PoRef: 3,
  Pending: 4,
  Challan: 5,
  Recd: 6,
  Dmg: 7,
  Free: 8,
  Short: 9,
  Rate: 10,
  Value: 11,
  Batch: 12,
  Expiry: 13,
  Mrp: 14,
  // 15–18 are the hidden ids (ItemId, UomId, PoItemId, LineId) — held on the line, never drawn.
} as const;
export type ColumnNo = (typeof COL)[keyof typeof COL];

/**
 * The columns this screen draws. ui_table 58 has grown more since (Size,
 * Colour, Model, Sell A, Excess …) for later server features; those are not
 * this port's and are never drawn.
 */
export const DRAWN_COLUMNS: readonly ColumnNo[] = Object.values(COL);

/** Qt `setFocusStops`: where Enter stops — Barcode and Item on a blank line, then the four a receipt keys. */
export const ENTER_STOPS: ReadonlySet<number> = new Set([
  COL.Barcode,
  COL.Item,
  COL.Challan,
  COL.Recd,
  COL.Dmg,
  COL.Rate,
]);

export const FALLBACK_COLUMNS: Readonly<Record<ColumnNo, { title: string; width: number }>> = {
  [COL.Barcode]: { title: "Barcode", width: 9 },
  [COL.Item]: { title: "Item", width: 20 },
  [COL.Unit]: { title: "Unit", width: 6 },
  [COL.PoRef]: { title: "PO", width: 6 },
  [COL.Pending]: { title: "Pending", width: 6 },
  [COL.Challan]: { title: "Challan", width: 6 },
  [COL.Recd]: { title: "Recd", width: 6 },
  [COL.Dmg]: { title: "Dmg", width: 5 },
  [COL.Free]: { title: "Free", width: 5 },
  [COL.Short]: { title: "Short", width: 5 },
  [COL.Rate]: { title: "Rate", width: 7 },
  [COL.Value]: { title: "Value", width: 8 },
  [COL.Batch]: { title: "Batch / Serial", width: 8 },
  [COL.Expiry]: { title: "Expiry", width: 7 },
  [COL.Mrp]: { title: "MRP", width: 6 },
};

/** Titles by column number, for the grid-settings dialog (it lists every layout row). */
export const FALLBACK_COLUMN_TITLES: Readonly<Record<number, string>> = Object.fromEntries(
  Object.entries(FALLBACK_COLUMNS).map(([no, column]) => [Number(no), column.title]),
);

export const GRID_NOTE =
  "Scan or pick an item, or choose a PO above. Received follows the Challan until typed; Short = Challan − Received − Damaged.";

export const CANCEL_REASONS: readonly string[] = [
  "Keyed in error",
  "Wrong supplier",
  "Goods sent back",
  "Duplicate entry",
];

export const DISCARD_MESSAGE = "This GRN has changes that are not saved. Discard them?";
