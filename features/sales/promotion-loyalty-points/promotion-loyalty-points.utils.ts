import type { ERPDynamicSelectOption } from "@/components/design-system/ui";
import {
  buildLookupOptions,
  DEFAULT_LOOKUP_ARRAY_KEYS,
  extractRows,
} from "@/features/masters/shared/normalizers";
import type { BadgeVariant, LookupConfig } from "./promotion-loyalty-points.local-types";
import type { SchemeListRow } from "./promotion-loyalty-points.types";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;
const DISPLAY_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
function isValidDateParts(year: string, month: string, day: string): boolean {
  const parsedYear = Number(year);
  const parsedMonth = Number(month);
  const parsedDay = Number(day);
  if (
    !Number.isInteger(parsedYear) ||
    !Number.isInteger(parsedMonth) ||
    !Number.isInteger(parsedDay) ||
    parsedMonth < 1 ||
    parsedMonth > 12 ||
    parsedDay < 1 ||
    parsedDay > 31
  ) {
    return false;
  }
  const date = new Date(Date.UTC(parsedYear, parsedMonth - 1, parsedDay));
  return (
    date.getUTCFullYear() === parsedYear &&
    date.getUTCMonth() === parsedMonth - 1 &&
    date.getUTCDate() === parsedDay
  );
}

export function stripEmptyOptions(options: ERPDynamicSelectOption[]): ERPDynamicSelectOption[] {
  return options.filter((o) => o.value.trim().length > 0);
}

export function withDefaultOption(
  options: ERPDynamicSelectOption[],
  defaultOption: ERPDynamicSelectOption,
): ERPDynamicSelectOption[] {
  return [defaultOption, ...stripEmptyOptions(options)];
}

export function buildLookupChoices(
  payload: unknown,
  config: LookupConfig,
): ERPDynamicSelectOption[] {
  return stripEmptyOptions(
    buildLookupOptions(payload, { value: "", label: "" }, {
      arrayKeys: config.arrayKeys,
      idKeys: config.idKeys,
      labelKeys: config.labelKeys,
    }),
  );
}

export function buildOptionLabelMap(options: ERPDynamicSelectOption[]): Map<string, string> {
  return new Map(
    options
      .filter((o) => o.value.trim().length > 0)
      .map((o) => [o.value, o.label]),
  );
}

export function withFallbackOption(
  options: ERPDynamicSelectOption[],
  value: string,
  labelMap: Map<string, string>,
): ERPDynamicSelectOption[] {
  const normalized = value.trim();
  if (!normalized || options.some((o) => o.value === normalized)) return options;

  const fallback: ERPDynamicSelectOption = {
    value: normalized,
    label: `Previous value: ${labelMap.get(normalized) ?? normalized}`,
  };

  if (options[0]?.value === "") {
    return [options[0], fallback, ...options.slice(1)];
  }
  return [fallback, ...options];
}

export function toDateInputValue(value: string | null | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    return "";
  }

  const isoMatch = normalized.match(ISO_DATE_PATTERN);
  if (isoMatch && isValidDateParts(isoMatch[1], isoMatch[2], isoMatch[3])) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const displayMatch = normalized.match(DISPLAY_DATE_PATTERN);
  if (displayMatch && isValidDateParts(displayMatch[3], displayMatch[2], displayMatch[1])) {
    return `${displayMatch[3]}-${displayMatch[2]}-${displayMatch[1]}`;
  }

  return normalized.slice(0, 10);
}

export function toTimeInputValue(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : "";
}

export function formatDateForDisplay(value: string | null | undefined): string {
  const normalized = toDateInputValue(value);
  if (!normalized) {
    return "";
  }

  const [year, month, day] = normalized.split("-");
  if (!year || !month || !day) {
    return normalized;
  }

  return `${day}/${month}/${year}`;
}

export function isValidDateValue(value: string | null | undefined): boolean {
  const normalized = toDateInputValue(value);
  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  return Boolean(
    isoMatch && isValidDateParts(isoMatch[1], isoMatch[2], isoMatch[3]),
  );
}

