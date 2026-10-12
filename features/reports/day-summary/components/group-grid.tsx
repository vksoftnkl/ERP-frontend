"use client";
/**
 * The group summary (plan §7.4): `groups[]` + `groupTotals`, Net Dr blue and
 * Cr green. The Net total is the server's when sent, else "0.00" exactly when
 * the BALANCED check is OK. Enter on a group opens its ledgers.
 */
import { useRef } from "react";
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import { groupCells, groupTotalCells, type NetCell } from "../view/cells";
import type { GroupRow, GroupTotals } from "../wire/types";
import { useRowCursor } from "./row-cursor";

type Props = {
  rows: readonly GroupRow[];
  totals: GroupTotals;
  balancedOk: boolean;
  onOpen: (row: GroupRow) => void;
};

export function netClass(net: NetCell): string | undefined {
  return net.side === "DR" ? styles.netDr : net.side === "CR" ? styles.netCr : undefined;
}

export function GroupGrid({ rows, totals, balancedOk, onOpen }: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const cursor = useRowCursor(rows.length, (i) => onOpen(rows[i]), boxRef);
  const t = groupTotalCells(totals, balancedOk);

  return (
    <div
      ref={boxRef}
      className={styles.tableBox}
      tabIndex={0}
      role="grid"
      aria-label="Group summary"
      onKeyDown={cursor.onKeyDown}
      onFocus={cursor.onFocus}
    >
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Ledger group</th>
            <th>Nature</th>
            <th className={styles.num}>Debit</th>
            <th className={styles.num}>Credit</th>
            <th className={styles.num}>Net</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className={styles.mutedCell}>
                No group moved in range.
              </td>
            </tr>
          ) : null}
          {rows.map((row, i) => {
            const c = groupCells(row);
            return (
              <tr
                key={row.groupId}
                data-row={i}
                className={cx(i === cursor.cursor && styles.rowFocused)}
                onMouseDown={() => cursor.setCursor(i)}
                onDoubleClick={() => onOpen(row)}
                title="Enter: the ledgers in this group"
              >
                <td>{c.name}</td>
                <td className={styles.mutedCell}>{c.nature}</td>
                <td className={styles.num}>{c.debit}</td>
                <td className={styles.num}>{c.credit}</td>
                <td className={cx(styles.num, netClass(c.net))}>{c.net.text}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td />
            <td className={styles.num}>{t.debit}</td>
            <td className={styles.num}>{t.credit}</td>
            <td className={cx(styles.num, t.net.text === "0.00" ? styles.netCr : netClass(t.net))}>{t.net.text}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
