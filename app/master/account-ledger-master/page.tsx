"use client";

import { useEffect, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import styles from "./page.module.scss";

const API_ENDPOINTS = {
  list: "/account-ledger-masters/list",
  getById: "/account-ledger-masters/get",
  create: "/account-ledger-masters/create",
  delete: "/account-ledger-masters/delete",
} as const;

const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";

const LOOKUP_QUERY_COMPANIES = {
  module: "companies",
  limit: "100",
} as const;

const LOOKUP_QUERY_BRANCHES = {
  module: "branches",
  limit: "100",
} as const;

const LOOKUP_QUERY_ACCOUNT_GROUPS = {
  module: "accountGroups",
  limit: "100",
} as const;

const LOOKUP_KEYS = {
  id: ["ledId", "led_id", "id", "_id"],
  code: ["ledAlias", "led_alias", "ledShort", "led_short", "code"],
  name: ["ledName", "led_name", "name"],
  short: ["ledShort", "led_short", "short", "short_name", "shortName"],
  alias: ["ledAlias", "led_alias", "alias"],
  active: ["ledIsActive", "led_is_active", "isActive", "is_active", "status"],
  position: ["position", "sort", "ledSort", "led_sort"],
  description: ["ledRemarks", "led_remarks", "description", "desc"],
  array: ["data", "items", "results", "rows", "list", "accountLedgers", "account_ledgers"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "ledId",
  name: "ledName",
  alias: "ledAlias",
  short: "ledShort",
  description: "ledRemarks",
  sort: "ledSort",
} as const;

const LOOKUP_ARRAY_KEYS = ["items", "data", "results", "rows", "list"] as const;

const DEFAULT_SELECT_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};

const BOOLEAN_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Yes", value: "true" },
  { label: "No", value: "false" },
];

const STATUS_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Active", value: "true" },
  { label: "Inactive", value: "false" },
];

const OB_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Dr", value: "DR" },
  { label: "Cr", value: "CR" },
];

const GST_PARTY_REG_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Regular", value: "REGULAR" },
  { label: "Composition", value: "COMPOSITION" },
  { label: "Unregistered", value: "UNREGISTERED" },
];

const LEDGER_INITIAL_FORM_VALUES = {
  masterName: "",
  masterAlias: "",
  masterShortName: "",
  ledCompanyId: "",
  ledBranchId: "",
  ledGroupId: "",
  ledTallyName: "",
  ledTallyGroupName: "",
  ledTallyGuid: "",
  ledCategory: "GENERAL",
  ledIsBillByBill: "false",
  ledIsCostCenterReq: "false",
  ledIsInterestApplicable: "false",
  ledInterestRate: "0",
  ledContactPerson: "",
  ledEmail: "",
  ledTel: "",
  ledPhone1: "",
  ledPhone2: "",
  ledWhatsappNo: "",
  ledAddr1: "",
  ledAddr2: "",
  ledAddr3: "",
  ledCity: "",
  ledDistrict: "",
  ledStateName: "",
  ledStateCode: "",
  ledPin: "",
  ledCountry: "",
  ledRegionName: "",
  ledRegionAddr1: "",
  ledRegionAddr2: "",
  ledRegionAddr3: "",
  ledRegionCity: "",
  ledRegionDistrict: "",
  ledRegionStateName: "",
  ledRegionCountry: "",
  ledGstPartyRegType: "REGULAR",
  ledGstinNo: "",
  ledPanNo: "",
  ledAadharNo: "",
  ledEcommerceGstin: "",
  ledIsSez: "false",
  ledChequeName: "",
  ledBankName: "",
  ledBankBranch: "",
  ledBankAcNo: "",
  ledBankIfsc: "",
  ledUpiId: "",
  ledObAmount: "0",
  ledObType: "DR",
  ledObAsOn: "",
  ledTotalDr: "0",
  ledTotalCr: "0",
  ledTotalBalance: "0",
  ledIsActive: "true",
  ledAllowEdit: "false",
  ledIsEntry: "false",
  ledAllowSms: "false",
  masterDescription: "",
} as const;

