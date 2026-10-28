/**
 * Purchase Return (menu 25) — the constants of the Qt `PurchaseReturnCols` /
 * `PurchaseClaimCols` (src/modules/purchase/return/purchase_return_cols.h, Qt
 * NexERP 8ca6ff3) and the routes the screen calls.
 */
import type { ConfiguredDropdownKey } from "@/lib/configured-dropdowns";
import type { UiTableKey } from "@/lib/ui-tables";

// ---------------------------------------------------------------------------
// Routes — WITHOUT `/api/v1`, which the base query adds.
// ---------------------------------------------------------------------------

export const PURCHASE_RETURN_SAVE_ENDPOINT = "/purchase/returns/save";
/** A saved draft, posted as it stands — for a user who may post but not edit. */
export const PURCHASE_RETURN_POST_ENDPOINT = "/purchase/returns/post";
export const PURCHASE_RETURN_GET_ENDPOINT = "/purchase/returns/get";
export const PURCHASE_RETURN_CANCEL_ENDPOINT = "/purchase/returns/cancel";
export const PURCHASE_RETURN_SOURCES_ENDPOINT = "/purchase/returns/sources";
export const PURCHASE_RETURN_SOURCE_LINES_ENDPOINT = "/purchase/returns/source-lines";
export const PURCHASE_CLAIMS_OPEN_ENDPOINT = "/purchase/claims/open";
export const PURCHASE_CLAIMS_SETTLE_ENDPOINT = "/purchase/claims/settle";
export const PURCHASE_CLAIMS_SETTLE_UNDO_ENDPOINT = "/purchase/claims/settle-undo";

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

/** ui_table 59 "PURCHASE RETURN - LINES". */
export const LINE_GRID_UI_TABLE_KEY: UiTableKey = "purchaseReturnLines";
/** ui_table 60 "PURCHASE CLAIMS - OPEN". */
export const CLAIMS_GRID_UI_TABLE_KEY: UiTableKey = "purchaseClaimsOpen";
/** Dropdown 35 SUPPLIERS: `sup_id` / `sup_name`. */
export const SUPPLIER_DROPDOWN_KEY: ConfiguredDropdownKey = "supplier";
/** Dropdown 43 LEDGERS - ALL: the transporter / insurer a TRANSPORTER or INSURER claim row is on. */
export const CLAIM_PARTY_DROPDOWN_KEY: ConfiguredDropdownKey = "ledgerAll";

/** The DOM name the line grid's cells carry for the shared Enter walk. */
export const LINE_GRID_NAME = "purchase-return-lines";
export const CLAIMS_GRID_NAME = "purchase-claims-open";

// ---------------------------------------------------------------------------
// The line grid — ui_table 59, by column number
// ---------------------------------------------------------------------------

export const COL = {
  SrcLine: 0,
  Item: 1,
  Unit: 2,
  Batch: 3,
  /** The holding the goods leave from (SALEABLE / DAMAGED) — "From". */
  Bucket: 4,
  Returnable: 5,
  Qty: 6,
  Outcome: 7,
  ClaimOn: 8,
  Rate: 9,
  GstPct: 10,
  Value: 11,
  Tax: 12,
  Total: 13,
  // 14 SrcItemId, 15 LotId, 16 UnitTax, 17 LineId are the row's own fields here.
} as const;

/** The columns this screen draws; anything else ui_table 59 carries is not shown. */
export const SHOWN_COLUMNS: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export const FALLBACK_COLUMN_TITLES: Readonly<Record<number, string>> = {
  0: "Bill Ln",
  1: "Item",
  2: "Unit",
  3: "Batch",
  4: "From",
  5: "Can Return",
  6: "Qty",
  7: "Outcome",
  8: "Claim On",
  9: "Rate",
  10: "GST %",
  11: "Value",
  12: "Tax",
  13: "Total",
  14: "SrcItemId",
  15: "LotId",
  16: "UnitTax",
  17: "LineId",
};

/** Width shares when the layout has not arrived (or names no width). */
export const FALLBACK_COLUMN_WIDTHS: Readonly<Record<number, number>> = {
  0: 4,
  1: 18,
  2: 6,
  3: 8,
  4: 8,
  5: 7,
  6: 7,
  7: 11,
  8: 9,
  9: 7,
  10: 5,
  11: 8,
  12: 7,
  13: 8,
};

/** Where Enter stops on a row (Qt `setFocusStops({ Qty, Outcome })`). */
export const ENTER_STOPS: readonly number[] = [COL.Qty, COL.Outcome];

// ---------------------------------------------------------------------------
// The claims grid — ui_table 60
// ---------------------------------------------------------------------------

export const CLAIM_COL = {
  Refno: 0,
  Date: 1,
  Line: 2,
  Item: 3,
  Claim: 4,
  ClaimOn: 5,
  Value: 6,
  Settled: 7,
  Open: 8,
  // 9 ReturnItemId, 10 AccYear, 11 LastSettlementId are the row's own fields here.
} as const;

export const CLAIM_SHOWN_COLUMNS: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8];

export const CLAIM_FALLBACK_TITLES: Readonly<Record<number, string>> = {
  0: "Return No",
  1: "Date",
  2: "Ln",
  3: "Item",
  4: "Claim",
  5: "Claim On",
  6: "Value",
  7: "Settled",
  8: "Open",
  9: "ReturnItemId",
  10: "AccYear",
  11: "LastSettlementId",
};

export const CLAIM_FALLBACK_WIDTHS: Readonly<Record<number, number>> = {
  0: 14,
  1: 8,
  2: 4,
  3: 20,
  4: 9,
  5: 18,
  6: 9,
  7: 9,
  8: 9,
};

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export type ReturnKind = "AGAINST_INVOICE" | "AGAINST_GRN";

export const KIND_OPTIONS: readonly { value: ReturnKind; label: string }[] = [
  { value: "AGAINST_INVOICE", label: "Bill" },
  { value: "AGAINST_GRN", label: "GRN (not yet billed)" },
];

/** The outcomes as the grid SHOWS them; the wire spells them with `_`. */
export const OUTCOMES = ["RETURN", "CLAIM SENT", "CLAIM DESTROYED", "REPLACE"] as const;
export type OutcomeText = (typeof OUTCOMES)[number];

export const CLAIM_PARTIES = ["SUPPLIER", "TRANSPORTER", "INSURER"] as const;
export type ClaimParty = (typeof CLAIM_PARTIES)[number];

export const BUCKET_SALEABLE = "SALEABLE";

export const CLAIM_HINT =
  "Credit = the party's credit note (part or whole) · Short-settle = write the rest off · Reject = write it off (GST on goods sent is re-availed)";
