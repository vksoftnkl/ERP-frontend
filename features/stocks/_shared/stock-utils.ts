import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { ERPDynamicSelectOption } from "@/components/design-system/ui";
import type { ItemPriceDetailsPayload } from "@/store/api/lookupsApi";
import { extractRows } from "@/features/masters/shared/normalizers";
import type { UiTableColumnPayload, SaveUiTableColumnRequest } from "./types";
import { DEFAULT_GODOWN_OPTION, QUANTITY_FORMATTER, VALUE_FORMATTER } from "./constants";

// ─── CSS class helper ───────────────────────────────────────────────────────

export function cx(...tokens: Array<string | false | undefined>): string {
  return tokens.filter(Boolean).join(" ");
}

// ─── String / number helpers ─────────────────────────────────────────────────

export function parseDecimal(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toInputValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

export function toNullableTrimmedString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function normalizeColumnName(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
}

// ─── Formatters ──────────────────────────────────────────────────────────────

export function formatQuantityValue(value: number): string {
  return QUANTITY_FORMATTER.format(value).replace(/,/g, "");
}

export function formatAmountValue(value: number): string {
  return VALUE_FORMATTER.format(value).replace(/,/g, "");
}

// ─── Date helpers ────────────────────────────────────────────────────────────

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T/;
const DISPLAY_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function isValidDateParts(year: string, month: string, day: string): boolean {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  const candidate = new Date(Date.UTC(y, m - 1, d));
  return (
    candidate.getUTCFullYear() === y &&
    candidate.getUTCMonth() === m - 1 &&
    candidate.getUTCDate() === d
  );
}

export function toCanonicalDateValue(value: string | null | undefined): string {
  const normalized = value?.trim();
  if (!normalized) return "";
  const iso = normalized.match(ISO_DATE_PATTERN);
  if (iso && isValidDateParts(iso[1], iso[2], iso[3])) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const isodt = normalized.match(ISO_DATE_TIME_PATTERN);
  if (isodt && isValidDateParts(isodt[1], isodt[2], isodt[3])) return `${isodt[1]}-${isodt[2]}-${isodt[3]}`;
  const disp = normalized.match(DISPLAY_DATE_PATTERN);
  if (disp && isValidDateParts(disp[3], disp[2], disp[1])) return `${disp[3]}-${disp[2]}-${disp[1]}`;
  return "";
}

export function formatDateForDisplay(value: string | null | undefined): string {
  const normalized = toCanonicalDateValue(value);
  if (!normalized) return "";
  const [year, month, day] = normalized.split("-");
  if (!year || !month || !day) return "";
  return `${day}/${month}/${year}`;
}

export function formatDateEntry(value: string): string {
  const normalized = value.trim();
  if (normalized.includes("-")) return formatDateForDisplay(normalized);
  const digits = normalized.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function getTodayInputValue(): string {
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60_000);
  return formatDateForDisplay(localDate.toISOString().slice(0, 10));
}

export function toIsoDateTime(value: string | null | undefined): string | null {
  const normalized = toCanonicalDateValue(value);
  return normalized ? `${normalized}T00:00:00.000Z` : null;
}

export function formatAccountingYear(referenceDate: string | null | undefined): string | null {
  const normalized = toCanonicalDateValue(referenceDate?.trim() || getTodayInputValue());
  const match = normalized.match(ISO_DATE_PATTERN);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export function openDatePicker(input: HTMLInputElement | null): void {
  if (!input) return;
  const picker = input as HTMLInputElement & { showPicker?: () => void };
  if (typeof picker.showPicker === "function") {
    picker.showPicker();
    return;
  }
  input.focus();
  input.click();
}

// ─── Lookup option helpers ────────────────────────────────────────────────────

export function buildLoadedLookupOptions(
  entries: Array<{ value: string | null | undefined; label: string | null | undefined }>,
): ERPDynamicSelectOption[] {
  const options = new Map<string, string>();
  for (const entry of entries) {
    const value = entry.value?.trim() ?? "";
    const label = entry.label?.trim() ?? "";
    if (!value || !label || options.has(value)) continue;
    options.set(value, label);
  }
  return Array.from(options, ([value, label]) => ({ value, label }));
}

export function mergeLookupOptions(
  currentOptions: ERPDynamicSelectOption[],
  nextOptions: ERPDynamicSelectOption[],
): ERPDynamicSelectOption[] {
  const emptyOption =
    currentOptions.find((o) => o.value === "") ?? nextOptions.find((o) => o.value === "");
  const merged = new Map<string, string>();
  for (const option of [...currentOptions, ...nextOptions]) {
    if (!option.value) continue;
    if (!merged.has(option.value)) merged.set(option.value, option.label);
  }
  const sorted = Array.from(merged, ([value, label]) => ({ value, label })).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  return emptyOption ? [emptyOption, ...sorted] : sorted;
}

export function filterLookupOptions(
  options: ERPDynamicSelectOption[],
  searchQuery: string,
): ERPDynamicSelectOption[] {
  const q = searchQuery.trim().toLowerCase();
  return options.filter((option) => {
    if (!option.value.trim()) return false;
    if (!q) return true;
    return (
      option.label.toLowerCase().includes(q) || option.value.toLowerCase().includes(q)
    );
  });
}

// ─── Godown lookup ────────────────────────────────────────────────────────────

type GodownRecord = Record<string, string | null | undefined>;

const GODOWN_ID_KEYS = [
  "gdl_id", "gdlId", "gdl_location_id", "godown_id", "godownId",
  "id", "_id", "value", "Location ID", "location id",
] as const;
const GODOWN_LABEL_KEYS = [
  "gdl_name", "gdlName", "godown_name", "godownName", "name", "label",
  "Location Name", "location name",
] as const;
const GODOWN_BRANCH_ID_KEYS = [
  "gdl_branch_id", "gdlBranchId", "branch_id", "branchId", "Branch ID", "branch id",
] as const;

function getGodownField(row: GodownRecord, keys: readonly string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized) return normalized;
    }
  }
  return "";
}

