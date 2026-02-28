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
  list: "/areas/list",
  getById: "/areas/get",
  create: "/areas/create",
  delete: "/areas/delete",
} as const;

const CITY_LOOKUP_ENDPOINT = "/cities/list";

const LOOKUP_REQUEST_QUERY = {
  page: "1",
  limit: "20",
} as const;

const LOOKUP_KEYS = {
  id: ["armId", "arm_id", "area_id", "areaId", "id", "_id"],
  code: ["armAlias", "arm_alias", "armShort", "arm_short", "area_code", "code"],
  name: ["armName", "arm_name", "area_name", "areaName", "name"],
  short: ["armShort", "arm_short", "area_short", "short_name", "shortName", "short"],
  alias: ["armAlias", "arm_alias", "area_alias", "alias"],
  active: ["armIsActive", "arm_is_active", "active", "is_active", "isActive", "status"],
  position: ["armSort", "arm_sort", "area_sort", "position", "sort"],
  description: ["armAlias", "arm_alias"],
  array: ["data", "items", "results", "rows", "list", "areas"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "armId",
  name: "armName",
  alias: "armAlias",
  short: "armShort",
  description: "armAlias",
  sort: "armSort",
} as const;

const AREA_CITY_ID_KEYS = ["armCityId", "arm_city_id", "city_id", "cityId"] as const;
const AREA_DISTANCE_KEYS = ["armDistanceKm", "arm_distance_km", "distance_km", "distanceKm"] as const;
const AREA_COLLECTION_DAYS_KEYS = [
  "armCollectionDays",
  "arm_collection_days",
  "collection_days",
  "collectionDays",
] as const;
const AREA_IS_ACTIVE_KEYS = ["armIsActive", "arm_is_active", "isActive", "is_active", "status"] as const;

const CITY_LOOKUP_KEYS = {
  id: ["ctmId", "ctm_id", "city_id", "cityId", "id", "_id"],
  name: ["ctmName", "ctm_name", "city_name", "cityName", "name"],
  array: ["data", "items", "results", "rows", "list", "cities"],
} as const;

const DEFAULT_CITY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select City",
};

const AREA_INITIAL_FORM_VALUES = {
  masterName: "",
  masterAlias: "",
  masterShortName: "",
  areaCityId: "",
  areaDistanceKm: "",
  areaCollectionDays: "",
  position: "0",
  areaIsActive: "true",
} as const;

function buildAreaFormFields(cityOptions: ERPDynamicSelectOption[]): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "Area Name",
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Area Name must be at least 2 characters.",
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
      name: "areaCityId",
      label: "City",
      type: "select",
      searchable: true,
      required: true,
      options: cityOptions,
      placeholder: "Search city",
      validation: {
        requiredMessage: "City is required.",
      },
    },
    {
      name: "areaDistanceKm",
      label: "Distance (KM)",
      type: "number",
      min: 0,
      step: 1,
      placeholder: "0",
      validation: {
        minMessage: "Distance must be 0 or greater.",
      },
    },
    {
      name: "areaCollectionDays",
      label: "Collection Days",
      placeholder: "1,3,5",
      helperText: "Comma-separated day numbers.",
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
      name: "areaIsActive",
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

function toNullableInteger(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, parsed);
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

function toCollectionDaysInput(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .filter((entry) => typeof entry === "number" && Number.isFinite(entry))
    .map((entry) => String(entry))
    .join(",");
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

function toUpdateAreaId(editingItemId: string | number | null): string {
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

function buildCityOptions(payload: unknown): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, CITY_LOOKUP_KEYS.array);

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }

    const source = row as Record<string, unknown>;
    const cityId = toDisplayValue(getFirstDefinedValue(source, CITY_LOOKUP_KEYS.id));
    if (!cityId) {
      continue;
    }

    const cityName = toDisplayValue(getFirstDefinedValue(source, CITY_LOOKUP_KEYS.name));
    if (!cityName) {
      continue;
    }

    if (!optionMap.has(cityId)) {
      optionMap.set(cityId, cityName);
    }
  }

  const sortedOptions = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));

  return [DEFAULT_CITY_OPTION, ...sortedOptions];
}

export default function AreaMasterPage() {
  const { getAll: getCityLookup } = useApi<unknown>(CITY_LOOKUP_ENDPOINT);
  const [cityOptions, setCityOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_CITY_OPTION]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const payload = await getCityLookup(LOOKUP_REQUEST_QUERY);
        if (!mounted) {
          return;
        }

        setCityOptions(buildCityOptions(payload));
      } catch {
        if (mounted) {
          setCityOptions([DEFAULT_CITY_OPTION]);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [getCityLookup]);

  const areaFormFields = useMemo(() => buildAreaFormFields(cityOptions), [cityOptions]);

  return (
    <CrudMasterPage
      title="Area"
      entityLabel="area"
      entityLabelPlural="areas"
      apiEndpoints={API_ENDPOINTS}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Area List"
      createLabel="Add Area"
      codeColumnHeader="Area Code"
      nameColumnHeader="Area Name"
      nameFieldLabel="Area Name"
      nameFieldPlaceholder="Navrangpura"
      formTitle="Area Form"
      formDescription="Create and update areas."
      customFields={areaFormFields}
      createInitialValues={AREA_INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};

        return {
          ...AREA_INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || defaults.masterName,
          masterAlias:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) ||
            defaults.masterAlias,
          masterShortName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) ||
            defaults.masterShortName,
          areaCityId: toDisplayValue(getFirstDefinedValue(rowSource, AREA_CITY_ID_KEYS)),
          areaDistanceKm: toDisplayValue(getFirstDefinedValue(rowSource, AREA_DISTANCE_KEYS)),
          areaCollectionDays: toCollectionDaysInput(
            getFirstDefinedValue(rowSource, AREA_COLLECTION_DAYS_KEYS),
          ),
          position:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) || defaults.position,
          areaIsActive: toSelectBoolean(
            getFirstDefinedValue(rowSource, AREA_IS_ACTIVE_KEYS),
            "true",
          ),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const areaName = (values.masterName ?? "").trim();
        const areaAlias = (values.masterAlias ?? "").trim();
        const areaShort = (values.masterShortName ?? "").trim();
        const areaCityId = (values.areaCityId ?? "").trim();
        const areaSort = Math.max(0, toInteger(values.position ?? "0", 0));
        const areaDistanceKm = toNullableInteger(values.areaDistanceKm ?? "");
        const areaCollectionDays = parseCollectionDays(values.areaCollectionDays ?? "");
        const areaIsActive = (values.areaIsActive ?? "true") !== "false";

        return {
          armName: areaName,
          armAlias: areaAlias || null,
          armShort: areaShort || null,
          armCityId: areaCityId,
          armSort: areaSort,
          armDistanceKm: areaDistanceKm,
          armCollectionDays: areaCollectionDays,
          armIsActive: areaIsActive,
          ...(shouldUpdate && editingItemId !== null
            ? { armId: toUpdateAreaId(editingItemId) }
            : {}),
        };
      }}
    />
  );
}
