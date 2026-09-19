"use client";
import type { CSSProperties } from "react";
import { FiPlusCircle, FiTrash2 } from "react-icons/fi";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import type { DropdownSelection } from "@/components/design-system/dropdown";
import {
  LEDGER_DROPDOWN_KEY,
  LEDGER_DROPDOWN_ROLE_PARAM,
  ROLE_DROPDOWN_KEY,
  SUPPLY_NATURE_OPTIONS,
} from "./constants";
import { roleAllowsSupplyNature } from "./lines";
import type { TaxRateLedgerRow, TaxRateSupplyNature } from "./types";
import type { LedgerRowValidationError } from "./validate";
import { useDropdownId } from "@/lib/configured-dropdowns";

/**
 * The Ledgers tab — the override surface, not the mapping itself.
 *
 * One row says "for THIS rate, role X posts to ledger Y instead of the chart-wide
 * default". Ledger resolution is two-level: this table first, then
 * `accounts.acc_ledger_map`. An empty grid is a complete configuration and the
 * normal case — the tab exists for the two splits a real chart legitimately
 * wants (by rate, and by supply nature), and they compose.
 *
 * Neither picker is a combo box: eleven roles would fit in one, the ledger list
 * does not, and one idiom for both is what the operator's hands already know.
 * Both are `NexDropdownSingle` over a configured dropdown, so which ledgers a
 * role may use stays a decision SQL makes (dropdown 51 joins `acc_ledger_role`
 * on `itrl_role` and applies `alr_want_type` / `alr_want_duty` /
 * `alr_want_nature`) and this component knows none of it.
 */

export type LedgerOverridesEditorProps = {
  rows: TaxRateLedgerRow[];
  disabled: boolean;
  error: LedgerRowValidationError | null;
  onAddRow: () => void;
  onChangeRow: (rowKey: string, patch: Partial<TaxRateLedgerRow>) => void;
  onRemoveRow: (rowKey: string) => void;
};

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
const hintStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: "#64748b",
  lineHeight: 1.45,
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
  textAlign: "left",
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
  padding: "0.3rem 0.35rem",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "middle",
};
const tdCenterStyle: CSSProperties = { ...tdStyle, textAlign: "center" };
/**
 * The height is set INLINE on purpose.
 *
 * `.erp-ms-modal .erp-ms-modal-body table :is(input, select, …)` in the global
 * master-shell skin forces `height: 24px` on every control inside a modal table,
 * which clips this select's text — and no class of ours can outrank it. An inline
 * declaration can, so the row keeps a control the operator can actually read.
 */
const cellSelectStyle: CSSProperties = {
  width: "100%",
  height: "1.75rem",
  lineHeight: 1.2,
  boxSizing: "border-box",
  padding: "0.2rem 0.4rem",
  border: "1px solid #d8e1ea",
  borderRadius: "0.35rem",
  fontSize: "0.78rem",
  background: "#fff",
};
/**
 * §5.3 — where the cell is not editable, SAY so. An input that silently refuses
 * is the single most common way this tab was reported broken.
 */
const cellSelectDisabledStyle: CSSProperties = {
  ...cellSelectStyle,
  background: "#f1f5f9",
  color: "#94a3b8",
  cursor: "not-allowed",
};
const emptyStyle: CSSProperties = {
  padding: "1rem 0.75rem",
  textAlign: "center",
  color: "#64748b",
  fontSize: "0.78rem",
  lineHeight: 1.5,
};
const errorStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: "#dc2626",
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

const COLUMN_COUNT = 6;

