import type { CSSProperties } from "react";
export type LinkedRecordRow = Record<string, string>;
export type LinkedRecordOption = {
  label: string;
  value: string;
};
export type LinkedRecordColumnOptionsResolverParams = {
  column: LinkedRecordColumn;
  row: LinkedRecordRow;
  rowIndex: number;
  rows: LinkedRecordRow[];
};
export type LinkedRecordColumn = {
  key: string;
  bindingKey?: string;
  label: string;
  type?: "text" | "number" | "select" | "checkbox";
  placeholder?: string;
  readOnly?: boolean;
  readOnlyResolver?: (
    params: LinkedRecordColumnOptionsResolverParams,
  ) => boolean;
  searchable?: boolean;
  hidden?: boolean;
  focus?: boolean;
  necessity?: boolean;
  options?: LinkedRecordOption[];
  optionsResolver?: (
    params: LinkedRecordColumnOptionsResolverParams,
  ) => LinkedRecordOption[];
  min?: number | string;
  step?: number | string;
  width?: string;
  /** The name Table Settings lists the column by, when the heading alone is ambiguous. */
  settingsLabel?: string;
  /** A number cell that takes a leading "-" (a Profit % below cost). */
  allowNegative?: boolean;
  /**
   * Why this cell cannot be typed in ("" = it can): the cell turns read-only,
   * reads as fixed, and the reason is its tooltip.
   */
  lockReasonResolver?: (params: LinkedRecordColumnOptionsResolverParams) => string;
  /** A small ↑ / ↓ beside the figure (moved since the record was opened). */
  cellMarkResolver?: (
    params: LinkedRecordColumnOptionsResolverParams,
  ) => LinkedRecordCellMark | null;
};
export type LinkedRecordCellMark = {
  direction: "up" | "down";
  title?: string;
};
export type LinkedRecordHeaderBand = {
  key: string;
  /** The columns the band names; it spans the run of them that is visible side by side. */
  columnKeys: string[];
  text: string;
  fg: string;
  bg: string;
};
export type LinkedRecordCellElement =
  | HTMLButtonElement
  | HTMLInputElement
  | HTMLSelectElement;
