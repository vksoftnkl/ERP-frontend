"use client";

import CrudMasterPage from "@/components/master/crud-master-page";
import type { ERPDynamicModalField } from "@/components/library/ui/dynamic-modal-form";
import styles from "./page.module.scss";

const API_ENDPOINTS = {
  list: "/states/list",
  getById: "/states/get",
  create: "/states/create",
  delete: "/states/delete",
} as const;

const LOOKUP_KEYS = {
  id: ["stmId", "stm_id", "state_id", "stateId", "id", "_id"],
  code: ["stmAlias", "stm_alias", "stmShort", "stm_short", "state_code", "code"],
  name: ["stmName", "stm_name", "state_name", "stateName", "name"],
  short: ["stmShort", "stm_short", "state_short", "short_name", "shortName", "short"],
  alias: ["stmAlias", "stm_alias", "state_alias", "alias"],
  active: ["stmIsActive", "stm_is_active", "active", "is_active", "isActive", "status"],
  position: ["stmOrder", "stm_order", "state_order", "state_sort", "position", "sort"],
  description: ["stmAlias", "stm_alias"],
  array: ["data", "items", "results", "rows", "list", "states"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "stmId",
  name: "stmName",
  alias: "stmAlias",
  short: "stmShort",
  description: "stmAlias",
  sort: "stmOrder",
} as const;

const STATE_IS_ACTIVE_KEYS = ["stmIsActive", "stm_is_active", "isActive", "is_active", "status"] as const;

const STATE_INITIAL_FORM_VALUES = {
  masterName: "",
  masterAlias: "",
  masterShortName: "",
  position: "0",
  stateIsActive: "true",
} as const;

const STATE_FORM_FIELDS: ERPDynamicModalField[] = [
  {
    name: "masterName",
    label: "State Name",
    required: true,
    validation: {
      minLength: 2,
      minLengthMessage: "State Name must be at least 2 characters.",
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
    name: "stateIsActive",
    label: "Status",
    type: "checkbox",
    options: [
      { label: "Active", value: "true" },
      { label: "Inactive", value: "false" },
    ],
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

function toUpdateStateId(editingItemId: string | number | null): string {
  if (typeof editingItemId === "number" && Number.isFinite(editingItemId)) {
    return String(editingItemId);
  }

  if (typeof editingItemId === "string") {
    return editingItemId.trim();
  }

  return "";
}

export default function StateMasterPage() {
  return (
    <CrudMasterPage
      title="State"
      entityLabel="state"
      entityLabelPlural="states"
      apiEndpoints={API_ENDPOINTS}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="State List"
      createLabel="Add State"
      codeColumnHeader="State Code"
      nameColumnHeader="State Name"
      nameFieldLabel="State Name"
      nameFieldPlaceholder="Gujarat"
      formTitle="State Form"
      formDescription="Create and update states."
      customFields={STATE_FORM_FIELDS}
      createInitialValues={STATE_INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};

        return {
          ...STATE_INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || defaults.masterName,
          masterAlias:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) ||
            defaults.masterAlias,
          masterShortName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) ||
            defaults.masterShortName,
          position:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) || defaults.position,
          stateIsActive: toSelectBoolean(
            getFirstDefinedValue(rowSource, STATE_IS_ACTIVE_KEYS),
            "true",
          ),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const stateName = (values.masterName ?? "").trim();
        const stateAlias = (values.masterAlias ?? "").trim();
        const stateShort = (values.masterShortName ?? "").trim();
        const stateOrder = Math.max(0, toInteger(values.position ?? "0", 0));
        const stateIsActive = (values.stateIsActive ?? "true") !== "false";

        return {
          stmName: stateName,
          stmAlias: stateAlias || null,
          stmShort: stateShort || null,
          stmOrder: stateOrder,
          stmIsActive: stateIsActive,
          ...(shouldUpdate && editingItemId !== null
            ? { stmId: toUpdateStateId(editingItemId) }
            : {}),
        };
      }}
    />
  );
}
