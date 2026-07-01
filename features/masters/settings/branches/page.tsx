"use client";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useMasterOptions } from "@/features/masters/shared";
import {
  useLazyConfiguredDropdown,
  type LazyDropdownHandlers,
} from "@/features/masters/shared/use-lazy-configured-dropdown";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  extractRows,
  getFirstDefinedValue,
  toDateInputValue,
  toDisplayValue,
  toNullableDate,
  toNullableInteger,
  toNullableNumber,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
  toUpper,
  toUpperNullable,
} from "@/app/master/_shared/crud-utils";
const API_ENDPOINTS = {
  list: "/configured-grid-sql/run?grid_id=13",
  getById: "/branch-masters/get",
  create: "/branch-masters/create",
  delete: "/branch-masters/delete",
} as const;
const GRID_TABLE_NAME = "branch_master";
const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const GODOWN_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const STATE_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const LOOKUP_QUERY_ACCOUNT_LEDGERS = {
  module: "accountLedgers",
  limit: "100",
} as const;
const GODOWN_LOOKUP_QUERY = {
  module: "godownLocations",
  limit: "100",
} as const;
const STATE_LOOKUP_QUERY = {
  module: "stateCodes",
  limit: "100",
} as const;
const LOOKUP_KEYS = {
  id: ["brId", "br_id", "id", "_id"],
  code: ["brCode", "br_code", "code"],
  name: ["brName", "br_name", "name"],
  short: ["brShort", "br_short", "short", "shortName"],
  alias: ["brAlias", "br_alias", "alias"],
  active: ["brIsActive", "br_is_active", "isActive", "is_active", "status"],
  position: ["position", "sort"],
  description: ["brTerms", "br_terms", "description", "remarks"],
  array: ["data", "items", "results", "rows", "list", "branches", "branch_masters"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "brId",
  name: "brName",
  alias: "brAlias",
  short: "brShort",
  description: "brTerms",
  sort: "position",
} as const;
const DEFAULT_COMPANY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Company",
};
const DEFAULT_LEDGER_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Ledger",
};
const DEFAULT_GODOWN_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Godown",
};
// Company is a lazy, server-side searchable configured dropdown (fixed.dropdown_details
// 8=company comp_id/comp_name). Loaded on open + on debounced server-side search via
// /dropdown-details/run; nothing up front and dropdown_param is never sent.
const COMPANY_DROPDOWN_CONFIG = {
  dropdownId: "8",
  idKeys: ["comp_id", "compId"] as const,
  labelKeys: ["comp_name", "compName"] as const,
  defaultOption: DEFAULT_COMPANY_OPTION,
} as const;
// Source keys to seed the saved company on edit/view (getById returns compId + compName).
const COMPANY_SOURCE_ID_KEYS = ["compId", "comp_id", "brCompId", "br_comp_id"] as const;
const COMPANY_SOURCE_NAME_KEYS = ["compName", "comp_name", "companyName", "company_name"] as const;
// State selects (main + region) are lazy server-side configured dropdowns (dropdown 9 ->
// state_code/state_name); the field value is the state NAME. The full code<->name maps
// below still load eagerly because submit derives brStateCode from the picked name.
const STATE_DROPDOWN_CONFIG = {
  dropdownId: "9",
  idKeys: ["state_name", "stateName"] as const,
  labelKeys: ["state_name", "stateName"] as const,
  defaultOption: { value: "", label: "Select State" } as ERPDynamicSelectOption,
} as const;
// Godown is a lazy configured dropdown (dropdown 26 -> gdl_id/gdl_name). The eager godown
// list is kept only to resolve the saved godown's name on edit (getById returns no name).
const GODOWN_DROPDOWN_CONFIG = {
  dropdownId: "26",
  idKeys: ["gdl_id", "gdlId"] as const,
  labelKeys: ["gdl_name", "gdlName"] as const,
  defaultOption: DEFAULT_GODOWN_OPTION,
} as const;
const BRANCH_STATE_KEYS = ["brState", "br_state"] as const;
const BRANCH_REGION_STATE_KEYS = ["brRegionState", "br_region_state"] as const;
const BRANCH_GODOWN_ID_KEYS = ["brDefaultGodownId", "br_default_godown_id", "defaultGodownId"] as const;
const ACCOUNT_LEDGER_LOOKUP_DEFINITION = {
  query: LOOKUP_QUERY_ACCOUNT_LEDGERS,
  defaultOption: DEFAULT_LEDGER_OPTION,
  idKeys: ["id", "value"],
  labelKeys: ["name", "label"],
} as const;
const GODOWN_LOOKUP_DEFINITION = {
  query: GODOWN_LOOKUP_QUERY,
  defaultOption: DEFAULT_GODOWN_OPTION,
  arrayKeys: ["data", "items", "results", "rows", "list", "godowns", "godown_locations"],
  idKeys: [
    "gdl_id",
    "gdlId",
    "gdl_location_id",
    "godown_id",
    "godownId",
    "id",
    "_id",
  ],
  labelKeys: [
    "gdl_name",
    "gdlName",
    "godown_name",
    "godownName",
    "name",
    "label",
  ],
} as const;
const ROUNDING_MODE_OPTIONS: ERPDynamicSelectOption[] = [
  {
    value: "rounding off",
    label: "Rounding Off",
  },
  {
    value: "rounding up",
    label: "Rounding Up",
  },
];
const STATE_LOOKUP_ARRAY_KEYS = ["items", "data", "results", "rows", "list"] as const;
const STATE_LOOKUP_NAME_KEYS = ["stateName", "state_name", "name", "label"] as const;
const STATE_LOOKUP_CODE_KEYS = ["id", "value", "stateCode", "state_code", "code"] as const;
const BRANCH_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(92vw, 60rem)",
  height: "76vh",
  maxHeight: "76vh",
};
const STATUS_CHECKBOX_FIELD_STYLE: CSSProperties = {
  paddingBlock: "0.45rem",
};
const BRANCH_STANDARD_FIELD_NAMES = [
  "compId",
  "brCode",
  "brName",
  "brMailingName",
  "brAlias",
  "brShort",
  "brType",
  "brAddr1",
  "brAddr2",
  "brAddr3",
  "brCity",
  "brDistrict",
  "brState",
  "brStateCode",
  "brPin",
  "brCountry",
  "brLandmark",
  "brRegionAddr1",
  "brRegionAddr2",
  "brRegionAddr3",
  "brRegionCity",
  "brRegionDistrict",
  "brRegionState",
  "brRegionCountry",
  "brRegionName",
  "brContactPerson",
  "brTel",
  "brPhone",
  "brMail",
  "brBillPrefix",
  "brInvoiceSeriesPrefix",
  "brBillGreeting",
  "brTerms",
  "brRoundingMode",
  "brRoundingValue",
  "brDefaultGodownId",
  "brPosType",
  "brBankId",
  "brFssaiNo",
  "brFssaiLicenseType",
  "brGstinNo",
  "brGstRegType",
  "brPanNo",
  "brAllowNegativeStock",
  "brSmsApplicable",
] as const;
const BRANCH_DATE_FIELD_NAMES = ["brFssaiValidUpto"] as const;
const BRANCH_BOOLEAN_FIELD_NAMES = [
  "brIsDefault",
  "brIsActive",
  "brAllowNegativeStock",
  "brSmsApplicable",
] as const;
const BRANCH_INITIAL_FORM_VALUES = {
  compId: "",
  brCode: "",
  brName: "",
  brMailingName: "",
  brAlias: "",
  brShort: "",
  brType: "",
  brIsDefault: "false",
  brIsActive: "true",
  brAddr1: "",
  brAddr2: "",
  brAddr3: "",
  brCity: "",
  brDistrict: "",
  brState: "",
  brStateCode: "",
  brPin: "",
  brCountry: "India",
  brLandmark: "",
  brRegionAddr1: "",
  brRegionAddr2: "",
  brRegionAddr3: "",
  brRegionCity: "",
  brRegionDistrict: "",
  brRegionState: "",
  brRegionCountry: "India",
  brRegionName: "",
  brContactPerson: "",
  brTel: "",
  brPhone: "",
  brMail: "",
  brBillPrefix: "",
  brInvoiceSeriesPrefix: "",
  brBillGreeting: "",
  brTerms: "",
  brRoundingMode: "",
  brRoundingValue: "0.00",
  brDefaultGodownId: "",
  brPosType: "",
  brAllowNegativeStock: "true",
  brSmsApplicable: "false",
  brBankId: "",
  brFssaiNo: "",
  brFssaiLicenseType: "",
  brFssaiValidUpto: "",
  brGstinNo: "",
  brGstRegType: "",
  brPanNo: "",
} as const;
function removeEmptyOptions(
  options: ERPDynamicSelectOption[],
): ERPDynamicSelectOption[] {
  return options.filter((option) => option.value.trim().length > 0);
}
function buildStateCodeByName(payload: unknown): Record<string, string> {
  const codeByName = new Map<string, string>();
  const rows = extractRows(payload, STATE_LOOKUP_ARRAY_KEYS);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const stateName = toDisplayValue(
      getFirstDefinedValue(source, STATE_LOOKUP_NAME_KEYS),
    );
    const stateCode = toDisplayValue(
      getFirstDefinedValue(source, STATE_LOOKUP_CODE_KEYS),
    ).toUpperCase();
    if (!stateName || !stateCode || codeByName.has(stateName)) {
      continue;
    }
    codeByName.set(stateName, stateCode);
  }
  return Object.fromEntries(codeByName.entries());
}
function buildStateNameByCode(payload: unknown): Record<string, string> {
  const nameByCode = new Map<string, string>();
  const rows = extractRows(payload, STATE_LOOKUP_ARRAY_KEYS);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const stateName = toDisplayValue(
      getFirstDefinedValue(source, STATE_LOOKUP_NAME_KEYS),
    );
    const stateCode = toDisplayValue(
      getFirstDefinedValue(source, STATE_LOOKUP_CODE_KEYS),
    ).toUpperCase();
    if (!stateName || !stateCode || nameByCode.has(stateCode)) {
      continue;
    }
    nameByCode.set(stateCode, stateName);
  }
  return Object.fromEntries(nameByCode.entries());
}
function buildBranchFormFields({
  companyOptions,
  stateOptions,
  regionStateOptions,
  ledgerOptions,
  godownOptions,
  companyHandlers,
  stateHandlers,
  regionStateHandlers,
  godownHandlers,
}: {
  companyOptions: ERPDynamicSelectOption[];
  stateOptions: ERPDynamicSelectOption[];
  regionStateOptions: ERPDynamicSelectOption[];
  ledgerOptions: ERPDynamicSelectOption[];
  godownOptions: ERPDynamicSelectOption[];
  companyHandlers: LazyDropdownHandlers;
  stateHandlers: LazyDropdownHandlers;
  regionStateHandlers: LazyDropdownHandlers;
  godownHandlers: LazyDropdownHandlers;
}): ERPDynamicModalField[] {
  return [
    {
      name: "__heading_identity",
      label: "Identity & Reference",
      type: "heading",
    },
    {
      name: "brName",
      label: "Branch Name",
      required: true,
      validation: {
        minLength: 2,
        maxLength: 150,
        minLengthMessage: "Branch Name must be at least 2 characters.",
        maxLengthMessage: "Branch Name must be at most 150 characters.",
      },
    },
    {
      name: "compId",
      label: "Company",
      type: "select",
      searchable: true,
      serverSearch: true,
      required: true,
      options: companyOptions,
      onSearchOpenChange: companyHandlers.onSearchOpenChange,
      onSearchQueryChange: companyHandlers.onSearchQueryChange,
      onValueChange: companyHandlers.onValueChange,
      validation: {
        requiredMessage: "Company is required.",
      },
    },
    {
      name: "brTel",
      label: "Telephone",
      type: "tel",
    },
    {
      name: "brAlias",
      label: "Alias",
      validation: {
        maxLength: 100,
        maxLengthMessage: "Alias must be at most 100 characters.",
      },
    },    
    {
      name: "brContactPerson",
      label: "Contact Person",
      validation: {
        maxLength: 150,
        maxLengthMessage: "Contact Person must be at most 150 characters.",
      },
    },
    {
      name: "brMail",
      label: "Email",
      type: "email",
    },
    {
      name: "brCode",
      label: "Branch Code",
      validation: {
        maxLength: 20,
        maxLengthMessage: "Branch Code must be at most 20 characters.",
      },
    },
    {
      name: "brPhone",
      label: "Phone",
      type: "tel",
    },
    {
      name: "__heading_address",
      label: "Address",
      type: "heading",
    },
    {
      name: "brAddr1",
      label: "Address 1",
    },
    {
      name: "brCity",
      label: "City",
      validation: {
        maxLength: 100,
        maxLengthMessage: "City must be at most 100 characters.",
      },
    },
    {
      name: "brPin",
      label: "Pincode",
      inputMode: "numeric",
      validation: {
        maxLength: 10,
        maxLengthMessage: "Pincode must be at most 10 characters.",
      },
    },
    {
      name: "brAddr2",
      label: "Address 2",
    },
    {
      name: "brDistrict",
      label: "District",
      validation: {
        maxLength: 100,
        maxLengthMessage: "District must be at most 100 characters.",
      },
    },
    {
      name: "brLandmark",
      label: "Landmark",
      validation: {
        maxLength: 100,
        maxLengthMessage: "Landmark must be at most 100 characters.",
      },
    },
    {
      name: "brAddr3",
      label: "Address 3",
    },
    {
      name: "brState",
      label: "State",
      type: "select",
      searchable: true,
      serverSearch: true,
      required: true,
      options: stateOptions,
      onSearchOpenChange: stateHandlers.onSearchOpenChange,
      onSearchQueryChange: stateHandlers.onSearchQueryChange,
      onValueChange: stateHandlers.onValueChange,
      validation: {
        requiredMessage: "State is required.",
      },
    },
    {
      name: "__heading_region",
      label: "Region Address",
      type: "heading",
      defaultExpanded: false,
    },
    {
      name: "brRegionAddr1",
      label: "Region Address 1",
    },
    {
      name: "brRegionCity",
      label: "Region City",
      validation: {
        maxLength: 100,
        maxLengthMessage: "Region City must be at most 100 characters.",
      },
    },
    {
      name: "brRegionCountry",
      label: "Region Country",
      disabled: true,
      validation: {
        maxLength: 60,
        maxLengthMessage: "Region Country must be at most 60 characters.",
      },
    },
    {
      name: "brRegionAddr2",
      label: "Region Address 2",
    },
    {
      name: "brRegionDistrict",
      label: "Region District",
      validation: {
        maxLength: 100,
        maxLengthMessage: "Region District must be at most 100 characters.",
      },
    },
    {
      name: "brRegionState",
      label: "State",
      type: "select",
      searchable: true,
      serverSearch: true,
      options: regionStateOptions,
      onSearchOpenChange: regionStateHandlers.onSearchOpenChange,
      onSearchQueryChange: regionStateHandlers.onSearchQueryChange,
      onValueChange: regionStateHandlers.onValueChange,
    },
    {
      name: "brRegionAddr3",
      label: "Region Address 3",
    },
    {
      name: "brRegionName",
      label: "Region Name",
    },
    {
      name: "__heading_billing",
      label: "Billing & Invoice Setup",   
      type: "heading",
      defaultExpanded: false,
    },
    {
      name: "brInvoiceSeriesPrefix",
      label: "Invoice Series Prefix",
      required: true,
      validation: {
        maxLength: 20,
        maxLengthMessage: "Invoice Series Prefix must be at most 20 characters.",
      },
    },
    {
      name: "brRoundingMode",
      label: "Rounding Mode",
      required: true,
      type: "select",
      searchable: false,
      options: ROUNDING_MODE_OPTIONS,
    },
    {
      name: "brRoundingValue",
      label: "Rounding Value",
      inputMode: "decimal",
      validation: {
        custom: (value) => {
          const normalizedValue = value.trim();
          if (!normalizedValue) {
            return null;
          }
          return Number.isFinite(Number(normalizedValue))
            ? null
            : "Rounding Value must be a valid number.";
        },
      },
    },
    {
      name: "brBillGreeting",
      label: "Bill Greeting",
      validation: {
        maxLength: 300,
        maxLengthMessage: "Bill Greeting must be at most 300 characters.",
      },
    },
    {
      name: "brTerms",
      label: "Terms",
    },
    {
      name: "brDefaultGodownId",
      label: "Default Godown Id",
      type: "select",
      searchable: true,
      serverSearch: true,
      options: godownOptions,
      placeholder: "Search godown",
      onSearchOpenChange: godownHandlers.onSearchOpenChange,
      onSearchQueryChange: godownHandlers.onSearchQueryChange,
      onValueChange: godownHandlers.onValueChange,
    },
    {
      name: "brBankId",
      label: "Bank Id",
      type: "select",
      searchable: true,
      options: ledgerOptions,
      placeholder: "Search ledger",
    },    
    {
      name: "__heading_compliance",
      label: "Compliance & Licenses",
      type: "heading",
      defaultExpanded: false,
    },
    {
      name: "brGstinNo",
      label: "GSTIN No",
      validation: {
        maxLength: 15,
        maxLengthMessage: "GSTIN No must be at most 15 characters.",
      },
    },
    {
      name: "brGstRegType",
      label: "GST Registration Type",
      validation: {
        maxLength: 30,
        maxLengthMessage: "GST Registration Type must be at most 30 characters.",
      },
    },
    {
      name: "brPanNo",
      label: "PAN No",
      validation: {
        maxLength: 10,
        maxLengthMessage: "PAN No must be at most 10 characters.",
      },
    },
    {
      name: "brFssaiNo",
      label: "FSSAI No",
      validation: {
        maxLength: 20,
        maxLengthMessage: "FSSAI No must be at most 20 characters.",
      },
    },
    {
      name: "brFssaiLicenseType",
      label: "FSSAI License Type",
      validation: {
        maxLength: 20,
        maxLengthMessage: "FSSAI License Type must be at most 20 characters.",
      },
    },
    {
      name: "brFssaiValidUpto",
      label: "FSSAI Valid Upto",
      type: "date",
    },
    {
      name: "__heading_status",
      label: "Status",
      type: "heading",
      defaultExpanded: false,
    },
    {
      name: "brAllowNegativeStock",
      label: "Allow Negative Stock",
      type: "checkbox",
      fieldStyle: STATUS_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "brSmsApplicable",
      label: "SMS Applicable",
      type: "checkbox",
      fieldStyle: STATUS_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "brIsDefault",
      label: "Default Branch",
      type: "checkbox",
      fieldStyle: STATUS_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "brIsActive",
      label: "Active",
      type: "checkbox",
      fieldStyle: STATUS_CHECKBOX_FIELD_STYLE,
    },
  ];
}
function toSnakeCaseKey(value: string): string {
  return value.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}
