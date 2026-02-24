"use client";

import CrudMasterPage from "@/components/master/crud-master-page";
import type { ERPDynamicModalField } from "@/components/library/ui/dynamic-modal-form";
import styles from "./page.module.scss";

const API_ENDPOINTS = {
  list: "/godowns/list",
  getById: "/godowns/get",
  create: "/godowns/create",
  delete: "/godowns/delete",
} as const;

const LOOKUP_KEYS = {
  id: [
    "godown_id",
    "godownId",
    "id",
    "_id",
    "itgd_id",
    "godownid",
    "storage_id",
    "warehouse_id",
  ],
  code: [
    "godown_code",
    "godownCode",
    "code",
    "itgd_alias",
    "itgd_short",
    "godownalias",
    "godownshort",
    "warehouse_code",
    "storage_code",
  ],
  name: [
    "godown_name",
    "godownName",
    "name",
    "itgd_name",
    "warehouse_name",
    "storage_name",
  ],
  short: [
    "itgd_short",
    "short_name",
    "shortName",
    "short",
    "godownshort",
    "warehouse_short",
  ],
  alias: [
    "itgd_alias",
    "alias",
    "godown_alias",
    "godownalias",
    "warehouse_alias",
  ],
  active: ["itgd_active", "active", "is_active", "isActive", "isactive", "status"],
  position: ["position", "itgd_sort", "sort"],
  description: ["itgd_description", "godown_description", "description", "desc"],
  array: ["data", "items", "results", "rows", "list", "godowns", "warehouses"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "godown_id",
  name: "godown_name",
  alias: "godown_alias",
  short: "godown_short",
  description: "godown_description",
  sort: "godown_sort",
} as const;

const GODOWN_CODE_FORM_KEYS = [
  "godown_code",
  "godownCode",
  "code",
  "itgd_code",
  "warehouse_code",
  "storage_code",
] as const;

const GODOWN_INITIAL_FORM_VALUES = {
  masterName: "",
  searchCode: "",
  masterAlias: "",
  masterShortName: "",
  position: "0",
  masterDescription: "",
} as const;

const GODOWN_FORM_FIELDS: ERPDynamicModalField[] = [
  {
    name: "masterName",
    label: "Godown Name",
    required: true,
    validation: {
      minLength: 2,
      minLengthMessage: "Godown Name must be at least 2 characters.",
    },
  },
  {
    name: "searchCode",
    label: "Godown Code",
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
    name: "position",
    label: "Position",
    type: "number",
    min: 0,
    step: 1,
    validation: {
      minMessage: "Position must be 0 or greater.",
    },
  },
  {
    name: "masterDescription",
    label: "Description",
    type: "textarea",
    colSpan: 2,
  },
];

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

  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
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

function toUpdateGodownId(editingItemId: string | number | null): string | number {
  if (typeof editingItemId === "number" && Number.isFinite(editingItemId)) {
    return editingItemId;
  }

  if (typeof editingItemId === "string") {
    const normalized = editingItemId.trim();
    if (!normalized) {
      return "";
    }

    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : normalized;
  }

  return "";
}

export default function GodownMasterPage() {
  return (
    <CrudMasterPage
      title="Godown"
      entityLabel="godown"
      entityLabelPlural="godowns"
      apiEndpoints={API_ENDPOINTS}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Godown List"
      createLabel="Add Godown"
      codeColumnHeader="Godown Code"
      nameColumnHeader="Godown Name"
      nameFieldLabel="Godown Name"
      nameFieldPlaceholder="Main Warehouse"
      formTitle="Godown Form"
      formDescription="Create and update godowns."
      customFields={GODOWN_FORM_FIELDS}
      createInitialValues={GODOWN_INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};

        return {
          ...GODOWN_INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || defaults.masterName,
          searchCode:
            toDisplayValue(getFirstDefinedValue(rowSource, GODOWN_CODE_FORM_KEYS)) ||
            defaults.searchCode,
          masterAlias:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) ||
            defaults.masterAlias,
          masterShortName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) ||
            defaults.masterShortName,
          position:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) ||
            defaults.position,
          masterDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
            defaults.masterDescription,
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const godownName = (values.masterName ?? "").trim();
        const godownCode = (values.searchCode ?? "").trim();
        const godownAlias = (values.masterAlias ?? "").trim() || godownCode;
        const godownShort = (values.masterShortName ?? "").trim() || godownCode || godownAlias;
        const godownDescription = (values.masterDescription ?? "").trim();
        const godownSort = toInteger(values.position ?? "0", 0);

        return {
          godown_id: shouldUpdate ? toUpdateGodownId(editingItemId) : "",
          godown_name: godownName,
          godown_code: godownCode || null,
          godown_alias: godownAlias || null,
          godown_short: godownShort || null,
          godown_description: godownDescription || null,
          godown_sort: godownSort,
        };
      }}
    />
  );
}