function buildLedgerFormFields(
  companyOptions: ERPDynamicSelectOption[],
  branchOptions: ERPDynamicSelectOption[],
  accountGroupOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "__heading_core",
      label: "Primary Details",
      type: "heading",
      helperText: "Main identifiers and required account references.",
    },
    {
      name: "masterName",
      label: "Ledger Name",
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Ledger Name must be at least 2 characters.",
      },
    },
    {
      name: "masterAlias",
      label: "Ledger Alias",
    },
    {
      name: "masterShortName",
      label: "Ledger Short",
    },
    {
      name: "ledCompanyId",
      label: "Company",
      type: "select",
      searchable: true,
      required: true,
      options: companyOptions,
    },
    {
      name: "ledBranchId",
      label: "Branch",
      type: "select",
      searchable: true,
      required: true,
      options: branchOptions,
    },
    {
      name: "ledGroupId",
      label: "Account Group",
      type: "select",
      searchable: true,
      required: true,
      options: accountGroupOptions,
    },
   
    {
      name: "__heading_behavior",
      label: "Classification & Behavior",
      type: "heading",
      helperText: "Category and accounting behavior flags.",
    },
    {
      name: "ledCategory",
      label: "Category",
      placeholder: "GENERAL",
    },
    {
      name: "ledIsBillByBill",
      label: "Bill By Bill",
      type: "select",
      options: BOOLEAN_OPTIONS,
    },
    {
      name: "ledIsCostCenterReq",
      label: "Cost Center Required",
      type: "select",
      options: BOOLEAN_OPTIONS,
    },
    {
      name: "ledIsInterestApplicable",
      label: "Interest Applicable",
      type: "select",
      options: BOOLEAN_OPTIONS,
    },
    {
      name: "ledInterestRate",
      label: "Interest Rate",
      type: "number",
      step: "0.01",
      min: 0,
    },
    {
      name: "__heading_contact",
      label: "Contact & Mailing Address",
      type: "heading",
    },
    {
      name: "ledContactPerson",
      label: "Contact Person",
    },
    {
      name: "ledEmail",
      label: "Email",
      type: "email",
    },
    {
      name: "ledTel",
      label: "Tel",
      type: "tel",
    },
    {
      name: "ledPhone1",
      label: "Phone 1",
      type: "tel",
    },
    {
      name: "ledPhone2",
      label: "Phone 2",
      type: "tel",
    },
    {
      name: "ledWhatsappNo",
      label: "Whatsapp No",
      type: "tel",
    },
    {
      name: "ledAddr1",
      label: "Address 1",
    },
    {
      name: "ledAddr2",
      label: "Address 2",
    },
    {
      name: "ledAddr3",
      label: "Address 3",
    },
    {
      name: "ledCity",
      label: "City",
    },
    {
      name: "ledDistrict",
      label: "District",
    },
    {
      name: "ledStateName",
      label: "State Name",
    },
    {
      name: "ledStateCode",
      label: "State Code",
    },
    {
      name: "ledPin",
      label: "PIN",
    },
    {
      name: "ledCountry",
      label: "Country",
    },
    {
      name: "__heading_region",
      label: "Regional Address",
      type: "heading",
    },
    {
      name: "ledRegionName",
      label: "Region Name",
    },
    {
      name: "ledRegionAddr1",
      label: "Region Address 1",
    },
    {
      name: "ledRegionAddr2",
      label: "Region Address 2",
    },
    {
      name: "ledRegionAddr3",
      label: "Region Address 3",
    },
    {
      name: "ledRegionCity",
      label: "Region City",
    },
    {
      name: "ledRegionDistrict",
      label: "Region District",
    },
    {
      name: "ledRegionStateName",
      label: "Region State Name",
    },
    {
      name: "ledRegionCountry",
      label: "Region Country",
    },
    {
      name: "__heading_statutory",
      label: "GST & Statutory",
      type: "heading",
    },
    {
      name: "ledGstPartyRegType",
      label: "GST Party Reg Type",
      type: "select",
      options: GST_PARTY_REG_TYPE_OPTIONS,
    },
    {
      name: "ledGstinNo",
      label: "GSTIN",
    },
    {
      name: "ledPanNo",
      label: "PAN",
    },
    {
      name: "ledAadharNo",
      label: "Aadhar No",
    },
    {
      name: "ledEcommerceGstin",
      label: "Ecommerce GSTIN",
    },
    {
      name: "ledIsSez",
      label: "Is SEZ",
      type: "select",
      options: BOOLEAN_OPTIONS,
    },
    {
      name: "__heading_bank",
      label: "Bank & Payment",
      type: "heading",
    },
    {
      name: "ledChequeName",
      label: "Cheque Name",
    },
    {
      name: "ledBankName",
      label: "Bank Name",
    },
    {
      name: "ledBankBranch",
      label: "Bank Branch",
    },
    {
      name: "ledBankAcNo",
      label: "Bank A/C No",
    },
    {
      name: "ledBankIfsc",
      label: "Bank IFSC",
    },
    {
      name: "ledUpiId",
      label: "UPI ID",
    },
    {
      name: "__heading_opening",
      label: "Opening & Running Balance",
      type: "heading",
    },
    {
      name: "ledObAmount",
      label: "Opening Amount",
      type: "number",
      step: "0.01",
      min: 0,
    },
    {
      name: "ledObType",
      label: "Opening Type",
      type: "select",
      options: OB_TYPE_OPTIONS,
    },
    {
      name: "ledObAsOn",
      label: "Opening As On",
      type: "date",
    },
    {
      name: "ledTotalDr",
      label: "Total DR",
      type: "number",
      step: "0.01",
    },
    {
      name: "ledTotalCr",
      label: "Total CR",
      type: "number",
      step: "0.01",
    },
    {
      name: "ledTotalBalance",
      label: "Total Balance",
      type: "number",
      step: "0.01",
    },
    {
      name: "__heading_control",
      label: "Status & Controls",
      type: "heading",
    },
    {
      name: "ledIsActive",
      label: "Is Active",
      type: "select",
      options: STATUS_OPTIONS,
    },
    {
      name: "ledAllowEdit",
      label: "Allow Edit",
      type: "select",
      options: BOOLEAN_OPTIONS,
    },
    {
      name: "ledIsEntry",
      label: "Is Entry",
      type: "select",
      options: BOOLEAN_OPTIONS,
    },
    {
      name: "ledAllowSms",
      label: "Allow SMS",
      type: "select",
      options: BOOLEAN_OPTIONS,
    },
    {
      name: "masterDescription",
      label: "Remarks",
      type: "textarea",
      colSpan: 2,
    },
  ];
}

