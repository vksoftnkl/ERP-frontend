"use client";

import { useMemo } from "react";
import { cx } from "@/components/library/cx";
import styles from "./item-linked-records-editor.module.scss";

export type LinkedRecordRow = Record<string, string>;

export type LinkedRecordOption = {
  label: string;
  value: string;
};

export type LinkedRecordColumn = {
  key: string;
  label: string;
  type?: "text" | "number" | "select" | "checkbox";
  placeholder?: string;
  options?: LinkedRecordOption[];
  min?: number | string;
  step?: number | string;
  width?: string;
};

type ItemLinkedRecordsEditorProps = {
  addLabel: string;
  columns: LinkedRecordColumn[];
  createRow: () => LinkedRecordRow;
  disabled?: boolean;
  emptyState: string;
  onChange: (value: string) => void;
  value: string;
};

type ParsedLinkedRecordRows = {
  parseError: string | null;
  rows: LinkedRecordRow[];
};

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

function parseLinkedRecordRowsInternal(value: string): ParsedLinkedRecordRows {
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
  return parseLinkedRecordRowsInternal(value).rows;
}

export function serializeLinkedRecordRows(rows: LinkedRecordRow[]): string {
  return rows.length > 0 ? JSON.stringify(rows) : "";
}

export default function ItemLinkedRecordsEditor({
  addLabel,
  columns,
  createRow,
  disabled = false,
  emptyState,
  onChange,
  value,
}: ItemLinkedRecordsEditorProps) {
  const { parseError, rows } = useMemo(
    () => parseLinkedRecordRowsInternal(value),
    [value],
  );

  const updateRows = (nextRows: LinkedRecordRow[]) => {
    onChange(serializeLinkedRecordRows(nextRows));
  };

  const handleAddRow = () => {
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
    updateRows(
      rows.map((row, index) =>
        index === rowIndex
          ? {
              ...row,
              [columnKey]: nextValue,
            }
          : row,
      ),
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
                <th className={styles.indexCell}>#</th>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    style={
                      column.width
                        ? {
                            minWidth: column.width,
                          }
                        : undefined
                    }
                  >
                    {column.label}
                  </th>
                ))}
                <th className={styles.actionsCell}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${row.ipm_unit_rate_id ?? row.ir_id ?? row.ean_id ?? "row"}-${rowIndex}`}>
                  <td className={styles.indexCell}>{rowIndex + 1}</td>
                  {columns.map((column) => {
                    const columnType = column.type ?? "text";
                    const cellValue = row[column.key] ?? "";

                    return (
                      <td key={`${column.key}-${rowIndex}`}>
                        {columnType === "select" ? (
                          <select
                            className={styles.control}
                            disabled={disabled}
                            value={cellValue}
                            onChange={(event) =>
                              handleCellChange(
                                rowIndex,
                                column.key,
                                event.currentTarget.value,
                              )
                            }
                          >
                            <option value="">{column.placeholder ?? `Select ${column.label}`}</option>
                            {(column.options ?? []).map((option) => (
                              <option key={`${column.key}-${option.value}`} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : columnType === "checkbox" ? (
                          <label className={styles.checkboxWrap}>
                            <input
                              type="checkbox"
                              className={styles.checkbox}
                              checked={cellValue === "true"}
                              disabled={disabled}
                              onChange={(event) =>
                                handleCellChange(
                                  rowIndex,
                                  column.key,
                                  event.currentTarget.checked ? "true" : "false",
                                )
                              }
                            />
                          </label>
                        ) : (
                          <input
                            type={columnType}
                            className={cx(styles.control, styles.input)}
                            disabled={disabled}
                            min={column.min}
                            step={column.step}
                            placeholder={column.placeholder}
                            value={cellValue}
                            onChange={(event) =>
                              handleCellChange(
                                rowIndex,
                                column.key,
                                event.currentTarget.value,
                              )
                            }
                          />
                        )}
                      </td>
                    );
                  })}
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
