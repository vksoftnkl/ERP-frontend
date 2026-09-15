"use client";

/**
 * The adjustment panel (§10) — credits the customer already holds, set off
 * against this bill.
 *
 * **An adjustment is never a tender.** They are different rows in different
 * tables, they post differently (`acc_bill_adjustment` against
 * `acc_bill_balance`, never `acc_tender_detail`), and a screen that merges the
 * two produces a bill that balances here and not in the ledgers. The tender
 * dialog shows the total this panel produces; it does not own it and never
 * writes it back through a tender row.
 *
 * ONE component, TWO mount points — inside the settle dialog and outside it on
 * the bill — writing the same array. `adjustmentsFrom` records which side wrote
 * last, so reopening the other shows what is actually set off rather than
 * resurrecting a stale set.
 *
 * The ceiling on a row is the credit's `pendingAmount` **as the list reported
 * it**. The server re-reads it under a row lock at save time, because another
 * counter may have spent it since the panel was fetched — so the check here is
 * the courteous one, not the authoritative one, and a refusal at save is not a
 * bug in this file.
 */
import { useCallback, useMemo, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { formatCurrency, money } from "@/domain/pricing";
import { SECTION_ATTR } from "@/features/sales/quotation/quotation.constants";
import { parseCell, toDisplayDate } from "@/features/sales/quotation/quotation.utils";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import type { AdjustableCredit, BillAdjustmentRow } from "../salebill.types";
import styles from "../page.module.scss";

export type AdjustPanelProps = {
  /** Every credit the customer holds, as the server last reported them. */
  credits: AdjustableCredit[];
  /** What is currently set off, by `billId`. */
  rows: BillAdjustmentRow[];
  /** The bill this is being adjusted against — the overall ceiling. */
  billAmount: number;
  /** How much of the bill the TENDERS already cover, for the remaining figure. */
  tendered: number;
  disabled: boolean;
  /** True while the open-credits read is in flight. */
  loading?: boolean;
  /** `null` until a customer is picked. */
  hasCustomer: boolean;
  onRefresh: () => void;
  /** Returns false when the panel would over-adjust; the caller keeps it open. */
  onApply: (rows: BillAdjustmentRow[]) => boolean;
};

/** A credit's row key. The `abl_id` and its year together ARE the credit. */
function keyOf(credit: AdjustableCredit): string {
  return `${credit.billId}:${credit.billAccYear}`;
}

const KIND_LABEL: Record<AdjustableCredit["billType"], string> = {
  ADVANCE: "Advance",
  SALES_RETURN: "Credit note",
};

export function AdjustPanel({
  credits,
  rows,
  billAmount,
  tendered,
  disabled,
  loading,
  hasCustomer,
  onRefresh,
  onApply,
}: AdjustPanelProps) {
  /**
   * What is keyed, by credit key. Held locally and applied on demand rather than
   * dispatched per keystroke: the panel has its own gate (nothing may exceed a
   * credit's pending amount, and the set may not exceed the bill), and running
   * that on every digit would refuse "5" on the way to "500".
   */
  const [keyed, setKeyed] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.filter((row) => row.amount > 0).map((row) => [keyOf(row.credit), String(row.amount)])),
  );

  const amounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const credit of credits) {
      const raw = keyed[keyOf(credit)];
      map[keyOf(credit)] = raw === undefined ? 0 : Math.max(0, parseCell(raw));
    }
    return map;
  }, [credits, keyed]);

  const total = useMemo(
    () => money(Object.values(amounts).reduce((sum, value) => sum + value, 0)),
    [amounts],
  );

  /** What is still to collect once the tenders and these credits are counted. */
  const remaining = money(Math.max(0, billAmount - tendered - total));

  const setAmount = useCallback((credit: AdjustableCredit, raw: string) => {
    setKeyed((current) => ({ ...current, [keyOf(credit)]: raw }));
  }, []);

  /**
   * "Use it all", per row — the common case by a distance: a customer with a
   * ₹2,000 credit note against a ₹6,400 bill wants all ₹2,000 of it.
   *
   * Capped at what the BILL still needs as well as at what the credit holds, so
   * a single click cannot over-adjust and leave the customer owed money.
   */
  const fill = useCallback(
    (credit: AdjustableCredit) => {
      const already = total - (amounts[keyOf(credit)] ?? 0);
      const room = Math.max(0, money(billAmount - tendered - already));
      const take = money(Math.min(credit.pendingAmount, room));
      setAmount(credit, take > 0 ? String(take) : "");
    },
    [amounts, billAmount, setAmount, tendered, total],
  );

  const apply = useCallback(() => {
    const next: BillAdjustmentRow[] = credits
      .filter((credit) => (amounts[keyOf(credit)] ?? 0) > 0)
      .map((credit) => ({
        key: keyOf(credit),
        credit,
        amount: money(amounts[keyOf(credit)]),
      }));
    onApply(next);
  }, [amounts, credits, onApply]);

  const clearAll = useCallback(() => {
    setKeyed({});
    onApply([]);
  }, [onApply]);

  if (!hasCustomer) {
    return (
      <div className={styles.adjustPanel} {...{ [SECTION_ATTR]: "Adjust" }}>
        <div className={styles.adjustHead}>
          <span className={quotationStyles.gridHeadTitle}>Adjust credits</span>
        </div>
        <p className={quotationStyles.modalNote}>Pick a customer to see the credits they hold.</p>
      </div>
    );
  }

  // An F1 stop like the panels around it — but only where it is MOUNTED ON THE
  // BILL. Inside the settle dialog the walk never reaches it: F1 is a
  // screen-level key and the entry view stands its shortcuts down while any
  // modal is open, which is what stops the dialog's own Adjust panel stealing
  // focus out of the tender rows.
  return (
    <div className={styles.adjustPanel} {...{ [SECTION_ATTR]: "Adjust" }}>
      <div className={styles.adjustHead}>
        <span className={quotationStyles.gridHeadTitle}>Adjust credits</span>
        <span className={quotationStyles.gridHeadActions}>
          <button
            type="button"
            className={quotationStyles.button}
            disabled={loading}
            title="Re-read this customer's credits — another counter may have spent one"
            onClick={onRefresh}
          >
            {loading ? "Reading…" : "Refresh"}
          </button>
        </span>
      </div>
      {credits.length === 0 ? (
        <p className={quotationStyles.modalNote}>
          {loading
            ? "Reading this customer's credits…"
            : "This customer holds no unspent advance or credit note."}
        </p>
      ) : (
        <>
          <div className={quotationStyles.gridViewport}>
            <table className={quotationStyles.grid}>
              <thead>
                <tr>
                  <th scope="col" className={quotationStyles.gridHeaderCell}>
                    Document
                  </th>
                  <th scope="col" className={quotationStyles.gridHeaderCell}>
                    Kind
                  </th>
                  <th scope="col" className={quotationStyles.gridHeaderCell}>
                    Date
                  </th>
                  <th scope="col" className={quotationStyles.gridHeaderCell}>
                    Available
                  </th>
                  <th scope="col" className={quotationStyles.gridHeaderCell}>
                    Adjust
                  </th>
                  <th scope="col" className={quotationStyles.gridHeaderCell} aria-label="Fill" />
                </tr>
              </thead>
              <tbody>
                {credits.map((credit, index) => {
                  const key = keyOf(credit);
                  const value = keyed[key] ?? "";
                  const over = (amounts[key] ?? 0) > credit.pendingAmount;
                  return (
                    <tr key={key} className={index % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven}>
                      <td>
                        {/*
                          The year is shown, not hidden: `acc_bill_balance` is
                          partitioned by the year the credit ORIGINATED in and is
                          never carried forward, so a March advance really does
                          settle an April invoice — and without the year two
                          same-numbered documents are indistinguishable.
                        */}
                        <span className={quotationStyles.cellText}>{credit.docRefno}</span>
                        <span className={styles.adjustYear}>{credit.billAccYear}</span>
                      </td>
                      <td>
                        <span className={quotationStyles.cellText}>{KIND_LABEL[credit.billType]}</span>
                      </td>
                      <td>
                        <span className={quotationStyles.cellText}>{toDisplayDate(credit.docDate)}</span>
                      </td>
                      <td className={quotationStyles.alignRight}>
                        {/* What is LEFT on it, not its face value — that is what
                            may be adjusted, and the face value is only a hint. */}
                        <span
                          className={quotationStyles.cellText}
                          title={`Raised for ${formatCurrency(credit.billAmount, 2, true)}`}
                        >
                          {formatCurrency(credit.pendingAmount, 2, true)}
                        </span>
                      </td>
                      <td>
                        <input
                          className={cx(
                            quotationStyles.cellInput,
                            quotationStyles.alignRight,
                            over && quotationStyles.cellInvalid,
                          )}
                          value={value}
                          disabled={disabled}
                          inputMode="decimal"
                          aria-label={`Adjust against ${credit.docRefno}`}
                          onChange={(event) => setAmount(credit, event.target.value)}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className={quotationStyles.rowButton}
                          disabled={disabled}
                          title="Use as much of this credit as the bill still needs"
                          onClick={() => fill(credit)}
                        >
                          All
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={styles.adjustFooter}>
            <span className={styles.adjustTotal}>
              <span className={styles.adjustTotalLabel}>Adjusted</span>
              <span className={styles.adjustTotalValue}>{formatCurrency(total, 2, true)}</span>
            </span>
            <span className={styles.adjustTotal}>
              <span className={styles.adjustTotalLabel}>Still to collect</span>
              <span className={styles.adjustTotalValue}>{formatCurrency(remaining, 2, true)}</span>
            </span>
            <span className={quotationStyles.gridHeadActions}>
              <button
                type="button"
                className={quotationStyles.button}
                disabled={disabled || total === 0}
                onClick={clearAll}
              >
                Clear
              </button>
              <button
                type="button"
                className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
                disabled={disabled}
                onClick={apply}
              >
                Apply
              </button>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
