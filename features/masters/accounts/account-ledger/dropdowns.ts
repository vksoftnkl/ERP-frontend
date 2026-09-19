import type { ERPDynamicSelectOption } from "@/components/design-system/ui/dynamic-modal-form";
import { extractRows, getFirstDefinedValue, toDisplayValue } from "./transformers";
import { LOOKUP_ARRAY_KEYS } from "./constants";
import type { ConfiguredDropdownKey } from "@/lib/configured-dropdowns";

// Configured-dropdown endpoint (fixed.dropdown_details). Mirrors configured-grid-sql/run:
// GET ?dropdown_id=<n>&page=1&limit=20&search=<q>&dropdown_param=<json> -> { data: { items, total } }.
export const DROPDOWN_RUN_ENDPOINT = "/dropdown-details/run";

// The Account Ledger form select fields that are lazily loaded from a configured
// server dropdown (fetched on open + on debounced server-side search) instead of the
// eager master-lookups endpoint. State name + region state name share dropdown 21.
export type LedgerDropdownKind =
  | "company"
  | "branch"
  | "accountGroup"
  | "state"
  | "taxRate";

type LedgerDropdownFieldConfig = {
  kind: LedgerDropdownKind;
  dropdownKey: ConfiguredDropdownKey;
  idKeys: readonly string[];
  labelKeys: readonly string[];
};

export const LEDGER_DROPDOWN_FIELD_CONFIG: Record<string, LedgerDropdownFieldConfig> = {
  ledCompanyId: {
    kind: "company",
    dropdownKey: "company",
    idKeys: ["comp_id", "compId"],
    labelKeys: ["comp_name", "compName"],
  },
  ledBranchId: {
    kind: "branch",
    dropdownKey: "branchActive",
    idKeys: ["br_id", "brId"],
    labelKeys: ["br_name", "brName"],
  },
  ledGroupId: {
    kind: "accountGroup",
    dropdownKey: "accountGroup",
    idKeys: ["acc_group_id", "accGroupId"],
    labelKeys: ["acc_group_name", "accGroupName"],
  },
  ledStateName: {
    kind: "state",
    dropdownKey: "gstStateCode",
    idKeys: ["state_code", "stateCode"],
    labelKeys: ["state_name", "stateName"],
  },
  ledRegionStateName: {
    kind: "state",
    dropdownKey: "gstStateCode",
    idKeys: ["state_code", "stateCode"],
    labelKeys: ["state_name", "stateName"],
  },
  // `GST RATES` — inventory.tax_rate_master, the rate a service ledger carries
  // when it appears as a taxable line. Rows also carry tax_rate_perc /
  // tax_taxability, which are the rate's own properties and read-only here.
  ledTaxId: {
    kind: "taxRate",
    dropdownKey: "gstRate",
    idKeys: ["tax_id", "taxId"],
    labelKeys: ["tax_name", "taxName"],
  },
};

export const LEDGER_DROPDOWN_FIELD_NAMES = new Set<string>(
  Object.keys(LEDGER_DROPDOWN_FIELD_CONFIG),
);

// Build the run query. An empty search is omitted so the server returns the first page.
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

// Map dropdown-run rows ({ data: { items: [...] } }) to <value,label> options using the
// configured id/label columns. A blank option is prepended so the field can be cleared.
export function buildDropdownOptions(
  payload: unknown,
  idKeys: readonly string[],
  labelKeys: readonly string[],
  includeEmptyOption = true,
): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, LOOKUP_ARRAY_KEYS);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const id = toDisplayValue(getFirstDefinedValue(source, idKeys));
    if (!id) {
      continue;
    }
    const name = toDisplayValue(getFirstDefinedValue(source, labelKeys));
    if (!optionMap.has(id)) {
      optionMap.set(id, name || id);
    }
  }
  const options = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
  if (!includeEmptyOption) {
    return options;
  }
  return [{ value: "", label: "" }, ...options];
}
