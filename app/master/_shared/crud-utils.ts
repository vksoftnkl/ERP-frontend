export const DEFAULT_LOOKUP_ARRAY_KEYS = ["items", "data", "results", "rows", "list"] as const;

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

export function toDisplayValue(value: unknown): string {
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

export function toSelectBoolean(value: unknown, fallback: "true" | "false"): "true" | "false" {
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

export function toNonNegativeInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

export function toNonNegativeNumber(value: string, fallback: number): number {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

export function toNullableNumber(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

export function toNullableString(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function toUpper(value: string): string {
  return value.trim().toUpperCase();
}

export function toDateInputValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return "";
}

export function toNullableDate(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function toUpdateId(editingItemId: string | number | null): string {
  if (typeof editingItemId === "number" && Number.isFinite(editingItemId)) {
    return String(editingItemId);
  }

  if (typeof editingItemId === "string") {
    return editingItemId.trim();
  }

  return "";
}

export function extractRows(payload: unknown, arrayKeys: readonly string[]): unknown[] {
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

export function buildLookupOptions(
  payload: unknown,
  defaultOption: { value: string; label: string },
  options?: {
    arrayKeys?: readonly string[];
    idKeys?: readonly string[];
    labelKeys?: readonly string[];
  },
): { value: string; label: string }[] {
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

    const name = toDisplayValue(getFirstDefinedValue(source, labelKeys));
    const label = name || id;

    if (!optionMap.has(id)) {
      optionMap.set(id, label);
    }
  }

  const sortedOptions = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));

  return [defaultOption, ...sortedOptions];
}

export function toUniqueStringArrayFromCsv(value: string): string[] {
  const normalized = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

export function toCsvFromArray(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  const normalized = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);

  return normalized.join(",");
}
