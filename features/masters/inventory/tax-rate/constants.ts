import type { ERPDynamicSelectOption } from "@/components/design-system/ui/dynamic-modal-form";

/** `MAIN LIST - GST RATES`. Its SQL binds one token — see `GRID_ACTIVE_ONLY_TOKEN`. */
export const GRID_DETAIL_ID = 103;

/**
 * Grid 103's SQL ends `AND (NOT itax_is_active OR t.tax_is_active)`, and the
 * runner substitutes named tokens textually: run it without this key and the
 * statement 400s with `column "itax_is_active" does not exist` rather than
 * falling back to unfiltered. Sending `true` narrows to live rates; `false`
 * includes the deactivated ones a maintenance screen has to switch back on.
 */
export const GRID_ACTIVE_ONLY_TOKEN = "itax_is_active";

/** `POSTING ROLES - RATE WISE` — the roles whose `alr_by_rate` is true. */
export const ROLE_DROPDOWN_ID = 52;

/**
 * `LEDGERS FOR POSTING ROLE`. Its SQL joins `acc_ledger_role` on the bare token
 * `itrl_role` and applies that role's own `alr_want_type` / `alr_want_duty` /
 * `alr_want_nature` — so which ledgers a role may use is decided in SQL and this
 * screen never restates it. It also requires `led_company_id IS NULL`: a global
 * rate pointing at a company-scoped ledger would post everyone's revenue into
 * one company's books.
 */
export const LEDGER_DROPDOWN_ID = 51;

/** `GST RATES` — for the `tax_supersedes_id` picker. */
export const RATE_DROPDOWN_ID = 53;

/** The parameter name dropdown 51's SQL declares. */
export const LEDGER_DROPDOWN_ROLE_PARAM = "itrl_role";

export const API_ENDPOINTS = {
  list: `/configured-grid-sql/run?grid_id=${GRID_DETAIL_ID}`,
  getById: "/tax-rates/get",
  create: "/tax-rates/create",
  delete: "/tax-rates/delete",
} as const;

export const RESOLVE_ENDPOINT = "/tax-rates/resolve";

export const GRID_TABLE_NAME = "tax_rate_master";

/** `ck_tax_taxability`. */
export const TAXABILITY_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "TAXABLE", label: "Taxable" },
  { value: "EXEMPT", label: "Exempt" },
  { value: "NIL_RATED", label: "Nil Rated" },
  { value: "NON_GST", label: "Non GST" },
  { value: "ZERO_RATED", label: "Zero Rated" },
];

/**
 * Both cess bases — compensation cess and the state cess — take the same four
 * values, and `ck_tax_cess_agrees` requires the basis and the figures to agree.
 */
export const CESS_BASIS_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "NONE", label: "None" },
  { value: "PERCENT", label: "Percent" },
  { value: "PER_UNIT", label: "Per Unit" },
  { value: "BOTH", label: "Both" },
];

/** §5.3 — blank is the default and means "answers both natures", not "unset". */
export const SUPPLY_NATURE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "", label: "Both natures" },
  { value: "INTRA", label: "Intra-state" },
  { value: "INTER", label: "Inter-state" },
];

export const TAX_RATE_INITIAL_FORM_VALUES: Record<string, string> = {
  tax_name: "",
  tax_code: "",
  tax_taxability: "TAXABLE",
  tax_rate_perc: "0",
  tax_cgst_perc: "0",
  tax_sgst_perc: "0",
  tax_igst_perc: "0",
  tax_cess_basis: "NONE",
  tax_cess_perc: "0",
  tax_cess_per_unit: "0",
  tax_acess_basis: "NONE",
  tax_acess_perc: "0",
  tax_acess_per_unit: "0",
  tax_supersedes_id: "",
  tax_supersedes_name: "",
  tax_sort_order: "0",
  tax_is_reverse_charge: "false",
  tax_is_active: "true",
};

/**
 * GENERATED ALWAYS columns. On the form because the operator needs to see 18
 * becoming 9 + 9; disabled because typing in them could never change anything;
 * stripped at build time because the API rejects them (§4.2, §4.4 rule 1).
 */
export const GENERATED_SPLIT_FIELDS = [
  "tax_cgst_perc",
  "tax_sgst_perc",
  "tax_igst_perc",
] as const;
