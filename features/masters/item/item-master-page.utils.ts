"use client";
import type { ERPDynamicSelectOption } from "@/components/design-system/ui/dynamic-modal-form";
import {
  buildLookupOptions,
  getFirstDefinedValue,
  toDisplayValue,
  toSelectBoolean,
  toUpper,
  DEFAULT_LOOKUP_ARRAY_KEYS,
} from "@/app/master/_shared/crud-utils";
import {
  parseLinkedRecordRows,
  type LinkedRecordColumn,
} from "./item-linked-records-editor";
export function toSnakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}
function normalizeFieldLookupKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
}
export function getFieldValue(
  source: Record<string, unknown>,
  fieldName: string,
): unknown {
  const fieldNames = [fieldName, toSnakeCase(fieldName)];
  const directValue = getFirstDefinedValue(source, fieldNames);
  if (directValue !== undefined) {
    return directValue;
  }

  const normalizedFieldNames = new Set(fieldNames.map(normalizeFieldLookupKey));
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (normalizedFieldNames.has(normalizeFieldLookupKey(key))) {
      return value;
    }
  }
  return undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
export function toOptionalNonNegativeInteger(value: string): number | undefined {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return Math.floor(parsed);
}
export function toOptionalNonNegativeNumber(value: string): number | undefined {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
}
export function toUpperNullable(value: string): string | null {
  const normalized = toUpper(value);
  return normalized ? normalized : null;
}
export function extractArrayRecords(
  payload: unknown,
  arrayKeys: readonly string[] = DEFAULT_LOOKUP_ARRAY_KEYS,
): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (!isRecord(payload)) {
    return [];
  }
  for (const key of arrayKeys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
    if (isRecord(value)) {
      for (const nestedKey of arrayKeys) {
        const nestedValue = value[nestedKey];
        if (Array.isArray(nestedValue)) {
          return nestedValue.filter(isRecord);
        }
      }
    }
  }
  return [];
}
export function extractResponseRecord(
  payload: unknown,
): Record<string, unknown> | null {
  if (!isRecord(payload)) {
    return null;
  }
  return isRecord(payload.data) ? payload.data : payload;
}
export function hasLinkedRows(value: string | undefined): boolean {
  return parseLinkedRecordRows(value ?? "").length > 0;
}
export function toTrimmedOrUndefined(value: string | undefined): string | undefined {
  const normalized = value?.trim() ?? "";
  return normalized || undefined;
}
export function toLookupOptions(
  payload: unknown,
  defaultOption: ERPDynamicSelectOption,
  lookupOptions?: {
    arrayKeys?: readonly string[];
    idKeys?: readonly string[];
    labelKeys?: readonly string[];
  },
): ERPDynamicSelectOption[] {
  return buildLookupOptions(payload, defaultOption, {
    arrayKeys: lookupOptions?.arrayKeys ?? DEFAULT_LOOKUP_ARRAY_KEYS,
    idKeys: lookupOptions?.idKeys ?? ["id", "value"],
    labelKeys: lookupOptions?.labelKeys ?? ["name", "label"],
  }).filter((option) => option.value !== defaultOption.value);
}
export function toHsnOptions(
  payload: unknown,
  defaultOption: ERPDynamicSelectOption,
): ERPDynamicSelectOption[] {
  return buildLookupOptions(payload, defaultOption, {
    arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
    idKeys: ["id", "value", "hsnCode", "hsn_code"],
    labelKeys: ["name", "label", "hsnCode", "hsn_code"],
  }).filter((option) => option.value !== defaultOption.value);
}
export function mergeLookupOptionSets(
  currentOptions: ERPDynamicSelectOption[],
  nextOptions: ERPDynamicSelectOption[],
): ERPDynamicSelectOption[] {
  const merged = new Map<string, ERPDynamicSelectOption>();
  for (const option of currentOptions) {
    if (!option.value) {
      continue;
    }
    merged.set(option.value, option);
  }
  for (const option of nextOptions) {
    if (!option.value) {
      continue;
    }
    merged.set(option.value, option);
  }
  return Array.from(merged.values());
}
function normalizeUiTableColumnName(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
}
function isUiTableColumnConfigRecord(
  value: unknown,
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }
  return Boolean(
    toDisplayValue(getFieldValue(value, "uiTblClmName")) ||
      toDisplayValue(getFieldValue(value, "uiTblClmId")) ||
      toDisplayValue(getFieldValue(value, "uiTblClmTableId")),
  );
}
function toConfiguredColumnWidth(value: unknown): string | undefined {
  const normalized = toDisplayValue(value);
  if (!normalized) {
    return undefined;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return `${parsed}px`;
}
function toConfiguredColumnOrder(
  configuredColumn: Record<string, unknown>,
  fallback: number,
): number {
  const positionValue = toDisplayValue(
    getFieldValue(configuredColumn, "uiTblClmColumnPosition"),
  );
  const columnNoValue = toDisplayValue(getFieldValue(configuredColumn, "uiTblClmNo"));
  const parsed = Number(positionValue || columnNoValue || String(fallback));
  return Number.isFinite(parsed) ? parsed : fallback;
}
export function extractUiTableColumnConfigRecords(
  payload: unknown,
  tableId: string,
): Record<string, unknown>[] {
  const normalizedTableId = tableId.trim();
  const extractedRows = extractArrayRecords(payload);
  const rows =
    extractedRows.length > 0
      ? extractedRows
      : (() => {
          const responseSource = extractResponseRecord(payload);
          return responseSource && isUiTableColumnConfigRecord(responseSource)
            ? [responseSource]
            : [];
        })();
  return rows.filter((row) => {
    if (!normalizedTableId) {
      return true;
    }
    const rowTableId = toDisplayValue(getFieldValue(row, "uiTblClmTableId"));
    return !rowTableId || rowTableId === normalizedTableId;
  });
}
export function applyConfiguredLinkedTableColumnConfig<
  TColumnNameToKey extends Record<string, string>,
>(
  columns: LinkedRecordColumn[],
  configuredColumns: Record<string, unknown>[],
  columnNameToKey: TColumnNameToKey,
): LinkedRecordColumn[] {
  if (configuredColumns.length === 0) {
    return columns;
  }
  const columnsByKey = new Map(
    columns.map((column, index) => [column.key, { column, index }]),
  );
  const seenKeys = new Set<string>();
  const orderedColumns: Array<{
    column: LinkedRecordColumn;
    index: number;
    position: number;
  }> = [];
  const sortedConfiguredColumns = [...configuredColumns].sort((left, right) => {
    const leftPosition = toConfiguredColumnOrder(left, 0);
    const rightPosition = toConfiguredColumnOrder(right, 0);
    return leftPosition - rightPosition;
  });
  for (const configuredColumn of sortedConfiguredColumns) {
    const normalizedName = normalizeUiTableColumnName(
      toDisplayValue(getFieldValue(configuredColumn, "uiTblClmName")),
    );
    const columnKey = columnNameToKey[normalizedName as keyof TColumnNameToKey];

    if (!columnKey || seenKeys.has(columnKey)) {
      continue;
    }
    const baseColumn = columnsByKey.get(columnKey);
    if (!baseColumn) {
      continue;
    }
    seenKeys.add(columnKey);
    const isVisible =
      toSelectBoolean(
        getFieldValue(configuredColumn, "uiTblClmColumnVisibility"),
        "true",
      ) === "true";
    const isFocused =
      toSelectBoolean(
        getFieldValue(configuredColumn, "uiTblClmColumnFocus"),
        "false",
      ) === "true";
    const isNecessary =
      toSelectBoolean(
        getFieldValue(configuredColumn, "uiTblClmColumnNecessity"),
        "false",
      ) === "true";
    const position = toConfiguredColumnOrder(configuredColumn, baseColumn.index + 1);
    orderedColumns.push({
      column: {
        ...baseColumn.column,
        hidden: !isVisible,
        focus: isFocused,
        necessity: isNecessary,
        width:
          toConfiguredColumnWidth(
            getFieldValue(configuredColumn, "uiTblClmColumnWidth"),
          ) ?? baseColumn.column.width,
      },
      index: baseColumn.index,
      position: Number.isFinite(position) ? position : baseColumn.index,
    });
  }
  const remainingColumns = columns.filter((column) => !seenKeys.has(column.key));
  if (orderedColumns.length === 0) {
    return columns;
  }
  orderedColumns.sort((left, right) => {
    if (left.position !== right.position) {
      return left.position - right.position;
    }
    return left.index - right.index;
  });
  return [...orderedColumns.map((entry) => entry.column), ...remainingColumns];
}
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file as base64."));
        return;
      }
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read file."));
    };
    reader.readAsDataURL(file);
  });
}
export function assignTextFieldsFromSource(
  target: Record<string, string>,
  source: Record<string, unknown>,
  fieldNames: readonly string[],
  defaults: Record<string, string>,
): void {
  for (const fieldName of fieldNames) {
    const value = toDisplayValue(getFieldValue(source, fieldName));
    target[fieldName] = value || defaults[fieldName] || "";
  }
}
export function assignBooleanFieldsFromSource(
  target: Record<string, string>,
  source: Record<string, unknown>,
  fieldNames: readonly string[],
  defaults: Record<string, string>,
): void {
  for (const fieldName of fieldNames) {
    const fallback = defaults[fieldName] === "true" ? "true" : "false";
    target[fieldName] = toSelectBoolean(getFieldValue(source, fieldName), fallback);
  }
}
