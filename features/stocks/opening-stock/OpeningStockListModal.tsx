"use client";
import { type ReactNode, useEffect, useMemo } from "react";
import { FiRefreshCw, FiSearch, FiX } from "react-icons/fi";
import ReusableTable, { type ReusableTableColumn } from "@/components/ui/table";
import type { OpeningStockHeaderPayload } from "./opening-stock.types";
import styles from "./page.module.scss";
import { QUANTITY_FORMATTER, VALUE_FORMATTER } from "./constants";
import { cx, toInputDateValue } from "./Utils";
type OpeningStockListFilters = {
  search: string;
  dateFrom: string;
  dateTo: string;
};
type OpeningStockListModalProps = {
  isOpen: boolean;
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
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSelectRow: (row: OpeningStockHeaderPayload) => void;
  onLoadRow: (row: OpeningStockHeaderPayload) => void;
  onLoadSelected: () => void;
};
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
export function OpeningStockListModal({
  isOpen,
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
  onRefresh,
  onSearchChange,
  onDateFromChange,
  onDateToChange,
  onPageChange,
  onPageSizeChange,
  onSelectRow,
  onLoadRow,
  onLoadSelected,
}: OpeningStockListModalProps): ReactNode {
  const columns = useMemo<ReusableTableColumn<OpeningStockHeaderPayload>[]>(
    () => [
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
        render: (row) => toInputDateValue(row.osh_voucher_date) || "-",
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
    ],
    [],
  );
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Enter" || !selectedVoucherId || loading) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
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
  }, [isOpen, loading, onClose, onLoadSelected, selectedVoucherId]);
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
            <p className={styles.stockBrowserModalEyebrow}>Opening Stock</p>            
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
          <ReusableTable
            columns={columns}
            rows={rows}
            rowKey="avh_voucher_id"
            title="Opening Stock List"
            toolbarContent={
              <div className={styles.stockBrowserFilters}>
                <label className={styles.toolbarDateField}>
                  <span className={styles.toolbarDateLabel}>Search</span>
                  <div className={cx(styles.toolbarDateControl, styles.stockBrowserSearchControl)}>
                    <FiSearch className={styles.stockBrowserSearchIcon} aria-hidden="true" />
                    <input
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

                <button
                  type="button"
                  className={cx(styles.createButton, styles.loadButton)}
                  onClick={onRefresh}
                  disabled={loading}
                >
                  <FiRefreshCw className={styles.createIcon} aria-hidden="true" />
                  <span>{loading ? "Refreshing..." : "Refresh"}</span>
                </button>
              </div>
            }
            minWidth="1230px"
            fullViewHeight={false}
            tableMaxHeight="min(56dvh, 640px)"
            stickyHeader
            sortable
            paginated
            manualPagination
            totalEntries={totalEntries}
            currentPage={currentPage}
            onCurrentPageChange={onPageChange}
            pageSize={pageSize}
            onPageSizeChange={onPageSizeChange}
            pageSizeOptions={[10, 20, 25, 50, 100]}
            activeRowKey={selectedVoucherId}
            onRowClick={onSelectRow}
            onView={onLoadRow}
            viewLabel="Load"
            actionsAsIcons
            emptyText={loading ? "Loading opening stock list..." : "No opening stock vouchers found"}
            wrapperClassName={styles.stockBrowserTableShell}
          />
        </div>

        <footer className={styles.stockBrowserModalFooter}>
          <div className={styles.stockBrowserSelectionText}>
            {selectedVoucherLabel ? `Selected: ${selectedVoucherLabel}` : "Select a voucher to load."}
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
