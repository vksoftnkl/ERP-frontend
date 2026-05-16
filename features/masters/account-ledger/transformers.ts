import type {
  ERPDynamicSelectOption,
  ERPDynamicModalField,
} from "@/components/design-system/ui/dynamic-modal-form";
import {
  REQUEST_PAYLOAD_KEYS,
  LOOKUP_KEYS,
  STATE_CODE_LOOKUP_NAME_KEYS,
  STATE_CODE_LOOKUP_CODE_KEYS,
  LOOKUP_ARRAY_KEYS,
} from "./constants";
import type {
  LedgerFormValues,
  LedgerFormFieldName,
  PaginationInfo,
  ResolvedGridDetails,
} from "./types";

// ============ Value Conversion & Formatting ============

export function toDisplayValue(value: unknown): string {
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
    const fallback =
      nested.value ?? nested.id ?? nested.code ?? nested.name ?? nested.label;
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

export function toSnakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

export function getFirstDefinedValue(
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

export function getFieldValue(
  source: Record<string, unknown>,
  fieldName: string,
): unknown {
  return getFirstDefinedValue(source, [fieldName, toSnakeCase(fieldName)]);
}

export function toSelectBoolean(
  value: unknown,
  defaultValue: string,
): "true" | "false" {
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
  const normalizedDefaultValue = defaultValue.trim().toLowerCase();
  return ["1", "true", "yes", "active"].includes(normalizedDefaultValue)
    ? "true"
    : "false";
}

export function toNumber(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toNullableString(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function toUpperNullable(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized.toUpperCase() : null;
}

export function toNullableDate(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function toDateInputValue(value: unknown): string {
  const normalized = toDisplayValue(value);
  if (!normalized) {
    return "";
  }
  const matched = normalized.match(/^\d{4}-\d{2}-\d{2}/);
  return matched ? matched[0] : normalized;
}

export function normalizeGstPartyRegType(
  value: string,
): "REGULAR" | "COMPOSITION" | "UNREGISTERED" | null {
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "REGULAR" ||
    normalized === "COMPOSITION" ||
    normalized === "UNREGISTERED"
  ) {
    return normalized;
  }
  return null;
}

export function normalizeObType(value: string): "DR" | "CR" {
  return value.trim().toUpperCase() === "CR" ? "CR" : "DR";
}

export function toNonNegativeInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.floor(value);
    return normalized >= 0 ? normalized : null;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return null;
}

export function toPositiveInt(value: unknown): number | null {
  const normalized = toNonNegativeInt(value);
  if (normalized === null || normalized < 1) {
    return null;
  }
  return normalized;
}

export function toSafePageNumber(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function toSafePageSize(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 20;
}

export function normalizeColumnToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, "");
}

export function normalizeGridColumnColor(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

export function resolveNumericId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  return null;
}

// ============ Array Extraction ============

export function extractRows(
  payload: unknown,
  arrayKeys: readonly string[],
): unknown[] {
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
  const firstArray = Object.values(objectPayload).find((value) =>
    Array.isArray(value),
  );
  return Array.isArray(firstArray) ? firstArray : [];
}

export function extractDetailSource(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const objectPayload = payload as Record<string, unknown>;
  const nestedData = objectPayload.data;
  if (
    nestedData &&
    typeof nestedData === "object" &&
    !Array.isArray(nestedData)
  ) {
    return nestedData as Record<string, unknown>;
  }
  return objectPayload;
}

// ============ Option Building ============

export function buildLookupOptions(
  payload: unknown,
  includeEmptyOption = true,
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
    const name = toDisplayValue(
      getFirstDefinedValue(source, ["name", "label"]),
    );
    const label = name || id;
    if (!optionMap.has(id)) {
      optionMap.set(id, label);
    }
  }
  const options = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
  if (!includeEmptyOption) {
    return options;
  }
  return [{ value: "", label: "" }, ...options];
}

export function buildStateNameOptions(payload: unknown): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, LOOKUP_ARRAY_KEYS);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const stateName = toDisplayValue(
      getFirstDefinedValue(source, STATE_CODE_LOOKUP_NAME_KEYS),
    );
    const stateCode = toDisplayValue(
      getFirstDefinedValue(source, STATE_CODE_LOOKUP_CODE_KEYS),
    ).toUpperCase();
    if (!stateName) {
      continue;
    }
    const label = stateCode ? `${stateName} (${stateCode})` : stateName;
    if (!optionMap.has(stateName)) {
      optionMap.set(stateName, label);
    }
  }
  const options = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
  return [{ value: "", label: "" }, ...options];
}

