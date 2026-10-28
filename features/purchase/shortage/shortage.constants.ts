/**
 * Shortage Receipt (menu 195) — the constants of the Qt `ShortageReceiptEntry`
 * (src/modules/purchase/shortage/, NexERP b8f615e) and the routes of
 * `PurchaseShortageController` (server src/modules/purchase/shortage).
 */
import type { ConfiguredDropdownKey } from "@/lib/configured-dropdowns";
import type { UiTableKey } from "@/lib/ui-tables";

// ---------------------------------------------------------------------------
// Routes — WITHOUT `/api/v1`, which the base query adds.
// ---------------------------------------------------------------------------

/** GET `companyId`, `branchId`, `supplierId` — every shortage with qty still open. */
export const SHORTAGE_OPEN_ENDPOINT = "/purchase/shortages/open";
/** POST `{ header, lines }`; `header.post = true` saves and posts in one transaction. */
export const SHORTAGE_RECEIPT_SAVE_ENDPOINT = "/purchase/shortages/receipt/save";
/** GET `psrId`, `accYear`. */
export const SHORTAGE_RECEIPT_GET_ENDPOINT = "/purchase/shortages/receipt/get";
/** POST `{ psrId, accYear, reason }` — a draft or a posted receipt. */
export const SHORTAGE_RECEIPT_CANCEL_ENDPOINT = "/purchase/shortages/receipt/cancel";
/** POST — close a shortage without goods: SUPPLIER_CN or WRITE_OFF. */
export const SHORTAGE_CLOSE_ENDPOINT = "/purchase/shortages/close";
/** POST `{ closeId, accYear, reason }`. */
export const SHORTAGE_CLOSE_UNDO_ENDPOINT = "/purchase/shortages/close-undo";
/** GET `shortageId` — the shortage's standing closes, newest first. */
export const SHORTAGE_CLOSES_ENDPOINT = "/purchase/shortages/closes";
/** The configured dropdown runner — names for a loaded receipt's godown and loadmen. */
export const DROPDOWN_RUN_ENDPOINT = "/dropdown-details/run";

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

/** ui_table 61 "SHORTAGE RECEIPT - LINES". */
export const LINES_UI_TABLE_KEY: UiTableKey = "shortageReceiptLines";
export const SUPPLIER_DROPDOWN_KEY: ConfiguredDropdownKey = "supplier";
export const GODOWN_DROPDOWN_KEY: ConfiguredDropdownKey = "godown";
/** Dropdown 72 — Unloaded by lists the branch's LOADMEN. */
export const CREW_DROPDOWN_KEY: ConfiguredDropdownKey = "employeeByDesignation";
export const CREW_ROLE = "LOADMAN";
/** Dropdown 72's SQL guards both tokens; a blank one must still travel. */
export const CREW_EMPTY_PARAMS = ["iemp_branch_id", "iemp_role"] as const;

/** The DOM name the line cells carry for the shared Enter walk (grid-focus). */
export const LINE_GRID_NAME = "shortage-receipt-lines";

// ---------------------------------------------------------------------------
// The line grid — `ShortageReceiptCols`, in ui_table 61's column numbers.
// ---------------------------------------------------------------------------

export const COL = {
  Source: 0,
  Reason: 1,
  Item: 2,
  Unit: 3,
  Short: 4,
  Received: 5,
  Batch: 6,
  Expiry: 7,
  Mrp: 8,
  Cost: 9,
  Value: 10,
} as const;
export type ColumnNo = (typeof COL)[keyof typeof COL];

/** The cells keyed on a row (`ShortageReceiptCols::isEditable`). */
export const EDITABLE_COLUMNS: ReadonlySet<number> = new Set([COL.Received, COL.Batch, COL.Expiry, COL.Mrp]);
/** Right-aligned (`isNumber`). */
export const NUMBER_COLUMNS: ReadonlySet<number> = new Set([COL.Short, COL.Received, COL.Mrp, COL.Cost, COL.Value]);
/** Where Enter stops when the layout flags none (Qt `setFocusStops`). */
export const DEFAULT_FOCUS_STOPS: ReadonlySet<number> = new Set([COL.Received, COL.Batch]);

/** What the grid shows until ui_table 61 arrives (its own titles and width shares). */
export const FALLBACK_COLUMNS: Readonly<Record<ColumnNo, { title: string; width: number }>> = {
  [COL.Source]: { title: "Short From", width: 15 },
  [COL.Reason]: { title: "Why", width: 8 },
  [COL.Item]: { title: "Item", width: 20 },
  [COL.Unit]: { title: "Unit", width: 5 },
  [COL.Short]: { title: "Short", width: 6 },
  [COL.Received]: { title: "Received", width: 7 },
  [COL.Batch]: { title: "Batch", width: 8 },
  [COL.Expiry]: { title: "Expiry", width: 7 },
  [COL.Mrp]: { title: "MRP", width: 6 },
  [COL.Cost]: { title: "Cost", width: 7 },
  [COL.Value]: { title: "Value", width: 8 },
};

export const FALLBACK_COLUMN_TITLES: Readonly<Record<number, string>> = Object.fromEntries(
  Object.entries(FALLBACK_COLUMNS).map(([no, column]) => [Number(no), column.title]),
);

/** `pur_shortage.psh_reason` in words (Qt `reasonText`). */
export const REASON_TEXT: Readonly<Record<string, string>> = {
  SHORT_BILL: "Billed, not came",
  SHORT_CHALLAN: "Short on challan",
  REPLACE: "Replacement due",
};

export const BATCH_MAX_LENGTH = 40;
export const CHALLAN_MAX_LENGTH = 60;
export const REMARKS_MAX_LENGTH = 500;
export const CN_NO_MAX_LENGTH = 60;
export const REASON_MAX_LENGTH = 250;

export const HINT_PICK_SUPPLIER = "Pick the supplier — every open shortage of theirs comes in as a row.";
export const HINT_TYPE_RECEIVED = "Type what came on its row. A row that will never come: Supplier CN… or Write off…";
export const HINT_NOTHING_SHORT = "Nothing of this supplier's is short.";

export const DISCARD_MESSAGE = "What was keyed on this receipt is not saved and will be lost.";
