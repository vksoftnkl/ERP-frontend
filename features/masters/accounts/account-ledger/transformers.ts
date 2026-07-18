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
  GST_ADDRESS_BUILDING_KEYS,
  GST_ADDRESS_CITY_KEYS,
  GST_ADDRESS_DISTRICT_KEYS,
  GST_ADDRESS_KEYS,
  GST_ADDRESS_LOCALITY_KEYS,
  GST_ADDRESS_PIN_KEYS,
  GST_ADDRESS_STATE_KEYS,
  GST_LEGAL_NAME_KEYS,
  GST_LOOKUP_SOURCE_KEYS,
  GST_PRIMARY_ADDRESS_KEYS,
  GST_REGISTRATION_TYPE_KEYS,
  GST_TRADE_NAME_KEYS,
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
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function getObjectValue(
  source: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> | null {
  const candidate = getFirstDefinedValue(source, keys);
  return isRecord(candidate) ? candidate : null;
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
    // The name-id lookup returns an empty generic `name` for some modules (notably
    // accountGroups), with the real label in a module-specific field (acc_group_name,
    // comp_name, br_name). getFirstDefinedValue skips "" so a populated `name` still
    // wins; otherwise fall through to the module key instead of showing the uuid id.
    const name = toDisplayValue(
      getFirstDefinedValue(source, [
        "name",
        "label",
        "accGroupName",
        "acc_group_name",
        "compName",
        "comp_name",
        "brName",
        "br_name",
      ]),
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
export function buildStateNameByCode(payload: unknown): Record<string, string> {
  const nameMap = new Map<string, string>();
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
    if (!stateName || !stateCode || nameMap.has(stateCode)) {
      continue;
    }
    nameMap.set(stateCode, stateName);
  }
  return Object.fromEntries(nameMap.entries());
}
function joinDisplayValues(parts: unknown[]): string {
  return parts
    .map((part) => toDisplayValue(part))
    .filter(Boolean)
    .join(", ");
}
function setFieldValueIfPresent(
  target: Partial<LedgerFormValues>,
  fieldName: LedgerFormFieldName,
  value: string,
): void {
  const normalized = value.trim();
  if (!normalized) {
    return;
  }
  target[fieldName] = normalized;
}
function toLedgerLookupGstPartyRegType(
  value: string,
): "REGULAR" | "COMPOSITION" | "UNREGISTERED" {
  const normalized = normalizeGstPartyRegType(value);
  if (normalized) {
    return normalized;
  }
  const upperValue = value.trim().toUpperCase();
  if (upperValue.includes("COMPOSITION")) {
    return "COMPOSITION";
  }
  if (upperValue.includes("UNREGISTERED")) {
    return "UNREGISTERED";
  }
  return "REGULAR";
}
export function extractGstLookupSource(
  payload: unknown,
): Record<string, unknown> | null {
  if (!isRecord(payload)) {
    return null;
  }
  return getObjectValue(payload, GST_LOOKUP_SOURCE_KEYS) ?? payload;
}
export function extractGstAddress(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const primaryAddress = getObjectValue(source, GST_PRIMARY_ADDRESS_KEYS);
  if (!primaryAddress) {
    return {};
  }
  return getObjectValue(primaryAddress, GST_ADDRESS_KEYS) ?? primaryAddress;
}
export function buildLedgerGstLookupValues(
  gstin: string,
  payload: Record<string, unknown>,
  stateNameByCode: Record<string, string>,
): Partial<LedgerFormValues> {
  const address = extractGstAddress(payload);
  const legalName = toDisplayValue(
    getFirstDefinedValue(payload, GST_LEGAL_NAME_KEYS),
  );
  const tradeName = toDisplayValue(
    getFirstDefinedValue(payload, GST_TRADE_NAME_KEYS),
  );
  const city = toDisplayValue(getFirstDefinedValue(address, GST_ADDRESS_CITY_KEYS));
  const district =
    toDisplayValue(getFirstDefinedValue(address, GST_ADDRESS_DISTRICT_KEYS)) || city;
  const stateCode = gstin.slice(0, 2);
  const stateName =
    stateNameByCode[stateCode] ||
    toDisplayValue(getFirstDefinedValue(address, GST_ADDRESS_STATE_KEYS));
  const values: Partial<LedgerFormValues> = {
    ledGstinNo: gstin,
    ledPanNo: gstin.slice(2, 12),
    ledCountry: "India",
  };
  setFieldValueIfPresent(values, "masterName", tradeName || legalName);
  setFieldValueIfPresent(
    values,
    "ledGstPartyRegType",
    toLedgerLookupGstPartyRegType(
      toDisplayValue(getFirstDefinedValue(payload, GST_REGISTRATION_TYPE_KEYS)),
    ),
  );
  setFieldValueIfPresent(
    values,
    "ledAddr1",
    joinDisplayValues(
      GST_ADDRESS_BUILDING_KEYS.map((key) => getFirstDefinedValue(address, [key])),
    ),
  );
  setFieldValueIfPresent(
    values,
    "ledAddr2",
    joinDisplayValues(
      GST_ADDRESS_LOCALITY_KEYS.map((key) => getFirstDefinedValue(address, [key])),
    ),
  );
  setFieldValueIfPresent(
    values,
    "ledAddr3",
    joinDisplayValues([
      getFirstDefinedValue(address, GST_ADDRESS_DISTRICT_KEYS),
      getFirstDefinedValue(address, GST_ADDRESS_CITY_KEYS),
    ]),
  );
  setFieldValueIfPresent(values, "ledCity", city);
  setFieldValueIfPresent(values, "ledDistrict", district);
  setFieldValueIfPresent(values, "ledStateCode", stateCode);
  setFieldValueIfPresent(values, "ledStateName", stateName);
  setFieldValueIfPresent(values, "ledRegionStateName", stateName);
  setFieldValueIfPresent(
    values,
    "ledPin",
    toDisplayValue(getFirstDefinedValue(address, GST_ADDRESS_PIN_KEYS)),
  );
  return values;
}
export function getLookupErrorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) {
    return fallback;
  }
  return (
    toDisplayValue(getFirstDefinedValue(payload, ["message", "error", "detail"])) ||
    fallback
  );
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
    const dataObject = root.data as Record<string, unknown>;
    candidates.push(dataObject);
    // The list endpoints wrap their payload as `{ success, message, data: { items, meta } }`,
    // so the pagination container sits one level deeper than the root scan reaches.
    for (const key of PAGINATION_CONTAINER_KEYS) {
      const nested = dataObject[key];
      if (nested && typeof nested === "object" && !Array.isArray(nested)) {
        candidates.push(nested as Record<string, unknown>);
      }
    }
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