export function toNullableString(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function toOptionalNumber(value: string): number | undefined {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function toOptionalInteger(value: string): number | undefined {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

export function isPartyScopeType(value: string | null | undefined): value is import("./promotion-loyalty-points.local-types").PartyScopeType {
  return value === "CUSTOMER_GROUP" || value === "CUSTOMER";
}

export function isUuid(value: string | null | undefined): boolean {
  return Boolean(value && UUID_PATTERN.test(value.trim()));
}

export function formatDateRange(startDate: string, endDate: string): string {
  const start = toDateInputValue(startDate);
  const end = toDateInputValue(endDate);
  if (!start && !end) return "No dates";
  if (!start) return end;
  if (!end) return start;
  return `${start} to ${end}`;
}

export function resolveLabel(
  value: string | null | undefined,
  map: Map<string, string>,
  fallback = "Not set",
): string {
  const normalized = value?.trim();
  if (!normalized) return fallback;
  return map.get(normalized) ?? normalized;
}

export function getStatusVariant(status: string): BadgeVariant {
  if (status === "ACTIVE") return "success";
  if (status === "APPROVED") return "info";
  if (status === "CLOSED") return "warning";
  if (status === "CANCELLED") return "danger";
  return "neutral";
}

export function getTypeVariant(type: string): BadgeVariant {
  if (type === "BOTH") return "info";
  if (type === "GIFT") return "warning";
  return "success";
}

// ── Moved verbatim from page.tsx ─────────────────────────────────────────────
export type BranchRecord = {
  brId?: string;
  br_id?: string;
  branch_id?: string;
  branchId?: string;
  id?: string;
  _id?: string;
  value?: string;
  brName?: string;
  br_name?: string;
  branch_name?: string;
  branchName?: string;
  name?: string;
  label?: string;
  brIsDefault?: boolean;
  br_is_default?: boolean | string | number | null;
  isDefault?: boolean | string | number | null;
  is_default?: boolean | string | number | null;
};
export type ItemPriceRecord = {
  ipm_item_id?: string | null;
  // FK to item_unit_conversion(iuc_id) — item_price_master stores no raw unit
  // id, and no base unit at all; both moved onto the conversion row.
  ipm_uc_unit_id?: string | null;
  item_id?: string | null;
  itemId?: string | null;
  ipmItemId?: string | null;
  unit_id?: string | null;
  unitId?: string | null;
  ipmUnitId?: string | null;
  item_unit_id?: string | null;
  itemUnitId?: string | null;
  uom_id?: string | null;
  ipm_is_active?: boolean | string | number | null;
  is_active?: boolean | string | number | null;
  isActive?: boolean | string | number | null;
  ipm_is_deleted?: boolean | string | number | null;
  is_deleted?: boolean | string | number | null;
  isDeleted?: boolean | string | number | null;
};
export type ItemLookupRecord = Record<string, unknown>;
export function normalizeScopeValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim().toLowerCase();
  }
  if (value == null) {
    return "";
  }
  return String(value).trim().toLowerCase();
}
export function isActiveLookupRow(value: unknown): boolean {
  if (value == null || value === "") {
    return true;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized !== "false" && normalized !== "0";
  }
  return true;
}
export function isTruthyLookupFlag(value: unknown): boolean {
  if (value == null || value === "") {
    return false;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }
  return Boolean(value);
}
export function isDeletedItemLookupRow(row: ItemLookupRecord): boolean {
  const deletedFlagKeys = [
    "item_is_deleted",
    "itemIsDeleted",
    "is_deleted",
    "isDeleted",
    "deleted",
  ] as const;
  return deletedFlagKeys.some((key) => isTruthyLookupFlag(row[key]));
}
export function buildGiftUnitScopeKey(itemId: string, branchId = ""): string {
  return [branchId.trim(), itemId.trim()].join("::");
}
export function extractItemPriceRows(payload: unknown): ItemPriceRecord[] {
  return extractRows<ItemPriceRecord>(payload, DEFAULT_LOOKUP_ARRAY_KEYS);
}
export function getItemPriceItemId(row: ItemPriceRecord): string {
  const candidates = [
    row.ipm_item_id,
    row.item_id,
    row.itemId,
    row.ipmItemId,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}
export function getItemPriceUnitId(row: ItemPriceRecord): string {
  const candidates = [
    row.ipm_uc_unit_id,
    row.unit_id,
    row.unitId,
    row.ipmUnitId,
    row.item_unit_id,
    row.itemUnitId,
    row.uom_id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}
export function isActiveItemPriceRow(row: ItemPriceRecord): boolean {
  const activeFlag = [
    row.ipm_is_active,
    row.is_active,
    row.isActive,
  ].find((value) => value != null && value !== "");
  return activeFlag == null ? true : isActiveLookupRow(activeFlag);
}
export function isDeletedItemPriceRow(row: ItemPriceRecord): boolean {
  return [
    row.ipm_is_deleted,
    row.is_deleted,
    row.isDeleted,
  ].some(isTruthyLookupFlag);
}
export function readStringField(
  row: Record<string, unknown>,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}
export function getBranchId(row: BranchRecord): string {
  return readStringField(row, ["brId", "br_id", "branch_id", "branchId", "id", "_id", "value"]);
}
export function getBranchName(row: BranchRecord): string {
  return readStringField(row, ["brName", "br_name", "branch_name", "branchName", "name", "label"]);
}
export function isDefaultBranch(row: BranchRecord): boolean {
  return [
    row.brIsDefault,
    row.br_is_default,
    row.isDefault,
    row.is_default,
  ].some(isTruthyLookupFlag);
}
export function getSchemeBranchLabel(
  row: { ls_branch_id: string | null },
  branchLabelMap: Map<string, string>,
): string {
  const directBranchName = readStringField(
    row as unknown as Record<string, unknown>,
    ["ls_branch_name", "lsBranchName", "branch_name", "branchName", "br_name", "brName"],
  );
  if (directBranchName) {
    return directBranchName;
  }
  return resolveLabel(row.ls_branch_id, branchLabelMap, "All Branches");
}
export function toSchemeListRow(row: Record<string, unknown>): SchemeListRow {
  const toStr = (value: unknown): string => (value == null ? "" : String(value));
  const toNullableStr = (value: unknown): string | null => (value == null ? null : String(value));
  const toCount = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    ls_id: toStr(row.ls_id),
    ls_code: toNullableStr(row.ls_code),
    ls_name: toStr(row.ls_name),
    ls_type: toStr(row.ls_type),
    ls_status: toStr(row.ls_status),
    ls_branch_id: toNullableStr(row.ls_branch_id),
    ls_start_date: toStr(row.ls_start_date),
    ls_end_date: toStr(row.ls_end_date),
    ls_is_active: Boolean(row.ls_is_active),
    points_count: toCount(row.points_count),
    gifts_count: toCount(row.gifts_count),
    parties_count: toCount(row.parties_count),
  };
}

export function buildSparklinePath(values: number[], width = 96, height = 36): string {
  if (values.length === 0) {
    return "";
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const xStep = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => {
    const x = index * xStep;
    const y = height - ((value - min) / range) * (height - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return points.join(" ");
}

export function parseWeekdayValues(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
export function formatDateEntry(value: string): string {
  if (value.includes("-")) {
    return value;
  }
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
