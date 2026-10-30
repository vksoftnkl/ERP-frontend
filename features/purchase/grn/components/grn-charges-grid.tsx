"use client";

/**
 * CHARGES (off the bill — our own labour): the Qt `GrnEntry` charges grid —
 * Charge · Basis · Rate · Amount · Payee (loadman-wise). The blank row adds an
 * off-bill charge from the master (an on-bill charge is refused: it belongs on
 * the Purchase Entry). Rate opens unless the charge is Fixed; a typed Amount
 * wins over the rate. Enter / double-click on Payee picks the payees; Alt+−
 * (or − on a cell that types none) takes the row out. Rules: grn-charges.ts.
 */
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { PurchaseChargeNumberCell } from "../../shared/components/purchase-charge-cell";
import { money, num } from "../../shared/purchase.format";
import { chargeBasis, offBillMasters, payeeCell } from "../grn-charges";
import type { GrnChargeMasterRow, GrnChargeRow } from "../grn.types";
import styles from "../page.module.scss";

const RATE_PATTERN = /^\d*(\.\d{0,4})?$/;
const cellClass = cx(quotationStyles.cellInput, quotationStyles.alignRight, styles.boxedCell);
const AMOUNT_PATTERN = /^\d*(\.\d{0,2})?$/;

export type GrnChargesGridProps = {
  rows: readonly GrnChargeRow[];
  masters: readonly GrnChargeMasterRow[];
  editable: boolean;
  onAdd: (chgId: string) => void;
  onEdit: (key: string, field: "rate" | "amount", raw: string) => void;
  onRemove: (key: string) => void;
  onPayees: (row: GrnChargeRow) => void;
};

export function GrnChargesGrid({ rows, masters, editable, onAdd, onEdit, onRemove, onPayees }: GrnChargesGridProps) {
  const choices = offBillMasters(masters);
  const onRowKey = (event: ReactKeyboardEvent<HTMLTableRowElement>, row: GrnChargeRow) => {
    if (!editable || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    const typing = target instanceof HTMLInputElement && !target.readOnly;
    const minus = event.key === "-" || event.key === "−" || (event.altKey && (event.code === "Minus" || event.code === "NumpadSubtract"));
    if (minus && (event.altKey || !typing)) {
      event.preventDefault();
      onRemove(row.key);
    }
  };
  return (
    <div className={styles.chargesViewport}>
      <table className={cx(quotationStyles.grid, styles.chargesGrid)}>
        <colgroup>
          <col style={{ width: "24%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "13%" }} />
          <col style={{ width: "36%" }} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Charge</th>
            <th scope="col">Basis</th>
            <th scope="col">Rate</th>
            <th scope="col">Amount</th>
            <th scope="col">Payee (loadman-wise)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.key}
              className={index % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven}
              onKeyDown={(event) => onRowKey(event, row)}
            >
              <td>
                <div className={quotationStyles.cellText} title={editable ? "Alt+− takes the row out" : undefined}>
                  {row.name}
                </div>
              </td>
              <td>
                <div className={quotationStyles.cellText}>{chargeBasis(row.method, row.type)}</div>
              </td>
              <td>
                {editable && row.method !== "FIXED" ? (
                  <PurchaseChargeNumberCell
                    className={cellClass}
                    value={row.rate}
                    pattern={RATE_PATTERN}
                    label={`${row.name} rate`}
                    onCommit={(raw) => onEdit(row.key, "rate", raw)}
                  />
                ) : (
                  <div className={cx(quotationStyles.cellText, quotationStyles.alignRight)}>
                    {row.method === "FIXED" || row.rate === "" ? "" : money(num(row.rate))}
                  </div>
                )}
              </td>
              <td>
                {editable ? (
                  <PurchaseChargeNumberCell
                    className={cellClass}
                    value={row.amount}
                    pattern={AMOUNT_PATTERN}
                    label={`${row.name} amount`}
                    onCommit={(raw) => onEdit(row.key, "amount", raw)}
                  />
                ) : (
                  <div className={cx(quotationStyles.cellText, quotationStyles.alignRight)}>
                    {row.amount === "" ? "" : money(num(row.amount))}
                  </div>
                )}
              </td>
              <td>
                <button
                  type="button"
                  className={styles.payeeCell}
                  disabled={!editable}
                  title={editable ? "Enter or double-click: who is owed this charge" : undefined}
                  onDoubleClick={() => onPayees(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onPayees(row);
                    }
                  }}
                >
                  <span className={quotationStyles.cellText}>{payeeCell(row)}</span>
                </button>
              </td>
            </tr>
          ))}
          {editable ? (
            <tr className={rows.length % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven}>
              <td colSpan={5}>
                <select
                  className={cx(quotationStyles.cellInput, styles.cellSelect, styles.promptSelect)}
                  value=""
                  aria-label="Add a charge"
                  onChange={(event) => {
                    if (event.target.value) onAdd(event.target.value);
                  }}
                >
                  <option value="">add charge…   (only charges with On supplier bill = No)</option>
                  {choices.map((master) => (
                    <option key={master.chgId} value={master.chgId}>
                      {master.chgName}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
