import {
  type CSSProperties,
  type Key,
  type MouseEvent,
  type ReactNode,
} from "react";

export type ReusableTableSortDirection = "asc" | "desc";

export type ReusableTableSortState = {
  key: string | null;
  direction: ReusableTableSortDirection;
};

export type ReusableTableRowReorderEdge = "before" | "after";
export type ReusableTableColumnReorderEdge = "before" | "after";

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

export type ReusableTableColumnResizeEndPayload<T extends Record<string, unknown>> = {
  column: ReusableTableColumn<T>;
  widthPx: number;
  tableWidthPx: number;
};

export type ReusableTableBodyContextMenuPayload<T extends Record<string, unknown>> = {
  event: MouseEvent<HTMLTableRowElement>;
  row: T;
  rowIndex: number;
};

export type RowKeyResolver<T> = keyof T | ((row: T, rowIndex: number) => Key);
export type RowActionHandler<T> = (row: T, rowIndex: number) => void;
export type RowActionDisabledResolver<T> = (row: T, rowIndex: number) => boolean;

export type ReusableTableProps<T extends Record<string, unknown>> = {
  columns: ReusableTableColumn<T>[];
  rows: T[];
  rowKey: RowKeyResolver<T>;
  title?: ReactNode;
  toolbarContent?: ReactNode;
  toolbarActions?: ReactNode;
  fullViewHeight?: boolean;
  minWidth?: string;
  activeRowIndex?: number;
  activeRowKey?: Key | null;
  rowClassName?: (row: T, rowIndex: number) => string | undefined;
  onRowClick?: (row: T, rowIndex: number) => void;
  onRowDoubleClick?: (row: T, rowIndex: number) => void;
  reorderableRows?: boolean;
  onRowReorder?: (
    sourceRow: T,
    sourceIndex: number,
    targetRow: T,
    targetIndex: number,
    edge: ReusableTableRowReorderEdge,
  ) => void;
  reorderableColumns?: boolean;
  onColumnReorder?: (columns: ReusableTableColumn<T>[]) => void;
  resizableColumns?: boolean;
  onColumnResizeEnd?: (payload: ReusableTableColumnResizeEndPayload<T>) => void;
  onBodyContextMenu?: (payload: ReusableTableBodyContextMenuPayload<T>) => void;
  // Fires on right-click anywhere in the table shell (header, empty area, etc.).
  onWrapperContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
  wrapperClassName?: string;
  tableClassName?: string;
  tableLayout?: CSSProperties["tableLayout"];
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
