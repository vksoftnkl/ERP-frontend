"use client";

/**
 * The totals strip — display only, in both modes.
 *
 * The primary block mirrors the legacy screen's three totals columns plus the
 * grand total (Items/Gross/Scheme disc/Round off, "Bags"/Item disc/Taxable,
 * Weight/Special disc/Tax — `sqTotBags` is persisted from `totQty`, see
 * `quotation.payload.ts`, so "Total Bags" and the detailed "Qty" cell below are
 * the same figure under two names). The full CGST/SGST/IGST/Cess and
 * freight/loading/cash-discount breakdown the legacy screen does not surface
 * on this page is real, saved data, so it stays available behind "More
 * totals" rather than being dropped.
 *
 * `TotalsFooterStats` is exported separately: the two stat lines it renders
 * ("Total Profit", "Total Saving") sit outside this box, in the page's own
 * footer above the button bar, not inside the totals panel.
 *
 *  - **Saving** is the customer's, against MRP. A line with no MRP is outside
 *    both sides of the fraction.
 *  - **Margin** ("Total Profit") is the company's, pre-tax. Charge revenue is
 *    outside both sides.
 */
import { cx } from "@/components/design-system/cx";
import { formatCurrency, formatPerc, type DocumentTotals } from "@/domain/pricing";
import styles from "../page.module.scss";

/**
 * A voucher's own money line, appended under one of the three totals columns.
 * The sale order's Advance / Refund / Balance Due live here rather than in a
 * strip of their own: they are totals, and the legacy layout reads them in the
 * same grid as the rest.
 */
export type TotalsExtraCell = { label: string; value: string };

export type TotalsStripProps = {
  totals: DocumentTotals;
  /** Appended to the first / second totals column, in order. */
  extraColumnOne?: TotalsExtraCell[];
  extraColumnTwo?: TotalsExtraCell[];
  /** True while a loaded document is still painting its stored figures. */
  stored: boolean;
};

function Cell({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant?: "strong" | "stat";
}) {
  return (
    <div
      className={cx(
        styles.totalCell,
        variant === "strong" && styles.totalCellStrong,
        variant === "stat" && styles.totalCellStat,
      )}
    >
      <dt>{label}</dt>
      <dd>{value || "0.00"}</dd>
    </div>
  );
}

export function TotalsStrip({ totals, extraColumnOne, extraColumnTwo, stored }: TotalsStripProps) {
  return (
    <div className={styles.totalsPanel} aria-label={stored ? "Saved totals" : "Totals"}>
      <div className={styles.totalsPrimary}>
        <dl className={styles.totalsCol}>
          <Cell label="Total Items" value={String(totals.totItems)} />
          <Cell label="Gross Amount" value={formatCurrency(totals.grossAmt, 2, true)} />
          <Cell label="Scheme Discount" value={formatCurrency(totals.schDisc, 2, true)} />
          <Cell label="Round Off" value={formatCurrency(totals.roundOff, 2, true)} />
          {(extraColumnOne ?? []).map((cell) => (
            <Cell key={cell.label} label={cell.label} value={cell.value} />
          ))}
        </dl>
        <dl className={styles.totalsCol}>
          <Cell label="Total Bags" value={formatCurrency(totals.totQty, 3, true)} />
          <Cell label="Item Discount" value={formatCurrency(totals.itemDisc, 2, true)} />
          <Cell label="Taxable Amount" value={formatCurrency(totals.docTaxable, 2, true)} />
          {(extraColumnTwo ?? []).map((cell) => (
            <Cell key={cell.label} label={cell.label} value={cell.value} />
          ))}
        </dl>
        <dl className={styles.totalsCol}>
          <Cell label="Total Weight" value={formatCurrency(totals.totWeight, 3, true)} />
          <Cell label="Special Discount" value={formatCurrency(totals.splDisc, 2, true)} />
          <Cell label="Tax Amount" value={formatCurrency(totals.docTax, 2, true)} />
        </dl>
        <div className={styles.totalsGrand}>
          <span className={styles.totalsGrandLabel}>Bill</span>
          <span className={styles.totalsGrandValue}>{formatCurrency(totals.bill, 2, true)}</span>
        </div>
      </div>
      <details className={styles.totalsDetails}>
        <summary>More totals</summary>
        <dl className={styles.totalsStrip}>
          <Cell label="Qty" value={formatCurrency(totals.totQty, 3, true)} />
          <Cell label="Bill scheme disc" value={formatCurrency(totals.billSchDisc, 2, true)} />
          <Cell label="Freight" value={formatCurrency(totals.freightAmt, 2, true)} />
          <Cell label="Loading" value={formatCurrency(totals.loadAmt, 2, true)} />
          <Cell label="Unloading" value={formatCurrency(totals.unloadAmt, 2, true)} />
          <Cell label="Cash disc" value={formatCurrency(totals.cashDiscAmt, 2, true)} />
          <Cell label="Other" value={formatCurrency(totals.otherAmt, 2, true)} />
          <Cell label="CGST" value={formatCurrency(totals.docCgst, 2, true)} />
          <Cell label="SGST" value={formatCurrency(totals.docSgst, 2, true)} />
          <Cell label="IGST" value={formatCurrency(totals.docIgst, 2, true)} />
          <Cell label="Cess" value={formatCurrency(totals.docCess, 2, true)} />
        </dl>
      </details>
    </div>
  );
}

/**
 * "Total Profit (margin %)" / "Total Saving (%)" — placed by the caller in the
 * page's own footer row, above the button bar, matching the legacy screen's
 * placement rather than living inside the boxed totals panel.
 */
export function TotalsFooterStats({ totals }: { totals: DocumentTotals }) {
  return (
    <dl className={styles.statsFooter}>
      <Cell
        label="Total Profit"
        value={`${formatCurrency(totals.marginAmt, 2, true)} (${formatPerc(totals.marginPerc)}% margin)`}
        variant="stat"
      />
      <Cell
        label="Total Saving"
        value={`${formatCurrency(totals.savingAmt, 2, true)} (${formatPerc(totals.savingPerc)}%)`}
        variant="stat"
      />
    </dl>
  );
}
