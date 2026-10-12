"use client";
/**
 * Cash & bank position (plan §7.3): `moneyLedgers[]`, grouped CASH → BANK →
 * CLEARING, Total from `moneyTotals.ALL`, and the tie-out note under it.
 * Enter on a ledger opens its Ledger Statement for the same range and branch.
 */
import { useMemo, useRef } from "react";
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import { groupMoneyRows, moneyCells, moneyTotalCells, NO_BALANCE, NO_BALANCE_TIP, tieOut } from "../view/cells";
import type { MoneyRow, SummaryPayload } from "../wire/types";
import { useRowCursor } from "./row-cursor";

type Props = {
  summary: SummaryPayload;
  clearingAsBank: boolean;
  onLedger: (row: MoneyRow) => void;
};

export function MoneyLedgerGrid({ summary, clearingAsBank, onLedger }: Props) {
  const rows = useMemo(() => groupMoneyRows(summary.moneyLedgers), [summary.moneyLedgers]);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const cursor = useRowCursor(rows.length, (i) => onLedger(rows[i]), boxRef);
  const total = moneyTotalCells(summary.moneyTotals.ALL);
  const tie = tieOut(summary, clearingAsBank);

  return (
    <>
      <div
        ref={boxRef}
        className={styles.tableBox}
        tabIndex={0}
        role="grid"
        aria-label="Cash and bank position"
        onKeyDown={cursor.onKeyDown}
        onFocus={cursor.onFocus}
      >
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Ledger</th>
              <th className={styles.num}>Opening</th>
              <th className={styles.num}>In</th>
              <th className={styles.num}>Out</th>
              <th className={styles.num}>Closing</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.mutedCell}>
                  No cash or bank ledger moved, and none has an opening.
                </td>
              </tr>
            ) : null}
            {rows.map((row, i) => {
              const c = moneyCells(row);
              return (
                <tr
                  key={row.ledgerId}
                  data-row={i}
                  className={cx(i === cursor.cursor && styles.rowFocused)}
                  onMouseDown={() => cursor.setCursor(i)}
                  onDoubleClick={() => onLedger(row)}
                  title="Enter: this ledger's statement"
                >
                  <td>
                    {c.ledger}
                    {c.kind ? <span className={styles.kindTag}>{c.kind}</span> : null}
                  </td>
                  <td className={styles.num} title={c.opening === NO_BALANCE ? NO_BALANCE_TIP : undefined}>
                    {c.openingNote ? (
                      <span className={styles.noteMark} title={c.openingNote} aria-label={c.openingNote}>
                        ⓘ
                      </span>
                    ) : null}
                    {c.opening}
                  </td>
                  <td className={styles.num}>{c.in}</td>
                  <td className={styles.num}>{c.out}</td>
                  <td className={cx(styles.num, styles.bold)} title={c.closing === NO_BALANCE ? NO_BALANCE_TIP : undefined}>
                    {c.closing}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className={styles.num}>{total.opening}</td>
              <td className={styles.num}>{total.in}</td>
              <td className={styles.num}>{total.out}</td>
              <td className={styles.num}>{total.closing}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className={cx(styles.tieNote, styles[`tie-${tie.tone}`])} role="status">
        <span className={styles.tieHeading}>{tie.heading}</span>
        {tie.lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>
    </>
  );
}
