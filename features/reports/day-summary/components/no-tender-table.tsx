"use client";
/**
 * The No tender tab's list (server notes 126 §4): every cash / bank line no
 * tender row labels, first `NO_TENDER_LIMIT` of them. It should be empty;
 * each row is a transaction to look into. Enter opens the line's ledger
 * statement on its day, where the voucher sits among its neighbours.
 */
import { useRef } from "react";
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import { noTenderCells } from "../view/tender";
import type { TenderLine } from "../wire/types";
import { useRowCursor } from "./row-cursor";

type Props = { rows: readonly TenderLine[]; onLine: (row: TenderLine) => void };

export function NoTenderTable({ rows, onLine }: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const cursor = useRowCursor(rows.length, (i) => onLine(rows[i]), boxRef);

  return (
    <div
      ref={boxRef}
      className={styles.tableBox}
      tabIndex={0}
      role="grid"
      aria-label="Cash and bank lines with no tender"
      onKeyDown={cursor.onKeyDown}
      onFocus={cursor.onFocus}
    >
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Voucher</th>
            <th>Type</th>
            <th>Party</th>
            <th>Ledger</th>
            <th className={styles.num}>Debit</th>
            <th className={styles.num}>Credit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const c = noTenderCells(row);
            return (
              <tr
                // A voucher can leave one ledger twice (both sides of a contra), so the row's place keys it too.
                key={`${row.voucherId}|${row.ledgerId}|${i}`}
                data-row={i}
                className={cx(i === cursor.cursor && styles.rowFocused)}
                onMouseDown={() => cursor.setCursor(i)}
                onDoubleClick={() => onLine(row)}
                title="Enter: this ledger's statement on that day"
              >
                <td>{c.date}</td>
                <td>{c.voucher}</td>
                <td>{c.kind}</td>
                <td>{c.party}</td>
                <td>{c.ledger}</td>
                <td className={styles.num}>{c.debit}</td>
                <td className={styles.num}>{c.credit}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
