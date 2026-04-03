"use client";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiDownload,
  FiMoreHorizontal,
  FiSearch,
} from "react-icons/fi";
import { useApi } from "@/hooks/useApi";
import type { ApiSuccessResponse, ListMeta } from "@/utils/types";
import styles from "./page.module.scss";
const AUDIT_LOG_LIST_ENDPOINT = "/audit-logs/list";
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const FETCH_PAGE_LIMIT = 100;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
const TABLE_COLUMN_COUNT = 9;
const EMPTY_META: ListMeta = {
  page: DEFAULT_PAGE,
  limit: FETCH_PAGE_LIMIT,
  total: 0,
  total_pages: 0,
};
type AuditActionFilter = "" | "New" | "update" | "approve" | "cancel";
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
const ACTION_OPTIONS: ReadonlyArray<{ value: AuditActionFilter; label: string }> = [
  { value: "", label: "Select action" },
  { value: "New", label: "New" },
  { value: "update", label: "Update" },
  { value: "approve", label: "Approve" },
  { value: "cancel", label: "Cancel" },
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
function normalizeFilters(filters: AuditLogFilters): AuditLogFilters {
  return {
    search: filters.search.trim(),
    action: filters.action,
    screenId: filters.screenId.trim(),
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  };
}
function buildAuditLogQuery(
  filters: AuditLogFilters,
  page: number,
  limit: number,
): Record<string, string> {
  const query: Record<string, string> = {
    page: String(page),
    limit: String(limit),
  };
  if (filters.search) {
    query.search = filters.search;
  }
  if (filters.action) {
    query.action = filters.action;
  }
  if (filters.screenId) {
    query.screen_id = filters.screenId;
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
  if (value === null || value === undefined) {
    return 0;
  }
  if (isDiffLeaf(value)) {
    return 1;
  }
  if (Array.isArray(value)) {
    const nestedCount = value.reduce(
      (count: number, item) => count + countChangedFields(item),
      0,
    );
    return nestedCount || value.length;
  }
  if (isRecord(value)) {
    const nestedCount = Object.values(value).reduce(
      (count: number, item) => count + countChangedFields(item),
      0,
    );
    return nestedCount || Object.keys(value).length;
  }
  return 1;
}
function stringifyJson(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
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
function truncateMiddle(value: string | null | undefined, lead = 8, tail = 6): string {
  const normalized = value?.trim();
  if (!normalized) {
    return "-";
  }
  if (normalized.length <= lead + tail + 3) {
    return normalized;
  }
  return `${normalized.slice(0, lead)}...${normalized.slice(-tail)}`;
}
function countActiveFilters(filters: AuditLogFilters): number {
  return [
    filters.search,
    filters.action,
    filters.screenId,
    filters.dateFrom,
    filters.dateTo,
  ].filter((value) => value.trim().length > 0).length;
}
function hasPendingFilterChanges(left: AuditLogFilters, right: AuditLogFilters): boolean {
  return (
    left.search !== right.search ||
    left.action !== right.action ||
    left.screenId !== right.screenId ||
    left.dateFrom !== right.dateFrom ||
    left.dateTo !== right.dateTo
  );
}
function getJsonEmptyState(label: string): string {
  return `${label} was not captured for this audit entry.`;
}
function getRowEntityLabel(row: AuditLogListItem): string {
  return row.log_display_name?.trim() || row.log_pk?.trim() || "-";
}
function getRowUserLabel(row: AuditLogListItem): string {
  return row.log_user_name?.trim() || row.log_user_id?.trim() || "-";
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
  const [draftFilters, setDraftFilters] = useState<AuditLogFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AuditLogFilters>(DEFAULT_FILTERS);
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
  const isDateRangeInvalid = Boolean(
    draftFilters.dateFrom && draftFilters.dateTo && draftFilters.dateFrom > draftFilters.dateTo,
  );
  const activeFilterCount = useMemo(() => countActiveFilters(appliedFilters), [appliedFilters]);
  const pendingFilterChanges = useMemo(
    () => hasPendingFilterChanges(draftFilters, appliedFilters),
    [draftFilters, appliedFilters],
  );
  const totalItems = logs.length;
  const safeTotalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return logs.slice(startIndex, startIndex + pageSize);
  }, [currentPage, logs, pageSize]);
  const pageStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = totalItems === 0 ? 0 : Math.min(pageStart + paginatedLogs.length - 1, totalItems);
  const selectedLogChangeCount = countChangedFields(selectedLog?.log_changed_fields);
  const fetchAuditLogs = useCallback(async () => {
    try {
      const firstPage = await listAuditLogs(
        buildAuditLogQuery(appliedFilters, DEFAULT_PAGE, FETCH_PAGE_LIMIT),
      );
      if (!firstPage) {
        return;
      }
      const firstMeta = firstPage.meta ?? {
        page: DEFAULT_PAGE,
        limit: FETCH_PAGE_LIMIT,
        total: firstPage.data.length,
        total_pages: Math.ceil(firstPage.data.length / Math.max(1, FETCH_PAGE_LIMIT)),
      };
      const totalPages = Math.max(
        1,
        firstMeta.total_pages ||
          (firstMeta.total > 0 ? Math.ceil(firstMeta.total / Math.max(1, firstMeta.limit)) : 1),
      );
      let combinedLogs = [...firstPage.data];
      for (let page = DEFAULT_PAGE + 1; page <= totalPages; page += 1) {
        const nextPage = await listAuditLogs(buildAuditLogQuery(appliedFilters, page, FETCH_PAGE_LIMIT));
        if (!nextPage) {
          break;
        }
        combinedLogs = combinedLogs.concat(nextPage.data);
      }
      setLogs(combinedLogs);
      setMeta({
        page: DEFAULT_PAGE,
        limit: FETCH_PAGE_LIMIT,
        total: firstMeta.total ?? combinedLogs.length,
        total_pages: totalPages,
      });
    } catch {
      // Error state is already surfaced by useApi.
    }
  }, [appliedFilters, listAuditLogs]);
  useEffect(() => {
    void fetchAuditLogs();
  }, [fetchAuditLogs, refreshKey]);
  useEffect(() => {
    if (currentPage > safeTotalPages) {
      setCurrentPage(safeTotalPages);
    }
  }, [currentPage, safeTotalPages]);
  const applyDraftFilters = useCallback(() => {
    if (isDateRangeInvalid) {
      return;
    }
    setCurrentPage(DEFAULT_PAGE);
    setAppliedFilters(normalizeFilters(draftFilters));
  }, [draftFilters, isDateRangeInvalid]);
  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    applyDraftFilters();
  };
  const handleSidebarSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    applyDraftFilters();
  };
  const handleResetFilters = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setCurrentPage(DEFAULT_PAGE);
  };
  const handleRefresh = () => {
    setRefreshKey((value) => value + 1);
  };
  const handlePageSizeChange = (nextPageSize: number) => {
    setPageSize(nextPageSize);
    setCurrentPage(DEFAULT_PAGE);
  };
  const handleDownload = useCallback(() => {
    if (logs.length === 0) {
      return;
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
      ...logs.map((row) =>
        toCsvRow([
          row.log_id,
          formatDateTime(row.log_date),
          formatActionLabel(row.log_action),
          getRowUserLabel(row),
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
    link.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  }, [logs]);
  const tableSummary =
    totalItems === 0 ? "Showing 0 of 0 items" : `Showing ${pageStart}-${pageEnd} of ${totalItems} items`;
  return (
    <main className={styles.page}>
      <div className={styles.canvas}>
        <header className={styles.pageHeader}>
          <div className={styles.pageHeading}>
            <p className={styles.breadcrumbs}>Dashboard / Settings / Audit logs</p>
            <h1 className={styles.pageTitle}>Audit logs</h1>
            <p className={styles.pageSubtitle}>
              Review every insert, update, approval, and cancel event with full audit detail.
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              className={styles.iconAction}
              type="button"
              aria-label="Refresh audit logs"
              title="Refresh audit logs"
              onClick={handleRefresh}
            >
              <FiMoreHorizontal aria-hidden="true" />
            </button>
            <button
              className={styles.downloadButton}
              type="button"
              onClick={handleDownload}
              disabled={logs.length === 0}
            >
              <FiDownload aria-hidden="true" />
              <span>Download</span>
            </button>
          </div>
        </header>
        {error ? (
          <div className={styles.errorBanner}>
            <p className={styles.errorText}>{error}</p>
            <button className={styles.retryButton} type="button" onClick={handleRefresh}>
              Retry
            </button>
          </div>
        ) : null}
        <div className={styles.contentLayout}>
          <section className={styles.tablePanel}>
            <div className={styles.panelToolbar}>
              <form className={styles.searchForm} onSubmit={handleSearchSubmit}>
                <FiSearch className={styles.searchIcon} aria-hidden="true" />
                <input
                  className={styles.searchInput}
                  type="text"
                  value={draftFilters.search}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      search: event.target.value,
                    }))
                  }
                  placeholder="Search by screen, table, entity, notes"
                />
              </form>
              <div className={styles.toolbarMeta}>
                <span className={styles.metaText}>
                  {loading ? "Refreshing audit logs..." : "Audit trail"}
                </span>
              </div>
            </div>
            <div className={styles.tableScroller}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.alignCenter}># <span className={styles.sortHint}>↕</span></th>
                    <th>Date <span className={styles.sortHint}>↕</span></th>
                    <th>Action <span className={styles.sortHint}>↕</span></th>
                    <th>User <span className={styles.sortHint}>↕</span></th>
                    <th>Screen <span className={styles.sortHint}>↕</span></th>
                    <th>Table <span className={styles.sortHint}>↕</span></th>
                    <th>Entity <span className={styles.sortHint}>↕</span></th>
                    <th className={styles.alignCenter}>Changes <span className={styles.sortHint}>↕</span></th>
                    <th>Notes <span className={styles.sortHint}>↕</span></th>
                  </tr>
                </thead>
                <tbody>
                  {loading && logs.length === 0 ? (
                    <tr>
                      <td className={styles.emptyCell} colSpan={TABLE_COLUMN_COUNT}>
                        Loading audit logs...
                      </td>
                    </tr>
                  ) : paginatedLogs.length === 0 ? (
                    <tr>
                      <td className={styles.emptyCell} colSpan={TABLE_COLUMN_COUNT}>
                        No audit logs found for the current filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedLogs.map((row, rowIndex) => (
                      <tr
                        key={row.log_id}
                        className={cx(
                          styles.tableRow,
                          selectedLog?.log_id === row.log_id && styles.tableRowActive,
                        )}
                        onClick={() => setSelectedLog(row)}
                      >
                        <td className={cx(styles.cellCenter, styles.serialCell)} data-label="#">
                          {(currentPage - 1) * pageSize + rowIndex + 1}
                        </td>
                        <td data-label="Date">
                          <div className={styles.dateCell}>
                            <span className={styles.datePrimary}>{formatDateOnly(row.log_date)}</span>
                            <span className={styles.dateSecondary}>{formatDateTime(row.log_date)}</span>
                          </div>
                        </td>
                        <td className={styles.cellCenter} data-label="Action">
                          <span className={styles.actionBadge} data-variant={resolveActionVariant(row.log_action)}>
                            {formatActionLabel(row.log_action)}
                          </span>
                        </td>
                        <td data-label="User">{getRowUserLabel(row)}</td>
                        <td data-label="Screen">
                          <div className={styles.screenCell}>
                            <span className={styles.screenName}>{row.screen_name}</span>
                            <span className={styles.screenMeta}>ID {row.log_screen_id}</span>
                          </div>
                        </td>
                        <td data-label="Table">{row.log_table_name}</td>
                        <td data-label="Entity">
                          <span className={styles.truncateText}>{truncateValue(getRowEntityLabel(row), 46)}</span>
                        </td>
                        <td className={styles.cellCenter} data-label="Changes">
                          <span className={cx(styles.changeText, countChangedFields(row.log_changed_fields) === 0 && styles.mutedText)}>
                            {formatChangeSummary(row.log_changed_fields)}
                          </span>
                        </td>
                        <td data-label="Notes">
                          <span className={styles.truncateText}>{truncateValue(row.log_notes, 68)}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className={styles.tableFooter}>
              <div className={styles.summaryRow}>
                <span className={styles.summaryText}>{tableSummary}</span>
                <span className={styles.summaryText}>
                  Showing {TABLE_COLUMN_COUNT} of {TABLE_COLUMN_COUNT} columns
                </span>
              </div>
              <div className={styles.paginationBar}>
                <label className={styles.pageSizeControl}>
                  <span className={styles.summaryText}>Rows per page</span>
                  <div className={styles.selectShell}>
                    <select
                      className={styles.pageSizeSelect}
                      value={pageSize}
                      onChange={(event) => handlePageSizeChange(Number(event.target.value))}
                    >
                      {PAGE_SIZE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <FiChevronDown className={styles.selectIcon} aria-hidden="true" />
                  </div>
                </label>
                <div className={styles.paginationControls}>
                  <button
                    className={styles.paginationButton}
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.max(DEFAULT_PAGE, page - 1))}
                    disabled={currentPage <= DEFAULT_PAGE}
                    aria-label="Previous page"
                  >
                    <FiChevronLeft aria-hidden="true" />
                  </button>
                  <span className={styles.paginationCurrent}>{currentPage}</span>
                  <span className={styles.paginationLabel}>of {safeTotalPages} pages</span>
                  <button
                    className={styles.paginationButton}
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.min(safeTotalPages, page + 1))}
                    disabled={currentPage >= safeTotalPages}
                    aria-label="Next page"
                  >
                    <FiChevronRight aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className={styles.tableFooterNote}>
                <span className={styles.metaText}>
                  Rows stack automatically on smaller screens. Use the scrollbar inside the table to browse all loaded rows.
                </span>
              </div>
            </div>
          </section>
          <aside className={styles.filterSidebar}>
            <form className={styles.filterCard} onSubmit={handleSidebarSubmit}>
              <div className={styles.filterHeader}>
                <span className={styles.filterEyebrow}>Filters</span>
                <p className={styles.filterSummary}>
                  {activeFilterCount === 0
                    ? "No filters applied"
                    : `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} applied`}
                </p>
              </div>
              <label className={styles.filterField}>
                <span className={styles.filterLabel}>Action</span>
                <div className={styles.selectShell}>
                  <select
                    className={styles.selectInput}
                    value={draftFilters.action}
                    onChange={(event) =>
                      setDraftFilters((current) => ({
                        ...current,
                        action: event.target.value as AuditActionFilter,
                      }))
                    }
                  >
                    {ACTION_OPTIONS.map((option) => (
                      <option key={option.value || "all"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <FiChevronDown className={styles.selectIcon} aria-hidden="true" />
                </div>
              </label>
              <label className={styles.filterField}>
                <span className={styles.filterLabel}>Screen ID</span>
                <input
                  className={styles.textInput}
                  type="text"
                  inputMode="numeric"
                  value={draftFilters.screenId}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      screenId: event.target.value.replace(/\D+/g, ""),
                    }))
                  }
                  placeholder="Select"
                />
              </label>
              <label className={styles.filterField}>
                <span className={styles.filterLabel}>Date from</span>
                <input
                  className={cx(styles.textInput, isDateRangeInvalid && styles.textInputInvalid)}
                  type="date"
                  value={draftFilters.dateFrom}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      dateFrom: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.filterField}>
                <span className={styles.filterLabel}>Date to</span>
                <input
                  className={cx(styles.textInput, isDateRangeInvalid && styles.textInputInvalid)}
                  type="date"
                  value={draftFilters.dateTo}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      dateTo: event.target.value,
                    }))
                  }
                />
              </label>
              <div className={styles.filterInsight}>
                <div className={styles.insightRow}>
                  <span>Results</span>
                  <strong>{meta.total}</strong>
                </div>
                <div className={styles.insightRow}>
                  <span>Pending changes</span>
                  <strong>{pendingFilterChanges ? "Yes" : "No"}</strong>
                </div>
              </div>
              {isDateRangeInvalid ? (
                <p className={styles.validationText}>
                  Date from must be earlier than or equal to date to.
                </p>
              ) : null}
              <div className={styles.filterActions}>
                <button className={styles.resetButton} type="button" onClick={handleResetFilters}>
                  Reset values
                </button>
                <button className={styles.applyButton} type="submit" disabled={isDateRangeInvalid}>
                  Apply filters
                </button>
              </div>
            </form>
          </aside>
        </div>
      </div>
      {selectedLog ? (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-log-detail-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedLog(null);
            }
          }}
        >
          <section className={styles.modal}>
            <header className={styles.modalHeader}>
              <div className={styles.modalHeading}>
                <p className={styles.modalEyebrow}>Audit detail</p>
                <h2 className={styles.modalTitle} id="audit-log-detail-title">
                  {formatActionLabel(selectedLog.log_action)} log for {selectedLog.screen_name}
                </h2>
                <p className={styles.modalSubtitle}>
                  Captured on {formatDateTime(selectedLog.log_date)} for {selectedLog.log_table_name}
                </p>
              </div>

              <button
                className={styles.modalClose}
                type="button"
                onClick={() => setSelectedLog(null)}
                aria-label="Close audit log detail"
              >
                ×
              </button>
            </header>
            <div className={styles.modalContent}>
              <section className={styles.metaGrid}>
                <div className={styles.metaCard}>
                  <p className={styles.metaLabel}>Log ID</p>
                  <p className={styles.metaValue}>{selectedLog.log_id}</p>
                </div>
                <div className={styles.metaCard}>
                  <p className={styles.metaLabel}>Action</p>
                  <p className={styles.metaValue}>{formatActionLabel(selectedLog.log_action)}</p>
                </div>
                <div className={styles.metaCard}>
                  <p className={styles.metaLabel}>Date</p>
                  <p className={styles.metaValue}>{formatDateTime(selectedLog.log_date)}</p>
                </div>
                <div className={styles.metaCard}>
                  <p className={styles.metaLabel}>Screen</p>
                  <p className={styles.metaValue}>
                    {selectedLog.screen_name} (ID {selectedLog.log_screen_id})
                  </p>
                </div>
                <div className={styles.metaCard}>
                  <p className={styles.metaLabel}>Table</p>
                  <p className={styles.metaValue}>{selectedLog.log_table_name}</p>
                </div>
                <div className={styles.metaCard}>
                  <p className={styles.metaLabel}>Primary key</p>
                  <p className={styles.metaValue}>{selectedLog.log_pk ?? "-"}</p>
                </div>
                <div className={styles.metaCard}>
                  <p className={styles.metaLabel}>Display name</p>
                  <p className={styles.metaValue}>{selectedLog.log_display_name ?? "-"}</p>
                </div>
                <div className={styles.metaCard}>
                  <p className={styles.metaLabel}>User</p>
                  <p className={styles.metaValue}>
                    {selectedLog.log_user_name?.trim()
                      ? `${selectedLog.log_user_name}${selectedLog.log_user_id ? ` (${selectedLog.log_user_id})` : ""}`
                      : selectedLog.log_user_id ?? "-"}
                  </p>
                </div>
                <div className={styles.metaCard}>
                  <p className={styles.metaLabel}>Branch</p>
                  <p className={styles.metaValue}>
                    {selectedLog.log_branch_name?.trim()
                      ? `${selectedLog.log_branch_name}${selectedLog.log_branch_id ? ` (${selectedLog.log_branch_id})` : ""}`
                      : selectedLog.log_branch_id ?? "-"}
                  </p>
                </div>
                <div className={styles.metaCard}>
                  <p className={styles.metaLabel}>Notes</p>
                  <p className={styles.metaValue}>{selectedLog.log_notes ?? "-"}</p>
                </div>
              </section>
              <section className={styles.jsonGrid}>
                <article className={styles.jsonCard}>
                  <div className={styles.jsonCardHeader}>
                    <div>
                      <h3 className={styles.jsonTitle}>Changed fields</h3>
                      <p className={styles.jsonSubtitle}>Computed diff recorded for this action.</p>
                    </div>
                    <span className={styles.jsonCount}>
                      {selectedLogChangeCount === 0
                        ? "No diff"
                        : `${selectedLogChangeCount} field${selectedLogChangeCount === 1 ? "" : "s"}`}
                    </span>
                  </div>
                  {selectedLog.log_changed_fields === null || selectedLog.log_changed_fields === undefined ? (
                    <p className={styles.jsonEmpty}>{getJsonEmptyState("Changed fields")}</p>
                  ) : (
                    <pre className={styles.jsonPre}>{stringifyJson(selectedLog.log_changed_fields)}</pre>
                  )}
                </article>
                <article className={styles.jsonCard}>
                  <div className={styles.jsonCardHeader}>
                    <div>
                      <h3 className={styles.jsonTitle}>Original record</h3>
                      <p className={styles.jsonSubtitle}>State captured before the action.</p>
                    </div>
                  </div>
                  {selectedLog.log_original_record === null || selectedLog.log_original_record === undefined ? (
                    <p className={styles.jsonEmpty}>{getJsonEmptyState("Original record")}</p>
                  ) : (
                    <pre className={styles.jsonPre}>{stringifyJson(selectedLog.log_original_record)}</pre>
                  )}
                </article>
                <article className={styles.jsonCard}>
                  <div className={styles.jsonCardHeader}>
                    <div>
                      <h3 className={styles.jsonTitle}>Modified record</h3>
                      <p className={styles.jsonSubtitle}>State captured after the action.</p>
                    </div>
                  </div>
                  {selectedLog.log_modified_record === null || selectedLog.log_modified_record === undefined ? (
                    <p className={styles.jsonEmpty}>{getJsonEmptyState("Modified record")}</p>
                  ) : (
                    <pre className={styles.jsonPre}>{stringifyJson(selectedLog.log_modified_record)}</pre>
                  )}
                </article>
              </section>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
