/**
 * Tracking Presets (menu 249) — Qt `TrackPresetList` + `TrackPresetEntry`
 * (NexERP d27045b), server notes 159 §4 (`src/modules/stocks/stock-track-presets`).
 *
 * A preset is a STENCIL, not a setting: it names a trade ("Pharma",
 * "Perishables"), carries the six tracking flags and the policy defaults that
 * go with them, and the policy screen COPIES those values into its form.
 * Nothing links a saved policy back to a preset, so a row here can never
 * re-key stock that already exists.
 *
 * Shared vs own: a row with no company is shared with every company, and a
 * company row with the same code hides the shared one. Edit on a shared row
 * makes this company's own copy (a save with no `sptId`). Everything here is
 * pure; the screen is `page.tsx`.
 */

export const TRACK_PRESET_MENU_ID = 249;
export const TRACK_PRESET_HREF = "/master/tracking-presets";
export const GRID_COMPANY_TOKEN = "ispt_company_id";
export const GRID_DELETED_TOKEN = "ispt_is_deleted";

export const CODE_MAX_LENGTH = 30;
export const NAME_MAX_LENGTH = 150;
export const DESCRIPTION_MAX_LENGTH = 250;
export const REMARKS_MAX_LENGTH = 250;
export const SORT_MAX = 32000;
export const SHELF_LIFE_MAX = 36500;
export const NEAR_EXPIRY_MAX = 3650;
export const NEAR_EXPIRY_DEFAULT = 30;

export const ISSUE_STRATEGIES = ["FIFO", "FEFO", "LIFO", "MANUAL"] as const;
export const ALLOW_NEGATIVE = ["ALLOW", "WARN", "BLOCK"] as const;
export const AGEING_BASES = ["INWARD_DATE", "MFG_DATE", "LAST_IN_DATE"] as const;

/** The six flags that decide how stock splits into lots — form key, `/get` key, body key. */
export const TRACK_FLAGS = [
  { form: "spt_track_batch", body: "trackBatch" },
  { form: "spt_track_mrp", body: "trackMrp" },
  { form: "spt_track_sale_price", body: "trackSalePrice" },
  { form: "spt_track_expiry", body: "trackExpiry" },
  { form: "spt_track_serial", body: "trackSerial" },
  { form: "spt_track_supplier", body: "trackSupplier" },
] as const;

export const F = {
  id: "spt_id",
  code: "spt_code",
  name: "spt_name",
  description: "spt_description",
  batch: "spt_track_batch",
  expiry: "spt_track_expiry",
  issue: "spt_issue_strategy",
  negative: "spt_allow_negative",
  shelf: "spt_shelf_life_days",
  nearExpiry: "spt_near_expiry_days",
  blockExpired: "spt_block_expired_sale",
  ageing: "spt_ageing_basis",
  sort: "spt_sort_order",
  remarks: "spt_remarks",
  active: "spt_is_active",
  scope: "spt_scope",
} as const;

export const LIST_LOOKUP_KEYS = {
  id: [F.id],
  code: [F.code],
  name: [F.name],
  short: [F.scope],
  alias: [F.code],
  active: [F.active],
  position: [F.sort],
  description: [F.description],
  array: ["items", "data", "rows", "results", "list"],
} as const;

