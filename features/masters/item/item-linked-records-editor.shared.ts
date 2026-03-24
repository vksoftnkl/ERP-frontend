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
  label: string;
  type?: "text" | "number" | "select" | "checkbox";
  placeholder?: string;
  readOnly?: boolean;
  readOnlyResolver?: (
    params: LinkedRecordColumnOptionsResolverParams,
  ) => boolean;
  searchable?: boolean;
  options?: LinkedRecordOption[];
  optionsResolver?: (
    params: LinkedRecordColumnOptionsResolverParams,
  ) => LinkedRecordOption[];
  min?: number | string;
  step?: number | string;
  width?: string;
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

const ROW_ID_KEYS = ["ipm_unit_rate_id", "ir_id", "ean_id"] as const;

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

  return column.readOnlyResolver
    ? column.readOnlyResolver({
        column,
        row,
        rowIndex,
        rows,
      })
    : false;
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
