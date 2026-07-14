"use client";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import InlineRelatedMasterModal from "@/features/masters/shared/inline-related-master";
import { COLLECTION_DAY_OPTIONS } from "@/utils/constant";
import { toast } from "react-toastify";
import {
  ERPDynamicModalForm,
  type ERPDynamicModalController,
  type ERPDynamicModalSubmitPayload,
  type ERPDynamicModalField,
  type ERPDynamicModalVariant,
  type ERPDynamicSearchShortcutPayload,
  type ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import WidgetVisibilityTree, {
  type WidgetTreeSectionView,
} from "@/features/masters/shared/widget-visibility-tree";
import {
  applyWidgetFieldConfig,
  buildControllableFieldNames,
  buildWidgetFieldConfig,
  type ResolvedFieldConfig,
  type WidgetMasterSectionConfig,
  type WidgetMastersResponse,
} from "@/features/masters/shared/widget-config";
import styles from "@/app/master/state-master/page.module.scss";
import { extractRows } from "@/features/masters/shared/normalizers";
import { getFirstDefinedValue, toDisplayValue, toSelectBoolean } from "@/features/masters/shared/value-mappers";
const API_ENDPOINTS = {
  list: "/configured-grid-sql/run?grid_id=3",
  getById: "/areas/get",
  create: "/areas/create",
  delete: "/areas/delete",
} as const;
const GRID_TABLE_NAME = "area_master";
// The form fields below are re-labelled, re-ordered, and shown/hidden from the
// backend widget-masters config (fixed.form_section / form_field) for this
// screen's menu id. Only those three properties come from the API — validation,
// state shape, and submit logic stay defined locally.
const WIDGET_CONFIG_ENDPOINT = "/widget-masters/get";
const WIDGET_SECTION_MENU_ID = 20;
// Matches the section_platform stored for this menu (case-sensitive equality on
// the server), so the config actually resolves rather than silently no-opping.
const WIDGET_SECTION_PLATFORM = "Web";
// Bridge each hardcoded form field `name` (camelCase aliases used by form state
// and the submit payload) to the backend `fieldName` it is configured under
// (area_* column-style keys, matched case-insensitively). Form fields with no
// mapping — or no matching response entry — keep their hardcoded label and
// render after all configured fields.
const WIDGET_FIELD_NAME_BY_FORM_FIELD: Record<string, string> = {
  masterName: "area_name",
  masterAlias: "area_alias",
  masterShortName: "area_short",
  areaCityId: "area_city",
  areaDistanceKm: "area_distance",
  areaCollectionDays: "area_collection_days",
  position: "area_sort",
  areaIsActive: "area_is_active",
};
// Right-clicking inside the open create/update modal opens a tree popup of this
// menu's configured sections/fields (GET /widget-masters/config?menu_id=…).
// Ticking a field toggles its live visibility in the form via the same config map.
const WIDGET_CONFIG_TREE_ENDPOINT = "/widget-masters/config";
// Persists the tree's section/field visibility back to the server (PATCH).
const WIDGET_VISIBILITY_ENDPOINT = "/widget-masters/visibility";
// Backend fieldNames (lowercased) that map to a real form field, so their popup
// checkbox can actually show/hide something. Others render read-only ("not on form").
const WIDGET_CONTROLLABLE_FIELD_NAMES = buildControllableFieldNames(WIDGET_FIELD_NAME_BY_FORM_FIELD);
const CITY_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-masters";
const CITY_GET_ENDPOINT = "/cities/get";
const CITY_UPSERT_ENDPOINT = "/cities/create";
const STATE_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-masters";
const CITY_LOOKUP_REQUEST_QUERY = {
  module: "cities",
} as const;
const STATE_LOOKUP_REQUEST_QUERY = {
  module: "states",
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

  // Silent progressive enhancement: a failed config fetch leaves the form on its
  // hardcoded labels/order (empty map), so don't nag the user with an error toast.
  const { getAll: getWidgetConfig } = useApi<WidgetMastersResponse>(WIDGET_CONFIG_ENDPOINT, {
    toast: { error: false },
  });
  const [widgetFieldConfig, setWidgetFieldConfig] = useState<Map<string, ResolvedFieldConfig>>(
    () => new Map(),
  );
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const payload = await getWidgetConfig({
          sectionMenuId: String(WIDGET_SECTION_MENU_ID),
          sectionPlatform: WIDGET_SECTION_PLATFORM,
        });
        if (!mounted) {
          return;
        }
        setWidgetFieldConfig(buildWidgetFieldConfig(payload ?? null));
      } catch {
        if (mounted) {
          setWidgetFieldConfig(new Map());
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getWidgetConfig]);

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
        accent: "primary",
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
  // Re-label/re-order/show-hide the dynamically-built fields (the City select
  // options + inline create/edit shortcuts) from the resolved widget config.
  const areaFormFields = useMemo(
    () =>
      applyWidgetFieldConfig(
        buildAreaFormFields(cityOptions, handleCityCreateShortcut, handleCityEditShortcut),
        widgetFieldConfig,
        WIDGET_FIELD_NAME_BY_FORM_FIELD,
      ),
    [cityOptions, handleCityCreateShortcut, handleCityEditShortcut, widgetFieldConfig],
  );
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted areas. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 3's stored SQL; keys with no matching token are ignored. `wantdelete` is
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

  // Right-click config tree popup over the create/update modal.
  const { getAll: getWidgetConfigTree } = useApi<WidgetMastersResponse>(
    WIDGET_CONFIG_TREE_ENDPOINT,
    { toast: { error: false } },
  );
  const { run: saveVisibility, loading: savingVisibility } = useApi(WIDGET_VISIBILITY_ENDPOINT, {
    method: "PATCH",
  });
  const [configSections, setConfigSections] = useState<WidgetMasterSectionConfig[]>([]);
  // Section-level visibility overrides keyed by sectionId; falls back to the
  // fetched sectionVisibility until the user toggles a section.
  const [sectionVisibility, setSectionVisibility] = useState<Map<number, boolean>>(() => new Map());
  // Edited secondary text keyed by fieldId; falls back to the fetched value.
  const [secondaryTextById, setSecondaryTextById] = useState<Map<number, string>>(() => new Map());
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const treeLoadedRef = useRef(false);
  const visibilityControllerRef = useRef<ERPDynamicModalController | null>(null);

  // Fetched lazily the first time the popup is opened, then cached.
  const loadConfigTree = useCallback(async () => {
    if (treeLoadedRef.current) {
      return;
    }
    treeLoadedRef.current = true;
    setTreeLoading(true);
    setTreeError(null);
    try {
      const payload = await getWidgetConfigTree({ menu_id: String(WIDGET_SECTION_MENU_ID) });
      setConfigSections(Array.isArray(payload?.data) ? payload.data : []);
    } catch {
      treeLoadedRef.current = false;
      setTreeError("Unable to load field configuration.");
    } finally {
      setTreeLoading(false);
    }
  }, [getWidgetConfigTree]);

  // Hijack right-clicks that land inside the open create/update modal only; clicks
  // elsewhere keep the browser's native context menu. Opens the Visible Settings
  // modal (an ERPDynamicModalForm) on top via its controller.
  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[role="dialog"][aria-modal="true"]')) {
        return;
      }
      event.preventDefault();
      void loadConfigTree();
      visibilityControllerRef.current?.openModal("visibility");
    };
    window.addEventListener("contextmenu", handleContextMenu);
    return () => window.removeEventListener("contextmenu", handleContextMenu);
  }, [loadConfigTree]);

  const handleToggleField = useCallback((backendName: string, checked: boolean) => {
    const key = backendName.toLowerCase();
    setWidgetFieldConfig((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      next.set(
        key,
        existing
          ? { ...existing, visible: checked }
          : { label: "", order: Number.MAX_SAFE_INTEGER, visible: checked },
      );
      return next;
    });
  }, []);

  const handleToggleSection = useCallback((sectionId: number, checked: boolean) => {
    setSectionVisibility((prev) => {
      const next = new Map(prev);
      next.set(sectionId, checked);
      return next;
    });
  }, []);

  const handleChangeSecondaryText = useCallback((fieldId: number, value: string) => {
    setSecondaryTextById((prev) => {
      const next = new Map(prev);
      next.set(fieldId, value);
      return next;
    });
  }, []);

  // Build the tree view from the /config payload, deriving each checkbox from the
  // live form visibility map so the popup and the rendered form stay in sync.
  const treeSections = useMemo<WidgetTreeSectionView[]>(
    () =>
      configSections.map((section) => ({
        sectionId: section.sectionId,
        label: section.sectionGuiName?.trim() || section.sectionName || "Section",
        visible: sectionVisibility.get(section.sectionId) ?? section.sectionVisibility !== false,
        fields: (Array.isArray(section.fields) ? section.fields : []).map((field) => {
          const key = (field.fieldName ?? "").trim().toLowerCase();
          const configEntry = widgetFieldConfig.get(key);
          return {
            fieldId: field.fieldId,
            fieldName: field.fieldName,
            label: (field.fieldGuiName ?? "").trim() || field.fieldName,
            secondaryText: secondaryTextById.get(field.fieldId) ?? (field.fieldSecondaryText ?? ""),
            checked: configEntry ? configEntry.visible : field.fieldVisibility !== false,
            controllable: WIDGET_CONTROLLABLE_FIELD_NAMES.has(key),
          };
        }),
      })),
    [configSections, sectionVisibility, secondaryTextById, widgetFieldConfig],
  );

  // PATCH the current section/field visibility for every configured field back to
  // the server in the documented { data: [{ sectionId, sectionGuiName,
  // sectionVisibility, fields: [{ fieldId, fieldSecondaryText, fieldVisibility }] }] }
  // shape. Throws on failure so the hosting modal stays open (useApi toasts the error);
  // on success it resolves and the modal closes itself. sectionGuiName and
  // fieldSecondaryText are coerced to non-null strings — the server DTO requires a
  // string (sectionGuiName is also @IsNotEmpty) and rejects the null an unset config
  // value carries.
  const handleVisibilitySubmit = useCallback(async () => {
    const payload = {
      data: configSections.map((section) => ({
        sectionId: section.sectionId,
        sectionGuiName: section.sectionGuiName?.trim() || section.sectionName || "Section",
        sectionVisibility: sectionVisibility.get(section.sectionId) ?? section.sectionVisibility !== false,
        fields: (Array.isArray(section.fields) ? section.fields : []).map((field) => {
          const key = (field.fieldName ?? "").trim().toLowerCase();
          const configEntry = widgetFieldConfig.get(key);
          return {
            fieldId: field.fieldId,
            fieldSecondaryText: secondaryTextById.get(field.fieldId) ?? field.fieldSecondaryText ?? "",
            fieldVisibility: configEntry ? configEntry.visible : field.fieldVisibility !== false,
          };
        }),
      })),
    };
    await saveVisibility({ body: payload });
  }, [configSections, sectionVisibility, secondaryTextById, widgetFieldConfig, saveVisibility]);

  // While the Visible Settings modal is open, intercept Escape/F5 in the capture
  // phase so they act on it alone — without this, the underlying create/update
  // modal's window-level Escape would also fire and close both. F5 mirrors the
  // legacy "Save (F5)" shortcut.
  useEffect(() => {
    if (!visibilityModalOpen) {
      return;
    }
    const handleKeyDownCapture = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        visibilityControllerRef.current?.closeModal();
      } else if (event.key === "F5") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!savingVisibility) {
          void handleVisibilitySubmit()
            .then(() => visibilityControllerRef.current?.closeModal())
            .catch(() => {
              // Error toast handled by useApi; keep the modal open to retry.
            });
        }
      }
    };
    window.addEventListener("keydown", handleKeyDownCapture, true);
    return () => window.removeEventListener("keydown", handleKeyDownCapture, true);
  }, [visibilityModalOpen, savingVisibility, handleVisibilitySubmit]);

  // The Visible Settings modal hosts the whole tree as a single custom field so it
  // reuses the standard ERP modal chrome (header, backdrop, Save/Cancel footer).
  const visibilityVariant = useMemo<ERPDynamicModalVariant>(
    () => ({
      key: "visibility",
      cardTitle: "Visible Settings",
      cardDescription: "",
      cardButtonLabel: "Open",
      modalTitle: "Visible Settings",
      submitLabel: "Save (F5)",
      fields: [
        {
          name: "visibilityTree",
          label: "",
          type: "custom",
          colSpan: 2,
          render: () => (
            <WidgetVisibilityTree
              sections={treeSections}
              loading={treeLoading}
              error={treeError}
              disabled={savingVisibility}
              onToggleSection={handleToggleSection}
              onToggleField={handleToggleField}
              onChangeSecondaryText={handleChangeSecondaryText}
            />
          ),
        },
      ],
    }),
    [
      treeSections,
      treeLoading,
      treeError,
      savingVisibility,
      handleToggleSection,
      handleToggleField,
      handleChangeSecondaryText,
    ],
  );

  return (
    <>
      <CrudMasterPage
        title="Area"
        iconName="area_master"
        auditHistory={{ screenName: "Area Master" }}
        entityLabel="area"
        entityLabelPlural="areas"
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
        lookupKeys={LOOKUP_KEYS}
        requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
        styles={styles}
        listTitle="Area List"
        createLabel="Add Area"
        codeColumnHeader="Area Code"
        nameColumnHeader="Area Name"
        nameFieldLabel="Area Name"
        createModalTitle="Area Entry"
        editModalTitle="Edit Area Entry"
        nameFieldPlaceholder="Navrangpura"
        listSubtitleOverride="Manage areas"
        formTitle="Area Form"
        formDescription="Create and update areas."
        customFields={areaFormFields}
        columnRenderOverrides={{
          arm_collection_days: (row) =>
            toCollectionDaysDisplay(row.__source?.arm_collection_days) || "-",
        }}
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
      <ERPDynamicModalForm
        title="Visible Settings"
        variants={[visibilityVariant]}
        showDefaultCards={false}
        hideSectionHeader
        resetOnSubmit={false}
        panelStyle={{ width: "min(680px, calc(100vw - 2rem))", maxHeight: "min(82vh, 620px)" }}
        onControllerReady={(controller) => {
          visibilityControllerRef.current = controller;
        }}
        onOpenChange={(open) => setVisibilityModalOpen(open)}
        onSubmit={() => handleVisibilitySubmit()}
      />
    </>
  );
}