export type SearchSelectOverlayPosition = CSSProperties & {
  "--search-select-options-max-height": string;
};
export type ParsedLinkedRecordRowsResult = {
  parseError: string | null;
  rows: LinkedRecordRow[];
};
export const SEARCH_SELECT_VIEWPORT_PADDING = 12;
export const SEARCH_SELECT_OFFSET = 4;
const ROW_ID_KEYS = ["iuc_id", "ipm_id", "ir_id", "ean_id"] as const;
function toStringValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return "";
}
function normalizeRow(value: unknown): LinkedRecordRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return Object.entries(value as Record<string, unknown>).reduce<LinkedRecordRow>(
    (result, [key, entryValue]) => {
      result[key] = toStringValue(entryValue);
      return result;
    },
    {},
  );
}
export function getCellKey(rowIndex: number, columnKey: string): string {
  return `${rowIndex}:${columnKey}`;
}
export function getColumnStyle(
  column: LinkedRecordColumn,
): CSSProperties | undefined {
  if (!column.width) {
    return undefined;
  }
  return {
    width: column.width,
    minWidth: column.width,
  };
}
export function getRowKey(row: LinkedRecordRow, rowIndex: number): string {
  const rowId = ROW_ID_KEYS.map((key) => row[key]).find(Boolean);
  return `${rowId ?? "row"}-${rowIndex}`;
}
export function getSelectPlaceholder(column: LinkedRecordColumn): string {
  return column.placeholder ?? `Select ${column.label}`;
}
export function buildColumnOptions(
  column: LinkedRecordColumn,
  options: LinkedRecordOption[] = column.options ?? [],
): LinkedRecordOption[] {
  if (column.placeholder === "") {
    return options;
  }
  if (options.some((option) => option.value === "")) {
    return options;
  }
  return [
    {
      value: "",
      label: getSelectPlaceholder(column),
    },
    ...options,
  ];
}
export function filterColumnOptions(
  options: LinkedRecordOption[],
  query: string | undefined,
): LinkedRecordOption[] {
  const normalizedQuery = (query ?? "").trim().toLowerCase();
  if (!normalizedQuery) {
    return options;
  }
  return options.filter((option) => {
    const normalizedLabel = option.label.toLowerCase();
    const normalizedValue = option.value.toLowerCase();
    return (
      normalizedLabel.includes(normalizedQuery) ||
      normalizedValue.includes(normalizedQuery)
    );
  });
}
export function resolveColumnOptions(
  column: LinkedRecordColumn,
  row: LinkedRecordRow,
  rowIndex: number,
  rows: LinkedRecordRow[],
): LinkedRecordOption[] {
  return column.optionsResolver
    ? column.optionsResolver({
        column,
        row,
        rowIndex,
        rows,
      })
    : (column.options ?? []);
}
export function resolveColumnReadOnly(
  column: LinkedRecordColumn,
  row: LinkedRecordRow,
  rowIndex: number,
  rows: LinkedRecordRow[],
): boolean {
  if (column.readOnly === true) {
    return true;
  }
  if (resolveColumnLockReason(column, row, rowIndex, rows)) {
    return true;
  }
  return column.readOnlyResolver
    ? column.readOnlyResolver({
        column,
        row,
        rowIndex,
        rows,
      })
    : false;
}
export function resolveColumnLockReason(
  column: LinkedRecordColumn,
  row: LinkedRecordRow,
  rowIndex: number,
  rows: LinkedRecordRow[],
): string {
  return column.lockReasonResolver?.({ column, row, rowIndex, rows }) ?? "";
}
/**
 * The header's band row: one cell per run of adjacent visible columns that
 * belong to the same band, and one blank cell per run that belongs to none.
 * null when no visible column is under a band (the row is then not drawn).
 */
export function buildLinkedRecordBandCells(
  visibleColumnKeys: readonly string[],
  bands: readonly LinkedRecordHeaderBand[],
): Array<{ key: string; span: number; band: LinkedRecordHeaderBand | null }> | null {
  const cells: Array<{ key: string; span: number; band: LinkedRecordHeaderBand | null }> = [];
  let anyBand = false;
  for (const columnKey of visibleColumnKeys) {
    const band = bands.find((candidate) => candidate.columnKeys.includes(columnKey)) ?? null;
    anyBand ||= band !== null;
    const last = cells[cells.length - 1];
    if (last && last.band === band) {
      last.span += 1;
      continue;
    }
    cells.push({ key: `${band?.key ?? "gap"}:${cells.length}`, span: 1, band });
  }
  return anyBand ? cells : null;
}
export function parseLinkedRecordRowsResult(
  value: string,
): ParsedLinkedRecordRowsResult {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return {
      parseError: null,
      rows: [],
    };
  }
  try {
    const parsed = JSON.parse(normalizedValue);

    if (!Array.isArray(parsed)) {
      return {
        parseError: "Expected an array of rows.",
        rows: [],
      };
    }
    return {
      parseError: null,
      rows: parsed
        .map((entry) => normalizeRow(entry))
        .filter((entry): entry is LinkedRecordRow => Boolean(entry)),
    };
  } catch {
    return {
      parseError: "Stored rows could not be parsed.",
      rows: [],
    };
  }
}
export function parseLinkedRecordRows(value: string): LinkedRecordRow[] {
  return parseLinkedRecordRowsResult(value).rows;
}
export function serializeLinkedRecordRows(rows: LinkedRecordRow[]): string {
  return rows.length > 0 ? JSON.stringify(rows) : "";
}
export function setLinkedRecordRowValue(
  rows: LinkedRecordRow[],
  rowIndex: number,
  columnKey: string,
  nextValue: string,
): LinkedRecordRow[] {
  return rows.map((row, index) =>
    index === rowIndex
      ? {
          ...row,
          [columnKey]: nextValue,
        }
      : row,
  );
}