function getBranchFieldValue(
  source: Record<string, unknown>,
  fieldName: string,
): unknown {
  return getFirstDefinedValue(source, [fieldName, toSnakeCaseKey(fieldName)]);
}
function mapBranchFormValues(
  source: Record<string, unknown> | null,
  defaults: Record<string, string>,
  stateNameByCode: Record<string, string>,
): Record<string, string> {
  const rowSource = source ?? {};
  const mergedDefaults: Record<string, string> = {
    ...BRANCH_INITIAL_FORM_VALUES,
    ...defaults,
  };
  const values: Record<string, string> = { ...mergedDefaults };
  for (const fieldName of BRANCH_STANDARD_FIELD_NAMES) {
    const resolvedValue = toDisplayValue(getBranchFieldValue(rowSource, fieldName));
    values[fieldName] = resolvedValue || mergedDefaults[fieldName] || "";
  }
  for (const fieldName of BRANCH_DATE_FIELD_NAMES) {
    const resolvedValue = toDateInputValue(getBranchFieldValue(rowSource, fieldName));
    values[fieldName] = resolvedValue || mergedDefaults[fieldName] || "";
  }
  for (const fieldName of BRANCH_BOOLEAN_FIELD_NAMES) {
    const fallback = mergedDefaults[fieldName] === "false" ? "false" : "true";
    values[fieldName] = toSelectBoolean(
      getBranchFieldValue(rowSource, fieldName),
      fallback,
    );
  }
  const existingStateCode = toDisplayValue(
    getBranchFieldValue(rowSource, "brStateCode"),
  ).toUpperCase();
  if (!values.brState && existingStateCode) {
    values.brState = stateNameByCode[existingStateCode] ?? mergedDefaults.brState;
  }
  values.brStateCode = existingStateCode || mergedDefaults.brStateCode || "";
  return values;
}
export default function BranchesMasterPage() {
  // Company/State/Region State/Godown: lazy server-side configured dropdowns. Ledger
  // stays eager. The eager godown list is kept only to resolve the saved godown's name on
  // edit (getById returns no godown name). The state code<->name maps also stay eager.
  const company = useLazyConfiguredDropdown(COMPANY_DROPDOWN_CONFIG);
  const state = useLazyConfiguredDropdown(STATE_DROPDOWN_CONFIG);
  const regionState = useLazyConfiguredDropdown(STATE_DROPDOWN_CONFIG);
  const godown = useLazyConfiguredDropdown(GODOWN_DROPDOWN_CONFIG);
  const { getAll: getAccountLedgerLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getGodownLookup } = useApi<unknown>(GODOWN_LOOKUP_ENDPOINT);
  const { getAll: getStateLookup } = useApi<unknown>(STATE_LOOKUP_ENDPOINT);
  const { options: ledgerOptions } = useMasterOptions({
    definition: ACCOUNT_LEDGER_LOOKUP_DEFINITION,
    load: getAccountLedgerLookup,
  });
  const { options: godownOptions } = useMasterOptions({
    definition: GODOWN_LOOKUP_DEFINITION,
    load: getGodownLookup,
  });
  const filteredLedgerOptions = useMemo(
    () => removeEmptyOptions(ledgerOptions),
    [ledgerOptions],
  );
  // id -> name map for resolving the saved godown's label when seeding the edit form.
  const godownLabelMap = useMemo(
    () => new Map(removeEmptyOptions(godownOptions).map((o) => [o.value, o.label])),
    [godownOptions],
  );
  const [stateCodeByName, setStateCodeByName] = useState<Record<string, string>>({});
  const [stateNameByCode, setStateNameByCode] = useState<Record<string, string>>({});
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const payload = await getStateLookup(STATE_LOOKUP_QUERY);
        if (!mounted) {
          return;
        }
        setStateCodeByName(buildStateCodeByName(payload));
        setStateNameByCode(buildStateNameByCode(payload));
      } catch {
        if (!mounted) {
          return;
        }
        setStateCodeByName({});
        setStateNameByCode({});
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getStateLookup]);
  const branchFormFields = useMemo(
    () =>
      buildBranchFormFields({
        companyOptions: company.options,
        stateOptions: state.options,
        regionStateOptions: regionState.options,
        ledgerOptions: filteredLedgerOptions,
        godownOptions: godown.options,
        companyHandlers: company.handlers,
        stateHandlers: state.handlers,
        regionStateHandlers: regionState.handlers,
        godownHandlers: godown.handlers,
      }),
    [
      company.options,
      company.handlers,
      state.options,
      state.handlers,
      regionState.options,
      regionState.handlers,
      filteredLedgerOptions,
      godown.options,
      godown.handlers,
    ],
  );
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted branches. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 13's stored SQL; keys with no matching token are ignored. `wantdelete` is
  // driven by the "Show deleted records" checkbox beside the list search input.
  const buildListQuery = useCallback(
    ({
      searchTerm,
      currentPage,
      pageSize,
    }: {
      searchTerm: string;
      currentPage: number;
      pageSize: number;
    }): Record<string, string> => ({
      page: String(currentPage),
      limit: String(pageSize),
      ...(searchTerm ? { search: searchTerm } : {}),
      grid_param: JSON.stringify({ wantdelete: wantDelete }),
    }),
    [wantDelete],
  );
  return (
    <CrudMasterPage
      title="Branch"
      iconName="branch_master"
      auditHistory={{ screenName: "Branch Master" }}
      entityLabel="branch"
      entityLabelPlural="branches"
      apiEndpoints={API_ENDPOINTS}
      buildListQuery={buildListQuery}
      toolbarContent={
        <div className={styles.filterCheckGroup}>
          <label className={styles.filterCheckLabel}>
            <input
              type="checkbox"
              checked={wantDelete}
              onChange={(event) => setWantDelete(event.target.checked)}
            />
            Show deleted records
          </label>
        </div>
      }
      gridTableName={GRID_TABLE_NAME}
        listResponseStyleArrayKey=""
        gridDetailId={13}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Branch List"
      createLabel="Add Branch"
      codeColumnHeader="Branch Code"
      nameColumnHeader="Branch Name"
      nameFieldLabel="Branch Name"
      nameFieldPlaceholder="Main Branch"
      formTitle="Branch Form"
      listTitleOverride="Branch List"
      formDescription="Create and update branches with address, billing, inventory, and compliance details."
      customFields={branchFormFields}
      createInitialValues={BRANCH_INITIAL_FORM_VALUES}
      modalPanelStyle={BRANCH_MODAL_PANEL_STYLE}
      modalFormGridColumns={3}
      modalFormDenseGrid={false}
      modalStackLabels={true}
      modalSectionNavigationMode="tabs"
      createModalTitle="Unit Branch Entry"
      editModalTitle="Edit Unit Branch Entry"
      modalHideFieldHelperText
      modalHideFieldErrorText
      modalFocusFirstInvalidFieldOnValidationError
      modalEnableArrowKeyFieldNavigation
      onModalOpenChange={(open, variantKey) => {
        // Clear the lazy dropdowns when the create modal opens so no stale selection
        // from a previously edited branch lingers (they reload on open).
        if (open && variantKey === "master-create") {
          company.seedSelected("", "");
          state.seedSelected("", "");
          regionState.seedSelected("", "");
          godown.seedSelected("", "");
        }
      }}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        // Seed the lazy dropdowns so the triggers show the saved labels on edit/view
        // before each field is opened (and lazily loaded).
        company.seedSelected(
          toDisplayValue(getFirstDefinedValue(rowSource, COMPANY_SOURCE_ID_KEYS)),
          toDisplayValue(getFirstDefinedValue(rowSource, COMPANY_SOURCE_NAME_KEYS)),
        );
        // State field value IS the name. Fall back to deriving it from the saved code.
        const stateName =
          toDisplayValue(getFirstDefinedValue(rowSource, BRANCH_STATE_KEYS)) ||
          stateNameByCode[
            toDisplayValue(getBranchFieldValue(rowSource, "brStateCode")).toUpperCase()
          ] ||
          "";
        state.seedSelected(stateName, stateName);
        const regionStateName = toDisplayValue(
          getFirstDefinedValue(rowSource, BRANCH_REGION_STATE_KEYS),
        );
        regionState.seedSelected(regionStateName, regionStateName);
        // getById returns no godown name, so resolve the label from the eager godown list.
        const godownId = toDisplayValue(getFirstDefinedValue(rowSource, BRANCH_GODOWN_ID_KEYS));
        godown.seedSelected(godownId, godownLabelMap.get(godownId) ?? "");
        return mapBranchFormValues(source, defaults, stateNameByCode);
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const normalizedState = (values.brState ?? "").trim();
        const derivedStateCode =
          stateCodeByName[normalizedState] ??
          (values.brStateCode ?? "").trim().toUpperCase();
        const payload: Record<string, unknown> = {
          compId: (values.compId ?? "").trim(),
          brCode: toNullableString(values.brCode ?? ""),
          brName: (values.brName ?? "").trim(),
          brMailingName: toNullableString(values.brMailingName ?? ""),
          brAlias: toNullableString(values.brAlias ?? ""),
          brShort: toNullableString(values.brShort ?? ""),
          brType: toNullableString(values.brType ?? ""),
          brIsDefault: (values.brIsDefault ?? "false") === "true",
          brIsActive: (values.brIsActive ?? "true") === "true",
          brAddr1: toNullableString(values.brAddr1 ?? ""),
          brAddr2: toNullableString(values.brAddr2 ?? ""),
          brAddr3: toNullableString(values.brAddr3 ?? ""),
          brCity: toNullableString(values.brCity ?? ""),
          brDistrict: toNullableString(values.brDistrict ?? ""),
          brState: toNullableString(values.brState ?? ""),
          brStateCode: toUpper(derivedStateCode),
          brPin: toNullableInteger(values.brPin ?? ""),
          brCountry: (values.brCountry ?? "").trim() || "India",
          brLandmark: toNullableString(values.brLandmark ?? ""),
          brRegionAddr1: toNullableString(values.brRegionAddr1 ?? ""),
          brRegionAddr2: toNullableString(values.brRegionAddr2 ?? ""),
          brRegionAddr3: toNullableString(values.brRegionAddr3 ?? ""),
          brRegionCity: toNullableString(values.brRegionCity ?? ""),
          brRegionDistrict: toNullableString(values.brRegionDistrict ?? ""),
          brRegionState: toNullableString(values.brRegionState ?? ""),
          brRegionCountry: (values.brRegionCountry ?? "").trim() || "India",
          brRegionName: toNullableString(values.brRegionName ?? ""),
          brContactPerson: toNullableString(values.brContactPerson ?? ""),
          brTel: toNullableString(values.brTel ?? ""),
          brPhone: toNullableString(values.brPhone ?? ""),
          brMail: toNullableString(values.brMail ?? ""),
          brBillPrefix: toNullableString(values.brBillPrefix ?? ""),
          brInvoiceSeriesPrefix: toNullableString(
            values.brInvoiceSeriesPrefix ?? "",
          ),
          brBillGreeting: toNullableString(values.brBillGreeting ?? ""),
          brTerms: toNullableString(values.brTerms ?? ""),
          brRoundingMode: toNullableString(values.brRoundingMode ?? ""),
          brRoundingValue: toNullableNumber(values.brRoundingValue ?? ""),
          brDefaultGodownId: toNullableString(values.brDefaultGodownId ?? ""),
          brPosType: toNullableString(values.brPosType ?? ""),
          brAllowNegativeStock:
            (values.brAllowNegativeStock ?? "false") === "true",
          brSmsApplicable: (values.brSmsApplicable ?? "false") === "true",
          brBankId: toNullableString(values.brBankId ?? ""),
          brFssaiNo: toNullableString(values.brFssaiNo ?? ""),
          brFssaiLicenseType: toNullableString(values.brFssaiLicenseType ?? ""),
          brFssaiValidUpto: toNullableDate(values.brFssaiValidUpto ?? ""),
          brGstinNo: toUpperNullable(values.brGstinNo ?? ""),
          brGstRegType: toNullableString(values.brGstRegType ?? ""),
          brPanNo: toUpperNullable(values.brPanNo ?? ""),
        };
        if (shouldUpdate && editingItemId !== null) {
          payload.brId = toUpdateId(editingItemId);
        }
        return payload;
      }}
    />
  );
}
