import type { ERPDynamicSelectOption } from "@/components/design-system/ui/dynamic-modal-form";
import {
  extractRows,
  getFirstDefinedValue,
  toDisplayValue,
} from "@/app/master/_shared/crud-utils";

// Configured-dropdown endpoint (fixed.dropdown_details). Mirrors configured-grid-sql/run:
// GET ?dropdown_id=<n>&page=1&limit=20&search=<q> -> { data: { items, meta } }.
// dropdown_param is intentionally never sent (these dropdowns take no bound params).
export const DROPDOWN_RUN_ENDPOINT = "/dropdown-details/run";
export const DROPDOWN_SEARCH_DEBOUNCE_MS = 250;

// The supplier form select fields that are lazily loaded from a configured server
// dropdown (fetched on open + on debounced server-side search) instead of the eager
// /master-lookups endpoint. State (9) is handled separately because its field value is
// the state NAME, not an id.
export type SupplierDropdownKind = "company" | "branch" | "group" | "state";

type SupplierDropdownConfig = {
  dropdownId: string;
  idKeys: readonly string[];
  labelKeys: readonly string[];
};

// dropdown ids from fixed.dropdown_details: 8 company (comp_name,comp_id),
// 5 branch (br_id,br_name), 11 supplier groups (spg_id,spg_name), 9 state code
// (state_code,state_name).
export const SUPPLIER_DROPDOWN_CONFIG: Record<SupplierDropdownKind, SupplierDropdownConfig> = {
  company: {
    dropdownId: "8",
    idKeys: ["comp_id", "compId"],
    labelKeys: ["comp_name", "compName"],
  },
  branch: {
    dropdownId: "5",
    idKeys: ["br_id", "brId"],
    labelKeys: ["br_name", "brName"],
  },
  group: {
    dropdownId: "11",
    idKeys: ["spg_id", "spgId"],
    labelKeys: ["spg_name", "spgName"],
  },
  state: {
    dropdownId: "9",
    idKeys: ["state_code", "stateCode"],
    labelKeys: ["state_name", "stateName"],
  },
};

// Build the run query. An empty search is omitted so the server returns the first page;
// dropdown_param is never sent.
export function buildDropdownRunQuery(
  dropdownId: string,
  search: string,
  limit = 20,
): Record<string, string> {
  const query: Record<string, string> = {
    dropdown_id: dropdownId,
    page: "1",
    limit: String(limit),
  };
  const trimmed = search.trim();
  if (trimmed) {
    query.search = trimmed;
  }
  return query;
}

function extractDropdownRows(payload: unknown): Record<string, unknown>[] {
  return extractRows(payload).filter(
    (row): row is Record<string, unknown> =>
      Boolean(row) && typeof row === "object" && !Array.isArray(row),
  );
}

// Map dropdown-run rows ({ data: { items: [...] } }) to <value,label> options using the
// configured id/label columns. A blank option is prepended so the field can be cleared.
export function buildDropdownOptions(
  payload: unknown,
  idKeys: readonly string[],
  labelKeys: readonly string[],
): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  for (const row of extractDropdownRows(payload)) {
    const id = toDisplayValue(getFirstDefinedValue(row, idKeys));
    if (!id) {
      continue;
    }
    const label = toDisplayValue(getFirstDefinedValue(row, labelKeys));
    if (!optionMap.has(id)) {
      optionMap.set(id, label || id);
    }
  }
  const options = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
  return [{ value: "", label: "" }, ...options];
}

// Keep the currently-selected option visible after a fetch replaces the option list.
export function withPinnedOption(
  options: ERPDynamicSelectOption[],
  pinned: ERPDynamicSelectOption | null,
): ERPDynamicSelectOption[] {
  if (!pinned || !pinned.value) {
    return options;
  }
  if (options.some((option) => option.value === pinned.value)) {
    return options;
  }
  return [...options, pinned];
}

export type SupplierStateDropdownData = {
  // The State field's value IS the state name, so value === label.
  options: ERPDynamicSelectOption[];
  stateCodeByName: Record<string, string>;
  stateNameByCode: Record<string, string>;
};

// Build the State options (value = state name) + code/name maps from a dropdown-9 payload.
export function buildSupplierStateData(payload: unknown): SupplierStateDropdownData {
  const { idKeys, labelKeys } = SUPPLIER_DROPDOWN_CONFIG.state;
  const nameToCode = new Map<string, string>();
  for (const row of extractDropdownRows(payload)) {
    const stateCode = toDisplayValue(getFirstDefinedValue(row, idKeys)).trim().toUpperCase();
    const stateName = toDisplayValue(getFirstDefinedValue(row, labelKeys)).trim();
    if (!stateName || !stateCode || nameToCode.has(stateName)) {
      continue;
    }
    nameToCode.set(stateName, stateCode);
  }
  const options = Array.from(nameToCode.keys())
    .map((name) => ({ value: name, label: name }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const stateCodeByName: Record<string, string> = {};
  const stateNameByCode: Record<string, string> = {};
  for (const [name, code] of nameToCode.entries()) {
    stateCodeByName[name] = code;
    if (!(code in stateNameByCode)) {
      stateNameByCode[code] = name;
    }
  }
  return {
    options: [{ value: "", label: "" }, ...options],
    stateCodeByName,
    stateNameByCode,
  };
}
