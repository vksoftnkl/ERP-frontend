/**
 * Godown Transfer (menu 41) and Branch Outward (menu 192) — ONE screen in two
 * modes, as the Qt `GodownTransferEntry` is (`Mode::Godown` / `Mode::BranchOut`).
 * The constants of `godown_transfer_entity.h` (`GodownTransferCols`) and the
 * routes of `ApiEndpoints::StockTransfer`.
 *
 * It is one document and one route set on the server: no `toBranchId` is a
 * godown-to-godown move that despatch posts as an OUT + IN pair and ends
 * POSTED; another branch is a despatch that ends IN_TRANSIT.
 */
import type { ConfiguredDropdownKey } from "@/lib/configured-dropdowns";
import type { ConfiguredGridKey } from "@/lib/configured-grids";
import type { UiTableKey } from "@/lib/ui-tables";

// ---------------------------------------------------------------------------
// Routes — WITHOUT `/api/v1`, which the base query adds.
// ---------------------------------------------------------------------------

/** POST saves a DRAFT, GET loads (or lists), DELETE removes a DRAFT. */
export const STOCK_TRANSFER_ENDPOINT = "/stock/transfer";
export const STOCK_TRANSFER_VALIDATE_ENDPOINT = "/stock/transfer/validate";
export const STOCK_TRANSFER_DESPATCH_ENDPOINT = "/stock/transfer/despatch";
export const STOCK_TRANSFER_CANCEL_ENDPOINT = "/stock/transfer/cancel";
/** Notes 160 B — a despatch nobody received comes back. Judged on menu 192, CANCEL. */
export const STOCK_TRANSFER_RECALL_ENDPOINT = "/stock/transfer/recall";
export const STOCK_TRANSFER_SETTLE_SHORT_ENDPOINT = "/stock/transfer/receive/settle-short";
export const STOCK_REASONS_ENDPOINT = "/stock/reasons";
/** Every reason of the company, with its txn types — where TRANSIT_LOSS is found. */
export const STOCK_REASONS_LIST_ENDPOINT = "/stock/reasons/list";

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

export type TransferMode = "godown" | "branch";

export const LIST_GRID_KEYS: Record<TransferMode, ConfiguredGridKey> = {
  godown: "godownTransferList",
  branch: "branchOutwardList",
};
/** ui_table 54 "GODOWN TRANSFER - LINES" — both modes. */
export const LINE_GRID_UI_TABLE_KEY: UiTableKey = "godownTransferLines";
export const GODOWN_DROPDOWN_KEY: ConfiguredDropdownKey = "godown";
export const BRANCH_DROPDOWN_KEY: ConfiguredDropdownKey = "branchByCompany";
export const CREW_DROPDOWN_KEY: ConfiguredDropdownKey = "employeeByDesignation";

/** The DOM name the line grid's cells carry for the shared Enter walk. */
export const LINE_GRID_NAME = "stock-transfer-lines";

/** The window the list opens on (TxnMainViewConfig.defaultDaysBack). */
export const LIST_DEFAULT_DAYS_BACK = 30;

/** The designations the crew pickers list (Qt `setupHandling`). */
export const CREW_ROLES = {
  loadman: "LOADMAN",
  driver: "DRIVER",
  supervisor: "SUPERVISOR",
} as const;

export const STOCK_TRANSFER_MEMORY_KEYS: Record<TransferMode, string> = {
  godown: "stocks/godown-transfer",
  branch: "stocks/branch-outward",
};

/** A scanned batch label's pick-stock read: one holding is taken, a few open the picker. */
export const BATCH_LABEL_PICK_LIMIT = 50;

// ---------------------------------------------------------------------------
// The two modes' words
// ---------------------------------------------------------------------------

export type ModeInfo = {
  /** The screen's name, and the list's. */
  title: string;
  listTitle: string;
  /** "Godown Transfer — new" (Qt refreshTitle: the branch form says Branch Transfer). */
  documentName: string;
  noun: string;
  historyLabel: string;
  stepDocType: "STOCK_TRANSFER";
  listSubtitle: string;
  searchHint: string;
  /** The Post button: a godown transfer posts, a branch one despatches. */
  postLabel: string;
  shapeNote: string;
};

export const MODE_INFO: Record<TransferMode, ModeInfo> = {
  godown: {
    title: "Godown Transfer",
    listTitle: "Godown Transfers",
    documentName: "Godown Transfer",
    noun: "godown transfer",
    historyLabel: "Godown Transfer",
    stepDocType: "STOCK_TRANSFER",
    listSubtitle: "Stock moved from one godown of this branch to another.",
    searchHint: "doc no, godown, reason or remarks",
    postLabel: "Post",
    shapeNote: "Same branch: Post moves the stock out of From and into To in one step.",
  },
  branch: {
    title: "Branch Outward",
    listTitle: "Branch Outward",
    documentName: "Branch Transfer",
    noun: "branch transfer",
    historyLabel: "Branch Outward",
    stepDocType: "STOCK_TRANSFER",
    listSubtitle: "Stock despatched to another branch — in transit until that branch receives it.",
    searchHint: "doc no, branch, godown, LR or vehicle",
    postLabel: "Despatch",
    shapeNote:
      "Branch to branch: Despatch sends the stock into transit until the other branch receives it.",
  },
};

