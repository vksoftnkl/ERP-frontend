"use client";
import { type CSSProperties, useMemo, useRef, useState } from "react";
import {
  ERPDynamicModalForm,
  type ERPDynamicModalController,
  type ERPDynamicModalField,
  type ERPDynamicModalSubmitPayload,
} from "@/components/design-system/ui/dynamic-modal-form";
import {
  getColumnStyle,
  getSelectPlaceholder,
  parseLinkedRecordRowsResult,
  resolveColumnOptions,
  serializeLinkedRecordRows,
  type LinkedRecordColumn,
  type LinkedRecordRow,
} from "./item-linked-records-editor.shared";
import {
  normalizeItemPriceRowForEditor,
  normalizeItemPriceRowsForRules,
} from "./item-price-row-rules";
import styles from "./item-linked-records-editor.module.scss";
const CREATE_VARIANT_KEY = "createPriceRow";
const EDIT_VARIANT_KEY = "editPriceRow";
const REQUIRED_FIELD_NAMES = new Set([
  "ipm_unit_id",
  "ipm_godown_id",
  "ipm_profit_type",
]);
const FIRST_ROW_LOCKED_FIELD_NAMES = new Set([
  "ipm_unit_id",
  "ipm_to_base_factor",
  "ipm_unit_factor",
  "ipm_is_default_unit",
]);
type ItemPriceRowsModalEditorProps = {
  addLabel: string;
  baseUnitId: string;
  columns: LinkedRecordColumn[];
  createRow: (rowIndex: number) => LinkedRecordRow;
  disabled?: boolean;
  emptyState: string;
  onChange: (value: string) => void;
  panelStyle?: CSSProperties;
  validateRows?: (serializedRows: string) => string | null;
  value: string;
};
function resolveDisplayedConversionValue(row: LinkedRecordRow): string {
  return (
    (row.ipm_to_base_factor ?? "").trim() ||
    (row.ipm_unit_factor ?? "").trim()
  );
}
function resolveModalFieldName(columnKey: string): string {
  return columnKey;
}
function mapRowToModalValues(
  row: LinkedRecordRow,
  rowIndex: number,
  baseUnitId: string,
): LinkedRecordRow {
  const nextRow = normalizeItemPriceRowForEditor(row, rowIndex, baseUnitId);
  const conversionFactor = resolveDisplayedConversionValue(nextRow);
  if (!conversionFactor) {
    return nextRow;
  }
  return {
    ...nextRow,
    ipm_to_base_factor: conversionFactor,
    ipm_unit_factor: conversionFactor,
  };
}
function buildCellDisplayValue(
  column: LinkedRecordColumn,
  row: LinkedRecordRow,
  rowIndex: number,
  rows: LinkedRecordRow[],
): string {
  if (column.key === "ipm_to_base_factor") {
    return resolveDisplayedConversionValue(row);
  }
  const rawValue = row[column.key] ?? "";
  if ((column.type ?? "text") === "checkbox") {
    return rawValue === "true" ? "Yes" : "No";
  }
  if ((column.type ?? "text") === "select") {
    const options = resolveColumnOptions(column, row, rowIndex, rows);
    return options.find((option) => option.value === rawValue)?.label ?? rawValue;
  }
  return rawValue;
}
function buildItemPriceRowFieldValidation(
  columnKey: string,
  rowIndex: number,
): ERPDynamicModalField["validation"] | undefined {
  if (columnKey === "ipm_to_base_factor") {
    return {
      minMessage: "Conv must be greater than 0.",
      custom: (value:any) => {
        const normalizedValue = value.trim();
        if (!normalizedValue) {
          return "Conv is required.";
        }
        const parsedValue = Number(normalizedValue);
        if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
          return "Conv must be greater than 0.";
        }
        if (rowIndex === 0 && parsedValue !== 1) {
          return "Conv must be 1 for the first price row.";
        }
        return null;
      },
    };
  }
  if (columnKey === "ipm_unit_factor") {
    return {
      minMessage: "Unit Factor must be greater than 0.",
      custom: (value) => {
        const normalizedValue = value.trim();
        if (!normalizedValue) {
          return "Unit Factor is required.";
        }
        const parsedValue = Number(normalizedValue);
        if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
          return "Unit Factor must be greater than 0.";
        }
        if (rowIndex === 0 && parsedValue !== 1) {
          return "Unit Factor must be 1 for the first price row.";
        }
        return null;
      },
    };
  }
  if (columnKey === "ipm_is_default_unit") {
    return {
      custom: (value) => {
        if (rowIndex === 0 && value === "true") {
          return "Default cannot be enabled for the first price row.";
        }
        return null;
      },
    };
  }
  if (columnKey === "ipm_is_base_unit") {
    return {
      custom: (value) => {
        if (rowIndex === 0 && value !== "true") {
          return "Base Unit must stay enabled for the first price row.";
        }
        if (rowIndex > 0 && value === "true") {
          return "Only the first price row can be the Base row.";
        }
        return null;
      },
    };
  }
  return undefined;
}
export default function ItemPriceRowsModalEditor({
  addLabel,
  baseUnitId,
  columns,
  createRow,
  disabled = false,
  emptyState,
  onChange,
  panelStyle,
  validateRows,
  value,
}: ItemPriceRowsModalEditorProps) {
  const { parseError, rows } = useMemo(
    () => parseLinkedRecordRowsResult(value),
    [value],
  );
  const controllerRef = useRef<ERPDynamicModalController | null>(null);
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const modalRowIndex = editingRowIndex ?? rows.length;
  const modalSeedRow = useMemo(() => {
    const sourceRow =
      editingRowIndex === null
        ? createRow(rows.length)
        : (rows[editingRowIndex] ?? createRow(editingRowIndex));
    return mapRowToModalValues(sourceRow, modalRowIndex, baseUnitId);
  }, [baseUnitId, createRow, editingRowIndex, modalRowIndex, rows]);
  const modalFields = useMemo<ERPDynamicModalField[]>(
    () =>
      columns.map((column) => {
        const fieldType = column.type ?? "text";
        const fieldName = resolveModalFieldName(column.key);
        const isBaseField = column.key === "ipm_is_base_unit";
        const isDisabled =
          disabled ||
          isBaseField ||
          (modalRowIndex === 0 && FIRST_ROW_LOCKED_FIELD_NAMES.has(fieldName));
        return {
          name: fieldName,
          label: column.label,
          type: fieldType,
          searchable: fieldType === "select" ? column.searchable : undefined,
          options:
            fieldType === "select"
              ? resolveColumnOptions(column, modalSeedRow, modalRowIndex, rows)
              : undefined,
          placeholder:
            fieldType === "select"
              ? getSelectPlaceholder(column)
              : column.placeholder,
          required: REQUIRED_FIELD_NAMES.has(fieldName),
          disabled: isDisabled,
          min: column.min,
          step: column.step,
          validation: buildItemPriceRowFieldValidation(column.key, modalRowIndex),
        };
      }),
    [columns, disabled, modalRowIndex, modalSeedRow, rows],
  );
  const variants = useMemo(
    () => [
      {
        key: CREATE_VARIANT_KEY,
        cardTitle: "Add Price Row",
        cardDescription: "Create a new item price row.",
        cardButtonLabel: "Add Price Row",
        modalTitle: "Add Price Row",
        modalDescription:
          modalRowIndex === 0
            ? "The first row is fixed as the base row with Conv = 1."
            : "Add another price row for this item.",
        submitLabel: "Save Row",
        fields: modalFields,
      },
      {
        key: EDIT_VARIANT_KEY,
        cardTitle: "Edit Price Row",
        cardDescription: "Update an existing item price row.",
        cardButtonLabel: "Edit Price Row",
        modalTitle: "Edit Price Row",
        modalDescription:
          modalRowIndex === 0
            ? "The first row is fixed as the base row with Conv = 1."
            : "Update the selected price row.",
        submitLabel: "Update Row",
        fields: modalFields,
      },
    ],
    [modalFields, modalRowIndex],
  );
  const openCreateModal = () => {
    setEditingRowIndex(null);
    setSubmitError(null);
    controllerRef.current?.openModal(CREATE_VARIANT_KEY, {
      values: mapRowToModalValues(
        createRow(rows.length),
        rows.length,
        baseUnitId,
      ),
    });
  };
  const openEditModal = (rowIndex: number) => {
    const sourceRow = rows[rowIndex];
    if (!sourceRow) {
      return;
    }
    setEditingRowIndex(rowIndex);
    setSubmitError(null);
    controllerRef.current?.openModal(EDIT_VARIANT_KEY, {
      values: mapRowToModalValues(sourceRow, rowIndex, baseUnitId),
    });
  };
  const handleRemoveRow = (rowIndex: number) => {
    const nextRows = normalizeItemPriceRowsForRules(
      rows.filter((_, index) => index !== rowIndex),
      baseUnitId,
    );
    onChange(serializeLinkedRecordRows(nextRows));
  };
  const handleSubmit = async ({
    values,
    variantKey,
  }: ERPDynamicModalSubmitPayload) => {
    const isEditing =
      variantKey === EDIT_VARIANT_KEY && editingRowIndex !== null;
    const targetRowIndex = isEditing ? editingRowIndex : rows.length;
    const sourceRow = isEditing
      ? (rows[editingRowIndex] ?? createRow(editingRowIndex))
      : createRow(rows.length);
    const originalRow = normalizeItemPriceRowForEditor(
      sourceRow,
      targetRowIndex,
      baseUnitId,
    );
    const nextConversionFactor = (
      (values.ipm_to_base_factor ?? "").trim() ||
      resolveDisplayedConversionValue(originalRow) ||
      ""
    ).trim();
    const nextRow = normalizeItemPriceRowForEditor(
      {
        ...values,
        ipm_to_base_factor: nextConversionFactor,
        ipm_unit_factor: nextConversionFactor,
      },
      targetRowIndex,
      baseUnitId,
    );
    const nextRows =
      isEditing
        ? rows.map((row, index) => (index === editingRowIndex ? nextRow : row))
        : [...rows, nextRow];
    const normalizedRows = normalizeItemPriceRowsForRules(
      nextRows,
      baseUnitId,
      targetRowIndex > 0 && nextRow.ipm_is_default_unit === "true"
        ? targetRowIndex
        : null,
    );
    const serializedRows = serializeLinkedRecordRows(normalizedRows);
    const validationError = validateRows?.(serializedRows) ?? null;
    if (validationError) {
      setSubmitError(validationError);
      throw new Error(validationError);
    }
    setSubmitError(null);
    setEditingRowIndex(null);
    onChange(serializedRows);
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
          onClick={openCreateModal}
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
                  <th key={column.key} style={getColumnStyle(column)}>
                    {column.label}
                  </th>
                ))}
                <th className={styles.actionsCell}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${row.ipm_id ?? "row"}-${rowIndex}`}>
                  <td className={styles.indexCell}>{rowIndex + 1}</td>
                  {columns.map((column) => {
                    const displayValue = buildCellDisplayValue(
                      column,
                      row,
                      rowIndex,
                      rows,
                    );
                    return (
                      <td key={`${column.key}-${rowIndex}`} style={getColumnStyle(column)}>
                        {displayValue || "—"}
                      </td>
                    );
                  })}
                  <td className={styles.actionsCell}>
                    <div style={{ display: "flex", gap: "0.45rem" }}>
                      <button
                        type="button"
                        className={styles.addButton}
                        disabled={disabled}
                        onClick={() => openEditModal(rowIndex)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={styles.removeButton}
                        disabled={disabled}
                        onClick={() => handleRemoveRow(rowIndex)}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ERPDynamicModalForm
        title="Price Row"
        variants={variants}
        showDefaultCards={false}
        submitError={submitError}
        panelStyle={panelStyle}
        formGridColumns={4}
        onControllerReady={(controller) => {
          controllerRef.current = controller;
        }}
        onCancel={() => {
          setSubmitError(null);
          setEditingRowIndex(null);
        }}
        onSubmit={handleSubmit}
      />
    </div>
  );
}