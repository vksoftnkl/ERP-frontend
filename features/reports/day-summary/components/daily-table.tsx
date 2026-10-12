"use client";
/**
 * The Day-wise tab (plan §8.3): one row per day of the range, with each
 * day's own running closing as the server sent it, under the range's opening
 * (when sent). Enter on a day opens the Summary tab for that one day. A Total
 * row only when the server sends one.
 */
import { useRef } from "react";
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import { balanceText, dailyCells, dailyTotalCells } from "../view/cells";
import type { DailyPayload, DailyRow } from "../wire/types";
import { useRowCursor } from "./row-cursor";

type Props = { daily: DailyPayload; countDrafts: boolean; onDay: (row: DailyRow) => void };

export function DailyTable({ daily, countDrafts, onDay }: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const cursor = useRowCursor(daily.rows.length, (i) => onDay(daily.rows[i]), boxRef);
  const t = daily.totals ? dailyTotalCells(daily.totals) : null;
  const span = countDrafts ? 12 : 11;

  return (
    <div
      ref={boxRef}
      className={styles.tableBox}
      tabIndex={0}
      role="grid"
      aria-label="Day-wise"
      onKeyDown={cursor.onKeyDown}
      onFocus={cursor.onFocus}
    >
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Date</th>
            <th className={styles.num}>Vouchers</th>
            {countDrafts ? <th className={styles.num}>Drafts</th> : null}
            <th className={styles.num}>Cancelled</th>
            <th className={styles.num}>Amount</th>
            <th className={styles.num}>Cash in</th>
            <th className={styles.num}>Cash out</th>
            <th className={styles.num}>Cash closing</th>
            <th className={styles.num}>Bank in</th>
            <th className={styles.num}>Bank out</th>
            <th className={styles.num}>Bank closing</th>
            <th>Day</th>
          </tr>
        </thead>
        <tbody>
          {daily.cashOpening || daily.bankOpening ? (
            <tr className={styles.mutedCell}>
              <td>Opening</td>
              <td colSpan={countDrafts ? 6 : 5} />
              <td className={styles.num}>{balanceText(daily.cashOpening)}</td>
              <td colSpan={2} />
              <td className={styles.num}>{balanceText(daily.bankOpening)}</td>
              <td />
            </tr>
          ) : null}
          {daily.rows.length === 0 ? (
            <tr>
              <td colSpan={span} className={styles.mutedCell}>
                No day in the range has a voucher. Tick Zero rows to list every day.
              </td>
            </tr>
          ) : null}
          {daily.rows.map((row, i) => {
            const c = dailyCells(row);
            return (
              <tr
                key={row.date}
                data-row={i}
                className={cx(i === cursor.cursor && styles.rowFocused)}
                onMouseDown={() => cursor.setCursor(i)}
                onDoubleClick={() => onDay(row)}
                title="Enter: this day's summary"
              >
                <td>{c.date}</td>
                <td className={styles.num}>{c.vouchers}</td>
                {countDrafts ? <td className={cx(styles.num, styles.draftCount)}>{c.drafts}</td> : null}
                <td className={cx(styles.num, styles.pairCount)}>{c.cancelled}</td>
                <td className={styles.num}>{c.amount}</td>
                <td className={styles.num}>{c.cashIn}</td>
                <td className={styles.num}>{c.cashOut}</td>
                <td className={cx(styles.num, styles.bold)}>{c.cashClosing}</td>
                <td className={styles.num}>{c.bankIn}</td>
                <td className={styles.num}>{c.bankOut}</td>
                <td className={cx(styles.num, styles.bold)}>{c.bankClosing}</td>
                <td>{c.day ? <span className={cx(styles.dayChip, styles[`day-${c.day.status}`])}>{c.day.text}</span> : null}</td>
              </tr>
            );
          })}
        </tbody>
        {t ? (
          <tfoot>
            <tr>
              <td>Total</td>
              <td className={styles.num}>{t.vouchers}</td>
              {countDrafts ? <td className={styles.num}>{t.drafts}</td> : null}
              <td className={styles.num}>{t.cancelled}</td>
              <td className={styles.num}>{t.amount}</td>
              <td className={styles.num}>{t.cashIn}</td>
              <td className={styles.num}>{t.cashOut}</td>
              <td />
              <td className={styles.num}>{t.bankIn}</td>
              <td className={styles.num}>{t.bankOut}</td>
              <td />
              <td />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
