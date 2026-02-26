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
  list: "/tender-masters/list",
  getById: "/tender-masters/get",
  create: "/tender-masters/create",
  delete: "/tender-masters/delete",
} as const;

const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";

const LOOKUP_QUERY_TENDER_TYPES = {
  module: "tenderTypes",
  limit: "100",
} as const;

const LOOKUP_QUERY_ACCOUNT_LEDGERS = {
  module: "accountLedgers",
  limit: "100",
} as const;

const LOOKUP_KEYS = {
  id: ["tndId", "tnd_id", "id", "_id"],
  code: ["tndDisplayPosition", "tnd_display_position", "position", "sort"],
  name: ["tndName", "tnd_name", "name"],
  short: ["tndMinAmount", "tnd_min_amount", "minAmount", "min_amount"],
  alias: ["tndName", "tnd_name", "name", "alias"],
  active: ["tndIsActive", "tnd_is_active", "isActive", "is_active", "status"],
  position: ["tndDisplayPosition", "tnd_display_position", "position", "sort"],
  description: ["tndRemarks", "tnd_remarks", "description", "remarks"],
  array: ["data", "items", "results", "rows", "list", "tenders", "tenderMasters"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "tndId",
  name: "tndName",
  alias: "tndName",
  short: "tndName",
  description: "tndRemarks",
  sort: "tndDisplayPosition",
} as const;

const TENDER_TYPE_ID_KEYS = ["tndTypeId", "tnd_type_id", "typeId", "type_id"] as const;
const TENDER_LEDGER_ID_KEYS = ["tndLedgerId", "tnd_ledger_id", "ledgerId", "ledger_id"] as const;
const TENDER_MIN_AMOUNT_KEYS = ["tndMinAmount", "tnd_min_amount", "minAmount", "min_amount"] as const;
const TENDER_MAX_AMOUNT_KEYS = ["tndMaxAmount", "tnd_max_amount", "maxAmount", "max_amount"] as const;
const TENDER_SURCHARGE_KEYS = ["tndSurchargePerc", "tnd_surcharge_perc", "surchargePerc"] as const;
const TENDER_IS_ACTIVE_KEYS = ["tndIsActive", "tnd_is_active", "isActive", "is_active"] as const;
const TENDER_EDIT_SURCHARGE_KEYS = [
  "tndEditSurcharge",
  "tnd_edit_surcharge",
  "editSurcharge",
] as const;
const TENDER_EDIT_LEDGER_KEYS = ["tndEditLedger", "tnd_edit_ledger", "editLedger"] as const;

const LOOKUP_ARRAY_KEYS = ["items", "data", "results", "rows", "list"] as const;

const DEFAULT_TENDER_TYPE_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Tender Type",
};

const DEFAULT_LEDGER_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Account Ledger",
};

const STATUS_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Active", value: "true" },
  { label: "Inactive", value: "false" },
];

const YES_NO_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Yes", value: "true" },
  { label: "No", value: "false" },
];

const TENDER_INITIAL_FORM_VALUES = {
  masterName: "",
  tndTypeId: "",
  tndLedgerId: "",
  tndMinAmount: "0",
  tndMaxAmount: "",
  position: "0",
  tndSurchargePerc: "0",
  tndIsActive: "true",
  tndEditSurcharge: "false",
  tndEditLedger: "false",
  masterDescription: "",
} as const;

function buildTenderFormFields(
  tenderTypeOptions: ERPDynamicSelectOption[],
  ledgerOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "Tender Name",
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Tender Name must be at least 2 characters.",
      },
    },
    {
      name: "tndTypeId",
      label: "Tender Type",
      type: "select",
      searchable: true,
      required: true,
      options: tenderTypeOptions,
      validation: {
        requiredMessage: "Tender Type is required.",
      },
    },
    {
      name: "tndLedgerId",
      label: "Account Ledger",
      type: "select",
      searchable: true,
      required: true,
      options: ledgerOptions,
      validation: {
        requiredMessage: "Account Ledger is required.",
      },
    },
    {
      name: "tndMinAmount",
      label: "Min Amount",
      type: "number",
      required: true,
      min: 0,
      step: "0.01",
      validation: {
        requiredMessage: "Min Amount is required.",
        minMessage: "Min Amount must be 0 or greater.",
      },
    },
    {
      name: "tndMaxAmount",
      label: "Max Amount",
      type: "number",
      min: 0,
      step: "0.01",
      validation: {
        minMessage: "Max Amount must be 0 or greater.",
        custom: (value, values) => {
          const trimmedValue = value.trim();
          if (!trimmedValue) {
            return null;
          }

          const maxAmount = Number(trimmedValue);
          if (!Number.isFinite(maxAmount)) {
            return "Max Amount must be a valid number.";
          }

          const minAmount = Number((values.tndMinAmount ?? "").trim());
          if (!Number.isFinite(minAmount)) {
            return null;
          }

          if (maxAmount < minAmount) {
            return "Max Amount must be greater than or equal to Min Amount.";
          }

          return null;
        },
      },
    },
    {
      name: "position",
      label: "Display Position",
      type: "number",
      min: 0,
      step: 1,
      validation: {
        minMessage: "Display Position must be 0 or greater.",
      },
    },
    {
      name: "tndSurchargePerc",
      label: "Surcharge %",
      type: "number",
      min: 0,
      step: "0.001",
      validation: {
        minMessage: "Surcharge % must be 0 or greater.",
      },
    },
    {
      name: "tndIsActive",
      label: "Status",
      type: "checkbox",
      options: STATUS_OPTIONS,
    },
    {
      name: "tndEditSurcharge",
      label: "Allow Edit Surcharge",
      type: "checkbox",
      options: YES_NO_OPTIONS,
    },
    {
      name: "tndEditLedger",
      label: "Allow Edit Ledger",
      type: "checkbox",
      options: YES_NO_OPTIONS,
    },
    {
      name: "masterDescription",
      label: "Remarks",
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

function toNonNegativeInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function toNonNegativeNumber(value: string, fallback: number): number {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function toNullableNumber(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function toNullableString(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function toUpdateTenderId(editingItemId: string | number | null): string {
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

function buildLookupOptions(
  payload: unknown,
  defaultOption: ERPDynamicSelectOption,
): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, LOOKUP_ARRAY_KEYS);

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }

    const source = row as Record<string, unknown>;
    const id = toDisplayValue(getFirstDefinedValue(source, ["id", "value"]));
    if (!id) {
      continue;
    }

    const name = toDisplayValue(getFirstDefinedValue(source, ["name", "label"]));
    if (!name) {
      continue;
    }

    if (!optionMap.has(id)) {
      optionMap.set(id, name);
    }
  }

  const options = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));

  return [defaultOption, ...options];
}

