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
  list: "/units/list",
  getById: "/units/get",
  create: "/units/create",
  delete: "/units/delete",
} as const;

const LOOKUP_KEYS = {
  id: [
    "unit_id",
    "unitId",
    "id",
    "_id",
    "itu_id",
    "itemunitid",
    "item_unit_id",
    "itemUnitId",
    "uom_id",
  ],
  code: [
    "unit_code",
    "unitCode",
    "code",
    "itu_alias",
    "itu_short",
    "unitalias",
    "unitshort",
    "uom_code",
  ],
  name: [
    "unit_name",
    "unitName",
    "name",
    "itu_name",
    "itemunitname",
    "item_unit_name",
    "itemUnitName",
    "uom_name",
  ],
  short: [
    "itu_short",
    "short_name",
    "shortName",
    "short",
    "unitshort",
    "itemunitshort",
    "item_unit_short",
    "uom_short",
  ],
  alias: [
    "itu_alias",
    "alias",
    "unit_alias",
    "unitalias",
    "itemunitalias",
    "item_unit_alias",
  ],
  active: ["itu_active", "active", "is_active", "isActive", "isactive", "status"],
  position: ["position", "itu_sort", "sort"],
  description: ["itu_description", "unit_description", "description", "desc"],
  array: ["data", "items", "results", "rows", "list", "units", "itemUnits"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "unit_id",
  name: "unit_name",
  alias: "unit_alias",
  short: "unit_short",
  description: "unit_description",
  sort: "unit_sort",
} as const;

const UNIT_CODE_FORM_KEYS = ["unit_code", "unitCode", "code", "uom_code"] as const;
const UNIT_DECIMAL_COUNT_KEYS = [
  "unit_decimal_count",
  "unitDecimalCount",
  "decimal_count",
  "decimalCount",
] as const;
const UNIT_WEIGHT_KEYS = ["unit_weight", "unitWeight", "weight"] as const;
const UNIT_LOADING_KEYS = ["unit_loading", "unitLoading", "loading"] as const;
const UNIT_UNLOADING_KEYS = ["unit_unloading", "unitUnloading", "unloading"] as const;
const UNIT_ATTACH_CHARGE_KEYS = ["unit_attach_charge", "unitAttachCharge", "attach_charge"] as const;
const UNIT_IS_PACK_UNIT_KEYS = [
  "unit_is_pack_unit",
  "unitIsPackUnit",
  "is_pack_unit",
  "isPackUnit",
] as const;
const UNIT_BASE_UNIT_ID_KEYS = [
  "unit_base_unit_id",
  "unitBaseUnitId",
  "base_unit_id",
  "baseUnitId",
] as const;
const UNIT_CONVERSION_KEYS = ["unit_conversion", "unitConversion", "conversion"] as const;
const UNIT_IS_ACTIVE_KEYS = ["unit_is_active", "unitIsActive", "is_active", "isActive", "status"] as const;

const UNIT_INITIAL_FORM_VALUES = {
  unitName: "",
  unitCode: "",
  unitAlias: "",
  unitDescription: "",
  unitDecimalCount: "0",
  unitWeight: "",
  unitLoading: "",
  unitUnloading: "",
  unitAttachCharge: "",
  unitIsPackUnit: "false",
  unitBaseUnitId: "",
  unitConversion: "",
  unitIsActive: "true",
} as const;

function buildUnitFormFields(baseUnitOptions: ERPDynamicSelectOption[]): ERPDynamicModalField[] {
  return [
    {
      name: "unitName",
      label: "Unit Name",
      required: true,
      placeholder: "Kilogram",
      validation: {
        minLength: 2,
        minLengthMessage: "Unit Name must be at least 2 characters.",
      },
    },
    {
      name: "unitCode",
      label: "Unit Code",
      placeholder: "KG",
    },
       {
      name: "unitAlias",
      label: "Unit Alias",
      placeholder: "Alternate unit label",
    },
    {
      name: "unitWeight",
      label: "Weight",
      type: "number",
      min: 0,
      step: "0.01",
      placeholder: "0",
    },
     {
      name: "unitBaseUnitId",
      label: "Base Unit ",
      type: "select",
      searchable: true,
      options: baseUnitOptions,
      placeholder: "Search base unit",
    },
 
    {
      name: "unitDecimalCount",
      label: "Decimal Count",
      type: "number",
      min: 0,
      step: 1,
      placeholder: "0",
    },
     {
      name: "unitIsPackUnit",
      label: "Pack Unit",
      type: "select",
      options: [
        { label: "Yes", value: "true" },
        { label: "No", value: "false" },
      ],
    },
    
    {
      name: "unitLoading",
      label: "Loading charge",
      type: "number",
      min: 0,
      step: "0.01",
      placeholder: "0",
    },   
    {
      name: "unitConversion",
      label: "Conversion",
      placeholder: "Conversion value",
    },
    {
      name: "unitUnloading",
      label: "Unloading charge",
      type: "number",
      min: 0,
      step: "0.01",
      placeholder: "0",
    },
    {
      name: "unitAttachCharge",
      label: "Attach Charge",
      type: "number",
      min: 0,
      step: "0.01",
      placeholder: "0",
    },
   
    {
      name: "unitDescription",
      label: "Unit Description",
      type: "textarea",
      placeholder: "Add notes about this unit",
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

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
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

function toSelectBoolean(value: unknown, defaultValue: "true" | "false"): "true" | "false" {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  const normalized = toDisplayValue(value).toLowerCase();
  if (["1", "true", "yes", "active"].includes(normalized)) {
    return "true";
  }
  if (["0", "false", "no", "inactive"].includes(normalized)) {
    return "false";
  }

  return defaultValue;
}

function toInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toOptionalValue(value: string): string | number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return normalized;
}

function toUpdateUnitId(editingItemId: string | number | null): string | number {
  if (typeof editingItemId === "number" && Number.isFinite(editingItemId)) {
    return editingItemId;
  }

  if (typeof editingItemId === "string") {
    const parsed = Number.parseInt(editingItemId.trim(), 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
    return editingItemId;
  }

  return 0;
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

  const firstArray = Object.values(objectPayload).find((value) => Array.isArray(value));
  return Array.isArray(firstArray) ? firstArray : [];
}

function buildBaseUnitOptions(payload: unknown): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, LOOKUP_KEYS.array);

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }

    const source = row as Record<string, unknown>;
    const unitId = toDisplayValue(getFirstDefinedValue(source, LOOKUP_KEYS.id));
    if (!unitId) {
      continue;
    }

    const unitName = toDisplayValue(getFirstDefinedValue(source, LOOKUP_KEYS.name));
    const optionLabel = unitName;

    if (!optionLabel) {
      continue;
    }

    if (!optionMap.has(unitId)) {
      optionMap.set(unitId, optionLabel);
    }
  }

  const baseOption = [{ value: "", label: "None" }];
  const dynamicOptions = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));

  return [...baseOption, ...dynamicOptions];
}

