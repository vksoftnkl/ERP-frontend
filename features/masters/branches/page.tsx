"use client";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useMasterOptions } from "@/features/masters/shared";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  extractRows,
  getFirstDefinedValue,
  toDateInputValue,
  toDisplayValue,
  toNullableDate,
  toNullableNumber,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
  toUpper,
} from "@/app/master/_shared/crud-utils";
const API_ENDPOINTS = {
  list: "/branch-masters/list",
  getById: "/branch-masters/get",
  create: "/branch-masters/create",
  delete: "/branch-masters/delete",
} as const;
const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const GODOWN_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const STATE_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const LOOKUP_QUERY_COMPANIES = {
  module: "companies",
  limit: "100",
} as const;
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
const COMPANY_LOOKUP_DEFINITION = {
  query: LOOKUP_QUERY_COMPANIES,
  defaultOption: DEFAULT_COMPANY_OPTION,
  idKeys: ["id", "value"],
  labelKeys: ["name", "label"],
} as const;
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
} as const;
function removeEmptyOptions(
  options: ERPDynamicSelectOption[],
): ERPDynamicSelectOption[] {
  return options.filter((option) => option.value.trim().length > 0);
}
function buildStateNameOptions(payload: unknown): ERPDynamicSelectOption[] {
  const rows = extractRows(payload, STATE_LOOKUP_ARRAY_KEYS);
  const seenNames = new Set<string>();
  const options: ERPDynamicSelectOption[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const stateName = toDisplayValue(
      getFirstDefinedValue(source, STATE_LOOKUP_NAME_KEYS),
    );
    if (!stateName || seenNames.has(stateName)) {
      continue;
    }
    seenNames.add(stateName);
    options.push({
      value: stateName,
      label: stateName,
    });
  }
  options.sort((left, right) => left.label.localeCompare(right.label));
  return removeEmptyOptions(options);
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
function buildBranchFormFields(
  companyOptions: ERPDynamicSelectOption[],
  stateOptions: ERPDynamicSelectOption[],
  ledgerOptions: ERPDynamicSelectOption[],
  godownOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
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
      required: true,
      options: companyOptions,
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
      required: true,
      options: stateOptions,
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
      options: stateOptions,
    },
    {
      name: "brRegionAddr3",
      label: "Region Address 3",
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
      options: godownOptions,
      placeholder: "Search godown",
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
  const { getAll: getCompanyLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getAccountLedgerLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getGodownLookup } = useApi<unknown>(GODOWN_LOOKUP_ENDPOINT);
  const { getAll: getStateLookup } = useApi<unknown>(STATE_LOOKUP_ENDPOINT);
  const { options: companyOptions } = useMasterOptions({
    definition: COMPANY_LOOKUP_DEFINITION,
    load: getCompanyLookup,
  });
  const { options: ledgerOptions } = useMasterOptions({
    definition: ACCOUNT_LEDGER_LOOKUP_DEFINITION,
    load: getAccountLedgerLookup,
  });
  const { options: godownOptions } = useMasterOptions({
    definition: GODOWN_LOOKUP_DEFINITION,
    load: getGodownLookup,
  });
  const filteredCompanyOptions = useMemo(
    () => removeEmptyOptions(companyOptions),
    [companyOptions],
  );
  const filteredLedgerOptions = useMemo(
    () => removeEmptyOptions(ledgerOptions),
    [ledgerOptions],
  );
  const filteredGodownOptions = useMemo(
    () => removeEmptyOptions(godownOptions),
    [godownOptions],
  );
  const [stateOptions, setStateOptions] = useState<ERPDynamicSelectOption[]>([]);
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
        setStateOptions(buildStateNameOptions(payload));
        setStateCodeByName(buildStateCodeByName(payload));
        setStateNameByCode(buildStateNameByCode(payload));
      } catch {
        if (!mounted) {
          return;
        }
        setStateOptions([]);
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
      buildBranchFormFields(
        filteredCompanyOptions,
        stateOptions,
        filteredLedgerOptions,
        filteredGodownOptions,
      ),
    [
      filteredCompanyOptions,
      stateOptions,
      filteredLedgerOptions,
      filteredGodownOptions,
    ],
  );
  return (
    <CrudMasterPage
      title="Branch"
      auditHistory={{ screenName: "Branch Master" }}
      entityLabel="branch"
      entityLabelPlural="branches"
      apiEndpoints={API_ENDPOINTS}
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
      formDescription="Create and update branches with address, billing, inventory, and compliance details."
      customFields={branchFormFields}
      createInitialValues={BRANCH_INITIAL_FORM_VALUES}
      modalPanelStyle={BRANCH_MODAL_PANEL_STYLE}
      modalFormGridColumns={3}
      modalFormDenseGrid={false}
      modalStackLabels={true}
      modalSectionNavigationMode="tabs"
      modalHideFieldHelperText
      modalHideFieldErrorText
      modalFocusFirstInvalidFieldOnValidationError
      modalEnableArrowKeyFieldNavigation
      mapFormValues={({ source, defaults }) =>
        mapBranchFormValues(source, defaults, stateNameByCode)
      }
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
          brPin: toNullableString(values.brPin ?? ""),
          brCountry: (values.brCountry ?? "").trim() || "India",
          brLandmark: toNullableString(values.brLandmark ?? ""),
          brRegionAddr1: toNullableString(values.brRegionAddr1 ?? ""),
          brRegionAddr2: toNullableString(values.brRegionAddr2 ?? ""),
          brRegionAddr3: toNullableString(values.brRegionAddr3 ?? ""),
          brRegionCity: toNullableString(values.brRegionCity ?? ""),
          brRegionDistrict: toNullableString(values.brRegionDistrict ?? ""),
          brRegionState: toNullableString(values.brRegionState ?? ""),
          brRegionCountry: (values.brRegionCountry ?? "").trim() || "India",
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
        };
        if (shouldUpdate && editingItemId !== null) {
          payload.brId = toUpdateId(editingItemId);
        }
        return payload;
      }}
    />
  );
}
