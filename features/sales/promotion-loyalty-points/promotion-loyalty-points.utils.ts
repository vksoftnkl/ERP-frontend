import type { ERPDynamicSelectOption } from "@/components/library/ui";
import { buildLookupOptions } from "@/features/masters/shared/normalizers";
import type { BadgeVariant, LookupConfig } from "./promotion-loyalty-points.local-types";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  return value ? value.slice(0, 10) : "";
}

export function toTimeInputValue(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : "";
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
  if (!value) return fallback;
  return map.get(value) ?? value;
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