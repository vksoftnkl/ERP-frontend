/**
 * Purchase Return (menu 25) — the constants of the Qt `PurchaseReturnCols`
 * (src/modules/purchase/return/purchase_return_cols.h, the 2026-10-29 rebuild to
 * purchase_return_ui_mockup.png) and the routes the screen calls. Claims are no
 * longer settled here: they live on Supplier Dues (menu 297).
 */
import type { ConfiguredDropdownKey } from "@/lib/configured-dropdowns";

// ---------------------------------------------------------------------------
// Routes — WITHOUT `/api/v1`, which the base query adds.
// ---------------------------------------------------------------------------

export const PURCHASE_RETURN_SAVE_ENDPOINT = "/purchase/returns/save";
/** A saved draft, posted as it stands — for a user who may post but not edit. */
export const PURCHASE_RETURN_POST_ENDPOINT = "/purchase/returns/post";
/** The rows' money, Credit to / Writes, the six totals and the strip — nothing saved. */
export const PURCHASE_RETURN_VALIDATE_ENDPOINT = "/purchase/returns/validate";
export const PURCHASE_RETURN_GET_ENDPOINT = "/purchase/returns/get";
export const PURCHASE_RETURN_CANCEL_ENDPOINT = "/purchase/returns/cancel";
export const PURCHASE_RETURN_SOURCES_ENDPOINT = "/purchase/returns/sources";
export const PURCHASE_RETURN_SOURCE_LINES_ENDPOINT = "/purchase/returns/source-lines";
/** Stock Reasons (menu 293): the PURCHASE_RETURN set (PRET_*) is the Reason pick-list. */
export const STOCK_REASONS_LIST_ENDPOINT = "/stock/reasons/list";
/** `?gdl_id=` — the name of a godown the server named (validate answers an id only). */
export const GODOWN_GET_ENDPOINT = "/godowns/get";

/** Supplier Dues (menu 297) — the claims, debit notes and replacements this supplier owes. */
export const SUPPLIER_DUES_ROUTE = "/purchase/supplier-dues";

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

/** Dropdown 35 SUPPLIERS: `sup_id` / `sup_name`. */
export const SUPPLIER_DROPDOWN_KEY: ConfiguredDropdownKey = "supplier";
/** Dropdown 26 GODOWNS: `gdl_id` / `gdl_name`, bound to `ibranch_id`. */
export const GODOWN_DROPDOWN_KEY: ConfiguredDropdownKey = "godown";
/** Dropdown 43 LEDGERS - ALL: the transporter / insurer a claim row is on. */
export const CLAIM_PARTY_DROPDOWN_KEY: ConfiguredDropdownKey = "ledgerAll";

/**
 * The document keys every purchase screen shares (Qt `PurchaseDocNav`):
 * `/txn/adjacent` docType, the print purpose (print_purpose.ppo_code) and the
 * attachments' docType (/txn-attachments, Ctrl+A).
 */
export const ADJACENT_DOC_TYPE = "PURCHASE_RETURN" as const;
export const PRINT_PURPOSE_CODE = "PURCHASE_RETURN";
export const ATTACH_DOC_TYPE = "PURCHASE_RETURN" as const;

/** The DOM name the line grid's cells carry for the shared Enter walk. */
export const LINE_GRID_NAME = "purchase-return-lines";

/** /validate is asked this long after the last edit (Qt `m_recalc` 350 ms). */
export const RECALC_DELAY_MS = 350;

// ---------------------------------------------------------------------------
// The line grid — the mockup's columns in its order (Qt `applyColumns`)
// ---------------------------------------------------------------------------

export type ReturnColumn =
  | "item"
  | "batch"
  | "bucket"
  | "billed"
  | "returned"
  | "qty"
  | "rate"
  | "value"
  | "gst"
  | "outcome"
  | "reason"
  | "creditTo"
  | "writes";

/** # Item Batch·Exp Bucket Billed Returned Qty Rate Value GST Outcome Reason Credit to Writes — and the Qt weights. */
export const RETURN_COLUMNS: readonly { key: ReturnColumn; title: string; weight: number; align?: "right" }[] = [
  { key: "item", title: "Item", weight: 15 },
  { key: "batch", title: "Batch · Exp", weight: 9 },
  { key: "bucket", title: "Bucket", weight: 7 },
  { key: "billed", title: "Billed", weight: 5, align: "right" },
  { key: "returned", title: "Returned", weight: 5, align: "right" },
  { key: "qty", title: "Qty", weight: 5, align: "right" },
  { key: "rate", title: "Rate", weight: 5, align: "right" },
  { key: "value", title: "Value", weight: 6, align: "right" },
  { key: "gst", title: "GST", weight: 5, align: "right" },
  { key: "outcome", title: "Outcome", weight: 12 },
  { key: "reason", title: "Reason", weight: 9 },
  { key: "creditTo", title: "Credit to", weight: 10 },
  { key: "writes", title: "Writes", weight: 9 },
];

