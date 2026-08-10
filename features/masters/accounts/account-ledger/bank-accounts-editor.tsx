import type { CSSProperties } from "react";
import dynamicFormStyles from "@/components/design-system/ui/dynamic-modal-form.module.scss";
import { FiPlusCircle, FiTrash2 } from "react-icons/fi";
import {
  BANK_ACCOUNT_TYPE_OPTIONS,
  type LedgerBankAccountFieldName,
  type LedgerBankAccountFormRow,
} from "./bank-accounts";
type BankAccountsEditorProps = {
  rows: LedgerBankAccountFormRow[];
  disabled: boolean;
  invalidRowKey: string | null;
  invalidField: LedgerBankAccountFieldName | null;
  onAddRow: () => void;
  onChangeRow: (rowKey: string, patch: Partial<LedgerBankAccountFormRow>) => void;
  onRemoveRow: (rowKey: string) => void;
  onSetDefault: (rowKey: string) => void;
};
// Editable grid (mirrors the desktop NexBankGrid / table_id 13): one row per
// beneficiary bank account, one column per field, an A/c Type combo, and a single
// "Default" radio with Add/Delete actions.
type BankColumn = {
  field: LedgerBankAccountFieldName;
  label: string;
  required?: boolean;
  minWidth: number;
  placeholder?: string;
  maxLength?: number;
};
const TEXT_COLUMNS: BankColumn[] = [
  { field: "lbaAccountHolder", label: "Account Holder", required: true, minWidth: 160, maxLength: 200 },
  { field: "lbaBankName", label: "Bank Name", required: true, minWidth: 150, maxLength: 200 },
  { field: "lbaAccountNo", label: "Account No", required: true, minWidth: 140, maxLength: 50 },
  { field: "lbaBranchName", label: "Branch", minWidth: 130, maxLength: 200 },
  { field: "lbaIfscCode", label: "IFSC", minWidth: 120, placeholder: "HDFC0001234", maxLength: 11 },
  { field: "lbaMicrCode", label: "MICR", minWidth: 110, maxLength: 15 },
];
const TRAILING_TEXT_COLUMNS: BankColumn[] = [
  { field: "lbaUpiId", label: "UPI Id", minWidth: 130, maxLength: 100 },
  { field: "lbaChequeName", label: "Cheque Name", minWidth: 140, maxLength: 200 },
  { field: "lbaRemarks", label: "Remarks", minWidth: 150, maxLength: 250 },
];
const wrapperStyle: CSSProperties = {
  gridColumn: "1 / -1",
  display: "flex",
  flexDirection: "column",
  rowGap: "0.6rem",
};
const toolbarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
};
const tableScrollStyle: CSSProperties = {
  overflowX: "auto",
  border: "1px solid var(--erp-modal-border, #cfdae6)",
  borderRadius: "0.5rem",
};
const tableStyle: CSSProperties = {
  borderCollapse: "collapse",
  width: "100%",
  fontSize: "0.8rem",
};
const thStyle: CSSProperties = {
  textAlign: "center",
  padding: "0.5rem 0.55rem",
  background: "#f1f5f9",
  color: "#334155",
  fontWeight: 700,
  fontSize: "0.72rem",
  whiteSpace: "nowrap",
  borderBottom: "1px solid #d8e1ea",
};
const thCenterStyle: CSSProperties = { ...thStyle, textAlign: "center" };
const tdStyle: CSSProperties = {
  padding: "0.25rem 0.35rem",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "middle",
};
const tdCenterStyle: CSSProperties = { ...tdStyle, textAlign: "center" };
const cellInputBaseStyle: CSSProperties = {
  width: "100%",
  padding: "0.32rem 0.45rem",
  border: "1px solid #d8e1ea",
  borderRadius: "0.35rem",
  fontSize: "0.8rem",
  background: "#fff",
};
const addButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
  padding: "0.35rem 0.75rem",
  border: "1px dashed var(--erp-modal-accent, #2563eb)",
  borderRadius: "0.5rem",
  background: "transparent",
  color: "var(--erp-modal-accent, #2563eb)",
  cursor: "pointer",
  fontWeight: 600,
};
const removeButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0.3rem",
  border: "1px solid #e2b4b4",
  borderRadius: "0.4rem",
  background: "transparent",
  color: "#c0392b",
  cursor: "pointer",
};
export default function BankAccountsEditor({
  rows,
  disabled,
  invalidRowKey,
  invalidField,
  onAddRow,
  onChangeRow,
  onRemoveRow,
  onSetDefault,
}: BankAccountsEditorProps) {
  const renderCell = (row: LedgerBankAccountFormRow, column: BankColumn) => {
    const isInvalid = invalidRowKey === row.rowKey && invalidField === column.field;
    return (
      <td key={column.field} style={{ ...tdStyle, minWidth: column.minWidth }}>
        <input
          id={`${row.rowKey}-${column.field}`}
          style={{
            ...cellInputBaseStyle,
            borderColor: isInvalid ? "#dc2626" : "#d8e1ea",
          }}
          type="text"
          autoComplete="off"
          aria-label={column.label}
          value={row[column.field]}
          placeholder={column.placeholder}
          maxLength={column.maxLength}
          disabled={disabled}
          onChange={(event) =>
            onChangeRow(row.rowKey, {
              [column.field]: event.target.value,
            } as Partial<LedgerBankAccountFormRow>)
          }
        />
      </td>
    );
  };
  // Column count for the empty-state row's colSpan: index + text cols + type +
  // trailing text cols + active + default + delete.
  const columnCount = 1 + TEXT_COLUMNS.length + 1 + TRAILING_TEXT_COLUMNS.length + 3;
  return (
    <div style={wrapperStyle}>
      <div style={toolbarStyle}>
        <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
          {rows.length} bank account{rows.length === 1 ? "" : "s"}
        </span>
        {!disabled ? (
          <button type="button" style={addButtonStyle} onClick={onAddRow}>
            <FiPlusCircle aria-hidden="true" />
            Add
          </button>
        ) : null}
      </div>
      <div style={tableScrollStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thCenterStyle}>#</th>
              {TEXT_COLUMNS.map((column) => (
                <th key={column.field} style={thStyle}>
                  {column.label}
                  {column.required ? (
                    <span className={dynamicFormStyles.requiredMark}> *</span>
                  ) : null}
                </th>
              ))}
              <th style={thStyle}>A/c Type</th>
              {TRAILING_TEXT_COLUMNS.map((column) => (
                <th key={column.field} style={thStyle}>
                  {column.label}
                </th>
              ))}
              <th style={thCenterStyle}>Active</th>
              <th style={thCenterStyle}>Default</th>
              <th style={thCenterStyle} aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columnCount}
                  style={{
                    ...tdStyle,
                    textAlign: "center",
                    color: "#64748b",
                    padding: "0.9rem",
                  }}
                >
                  No bank accounts added yet.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={row.rowKey}>
                  <td style={tdCenterStyle}>{index + 1}</td>
                  {TEXT_COLUMNS.map((column) => renderCell(row, column))}
                  <td style={{ ...tdStyle, minWidth: 140 }}>
                    <select
                      id={`${row.rowKey}-lbaAccountType`}
                      style={cellInputBaseStyle}
                      aria-label="Account Type"
                      value={row.lbaAccountType}
                      disabled={disabled}
                      onChange={(event) =>
                        onChangeRow(row.rowKey, { lbaAccountType: event.target.value })
                      }
                    >
                      {BANK_ACCOUNT_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label || "Select"}
                        </option>
                      ))}
                    </select>
                  </td>
                  {TRAILING_TEXT_COLUMNS.map((column) => renderCell(row, column))}
                  <td style={tdCenterStyle}>
                    <input
                      type="checkbox"
                      aria-label="Active"
                      checked={row.lbaIsActive}
                      disabled={disabled}
                      onChange={(event) =>
                        onChangeRow(row.rowKey, { lbaIsActive: event.target.checked })
                      }
                    />
                  </td>
                  <td style={tdCenterStyle}>
                    <input
                      type="radio"
                      name="ledger-bank-account-default"
                      aria-label="Default"
                      checked={row.lbaIsDefault}
                      disabled={disabled}
                      onChange={() => onSetDefault(row.rowKey)}
                    />
                  </td>
                  <td style={tdCenterStyle}>
                    {!disabled ? (
                      <button
                        type="button"
                        style={removeButtonStyle}
                        onClick={() => onRemoveRow(row.rowKey)}
                        title="Remove bank account"
                        aria-label="Remove bank account"
                      >
                        <FiTrash2 aria-hidden="true" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}