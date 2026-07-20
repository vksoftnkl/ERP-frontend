"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FiDownload, FiRefreshCw, FiSearch } from "react-icons/fi";
import { useApi } from "@/hooks/useApi";
import ModalPortal from "@/components/ui/modal-portal";
import type { ApiSuccessResponse, ListMeta } from "@/utils/types";
import styles from "./page.module.scss";
const AUDIT_LOG_LIST_ENDPOINT = "/audit-logs/list";
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const DOWNLOAD_PAGE_LIMIT = 100;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
const TABLE_COLUMN_COUNT = 8;
const SEARCH_DEBOUNCE_MS = 300;
const EMPTY_META: ListMeta = {
  page: DEFAULT_PAGE,
  limit: DEFAULT_PAGE_SIZE,
  total: 0,
  total_pages: 0,
};
type AuditActionFilter = "" | "New" | "update" | "approve" | "cancel";
type AuditDatePreset = "7d" | "30d" | "all" | "custom";
type AuditLogFilters = {
  search: string;
  action: AuditActionFilter;
  screenId: string;
  dateFrom: string;
  dateTo: string;
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
const DEFAULT_FILTERS: AuditLogFilters = {
  search: "",
  action: "",
  screenId: "",
  dateFrom: "",
  dateTo: "",
};
/* The server rejects any action outside new/insert/update/approve/cancel with a
   400, so there is deliberately no "delete" option here. */
const ACTION_OPTIONS: ReadonlyArray<{ value: AuditActionFilter; label: string }> = [
  { value: "", label: "All" },
  { value: "New", label: "New" },
  { value: "update", label: "Update" },
  { value: "approve", label: "Approve" },
  { value: "cancel", label: "Cancel" },
];
const DATE_PRESETS: ReadonlyArray<{ key: Exclude<AuditDatePreset, "custom">; label: string; days: number | null }> = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "all", label: "All", days: null },
];
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});
const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
});
function cx(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(" ");
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
function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function buildPresetRange(days: number): { dateFrom: string; dateTo: string } {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return { dateFrom: toDateInputValue(start), dateTo: toDateInputValue(today) };
}
function resolveDatePreset(filters: AuditLogFilters): AuditDatePreset {
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
function buildAuditLogQuery(
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
    return "";
  }
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
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
const ACTION_BADGE_CLASS: Record<ReturnType<typeof resolveActionVariant>, string> = {
  new: styles.badgeNew,
  update: styles.badgeUpdate,
  approve: styles.badgeApprove,
  cancel: styles.badgeCancel,
  neutral: styles.badgeNeutral,
};
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
type AuditDiffRow = {
  field: string;
  from: unknown;
  to: unknown;
};
type AuditSnapshotRow = {
  field: string;
  value: unknown;
};
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
function flattenAuditRecord(value: unknown, path = ""): AuditSnapshotRow[] {
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
function resolveSnapshot(row: AuditLogListItem): AuditSnapshotRow[] {
  const modified = normalizeStructuredValue(row.log_modified_record);
  const snapshotSource =
    modified === null || modified === undefined ? row.log_original_record : modified;
  return flattenAuditRecord(snapshotSource);
}
function truncateValue(value: string | null | undefined, maxLength = 42): string {
  const normalized = value?.trim();
  if (!normalized) {
    return "—";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}
function truncateMiddle(value: string | null | undefined, lead = 8, tail = 6): string {
  const normalized = value?.trim();
  if (!normalized) {
    return "—";
  }
  if (normalized.length <= lead + tail + 3) {
    return normalized;
  }
  return `${normalized.slice(0, lead)}...${normalized.slice(-tail)}`;
}
function getRowUserLabel(row: AuditLogListItem): { label: string; title: string; muted: boolean } {
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
function getRowEntityLabel(row: AuditLogListItem): string {
  return row.log_display_name?.trim() || row.log_pk?.trim() || "-";
}
function formatChangeSummary(value: unknown): string {
  const count = countChangedFields(value);
  if (count === 0) {
    return "No diff";
  }
  return `${count} field${count === 1 ? "" : "s"}`;
}
function escapeCsvValue(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
function toCsvRow(values: Array<string | number>): string {
  return values.map((value) => escapeCsvValue(String(value))).join(",");
}
export default function AuditLogsPage() {
  const [searchDraft, setSearchDraft] = useState("");
  const [filters, setFilters] = useState<AuditLogFilters>(DEFAULT_FILTERS);
  const [logs, setLogs] = useState<AuditLogListItem[]>([]);
  const [meta, setMeta] = useState<ListMeta>(EMPTY_META);
  const [currentPage, setCurrentPage] = useState(DEFAULT_PAGE);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [refreshKey, setRefreshKey] = useState(0);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [detailLog, setDetailLog] = useState<AuditLogListItem | null>(null);
  const { getAll: listAuditLogs, loading, error } = useApi<
    ApiSuccessResponse<AuditLogListItem[], ListMeta>
  >(AUDIT_LOG_LIST_ENDPOINT, {
    toast: { success: false, error: true },
  });
  const { getAll: exportAuditLogs } = useApi<ApiSuccessResponse<AuditLogListItem[], ListMeta>>(
    AUDIT_LOG_LIST_ENDPOINT,
    {
      toast: { success: false, error: true },
    },
  );
  const isDateRangeInvalid = Boolean(
    filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo,
  );
  const activePreset = useMemo(() => resolveDatePreset(filters), [filters]);
  const totalItems = meta.total;
  const safeTotalPages = Math.max(
    1,
    meta.total_pages || Math.ceil(Math.max(meta.total, 1) / Math.max(meta.limit, 1)),
  );
  const pageStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = totalItems === 0 ? 0 : Math.min(pageStart + logs.length - 1, totalItems);
  useEffect(() => {
    if (searchDraft.trim() === filters.search) {
      return;
    }
    const timer = setTimeout(() => {
      setCurrentPage(DEFAULT_PAGE);
      setFilters((current) => ({ ...current, search: searchDraft.trim() }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchDraft, filters.search]);
  const updateFilters = useCallback((patch: Partial<AuditLogFilters>) => {
    setCurrentPage(DEFAULT_PAGE);
    setFilters((current) => ({ ...current, ...patch }));
  }, []);
  const fetchAuditLogs = useCallback(async () => {
    if (isDateRangeInvalid) {
      return;
    }
    try {
      const response = await listAuditLogs(buildAuditLogQuery(filters, currentPage, pageSize));
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
      // Error state is already surfaced by useApi.
    }
  }, [currentPage, filters, isDateRangeInvalid, listAuditLogs, pageSize]);
  useEffect(() => {
    void fetchAuditLogs();
  }, [fetchAuditLogs, refreshKey]);
  useEffect(() => {
    if (currentPage > safeTotalPages) {
      setCurrentPage(safeTotalPages);
    }
  }, [currentPage, safeTotalPages]);
  useEffect(() => {
    setOpenRowId(null);
  }, [logs]);
  const handleRefresh = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F5") {
        return;
      }
      event.preventDefault();
      handleRefresh();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleRefresh]);
  const handlePresetClick = (preset: (typeof DATE_PRESETS)[number]) => {
    if (preset.days === null) {
      updateFilters({ dateFrom: "", dateTo: "" });
      return;
    }
    updateFilters(buildPresetRange(preset.days));
  };
  const handlePageSizeChange = (nextPageSize: number) => {
    setPageSize(nextPageSize);
    setCurrentPage(DEFAULT_PAGE);
  };
  const handleDownload = useCallback(() => {
    const exportRows = async () => {
      const firstPage = await exportAuditLogs(
        buildAuditLogQuery(filters, DEFAULT_PAGE, DOWNLOAD_PAGE_LIMIT),
      );
      if (!firstPage) {
        return;
      }
      const totalPages = Math.max(
        1,
        firstPage.meta?.total_pages ??
          Math.ceil((firstPage.meta?.total ?? firstPage.data.length) / DOWNLOAD_PAGE_LIMIT),
      );
      let combinedLogs = [...firstPage.data];
      for (let page = DEFAULT_PAGE + 1; page <= totalPages; page += 1) {
        const nextPage = await exportAuditLogs(
          buildAuditLogQuery(filters, page, DOWNLOAD_PAGE_LIMIT),
        );
        if (!nextPage) {
          break;
        }
        combinedLogs = combinedLogs.concat(nextPage.data);
      }
      const csvLines = [
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
        ...combinedLogs.map((row) =>
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
      const blob = new Blob([csvLines.join("\n")], {
        type: "text/csv;charset=utf-8;",
      });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `audit-logs-${toDateInputValue(new Date())}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    };
    void exportRows();
  }, [exportAuditLogs, filters]);
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Audit Logs</h1>
        <p className={styles.pageSubtitle}>Every insert, update, approval and cancel event</p>
      </div>

      <div className={styles.toolbar}>
        <button className={styles.toolbarBtn} type="button" onClick={handleRefresh} disabled={loading}>
          <FiRefreshCw aria-hidden="true" />
          Refresh <kbd className={styles.toolbarKbd}>F5</kbd>
        </button>
        <button
          className={styles.toolbarBtn}
          type="button"
          onClick={handleDownload}
          disabled={logs.length === 0}
        >
          <FiDownload aria-hidden="true" />
          Export Excel
        </button>
        <span className={styles.toolbarCount}>
          {loading ? "Loading…" : `${totalItems} event${totalItems === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className={styles.filterCard}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel} htmlFor="audit-search">
            Search
          </label>
          <span className={styles.searchWrap}>
            <FiSearch className={styles.searchIcon} aria-hidden="true" />
            <input
              className={cx(styles.input, styles.searchInput)}
              id="audit-search"
              type="text"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Screen / table / user / notes…"
              autoComplete="off"
            />
          </span>
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel} htmlFor="audit-action">
            Action
          </label>
          <select
            className={styles.select}
            id="audit-action"
            value={filters.action}
            onChange={(event) => updateFilters({ action: event.target.value as AuditActionFilter })}
          >
            {ACTION_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel} htmlFor="audit-screen-id">
            Screen ID
          </label>
          <input
            className={cx(styles.input, styles.inputMono, styles.inputNarrow)}
            id="audit-screen-id"
            type="text"
            inputMode="numeric"
            value={filters.screenId}
            onChange={(event) => updateFilters({ screenId: event.target.value.replace(/\D+/g, "") })}
            placeholder="Any"
            autoComplete="off"
          />
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel} htmlFor="audit-date-from">
            From
          </label>
          <input
            className={cx(styles.input, styles.inputMono, isDateRangeInvalid && styles.inputInvalid)}
            id="audit-date-from"
            type="date"
            value={filters.dateFrom}
            onChange={(event) => updateFilters({ dateFrom: event.target.value })}
          />
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel} htmlFor="audit-date-to">
            To
          </label>
          <input
            className={cx(styles.input, styles.inputMono, isDateRangeInvalid && styles.inputInvalid)}
            id="audit-date-to"
            type="date"
            value={filters.dateTo}
            onChange={(event) => updateFilters({ dateTo: event.target.value })}
          />
        </div>
        <div className={styles.presets}>
          {DATE_PRESETS.map((preset) => (
            <button
              className={cx(styles.preset, activePreset === preset.key && styles.presetOn)}
              key={preset.key}
              type="button"
              onClick={() => handlePresetClick(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {isDateRangeInvalid ? (
          <p className={styles.filterNote}>From date must be on or before the To date.</p>
        ) : null}
      </div>

      {error ? (
        <div className={styles.errorBox}>
          <p className={styles.errorText}>{error}</p>
          <button className={styles.retryButton} type="button" onClick={handleRefresh}>
            Retry
          </button>
        </div>
      ) : null}

      <div className={styles.gridWrap}>
        <table className={styles.grid}>
          <thead>
            <tr>
              <th className={styles.colSno}>#</th>
              <th className={styles.colDate}>Date / Time</th>
              <th className={styles.colAction}>Action</th>
              <th className={styles.colUser}>User</th>
              <th className={styles.colScreen}>Screen</th>
              <th className={styles.colTable}>Table</th>
              <th className={styles.colChanges}>Changes</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {loading && logs.length === 0 ? (
              <tr>
                <td className={styles.stateCell} colSpan={TABLE_COLUMN_COUNT}>
                  Loading audit logs…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td className={styles.stateCell} colSpan={TABLE_COLUMN_COUNT}>
                  No audit logs found for the current filters.
                </td>
              </tr>
            ) : (
              logs.map((row, rowIndex) => (
                <AuditRow
                  key={row.log_id}
                  row={row}
                  index={(currentPage - 1) * pageSize + rowIndex + 1}
                  open={openRowId === row.log_id}
                  onToggle={() => setOpenRowId(openRowId === row.log_id ? null : row.log_id)}
                  onDetail={() => setDetailLog(row)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.footer}>
        <span>
          Showing {pageStart}–{pageEnd} of {totalItems}
        </span>
        <select
          className={styles.pageSizeSelect}
          value={pageSize}
          onChange={(event) => handlePageSizeChange(Number(event.target.value))}
          aria-label="Rows per page"
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option} / page
            </option>
          ))}
        </select>
        <div className={styles.pager}>
          <button
            className={styles.pagerBtn}
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(DEFAULT_PAGE, page - 1))}
            disabled={currentPage <= DEFAULT_PAGE}
            aria-label="Previous page"
          >
            ‹
          </button>
          <span>
            {currentPage} / {safeTotalPages}
          </span>
          <button
            className={styles.pagerBtn}
            type="button"
            onClick={() => setCurrentPage((page) => Math.min(safeTotalPages, page + 1))}
            disabled={currentPage >= safeTotalPages}
            aria-label="Next page"
          >
            ›
          </button>
        </div>
      </div>

      {detailLog ? (
        <AuditDetailModal row={detailLog} onClose={() => setDetailLog(null)} />
      ) : null}
    </div>
  );
}
function AuditDetailModal({ row, onClose }: { row: AuditLogListItem; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const diffRows = useMemo(() => flattenAuditDiff(row.log_changed_fields), [row.log_changed_fields]);
  const snapshotRows = useMemo(() => (diffRows.length === 0 ? resolveSnapshot(row) : []), [diffRows, row]);
  const user = getRowUserLabel(row);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(JSON.stringify(row, null, 2));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <ModalPortal>
      <div
        className={styles.overlay}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
      >
        <section
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-detail-title"
        >
          <header className={styles.modalHead}>
            <span id="audit-detail-title">Audit Event</span>
            <span className={styles.modalHeadId}>#{truncateMiddle(row.log_id)}</span>
            <span className={cx(styles.badge, ACTION_BADGE_CLASS[resolveActionVariant(row.log_action)])}>
              {formatActionLabel(row.log_action)}
            </span>
            <button className={styles.modalClose} type="button" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </header>

          <div className={styles.modalBody}>
            <div className={styles.kv}>
              <span className={styles.kvKey}>Date / Time</span>
              <span className={cx(styles.kvValue, styles.kvMono)}>{formatDateTime(row.log_date)}</span>

              <span className={styles.kvKey}>Screen</span>
              <span className={styles.kvValue}>
                {row.screen_name}
                <span className={styles.kvScreenId}>#{row.log_screen_id}</span>
              </span>

              <span className={styles.kvKey}>Table</span>
              <span className={cx(styles.kvValue, styles.kvMono)}>{row.log_table_name}</span>

              <span className={styles.kvKey}>Entity</span>
              <span className={styles.kvValue}>{getRowEntityLabel(row)}</span>

              <span className={styles.kvKey}>User</span>
              <span className={cx(styles.kvValue, styles.kvMono)}>{user.title || "—"}</span>

              <span className={styles.kvKey}>Branch</span>
              <span className={styles.kvValue}>
                {row.log_branch_name?.trim() || row.log_branch_id?.trim() || "—"}
              </span>

              <span className={styles.kvKey}>Notes</span>
              <span className={styles.kvValue}>{row.log_notes?.trim() || "—"}</span>
            </div>

            <div className={styles.modalSection}>
              <div className={styles.modalSectionTitle}>
                {diffRows.length > 0 ? "Field Changes" : "Record Snapshot"}
              </div>
              {diffRows.length > 0 ? (
                <table className={styles.modalDiff}>
                  <thead>
                    <tr>
                      <th style={{ width: "34%" }}>Field</th>
                      <th style={{ width: "33%" }}>Old Value</th>
                      <th>New Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffRows.map((diff, diffIndex) => (
                      <tr key={`${diff.field}-${diffIndex + 1}`}>
                        <td>{diff.field}</td>
                        <td className={styles.modalDiffOld}>{formatAuditPrimitiveValue(diff.from)}</td>
                        <td className={styles.modalDiffNew}>{formatAuditPrimitiveValue(diff.to)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : snapshotRows.length > 0 ? (
                <table className={styles.modalDiff}>
                  <thead>
                    <tr>
                      <th style={{ width: "34%" }}>Field</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshotRows.map((snapshot, snapshotIndex) => (
                      <tr key={`${snapshot.field}-${snapshotIndex + 1}`}>
                        <td>{snapshot.field}</td>
                        <td>{formatAuditPrimitiveValue(snapshot.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <span className={styles.modalEmpty}>
                  No field-level changes recorded for this event
                  {resolveActionVariant(row.log_action) === "new"
                    ? " — the full record was created."
                    : "."}
                </span>
              )}
            </div>
          </div>

          <footer className={styles.modalFoot}>
            <span className={styles.modalHint}>Esc: Close</span>
            <button className={styles.modalBtn} type="button" onClick={handleCopy}>
              {copied ? "Copied" : "Copy JSON"}
            </button>
            <button
              className={cx(styles.modalBtn, styles.modalBtnClose)}
              type="button"
              onClick={onClose}
            >
              Close
            </button>
          </footer>
        </section>
      </div>
    </ModalPortal>
  );
}
function AuditRow({
  row,
  index,
  open,
  onToggle,
  onDetail,
}: {
  row: AuditLogListItem;
  index: number;
  open: boolean;
  onToggle: () => void;
  onDetail: () => void;
}) {
  const diffRows = useMemo(() => flattenAuditDiff(row.log_changed_fields), [row.log_changed_fields]);
  const snapshotRows = useMemo(() => (diffRows.length === 0 ? resolveSnapshot(row) : []), [diffRows, row]);
  const user = getRowUserLabel(row);
  const expandable = diffRows.length > 0 || snapshotRows.length > 0;
  return (
    <>
      <tr
        className={cx(styles.row, open && styles.rowOpen)}
        onDoubleClick={onDetail}
        title="Double-click for full detail"
      >
        <td className={styles.cellSno}>{index}</td>
        <td className={cx(styles.cellMono, styles.cellDate)} title={formatDateTime(row.log_date)}>
          {formatDateOnly(row.log_date)} {formatTimeOnly(row.log_date)}
        </td>
        <td>
          <span className={cx(styles.badge, ACTION_BADGE_CLASS[resolveActionVariant(row.log_action)])}>
            {formatActionLabel(row.log_action)}
          </span>
        </td>
        <td>
          <span className={cx(styles.userCell, user.muted && styles.userMuted)} title={user.title}>
            {user.label}
          </span>
        </td>
        <td>
          <span className={styles.screenName}>{row.screen_name}</span>
          <span className={styles.screenId}>#{row.log_screen_id}</span>
        </td>
        <td className={styles.cellMono}>{row.log_table_name}</td>
        <td>
          {expandable ? (
            <button className={styles.diffBtn} type="button" onClick={onToggle} aria-expanded={open}>
              {open ? "▾" : "▸"}{" "}
              {diffRows.length > 0
                ? `${diffRows.length} field${diffRows.length === 1 ? "" : "s"}`
                : "Record"}
            </button>
          ) : (
            <span className={styles.noDiff}>—</span>
          )}
        </td>
        <td title={row.log_notes ?? ""}>{truncateValue(row.log_notes, 68)}</td>
      </tr>
      {open && expandable ? (
        <tr className={styles.detailRow}>
          <td colSpan={TABLE_COLUMN_COUNT}>
            <div className={styles.detailScroll}>
              {diffRows.length > 0 ? (
                <table className={styles.diffTable}>
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Old Value</th>
                      <th>New Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffRows.map((diff, diffIndex) => (
                      <tr key={`${diff.field}-${diffIndex + 1}`}>
                        <td className={styles.diffField}>{diff.field}</td>
                        <td className={styles.diffOld}>{formatAuditPrimitiveValue(diff.from)}</td>
                        <td className={styles.diffNew}>{formatAuditPrimitiveValue(diff.to)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className={styles.diffTable}>
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshotRows.map((snapshot, snapshotIndex) => (
                      <tr key={`${snapshot.field}-${snapshotIndex + 1}`}>
                        <td className={styles.diffField}>{snapshot.field}</td>
                        <td className={styles.diffValue}>
                          {formatAuditPrimitiveValue(snapshot.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className={styles.detailMeta}>
              {row.log_table_name} · {formatDateTime(row.log_date)} · by {user.title || "unknown"}
              {row.log_branch_name?.trim() ? ` · ${row.log_branch_name}` : ""}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