/** The two bare tokens of grid 98, BOTH always sent (unsent, the literal stays in the SQL). */
export function listGridParams(showDeleted: boolean, companyId: string): Record<string, string | boolean> {
  return {
    wantdelete: showDeleted,
    [GRID_DELETED_TOKEN]: showDeleted ? "true" : "false",
    [GRID_COMPANY_TOKEN]: companyId,
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function bool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  const s = text(value).trim().toLowerCase();
  if (s === "true" || s === "t" || s === "1") return true;
  if (s === "false" || s === "f" || s === "0") return false;
  return fallback;
}

/**
 * `/get` answers `data: [row]` (a list), and what the shell hands over may be
 * the envelope, that array or the row itself: the one row, whichever.
 */
export function detailRowOf(source: unknown): Record<string, unknown> | null {
  const pickFirst = (value: unknown): Record<string, unknown> | null => {
    if (Array.isArray(value)) return pickFirst(value[0]);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  };
  const row = pickFirst(source);
  if (row && !("spt_id" in row) && "data" in row) return pickFirst(row.data) ?? row;
  return row;
}

/** A shared preset: the list's Scope column, or a `/get` row with no company. */
export function isSharedRow(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  if ("spt_scope" in row && text(row.spt_scope)) return text(row.spt_scope) === "Shared";
  return "spt_company_id" in row && (row.spt_company_id === null || text(row.spt_company_id) === "");
}

/** A blank form: the Qt defaults (FIFO, ALLOW, INWARD_DATE, near expiry 30). */
export function initialValues(): Record<string, string> {
  return {
    [F.code]: "",
    [F.name]: "",
    [F.description]: "",
    [F.sort]: "0",
    ...Object.fromEntries(TRACK_FLAGS.map((f) => [f.form, "false"])),
    [F.issue]: "FIFO",
    [F.negative]: "ALLOW",
    [F.shelf]: "",
    [F.nearExpiry]: String(NEAR_EXPIRY_DEFAULT),
    [F.blockExpired]: "false",
    [F.ageing]: "INWARD_DATE",
    [F.remarks]: "",
  };
}

/** `/get`'s row into the form. */
export function formValuesFromRow(row: Record<string, unknown> | null | undefined): Record<string, string> {
  const base = initialValues();
  if (!row) return base;
  const pick = (key: string, fallback: string) => text(row[key]) || fallback;
  const sort = Number.parseInt(text(row[F.sort]), 10);
  const near = Number.parseInt(text(row[F.nearExpiry]), 10);
  return {
    [F.code]: text(row[F.code]),
    [F.name]: text(row[F.name]),
    [F.description]: text(row[F.description]),
    [F.sort]: Number.isFinite(sort) ? String(sort) : "0",
    ...Object.fromEntries(TRACK_FLAGS.map((f) => [f.form, bool(row[f.form]) ? "true" : "false"])),
    [F.issue]: pick(F.issue, base[F.issue]),
    [F.negative]: pick(F.negative, base[F.negative]),
    [F.shelf]: text(row[F.shelf]),
    [F.nearExpiry]: Number.isFinite(near) ? String(near) : base[F.nearExpiry],
    [F.blockExpired]: bool(row[F.blockExpired]) ? "true" : "false",
    [F.ageing]: pick(F.ageing, base[F.ageing]),
    [F.remarks]: text(row[F.remarks]),
  };
}

export function usedByOf(row: Record<string, unknown> | null | undefined): number {
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return row ? n(row.usedByItems) + n(row.usedByGroups) : 0;
}

export function anyTracked(values: Record<string, string | undefined>): boolean {
  return TRACK_FLAGS.some((f) => values[f.form] === "true");
}

/**
 * The rules the table checks, said before Save (Qt `refreshNotes`): expiry
 * needs batch, FEFO needs expiry, and what the valuation will be.
 */
export function noteLines(
  values: Record<string, string | undefined>,
  options: { editingUsed: number },
): string[] {
  const batch = values[F.batch] === "true";
  const expiry = values[F.expiry] === "true";
  const lines = [
    anyTracked(values)
      ? "Valued lot by lot (LOT_ACTUAL) — each lot keeps its own cost."
      : "Valued at the weighted average (WAVG) — nothing is tracked, one holding.",
  ];
  if (expiry && !batch) lines.push("⚠ Expiry is tracked per batch — tick Batch too.");
  if (values[F.issue] === "FEFO" && !expiry && batch) lines.push("⚠ First-expiry-first-out needs Expiry tracked.");
  if (options.editingUsed > 0) {
    lines.push(
      `Used by ${options.editingUsed} item(s) or group(s): what it tracks is locked — changing it would re-split their stock.`,
    );
  }
  return lines;
}

function nullable(value: string | undefined): string | null {
  const t = (value ?? "").trim();
  return t ? t : null;
}

function wholeNumber(value: string | undefined): number | null {
  const t = (value ?? "").trim();
  return /^-?\d+$/.test(t) ? Number.parseInt(t, 10) : null;
}

/**
 * The save body — exactly the DTO's keys (`forbidNonWhitelisted`). `sptId` only
 * on an update of the company's OWN preset; a shared preset is never written, a
 * save with its code makes this company's copy. The valuation is derived, never
 * chosen: the table's own rule.
 */
export function buildSavePayload(
  values: Record<string, string | undefined>,
  options: { companyId: string; sptId: string | null },
): Record<string, string | number | boolean | null> {
  const near = wholeNumber(values[F.nearExpiry]);
  const sort = wholeNumber(values[F.sort]);
  return {
    ...(options.sptId ? { sptId: options.sptId } : {}),
    companyId: options.companyId,
    code: (values[F.code] ?? "").trim().toUpperCase(),
    name: (values[F.name] ?? "").replace(/\s+/g, " ").trim(),
    description: nullable((values[F.description] ?? "").replace(/\s+/g, " ")),
    ...Object.fromEntries(TRACK_FLAGS.map((f) => [f.body, values[f.form] === "true"])),
    valuationMethod: anyTracked(values) ? "LOT_ACTUAL" : "WAVG",
    issueStrategy: values[F.issue] || "FIFO",
    allowNegative: values[F.negative] || "ALLOW",
    shelfLifeDays: wholeNumber(values[F.shelf]),
    nearExpiryDays: near === null ? NEAR_EXPIRY_DEFAULT : Math.min(Math.max(near, 0), NEAR_EXPIRY_MAX),
    blockExpiredSale: values[F.blockExpired] === "true",
    ageingBasis: values[F.ageing] || "INWARD_DATE",
    sortOrder: sort === null ? 0 : Math.min(Math.max(sort, 0), SORT_MAX),
    remarks: nullable(values[F.remarks]),
  };
}

/** The deactivate / reactivate body. */
export function toggleBody(companyId: string, sptId: string, makeActive: boolean) {
  return { companyId, sptId, ...(makeActive ? { reactivate: true } : {}) };
}

export function toggleWords(name: string, makeActive: boolean) {
  return makeActive
    ? { title: "Reactivate", message: `Reactivate "${name}"?` }
    : { title: "Deactivate", message: `Deactivate "${name}"? It is refused while items or groups use it.` };
}