export default function TenderMasterPage() {
  const { getAll: getTenderTypeLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getLedgerLookup } = useApi<unknown>(LOOKUP_ENDPOINT);

  const [tenderTypeOptions, setTenderTypeOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_TENDER_TYPE_OPTION,
  ]);
  const [ledgerOptions, setLedgerOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_LEDGER_OPTION,
  ]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const [tenderTypesPayload, ledgersPayload] = await Promise.all([
          getTenderTypeLookup(LOOKUP_QUERY_TENDER_TYPES),
          getLedgerLookup(LOOKUP_QUERY_ACCOUNT_LEDGERS),
        ]);

        if (!mounted) {
          return;
        }

        setTenderTypeOptions(buildLookupOptions(tenderTypesPayload, DEFAULT_TENDER_TYPE_OPTION));
        setLedgerOptions(buildLookupOptions(ledgersPayload, DEFAULT_LEDGER_OPTION));
      } catch {
        if (!mounted) {
          return;
        }

        setTenderTypeOptions([DEFAULT_TENDER_TYPE_OPTION]);
        setLedgerOptions([DEFAULT_LEDGER_OPTION]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [getLedgerLookup, getTenderTypeLookup]);

  const tenderFormFields = useMemo(
    () => buildTenderFormFields(tenderTypeOptions, ledgerOptions),
    [ledgerOptions, tenderTypeOptions],
  );

  return (
    <CrudMasterPage
      title="Tender"
      entityLabel="tender"
      entityLabelPlural="tenders"
      apiEndpoints={API_ENDPOINTS}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Tender List"
      createLabel="Add"
      tableColumnHeaders={{
        masterCode: "Position",
        masterName: "Tender Name",
        masterShort: "Min Amount",
        masterActive: "Status",
      }}
      nameFieldLabel="Tender Name"
      nameFieldPlaceholder="Cash"
      formTitle="Tender Form"
      formDescription="Create and update tenders."
      customFields={tenderFormFields}
      createInitialValues={TENDER_INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const mergedDefaults = { ...TENDER_INITIAL_FORM_VALUES, ...defaults };

        return {
          ...TENDER_INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || mergedDefaults.masterName,
          tndTypeId:
            toDisplayValue(getFirstDefinedValue(rowSource, TENDER_TYPE_ID_KEYS)) ||
            mergedDefaults.tndTypeId,
          tndLedgerId:
            toDisplayValue(getFirstDefinedValue(rowSource, TENDER_LEDGER_ID_KEYS)) ||
            mergedDefaults.tndLedgerId,
          tndMinAmount:
            toDisplayValue(getFirstDefinedValue(rowSource, TENDER_MIN_AMOUNT_KEYS)) ||
            mergedDefaults.tndMinAmount,
          tndMaxAmount: toDisplayValue(getFirstDefinedValue(rowSource, TENDER_MAX_AMOUNT_KEYS)),
          position:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) || mergedDefaults.position,
          tndSurchargePerc:
            toDisplayValue(getFirstDefinedValue(rowSource, TENDER_SURCHARGE_KEYS)) ||
            mergedDefaults.tndSurchargePerc,
          tndIsActive: toSelectBoolean(getFirstDefinedValue(rowSource, TENDER_IS_ACTIVE_KEYS), "true"),
          tndEditSurcharge: toSelectBoolean(
            getFirstDefinedValue(rowSource, TENDER_EDIT_SURCHARGE_KEYS),
            "false",
          ),
          tndEditLedger: toSelectBoolean(
            getFirstDefinedValue(rowSource, TENDER_EDIT_LEDGER_KEYS),
            "false",
          ),
          masterDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
            mergedDefaults.masterDescription,
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          tndTypeId: (values.tndTypeId ?? "").trim(),
          tndName: (values.masterName ?? "").trim(),
          tndLedgerId: (values.tndLedgerId ?? "").trim(),
          tndMinAmount: toNonNegativeNumber(values.tndMinAmount ?? "0", 0),
          tndMaxAmount: toNullableNumber(values.tndMaxAmount ?? ""),
          tndDisplayPosition: toNonNegativeInteger(values.position ?? "0", 0),
          tndSurchargePerc: toNonNegativeNumber(values.tndSurchargePerc ?? "0", 0),
          tndIsActive: (values.tndIsActive ?? "true") === "true",
          tndRemarks: toNullableString(values.masterDescription ?? ""),
          tndEditSurcharge: (values.tndEditSurcharge ?? "false") === "true",
          tndEditLedger: (values.tndEditLedger ?? "false") === "true",
        };

        if (shouldUpdate && editingItemId !== null) {
          payload.tndId = toUpdateTenderId(editingItemId);
        }

        return payload;
      }}
    />
  );
}