function getFirstDefinedValue(
  source: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

function toDisplayValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "object") {
    const nested = value as Record<string, unknown>;
    const fallback = nested.value ?? nested.id ?? nested.code ?? nested.name ?? nested.label;

    if (
      typeof fallback === "string" ||
      typeof fallback === "number" ||
      typeof fallback === "bigint" ||
      typeof fallback === "boolean"
    ) {
      return String(fallback);
    }
  }

  return "";
}

function toSnakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function getFieldValue(source: Record<string, unknown>, fieldName: string): unknown {
  return getFirstDefinedValue(source, [fieldName, toSnakeCase(fieldName)]);
}

function toSelectBoolean(value: unknown, defaultValue: "true" | "false"): "true" | "false" {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  const normalized = toDisplayValue(value).toLowerCase();
  if (["1", "true", "yes", "active"].includes(normalized)) {
    return "true";
  }

  if (["0", "false", "no", "inactive"].includes(normalized)) {
    return "false";
  }

  return defaultValue;
}

function toNumber(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableString(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function toUpperNullable(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized.toUpperCase() : null;
}

function toNullableDate(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function toDateInputValue(value: unknown): string {
  const normalized = toDisplayValue(value);
  if (!normalized) {
    return "";
  }

  const matched = normalized.match(/^\d{4}-\d{2}-\d{2}/);
  return matched ? matched[0] : normalized;
}

function normalizeGstPartyRegType(value: string): "REGULAR" | "COMPOSITION" | "UNREGISTERED" | null {
  const normalized = value.trim().toUpperCase();
  if (normalized === "REGULAR" || normalized === "COMPOSITION" || normalized === "UNREGISTERED") {
    return normalized;
  }

  return null;
}

function normalizeObType(value: string): "DR" | "CR" {
  return value.trim().toUpperCase() === "CR" ? "CR" : "DR";
}

function extractRows(payload: unknown, arrayKeys: readonly string[]): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const objectPayload = payload as Record<string, unknown>;

  for (const key of arrayKeys) {
    const value = objectPayload[key];
    if (Array.isArray(value)) {
      return value;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nestedObject = value as Record<string, unknown>;
      for (const nestedKey of arrayKeys) {
        const nestedValue = nestedObject[nestedKey];
        if (Array.isArray(nestedValue)) {
          return nestedValue;
        }
      }
    }
  }

  const firstArray = Object.values(objectPayload).find((value) => Array.isArray(value));
  return Array.isArray(firstArray) ? firstArray : [];
}

function buildLookupOptions(payload: unknown, includeEmptyOption = false): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, LOOKUP_ARRAY_KEYS);

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }

    const source = row as Record<string, unknown>;
    const id = toDisplayValue(getFirstDefinedValue(source, ["id", "value"]));
    if (!id) {
      continue;
    }

    const name = toDisplayValue(getFirstDefinedValue(source, ["name", "label"]));
    const label = name || id;

    if (!optionMap.has(id)) {
      optionMap.set(id, label);
    }
  }

  const options = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));

  if (!includeEmptyOption) {
    return options;
  }

  return [DEFAULT_SELECT_OPTION, ...options];
}