export function buildStateCodeByName(payload: unknown): Record<string, string> {
  const codeMap = new Map<string, string>();
  const rows = extractRows(payload, LOOKUP_ARRAY_KEYS);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const stateName = toDisplayValue(
      getFirstDefinedValue(source, STATE_CODE_LOOKUP_NAME_KEYS),
    );
    const stateCode = toDisplayValue(
      getFirstDefinedValue(source, STATE_CODE_LOOKUP_CODE_KEYS),
    ).toUpperCase();
    if (!stateName || !stateCode) {
      continue;
    }
    if (!codeMap.has(stateName)) {
      codeMap.set(stateName, stateCode);
    }
  }
  return Object.fromEntries(codeMap.entries());
}

// ============ Pagination ============

function findPaginationNumber(
  candidates: Record<string, unknown>[],
  keys: readonly string[],
  allowZero: boolean,
): number | null {
  for (const candidate of candidates) {
    for (const key of keys) {
      const value = candidate[key];
      const normalized = allowZero
        ? toNonNegativeInt(value)
        : toPositiveInt(value);
      if (normalized !== null) {
        return normalized;
      }
    }
  }
  return null;
}

export function extractPaginationInfo(payload: unknown): PaginationInfo {
  const {
    PAGINATION_CONTAINER_KEYS,
    TOTAL_ENTRIES_KEYS,
    CURRENT_PAGE_KEYS,
    PAGE_SIZE_KEYS,
  } = require("./constants");

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      totalEntries: null,
      currentPage: null,
      pageSize: null,
    };
  }
  const root = payload as Record<string, unknown>;
  const candidates: Record<string, unknown>[] = [root];
  for (const key of PAGINATION_CONTAINER_KEYS) {
    const value = root[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      candidates.push(value as Record<string, unknown>);
    }
  }
  if (root.data && typeof root.data === "object" && !Array.isArray(root.data)) {
    candidates.push(root.data as Record<string, unknown>);
  }
  return {
    totalEntries: findPaginationNumber(candidates, TOTAL_ENTRIES_KEYS, true),
    currentPage: findPaginationNumber(candidates, CURRENT_PAGE_KEYS, false),
    pageSize: findPaginationNumber(candidates, PAGE_SIZE_KEYS, false),
  };
}

// ============ Grid Details ============

export function resolveAccountLedgerGridDetails(payload: unknown): ResolvedGridDetails {
  const { GRID_DETAIL_ID_KEYS, GRID_DETAIL_SQL_KEYS, GRID_DETAIL_NAME_KEYS, ACCOUNT_LEDGER_TABLE_NAME_ALIASES } = require("./constants");

  const rows = extractRows(payload, LOOKUP_ARRAY_KEYS);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const gridId = resolveNumericId(getFirstDefinedValue(source, GRID_DETAIL_ID_KEYS));
    if (gridId === null) {
      continue;
    }
    const gridSql = toDisplayValue(getFirstDefinedValue(source, GRID_DETAIL_SQL_KEYS)).toLowerCase();
    if (
      !gridSql ||
      ACCOUNT_LEDGER_TABLE_NAME_ALIASES.some((tableName: string) => gridSql.includes(tableName))
    ) {
      const gridName = toDisplayValue(
        getFirstDefinedValue(source, GRID_DETAIL_NAME_KEYS),
      );
      return {
        gridId,
        gridName: gridName || null,
      };
    }
  }
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const gridId = resolveNumericId(getFirstDefinedValue(source, GRID_DETAIL_ID_KEYS));
    if (gridId !== null) {
      const gridName = toDisplayValue(
        getFirstDefinedValue(source, GRID_DETAIL_NAME_KEYS),
      );
      return {
        gridId,
        gridName: gridName || null,
      };
    }
  }
  return {
    gridId: null,
    gridName: null,
  };
}
