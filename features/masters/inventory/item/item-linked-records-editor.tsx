"use client";
import {
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "@/components/design-system/cx";
import modalStyles from "@/components/design-system/ui/dynamic-modal-form.module.scss";
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
import { Z_MODAL_NESTED } from "@/lib/z-index";
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
  actionsLabel?: string;
  autoCreateFirstRowOnMount?: boolean;
  autoFocusInitialRowOnMount?: boolean;
  autoAppendOnEnter?: LinkedRecordEditorAutoAppendConfig;
  autoAppendOnSelect?: LinkedRecordEditorAutoAppendConfig;
  columnLayoutStorageKey?: string;
  columns: LinkedRecordColumn[];
  createRow: (
    sourceRow?: LinkedRecordRow,
    currentRows?: LinkedRecordRow[],
  ) => LinkedRecordRow;
  disabled?: boolean;
  emptyState: string;
  exclusiveTrueColumnKeys?: string[];
  mutuallyExclusiveTrueColumnKeyGroups?: string[][];
  removeDisabledRowIndexes?: number[];
  /**
   * Row-level removal veto shared by the Remove button and the Ctrl+Minus
   * shortcut — e.g. "the trailing blank placeholder and the last real row can
   * never be removed". Return true to allow removal.
   */
  canRemoveRow?: (
    row: LinkedRecordRow,
    rowIndex: number,
    rows: LinkedRecordRow[],
  ) => boolean;
  onColumnLayoutChange?: (columns: LinkedRecordColumnLayoutEntry[]) => void;
  onChange: (value: string) => void;
  showRowIndex?: boolean;
  value: string;
};
export type LinkedRecordColumnLayoutEntry = {
  key: string;
  label: string;
  position: number;
  visible: boolean;
  focus: boolean;
  necessity: boolean;
  widthPx?: number;
};
type AdminSettingsDraftEntry = {
  visible: boolean;
  focus: boolean;
  necessity: boolean;
};
type FocusTarget = {
  columnKey: string;
  rowIndex: number;
};
type ColumnLayoutState = {
  focus: Record<string, boolean>;
  necessity: Record<string, boolean>;
  order: string[];
  visibility: Record<string, boolean>;
  widths: Record<string, number>;
};
const COLUMN_LAYOUT_STORAGE_PREFIX = "erp:item-linked-records:column-layout:";
const DEFAULT_COLUMN_LAYOUT: ColumnLayoutState = {
  focus: {},
  necessity: {},
  order: [],
  visibility: {},
  widths: {},
};
const MIN_COLUMN_WIDTH_PX = 56;
const HEADER_MENU_ESTIMATED_WIDTH = 190;
const HEADER_MENU_VIEWPORT_PADDING = 8;
const TABLE_SETTINGS_CONTEXT_MENU_HEIGHT = 64;
type HeaderMenuPosition = Pick<CSSProperties, "left" | "top">;
function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
// Native <input type="number"> still lets a user type "e"/"+"/"-", so strip
// anything but digits and a single decimal point instead of trusting it.
function sanitizeNumericCellInput(value: string): string {
  let hasDecimalPoint = false;
  let result = "";
  for (const char of value) {
    if (char >= "0" && char <= "9") {
      result += char;
      continue;
    }
    if (char === "." && !hasDecimalPoint) {
      hasDecimalPoint = true;
      result += char;
    }
  }
  return result;
}
function isColumnVisibleInLayout(
  column: LinkedRecordColumn,
  layout: ColumnLayoutState,
): boolean {
  const configuredVisibility = layout.visibility[column.key];
  return typeof configuredVisibility === "boolean"
    ? configuredVisibility
    : column.hidden !== true;
}
function isColumnFocusedInLayout(
  column: LinkedRecordColumn,
  layout: ColumnLayoutState,
): boolean {
  const configuredFocus = layout.focus[column.key];
  return typeof configuredFocus === "boolean"
    ? configuredFocus
    : column.focus === true;
}
function isColumnNecessaryInLayout(
  column: LinkedRecordColumn,
  layout: ColumnLayoutState,
): boolean {
  const configuredNecessity = layout.necessity[column.key];
  return typeof configuredNecessity === "boolean"
    ? configuredNecessity
    : column.necessity === true;
}
function getColumnAdminSettings(
  column: LinkedRecordColumn,
  layout: ColumnLayoutState,
): AdminSettingsDraftEntry {
  return {
    visible: isColumnVisibleInLayout(column, layout),
    focus: isColumnFocusedInLayout(column, layout),
    necessity: isColumnNecessaryInLayout(column, layout),
  };
}
function buildAdminSettingsDraft(
  columns: LinkedRecordColumn[],
  layout: ColumnLayoutState,
): Record<string, AdminSettingsDraftEntry> {
  return columns.reduce<Record<string, AdminSettingsDraftEntry>>(
    (draft, column) => ({
      ...draft,
      [column.key]: getColumnAdminSettings(column, layout),
    }),
    {},
  );
}
function buildDefaultAdminSettingsDraft(
  columns: LinkedRecordColumn[],
): Record<string, AdminSettingsDraftEntry> {
  return columns.reduce<Record<string, AdminSettingsDraftEntry>>(
    (draft, column) => ({
      ...draft,
      [column.key]: {
        visible: true,
        focus: false,
        necessity: false,
      },
    }),
    {},
  );
}
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
  const visibility: Record<string, boolean> = {};
  const focus: Record<string, boolean> = {};
  const necessity: Record<string, boolean> = {};
  for (const column of columns) {
    const configuredVisibility = layout.visibility[column.key];
    visibility[column.key] =
      typeof configuredVisibility === "boolean"
        ? configuredVisibility
        : column.hidden !== true;
    const configuredFocus = layout.focus[column.key];
    focus[column.key] =
      typeof configuredFocus === "boolean"
        ? configuredFocus
        : column.focus === true;
    const configuredNecessity = layout.necessity[column.key];
    necessity[column.key] =
      typeof configuredNecessity === "boolean"
        ? configuredNecessity
        : column.necessity === true;
  }
  return { focus, necessity, order, visibility, widths };
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
        visibility:
          parsed.visibility &&
          typeof parsed.visibility === "object" &&
          !Array.isArray(parsed.visibility)
            ? Object.entries(parsed.visibility).reduce<Record<string, boolean>>(
                (result, [key, value]) => {
                  if (typeof value === "boolean") {
                    result[key] = value;
                  }
                  return result;
                },
                {},
              )
            : {},
        focus:
          parsed.focus &&
          typeof parsed.focus === "object" &&
          !Array.isArray(parsed.focus)
            ? Object.entries(parsed.focus).reduce<Record<string, boolean>>(
                (result, [key, value]) => {
                  if (typeof value === "boolean") {
                    result[key] = value;
                  }
                  return result;
                },
                {},
              )
            : {},
        necessity:
          parsed.necessity &&
          typeof parsed.necessity === "object" &&
          !Array.isArray(parsed.necessity)
            ? Object.entries(parsed.necessity).reduce<Record<string, boolean>>(
                (result, [key, value]) => {
                  if (typeof value === "boolean") {
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
  actionsLabel = "Actions",
  autoCreateFirstRowOnMount = false,
  autoFocusInitialRowOnMount = true,
  autoAppendOnEnter,
  autoAppendOnSelect,
  columnLayoutStorageKey,
  columns,
  createRow,
  disabled = false,
  emptyState,
  exclusiveTrueColumnKeys = [],
  mutuallyExclusiveTrueColumnKeyGroups = [],
  removeDisabledRowIndexes = [],
  canRemoveRow,
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
  const [openBodyMenuPosition, setOpenBodyMenuPosition] =
    useState<HeaderMenuPosition | null>(null);
  const [isAdminSettingsOpen, setIsAdminSettingsOpen] = useState(false);
  const [adminSettingsDraft, setAdminSettingsDraft] = useState<
    Record<string, AdminSettingsDraftEntry>
  >({});
  const [dragOverColumnKey, setDragOverColumnKey] = useState<string | null>(null);
  const isColumnLayoutEnabled = Boolean(columnLayoutStorageKey);
  const columnKeysSignature = useMemo(
    () =>
      columns
        .map(
          (column) =>
            `${column.key}:${column.hidden === true ? "hidden" : "visible"}:${column.focus === true ? "focus" : "skip"}:${column.necessity === true ? "necessary" : "optional"}`,
        )
        .join("|"),
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
    (layout: ColumnLayoutState, changedColumnKeys?: Set<string>) => {
      if (!onColumnLayoutChange) {
        return;
      }
      const nextColumns = applyColumnLayout(
        columns,
        normalizeColumnLayout(layout, columns),
      );
      onColumnLayoutChange(
        nextColumns
          .map((column, index) => ({
            key: column.key,
            label: column.label,
            position: index + 1,
            visible: isColumnVisibleInLayout(column, layout),
            focus: isColumnFocusedInLayout(column, layout),
            necessity: isColumnNecessaryInLayout(column, layout),
            widthPx: layout.widths[column.key],
          }))
          .filter(
            (column) =>
              !changedColumnKeys || changedColumnKeys.has(column.key),
          ),
      );
    },
    [columns, onColumnLayoutChange],
  );
  const updateColumnLayout = useCallback(
    (
      updater: (current: ColumnLayoutState) => ColumnLayoutState,
      options: { changedColumnKeys?: string[]; notify?: boolean } = {},
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
        notifyColumnLayoutChange(
          nextLayout,
          options.changedColumnKeys
            ? new Set(options.changedColumnKeys)
            : undefined,
        );
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
  const visibleColumns = useMemo(
    () =>
      orderedColumns.filter((column) =>
        isColumnVisibleInLayout(column, columnLayout),
      ),
    [columnLayout, orderedColumns],
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
  useEffect(() => {
    if (openBodyMenuPosition === null) {
      return;
    }
    const handlePointerDown = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-item-linked-body-menu-root="true"]')) {
        return;
      }
      setOpenBodyMenuPosition(null);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.key === "Escape") {
        setOpenBodyMenuPosition(null);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [openBodyMenuPosition]);
  useEffect(() => {
    if (openBodyMenuPosition === null) {
      return;
    }
    const closeBodyMenu = () => setOpenBodyMenuPosition(null);
    window.addEventListener("resize", closeBodyMenu);
    window.addEventListener("scroll", closeBodyMenu, true);
    return () => {
      window.removeEventListener("resize", closeBodyMenu);
      window.removeEventListener("scroll", closeBodyMenu, true);
    };
  }, [openBodyMenuPosition]);
  const handleBodyRowContextMenu = (
    event: ReactMouseEvent<HTMLTableRowElement>,
  ) => {
    if (!isColumnLayoutEnabled || disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setOpenBodyMenuPosition({
      left: clamp(
        event.clientX,
        HEADER_MENU_VIEWPORT_PADDING,
        window.innerWidth - HEADER_MENU_ESTIMATED_WIDTH,
      ),
      top: clamp(
        event.clientY,
        HEADER_MENU_VIEWPORT_PADDING,
        window.innerHeight - TABLE_SETTINGS_CONTEXT_MENU_HEIGHT,
      ),
    });
  };
  const openAdminSettings = () => {
    setOpenBodyMenuPosition(null);
    setAdminSettingsDraft(buildAdminSettingsDraft(orderedColumns, columnLayout));
    setIsAdminSettingsOpen(true);
  };
  const closeAdminSettings = () => {
    setIsAdminSettingsOpen(false);
  };
  // Escape must only dismiss this nested dialog. The enclosing dynamic modal
  // form listens for Escape on `window` and closes itself, so without our own
  // handler the keypress fell through and tore down the whole Item Master
  // modal, discarding unsaved edits. Marking the event handled is what stops
  // it: that listener bails on `event.defaultPrevented`.
  //
  // Listen on the capture phase: the parent's listener is on the same target
  // and was registered first (it mounts before this dialog opens), so a bubble
  // -phase listener here would run second — too late to stop it.
  useEffect(() => {
    if (!isAdminSettingsOpen) {
      return;
    }
    const handleAdminSettingsEscape = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      closeAdminSettings();
    };
    window.addEventListener("keydown", handleAdminSettingsEscape, true);
    return () => {
      window.removeEventListener("keydown", handleAdminSettingsEscape, true);
    };
  }, [isAdminSettingsOpen]);
  const handleAdminSettingsChange = (
    columnKey: string,
    field: keyof AdminSettingsDraftEntry,
    checked: boolean,
  ) => {
    setAdminSettingsDraft((current) => ({
      ...current,
      [columnKey]: {
        ...(current[columnKey] ?? {
          visible: true,
          focus: false,
          necessity: false,
        }),
        [field]: checked,
      },
    }));
  };
  const handleDefaultAdminSettings = () => {
    setAdminSettingsDraft(buildDefaultAdminSettingsDraft(orderedColumns));
  };
  const handleSaveAdminSettings = useCallback(() => {
    const changedColumnKeys = orderedColumns.map((column) => column.key);
    updateColumnLayout(
      (current) => {
        const nextVisibility = { ...current.visibility };
        const nextFocus = { ...current.focus };
        const nextNecessity = { ...current.necessity };
        for (const column of orderedColumns) {
          const draft =
            adminSettingsDraft[column.key] ??
            getColumnAdminSettings(column, current);
          nextVisibility[column.key] = draft.visible;
          nextFocus[column.key] = draft.focus;
          nextNecessity[column.key] = draft.necessity;
        }
        return {
          ...current,
          focus: nextFocus,
          necessity: nextNecessity,
          visibility: nextVisibility,
        };
      },
      { changedColumnKeys, notify: true },
    );
    setIsAdminSettingsOpen(false);
  }, [adminSettingsDraft, orderedColumns, updateColumnLayout]);
  useEffect(() => {
    if (!isAdminSettingsOpen) {
      return;
    }
    const handleAdminSettingsKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAdminSettings();
      }
      if (event.key === "F5") {
        event.preventDefault();
        handleSaveAdminSettings();
      }
    };
    window.addEventListener("keydown", handleAdminSettingsKeyDown);
    return () => {
      window.removeEventListener("keydown", handleAdminSettingsKeyDown);
    };
  }, [handleSaveAdminSettings, isAdminSettingsOpen]);
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
      visibleColumns[0]?.key,
    );
    if (autoFocusInitialRowOnMount && focusColumnKey) {
      queueFocus(0, focusColumnKey);
    }
    updateRows([createRow(undefined, [])]);
  }, [
    autoAppendOnEnter,
    autoCreateFirstRowOnMount,
    createRow,
    disabled,
    parseError,
    rows.length,
    autoFocusInitialRowOnMount,
    visibleColumns,
  ]);
  const isRowRemovable = (rowIndex: number): boolean => {
    if (removeDisabledRowIndexes.includes(rowIndex)) {
      return false;
    }
    const row = rows[rowIndex];
    if (!row) {
      return false;
    }
    return canRemoveRow ? canRemoveRow(row, rowIndex, rows) : true;
  };
  const handleRemoveRow = (rowIndex: number) => {
    if (!isRowRemovable(rowIndex)) {
      return;
    }
    updateRows(rows.filter((_, index) => index !== rowIndex));
  };
  // Ctrl+Minus removes the row the focused cell belongs to, honoring the same
  // refusal rules as the Remove button (it silently no-ops on protected rows,
  // e.g. the trailing blank placeholder).
  const handleEditorKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      disabled ||
      !event.ctrlKey ||
      event.altKey ||
      event.shiftKey ||
      (event.key !== "-" && event.key !== "Subtract")
    ) {
      return;
    }
    const rowElement = (event.target as HTMLElement | null)?.closest?.(
      "tr[data-linked-row-index]",
    );
    const rowIndex = Number(rowElement?.getAttribute("data-linked-row-index"));
    if (!Number.isInteger(rowIndex)) {
      return;
    }
    event.preventDefault();
    handleRemoveRow(rowIndex);
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
        { changedColumnKeys: [column.key], notify: true },
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
    const previousValue = rows[rowIndex]?.[columnKey] ?? "";
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
    if (
      !disabled &&
      autoAppendOnSelect?.columnKey === columnKey &&
      rowIndex === nextRows.length - 1 &&
      nextValue.trim() !== "" &&
      nextValue !== previousValue
    ) {
      nextRows = [...nextRows, createRow(nextRows[rowIndex], nextRows)];
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
    window.requestAnimationFrame(() => {
      cellRefs.current.get(cellKey)?.focus();
    });
  };
  const focusNextCellControl = (rowIndex: number, columnKey: string) => {
    const columnKeys = visibleColumns.map((column) => column.key);
    const currentColumnIndex = columnKeys.indexOf(columnKey);
    if (currentColumnIndex < 0) {
      return;
    }
    for (
      let targetRowIndex = rowIndex;
      targetRowIndex < rows.length;
      targetRowIndex += 1
    ) {
      const startColumnIndex =
        targetRowIndex === rowIndex ? currentColumnIndex + 1 : 0;
      for (
        let targetColumnIndex = startColumnIndex;
        targetColumnIndex < columnKeys.length;
        targetColumnIndex += 1
      ) {
        const element = cellRefs.current.get(
          getCellKey(targetRowIndex, columnKeys[targetColumnIndex]),
        );
        if (!element || element.disabled) {
          continue;
        }
        element.focus();
        if (element instanceof HTMLInputElement) {
          element.select();
        }
        return;
      }
    }
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
    updateRows([...nextRows, createRow(nextRows[rowIndex], nextRows)]);
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
        if (cellValue) {
          focusNextCellControl(rowIndex, column.key);
          return;
        }
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
            columnType === "number"
              ? sanitizeNumericCellInput(event.currentTarget.value)
              : event.currentTarget.value,
          )
        }
        onKeyDown={(event) => handleInputKeyDown(event, rowIndex, boundColumnKey)}
      />
    );
  };
  const bodyMenu =
    openBodyMenuPosition && typeof document !== "undefined"
      ? createPortal(
          <div
            className={styles.headerContextMenu}
            data-item-linked-body-menu-root="true"
            style={openBodyMenuPosition}
            role="menu"
            aria-label="Table actions"
          >
            <button
              type="button"
              role="menuitem"
              className={styles.headerContextMenuItem}
              onClick={openAdminSettings}
            >
              <span>Admin settings</span>
            </button>
          </div>,
          document.body,
        )
      : null;
  const adminSettingsModal =
    isAdminSettingsOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className={modalStyles.overlay}
            style={
              {
                "--erp-modal-overlay-z-index": Z_MODAL_NESTED,
                "--erp-modal-accent": "var(--ds-primary, #0f74c9)",
              } as CSSProperties
            }
          >
            <div
              className={modalStyles.backdrop}
              onClick={closeAdminSettings}
              aria-hidden
            />
            <section
              className={cx(modalStyles.panel, styles.adminSettingsPanel)}
              role="dialog"
              aria-modal="true"
              aria-labelledby="item-linked-table-settings-title"
            >
              <header className={modalStyles.header}>
                <div className={modalStyles.headerRow}>
                  <div className={modalStyles.headerIntro}>
                    <span className={modalStyles.headerIcon} aria-hidden="true">
                      <svg viewBox="0 0 24 24" focusable="false">
                        <path
                          d="M4 5h16M4 12h16M4 19h16"
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeWidth="1.8"
                        />
                        <path
                          d="M8 5v14M16 5v14"
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeWidth="1.4"
                        />
                      </svg>
                    </span>
                    <div className={modalStyles.headerText}>
                      <h3
                        id="item-linked-table-settings-title"
                        className={modalStyles.headerTitle}
                      >
                        Table Settings
                      </h3>
                      <p className={modalStyles.headerDescription}>
                        Configure linked table columns.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={modalStyles.closeButton}
                    onClick={closeAdminSettings}
                    aria-label="Close modal"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className={modalStyles.closeIcon}
                    >
                      <path
                        d="M6 18 18 6M6 6l12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeWidth="1.8"
                      />
                    </svg>
                  </button>
                </div>
              </header>
              <div
                className={cx(modalStyles.scrollArea, styles.adminSettingsScrollArea)}
                data-erp-modal-scroll-area="true"
              >
                <div className={styles.adminSettingsTableWrap}>
                  <table className={styles.adminSettingsTable}>
                    <thead>
                      <tr>
                        <th className={styles.adminSettingsNumberHeader} />
                        <th>Column Name</th>
                        <th>Visible</th>
                        <th>Focus</th>
                        <th>Necessity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderedColumns.map((column, index) => {
                        const draft =
                          adminSettingsDraft[column.key] ??
                          getColumnAdminSettings(column, columnLayout);
                        return (
                          <tr key={column.key}>
                            <td className={styles.adminSettingsNumberCell}>
                              {index + 1}
                            </td>
                            <td className={styles.adminSettingsNameCell}>
                              {column.label}
                            </td>
                            <td>
                              <input
                                type="checkbox"
                                checked={draft.visible}
                                onChange={(event) =>
                                  handleAdminSettingsChange(
                                    column.key,
                                    "visible",
                                    event.currentTarget.checked,
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="checkbox"
                                checked={draft.focus}
                                onChange={(event) =>
                                  handleAdminSettingsChange(
                                    column.key,
                                    "focus",
                                    event.currentTarget.checked,
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="checkbox"
                                checked={draft.necessity}
                                onChange={(event) =>
                                  handleAdminSettingsChange(
                                    column.key,
                                    "necessity",
                                    event.currentTarget.checked,
                                  )
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <footer className={modalStyles.footer}>
                <div className={modalStyles.footerActions}>
                  <button
                    type="button"
                    className={cx(
                      modalStyles.cancelButton,
                      styles.adminSettingsDefaultButton,
                    )}
                    onClick={handleDefaultAdminSettings}
                  >
                    Default
                  </button>
                  <button
                    type="button"
                    className={modalStyles.cancelButton}
                    onClick={closeAdminSettings}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className={cx(
                      modalStyles.submitButton,
                      modalStyles.submitButtonSave,
                    )}
                    onClick={handleSaveAdminSettings}
                  >
                    Save
                  </button>
                </div>
              </footer>
            </section>
          </div>,
          document.body,
        )
      : null;
  return (
    <>
      {bodyMenu}
      {adminSettingsModal}
      <div className={styles.editor} onKeyDown={handleEditorKeyDown}>
        {parseError ? <p className={styles.parseError}>{parseError}</p> : null}
        {rows.length === 0 ? (
          <div className={styles.emptyState}>{emptyState}</div>
        ) : (
          <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {showRowIndex ? <th className={styles.indexCell}>#</th> : null}
                {visibleColumns.map((column) => (
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
                <tr
                  key={getRowKey(row, rowIndex)}
                  data-linked-row-index={rowIndex}
                  onContextMenu={handleBodyRowContextMenu}
                >
                  {showRowIndex ? (
                    <td className={styles.indexCell}>{rowIndex + 1}</td>
                  ) : null}
                  {visibleColumns.map((column) => (
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
                      disabled={disabled || !isRowRemovable(rowIndex)}
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
    </>
  );
}
