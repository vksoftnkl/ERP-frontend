"use client";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { cx } from "@/components/library/cx";
import ItemLinkedRecordsSearchSelectCell from "./item-linked-records-search-select-cell";
import {
  getCellKey,
  getColumnStyle,
  getRowKey,
  getSelectPlaceholder,
  parseLinkedRecordRowsResult,
  resolveColumnReadOnly,
  resolveColumnOptions,
  serializeLinkedRecordRows,
  setLinkedRecordRowValue,
  type LinkedRecordCellElement,
  type LinkedRecordColumn,
  type LinkedRecordOption,
  type LinkedRecordRow,
} from "./item-linked-records-editor.shared";
import { useItemLinkedRecordsSearchSelect } from "./use-item-linked-records-search-select";
import styles from "./item-linked-records-editor.module.scss";
export type {
  LinkedRecordColumn,
  LinkedRecordOption,
  LinkedRecordRow,
} from "./item-linked-records-editor.shared";
export {
  parseLinkedRecordRows,
  serializeLinkedRecordRows,
} from "./item-linked-records-editor.shared";
type LinkedRecordEditorAutoAppendConfig = {
  columnKey: string;
  focusColumnKey?: string;
};
type ItemLinkedRecordsEditorProps = {
  addLabel: string;
  actionsLabel?: string;
  autoCreateFirstRowOnMount?: boolean;
  autoFocusInitialRowOnMount?: boolean;
  autoAppendOnEnter?: LinkedRecordEditorAutoAppendConfig;
  columns: LinkedRecordColumn[];
  createRow: (sourceRow?: LinkedRecordRow) => LinkedRecordRow;
  disabled?: boolean;
  emptyState: string;
  onChange: (value: string) => void;
  showRowIndex?: boolean;
  value: string;
};
type FocusTarget = {
  columnKey: string;
  rowIndex: number;
};
function resolveFocusColumnKey(
  autoAppendOnEnter: LinkedRecordEditorAutoAppendConfig | undefined,
  fallbackColumnKey?: string,
): string | undefined {
  return (
    autoAppendOnEnter?.focusColumnKey ??
    autoAppendOnEnter?.columnKey ??
    fallbackColumnKey
  );
}
export default function ItemLinkedRecordsEditor({
  addLabel,
  actionsLabel = "Actions",
  autoCreateFirstRowOnMount = false,
  autoFocusInitialRowOnMount = true,
  autoAppendOnEnter,
  columns,
  createRow,
  disabled = false,
  emptyState,
  onChange,
  showRowIndex = true,
  value,
}: ItemLinkedRecordsEditorProps) {
  const { parseError, rows } = useMemo(
    () => parseLinkedRecordRowsResult(value),
    [value],
  );
  const cellRefs = useRef(new Map<string, LinkedRecordCellElement>());
  const hasSeededInitialRowRef = useRef(false);
  const pendingFocusRef = useRef<FocusTarget | null>(null);
  const {
    closeSearchableSelect,
    handleSearchableSelectInput,
    openSearchCell,
    openSearchableSelect,
    registerSearchInputRef,
    registerSearchSelectRef,
    searchActiveOptionIndex,
    searchQueries,
    searchSelectListRef,
    searchSelectOverlayPosition,
    setActiveOptionIndex,
  } = useItemLinkedRecordsSearchSelect({ cellRefs });
  const updateRows = (nextRows: LinkedRecordRow[]) => {
    onChange(serializeLinkedRecordRows(nextRows));
  };
  const queueFocus = (rowIndex: number, columnKey: string) => {
    pendingFocusRef.current = {
      rowIndex,
      columnKey,
    };
  };
  const registerCellRef =
    (rowIndex: number, columnKey: string) =>
    (element: LinkedRecordCellElement | null) => {
      const cellKey = getCellKey(rowIndex, columnKey);
      if (element) {
        cellRefs.current.set(cellKey, element);
        return;
      }
      cellRefs.current.delete(cellKey);
    };
  useEffect(() => {
    if (!pendingFocusRef.current) {
      return;
    }
    const target = pendingFocusRef.current;
    const element = cellRefs.current.get(
      getCellKey(target.rowIndex, target.columnKey),
    );
    if (!element) {
      return;
    }
    pendingFocusRef.current = null;
    element.focus();
    if (element instanceof HTMLInputElement) {
      element.select();
    }
  }, [rows]);
  useEffect(() => {
    if (
      disabled ||
      !autoCreateFirstRowOnMount ||
      hasSeededInitialRowRef.current ||
      parseError ||
      rows.length > 0
    ) {
      return;
    }
    hasSeededInitialRowRef.current = true;
    const focusColumnKey = resolveFocusColumnKey(
      autoAppendOnEnter,
      columns[0]?.key,
    );
    if (autoFocusInitialRowOnMount && focusColumnKey) {
      queueFocus(0, focusColumnKey);
    }
    updateRows([createRow()]);
  }, [
    autoAppendOnEnter,
    autoCreateFirstRowOnMount,
    columns,
    createRow,
    disabled,
    parseError,
    rows.length,
    autoFocusInitialRowOnMount,
  ]);
  const handleAddRow = () => {
    const focusColumnKey = resolveFocusColumnKey(autoAppendOnEnter);
    if (focusColumnKey) {
      queueFocus(rows.length, focusColumnKey);
    }
    updateRows([...rows, createRow()]);
  };
  const handleRemoveRow = (rowIndex: number) => {
    updateRows(rows.filter((_, index) => index !== rowIndex));
  };
  const handleCellChange = (
    rowIndex: number,
    columnKey: string,
    nextValue: string,
  ) => {
    updateRows(setLinkedRecordRowValue(rows, rowIndex, columnKey, nextValue));
  };
  const handleSearchableSelectChoose = (
    rowIndex: number,
    columnKey: string,
    cellKey: string,
    option: LinkedRecordOption,
  ) => {
    handleCellChange(rowIndex, columnKey, option.value);
    closeSearchableSelect(cellKey);
  };
  const handleAutoAppendRow = (
    rowIndex: number,
    columnKey: string,
    nextValue: string,
  ) => {
    const focusColumnKey = resolveFocusColumnKey(autoAppendOnEnter, columnKey);
    const nextRows = setLinkedRecordRowValue(
      rows,
      rowIndex,
      columnKey,
      nextValue,
    );
    if (!focusColumnKey) {
      updateRows(nextRows);
      return;
    }
    queueFocus(rowIndex + 1, focusColumnKey);
    if (rowIndex < nextRows.length - 1) {
      updateRows(nextRows);
      return;
    }
    updateRows([...nextRows, createRow(nextRows[rowIndex])]);
  };
  const handleInputKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    columnKey: string,
  ) => {
    if (
      disabled ||
      !autoAppendOnEnter ||
      autoAppendOnEnter.columnKey !== columnKey ||
      event.key !== "Enter"
    ) {
      return;
    }
    const nextValue = event.currentTarget.value.trim();
    if (!nextValue) {
      return;
    }
    event.preventDefault();
    handleAutoAppendRow(rowIndex, columnKey, nextValue);
  };
  const handleSearchableSelectKeyDown = (
    event: ReactKeyboardEvent<HTMLElement>,
    rowIndex: number,
    column: LinkedRecordColumn,
    cellValue: string,
    cellKey: string,
    filteredOptions: LinkedRecordOption[],
  ) => {
    if (disabled) {
      return;
    }
    const isSearchOpen = openSearchCell === cellKey;
    const highlightedIndex = searchActiveOptionIndex[cellKey] ?? -1;

    if (event.key === "Escape" && isSearchOpen) {
      event.preventDefault();
      closeSearchableSelect(cellKey);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();

      if (!isSearchOpen) {
        openSearchableSelect(cellKey, filteredOptions, cellValue, 0);
        return;
      }
      setActiveOptionIndex(
        cellKey,
        filteredOptions.length > 0
          ? Math.min(highlightedIndex + 1, filteredOptions.length - 1)
          : -1,
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isSearchOpen) {
        openSearchableSelect(
          cellKey,
          filteredOptions,
          cellValue,
          Math.max(filteredOptions.length - 1, 0),
        );
        return;
      }
      setActiveOptionIndex(
        cellKey,
        filteredOptions.length > 0 ? Math.max(highlightedIndex - 1, 0) : -1,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (!isSearchOpen) {
        openSearchableSelect(cellKey, filteredOptions, cellValue);
        return;
      }
      const nextOption =
        highlightedIndex >= 0
          ? filteredOptions[highlightedIndex]
          : filteredOptions[0];
      if (nextOption) {
        handleSearchableSelectChoose(
          rowIndex,
          column.key,
          cellKey,
          nextOption,
        );
      }
      return;
    }
    if (event.key === " " && !isSearchOpen) {
      event.preventDefault();
      openSearchableSelect(cellKey, filteredOptions, cellValue);
    }
  };
  const renderCellControl = (
    row: LinkedRecordRow,
    rowIndex: number,
    column: LinkedRecordColumn,
  ) => {
    const cellValue = row[column.key] ?? "";
    const cellKey = getCellKey(rowIndex, column.key);
    const columnType = column.type ?? "text";
    const columnOptions = resolveColumnOptions(column, row, rowIndex, rows);
    const isReadOnly = resolveColumnReadOnly(column, row, rowIndex, rows);
    if (columnType === "select" && column.searchable === true) {
      return (
        <ItemLinkedRecordsSearchSelectCell
          activeOptionIndex={searchActiveOptionIndex[cellKey] ?? -1}
          cellKey={cellKey}
          cellValue={cellValue}
          closeSearchableSelect={() => closeSearchableSelect(cellKey)}
          column={column}
          disabled={disabled}
          isOpen={openSearchCell === cellKey}
          options={columnOptions}
          onChoose={(option) =>
            handleSearchableSelectChoose(
              rowIndex,
              column.key,
              cellKey,
              option,
            )
          }
          onInputChange={(query) =>
            handleSearchableSelectInput(cellKey, query)
          }
          onKeyDown={(event, filteredOptions) =>
            handleSearchableSelectKeyDown(
              event,
              rowIndex,
              column,
              cellValue,
              cellKey,
              filteredOptions,
            )
          }
          openSearchableSelect={(options, preferredIndex) =>
            openSearchableSelect(cellKey, options, cellValue, preferredIndex)
          }
          overlayPosition={searchSelectOverlayPosition}
          registerCellRef={registerCellRef}
          registerSearchInputRef={registerSearchInputRef}
          registerSearchSelectRef={registerSearchSelectRef}
          rowIndex={rowIndex}
          searchQuery={searchQueries[cellKey] ?? ""}
          searchSelectListRef={searchSelectListRef}
          setActiveOptionIndex={setActiveOptionIndex}
        />
      );
    }
    if (columnType === "select") {
      return (
        <select
          className={styles.control}
          disabled={disabled || isReadOnly}
          ref={registerCellRef(rowIndex, column.key)}
          value={cellValue}
          onChange={(event) =>
            handleCellChange(
              rowIndex,
              column.key,
              event.currentTarget.value,
            )
          }
        >
          <option value="" hidden={column.placeholder === ""}>
            {getSelectPlaceholder(column)}
          </option>
          {columnOptions.map((option) => (
            <option key={`${column.key}-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    if (columnType === "checkbox") {
      return (
        <label className={styles.checkboxWrap}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={cellValue === "true"}
            disabled={disabled || isReadOnly}
            onChange={(event) =>
              handleCellChange(
                rowIndex,
                column.key,
                event.currentTarget.checked ? "true" : "false",
              )
            }
          />
        </label>
      );
    }
    return (
      <input
        type={columnType}
        className={cx(styles.control, styles.input)}
        disabled={disabled}
        min={column.min}
        readOnly={isReadOnly}
        step={column.step}
        placeholder={column.placeholder}
        ref={registerCellRef(rowIndex, column.key)}
        value={cellValue}
        onChange={(event) =>
          handleCellChange(
            rowIndex,
            column.key,
            event.currentTarget.value,
          )
        }
        onKeyDown={(event) => handleInputKeyDown(event, rowIndex, column.key)}
      />
    );
  };
  return (
    <div className={styles.editor}>
      <div className={styles.toolbar}>
        <span className={styles.summary}>
          {rows.length} {rows.length === 1 ? "row" : "rows"}
        </span>
        <button
          type="button"
          className={styles.addButton}
          disabled={disabled}
          onClick={handleAddRow}
        >
          {addLabel}
        </button>
      </div>
      {parseError ? <p className={styles.parseError}>{parseError}</p> : null}
      {rows.length === 0 ? (
        <div className={styles.emptyState}>{emptyState}</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {showRowIndex ? <th className={styles.indexCell}>#</th> : null}
                {columns.map((column) => (
                  <th
                    key={column.key}
                    style={getColumnStyle(column)}
                  >
                    {column.label}
                  </th>
                ))}
                <th className={styles.actionsCell}>{actionsLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={getRowKey(row, rowIndex)}>
                  {showRowIndex ? (
                    <td className={styles.indexCell}>{rowIndex + 1}</td>
                  ) : null}
                  {columns.map((column) => (
                    <td
                      key={`${column.key}-${rowIndex}`}
                      style={getColumnStyle(column)}
                    >
                      {renderCellControl(row, rowIndex, column)}
                    </td>
                  ))}
                  <td className={styles.actionsCell}>
                    <button
                      type="button"
                      className={styles.removeButton}
                      disabled={disabled}
                      onClick={() => handleRemoveRow(rowIndex)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
