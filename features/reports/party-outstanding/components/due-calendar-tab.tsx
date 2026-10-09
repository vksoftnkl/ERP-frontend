"use client";
/**
 * Due calendar (plan §11.3): what falls due on each day of a window (default
 * As on → As on + 30, the server allows 92 days), and one lump for what is
 * already overdue before it. Each day shows the amount and the bill count,
 * darker for more bills. A click on a day opens the Bill-wise tab on bills
 * due that day.
 *
 * The server lists only days with something due; this lays the window out as
 * weeks. That layout is the only date arithmetic here, and it decides where a
 * day is drawn, never what is due on it.
 */
import { useMemo, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { addDays, dayMonthLabel, displayDate, weekdayOf } from "@/features/reports/shared/wire/dates";
import { formatAmount } from "@/features/reports/shared/wire/money";
import styles from "../page.module.scss";
import type { DueCalendarPayload, DueDay } from "../wire/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** A runaway window can never lay out forever. */
const MAX_DAYS = 400;

type Cell = { date: string; due: DueDay | null } | null;

function weeks(from: string, to: string, days: readonly DueDay[]): Cell[][] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const out: Cell[][] = [];
  let week: Cell[] = Array.from({ length: weekdayOf(from) }, () => null);
  let date = from;
  for (let i = 0; i < MAX_DAYS && date <= to; i += 1) {
    week.push({ date, due: byDate.get(date) ?? null });
    if (week.length === 7) {
      out.push(week);
      week = [];
    }
    date = addDays(date, 1);
  }
  if (week.length > 0) out.push([...week, ...Array.from({ length: 7 - week.length }, () => null)]);
  return out;
}

type Props = {
  calendar: DueCalendarPayload | null;
  window: { from: string; to: string };
  asOn: string;
  loading: boolean;
  onWindow: (from: string, to: string) => void;
  onPickDay: (date: string) => void;
};

export function DueCalendarTab({ calendar, window, asOn, loading, onWindow, onPickDay }: Props) {
  const [from, setFrom] = useState(window.from);
  const [to, setTo] = useState(window.to);
  const [seeded, setSeeded] = useState(`${window.from}|${window.to}`);
  if (seeded !== `${window.from}|${window.to}`) {
    setSeeded(`${window.from}|${window.to}`);
    setFrom(window.from);
    setTo(window.to);
  }

  const layout = useMemo(
    () => (calendar ? weeks(calendar.from, calendar.to, calendar.days) : []),
    [calendar],
  );
  const most = useMemo(() => Math.max(1, ...(calendar?.days ?? []).map((day) => day.bills)), [calendar]);

  return (
    <div className={styles.section} style={{ flex: "1 1 auto" }}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionTitle}>Due calendar</span>
        <span className={styles.sectionNote}>owed bills pending on {displayDate(asOn)}, by due date · click a day</span>
        <span className={styles.sectionTools}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>From</span>
            <input type="date" className={cx(styles.input, styles.inputDate)} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>To</span>
            <input type="date" className={cx(styles.input, styles.inputDate)} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button type="button" className={styles.button} onClick={() => onWindow(from, to)} title="At most 92 days">
            Show window
          </button>
        </span>
      </div>
      {!calendar ? (
        <div className={styles.emptyState}>{loading ? "Loading…" : ""}</div>
      ) : (
        <div className={styles.calendarWrap}>
          <div className={styles.calendarSide}>
            <div className={styles.overdueLump}>
              Overdue before {displayDate(calendar.from)}
              <strong>{formatAmount(calendar.overdueBefore.amount)}</strong>
              <span className={styles.muted}>
                {calendar.overdueBefore.bills} {calendar.overdueBefore.bills === 1 ? "bill" : "bills"}
              </span>
            </div>
          </div>
          <div className={styles.calendarGrid}>
            <div className={styles.calHead}>
              {WEEKDAYS.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            {layout.map((week, w) => (
              <div key={w} className={styles.calWeek}>
                {week.map((cell, d) => {
                  if (!cell) return <div key={d} className={cx(styles.calDay, styles.calBlank)} />;
                  const { date, due } = cell;
                  if (!due) {
                    return (
                      <div key={date} className={cx(styles.calDay, date === asOn && styles.calToday)}>
                        <span className={styles.calDate}>{dayMonthLabel(date)}</span>
                      </div>
                    );
                  }
                  // Darker for more bills: a count, not money.
                  const strength = 0.12 + 0.5 * (due.bills / most);
                  return (
                    <button
                      key={date}
                      type="button"
                      className={cx(styles.calDay, date === asOn && styles.calToday, strength > 0.4 && styles.calStrong)}
                      style={{ background: `rgba(15, 118, 110, ${strength.toFixed(2)})` }}
                      title={`${due.parties} ${due.parties === 1 ? "party" : "parties"} · open the bills due on ${displayDate(date)}`}
                      onClick={() => onPickDay(date)}
                    >
                      <span className={styles.calDate}>{dayMonthLabel(date)}</span>
                      <span className={styles.calAmount}>{formatAmount(due.amount)}</span>
                      <span className={styles.calBills}>
                        {due.bills} {due.bills === 1 ? "bill" : "bills"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
