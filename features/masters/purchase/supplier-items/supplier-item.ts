/**
 * Supplier–Item Map (menu 295, grid 195) — Qt NexERP 97a5b48 / e0c56ef
 * (`purchase/master/supplier_item`). Pure helpers; the screen is
 * `supplier-item-master.tsx`.
 *
 * Server rules the screen leans on (`purchase/supplier-item/purchase-supplier-item.ts`):
 *  - One row per (company, supplier, item): `psi_id` is derived from the three,
 *    so `POST /purchase/supplier-items/save` takes no id — saving the pair again
 *    updates it. On edit the supplier and the item are therefore fixed.
 *  - Rows also come from posted bills by themselves (source AUTO); a typed save
 *    turns the row TYPED, and a bill never overwrites it afterwards.
 *  - The save writes every column: a scheme left out CLEARS it, a blank pack
 *    falls back to the buy unit's factor (else 1). So the form must open on the
 *    stored values — `/get` (it reads `p.*`, scheme included), not just the grid.
 *  - A scheme needs both numbers (PUR_SCHEME_INCOMPLETE); the supplier's code and
 *    barcode must not already point at another item (409).
 *  - `POST /purchase/supplier-items/active` switches a row on / off; off also
 *    drops Preferred. Nothing is deleted.
 */

/** Grid 195's tokens are QUOTED in the SQL and all three are always sent ('' = every supplier). */
export function listGridParams(
  companyId: string,
  supplierId: string,
  showInactive: boolean,
): Record<string, string> {
  return {
    icompany_id: companyId,
    isupplier_id: supplierId.trim(),
    iinactive: showInactive ? "true" : "false",
  };
}

/**
 * Grid 195 lists Supplier (sup_name) before Item (item_name): the first `*_name`
 * column takes the shell's name slot, so it must be named here or it goes blank.
 */
export const LOOKUP_KEYS = {
  id: ["psi_id"],
  code: ["psi_supplier_item_code"],
  name: ["sup_name"],
  short: [],
  alias: [],
  active: ["psi_is_active"],
  array: ["items", "data", "rows", "results", "list"],
} as const;

export const CODE_MAX_LENGTH = 60;
export const LEAD_DAYS_MAX = 365;
/** The server caches a grid run for about a second; a list re-read sooner shows the old row. */
export const RELOAD_AFTER_SAVE_MS = 1200;

export type SupplierItemRow = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

export function rowFlag(row: SupplierItemRow | null | undefined, key: string): boolean {
  const value = row?.[key];
  if (typeof value === "boolean") return value;
  const s = text(value).trim().toLowerCase();
  return s === "true" || s === "t" || s === "1" || s === "yes";
}

export const isActive = (row: SupplierItemRow | null | undefined) => rowFlag(row, "psi_is_active");

export const BLANK_VALUES: Record<string, string> = {
  supplierId: "",
  itemId: "",
  supplierItemCode: "",
  supplierBarcode: "",
  buyUomId: "",
  packQty: "",
  moq: "",
  leadDays: "",
  schemeBuyQty: "",
  schemeFreeQty: "",
  isPreferred: "false",
  isActive: "true",
};

/**
 * A pg NUMERIC as typed text ("12.000000" → "12"). Qt fills a Number field only
 * from a JSON number — the grid's text would have left it blank and a save
 * would have wiped it; here the text is read as a number either way.
 */
function numberText(value: unknown): string {
  const raw = text(value).trim();
  if (!raw) return "";
  const n = Number(raw);
  return Number.isFinite(n) ? String(n) : "";
}

/** Qt `SupplierItemEntry::fromRow`, over `/get` (p.* + names) merged with the grid row. */
export function formValuesFromSource(source: SupplierItemRow | null | undefined): Record<string, string> {
  const row = source ?? {};
  return {
    supplierId: text(row.psi_supplier_id),
    itemId: text(row.psi_item_id),
    supplierItemCode: text(row.psi_supplier_item_code),
    supplierBarcode: text(row.psi_supplier_barcode),
    buyUomId: text(row.psi_buy_uom_id),
    packQty: numberText(row.psi_pack_qty),
    moq: numberText(row.psi_moq),
    leadDays: numberText(row.psi_lead_days),
    schemeBuyQty: numberText(row.psi_scheme_buy_qty),
    schemeFreeQty: numberText(row.psi_scheme_free_qty),
    isPreferred: rowFlag(row, "psi_is_preferred") ? "true" : "false",
    isActive: row.psi_is_active === undefined || isActive(row) ? "true" : "false",
  };
}

