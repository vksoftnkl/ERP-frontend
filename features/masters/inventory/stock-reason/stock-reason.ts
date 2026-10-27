/**
 * Stock Reasons (menu 293, grid 188) — Qt 97a8e59 (`inventory/master/stock_reason`).
 * Pure helpers; the screen is `stock-reason-master.tsx`.
 *
 * Server rules the screen leans on (`stock-reasons.controller.ts`):
 *  - `POST /stock/reasons` creates (no `srmId`) or updates the COMPANY's own row.
 *    A shared row (company NULL) is read-only: saving the same code as a company
 *    row hides the shared one for that company. That is "Edit on a shared reason".
 *  - `POST /stock/reasons/deactivate` switches a company row off / on; one never
 *    cited is deleted outright.
 *  - The code is immutable once a ledger row cites the reason, and it is the key
 *    a company copy replaces the shared row by — so the popup locks it on edit.
 */

/** Grid 188's tokens are QUOTED in the SQL and both are always sent. */
export function listGridParams(companyId: string, showInactive: boolean): Record<string, string> {
  return { icompany_id: companyId, iinactive: showInactive ? "true" : "false" };
}

export const LOOKUP_KEYS = {
  id: ["srm_id"],
  code: ["srm_code"],
  name: ["srm_name"],
  short: [],
  alias: [],
  active: ["srm_is_active"],
  position: ["srm_sort_order"],
  array: ["items", "data", "rows", "results", "list"],
} as const;

/** "Used on": one tick per txn type. None ticked = any type. */
export const TXN_TYPES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "ADJUST_PLUS", label: "Adjustment in" },
  { value: "ADJUST_MINUS", label: "Adjustment out" },
  { value: "PHYSICAL_PLUS", label: "Count excess" },
  { value: "PHYSICAL_MINUS", label: "Count shortage" },
  { value: "DAMAGE", label: "Damage" },
  { value: "EXPIRY_WRITEOFF", label: "Expiry" },
  { value: "SAMPLE_ISSUE", label: "Sample" },
  { value: "GIFT_ISSUE", label: "Gift" },
  { value: "BUCKET_OUT", label: "Move out" },
  { value: "BUCKET_IN", label: "Move in" },
  { value: "TRANSFER_OUT", label: "Transfer out" },
  { value: "TRANSFER_IN", label: "Transfer in" },
];

export const WAY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "OUT", label: "Out — stock goes out" },
  { value: "IN", label: "In — stock comes in" },
  { value: "BOTH", label: "Both — the line's sign decides" },
];

export const CODE_MAX_LENGTH = 30;
export const NAME_MAX_LENGTH = 150;
export const NOTES_MAX_LENGTH = 250;
export const SORT_MAX = 32000;
/** The server caches a grid run for about a second; a list re-read sooner shows the old row. */
export const RELOAD_AFTER_SAVE_MS = 1200;

export type ReasonRow = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

export function rowFlag(row: ReasonRow | null | undefined, key: string): boolean {
  const value = row?.[key];
  if (typeof value === "boolean") return value;
  const s = text(value).trim().toLowerCase();
  return s === "true" || s === "t" || s === "1" || s === "yes";
}

/** A shared reason: the same for every company, read-only on the server. */
export const isShared = (row: ReasonRow | null | undefined) => rowFlag(row, "shipped");
export const isActive = (row: ReasonRow | null | undefined) => rowFlag(row, "srm_is_active");

/** The grid row's comma list of txn types, as an array. */
export function txnTypesOf(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((t) => text(t).trim()).filter(Boolean);
  return text(raw)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export const BLANK_VALUES: Record<string, string> = {
  code: "",
  name: "",
  direction: "OUT",
  allowedTxnTypes: "",
  sortOrder: "0",
  glLedgerId: "",
  requireRemarks: "false",
  isActive: "true",
  remarks: "",
};

/** Qt `fromRow`: the grid row (it carries the names `/get` leaves out) into the form. */
export function formValuesFromRow(row: ReasonRow | null | undefined, copy: boolean): Record<string, string> {
  const source = row ?? {};
  const sort = Number.parseInt(text(source.srm_sort_order), 10);
  return {
    code: text(source.srm_code),
    name: text(source.srm_name),
    direction: text(source.srm_direction) || "OUT",
    allowedTxnTypes: txnTypesOf(source.srm_allowed_txn_types).join(","),
    sortOrder: Number.isFinite(sort) ? String(sort) : "0",
    glLedgerId: text(source.srm_gl_ledger_id),
    requireRemarks: rowFlag(source, "srm_require_remarks") ? "true" : "false",
    // A copy of a shared reason starts active (Qt Mode::Copy).
    isActive: copy || rowFlag(source, "srm_is_active") ? "true" : "false",
    remarks: text(source.srm_remarks),
  };
}

/**
 * The save body — exactly the DTO's keys (forbidNonWhitelisted). The code is
 * trimmed and upper-cased, blank ledger / notes travel as null. `editingId` is
 * left out for a copy of a shared reason: that is a create.
 */
export function buildSavePayload(
  values: Record<string, string | undefined>,
  opts: { companyId: string; editingId: string | null },
): Record<string, unknown> {
  const sort = Number.parseInt((values.sortOrder ?? "").trim(), 10);
  const notes = (values.remarks ?? "").trim();
  const ledger = (values.glLedgerId ?? "").trim();
  return {
    ...(opts.editingId ? { srmId: opts.editingId } : {}),
    companyId: opts.companyId,
    code: (values.code ?? "").trim().toUpperCase(),
    name: (values.name ?? "").replace(/\s+/g, " ").trim(),
    direction: values.direction || "OUT",
    allowedTxnTypes: txnTypesOf(values.allowedTxnTypes),
    requireRemarks: values.requireRemarks === "true",
    glLedgerId: ledger ? ledger : null,
    sortOrder: Number.isFinite(sort) ? Math.min(Math.max(sort, 0), SORT_MAX) : 0,
    remarks: notes ? notes : null,
    isActive: values.isActive !== "false",
  };
}

export type ToggleRequest = {
  route: "/stock/reasons" | "/stock/reasons/deactivate";
  body: Record<string, unknown>;
  title: string;
  message: string;
};

/** Qt `toggleActive`: what Active on / off sends for the selected row, and what it asks first. */
export function toggleRequestOf(row: ReasonRow, companyId: string): ToggleRequest {
  const active = !isActive(row);
  const name = text(row.srm_name);
  if (isShared(row) && !active) {
    // The server keeps shared rows read-only: an inactive company copy (same
    // code) hides the shared one for this company.
    return {
      route: "/stock/reasons",
      body: {
        ...buildSavePayload({ ...formValuesFromRow(row, false), isActive: "false" }, { companyId, editingId: null }),
      },
      title: "Deactivate",
      message: `"${name}" is shared with every company. Switching it off saves an inactive copy for this company only — other companies keep it.`,
    };
  }
  return {
    route: "/stock/reasons/deactivate",
    body: { companyId, srmId: text(row.srm_id), ...(active ? { reactivate: true } : {}) },
    title: active ? "Reactivate" : "Deactivate",
    message: active
      ? `Reactivate "${name}"?`
      : `Deactivate "${name}"? It stays in the history of every document that used it. A reason never used is removed altogether.`,
  };
}
