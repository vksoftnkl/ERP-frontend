/**
 * Pure rules for the Print Templates list (menu 62), kept out of the component
 * so they can be tested: the grid's tokens, what a row says about itself, and
 * why Retire is off.
 *
 * Qt's `PrintTemplateList::updateHint` is the model for the wording -- the two
 * front ends should read the same.
 */

export type TemplateListFilters = {
  /** Active designs only. On by default, as in Qt. */
  activeOnly: boolean;
  /** A `print_purpose` ppo_id, or "" for any. */
  purposeId: string;
  /** "" any, "PUBLISHED", "UNPUBLISHED" -- the grid's `iptl_state` words. */
  state: "" | "PUBLISHED" | "UNPUBLISHED";
  /** Hide the shipped designs. */
  ownedOnly: boolean;
  /** "" any, else one of the engines. */
  engine: string;
};

export const INITIAL_TEMPLATE_FILTERS: TemplateListFilters = {
  activeOnly: true,
  purposeId: "",
  state: "",
  ownedOnly: false,
  engine: "",
};

/**
 * The grid's six tokens. Every one is QUOTED in the SQL, so an unsent token
 * stays a literal word and fails the whole run: send all of them, '' meaning
 * "no filter". Booleans are 'true' or ''.
 */
export function templateGridParams(
  companyId: string,
  filters: TemplateListFilters,
): Record<string, string> {
  return {
    iptl_company_id: companyId,
    iptl_active: filters.activeOnly ? "true" : "",
    iptl_purpose_id: filters.purposeId,
    iptl_state: filters.state,
    iptl_owned: filters.ownedOnly ? "true" : "",
    iptl_engine: filters.engine,
  };
}

/** The fields of a grid row this screen reads. */
export type TemplateGridRow = {
  ptl_id?: unknown;
  ptl_company_id?: unknown;
  ptl_code?: unknown;
  ptl_name?: unknown;
  state?: unknown;
  owner?: unknown;
  ptl_is_active?: unknown;
};

export const text = (value: unknown): string => (value == null ? "" : String(value));

/** A shipped design has no company -- every company uses it. */
export function isShippedRow(row: TemplateGridRow | null | undefined): boolean {
  return !!row && text(row.ptl_company_id).trim() === "";
}

export function isNotPublishedRow(row: TemplateGridRow | null | undefined): boolean {
  return !!row && text(row.state).toUpperCase() === "NOT PUBLISHED";
}

/** The boolean arrives as a boolean, but tolerate 'true' / 'false' text. */
export function isInactiveRow(row: TemplateGridRow | null | undefined): boolean {
  if (!row || row.ptl_is_active === undefined || row.ptl_is_active === null) return false;
  const value = row.ptl_is_active;
  if (typeof value === "boolean") return !value;
  const word = text(value).trim().toLowerCase();
  return word === "false" || word === "0" || word === "f";
}

export const SHIPPED_NOTE =
  "Shipped — every company uses it: Clone it to change it; it cannot be retired.";
export const NOT_PUBLISHED_NOTE =
  "Not published — no counter can print it until a revision is published.";
export const INACTIVE_NOTE = "Inactive — switched off; no counter uses it.";

/** What the hint line says about the selected row; empty when nothing is wrong. */
export function rowNotes(row: TemplateGridRow | null | undefined): string[] {
  if (!row) return [];
  const notes: string[] = [];
  if (isShippedRow(row)) notes.push(SHIPPED_NOTE);
  if (isNotPublishedRow(row)) notes.push(NOT_PUBLISHED_NOTE);
  if (isInactiveRow(row)) notes.push(INACTIVE_NOTE);
  return notes;
}

/** Why Retire is off for this row, or null when it is allowed. */
export function retireRefusal(row: TemplateGridRow | null | undefined): string | null {
  return isShippedRow(row) ? SHIPPED_NOTE : null;
}
