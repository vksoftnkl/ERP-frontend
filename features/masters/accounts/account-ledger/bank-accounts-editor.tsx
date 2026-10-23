import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { FiEdit2, FiPlusCircle, FiTrash2 } from "react-icons/fi";
import BankAccountDialog from "./bank-account-dialog";
import {
  bankAccountTypeLabel,
  canAddBankAccount,
  createBankAccountDraft,
  type LedgerBankAccountFieldName,
  type LedgerBankAccountFormRow,
} from "./bank-accounts";
type BankAccountsEditorProps = {
  rows: LedgerBankAccountFormRow[];
  disabled: boolean;
  invalidRowKey: string | null;
  invalidField: LedgerBankAccountFieldName | null;
  /**
   * A bank-profile ledger's one account, always the default (Qt
   * `NexBankGrid::setSingleMandatory`): Add is off once there is one, and the
   * popup's Default is ticked and locked.
   */
  singleMandatory?: boolean;
  /** OK in the account popup: the whole account, new or edited. */
  onCommitRow: (row: LedgerBankAccountFormRow) => void;
  onRemoveRow: (rowKey: string) => void;
};
// The beneficiary bank accounts of a ledger / supplier (desktop NexBankGrid /
// table_id 13). Since Qt 4ae6575 the table only LISTS them: Add / Edit — or a
// double-click, or Enter on a row — open BankAccountDialog with every field,
// and no cell is typed in. Delete is as before (the row's bin). Nothing goes to
// the server until the ledger itself is saved.
type ListColumn = {
  field: LedgerBankAccountFieldName;
  label: string;
  required?: boolean;
  minWidth: number;
};
const LIST_COLUMNS: ListColumn[] = [
  { field: "lbaAccountNo", label: "Account No", required: true, minWidth: 130 },
  { field: "lbaAccountHolder", label: "Account Holder", required: true, minWidth: 150 },
  { field: "lbaBankName", label: "Bank Name", required: true, minWidth: 140 },
  { field: "lbaBranchName", label: "Branch", minWidth: 120 },
  { field: "lbaIfscCode", label: "IFSC", minWidth: 110 },
  { field: "lbaMicrCode", label: "MICR", minWidth: 90 },
  { field: "lbaAccountType", label: "A/c Type", minWidth: 100 },
  { field: "lbaUpiId", label: "UPI Id", minWidth: 120 },
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
const toolbarActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
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
const tdStyle: CSSProperties = {
  padding: "0.4rem 0.55rem",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "16rem",
  outline: "none",
};
const tdCenterStyle: CSSProperties = { ...tdStyle, textAlign: "center" };
const rowStyle: CSSProperties = { cursor: "pointer", outline: "none" };
const selectedRowStyle: CSSProperties = { ...rowStyle, background: "#e8f1fb" };
const invalidCellStyle: CSSProperties = { boxShadow: "inset 0 0 0 1px #dc2626" };
const actionButtonStyle: CSSProperties = {
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
const disabledActionButtonStyle: CSSProperties = {
  ...actionButtonStyle,
  opacity: 0.45,
  cursor: "not-allowed",
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
function cellText(row: LedgerBankAccountFormRow, field: LedgerBankAccountFieldName): string {
  return field === "lbaAccountType" ? bankAccountTypeLabel(row.lbaAccountType) : row[field];
}
type OpenDialog = { account: LedgerBankAccountFormRow; isNew: boolean };
export default function BankAccountsEditor({
  rows,
  disabled,
  invalidRowKey,
  invalidField,
  singleMandatory = false,
  onCommitRow,
  onRemoveRow,
}: BankAccountsEditorProps) {
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  // Where focus goes back to once the popup closes (Qt: the table, its row;
  // "" = the Add button).
  const returnFocusRef = useRef<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  // A deleted row's selection goes with it.
  const selected = rows.find((row) => row.rowKey === selectedRowKey) ?? null;
  const canAdd = !disabled && canAddBankAccount(rows, { singleMandatory });

  useEffect(() => {
    const rowKey = returnFocusRef.current;
    if (dialog || rowKey === null) {
      return;
    }
    returnFocusRef.current = null;
    (rowRefs.current[rowKey] ?? addButtonRef.current)?.focus();
  }, [dialog, rows]);

  const openAdd = () => {
    if (!canAdd) {
      return;
    }
    setDialog({ account: createBankAccountDraft(rows, { singleMandatory }), isNew: true });
  };
  const openEdit = (rowKey: string | null) => {
    const row = rows.find((candidate) => candidate.rowKey === rowKey);
    if (disabled || !row) {
      return;
    }
    setSelectedRowKey(row.rowKey);
    setDialog({ account: { ...row }, isNew: false });
  };
  const closeDialog = (focusRowKey: string | null) => {
    returnFocusRef.current = focusRowKey ?? "";
    setDialog(null);
  };
  const handleConfirm = (row: LedgerBankAccountFormRow) => {
    onCommitRow(row);
    setSelectedRowKey(row.rowKey);
    closeDialog(row.rowKey);
  };
  // Enter on a row opens it; ↑ / ↓ walk the rows. Neither reaches the entry
  // form's own Enter walk or arrow navigation.
  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, index: number) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      openEdit(rows[index]?.rowKey ?? null);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      const next = rows[index + (event.key === "ArrowDown" ? 1 : -1)];
      if (next) {
        rowRefs.current[next.rowKey]?.focus();
      }
    }
  };
  // Column count for the empty-state row: index + listed columns + default +
  // active + delete.
  const columnCount = 1 + LIST_COLUMNS.length + 3;
  return (
    <div style={wrapperStyle}>
      <div style={toolbarStyle}>
        <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
          {rows.length} bank account{rows.length === 1 ? "" : "s"}
        </span>
        {!disabled ? (
          <div style={toolbarActionsStyle}>
            <button
              ref={addButtonRef}
              type="button"
              style={canAdd ? actionButtonStyle : disabledActionButtonStyle}
              onClick={openAdd}
              disabled={!canAdd}
              title={canAdd ? undefined : "A bank ledger keeps one account."}
            >
              <FiPlusCircle aria-hidden="true" />
              Add
            </button>
            <button
              type="button"
              style={selected ? actionButtonStyle : disabledActionButtonStyle}
              onClick={() => openEdit(selected?.rowKey ?? null)}
              disabled={!selected}
              title={selected ? "Edit the selected account (Enter / double-click)" : "Pick an account first"}
            >
              <FiEdit2 aria-hidden="true" />
              Edit
            </button>
          </div>
        ) : null}
      </div>
      <div style={tableScrollStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>#</th>
              {LIST_COLUMNS.map((column) => (
                <th key={column.field} style={thStyle}>
                  {column.label}
                  {column.required ? <span style={{ color: "#dc2626" }}> *</span> : null}
                </th>
              ))}
              <th style={thStyle}>Default</th>
              <th style={thStyle}>Active</th>
              <th style={thStyle} aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columnCount}
                  style={{ ...tdStyle, textAlign: "center", color: "#64748b", padding: "0.9rem" }}
                >
                  No bank accounts added yet.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const isSelected = row.rowKey === selected?.rowKey;
                const isInvalidRow = row.rowKey === invalidRowKey;
                return (
                  <tr
                    key={row.rowKey}
                    ref={(element) => {
                      rowRefs.current[row.rowKey] = element;
                    }}
                    tabIndex={0}
                    aria-selected={isSelected}
                    style={{
                      ...(isSelected ? selectedRowStyle : rowStyle),
                      ...(isInvalidRow ? { boxShadow: "inset 3px 0 0 #dc2626" } : {}),
                    }}
                    onClick={() => setSelectedRowKey(row.rowKey)}
                    onFocus={() => setSelectedRowKey(row.rowKey)}
                    onDoubleClick={() => openEdit(row.rowKey)}
                    onKeyDown={(event) => handleRowKeyDown(event, index)}
                  >
                    <td style={tdCenterStyle}>{index + 1}</td>
                    {LIST_COLUMNS.map((column) => (
                      <td
                        key={column.field}
                        // The ledger's Save focuses `<rowKey>-<field>` on a refusal.
                        id={`${row.rowKey}-${column.field}`}
                        tabIndex={-1}
                        style={{
                          ...tdStyle,
                          minWidth: column.minWidth,
                          ...(isInvalidRow && invalidField === column.field ? invalidCellStyle : {}),
                        }}
                        title={cellText(row, column.field) || undefined}
                      >
                        {cellText(row, column.field)}
                      </td>
                    ))}
                    {/* Shown, not clicked: the default is chosen in the popup. */}
                    <td style={tdCenterStyle} aria-label={row.lbaIsDefault ? "Default" : "Not default"}>
                      {row.lbaIsDefault ? "✓" : ""}
                    </td>
                    <td style={tdCenterStyle} aria-label={row.lbaIsActive ? "Active" : "Inactive"}>
                      {row.lbaIsActive ? "✓" : ""}
                    </td>
                    <td style={tdCenterStyle}>
                      {!disabled ? (
                        <button
                          type="button"
                          style={removeButtonStyle}
                          onClick={(event) => {
                            event.stopPropagation();
                            onRemoveRow(row.rowKey);
                          }}
                          onDoubleClick={(event) => event.stopPropagation()}
                          title="Remove bank account"
                          aria-label="Remove bank account"
                        >
                          <FiTrash2 aria-hidden="true" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {dialog ? (
        <BankAccountDialog
          key={dialog.account.rowKey}
          account={dialog.account}
          isNew={dialog.isNew}
          defaultLocked={singleMandatory}
          onConfirm={handleConfirm}
          onCancel={() => closeDialog(dialog.isNew ? null : dialog.account.rowKey)}
        />
      ) : null}
    </div>
  );
}
