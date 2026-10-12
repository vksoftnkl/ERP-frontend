"use client";

/**
 * HOW IT WAS PAID — the tenders (Qt `tblTenders`): Tender · Account · Ref ·
 * Amount. Cash, a bank transfer or UPI; never a cheque (a cheque is a
 * bill-wise Payment, which keeps the issued-cheque register).
 *
 * Account is where the money really comes from, as the server's check says it
 * — "drawer · this session", "safe · <name>", or the tender's own ledger —
 * and the tender master's ledger until the check has answered.
 */
import { cx } from "@/components/design-system/cx";
import type { ExpenseTenderDraft, ExpenseTenderOption } from "../expense.types";
import { tidyAmountText } from "../domain/money";
import { isCashTender, tenderChoices } from "../domain/pickers";
import styles from "../expense.module.scss";

export type TendersGridProps = {
  rows: readonly ExpenseTenderDraft[];
  accounts: readonly string[];
  fresh: boolean;
  editable: boolean;
  options: readonly ExpenseTenderOption[];
  activeKey: string | null;
  focusKey: string | null;
  onActivate: (key: string) => void;
  onChange: (key: string, patch: Partial<ExpenseTenderDraft>) => void;
};

export function TendersGrid(props: TendersGridProps) {
  const { rows, accounts, fresh, editable, options, activeKey, focusKey, onActivate, onChange } = props;

  return (
    <div className={styles.gridShell}>
      <table className={styles.grid} aria-label="How it was paid">
        <colgroup>
          <col style={{ width: "calc(9.4 * var(--erp-q-u, 1rem))" }} />
          <col />
          <col />
          <col style={{ width: "calc(7 * var(--erp-q-u, 1rem))" }} />
        </colgroup>
        <thead>
          <tr>
            <th>Tender</th>
            <th>Account</th>
            <th>Ref</th>
            <th className={styles.alignRight}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const choices = tenderChoices(options, row);
            const cash = isCashTender(options, row.tenderId);
            return (
              <tr
                key={row.key}
                className={cx(row.key === activeKey && styles.rowActive)}
                onFocus={() => onActivate(row.key)}
                onMouseDown={() => onActivate(row.key)}
              >
                <td>
                  <select
                    className={styles.cellSelect}
                    value={row.tenderId}
                    disabled={!editable}
                    autoFocus={row.key === focusKey}
                    aria-label={`Tender ${index + 1}`}
                    onChange={(event) => {
                      const option = options.find((candidate) => candidate.tenderId === event.target.value);
                      onChange(row.key, { tenderId: event.target.value, tenderName: option?.name ?? "" });
                    }}
                  >
                    {row.tenderId ? null : <option value="">—</option>}
                    {choices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td title={accounts[index] ?? ""}>
                  <span className={cx(styles.cellText, !fresh && styles.cellPending)}>{accounts[index] ?? ""}</span>
                </td>
                <td>
                  <input
                    className={styles.cellInput}
                    value={row.refNo}
                    maxLength={100}
                    data-uppercase="off"
                    autoComplete="off"
                    disabled={!editable}
                    placeholder={cash ? "—" : "UTR / txn id"}
                    aria-label={`Tender ${index + 1} reference`}
                    onChange={(event) => onChange(row.key, { refNo: event.target.value })}
                  />
                </td>
                <td>
                  <input
                    className={cx(styles.cellInput, styles.cellAmount)}
                    value={row.amount}
                    inputMode="decimal"
                    data-uppercase="off"
                    autoComplete="off"
                    disabled={!editable}
                    aria-label={`Tender ${index + 1} amount`}
                    onChange={(event) => onChange(row.key, { amount: event.target.value })}
                    onBlur={(event) => {
                      const tidy = tidyAmountText(event.target.value);
                      if (tidy !== row.amount) {
                        onChange(row.key, { amount: tidy });
                      }
                    }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