export default function UnitMasterPage() {
  const { getAll: getBaseUnitList } = useApi<unknown>(API_ENDPOINTS.list);
  const [baseUnitOptions, setBaseUnitOptions] = useState<ERPDynamicSelectOption[]>([
    { value: "", label: "None" },
  ]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const payload = await getBaseUnitList({ page: "1", limit: "500" });
        if (mounted) {
          setBaseUnitOptions(buildBaseUnitOptions(payload));
        }
      } catch {
        if (mounted) {
          setBaseUnitOptions([{ value: "", label: "None" }]);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [getBaseUnitList]);

  const unitFormFields = useMemo(
    () => buildUnitFormFields(baseUnitOptions),
    [baseUnitOptions],
  );

  return (
    <CrudMasterPage
      title="Unit"
      entityLabel="unit"
      entityLabelPlural="units"
      apiEndpoints={API_ENDPOINTS}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Unit List"
      createLabel="Add Unit"
      codeColumnHeader="Unit Code"
      nameColumnHeader="Unit Name"
      nameFieldLabel="Unit Name"
      nameFieldPlaceholder="Kilogram"
      formTitle="Unit Form"
      formDescription="Create and update units."
      customFields={unitFormFields}
      createInitialValues={UNIT_INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};

        return {
          ...UNIT_INITIAL_FORM_VALUES,
          unitName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || defaults.masterName,
          unitCode:
            toDisplayValue(getFirstDefinedValue(rowSource, UNIT_CODE_FORM_KEYS)) ||
            defaults.searchCode,
          unitAlias:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) ||
            defaults.masterAlias,
          unitDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
            defaults.masterDescription,
          unitDecimalCount:
            toDisplayValue(getFirstDefinedValue(rowSource, UNIT_DECIMAL_COUNT_KEYS)) || "0",
          unitWeight: toDisplayValue(getFirstDefinedValue(rowSource, UNIT_WEIGHT_KEYS)),
          unitLoading: toDisplayValue(getFirstDefinedValue(rowSource, UNIT_LOADING_KEYS)),
          unitUnloading: toDisplayValue(getFirstDefinedValue(rowSource, UNIT_UNLOADING_KEYS)),
          unitAttachCharge: toDisplayValue(
            getFirstDefinedValue(rowSource, UNIT_ATTACH_CHARGE_KEYS),
          ),
          unitIsPackUnit: toSelectBoolean(
            getFirstDefinedValue(rowSource, UNIT_IS_PACK_UNIT_KEYS),
            "false",
          ),
          unitBaseUnitId:
            toDisplayValue(getFirstDefinedValue(rowSource, UNIT_BASE_UNIT_ID_KEYS)) || "",
          unitConversion: toDisplayValue(getFirstDefinedValue(rowSource, UNIT_CONVERSION_KEYS)),
          unitIsActive: toSelectBoolean(
            getFirstDefinedValue(rowSource, UNIT_IS_ACTIVE_KEYS),
            "true",
          ),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const unitName = (values.unitName ?? "").trim();
        const unitAlias = (values.unitAlias ?? "").trim();
        const unitCode = (values.unitCode ?? "").trim();
        const unitDescription = (values.unitDescription ?? "").trim();
        const unitDecimalCount = toInteger(values.unitDecimalCount ?? "0", 0);
        const rawBaseUnitId = (values.unitBaseUnitId ?? "").trim();
        const unitBaseUnitId = rawBaseUnitId ? rawBaseUnitId : null;
        const unitIsPackUnit = (values.unitIsPackUnit ?? "false") === "true";
        const unitIsActive = (values.unitIsActive ?? "true") !== "false";
        return {
          unit_id: shouldUpdate ? toUpdateUnitId(editingItemId) : "",
          unit_name: unitName,
          unit_alias: unitAlias || null,
          unit_code: unitCode || null,
          unit_description: unitDescription || null,
          unit_decimal_count: unitDecimalCount,
          unit_weight: toOptionalValue(values.unitWeight ?? ""),
          unit_loading: toOptionalValue(values.unitLoading ?? ""),
          unit_unloading: toOptionalValue(values.unitUnloading ?? ""),
          unit_attach_charge: toOptionalValue(values.unitAttachCharge ?? ""),
          unit_is_pack_unit: unitIsPackUnit,
          unit_base_unit_id: unitBaseUnitId,
          unit_conversion: toOptionalValue(values.unitConversion ?? ""),
          unit_is_active: unitIsActive,
        };
      }}
    />
  );
}
