"use client";
/**
 * The voucher-type grid (plan §7.2): `types[]` + `typeTotals`. Blank for
 * zero; the Total row is the server's, never a sum of the rows. Enter or a
 * double-click opens the Vouchers tab on that type.
 */
import { useRef } from "react";
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import { bankHeadings, typeCells, typeTotalCells } from "../view/cells";
import type { TypeRow, TypeTotals } from "../wire/types";
import { useRowCursor } from "./row-cursor";
import { TypeChip } from "./type-chip";

type Props = {
  rows: readonly TypeRow[];
  totals: TypeTotals;
  countDrafts: boolean;
  clearingAsBank: boolean;
  onDrill: (row: TypeRow) => void;
};

export function VoucherTypeGrid({ rows, totals, countDrafts, clearingAsBank, onDrill }: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const cursor = useRowCursor(rows.length, (i) => onDrill(rows[i]), boxRef);
  const bank = bankHeadings(clearingAsBank);
  const t = typeTotalCells(totals);

  return (
    <div
      ref={boxRef}
      className={styles.tableBox}
      tabIndex={0}
      role="grid"
      aria-label="Voucher-type summary"
      onKeyDown={cursor.onKeyDown}
      onFocus={cursor.onFocus}
    >
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Type</th>
            <th className={styles.num}>Vouchers</th>
            {countDrafts ? <th className={styles.num}>Draft</th> : null}
            <th className={styles.num}>Cancelled</th>
            <th className={styles.num}>Amount</th>
            <th className={styles.num}>Cash in</th>
            <th className={styles.num}>Cash out</th>
            <th className={styles.num}>{bank.in}</th>
            <th className={styles.num}>{bank.out}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={countDrafts ? 9 : 8} className={styles.mutedCell}>
                No vouchers in range.
              </td>
            </tr>
          ) : null}
          {rows.map((row, i) => {
            const c = typeCells(row);
            return (
              <tr
                key={row.voucherTypeId}
                data-row={i}
                className={cx(i === cursor.cursor && styles.rowFocused)}
                onMouseDown={() => cursor.setCursor(i)}
                onDoubleClick={() => onDrill(row)}
              >
                <td>
                  <TypeChip chip={c.chip} />
                </td>
                <td className={styles.num}>{c.vouchers}</td>
                {countDrafts ? <td className={cx(styles.num, styles.draftCount)}>{c.drafts}</td> : null}
                <td className={cx(styles.num, styles.pairCount)} title={c.cancelled.title ?? undefined}>
                  {c.cancelled.text}
                </td>
                <td className={styles.num}>{c.amount}</td>
                <td className={styles.num}>{c.cashIn}</td>
                <td className={styles.num}>{c.cashOut}</td>
                <td className={styles.num}>{c.bankIn}</td>
                <td className={styles.num}>{c.bankOut}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className={styles.num}>{t.vouchers}</td>
            {countDrafts ? <td className={styles.num}>{t.drafts}</td> : null}
            <td className={styles.num} title={t.cancelled.title ?? undefined}>
              {t.cancelled.text}
            </td>
            <td className={styles.num}>{t.amount}</td>
            <td className={styles.num}>{t.cashIn}</td>
            <td className={styles.num}>{t.cashOut}</td>
            <td className={styles.num}>{t.bankIn}</td>
            <td className={styles.num}>{t.bankOut}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