export default function LedgerOverridesEditor({
  rows,
  disabled,
  error,
  onAddRow,
  onChangeRow,
  onRemoveRow,
}: LedgerOverridesEditorProps) {
  // Configured dropdowns are named, not numbered — the registry answers with
  // this deployment's ids (see lib/configured-dropdowns).
  const roleDropdownId = useDropdownId(ROLE_DROPDOWN_KEY);
  const ledgerDropdownId = useDropdownId(LEDGER_DROPDOWN_KEY);
  const invalidCell = (row: TaxRateLedgerRow, field: LedgerRowValidationError["field"]) =>
    error?.rowKey === row.rowKey && error.field === field;

  return (
    <div style={wrapperStyle}>
      <p style={hintStyle}>
        Rows here override where this rate posts. Leave the grid empty and the rate
        posts wherever the posting ledger map says — that is a complete
        configuration, and the normal one.
      </p>
      <div style={toolbarStyle}>
        <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
          {rows.length} override{rows.length === 1 ? "" : "s"}
        </span>
        {!disabled ? (
          <button type="button" style={addButtonStyle} onClick={onAddRow}>
            <FiPlusCircle aria-hidden="true" />
            Add override
          </button>
        ) : null}
      </div>
      <div style={tableScrollStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thCenterStyle, width: "2.5rem" }}>#</th>
              <th style={{ ...thStyle, minWidth: "13rem" }}>Role</th>
              <th style={{ ...thStyle, minWidth: "9rem" }}>Supply Nature</th>
              <th style={{ ...thStyle, minWidth: "15rem" }}>Ledger</th>
              <th style={{ ...thCenterStyle, width: "4.5rem" }}>Active</th>
              <th style={{ ...thCenterStyle, width: "3rem" }} aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMN_COUNT} style={emptyStyle}>
                  No overrides. This rate posts through the chart-wide posting
                  ledger map.
                </td>
              </tr>
            ) : null}
            {rows.map((row, index) => {
              const roleSelection: DropdownSelection | null = row.role
                ? { id: row.role, text: row.roleLabel || row.role }
                : null;
              const ledgerSelection: DropdownSelection | null = row.ledgerId
                ? { id: row.ledgerId, text: row.ledgerName || row.ledgerId }
                : null;
              return (
                <tr key={row.rowKey}>
                  <td style={tdCenterStyle}>{index + 1}</td>
                  <td style={tdStyle}>
                    <NexDropdownSingle
                      dropdownId={roleDropdownId}
                      value={roleSelection}
                      disabled={disabled}
                      invalid={invalidCell(row, "role")}
                      placeholder="Pick a posting role"
                      aria-label={`Role, row ${index + 1}`}
                      onChange={(selection) => {
                        const role = (selection?.id ?? "").trim().toUpperCase();
                        // Picking a role TEACHES the row whether the nature may be
                        // edited at all. Dropdown 52 carries alr_by_supply as a
                        // column, but the shared picker reports only {id, text} —
                        // so the flag is derived from the role code, which is the
                        // same four roles the catalogue marks and needs no second
                        // request to be right.
                        const bySupply = roleAllowsSupplyNature(role);
                        onChangeRow(row.rowKey, {
                          role,
                          roleLabel: selection?.text ?? "",
                          roleBySupply: bySupply,
                          // A role that cannot be narrowed drops any nature the row
                          // was carrying, rather than keeping a pair the guard would
                          // reject at save.
                          supplyNature: bySupply ? row.supplyNature : "",
                          // Output CGST wants a Central Tax ledger and Sales wants an
                          // income ledger, so a ledger carried over from the previous
                          // role is a pair the server refuses. Clear it.
                          ledgerId: "",
                          ledgerName: "",
                        });
                      }}
                    />
                  </td>
                  <td style={tdStyle}>
                    <select
                      style={
                        row.roleBySupply ? cellSelectStyle : cellSelectDisabledStyle
                      }
                      aria-label={`Supply nature, row ${index + 1}`}
                      disabled={disabled || !row.roleBySupply}
                      title={
                        row.roleBySupply
                          ? undefined
                          : `${row.roleLabel || row.role || "This role"} already implies its supply nature, so it cannot be narrowed.`
                      }
                      value={row.supplyNature}
                      onChange={(event) =>
                        onChangeRow(row.rowKey, {
                          supplyNature: event.target.value as "" | TaxRateSupplyNature,
                        })
                      }
                    >
                      {SUPPLY_NATURE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <NexDropdownSingle
                      dropdownId={ledgerDropdownId}
                      value={ledgerSelection}
                      disabled={disabled || !row.role}
                      invalid={invalidCell(row, "ledger")}
                      placeholder={row.role ? "Pick a ledger" : "Pick a role first"}
                      aria-label={`Ledger, row ${index + 1}`}
                      // The parameter is per ROW, not per column. Qt has to re-stamp
                      // its PopupConfig on every cursor move; here it is a prop.
                      params={{ [LEDGER_DROPDOWN_ROLE_PARAM]: row.role }}
                      // The role change above already clears the ledger, so leave the
                      // component's own clearing off: it would also fire while a
                      // saved row is being seeded.
                      clearOnParamsChange={false}
                      emptyText="No global ledger matches what this role requires."
                      onChange={(selection) =>
                        onChangeRow(row.rowKey, {
                          ledgerId: selection?.id ?? "",
                          ledgerName: selection?.text ?? "",
                        })
                      }
                    />
                  </td>
                  <td style={tdCenterStyle}>
                    <input
                      type="checkbox"
                      aria-label={`Active, row ${index + 1}`}
                      checked={row.isActive}
                      disabled={disabled}
                      onChange={(event) =>
                        onChangeRow(row.rowKey, { isActive: event.target.checked })
                      }
                    />
                  </td>
                  <td style={tdCenterStyle}>
                    {!disabled ? (
                      <button
                        type="button"
                        style={removeButtonStyle}
                        aria-label={`Remove row ${index + 1}`}
                        onClick={() => onRemoveRow(row.rowKey)}
                      >
                        <FiTrash2 aria-hidden="true" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error ? <p style={errorStyle}>{error.message}</p> : null}
    </div>
  );
}

