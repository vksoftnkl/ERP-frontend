"use client";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { FiChevronLeft, FiChevronRight, FiSearch, FiX } from "react-icons/fi";
import {
  KeyboardShortcutHints,
  type KeyboardShortcutDefinition,
} from "@/components/design-system/ui/keyboard-shortcut-hints";
import styles from "@/features/stocks/_shared/stock-page.module.scss";
import { QUANTITY_FORMATTER, VALUE_FORMATTER } from "@/features/stocks/_shared/constants";
import { cx, formatDateForDisplay } from "@/features/stocks/opening-stock/opening-stock.utils";
export type PhysicalStockListRow = {
  psc_id: string;
  psc_refno: string;
  psc_date: string;
  psc_doc_no?: string;
  psc_total_lines?: number;
  psc_total_book_value?: number;
  psc_total_counted_value?: number;
  psc_net_variance_value?: number;
  psc_status?: string;
  psc_counter_id?: string | null;
  psc_created_by?: string | null;
};
type PhysicalStockListFilters = {
  search: string;
  dateFrom: string;
  dateTo: string;
};
type PhysicalStockListColumn = {
  key: string;
  header: string;
  width: string;
  align?: "left" | "center" | "right";
  render: (row: PhysicalStockListRow) => ReactNode;
};
type PhysicalStockListModalProps = {
  isOpen: boolean;
  suspendKeyboardShortcuts?: boolean;
  filters: PhysicalStockListFilters;
  rows: PhysicalStockListRow[];
  loading: boolean;
  error: string | null;
  totalEntries: number;
  currentPage: number;
  pageSize: number;
  selectedStockId: string | null;
  selectedStockLabel: string | null;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSelectRow: (row: PhysicalStockListRow) => void;
  onLoadRow: (row: PhysicalStockListRow) => void;
  onLoadSelected: () => void;
};
const PAGE_SIZE_OPTIONS = [10, 20, 25, 50, 100] as const;
const PHYSICAL_STOCK_LIST_SHORTCUTS: readonly KeyboardShortcutDefinition[] = [
  { label: "Prev Row", keys: ["ArrowUp"] },
  { label: "Next Row", keys: ["ArrowDown"] },
  { label: "Load", keys: ["Enter"] },
  { label: "Close", keys: ["Esc"] },
] as const;
const PHYSICAL_STOCK_LIST_COLUMNS: PhysicalStockListColumn[] = [
  {
    key: "refno",
    header: "Ref No",
    width: "180px",
    render: (row) => row.psc_refno?.trim() || "-",
  },
  {
    key: "docNo",
    header: "Doc No",
    width: "130px",
    render: (row) => row.psc_doc_no?.trim() || "-",
  },
  {
    key: "docDate",
    header: "Doc Date",
    width: "135px",
    render: (row) => formatDateForDisplay(row.psc_date) || "-",
  },
  {
    key: "lines",
    header: "Lines",
    width: "92px",
    align: "right",
    render: (row) => QUANTITY_FORMATTER.format(row.psc_total_lines ?? 0),
  },
  {
    key: "bookValue",
    header: "Book Value",
    width: "140px",
    align: "right",
    render: (row) => VALUE_FORMATTER.format(row.psc_total_book_value ?? 0),
  },
  {
    key: "countedValue",
    header: "Counted Value",
    width: "150px",
    align: "right",
    render: (row) => VALUE_FORMATTER.format(row.psc_total_counted_value ?? 0),
  },
  {
    key: "variance",
    header: "Variance",
    width: "140px",
    align: "right",
    render: (row) => VALUE_FORMATTER.format(row.psc_net_variance_value ?? 0),
  },
  {
    key: "status",
    header: "Status",
    width: "120px",
    render: (row) => row.psc_status?.trim() || "-",
  },
  {
    key: "counter",
    header: "Counter",
    width: "140px",
    render: (row) => row.psc_counter_id?.trim() || "-",
  },
];
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
export function PhysicalStockListModal({
  isOpen,
  suspendKeyboardShortcuts = false,
  filters,
  rows,
  loading,
  error,
  totalEntries,
  currentPage,
  pageSize,
  selectedStockId,
  selectedStockLabel,
  onClose,
  onSearchChange,
  onDateFromChange,
  onDateToChange,
  onPageChange,
  onPageSizeChange,
  onSelectRow,
  onLoadRow,
  onLoadSelected,
}: PhysicalStockListModalProps): ReactNode {
  const totalPages = Math.max(1, Math.ceil(totalEntries / Math.max(1, pageSize)));
  const currentStartEntry = totalEntries === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const currentEndEntry = totalEntries === 0 ? 0 : Math.min(currentPage * pageSize, totalEntries);
  const pageList = useMemo(
    () => buildPageList(totalPages, Math.min(currentPage, totalPages)),
    [currentPage, totalPages],
  );
  const footerShortcuts = suspendKeyboardShortcuts ? [] : PHYSICAL_STOCK_LIST_SHORTCUTS;
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
    if (!isOpen || !selectedStockId) {
      return;
    }
    rowRefs.current[selectedStockId]?.scrollIntoView({ block: "nearest" });
  }, [isOpen, rows, selectedStockId]);
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
        const currentIndex = rows.findIndex((row) => row.psc_id === selectedStockId);
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
      if (event.key !== "Enter" || !selectedStockId || loading) {
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
    selectedStockId,
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
        aria-label="Close physical stock list"
      />
      <section
        className={styles.stockBrowserModalPanel}
        role="dialog"
        aria-modal="true"
        aria-label="Physical stock list"
      >
        <header className={styles.stockBrowserModalHeader}>
          <div className={styles.stockBrowserModalTitleBlock}>
            <p className={styles.stockBrowserModalEyebrow}>Physical Stock list</p>
          </div>
          <button
            type="button"
            className={styles.stockBrowserModalCloseButton}
            onClick={onClose}
            aria-label="Close physical stock list"
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
                <FiSearch
                  className={styles.stockBrowserSearchIcon}
                  aria-hidden="true"
                />
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
                  {PHYSICAL_STOCK_LIST_COLUMNS.map((column) => (
                    <col
                      key={column.key}
                      style={{ width: column.width }}
                    />
                  ))}
                </colgroup>
                <thead className={styles.stockBrowserTableHead}>
                  <tr>
                    <th className={cx(styles.stockBrowserTableHeadCell, styles.alignCenter)}>
                      S.No
                    </th>
                    {PHYSICAL_STOCK_LIST_COLUMNS.map((column) => (
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
                        colSpan={PHYSICAL_STOCK_LIST_COLUMNS.length + 1}
                        className={cx(
                          styles.stockBrowserTableCell,
                          styles.stockBrowserTableEmptyCell,
                        )}
                      >
                        {loading ? "Loading physical stock list..." : "No physical stock found"}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, rowIndex) => {
                      const isSelected = row.psc_id === selectedStockId;
                      const serialNumber = currentStartEntry + rowIndex;
                      return (
                        <tr
                          key={row.psc_id}
                          ref={(element) => {
                            rowRefs.current[row.psc_id] = element;
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
                          {PHYSICAL_STOCK_LIST_COLUMNS.map((column) => (
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
                      <option
                        key={size}
                        value={size}
                      >
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
            <span className={styles.stockBrowserSelectionText}>
              {selectedStockLabel ? `Selected: ${selectedStockLabel}` : "No stock selected"}
            </span>
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
              disabled={!selectedStockId || loading}
            >
              {loading ? "Loading..." : "Load Selected"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}