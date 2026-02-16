"use client";
import {
  type CSSProperties,
  type Key,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { FiEdit, FiEye, FiPlus, FiSearch, FiTrash2 } from "react-icons/fi";
import styles from "./table.module.scss";
export type ReusableTableSortDirection = "asc" | "desc";
export type ReusableTableSortState = {
  key: string | null;
  direction: ReusableTableSortDirection;
};
export type ReusableTableColumn<T> = {
  key: string;
  header: ReactNode;
  accessor?: keyof T;
  render?: (row: T, rowIndex: number) => ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
  mobileLabel?: string;
  headerClassName?: string;
  cellClassName?: string | ((row: T, rowIndex: number) => string | undefined);
  sortable?: boolean;
  sortAccessor?: (row: T, rowIndex: number) => unknown;
  searchAccessor?: (row: T, rowIndex: number) => unknown;
};
type RowKeyResolver<T> = keyof T | ((row: T, rowIndex: number) => Key);
type RowActionHandler<T> = (row: T, rowIndex: number) => void;
type RowActionDisabledResolver<T> = (row: T, rowIndex: number) => boolean;
export type ReusableTableProps<T extends Record<string, unknown>> = {
  columns: ReusableTableColumn<T>[];
  rows: T[];
  rowKey: RowKeyResolver<T>;
  title?: ReactNode;
  minWidth?: string;
  activeRowIndex?: number;
  activeRowKey?: Key | null;
  rowClassName?: (row: T, rowIndex: number) => string | undefined;
  onRowClick?: (row: T, rowIndex: number) => void;
  wrapperClassName?: string;
  tableClassName?: string;
  emptyText?: string;
  onView?: RowActionHandler<T>;
  onUpdate?: RowActionHandler<T>;
  onEdit?: RowActionHandler<T>;
  onDelete?: RowActionHandler<T>;
  isViewDisabled?: RowActionDisabledResolver<T>;
  isUpdateDisabled?: RowActionDisabledResolver<T>;
  isEditDisabled?: RowActionDisabledResolver<T>;
  isDeleteDisabled?: RowActionDisabledResolver<T>;
  viewLabel?: string;
  updateLabel?: string;
  editLabel?: string;
  deleteLabel?: string;
  showActionsColumn?: boolean;
  actionsHeader?: ReactNode;
  actionsColumnWidth?: string;
  actionsAsIcons?: boolean;
  onCreate?: () => void;
  createLabel?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchQuery?: string;
  defaultSearchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  sortable?: boolean;
  sortState?: ReusableTableSortState;
  defaultSortState?: ReusableTableSortState;
  onSortChange?: (sortState: ReusableTableSortState) => void;
  paginated?: boolean;
  currentPage?: number;
  defaultCurrentPage?: number;
  onCurrentPageChange?: (page: number) => void;
  pageSize?: number;
  defaultPageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (pageSize: number) => void;
  showPageSizeSelector?: boolean;
  paginationLabel?: string;
  tableMaxHeight?: string;
  stickyHeader?: boolean;
};
function cx(...tokens: Array<string | undefined | false>): string {
  return tokens.filter(Boolean).join(" ");
}
function getColumnAlignClass(align: ReusableTableColumn<Record<string, unknown>>["align"]): string {
  if (align === "right") return styles.alignRight;
  if (align === "center") return styles.alignCenter;
  return styles.alignLeft;
}
function formatColumnLabel(columnKey: string): string {
  const normalized = columnKey
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "Value";
  }

  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}
