"use client";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FiArrowLeft,
  FiCalendar,
  FiCheckCircle,
  FiChevronDown,
  FiClock,
  FiFilter,
  FiFileText,
  FiInfo,
  FiList,
  FiRotateCcw,
  FiUser,
  FiX,
} from "react-icons/fi";
import ModalPortal from "@/components/ui/modal-portal";
import { useApi } from "@/hooks/useApi";
import { notifyGlobalNavigationStart } from "@/lib/navigation/global-loader";
import type { ApiSuccessResponse, ListMeta } from "@/utils/types";
import styles from "./record-history-modal.module.scss";
const AUDIT_LOG_LIST_ENDPOINT = "/audit-logs/list";
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
const TABLE_COLUMN_COUNT = 5;
const EMPTY_META: ListMeta = {
  page: DEFAULT_PAGE,
  limit: DEFAULT_PAGE_SIZE,
  total: 0,
  total_pages: 0,
};
type AuditLogListItem = {
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
type AuditDiffRow = {
  field: string;
  from: unknown;
  to: unknown;
};
type AuditComparisonRow = {
  field: string;
  original: unknown;
  modified: unknown;
  diff: AuditDiffRow | null;
};
function cx(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(" ");
}
function normalizeQueryValue(value: string | null): string {
  return value?.trim() ?? "";
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isDiffLeaf(value: unknown): value is { from: unknown; to: unknown } {
  return isRecord(value) && "from" in value && "to" in value;
}
function looksLikeJsonString(value: string): boolean {
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
function normalizeStructuredValue(value: unknown): unknown {
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
function buildRecordHistoryQuery(
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
const MODAL_FETCH_ALL_LIMIT = 100;
const MODAL_FETCH_ALL_MAX_PAGES = 50;
/* Accordion groups shown per page once the whole history is in memory. */
const MODAL_GROUPS_PER_PAGE = 10;
/* Composite screens whose audit history the server fans out across several
   child screens (mirrors the server's RELATED_AUDIT_SCREENS_BY_SCREEN_NAME).
   Their rows are merged into one date/time-keyed list; this map only supplies
   the short label each sub-entity carries inside a group, keyed on the row's
   `screen_name` — the reliable discriminator (`log_table_name` is a free-text
   label). Any master not listed here keeps the plain single-list,
   server-paginated view. */
const HISTORY_SUB_ENTITY_LABELS: Record<string, Record<string, string>> = {
  "Item Master": {
    "Item Master": "Item",
    "Item Unit Conversion Master": "Unit Conversion",
    "Item EAN Code Master": "EAN Codes",
    "Item Reorder Master": "Reorders",
    "Item Price Master": "Price List",
  },
};
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});
const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
});
const TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeStyle: "short",
});
function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return DATE_TIME_FORMATTER.format(date);
}
function formatDateOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return DATE_FORMATTER.format(date);
}
function formatTimeOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return TIME_FORMATTER.format(date);
}
function formatActionLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "Unknown";
  }
  if (normalized === "new" || normalized === "insert") {
    return "New";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
function resolveActionVariant(value: string): "new" | "update" | "approve" | "cancel" | "neutral" {
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
function countChangedFields(value: unknown): number {
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
function formatAuditFieldLabel(value: string): string {
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
function isIsoDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value));
}
function formatAuditPrimitiveValue(value: unknown): string {
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
function flattenAuditDiff(value: unknown, path = ""): AuditDiffRow[] {
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
function flattenAuditRecord(value: unknown, path = ""): Array<{ field: string; value: unknown }> {
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
function buildAuditComparisonRows(
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
function truncateValue(value: string | null | undefined, maxLength = 42): string {
  const normalized = value?.trim();
  if (!normalized) {
    return "-";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}
function getRowUserLabel(row: AuditLogListItem): string {
  return row.log_user_name?.trim() || row.log_user_id?.trim() || "-";
}
const PANEL_CLASS =
  "rounded-[4px] border border-slate-200 bg-white shadow-[0_18px_52px_rgba(15,23,42,0.18)]";
const BUTTON_BASE_CLASS =
  "inline-flex items-center justify-center border border-transparent transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none";
const BACK_BUTTON_CLASS = cx(
  BUTTON_BASE_CLASS,
  "min-h-[34px] gap-1.5 rounded-[4px] border-slate-300 bg-white px-3 text-[12px] font-bold text-slate-700 hover:bg-slate-50",
);
const RETRY_BUTTON_CLASS = cx(
  BUTTON_BASE_CLASS,
  "min-h-[32px] rounded-[4px] border-rose-300 bg-white px-3 text-[12px] font-bold text-rose-700 hover:bg-rose-50",
);
const PAGINATION_BUTTON_CLASS = cx(
  BUTTON_BASE_CLASS,
  "h-9 min-w-[72px] rounded-[4px] border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-500 hover:border-slate-300 hover:bg-slate-50",
);
const PAGE_NUMBER_CLASS =
  "inline-flex h-9 min-w-[40px] items-center justify-center rounded-[4px] border border-slate-300 bg-white px-3 text-[14px] font-semibold text-slate-800 shadow-sm";
const ICON_BUTTON_CLASS = cx(
  BUTTON_BASE_CLASS,
  "h-10 w-10 rounded-[4px] border-slate-200 bg-white text-slate-500 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700",
);
const INPUT_BASE_CLASS =
  "w-full border border-slate-300 bg-white text-slate-800 transition-[border-color,box-shadow,background-color] duration-150 focus:border-sky-300 focus:outline-none focus:ring-4 focus:ring-sky-500/10";
const PAGE_SIZE_SELECT_CLASS = cx(
  INPUT_BASE_CLASS,
  "h-9 min-w-[84px] appearance-none rounded-[4px] py-0 pl-4 pr-9 text-[14px] font-semibold",
);
const TABLE_HEADER_CELL_CLASS =
  "sticky top-0 z-[1] border-b border-slate-200 bg-slate-50/90 p-2 text-center align-middle text-[14px] font-bold whitespace-nowrap text-slate-600";
const TABLE_CELL_CLASS =
  "border-b border-slate-200 p-2 text-center align-middle text-[15px] text-slate-700";
const JSON_TITLE_CLASS = "m-0 text-[14px] font-bold text-slate-800";
const JSON_FIELD_ROW_CLASS =
  "grid gap-1 rounded-[4px] border border-slate-200 bg-slate-50 px-3 py-2.5";
const JSON_FIELD_KEY_CLASS =
  "m-0 text-[11px] font-extrabold uppercase text-slate-500";
const JSON_FIELD_VALUE_CLASS =
  "m-0 break-words text-[13px] leading-5 font-semibold text-slate-800 whitespace-pre-wrap";
const JSON_ARRAY_ITEM_CLASS =
  "grid gap-1.5 rounded-[4px] border border-white/80 bg-white px-2.5 py-2";
const DETAIL_JSON_TABLE_SHELL_CLASS =
  "min-h-0 overflow-hidden rounded-[4px] border border-slate-200 bg-white";
const DETAIL_JSON_TABLE_HEADER_CLASS =
  "sticky top-0 z-[2] border-b border-r border-slate-200 bg-slate-50 p-2 text-left align-middle last:border-r-0";
const DETAIL_JSON_TABLE_CELL_CLASS =
  "border-r border-slate-200 p-2 align-middle last:border-r-0";
const DETAIL_JSON_TABLE_ROW_CLASS = "border-b border-slate-100 last:border-b-0";
const DETAIL_JSON_TABLE_FIELD_CLASS = "min-w-[180px]";
const DETAIL_JSON_TABLE_VALUE_CLASS = "min-w-[220px]";
const DETAIL_JSON_TABLE_STATUS_CLASS = "min-w-[140px]";
function renderStructuredAuditValue(value: unknown, path = "root"): ReactNode {
  const normalizedValue = normalizeStructuredValue(value);
  if (normalizedValue === null || normalizedValue === undefined) {
    return <p className={JSON_FIELD_VALUE_CLASS}>null</p>;
  }
  if (Array.isArray(normalizedValue)) {
    if (normalizedValue.length === 0) {
      return <p className={JSON_FIELD_VALUE_CLASS}>[]</p>;
    }
    return (
      <div className="grid gap-2">
        {normalizedValue.map((item, index) => {
          const normalizedItem = normalizeStructuredValue(item);
          const isNestedItem = isRecord(normalizedItem) || Array.isArray(normalizedItem);
          return (
            <div className={JSON_ARRAY_ITEM_CLASS} key={`${path}-${index + 1}`}>
              {isNestedItem ? (
                <>
                  <p className={JSON_FIELD_KEY_CLASS}>Item {index + 1}</p>
                  {renderStructuredAuditValue(normalizedItem, `${path}-${index + 1}`)}
                </>
              ) : (
                <p className={JSON_FIELD_VALUE_CLASS}>
                  {formatAuditPrimitiveValue(normalizedItem)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  if (isRecord(normalizedValue)) {
    const entries = Object.entries(normalizedValue);
    if (entries.length === 0) {
      return <p className={JSON_FIELD_VALUE_CLASS}>{"{}"}</p>;
    }
    return (
      <div className="grid gap-2">
        {entries.map(([key, entryValue]) => {
          const normalizedEntryValue = normalizeStructuredValue(entryValue);
          const isNestedEntry =
            isRecord(normalizedEntryValue) || Array.isArray(normalizedEntryValue);
          return (
            <div className={JSON_FIELD_ROW_CLASS} key={`${path}-${key}`}>
              <p className={JSON_FIELD_KEY_CLASS}>{formatAuditFieldLabel(key)}</p>
              {isNestedEntry ? (
                renderStructuredAuditValue(normalizedEntryValue, `${path}-${key}`)
              ) : (
                <p className={JSON_FIELD_VALUE_CLASS}>
                  {formatAuditPrimitiveValue(normalizedEntryValue)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  return <p className={JSON_FIELD_VALUE_CLASS}>{formatAuditPrimitiveValue(normalizedValue)}</p>;
}
function renderAuditTableValue(value: unknown, key: string): ReactNode {
  const normalizedValue = normalizeStructuredValue(value);
  if (normalizedValue === null || normalizedValue === undefined) {
    return <span className="text-sm font-medium text-slate-400">-</span>;
  }
  if (!Array.isArray(normalizedValue) && !isRecord(normalizedValue)) {
    return (
      <span className="block whitespace-pre-wrap break-words text-sm leading-6 font-semibold text-slate-800">
        {formatAuditPrimitiveValue(normalizedValue)}
      </span>
    );
  }
  return <div className="max-w-full">{renderStructuredAuditValue(normalizedValue, key)}</div>;
}
function getActionBadgeClass(value: string): string {
  const variant = resolveActionVariant(value);
  return cx(
    "inline-flex min-h-[26px] items-center justify-center rounded-[4px] border px-2.5 text-[11px] font-bold uppercase tracking-[0.04em]",
    variant === "new" && "border-emerald-200 bg-emerald-50 text-emerald-700",
    variant === "update" && "border-blue-200 bg-blue-50 text-blue-700",
    variant === "approve" && "border-lime-200 bg-lime-50 text-lime-700",
    variant === "cancel" && "border-rose-200 bg-rose-50 text-rose-700",
    variant === "neutral" && "border-slate-200 bg-slate-50 text-slate-600",
  );
}
type RecordHistoryViewerProps = {
  displayName?: string | null;
  onBack?: (() => void) | undefined;
  recordPk: string | number | null | undefined;
  screenName: string | number | null | undefined;
};
export type RecordHistoryModalProps = {
  displayName?: string | null;
  isOpen: boolean;
  onClose: () => void;
  recordPk: string | number | null | undefined;
  screenName: string | number | null | undefined;
};
function normalizeViewerValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}
function RecordHistoryViewer({
  displayName: displayNameProp,
  onBack,
  recordPk: recordPkProp,
  screenName: screenNameProp,
}: RecordHistoryViewerProps) {
  const screenName = normalizeViewerValue(screenNameProp);
  const recordPk = normalizeViewerValue(recordPkProp);
  const displayName = normalizeViewerValue(displayNameProp);
  const [logs, setLogs] = useState<AuditLogListItem[]>([]);
  const [meta, setMeta] = useState<ListMeta>(EMPTY_META);
  const [currentPage, setCurrentPage] = useState(DEFAULT_PAGE);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedLog, setSelectedLog] = useState<AuditLogListItem | null>(null);
  const [showChangedOnly, setShowChangedOnly] = useState(false);
  const { getAll: listAuditLogs, loading, error } = useApi<
    ApiSuccessResponse<AuditLogListItem[], ListMeta>
  >(AUDIT_LOG_LIST_ENDPOINT, {
    toast: { success: false, error: true },
  });
  const safeTotalPages = Math.max(
    1,
    meta.total_pages || Math.ceil(Math.max(meta.total, 1) / Math.max(meta.limit || pageSize, 1)),
  );
  const pageStart = meta.total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = meta.total === 0 ? 0 : Math.min(pageStart + logs.length - 1, meta.total);
  const selectedLogChangeCount = countChangedFields(selectedLog?.log_changed_fields);
  const selectedLogComparisonRows = useMemo(
    () =>
      selectedLog
        ? buildAuditComparisonRows(
            selectedLog.log_original_record,
            selectedLog.log_modified_record,
            selectedLog.log_changed_fields,
          )
        : [],
    [selectedLog],
  );
  const selectedLogChangedRows = useMemo(
    () => selectedLogComparisonRows.filter((row) => row.diff),
    [selectedLogComparisonRows],
  );
  const selectedLogVisibleRows = showChangedOnly
    ? selectedLogChangedRows
    : selectedLogComparisonRows;
  const selectedLogTotalFieldCount = selectedLogComparisonRows.length;
  const selectedLogChangedFieldCount = selectedLogChangedRows.length || selectedLogChangeCount;
  const selectedLogUserLabel = selectedLog ? getRowUserLabel(selectedLog) : "-";
  const fetchRecordHistory = useCallback(async () => {
    if (!screenName || !recordPk) {
      setLogs([]);
      setMeta(EMPTY_META);
      setSelectedLog(null);
      return;
    }
    try {
      const response = await listAuditLogs(
        buildRecordHistoryQuery(screenName, recordPk, currentPage, pageSize),
      );
      if (!response) {
        return;
      }
      setLogs(response.data);
      setMeta({
        page: response.meta?.page ?? currentPage,
        limit: response.meta?.limit ?? pageSize,
        total: response.meta?.total ?? response.data.length,
        total_pages:
          response.meta?.total_pages ??
          Math.max(
            1,
            Math.ceil((response.meta?.total ?? response.data.length) / Math.max(pageSize, 1)),
          ),
      });
    } catch {
      // useApi already exposes the error state.
    }
  }, [currentPage, listAuditLogs, pageSize, recordPk, screenName]);
  useEffect(() => {
    void fetchRecordHistory();
  }, [fetchRecordHistory, refreshKey]);
  useEffect(() => {
    setCurrentPage(DEFAULT_PAGE);
    setSelectedLog(null);
  }, [recordPk, screenName]);
  useEffect(() => {
    if (currentPage > safeTotalPages) {
      setCurrentPage(safeTotalPages);
    }
  }, [currentPage, safeTotalPages]);
  useEffect(() => {
    if (selectedLog && !logs.some((row) => row.log_id === selectedLog.log_id)) {
      setSelectedLog(null);
    }
  }, [logs, selectedLog]);
  useEffect(() => {
    setShowChangedOnly(false);
  }, [selectedLog?.log_id]);
  const handleRefresh = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);
  const handleOpenDetail = useCallback((row: AuditLogListItem) => {
    setSelectedLog(row);
  }, []);
  const handleCloseDetail = useCallback(() => {
    setSelectedLog(null);
  }, []);
  const tableSummary =
    meta.total === 0
      ? "Showing 0 of 0 history records"
      : `Showing ${pageStart} to ${pageEnd} of ${meta.total} history records`;
  const totalHistoryRecords = meta.total || logs.length;
  const latestLog = logs[0] ?? null;
  const latestUserLabel = latestLog ? getRowUserLabel(latestLog) : "-";
  const historySummaryChips =
    screenName && recordPk ? (
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex min-h-10 items-center gap-2 rounded-[4px] border border-blue-200 bg-blue-50 px-3.5 text-[14px] font-bold text-blue-700">
          <FiClock className="h-4 w-4" aria-hidden="true" />
          <span>
            {totalHistoryRecords} {totalHistoryRecords === 1 ? "Change" : "Changes"}
          </span>
        </span>
        <span className="inline-flex min-h-10 items-center gap-2 rounded-[4px] border border-emerald-200 bg-emerald-50 px-3.5 text-[14px] font-bold text-emerald-700">
          <FiCalendar className="h-4 w-4" aria-hidden="true" />
          <span>Last: {latestLog ? formatDateTime(latestLog.log_date) : "-"}</span>
        </span>
        <span className="inline-flex min-h-10 items-center gap-2 rounded-[4px] border border-violet-200 bg-violet-50 px-3.5 text-[14px] font-bold text-violet-700">
          <FiUser className="h-4 w-4" aria-hidden="true" />
          <span>By {latestUserLabel}</span>
        </span>
      </div>
    ) : null;
  const viewerBody = !screenName || !recordPk ? (
    <section className={cx(PANEL_CLASS, "grid gap-2.5 p-4")}>
      <h2 className="m-0 text-base font-bold text-slate-900">Missing record context</h2>
      <p className="m-0 text-[13px] text-slate-500">
        Open this page from a table row Logs action so it can load one record&apos;s audit
        history.
      </p>
      <div>
        <button className={BACK_BUTTON_CLASS} type="button" onClick={onBack}>
          <FiArrowLeft aria-hidden="true" />
          <span>Go back</span>
        </button>
      </div>
    </section>
  ) : (
    <>
      {error ? (
        <div className="flex flex-col gap-2 rounded-[4px] border border-rose-200 bg-rose-50 px-3 py-2.5 min-[781px]:flex-row min-[781px]:items-center min-[781px]:justify-between">
          <p className="m-0 text-[13px] text-rose-700">{error}</p>
          <button className={RETRY_BUTTON_CLASS} type="button" onClick={handleRefresh}>
            Retry
          </button>
        </div>
      ) : null}
      <section className="min-w-0 flex flex-1 flex-col overflow-hidden rounded-[4px] border border-slate-200 bg-white">
        <div className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable_both-edges]">
          <table className="w-full min-w-[920px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={cx(TABLE_HEADER_CELL_CLASS, "text-center")}>#</th>
                <th className={TABLE_HEADER_CELL_CLASS}>Date &amp; Time</th>
                <th className={cx(TABLE_HEADER_CELL_CLASS, "text-center")}>Action</th>
                <th className={TABLE_HEADER_CELL_CLASS}>User</th>
                <th className={TABLE_HEADER_CELL_CLASS}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 ? (
                <tr>
                  <td className="p-2 text-center text-sm text-slate-500" colSpan={TABLE_COLUMN_COUNT}>
                    Loading record history...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td className="p-2 text-center text-sm text-slate-500" colSpan={TABLE_COLUMN_COUNT}>
                    No audit history was found for this record.
                  </td>
                </tr>
              ) : (
                logs.map((row, rowIndex) => (
                  <tr
                    key={row.log_id}
                    className={cx(
                      "cursor-pointer transition-colors hover:bg-slate-50",
                      selectedLog?.log_id === row.log_id && "bg-blue-50",
                    )}
                    onClick={() => handleOpenDetail(row)}
                  >
                    <td className={cx(TABLE_CELL_CLASS, "w-[72px] text-center text-slate-700")}>
                      {(currentPage - 1) * pageSize + rowIndex + 1}
                    </td>
                    <td className={TABLE_CELL_CLASS}>
                      <div className="flex items-center justify-center gap-4">
                        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px]  bg-blue-50 text-blue-600">
                          <FiClock className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span className="grid gap-1 text-center">
                          <span className="font-bold text-slate-900">{formatDateOnly(row.log_date)}</span>
                          <span className="text-[14px] text-slate-600">{formatTimeOnly(row.log_date)}</span>
                        </span>
                      </div>
                    </td>
                    <td className={cx(TABLE_CELL_CLASS, "text-center")}>
                      <span className={getActionBadgeClass(row.log_action)}>
                        {formatActionLabel(row.log_action)}
                      </span>
                    </td>
                    <td className={TABLE_CELL_CLASS}>
                      <div className="flex items-center justify-center gap-3">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] text-slate-500">
                          <FiUser className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span>{getRowUserLabel(row)}</span>
                      </div>
                    </td>
                    <td className={TABLE_CELL_CLASS}>
                      <span className="inline-block max-w-full truncate">
                        {truncateValue(row.log_notes, 72)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-200 p-2 min-[781px]:flex-row min-[781px]:items-center min-[781px]:justify-between">
          <div className="inline-flex items-center gap-3 text-[15px] text-slate-600">
            <FiFileText className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
            <span>{tableSummary}</span>
          </div>
          <div className="flex flex-col gap-3 min-[781px]:flex-row min-[781px]:flex-wrap min-[781px]:items-center min-[781px]:gap-5">
            <label className="inline-flex flex-wrap items-center gap-2">
              <span className="text-[15px] text-slate-700">Rows per page</span>
              <div className="relative">
                <select
                  className={PAGE_SIZE_SELECT_CLASS}
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setCurrentPage(DEFAULT_PAGE);
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <FiChevronDown
                  className="pointer-events-none absolute top-1/2 right-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
                  aria-hidden="true"
                />
              </div>
            </label>
            <div className="inline-flex flex-wrap items-center gap-3">
              <button
                className={PAGINATION_BUTTON_CLASS}
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(DEFAULT_PAGE, page - 1))}
                disabled={currentPage <= DEFAULT_PAGE}
                aria-label="Previous page"
              >
                Previous
              </button>
              <span className={PAGE_NUMBER_CLASS}>
                {currentPage}
              </span>
              <span className="text-[15px] text-slate-600">/ {safeTotalPages}</span>
              <button
                className={PAGINATION_BUTTON_CLASS}
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(safeTotalPages, page + 1))}
                disabled={currentPage >= safeTotalPages}
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </section>
      {selectedLog ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-[210] overflow-hidden bg-slate-950/45 px-4 py-4 backdrop-blur-[1px]"
          role="dialog"
          onClick={handleCloseDetail}
        >
          <div className="flex h-full items-center justify-center">
            <section
              className={cx(
                PANEL_CLASS,
                "flex h-[calc(100vh-2rem)] w-full max-w-[min(1180px,92vw)] min-h-0 flex-col overflow-hidden bg-white p-2",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="flex shrink-0 flex-col gap-3 p-2 min-[781px]:flex-row min-[781px]:items-start min-[781px]:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[4px] bg-violet-100 text-indigo-700">
                    <FiFileText className="h-7 w-7" aria-hidden="true" />
                  </span>
                  <div className="grid min-w-0 gap-1.5">
                    <p className="m-0 text-[12px] font-extrabold uppercase text-blue-700">
                      Audit Detail
                    </p>
                    <h2 className="m-0 text-[24px] leading-tight font-bold text-slate-950 max-[780px]:text-[20px]">
                      {formatActionLabel(selectedLog.log_action)} log for {selectedLog.screen_name}
                    </h2>
                    <p className="m-0 flex flex-wrap items-center gap-2 text-[14px] text-slate-600">
                      <FiCalendar className="h-4 w-4 text-slate-500" aria-hidden="true" />
                      <span>Captured on {formatDateTime(selectedLog.log_date)}</span>
                      <span>for</span>
                      <span className="inline-flex min-h-6 items-center rounded-[4px] bg-blue-50 px-2.5 text-[13px] font-semibold text-blue-700">
                        {selectedLog.screen_name}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-8">
                  <div className="hidden items-center gap-3 pt-7 min-[960px]:flex">
                    <FiUser className="h-5 w-5 text-slate-600" aria-hidden="true" />
                    <span className="grid gap-1 text-[13px] text-slate-500">
                      <span>Captured by</span>
                      <strong className="text-[15px] text-slate-950">{selectedLogUserLabel}</strong>
                    </span>
                  </div>
                  <button
                    aria-label="Close audit detail"
                    className={cx(ICON_BUTTON_CLASS, "h-10 w-10 self-start text-[20px]")}
                    type="button"
                    onClick={handleCloseDetail}
                  >
                    <FiX aria-hidden="true" />
                  </button>
                </div>
              </header>
              <section className="grid shrink-0 grid-cols-1 gap-2 p-2 pt-0 min-[720px]:grid-cols-2 min-[1120px]:grid-cols-4">
                <div className="flex min-h-[64px] items-center gap-3 rounded-[4px] border border-violet-200 bg-violet-50/40 p-2">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] bg-violet-100 text-violet-700">
                    <FiRotateCcw className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="grid gap-1">
                    <span className="text-[14px] text-slate-600">Changed Fields</span>
                    <strong className="text-[22px] leading-none text-violet-700">
                      {selectedLogChangedFieldCount}
                    </strong>
                  </span>
                </div>
                <div className="flex min-h-[64px] items-center gap-3 rounded-[4px] border border-emerald-200 bg-emerald-50/40 p-2">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] bg-emerald-100 text-emerald-700">
                    <FiList className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="grid gap-1">
                    <span className="text-[14px] text-slate-600">Total Fields</span>
                    <strong className="text-[22px] leading-none text-emerald-700">
                      {selectedLogTotalFieldCount}
                    </strong>
                  </span>
                </div>
                <div className="flex min-h-[64px] items-center gap-3 rounded-[4px] border border-slate-200 bg-white p-2">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] bg-blue-50 text-blue-700">
                    <FiUser className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="grid gap-1">
                    <span className="text-[14px] text-slate-600">Captured By</span>
                    <strong className="text-[17px] text-slate-950">{selectedLogUserLabel}</strong>
                  </span>
                </div>
                <div className="flex min-h-[64px] items-center gap-3 rounded-[4px] border border-amber-200 bg-amber-50/40 p-2">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] bg-amber-100 text-orange-600">
                    <FiCalendar className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="grid gap-1">
                    <span className="text-[14px] text-slate-600">Audit Time</span>
                    <strong className="text-[15px] text-slate-950">
                      {formatDateTime(selectedLog.log_date)}
                    </strong>
                  </span>
                </div>
              </section>
              <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[4px] border border-slate-200 bg-white">
                <div className="flex flex-col gap-2 border-b border-slate-200 p-2 min-[781px]:flex-row min-[781px]:items-center min-[781px]:justify-between">
                  <p className="m-0 text-[15px] text-slate-600">
                    Showing{" "}
                    <strong className="text-blue-700">{selectedLogVisibleRows.length}</strong> of{" "}
                    <strong className="text-slate-950">{selectedLogTotalFieldCount}</strong> fields
                  </p>
                  <button
                    className={cx(
                      BUTTON_BASE_CLASS,
                      "min-h-8 gap-2 rounded-[4px] border-blue-200 bg-white px-3 text-[14px] font-bold text-blue-700 hover:bg-blue-50",
                      showChangedOnly && "border-blue-600 bg-blue-50",
                    )}
                    type="button"
                    onClick={() => setShowChangedOnly((value) => !value)}
                  >
                    <FiFilter className="h-4 w-4" aria-hidden="true" />
                    <span>{showChangedOnly ? "Show All Fields" : "Show Changed Only"}</span>
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable_both-edges]">
                  <table className="w-full min-w-[1100px] border-separate border-spacing-0">
                    <thead>
                      <tr>
                        <th className={cx(DETAIL_JSON_TABLE_HEADER_CLASS, DETAIL_JSON_TABLE_FIELD_CLASS)}>
                          <h3 className={JSON_TITLE_CLASS}>Field</h3>
                        </th>
                        <th className={cx(DETAIL_JSON_TABLE_HEADER_CLASS, DETAIL_JSON_TABLE_VALUE_CLASS)}>
                          <h3 className={JSON_TITLE_CLASS}>Original record</h3>
                        </th>
                        <th className={cx(DETAIL_JSON_TABLE_HEADER_CLASS, DETAIL_JSON_TABLE_VALUE_CLASS)}>
                          <h3 className={JSON_TITLE_CLASS}>Modified record</h3>
                        </th>
                        <th className={cx(DETAIL_JSON_TABLE_HEADER_CLASS, DETAIL_JSON_TABLE_STATUS_CLASS)}>
                          <h3 className={JSON_TITLE_CLASS}>Status</h3>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedLogVisibleRows.length === 0 ? (
                        <tr>
                          <td className="p-2 text-sm text-slate-500" colSpan={4}>
                            {showChangedOnly
                              ? "No changed fields were found for this audit entry."
                              : "No audit record data was captured for this entry."}
                          </td>
                        </tr>
                      ) : (
                        selectedLogVisibleRows.map((row, index) => (
                          <tr
                            className={cx(
                              DETAIL_JSON_TABLE_ROW_CLASS,
                              row.diff ? "bg-amber-100/70" : "bg-white",
                            )}
                            key={`${row.field}-${index + 1}`}
                          >
                            <td className={cx(DETAIL_JSON_TABLE_CELL_CLASS, DETAIL_JSON_TABLE_FIELD_CLASS)}>
                              <p className="m-0 text-[13px] leading-5 font-semibold text-slate-900">
                                {row.field}
                              </p>
                            </td>
                            <td className={cx(DETAIL_JSON_TABLE_CELL_CLASS, DETAIL_JSON_TABLE_VALUE_CLASS)}>
                              {renderAuditTableValue(row.original, `original-${index + 1}`)}
                            </td>
                            <td className={cx(DETAIL_JSON_TABLE_CELL_CLASS, DETAIL_JSON_TABLE_VALUE_CLASS)}>
                              {renderAuditTableValue(row.modified, `modified-${index + 1}`)}
                            </td>
                            <td className={cx(DETAIL_JSON_TABLE_CELL_CLASS, DETAIL_JSON_TABLE_STATUS_CLASS)}>
                              <span
                                className={cx(
                                  "inline-flex min-h-6 items-center gap-1.5 rounded-[4px] px-2.5 text-[12px] font-bold",
                                  row.diff
                                    ? "bg-orange-100 text-orange-700"
                                    : "bg-slate-100 text-slate-600",
                                )}
                              >
                                {row.diff ? (
                                  <FiInfo className="h-3.5 w-3.5" aria-hidden="true" />
                                ) : (
                                  <FiCheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                )}
                                <span>{row.diff ? "Changed" : "Same"}</span>
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
              <footer className="mt-2 flex shrink-0 flex-col gap-2 rounded-[4px] border border-slate-200 bg-slate-50 p-2 min-[781px]:flex-row min-[781px]:items-center min-[781px]:justify-between">
                <p className="m-0 inline-flex items-center gap-2 text-[14px] text-blue-700">
                  <FiInfo className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Changed fields are highlighted in yellow.</span>
                </p>
                <button
                  className="inline-flex min-h-9 min-w-[88px] items-center justify-center rounded-[4px] border border-blue-900 bg-blue-900 px-4 text-[14px] font-bold text-white hover:bg-blue-800"
                  type="button"
                  onClick={handleCloseDetail}
                >
                  Close
                </button>
              </footer>
            </section>
          </div>
        </div>
      ) : null}
    </>
  );
  return (
    <main className="min-h-[calc(100vh-72px)] bg-gradient-to-b from-[#f7f7f8] to-[#f1f2f4] text-slate-800">
      <div className="flex min-h-[calc(100vh-72px)] flex-col gap-3 p-3 max-[780px]:gap-2.5 max-[780px]:p-2.5">
        <header className="flex flex-col gap-2 min-[781px]:flex-row min-[781px]:items-start min-[781px]:justify-between">
          <div className="grid gap-2">
            <div className="flex items-start gap-2.5">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] bg-indigo-50 text-indigo-600">
                <FiRotateCcw className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="grid gap-0.5">
                <p className="m-0 text-[11px] leading-none font-extrabold uppercase text-slate-500">
                  Record History
                </p>
                <h1 className="m-0 text-[24px] leading-tight font-bold text-slate-900">
                  {displayName || "Selected record"}
                </h1>
              </div>
            </div>
            {historySummaryChips}
          </div>
          <button className={BACK_BUTTON_CLASS} type="button" onClick={onBack}>
            <FiArrowLeft aria-hidden="true" />
            <span>Back</span>
          </button>
        </header>
        {viewerBody}
      </div>
    </main>
  );
}
type ModalDiffRow = {
  field: string;
  old: string;
  new: string;
};
/* One audit row inside a date/time group (e.g. the EAN-code write of a save). */
type ModalHistoryEntry = {
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
type ModalHistoryGroup = {
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
function getHistoryGroupKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  date.setSeconds(0, 0);
  return String(date.getTime());
}
function resolveSubEntityLabel(parentScreen: string, rowScreen: string): string {
  const normalizedRowScreen = normalizeViewerValue(rowScreen);
  const labels = HISTORY_SUB_ENTITY_LABELS[parentScreen];
  if (labels?.[normalizedRowScreen]) {
    return labels[normalizedRowScreen];
  }
  return normalizedRowScreen.replace(/\s*Master$/i, "").trim() || "Record";
}
function buildModalDiffRows(changedFields: unknown): ModalDiffRow[] {
  return flattenAuditDiff(changedFields).map((row) => ({
    field: row.field,
    old: formatAuditPrimitiveValue(row.from),
    new: formatAuditPrimitiveValue(row.to),
  }));
}
function getModalBadgeClass(action: string): string {
  switch (resolveActionVariant(action)) {
    case "new":
      return styles.badgeNew;
    case "update":
      return styles.badgeUpdate;
    case "approve":
      return styles.badgeApprove;
    case "cancel":
      return styles.badgeCancel;
    default:
      return styles.badgeNeutral;
  }
}
function ModalHistoryGroupRow({
  group,
  index,
  open,
  showSections,
  onToggle,
}: {
  group: ModalHistoryGroup;
  index: number;
  open: boolean;
  showSections: boolean;
  onToggle: () => void;
}) {
  return (
    <section className={cx(styles.group, open && styles.groupOpen)}>
      <button
        aria-expanded={open}
        className={styles.groupHead}
        type="button"
        onClick={onToggle}
      >
        <span className={styles.caret} aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        <span className={styles.groupIndex}>{index}</span>
        <span className={styles.groupWhen}>
          <span className={styles.groupDate}>{group.dateLabel}</span>
          <span className={styles.groupTime}>{group.timeLabel}</span>
        </span>
        <span className={styles.groupBadges}>
          {group.actions.map((action) => (
            <span className={cx(styles.badge, action.badgeClass)} key={action.label}>
              {action.label}
            </span>
          ))}
        </span>
        <span className={styles.groupUser}>{group.users.join(", ") || "—"}</span>
        <span className={styles.groupCount}>
          {group.changeCount} field{group.changeCount === 1 ? "" : "s"} ·{" "}
          {group.entries.length} record{group.entries.length === 1 ? "" : "s"}
        </span>
        {/* Single-entity masters repeat one label on every row, so the column
            only earns its space on composite screens. */}
        {showSections ? (
          <span className={styles.groupSections}>
            {group.sections.map((section) => (
              <span className={styles.sectionChip} key={section}>
                {section}
              </span>
            ))}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className={styles.groupBody}>
          {group.entries.map((entry) => (
            <div className={styles.entry} key={entry.id}>
              <div className={styles.entryHead}>
                <span className={styles.entryLabel}>{entry.label}</span>
                <span className={cx(styles.badge, entry.badgeClass)}>{entry.actionLabel}</span>
                {entry.notes ? <span className={styles.entryNotes}>{entry.notes}</span> : null}
              </div>
              {entry.diff.length > 0 ? (
                <div className={styles.detailScroll}>
                  <table className={styles.diffTable}>
                    <thead>
                      <tr>
                        <th style={{ width: 190 }}>Field</th>
                        <th style={{ width: 200 }}>Old Value</th>
                        <th>New Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.diff.map((diffRow, diffIndex) => (
                        <tr key={`${diffRow.field}-${diffIndex + 1}`}>
                          <td className={styles.diffField}>{diffRow.field}</td>
                          <td className={styles.diffOld}>{diffRow.old}</td>
                          <td className={styles.diffNew}>{diffRow.new}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={styles.entryEmpty}>No field-level changes were recorded.</p>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
type RecordHistoryModalContentProps = Omit<RecordHistoryModalProps, "isOpen">;
function RecordHistoryModalContent({
  displayName,
  onClose,
  recordPk,
  screenName,
}: RecordHistoryModalContentProps) {
  const screen = normalizeViewerValue(screenName);
  const recordPkValue = normalizeViewerValue(recordPk);
  const recordName = normalizeViewerValue(displayName);
  const hasContext = Boolean(screen && recordPkValue);
  const [logs, setLogs] = useState<AuditLogListItem[]>([]);
  const [meta, setMeta] = useState<ListMeta>(EMPTY_META);
  const [page, setPage] = useState(DEFAULT_PAGE);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  /* Composite screens are read whole so every sub-entity write of one save can
     land in the same date/time group; plain masters stay server-paginated. */
  const isComposite = Boolean(HISTORY_SUB_ENTITY_LABELS[screen]);
  const { getAll: listAuditLogs, loading, error } = useApi<
    ApiSuccessResponse<AuditLogListItem[], ListMeta>
  >(AUDIT_LOG_LIST_ENDPOINT, {
    toast: { success: false, error: true },
  });
  const safeTotalPages = Math.max(
    1,
    meta.total_pages ||
      Math.ceil(Math.max(meta.total, 1) / Math.max(meta.limit || DEFAULT_PAGE_SIZE, 1)),
  );
  const fetchHistory = useCallback(async () => {
    if (!hasContext) {
      setLogs([]);
      setMeta(EMPTY_META);
      return;
    }
    try {
      if (isComposite) {
        /* The server merges the composite screen's child histories into one
           server-paginated stream, so date/time grouping needs the whole set in
           memory. Page through it (100 at a time) and paginate client-side. */
        const collected: AuditLogListItem[] = [];
        let pageNo = DEFAULT_PAGE;
        let totalPages = 1;
        do {
          const response = await listAuditLogs(
            buildRecordHistoryQuery(screen, recordPkValue, pageNo, MODAL_FETCH_ALL_LIMIT),
          );
          if (!response) {
            break;
          }
          collected.push(...response.data);
          const reportedTotal = response.meta?.total ?? collected.length;
          totalPages =
            response.meta?.total_pages ??
            Math.max(1, Math.ceil(reportedTotal / MODAL_FETCH_ALL_LIMIT));
          if (response.data.length === 0) {
            break;
          }
          pageNo += 1;
        } while (pageNo <= totalPages && pageNo <= MODAL_FETCH_ALL_MAX_PAGES);
        setLogs(collected);
        setMeta({
          page: DEFAULT_PAGE,
          limit: MODAL_FETCH_ALL_LIMIT,
          total: collected.length,
          total_pages: 1,
        });
        return;
      }
      const response = await listAuditLogs(
        buildRecordHistoryQuery(screen, recordPkValue, page, DEFAULT_PAGE_SIZE),
      );
      if (!response) {
        return;
      }
      setLogs(response.data);
      setMeta({
        page: response.meta?.page ?? page,
        limit: response.meta?.limit ?? DEFAULT_PAGE_SIZE,
        total: response.meta?.total ?? response.data.length,
        total_pages:
          response.meta?.total_pages ??
          Math.max(
            1,
            Math.ceil((response.meta?.total ?? response.data.length) / DEFAULT_PAGE_SIZE),
          ),
      });
    } catch {
      // useApi already exposes the error state.
    }
  }, [hasContext, isComposite, listAuditLogs, page, recordPkValue, screen]);
  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory, refreshKey]);
  useEffect(() => {
    setOpenGroups(new Set());
  }, [page, refreshKey]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  /* One accordion item per date/time: every audit row the server returned for
     that minute — item, unit conversion, EAN code, reorder, price — is folded
     into a single group instead of standing as its own line. */
  const groups = useMemo<ModalHistoryGroup[]>(() => {
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
        badgeClass: getModalBadgeClass(log.log_action),
        notes: log.log_notes?.trim() ?? "",
        diff,
      });
      group.changeCount += diff.length;
      if (user !== "-" && !group.users.includes(user)) {
        group.users.push(user);
      }
      if (!group.actions.some((action) => action.label === actionLabel)) {
        group.actions.push({ label: actionLabel, badgeClass: getModalBadgeClass(log.log_action) });
      }
      if (!group.sections.includes(label)) {
        group.sections.push(label);
      }
    }
    return [...byKey.values()];
  }, [logs, screen]);
  /* Composite mode holds the whole history in memory, so it paginates the
     groups client-side; the plain view keeps the server's page as-is. */
  const clientTotalPages = Math.max(1, Math.ceil(groups.length / MODAL_GROUPS_PER_PAGE));
  const effectiveTotalPages = isComposite ? clientTotalPages : safeTotalPages;
  const startIndex = isComposite ? (page - 1) * MODAL_GROUPS_PER_PAGE : 0;
  const displayGroups = isComposite
    ? groups.slice(startIndex, startIndex + MODAL_GROUPS_PER_PAGE)
    : groups;
  useEffect(() => {
    if (page > effectiveTotalPages) {
      setPage(effectiveTotalPages);
    }
  }, [page, effectiveTotalPages]);
  const allOpen =
    displayGroups.length > 0 && displayGroups.every((group) => openGroups.has(group.id));
  const toggleGroup = useCallback((id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  const toggleAll = useCallback(() => {
    setOpenGroups(allOpen ? new Set() : new Set(displayGroups.map((group) => group.id)));
  }, [allOpen, displayGroups]);
  const totalRecords = meta.total || logs.length;
  const newestLog = logs[0] ?? null;
  const createdLog = useMemo(
    () =>
      [...logs].reverse().find((log) => resolveActionVariant(log.log_action) === "new") ?? null,
    [logs],
  );
  return (
    <div className={styles.overlay}>
      <div className={styles.backdrop} onMouseDown={onClose} aria-hidden />
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Record history"
      >
        <div className={styles.head}>
          Record History
          <span className={styles.headRec}>{recordName || "Selected record"}</span>
          <button className={styles.close} type="button" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className={styles.summary}>
          <span>
            <b>{totalRecords}</b> {totalRecords === 1 ? "change" : "changes"}
          </span>
          {createdLog ? (
            <span>
              Created <span className={styles.mono}>{formatDateTime(createdLog.log_date)}</span> by{" "}
              <b>{getRowUserLabel(createdLog)}</b>
            </span>
          ) : null}
          {newestLog ? (
            <span>
              Last change <span className={styles.mono}>{formatDateTime(newestLog.log_date)}</span>{" "}
              by <b>{getRowUserLabel(newestLog)}</b>
            </span>
          ) : null}
        </div>
        {error ? (
          <div className={styles.errorBox}>
            <p className={styles.errorText}>{error}</p>
            <button
              className={styles.retryBtn}
              type="button"
              onClick={() => setRefreshKey((value) => value + 1)}
            >
              Retry
            </button>
          </div>
        ) : null}
        <div className={styles.gridWrap}>
          {!hasContext ? (
            <p className={styles.stateBox}>
              Open this from a record&apos;s History action to load its change history.
            </p>
          ) : loading && logs.length === 0 ? (
            <p className={styles.stateBox}>Loading record history…</p>
          ) : displayGroups.length === 0 ? (
            <p className={styles.stateBox}>No history was found for this record.</p>
          ) : (
            <div className={cx(styles.accordion, !isComposite && styles.accordionPlain)}>
              <div className={styles.listHead} aria-hidden="true">
                <span />
                <span className={styles.listHeadNum}>#</span>
                <span>Date / Time</span>
                <span>Action</span>
                <span>User</span>
                <span className={isComposite ? undefined : styles.listHeadEnd}>Changes</span>
                {isComposite ? <span className={styles.listHeadEnd}>Sections</span> : null}
              </div>
              {displayGroups.map((group, groupIndex) => (
                <ModalHistoryGroupRow
                  key={group.id}
                  group={group}
                  index={startIndex + groupIndex + 1}
                  open={openGroups.has(group.id)}
                  showSections={isComposite}
                  onToggle={() => toggleGroup(group.id)}
                />
              ))}
            </div>
          )}
        </div>
        <div className={styles.footer}>
          <span>
            {totalRecords} history record{totalRecords === 1 ? "" : "s"}
            {/* Only composite mode holds the whole history, so only there is the
                group count a total rather than a per-page figure. */}
            {isComposite ? ` in ${groups.length} change${groups.length === 1 ? "" : "s"}` : ""}
          </span>
          {displayGroups.length > 0 ? (
            <button className={styles.expandBtn} type="button" onClick={toggleAll}>
              {allOpen ? "Collapse all" : "Expand all changes"}
            </button>
          ) : null}
          {effectiveTotalPages > 1 ? (
            <div className={styles.pager}>
              <button
                className={styles.pagerBtn}
                type="button"
                disabled={page <= DEFAULT_PAGE}
                onClick={() => setPage((value) => Math.max(DEFAULT_PAGE, value - 1))}
                aria-label="Previous page"
              >
                ‹
              </button>
              <span className={styles.pagerInfo}>
                {page} / {effectiveTotalPages}
              </span>
              <button
                className={styles.pagerBtn}
                type="button"
                disabled={page >= effectiveTotalPages}
                onClick={() => setPage((value) => Math.min(effectiveTotalPages, value + 1))}
                aria-label="Next page"
              >
                ›
              </button>
              <button className={styles.closeBtn} type="button" onClick={onClose}>
                Close
              </button>
            </div>
          ) : (
            <button
              className={cx(styles.closeBtn, styles.closeBtnEnd)}
              type="button"
              onClick={onClose}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
export function RecordHistoryModal(props: RecordHistoryModalProps) {
  if (!props.isOpen) {
    return null;
  }
  // Portaled for the same reason as every other dialog here: left inline it is
  // a sibling of the page's promoted grid scroller, which Chromium can order
  // above it regardless of z-index (see ModalPortal). Its skin tokens are
  // declared on `.modal` rather than a page wrapper, so nothing is lost by
  // moving it to <body>.
  return (
    <ModalPortal>
      <RecordHistoryModalContent {...props} />
    </ModalPortal>
  );
}
export default function RecordHistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const screenName = normalizeQueryValue(searchParams.get("screen_name"));
  const recordPk = normalizeQueryValue(searchParams.get("record_pk"));
  const displayName = normalizeQueryValue(searchParams.get("display_name"));
  const returnTo = normalizeQueryValue(searchParams.get("return_to"));
  const handleBack = useCallback(() => {
    notifyGlobalNavigationStart();
    if (returnTo) {
      router.push(returnTo);
      return;
    }
    router.push("/master/audit-logs");
  }, [returnTo, router]);
  return (
    <RecordHistoryViewer
      displayName={displayName}
      onBack={handleBack}
      recordPk={recordPk}
      screenName={screenName}
    />
  );
}
