"use client";
import {
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  columnLayoutStorageKey?: string;
  columns: LinkedRecordColumn[];
  createRow: (sourceRow?: LinkedRecordRow) => LinkedRecordRow;
  disabled?: boolean;
  emptyState: string;
  exclusiveTrueColumnKeys?: string[];
  mutuallyExclusiveTrueColumnKeyGroups?: string[][];
  removeDisabledRowIndexes?: number[];
  onColumnLayoutChange?: (columns: LinkedRecordColumnLayoutEntry[]) => void;
  onChange: (value: string) => void;
  showRowIndex?: boolean;
  value: string;
};
export type LinkedRecordColumnLayoutEntry = {
  key: string;
  label: string;
  position: number;
  widthPx?: number;
};
type FocusTarget = {
  columnKey: string;
  rowIndex: number;
};
type ColumnLayoutState = {
  order: string[];
  widths: Record<string, number>;
};
const COLUMN_LAYOUT_STORAGE_PREFIX = "erp:item-linked-records:column-layout:";
const DEFAULT_COLUMN_LAYOUT: ColumnLayoutState = {
  order: [],
  widths: {},
};
const MIN_COLUMN_WIDTH_PX = 56;
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
function normalizeColumnLayout(
  layout: ColumnLayoutState,
  columns: LinkedRecordColumn[],
): ColumnLayoutState {
  const columnKeys = columns.map((column) => column.key);
  const columnKeySet = new Set(columnKeys);
  const order = layout.order.filter((columnKey) => columnKeySet.has(columnKey));
  for (const columnKey of columnKeys) {
    if (!order.includes(columnKey)) {
      order.push(columnKey);
    }
  }
  const widths: Record<string, number> = {};
  for (const [columnKey, width] of Object.entries(layout.widths)) {
    if (!columnKeySet.has(columnKey) || !Number.isFinite(width)) {
      continue;
    }
    widths[columnKey] = Math.max(MIN_COLUMN_WIDTH_PX, Math.round(width));
  }
  return { order, widths };
}
function readColumnLayout(
  storageKey: string,
  columns: LinkedRecordColumn[],
): ColumnLayoutState {
  if (typeof window === "undefined") {
    return normalizeColumnLayout(DEFAULT_COLUMN_LAYOUT, columns);
  }
  try {
    const rawValue = window.localStorage.getItem(
      `${COLUMN_LAYOUT_STORAGE_PREFIX}${storageKey}`,
    );
    if (!rawValue) {
      return normalizeColumnLayout(DEFAULT_COLUMN_LAYOUT, columns);
    }
    const parsed = JSON.parse(rawValue) as Partial<ColumnLayoutState>;
    return normalizeColumnLayout(
      {
        order: Array.isArray(parsed.order)
          ? parsed.order.filter((value): value is string => typeof value === "string")
          : [],
        widths:
          parsed.widths && typeof parsed.widths === "object" && !Array.isArray(parsed.widths)
            ? Object.entries(parsed.widths).reduce<Record<string, number>>(
                (result, [key, value]) => {
                  if (typeof value === "number" && Number.isFinite(value)) {
                    result[key] = value;
                  }
                  return result;
                },
                {},
              )
            : {},
      },
      columns,
    );
  } catch {
    return normalizeColumnLayout(DEFAULT_COLUMN_LAYOUT, columns);
  }
}
function writeColumnLayout(storageKey: string, layout: ColumnLayoutState) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      `${COLUMN_LAYOUT_STORAGE_PREFIX}${storageKey}`,
      JSON.stringify(layout),
    );
  } catch {
    // Column layout persistence is optional.
  }
}
function applyColumnLayout(
  columns: LinkedRecordColumn[],
  layout: ColumnLayoutState,
): LinkedRecordColumn[] {
  if (layout.order.length === 0) {
    return columns;
  }
  const columnsByKey = new Map(columns.map((column) => [column.key, column]));
  const orderedColumns = layout.order
    .map((columnKey) => columnsByKey.get(columnKey))
    .filter((column): column is LinkedRecordColumn => Boolean(column));
  const orderedKeys = new Set(orderedColumns.map((column) => column.key));
  return [
    ...orderedColumns,
    ...columns.filter((column) => !orderedKeys.has(column.key)),
  ];
}
export default function ItemLinkedRecordsEditor({
  addLabel,
  actionsLabel = "Actions",
  autoCreateFirstRowOnMount = false,
  autoFocusInitialRowOnMount = true,
  autoAppendOnEnter,
  columnLayoutStorageKey,
  columns,
  createRow,
  disabled = false,
  emptyState,
  exclusiveTrueColumnKeys = [],
  mutuallyExclusiveTrueColumnKeyGroups = [],
  removeDisabledRowIndexes = [],
  onColumnLayoutChange,
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
  const draggingColumnKeyRef = useRef<string | null>(null);
  const [columnLayout, setColumnLayout] = useState<ColumnLayoutState>(
    DEFAULT_COLUMN_LAYOUT,
  );
  const columnLayoutRef = useRef<ColumnLayoutState>(DEFAULT_COLUMN_LAYOUT);
  const [dragOverColumnKey, setDragOverColumnKey] = useState<string | null>(null);
  const isColumnLayoutEnabled = Boolean(columnLayoutStorageKey);
  const columnKeysSignature = useMemo(
    () => columns.map((column) => column.key).join("|"),
    [columns],
  );
  useEffect(() => {
    if (!columnLayoutStorageKey) {
      columnLayoutRef.current = DEFAULT_COLUMN_LAYOUT;
      setColumnLayout(DEFAULT_COLUMN_LAYOUT);
      return;
    }
    const nextLayout = readColumnLayout(columnLayoutStorageKey, columns);
    columnLayoutRef.current = nextLayout;
    setColumnLayout(nextLayout);
  }, [columnLayoutStorageKey, columnKeysSignature]);
  const notifyColumnLayoutChange = useCallback(
    (layout: ColumnLayoutState) => {
      if (!onColumnLayoutChange) {
        return;
      }
      const nextColumns = applyColumnLayout(
        columns,
        normalizeColumnLayout(layout, columns),
      );
      onColumnLayoutChange(
        nextColumns.map((column, index) => ({
          key: column.key,
          label: column.label,
          position: index + 1,
          widthPx: layout.widths[column.key],
        })),
      );
    },
    [columns, onColumnLayoutChange],
  );
  const updateColumnLayout = useCallback(
    (
      updater: (current: ColumnLayoutState) => ColumnLayoutState,
      options: { notify?: boolean } = {},
    ) => {
      if (!columnLayoutStorageKey) {
        return;
      }
      const nextLayout = normalizeColumnLayout(
        updater(normalizeColumnLayout(columnLayoutRef.current, columns)),
        columns,
      );
      columnLayoutRef.current = nextLayout;
      writeColumnLayout(columnLayoutStorageKey, nextLayout);
      setColumnLayout(nextLayout);
      if (options.notify) {
        notifyColumnLayoutChange(nextLayout);
      }
    },
    [columnLayoutStorageKey, columns, notifyColumnLayoutChange],
  );
  const orderedColumns = useMemo(
    () =>
      isColumnLayoutEnabled
        ? applyColumnLayout(columns, columnLayout)
        : columns,
    [columnLayout, columns, isColumnLayoutEnabled],
  );
  const getResolvedColumnStyle = useCallback(
    (column: LinkedRecordColumn) => {
      const width = columnLayout.widths[column.key];
      if (isColumnLayoutEnabled && width) {
        return {
          width: `${width}px`,
          minWidth: `${width}px`,
        };
      }
      return getColumnStyle(column);
    },
    [columnLayout.widths, isColumnLayoutEnabled],
  );
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
      orderedColumns[0]?.key,
    );
    if (autoFocusInitialRowOnMount && focusColumnKey) {
      queueFocus(0, focusColumnKey);
    }
    updateRows([createRow()]);
  }, [
    autoAppendOnEnter,
    autoCreateFirstRowOnMount,
    createRow,
    disabled,
    orderedColumns,
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
    if (removeDisabledRowIndexes.includes(rowIndex)) {
      return;
    }
    updateRows(rows.filter((_, index) => index !== rowIndex));
  };
  const handleColumnResizePointerDown = (
    event: ReactPointerEvent<HTMLSpanElement>,
    column: LinkedRecordColumn,
  ) => {
    if (!isColumnLayoutEnabled || !columnLayoutStorageKey) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const headerCell = event.currentTarget.closest("th");
    const startWidth =
      headerCell instanceof HTMLElement
        ? headerCell.getBoundingClientRect().width
        : MIN_COLUMN_WIDTH_PX;
    const startX = event.clientX;
    let latestWidth = startWidth;
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.max(
        MIN_COLUMN_WIDTH_PX,
        Math.round(startWidth + moveEvent.clientX - startX),
      );
      latestWidth = nextWidth;
      updateColumnLayout((current) => ({
        ...current,
        widths: {
          ...current.widths,
          [column.key]: nextWidth,
        },
      }));
    };
    const handlePointerUp = () => {
      updateColumnLayout(
        (current) => ({
          ...current,
          widths: {
            ...current.widths,
            [column.key]: latestWidth,
          },
        }),
        { notify: true },
      );
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };
  const handleColumnDragStart = (
    event: ReactDragEvent<HTMLTableCellElement>,
    columnKey: string,
  ) => {
    if (!isColumnLayoutEnabled || disabled) {
      event.preventDefault();
      return;
    }
    draggingColumnKeyRef.current = columnKey;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", columnKey);
  };
  const handleColumnDragOver = (
    event: ReactDragEvent<HTMLTableCellElement>,
    columnKey: string,
  ) => {
    const draggingColumnKey = draggingColumnKeyRef.current;
    if (
      !isColumnLayoutEnabled ||
      !draggingColumnKey ||
      draggingColumnKey === columnKey
    ) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverColumnKey(columnKey);
  };
  const handleColumnDrop = (
    event: ReactDragEvent<HTMLTableCellElement>,
    targetColumnKey: string,
  ) => {
    const sourceColumnKey =
      draggingColumnKeyRef.current || event.dataTransfer.getData("text/plain");
    if (
      !isColumnLayoutEnabled ||
      !sourceColumnKey ||
      sourceColumnKey === targetColumnKey
    ) {
      return;
    }
    event.preventDefault();
    updateColumnLayout((current) => {
      const nextOrder = applyColumnLayout(columns, current).map((column) => column.key);
      const sourceIndex = nextOrder.indexOf(sourceColumnKey);
      const targetIndex = nextOrder.indexOf(targetColumnKey);
      if (sourceIndex < 0 || targetIndex < 0) {
        return current;
      }
      const [movedColumnKey] = nextOrder.splice(sourceIndex, 1);
      if (!movedColumnKey) {
        return current;
      }
      const nextTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      nextOrder.splice(nextTargetIndex, 0, movedColumnKey);
      return {
        ...current,
        order: nextOrder,
      };
    }, { notify: true });
    draggingColumnKeyRef.current = null;
    setDragOverColumnKey(null);
  };
  const handleColumnDragEnd = () => {
    draggingColumnKeyRef.current = null;
    setDragOverColumnKey(null);
  };
  const handleCellChange = (
    rowIndex: number,
    columnKey: string,
    nextValue: string,
  ) => {
    let nextRows = setLinkedRecordRowValue(rows, rowIndex, columnKey, nextValue);
    if (nextValue === "true") {
      const conflictingKeys = new Set(
        mutuallyExclusiveTrueColumnKeyGroups
          .filter((group) => group.includes(columnKey))
          .flatMap((group) => group.filter((key) => key !== columnKey)),
      );
      if (conflictingKeys.size > 0) {
        nextRows = nextRows.map((row, index) =>
          index !== rowIndex
            ? row
            : Array.from(conflictingKeys).reduce<LinkedRecordRow>(
                (nextRow, key) => ({
                  ...nextRow,
                  [key]: "false",
                }),
                row,
              ),
        );
      }
      if (exclusiveTrueColumnKeys.includes(columnKey)) {
        nextRows = nextRows.map((row, index) =>
          index === rowIndex
            ? row
            : {
                ...row,
                [columnKey]: "false",
              },
        );
      }
    }
    updateRows(nextRows);
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
    const boundColumnKey = column.bindingKey ?? column.key;
    const cellValue = row[boundColumnKey] ?? "";
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
              boundColumnKey,
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
              boundColumnKey,
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
                boundColumnKey,
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
            boundColumnKey,
            event.currentTarget.value,
          )
        }
        onKeyDown={(event) => handleInputKeyDown(event, rowIndex, boundColumnKey)}
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
                {orderedColumns.map((column) => (
                  <th
                    key={column.key}
                    className={cx(
                      styles.columnHeader,
                      isColumnLayoutEnabled && !disabled && styles.columnHeaderDraggable,
                      dragOverColumnKey === column.key && styles.columnHeaderDragOver,
                    )}
                    draggable={isColumnLayoutEnabled && !disabled}
                    style={getResolvedColumnStyle(column)}
                    onDragStart={(event) => handleColumnDragStart(event, column.key)}
                    onDragOver={(event) => handleColumnDragOver(event, column.key)}
                    onDrop={(event) => handleColumnDrop(event, column.key)}
                    onDragEnd={handleColumnDragEnd}
                  >
                    <span className={styles.columnHeaderLabel}>{column.label}</span>
                    {isColumnLayoutEnabled ? (
                      <span
                        aria-label={`Resize ${column.label}`}
                        className={styles.columnResizeHandle}
                        draggable={false}
                        role="separator"
                        tabIndex={-1}
                        onDragStart={(event) => event.preventDefault()}
                        onPointerDown={(event) =>
                          handleColumnResizePointerDown(event, column)
                        }
                      />
                    ) : null}
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
                  {orderedColumns.map((column) => (
                    <td
                      key={`${column.key}-${rowIndex}`}
                      style={getResolvedColumnStyle(column)}
                    >
                      {renderCellControl(row, rowIndex, column)}
                    </td>
                  ))}
                  <td className={styles.actionsCell}>
                    <button
                      type="button"
                      className={styles.removeButton}
                      disabled={disabled || removeDisabledRowIndexes.includes(rowIndex)}
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
