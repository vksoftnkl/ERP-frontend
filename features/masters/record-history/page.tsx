"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FiArrowLeft, FiChevronDown, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { useApi } from "@/hooks/useApi";
import type { ApiSuccessResponse, ListMeta } from "@/utils/types";

const AUDIT_LOG_LIST_ENDPOINT = "/audit-logs/list";
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
const TABLE_COLUMN_COUNT = 6;
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
  };
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
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
  "rounded-[4px] border border-slate-200 bg-white/95 shadow-[0_14px_34px_rgba(24,39,58,0.06)]";
const BUTTON_BASE_CLASS =
  "inline-flex items-center justify-center border border-transparent transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none";
const BACK_BUTTON_CLASS = cx(
  BUTTON_BASE_CLASS,
  "min-h-[38px] gap-2 rounded-[10px] border-slate-300 bg-white px-3.5 text-[13px] font-bold text-slate-700 hover:bg-slate-50",
);
const RETRY_BUTTON_CLASS = cx(
  BUTTON_BASE_CLASS,
  "min-h-[34px] rounded-[10px] border-rose-300 bg-white px-3.5 text-[13px] font-bold text-rose-700 hover:bg-rose-50",
);
const PAGINATION_BUTTON_CLASS = cx(
  BUTTON_BASE_CLASS,
  "h-8 w-8 rounded-[8px] border-slate-300 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50",
);
const INPUT_BASE_CLASS =
  "w-full border border-slate-300 bg-white text-slate-800 transition-[border-color,box-shadow,background-color] duration-150 focus:border-sky-300 focus:outline-none focus:ring-4 focus:ring-sky-500/10";
const PAGE_SIZE_SELECT_CLASS = cx(
  INPUT_BASE_CLASS,
  "min-h-[38px] min-w-[82px] appearance-none rounded-[10px] py-0 pl-3 pr-9 text-sm",
);
const TABLE_HEADER_CELL_CLASS =
  "sticky top-0 z-[1] border-b border-r border-slate-100 bg-slate-50 px-3.5 py-3 text-left align-middle text-[12px] font-bold whitespace-nowrap text-slate-600 last:border-r-0";
const TABLE_CELL_CLASS =
  "border-b border-r border-slate-100 px-3.5 py-3 align-middle text-sm text-slate-800 last:border-r-0";
const META_CARD_CLASS = "grid gap-1.5 rounded-[14px] border border-slate-200 bg-white p-3.5";
const META_LABEL_CLASS =
  "m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-500";
const META_VALUE_CLASS =
  "m-0 break-words text-sm leading-6 font-semibold text-slate-800";
const JSON_TITLE_CLASS = "m-0 text-[15px] font-bold text-slate-800";
const JSON_COUNT_CLASS =
  "inline-flex min-h-6 items-center whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-bold text-slate-600";
const JSON_FIELD_ROW_CLASS =
  "grid gap-1.5 rounded-[12px] border border-slate-200 bg-slate-50 px-3.5 py-3";
const JSON_FIELD_KEY_CLASS =
  "m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-500";
const JSON_FIELD_VALUE_CLASS =
  "m-0 break-words text-sm leading-6 font-semibold text-slate-800 whitespace-pre-wrap";
const JSON_ARRAY_ITEM_CLASS =
  "grid gap-2 rounded-[10px] border border-white/80 bg-white px-3 py-2.5";
const DETAIL_JSON_TABLE_SHELL_CLASS = "overflow-hidden rounded-[14px] border border-slate-200 bg-white";
const DETAIL_JSON_TABLE_HEADER_CLASS =
  "sticky top-0 z-[2] border-b border-r border-slate-100 bg-slate-50 px-4 py-3 text-left align-top shadow-[0_1px_0_0_rgba(241,245,249,1)] last:border-r-0";
const DETAIL_JSON_TABLE_CELL_CLASS =
  "border-r border-slate-100 px-4 py-4 align-top last:border-r-0";
