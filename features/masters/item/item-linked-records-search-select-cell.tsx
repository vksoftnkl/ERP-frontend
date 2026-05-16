"use client";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "@/components/design-system/cx";
import {
  buildColumnOptions,
  filterColumnOptions,
  getSelectPlaceholder,
  type LinkedRecordCellElement,
  type LinkedRecordColumn,
  type LinkedRecordOption,
  type SearchSelectOverlayPosition,
} from "./item-linked-records-editor.shared";
import styles from "./item-linked-records-editor.module.scss";
type SearchableSelectCellProps = {
  activeOptionIndex: number;
  cellKey: string;
  cellValue: string;
  closeSearchableSelect: () => void;
  column: LinkedRecordColumn;
  disabled: boolean;
  isOpen: boolean;
  options: LinkedRecordOption[];
  onChoose: (option: LinkedRecordOption) => void;
  onInputChange: (query: string) => void;
  onKeyDown: (
    event: ReactKeyboardEvent<HTMLElement>,
    filteredOptions: LinkedRecordOption[],
  ) => void;
  openSearchableSelect: (
    options: LinkedRecordOption[],
    preferredIndex?: number,
  ) => void;
  overlayPosition: SearchSelectOverlayPosition | null;
  registerCellRef: (
    rowIndex: number,
    columnKey: string,
  ) => (element: LinkedRecordCellElement | null) => void;
  registerSearchInputRef: (
    cellKey: string,
  ) => (element: HTMLInputElement | null) => void;
  registerSearchSelectRef: (
    cellKey: string,
  ) => (element: HTMLDivElement | null) => void;
  rowIndex: number;
  searchQuery: string;
  searchSelectListRef: MutableRefObject<HTMLDivElement | null>;
  setActiveOptionIndex: (cellKey: string, optionIndex: number) => void;
};
export default function ItemLinkedRecordsSearchSelectCell({
  activeOptionIndex,
  cellKey,
  cellValue,
  closeSearchableSelect,
  column,
  disabled,
  isOpen,
  options,
  onChoose,
  onInputChange,
  onKeyDown,
  openSearchableSelect,
  overlayPosition,
  registerCellRef,
  registerSearchInputRef,
  registerSearchSelectRef,
  rowIndex,
  searchQuery,
  searchSelectListRef,
  setActiveOptionIndex,
}: SearchableSelectCellProps) {
  const optionsWithCurrentValue =
    cellValue && !options.some((option) => option.value === cellValue)
      ? [
          ...options,
          {
            value: cellValue,
            label: cellValue,
          },
        ]
      : options;
  const selectableOptions = buildColumnOptions(column, optionsWithCurrentValue);
  const filteredOptions = filterColumnOptions(selectableOptions, searchQuery);
  const selectedOptionLabel =
    selectableOptions.find((option) => option.value === cellValue)?.label ??
    cellValue;
  const placeholder = getSelectPlaceholder(column);
  return (
    <div
      className={styles.searchSelect}
      ref={registerSearchSelectRef(cellKey)}
    >
      <button
        type="button"
        className={cx(
          styles.searchSelectTrigger,
          isOpen && styles.searchSelectTriggerOpen,
          disabled && styles.searchSelectTriggerDisabled,
        )}
        disabled={disabled}
        ref={registerCellRef(rowIndex, column.key)}
        onClick={() => {
          if (disabled) {
            return;
          }

          if (isOpen) {
            closeSearchableSelect();
            return;
          }

          openSearchableSelect(filteredOptions);
        }}
        onKeyDown={(event) => onKeyDown(event, filteredOptions)}
      >
        <span
          className={cx(
            styles.searchSelectTriggerLabel,
            !cellValue && styles.searchSelectTriggerPlaceholder,
          )}
        >
          {selectedOptionLabel || placeholder}
        </span>
        <span
          className={styles.searchSelectChevronSlot}
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 20 20"
            className={cx(
              styles.searchSelectChevron,
              isOpen && styles.searchSelectChevronOpen,
            )}
          >
            <path
              d="M5 7.5 10 12.5 15 7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {isOpen && typeof document !== "undefined" && overlayPosition
        ? createPortal(
            <div
              className={styles.searchSelectList}
              ref={searchSelectListRef}
              style={overlayPosition}
            >
              <div className={styles.searchSelectSearchWrap}>
                <input
                  type="text"
                  autoComplete="off"
                  className={styles.searchSelectSearchInput}
                  placeholder={column.placeholder ?? `Search ${column.label}`}
                  ref={registerSearchInputRef(cellKey)}
                  value={searchQuery}
                  onChange={(event) =>
                    onInputChange(event.currentTarget.value)
                  }
                  onKeyDown={(event) => onKeyDown(event, filteredOptions)}
                />
                <span
                  className={styles.searchSelectSearchIcon}
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 20 20">
                    <path
                      d="M8.6 3.5a5.1 5.1 0 1 1 0 10.2 5.1 5.1 0 0 1 0-10.2Zm0 1.6a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm4.7 8.7 3.2 3.2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </div>
              <ul className={styles.searchSelectOptions}>
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((option, optionIndex) => (
                    <li
                      key={`${column.key}-${option.value}`}
                      className={cx(
                        styles.searchSelectOption,
                        optionIndex === activeOptionIndex &&
                          styles.searchSelectOptionActive,
                        option.value === cellValue &&
                          styles.searchSelectOptionActive,
                      )}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        onChoose(option);
                      }}
                      onMouseEnter={() =>
                        setActiveOptionIndex(cellKey, optionIndex)
                      }
                    >
                      {option.label}
                    </li>
                  ))
                ) : (
                  <li className={styles.searchSelectEmpty}>
                    No options found.
                  </li>
                )}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
