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
  // The trigger doubles as the search field (no nested search box in the
  // dropdown): closed, it shows the selected label; open, it shows what's
  // being typed, falling back to the selected label as a placeholder so the
  // prior selection stays visible until the user types over it.
  const triggerValue = isOpen ? searchQuery : selectedOptionLabel;
  const triggerPlaceholder = selectedOptionLabel || placeholder;
  return (
    <div
      className={styles.searchSelect}
      ref={registerSearchSelectRef(cellKey)}
    >
      <div
        className={cx(
          styles.searchSelectTrigger,
          isOpen && styles.searchSelectTriggerOpen,
          disabled && styles.searchSelectTriggerDisabled,
        )}
      >
        <input
          type="text"
          autoComplete="off"
          className={styles.searchSelectTriggerInput}
          disabled={disabled}
          ref={(element) => {
            registerCellRef(rowIndex, column.key)(element);
            registerSearchInputRef(cellKey)(element);
          }}
          value={triggerValue}
          placeholder={triggerPlaceholder}
          onFocus={(event) => {
            event.currentTarget.select();
          }}
          onMouseDown={() => {
            if (disabled || isOpen) {
              return;
            }
            openSearchableSelect(filteredOptions);
          }}
          onChange={(event) => onInputChange(event.currentTarget.value)}
          onKeyDown={(event) => onKeyDown(event, filteredOptions)}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className={styles.searchSelectChevronSlot}
          disabled={disabled}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (disabled) {
              return;
            }
            if (isOpen) {
              closeSearchableSelect();
            } else {
              openSearchableSelect(filteredOptions);
            }
          }}
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
        </button>
      </div>
      {isOpen && typeof document !== "undefined" && overlayPosition
        ? createPortal(
            <div
              className={styles.searchSelectList}
              ref={searchSelectListRef}
              style={overlayPosition}
            >
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
