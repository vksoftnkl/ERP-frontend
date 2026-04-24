"use client";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { FiChevronLeft, FiChevronRight, FiSearch, FiX } from "react-icons/fi";
import {
  KeyboardShortcutHints,
  type KeyboardShortcutDefinition,
} from "@/components/library/ui/keyboard-shortcut-hints";
import { useGetGridColumnsQuery } from "@/store/api/metadataApi";
import type { GridColumnConfig } from "@/store/slices/gridColumnsSlice";
import type { OpeningStockHeaderPayload } from "./opening-stock.types";
import styles from "./page.module.scss";
import { QUANTITY_FORMATTER, VALUE_FORMATTER } from "./constants";
import { cx, formatDateForDisplay } from "./Utils";

type OpeningStockListFilters = {
  search: string;
  dateFrom: string;
  dateTo: string;
};

type OpeningStockListColumn = {
  key: string;
  header: string;
  width: string;
  align?: "left" | "center" | "right";
  render: (row: OpeningStockHeaderPayload) => ReactNode;
};

type OpeningStockListModalProps = {
  isOpen: boolean;
  suspendKeyboardShortcuts?: boolean;
  filters: OpeningStockListFilters;
  rows: OpeningStockHeaderPayload[];
  loading: boolean;
  error: string | null;
  totalEntries: number;
  currentPage: number;
  pageSize: number;
  selectedVoucherId: string | null;
  selectedVoucherLabel: string | null;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSelectRow: (row: OpeningStockHeaderPayload) => void;
  onLoadRow: (row: OpeningStockHeaderPayload) => void;
  onLoadSelected: () => void;
};

const PAGE_SIZE_OPTIONS = [10, 20, 25, 50, 100] as const;
const OPENING_STOCK_LIST_GRID_ID = 16;
const GRID_COLUMNS_PAGE = 1;
const GRID_COLUMNS_LIMIT = 100;
const OPENING_STOCK_LIST_SHORTCUTS: readonly KeyboardShortcutDefinition[] = [
  {
    label: "Prev Row",
    keys: ["ArrowUp"],
  },
  {
    label: "Next Row",
    keys: ["ArrowDown"],
  },
  {
    label: "Load",
    keys: ["Enter"],
  },
  {
    label: "Close",
    keys: ["Esc"],
  },
] as const;

