"use client";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage, { type CrudMasterTableRow } from "@/components/master/crud-master-page";
import type { ReusableTableColumn } from "@/components/ui/table";
import { useApi } from "@/hooks/useApi";
import InlineRelatedMasterModal from "@/features/masters/shared/inline-related-master";
import { COLLECTION_DAY_OPTIONS } from "@/utils/constant";
import { toast } from "react-toastify";
import type {
  ERPDynamicModalController,
  ERPDynamicModalSubmitPayload,
  ERPDynamicModalField,
  ERPDynamicModalVariant,
  ERPDynamicSearchShortcutPayload,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import { extractRows } from "@/features/masters/shared/normalizers";
import { getFirstDefinedValue, toDisplayValue, toSelectBoolean } from "@/features/masters/shared/value-mappers";
const API_ENDPOINTS = {
  list: "/areas/list",
  getById: "/areas/get",
  create: "/areas/create",
  delete: "/areas/delete",
} as const;
const GRID_TABLE_NAME = "area_master";
const CITY_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const CITY_GET_ENDPOINT = "/cities/get";
const CITY_UPSERT_ENDPOINT = "/cities/create";
const STATE_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const CITY_LOOKUP_REQUEST_QUERY = {
  module: "cities",
  limit: "20",
} as const;
const STATE_LOOKUP_REQUEST_QUERY = {
  module: "states",
  limit: "100",
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
const CITY_DETAIL_ARRAY_KEYS = ["data", "items", "results", "rows", "list", "cities"] as const;
const CITY_DETAIL_KEYS = {
  id: ["ctmId", "ctm_id", "city_id", "cityId", "id", "_id"],
  name: ["ctmName", "ctm_name", "city_name", "cityName", "name"],
  alias: ["ctmAlias", "ctm_alias", "city_alias", "alias"],
  short: ["ctmShort", "ctm_short", "city_short", "short_name", "shortName", "short"],
  stateId: ["ctmStateId", "ctm_state_id", "state_id", "stateId"],
  order: ["ctmOrder", "ctm_order", "order", "position", "sort"],
  active: ["ctmIsActive", "ctm_is_active", "isActive", "is_active", "status"],
} as const;
const STATE_LOOKUP_KEYS = {
  id: ["stmId", "stm_id", "state_id", "stateId", "id", "_id", "value"],
  name: ["stmName", "stm_name", "state_name", "stateName", "name", "label"],
  array: ["data", "items", "results", "rows", "list", "states"],
} as const;
const DEFAULT_CITY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select City",
};
const DEFAULT_STATE_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select State",
};
const CITY_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(42vw, 42rem)",
  maxHeight: "75vh",
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
const CITY_MODAL_INITIAL_VALUES: Record<string, string> = {
  ctmName: "",
  ctmAlias: "",
  ctmShort: "",
  ctmStateId: "",
  ctmOrder: "0",
  ctmIsActive: "true",
};
function buildAreaFormFields(
  cityOptions: ERPDynamicSelectOption[],
  onCityCreateShortcut: (payload: ERPDynamicSearchShortcutPayload) => void | Promise<void>,
  onCityEditShortcut: (payload: ERPDynamicSearchShortcutPayload) => void | Promise<void>,
): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "Area Name",
      required: true,
      colSpan: 2,
      validation: {
        minLength: 2,
        minLengthMessage: "Area Name must be at least 2 characters.",
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
      name: "areaCityId",
      label: "City",
      type: "select",
      colSpan: 2,
      searchable: true,
      required: true,
      options: cityOptions,
      onSearchCreateShortcut: onCityCreateShortcut,
      onSearchEditShortcut: onCityEditShortcut,
      placeholder: "Search city",
      validation: {
        requiredMessage: "City is required.",
      },
    },
    {
      name: "areaDistanceKm",
      label: "Distance (KM)",
      type: "number",
      colSpan: 2,
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
      type: "select",
      searchable: true,
      multiple: true,
      colSpan: 2,
      options: COLLECTION_DAY_OPTIONS,
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
    .filter((token) => Number.isInteger(token) && token >= 1 && token <= 7);
  return Array.from(new Set(parsedValues));
}
function toCollectionDaysInput(value: unknown): string {
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => (typeof entry === "number" ? entry : Number(entry)))
      .filter((entry) => Number.isInteger(entry) && entry >= 1 && entry <= 7)
      .map((entry) => String(entry));
    return Array.from(new Set(normalized)).join(",");
  }
  if (typeof value === "string") {
    return parseCollectionDays(value)
      .map((entry) => String(entry))
      .join(",");
  }
  return "";
}
function getAreaSourceValue(row: CrudMasterTableRow, keys: readonly string[]): unknown {
  if (!row.__source) {
    return undefined;
  }
  return getFirstDefinedValue(row.__source, keys);
}
function toCollectionDaysDisplay(value: unknown): string {
  const dayMap = new Map(COLLECTION_DAY_OPTIONS.map((option) => [option.value, option.label]));
  const dayValues = Array.isArray(value) ? value : parseCollectionDays(toDisplayValue(value));
  return dayValues
    .map((entry) => dayMap.get(String(entry)) ?? String(entry))
    .filter(Boolean)
    .join(", ");
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
function extractCityDetailSource(payload: unknown): Record<string, unknown> | null {
  const rows = extractRows(payload, CITY_DETAIL_ARRAY_KEYS);
  if (rows.length > 0) {
    const firstRow = rows[0];
    if (firstRow && typeof firstRow === "object" && !Array.isArray(firstRow)) {
      return firstRow as Record<string, unknown>;
    }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const objectPayload = payload as Record<string, unknown>;
  const nestedData = objectPayload.data;
  if (nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)) {
    return nestedData as Record<string, unknown>;
  }
  return objectPayload;
}
function mapCityDetailToFormValues(source: Record<string, unknown>): Record<string, string> {
  return {
    ...CITY_MODAL_INITIAL_VALUES,
    ctmName:
      toDisplayValue(getFirstDefinedValue(source, CITY_DETAIL_KEYS.name)) ||
      CITY_MODAL_INITIAL_VALUES.ctmName,
    ctmAlias:
      toDisplayValue(getFirstDefinedValue(source, CITY_DETAIL_KEYS.alias)) ||
      CITY_MODAL_INITIAL_VALUES.ctmAlias,
    ctmShort:
      toDisplayValue(getFirstDefinedValue(source, CITY_DETAIL_KEYS.short)) ||
      CITY_MODAL_INITIAL_VALUES.ctmShort,
    ctmStateId:
      toDisplayValue(getFirstDefinedValue(source, CITY_DETAIL_KEYS.stateId)) ||
      CITY_MODAL_INITIAL_VALUES.ctmStateId,
    ctmOrder:
      toDisplayValue(getFirstDefinedValue(source, CITY_DETAIL_KEYS.order)) ||
      CITY_MODAL_INITIAL_VALUES.ctmOrder,
    ctmIsActive: toSelectBoolean(
      getFirstDefinedValue(source, CITY_DETAIL_KEYS.active),
      CITY_MODAL_INITIAL_VALUES.ctmIsActive === "true" ? "true" : "false",
    ),
  };
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
function buildCityModalFields(stateOptions: ERPDynamicSelectOption[]): ERPDynamicModalField[] {
  return [
    {
      name: "ctmName",
      label: "City Name",
      colSpan: 2,
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "City Name must be at least 2 characters.",
      },
    },
    {
      name: "ctmAlias",
      label: "Alias",
      colSpan: 2,
    },
    {
      name: "ctmShort",
      label: "Short Name",
      colSpan: 2,
    },
    {
      name: "ctmStateId",
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
      name: "ctmOrder",
      label: "Order",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Order must be 0 or greater.",
      },
    },
    {
      name: "ctmIsActive",
      label: "Status",
      type: "checkbox",
      options: [
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
    },
  ];
}
export default function AreaMasterPage() {
  const cityModalControllerRef = useRef<ERPDynamicModalController | null>(null);
  const { getAll: getCityLookup } = useApi<unknown>(CITY_LOOKUP_ENDPOINT);
  const {
    getAll: getCityById,
    loading: cityDetailsLoading,
    error: cityDetailsError,
    reset: resetCityDetailsState,
  } = useApi<unknown>(CITY_GET_ENDPOINT, {
    toast: {
      success: false,
    },
  });
  const {
    run: upsertCity,
    loading: citySaveLoading,
    error: citySaveError,
    reset: resetCitySaveState,
  } = useApi<unknown, Record<string, unknown>>(CITY_UPSERT_ENDPOINT, {
    method: "POST",
  });
  const { getAll: getStateLookup } = useApi<unknown>(STATE_LOOKUP_ENDPOINT);
  const [cityOptions, setCityOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_CITY_OPTION]);
  const [stateOptions, setStateOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_STATE_OPTION]);
  const [editingCityId, setEditingCityId] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const [cityPayload, statePayload] = await Promise.all([
          getCityLookup(CITY_LOOKUP_REQUEST_QUERY),
          getStateLookup(STATE_LOOKUP_REQUEST_QUERY),
        ]);
        if (!mounted) {
          return;
        }
        setCityOptions(buildCityOptions(cityPayload));
        setStateOptions(buildStateOptions(statePayload));
      } catch {
        if (mounted) {
          setCityOptions([DEFAULT_CITY_OPTION]);
          setStateOptions([DEFAULT_STATE_OPTION]);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getCityLookup, getStateLookup]);
  const cityModalFields = useMemo(() => buildCityModalFields(stateOptions), [stateOptions]);
  const cityModalVariants = useMemo<ERPDynamicModalVariant[]>(
    () => [
      {
        key: "city-create",
        cardTitle: "Create City",
        cardDescription: "Create a new city.",
        cardButtonLabel: "Create",
        modalTitle: "New City",
        modalDescription: "Create city from area form.",
        submitLabel: citySaveLoading ? "Saving..." : "Save",
        accent: "blue",
        fields: cityModalFields,
      },
      {
        key: "city-update",
        cardTitle: "Update City",
        cardDescription: "Update existing city.",
        cardButtonLabel: "Update",
        modalTitle: "Edit City",
        modalDescription: "Update city from area form.",
        submitLabel: citySaveLoading ? "Updating..." : "Update",
        accent: "emerald",
        fields: cityModalFields,
      },
    ],
    [cityModalFields, citySaveLoading],
  );
  const refreshCityOptions = useCallback(async () => {
    const payload = await getCityLookup(CITY_LOOKUP_REQUEST_QUERY);
    setCityOptions(buildCityOptions(payload));
  }, [getCityLookup]);
  const resolveCityOptionFromShortcut = useCallback(
    (payload: ERPDynamicSearchShortcutPayload): ERPDynamicSelectOption | null => {
      const selectedValue = payload.value.trim();
      if (selectedValue) {
        const selectedOption = cityOptions.find((option) => option.value === selectedValue);
        if (selectedOption) {
          return selectedOption;
        }
      }
      const normalizedQuery = payload.query.trim().toLowerCase();
      if (!normalizedQuery) {
        return null;
      }
      const exactMatch = cityOptions.find((option) => {
        const label = option.label.trim().toLowerCase();
        const value = option.value.trim().toLowerCase();
        return label === normalizedQuery || value === normalizedQuery;
      });
      if (exactMatch) {
        return exactMatch;
      }
      const startsWithMatch = cityOptions.find((option) =>
        option.label.trim().toLowerCase().startsWith(normalizedQuery),
      );
      if (startsWithMatch) {
        return startsWithMatch;
      }
      return (
        cityOptions.find((option) =>
          option.label.trim().toLowerCase().includes(normalizedQuery),
        ) ?? null
      );
    },
    [cityOptions],
  );
  const handleCityCreateShortcut = useCallback(
    (payload: ERPDynamicSearchShortcutPayload) => {
      resetCitySaveState();
      resetCityDetailsState();
      setEditingCityId(null);
      cityModalControllerRef.current?.openModal("city-create", {
        values: {
          ...CITY_MODAL_INITIAL_VALUES,
          ctmName: payload.query.trim(),
        },
      });
    },
    [resetCityDetailsState, resetCitySaveState],
  );
  const handleCityEditShortcut = useCallback(
    async (payload: ERPDynamicSearchShortcutPayload) => {
      const matchedOption = resolveCityOptionFromShortcut(payload);
      if (!matchedOption) {
        toast.info("Type/select an existing city, then press Alt+A.");
        return;
      }
      const matchedCityId = matchedOption.value.trim();
      if (!matchedCityId) {
        toast.info("Select an existing city to edit.");
        return;
      }
      resetCitySaveState();
      resetCityDetailsState();
      setEditingCityId(matchedCityId);
      try {
        const detailPayload = await getCityById({
          ctmId: matchedCityId,
        });
        const detailSource = extractCityDetailSource(detailPayload);
        cityModalControllerRef.current?.openModal("city-update", {
          values: detailSource
            ? mapCityDetailToFormValues(detailSource)
            : {
                ...CITY_MODAL_INITIAL_VALUES,
                ctmName: matchedOption.label,
              },
        });
      } catch {
        // Error UI is handled by useApi.
      }
    },
    [
      getCityById,
      resetCityDetailsState,
      resetCitySaveState,
      resolveCityOptionFromShortcut,
    ],
  );
  const handleCityModalSubmit = useCallback(
    async ({ variantKey, values }: ERPDynamicModalSubmitPayload) => {
      const isUpdate = variantKey === "city-update";
      const payload: Record<string, unknown> = {
        ctmName: (values.ctmName ?? "").trim(),
        ctmAlias: (values.ctmAlias ?? "").trim() || null,
        ctmShort: (values.ctmShort ?? "").trim() || null,
        ctmStateId: (values.ctmStateId ?? "").trim(),
        ctmOrder: Math.max(0, toInteger(values.ctmOrder ?? "0", 0)),
        ctmIsActive: (values.ctmIsActive ?? "true") !== "false",
      };
      if (isUpdate) {
        if (!editingCityId) {
          return;
        }
        payload.ctmId = editingCityId;
      }
      await upsertCity({ body: payload });
      setEditingCityId(null);
      await refreshCityOptions();
    },
    [editingCityId, refreshCityOptions, upsertCity],
  );
  const handleCityModalCancel = useCallback(() => {
    if (citySaveLoading || cityDetailsLoading) {
      return;
    }
    resetCitySaveState();
    resetCityDetailsState();
    setEditingCityId(null);
  }, [cityDetailsLoading, citySaveLoading, resetCityDetailsState, resetCitySaveState]);
  const areaFormFields = useMemo(
    () => buildAreaFormFields(cityOptions, handleCityCreateShortcut, handleCityEditShortcut),
    [cityOptions, handleCityCreateShortcut, handleCityEditShortcut],
  );
  const cityOptionLabelMap = useMemo(
    () => new Map(cityOptions.map((option) => [option.value, option.label])),
    [cityOptions],
  );
  const customTableColumns = useMemo<ReusableTableColumn<CrudMasterTableRow>[]>(
    () => [
       {
        key: "serialNo",
        header: "S.No",
        accessor: "serialNo",
        width: "12px",
        sortable: false,
      },
      {
        key: "areaName",
        header: "Area name",
        accessor: "masterName",
        width: "220px",
      },
      {
        key: "areaAlias",
        header: "Area alias",
        accessor: "masterAlias",
        width: "140px",
      },
      {
        key: "areaShort",
        header: "Area short",
        accessor: "masterShort",
        width: "140px",
      },
      {
        key: "areaCity",
        header: "AREA citys",
        width: "180px",
        render: (row) => {
          const cityId = toDisplayValue(getAreaSourceValue(row, AREA_CITY_ID_KEYS));
          return cityOptionLabelMap.get(cityId) || cityId || "-";
        },
        sortAccessor: (row) => {
          const cityId = toDisplayValue(getAreaSourceValue(row, AREA_CITY_ID_KEYS));
          return cityOptionLabelMap.get(cityId) || cityId;
        },
        searchAccessor: (row) => {
          const cityId = toDisplayValue(getAreaSourceValue(row, AREA_CITY_ID_KEYS));
          return `${cityOptionLabelMap.get(cityId) || ""} ${cityId}`.trim();
        },
      },
      {
        key: "areaSort",
        header: "Area sort",
        accessor: "position",
        width: "96px",
      },
      {
        key: "areaDistanceKm",
        header: "AREA distance",
        width: "120px",
        render: (row) => toDisplayValue(getAreaSourceValue(row, AREA_DISTANCE_KEYS)) || "-",
        sortAccessor: (row) => Number(getAreaSourceValue(row, AREA_DISTANCE_KEYS) ?? 0),
        searchAccessor: (row) => toDisplayValue(getAreaSourceValue(row, AREA_DISTANCE_KEYS)),
      },
      {
        key: "areaCollectionDays",
        header: "Area collectiuon days",
        width: "180px",
        render: (row) =>
          toCollectionDaysDisplay(getAreaSourceValue(row, AREA_COLLECTION_DAYS_KEYS)) || "-",
        sortAccessor: (row) =>
          toCollectionDaysDisplay(getAreaSourceValue(row, AREA_COLLECTION_DAYS_KEYS)),
        searchAccessor: (row) =>
          toCollectionDaysDisplay(getAreaSourceValue(row, AREA_COLLECTION_DAYS_KEYS)),
      },
    ],
    [cityOptionLabelMap],
  );
  return (
    <>
      <CrudMasterPage
        title="Area"
        auditHistory={{ screenName: "Area Master" }}
        entityLabel="area"
        entityLabelPlural="areas"
        apiEndpoints={API_ENDPOINTS}
        gridTableName={GRID_TABLE_NAME}
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
        customTableColumns={customTableColumns}
        createInitialValues={AREA_INITIAL_FORM_VALUES}
        mapFormValues={({ source, defaults }) => {
          const rowSource = source ?? {};
          return {
                        ...AREA_INITIAL_FORM_VALUES,
            masterName:
              toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) ||
              defaults.masterName,
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
              toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) ||
              defaults.position,
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
      <InlineRelatedMasterModal
        title="City Form"
        description="Create and update cities."
        variants={cityModalVariants}
        submitError={citySaveError || cityDetailsError}
        panelStyle={CITY_MODAL_PANEL_STYLE}
        controllerRef={cityModalControllerRef}
        onSubmit={handleCityModalSubmit}
        onCancel={handleCityModalCancel}
      />
    </>
  );
}