export function buildGodownLookupOptions(
  payload: unknown,
  branchId: string | null | undefined,
): ERPDynamicSelectOption[] {
  const normalizedBranchId = branchId?.trim() ?? "";
  const rows = extractRows<GodownRecord>(payload, [
    "data", "rows", "items", "results", "list",
    "godowns", "godown_locations", "godownLocations", "locations", "warehouses",
  ]);
  const optionMap = new Map<string, string>();
  for (const row of rows) {
    const value = getGodownField(row, GODOWN_ID_KEYS);
    const label = getGodownField(row, GODOWN_LABEL_KEYS) || value;
    const rowBranchId = getGodownField(row, GODOWN_BRANCH_ID_KEYS);
    if (!value || !label) continue;
    if (normalizedBranchId && rowBranchId && rowBranchId !== normalizedBranchId) continue;
    if (!optionMap.has(value)) optionMap.set(value, label);
  }
  const options = Array.from(optionMap, ([value, label]) => ({ value, label })).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  return [DEFAULT_GODOWN_OPTION, ...options];
}

// ─── UOM options ─────────────────────────────────────────────────────────────

export function buildUomOptions(
  detail: ItemPriceDetailsPayload | null | undefined,
  unitOptionsByValue: Map<string, string>,
): ERPDynamicSelectOption[] {
  if (!detail) return [];
  const optionMap = new Map<string, string>();
  for (const [index, priceRecord] of detail.item_prices.entries()) {
    if (!priceRecord.ipm_unit_id.trim() || optionMap.has(priceRecord.ipm_unit_id)) continue;
    optionMap.set(
      priceRecord.ipm_unit_id,
      unitOptionsByValue.get(priceRecord.ipm_unit_id) ?? `UOM ${index + 1}`,
    );
  }
  return Array.from(optionMap, ([value, label]) => ({ value, label }));
}

// ─── Item price helpers ───────────────────────────────────────────────────────

export function resolveDefaultItemPriceRecord(
  itemPrices: ItemPriceDetailsPayload["item_prices"],
): ItemPriceDetailsPayload["item_prices"][number] | null {
  return itemPrices.find((r) => r.ipm_is_default_unit) ?? itemPrices[0] ?? null;
}

export function resolveItemPriceRecordByUnitId(
  detail: ItemPriceDetailsPayload,
  unitId: string,
): ItemPriceDetailsPayload["item_prices"][number] | null {
  const normalized = unitId.trim();
  if (!normalized) return resolveDefaultItemPriceRecord(detail.item_prices);
  return (
    detail.item_prices.find((r) => r.ipm_unit_id === normalized) ??
    resolveDefaultItemPriceRecord(detail.item_prices)
  );
}

export function resolveTrackingType(item: ItemPriceDetailsPayload["item"]): string {
  const batchConfig = item.item_batch_config;
  if (batchConfig === 1) return "1";
  if (batchConfig === 2) return "2";
  if (item.item_is_batch_based || item.item_is_expiry_item) return "2";
  return "0";
}

// ─── Column width / reorder ───────────────────────────────────────────────────

export function parseColumnWidth(width: string, fallback = 120): number {
  const parsed = Number.parseFloat(width);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toColumnWidth(value: number | null | undefined, fallback: string): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return `${value}px`;
}