function resolveTextValue(
  row: OpeningStockHeaderPayload,
  keys: readonly string[],
  fallback = "-",
): string {
  const record = row as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function normalizeColumnToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const DEFAULT_OPENING_STOCK_LIST_COLUMNS: OpeningStockListColumn[] = [
  {
    key: "refno",
    header: "Ref No",
    width: "180px",
    render: (row) => row.avh_voucher_refno?.trim() || "-",
  },
  {
    key: "voucherNo",
    header: "Voucher No",
    width: "150px",
    render: (row) => row.osh_voucher_no?.trim() || "-",
  },
  {
    key: "voucherDate",
    header: "Voucher Date",
    width: "135px",
    render: (row) => formatDateForDisplay(row.osh_voucher_date) || "-",
  },
  {
    key: "lines",
    header: "Lines",
    width: "92px",
    align: "right",
    render: (row) => row.osh_total_lines,
  },
  {
    key: "qty",
    header: "Qty",
    width: "128px",
    align: "right",
    render: (row) => QUANTITY_FORMATTER.format(row.osh_total_qty),
  },
  {
    key: "value",
    header: "Value",
    width: "148px",
    align: "right",
    render: (row) => VALUE_FORMATTER.format(row.osh_total_value),
  },
  {
    key: "status",
    header: "Status",
    width: "120px",
    render: (row) => row.osh_status?.trim() || row.avh_voucher_status?.trim() || "-",
  },
  {
    key: "counterName",
    header: "Counter Name",
    width: "180px",
    render: (row) =>
      resolveTextValue(row, [
        "avh_counter_name",
        "osh_counter_name",
        "counter_name",
        "avh_counter_id",
        "osh_counter_id",
      ]),
  },
  {
    key: "userName",
    header: "User Name",
    width: "180px",
    render: (row) =>
      resolveTextValue(row, [
        "avh_user_name",
        "osh_user_name",
        "user_name",
        "avh_user_refno",
        "avh_user_id",
        "osh_user_id",
      ]),
  },
];

const OPENING_STOCK_COLUMN_BY_TOKEN = new Map<string, OpeningStockListColumn>();
DEFAULT_OPENING_STOCK_LIST_COLUMNS.forEach((column) => {
  [column.key, column.header].forEach((candidate) => {
    OPENING_STOCK_COLUMN_BY_TOKEN.set(normalizeColumnToken(candidate), column);
  });
});

function resolveOpeningStockColumn(
  gridColumn: GridColumnConfig,
): OpeningStockListColumn | null {
  const candidates = [gridColumn.accessorKey, gridColumn.key, gridColumn.header];

  for (const candidate of candidates) {
    const column = OPENING_STOCK_COLUMN_BY_TOKEN.get(normalizeColumnToken(candidate));
    if (column) {
      return column;
    }
  }

  return null;
}

function buildOpeningStockListColumns(
  gridColumns: GridColumnConfig[],
): OpeningStockListColumn[] {
  if (gridColumns.length === 0) {
    return DEFAULT_OPENING_STOCK_LIST_COLUMNS;
  }

  const columns: OpeningStockListColumn[] = [];
  const seenKeys = new Set<string>();

  gridColumns
    .filter((column) => column.visible)
    .sort((left, right) => left.order - right.order)
    .forEach((gridColumn) => {
      const template = resolveOpeningStockColumn(gridColumn);
      if (!template) {
        return;
      }

      const keyBase = template.key;
      const key = seenKeys.has(keyBase) ? `${keyBase}-${columns.length + 1}` : keyBase;
      seenKeys.add(key);

      columns.push({
        ...template,
        key,
        header: gridColumn.header || template.header,
        width: gridColumn.width ?? template.width,
        align: gridColumn.align ?? template.align,
      });
    });

  return columns;
}

function buildPageList(totalPages: number, currentPage: number): Array<number | "ellipsis"> {
  const pages: Array<number | "ellipsis"> = [];
  for (let page = 1; page <= totalPages; page += 1) {
    const shouldShow =
      page === 1 ||
      page === totalPages ||
      (page >= currentPage - 1 && page <= currentPage + 1);

    if (shouldShow) {
      pages.push(page);
      continue;
    }

    if (pages[pages.length - 1] !== "ellipsis") {
      pages.push("ellipsis");
    }
  }
  return pages;
}

export function OpeningStockListModal({
  isOpen,
  suspendKeyboardShortcuts = false,
  filters,
  rows,
  loading,
  error,
  totalEntries,
  currentPage,
  pageSize,
  selectedVoucherId,
  selectedVoucherLabel,
  onClose,
  onSearchChange,
  onDateFromChange,
  onDateToChange,
  onPageChange,
  onPageSizeChange,
  onSelectRow,
  onLoadRow,
  onLoadSelected,
}: OpeningStockListModalProps): ReactNode {
  const { data: gridColumnsData } = useGetGridColumnsQuery(
    {
      gridId: OPENING_STOCK_LIST_GRID_ID,
      page: GRID_COLUMNS_PAGE,
      limit: GRID_COLUMNS_LIMIT,
    },
    {
      skip: !isOpen,
    },
  );
  const columns = useMemo<OpeningStockListColumn[]>(
    () => buildOpeningStockListColumns(gridColumnsData ?? []),
    [gridColumnsData],
  );

  const totalPages = Math.max(1, Math.ceil(totalEntries / Math.max(1, pageSize)));
  const currentStartEntry = totalEntries === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const currentEndEntry = totalEntries === 0 ? 0 : Math.min(currentPage * pageSize, totalEntries);
  const pageList = useMemo(
    () => buildPageList(totalPages, Math.min(currentPage, totalPages)),
    [currentPage, totalPages],
  );
  const footerShortcuts = suspendKeyboardShortcuts ? [] : OPENING_STOCK_LIST_SHORTCUTS;
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const focusTimeout = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimeout);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !selectedVoucherId) {
      return;
    }

    rowRefs.current[selectedVoucherId]?.scrollIntoView({
      block: "nearest",
    });
  }, [isOpen, rows, selectedVoucherId]);

  useEffect(() => {
    if (!isOpen || suspendKeyboardShortcuts) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const target = event.target;
        if (
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          target instanceof HTMLButtonElement ||
          target instanceof HTMLAnchorElement
        ) {
          return;
        }
        if (rows.length === 0) {
          return;
        }

        event.preventDefault();
        const currentIndex = rows.findIndex((row) => row.avh_voucher_id === selectedVoucherId);
        const fallbackIndex = event.key === "ArrowDown" ? 0 : rows.length - 1;
        const nextIndex =
          currentIndex === -1
            ? fallbackIndex
            : event.key === "ArrowDown"
              ? Math.min(rows.length - 1, currentIndex + 1)
              : Math.max(0, currentIndex - 1);
        const nextRow = rows[nextIndex];
        if (nextRow) {
          onSelectRow(nextRow);
        }
        return;
      }
      if (event.key !== "Enter" || !selectedVoucherId || loading) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLButtonElement ||
        target instanceof HTMLAnchorElement
      ) {
        return;
      }
      event.preventDefault();
      onLoadSelected();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    isOpen,
    loading,
    onClose,
    onLoadSelected,
    onSelectRow,
    rows,
    selectedVoucherId,
    suspendKeyboardShortcuts,
  ]);
  if (!isOpen) {
    return null;
  }
  return (
    <div className={styles.stockBrowserModalOverlay}>
      <button
        type="button"
        className={styles.stockBrowserModalBackdrop}
        onClick={onClose}
        aria-label="Close opening stock list"
      />
      <section
        className={styles.stockBrowserModalPanel}
        role="dialog"
        aria-modal="true"
        aria-label="Opening stock list"
      >
        <header className={styles.stockBrowserModalHeader}>
          <div className={styles.stockBrowserModalTitleBlock}>
            <p className={styles.stockBrowserModalEyebrow}>Opening Stock list</p>            
          </div>
          <button
            type="button"
            className={styles.stockBrowserModalCloseButton}
            onClick={onClose}
            aria-label="Close opening stock list"
          >
            <FiX aria-hidden="true" />
          </button>
        </header>
        <div className={styles.stockBrowserModalBody}>
          {error ? (
            <div className={styles.stockBrowserErrorBox}>
              <p className={styles.stockBrowserErrorText}>{error}</p>
            </div>
          ) : null}
          <div className={styles.stockBrowserFilters}>
            <label className={styles.toolbarDateField}>
              <span className={styles.toolbarDateLabel}>Search</span>
              <div className={cx(styles.toolbarDateControl, styles.stockBrowserSearchControl)}>
                <FiSearch className={styles.stockBrowserSearchIcon} aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={filters.search}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="Search ref no"
                  autoComplete="off"
                  spellCheck={false}
                  className={cx(styles.toolbarDateInput, styles.stockBrowserSearchInput)}
                />
              </div>
            </label>
            <label className={styles.toolbarDateField}>
              <span className={styles.toolbarDateLabel}>From Date</span>
              <div className={styles.toolbarDateControl}>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(event) => onDateFromChange(event.target.value)}
                  className={styles.toolbarDateInput}
                />
              </div>
            </label>
            <label className={styles.toolbarDateField}>
              <span className={styles.toolbarDateLabel}>To Date</span>
              <div className={styles.toolbarDateControl}>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(event) => onDateToChange(event.target.value)}
                  className={styles.toolbarDateInput}
                />
              </div>
            </label>
          </div>

          <div className={styles.stockBrowserTableShell}>
            <div className={styles.stockBrowserTableViewport}>
              <table className={styles.stockBrowserTable}>
                <colgroup>
                  <col style={{ width: "72px" }} />
                  {columns.map((column) => (
                    <col key={column.key} style={{ width: column.width }} />
                  ))}
                </colgroup>
                <thead className={styles.stockBrowserTableHead}>
                  <tr>
                    <th
                      className={cx(
                        styles.stockBrowserTableHeadCell,
                        styles.alignCenter,
                      )}
                    >
                      S.No
                    </th>
                    {columns.map((column) => (
                      <th
                        key={column.key}
                        className={cx(
                          styles.stockBrowserTableHeadCell,
                          column.align === "right" && styles.alignRight,
                          column.align === "center" && styles.alignCenter,
                        )}
                      >
                        {column.header}
                      </th>
                    ))}                   
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr className={styles.stockBrowserTableRow}>
                      <td
                        colSpan={columns.length + 1}
                        className={cx(
                          styles.stockBrowserTableCell,
                          styles.stockBrowserTableEmptyCell,
                        )}
                      >
                        {loading
                          ? "Loading opening stock list..."
                          : "No opening stock vouchers found"}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, rowIndex) => {
                      const isSelected = row.avh_voucher_id === selectedVoucherId;
                      const serialNumber = currentStartEntry + rowIndex;
                      return (
                        <tr
                          key={row.avh_voucher_id}
                          ref={(element) => {
                            rowRefs.current[row.avh_voucher_id] = element;
                          }}
                          className={cx(
                            styles.stockBrowserTableRow,
                            styles.stockBrowserTableRowClickable,
                            isSelected && styles.stockBrowserTableRowSelected,
                          )}
                          onClick={() => onSelectRow(row)}
                          onDoubleClick={() => onLoadRow(row)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onSelectRow(row);
                            }
                          }}
                          tabIndex={0}
                        >
                          <td
                            className={cx(
                              styles.stockBrowserTableCell,
                              styles.alignCenter,
                            )}
                          >
                            {serialNumber}
                          </td>
                          {columns.map((column) => (
                            <td
                              key={column.key}
                              className={cx(
                                styles.stockBrowserTableCell,
                                column.align === "right" && styles.alignRight,
                                column.align === "center" && styles.alignCenter,
                              )}
                            >
                              {column.render(row)}
                            </td>
                          ))}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className={styles.stockBrowserTablePagination}>
              <div className={styles.stockBrowserTableMeta}>
                {totalEntries > 0
                  ? `${currentStartEntry}-${currentEndEntry} of ${totalEntries}`
                  : "0 records"}
              </div>
              <div className={styles.stockBrowserTablePaginationControls}>
                <label className={styles.stockBrowserPageSizeField}>
                  <span className={styles.stockBrowserPageSizeLabel}>Rows</span>
                  <select
                    value={pageSize}
                    onChange={(event) => onPageSizeChange(Number(event.target.value))}
                    className={styles.stockBrowserPageSizeSelect}
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <div className={styles.stockBrowserPageButtons}>
                  <button
                    type="button"
                    className={styles.stockBrowserPageButton}
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage <= 1}
                    aria-label="Previous page"
                  >
                    <FiChevronLeft aria-hidden="true" />
                  </button>
                  {pageList.map((pageItem, index) =>
                    pageItem === "ellipsis" ? (
                      <span
                        key={`ellipsis-${index}`}
                        className={styles.stockBrowserPageEllipsis}
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={pageItem}
                        type="button"
                        className={cx(
                          styles.stockBrowserPageButton,
                          pageItem === currentPage && styles.stockBrowserPageButtonActive,
                        )}
                        onClick={() => onPageChange(pageItem)}
                      >
                        {pageItem}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    className={styles.stockBrowserPageButton}
                    onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage >= totalPages}
                    aria-label="Next page"
                  >
                    <FiChevronRight aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <footer className={styles.stockBrowserModalFooter}>        
          <div className={styles.stockBrowserFooterShortcuts}>
            <KeyboardShortcutHints
              shortcuts={footerShortcuts}
              dense
            />
          </div>
          <div className={styles.stockBrowserModalActions}>
            <button
              type="button"
              className={styles.stockBrowserSecondaryButton}
              onClick={onClose}
            >
              Close
            </button>
            <button
              type="button"
              className={cx(styles.createButton, styles.updateButton)}
              onClick={onLoadSelected}
              disabled={!selectedVoucherId || loading}
            >
              {loading ? "Loading..." : "Load Selected"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