export default function AccountLedgerMasterPage() {
  const { getAll: getCompanyLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getBranchLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getAccountGroupLookup } = useApi<unknown>(LOOKUP_ENDPOINT);

  const [companyOptions, setCompanyOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_SELECT_OPTION,
  ]);
  const [branchOptions, setBranchOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_SELECT_OPTION,
  ]);
  const [accountGroupOptions, setAccountGroupOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_SELECT_OPTION,
  ]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const [companiesPayload, branchesPayload, accountGroupsPayload] = await Promise.all([
          getCompanyLookup(LOOKUP_QUERY_COMPANIES),
          getBranchLookup(LOOKUP_QUERY_BRANCHES),
          getAccountGroupLookup(LOOKUP_QUERY_ACCOUNT_GROUPS),
        ]);

        if (!mounted) {
          return;
        }

        setCompanyOptions(buildLookupOptions(companiesPayload, true));
        setBranchOptions(buildLookupOptions(branchesPayload, true));
        setAccountGroupOptions(buildLookupOptions(accountGroupsPayload, true));
      } catch {
        if (!mounted) {
          return;
        }

        setCompanyOptions([DEFAULT_SELECT_OPTION]);
        setBranchOptions([DEFAULT_SELECT_OPTION]);
        setAccountGroupOptions([DEFAULT_SELECT_OPTION]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [getAccountGroupLookup, getBranchLookup, getCompanyLookup]);

  const ledgerFormFields = useMemo(
    () => buildLedgerFormFields(companyOptions, branchOptions, accountGroupOptions),
    [accountGroupOptions, branchOptions, companyOptions],
  );

  return (
    <CrudMasterPage
      title="Account Ledger"
      entityLabel="account ledger"
      entityLabelPlural="account ledgers"
      apiEndpoints={API_ENDPOINTS}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Account Ledger List"
      createLabel="Add Account Ledger"
      codeColumnHeader="Ledger Code"
      nameColumnHeader="Ledger Name"
      nameFieldLabel="Ledger Name"
      nameFieldPlaceholder="ABC Traders"
      formTitle="Account Ledger Form"
      formDescription="Create and update account ledgers."
      customFields={ledgerFormFields}
      createInitialValues={LEDGER_INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mergedDefaults = { ...LEDGER_INITIAL_FORM_VALUES, ...defaults };
        const gstPartyType = normalizeGstPartyRegType(
          toDisplayValue(getFieldValue(rowSource, "ledGstPartyRegType")),
        );

        return {
          ...LEDGER_INITIAL_FORM_VALUES,
          masterName: toDisplayValue(getFieldValue(rowSource, "ledName")) || mergedDefaults.masterName,
          masterAlias:
            toDisplayValue(getFieldValue(rowSource, "ledAlias")) || mergedDefaults.masterAlias,
          masterShortName:
            toDisplayValue(getFieldValue(rowSource, "ledShort")) || mergedDefaults.masterShortName,
          ledCompanyId:
            toDisplayValue(getFieldValue(rowSource, "ledCompanyId")) || mergedDefaults.ledCompanyId,
          ledBranchId: toDisplayValue(getFieldValue(rowSource, "ledBranchId")) || mergedDefaults.ledBranchId,
          ledGroupId: toDisplayValue(getFieldValue(rowSource, "ledGroupId")) || mergedDefaults.ledGroupId,
          ledTallyName: toDisplayValue(getFieldValue(rowSource, "ledTallyName")),
          ledTallyGroupName: toDisplayValue(getFieldValue(rowSource, "ledTallyGroupName")),
          ledTallyGuid: toDisplayValue(getFieldValue(rowSource, "ledTallyGuid")),
          ledCategory:
            toDisplayValue(getFieldValue(rowSource, "ledCategory")) || mergedDefaults.ledCategory,
          ledIsBillByBill: toSelectBoolean(getFieldValue(rowSource, "ledIsBillByBill"), "false"),
          ledIsCostCenterReq: toSelectBoolean(
            getFieldValue(rowSource, "ledIsCostCenterReq"),
            "false",
          ),
          ledIsInterestApplicable: toSelectBoolean(
            getFieldValue(rowSource, "ledIsInterestApplicable"),
            "false",
          ),
          ledInterestRate:
            toDisplayValue(getFieldValue(rowSource, "ledInterestRate")) || mergedDefaults.ledInterestRate,
          ledContactPerson: toDisplayValue(getFieldValue(rowSource, "ledContactPerson")),
          ledEmail: toDisplayValue(getFieldValue(rowSource, "ledEmail")),
          ledTel: toDisplayValue(getFieldValue(rowSource, "ledTel")),
          ledPhone1: toDisplayValue(getFieldValue(rowSource, "ledPhone1")),
          ledPhone2: toDisplayValue(getFieldValue(rowSource, "ledPhone2")),
          ledWhatsappNo: toDisplayValue(getFieldValue(rowSource, "ledWhatsappNo")),
          ledAddr1: toDisplayValue(getFieldValue(rowSource, "ledAddr1")),
          ledAddr2: toDisplayValue(getFieldValue(rowSource, "ledAddr2")),
          ledAddr3: toDisplayValue(getFieldValue(rowSource, "ledAddr3")),
          ledCity: toDisplayValue(getFieldValue(rowSource, "ledCity")),
          ledDistrict: toDisplayValue(getFieldValue(rowSource, "ledDistrict")),
          ledStateName: toDisplayValue(getFieldValue(rowSource, "ledStateName")),
          ledStateCode: toDisplayValue(getFieldValue(rowSource, "ledStateCode")),
          ledPin: toDisplayValue(getFieldValue(rowSource, "ledPin")),
          ledCountry: toDisplayValue(getFieldValue(rowSource, "ledCountry")),
          ledRegionName: toDisplayValue(getFieldValue(rowSource, "ledRegionName")),
          ledRegionAddr1: toDisplayValue(getFieldValue(rowSource, "ledRegionAddr1")),
          ledRegionAddr2: toDisplayValue(getFieldValue(rowSource, "ledRegionAddr2")),
          ledRegionAddr3: toDisplayValue(getFieldValue(rowSource, "ledRegionAddr3")),
          ledRegionCity: toDisplayValue(getFieldValue(rowSource, "ledRegionCity")),
          ledRegionDistrict: toDisplayValue(getFieldValue(rowSource, "ledRegionDistrict")),
          ledRegionStateName: toDisplayValue(getFieldValue(rowSource, "ledRegionStateName")),
          ledRegionCountry: toDisplayValue(getFieldValue(rowSource, "ledRegionCountry")),
          ledGstPartyRegType: gstPartyType ?? "REGULAR",
          ledGstinNo: toDisplayValue(getFieldValue(rowSource, "ledGstinNo")),
          ledPanNo: toDisplayValue(getFieldValue(rowSource, "ledPanNo")),
          ledAadharNo: toDisplayValue(getFieldValue(rowSource, "ledAadharNo")),
          ledEcommerceGstin: toDisplayValue(getFieldValue(rowSource, "ledEcommerceGstin")),
          ledIsSez: toSelectBoolean(getFieldValue(rowSource, "ledIsSez"), "false"),
          ledChequeName: toDisplayValue(getFieldValue(rowSource, "ledChequeName")),
          ledBankName: toDisplayValue(getFieldValue(rowSource, "ledBankName")),
          ledBankBranch: toDisplayValue(getFieldValue(rowSource, "ledBankBranch")),
          ledBankAcNo: toDisplayValue(getFieldValue(rowSource, "ledBankAcNo")),
          ledBankIfsc: toDisplayValue(getFieldValue(rowSource, "ledBankIfsc")),
          ledUpiId: toDisplayValue(getFieldValue(rowSource, "ledUpiId")),
          ledObAmount:
            toDisplayValue(getFieldValue(rowSource, "ledObAmount")) || mergedDefaults.ledObAmount,
          ledObType: normalizeObType(toDisplayValue(getFieldValue(rowSource, "ledObType"))),
          ledObAsOn: toDateInputValue(getFieldValue(rowSource, "ledObAsOn")),
          ledTotalDr:
            toDisplayValue(getFieldValue(rowSource, "ledTotalDr")) || mergedDefaults.ledTotalDr,
          ledTotalCr:
            toDisplayValue(getFieldValue(rowSource, "ledTotalCr")) || mergedDefaults.ledTotalCr,
          ledTotalBalance:
            toDisplayValue(getFieldValue(rowSource, "ledTotalBalance")) || mergedDefaults.ledTotalBalance,
          ledIsActive: toSelectBoolean(getFieldValue(rowSource, "ledIsActive"), "true"),
          ledAllowEdit: toSelectBoolean(getFieldValue(rowSource, "ledAllowEdit"), "false"),
          ledIsEntry: toSelectBoolean(getFieldValue(rowSource, "ledIsEntry"), "false"),
          ledAllowSms: toSelectBoolean(getFieldValue(rowSource, "ledAllowSms"), "false"),
          masterDescription:
            toDisplayValue(getFieldValue(rowSource, "ledRemarks")) || mergedDefaults.masterDescription,
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          ledCompanyId: (values.ledCompanyId ?? "").trim(),
          ledBranchId: (values.ledBranchId ?? "").trim(),
          ledGroupId: (values.ledGroupId ?? "").trim(),
          ledName: (values.masterName ?? "").trim(),
          ledAlias: toNullableString(values.masterAlias ?? ""),
          ledShort: toNullableString(values.masterShortName ?? ""),
          ledTallyName: toNullableString(values.ledTallyName ?? ""),
          ledTallyGroupName: toNullableString(values.ledTallyGroupName ?? ""),
          ledTallyGuid: toNullableString(values.ledTallyGuid ?? ""),
          ledCategory: (values.ledCategory ?? "").trim() || "GENERAL",
          ledIsBillByBill: (values.ledIsBillByBill ?? "false") === "true",
          ledIsCostCenterReq: (values.ledIsCostCenterReq ?? "false") === "true",
          ledIsInterestApplicable: (values.ledIsInterestApplicable ?? "false") === "true",
          ledInterestRate: Math.max(0, toNumber(values.ledInterestRate ?? "0", 0)),
          ledContactPerson: toNullableString(values.ledContactPerson ?? ""),
          ledEmail: toNullableString(values.ledEmail ?? ""),
          ledTel: toNullableString(values.ledTel ?? ""),
          ledPhone1: toNullableString(values.ledPhone1 ?? ""),
          ledPhone2: toNullableString(values.ledPhone2 ?? ""),
          ledWhatsappNo: toNullableString(values.ledWhatsappNo ?? ""),
          ledAddr1: toNullableString(values.ledAddr1 ?? ""),
          ledAddr2: toNullableString(values.ledAddr2 ?? ""),
          ledAddr3: toNullableString(values.ledAddr3 ?? ""),
          ledCity: toNullableString(values.ledCity ?? ""),
          ledDistrict: toNullableString(values.ledDistrict ?? ""),
          ledStateName: toNullableString(values.ledStateName ?? ""),
          ledStateCode: toUpperNullable(values.ledStateCode ?? ""),
          ledPin: toNullableString(values.ledPin ?? ""),
          ledCountry: toNullableString(values.ledCountry ?? ""),
          ledRegionName: toNullableString(values.ledRegionName ?? ""),
          ledRegionAddr1: toNullableString(values.ledRegionAddr1 ?? ""),
          ledRegionAddr2: toNullableString(values.ledRegionAddr2 ?? ""),
          ledRegionAddr3: toNullableString(values.ledRegionAddr3 ?? ""),
          ledRegionCity: toNullableString(values.ledRegionCity ?? ""),
          ledRegionDistrict: toNullableString(values.ledRegionDistrict ?? ""),
          ledRegionStateName: toNullableString(values.ledRegionStateName ?? ""),
          ledRegionCountry: toNullableString(values.ledRegionCountry ?? ""),
          ledGstPartyRegType: normalizeGstPartyRegType(values.ledGstPartyRegType ?? ""),
          ledGstinNo: toUpperNullable(values.ledGstinNo ?? ""),
          ledPanNo: toUpperNullable(values.ledPanNo ?? ""),
          ledAadharNo: toNullableString(values.ledAadharNo ?? ""),
          ledEcommerceGstin: toUpperNullable(values.ledEcommerceGstin ?? ""),
          ledIsSez: (values.ledIsSez ?? "false") === "true",
          ledChequeName: toNullableString(values.ledChequeName ?? ""),
          ledBankName: toNullableString(values.ledBankName ?? ""),
          ledBankBranch: toNullableString(values.ledBankBranch ?? ""),
          ledBankAcNo: toNullableString(values.ledBankAcNo ?? ""),
          ledBankIfsc: toUpperNullable(values.ledBankIfsc ?? ""),
          ledUpiId: toNullableString(values.ledUpiId ?? ""),
          ledObAmount: Math.max(0, toNumber(values.ledObAmount ?? "0", 0)),
          ledObType: normalizeObType(values.ledObType ?? "DR"),
          ledObAsOn: toNullableDate(values.ledObAsOn ?? ""),
          ledTotalDr: toNumber(values.ledTotalDr ?? "0", 0),
          ledTotalCr: toNumber(values.ledTotalCr ?? "0", 0),
          ledTotalBalance: toNumber(values.ledTotalBalance ?? "0", 0),
          ledIsActive: (values.ledIsActive ?? "true") === "true",
          ledAllowEdit: (values.ledAllowEdit ?? "false") === "true",
          ledIsEntry: (values.ledIsEntry ?? "false") === "true",
          ledAllowSms: (values.ledAllowSms ?? "false") === "true",
          ledRemarks: toNullableString(values.masterDescription ?? ""),
        };

        if (shouldUpdate && editingItemId !== null) {
          payload.ledId = String(editingItemId);
        }

        return payload;
      }}
    />
  );
}
