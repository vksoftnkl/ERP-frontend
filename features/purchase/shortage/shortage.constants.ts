/**
 * Shortage Receipt (menu 195) — the constants of the Qt `ShortageReceiptEntry`
 * (NexERP src/modules/purchase/shortage/, rebuilt 2026-10-29 to the approved mockup
 * share/purchase/purchase_claims_shortage_ui_mockup.png) and the routes of
 * `PurchaseShortageController` (server src/modules/purchase/shortage).
 */
import type { ConfiguredDropdownKey } from "@/lib/configured-dropdowns";

// ---------------------------------------------------------------------------
// Routes — WITHOUT `/api/v1`, which the base query adds.
// ---------------------------------------------------------------------------

/** GET `companyId`, `branchId`, `supplierId`[, `all=true`] — the supplier's shortages. */
export const SHORTAGE_OPEN_ENDPOINT = "/purchase/shortages/open";
/** POST `{ header, lines }`; `header.post = true` saves and posts in one transaction. */
export const SHORTAGE_RECEIPT_SAVE_ENDPOINT = "/purchase/shortages/receipt/save";
/** GET `psrId`, `accYear`. */
export const SHORTAGE_RECEIPT_GET_ENDPOINT = "/purchase/shortages/receipt/get";
/** POST `{ psrId, accYear, reason }` — a draft or a posted receipt. */
export const SHORTAGE_RECEIPT_CANCEL_ENDPOINT = "/purchase/shortages/receipt/cancel";
/** POST — close a shortage without goods: SUPPLIER_CN, CLAIM (+ partyId, claimAgainst) or WRITE_OFF. */
export const SHORTAGE_CLOSE_ENDPOINT = "/purchase/shortages/close";
/** GET — the item's tracking signature (R = serials: F12 in serial mode). */
export const SHORTAGE_ITEM_LOOKUP_ENDPOINT = "/stock/opening/item-lookup";

/** Supplier Dues (menu 297): the claims a close raised are settled there. */
export const SUPPLIER_DUES_MENU_ID = 297;

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

export const SUPPLIER_DROPDOWN_KEY: ConfiguredDropdownKey = "supplier";
export const GODOWN_DROPDOWN_KEY: ConfiguredDropdownKey = "godown";
/** Dropdown 72 — EMPLOYEES BY DESIGNATION: Loadmen (LOADMAN) and Received by (SUPERVISOR). */
export const CREW_DROPDOWN_KEY: ConfiguredDropdownKey = "employeeByDesignation";
export const LOADMAN_ROLE = "LOADMAN";
export const SUPERVISOR_ROLE = "SUPERVISOR";
/** Dropdown 72's SQL guards both tokens; a blank one must still travel. */
export const CREW_EMPTY_PARAMS = ["iemp_branch_id", "iemp_role"] as const;

/**
 * The document keys every purchase screen shares (Qt `PurchaseDocNav`):
 * the `/txn/adjacent` docType and the print purpose (print_purpose.ppo_code).
 */
export const ADJACENT_DOC_TYPE = "SHORTAGE_RECEIPT" as const;
export const PRINT_PURPOSE_CODE = "SHORTAGE_RECEIPT";

/** The DOM name the line cells carry for the shared Enter walk (grid-focus). */
export const LINE_GRID_NAME = "shortage-receipt-lines";

// ---------------------------------------------------------------------------
// The line grid — `ShortageReceiptCols` (laid out locally; ui_table 61 is NOT loaded,
// its column numbers do not match: the index-shift trap).
// ---------------------------------------------------------------------------

export const COL = {
  Tick: 0,
  From: 1,
  Date: 2,
  Age: 3,
  Item: 4,
  Why: 5,
  Short: 6,
  Recd: 7,
  Closed: 8,
  Open: 9,
  Receive: 10,
  Batch: 11,
  Expiry: 12,
  Cost: 13,
  GstHeld: 14,
  Outcome: 15,
} as const;
export type ColumnNo = (typeof COL)[keyof typeof COL];

/** Title and width weight (Qt `ColumnWeights`, the mockup's proportions, no sideways scroll). */
export const COLUMNS: readonly { no: ColumnNo; title: string; weight: number; number?: boolean }[] = [
  { no: COL.Tick, title: "", weight: 3 },
  { no: COL.From, title: "From", weight: 14 },
  { no: COL.Date, title: "Date", weight: 8 },
  { no: COL.Age, title: "Age", weight: 4, number: true },
  { no: COL.Item, title: "Item", weight: 16 },
  { no: COL.Why, title: "Why", weight: 9 },
  { no: COL.Short, title: "Short", weight: 5, number: true },
  { no: COL.Recd, title: "Recd", weight: 5, number: true },
  { no: COL.Closed, title: "Closed", weight: 5, number: true },
  { no: COL.Open, title: "Open", weight: 5, number: true },
  { no: COL.Receive, title: "Receive now", weight: 8, number: true },
  { no: COL.Batch, title: "Batch / Serial", weight: 9 },
  { no: COL.Expiry, title: "Expiry", weight: 8 },
  { no: COL.Cost, title: "Cost", weight: 8, number: true },
  { no: COL.GstHeld, title: "GST held", weight: 7, number: true },
  { no: COL.Outcome, title: "Outcome", weight: 13 },
];

/** `pur_shortage.psh_reason` in words — the server's `reasonText` (a saved line carries only the code). */
export const REASON_TEXT: Readonly<Record<string, string>> = {
  SHORT_BILL: "Short on bill",
  SHORT_CHALLAN: "Short vs challan",
  REPLACE: "Replace",
};

/** `psh_src_doc_type` in words (the From tooltip). */
export const SOURCE_TYPE_TEXT: Readonly<Record<string, string>> = {
  PURCHASE_BILL: "purchase bill",
  GRN: "GRN",
  PURCHASE_RETURN: "purchase return (replacement)",
};

export const BATCH_MAX_LENGTH = 40;
export const CHALLAN_MAX_LENGTH = 60;
export const REMARKS_MAX_LENGTH = 500;

export const HINT_PICK_SUPPLIER = "Pick the supplier — every open shortage of theirs comes in as a row.";
export const HINT_TICK_ROWS =
  "Tick what came (Space) — the open qty is received; type less in Receive now. F12 for batches / serials. " +
  "A row that will never come: Close row…";
export const HINT_NOTHING_SHORT = "Nothing of this supplier's is short.";

export const DISCARD_MESSAGE = "What was keyed on this receipt is not saved and will be lost.";
