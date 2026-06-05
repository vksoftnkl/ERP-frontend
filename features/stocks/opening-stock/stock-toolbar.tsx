"use client";
import type { ReactNode, RefObject } from "react";
import { FiCalendar, FiDownload, FiList, FiRotateCcw, FiSearch, FiTrash2 } from "react-icons/fi";
import {
  cx,
  formatDateEntry,
  formatDateForDisplay,
  openDatePicker,
  toCanonicalDateValue,
} from "./opening-stock.utils";
import styles from "@/features/stocks/_shared/stock-page.module.scss";
type StockToolbarProps = {
  voucherDate: string;
  voucherRefNo: string;
  voucherDatePickerRef: RefObject<HTMLInputElement | null>;
  isLoadingStock: boolean;
  isSavingOpeningStock: boolean;
  isDeletingOpeningStock: boolean;
  isBusinessContextLoading: boolean;
  canDeleteLoadedStock: boolean;
  canClearRows: boolean;
  onVoucherDateChange: (value: string) => void;
  onVoucherRefNoChange: (value: string) => void;
  onBrowseStockList: () => void;
  onLoadByRefNo: () => void;
  onLoadStock: () => void;
  onClearRows: () => void;
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
  canClearRows,
  onVoucherDateChange,
  onVoucherRefNoChange,
  onBrowseStockList,
  onLoadByRefNo,
  onLoadStock,
  onClearRows,
  onUpdateStock,
  onDeleteStock,
}: StockToolbarProps): ReactNode {
  return (
    <div className={cx(styles.toolbar, styles.openingStockToolbar)}>
      <div className={cx(styles.tableTools, styles.openingStockTools)}>
        <label className={cx(styles.toolbarDateField, styles.openingStockField)}>
          <span className={styles.toolbarDateLabel}>Voucher Date</span>
          <div className={cx(styles.toolbarDateControl, styles.openingStockDateControl)}>
            <input
              type="text"
              value={voucherDate}
              onChange={(event) => onVoucherDateChange(formatDateEntry(event.target.value))}
              className={cx(styles.toolbarDateInput, styles.dateInputWithPicker)}
              placeholder="dd/mm/yyyy"
              inputMode="numeric"
              maxLength={10}
              autoComplete="off"
            />
            <input
              ref={voucherDatePickerRef}
              type="date"
              value={toCanonicalDateValue(voucherDate)}
              onChange={(event) => onVoucherDateChange(formatDateForDisplay(event.target.value))}
              tabIndex={-1}
              aria-hidden="true"
              className={styles.hiddenDatePickerInput}
              autoComplete="off"
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
        <label
          className={cx(
            styles.toolbarDateField,
            styles.openingStockField,
            styles.openingStockRefField,
          )}
        >
          <span className={styles.toolbarDateLabel}>Ref No</span>
          <div className={cx(styles.toolbarDateControl, styles.openingStockRefControl)}>
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
              placeholder="Enter Ref No"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className={cx(
                styles.createButton,
                styles.refLoadButton,
                styles.openingStockButton,
                styles.openingStockInlineButton,
              )}
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
          </div>
        </label>
        <div className={styles.openingStockActionGroup}>
          <button
            type="button"
            className={cx(styles.createButton, styles.loadButton, styles.openingStockButton)}
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
            <span>{isLoadingStock ? "Loading..." : "Load Stock"}</span>
          </button>
          <button
            type="button"
            className={cx(styles.createButton, styles.updateButton, styles.openingStockButton)}
            onClick={onUpdateStock}
            disabled={
              isSavingOpeningStock ||
              isLoadingStock ||
              isDeletingOpeningStock ||
              isBusinessContextLoading
            }
          >
            <FiDownload
              className={styles.createIcon}
              aria-hidden="true"
            />
            <span>{isSavingOpeningStock ? "Updating..." : "Update Stock"}</span>
          </button>
          <button
            type="button"
            className={cx(
              styles.createButton,
              styles.deleteStockButton,
              styles.openingStockButton,
            )}
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
          <button
            type="button"
            className={cx(styles.createButton, styles.loadButton, styles.openingStockButton)}
            onClick={onBrowseStockList}
            disabled={
              isLoadingStock ||
              isSavingOpeningStock ||
              isDeletingOpeningStock ||
              isBusinessContextLoading
            }
          >
            <FiList
              className={styles.createIcon}
              aria-hidden="true"
            />
            <span>Open List</span>
          </button>
          <button
            type="button"
            className={cx(styles.createButton, styles.clearRowsButton, styles.openingStockButton)}
            onClick={onClearRows}
            disabled={
              !canClearRows ||
              isLoadingStock ||
              isSavingOpeningStock ||
              isDeletingOpeningStock ||
              isBusinessContextLoading
            }
          >
            <FiRotateCcw
              className={styles.createIcon}
              aria-hidden="true"
            />
            <span>Clear Rows</span>
          </button>
        </div>
      </div>
    </div>
  );
}
