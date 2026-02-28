"use client";

import { useEffect, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import styles from "../state-master/page.module.scss";

const API_ENDPOINTS = {
  list: "/customers/list",
  getById: "/customers/get",
  create: "/customers/create",
  delete: "/customers/delete",
} as const;

const AREA_LOOKUP_ENDPOINT = "/areas/list";
const CUSTOMER_GROUP_LOOKUP_ENDPOINT = "/customer-groups/list";

const LOOKUP_REQUEST_QUERY = {
  page: "1",
  limit: "20",
} as const;

const LOOKUP_KEYS = {
  id: ["cusId", "cus_id", "customer_id", "customerId", "id", "_id"],
  code: ["cusCode", "cus_code", "customer_code", "customerCode", "code"],
  name: ["cusName", "cus_name", "customer_name", "customerName", "name"],
  short: ["cusShort", "cus_short", "customer_short", "short_name", "shortName", "short"],
  alias: ["cusTitle", "cus_title", "customer_title", "alias", "cusCode", "cus_code"],
  active: ["cusIsActive", "cus_is_active", "active", "is_active", "isActive", "status"],
  position: ["cusSortOrder", "cus_sort_order", "sort", "position"],
  description: ["cusNotes", "cus_notes", "notes", "description", "desc"],
  array: ["data", "items", "results", "rows", "list", "customers"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "cusId",
  name: "cusName",
  alias: "cusTitle",
  short: "cusShort",
  description: "cusNotes",
  sort: "cusSortOrder",
} as const;

const CUSTOMER_CODE_KEYS = ["cusCode", "cus_code", "customer_code", "customerCode"] as const;
const CUSTOMER_TITLE_KEYS = ["cusTitle", "cus_title", "customer_title"] as const;
const CUSTOMER_PHONE_KEYS = ["cusPhone1", "cus_phone1", "phone", "phone1"] as const;
const CUSTOMER_EMAIL_KEYS = ["cusEmail", "cus_email", "email"] as const;
const CUSTOMER_STATE_NAME_KEYS = ["cusStateName", "cus_state_name", "state_name", "stateName"] as const;
const CUSTOMER_STATE_CODE_KEYS = ["cusStateCode", "cus_state_code", "state_code", "stateCode"] as const;
const CUSTOMER_AREA_ID_KEYS = ["cusAreaId", "cus_area_id", "area_id", "areaId"] as const;
const CUSTOMER_GROUP_ID_KEYS = ["cusGroupId", "cus_group_id", "group_id", "groupId"] as const;
const CUSTOMER_PRICE_LEVEL_KEYS = [
  "cusPriceLevelId",
  "cus_price_level_id",
  "price_level_id",
  "priceLevelId",
] as const;
const CUSTOMER_CITY_KEYS = ["cusCity", "cus_city", "city"] as const;
const CUSTOMER_DISTRICT_KEYS = ["cusDistrict", "cus_district", "district"] as const;
const CUSTOMER_ADDR1_KEYS = ["cusAddr1", "cus_addr1", "address1", "addr1"] as const;
const CUSTOMER_NOTES_KEYS = ["cusNotes", "cus_notes", "notes"] as const;
const CUSTOMER_COLLECTION_DAYS_KEYS = [
  "cusCollectionDays",
  "cus_collection_days",
  "collection_days",
  "collectionDays",
] as const;
const CUSTOMER_IS_ACTIVE_KEYS = ["cusIsActive", "cus_is_active", "isActive", "is_active", "status"] as const;

const AREA_LOOKUP_KEYS = {
  id: ["armId", "arm_id", "area_id", "areaId", "id", "_id"],
  name: ["armName", "arm_name", "area_name", "areaName", "name"],
  array: ["data", "items", "results", "rows", "list", "areas"],
} as const;

const GROUP_LOOKUP_KEYS = {
  id: ["cgrId", "cgr_id", "group_id", "groupId", "id", "_id"],
  name: ["cgrName", "cgr_name", "group_name", "groupName", "name"],
  array: ["data", "items", "results", "rows", "list", "customerGroups", "customer_groups"],
} as const;

const DEFAULT_AREA_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Area",
};

const DEFAULT_GROUP_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Customer Group",
};