function getCellLabel(header: ReactNode, columnKey: string, mobileLabel?: string): string {
  if (mobileLabel) return mobileLabel;
  if (typeof header === "string") return header;
  return formatColumnLabel(columnKey);
}
function normalizeString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).toLowerCase().trim();
}
function normalizeSortValue(value: unknown): number | string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  return String(value).trim().toLowerCase();
}
function buildPageList(totalPages: number, currentPage: number): Array<number | "ellipsis"> {
  const pages: Array<number | "ellipsis"> = [];
  const safeTotal = Math.max(1, totalPages);
  for (let page = 1; page <= safeTotal; page += 1) {
    if (
      page === 1 ||
      page === safeTotal ||
      (page >= currentPage - 1 && page <= currentPage + 1)
    ) {
      pages.push(page);
      continue;
    }
    if (
      (page === currentPage - 2 || page === currentPage + 2) &&
      pages[pages.length - 1] !== "ellipsis"
    ) {
      pages.push("ellipsis");
    }
  }
  return pages;
}
function ActionIcon({ type }: { type: "view" | "update" | "delete" }): ReactNode {
  if (type === "view") {
    return <FiEye className={styles.actionIcon} aria-hidden="true" />;
  }
  if (type === "update") {
    return <FiEdit className={styles.actionIcon} aria-hidden="true" />;
  }
  return <FiTrash2 className={styles.actionIcon} aria-hidden="true" />;
}
function isActionsColumn<T extends Record<string, unknown>>(column: ReusableTableColumn<T>): boolean {
  const normalizedKey = column.key.trim().toLowerCase();
  if (normalizedKey === "actions") {
    return true;
  }
  if (typeof column.accessor === "string" && column.accessor.trim().toLowerCase() === "actions") {
    return true;
  }
  if (typeof column.header === "string" && column.header.trim().toLowerCase() === "actions") {
    return true;
  }
  return false;
}
function getCellContent<T extends Record<string, unknown>>(
  row: T,
  column: ReusableTableColumn<T>,
  rowIndex: number,
): ReactNode {
  if (column.render) {
    return column.render(row, rowIndex);
  }
  if (column.accessor) {
    const value = row[column.accessor];
    if (value === "" || value === null || value === undefined) {
      return "-";
    }
    return String(value);
  }
  return "-";
}
function resolveRowKey<T extends Record<string, unknown>>(
  row: T,
  rowIndex: number,
  rowKey: RowKeyResolver<T>,
): Key {
  if (typeof rowKey === "function") {
    return rowKey(row, rowIndex);
  }
  const value = row[rowKey];
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  return `${String(rowKey)}-${rowIndex}`;
}
function resolveSearchValue<T extends Record<string, unknown>>(
  row: T,
  rowIndex: number,
  column: ReusableTableColumn<T>,
): string {
  if (column.searchAccessor) {
    return normalizeString(column.searchAccessor(row, rowIndex));
  }
  if (column.accessor) {
    return normalizeString(row[column.accessor]);
  }
  return "";
}
function resolveSortValue<T extends Record<string, unknown>>(
  row: T,
  rowIndex: number,
  column: ReusableTableColumn<T>,
): unknown {
  if (column.sortAccessor) {
    return column.sortAccessor(row, rowIndex);
  }
  if (column.accessor) {
    return row[column.accessor];
  }
  const dynamicValue = row[column.key as keyof T];
  return dynamicValue;
}
function isColumnSortable<T extends Record<string, unknown>>(
  column: ReusableTableColumn<T>,
  sortable: boolean,
): boolean {
  if (!sortable) {
    return false;
  }
  if (isActionsColumn(column)) {
    return false;
  }
  return column.sortable ?? true;
}
export function ReusableTable<T extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  title,
  minWidth = "min(980px, 100%)",
  activeRowIndex,
  activeRowKey,
  rowClassName,
  onRowClick,
  wrapperClassName,
  tableClassName,
  emptyText = "No records found",
  onView,
  onUpdate,
  onEdit,
  onDelete,
  isViewDisabled,
  isUpdateDisabled,
  isEditDisabled,
  isDeleteDisabled,
  viewLabel = "View",
  updateLabel,
  editLabel,
  deleteLabel = "Delete",
  showActionsColumn,
  actionsHeader = "Actions",
  actionsColumnWidth = "160px",
  actionsAsIcons = false,
  onCreate,
  createLabel = "Add New",
  searchable = false,
  searchPlaceholder = "Search...",
  searchQuery,
  defaultSearchQuery = "",
  onSearchQueryChange,
  sortable = false,
  sortState,
  defaultSortState = { key: null, direction: "asc" },
  onSortChange,
  paginated = false,
  currentPage,
  defaultCurrentPage = 1,
  onCurrentPageChange,
  pageSize,
  defaultPageSize = 10,
  pageSizeOptions = [5, 10, 25, 50],
  onPageSizeChange,
  showPageSizeSelector = true,
  paginationLabel = "Showing",
  tableMaxHeight,
  stickyHeader = true,
}: ReusableTableProps<T>) {
  const isSearchControlled = typeof searchQuery === "string";
  const isSortControlled = typeof sortState !== "undefined";
  const isCurrentPageControlled = typeof currentPage === "number";
  const isPageSizeControlled = typeof pageSize === "number";
  const [internalSearchQuery, setInternalSearchQuery] = useState(defaultSearchQuery);
  const [internalSortState, setInternalSortState] = useState<ReusableTableSortState>(defaultSortState);
  const [internalCurrentPage, setInternalCurrentPage] = useState(defaultCurrentPage);
  const [internalPageSize, setInternalPageSize] = useState(defaultPageSize);
  const resolvedOnUpdate = onUpdate ?? onEdit;
  const resolvedIsUpdateDisabled = isUpdateDisabled ?? isEditDisabled;
  const resolvedUpdateLabel = updateLabel ?? editLabel ?? "Update";
  const hasActionsColumn = columns.some((column) => isActionsColumn(column));
  const effectiveSearchQuery = isSearchControlled ? searchQuery : internalSearchQuery;
  const effectiveSortState = isSortControlled ? sortState : internalSortState;
  const effectivePageSize = Math.max(
    1,
    isPageSizeControlled ? (pageSize ?? defaultPageSize) : internalPageSize,
  );
  const shouldIncludeActionsColumn =
    showActionsColumn ?? Boolean(hasActionsColumn || onView || resolvedOnUpdate || onDelete);
  const displayColumns =
    shouldIncludeActionsColumn && !hasActionsColumn
      ? [
          ...columns,
          {
            key: "actions",
            header: actionsHeader,
            align: "center",
            width: actionsColumnWidth,
            mobileLabel: "Actions",
          } satisfies ReusableTableColumn<T>,
        ]
      : columns;
  const sortableColumns = displayColumns.filter((column) => isColumnSortable(column, sortable));
  const normalizedSearchQuery = normalizeString(effectiveSearchQuery);
  const filteredRows = useMemo(() => {
    if (!searchable || !normalizedSearchQuery) {
      return rows;
    }
    const searchableColumns = displayColumns.filter((column) => !isActionsColumn(column));
    return rows.filter((row, rowIndex) => {
      const hasColumnMatch = searchableColumns.some((column) =>
        resolveSearchValue(row, rowIndex, column).includes(normalizedSearchQuery),
      );
      if (hasColumnMatch) {
        return true;
      }
      return Object.values(row).some((value) => normalizeString(value).includes(normalizedSearchQuery));
    });
  }, [displayColumns, normalizedSearchQuery, rows, searchable]);
  const sortedRows = useMemo(() => {
    if (!sortable || !effectiveSortState.key) {
      return filteredRows;
    }
    const targetColumn = sortableColumns.find((column) => column.key === effectiveSortState.key);
    if (!targetColumn) {
      return filteredRows;
    }
    const directionFactor = effectiveSortState.direction === "asc" ? 1 : -1;
    const normalized = filteredRows.map((row, index) => ({
      row,
      index,
      value: normalizeSortValue(resolveSortValue(row, index, targetColumn)),
    }));
    normalized.sort((left, right) => {
      if (left.value === right.value) {
        return left.index - right.index;
      }
      if (typeof left.value === "number" && typeof right.value === "number") {
        return (left.value - right.value) * directionFactor;
      }
      return (
        String(left.value).localeCompare(String(right.value), undefined, {
          numeric: true,
          sensitivity: "base",
        }) * directionFactor
      );
    });
    return normalized.map((entry) => entry.row);
  }, [effectiveSortState.direction, effectiveSortState.key, filteredRows, sortable, sortableColumns]);
  const totalEntries = sortedRows.length;
  const totalPages = paginated ? Math.max(1, Math.ceil(totalEntries / effectivePageSize)) : 1;
  const requestedCurrentPage = Math.max(
    1,
    isCurrentPageControlled ? (currentPage ?? defaultCurrentPage) : internalCurrentPage,
  );
  const effectiveCurrentPage = Math.min(requestedCurrentPage, totalPages);
  const pageStartIndex = paginated ? (effectiveCurrentPage - 1) * effectivePageSize : 0;
  const paginatedRows = paginated
    ? sortedRows.slice(pageStartIndex, pageStartIndex + effectivePageSize)
    : sortedRows;
  const pageStart = totalEntries === 0 ? 0 : pageStartIndex + 1;
  const pageEnd = paginated ? Math.min(pageStartIndex + effectivePageSize, totalEntries) : totalEntries;
  const pageList = useMemo(
    () => (paginated ? buildPageList(totalPages, effectiveCurrentPage) : []),
    [effectiveCurrentPage, paginated, totalPages],
  );
  const normalizedPageSizeOptions = useMemo(() => {
    const set = new Set<number>([...pageSizeOptions, effectivePageSize].filter((option) => option > 0));
    return Array.from(set).sort((left, right) => left - right);
  }, [effectivePageSize, pageSizeOptions]);
  const showToolbar = Boolean(title || searchable || onCreate);
  useEffect(() => {
    if (!paginated || effectiveCurrentPage === requestedCurrentPage) {
      return;
    }
    if (isCurrentPageControlled) {
      onCurrentPageChange?.(effectiveCurrentPage);
      return;
    }
    setInternalCurrentPage(effectiveCurrentPage);
  }, [
    effectiveCurrentPage,
    isCurrentPageControlled,
    onCurrentPageChange,
    paginated,
    requestedCurrentPage,
  ]);
  const resetToFirstPage = () => {
    if (!paginated) {
      return;
    }
    if (isCurrentPageControlled) {
      onCurrentPageChange?.(1);
      return;
    }
    setInternalCurrentPage(1);
  };
  const setSearch = (value: string) => {
    if (isSearchControlled) {
      onSearchQueryChange?.(value);
    } else {
      setInternalSearchQuery(value);
      onSearchQueryChange?.(value);
    }
    resetToFirstPage();
  };
  const setSort = (nextSortState: ReusableTableSortState) => {
    if (isSortControlled) {
      onSortChange?.(nextSortState);
    } else {
      setInternalSortState(nextSortState);
      onSortChange?.(nextSortState);
    }
    resetToFirstPage();
  };
  const setPage = (nextPage: number) => {
    const normalizedPage = Math.min(Math.max(1, nextPage), totalPages);
    if (isCurrentPageControlled) {
      onCurrentPageChange?.(normalizedPage);
      return;
    }
    setInternalCurrentPage(normalizedPage);
    onCurrentPageChange?.(normalizedPage);
  };
  const setPageSize = (nextPageSize: number) => {
    const normalizedPageSize = Math.max(1, nextPageSize);
    if (isPageSizeControlled) {
      onPageSizeChange?.(normalizedPageSize);
    } else {
      setInternalPageSize(normalizedPageSize);
      onPageSizeChange?.(normalizedPageSize);
    }
    resetToFirstPage();
  };
  const toggleSort = (column: ReusableTableColumn<T>) => {
    if (!isColumnSortable(column, sortable)) {
      return;
    }
    const nextDirection: ReusableTableSortDirection =
      effectiveSortState.key === column.key && effectiveSortState.direction === "asc" ? "desc" : "asc";
    setSort({ key: column.key, direction: nextDirection });
  };
  const handleActionClick = (
    event: MouseEvent<HTMLButtonElement>,
    handler: RowActionHandler<T> | undefined,
    row: T,
    rowIndex: number,
  ) => {
    event.stopPropagation();
    handler?.(row, rowIndex);
  };
  return (
    <div className={cx(styles.tableShell, wrapperClassName)}>
      {showToolbar ? (
        <div className={styles.toolbar}>
          {title ? <h3 className={styles.toolbarTitle}>{title}</h3> : null}
          {searchable || onCreate ? (
            <div className={styles.tableTools}>
              {searchable ? (
                <div className={styles.searchField}>
                  <FiSearch className={styles.searchIcon} aria-hidden="true" />
                  <input
                    type="text"
                    value={effectiveSearchQuery}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={searchPlaceholder}
                    className={styles.searchInput}
                  />
                </div>
              ) : null}
              {onCreate ? (
                <button
                  type="button"
                  className={styles.createButton}
                  onClick={onCreate}
                  aria-label={createLabel}
                  title={createLabel}
                >
                  <FiPlus className={styles.createIcon} aria-hidden="true" />
                  <span>{createLabel}</span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div
        className={styles.tableViewport}
        style={
          {
            "--erp-table-max-height": tableMaxHeight ?? "none",
          } as CSSProperties
        }
      >
        <table
          className={cx(styles.table, tableClassName)}
          style={{ "--erp-table-min-width": minWidth } as CSSProperties}
        >
          <colgroup>
            {displayColumns.map((column) => (
              <col key={column.key} style={column.width ? { width: column.width } : undefined} />
            ))}
          </colgroup>
          <thead className={styles.head}>
            <tr>
              {displayColumns.map((column) => {
                const canSort = isColumnSortable(column, sortable);
                const sortDirection =
                  effectiveSortState.key === column.key ? effectiveSortState.direction : null;

                return (
                  <th
                    key={column.key}
                    className={cx(
                      styles.headerCell,
                      getColumnAlignClass(column.align),
                      canSort && styles.sortableHeaderCell,
                      stickyHeader && styles.stickyHeaderCell,
                      column.headerClassName,
                    )}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        className={cx(
                          styles.headerButton,
                          sortDirection ? styles.headerButtonActive : undefined,
                        )}
                        onClick={() => toggleSort(column)}
                      >
                        <span>{column.header}</span>
                        <span className={styles.sortIndicator}>
                          {sortDirection === "asc" ? "▲" : sortDirection === "desc" ? "▼" : "↕"}
                        </span>
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className={styles.body}>
            {paginatedRows.length === 0 ? (
              <tr className={cx(styles.row, styles.rowOdd)}>
                <td className={cx(styles.cell, styles.emptyCell)} colSpan={displayColumns.length}>
                  {emptyText}
                </td>
              </tr>
            ) : (
              paginatedRows.map((row, rowIndex) => {
                const resolvedKey = resolveRowKey(row, rowIndex, rowKey);
                const isActiveByIndex = rowIndex === activeRowIndex;
                const isActiveByKey =
                  activeRowKey !== undefined && activeRowKey !== null && resolvedKey === activeRowKey;

                return (
                  <tr
                    key={resolvedKey}
                    className={cx(
                      styles.row,
                      rowIndex % 2 === 0 ? styles.rowOdd : styles.rowEven,
                      (isActiveByIndex || isActiveByKey) && styles.activeRow,
                      onRowClick && styles.rowClickable,
                      rowClassName?.(row, rowIndex),
                    )}
                    onClick={onRowClick ? () => onRowClick(row, rowIndex) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (event) => {
                            if (event.target !== event.currentTarget) {
                              return;
                            }

                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onRowClick(row, rowIndex);
                            }
                          }
                        : undefined
                    }
                    tabIndex={onRowClick ? 0 : undefined}
                  >
                    {displayColumns.map((column) => {
                      const shouldRenderActions = isActionsColumn(column) && !column.render;
                      const viewDisabled = !onView || isViewDisabled?.(row, rowIndex) === true;
                      const updateDisabled =
                        !resolvedOnUpdate || resolvedIsUpdateDisabled?.(row, rowIndex) === true;
                      const deleteDisabled = !onDelete || isDeleteDisabled?.(row, rowIndex) === true;

                      return (
                        <td
                          key={column.key}
                          data-label={getCellLabel(column.header, column.key, column.mobileLabel)}
                          className={cx(
                            styles.cell,
                            getColumnAlignClass(column.align),
                            shouldRenderActions && styles.actionsCell,
                            typeof column.cellClassName === "function"
                              ? column.cellClassName(row, rowIndex)
                              : column.cellClassName,
                          )}
                        >
                          {shouldRenderActions ? (
                            onView || resolvedOnUpdate || onDelete ? (
                              <div className={styles.actionsGroup}>
                              {onView ? (
                                <button
                                  type="button"
                                  className={cx(
                                    styles.actionButton,
                                    styles.viewButton,
                                    actionsAsIcons && styles.iconActionButton,
                                  )}
                                  onClick={(event) => handleActionClick(event, onView, row, rowIndex)}
                                  disabled={viewDisabled}
                                  aria-label={viewLabel}
                                  title={viewLabel}
                                >
                                  {actionsAsIcons ? (
                                    <>
                                      <ActionIcon type="view" />
                                      <span className={styles.srOnly}>{viewLabel}</span>
                                    </>
                                  ) : (
                                    viewLabel
                                  )}
                                </button>
                              ) : null}
                              {resolvedOnUpdate ? (
                                <button
                                  type="button"
                                  className={cx(
                                    styles.actionButton,
                                    styles.updateButton,
                                    actionsAsIcons && styles.iconActionButton,
                                  )}
                                  onClick={(event) =>
                                    handleActionClick(event, resolvedOnUpdate, row, rowIndex)
                                  }
                                  disabled={updateDisabled}
                                  aria-label={resolvedUpdateLabel}
                                  title={resolvedUpdateLabel}
                                >
                                  {actionsAsIcons ? (
                                    <>
                                      <ActionIcon type="update" />
                                      <span className={styles.srOnly}>{resolvedUpdateLabel}</span>
                                    </>
                                  ) : (
                                    resolvedUpdateLabel
                                  )}
                                </button>
                              ) : null}
                              {onDelete ? (
                                <button
                                  type="button"
                                  className={cx(
                                    styles.actionButton,
                                    styles.deleteButton,
                                    actionsAsIcons && styles.iconActionButton,
                                  )}
                                  onClick={(event) => handleActionClick(event, onDelete, row, rowIndex)}
                                  disabled={deleteDisabled}
                                  aria-label={deleteLabel}
                                  title={deleteLabel}
                                >
                                  {actionsAsIcons ? (
                                    <>
                                      <ActionIcon type="delete" />
                                      <span className={styles.srOnly}>{deleteLabel}</span>
                                    </>
                                  ) : (
                                    deleteLabel
                                  )}
                                </button>
                              ) : null}
                              </div>
                            ) : (
                              "-"
                            )
                          ) : (
                            getCellContent(row, column, rowIndex)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {paginated ? (
        <div className={styles.paginationBar}>
          <div className={styles.paginationInfo}>
            <span>
              {paginationLabel} {pageStart} to {pageEnd} of {totalEntries} entries
            </span>
            {showPageSizeSelector ? (
              <label className={styles.pageSizeControl}>
                <span>Show:</span>
                <select
                  value={effectivePageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className={styles.pageSizeSelect}
                >
                  {normalizedPageSizeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <div className={styles.paginationControls}>
            <button
              type="button"
              className={styles.paginationButton}
              onClick={() => setPage(effectiveCurrentPage - 1)}
              disabled={effectiveCurrentPage <= 1}
            >
              Previous
            </button>
            {pageList.map((page, index) =>
              page === "ellipsis" ? (
                <span key={`ellipsis-${index}`} className={styles.paginationEllipsis}>
                  ...
                </span>
              ) : (
                <button
                  key={`page-${page}`}
                  type="button"
                  className={cx(
                    styles.paginationButton,
                    page === effectiveCurrentPage && styles.paginationButtonActive,
                  )}
                  onClick={() => setPage(page)}
                >
                  {page}
                </button>
              ),
            )}
            <button
              type="button"
              className={styles.paginationButton}
              onClick={() => setPage(effectiveCurrentPage + 1)}
              disabled={effectiveCurrentPage >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
export default ReusableTable;