/** The list's Status combo (txn_doc_types_inventory.cpp). "" = All. */
export const LIST_STATUS_OPTIONS: Record<TransferMode, readonly { value: string; label: string }[]> = {
  godown: [
    { value: "", label: "All" },
    { value: "DRAFT", label: "DRAFT" },
    { value: "POSTED", label: "POSTED" },
    { value: "CANCELLED", label: "CANCELLED" },
  ],
  branch: [
    { value: "", label: "All" },
    { value: "DRAFT", label: "DRAFT" },
    { value: "IN_TRANSIT", label: "IN_TRANSIT" },
    { value: "RECEIVED", label: "RECEIVED" },
    // A recalled despatch (notes 160 B) is CANCELLED; Qt's combo predates recall.
    { value: "CANCELLED", label: "CANCELLED" },
  ],
};

export const STEP_NOTICES = {
  newHasNoNext: "A new document is the newest — nothing comes after it.",
  none: "There are no transfers yet.",
  oldest: "This is the oldest transfer.",
  newest: "This is the newest transfer.",
} as const;

/** The cancel / recall prompt's presets (`GodownTransferCols::cancelReasons`). */
export const CANCEL_REASONS: readonly string[] = [
  "Keyed against the wrong godown",
  "Quantities were wrong",
  "Wrong batch picked",
  "Entered twice — duplicate of another transfer",
  "The stock never moved",
];
export const CANCEL_REASON_MIN_LENGTH = 3;

// ---------------------------------------------------------------------------
// The line grid — ui_table 54
// ---------------------------------------------------------------------------

/**
 * A column number is the key `ui_tbl_clm_no` joins on, so a new column goes on
 * the END. The hidden ids (15–23) are the Qt screen's cell slots; here they
 * live on the line.
 */
export const COL = {
  LineNo: 0,
  Barcode: 1,
  ItemCode: 2,
  Description: 3,
  BatchExpiry: 4,
  Bucket: 5,
  UomName: 6,
  Available: 7,
  Qty: 8,
  FreeQty: 9,
  CostRate: 10,
  Value: 11,
  LoadRate: 12,
  UnloadRate: 13,
  PostNote: 14,
} as const;

export const FALLBACK_COLUMN_TITLES: Record<number, string> = {
  [COL.LineNo]: "#",
  [COL.Barcode]: "Barcode",
  [COL.ItemCode]: "Code",
  [COL.Description]: "Item",
  [COL.BatchExpiry]: "Batch · Expiry",
  [COL.Bucket]: "Bucket",
  [COL.UomName]: "Unit",
  [COL.Available]: "Available",
  [COL.Qty]: "Qty to move",
  [COL.FreeQty]: "Free",
  [COL.CostRate]: "Cost Rate",
  [COL.Value]: "Value",
  [COL.LoadRate]: "Load ₹/unit",
  [COL.UnloadRate]: "Unload ₹/unit",
  [COL.PostNote]: "what Post writes",
};

/** Used until ui_table 54 answers (widths are shares; the layout's own win). */
export const FALLBACK_COLUMN_LAYOUT: Record<number, { width: number; position: number; focus: boolean }> = {
  [COL.LineNo]: { width: 3, position: 0, focus: false },
  [COL.Barcode]: { width: 7, position: 1, focus: false },
  [COL.Description]: { width: 16, position: 3, focus: false },
  [COL.BatchExpiry]: { width: 9, position: 4, focus: false },
  [COL.Bucket]: { width: 7, position: 5, focus: false },
  [COL.UomName]: { width: 5, position: 6, focus: false },
  [COL.Available]: { width: 7, position: 7, focus: false },
  [COL.Qty]: { width: 7, position: 8, focus: false },
  [COL.FreeQty]: { width: 5, position: 9, focus: false },
  [COL.CostRate]: { width: 7, position: 10, focus: false },
  [COL.Value]: { width: 7, position: 11, focus: false },
  [COL.LoadRate]: { width: 5, position: 12, focus: false },
  [COL.UnloadRate]: { width: 5, position: 13, focus: false },
  [COL.PostNote]: { width: 14, position: 14, focus: false },
};

/** Which grid columns show: the rate columns follow the ticked boxes (Qt `applyColumns`). */
export function visibleColumnNumbers(flags: { loadEnabled: boolean; unloadEnabled: boolean }): number[] {
  const shown: number[] = [];
  for (const no of Object.values(COL)) {
    if (no === COL.ItemCode) {
      continue;
    }
    if (no === COL.LoadRate && !flags.loadEnabled) {
      continue;
    }
    if (no === COL.UnloadRate && !flags.unloadEnabled) {
      continue;
    }
    shown.push(no);
  }
  return shown;
}

export function bucketLabel(code: string): string {
  return code ? code.charAt(0) + code.slice(1).toLowerCase() : "";
}