const CUSTOMER_INITIAL_FORM_VALUES = {
  customerName: "",
  customerCode: "",
  customerShort: "",
  customerTitle: "",
  customerPhone1: "",
  customerEmail: "",
  customerStateName: "",
  customerStateCode: "",
  customerAreaId: "",
  customerGroupId: "",
  customerPriceLevelId: "0",
  customerCity: "",
  customerDistrict: "",
  customerAddress1: "",
  customerCollectionDays: "",
  customerSortOrder: "0",
  customerIsActive: "true",
  customerNotes: "",
} as const;

function buildCustomerFormFields(
  areaOptions: ERPDynamicSelectOption[],
  groupOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "customerName",
      label: "Customer Name",
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Customer Name must be at least 2 characters.",
      },
    },
    {
      name: "customerCode",
      label: "Customer Code",
    },
    {
      name: "customerShort",
      label: "Short Name",
    },
    {
      name: "customerTitle",
      label: "Title",
      placeholder: "Mr/Ms/Firm",
    },
    {
      name: "customerPhone1",
      label: "Phone",
      type: "tel",
    },
    {
      name: "customerEmail",
      label: "Email",
      type: "email",
    },
    {
      name: "customerStateName",
      label: "State Name",
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "State Name must be at least 2 characters.",
      },
    },
    {
      name: "customerStateCode",
      label: "State Code",
      required: true,
      placeholder: "GJ",
      validation: {
        pattern: "^[A-Za-z]{2}$",
        patternMessage: "State Code must be exactly 2 letters.",
      },
    },
    {
      name: "customerAreaId",
      label: "Area",
      type: "select",
      searchable: true,
      required: true,
      options: areaOptions,
      placeholder: "Search area",
      validation: {
        requiredMessage: "Area is required.",
      },
    },
    {
      name: "customerGroupId",
      label: "Customer Group",
      type: "select",
      searchable: true,
      //required: true,
      options: groupOptions,
      placeholder: "Search customer group",
      validation: {
        requiredMessage: "Customer Group is required.",
      },
    },
    {
      name: "customerPriceLevelId",
      label: "Price Level",
      type: "number",
      required: true,
      min: 0,
      step: 1,
      validation: {
        minMessage: "Price Level must be 0 or greater.",
      },
    },
    {
      name: "customerCity",
      label: "City",
    },
    {
      name: "customerDistrict",
      label: "District",
    },
    {
      name: "customerAddress1",
      label: "Address",
      type: "textarea",
      colSpan: 2,
    },
    {
      name: "customerCollectionDays",
      label: "Collection Days",
      placeholder: "1,3,5",
      helperText: "Comma-separated day numbers.",
    },
    {
      name: "customerSortOrder",
      label: "Sort Order",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Sort Order must be 0 or greater.",
      },
    },
    {
      name: "customerIsActive",
      label: "Status",
      type: "checkbox",
      options: [
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
    },
    {
      name: "customerNotes",
      label: "Notes",
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

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  ) {
    return String(value).trim();
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

function toInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toSelectBoolean(value: unknown, fallback: "true" | "false"): "true" | "false" {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return "true";
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return "false";
    }
  }

  if (typeof value === "number") {
    return value > 0 ? "true" : "false";
  }

  return fallback;
}

function toCollectionDaysInput(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .filter((entry) => typeof entry === "number" && Number.isFinite(entry))
    .map((entry) => String(entry))
    .join(",");
}

