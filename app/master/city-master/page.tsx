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
  list: "/cities/list",
  getById: "/cities/get",
  create: "/cities/create",
  delete: "/cities/delete",
} as const;

const STATE_LOOKUP_ENDPOINT = "/states/list";

const LOOKUP_REQUEST_QUERY = {
  page: "1",
  limit: "20",
} as const;

const LOOKUP_KEYS = {
  id: ["ctmId", "ctm_id", "city_id", "cityId", "id", "_id"],
  code: ["ctmAlias", "ctm_alias", "ctmShort", "ctm_short", "city_code", "code"],
  name: ["ctmName", "ctm_name", "city_name", "cityName", "name"],
  short: ["ctmShort", "ctm_short", "city_short", "short_name", "shortName", "short"],
  alias: ["ctmAlias", "ctm_alias", "city_alias", "alias"],
  active: ["ctmIsActive", "ctm_is_active", "active", "is_active", "isActive", "status"],
  position: ["ctmOrder", "ctm_order", "city_order", "city_sort", "position", "sort"],
  description: ["ctmAlias", "ctm_alias"],
  array: ["data", "items", "results", "rows", "list", "cities"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "ctmId",
  name: "ctmName",
  alias: "ctmAlias",
  short: "ctmShort",
  description: "ctmAlias",
  sort: "ctmOrder",
} as const;

const CITY_STATE_ID_KEYS = ["ctmStateId", "ctm_state_id", "state_id", "stateId"] as const;
const CITY_IS_ACTIVE_KEYS = ["ctmIsActive", "ctm_is_active", "isActive", "is_active", "status"] as const;
const STATE_LOOKUP_KEYS = {
  id: ["stmId", "stm_id", "state_id", "stateId", "id", "_id"],
  name: ["stmName", "stm_name", "state_name", "stateName", "name"],
  array: ["data", "items", "results", "rows", "list", "states"],
} as const;

const DEFAULT_STATE_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select State",
};

const CITY_INITIAL_FORM_VALUES = {
  masterName: "",
  masterAlias: "",
  masterShortName: "",
  cityStateId: "",
  position: "0",
  cityIsActive: "true",
} as const;

function buildCityFormFields(stateOptions: ERPDynamicSelectOption[]): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "City Name",
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "City Name must be at least 2 characters.",
      },
    },
    {
      name: "masterAlias",
      label: "Alias",
    },
    {
      name: "masterShortName",
      label: "Short Name",
    },
    {
      name: "cityStateId",
      label: "State",
      type: "select",
      searchable: true,
      required: true,
      options: stateOptions,
      placeholder: "Search state",
      validation: {
        requiredMessage: "State is required.",
      },
    },
    {
      name: "position",
      label: "Order",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Order must be 0 or greater.",
      },
    },
    {
      name: "cityIsActive",
      label: "Status",
      type: "checkbox",
      options: [
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
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

function toUpdateCityId(editingItemId: string | number | null): string {
  if (typeof editingItemId === "number" && Number.isFinite(editingItemId)) {
    return String(editingItemId);
  }

  if (typeof editingItemId === "string") {
    return editingItemId.trim();
  }

  return "";
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

function buildStateOptions(payload: unknown): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, STATE_LOOKUP_KEYS.array);

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }

    const source = row as Record<string, unknown>;
    const stateId = toDisplayValue(getFirstDefinedValue(source, STATE_LOOKUP_KEYS.id));
    if (!stateId) {
      continue;
    }

    const stateName = toDisplayValue(getFirstDefinedValue(source, STATE_LOOKUP_KEYS.name));
    if (!stateName) {
      continue;
    }

    if (!optionMap.has(stateId)) {
      optionMap.set(stateId, stateName);
    }
  }

  const sortedOptions = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));

  return [DEFAULT_STATE_OPTION, ...sortedOptions];
}

export default function CityMasterPage() {
  const { getAll: getStateLookup } = useApi<unknown>(STATE_LOOKUP_ENDPOINT);
  const [stateOptions, setStateOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_STATE_OPTION]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const payload = await getStateLookup(LOOKUP_REQUEST_QUERY);
        if (!mounted) {
          return;
        }

        setStateOptions(buildStateOptions(payload));
      } catch {
        if (mounted) {
          setStateOptions([DEFAULT_STATE_OPTION]);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [getStateLookup]);

  const cityFormFields = useMemo(() => buildCityFormFields(stateOptions), [stateOptions]);

  return (
    <CrudMasterPage
      title="City"
      entityLabel="city"
      entityLabelPlural="cities"
      apiEndpoints={API_ENDPOINTS}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="City List"
      createLabel="Add City"
      codeColumnHeader="City Code"
      nameColumnHeader="City Name"
      nameFieldLabel="City Name"
      nameFieldPlaceholder="Ahmedabad"
      formTitle="City Form"
      formDescription="Create and update cities."
      customFields={cityFormFields}
      createInitialValues={CITY_INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        return {
          ...CITY_INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || defaults.masterName,
          masterAlias:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) ||
            defaults.masterAlias,
          masterShortName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) ||
            defaults.masterShortName,
          cityStateId: toDisplayValue(getFirstDefinedValue(rowSource, CITY_STATE_ID_KEYS)),
          position:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) || defaults.position,
          cityIsActive: toSelectBoolean(
            getFirstDefinedValue(rowSource, CITY_IS_ACTIVE_KEYS),
            "true",
          ),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const cityName = (values.masterName ?? "").trim();
        const cityAlias = (values.masterAlias ?? "").trim();
        const cityShort = (values.masterShortName ?? "").trim();
        const cityStateId = (values.cityStateId ?? "").trim();
        const cityOrder = Math.max(0, toInteger(values.position ?? "0", 0));
        const cityIsActive = (values.cityIsActive ?? "true") !== "false";

        return {
          ctmName: cityName,
          ctmAlias: cityAlias || null,
          ctmShort: cityShort || null,
          ctmStateId: cityStateId,
          ctmOrder: cityOrder,
          ctmIsActive: cityIsActive,
          ...(shouldUpdate && editingItemId !== null
            ? { ctmId: toUpdateCityId(editingItemId) }
            : {}),
        };
      }}
    />
  );
}
