import { formatClock12 } from "@/lib/time-format";
export type AuditActionFilter = "" | "New" | "update" | "approve" | "cancel";
export type AuditDatePreset = "7d" | "30d" | "all" | "custom";
export type AuditLogFilters = {
  search: string;
  action: AuditActionFilter;
  screenId: string;
  dateFrom: string;
  dateTo: string;
};
export type AuditLogListItem = {
  log_id: string;
  log_date: string;
  log_action: string;
  log_screen_id: number;
  screen_name: string;
  log_table_name: string;
  log_pk: string | null;
  log_display_name: string | null;
  log_original_record: unknown;
  log_modified_record: unknown;
  log_changed_fields: unknown;
  log_user_id: string | null;
  log_user_name: string | null;
  log_branch_id: string | null;
  log_branch_name: string | null;
  log_notes: string | null;
};
export const DEFAULT_FILTERS: AuditLogFilters = {
  search: "",
  action: "",
  screenId: "",
  dateFrom: "",
  dateTo: "",
};
/* The server rejects any action outside new/insert/update/approve/cancel with a
   400, so there is deliberately no "delete" option here. */
export const ACTION_OPTIONS: ReadonlyArray<{ value: AuditActionFilter; label: string }> = [
  { value: "", label: "All" },
  { value: "New", label: "New" },
  { value: "update", label: "Update" },
  { value: "approve", label: "Approve" },
  { value: "cancel", label: "Cancel" },
];
export const DATE_PRESETS: ReadonlyArray<{ key: Exclude<AuditDatePreset, "custom">; label: string; days: number | null }> = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "all", label: "All", days: null },
];
export const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
});
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
export function isDiffLeaf(value: unknown): value is { from: unknown; to: unknown } {
  return isRecord(value) && "from" in value && "to" in value;
}
export function looksLikeJsonString(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }
  return (
    normalized.startsWith("{") ||
    normalized.startsWith("[") ||
    normalized === "null" ||
    normalized === "true" ||
    normalized === "false" ||
    /^-?\d+(\.\d+)?$/.test(normalized)
  );
}
export function normalizeStructuredValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  if (!looksLikeJsonString(value)) {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
export function buildPresetRange(days: number): { dateFrom: string; dateTo: string } {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return { dateFrom: toDateInputValue(start), dateTo: toDateInputValue(today) };
}
export function resolveDatePreset(filters: AuditLogFilters): AuditDatePreset {
  if (!filters.dateFrom && !filters.dateTo) {
    return "all";
  }
  for (const preset of DATE_PRESETS) {
    if (preset.days === null) {
      continue;
    }
    const range = buildPresetRange(preset.days);
    if (range.dateFrom === filters.dateFrom && range.dateTo === filters.dateTo) {
      return preset.key;
    }
  }
  return "custom";
}
export function buildAuditLogQuery(
  filters: AuditLogFilters,
  page: number,
  limit: number,
): Record<string, string> {
  const query: Record<string, string> = {
    page: String(page),
    limit: String(limit),
    /* total/total_pages come back null unless this is opted into, which leaves
       the pager stuck on a single page. */
    include_total: "true",
  };
  const search = filters.search.trim();
  const screenId = filters.screenId.trim();
  if (search) {
    query.search = search;
  }
  if (filters.action) {
    query.action = filters.action;
  }
  if (screenId) {
    query.screen_id = screenId;
  }
  if (filters.dateFrom) {
    query.date_from = filters.dateFrom;
  }
  if (filters.dateTo) {
    query.date_to = filters.dateTo;
  }
  return query;
}
export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${DATE_FORMATTER.format(date)}, ${formatClock12(date)}`;
}
export function formatDateOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return DATE_FORMATTER.format(date);
}
export function formatTimeOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return formatClock12(date);
}
export function formatActionLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "Unknown";
  }
  if (normalized === "new" || normalized === "insert") {
    return "New";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
export function resolveActionVariant(value: string): "new" | "update" | "approve" | "cancel" | "neutral" {
  const normalized = value.trim().toLowerCase();
  if (normalized === "new" || normalized === "insert") {
    return "new";
  }
  if (normalized === "update") {
    return "update";
  }
  if (normalized === "approve") {
    return "approve";
  }
  if (normalized === "cancel") {
    return "cancel";
  }
  return "neutral";
}
export function countChangedFields(value: unknown): number {
  const normalizedValue = normalizeStructuredValue(value);
  if (normalizedValue === null || normalizedValue === undefined) {
    return 0;
  }
  if (isDiffLeaf(normalizedValue)) {
    return 1;
  }
  if (Array.isArray(normalizedValue)) {
    const nestedCount = normalizedValue.reduce(
      (count: number, item) => count + countChangedFields(item),
      0,
    );
    return nestedCount || normalizedValue.length;
  }
  if (isRecord(normalizedValue)) {
    const nestedCount = Object.values(normalizedValue).reduce(
      (count: number, item) => count + countChangedFields(item),
      0,
    );
    return nestedCount || Object.keys(normalizedValue).length;
  }
  return 1;
}
export function formatAuditFieldLabel(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return "Field";
  }
  return normalized
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
export function isIsoDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value));
}
export function formatAuditPrimitiveValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "∅";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "string") {
    if (value.trim().length === 0) {
      return "∅";
    }
    if (isIsoDateString(value)) {
      return formatDateTime(value);
    }
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
export type AuditDiffRow = {
  field: string;
  from: unknown;
  to: unknown;
};
export type AuditSnapshotRow = {
  field: string;
  value: unknown;
};
export function flattenAuditDiff(value: unknown, path = ""): AuditDiffRow[] {
  const normalizedValue = normalizeStructuredValue(value);
  if (normalizedValue === null || normalizedValue === undefined) {
    return [];
  }
  if (isDiffLeaf(normalizedValue)) {
    return [
      {
        field: path || "Value",
        from: normalizeStructuredValue(normalizedValue.from),
        to: normalizeStructuredValue(normalizedValue.to),
      },
    ];
  }
  if (Array.isArray(normalizedValue)) {
    return normalizedValue.flatMap((item, index) =>
      flattenAuditDiff(item, path ? `${path} / Item ${index + 1}` : `Item ${index + 1}`),
    );
  }
  if (isRecord(normalizedValue)) {
    return Object.entries(normalizedValue).flatMap(([key, entryValue]) =>
      flattenAuditDiff(
        entryValue,
        path ? `${path} / ${formatAuditFieldLabel(key)}` : formatAuditFieldLabel(key),
      ),
    );
  }
  if (!path) {
    return [];
  }
  return [{ field: path, from: null, to: normalizedValue }];
}
export function flattenAuditRecord(value: unknown, path = ""): AuditSnapshotRow[] {
  const normalizedValue = normalizeStructuredValue(value);
  if (normalizedValue === null || normalizedValue === undefined) {
    return path ? [{ field: path, value: null }] : [];
  }
  if (Array.isArray(normalizedValue)) {
    if (normalizedValue.length === 0) {
      return path ? [{ field: path, value: [] }] : [];
    }
    return normalizedValue.flatMap((item, index) =>
      flattenAuditRecord(item, path ? `${path} / Item ${index + 1}` : `Item ${index + 1}`),
    );
  }
  if (isRecord(normalizedValue)) {
    const entries = Object.entries(normalizedValue);
    if (entries.length === 0) {
      return path ? [{ field: path, value: {} }] : [];
    }
    return entries.flatMap(([key, entryValue]) =>
      flattenAuditRecord(
        entryValue,
        path ? `${path} / ${formatAuditFieldLabel(key)}` : formatAuditFieldLabel(key),
      ),
    );
  }
  return [{ field: path || "Value", value: normalizedValue }];
}
/* An insert/approve/cancel log carries no diff, so the row falls back to the
   record snapshot — otherwise those entries would be uninspectable. */
export function resolveSnapshot(row: AuditLogListItem): AuditSnapshotRow[] {
  const modified = normalizeStructuredValue(row.log_modified_record);
  const snapshotSource =
    modified === null || modified === undefined ? row.log_original_record : modified;
  return flattenAuditRecord(snapshotSource);
}
export function truncateValue(value: string | null | undefined, maxLength = 42): string {
  const normalized = value?.trim();
  if (!normalized) {
    return "—";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}
export function truncateMiddle(value: string | null | undefined, lead = 8, tail = 6): string {
  const normalized = value?.trim();
  if (!normalized) {
    return "—";
  }
  if (normalized.length <= lead + tail + 3) {
    return normalized;
  }
  return `${normalized.slice(0, lead)}...${normalized.slice(-tail)}`;
}
export function getRowUserLabel(row: AuditLogListItem): { label: string; title: string; muted: boolean } {
  const name = row.log_user_name?.trim();
  if (name) {
    return { label: name, title: name, muted: false };
  }
  const id = row.log_user_id?.trim();
  if (!id) {
    return { label: "—", title: "", muted: true };
  }
  return { label: truncateMiddle(id), title: id, muted: true };
}
export function getRowEntityLabel(row: AuditLogListItem): string {
  return row.log_display_name?.trim() || row.log_pk?.trim() || "-";
}
export function formatChangeSummary(value: unknown): string {
  const count = countChangedFields(value);
  if (count === 0) {
    return "No diff";
  }
  return `${count} field${count === 1 ? "" : "s"}`;
}
export function escapeCsvValue(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
export function toCsvRow(values: Array<string | number>): string {
  return values.map((value) => escapeCsvValue(String(value))).join(",");
}
/* The export file: a header line, then one line per audit row. */
export function buildAuditCsvLines(logs: AuditLogListItem[]): string[] {
  return [
    toCsvRow([
      "Log ID",
      "Date",
      "Action",
      "User",
      "Screen",
      "Table",
      "Entity",
      "Changes",
      "Notes",
    ]),
    ...logs.map((row) =>
      toCsvRow([
        row.log_id,
        formatDateTime(row.log_date),
        formatActionLabel(row.log_action),
        row.log_user_name?.trim() || row.log_user_id || "",
        row.screen_name,
        row.log_table_name,
        getRowEntityLabel(row),
        formatChangeSummary(row.log_changed_fields),
        row.log_notes ?? "",
      ]),
    ),
  ];
}
