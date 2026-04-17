"use client";
import {
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type Key,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  FiChevronLeft,
  FiChevronRight,
  FiCopy,
  FiEdit,
  FiEye,
  FiFileText,
  FiMoreVertical,
  FiPlus,
  FiSearch,
  FiTrash2,
} from "react-icons/fi";
import styles from "./table.module.scss";
export type ReusableTableSortDirection = "asc" | "desc";
export type ReusableTableSortState = {
  key: string | null;
  direction: ReusableTableSortDirection;
};
export type ReusableTableRowReorderEdge = "before" | "after";
export type ReusableTableColumn<T> = {
  key: string;
  header: ReactNode;
  accessor?: keyof T;
  render?: (row: T, rowIndex: number) => ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
  mobileLabel?: string;
  headerClassName?: string;
  headerStyle?: CSSProperties;
  cellClassName?: string | ((row: T, rowIndex: number) => string | undefined);
  cellStyle?: CSSProperties | ((row: T, rowIndex: number) => CSSProperties | undefined);
  sortable?: boolean;
  sortAccessor?: (row: T, rowIndex: number) => unknown;
  searchAccessor?: (row: T, rowIndex: number) => unknown;
};
type RowKeyResolver<T> = keyof T | ((row: T, rowIndex: number) => Key);
type RowActionHandler<T> = (row: T, rowIndex: number) => void;
type RowActionDisabledResolver<T> = (row: T, rowIndex: number) => boolean;
type ActionMenuPlacement = {
  vertical: "down" | "up";
  horizontal: "right" | "left";
};
export type ReusableTableProps<T extends Record<string, unknown>> = {
  columns: ReusableTableColumn<T>[];
  rows: T[];
  rowKey: RowKeyResolver<T>;
  title?: ReactNode;
  toolbarContent?: ReactNode;
  fullViewHeight?: boolean;
  minWidth?: string;
  activeRowIndex?: number;
  activeRowKey?: Key | null;
  rowClassName?: (row: T, rowIndex: number) => string | undefined;
  onRowClick?: (row: T, rowIndex: number) => void;
  reorderableRows?: boolean;
  onRowReorder?: (
    sourceRow: T,
    sourceIndex: number,
    targetRow: T,
    targetIndex: number,
    edge: ReusableTableRowReorderEdge,
  ) => void;
  wrapperClassName?: string;
  tableClassName?: string;
  emptyText?: string;
  onView?: RowActionHandler<T>;
  onUpdate?: RowActionHandler<T>;
  onEdit?: RowActionHandler<T>;
  onDuplicate?: RowActionHandler<T>;
  onDelete?: RowActionHandler<T>;
  onLogs?: RowActionHandler<T>;
  isViewDisabled?: RowActionDisabledResolver<T>;
  isUpdateDisabled?: RowActionDisabledResolver<T>;
  isEditDisabled?: RowActionDisabledResolver<T>;
  isDuplicateDisabled?: RowActionDisabledResolver<T>;
  isDeleteDisabled?: RowActionDisabledResolver<T>;
  isLogsDisabled?: RowActionDisabledResolver<T>;
  viewLabel?: string;
  updateLabel?: string;
  editLabel?: string;
  duplicateLabel?: string;
  deleteLabel?: string;
  logsLabel?: string;
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
  manualPagination?: boolean;
  totalEntries?: number;
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

const ACTION_MENU_ESTIMATED_WIDTH = 190;
const ACTION_MENU_ESTIMATED_HEIGHT = 260;
const DEFAULT_TABLE_MAX_HEIGHT = "calc(100dvh - 250px)";
const SERIAL_NUMBER_COLUMN_WIDTH = "84px";
const DEFAULT_ACTION_MENU_PLACEMENT: ActionMenuPlacement = {
  vertical: "down",
  horizontal: "right",
};

function resolveActionMenuPlacement(trigger: HTMLElement): ActionMenuPlacement {
  const viewport = trigger.closest<HTMLElement>('[data-erp-table-viewport="true"]');
  const bounds = viewport?.getBoundingClientRect() ?? document.documentElement.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();

  const spaceRight = bounds.right - triggerRect.right;
  const spaceLeft = triggerRect.left - bounds.left;
  const horizontal =
    spaceRight < ACTION_MENU_ESTIMATED_WIDTH && spaceLeft > spaceRight ? "left" : "right";

  const spaceBelow = bounds.bottom - triggerRect.top;
  const spaceAbove = triggerRect.bottom - bounds.top;
  const vertical =
    spaceBelow < ACTION_MENU_ESTIMATED_HEIGHT && spaceAbove > spaceBelow ? "up" : "down";

  return { vertical, horizontal };
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
function ActionIcon({
  type,
}: {
  type: "view" | "update" | "duplicate" | "delete" | "logs";
}): ReactNode {
  if (type === "view") {
    return <FiEye className={styles.actionIcon} aria-hidden="true" />;
  }
  if (type === "update") {
    return <FiEdit className={styles.actionIcon} aria-hidden="true" />;
  }
  if (type === "duplicate") {
    return <FiCopy className={styles.actionIcon} aria-hidden="true" />;
  }
  if (type === "logs") {
    return <FiFileText className={styles.actionIcon} aria-hidden="true" />;
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
function isSerialNumberColumn<T extends Record<string, unknown>>(
  column: ReusableTableColumn<T>,
): boolean {
  const normalize = (value: string): string =>
    value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

  const normalizedKey = normalize(column.key);
  if (normalizedKey === "serialno" || normalizedKey === "sno" || normalizedKey === "srno") {
    return true;
  }

  if (typeof column.accessor === "string") {
    const normalizedAccessor = normalize(column.accessor);
    if (
      normalizedAccessor === "serialno" ||
      normalizedAccessor === "sno" ||
      normalizedAccessor === "srno"
    ) {
      return true;
    }
  }

  if (typeof column.header === "string") {
    const normalizedHeader = normalize(column.header);
    if (
      normalizedHeader === "serialno" ||
      normalizedHeader === "sno" ||
      normalizedHeader === "srno"
    ) {
      return true;
    }
  }

  return false;
}
function resolveColumnWidth<T extends Record<string, unknown>>(
  column: ReusableTableColumn<T>,
): CSSProperties | undefined {
  const normalizedWidth = column.width?.trim();

  if (isSerialNumberColumn(column)) {
    const pixelWidthMatch = normalizedWidth?.match(/^(\d+(?:\.\d+)?)px$/i);
    const serialWidth =
      pixelWidthMatch && Number.isFinite(Number(pixelWidthMatch[1]))
        ? `${Math.max(Number(pixelWidthMatch[1]), Number.parseFloat(SERIAL_NUMBER_COLUMN_WIDTH))}px`
        : normalizedWidth || SERIAL_NUMBER_COLUMN_WIDTH;
    return {
      width: serialWidth,
      minWidth: serialWidth,
      maxWidth: serialWidth,
      whiteSpace: "nowrap",
    };
  }

  if (!normalizedWidth) {
    return undefined;
  }

  return { width: normalizedWidth };
}
function getInlineActionColumnIndex<T extends Record<string, unknown>>(
  columns: ReusableTableColumn<T>[],
): number {
  const serialColumnIndex = columns.findIndex(
    (column) => !isActionsColumn(column) && isSerialNumberColumn(column),
  );
  const firstUsableColumnIndex = columns.findIndex((column) => !isActionsColumn(column));

  if (serialColumnIndex >= 0) {
    return serialColumnIndex;
  }

  return firstUsableColumnIndex;
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
function renderColumnHeaderContent(header: ReactNode): ReactNode {
  if (typeof header === "string" || typeof header === "number") {
    return <span className={styles.headerText}>{header}</span>;
  }
  return header;
}
export function ReusableTable<T extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  title,
  toolbarContent,
  fullViewHeight = true,
  minWidth = "min(980px, 100%)",
  activeRowIndex,
  activeRowKey,
  rowClassName,
  onRowClick,
  reorderableRows = false,
  onRowReorder,
  wrapperClassName,
  tableClassName,
  emptyText = "No records found",
  onView,
  onUpdate,
  onEdit,
  onDuplicate,
  onDelete,
  onLogs,
  isViewDisabled,
  isUpdateDisabled,
  isEditDisabled,
  isDuplicateDisabled,
  isDeleteDisabled,
  isLogsDisabled,
  viewLabel = "View Details",
  updateLabel,
  editLabel,
  duplicateLabel = "Duplicate",
  deleteLabel = "Delete",
  logsLabel = "Logs",
  showActionsColumn,
  actionsHeader = "Actions",
  actionsColumnWidth = "160px",
  actionsAsIcons: _actionsAsIcons = false,
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
  manualPagination = false,
  totalEntries,
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
  const [openActionMenuKey, setOpenActionMenuKey] = useState<Key | null>(null);
  const [openActionMenuPlacement, setOpenActionMenuPlacement] = useState<ActionMenuPlacement>(
    DEFAULT_ACTION_MENU_PLACEMENT,
  );
  const [draggingRowKey, setDraggingRowKey] = useState<Key | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    key: Key;
    edge: ReusableTableRowReorderEdge;
  } | null>(null);
  const resolvedOnUpdate = onUpdate ?? onEdit;
  const resolvedIsUpdateDisabled = isUpdateDisabled ?? isEditDisabled;
  const resolvedUpdateLabel = updateLabel ?? editLabel ?? "Edit";
  const hasRowActions = Boolean(onView || resolvedOnUpdate || onDuplicate || onDelete || onLogs);
  const hasActionsColumn = columns.some((column) => isActionsColumn(column));
  const shouldRenderInlineActionMenu =
    hasRowActions && !hasActionsColumn && showActionsColumn !== true;
  const baseColumns = shouldRenderInlineActionMenu
    ? columns.filter((column) => !isActionsColumn(column))
    : columns;
  const effectiveSearchQuery = isSearchControlled ? searchQuery : internalSearchQuery;
  const effectiveSortState = isSortControlled ? sortState : internalSortState;
  const effectivePageSize = Math.max(
    1,
    isPageSizeControlled ? (pageSize ?? defaultPageSize) : internalPageSize,
  );
  const shouldIncludeActionsColumn = showActionsColumn ?? Boolean(hasActionsColumn || hasRowActions);
  const displayColumns =
    shouldIncludeActionsColumn && !hasActionsColumn && !shouldRenderInlineActionMenu
      ? [
          ...baseColumns,
          {
            key: "actions",
            header: actionsHeader,
            align: "center",
            width: actionsColumnWidth,
            mobileLabel: "Actions",
          } satisfies ReusableTableColumn<T>,
        ]
      : baseColumns;
  const inlineActionColumnIndex = shouldRenderInlineActionMenu
    ? getInlineActionColumnIndex(displayColumns)
    : -1;
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
  const resolvedTotalEntries =
    manualPagination && typeof totalEntries === "number" && Number.isFinite(totalEntries)
      ? Math.max(0, Math.floor(totalEntries))
      : sortedRows.length;
  const totalPages = paginated ? Math.max(1, Math.ceil(resolvedTotalEntries / effectivePageSize)) : 1;
  const requestedCurrentPage = Math.max(
    1,
    isCurrentPageControlled ? (currentPage ?? defaultCurrentPage) : internalCurrentPage,
  );
  const effectiveCurrentPage = Math.min(requestedCurrentPage, totalPages);
  const pageStartIndex = paginated ? (effectiveCurrentPage - 1) * effectivePageSize : 0;
  const paginatedRows = paginated
    ? manualPagination
      ? sortedRows
      : sortedRows.slice(pageStartIndex, pageStartIndex + effectivePageSize)
    : sortedRows;
  const pageStart = resolvedTotalEntries === 0 ? 0 : Math.min(pageStartIndex + 1, resolvedTotalEntries);
  const pageEnd = paginated
    ? Math.min(pageStartIndex + paginatedRows.length, resolvedTotalEntries)
    : resolvedTotalEntries;
  const pageList = useMemo(
    () => (paginated ? buildPageList(totalPages, effectiveCurrentPage) : []),
    [effectiveCurrentPage, paginated, totalPages],
  );
  const normalizedPageSizeOptions = useMemo(() => {
    const set = new Set<number>([...pageSizeOptions, effectivePageSize].filter((option) => option > 0));
    return Array.from(set).sort((left, right) => left - right);
  }, [effectivePageSize, pageSizeOptions]);
  const showToolbar = Boolean(title || toolbarContent || searchable || onCreate);
  const renderedRowCount = Math.max(1, paginatedRows.length);
  const compactViewportRowThreshold = paginated ? effectivePageSize : 8;
  const shouldUseCompactViewport =
    fullViewHeight && renderedRowCount < compactViewportRowThreshold;
  const resolvedTableMaxHeight = fullViewHeight
    ? "none"
    : tableMaxHeight ?? DEFAULT_TABLE_MAX_HEIGHT;
  const enableRowReorder = reorderableRows && typeof onRowReorder === "function";

  useEffect(() => {
    if (openActionMenuKey === null) {
      return;
    }

    const isVisible = paginatedRows.some(
      (row, index) => resolveRowKey(row, index, rowKey) === openActionMenuKey,
    );

    if (!isVisible) {
      setOpenActionMenuKey(null);
    }
  }, [openActionMenuKey, paginatedRows, rowKey]);

  useEffect(() => {
    if (openActionMenuKey === null) {
      return;
    }

    const handlePointerDown = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-erp-actions-root="true"]')) {
        return;
      }
      setOpenActionMenuKey(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenActionMenuKey(null);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [openActionMenuKey]);

  useEffect(() => {
    if (draggingRowKey === null && dropTarget === null) {
      return;
    }

    const isDraggingRowVisible =
      draggingRowKey === null ||
      paginatedRows.some((row, index) => resolveRowKey(row, index, rowKey) === draggingRowKey);
    const isDropTargetVisible =
      dropTarget === null ||
      paginatedRows.some((row, index) => resolveRowKey(row, index, rowKey) === dropTarget.key);

    if (!isDraggingRowVisible) {
      setDraggingRowKey(null);
    }

    if (!isDropTargetVisible) {
      setDropTarget(null);
    }
  }, [draggingRowKey, dropTarget, paginatedRows, rowKey]);

  useEffect(() => {
    if (!paginated) {
      return;
    }

    const handlePaginationKeydown = (event: KeyboardEvent) => {
      // Only handle pagination shortcuts when not typing in an input
      const target = event.target as HTMLElement;
      const isInputElement =
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement;

      if (isInputElement && event.key !== "Escape") {
        return;
      }

      switch (event.key) {
        case "ArrowLeft":
          if (!isInputElement) {
            event.preventDefault();
            setPage(Math.max(1, effectiveCurrentPage - 1));
          }
          break;
        case "ArrowRight":
          if (!isInputElement) {
            event.preventDefault();
            setPage(Math.min(totalPages, effectiveCurrentPage + 1));
          }
          break;
        case "Home":
          if (!isInputElement) {
            event.preventDefault();
            setPage(1);
          }
          break;
        case "End":
          if (!isInputElement) {
            event.preventDefault();
            setPage(totalPages);
          }
          break;
      }
    };

    window.addEventListener("keydown", handlePaginationKeydown);

    return () => {
      window.removeEventListener("keydown", handlePaginationKeydown);
    };
  }, [paginated, effectiveCurrentPage, totalPages]);

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
    setOpenActionMenuKey(null);
    handler?.(row, rowIndex);
  };
  const handleActionMenuToggle = (event: MouseEvent<HTMLButtonElement>, rowActionKey: Key) => {
    event.stopPropagation();
    const willOpen = openActionMenuKey !== rowActionKey;
    if (!willOpen) {
      setOpenActionMenuKey(null);
      return;
    }

    setOpenActionMenuPlacement(resolveActionMenuPlacement(event.currentTarget));
    setOpenActionMenuKey(rowActionKey);
  };
  const clearRowReorderState = () => {
    setDraggingRowKey(null);
    setDropTarget(null);
  };
  const getRowReorderEdge = (
    event: ReactDragEvent<HTMLTableRowElement>,
  ): ReusableTableRowReorderEdge => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY - bounds.top <= bounds.height / 2 ? "before" : "after";
  };
  const handleRowDragStart = (
    event: ReactDragEvent<HTMLTableRowElement>,
    resolvedKey: Key,
  ) => {
    if (!enableRowReorder) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (!target?.closest('[data-erp-row-drag-handle="true"]')) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(resolvedKey));
    setDraggingRowKey(resolvedKey);
    setDropTarget(null);
  };
  const handleRowDragOver = (
    event: ReactDragEvent<HTMLTableRowElement>,
    resolvedKey: Key,
  ) => {
    if (!enableRowReorder || draggingRowKey === null) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    if (resolvedKey === draggingRowKey) {
      setDropTarget(null);
      return;
    }

    const nextEdge = getRowReorderEdge(event);
    setDropTarget((current) =>
      current?.key === resolvedKey && current.edge === nextEdge
        ? current
        : { key: resolvedKey, edge: nextEdge },
    );
  };
  const handleRowDragLeave = (
    event: ReactDragEvent<HTMLTableRowElement>,
    resolvedKey: Key,
  ) => {
    if (!enableRowReorder) {
      return;
    }

    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
      return;
    }

    setDropTarget((current) => (current?.key === resolvedKey ? null : current));
  };
  const handleRowDrop = (
    event: ReactDragEvent<HTMLTableRowElement>,
    targetRow: T,
    targetIndex: number,
  ) => {
    if (!enableRowReorder || draggingRowKey === null) {
      return;
    }

    event.preventDefault();

    const sourceIndex = paginatedRows.findIndex(
      (row, rowIndex) => resolveRowKey(row, rowIndex, rowKey) === draggingRowKey,
    );
    const sourceRow = sourceIndex >= 0 ? paginatedRows[sourceIndex] : null;
    const edge = getRowReorderEdge(event);

    clearRowReorderState();

    if (!sourceRow || sourceIndex < 0 || sourceIndex === targetIndex) {
      return;
    }

    const targetIndexAfterRemoval = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    const insertionIndex = edge === "before" ? targetIndexAfterRemoval : targetIndexAfterRemoval + 1;

    if (insertionIndex === sourceIndex) {
      return;
    }

    onRowReorder(sourceRow, sourceIndex, targetRow, targetIndex, edge);
  };
  const renderActionMenu = (
    row: T,
    rowIndex: number,
    resolvedKey: Key,
    viewDisabled: boolean,
    updateDisabled: boolean,
    duplicateDisabled: boolean,
    deleteDisabled: boolean,
    logsDisabled: boolean,
  ): ReactNode => (
    <div className={styles.actionsMenuRoot} data-erp-actions-root="true">
      <button
        type="button"
        className={styles.actionsTrigger}
        aria-label="Open row actions"
        aria-haspopup="menu"
        aria-expanded={openActionMenuKey === resolvedKey}
        onClick={(event) => handleActionMenuToggle(event, resolvedKey)}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <FiMoreVertical className={styles.actionsTriggerIcon} aria-hidden="true" />
      </button>
      {openActionMenuKey === resolvedKey ? (
        <div
          className={cx(
            styles.actionsDropdown,
            openActionMenuPlacement.vertical === "up" && styles.actionsDropdownUp,
            openActionMenuPlacement.horizontal === "left" && styles.actionsDropdownLeft,
          )}
          role="menu"
          aria-label="Row actions"
        >
          {resolvedOnUpdate ? (
            <button
              type="button"
              role="menuitem"
              className={styles.actionsDropdownItem}
              onClick={(event) => handleActionClick(event, resolvedOnUpdate, row, rowIndex)}
              disabled={updateDisabled}
            >
              <ActionIcon type="update" />
              <span>{resolvedUpdateLabel}</span>
            </button>
          ) : null}
          {onDuplicate ? (
            <button
              type="button"
              role="menuitem"
              className={styles.actionsDropdownItem}
              onClick={(event) => handleActionClick(event, onDuplicate, row, rowIndex)}
              disabled={duplicateDisabled}
            >
              <ActionIcon type="duplicate" />
              <span>{duplicateLabel}</span>
            </button>
          ) : null}
          {onView ? (
            <button
              type="button"
              role="menuitem"
              className={styles.actionsDropdownItem}
              onClick={(event) => handleActionClick(event, onView, row, rowIndex)}
              disabled={viewDisabled}
            >
              <ActionIcon type="view" />
              <span>{viewLabel}</span>
            </button>
          ) : null}
          {onLogs ? (
            <button
              type="button"
              role="menuitem"
              className={styles.actionsDropdownItem}
              onClick={(event) => handleActionClick(event, onLogs, row, rowIndex)}
              disabled={logsDisabled}
            >
              <ActionIcon type="logs" />
              <span>{logsLabel}</span>
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              role="menuitem"
              className={cx(styles.actionsDropdownItem, styles.actionsDropdownDelete)}
              onClick={(event) => handleActionClick(event, onDelete, row, rowIndex)}
              disabled={deleteDisabled}
            >
              <ActionIcon type="delete" />
              <span>{deleteLabel}</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
  return (
    <div
      className={cx(styles.tableShell, wrapperClassName)}
      style={
        {
          "--erp-table-shell-height": fullViewHeight ? "100vh" : "100%",
          "--erp-table-shell-min-height": fullViewHeight ? "100vh" : "0px",
        } as CSSProperties
      }
    >
      {showToolbar ? (
        <div className={styles.toolbar}>
          {title ? <h3 className={styles.toolbarTitle}>{title}</h3> : null}
          {toolbarContent ? <div className={styles.toolbarContent}>{toolbarContent}</div> : null}
          {searchable || onCreate ? (
            <div className={styles.tableTools}>
              {searchable ? (
                <div className={styles.searchField}>
                  <FiSearch className={styles.searchIcon} aria-hidden="true" />
                  <input
                    type="text"
                    autoComplete="off"
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
        data-erp-table-viewport="true"
        style={
          {
            "--erp-table-max-height": resolvedTableMaxHeight,
            "--erp-table-viewport-flex": shouldUseCompactViewport ? "0 1 auto" : "1 1 auto",
          } as CSSProperties
        }
      >
        <table
          className={cx(styles.table, tableClassName)}
          style={{ "--erp-table-min-width": minWidth } as CSSProperties}
        >
          <colgroup>
            {displayColumns.map((column) => {
              const widthStyle = resolveColumnWidth(column);
              return <col key={column.key} style={widthStyle} />;
            })}
          </colgroup>
          <thead className={styles.head}>
            <tr>
              {displayColumns.map((column) => {
                const canSort = isColumnSortable(column, sortable);
                const sortDirection =
                  effectiveSortState.key === column.key ? effectiveSortState.direction : null;
                const headerContent = renderColumnHeaderContent(column.header);
                const widthStyle = resolveColumnWidth(column);
                return (
                  <th
                    key={column.key}
                    style={
                      column.headerStyle || widthStyle
                        ? {
                            ...(column.headerStyle ?? {}),
                            ...(widthStyle ?? {}),
                          }
                        : undefined
                    }
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
                        {headerContent}
                        <span className={styles.sortIndicator}>
                          {sortDirection === "asc" ? "▲" : sortDirection === "desc" ? "▼" : "↕"}
                        </span>
                      </button>
                    ) : (
                      headerContent
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
                      draggingRowKey === resolvedKey && styles.rowDragging,
                      dropTarget?.key === resolvedKey &&
                        dropTarget.edge === "before" &&
                        styles.rowDropBefore,
                      dropTarget?.key === resolvedKey &&
                        dropTarget.edge === "after" &&
                        styles.rowDropAfter,
                      (isActiveByIndex || isActiveByKey) && styles.activeRow,
                      onRowClick && styles.rowClickable,
                      rowClassName?.(row, rowIndex),
                    )}
                    onClick={onRowClick ? () => onRowClick(row, rowIndex) : undefined}
                    onDragStart={
                      enableRowReorder
                        ? (event) => handleRowDragStart(event, resolvedKey)
                        : undefined
                    }
                    onDragOver={
                      enableRowReorder
                        ? (event) => handleRowDragOver(event, resolvedKey)
                        : undefined
                    }
                    onDragLeave={
                      enableRowReorder
                        ? (event) => handleRowDragLeave(event, resolvedKey)
                        : undefined
                    }
                    onDrop={
                      enableRowReorder
                        ? (event) => handleRowDrop(event, row, rowIndex)
                        : undefined
                    }
                    onDragEnd={enableRowReorder ? clearRowReorderState : undefined}
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
                    {displayColumns.map((column, columnIndex) => {
                      const shouldRenderActions = isActionsColumn(column) && !column.render;
                      const viewDisabled = !onView || isViewDisabled?.(row, rowIndex) === true;
                      const updateDisabled =
                        !resolvedOnUpdate || resolvedIsUpdateDisabled?.(row, rowIndex) === true;
                      const duplicateDisabled =
                        !onDuplicate || isDuplicateDisabled?.(row, rowIndex) === true;
                      const deleteDisabled = !onDelete || isDeleteDisabled?.(row, rowIndex) === true;
                      const logsDisabled = !onLogs || isLogsDisabled?.(row, rowIndex) === true;
                      const resolvedCellStyle =
                        typeof column.cellStyle === "function"
                          ? column.cellStyle(row, rowIndex)
                          : column.cellStyle;
                      const widthStyle = resolveColumnWidth(column);

                      return (
                        <td
                          key={column.key}
                          data-label={getCellLabel(column.header, column.key, column.mobileLabel)}
                          style={
                            resolvedCellStyle || widthStyle
                              ? {
                                  ...(resolvedCellStyle ?? {}),
                                  ...(widthStyle ?? {}),
                                }
                              : undefined
                          }
                          className={cx(
                            styles.cell,
                            getColumnAlignClass(column.align),
                            shouldRenderActions && styles.actionsCell,
                            shouldRenderInlineActionMenu &&
                              columnIndex === inlineActionColumnIndex &&
                              styles.leadingActionsCell,
                            typeof column.cellClassName === "function"
                              ? column.cellClassName(row, rowIndex)
                              : column.cellClassName,
                          )}
                        >
                          {shouldRenderActions ? (
                            hasRowActions ? (
                              <div className={styles.actionsGroup}>
                                {renderActionMenu(
                                  row,
                                  rowIndex,
                                  resolvedKey,
                                  viewDisabled,
                                  updateDisabled,
                                  duplicateDisabled,
                                  deleteDisabled,
                                  logsDisabled,
                                )}
                              </div>
                            ) : (
                              "-"
                            )
                          ) : (
                            <>
                              {shouldRenderInlineActionMenu &&
                              columnIndex === inlineActionColumnIndex ? (
                                <div className={styles.leadingActionsRow}>
                                  {renderActionMenu(
                                    row,
                                    rowIndex,
                                    resolvedKey,
                                    viewDisabled,
                                    updateDisabled,
                                    duplicateDisabled,
                                    deleteDisabled,
                                    logsDisabled,
                                  )}
                                  <div className={styles.leadingActionsValue}>
                                    {getCellContent(row, column, rowIndex)}
                                  </div>
                                </div>
                              ) : (
                                getCellContent(row, column, rowIndex)
                              )}
                            </>
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
              {paginationLabel} {pageStart} to {pageEnd} of {resolvedTotalEntries} entries
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
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setPage(effectiveCurrentPage - 1);
                }
              }}
              disabled={effectiveCurrentPage <= 1}
              aria-label="Go to previous page"
              title="Previous page (Alt+Left)"
            >
              <FiChevronLeft className={styles.paginationArrowIcon} aria-hidden="true" />
              <span className={styles.srOnly}>Previous</span>
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
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setPage(page);
                    }
                  }}
                  title={`Go to page ${page}`}
                >
                  {page}
                </button>
              ),
            )}
            <button
              type="button"
              className={styles.paginationButton}
              onClick={() => setPage(effectiveCurrentPage + 1)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setPage(effectiveCurrentPage + 1);
                }
              }}
              disabled={effectiveCurrentPage >= totalPages}
              aria-label="Go to next page"
              title="Next page (Alt+Right)"
            >
              <FiChevronRight className={styles.paginationArrowIcon} aria-hidden="true" />
              <span className={styles.srOnly}>Next</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
export default ReusableTable;
