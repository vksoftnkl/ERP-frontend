"use client";

/**
 * The adjust panel (§14) — credits the customer already holds, set off
 * against this bill. **An adjustment is never a tender.**
 *
 * ONE component, TWO mount points — the F4 modal on the bill and the settle
 * dialog's ADJUST row — bound to one state slice. Grid ui_table 25: Credit
 * (refno) · Date · Kind · Pending · Adjust (the only input, 2 dp, ≥ 0) ·
 * Remarks.
 *
 * On commit: `adjust > pending` → "<ref> has only <pending> left on it." and
 * the cell resets to 0; `adjust > room` (room = bill − the other rows) →
 * confirm "This document can only take X more. Adjust X against <ref>?" (yes
 * clamps, no → 0). Adjust All fills FIFO up to the bill.
 *
 * Empty states: no customer · none open · fetch error (never modal).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { formatCurrency, money } from "@/domain/pricing";
import { SECTION_ATTR } from "@/features/sales/quotation/quotation.constants";
import { parseCell, toDisplayDate } from "@/features/sales/quotation/quotation.utils";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { confirm } from "@/lib/confirm";
import { adjustAll, adjustmentKeyOf } from "@/features/sales/testbill/engines/adjust";
import type { AdjustableCredit, BillAdjustmentRow } from "@/features/sales/testbill/types";
import styles from "@/features/sales/testbill/page.module.scss";

export type AdjustPanelProps = {
  /** Every credit the customer holds, pending already merged with what this bill holds (§14.2). */
  credits: AdjustableCredit[];
  /** What is currently set off. */
  rows: BillAdjustmentRow[];
  /** The bill this is being adjusted against — the overall ceiling. */
  billAmount: number;
  disabled: boolean;
  loading?: boolean;
  /** "Open credits aren't available just now." — an error, never a modal. */
  loadError?: boolean;
  hasCustomer: boolean;
  /**
   * The bill was settled with credit the server does not return (§14.4): the
   * total is shown, nothing can be changed here.
   */
  notAuthoritative?: { amount: number } | null;
  /** Commit the rows — every edit writes straight to the bill's state. */
  onChange: (rows: BillAdjustmentRow[]) => void;
  onRefresh: () => void;
  /** Rendered inside the settle dialog: no F1 stop, no own heading buttons. */
  embedded?: boolean;
};

const KIND_LABEL: Record<AdjustableCredit["billType"], string> = {
  ADVANCE: "Advance",
  SALES_RETURN: "Credit note",
};