function parseCollectionDays(value: string): number[] {
  const normalized = value.trim();
  if (!normalized) {
    return [];
  }

  const parsedValues = normalized
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => Number.parseInt(token, 10))
    .filter((token) => Number.isFinite(token) && token >= 0);

  return Array.from(new Set(parsedValues));
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

  const firstArray = Object.values(objectPayload).find((entry) => Array.isArray(entry));
  return Array.isArray(firstArray) ? firstArray : [];
}

function buildLookupOptions(
  payload: unknown,
  keys: {
    id: readonly string[];
    name: readonly string[];
    array: readonly string[];
  },
  defaultOption: ERPDynamicSelectOption,
): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, keys.array);

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }

    const source = row as Record<string, unknown>;
    const id = toDisplayValue(getFirstDefinedValue(source, keys.id));
    if (!id) {
      continue;
    }

    const name = toDisplayValue(getFirstDefinedValue(source, keys.name));
    if (!name) {
      continue;
    }

    if (!optionMap.has(id)) {
      optionMap.set(id, name);
    }
  }

  const sortedOptions = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));

  return [defaultOption, ...sortedOptions];
}

function toUpdateCustomerId(editingItemId: string | number | null): string {
  if (typeof editingItemId === "number" && Number.isFinite(editingItemId)) {
    return String(editingItemId);
  }

  if (typeof editingItemId === "string") {
    return editingItemId.trim();
  }

  return "";
}

