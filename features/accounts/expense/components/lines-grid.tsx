"use client";

/**
 * WHAT WAS SPENT — the expense lines (Qt `tblLines`).
 *
 *   #  Reason  Expense ledger  Description  Amount|Taxable  GST  ITC  Tax  Total
 *
 * A reason (the EXPENSE till reasons) fills its ledger, and the description
 * when that is empty. The ledger list is `/expenses/ledger-pick` — only
 * ledgers under an Expenses group, so a party, cash, bank or tax ledger cannot
 * even be offered. With a GST bill the amount is the TAXABLE value and each
 * line takes a rate and the ITC tick; GST, ITC and Tax are hidden without one.
 * Tax and Total are the server's own figures (`domain/view.ts`).
 */
import { useMemo } from "react";
import { cx } from "@/components/design-system/cx";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { SearchableSelect } from "@/components/design-system/ui/searchable-select";
import type { ExpenseLedgerOption, ExpenseLineDraft, ExpenseQuickReason } from "../expense.types";
import { tidyAmountText } from "../domain/money";
import { ledgerChoices, reasonChoices } from "../domain/pickers";
import type { ExpenseView } from "../domain/view";
import styles from "../expense.module.scss";

/** Qt's column widths (34, 170, 190, stretch, 110, 120, 40, 90, 100 px), in the fluid unit. */
const WIDTH = {
  no: "calc(2.2 * var(--erp-q-u, 1rem))",
  reason: "calc(10 * var(--erp-q-u, 1rem))",
  ledger: "calc(11.5 * var(--erp-q-u, 1rem))",
  amount: "calc(6.8 * var(--erp-q-u, 1rem))",
  gst: "calc(7.5 * var(--erp-q-u, 1rem))",
  itc: "calc(2.6 * var(--erp-q-u, 1rem))",
  tax: "calc(5.6 * var(--erp-q-u, 1rem))",
  total: "calc(6.4 * var(--erp-q-u, 1rem))",
};

export type LinesGridProps = {
  lines: readonly ExpenseLineDraft[];
  cells: ExpenseView["lineCells"];
  fresh: boolean;
  gstBill: boolean;
  editable: boolean;
  reasons: readonly ExpenseQuickReason[];
  ledgers: readonly ExpenseLedgerOption[];
  taxDropdownId: string;
  activeKey: string | null;
  /** The row just added: its Reason takes the caret (Qt `addLine`). */
  focusKey: string | null;
  onActivate: (key: string) => void;
  onPickReason: (key: string, reasonId: string) => void;
  onChange: (key: string, patch: Partial<ExpenseLineDraft>) => void;
};

