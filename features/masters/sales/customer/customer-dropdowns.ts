import type { ERPDynamicSelectOption } from "@/components/design-system/ui/dynamic-modal-form";
import { extractRows } from "@/features/masters/shared/normalizers";
import { getFirstDefinedValue, toDisplayValue } from "@/features/masters/shared/value-mappers";

// Configured-dropdown endpoint (fixed.dropdown_details). Mirrors configured-grid-sql/run:
// GET ?dropdown_id=<n>&page=1&limit=20&search=<q> -> { data: { items, meta } }.
// dropdown_param is intentionally never sent (these dropdowns take no bound params).
export const DROPDOWN_RUN_ENDPOINT = "/dropdown-details/run";
export const DROPDOWN_SEARCH_DEBOUNCE_MS = 250;

// The customer form select fields that are lazily loaded from a configured server
// dropdown (fetched on open + on debounced server-side search) instead of the eager
// /master-lookups endpoint. The state dropdown also feeds the Region State field.
export type CustomerDropdownKind = "company" | "branch" | "area" | "group" | "state";

type CustomerDropdownConfig = {
  dropdownId: string;
  idKeys: readonly string[];
  labelKeys: readonly string[];
};

// dropdown ids come from fixed.dropdown_details (see customer page task):
// 8 company (comp_id,comp_name), 5 branch (br_id,br_name), 10 area (arm_id,arm_name),
// 28 customer group (cgr_id,cgr_name), 9 state code (state_code,state_name).
export const CUSTOMER_DROPDOWN_CONFIG: Record<CustomerDropdownKind, CustomerDropdownConfig> = {
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
  area: {
    dropdownId: "10",
    idKeys: ["arm_id", "armId"],
    labelKeys: ["arm_name", "armName"],
  },
  group: {
    dropdownId: "28",
    idKeys: ["cgr_id", "cgrId"],
    labelKeys: ["cgr_name", "cgrName"],
  },
  state: {
    dropdownId: "9",
    idKeys: ["state_code", "stateCode"],
    labelKeys: ["state_name", "stateName"],
  },
};

// Build the run query. An empty search is omitted so the server returns the first page.
// dropdown_param is never included (these dropdowns are not parameterised).
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
  includeEmptyOption = true,
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
  return includeEmptyOption ? [{ value: "", label: "" }, ...options] : options;
}

// Keep the currently-selected option visible after a fetch replaces the option list:
// if the pinned option's value isn't already present, append it.
export function withPinnedOption(
  options: ERPDynamicSelectOption[],
  pinned: ERPDynamicSelectOption | null | undefined,
): ERPDynamicSelectOption[] {
  if (!pinned || !pinned.value) {
    return options;
  }
  if (options.some((option) => option.value === pinned.value)) {
    return options;
  }
  return [...options, pinned];
}

export type CustomerStateDropdownData = {
  // Main State field: value = state_code, label = "State Name (CODE)".
  options: ERPDynamicSelectOption[];
  // Region State field: value = state_name, label = state_name.
  regionStateOptions: ERPDynamicSelectOption[];
  stateNameByCode: Record<string, string>;
  stateCodeByName: Record<string, string>;
};

// Build both state option shapes + code/name maps from a single dropdown-9 payload.
export function buildStateDropdownData(payload: unknown): CustomerStateDropdownData {
  const codeToName = new Map<string, string>();
  const { idKeys, labelKeys } = CUSTOMER_DROPDOWN_CONFIG.state;
  for (const row of extractDropdownRows(payload)) {
    const stateCode = toDisplayValue(getFirstDefinedValue(row, idKeys)).trim().toUpperCase();
    const stateName = toDisplayValue(getFirstDefinedValue(row, labelKeys));
    if (!stateCode || !stateName) {
      continue;
    }
    if (!codeToName.has(stateCode)) {
      codeToName.set(stateCode, stateName);
    }
  }
  const options = Array.from(codeToName.entries())
    .map(([value, name]) => ({ value, label: `${name} (${value})` }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const regionStateOptions = Array.from(new Set(codeToName.values()))
    .map((name) => ({ value: name, label: name }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const stateNameByCode: Record<string, string> = {};
  const stateCodeByName: Record<string, string> = {};
  for (const [code, name] of codeToName.entries()) {
    stateNameByCode[code] = name;
    if (!(name in stateCodeByName)) {
      stateCodeByName[name] = code;
    }
  }
  return {
    options: [{ value: "", label: "" }, ...options],
    regionStateOptions: [{ value: "", label: "" }, ...regionStateOptions],
    stateNameByCode,
    stateCodeByName,
  };
}
