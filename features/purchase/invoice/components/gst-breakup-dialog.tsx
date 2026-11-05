"use client";

/**
 * GST break-up — the bill's taxable value and GST by rate (Qt NexERP dd59c2c
 * P12, `PurchaseGstBreakupDialog`): one row per GST % — Taxable, CGST, SGST,
 * IGST, Cess, Total — and the total row under them. The rows are the server's
 * `gstBreakup` (validate and get) when its answer is the one on screen, else
 * the lines grouped (invoice-figures.ts `gstBreakupRows`); the note under the
 * table says which. Read only; Esc / Close shuts it.
 */
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { money, qtyText } from "../../shared/purchase.format";
import { gstBreakupTotal, type GstBreakupRow } from "../invoice-figures";
import styles from "./invoice-side.module.scss";

export type GstBreakupDialogProps = {
  /** null = closed. */
  breakup: { rows: GstBreakupRow[]; source: string } | null;
  onClose: () => void;
};

const MONEY_KEYS = ["taxable", "cgst", "sgst", "igst", "cess", "total"] as const;
const TITLES: Record<(typeof MONEY_KEYS)[number], string> = {
  taxable: "Taxable",
  cgst: "CGST",
  sgst: "SGST",
  igst: "IGST",
  cess: "Cess",
  total: "Total",
};

export function GstBreakupDialog({ breakup, onClose }: GstBreakupDialogProps) {
  if (!breakup) {
    return null;
  }
  const total = gstBreakupTotal(breakup.rows);
  const footer = (
    <button type="button" className={quotationStyles.button} onClick={onClose}>
      Close · Esc
    </button>
  );
  return (
    <ModalShell title="GST break-up" isOpen onClose={onClose} footer={footer}>
      <div className={styles.chargesViewport} data-purchase-gst-breakup="">
        <table className={cx(styles.chargesTable, styles.gstTable)}>
          <thead>
            <tr>
              <th scope="col">GST %</th>
              {MONEY_KEYS.map((key) => (
                <th key={key} scope="col" className={styles.num}>
                  {TITLES[key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {breakup.rows.map((row) => (
              <tr key={row.gstPct}>
                <td>{`${qtyText(row.gstPct)} %`}</td>
                {MONEY_KEYS.map((key) => (
                  <td key={key} className={styles.num}>
                    {money(row[key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={styles.gstTotalRow}>
              <td>Total</td>
              {MONEY_KEYS.map((key) => (
                <td key={key} className={styles.num}>
                  {money(total[key])}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className={styles.gstSource}>{breakup.source}</p>
    </ModalShell>
  );
}
