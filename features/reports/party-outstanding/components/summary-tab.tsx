"use client";
/**
 * Group / area summary (plan §11.2): the report rolled up by Area, Group,
 * Salesman or Branch, every figure from `/summary`. Area and Salesman are
 * customer facts, so they are off on Payable (the server refuses them).
 *
 * Enter (or a double-click) on a row goes back to the Party-wise tab with that
 * area / group / salesman / branch as a filter: a URL write, like Show.
 *
 * `Number()` sizes the net bar and nothing else; the figure is the server's.
 */
import { useMemo, useState, type KeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { formatAmount, formatCell, isZeroAmount } from "@/features/reports/shared/wire/money";
import styles from "../page.module.scss";
import { bucketTone, netCell, onAccountSideOf } from "../view/cells";
import type { OutstandingSide, SummaryGroupBy, SummaryPayload, SummaryRow } from "../wire/types";
import { BUCKET_COL, minWidth, template, type Col } from "./grid-columns";
import { toneClass } from "./tone";

const GROUP_BY_LABEL: Record<SummaryGroupBy, string> = {
  AREA: "Area",
  GROUP: "Group",
  SALESMAN: "Salesman",
  BRANCH: "Branch",
};

const CUSTOMER_ONLY: readonly SummaryGroupBy[] = ["AREA", "SALESMAN"];
const NO_ROWS: readonly SummaryRow[] = [];

type Props = {
  summary: SummaryPayload | null;
  side: OutstandingSide;
  groupBy: SummaryGroupBy;
  onGroupBy: (groupBy: SummaryGroupBy) => void;
  onPick: (row: SummaryRow, groupBy: SummaryGroupBy) => void;
  loading: boolean;
};

function columns(bucketCount: number): Col[] {
  return [
    { min: 12, fr: 2 },
    { min: 4.4 },
    { min: 7.4 },
    { min: 6.6 },
    { min: 8.4 },
    { min: 6, fr: 1 },
    ...Array.from({ length: bucketCount }, () => BUCKET_COL),
    { min: 7.4 },
  ];
}

export function SummaryTab({ summary, side, groupBy, onGroupBy, onPick, loading }: Props) {
  const [focus, setFocus] = useState(0);
  const labels = summary?.bucketLabels ?? [];
  const cols = useMemo(() => columns(labels.length), [labels.length]);
  const grid = template(cols);
  const rows = summary?.rows ?? NO_ROWS;

  // Bar width only.
  const max = useMemo(() => Math.max(0, ...rows.map((row) => Number(row.net.amount) || 0)), [rows]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setFocus((i) => Math.min(rows.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setFocus((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter" && rows[focus] && summary) {
      event.preventDefault();
      onPick(rows[focus], summary.groupBy);
    }
  };

  return (
    <div className={styles.section} style={{ flex: "1 1 auto" }}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionTitle}>Summary</span>
        <div className={styles.segmented} role="radiogroup" aria-label="Group by">
          {(Object.keys(GROUP_BY_LABEL) as SummaryGroupBy[]).map((key) => {
            const disabled = side === "PAYABLE" && CUSTOMER_ONLY.includes(key);
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={groupBy === key}
                disabled={disabled}
                title={disabled ? "Areas and salesmen belong to customers" : undefined}
                className={cx(styles.segment, groupBy === key && styles.segmentActive)}
                onClick={() => onGroupBy(key)}
              >
                {GROUP_BY_LABEL[key]}
              </button>
            );
          })}
        </div>
        <span className={styles.sectionNote}>Enter on a row filters the Party-wise tab to it</span>
      </div>
      {!summary ? (
        <div className={styles.emptyState}>{loading ? "Loading…" : ""}</div>
      ) : (
        <div className={styles.gridViewport} tabIndex={0} role="grid" aria-label="Summary" onKeyDown={onKeyDown}>
          <div className={styles.gridTable} style={{ minWidth: minWidth(cols) }}>
            <div className={styles.gridHead} style={{ gridTemplateColumns: grid }} role="row">
              <div>{GROUP_BY_LABEL[summary.groupBy]}</div>
              <div className={styles.num}>Parties</div>
              <div className={styles.num}>Pending bills</div>
              <div className={styles.num}>On-acct Cr</div>
              <div className={styles.num}>Net outstanding</div>
              <div />
              {labels.map((label) => (
                <div key={label} className={styles.num}>
                  {label}
                </div>
              ))}
              <div className={styles.num}>Overdue</div>
            </div>
            {rows.map((row, i) => {
              const net = netCell(row.net, side);
              const credit = row.net.side === onAccountSideOf(side) && !isZeroAmount(row.net.amount);
              const width = max > 0 ? Math.max(0, Number(row.net.amount) || 0) / max : 0;
              return (
                <div
                  key={`${row.key ?? "none"}-${row.name}`}
                  className={cx(styles.gridRow, i === focus && styles.rowFocused)}
                  style={{ gridTemplateColumns: grid }}
                  role="row"
                  aria-selected={i === focus}
                  onMouseDown={() => setFocus(i)}
                  onDoubleClick={() => onPick(row, summary.groupBy)}
                  title={row.key ? "Double-click (or Enter) to see these parties" : undefined}
                >
                  <div title={row.name}>{row.name}</div>
                  <div className={styles.num}>{row.parties}</div>
                  <div className={styles.num}>{formatCell(row.owed)}</div>
                  <div className={cx(styles.num, styles.tCredit)}>{formatCell(row.onAccount)}</div>
                  <div className={cx(styles.num, styles.strong, toneClass(net.tone))}>{net.text}</div>
                  <div className={styles.barCell}>
                    <span
                      className={cx(styles.netBar, credit && styles.netBarCredit)}
                      style={{ width: `${width * 100}%` }}
                    />
                  </div>
                  {row.buckets.map((amount, b) => (
                    <div key={b} className={cx(styles.num, toneClass(bucketTone(b)))}>
                      {formatCell(amount)}
                    </div>
                  ))}
                  <div className={cx(styles.num, styles.tDanger)}>{formatCell(row.overdue)}</div>
                </div>
              );
            })}
            {rows.length === 0 ? (
              <div className={styles.emptyState}>Nothing pending for these filters.</div>
            ) : (
              <div className={styles.gridTotal} style={{ gridTemplateColumns: grid }} role="row">
                <div>Total</div>
                <div className={styles.num}>{summary.totals.parties}</div>
                <div className={styles.num}>{formatAmount(summary.totals.owed)}</div>
                <div className={cx(styles.num, styles.tCredit)}>{formatCell(summary.totals.onAccount)}</div>
                <div className={cx(styles.num, toneClass(netCell(summary.totals.net, side).tone))}>
                  {netCell(summary.totals.net, side).text}
                </div>
                <div />
                {summary.totals.buckets.map((amount, b) => (
                  <div key={b} className={cx(styles.num, toneClass(bucketTone(b)))}>
                    {formatCell(amount)}
                  </div>
                ))}
                <div className={cx(styles.num, styles.tDanger)}>{formatCell(summary.totals.overdue)}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
