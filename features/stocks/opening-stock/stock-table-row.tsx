"use client";
import type {
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  ReactNode,
  RefObject,
} from "react";
import { FiCalendar, FiTrash2 } from "react-icons/fi";
import type { ERPDynamicSelectOption } from "@/components/design-system/ui";
import type { ERPDynamicSearchShortcutPayload } from "@/components/design-system/ui/dynamic-modal-form";
import type { ItemPriceDetailsPayload } from "@/store/api/lookupsApi";
import { LookupCell } from "@/features/stocks/_shared/LookupCell";
import { SelectCell } from "@/features/stocks/_shared/SelectCell";
import {
  PROFIT_TYPE_OPTION_LABELS,
  TRACKING_TYPE_OPTION_LABELS,
  LOOKUP_FIELD_CONFIG,
  LOOKUP_TABLE_COLUMNS,
} from "./constants";
import type {
  ColumnDefinition,
  LookupCellState,
  LookupKind,
  OpeningStockRow,
  StockLookupOption,
} from "./opening-stock.types";
import {
  buildUomOptions,
  cx,
  formatDateEntry,
  formatDateForDisplay,
  getInvalidFieldKey,
  isOpeningStockFieldHidden,
  getOpeningStockQuantityDecimalCount,
  getOpeningStockQuantityInputStep,
  getTrackingRequiredFieldKeys,
  isOpeningStockFieldDisabled,
  isTrackingRequiredFieldMissing,
  moveOpeningStockFieldFocus,
  normalizeOpeningStockQuantityInputValue,
  openDatePicker,
  toCanonicalDateValue,
} from "./opening-stock.utils";
import styles from "@/features/stocks/_shared/stock-page.module.scss";
type StockTableRowProps = {
  row: OpeningStockRow;
  rowIndex: number;
  columns: ColumnDefinition[];
  invalidFieldKeys: Record<string, true>;
  itemDetailsByItemId: Record<string, ItemPriceDetailsPayload>;
  itemOptionsByValue: Map<string, string>;
  godownOptionsByValue: Map<string, string>;
  unitOptionsByValue: Map<string, string>;
  unitDecimalCountById: Record<string, number>;
  openLookupCell: LookupCellState | null;
  lookupSearchQuery: string;
  filteredItemOptions: StockLookupOption[];
  filteredGodownOptions: StockLookupOption[];
  isItemLookupLoading: boolean;
  isGodownLookupLoading: boolean;
  lookupSearchInputRef: RefObject<HTMLInputElement | null>;
  lookupRootRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  rowDatePickerRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  onRemoveRow: (rowId: number) => void;
  onRowChange: (rowId: number, field: string, value: string) => void;
  onUomChange: (rowId: number, unitId: string) => void;
  onLookupSelection: (
    rowId: number,
    lookupKind: LookupKind,
    option: ERPDynamicSelectOption,
  ) => void;
  onLookupSearchChange: (lookupKind: LookupKind, search: string) => void;
  onLookupToggle: (cellKey: string, lookupKind: LookupKind) => void;
  onLookupCreateShortcut?: (
    rowId: number,
    lookupKind: LookupKind,
    payload: ERPDynamicSearchShortcutPayload,
  ) => void | Promise<void>;
  onLookupEditShortcut?: (
    rowId: number,
    lookupKind: LookupKind,
    payload: ERPDynamicSearchShortcutPayload,
  ) => void | Promise<void>;
};
function getSelectOptionLabel(columnKey: string, option: string): string {
  if (columnKey === "profittype") {
    return PROFIT_TYPE_OPTION_LABELS[option as keyof typeof PROFIT_TYPE_OPTION_LABELS] ?? option;
  }
  if (columnKey === "osltrackingtype") {
    return TRACKING_TYPE_OPTION_LABELS[option as keyof typeof TRACKING_TYPE_OPTION_LABELS] ?? option;
  }
  return option;
}
function getCellPlaceholder(placeholder?: string): string | undefined {
  return placeholder === "0.00" || placeholder === "0.000" ? "" : placeholder;
}
function getAlignClass(align: ColumnDefinition["align"]): string {
  if (align === "right") {
    return styles.alignRight;
  }
  if (align === "center") {
    return styles.alignCenter;
  }
  return styles.alignLeft;
}
function shouldUseSelectedRowFieldBackground(columnKey: string): boolean {
  return (
    columnKey === "taxname" ||
    columnKey === "batchno" ||
    columnKey === "serialno" ||
    columnKey === "batchdate" ||
    columnKey === "mfgdate" ||
    columnKey === "expirydate"
  );
}
function handleFieldNavigationKeyDown(event: ReactKeyboardEvent<HTMLElement>): boolean {
  if (event.key !== "Enter") {
    return false;
  }
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }
  event.preventDefault();
  moveOpeningStockFieldFocus(event.currentTarget, "right");
  return true;
}
function handleSelectableInputFocus(event: ReactFocusEvent<HTMLInputElement>): void {
  event.currentTarget.select();
}
function handleSelectableInputClick(event: ReactMouseEvent<HTMLInputElement>): void {
  event.currentTarget.select();
}
export function StockTableRow({
  row,
  rowIndex,
  columns,
  invalidFieldKeys,
  itemDetailsByItemId,
  itemOptionsByValue,
  godownOptionsByValue,
  unitOptionsByValue,
  unitDecimalCountById,
  openLookupCell,
  lookupSearchQuery,
  filteredItemOptions,
  filteredGodownOptions,
  isItemLookupLoading,
  isGodownLookupLoading,
  lookupSearchInputRef,
  lookupRootRefs,
  rowDatePickerRefs,
  onRemoveRow,
  onRowChange,
  onUomChange,
  onLookupSelection,
  onLookupSearchChange,
  onLookupToggle,
  onLookupCreateShortcut,
  onLookupEditShortcut,
}: StockTableRowProps): ReactNode {
  const currentItemId = row.values.oslitemid?.trim() ?? "";
  const currentItemDetail = currentItemId ? itemDetailsByItemId[currentItemId] : undefined;
  const trackingRequiredFieldKeys = getTrackingRequiredFieldKeys(row, currentItemDetail);
  const uomSelectOptions = buildUomOptions(currentItemDetail, unitOptionsByValue);
  const quantityDecimalCount = getOpeningStockQuantityDecimalCount(
    row.values.oslunitid,
    unitDecimalCountById,
  );
  return (
    <tr
      className={cx(
        styles.dataRow,
        styles.row,
        rowIndex % 2 === 0 ? styles.rowOdd : styles.rowEven,
      )}
    >
      <td
        data-label="S.No"
        className={cx(
          styles.cell,
          styles.compactCell,
          styles.alignLeft,
          styles.stickySerialCell,
        )}
        style={{ left: 0 }}
      >
        <div className={styles.serialCellContent}>
          <span className={styles.rowNumber}>{rowIndex + 1}</span>
        </div>
      </td>
      {columns.map((column, columnIndex) => {
        const value = row.values[column.key] ?? "";
        const isNumeric = column.kind === "number";
        const lookupKind = column.lookupKind;
        const lookupFieldConfig = lookupKind ? LOOKUP_FIELD_CONFIG[lookupKind] : null;
        const cellLookupKey = `${row.id}:${column.key}`;
        const isLookupOpen = openLookupCell?.key === cellLookupKey;
        const selectedLookupId = lookupFieldConfig ? row.values[lookupFieldConfig.idField] ?? "" : "";
        const selectedLookupLabel = lookupKind
          ? (
            lookupKind === "item"
              ? itemOptionsByValue.get(selectedLookupId)
              : godownOptionsByValue.get(selectedLookupId)
          ) ?? value
          : value;
        const lookupOptions = lookupKind
          ? lookupKind === "item"
            ? filteredItemOptions
            : filteredGodownOptions
          : [];
        const isLookupLoading = lookupKind
          ? lookupKind === "item"
            ? isItemLookupLoading
            : isGodownLookupLoading
          : false;
        const isHiddenField = isOpeningStockFieldHidden(column.key, row);
        const isDisabledInput = isOpeningStockFieldDisabled(
          column.key,
          row,
          currentItemDetail,
        );
        const hasValidationError = Boolean(invalidFieldKeys[getInvalidFieldKey(row.id, column.key)]);
        const hasRequiredFieldError =
          hasValidationError ||
          (!isDisabledInput &&
            isTrackingRequiredFieldMissing(row, column.key, currentItemDetail));
        const isRequiredField =
          !isDisabledInput && trackingRequiredFieldKeys.includes(column.key);
        const usesSelectedRowFieldBackground = shouldUseSelectedRowFieldBackground(column.key);
        const hidesNativeSelectArrow =
          column.key === "osltrackingtype" || column.key === "oslcesstype";
        const sharedClassName = cx(
          styles.cellInput,
          isNumeric && styles.numericInput,
          hasRequiredFieldError && styles.requiredField,
          usesSelectedRowFieldBackground && styles.rowSelectionFillControl,
        );
        const cellDatePickerKey = `${row.id}:${column.key}`;
        return (
          <td
            key={column.key}
            data-label={column.header}
            data-opening-stock-field-container="true"
            data-opening-stock-row-index={rowIndex}
            data-opening-stock-column-index={columnIndex}
            className={cx(styles.cell, styles.compactCell, getAlignClass(column.align))}
          >
            {isHiddenField ? null : column.key === "uom" ? (
              <SelectCell
                rowId={row.id}
                fieldKey={column.key}
                value={row.values.oslunitid ?? ""}
                options={uomSelectOptions}
                styles={styles}
                placeholderOption={{
                  value: "",
                  label: currentItemDetail ? "Select Uom" : "Select item first",
                }}
                disabled={!currentItemDetail || uomSelectOptions.length === 0}
                hasError={hasValidationError}
                optionKeyPrefix={`${row.id}-uom`}
                onChange={(unitId) => onUomChange(row.id, unitId)}
              />
            ) : column.kind === "lookup" && lookupKind && lookupFieldConfig ? (
              <LookupCell
                rowId={row.id}
                fieldKey={column.key}
                cellKey={cellLookupKey}
                lookupKind={lookupKind}
                isOpen={isLookupOpen}
                isLoading={isLookupLoading}
                selectedId={selectedLookupId}
                selectedLabel={selectedLookupLabel}
                placeholder={column.placeholder}
                header={column.header}
                emptyMessage={lookupFieldConfig.emptyMessage}
                options={lookupOptions}
                columns={LOOKUP_TABLE_COLUMNS[lookupKind]}
                searchQuery={lookupSearchQuery}
                shortcutValues={row.values}
                hasValidationError={hasValidationError}
                styles={styles}
                searchInputRef={lookupSearchInputRef}
                rootRef={(element) => {
                  lookupRootRefs.current[cellLookupKey] = element;
                }}
                onToggle={() => onLookupToggle(cellLookupKey, lookupKind)}
                onTriggerKeyDown={handleFieldNavigationKeyDown}
                onSearchCreateShortcut={(payload) =>
                  onLookupCreateShortcut?.(row.id, lookupKind, payload)
                }
                onSearchEditShortcut={(payload) =>
                  onLookupEditShortcut?.(row.id, lookupKind, payload)
                }
                onSearchChange={(search) => onLookupSearchChange(lookupKind, search)}
                onSelect={(option) => onLookupSelection(row.id, lookupKind, option)}
              />
            ) : column.kind === "select" ? (
              <SelectCell
                rowId={row.id}
                fieldKey={column.key}
                value={value}
                options={(column.options ?? []).map((option) => ({
                  value: option,
                  label: getSelectOptionLabel(column.key, option),
                }))}
                styles={styles}
                placeholderOption={
                  column.key === "roundoff"
                    ? { value: "", label: "Select Round Off" }
                    : null
                }
                disabled={isDisabledInput}
                hasError={hasRequiredFieldError}
                hideNativeArrow={hidesNativeSelectArrow}
                onChange={(nextValue) => onRowChange(row.id, column.key, nextValue)}
                onKeyDown={handleFieldNavigationKeyDown}
              />
            ) : column.kind === "date" ? (
              <div
                className={cx(
                  styles.dateInputWrap,
                  hasRequiredFieldError && styles.requiredDateWrap,
                  usesSelectedRowFieldBackground && styles.rowSelectionFillWrap,
                )}
              >
                <input
                  data-opening-stock-field-control="true"
                  data-opening-stock-row-id={row.id}
                  data-opening-stock-field-key={column.key}
                  type="text"
                  value={value}
                  onChange={(event) => onRowChange(row.id, column.key, formatDateEntry(event.target.value))}
                  onFocus={handleSelectableInputFocus}
                  onClick={handleSelectableInputClick}
                  className={cx(sharedClassName, styles.dateInputWithPicker)}
                  placeholder="dd/mm/yyyy"
                  disabled={isDisabledInput}
                  required={isRequiredField}
                  aria-invalid={hasRequiredFieldError || undefined}
                  inputMode="numeric"
                  maxLength={10}
                  autoComplete="off"
                  onKeyDown={handleFieldNavigationKeyDown}
                />
                <input
                  ref={(element) => {
                    rowDatePickerRefs.current[cellDatePickerKey] = element;
                  }}
                  type="date"
                  value={toCanonicalDateValue(value)}
                  onChange={(event) =>
                    onRowChange(row.id, column.key, formatDateForDisplay(event.target.value))
                  }
                  tabIndex={-1}
                  aria-hidden="true"
                  className={styles.hiddenDatePickerInput}
                  disabled={isDisabledInput}
                  required={isRequiredField}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className={cx(
                    styles.datePickerTrigger,
                    hasRequiredFieldError && styles.requiredDatePickerTrigger,
                  )}
                  onClick={() => openDatePicker(rowDatePickerRefs.current[cellDatePickerKey] ?? null)}
                  aria-label={`Open ${column.header} calendar for row ${rowIndex + 1}`}
                  disabled={isDisabledInput}
                >
                  <FiCalendar
                    className={styles.datePickerIcon}
                    aria-hidden="true"
                  />
                </button>
              </div>
            ) : (
              <input
                data-opening-stock-field-control="true"
                data-opening-stock-row-id={row.id}
                data-opening-stock-field-key={column.key}
                type={isNumeric ? "number" : "text"}
                value={value}
                onChange={(event) =>
                  onRowChange(
                    row.id,
                    column.key,
                    column.key === "openingqty" || column.key === "freeqty"
                      ? normalizeOpeningStockQuantityInputValue(
                        event.target.value,
                        quantityDecimalCount,
                      )
                      : event.target.value,
                  )
                }
                onFocus={handleSelectableInputFocus}
                onClick={handleSelectableInputClick}
                className={sharedClassName}
                placeholder={getCellPlaceholder(column.placeholder)}
                readOnly={column.key === "taxname"}
                disabled={isDisabledInput}
                required={isRequiredField}
                aria-invalid={hasRequiredFieldError || undefined}
                step={
                  isNumeric
                    ? getOpeningStockQuantityInputStep(column.key, quantityDecimalCount) ?? "any"
                    : undefined
                }
                inputMode={isNumeric ? "decimal" : undefined}
                onKeyDown={(event) => {
                  if (handleFieldNavigationKeyDown(event)) {
                    return;
                  }
                  if (
                    (column.key === "openingqty" || column.key === "freeqty") &&
                    quantityDecimalCount === 0 &&
                    event.key === "."
                  ) {
                    event.preventDefault();
                    return;
                  }
                  if (isNumeric && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
                    event.preventDefault();
                  }
                }}
                onWheel={
                  isNumeric
                    ? (event) => {
                      event.currentTarget.blur();
                    }
                    : undefined
                }
              />
            )}
          </td>
        );
      })}
      <td
        data-label=""
        className={cx(
          styles.cell,
          styles.compactCell,
          styles.alignCenter,
          styles.stickyActionCell,
        )}
        style={{ right: 0 }}
      >
        <div className={styles.actionCellContent}>
          <button
            type="button"
            className={styles.rowDeleteButton}
            aria-label={`Delete row ${rowIndex + 1}`}
            onClick={() => onRemoveRow(row.id)}
          >
            <FiTrash2
              className={styles.actionIcon}
              aria-hidden="true"
            />
          </button>
        </div>
      </td>
    </tr>
  );
}
