/**
 * GRN (menu 196) — the routes and the line grid's columns: the Qt `GrnEntry`
 * (src/modules/purchase/grn/, NexERP fc46bde..40c8b2c) and its `GrnCols`.
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
/** POST (the save body) — the server's figures, Check chips, charges, totals, warnings / refusals. Writes nothing. */
export const GRN_VALIDATE_ENDPOINT = "/purchase/grns/validate";
/** GET `?voucherType=DAMAGE&companyId` — the reasons a damaged line names (Stock Reasons, menu 293). */
export const GRN_REASONS_ENDPOINT = "/stock/reasons";
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
/** The supervisor who checked the goods in = the GRN's "Received by" (dropdown 72, role SUPERVISOR). */
export const SUPERVISOR_ROLE = "SUPERVISOR";
/** Debounce of /grns/validate (Qt m_recalc 350 ms). */
export const VALIDATE_DELAY_MS = 350;
/** Dropdowns 70 / 71 — the textile Size and Colour pick-lists (Qt kSizeDropdownId / kColourDropdownId). */
export const SIZE_DROPDOWN_KEY: ConfiguredDropdownKey = "itemSize";
export const COLOUR_DROPDOWN_KEY: ConfiguredDropdownKey = "itemColour";
/** The print purpose (Qt `PurchaseDocNav`, seeded by server migration 20261028160000). */
export const GRN_PRINT_PURPOSE = "GRN";

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
  // 15–20 are hidden (ItemId, UomId, PoItemId, LineId, Signature, Allocs) — held on the line, never drawn.
  /** Textile (stock.auto_batch_no): shown after Batch. 22 / 24 are their hidden ids. */
  Size: 21,
  Colour: 23,
  Model: 25,
  /** purchase.price_set_at = GRN: written on Post (shown after MRP). */
  SellA: 26,
  /** Over the PO's pending — HOLD_FOR_BILL / KEEP_FREE / RETURN (shown after Short). */
  Excess: 27,
  ExcessAct: 28,
  /** As Sell A: price levels B–D (Qt 40c8b2c). */
  SellB: 29,
  SellC: 30,
  SellD: 31,
  // ── not in ui_table 58 yet: the screen titles and shows them itself (Qt grn_cols.h 32..) ──
  /** Callout 3: why it is damaged (Stock Reasons, DAMAGE) — a pick-list. */
  DmgReason: 32,
  /** Callout 4: % of the shelf life left at receipt (the server's check.shelfLifePct). */
  ShelfLife: 34,
  /** Callout 4: labels to print = saleable pieces (check.labels). */
  Labels: 35,
  /** The chips OK / SHORT 2 / 2 DAMAGED / SHELF LIFE / 5/5 SN / EXCESS (check.chips). */
  Check: 36,
} as const;
export type ColumnNo = (typeof COL)[keyof typeof COL];

/**
 * The columns this screen draws, in the mockup's order (Qt `applyColumns` moves
 * every section into it): # Barcode Item Unit PO pend. Challan Received Dmg Dmg
 * reason Free Short [Excess Action] Prov. rate [Model Size Colour] Batch / Serial
 * Expiry MRP Shelf life Sell A [B C D] Labels Check. PO and Value are kept
 * hidden (Qt). Which of the optional ones show is the screen's rule (`hiddenColumns`).
 */
export const DRAWN_COLUMNS: readonly ColumnNo[] = [
  COL.Barcode,
  COL.Item,
  COL.Unit,
  COL.Pending,
  COL.Challan,
  COL.Recd,
  COL.Dmg,
  COL.DmgReason,
  COL.Free,
  COL.Short,
  COL.Excess,
  COL.ExcessAct,
  COL.Rate,
  COL.Model,
  COL.Size,
  COL.Colour,
  COL.Batch,
  COL.Expiry,
  COL.Mrp,
  COL.ShelfLife,
  COL.SellA,
  COL.SellB,
  COL.SellC,
  COL.SellD,
  COL.Labels,
  COL.Check,
];

export const TEXTILE_COLUMNS: readonly ColumnNo[] = [COL.Size, COL.Colour, COL.Model];
export const SELL_COLUMNS: readonly ColumnNo[] = [COL.SellA, COL.SellB, COL.SellC, COL.SellD];
export const EXCESS_COLUMNS: readonly ColumnNo[] = [COL.Excess, COL.ExcessAct];

