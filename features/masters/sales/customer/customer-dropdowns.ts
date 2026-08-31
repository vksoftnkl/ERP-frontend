import type { ERPDynamicSelectOption } from "@/components/design-system/ui/dynamic-modal-form";
import { extractRows } from "@/features/masters/shared/normalizers";
import { getFirstDefinedValue, toDisplayValue } from "@/features/masters/shared/value-mappers";
import {
  applyFormDefaults,
  EMPTY_FORM_DEFAULTS,
} from "@/features/masters/shared/apply-form-defaults";
import { CUSTOMER_TEMPLATE_FIELD_SPECS } from "./template/field-specs";

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

// A single Company/Area/Customer-Group default resolved from the customer form
// defaults. `id` becomes the select's value and `label` the text shown on the
// trigger — the saved JSON carries both (`cusAreaId` + `cusAreaName`), because a
// lazy dropdown has no options loaded yet when the create form opens.
export type CustomerTemplateDefault = {
  id: string;
  label: string;
};

// State-select seed: value = code, label = "Name (CODE)". null when the defaults omit
// cusStateCode.
export type CustomerTemplateStateDefault = {
  code: string;
  name: string;
};

// Everything the `masters.customer_form_defaults` setting supplies for the create form:
// - company/area/group: the three lazily-loaded dropdowns (seeded with a pinned
//   option so their label shows); any the setting omits stay null.
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

// Two fallbacks the Qt screen applied and this one keeps, both CONDITIONAL: a
// template that says nothing about country or state starts new customers on
// India / Tamil Nadu, and a template that sets its own is never overwritten.
// They apply to a template, not to a blank form — no template at all still opens
// the form on its own initial values.
const TEMPLATE_COUNTRY_FALLBACK = "India";
const TEMPLATE_STATE_FALLBACK: CustomerTemplateStateDefault = { code: "33", name: "Tamil Nadu" };

/**
 * Read the `masters.customer_form_defaults` value — the raw TEXT of the setting, a
 * JSON object keyed by the customer form's own field names — into the create form's
 * seeds.
 *
 * The generic `applyFormDefaults` does the reading (partial apply, per-spec coercion,
 * unknown keys ignored, malformed input → nothing); what is customer-specific stays
 * here: the three seeded dropdowns and the State select are lifted out for the page
 * that pins their options, and the two quirks below.
 */
export function parseCustomerFormDefaults(
  value: string | null | undefined,
): CustomerTemplateDefaults {
  const applied = applyFormDefaults(value, CUSTOMER_TEMPLATE_FIELD_SPECS);
  // Identity, not emptiness: an unreadable value is no template at all, while a
  // template that happens to be `{}` is one that says nothing — and a template that
  // says nothing still gets the country/state fallbacks below.
  if (applied === EMPTY_FORM_DEFAULTS) {
    return EMPTY_CUSTOMER_TEMPLATE_DEFAULTS;
  }
  const fieldValues = { ...applied.values };
  // The select's option values are the enum (REGULAR / COMPOSITION / UNREGISTERED) but
  // the value is saved by whichever client wrote it, and the POS writes the LABEL
  // ("Unregistered"). Upper-casing is the whole difference, and without it the GST Type
  // field silently comes up blank.
  if (fieldValues.cusGstType) {
    fieldValues.cusGstType = fieldValues.cusGstType.toUpperCase();
  }
  const stateSeed = applied.seeds.cusStateCode;
  const state: CustomerTemplateStateDefault = stateSeed
    ? {
        code: stateSeed.id.toUpperCase(),
        // `applyFormDefaults` falls a missing label back to the id; for the State seed
        // that would render as "33 (33)", so an absent name stays absent.
        name: stateSeed.label === stateSeed.id ? "" : stateSeed.label,
      }
    : TEMPLATE_STATE_FALLBACK;
  if (!fieldValues.cusStateCode) {
    fieldValues.cusStateCode = state.code;
  }
  if (!fieldValues.cusCountry) {
    fieldValues.cusCountry = TEMPLATE_COUNTRY_FALLBACK;
  }
  return {
    company: applied.seeds.cusCompanyId ?? null,
    area: applied.seeds.cusAreaId ?? null,
    group: applied.seeds.cusGroupId ?? null,
    state,
    fieldValues,
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
