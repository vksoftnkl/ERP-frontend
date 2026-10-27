/**
 * Branch Inward (menu 193) — the receiving branch keys what arrived against a
 * despatch (Qt `BranchInwardEntry`, svh_voucher_type TRANSFER_IN). Paths are
 * WITHOUT `/api/v1`, which the base URL carries.
 */

export const BRANCH_INWARD_RECEIVE_ENDPOINT = "/stock/transfer/receive";
export const BRANCH_INWARD_POST_ENDPOINT = "/stock/transfer/receive/post";
export const BRANCH_INWARD_PREFILL_ENDPOINT = "/stock/transfer/receive/prefill";
export const CONFIGURED_GRID_RUN_ENDPOINT = "/configured-grid-sql/run";

/** Grid 185 — the register of this branch's receipts. */
export const BRANCH_INWARD_LIST_GRID_KEY = "branchInwardList" as const;
/** Grid 186 — the worklist: one row per despatch still on its way here. */
export const BRANCH_INWARD_INBOUND_GRID_KEY = "branchInwardInTransit" as const;
/** ui_table 55 "BRANCH INWARD - LINES". */
export const BRANCH_INWARD_LINES_UI_TABLE_KEY = "branchInwardLines" as const;
/** Dropdown 72 — employees of the branch by designation. */
export const CREW_DROPDOWN_KEY = "employeeByDesignation" as const;

/** The designations the Unloading box asks dropdown 72 for (Qt `setFilterParam`). */
export const UNLOADMAN_ROLE = "LOADMAN";
export const SUPERVISOR_ROLE = "SUPERVISOR";

/** What the transit row's bucket is not: broken goods land here, never "cleaner". */
export const DAMAGED_BUCKET = "DAMAGED";

export const LIST_DEFAULT_DAYS_BACK = 30;
export const LIST_STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "DRAFT", label: "DRAFT" },
  { value: "POSTED", label: "POSTED" },
] as const;

/** Past this, a quantity is "nothing" (Qt `kEps`). */
export const EPS = 0.0000005;

/** The line grid's column numbers in ui_table 55 (Qt `BranchInwardCols`). */
export const COL = {
  LineNo: 0,
  Item: 1,
  Batch: 2,
  Sent: 3,
  Received: 4,
  Remaining: 5,
  Qty: 6,
  Bucket: 7,
  UnloadRate: 8,
  PostNote: 9,
} as const;
export type ColumnNo = (typeof COL)[keyof typeof COL];

/** Titles and shares used until (or without) the layout — the seeded ui_table 55. */
export const FALLBACK_COLUMNS: Record<ColumnNo, { title: string; width: number }> = {
  [COL.LineNo]: { title: "#", width: 3 },
  [COL.Item]: { title: "Item", width: 22 },
  [COL.Batch]: { title: "Batch", width: 10 },
  [COL.Sent]: { title: "Sent", width: 7 },
  [COL.Received]: { title: "Received so far", width: 9 },
  [COL.Remaining]: { title: "Still in transit", width: 9 },
  [COL.Qty]: { title: "Receiving now", width: 9 },
  [COL.Bucket]: { title: "Bucket", width: 9 },
  [COL.UnloadRate]: { title: "Unload ₹/unit", width: 6 },
  [COL.PostNote]: { title: "what Post writes", width: 16 },
};

export const GRID_NOTE = "+ on a line adds a Damaged line for broken units · − removes it · F1 lists the keys";

export const WORKLIST_HINT = "Enter opens the despatch that arrived";

/** Screen-memory-free: the dirty guard asks before anything is thrown away. */
export const DISCARD_OPEN = "This receipt has unsaved changes. Discard it and open another?";
export const DISCARD_NEW = "This receipt has unsaved changes. Start again anyway?";
export const DISCARD_CLOSE = "This receipt has unsaved changes. Close it anyway?";
