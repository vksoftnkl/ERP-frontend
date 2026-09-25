"use client";
/**
 * The three panels over the report (plan §7): the ledger's facts, the period
 * summary, and the month-wise strip.
 *
 * The Period summary's four figures are the reference for the whole screen:
 * the grid's Total and Closing rows are drawn from the same `header.period`.
 */
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import { displayDate, monthLabel } from "../wire/dates";
import { formatAmount, formatBal, isZeroAmount } from "../wire/money";
import type { LedgerFacts, MonthlyPayload, MonthlyRow, PeriodSummary } from "../wire/types";

const DASH = "—";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function LedgerDetailPanel({ ledger }: { ledger: LedgerFacts | null }) {
  // No credit-limit column existed when the plan was written (L6); the server
  // now sends one for customers. A dash says "not recorded", and hiding the
  // fact would say "not relevant", so it always shows.
  const limit = ledger?.creditLimit ? formatAmount(ledger.creditLimit) : DASH;
  const days = ledger?.creditDays != null ? `${ledger.creditDays} days` : DASH;
  return (
    <section className={styles.panel} aria-label="Ledger detail">
      <h2 className={styles.panelTitle}>Ledger detail</h2>
      <div className={styles.panelBody}>
        <p className={styles.ledgerName} title={ledger?.name}>
          {ledger?.name ?? DASH}
        </p>
        <dl className={styles.facts}>
          <Fact label="Group">{ledger?.groupName ?? DASH}</Fact>
          <Fact label="Nature">{ledger?.nature ?? DASH}</Fact>
          <Fact label="Maintain">{ledger ? (ledger.isBillByBill ? "Bill by bill" : "Balance only") : DASH}</Fact>
          <Fact label="GSTIN">{ledger?.gstin || DASH}</Fact>
          <Fact label="Credit">
            {limit} <span className={styles.muted}>·</span> {days}
          </Fact>
          <Fact label="Mobile">{ledger?.mobile || DASH}</Fact>
        </dl>
      </div>
    </section>
  );
}

export function PeriodSummaryPanel({ period }: { period: PeriodSummary | null }) {
  return (
    <section className={styles.panel} aria-label="Period summary">
      <h2 className={styles.panelTitle}>Period summary</h2>
      <div className={styles.panelBody}>
        {period ? (
          <>
            <dl className={styles.summary}>
              <dt>Opening at {displayDate(period.fromDate)}</dt>
              <dd>{formatBal(period.opening)}</dd>
              <dt>
                Debits <span className={styles.muted}>({period.debit.vouchers} vouchers)</span>
              </dt>
              <dd>{formatAmount(period.debit.amount)}</dd>
              <dt>
                Credits <span className={styles.muted}>({period.credit.vouchers} vouchers)</span>
              </dt>
              <dd>{formatAmount(period.credit.amount)}</dd>
              <div className={styles.summaryClosing} style={{ display: "contents" }}>
                <dt>Closing at {displayDate(period.toDate)}</dt>
                <dd>{formatBal(period.closing)}</dd>
              </div>
            </dl>
            {period.cancelledPairs > 0 ? (
              <p className={styles.summaryNote}>
                {period.cancelledPairs} cancelled {period.cancelledPairs === 1 ? "pair" : "pairs"} in the period
                — both halves count.
              </p>
            ) : null}
          </>
        ) : (
          <p className={styles.muted}>{DASH}</p>
        )}
      </div>
    </section>
  );
}

/**
 * A bar's height. The ONE place outside the export where an amount becomes a
 * number (§4.2): a bar a pixel off is not an accounting fact.
 */
function magnitude(row: MonthlyRow): number {
  const value = Number(row.closing.amount);
  return Number.isFinite(value) ? value : 0;
}

export function MonthWisePanel({
  monthly,
  fromDate,
  toDate,
  onPickMonth,
}: {
  monthly: MonthlyPayload | null;
  fromDate: string | null;
  toDate: string | null;
  onPickMonth: (month: string) => void;
}) {
  const months = monthly?.months ?? [];
  const peak = Math.max(1, ...months.filter((m) => !m.isFuture).map(magnitude));
  const inRange = (month: string) =>
    Boolean(fromDate && toDate) && `${month}-31` >= (fromDate ?? "") && `${month}-01` <= (toDate ?? "");

  return (
    <section className={cx(styles.panel, styles.panelMonths)} aria-label="Month-wise">
      <h2 className={styles.panelTitle}>Month-wise closing · whole year · click a month</h2>
      <div className={styles.panelBody}>
        {months.length === 0 ? (
          <p className={styles.muted}>{DASH}</p>
        ) : (
          <div className={styles.months}>
            {months.map((m) => {
              const share = m.isFuture ? 0 : (magnitude(m) / peak) * 50;
              const cr = m.closing.side === "CR" && !isZeroAmount(m.closing.amount);
              return (
                <button
                  key={m.month}
                  type="button"
                  className={cx(
                    styles.month,
                    inRange(m.month) && styles.monthInRange,
                    m.isFuture && styles.monthFuture,
                  )}
                  disabled={m.isFuture}
                  onClick={() => onPickMonth(m.month)}
                  title={
                    m.isFuture
                      ? `${monthLabel(m.month)}: not yet`
                      : `${monthLabel(m.month)} · Dr ${formatAmount(m.debit)} · Cr ${formatAmount(m.credit)} · closing ${formatBal(m.closing)}`
                  }
                >
                  <span className={styles.bar} aria-hidden="true">
                    <span className={styles.barAxis} />
                    {share > 0 ? (
                      <span
                        className={cx(styles.barFill, cr ? styles.barCr : styles.barDr)}
                        style={{ height: `${Math.max(share, 2)}%` }}
                      />
                    ) : null}
                  </span>
                  <span className={styles.monthName}>{monthLabel(m.month).slice(0, 3)}</span>
                  <span className={styles.monthValue}>{m.isFuture ? DASH : formatBal(m.closing)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
