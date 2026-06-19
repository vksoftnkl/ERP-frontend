"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
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
 list: "/configured-grid-sql/run?grid_id=4",
  getById: "/units/get",
  create: "/units/create",
  delete: "/units/delete",
} as const;
const GRID_TABLE_NAME = "units";
const BASE_UNIT_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const BASE_UNIT_LOOKUP_QUERY = {
  module: "units",
  limit: "20",
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
  unitDecimalCount: "1",
  unitWeight: "",
  unitLoading: "",
  unitUnloading: "",
  unitAttachCharge: "",
  unitIsPackUnit: "false",
  unitBaseUnitId: "",
  unitConversion: "",
  unitIsActive: "true",
} as const;
const GST_UNIT_LOOKUP_ENDPOINT = "/item-gst-units/get";
const GST_UNIT_LOOKUP_KEYS = {
  code: ["item_gst_unit_code", "itemGstUnitCode", "uqc", "code"],
  name: ["item_gst_unit_name", "itemGstUnitName", "unit", "name"],
} as const;
function buildUnitCodeOptions(payload: unknown): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const code = toDisplayValue(getFirstDefinedValue(source, GST_UNIT_LOOKUP_KEYS.code));
    if (!code) {
      continue;
    }
    const name = toDisplayValue(getFirstDefinedValue(source, GST_UNIT_LOOKUP_KEYS.name));
    if (!optionMap.has(code)) {
      optionMap.set(code, name ? `${code} - ${name}` : code);
    }
  }
  return Array.from(optionMap.entries()).map(([value, label]) => ({ value, label }));
}
function buildUnitFormFields(
  baseUnitOptions: ERPDynamicSelectOption[],
  unitCodeOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "unitName",
      label: "Unit Name",
      required: true,
      colSpan: 1,
      validation: {
        minLength: 2,
        minLengthMessage: "Unit Name must be at least 2 characters.",
      },
    },
    {
      name: "unitCode",
      label: "Gst Unit Code",
      type: "select",
      required: true,
      searchable: true,
      options: unitCodeOptions,
      placeholder: "Search unit code or unit name",
      colSpan: 1,
    },
    { name: "unitAlias", label: "Unit Alias", colSpan: 1 },
    {
      name: "unitWeight",
      label: "Weight",
      type: "number",
      min: 0,
      step: "0.01",
      colSpan: 1,
    },
    {
      name: "unitDecimalCount",
      label: "Decimal Count",
      type: "number",
      min: 1,
      max:3,
      step: 1,
      colSpan: 1,
    },
    {
      name: "__heading_pack_unit",
      label: "Pack Unit Details",
      type: "heading",
     
    },
    {
      name: "unitIsPackUnit",
      label: "Pack Unit",
      type: "checkbox",
      options: [
        { label: "Yes", value: "true" },
        { label: "No", value: "false" },
      ],
      colSpan: 1,
    },
    {
      name: "unitBaseUnitId",
      label: "Base Unit",
      type: "select",
      searchable: true,
      options: baseUnitOptions,
      placeholder: "Search base unit",
      visibleWhen: (values) => (values.unitIsPackUnit ?? "false") === "true",
      colSpan: 1,
    },
    {
      name: "unitConversion",
      label: "Conversion",
      requiredWhen: (values) => (values.unitIsPackUnit ?? "false") === "true",
      colSpan: 1,
      visibleWhen: (values) => (values.unitIsPackUnit ?? "false") === "true",
    },
    {
      name: "unitLoading",
      label: "Loading charge",
      type: "number",
      min: 0,
      step: "0.01",
      colSpan: 1,
    },
    {
      name: "unitUnloading",
      label: "Unloading charge",
      type: "number",
      min: 0,
      step: "0.01",
      colSpan: 1,
    },
    {
      name: "unitAttachCharge",
      label: "Attach Charge",
      type: "number",
      min: 0,
      step: "0.01",
      colSpan: 1,
    },
    {
      name: "unitDescription",
      label: "Unit Description",
      colSpan: 2,
    },
  ];
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
    return editingItemId.trim();
  }
  return 0;
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
  const { getAll: getBaseUnitList } = useApi<unknown>(BASE_UNIT_LOOKUP_ENDPOINT);
  const { getAll: getGstUnitList } = useApi<unknown>(GST_UNIT_LOOKUP_ENDPOINT);
  const [baseUnitOptions, setBaseUnitOptions] = useState<ERPDynamicSelectOption[]>([
    { value: "", label: "None" },
  ]);
  const [unitCodeOptions, setUnitCodeOptions] = useState<ERPDynamicSelectOption[]>([]);
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted units. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const payload = await getBaseUnitList(BASE_UNIT_LOOKUP_QUERY);
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
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const payload = await getGstUnitList();
        if (mounted) {
          setUnitCodeOptions(buildUnitCodeOptions(payload));
        }
      } catch {
        if (mounted) {
          setUnitCodeOptions([]);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getGstUnitList]);
  const unitFormFields = useMemo(
    () => buildUnitFormFields(baseUnitOptions, unitCodeOptions),
    [baseUnitOptions, unitCodeOptions],
  );
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 4's stored SQL; keys with no matching token are ignored. `wantdelete` is
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
      title="Unit"
      auditHistory={{ screenName: "Units Master" }}
      entityLabel="unit"
      entityLabelPlural="units"
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
      listTitle="Unit List"
      listTitleOverride="Unit List"
      createLabel="Add Unit"
      codeColumnHeader="Unit Code"
      nameColumnHeader="Unit Name"
      nameFieldLabel="Unit Name"
      nameFieldPlaceholder="Kilogram"
      formTitle="Unit Form"
      formDescription="Create and update units."
      createModalTitle="Unit Entry"
      editModalTitle="Edit Unit Entry"
      modalPanelStyle={{ width: "min(52rem, calc(100vw - 2rem))", maxHeight: "min(82vh, 42rem)" }}
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
        const unitIsPackUnit = (values.unitIsPackUnit ?? "false") === "true";
        const rawBaseUnitId = (values.unitBaseUnitId ?? "").trim();
        const unitBaseUnitId = unitIsPackUnit && rawBaseUnitId ? rawBaseUnitId : null;
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