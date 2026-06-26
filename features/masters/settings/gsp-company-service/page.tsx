"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import {
  useLazyConfiguredDropdown,
  type LazyDropdownHandlers,
} from "@/features/masters/shared/use-lazy-configured-dropdown";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  buildLookupOptions,
  getFirstDefinedValue,
  toDateInputValue,
  toDisplayValue,
  toNullableDate,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
  toUpper,
  DEFAULT_LOOKUP_ARRAY_KEYS,
} from "@/app/master/_shared/crud-utils";
const API_ENDPOINTS = {
  list: "/configured-grid-sql/run?grid_id=27",
  getById: "/gsp-company-services/get",
  create: "/gsp-company-services/create",
  delete: "/gsp-company-services/delete",
} as const;
const GRID_TABLE_NAME = "gsp_company_service";
const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
// Company is a lazy, server-side searchable configured dropdown (fixed.dropdown_details
// 8=company comp_id/comp_name). Loaded on open + on debounced server-side search via
// /dropdown-details/run; nothing up front and dropdown_param is never sent.
const COMPANY_DROPDOWN_CONFIG = {
  dropdownId: "8",
  idKeys: ["comp_id", "compId"] as const,
  labelKeys: ["comp_name", "compName"] as const,
  defaultOption: { value: "", label: "Select Company" } as ERPDynamicSelectOption,
} as const;
const LOOKUP_QUERY_PROVIDERS = {
  module: "gspProviders",
  limit: "20",
} as const;
const LOOKUP_KEYS = {
  id: ["csgCompanyServiceId", "csg_company_service_id", "id", "_id"],
  code: [
    "companyDisplay",
    "company_display",
    "companyName",
    "company_name",
    "compName",
    "comp_name",
    "csgCompanyId",
    "csg_company_id",
    "code",
  ],
  name: ["csgServiceType", "csg_service_type", "name"],
  short: ["csgEuserName", "csg_euser_name", "short", "shortName"],
  alias: [
    "providerDisplay",
    "provider_display",
    "providerName",
    "provider_name",
    "gspProviderName",
    "gsp_provider_name",
    "csgGspProviderId",
    "csg_gsp_provider_id",
    "alias",
  ],
  active: ["csgIsActive", "csg_is_active", "isActive", "is_active", "status"],
  position: ["position", "sort"],
  description: ["csgAuthToken", "csg_auth_token", "description", "remarks"],
  array: ["data", "items", "results", "rows", "list", "gspCompanyServices"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "csgCompanyServiceId",
  name: "csgServiceType",
  alias: "csgCompanyId",
  short: "csgEuserName",
  description: "csgAuthToken",
  sort: "position",
} as const;
const CSG_COMPANY_ID_KEYS = ["csgCompanyId", "csg_company_id", "companyId", "company_id"] as const;
const CSG_COMPANY_NAME_KEYS = ["companyName", "company_name", "compName", "comp_name"] as const;
const CSG_PROVIDER_ID_KEYS = ["csgGspProviderId", "csg_gsp_provider_id", "providerId", "provider_id"] as const;
const CSG_SERVICE_TYPE_KEYS = ["csgServiceType", "csg_service_type", "serviceType", "service_type"] as const;
const CSG_EUSER_NAME_KEYS = ["csgEuserName", "csg_euser_name", "euserName"] as const;
const CSG_EUSER_PASSWORD_KEYS = ["csgEuserPassword", "csg_euser_password", "euserPassword"] as const;
const CSG_AUTH_TOKEN_KEYS = ["csgAuthToken", "csg_auth_token", "authToken"] as const;
const CSG_AUTH_TOKEN_VALID_TILL_KEYS = [
  "csgAuthTokenValidTill",
  "csg_auth_token_valid_till",
  "authTokenValidTill",
] as const;
const CSG_IS_ACTIVE_KEYS = ["csgIsActive", "csg_is_active", "isActive", "is_active", "status"] as const;
const DEFAULT_PROVIDER_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select GSP Provider",
};
const DEFAULT_SERVICE_TYPE_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Service Type",
};
const SERVICE_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  DEFAULT_SERVICE_TYPE_OPTION,
  { value: "EINV", label: "EINV" },
  { value: "EWAY", label: "EWAY" },
  { value: "BOTH", label: "Both" },
];
const INITIAL_FORM_VALUES = {
  csgCompanyId: "",
  csgGspProviderId: "",
  csgServiceType: "",
  csgEuserName: "",
  csgEuserPassword: "",
  csgAuthToken: "",
  csgAuthTokenValidTill: "",
  csgIsActive: "true",
} as const;
function buildGspCompanyServiceFormFields(
  companyOptions: ERPDynamicSelectOption[],
  providerOptions: ERPDynamicSelectOption[],
  companyHandlers: LazyDropdownHandlers,
): ERPDynamicModalField[] {
  return [
    {
      name: "csgCompanyId",
      label: "Company",
      type: "select",
      colSpan:2,
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
      name: "csgGspProviderId",
      label: "GSP Provider",
      type: "select",
      searchable: true,
      colSpan:2,
      required: true,
      options: providerOptions,
      validation: {
        requiredMessage: "GSP Provider is required.",
      },
    },
    {
      name: "csgServiceType",
      label: "Service Type",
      type: "select",
      required: true,
      colSpan:2,
      options: SERVICE_TYPE_OPTIONS,
      searchable:false,
      validation: {
        requiredMessage: "Service Type is required.",
      },
    },
    {
      name: "csgEuserName",
      label: "E-User Name",
      required: true,
      colSpan:2,
      validation: {
        requiredMessage: "E-User Name is required.",
      },
    },
    {
      name: "csgEuserPassword",
      label: "E-User Password",
      type: "password",
      colSpan:2,
      required: true,
      validation: {
        requiredMessage: "E-User Password is required.",
      },
    },
    {
      name: "csgIsActive",
      label: "Status",
      type: "checkbox",
      options: [
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
    },
  ];
}

function normalizeServiceType(value: unknown): string {
  const normalizedValue = toDisplayValue(value).trim().toUpperCase();

  if (normalizedValue === "EINV" || normalizedValue === "EWAY" || normalizedValue === "BOTH") {
    return normalizedValue;
  }

  return "";
}

export default function GspCompanyServiceMasterPage() {
  // Company: lazy server-side configured dropdown 8. Provider stays eager (no configured
  // dropdown for GSP providers).
  const company = useLazyConfiguredDropdown(COMPANY_DROPDOWN_CONFIG);
  const { getAll: getProviderLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const [providerOptions, setProviderOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_PROVIDER_OPTION,
  ]);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const providersPayload = await getProviderLookup(LOOKUP_QUERY_PROVIDERS);
        if (!mounted) {
          return;
        }
        setProviderOptions(
          buildLookupOptions(providersPayload, DEFAULT_PROVIDER_OPTION, {
            arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
            idKeys: ["id", "value"],
            labelKeys: ["name", "label"],
          }),
        );
      } catch {
        if (!mounted) {
          return;
        }
        setProviderOptions([DEFAULT_PROVIDER_OPTION]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getProviderLookup]);
  const formFields = useMemo(
    () => buildGspCompanyServiceFormFields(company.options, providerOptions, company.handlers),
    [company.options, providerOptions, company.handlers],
  );
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted GSP company services. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 27's stored SQL; keys with no matching token are ignored. `wantdelete` is
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
      title="GSP Company Service"
      auditHistory={{ screenName: "GSP Company Service" }}
      entityLabel="gsp company service"
      entityLabelPlural="gsp company services"
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
        gridDetailId={27}
      responseTableColumnExcludeKeys={["csg_company_service_id", "csgCompanyServiceId"]}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="GSP Company Service List"
      createLabel="Add GSP Company Service"
      codeColumnHeader="Company"
      nameColumnHeader="Service Type"
      tableColumnHeaders={{ masterShort: "E-User Name" }}
      nameFieldLabel="Service Type"
      nameFieldPlaceholder="Select Service Type"
      formTitle="GSP Company Service Form"
      formDescription="Create and update GSP company service mappings."
      customFields={formFields}
      createInitialValues={INITIAL_FORM_VALUES}
      onModalOpenChange={(open, variantKey) => {
        // Clear the lazy Company dropdown when the create modal opens so no stale
        // selection from a previously edited row lingers (it reloads on open).
        if (open && variantKey === "master-create") {
          company.seedSelected("", "");
        }
      }}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mergedDefaults = { ...INITIAL_FORM_VALUES, ...defaults };
        const csgCompanyId =
          toDisplayValue(getFirstDefinedValue(rowSource, CSG_COMPANY_ID_KEYS)) ||
          mergedDefaults.csgCompanyId;
        // Seed the lazy Company dropdown so the trigger shows the company name on
        // edit/view before the field is opened (getById returns companyName).
        company.seedSelected(
          csgCompanyId,
          toDisplayValue(getFirstDefinedValue(rowSource, CSG_COMPANY_NAME_KEYS)),
        );
        return {
          ...INITIAL_FORM_VALUES,
          csgCompanyId,
          csgGspProviderId:
            toDisplayValue(getFirstDefinedValue(rowSource, CSG_PROVIDER_ID_KEYS)) ||
            mergedDefaults.csgGspProviderId,
          csgServiceType:
            normalizeServiceType(getFirstDefinedValue(rowSource, CSG_SERVICE_TYPE_KEYS)) ||
            mergedDefaults.csgServiceType,
          csgEuserName:
            toDisplayValue(getFirstDefinedValue(rowSource, CSG_EUSER_NAME_KEYS)) ||
            mergedDefaults.csgEuserName,
          csgEuserPassword:
            toDisplayValue(getFirstDefinedValue(rowSource, CSG_EUSER_PASSWORD_KEYS)) ||
            mergedDefaults.csgEuserPassword,
          csgAuthToken:
            toDisplayValue(getFirstDefinedValue(rowSource, CSG_AUTH_TOKEN_KEYS)) ||
            mergedDefaults.csgAuthToken,
          csgAuthTokenValidTill:
            toDateInputValue(getFirstDefinedValue(rowSource, CSG_AUTH_TOKEN_VALID_TILL_KEYS)) ||
            mergedDefaults.csgAuthTokenValidTill,
          csgIsActive: toSelectBoolean(getFirstDefinedValue(rowSource, CSG_IS_ACTIVE_KEYS), "true"),        
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          csgCompanyId: (values.csgCompanyId ?? "").trim(),
          csgGspProviderId: (values.csgGspProviderId ?? "").trim(),
          csgServiceType: toUpper(values.csgServiceType ?? ""),
          csgEuserName: (values.csgEuserName ?? "").trim(),
          csgEuserPassword: (values.csgEuserPassword ?? "").trim(),
          csgAuthToken: toNullableString(values.csgAuthToken ?? ""),
          csgAuthTokenValidTill: toNullableDate(values.csgAuthTokenValidTill ?? ""),
          csgIsActive: (values.csgIsActive ?? "true") === "true",
        };
        if (shouldUpdate && editingItemId !== null) {
          payload.csgCompanyServiceId = toUpdateId(editingItemId);
        }
        return payload;
      }}
    />
  );
}