const DETAIL_JSON_TABLE_ROW_CLASS = "border-b border-slate-100 last:border-b-0";
const DETAIL_JSON_TABLE_FIELD_CLASS = "min-w-[220px]";
const DETAIL_JSON_TABLE_VALUE_CLASS = "min-w-[240px]";
const DETAIL_JSON_TABLE_CHANGE_CLASS = "min-w-[180px]";
const DETAIL_JSON_BADGE_CLASS =
  "inline-flex min-h-6 items-center rounded-full border px-2.5 text-[11px] font-bold";

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
                <p className={JSON_FIELD_VALUE_CLASS}>{formatAuditPrimitiveValue(normalizedItem)}</p>
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
          const isNestedEntry = isRecord(normalizedEntryValue) || Array.isArray(normalizedEntryValue);
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
    "inline-flex min-h-[26px] items-center justify-center rounded-full border px-2.5 text-[11px] font-bold uppercase tracking-[0.04em]",
    variant === "new" && "border-emerald-200 bg-emerald-50 text-emerald-700",
    variant === "update" && "border-blue-200 bg-blue-50 text-blue-700",
    variant === "approve" && "border-lime-200 bg-lime-50 text-lime-700",
    variant === "cancel" && "border-rose-200 bg-rose-50 text-rose-700",
    variant === "neutral" && "border-slate-200 bg-slate-50 text-slate-600",
  );
}

