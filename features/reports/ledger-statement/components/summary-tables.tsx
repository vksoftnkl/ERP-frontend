"use client";
/**
 * The Daily and Monthly tabs (plan §9): small, unpaged tables with the same
 * Opening / Total / Closing rows as the voucher grid.
 *
 * Daily's figures come from `header.period` (the same source as the grid).
 * Monthly's Opening and Closing come from `/monthly` itself. Its "Total" is
 * not drawn, because `/monthly` sends no year total and the client does not
 * add money up.
 */
import type { KeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import { displayDate, monthLabel, previousDay } from "../wire/dates";
import { formatBal, formatCell } from "../wire/money";
import type { DailyPayload, MonthlyPayload, PeriodSummary } from "../wire/types";

function onActivate(run: () => void) {
  return (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      run();
    }
  };
}

export function DailyTable({
  daily,
  period,
  onPickDay,
}: {
  daily: DailyPayload | null;
  period: PeriodSummary | null;
  onPickDay: (day: string) => void;
}) {
  if (!daily) return <div className={styles.emptyState}>Loading the daily summary…</div>;
  return (
    <div className={styles.tableViewport}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Date</th>
            <th className={styles.num}>Vouchers</th>
            <th className={styles.num}>Debit</th>
            <th className={styles.num}>Credit</th>
            <th className={styles.num}>Closing</th>
          </tr>
        </thead>
        <tbody>
          <tr className={styles.tableSynthetic}>
            <td>{period ? `b/f from ${displayDate(previousDay(period.fromDate))}` : "Opening"}</td>
            <td colSpan={3}>Opening balance</td>
            <td className={styles.num}>{formatBal(period?.opening ?? daily.opening)}</td>
          </tr>
          {daily.days.length === 0 ? (
            <tr>
              <td colSpan={5} className={styles.muted}>
                No vouchers in this period.
              </td>
            </tr>
          ) : null}
          {daily.days.map((day) => (
            <tr
              key={day.date}
              tabIndex={0}
              onDoubleClick={() => onPickDay(day.date)}
              onKeyDown={onActivate(() => onPickDay(day.date))}
              title="Enter: the vouchers of this day"
            >
              <td>{displayDate(day.date)}</td>
              <td className={styles.num}>{day.vouchers}</td>
              <td className={styles.num}>{formatCell(day.debit)}</td>
              <td className={styles.num}>{formatCell(day.credit)}</td>
              <td className={styles.num}>{formatBal(day.closing)}</td>
            </tr>
          ))}
          {period ? (
            <tr className={styles.tableSynthetic}>
              <td colSpan={2}>Total for the period</td>
              <td className={styles.num}>{formatCell(period.debit.amount)}</td>
              <td className={styles.num}>{formatCell(period.credit.amount)}</td>
              <td />
            </tr>
          ) : null}
          <tr className={styles.tableClosing}>
            <td>{period ? `c/f ${displayDate(period.toDate)}` : "Closing"}</td>
            <td colSpan={3}>Closing balance</td>
            <td className={styles.num}>{formatBal(period?.closing ?? daily.closing)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function MonthlyTable({
  monthly,
  onPickMonth,
}: {
  monthly: MonthlyPayload | null;
  onPickMonth: (month: string) => void;
}) {
  if (!monthly) return <div className={styles.emptyState}>Loading the month-wise summary…</div>;
  return (
    <div className={styles.tableViewport}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Month</th>
            <th className={styles.num}>Debit</th>
            <th className={styles.num}>Credit</th>
            <th className={styles.num}>Closing</th>
          </tr>
        </thead>
        <tbody>
          <tr className={styles.tableSynthetic}>
            <td colSpan={3}>Opening balance (year begin)</td>
            <td className={styles.num}>{formatBal(monthly.opening)}</td>
          </tr>
          {monthly.months.map((m) =>
            m.isFuture ? (
              <tr key={m.month} className={styles.tableFuture}>
                <td>{monthLabel(m.month)}</td>
                <td className={styles.num}>—</td>
                <td className={styles.num}>—</td>
                <td className={styles.num}>—</td>
              </tr>
            ) : (
              <tr
                key={m.month}
                tabIndex={0}
                onDoubleClick={() => onPickMonth(m.month)}
                onKeyDown={onActivate(() => onPickMonth(m.month))}
                title="Enter: the vouchers of this month"
              >
                <td>{monthLabel(m.month)}</td>
                <td className={styles.num}>{formatCell(m.debit)}</td>
                <td className={styles.num}>{formatCell(m.credit)}</td>
                <td className={styles.num}>{formatBal(m.closing)}</td>
              </tr>
            ),
          )}
          <tr className={cx(styles.tableClosing)}>
            <td colSpan={3}>Closing balance (latest)</td>
            <td className={styles.num}>{formatBal(monthly.closing)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
