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

const cardStyle: CSSProperties = {
  border: "1px solid var(--erp-modal-border, #cfdae6)",
  borderRadius: "0.5rem",
  padding: "0.75rem 0.9rem 0.9rem",
  marginBottom: "0.75rem",
  background: "var(--erp-modal-surface, #ffffff)",
};

const cardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  marginBottom: "0.65rem",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  columnGap: "1.25rem",
  rowGap: "0.6rem",
};

const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  rowGap: "0.3rem",
};

const addButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
  alignSelf: "flex-start",
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
  gap: "0.35rem",
  padding: "0.25rem 0.55rem",
  border: "1px solid #e2b4b4",
  borderRadius: "0.4rem",
  background: "transparent",
  color: "#c0392b",
  cursor: "pointer",
};

const defaultToggleStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  fontWeight: 600,
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
  const renderText = (
    row: LedgerBankAccountFormRow,
    field: LedgerBankAccountFieldName,
    label: string,
    options?: { required?: boolean; placeholder?: string; type?: string; maxLength?: number; span?: number },
  ) => {
    const isInvalid = invalidRowKey === row.rowKey && invalidField === field;
    return (
      <div style={{ ...fieldStyle, gridColumn: options?.span ? `span ${options.span}` : undefined }}>
        <label className={dynamicFormStyles.label} htmlFor={`${row.rowKey}-${field}`} style={{ paddingTop: 0 }}>
          {label}
          {options?.required ? <span className={dynamicFormStyles.requiredMark}>*</span> : null}
        </label>
        <input
          id={`${row.rowKey}-${field}`}
          className={`${dynamicFormStyles.control} ${isInvalid ? dynamicFormStyles.controlInvalid : ""}`}
          type={options?.type ?? "text"}
          autoComplete="off"
          value={row[field]}
          placeholder={options?.placeholder}
          maxLength={options?.maxLength}
          disabled={disabled}
          onChange={(event) =>
            onChangeRow(row.rowKey, { [field]: event.target.value } as Partial<LedgerBankAccountFormRow>)
          }
        />
      </div>
    );
  };

  return (
    <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column" }}>
      {rows.length === 0 ? (
        <p
          style={{
            margin: "0 0 0.75rem",
            color: "#64748b",
            fontSize: "0.85rem",
          }}
        >
          No bank accounts added yet.
        </p>
      ) : (
        rows.map((row, index) => (
          <div key={row.rowKey} style={cardStyle}>
            <div style={cardHeaderStyle}>
              <strong style={{ fontSize: "0.85rem" }}>
                Bank Account #{index + 1}
              </strong>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <label style={defaultToggleStyle}>
                  <input
                    type="radio"
                    name="ledger-bank-account-default"
                    checked={row.lbaIsDefault}
                    disabled={disabled}
                    onChange={() => onSetDefault(row.rowKey)}
                  />
                  Default
                </label>
                <label style={{ ...defaultToggleStyle, fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={row.lbaIsActive}
                    disabled={disabled}
                    onChange={(event) =>
                      onChangeRow(row.rowKey, { lbaIsActive: event.target.checked })
                    }
                  />
                  Active
                </label>
                {!disabled ? (
                  <button
                    type="button"
                    style={removeButtonStyle}
                    onClick={() => onRemoveRow(row.rowKey)}
                    title="Remove bank account"
                  >
                    <FiTrash2 aria-hidden="true" />
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
            <div style={gridStyle}>
              {renderText(row, "lbaAccountHolder", "Account Holder", { required: true, maxLength: 200 })}
              {renderText(row, "lbaBankName", "Bank Name", { required: true, maxLength: 200 })}
              {renderText(row, "lbaAccountNo", "Account No", { required: true, maxLength: 50 })}
              {renderText(row, "lbaIfscCode", "IFSC Code", { placeholder: "HDFC0001234", maxLength: 11 })}
              {renderText(row, "lbaMicrCode", "MICR Code", { maxLength: 15 })}
              <div style={fieldStyle}>
                <label className={dynamicFormStyles.label} htmlFor={`${row.rowKey}-lbaAccountType`} style={{ paddingTop: 0 }}>
                  Account Type
                </label>
                <select
                  id={`${row.rowKey}-lbaAccountType`}
                  className={dynamicFormStyles.control}
                  value={row.lbaAccountType}
                  disabled={disabled}
                  onChange={(event) =>
                    onChangeRow(row.rowKey, { lbaAccountType: event.target.value })
                  }
                >
                  {BANK_ACCOUNT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label || "Select Account Type"}
                    </option>
                  ))}
                </select>
              </div>
              {renderText(row, "lbaBranchName", "Branch Name", { maxLength: 200 })}
              {renderText(row, "lbaUpiId", "UPI Id", { maxLength: 100 })}
              {renderText(row, "lbaChequeName", "Cheque Name", { maxLength: 200 })}
              {renderText(row, "lbaRemarks", "Remarks", { maxLength: 250, span: 3 })}
            </div>
          </div>
        ))
      )}
      {!disabled ? (
        <button type="button" style={addButtonStyle} onClick={onAddRow}>
          <FiPlusCircle aria-hidden="true" />
          Add Bank Account
        </button>
      ) : null}
    </div>
  );
}