export function AdjustPanel({
  credits,
  rows,
  billAmount,
  disabled,
  loading,
  loadError,
  hasCustomer,
  notAuthoritative,
  onChange,
  onRefresh,
  embedded,
}: AdjustPanelProps) {
  const amountByKey = useMemo(() => new Map(rows.map((row) => [row.key, row.amount])), [rows]);
  /** The cell text while it is being typed; the number lands on commit. */
  const [editing, setEditing] = useState<Record<string, string>>({});
  useEffect(() => {
    setEditing({});
  }, [credits]);

  const total = useMemo(() => money(rows.reduce((sum, row) => sum + row.amount, 0)), [rows]);

  const commit = useCallback(
    async (credit: AdjustableCredit) => {
      const key = adjustmentKeyOf(credit);
      const raw = editing[key];
      setEditing((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      if (raw === undefined) {
        return;
      }
      let amount = Math.max(0, money(parseCell(raw)));
      const others = rows.filter((row) => row.key !== key);
      if (amount > credit.pendingAmount + 0.005) {
        // The reset goes through `onChange` too, so both mount points agree.
        onChange(others);
        window.setTimeout(() => {
          // Said after the reset so the cell already reads 0.
          import("@/lib/notify").then(({ toast }) => toast.warn(`${credit.docRefno} has only ${formatCurrency(credit.pendingAmount)} left on it.`));
        }, 0);
        return;
      }
      const room = Math.max(0, money(billAmount - others.reduce((sum, row) => sum + row.amount, 0)));
      if (amount > room + 0.005) {
        const ok = await confirm({
          title: "More than the bill can take",
          message: `This document can only take ${formatCurrency(room)} more. Adjust ${formatCurrency(room)} against ${credit.docRefno}?`,
          confirmLabel: "Adjust it",
          cancelLabel: "No",
          iconVariant: "replace",
        });
        amount = ok ? room : 0;
      }
      const next = amount > 0.005 ? [...others, { key, credit, amount }] : others;
      // Keep the panel's own order — oldest first, as the credits arrive.
      const order = new Map(credits.map((row, index) => [adjustmentKeyOf(row), index]));
      next.sort((left, right) => (order.get(left.key) ?? 0) - (order.get(right.key) ?? 0));
      onChange(next);
    },
    [billAmount, credits, editing, onChange, rows],
  );

  const heading = (
    <div className={styles.adjustHead}>
      <span className={quotationStyles.gridHeadTitle}>Adjust Advance / Credit Notes</span>
      <span className={quotationStyles.gridHeadActions}>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={disabled || loading || credits.length === 0 || Boolean(notAuthoritative)}
          title="Fill FIFO up to the bill"
          onClick={() => onChange(adjustAll(credits, billAmount))}
        >
          Adjust All
        </button>
        <button type="button" className={quotationStyles.button} disabled={loading} title="Re-read this customer's credits" onClick={onRefresh}>
          {loading ? "Reading…" : "Refresh"}
        </button>
      </span>
    </div>
  );

  const sectionProps = embedded ? {} : { [SECTION_ATTR]: "Adjust" };

  if (!hasCustomer) {
    return (
      <div className={styles.adjustPanel} {...sectionProps}>
        {heading}
        <p className={quotationStyles.modalNote}>Pick a customer to see what they already hold.</p>
      </div>
    );
  }

  return (
    <div className={styles.adjustPanel} {...sectionProps}>
      {heading}
      {notAuthoritative ? (
        <p className={quotationStyles.modalNote}>
          This bill was settled with {formatCurrency(notAuthoritative.amount)} of credit that the server does not return
          yet. It is shown as a total only and cannot be changed here.
        </p>
      ) : null}
      {loadError ? <p className={quotationStyles.warning}>Open credits aren&apos;t available just now.</p> : null}
      {credits.length === 0 && !loadError ? (
        <p className={quotationStyles.modalNote}>
          {loading ? "Reading this customer's credits…" : "This customer holds nothing to adjust."}
        </p>
      ) : null}
      {credits.length > 0 ? (
        <div className={quotationStyles.gridViewport}>
          <table className={quotationStyles.grid}>
            <thead>
              <tr>
                <th scope="col" className={quotationStyles.gridHeaderCell}>Credit</th>
                <th scope="col" className={quotationStyles.gridHeaderCell}>Date</th>
                <th scope="col" className={quotationStyles.gridHeaderCell}>Kind</th>
                <th scope="col" className={quotationStyles.gridHeaderCell}>Pending</th>
                <th scope="col" className={quotationStyles.gridHeaderCell}>Adjust</th>
                <th scope="col" className={quotationStyles.gridHeaderCell}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {credits.map((credit, index) => {
                const key = adjustmentKeyOf(credit);
                const amount = amountByKey.get(key) ?? 0;
                const text = editing[key] ?? (amount ? String(amount) : "");
                const locked = disabled || Boolean(notAuthoritative);
                return (
                  <tr
                    key={key}
                    className={index % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven}
                    title={`${credit.docRefno} · ${credit.billAccYear} · value ${formatCurrency(credit.billAmount)}${credit.narration ? `\n${credit.narration}` : ""}`}
                  >
                    <td>
                      <span className={quotationStyles.cellText}>{credit.docRefno}</span>
                      <span className={styles.adjustYear}>{credit.billAccYear}</span>
                    </td>
                    <td><span className={quotationStyles.cellText}>{credit.docDate ? toDisplayDate(credit.docDate) : "—"}</span></td>
                    <td>
                      <span className={cx(quotationStyles.cellText, credit.billType === "ADVANCE" ? styles.factGreen : styles.factAmber)}>
                        {KIND_LABEL[credit.billType]}
                      </span>
                    </td>
                    <td className={quotationStyles.alignRight}>
                      <span className={quotationStyles.cellText}>{formatCurrency(credit.pendingAmount)}</span>
                    </td>
                    <td>
                      <input
                        className={cx(quotationStyles.cellInput, quotationStyles.alignRight)}
                        value={text}
                        disabled={locked}
                        inputMode="decimal"
                        aria-label={`Adjust against ${credit.docRefno}`}
                        onChange={(event) => setEditing((current) => ({ ...current, [key]: event.target.value }))}
                        onBlur={() => void commit(credit)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            event.stopPropagation();
                            void commit(credit);
                          }
                        }}
                      />
                    </td>
                    <td><span className={quotationStyles.cellText}>{credit.narration ?? ""}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className={styles.adjustFooter}>
        <span className={styles.adjustTotal}>
          <span className={styles.adjustTotalLabel}>Adjusted</span>
          <span className={styles.adjustTotalValue}>{formatCurrency(notAuthoritative ? notAuthoritative.amount : total)}</span>
        </span>
        <span className={styles.adjustTotal}>
          <span className={styles.adjustTotalLabel}>Bill</span>
          <span className={styles.adjustTotalValue}>{formatCurrency(billAmount)}</span>
        </span>
      </div>
    </div>
  );
}