/** Where Enter stops on a row (Qt `setFocusStops({ Qty, Outcome, Reason })`). */
export const ENTER_STOPS: readonly ReturnColumn[] = ["qty", "outcome", "reason"];

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export type ReturnKind = "AGAINST_INVOICE" | "AGAINST_GRN";

/**
 * How the Return (debit note) rows are settled (header.settlement). A new
 * return takes purchase.return_settlement_default; CASH is settled by a
 * Receipt, so the return itself is then set off (ADJUST), as the server does.
 */
export type ReturnSettlement = "ADJUST" | "ADVANCE";

export const SETTLEMENT_OPTIONS: readonly { value: ReturnSettlement; label: string }[] = [
  { value: "ADJUST", label: "Adjust in next bill / payment" },
  { value: "ADVANCE", label: "Keep as an advance with the supplier" },
];

export const KIND_OPTIONS: readonly { value: ReturnKind; label: string }[] = [
  { value: "AGAINST_INVOICE", label: "Invoice" },
  { value: "AGAINST_GRN", label: "GRN (not billed yet)" },
];

/** The four outcomes, wire codes. */
export const OUTCOME_CODES = ["RETURN", "CLAIM_SENT", "CLAIM_DESTROYED", "REPLACE"] as const;
export type OutcomeCode = (typeof OUTCOME_CODES)[number];

/** The outcome as the server words it (`outcomeText`) — what the cell shows. */
export const OUTCOME_TEXT: Readonly<Record<OutcomeCode, string>> = {
  RETURN: "Return (debit note)",
  CLAIM_SENT: "Claim — goods sent",
  CLAIM_DESTROYED: "Claim — destroyed here",
  REPLACE: "Replace",
};

export const CLAIM_PARTIES = ["SUPPLIER", "TRANSPORTER", "INSURER"] as const;
export type ClaimParty = (typeof CLAIM_PARTIES)[number];

/** Credit to on a claim row: who the claim is on (Qt `claimText`). */
export const CLAIM_PARTY_TEXT: Readonly<Record<ClaimParty, string>> = {
  SUPPLIER: "Claim receivable",
  TRANSPORTER: "Claim receivable · transporter",
  INSURER: "Claim receivable · insurer",
};

export const BUCKET_SALEABLE = "SALEABLE";
export const BUCKET_DAMAGED = "DAMAGED";

/** The server's e-way bill warning code (the company's statutory limit). */
export const EWB_NEEDED_CODE = "PUR_RETURN_EWB_NEEDED";

/** THE FOUR OUTCOMES — Outcome · Goods · Money · ITC · Closes when (the mockup's words; D17 / D18). */
export const OUTCOME_LEGEND_HEADS = ["Outcome", "Goods", "Money", "ITC", "Closes when"] as const;
export const OUTCOME_LEGEND: readonly (readonly [string, string, string, string, string])[] = [
  [
    "Return (debit note)",
    "Leave now (ISSUE)",
    "Supplier balance reduced now (bill-wise PURCHASE_RETURN)",
    "Reversed now",
    "Posted — adjusted in a bill / Payment",
  ],
  [
    "Claim — goods sent",
    "Leave now (ISSUE)",
    "CLAIM_RECEIVABLE (value + GST) — credit expected later",
    "Reversed now",
    "Supplier CN received (Supplier dues)",
  ],
  [
    "Claim — destroyed here",
    "Written off here",
    "CLAIM_RECEIVABLE (value) — compensation expected",
    "Reversed — sec 17(5)(h)",
    "Compensation received / written off",
  ],
  ["Replace", "Leave now (ISSUE)", "None — no money moves", "Reversed now, re-claimed on arrival", "Shortage Receipt brings the replacement"],
];
/** The legend's column proportions (Qt `buildLegend`). */
export const OUTCOME_LEGEND_WEIGHTS = [13, 14, 25, 19, 25] as const;

export const PROMPT_ROW =
  "pick rows from the bill (Ctrl+L)  ·  or start from the bill: Ctrl+F11 on Purchase Entry  ·  + splits a row into another outcome  ·  − drops it";
