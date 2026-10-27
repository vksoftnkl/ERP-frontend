import type { ListMeta } from "@/utils/types";
import { formatClock12 } from "@/lib/time-format";
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const EMPTY_META: ListMeta = {
  page: DEFAULT_PAGE,
  limit: DEFAULT_PAGE_SIZE,
  total: 0,
  total_pages: 0,
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
export type AuditDiffRow = {
  field: string;
  from: unknown;
  to: unknown;
};
export type AuditComparisonRow = {
  field: string;
  original: unknown;
  modified: unknown;
  diff: AuditDiffRow | null;
};
export function normalizeQueryValue(value: string | null): string {
  return value?.trim() ?? "";
}
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
export function buildRecordHistoryQuery(
  screenName: string,
  recordPk: string,
  page: number,
  limit: number,
): Record<string, string> {
  return {
    screen_name: screenName,
    record_pk: recordPk,
    page: String(page),
    limit: String(limit),
    /* total/total_pages come back null unless this is opted into, which leaves
       the pager stuck on a single page. */
    include_total: "true",
  };
}
/* Page size the modal reads with when it has to pull the whole history in one
   go (server allows up to 100 per page), plus a hard stop so a record with a
   runaway history can never spin an unbounded fetch loop. */
export const MODAL_FETCH_ALL_LIMIT = 100;
export const MODAL_FETCH_ALL_MAX_PAGES = 50;
/* Accordion groups shown per page once the whole history is in memory. */
export const MODAL_GROUPS_PER_PAGE = 10;
/* Composite screens whose audit history the server fans out across several
   child screens (mirrors the server's RELATED_AUDIT_SCREENS_BY_SCREEN_NAME).
   Their rows are merged into one date/time-keyed list; this map only supplies
   the short label each sub-entity carries inside a group, keyed on the row's
   `screen_name` — the reliable discriminator (`log_table_name` is a free-text
   label). Any master not listed here keeps the plain single-list,
   server-paginated view. */
export const HISTORY_SUB_ENTITY_LABELS: Record<string, Record<string, string>> = {
  "Item Master": {
    "Item Master": "Item",
    "Item Unit Conversion Master": "Unit Conversion",
    "Item EAN Code Master": "EAN Codes",
    "Item Reorder Master": "Reorders",
    "Item Price Master": "Price List",
  },
};
export const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
});
/** "15 Oct 2026, 02:05 PM" — the date as before, the clock 12-hour (Qt `hh:mm AP`). */
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
    return value;
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
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "string") {
    if (value.trim().length === 0) {
      return '""';
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
export function flattenAuditRecord(value: unknown, path = ""): Array<{ field: string; value: unknown }> {
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
export function buildAuditComparisonRows(
  originalRecord: unknown,
  modifiedRecord: unknown,
  changedFields: unknown,
): AuditComparisonRow[] {
  const originalEntries = flattenAuditRecord(originalRecord);
  const modifiedEntries = flattenAuditRecord(modifiedRecord);
  const diffRows = flattenAuditDiff(changedFields);
  const originalMap = new Map(originalEntries.map((entry) => [entry.field, entry.value]));
  const modifiedMap = new Map(modifiedEntries.map((entry) => [entry.field, entry.value]));
  const diffMap = new Map(diffRows.map((entry) => [entry.field, entry]));
  const orderedFields: string[] = [];
  const seenFields = new Set<string>();
  for (const field of [
    ...diffRows.map((entry) => entry.field),
    ...originalEntries.map((entry) => entry.field),
    ...modifiedEntries.map((entry) => entry.field),
  ]) {
    if (seenFields.has(field)) {
      continue;
    }
    seenFields.add(field);
    orderedFields.push(field);
  }
  return orderedFields.map((field) => ({
    field,
    original: originalMap.has(field) ? originalMap.get(field) : null,
    modified: modifiedMap.has(field) ? modifiedMap.get(field) : null,
    diff: diffMap.get(field) ?? null,
  }));
}
export function truncateValue(value: string | null | undefined, maxLength = 42): string {
  const normalized = value?.trim();
  if (!normalized) {
    return "-";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}
export function getRowUserLabel(row: AuditLogListItem): string {
  return row.log_user_name?.trim() || row.log_user_id?.trim() || "-";
}
export function normalizeViewerValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}
export type ModalDiffRow = {
  field: string;
  old: string;
  new: string;
};
/* One audit row inside a date/time group (e.g. the EAN-code write of a save). */
export type ModalHistoryEntry = {
  id: string;
  label: string;
  actionLabel: string;
  badgeClass: string;
  notes: string;
  diff: ModalDiffRow[];
};
/* Every audit row written at the same date/time, folded into one accordion
   item — a single save fans out across the record's child tables, and the user
   reads that as one change, not five. */
export type ModalHistoryGroup = {
  id: string;
  dateLabel: string;
  timeLabel: string;
  users: string[];
  actions: Array<{ label: string; badgeClass: string }>;
  sections: string[];
  entries: ModalHistoryEntry[];
  changeCount: number;
};
/* Rows are folded to the minute — that is the precision the modal prints, and
   the child writes of one save land within the same minute. */
export function getHistoryGroupKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  date.setSeconds(0, 0);
  return String(date.getTime());
}
export function resolveSubEntityLabel(parentScreen: string, rowScreen: string): string {
  const normalizedRowScreen = normalizeViewerValue(rowScreen);
  const labels = HISTORY_SUB_ENTITY_LABELS[parentScreen];
  if (labels?.[normalizedRowScreen]) {
    return labels[normalizedRowScreen];
  }
  return normalizedRowScreen.replace(/\s*Master$/i, "").trim() || "Record";
}
export function buildModalDiffRows(changedFields: unknown): ModalDiffRow[] {
  return flattenAuditDiff(changedFields).map((row) => ({
    field: row.field,
    old: formatAuditPrimitiveValue(row.from),
    new: formatAuditPrimitiveValue(row.to),
  }));
}

/* Rows are folded into accordion groups; badgeClassOf supplies the badge style
   for an action so this stays free of the stylesheet module. */
export function buildHistoryGroups(
  logs: AuditLogListItem[],
  screen: string,
  badgeClassOf: (action: string) => string,
): ModalHistoryGroup[] {
  const byKey = new Map<string, ModalHistoryGroup>();
  for (const log of logs) {
    const key = getHistoryGroupKey(log.log_date);
    let group = byKey.get(key);
    if (!group) {
      group = {
        id: key,
        dateLabel: formatDateOnly(log.log_date),
        timeLabel: formatTimeOnly(log.log_date),
        users: [],
        actions: [],
        sections: [],
        entries: [],
        changeCount: 0,
      };
      byKey.set(key, group);
    }
    const diff = buildModalDiffRows(log.log_changed_fields);
    const actionLabel = formatActionLabel(log.log_action);
    const label = resolveSubEntityLabel(screen, log.screen_name);
    const user = getRowUserLabel(log);
    group.entries.push({
      id: log.log_id,
      label,
      actionLabel,
      badgeClass: badgeClassOf(log.log_action),
      notes: log.log_notes?.trim() ?? "",
      diff,
    });
    group.changeCount += diff.length;
    if (user !== "-" && !group.users.includes(user)) {
      group.users.push(user);
    }
    if (!group.actions.some((action) => action.label === actionLabel)) {
      group.actions.push({ label: actionLabel, badgeClass: badgeClassOf(log.log_action) });
    }
    if (!group.sections.includes(label)) {
      group.sections.push(label);
    }
  }
  return [...byKey.values()];
}

/* Composite mode holds the whole history in memory, so it paginates the
   groups client-side; the plain view keeps the server's page as-is. */
export function pageHistoryGroups(
  groups: ModalHistoryGroup[],
  page: number,
  isComposite: boolean,
  safeTotalPages: number,
): { effectiveTotalPages: number; startIndex: number; displayGroups: ModalHistoryGroup[] } {
  const clientTotalPages = Math.max(1, Math.ceil(groups.length / MODAL_GROUPS_PER_PAGE));
  const effectiveTotalPages = isComposite ? clientTotalPages : safeTotalPages;
  const startIndex = isComposite ? (page - 1) * MODAL_GROUPS_PER_PAGE : 0;
  const displayGroups = isComposite
    ? groups.slice(startIndex, startIndex + MODAL_GROUPS_PER_PAGE)
    : groups;
  return { effectiveTotalPages, startIndex, displayGroups };
}
