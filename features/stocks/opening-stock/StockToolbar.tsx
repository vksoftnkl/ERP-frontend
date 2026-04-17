"use client";

import type { ReactNode, RefObject } from "react";
import { FiCalendar, FiDownload } from "react-icons/fi";
import { cx, formatDateEntry, formatDateForDisplay, openDatePicker, toCanonicalDateValue } from "./Utils";
import styles from "./page.module.scss";

type StockToolbarProps = {
  voucherDate: string;
  voucherDatePickerRef: RefObject<HTMLInputElement | null>;
  isLoadingStock: boolean;
  isSavingOpeningStock: boolean;
  isBusinessContextLoading: boolean;
  onVoucherDateChange: (value: string) => void;
  onLoadStock: () => void;
  onUpdateStock: () => void;
};

export function StockToolbar({
  voucherDate,
  voucherDatePickerRef,
  isLoadingStock,
  isSavingOpeningStock,
  isBusinessContextLoading,
  onVoucherDateChange,
  onLoadStock,
  onUpdateStock,
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
        <button
          type="button"
          className={cx(styles.createButton, styles.loadButton)}
          onClick={onLoadStock}
          disabled={isLoadingStock || isSavingOpeningStock || isBusinessContextLoading}
        >
          <FiDownload
            className={styles.createIcon}
            aria-hidden="true"
          />
          <span>{isLoadingStock ? "Loading..." : "Load the Stock"}</span>
        </button>
        <button
          type="button"
          className={cx(styles.createButton, styles.updateButton)}
          onClick={onUpdateStock}
          disabled={isSavingOpeningStock || isLoadingStock || isBusinessContextLoading}
        >
          <span>{isSavingOpeningStock ? "Updating..." : "Update Stock"}</span>
        </button>
      </div>
    </div>
  );
}