/** The Excess action pick-list (Qt `cols.choices`), blank first = the server's default. */
export const EXCESS_ACTIONS: readonly { value: "" | "HOLD_FOR_BILL" | "KEEP_FREE" | "RETURN"; label: string; title: string }[] = [
  { value: "", label: "", title: "Over the PO is held for the bill (the server's default)." },
  { value: "HOLD_FOR_BILL", label: "Hold for bill", title: "Received at the provisional rate; the bill must cover it." },
  { value: "KEEP_FREE", label: "Keep free", title: "Taken as free goods — out of Received, into Free, no value." },
  { value: "RETURN", label: "Return", title: "Sent back at the gate — key it in Excess, not in Received." },
];

/** Qt `setFocusStops`: where Enter stops — Barcode and Item on a blank line, then the four a receipt keys. */
export const ENTER_STOPS: ReadonlySet<number> = new Set([
  COL.Barcode,
  COL.Item,
  COL.Challan,
  COL.Recd,
  COL.Dmg,
  COL.Rate,
]);

/** Qt `applyColumns` titles and `ColumnWeights` (a share of the width; textile re-weights a few). */
export const FALLBACK_COLUMNS: Readonly<Record<ColumnNo, { title: string; width: number }>> = {
  [COL.Barcode]: { title: "Barcode", width: 7 },
  [COL.Item]: { title: "Item", width: 13 },
  [COL.Unit]: { title: "Unit", width: 5 },
  [COL.PoRef]: { title: "PO", width: 6 },
  [COL.Pending]: { title: "PO pend.", width: 6 },
  [COL.Challan]: { title: "Challan", width: 5 },
  [COL.Recd]: { title: "Received", width: 6 },
  [COL.Dmg]: { title: "Dmg", width: 4 },
  [COL.DmgReason]: { title: "Dmg reason", width: 7 },
  [COL.Free]: { title: "Free", width: 4 },
  [COL.Short]: { title: "Short", width: 4 },
  [COL.Excess]: { title: "Excess", width: 5 },
  [COL.ExcessAct]: { title: "Excess action", width: 7 },
  [COL.Rate]: { title: "Prov. rate", width: 6 },
  [COL.Value]: { title: "Value", width: 8 },
  [COL.Model]: { title: "Model / design", width: 8 },
  [COL.Size]: { title: "Size", width: 4 },
  [COL.Colour]: { title: "Colour", width: 5 },
  [COL.Batch]: { title: "Batch / Serial", width: 8 },
  [COL.Expiry]: { title: "Expiry", width: 8 },
  [COL.Mrp]: { title: "MRP", width: 5 },
  [COL.ShelfLife]: { title: "Shelf life", width: 6 },
  [COL.SellA]: { title: "Sell A", width: 5 },
  [COL.SellB]: { title: "Sell B", width: 5 },
  [COL.SellC]: { title: "Sell C", width: 5 },
  [COL.SellD]: { title: "Sell D", width: 5 },
  [COL.Labels]: { title: "Labels", width: 5 },
  [COL.Check]: { title: "Check", width: 9 },
};

/** Qt: with textile on, Barcode / Expiry give way to Model / Batch. */
export const TEXTILE_WEIGHTS: Readonly<Partial<Record<ColumnNo, number>>> = {
  [COL.Barcode]: 5,
  [COL.Item]: 12,
  [COL.Expiry]: 6,
  [COL.Model]: 10,
  [COL.Batch]: 10,
};

/** Titles by column number, for the grid-settings dialog (it lists every layout row). */
export const FALLBACK_COLUMN_TITLES: Readonly<Record<number, string>> = Object.fromEntries(
  Object.entries(FALLBACK_COLUMNS).map(([no, column]) => [Number(no), column.title]),
);

/** The section heading's grey hint (Qt `sectionHeading`). */
export const LINES_HINT = "rate is PROVISIONAL here — the bill sets the real cost (rate difference → revaluation)";
/** The blank row's prompt (Qt `cols.prompt`). */
/**
 * The blank row's prompt (Qt `cols.prompt`: one muted sentence across the row). The
 * Barcode cell says "scan barcode"; the Item cell — spanning the rest of the blank
 * row, as Qt paints the sentence over it — says the rest, whole.
 */
export const BLANK_ROW_PROMPT = "or pick PO lines (Ctrl+L)  ·  F12 batch / godown / MRP / expiry split  ·  + / − lines";

export const CANCEL_REASONS: readonly string[] = [
  "Keyed in error",
  "Wrong supplier",
  "Goods sent back",
  "Duplicate entry",
];

export const DISCARD_MESSAGE = "This GRN has changes that are not saved. Discard them?";
