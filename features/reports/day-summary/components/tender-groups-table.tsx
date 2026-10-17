"use client";
/**
 * The By tender tab (server notes 126 §4): one row per cash / bank ledger ×
 * tender master (or × tender type), opening · debit · credit · closing as the
 * server sent them. A "no tender" row that moved in the range is red: money
 * nobody said how it moved. Under Tender type the Tender column is always
 * empty, so it is not drawn. Enter on a row opens the ledger's statement.
 */
import { useRef } from "react";
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import { tenderGroupCells } from "../view/tender";
import type { TenderGroup, TenderGroupBy } from "../wire/types";
import { useRowCursor } from "./row-cursor";

type Props = { groups: readonly TenderGroup[]; groupBy: TenderGroupBy; onLedger: (row: TenderGroup) => void };

export function TenderGroupsTable({ groups, groupBy, onLedger }: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const cursor = useRowCursor(groups.length, (i) => onLedger(groups[i]), boxRef);
  const byTender = groupBy === "TENDER";

  return (
    <div
      ref={boxRef}
      className={styles.tableBox}
      tabIndex={0}
      role="grid"
      aria-label="Day Book by tender"
      onKeyDown={cursor.onKeyDown}
      onFocus={cursor.onFocus}
    >
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Ledger</th>
            <th>Tender type</th>
            {byTender ? <th>Tender</th> : null}
            <th className={styles.num}>Opening</th>
            <th className={styles.num}>Debit</th>
            <th className={styles.num}>Credit</th>
            <th className={styles.num}>Closing</th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 ? (
            <tr>
              <td colSpan={byTender ? 7 : 6} className={styles.mutedCell}>
                No cash or bank ledger has a line this year up to the To date.
              </td>
            </tr>
          ) : null}
          {groups.map((row, i) => {
            const c = tenderGroupCells(row);
            return (
              <tr
                key={row.key}
                data-row={i}
                className={cx(c.danger && styles.rowDanger, i === cursor.cursor && styles.rowFocused)}
                onMouseDown={() => cursor.setCursor(i)}
                onDoubleClick={() => onLedger(row)}
                title="Enter: this ledger's statement"
              >
                <td>{c.ledger}</td>
                <td>{c.type}</td>
                {byTender ? <td>{c.tender}</td> : null}
                <td className={styles.num}>{c.opening}</td>
                <td className={styles.num}>{c.debit}</td>
                <td className={styles.num}>{c.credit}</td>
                <td className={cx(styles.num, styles.bold)}>{c.closing}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