export default function CustomerPage() {
  const { getAll: getAreaLookup } = useApi<unknown>(AREA_LOOKUP_ENDPOINT);
  const { getAll: getCustomerGroupLookup } = useApi<unknown>(CUSTOMER_GROUP_LOOKUP_ENDPOINT);

  const [areaOptions, setAreaOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_AREA_OPTION]);
  const [groupOptions, setGroupOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_GROUP_OPTION]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const [areaPayload, groupPayload] = await Promise.all([
          getAreaLookup(LOOKUP_REQUEST_QUERY),
          getCustomerGroupLookup(LOOKUP_REQUEST_QUERY),
        ]);

        if (!mounted) {
          return;
        }

        setAreaOptions(buildLookupOptions(areaPayload, AREA_LOOKUP_KEYS, DEFAULT_AREA_OPTION));
        setGroupOptions(buildLookupOptions(groupPayload, GROUP_LOOKUP_KEYS, DEFAULT_GROUP_OPTION));
      } catch {
        if (!mounted) {
          return;
        }

        setAreaOptions([DEFAULT_AREA_OPTION]);
        setGroupOptions([DEFAULT_GROUP_OPTION]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [getAreaLookup, getCustomerGroupLookup]);

  const customerFormFields = useMemo(
    () => buildCustomerFormFields(areaOptions, groupOptions),
    [areaOptions, groupOptions],
  );

  return (
    <CrudMasterPage
      title="Customer"
      entityLabel="customer"
      entityLabelPlural="customers"
      apiEndpoints={API_ENDPOINTS}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Customer List"
      createLabel="Add Customer"
      codeColumnHeader="Customer Code"
      nameColumnHeader="Customer Name"
      formTitle="Customer Form"
      formDescription="Create and update customers."
      customFields={customerFormFields}
      createInitialValues={CUSTOMER_INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};

        return {
          ...CUSTOMER_INITIAL_FORM_VALUES,
          customerName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || defaults.masterName,
          customerCode:
            toDisplayValue(getFirstDefinedValue(rowSource, CUSTOMER_CODE_KEYS)) || defaults.searchCode,
          customerShort:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) ||
            defaults.masterShortName,
          customerTitle: toDisplayValue(getFirstDefinedValue(rowSource, CUSTOMER_TITLE_KEYS)),
          customerPhone1: toDisplayValue(getFirstDefinedValue(rowSource, CUSTOMER_PHONE_KEYS)),
          customerEmail: toDisplayValue(getFirstDefinedValue(rowSource, CUSTOMER_EMAIL_KEYS)),
          customerStateName: toDisplayValue(
            getFirstDefinedValue(rowSource, CUSTOMER_STATE_NAME_KEYS),
          ),
          customerStateCode: toDisplayValue(
            getFirstDefinedValue(rowSource, CUSTOMER_STATE_CODE_KEYS),
          ),
          customerAreaId: toDisplayValue(getFirstDefinedValue(rowSource, CUSTOMER_AREA_ID_KEYS)),
          customerGroupId: toDisplayValue(getFirstDefinedValue(rowSource, CUSTOMER_GROUP_ID_KEYS)),
          customerPriceLevelId:
            toDisplayValue(getFirstDefinedValue(rowSource, CUSTOMER_PRICE_LEVEL_KEYS)) || "0",
          customerCity: toDisplayValue(getFirstDefinedValue(rowSource, CUSTOMER_CITY_KEYS)),
          customerDistrict: toDisplayValue(getFirstDefinedValue(rowSource, CUSTOMER_DISTRICT_KEYS)),
          customerAddress1: toDisplayValue(getFirstDefinedValue(rowSource, CUSTOMER_ADDR1_KEYS)),
          customerCollectionDays: toCollectionDaysInput(
            getFirstDefinedValue(rowSource, CUSTOMER_COLLECTION_DAYS_KEYS),
          ),
          customerSortOrder:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) || defaults.position,
          customerIsActive: toSelectBoolean(
            getFirstDefinedValue(rowSource, CUSTOMER_IS_ACTIVE_KEYS),
            "true",
          ),
          customerNotes: toDisplayValue(getFirstDefinedValue(rowSource, CUSTOMER_NOTES_KEYS)),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const customerName = (values.customerName ?? "").trim();
        const customerCode = (values.customerCode ?? "").trim();
        const customerShort = (values.customerShort ?? "").trim();
        const customerTitle = (values.customerTitle ?? "").trim();
        const customerPhone1 = (values.customerPhone1 ?? "").trim();
        const customerEmail = (values.customerEmail ?? "").trim();
        const customerStateName = (values.customerStateName ?? "").trim();
        const customerStateCode = (values.customerStateCode ?? "").trim().toUpperCase();
        const customerAreaId = (values.customerAreaId ?? "").trim();
        const customerGroupId = (values.customerGroupId ?? "").trim();
        const customerPriceLevelId = Math.max(0, toInteger(values.customerPriceLevelId ?? "0", 0));
        const customerCity = (values.customerCity ?? "").trim();
        const customerDistrict = (values.customerDistrict ?? "").trim();
        const customerAddress1 = (values.customerAddress1 ?? "").trim();
        const customerCollectionDays = parseCollectionDays(values.customerCollectionDays ?? "");
        const customerSortOrder = Math.max(0, toInteger(values.customerSortOrder ?? "0", 0));
        const customerIsActive = (values.customerIsActive ?? "true") !== "false";
        const customerNotes = (values.customerNotes ?? "").trim();

        return {
          cusName: customerName || null,
          cusCode: customerCode || null,
          cusShort: customerShort || null,
          cusTitle: customerTitle || null,
          cusPhone1: customerPhone1 || null,
          cusEmail: customerEmail || null,
          cusStateName: customerStateName,
          cusStateCode: customerStateCode,
          cusAreaId: customerAreaId,
          cusGroupId: customerGroupId,
          cusPriceLevelId: customerPriceLevelId,
          cusCity: customerCity || null,
          cusDistrict: customerDistrict || null,
          cusAddr1: customerAddress1 || null,
          cusCollectionDays: customerCollectionDays,
          cusSortOrder: customerSortOrder,
          cusIsActive: customerIsActive,
          cusNotes: customerNotes || null,
          ...(shouldUpdate && editingItemId !== null
            ? { cusId: toUpdateCustomerId(editingItemId) }
            : {}),
        };
      }}
    />
  );
}
