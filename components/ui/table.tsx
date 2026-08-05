"use client";
import {
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type Key,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useAutoFitPageSize } from "@/hooks/useAutoFitPageSize";
import {
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
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
export type {
  ReusableTableBodyContextMenuPayload,
  ReusableTableColumn,
  ReusableTableColumnReorderEdge,
  ReusableTableColumnResizeEndPayload,
  ReusableTableProps,
  ReusableTableRowReorderEdge,
  ReusableTableSortDirection,
  ReusableTableSortState,
  RowActionDisabledResolver,
  RowActionHandler,
  RowKeyResolver,
} from "./table.types";
import type {
  ReusableTableBodyContextMenuPayload,
  ReusableTableColumn,
  ReusableTableColumnReorderEdge,
  ReusableTableColumnResizeEndPayload,
  ReusableTableProps,
  ReusableTableRowReorderEdge,
  ReusableTableSortDirection,
  ReusableTableSortState,
  RowActionDisabledResolver,
  RowActionHandler,
  RowKeyResolver,
} from "./table.types";

type ActionMenuPlacement = {
  vertical: "down" | "up";
  horizontal: "right" | "left";
};
type ActionMenuPosition = Pick<CSSProperties, "top" | "left" | "right" | "bottom">;
function cx(...tokens: Array<string | undefined | false>): string {
  return tokens.filter(Boolean).join(" ");
}
const ACTION_MENU_ESTIMATED_WIDTH = 190;
const ACTION_MENU_ESTIMATED_HEIGHT = 260;
const ACTION_MENU_GAP = 8;
const ACTION_MENU_VIEWPORT_PADDING = 8;
const DEFAULT_TABLE_MAX_HEIGHT = "calc(100dvh - 250px)";
const SERIAL_NUMBER_COLUMN_WIDTH = "48px";
const FIXED_ACTIONS_COLUMN_WIDTH = "200px";
const MIN_DATA_COLUMN_WIDTH = 100;
const MIN_RESIZABLE_COLUMN_WIDTH = 40;
const PERCENT_COLUMN_WIDTH_PIXEL_FACTOR = 8;
const DEFAULT_ACTION_MENU_PLACEMENT: ActionMenuPlacement = {
  vertical: "down",
  horizontal: "right",
};
const DEFAULT_ACTION_MENU_POSITION: ActionMenuPosition = {};
function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
function resolveActionMenuGeometry(trigger: HTMLElement): {
  placement: ActionMenuPlacement;
  position: ActionMenuPosition;
} {
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
  const maxLeft = window.innerWidth - ACTION_MENU_ESTIMATED_WIDTH - ACTION_MENU_VIEWPORT_PADDING;
  const left =
    horizontal === "left"
      ? triggerRect.left - ACTION_MENU_ESTIMATED_WIDTH - ACTION_MENU_GAP
      : triggerRect.right + ACTION_MENU_GAP;
  const top =
    vertical === "up"
      ? triggerRect.bottom - ACTION_MENU_ESTIMATED_HEIGHT + 4
      : triggerRect.top - 4;
  const maxMenuHeight = Math.min(
    ACTION_MENU_ESTIMATED_HEIGHT,
    window.innerHeight - ACTION_MENU_VIEWPORT_PADDING * 2,
  );
  return {
    placement: { vertical, horizontal },
    position: {
      left: clamp(left, ACTION_MENU_VIEWPORT_PADDING, maxLeft),
      top: clamp(
        top,
        ACTION_MENU_VIEWPORT_PADDING,
        window.innerHeight - maxMenuHeight - ACTION_MENU_VIEWPORT_PADDING,
      ),
    },
  };
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
    return {
      width: SERIAL_NUMBER_COLUMN_WIDTH,
      minWidth: SERIAL_NUMBER_COLUMN_WIDTH,
      maxWidth: SERIAL_NUMBER_COLUMN_WIDTH,
      boxSizing: "border-box",
      paddingInline: 0,
      overflow: "hidden",
      whiteSpace: "nowrap",
    };
  }
  if (isActionsColumn(column)) {
    const actionsWidth = normalizedWidth || FIXED_ACTIONS_COLUMN_WIDTH;
    return {
      width: actionsWidth,
      minWidth: actionsWidth,
      maxWidth: actionsWidth,
      boxSizing: "border-box",
      paddingInline: 0,
      overflow: "visible",
    };
  }
  if (!normalizedWidth) {
    return undefined;
  }
  const percentWidth = normalizedWidth.match(/^(\d+(?:\.\d+)?)%$/);
  if (percentWidth) {
    const width = `${Math.max(
      MIN_DATA_COLUMN_WIDTH,
      Math.round(Number(percentWidth[1]) * PERCENT_COLUMN_WIDTH_PIXEL_FACTOR),
    )}px`;
    return { width, minWidth: width };
  }
  return { width: normalizedWidth };
}
function resolveColumnPixelWidth<T extends Record<string, unknown>>(
  column: ReusableTableColumn<T>,
): number {
  if (isSerialNumberColumn(column)) {
    return Number.parseFloat(SERIAL_NUMBER_COLUMN_WIDTH);
  }
  if (isActionsColumn(column)) {
    return Number.parseFloat(FIXED_ACTIONS_COLUMN_WIDTH);
  }
  const normalizedWidth = column.width?.trim();
  const pixelWidth = normalizedWidth?.match(/^(\d+(?:\.\d+)?)px$/i);
  if (pixelWidth) {
    return Math.max(Number(pixelWidth[1]), MIN_RESIZABLE_COLUMN_WIDTH);
  }
  const percentWidth = normalizedWidth?.match(/^(\d+(?:\.\d+)?)%$/);
  if (percentWidth) {
    return Math.max(
      MIN_DATA_COLUMN_WIDTH,
      Math.round(Number(percentWidth[1]) * PERCENT_COLUMN_WIDTH_PIXEL_FACTOR),
    );
  }
  return MIN_DATA_COLUMN_WIDTH;
}
function resolveMinimumTableWidth<T extends Record<string, unknown>>(
  columns: ReusableTableColumn<T>[],
): number {
  return columns.reduce((total, column) => total + resolveColumnPixelWidth(column), 0);
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
function isColumnReorderable<T extends Record<string, unknown>>(
  column: ReusableTableColumn<T>,
): boolean {
  return !isActionsColumn(column) && !isSerialNumberColumn(column);
}
function applyColumnOrder<T extends Record<string, unknown>>(
  columns: ReusableTableColumn<T>[],
  columnOrder: string[],
): ReusableTableColumn<T>[] {
  const actionColumns = columns.filter(isActionsColumn);
  const nonActionColumns = columns.filter((column) => !isActionsColumn(column));
  if (columnOrder.length === 0) {
    return [...nonActionColumns, ...actionColumns];
  }
  const orderIndexByKey = new Map(columnOrder.map((key, index) => [key, index]));
  const reorderableColumns = nonActionColumns.filter(isColumnReorderable);
  const orderedReorderableColumns = [...reorderableColumns].sort((left, right) => {
    const leftIndex = orderIndexByKey.get(left.key);
    const rightIndex = orderIndexByKey.get(right.key);
    if (leftIndex === undefined && rightIndex === undefined) {
      return 0;
    }
    if (leftIndex === undefined) {
      return 1;
    }
    if (rightIndex === undefined) {
      return -1;
    }
    return leftIndex - rightIndex;
  });
  let nextReorderableIndex = 0;
  const orderedNonActionColumns = nonActionColumns.map((column) => {
    if (!isColumnReorderable(column)) {
      return column;
    }
    const nextColumn = orderedReorderableColumns[nextReorderableIndex];
    nextReorderableIndex += 1;
    return nextColumn ?? column;
  });
  return [...orderedNonActionColumns, ...actionColumns];
}
export function ReusableTable<T extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  title,
  toolbarContent,
  toolbarActions,
  fullViewHeight = true,
  minWidth = "min(980px, 100%)",
  activeRowIndex,
  activeRowKey,
  rowClassName,
  onRowClick,
  onRowDoubleClick,
  reorderableRows = false,
  onRowReorder,
  reorderableColumns = false,
  onColumnReorder,
  resizableColumns = false,
  onColumnResizeEnd,
  onBodyContextMenu,
  onWrapperContextMenu,
  wrapperClassName,
  tableClassName,
  tableLayout,
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
  autoPageSize = true,
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
  const [openActionMenuPosition, setOpenActionMenuPosition] = useState<ActionMenuPosition>(
    DEFAULT_ACTION_MENU_POSITION,
  );
  const [draggingRowKey, setDraggingRowKey] = useState<Key | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    key: Key;
    edge: ReusableTableRowReorderEdge;
  } | null>(null);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [draggingColumnKey, setDraggingColumnKey] = useState<string | null>(null);
  const [columnDropTarget, setColumnDropTarget] = useState<{
    key: string;
    edge: ReusableTableColumnReorderEdge;
  } | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, string>>({});
  const [tableWidthOverride, setTableWidthOverride] = useState<number | null>(null);
  const activeResizeTableWidthRef = useRef<{
    startTableWidth: number;
    startColumnWidth: number;
  } | null>(null);
  const resolvedOnUpdate = onUpdate ?? onEdit;
  const resolvedIsUpdateDisabled = isUpdateDisabled ?? isEditDisabled;
  const resolvedUpdateLabel = updateLabel ?? editLabel ?? "Edit";
  const hasRowActions = Boolean(resolvedOnUpdate || onDuplicate || onDelete || onLogs);
  const actionColumns = columns.filter((column) => isActionsColumn(column));
  const hasActionsColumn = actionColumns.length > 0;
  const shouldRenderInlineActionMenu = false;
  const baseColumns = shouldRenderInlineActionMenu
    ? columns.filter((column) => !isActionsColumn(column))
    : columns.filter((column) => !isActionsColumn(column));
  const effectiveSearchQuery = isSearchControlled ? searchQuery : internalSearchQuery;
  const effectiveSortState = isSortControlled ? sortState : internalSortState;
  const autoFitEnabled = paginated && autoPageSize;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLTableSectionElement | null>(null);
  const bodyRef = useRef<HTMLTableSectionElement | null>(null);
  const { autoPageSize: autoFitPageSize, remeasure: remeasureAutoPageSize } =
    useAutoFitPageSize({
      enabled: autoFitEnabled,
      viewportRef,
      headerRef: headRef,
      bodyRef,
      isDataRow: (row) => !row.cells[0]?.classList.contains(styles.emptyCell),
    });
  const effectivePageSize = Math.max(
    1,
    autoFitEnabled && autoFitPageSize !== null
      ? autoFitPageSize
      : isPageSizeControlled
        ? (pageSize ?? defaultPageSize)
        : internalPageSize,
  );
  const shouldIncludeActionsColumn = showActionsColumn ?? Boolean(hasActionsColumn || hasRowActions);
  const rawDisplayColumns =
    shouldIncludeActionsColumn && !shouldRenderInlineActionMenu
      ? [
          ...baseColumns,
          hasActionsColumn
            ? actionColumns[0]
            : ({
                key: "actions",
                header: actionsHeader,
                align: "center",
                width: actionsColumnWidth,
                mobileLabel: "Actions",
              } satisfies ReusableTableColumn<T>),
        ]
      : baseColumns;
  const displayColumns = useMemo(
    () => applyColumnOrder(rawDisplayColumns, columnOrder),
    [columnOrder, rawDisplayColumns],
  );
  const displayColumnSignature = useMemo(
    () => displayColumns.map((column) => column.key).join("\u001f"),
    [displayColumns],
  );
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
  const showToolbar = Boolean(title || toolbarContent || searchable || onCreate || toolbarActions);
  const renderedRowCount = Math.max(1, paginatedRows.length);
  const compactViewportRowThreshold = paginated ? effectivePageSize : 8;
  // Auto-fit needs the viewport to keep claiming the full leftover height even
  // when few rows are rendered, otherwise the measurement collapses to the
  // current row count and locks the page size small.
  const shouldUseCompactViewport =
    fullViewHeight && !autoFitEnabled && renderedRowCount < compactViewportRowThreshold;
  const resolvedTableMaxHeight = fullViewHeight
    ? "none"
    : tableMaxHeight ?? (autoFitEnabled ? "none" : DEFAULT_TABLE_MAX_HEIGHT);
  // Report the fitted page size so server-driven callers refetch with it as
  // the request limit. Layout effect: it must land before the caller's
  // initial-fetch effect fires, so the first request already uses the fitted
  // limit instead of the hardcoded default.
  const onPageSizeChangeRef = useRef(onPageSizeChange);
  onPageSizeChangeRef.current = onPageSizeChange;
  const notifiedAutoPageSizeRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!autoFitEnabled || autoFitPageSize === null) {
      return;
    }
    if (notifiedAutoPageSizeRef.current === autoFitPageSize) {
      return;
    }
    notifiedAutoPageSizeRef.current = autoFitPageSize;
    if (!isPageSizeControlled) {
      setInternalPageSize(autoFitPageSize);
    }
    onPageSizeChangeRef.current?.(autoFitPageSize);
  }, [autoFitEnabled, autoFitPageSize, isPageSizeControlled]);
  // Re-measure when the rendered rows change (first data arrival replaces the
  // estimated row height with a sampled one) and when the column layout
  // changes (width/order changes can rewrap text and change row height).
  useLayoutEffect(() => {
    remeasureAutoPageSize();
  }, [paginatedRows, remeasureAutoPageSize]);
  useLayoutEffect(() => {
    remeasureAutoPageSize({ invalidateRowHeight: true });
  }, [columnWidths, displayColumnSignature, remeasureAutoPageSize, tableWidthOverride]);
  const enableRowReorder = reorderableRows && typeof onRowReorder === "function";
  const enableColumnReorder = reorderableColumns && displayColumns.some(isColumnReorderable);
  const enableColumnResize = resizableColumns && displayColumns.some(isColumnReorderable);
  const displayColumnsWithWidths = displayColumns.map((column) => {
    if (isSerialNumberColumn(column)) {
      return { ...column, width: SERIAL_NUMBER_COLUMN_WIDTH };
    }
    const resizedWidth = columnWidths[column.key];
    return resizedWidth ? { ...column, width: resizedWidth } : column;
  });
  const fixedColumnWidth = displayColumnsWithWidths.reduce(
    (total, column) =>
      isSerialNumberColumn(column) || isActionsColumn(column)
        ? total + resolveColumnPixelWidth(column)
        : total,
    0,
  );
  const dataColumns = displayColumnsWithWidths.filter(
    (column) => !isSerialNumberColumn(column) && !isActionsColumn(column),
  );
  const configuredTableWidth = resolveMinimumTableWidth(displayColumnsWithWidths);
  const fallbackMinWidthMatch = minWidth.trim().match(/^(\d+(?:\.\d+)?)px$/i);
  const fallbackTableWidth = fallbackMinWidthMatch
    ? Number(fallbackMinWidthMatch[1])
    : configuredTableWidth;
  const extraDataWidth = Math.max(0, fallbackTableWidth - configuredTableWidth);
  const extraDataWidthPerColumn =
    dataColumns.length > 0 ? extraDataWidth / dataColumns.length : 0;
  const expandedDataColumnKeys =
    extraDataWidthPerColumn > 0
      ? new Set(dataColumns.map((column) => column.key))
      : null;
  const displayColumnsForRender = displayColumnsWithWidths.map((column) => {
    // Expanded data column: add the distributed extra width.
    if (expandedDataColumnKeys?.has(column.key)) {
      return {
        ...column,
        width: `${resolveColumnPixelWidth(column) + extraDataWidthPerColumn}px`,
      };
    }
    // Data column with no explicit width: pin it to its pixel baseline.
    // Without an explicit <col> width, table-layout:fixed hands all remaining
    // table space to the last such column, making it appear "full width".
    if (!column.width && !isSerialNumberColumn(column) && !isActionsColumn(column)) {
      return { ...column, width: `${resolveColumnPixelWidth(column)}px` };
    }
    return column;
  });
  const hasRenderableColumns = displayColumnsForRender.length > 0;
  const minimumTableWidth = fixedColumnWidth + dataColumns.reduce(
    (total, column) =>
      total +
      resolveColumnPixelWidth(column) +
      (expandedDataColumnKeys?.has(column.key) ? extraDataWidthPerColumn : 0),
    0,
  );
  const resolvedTableWidth = `${Math.max(minimumTableWidth, tableWidthOverride ?? 0)}px`;

  useEffect(() => {
    setTableWidthOverride(null);
    activeResizeTableWidthRef.current = null;
  }, [displayColumnSignature]);

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
      if (event.defaultPrevented) {
        return;
      }

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
    if (openActionMenuKey === null) {
      return;
    }

    const closeActionMenu = () => setOpenActionMenuKey(null);

    window.addEventListener("resize", closeActionMenu);
    window.addEventListener("scroll", closeActionMenu, true);

    return () => {
      window.removeEventListener("resize", closeActionMenu);
      window.removeEventListener("scroll", closeActionMenu, true);
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
    const currentKeys = new Set(rawDisplayColumns.map((column) => column.key));
    setColumnOrder((current) => {
      const nextOrder = current.filter((key) => currentKeys.has(key));
      const nextOrderSet = new Set(nextOrder);

      for (const column of rawDisplayColumns) {
        if (isColumnReorderable(column) && !nextOrderSet.has(column.key)) {
          nextOrder.push(column.key);
        }
      }

      if (
        nextOrder.length === current.length &&
        nextOrder.every((key, index) => key === current[index])
      ) {
        return current;
      }

      return nextOrder;
    });

    if (draggingColumnKey !== null && !currentKeys.has(draggingColumnKey)) {
      setDraggingColumnKey(null);
    }

    if (columnDropTarget !== null && !currentKeys.has(columnDropTarget.key)) {
      setColumnDropTarget(null);
    }

    setColumnWidths((current) => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [key, value] of Object.entries(current)) {
        if (currentKeys.has(key)) {
          next[key] = value;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [columnDropTarget, draggingColumnKey, rawDisplayColumns]);

  useEffect(() => {
    if (!paginated) {
      return;
    }

    const handlePaginationKeydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

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

    const { placement, position } = resolveActionMenuGeometry(event.currentTarget);
    setOpenActionMenuPlacement(placement);
    setOpenActionMenuPosition(position);
    setOpenActionMenuKey(rowActionKey);
  };
  const clearRowReorderState = () => {
    setDraggingRowKey(null);
    setDropTarget(null);
  };
  const clearColumnReorderState = () => {
    setDraggingColumnKey(null);
    setColumnDropTarget(null);
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
  const getColumnReorderEdge = (
    event: ReactDragEvent<HTMLTableCellElement>,
  ): ReusableTableColumnReorderEdge => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX - bounds.left <= bounds.width / 2 ? "before" : "after";
  };
  const handleColumnDragStart = (
    event: ReactDragEvent<HTMLTableCellElement>,
    column: ReusableTableColumn<T>,
  ) => {
    if (!enableColumnReorder || !isColumnReorderable(column)) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", column.key);
    setDraggingColumnKey(column.key);
    setColumnDropTarget(null);
  };
  const handleColumnDragOver = (
    event: ReactDragEvent<HTMLTableCellElement>,
    column: ReusableTableColumn<T>,
  ) => {
    if (!enableColumnReorder || draggingColumnKey === null || !isColumnReorderable(column)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    if (column.key === draggingColumnKey) {
      setColumnDropTarget(null);
      return;
    }

    const nextEdge = getColumnReorderEdge(event);
    setColumnDropTarget((current) =>
      current?.key === column.key && current.edge === nextEdge
        ? current
        : { key: column.key, edge: nextEdge },
    );
  };
  const handleColumnDragLeave = (
    event: ReactDragEvent<HTMLTableCellElement>,
    column: ReusableTableColumn<T>,
  ) => {
    if (!enableColumnReorder) {
      return;
    }

    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
      return;
    }

    setColumnDropTarget((current) => (current?.key === column.key ? null : current));
  };
  const handleColumnDrop = (
    event: ReactDragEvent<HTMLTableCellElement>,
    targetColumn: ReusableTableColumn<T>,
  ) => {
    if (
      !enableColumnReorder ||
      draggingColumnKey === null ||
      !isColumnReorderable(targetColumn)
    ) {
      return;
    }

    event.preventDefault();

    const sourceColumn = displayColumns.find((column) => column.key === draggingColumnKey);
    const edge = getColumnReorderEdge(event);

    clearColumnReorderState();

    if (!sourceColumn || sourceColumn.key === targetColumn.key || !isColumnReorderable(sourceColumn)) {
      return;
    }

    const reorderableKeys = displayColumns.filter(isColumnReorderable).map((column) => column.key);
    const sourceIndex = reorderableKeys.indexOf(sourceColumn.key);
    const targetIndex = reorderableKeys.indexOf(targetColumn.key);

    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    const nextOrder = [...reorderableKeys];
    nextOrder.splice(sourceIndex, 1);
    const targetIndexAfterRemoval = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    const insertionIndex = edge === "before" ? targetIndexAfterRemoval : targetIndexAfterRemoval + 1;

    if (insertionIndex === sourceIndex) {
      return;
    }

    nextOrder.splice(insertionIndex, 0, sourceColumn.key);
    setColumnOrder(nextOrder);
    onColumnReorder?.(applyColumnOrder(rawDisplayColumns, nextOrder));
  };
  const handleColumnResizeStart = (
    event: MouseEvent<HTMLSpanElement>,
    column: ReusableTableColumn<T>,
  ) => {
    if (!enableColumnResize || !isColumnReorderable(column)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const headerRow = event.currentTarget.closest("tr");
    const tableElement = event.currentTarget.closest("table");
    const tableStartWidth = tableElement?.getBoundingClientRect().width ?? 0;

    // Snapshot every resizable column's current rendered pixel width before
    // the drag begins. Without this, the expansion-distribution logic
    // recalculates for all columns on every frame, making columns other than
    // the one being dragged jump around (appearing to resize the wrong column).
    let primaryStartWidth = 120;
    const widthSnapshot: Record<string, string> = {};
    if (headerRow) {
      displayColumnsForRender.forEach((col, idx) => {
        if (!isColumnReorderable(col)) {
          return;
        }
        const th = headerRow.children.item(idx) as HTMLElement | null;
        const w = th ? Math.round(th.getBoundingClientRect().width) : 0;
        if (w > 0) {
          widthSnapshot[col.key] = `${w}px`;
          if (col.key === column.key) {
            primaryStartWidth = w;
          }
        }
      });
      setColumnWidths(widthSnapshot);
    }

    const startX = event.clientX;
    let latestPrimaryWidth = primaryStartWidth;
    activeResizeTableWidthRef.current =
      tableStartWidth > 0
        ? {
            startTableWidth: Math.round(tableStartWidth),
            startColumnWidth: primaryStartWidth,
          }
        : null;

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      latestPrimaryWidth = Math.max(
        MIN_RESIZABLE_COLUMN_WIDTH,
        Math.round(primaryStartWidth + delta),
      );
      setColumnWidths((current) => ({
        ...current,
        [column.key]: `${latestPrimaryWidth}px`,
      }));
      const activeTableResize = activeResizeTableWidthRef.current;
      if (activeTableResize) {
        setTableWidthOverride(
          Math.max(
            0,
            activeTableResize.startTableWidth +
              latestPrimaryWidth -
              activeTableResize.startColumnWidth,
          ),
        );
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      activeResizeTableWidthRef.current = null;
      const tableWidth = tableElement?.getBoundingClientRect().width ?? 0;
      onColumnResizeEnd?.({
        column,
        widthPx: latestPrimaryWidth,
        tableWidthPx: tableWidth,
      });
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };
  const getColumnForWidth = (column: ReusableTableColumn<T>): ReusableTableColumn<T> => {
    const resizedWidth = columnWidths[column.key];
    return resizedWidth ? { ...column, width: resizedWidth } : column;
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
  ): ReactNode => {
    const isActionMenuOpen = openActionMenuKey === resolvedKey;
    const hasDropdownActions = Boolean(onDuplicate || onLogs || onDelete);
    const actionMenu =
      isActionMenuOpen && hasDropdownActions && typeof document !== "undefined" ? (
        <div
          className={cx(
            styles.actionsDropdownPortal,
            openActionMenuPlacement.vertical === "up" && styles.actionsDropdownUp,
            openActionMenuPlacement.horizontal === "left" && styles.actionsDropdownLeft,
          )}
          data-erp-actions-root="true"
          style={openActionMenuPosition}
          role="menu"
          aria-label="Row actions"
        >
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
      ) : null;

    return (
      <div className={styles.actionsMenuRoot} data-erp-actions-root="true">
        {resolvedOnUpdate ? (
          <button
            type="button"
            className={cx(styles.actionButton, styles.iconActionButton, styles.updateButton)}
            aria-label={resolvedUpdateLabel}
            title={resolvedUpdateLabel}
            onClick={(event) => handleActionClick(event, resolvedOnUpdate, row, rowIndex)}
            onMouseDown={(event) => event.stopPropagation()}
            disabled={updateDisabled}
          >
            <ActionIcon type="update" />
          </button>
        ) : null}
        {hasDropdownActions ? (
          <button
            type="button"
            className={styles.actionsTrigger}
            aria-label="Open row actions"
            aria-haspopup="menu"
            aria-expanded={isActionMenuOpen}
            onClick={(event) => handleActionMenuToggle(event, resolvedKey)}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <FiMoreVertical className={styles.actionsTriggerIcon} aria-hidden="true" />
          </button>
        ) : null}
        {actionMenu ? createPortal(actionMenu, document.body) : null}
      </div>
    );
  };
  return (
    <div
      className={cx(styles.tableShell, wrapperClassName)}
      onContextMenu={onWrapperContextMenu}
      style={
        {
          "--erp-table-shell-height": fullViewHeight ? "100vh" : "100%",
          "--erp-table-shell-min-height": fullViewHeight ? "100vh" : "0px",
        } as CSSProperties
      }
    >
      {showToolbar ? (
        <div className={styles.toolbar} data-erp-table-toolbar="true">
          {title ? <h3 className={styles.toolbarTitle}>{title}</h3> : null}
          {toolbarContent ? (
            <div className={styles.toolbarContent} data-erp-table-toolbar-content="true">
              {toolbarContent}
            </div>
          ) : null}
          {searchable || onCreate || toolbarActions ? (
            <div className={styles.tableTools} data-erp-table-tools="true">
              {searchable ? (
                <div className={styles.searchField} data-erp-table-search="true">
                  <FiSearch className={styles.searchIcon} aria-hidden="true" />
                  <input
                    type="text"
                    autoComplete="off"
                    value={effectiveSearchQuery}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={searchPlaceholder}
                    className={styles.searchInput}
                    data-erp-table-search-input="true"
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
                  data-erp-table-create="true"
                >
                  <FiPlus className={styles.createIcon} aria-hidden="true" />
                  <span>{createLabel}</span>
                </button>
              ) : null}
              {toolbarActions}
            </div>
          ) : null}
        </div>
      ) : null}
      <div
        ref={viewportRef}
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
          style={
            {
              "--erp-table-min-width": resolvedTableWidth,
              width: resizableColumns ? resolvedTableWidth : undefined,
              tableLayout: tableLayout ?? (resizableColumns ? "fixed" : undefined),
            } as CSSProperties
          }
        >
          <colgroup>
            {displayColumnsForRender.map((column) => {
              const widthStyle = resolveColumnWidth(column);
              return <col key={column.key} style={widthStyle} />;
            })}
          </colgroup>
          {hasRenderableColumns ? (
            <thead ref={headRef} className={styles.head}>
              <tr>
                {displayColumnsForRender.map((column) => {
                const canSort = isColumnSortable(column, sortable);
                const canReorderColumn = enableColumnReorder && isColumnReorderable(column);
                const canResizeColumn = enableColumnResize && isColumnReorderable(column);
                const isDraggingColumn = draggingColumnKey === column.key;
                const isColumnDropBefore =
                  columnDropTarget?.key === column.key && columnDropTarget.edge === "before";
                const isColumnDropAfter =
                  columnDropTarget?.key === column.key && columnDropTarget.edge === "after";
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
                      isSerialNumberColumn(column) && styles.serialNumberCell,
                      getColumnAlignClass(column.align),
                      canSort && styles.sortableHeaderCell,
                      canReorderColumn && styles.reorderableHeaderCell,
                      isDraggingColumn && styles.columnDragging,
                      isColumnDropBefore && styles.columnDropBefore,
                      isColumnDropAfter && styles.columnDropAfter,
                      stickyHeader && styles.stickyHeaderCell,
                      column.headerClassName,
                    )}
                    draggable={canReorderColumn}
                    onDragStart={
                      canReorderColumn ? (event) => handleColumnDragStart(event, column) : undefined
                    }
                    onDragOver={
                      canReorderColumn ? (event) => handleColumnDragOver(event, column) : undefined
                    }
                    onDragLeave={
                      canReorderColumn ? (event) => handleColumnDragLeave(event, column) : undefined
                    }
                    onDrop={canReorderColumn ? (event) => handleColumnDrop(event, column) : undefined}
                    onDragEnd={canReorderColumn ? clearColumnReorderState : undefined}
                    title={canReorderColumn ? "Drag to reorder column" : undefined}
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
                    {canResizeColumn ? (
                      <>
                        <span
                          className={cx(styles.columnResizeHandle, styles.columnResizeHandleRight)}
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Resize right side of ${getCellLabel(
                            column.header,
                            column.key,
                            column.mobileLabel,
                          )} column`}
                          onMouseDown={(event) => handleColumnResizeStart(event, column)}
                          onClick={(event) => event.stopPropagation()}
                          draggable={false}
                        />
                      </>
                    ) : null}
                  </th>
                );
                })}
              </tr>
            </thead>
          ) : null}
          <tbody ref={bodyRef} className={styles.body}>
            {paginatedRows.length === 0 ? (
              <tr className={cx(styles.row, styles.rowOdd)}>
                <td
                  className={cx(styles.cell, styles.emptyCell)}
                  colSpan={Math.max(1, displayColumns.length)}
                >
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
                      (onRowClick || onRowDoubleClick) && styles.rowClickable,
                      rowClassName?.(row, rowIndex),
                    )}
                    onClick={onRowClick ? () => onRowClick(row, rowIndex) : undefined}
                    onDoubleClick={
                      onRowDoubleClick ? () => onRowDoubleClick(row, rowIndex) : undefined
                    }
                    onContextMenu={
                      onBodyContextMenu
                        ? (event) => onBodyContextMenu({ event, row, rowIndex })
                        : undefined
                    }
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

                            // Only the UNMODIFIED key selects the row. A chord
                            // (Ctrl+Enter, say) belongs to whoever listens for
                            // it further up; swallowing it here would consume
                            // the modifier gesture along with the plain one.
                            if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
                              return;
                            }

                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onRowClick(row, rowIndex);
                            }
                          }
                        : undefined
                    }
                    tabIndex={onRowClick ? 0 : onRowDoubleClick ? 0 : undefined}
                  >
                    {displayColumnsForRender.map((column, columnIndex) => {
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
                            isSerialNumberColumn(column) && styles.serialNumberCell,
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
        <div className={styles.paginationBar} data-erp-table-pagination="true">
          <div className={styles.paginationInfo}>
            <span>
              {paginationLabel} {pageStart} to {pageEnd} of {resolvedTotalEntries} entries
            </span>
            {showPageSizeSelector && !autoFitEnabled ? (
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
              onClick={() => setPage(1)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setPage(1);
                }
              }}
              disabled={effectiveCurrentPage <= 1}
              aria-label="Go to first page"
              title="First page"
            >
              <FiChevronsLeft className={styles.paginationArrowIcon} aria-hidden="true" />
              <span className={styles.srOnly}>First</span>
            </button>
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
              title="Previous page"
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
              title="Next page"
            >
              <FiChevronRight className={styles.paginationArrowIcon} aria-hidden="true" />
              <span className={styles.srOnly}>Next</span>
            </button>
            <button
              type="button"
              className={styles.paginationButton}
              onClick={() => setPage(totalPages)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setPage(totalPages);
                }
              }}
              disabled={effectiveCurrentPage >= totalPages}
              aria-label="Go to last page"
              title="Last page"
            >
              <FiChevronsRight className={styles.paginationArrowIcon} aria-hidden="true" />
              <span className={styles.srOnly}>Last</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
export default ReusableTable;
