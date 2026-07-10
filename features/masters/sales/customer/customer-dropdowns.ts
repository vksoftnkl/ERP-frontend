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

// A single Company/Area/Customer-Group default resolved from the customer_template
// config. `id` becomes the select's value (a real id when the config supplies one,
// otherwise the plain string itself) and `label` the text shown on the trigger.
export type CustomerTemplateDefault = {
  id: string;
  label: string;
};

// State-select seed: value = code, label = "Name (CODE)". null when the config omits
// cusStateCode.
export type CustomerTemplateStateDefault = {
  code: string;
  name: string;
};

// Everything the customer_template config supplies for the create form:
// - company/area/group: the three lazily-loaded dropdowns (seeded with a pinned
//   option so their label shows); any the config omits stay null.
// - state: the lazy State select seed (kept apart because its label/value differ).
// - fieldValues: every other primitive `cus*` field, keyed by form-field name and
//   coerced to the string shape the modal stores, overlaid onto the blank create
//   values so the whole template (GST type, price level, charges, flags, …) pre-fills.
export type CustomerTemplateDefaults = {
  company: CustomerTemplateDefault | null;
  area: CustomerTemplateDefault | null;
  group: CustomerTemplateDefault | null;
  state: CustomerTemplateStateDefault | null;
  fieldValues: Record<string, string>;
};

export const EMPTY_CUSTOMER_TEMPLATE_DEFAULTS: CustomerTemplateDefaults = {
  company: null,
  area: null,
  group: null,
  state: null,
  fieldValues: {},
};

// Config keys that drive the three seeded dropdowns or the State select — excluded
// from the generic field overlay so raw ids/labels/codes don't leak in twice.
const TEMPLATE_HANDLED_KEYS = new Set<string>([
  "company",
  "companyId",
  "cusCompanyId",
  "area",
  "areaId",
  "cusAreaId",
  "customerGroup",
  "customer_group",
  "group",
  "groupId",
  "cusGroupId",
  "cusStateName",
  "stateName",
  "state_name",
]);

function extractTemplateState(
  source: Record<string, unknown>,
): CustomerTemplateStateDefault | null {
  const code = toDisplayValue(
    getFirstDefinedValue(source, ["cusStateCode", "stateCode", "state_code"]),
  )
    .trim()
    .toUpperCase();
  if (!code) {
    return null;
  }
  const name = toDisplayValue(
    getFirstDefinedValue(source, ["cusStateName", "stateName", "state_name"]),
  );
  return { code, name };
}

// Copy every primitive config entry (string/number/boolean, coerced to string) keyed
// by its form-field name, skipping the dropdown/state keys handled separately and any
// nested objects/arrays. Empty strings are kept so a template can blank a field.
function collectTemplateFieldValues(
  source: Record<string, unknown>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (TEMPLATE_HANDLED_KEYS.has(key)) {
      continue;
    }
    if (raw === undefined || raw === null || typeof raw === "object") {
      continue;
    }
    values[key] = toDisplayValue(raw);
  }
  return values;
}

// Normalize one config entry. It can be an object ({ id/value, name/label } — e.g.
// company) or a bare string (e.g. area "arafd", customerGroup "vary"); a string is
// used as both the option value and its label.
function normalizeTemplateDefault(raw: unknown): CustomerTemplateDefault | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const source = raw as Record<string, unknown>;
    const id = toDisplayValue(getFirstDefinedValue(source, ["id", "value", "code", "_id"]));
    const label = toDisplayValue(getFirstDefinedValue(source, ["name", "label", "title"]));
    const resolvedId = id || label;
    if (!resolvedId) {
      return null;
    }
    return { id: resolvedId, label: label || resolvedId };
  }
  const value = toDisplayValue(raw);
  return value ? { id: value, label: value } : null;
}

// Read the customer_template config payload (GET /configs/get?configId=1) into the
// three dropdown defaults. `data.configValue` is a JSON *string* holding the company/
// area/customerGroup selections; a missing/blank/malformed value yields empty defaults
// so the create form simply renders without seeded selections.
export function parseCustomerTemplateConfig(payload: unknown): CustomerTemplateDefaults {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return EMPTY_CUSTOMER_TEMPLATE_DEFAULTS;
  }
  const root = payload as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root;
  const rawConfigValue = data.configValue ?? data.config_value;
  let configValue: unknown = rawConfigValue;
  if (typeof rawConfigValue === "string") {
    const trimmed = rawConfigValue.trim();
    if (!trimmed) {
      return EMPTY_CUSTOMER_TEMPLATE_DEFAULTS;
    }
    try {
      configValue = JSON.parse(trimmed);
    } catch {
      return EMPTY_CUSTOMER_TEMPLATE_DEFAULTS;
    }
  }
  if (!configValue || typeof configValue !== "object" || Array.isArray(configValue)) {
    return EMPTY_CUSTOMER_TEMPLATE_DEFAULTS;
  }
  const source = configValue as Record<string, unknown>;
  return {
    company: normalizeTemplateDefault(
      getFirstDefinedValue(source, ["company", "cusCompanyId", "companyId"]),
    ),
    area: normalizeTemplateDefault(
      getFirstDefinedValue(source, ["area", "cusAreaId", "areaId"]),
    ),
    group: normalizeTemplateDefault(
      getFirstDefinedValue(source, [
        "customerGroup",
        "customer_group",
        "group",
        "cusGroupId",
        "groupId",
      ]),
    ),
    state: extractTemplateState(source),
    fieldValues: collectTemplateFieldValues(source),
  };
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