export function LinesGrid(props: LinesGridProps) {
  const {
    lines,
    cells,
    fresh,
    gstBill,
    editable,
    reasons,
    ledgers,
    taxDropdownId,
    activeKey,
    focusKey,
    onActivate,
    onPickReason,
    onChange,
  } = props;
  const ledgerNames = useMemo(() => new Map(ledgers.map((ledger) => [ledger.ledgerId, ledger.name])), [ledgers]);

  return (
    <div className={styles.gridShell}>
      <table className={styles.grid} aria-label="What was spent">
        <colgroup>
          <col style={{ width: WIDTH.no }} />
          <col style={{ width: WIDTH.reason }} />
          <col style={{ width: WIDTH.ledger }} />
          <col />
          <col style={{ width: WIDTH.amount }} />
          {gstBill ? <col style={{ width: WIDTH.gst }} /> : null}
          {gstBill ? <col style={{ width: WIDTH.itc }} /> : null}
          {gstBill ? <col style={{ width: WIDTH.tax }} /> : null}
          <col style={{ width: WIDTH.total }} />
        </colgroup>
        <thead>
          <tr>
            <th>#</th>
            <th>Reason</th>
            <th>Expense ledger</th>
            <th>Description</th>
            <th className={styles.alignRight}>{gstBill ? "Taxable" : "Amount"}</th>
            {gstBill ? <th>GST</th> : null}
            {gstBill ? <th className={styles.alignCenter}>ITC</th> : null}
            {gstBill ? <th className={styles.alignRight}>Tax</th> : null}
            <th className={styles.alignRight}>Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const cell = cells[index] ?? { tax: "", total: "" };
            return (
              <tr
                key={line.key}
                className={cx(line.key === activeKey && styles.rowActive)}
                onFocus={() => onActivate(line.key)}
                onMouseDown={() => onActivate(line.key)}
              >
                <td>
                  <span className={styles.cellText}>{index + 1}</span>
                </td>
                <td>
                  <select
                    className={styles.cellSelect}
                    value={line.reasonId}
                    disabled={!editable}
                    autoFocus={line.key === focusKey}
                    aria-label={`Line ${index + 1} reason`}
                    onChange={(event) => onPickReason(line.key, event.target.value)}
                  >
                    {reasonChoices(reasons, line).map((choice) => (
                      <option key={choice.value || "none"} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td title={ledgerNames.get(line.ledgerId) ?? line.ledgerName}>
                  <SearchableSelect
                    className={styles.cellPicker}
                    value={line.ledgerId}
                    options={ledgerChoices(ledgers, line)}
                    disabled={!editable}
                    placeholder="expense ledger"
                    searchPlaceholder="Search expense ledgers"
                    emptyText="No expense ledger matches."
                    onChange={(ledgerId) =>
                      onChange(line.key, {
                        ledgerId,
                        ledgerName: ledgerNames.get(ledgerId) ?? line.ledgerName,
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.cellInput}
                    value={line.description}
                    maxLength={250}
                    disabled={!editable}
                    aria-label={`Line ${index + 1} description`}
                    onChange={(event) => onChange(line.key, { description: event.target.value })}
                  />
                </td>
                <td>
                  <input
                    className={cx(styles.cellInput, styles.cellAmount)}
                    value={line.amount}
                    inputMode="decimal"
                    data-uppercase="off"
                    autoComplete="off"
                    disabled={!editable}
                    aria-label={`Line ${index + 1} ${gstBill ? "taxable value" : "amount"}`}
                    onChange={(event) => onChange(line.key, { amount: event.target.value })}
                    onBlur={(event) => {
                      const tidy = tidyAmountText(event.target.value);
                      if (tidy !== line.amount) {
                        onChange(line.key, { amount: tidy });
                      }
                    }}
                  />
                </td>
                {gstBill ? (
                  <td>
                    <NexDropdownSingle
                      dropdownId={taxDropdownId}
                      className={styles.cellPicker}
                      value={line.taxId ? { id: line.taxId, text: line.taxName } : null}
                      onChange={(selection) =>
                        onChange(line.key, { taxId: selection?.id ?? "", taxName: selection?.text ?? "" })
                      }
                      disabled={!editable}
                      placeholder="—"
                      aria-label={`Line ${index + 1} GST rate`}
                    />
                  </td>
                ) : null}
                {gstBill ? (
                  <td>
                    <span className={styles.cellCheck}>
                      <input
                        type="checkbox"
                        checked={line.itc}
                        disabled={!editable}
                        aria-label={`Line ${index + 1} claim ITC`}
                        title="Claim the input tax (unticked: the tax is part of the expense)"
                        onChange={(event) => onChange(line.key, { itc: event.target.checked })}
                      />
                    </span>
                  </td>
                ) : null}
                {gstBill ? (
                  <td className={styles.alignRight}>
                    <span className={cx(styles.cellText, !fresh && styles.cellPending)}>{cell.tax}</span>
                  </td>
                ) : null}
                <td className={styles.alignRight}>
                  <span className={cx(styles.cellText, gstBill && !fresh && styles.cellPending)}>{cell.total}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