/** The names the two pickers show, out of the same source. */
export function pairNamesOf(source: SupplierItemRow | null | undefined): { supplierName: string; itemName: string } {
  const row = source ?? {};
  return { supplierName: text(row.sup_name), itemName: text(row.item_name) };
}

type NumberRule = { label: string; min: number; minInclusive: boolean; max?: number; integer?: boolean };

function numberProblem(raw: string | undefined, rule: NumberRule): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return `${rule.label} must be a number.`;
  if (rule.integer && !Number.isInteger(n)) return `${rule.label} must be a whole number.`;
  if (rule.minInclusive ? n < rule.min : n <= rule.min) {
    return `${rule.label} must be ${rule.minInclusive ? "at least" : "more than"} ${rule.min}.`;
  }
  if (rule.max !== undefined && n > rule.max) return `${rule.label} must be at most ${rule.max}.`;
  return null;
}

/** The SaveSupplierItemDto bounds, per field. */
export const NUMBER_RULES: Record<"packQty" | "moq" | "leadDays" | "schemeBuyQty" | "schemeFreeQty", NumberRule> = {
  packQty: { label: "Pack", min: 0, minInclusive: false },
  moq: { label: "MOQ", min: 0, minInclusive: true },
  leadDays: { label: "Lead days", min: 0, minInclusive: true, max: LEAD_DAYS_MAX, integer: true },
  schemeBuyQty: { label: "Buy (qty)", min: 0, minInclusive: false },
  schemeFreeQty: { label: "Get free (qty)", min: 0, minInclusive: false },
};

export function validateNumber(key: keyof typeof NUMBER_RULES, raw: string | undefined): string | null {
  return numberProblem(raw, NUMBER_RULES[key]);
}

/** A scheme is both numbers or neither (the server's PUR_SCHEME_INCOMPLETE, said before the save). */
export function schemeProblem(values: Record<string, string | undefined>): string | null {
  const buy = (values.schemeBuyQty ?? "").trim();
  const free = (values.schemeFreeQty ?? "").trim();
  if (Boolean(buy) === Boolean(free)) return null;
  return "A scheme needs both numbers: buy how many, and how many free.";
}

/**
 * The save body (Qt `beforeSubmit`): exactly the DTO's keys — the company, the
 * pair, blank code / barcode / numbers left out, the two flags always.
 */
export function buildSavePayload(
  values: Record<string, string | undefined>,
  companyId: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    companyId,
    supplierId: (values.supplierId ?? "").trim(),
    itemId: (values.itemId ?? "").trim(),
  };
  for (const key of ["supplierItemCode", "supplierBarcode", "buyUomId"] as const) {
    const value = (values[key] ?? "").trim();
    if (value) body[key] = value;
  }
  for (const key of ["packQty", "moq", "leadDays", "schemeBuyQty", "schemeFreeQty"] as const) {
    const raw = (values[key] ?? "").trim();
    const n = Number(raw);
    if (raw && Number.isFinite(n)) body[key] = key === "leadDays" ? Math.trunc(n) : n;
  }
  body.isPreferred = values.isPreferred === "true";
  body.isActive = values.isActive !== "false";
  return body;
}

export type ToggleRequest = {
  route: "/purchase/supplier-items/active";
  body: { psiId: string; active: boolean };
  title: string;
  message: string;
};

/** Qt `SupplierItemList::toggleActive`. */
export function toggleRequestOf(row: SupplierItemRow): ToggleRequest {
  const active = !isActive(row);
  const verb = active ? "Reactivate" : "Deactivate";
  const tail = active ? "" : " It stops being the preferred supplier for the item, if it was.";
  return {
    route: "/purchase/supplier-items/active",
    body: { psiId: text(row.psi_id), active },
    title: verb,
    message: `${verb} ${text(row.item_name)} from ${text(row.sup_name)}?${tail}`,
  };
}