export function reorderColumns<TColumn extends { key: string }>(
  current: TColumn[],
  sourceKey: string,
  targetKey: string,
): TColumn[] {
  if (!sourceKey || !targetKey || sourceKey === targetKey) return current;
  const next = [...current];
  const sourceIndex = next.findIndex((c) => c.key === sourceKey);
  const targetIndex = next.findIndex((c) => c.key === targetKey);
  if (sourceIndex === -1 || targetIndex === -1) return current;
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

// ─── UI table column config helpers ──────────────────────────────────────────

export function findUiTableColumnConfig(
  configuredColumns: UiTableColumnPayload[],
  columnKey: string,
): UiTableColumnPayload | null {
  return (
    configuredColumns.find(
      (column) => normalizeColumnName(column.uiTblClmName ?? "") === columnKey,
    ) ?? null
  );
}

export function upsertUiTableColumnConfig(
  configuredColumns: UiTableColumnPayload[],
  savedColumn: UiTableColumnPayload,
  fallbackColumnKey: string,
): UiTableColumnPayload[] {
  const savedKey = normalizeColumnName(savedColumn.uiTblClmName ?? "") || fallbackColumnKey;
  let didUpdate = false;
  const nextColumns = configuredColumns.map((column) => {
    const sameId =
      Boolean(savedColumn.uiTblClmId) && column.uiTblClmId === savedColumn.uiTblClmId;
    const sameKey = normalizeColumnName(column.uiTblClmName ?? "") === savedKey;
    if (!sameId && !sameKey) return column;
    didUpdate = true;
    return savedColumn;
  });
  return didUpdate ? nextColumns : [...nextColumns, savedColumn];
}

export function buildUiTableColumnRequest<TColumn extends { key: string; header: string; width: string }>(
  column: TColumn,
  configuredColumn: UiTableColumnPayload | null,
  columnIndex: number,
  tableId: string,
  overrides: Partial<
    Pick<
      SaveUiTableColumnRequest,
      | "uiTblClmColumnPosition"
      | "uiTblClmColumnWidth"
      | "uiTblClmColumnVisibility"
      | "uiTblClmColumnFocus"
      | "uiTblClmColumnNecessity"
    >
  > = {},
): SaveUiTableColumnRequest {
  const fallbackPosition = columnIndex + 1;
  return {
    ...(configuredColumn?.uiTblClmId ? { uiTblClmId: configuredColumn.uiTblClmId } : {}),
    uiTblClmNo: configuredColumn?.uiTblClmNo || String(fallbackPosition),
    uiTblClmName: configuredColumn?.uiTblClmName?.trim() || column.header || column.key,
    uiTblClmTableId: configuredColumn?.uiTblClmTableId ?? tableId,
    uiTblClmColumnWidth:
      overrides.uiTblClmColumnWidth ??
      configuredColumn?.uiTblClmColumnWidth ??
      parseColumnWidth(column.width),
    uiTblClmColumnVisibility:
      overrides.uiTblClmColumnVisibility ?? configuredColumn?.uiTblClmColumnVisibility ?? true,
    uiTblClmColumnFocus:
      overrides.uiTblClmColumnFocus ?? configuredColumn?.uiTblClmColumnFocus ?? false,
    uiTblClmColumnPosition:
      overrides.uiTblClmColumnPosition ??
      configuredColumn?.uiTblClmColumnPosition ??
      fallbackPosition,
    uiTblClmColumnNecessity:
      overrides.uiTblClmColumnNecessity ?? configuredColumn?.uiTblClmColumnNecessity ?? false,
    uiTblClmNextColumn: configuredColumn?.uiTblClmNextColumn ?? null,
    uiTblClmPreviousColumn: configuredColumn?.uiTblClmPreviousColumn ?? null,
    uiTblClmIsActive: configuredColumn?.uiTblClmIsActive ?? true,
  };
}

// ─── Field focus / navigation ─────────────────────────────────────────────────

export function focusStockField(
  table: HTMLTableElement | null,
  rowId: number,
  fieldKey: string,
): void {
  const selector = `[data-opening-stock-row-id="${rowId}"][data-opening-stock-field-key="${fieldKey}"]`;
  const fieldControl = table?.querySelector<HTMLElement>(selector);
  if (!fieldControl) return;
  fieldControl.scrollIntoView({ block: "nearest", inline: "nearest" });
  fieldControl.focus();
  if (fieldControl instanceof HTMLInputElement && fieldControl.type !== "date") {
    fieldControl.select();
  }
}

function getFocusableStockControls(table: HTMLTableElement): HTMLElement[] {
  return Array.from(
    table.querySelectorAll<HTMLElement>('[data-opening-stock-field-control="true"]'),
  ).filter((element) => !element.matches(":disabled"));
}

export function moveStockFieldFocus(
  currentControl: HTMLElement,
  direction: "left" | "right",
): void {
  const table = currentControl.closest("table");
  if (!(table instanceof HTMLTableElement)) return;
  const controls = getFocusableStockControls(table);
  const currentIndex = controls.indexOf(currentControl);
  if (currentIndex === -1) return;
  const targetIndex = direction === "left" ? currentIndex - 1 : currentIndex + 1;
  const targetControl = controls[targetIndex];
  if (!targetControl) return;
  targetControl.scrollIntoView({ block: "nearest", inline: "nearest" });
  targetControl.focus();
  if (targetControl instanceof HTMLInputElement && targetControl.type !== "date") {
    targetControl.select();
  }
}

export function handleFieldNavigationKeyDown(event: ReactKeyboardEvent<HTMLElement>): boolean {
  if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey) return false;
  event.preventDefault();
  moveStockFieldFocus(event.currentTarget, "right");
  return true;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function buildInvalidFieldState(
  issues: Array<{ rowId: number; fieldKey: string }>,
): Record<string, true> {
  return issues.reduce<Record<string, true>>((acc, issue) => {
    acc[`${issue.rowId}:${issue.fieldKey}`] = true;
    return acc;
  }, {});
}
