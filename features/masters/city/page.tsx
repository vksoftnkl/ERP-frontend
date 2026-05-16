"use client";
import { useEffect, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import { extractRows } from "@/features/masters/shared/normalizers";
import { getFirstDefinedValue, toDisplayValue, toSelectBoolean } from "@/features/masters/shared/value-mappers";
const API_ENDPOINTS = {
  list: "/cities/list",
  getById: "/cities/get",
  create: "/cities/create",
  delete: "/cities/delete",
} as const;
const GRID_TABLE_NAME = "city_master";
const STATE_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const LOOKUP_REQUEST_QUERY = {
  module: "states",
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
      colSpan: 2,
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "City Name must be at least 2 characters.",
      },
    },
    {
      name: "masterAlias",
      label: "Alias",
      colSpan: 2,
    },
    {
      name: "masterShortName",
      label: "Short Name",
      colSpan: 2,
    },
    {
      name: "cityStateId",
      label: "State",
      type: "select",
      colSpan: 2,
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
function toInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
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
      auditHistory={{ screenName: "City Master" }}
      entityLabel="city"
      entityLabelPlural="cities"
      apiEndpoints={API_ENDPOINTS}
      gridTableName={GRID_TABLE_NAME}
      useResponseTableColumns
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
