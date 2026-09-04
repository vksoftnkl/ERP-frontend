"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  buildLookupOptions,
  getFirstDefinedValue,
  toDisplayValue,
  toNonNegativeInteger,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
  toUpper,
  DEFAULT_LOOKUP_ARRAY_KEYS,
} from "@/app/master/_shared/crud-utils";
import { useDataRefresh } from "@/lib/data-freshness";
const GRID_DETAIL_ID = 60;
const API_ENDPOINTS = {
  list: `/configured-grid-sql/run?grid_id=${GRID_DETAIL_ID}`,
  getById: "/ledger-shipping-addresses/get",
  create: "/ledger-shipping-addresses/create",
  delete: "/ledger-shipping-addresses/delete",
} as const;
const GRID_TABLE_NAME = "acc_ship_addrs";
const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-masters";
const LOOKUP_QUERY_ACCOUNT_LEDGERS = {
  module: "accountLedgers",
} as const;
const LOOKUP_QUERY_COMPANIES = {
  module: "companies",
} as const;
const LOOKUP_QUERY_BRANCHES = {
  module: "branches",
} as const;
const DEFAULT_COUNTRY_CODE = "IN";
const DEFAULT_ADDR_TYPE = "SHIP_TO";
// Mirrors acc_ship_addrs_gstin_chk enforced in the backend validation layer.
const GSTIN_PATTERN = "^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$";
// Mirrors acc_ship_addrs_state_code_chk (2-digit GST numeric state code).
const STATE_CODE_PATTERN = "^[0-9]{2}$";
const ADDR_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Ship To", value: "SHIP_TO" },
  { label: "Bill To", value: "BILL_TO" },
  { label: "Both", value: "BOTH" },
];
const LOOKUP_KEYS = {
  id: ["saaId", "saa_id", "id", "_id"],
  code: ["saaAddrType", "saa_addr_type", "addrType", "addr_type", "code"],
  name: ["saaTradeName", "saa_trade_name", "tradeName", "trade_name", "name"],
  short: ["saaContactName", "saa_contact_name", "contactName", "contact_name", "short"],
  alias: ["saaPhone", "saa_phone", "phone", "alias"],
  active: ["saaIsActive", "saa_is_active", "isActive", "is_active", "status"],
  position: ["saaSort", "saa_sort", "position", "sort"],
  description: ["saaRemarks", "saa_remarks", "description", "remarks"],
  array: [
    "data",
    "items",
    "results",
    "rows",
    "list",
    "ledgerShippingAddresses",
    "ledger_shipping_addresses",
  ],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "saaId",
  name: "saaTradeName",
  alias: "saaPhone",
  short: "saaContactName",
  description: "saaRemarks",
  sort: "saaSort",
} as const;
const SAA_COMPANY_ID_KEYS = ["saaCompanyId", "saa_company_id", "companyId", "company_id"] as const;
const SAA_BRANCH_ID_KEYS = ["saaBranchId", "saa_branch_id", "branchId", "branch_id"] as const;
const SAA_LEDGER_ID_KEYS = ["saaLedgerId", "saa_ledger_id", "ledgerId", "ledger_id"] as const;
const SAA_ADDR_TYPE_KEYS = ["saaAddrType", "saa_addr_type", "addrType", "addr_type"] as const;
const SAA_CONTACT_NAME_KEYS = ["saaContactName", "saa_contact_name", "contactName", "contact_name"] as const;
const SAA_ADDR1_KEYS = ["saaAddr1", "saa_addr1", "addr1"] as const;
const SAA_ADDR2_KEYS = ["saaAddr2", "saa_addr2", "addr2"] as const;
const SAA_ADDR3_KEYS = ["saaAddr3", "saa_addr3", "addr3"] as const;
const SAA_LOCATION_KEYS = ["saaLocation", "saa_location", "location"] as const;
const SAA_PIN_KEYS = ["saaPin", "saa_pin", "pin"] as const;
const SAA_STATE_CODE_KEYS = ["saaStateCode", "saa_state_code", "stateCode", "state_code"] as const;
const SAA_STATE_NAME_KEYS = ["saaStateName", "saa_state_name", "stateName", "state_name"] as const;
const SAA_COUNTRY_CODE_KEYS = ["saaCountryCode", "saa_country_code", "countryCode", "country_code"] as const;
const SAA_DISTANCE_KEYS = ["saaDistanceKm", "saa_distance_km", "distanceKm", "distance_km"] as const;
const SAA_PHONE_KEYS = ["saaPhone", "saa_phone", "phone"] as const;
const SAA_EMAIL_KEYS = ["saaEmail", "saa_email", "email"] as const;
const SAA_GSTIN_KEYS = ["saaGstin", "saa_gstin", "gstin"] as const;
const SAA_IS_DEFAULT_KEYS = ["saaIsDefault", "saa_is_default", "isDefault", "is_default"] as const;
const SAA_IS_ACTIVE_KEYS = ["saaIsActive", "saa_is_active", "isActive", "is_active", "status"] as const;
const DEFAULT_LEDGER_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Account Ledger",
};
const DEFAULT_COMPANY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
const DEFAULT_BRANCH_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
const INITIAL_FORM_VALUES = {
  masterName: "",
  saaLedgerId: "",
  saaAddrType: DEFAULT_ADDR_TYPE,
  saaCompanyId: "",
  saaBranchId: "",
  saaContactName: "",
  saaAddr1: "",
  saaAddr2: "",
  saaAddr3: "",
  saaLocation: "",
  saaPin: "",
  saaStateCode: "",
  saaStateName: "",
  saaCountryCode: DEFAULT_COUNTRY_CODE,
  saaDistanceKm: "",
  saaPhone: "",
  saaEmail: "",
  saaGstin: "",
  position: "0",
  saaIsDefault: "false",
  saaIsActive: "true",
  masterDescription: "",
} as const;
function toNullableNonNegativeInteger(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.floor(parsed);
}
function buildLedgerShippingAddressFields(
  ledgerOptions: ERPDynamicSelectOption[],
  companyOptions: ERPDynamicSelectOption[],
  branchOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "Trade Name",
      placeholder: "ABC Traders",
      validation: {
        maxLength: 200,
        maxLengthMessage: "Trade Name must be at most 200 characters.",
      },
    },
    {
      name: "saaLedgerId",
      label: "Account Ledger",
      type: "select",
      searchable: true,
      required: true,
      options: ledgerOptions,
      validation: {
        requiredMessage: "Account Ledger is required.",
      },
    },
    {
      name: "saaAddrType",
      label: "Address Type",
      type: "select",
      options: ADDR_TYPE_OPTIONS,
    },
    {
      name: "saaCompanyId",
      label: "Company",
      type: "select",
      searchable: true,
      options: companyOptions,
    },
    {
      name: "saaBranchId",
      label: "Branch",
      type: "select",
      searchable: true,
      options: branchOptions,
    },
    {
      name: "saaContactName",
      label: "Contact Name",
      validation: {
        maxLength: 150,
        maxLengthMessage: "Contact Name must be at most 150 characters.",
      },
    },
    {
      name: "saaAddr1",
      label: "Address Line 1",
      validation: {
        maxLength: 250,
        maxLengthMessage: "Address Line 1 must be at most 250 characters.",
      },
    },
    {
      name: "saaAddr2",
      label: "Address Line 2",
      validation: {
        maxLength: 250,
        maxLengthMessage: "Address Line 2 must be at most 250 characters.",
      },
    },
    {
      name: "saaAddr3",
      label: "Address Line 3",
      validation: {
        maxLength: 250,
        maxLengthMessage: "Address Line 3 must be at most 250 characters.",
      },
    },
    {
      name: "saaLocation",
      label: "Location",
      validation: {
        maxLength: 200,
        maxLengthMessage: "Location must be at most 200 characters.",
      },
    },
    {
      name: "saaPin",
      label: "PIN",
      helperText: "6-digit PIN code (required when Country is IN).",
      validation: {
        maxLength: 10,
        maxLengthMessage: "PIN must be at most 10 characters.",
      },
    },
    {
      name: "saaStateCode",
      label: "State Code",
      placeholder: "33",
      helperText: "2-digit GST state code.",
      validation: {
        pattern: STATE_CODE_PATTERN,
        patternMessage: "State Code must be a 2-digit GST state code.",
      },
    },
    {
      name: "saaStateName",
      label: "State Name",
      validation: {
        maxLength: 100,
        maxLengthMessage: "State Name must be at most 100 characters.",
      },
    },
    {
      name: "saaCountryCode",
      label: "Country Code",
      placeholder: DEFAULT_COUNTRY_CODE,
      validation: {
        minLength: 2,
        maxLength: 2,
        minLengthMessage: "Country Code must be exactly 2 characters.",
        maxLengthMessage: "Country Code must be exactly 2 characters.",
      },
    },
    {
      name: "saaDistanceKm",
      label: "Distance (Km)",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Distance must be 0 or greater.",
      },
    },
    {
      name: "saaPhone",
      label: "Phone",
      type: "tel",
      validation: {
        maxLength: 20,
        maxLengthMessage: "Phone must be at most 20 characters.",
      },
    },
    {
      name: "saaEmail",
      label: "Email",
      type: "email",
    },
    {
      name: "saaGstin",
      label: "GSTIN",
      required: true,
      placeholder: "33ABCDE1234F1Z5",
      validation: {
        requiredMessage: "GSTIN is required.",
        minLength: 15,
        maxLength: 15,
        minLengthMessage: "GSTIN must be exactly 15 characters.",
        maxLengthMessage: "GSTIN must be exactly 15 characters.",
        pattern: GSTIN_PATTERN,
        patternMessage: "GSTIN must be a valid 15-character GSTIN.",
      },
    },
    {
      name: "position",
      label: "Sort",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Sort must be 0 or greater.",
      },
    },
    {
      name: "saaIsDefault",
      label: "Default Address",
      type: "checkbox",
      options: [
        { label: "Yes", value: "true" },
        { label: "No", value: "false" },
      ],
    },
    {
      name: "saaIsActive",
      label: "Status",
      type: "checkbox",
      options: [
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
    },
    {
      name: "masterDescription",
      label: "Remarks",
      type: "textarea",
      colSpan: 2,
      validation: {
        maxLength: 250,
        maxLengthMessage: "Remarks must be at most 250 characters.",
      },
    },
  ];
}
export default function LedgerShippingAddressMasterPage() {
  const { getAll: getLedgerLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getCompanyLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getBranchLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const [ledgerOptions, setLedgerOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_LEDGER_OPTION,
  ]);
  const [companyOptions, setCompanyOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_COMPANY_OPTION,
  ]);
  const [branchOptions, setBranchOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_BRANCH_OPTION,
  ]);
  // Lookup options come from master tables that other users and other screens
  // change, so they are re-read on every data-refresh signal, not just on mount.
  const loadLookupOptions = useCallback(() => {
    let mounted = true;
    void (async () => {
      try {
        const [ledgersPayload, companiesPayload, branchesPayload] = await Promise.all([
          getLedgerLookup(LOOKUP_QUERY_ACCOUNT_LEDGERS),
          getCompanyLookup(LOOKUP_QUERY_COMPANIES),
          getBranchLookup(LOOKUP_QUERY_BRANCHES),
        ]);
        if (!mounted) {
          return;
        }
        setLedgerOptions(
          buildLookupOptions(ledgersPayload, DEFAULT_LEDGER_OPTION, {
            arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
            idKeys: ["id", "value"],
            labelKeys: ["name", "label"],
          }),
        );
        setCompanyOptions(
          buildLookupOptions(companiesPayload, DEFAULT_COMPANY_OPTION, {
            arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
            idKeys: ["id", "value"],
            labelKeys: ["name", "label"],
          }),
        );
        setBranchOptions(
          buildLookupOptions(branchesPayload, DEFAULT_BRANCH_OPTION, {
            arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
            idKeys: ["id", "value"],
            labelKeys: ["name", "label"],
          }),
        );
      } catch {
        if (!mounted) {
          return;
        }
        setLedgerOptions([DEFAULT_LEDGER_OPTION]);
        setCompanyOptions([DEFAULT_COMPANY_OPTION]);
        setBranchOptions([DEFAULT_BRANCH_OPTION]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getLedgerLookup, getCompanyLookup, getBranchLookup]);
  useEffect(() => loadLookupOptions(), [loadLookupOptions]);
  useDataRefresh(() => {
    loadLookupOptions();
  });
  const formFields = useMemo(
    () => buildLedgerShippingAddressFields(ledgerOptions, companyOptions, branchOptions),
    [ledgerOptions, companyOptions, branchOptions],
  );
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted shipping addresses. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 60's stored SQL; keys with no matching token are ignored. `wantdelete` is
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
      title="Ledger Shipping Address"
      auditHistory={{ screenName: "Ledger Shipping Address" }}
      entityLabel="ledger shipping address"
      entityLabelPlural="ledger shipping addresses"
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
      gridDetailId={GRID_DETAIL_ID}
      listResponseStyleArrayKey=""
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Ledger Shipping Address List"
      createLabel="Add Ledger Shipping Address"
      codeColumnHeader="Address Type"
      nameColumnHeader="Trade Name"
      nameFieldLabel="Trade Name"
      nameFieldPlaceholder="ABC Traders"
      formTitle="Ledger Shipping Address Form"
      formDescription="Create and update ledger shipping addresses."
      customFields={formFields}
      createInitialValues={INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mergedDefaults = { ...INITIAL_FORM_VALUES, ...defaults };
        return {
          ...INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) ||
            mergedDefaults.masterName,
          saaLedgerId:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_LEDGER_ID_KEYS)) ||
            mergedDefaults.saaLedgerId,
          saaAddrType:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_ADDR_TYPE_KEYS)) ||
            mergedDefaults.saaAddrType,
          saaCompanyId:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_COMPANY_ID_KEYS)) ||
            mergedDefaults.saaCompanyId,
          saaBranchId:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_BRANCH_ID_KEYS)) ||
            mergedDefaults.saaBranchId,
          saaContactName:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_CONTACT_NAME_KEYS)) ||
            mergedDefaults.saaContactName,
          saaAddr1:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_ADDR1_KEYS)) || mergedDefaults.saaAddr1,
          saaAddr2:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_ADDR2_KEYS)) || mergedDefaults.saaAddr2,
          saaAddr3:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_ADDR3_KEYS)) || mergedDefaults.saaAddr3,
          saaLocation:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_LOCATION_KEYS)) ||
            mergedDefaults.saaLocation,
          saaPin:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_PIN_KEYS)) || mergedDefaults.saaPin,
          saaStateCode:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_STATE_CODE_KEYS)) ||
            mergedDefaults.saaStateCode,
          saaStateName:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_STATE_NAME_KEYS)) ||
            mergedDefaults.saaStateName,
          saaCountryCode:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_COUNTRY_CODE_KEYS)) ||
            mergedDefaults.saaCountryCode,
          saaDistanceKm:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_DISTANCE_KEYS)) ||
            mergedDefaults.saaDistanceKm,
          saaPhone:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_PHONE_KEYS)) || mergedDefaults.saaPhone,
          saaEmail:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_EMAIL_KEYS)) || mergedDefaults.saaEmail,
          saaGstin:
            toDisplayValue(getFirstDefinedValue(rowSource, SAA_GSTIN_KEYS)) || mergedDefaults.saaGstin,
          position:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) ||
            mergedDefaults.position,
          saaIsDefault: toSelectBoolean(getFirstDefinedValue(rowSource, SAA_IS_DEFAULT_KEYS), "false"),
          saaIsActive: toSelectBoolean(getFirstDefinedValue(rowSource, SAA_IS_ACTIVE_KEYS), "true"),
          masterDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
            mergedDefaults.masterDescription,
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          saaLedgerId: (values.saaLedgerId ?? "").trim(),
          saaAddrType: toUpper(values.saaAddrType ?? DEFAULT_ADDR_TYPE) || DEFAULT_ADDR_TYPE,
          saaCompanyId: toNullableString(values.saaCompanyId ?? ""),
          saaBranchId: toNullableString(values.saaBranchId ?? ""),
          saaIsDefault: (values.saaIsDefault ?? "false") === "true",
          saaSort: toNonNegativeInteger(values.position ?? "0", 0),
          saaTradeName: toNullableString(values.masterName ?? ""),
          saaContactName: toNullableString(values.saaContactName ?? ""),
          saaAddr1: toNullableString(values.saaAddr1 ?? ""),
          saaAddr2: toNullableString(values.saaAddr2 ?? ""),
          saaAddr3: toNullableString(values.saaAddr3 ?? ""),
          saaLocation: toNullableString(values.saaLocation ?? ""),
          saaPin: toNullableString(values.saaPin ?? ""),
          saaStateCode: toNullableString(values.saaStateCode ?? ""),
          saaStateName: toNullableString(values.saaStateName ?? ""),
          saaCountryCode: toUpper(values.saaCountryCode ?? "") || DEFAULT_COUNTRY_CODE,
          saaDistanceKm: toNullableNonNegativeInteger(values.saaDistanceKm ?? ""),
          saaPhone: toNullableString(values.saaPhone ?? ""),
          saaEmail: toNullableString(values.saaEmail ?? ""),
          saaGstin: toUpper(values.saaGstin ?? "").trim(),
          saaIsActive: (values.saaIsActive ?? "true") === "true",
          saaRemarks: toNullableString(values.masterDescription ?? ""),
        };
        if (shouldUpdate && editingItemId !== null) {
          payload.saaId = toUpdateId(editingItemId);
        }
        return payload;
      }}
    />
  );
}