export default function RecordHistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const screenName = normalizeQueryValue(searchParams.get("screen_name"));
  const recordPk = normalizeQueryValue(searchParams.get("record_pk"));
  const displayName = normalizeQueryValue(searchParams.get("display_name"));
  const returnTo = normalizeQueryValue(searchParams.get("return_to"));
  const [logs, setLogs] = useState<AuditLogListItem[]>([]);
  const [meta, setMeta] = useState<ListMeta>(EMPTY_META);
  const [currentPage, setCurrentPage] = useState(DEFAULT_PAGE);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedLog, setSelectedLog] = useState<AuditLogListItem | null>(null);
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
          Math.max(1, Math.ceil((response.meta?.total ?? response.data.length) / Math.max(pageSize, 1))),
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
    if (!selectedLog) {
      setSelectedLog(logs[0] ?? null);
      return;
    }

    if (!logs.some((row) => row.log_id === selectedLog.log_id)) {
      setSelectedLog(logs[0] ?? null);
    }
  }, [logs, selectedLog]);

  const handleBack = useCallback(() => {
    if (returnTo) {
      router.push(returnTo);
      return;
    }
    router.push("/master/audit-logs");
  }, [returnTo, router]);

  const handleRefresh = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  const tableSummary =
    meta.total === 0 ? "Showing 0 of 0 items" : `Showing ${pageStart}-${pageEnd} of ${meta.total} items`;

  return (
    <main className="min-h-[calc(100vh-72px)] bg-gradient-to-b from-[#f7f7f8] to-[#f1f2f4] text-slate-800">
      <div className="grid gap-[18px] p-[18px] max-[780px]:p-3.5">
        <header className="flex flex-col gap-4 min-[781px]:flex-row min-[781px]:items-start min-[781px]:justify-between">
          <div className="grid gap-1.5">
            <h1 className="m-0 text-[32px] leading-none font-bold tracking-[-0.03em] text-slate-900">
              Record history
            </h1>
            <p className="m-0 max-w-[780px] text-sm text-slate-500">
              {displayName
                ? `Audit trail for ${displayName}.`
                : "Audit trail for the selected record only."}
            </p>
          </div>
          <button className={BACK_BUTTON_CLASS} type="button" onClick={handleBack}>
            <FiArrowLeft aria-hidden="true" />
            <span>Back</span>
          </button>
        </header>

        {!screenName || !recordPk ? (
          <section className={cx(PANEL_CLASS, "grid gap-3 p-5")}>
            <h2 className="m-0 text-lg font-bold text-slate-900">Missing record context</h2>
            <p className="m-0 text-sm text-slate-500">
              Open this page from a table row Logs action so it can load one record&apos;s audit
              history.
            </p>
            <div>
              <button className={BACK_BUTTON_CLASS} type="button" onClick={handleBack}>
                <FiArrowLeft aria-hidden="true" />
                <span>Go back</span>
              </button>
            </div>
          </section>
        ) : (
          <>
            {error ? (
              <div className="flex flex-col gap-3 rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-3.5 min-[781px]:flex-row min-[781px]:items-center min-[781px]:justify-between">
                <p className="m-0 text-sm text-rose-700">{error}</p>
                <button className={RETRY_BUTTON_CLASS} type="button" onClick={handleRefresh}>
                  Retry
                </button>
              </div>
            ) : null}

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className={META_CARD_CLASS}>
                <p className={META_LABEL_CLASS}>Screen</p>
                <p className={META_VALUE_CLASS}>{screenName}</p>
              </div>
              <div className={META_CARD_CLASS}>
                <p className={META_LABEL_CLASS}>Record</p>
                <p className={META_VALUE_CLASS}>{displayName || "Selected record"}</p>
              </div>
              <div className={META_CARD_CLASS}>
                <p className={META_LABEL_CLASS}>History entries</p>
                <p className={META_VALUE_CLASS}>{meta.total}</p>
              </div>
              <div className={META_CARD_CLASS}>
                <p className={META_LABEL_CLASS}>Status</p>
                <p className={META_VALUE_CLASS}>{loading ? "Refreshing..." : "Ready"}</p>
              </div>
            </section>

            <section className={cx(PANEL_CLASS, "min-w-0 flex flex-col")}>
              <div className="flex flex-col gap-3 px-3.5 pt-3.5 pb-2.5 min-[781px]:flex-row min-[781px]:items-center min-[781px]:justify-between">
                <div className="grid gap-0.5">
                  <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
                    Timeline
                  </p>
                  <p className="m-0 text-sm text-slate-500">
                    Only entries for this selected record are shown here.
                  </p>
                </div>
                <label className="inline-flex flex-wrap items-center gap-2">
                  <span className="text-[13px] text-slate-600">Rows per page</span>
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
              </div>
              <div className="min-h-0 flex-1 overflow-auto border-y border-slate-100 [scrollbar-gutter:stable_both-edges] max-h-[42vh]">
                <table className="w-full min-w-[960px] border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className={cx(TABLE_HEADER_CELL_CLASS, "text-center")}>#</th>
                      <th className={TABLE_HEADER_CELL_CLASS}>Date</th>
                      <th className={cx(TABLE_HEADER_CELL_CLASS, "text-center")}>Action</th>
                      <th className={TABLE_HEADER_CELL_CLASS}>User</th>
                      <th className={cx(TABLE_HEADER_CELL_CLASS, "text-center")}>Changes</th>
                      <th className={TABLE_HEADER_CELL_CLASS}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && logs.length === 0 ? (
                      <tr>
                        <td className="px-5 py-[34px] text-center text-sm text-slate-500" colSpan={TABLE_COLUMN_COUNT}>
                          Loading record history...
                        </td>
                      </tr>
                    ) : logs.length === 0 ? (
                      <tr>
                        <td className="px-5 py-[34px] text-center text-sm text-slate-500" colSpan={TABLE_COLUMN_COUNT}>
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
                          onClick={() => setSelectedLog(row)}
                        >
                          <td className={cx(TABLE_CELL_CLASS, "w-[52px] text-center text-slate-500")}>
                            {(currentPage - 1) * pageSize + rowIndex + 1}
                          </td>
                          <td className={TABLE_CELL_CLASS}>
                            <div className="grid gap-0.5">
                              <span className="font-bold text-slate-800">{formatDateOnly(row.log_date)}</span>
                              <span className="text-xs text-slate-400">{formatDateTime(row.log_date)}</span>
                            </div>
                          </td>
                          <td className={cx(TABLE_CELL_CLASS, "text-center")}>
                            <span className={getActionBadgeClass(row.log_action)}>
                              {formatActionLabel(row.log_action)}
                            </span>
                          </td>
                          <td className={TABLE_CELL_CLASS}>{getRowUserLabel(row)}</td>
                          <td className={cx(TABLE_CELL_CLASS, "text-center")}>
                            <span
                              className={cx(
                                "font-bold text-slate-800",
                                countChangedFields(row.log_changed_fields) === 0 && "text-slate-400",
                              )}
                            >
                              {countChangedFields(row.log_changed_fields) === 0
                                ? "No diff"
                                : `${countChangedFields(row.log_changed_fields)} field${countChangedFields(row.log_changed_fields) === 1 ? "" : "s"}`}
                            </span>
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
              <div className="grid gap-3 px-3.5 py-3 lg:grid-cols-[1fr_auto]">
                <div className="flex flex-col gap-2 text-[13px] text-slate-600 min-[781px]:flex-row min-[781px]:flex-wrap min-[781px]:items-center min-[781px]:gap-3">
                  <span>{tableSummary}</span>
                  <span>
                    Showing {TABLE_COLUMN_COUNT} of {TABLE_COLUMN_COUNT} columns
                  </span>
                </div>
                <div className="flex flex-col gap-3 min-[781px]:flex-row min-[781px]:flex-wrap min-[781px]:items-center">
                  <div className="inline-flex flex-wrap items-center gap-2">
                    <button
                      className={PAGINATION_BUTTON_CLASS}
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.max(DEFAULT_PAGE, page - 1))}
                      disabled={currentPage <= DEFAULT_PAGE}
                      aria-label="Previous page"
                    >
                      <FiChevronLeft aria-hidden="true" />
                    </button>
                    <span className="inline-flex h-8 min-w-[34px] items-center justify-center rounded-[8px] border border-slate-300 bg-white px-2.5 text-[13px] font-bold text-slate-800">
                      {currentPage}
                    </span>
                    <span className="text-[13px] text-slate-500">of {safeTotalPages} pages</span>
                    <button
                      className={PAGINATION_BUTTON_CLASS}
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.min(safeTotalPages, page + 1))}
                      disabled={currentPage >= safeTotalPages}
                      aria-label="Next page"
                    >
                      <FiChevronRight aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {selectedLog ? (
              <section className={cx(PANEL_CLASS, "grid gap-4 overflow-auto bg-slate-50 p-5 max-[780px]:px-4")}>
                <header className="grid gap-1">
                  <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
                    Audit detail
                  </p>
                  <h2 className="m-0 text-[22px] leading-[1.1] font-bold text-slate-900">
                    {formatActionLabel(selectedLog.log_action)} log for {selectedLog.screen_name}
                  </h2>
                  <p className="m-0 text-[13px] text-slate-500">
                    Captured on {formatDateTime(selectedLog.log_date)} for {selectedLog.log_table_name}
                  </p>
                </header>

                <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div className={META_CARD_CLASS}>
                    <p className={META_LABEL_CLASS}>Action</p>
                    <p className={META_VALUE_CLASS}>{formatActionLabel(selectedLog.log_action)}</p>
                  </div>
                  <div className={META_CARD_CLASS}>
                    <p className={META_LABEL_CLASS}>Date</p>
                    <p className={META_VALUE_CLASS}>{formatDateTime(selectedLog.log_date)}</p>
                  </div>
                  <div className={META_CARD_CLASS}>
                    <p className={META_LABEL_CLASS}>Screen</p>
                    <p className={META_VALUE_CLASS}>{selectedLog.screen_name}</p>
                  </div>
                  <div className={META_CARD_CLASS}>
                    <p className={META_LABEL_CLASS}>Table</p>
                    <p className={META_VALUE_CLASS}>{selectedLog.log_table_name}</p>
                  </div>
                  <div className={META_CARD_CLASS}>
                    <p className={META_LABEL_CLASS}>Display name</p>
                    <p className={META_VALUE_CLASS}>{selectedLog.log_display_name ?? displayName ?? "-"}</p>
                  </div>
                  <div className={META_CARD_CLASS}>
                    <p className={META_LABEL_CLASS}>User</p>
                    <p className={META_VALUE_CLASS}>{getRowUserLabel(selectedLog)}</p>
                  </div>
                  <div className={META_CARD_CLASS}>
                    <p className={META_LABEL_CLASS}>Branch</p>
                    <p className={META_VALUE_CLASS}>
                      {selectedLog.log_branch_name?.trim()
                        ? selectedLog.log_branch_name
                        : selectedLog.log_branch_id ?? "-"}
                    </p>
                  </div>
                  <div className={META_CARD_CLASS}>
                    <p className={META_LABEL_CLASS}>Notes</p>
                    <p className={META_VALUE_CLASS}>{selectedLog.log_notes ?? "-"}</p>
                  </div>
                </section>

                <section className={DETAIL_JSON_TABLE_SHELL_CLASS}>
                  <div className="max-h-[min(58vh,680px)] overflow-auto [scrollbar-gutter:stable_both-edges]">
                    <table className="w-full min-w-[1180px] border-separate border-spacing-0">
                      <thead>
                        <tr>
                          <th className={cx(DETAIL_JSON_TABLE_HEADER_CLASS, DETAIL_JSON_TABLE_FIELD_CLASS)}>
                            <h3 className={JSON_TITLE_CLASS}>Field</h3>
                          </th>
                          <th className={cx(DETAIL_JSON_TABLE_HEADER_CLASS, DETAIL_JSON_TABLE_CHANGE_CLASS)}>
                            <div className="flex items-start justify-between gap-3">
                              <h3 className={JSON_TITLE_CLASS}>Changed fields</h3>
                              <span className={JSON_COUNT_CLASS}>
                                {selectedLogChangeCount === 0
                                  ? "No diff"
                                  : `${selectedLogChangeCount} field${selectedLogChangeCount === 1 ? "" : "s"}`}
                              </span>
                            </div>
                          </th>
                          <th className={cx(DETAIL_JSON_TABLE_HEADER_CLASS, DETAIL_JSON_TABLE_VALUE_CLASS)}>
                            <h3 className={JSON_TITLE_CLASS}>Original record</h3>
                          </th>
                          <th className={cx(DETAIL_JSON_TABLE_HEADER_CLASS, DETAIL_JSON_TABLE_VALUE_CLASS)}>
                            <h3 className={JSON_TITLE_CLASS}>Modified record</h3>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedLogComparisonRows.length === 0 ? (
                          <tr>
                            <td className="px-4 py-5 text-sm text-slate-500" colSpan={4}>
                              No audit record data was captured for this entry.
                            </td>
                          </tr>
                        ) : (
                          selectedLogComparisonRows.map((row, index) => (
                            <tr
                              className={cx(
                                DETAIL_JSON_TABLE_ROW_CLASS,
                                row.diff ? "bg-amber-50/30" : "bg-white",
                              )}
                              key={`${row.field}-${index + 1}`}
                            >
                              <td className={cx(DETAIL_JSON_TABLE_CELL_CLASS, DETAIL_JSON_TABLE_FIELD_CLASS)}>
                                <p className="m-0 text-sm leading-6 font-semibold text-slate-900">{row.field}</p>
                              </td>
                              <td className={cx(DETAIL_JSON_TABLE_CELL_CLASS, DETAIL_JSON_TABLE_CHANGE_CLASS)}>
                                {row.diff ? (
                                  <div className="grid gap-2">
                                    <span
                                      className={cx(
                                        DETAIL_JSON_BADGE_CLASS,
                                        "w-fit border-amber-200 bg-amber-50 text-amber-700",
                                      )}
                                    >
                                      Changed
                                    </span>
                                    <div className="grid gap-2 text-xs text-slate-600">
                                      <div className="rounded-[10px] border border-slate-200 bg-white px-3 py-2">
                                        <p className={JSON_FIELD_KEY_CLASS}>From</p>
                                        {renderAuditTableValue(row.diff.from, `diff-from-${index + 1}`)}
                                      </div>
                                      <div className="rounded-[10px] border border-slate-200 bg-white px-3 py-2">
                                        <p className={JSON_FIELD_KEY_CLASS}>To</p>
                                        {renderAuditTableValue(row.diff.to, `diff-to-${index + 1}`)}
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <span
                                    className={cx(
                                      DETAIL_JSON_BADGE_CLASS,
                                      "border-slate-200 bg-slate-50 text-slate-500",
                                    )}
                                  >
                                    No diff
                                  </span>
                                )}
                              </td>
                              <td className={cx(DETAIL_JSON_TABLE_CELL_CLASS, DETAIL_JSON_TABLE_VALUE_CLASS)}>
                                {renderAuditTableValue(row.original, `original-${index + 1}`)}
                              </td>
                              <td className={cx(DETAIL_JSON_TABLE_CELL_CLASS, DETAIL_JSON_TABLE_VALUE_CLASS)}>
                                {renderAuditTableValue(row.modified, `modified-${index + 1}`)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </section>
            ) : (
              <section className={cx(PANEL_CLASS, "grid gap-2 p-5")}>
                <h2 className="m-0 text-lg font-bold text-slate-900">No audit entry selected</h2>
                <p className="m-0 text-sm text-slate-500">
                  Select a history row above to inspect the before/after record snapshot.
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
