"use client";

import { useEffect, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
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
  list: "/gsp-company-services/list",
  getById: "/gsp-company-services/get",
  create: "/gsp-company-services/create",
  delete: "/gsp-company-services/delete",
} as const;

const GRID_TABLE_NAME = "gsp_company_service";

const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";

const LOOKUP_QUERY_COMPANIES = {
  module: "companies",
  limit: "20",
} as const;

const LOOKUP_QUERY_PROVIDERS = {
  module: "gspProviders",
  limit: "20",
} as const;

const LOOKUP_KEYS = {
  id: ["csgCompanyServiceId", "csg_company_service_id", "id", "_id"],
  code: ["csgServiceType", "csg_service_type", "code"],
  name: ["csgServiceType", "csg_service_type", "name"],
  short: ["csgEuserName", "csg_euser_name", "short", "shortName"],
  alias: ["csgCompanyId", "csg_company_id", "alias"],
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

const DEFAULT_COMPANY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Company",
};

const DEFAULT_PROVIDER_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select GSP Provider",
};

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
): ERPDynamicModalField[] {
  return [
    {
      name: "csgCompanyId",
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
      name: "csgGspProviderId",
      label: "GSP Provider",
      type: "select",
      searchable: true,
      required: true,
      options: providerOptions,
      validation: {
        requiredMessage: "GSP Provider is required.",
      },
    },
    {
      name: "csgServiceType",
      label: "Service Type",
      required: true,
      placeholder: "EINV",
      validation: {
        requiredMessage: "Service Type is required.",
        maxLength: 20,
        maxLengthMessage: "Service Type must be at most 20 characters.",
      },
    },
    {
      name: "csgEuserName",
      label: "E-User Name",
      required: true,
      validation: {
        requiredMessage: "E-User Name is required.",
      },
    },
    {
      name: "csgEuserPassword",
      label: "E-User Password",
      type: "password",
      required: true,
      validation: {
        requiredMessage: "E-User Password is required.",
      },
    },
    {
      name: "csgAuthToken",
      label: "Auth Token",
      type: "textarea",
      colSpan: 2,
    },
    {
      name: "csgAuthTokenValidTill",
      label: "Token Valid Till",
      type: "date",
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

export default function GspCompanyServiceMasterPage() {
  const { getAll: getCompanyLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getProviderLookup } = useApi<unknown>(LOOKUP_ENDPOINT);

  const [companyOptions, setCompanyOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_COMPANY_OPTION,
  ]);
  const [providerOptions, setProviderOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_PROVIDER_OPTION,
  ]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const [companiesPayload, providersPayload] = await Promise.all([
          getCompanyLookup(LOOKUP_QUERY_COMPANIES),
          getProviderLookup(LOOKUP_QUERY_PROVIDERS),
        ]);

        if (!mounted) {
          return;
        }

        setCompanyOptions(
          buildLookupOptions(companiesPayload, DEFAULT_COMPANY_OPTION, {
            arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
            idKeys: ["id", "value"],
            labelKeys: ["name", "label"],
          }),
        );
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

        setCompanyOptions([DEFAULT_COMPANY_OPTION]);
        setProviderOptions([DEFAULT_PROVIDER_OPTION]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [getCompanyLookup, getProviderLookup]);

  const formFields = useMemo(
    () => buildGspCompanyServiceFormFields(companyOptions, providerOptions),
    [companyOptions, providerOptions],
  );

  return (
    <CrudMasterPage
      title="GSP Company Service"
      entityLabel="gsp company service"
      entityLabelPlural="gsp company services"
      apiEndpoints={API_ENDPOINTS}
      gridTableName={GRID_TABLE_NAME}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="GSP Company Service List"
      createLabel="Add GSP Company Service"
      codeColumnHeader="Service Type"
      nameColumnHeader="Service Type"
      nameFieldLabel="Service Type"
      nameFieldPlaceholder="EINV"
      formTitle="GSP Company Service Form"
      formDescription="Create and update GSP company service mappings."
      customFields={formFields}
      createInitialValues={INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mergedDefaults = { ...INITIAL_FORM_VALUES, ...defaults };

        return {
          ...INITIAL_FORM_VALUES,
          csgCompanyId:
            toDisplayValue(getFirstDefinedValue(rowSource, CSG_COMPANY_ID_KEYS)) ||
            mergedDefaults.csgCompanyId,
          csgGspProviderId:
            toDisplayValue(getFirstDefinedValue(rowSource, CSG_PROVIDER_ID_KEYS)) ||
            mergedDefaults.csgGspProviderId,
          csgServiceType:
            toDisplayValue(getFirstDefinedValue(rowSource, CSG_SERVICE_TYPE_KEYS)) ||
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
