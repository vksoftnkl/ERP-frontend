import type { LookupDefinition, MasterOption, NormalizedListResponse } from "./types";
import { getFirstDefinedValue, toDisplayValue } from "./value-mappers";

const PAGINATION_CONTAINER_KEYS = ["meta", "pagination", "pageInfo", "pager"] as const;
const TOTAL_ENTRIES_KEYS = [
  "total",
  "totalCount",
  "total_count",
  "totalRecords",
  "total_records",
  "count",
  "recordsTotal",
  "totalItems",
  "total_items",
] as const;
const CURRENT_PAGE_KEYS = ["page", "currentPage", "current_page", "pageNo", "page_no"] as const;
const PAGE_SIZE_KEYS = ["limit", "pageSize", "page_size", "perPage", "per_page"] as const;

export const DEFAULT_LOOKUP_ARRAY_KEYS = ["items", "data", "results", "rows", "list"] as const;

type LookupBuildOptions = Omit<LookupDefinition, "defaultOption" | "query">;

type PaginationInfo = {
  totalEntries: number | null;
  currentPage: number | null;
  pageSize: number | null;
};

function toNonNegativeInt(value: unknown): number | null {
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

function toPositiveInt(value: unknown): number | null {
  const normalized = toNonNegativeInt(value);
  if (normalized === null || normalized < 1) {
    return null;
  }
  return normalized;
}

function findPaginationNumber(
  candidates: Record<string, unknown>[],
  keys: readonly string[],
  allowZero: boolean,
): number | null {
  for (const candidate of candidates) {
    for (const key of keys) {
      const normalized = allowZero
        ? toNonNegativeInt(candidate[key])
        : toPositiveInt(candidate[key]);

      if (normalized !== null) {
        return normalized;
      }
    }
  }

  return null;
}

export function extractRows<TRecord = Record<string, unknown>>(
  payload: unknown,
  arrayKeys: readonly string[] = DEFAULT_LOOKUP_ARRAY_KEYS,
): TRecord[] {
  if (Array.isArray(payload)) {
    return payload as TRecord[];
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const objectPayload = payload as Record<string, unknown>;

  for (const key of arrayKeys) {
    const value = objectPayload[key];
    if (Array.isArray(value)) {
      return value as TRecord[];
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nestedObject = value as Record<string, unknown>;

      for (const nestedKey of arrayKeys) {
        const nestedValue = nestedObject[nestedKey];
        if (Array.isArray(nestedValue)) {
          return nestedValue as TRecord[];
        }
      }

      const firstNestedArray = Object.values(nestedObject).find((entry) => Array.isArray(entry));
      if (Array.isArray(firstNestedArray)) {
        return firstNestedArray as TRecord[];
      }
    }
  }

  const firstArray = Object.values(objectPayload).find((entry) => Array.isArray(entry));
  return Array.isArray(firstArray) ? (firstArray as TRecord[]) : [];
}

export function extractDetailSource(payload: unknown): Record<string, unknown> | null {
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

export function extractPaginationInfo(payload: unknown): PaginationInfo {
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

export function normalizeListResponse<TRecord = Record<string, unknown>>(
  payload: unknown,
  arrayKeys: readonly string[] = DEFAULT_LOOKUP_ARRAY_KEYS,
): NormalizedListResponse<TRecord> {
  const rows = extractRows<TRecord>(payload, arrayKeys);
  const pagination = extractPaginationInfo(payload);

  return {
    rows,
    totalEntries: Math.max(0, pagination.totalEntries ?? rows.length),
    currentPage: pagination.currentPage,
    pageSize: pagination.pageSize,
  };
}

export function buildLookupOptions(
  payload: unknown,
  defaultOption: MasterOption,
  options?: LookupBuildOptions,
): MasterOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, options?.arrayKeys ?? DEFAULT_LOOKUP_ARRAY_KEYS);
  const idKeys = options?.idKeys ?? ["id", "value"];
  const labelKeys = options?.labelKeys ?? ["name", "label"];

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }

    const source = row as Record<string, unknown>;
    const id = toDisplayValue(getFirstDefinedValue(source, idKeys));
    if (!id) {
      continue;
    }

    const label =
      toDisplayValue(getFirstDefinedValue(source, labelKeys)) ||
      id;

    if (!optionMap.has(id)) {
      optionMap.set(id, label);
    }
  }

  const sortedOptions = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));

  return [defaultOption, ...sortedOptions];
}
