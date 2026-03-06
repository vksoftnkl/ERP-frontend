"use client";

import CrudMasterPage from "@/components/master/crud-master-page";
import type { ERPDynamicModalField } from "@/components/library/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  getFirstDefinedValue,
  toDisplayValue,
  toSelectBoolean,
  toUpdateId,
} from "@/app/master/_shared/crud-utils";

const API_ENDPOINTS = {
  list: "/gsp-provider-masters/list",
  getById: "/gsp-provider-masters/get",
  create: "/gsp-provider-masters/create",
  delete: "/gsp-provider-masters/delete",
} as const;

const GRID_TABLE_NAME = "gsp_provider_master";

const LOOKUP_KEYS = {
  id: ["gspProviderId", "gsp_provider_id", "id", "_id"],
  code: ["gspProviderCode", "gsp_provider_code", "code"],
  name: ["gspProviderName", "gsp_provider_name", "name"],
  short: ["gspRoute", "gsp_route", "short", "shortName"],
  alias: ["gspBaseUrl", "gsp_base_url", "alias"],
  active: ["gspIsActive", "gsp_is_active", "isActive", "is_active", "status"],
  position: ["position", "sort"],
  description: ["gspBaseUrl", "gsp_base_url", "description"],
  array: ["data", "items", "results", "rows", "list", "gspProviders", "gsp_provider_masters"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "gspProviderId",
  name: "gspProviderName",
  alias: "gspBaseUrl",
  short: "gspRoute",
  description: "gspBaseUrl",
  sort: "position",
} as const;

const PROVIDER_CODE_KEYS = ["gspProviderCode", "gsp_provider_code", "code"] as const;
const PROVIDER_BASE_URL_KEYS = ["gspBaseUrl", "gsp_base_url", "baseUrl", "base_url"] as const;
const PROVIDER_ROUTE_KEYS = ["gspRoute", "gsp_route", "route"] as const;
const PROVIDER_IP_KEYS = ["gspIpAddress", "gsp_ip_address", "ipAddress", "ip_address"] as const;
const PROVIDER_USER_KEYS = ["gspUserName", "gsp_user_name", "userName", "username"] as const;
const PROVIDER_PASSWORD_KEYS = [
  "gspUserPassword",
  "gsp_user_password",
  "userPassword",
  "password",
] as const;
const PROVIDER_ACTIVE_KEYS = ["gspIsActive", "gsp_is_active", "isActive", "is_active", "status"] as const;

const INITIAL_FORM_VALUES = {
  gspProviderCode: "",
  masterName: "",
  gspBaseUrl: "",
  gspRoute: "",
  gspIpAddress: "",
  gspUserName: "",
  gspUserPassword: "",
  gspIsActive: "true",
} as const;

const FORM_FIELDS: ERPDynamicModalField[] = [
  {
    name: "gspProviderCode",
    label: "Provider Code",
    required: true,
    validation: {
      requiredMessage: "Provider Code is required.",
      maxLength: 50,
      maxLengthMessage: "Provider Code must be at most 50 characters.",
    },
  },
  {
    name: "masterName",
    label: "Provider Name",
    required: true,
    validation: {
      requiredMessage: "Provider Name is required.",
      maxLength: 150,
      maxLengthMessage: "Provider Name must be at most 150 characters.",
    },
  },
  {
    name: "gspBaseUrl",
    label: "Base URL",
    required: true,
    type: "url",
    validation: {
      requiredMessage: "Base URL is required.",
    },
  },
  {
    name: "gspRoute",
    label: "Route",
    required: true,
    validation: {
      requiredMessage: "Route is required.",
    },
  },
  {
    name: "gspIpAddress",
    label: "IP Address",
    required: true,
    validation: {
      requiredMessage: "IP Address is required.",
      pattern: /^(?:\d{1,3}\.){3}\d{1,3}$/,
      patternMessage: "IP Address format is invalid.",
    },
  },
  {
    name: "gspUserName",
    label: "User Name",
    required: true,
    validation: {
      requiredMessage: "User Name is required.",
    },
  },
  {
    name: "gspUserPassword",
    label: "User Password",
    type: "password",
    required: true,
    validation: {
      requiredMessage: "User Password is required.",
    },
  },
  {
    name: "gspIsActive",
    label: "Status",
    type: "checkbox",
    options: [
      { label: "Active", value: "true" },
      { label: "Inactive", value: "false" },
    ],
  },
];

export default function GspProviderMasterPage() {
  return (
    <CrudMasterPage
      title="GSP Provider"
      entityLabel="gsp provider"
      entityLabelPlural="gsp providers"
      apiEndpoints={API_ENDPOINTS}
      gridTableName={GRID_TABLE_NAME}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="GSP Provider List"
      createLabel="Add GSP Provider"
      codeColumnHeader="Provider Code"
      nameColumnHeader="Provider Name"
      nameFieldLabel="Provider Name"
      nameFieldPlaceholder="ClearTax"
      formTitle="GSP Provider Form"
      formDescription="Create and update GSP providers."
      customFields={FORM_FIELDS}
      createInitialValues={INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mergedDefaults = { ...INITIAL_FORM_VALUES, ...defaults };

        return {
          ...INITIAL_FORM_VALUES,
          gspProviderCode:
            toDisplayValue(getFirstDefinedValue(rowSource, PROVIDER_CODE_KEYS)) ||
            mergedDefaults.gspProviderCode,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || mergedDefaults.masterName,
          gspBaseUrl:
            toDisplayValue(getFirstDefinedValue(rowSource, PROVIDER_BASE_URL_KEYS)) ||
            mergedDefaults.gspBaseUrl,
          gspRoute:
            toDisplayValue(getFirstDefinedValue(rowSource, PROVIDER_ROUTE_KEYS)) ||
            mergedDefaults.gspRoute,
          gspIpAddress:
            toDisplayValue(getFirstDefinedValue(rowSource, PROVIDER_IP_KEYS)) ||
            mergedDefaults.gspIpAddress,
          gspUserName:
            toDisplayValue(getFirstDefinedValue(rowSource, PROVIDER_USER_KEYS)) ||
            mergedDefaults.gspUserName,
          gspUserPassword:
            toDisplayValue(getFirstDefinedValue(rowSource, PROVIDER_PASSWORD_KEYS)) ||
            mergedDefaults.gspUserPassword,
          gspIsActive: toSelectBoolean(getFirstDefinedValue(rowSource, PROVIDER_ACTIVE_KEYS), "true"),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          gspProviderCode: (values.gspProviderCode ?? "").trim(),
          gspProviderName: (values.masterName ?? "").trim(),
          gspBaseUrl: (values.gspBaseUrl ?? "").trim(),
          gspRoute: (values.gspRoute ?? "").trim(),
          gspIpAddress: (values.gspIpAddress ?? "").trim(),
          gspUserName: (values.gspUserName ?? "").trim(),
          gspUserPassword: (values.gspUserPassword ?? "").trim(),
          gspIsActive: (values.gspIsActive ?? "true") === "true",
        };

        if (shouldUpdate && editingItemId !== null) {
          payload.gspProviderId = toUpdateId(editingItemId);
        }

        return payload;
      }}
    />
  );
}
