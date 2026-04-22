"use client";
import type { ReactNode, RefObject } from "react";
import { FiCalendar, FiDownload, FiSearch, FiTrash2 } from "react-icons/fi";
import { cx, formatDateEntry, formatDateForDisplay, openDatePicker, toCanonicalDateValue } from "./Utils";
import styles from "./page.module.scss";
type StockToolbarProps = {
  voucherDate: string;
  voucherRefNo: string;
  voucherDatePickerRef: RefObject<HTMLInputElement | null>;
  isLoadingStock: boolean;
  isSavingOpeningStock: boolean;
  isDeletingOpeningStock: boolean;
  isBusinessContextLoading: boolean;
  canDeleteLoadedStock: boolean;
  onVoucherDateChange: (value: string) => void;
  onVoucherRefNoChange: (value: string) => void;
  onBrowseStockList: () => void;
  onLoadByRefNo: () => void;
  onLoadStock: () => void;
  onUpdateStock: () => void;
  onDeleteStock: () => void;
};
export function StockToolbar({
  voucherDate,
  voucherRefNo,
  voucherDatePickerRef,
  isLoadingStock,
  isSavingOpeningStock,
  isDeletingOpeningStock,
  isBusinessContextLoading,
  canDeleteLoadedStock,
  onVoucherDateChange,
  onVoucherRefNoChange,
  onBrowseStockList,
  onLoadByRefNo,
  onLoadStock,
  onUpdateStock,
  onDeleteStock,
}: StockToolbarProps): ReactNode {
  return (
    <div className={styles.toolbar}>
      <div className={styles.tableTools}>
        <label className={styles.toolbarDateField}>
          <span className={styles.toolbarDateLabel}>Voucher Date</span>
          <div className={styles.toolbarDateControl}>
            <input
              type="text"
              value={voucherDate}
              onChange={(event) => onVoucherDateChange(formatDateEntry(event.target.value))}
              className={cx(styles.toolbarDateInput, styles.dateInputWithPicker)}
              placeholder="dd/mm/yyyy"
              inputMode="numeric"
              maxLength={10}
            />
            <input
              ref={voucherDatePickerRef}
              type="date"
              value={toCanonicalDateValue(voucherDate)}
              onChange={(event) => onVoucherDateChange(formatDateForDisplay(event.target.value))}
              tabIndex={-1}
              aria-hidden="true"
              className={styles.hiddenDatePickerInput}
            />
            <button
              type="button"
              className={styles.datePickerTrigger}
              onClick={() => openDatePicker(voucherDatePickerRef.current)}
              aria-label="Open voucher date calendar"
            >
              <FiCalendar
                className={styles.datePickerIcon}
                aria-hidden="true"
              />
            </button>
          </div>
        </label>
        <label className={styles.toolbarDateField}>
          <span className={styles.toolbarDateLabel}>Ref No</span>
          <div className={styles.toolbarDateControl}>
            <input
              type="text"
              value={voucherRefNo}
              onChange={(event) => onVoucherRefNoChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") {
                  return;
                }
                event.preventDefault();
                onLoadByRefNo();
              }}
              className={cx(styles.toolbarDateInput, styles.toolbarRefInput)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </label>
  
        <button
          type="button"
          className={cx(styles.createButton, styles.refLoadButton)}
          onClick={onLoadByRefNo}
          disabled={
            isLoadingStock ||
            isSavingOpeningStock ||
            isDeletingOpeningStock ||
            isBusinessContextLoading
          }
        >
          <FiSearch
            className={styles.createIcon}
            aria-hidden="true"
          />
          <span>{isLoadingStock ? "Loading..." : "Load Ref No"}</span>
        </button>
        <button
          type="button"
          className={cx(styles.createButton, styles.loadButton)}
          onClick={onLoadStock}
          disabled={
            isLoadingStock ||
            isSavingOpeningStock ||
            isDeletingOpeningStock ||
            isBusinessContextLoading
          }
        >
          <FiDownload
            className={styles.createIcon}
            aria-hidden="true"
          />
          <span>{isLoadingStock ? "Loading..." : "Load Latest"}</span>
        </button>
        <button
          type="button"
          className={cx(styles.createButton, styles.updateButton)}
          onClick={onUpdateStock}
          disabled={
            isSavingOpeningStock ||
            isLoadingStock ||
            isDeletingOpeningStock ||
            isBusinessContextLoading
          }
        >
          <span>{isSavingOpeningStock ? "Updating..." : "Update Stock"}</span>
        </button>
        <button
          type="button"
          className={cx(styles.createButton, styles.deleteStockButton)}
          onClick={onDeleteStock}
          disabled={
            !canDeleteLoadedStock ||
            isDeletingOpeningStock ||
            isSavingOpeningStock ||
            isLoadingStock ||
            isBusinessContextLoading
          }
        >
          <FiTrash2
            className={styles.createIcon}
            aria-hidden="true"
          />
          <span>{isDeletingOpeningStock ? "Deleting..." : "Delete Stock"}</span>
        </button>
      </div>
    </div>
  );
}
