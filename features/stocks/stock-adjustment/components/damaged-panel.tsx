"use client";

/**
 * Panel 12 — the DAMAGED bucket of this godown grouped by the lot's supplier:
 * what goes back to whom. Inline under a Move stock document. On a Move draft,
 * Enter / double-click on a row keys a line that moves that stock back.
 */
import { useState } from "react";
import { formatCurrency } from "@/domain/pricing";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { dateFromWire, qtyCell } from "../stock-adjustment.format";
import { damagedPanelRows, damagedPanelTitle } from "../stock-adjustment.pick";
import type { PickStockRow } from "../stock-adjustment.types";
import styles from "../page.module.scss";

export function DamagedPanel({
  rows,
  loading,
  godownName,
  hasGodown,
  canTake,
  onTake,
}: {
  rows: readonly PickStockRow[];
  loading: boolean;
  godownName: string;
  hasGodown: boolean;
  /** A Move DRAFT being keyed — only then does a row become a line. */
  canTake: boolean;
  onTake: (row: PickStockRow) => void;
}) {
  const [active, setActive] = useState(-1);
  const sorted = damagedPanelRows(hasGodown ? rows : []);

  return (
    <section className={styles.damagedPanel}>
      <h3 className={styles.cardTitle}>{damagedPanelTitle(sorted.length, godownName, hasGodown)}</h3>
      <div
        className={styles.damagedViewport}
        tabIndex={-1}
        title="Enter / double-click a row to move that stock back (a Move stock line from Damaged)."
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => Math.min(sorted.length - 1, index + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(0, index - 1));
          } else if (event.key === "Enter" && canTake && sorted[active]) {
            event.preventDefault();
            onTake(sorted[active]);
          }
        }}
      >
        <table className={quotationStyles.listTable}>
          <thead>
            <tr>
              <th scope="col">Supplier</th>
              <th scope="col">Item</th>
              <th scope="col">Batch</th>
              <th scope="col">Qty damaged</th>
              <th scope="col">Cost</th>
              <th scope="col">Value</th>
              <th scope="col">Moved on</th>
              <th scope="col">Next step</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, index) => {
              const qty = Number(row.availableQty) || 0;
              const cost = Number(row.avgCostRate) || 0;
              return (
                <tr
                  key={`${row.sblId || row.lotId}:${index}`}
                  data-selected={index === active ? "true" : undefined}
                  onClick={() => setActive(index)}
                  onDoubleClick={() => {
                    if (canTake) {
                      onTake(row);
                    }
                  }}
                >
                  <td>{(row.supplierName ?? "").trim() || "(no supplier on the lot)"}</td>
                  <td>{row.itemName}</td>
                  <td>{row.batchNo ?? ""}</td>
                  <td className={quotationStyles.alignRight}>{qtyCell(qty)}</td>
                  <td className={quotationStyles.alignRight}>{formatCurrency(cost, 2, true)}</td>
                  <td className={quotationStyles.alignRight}>{formatCurrency(qty * cost, 2, true)}</td>
                  <td>{dateFromWire(row.firstInDate)}</td>
                  <td>purchase return (when built) · or Damage write-off</td>
                </tr>
              );
            })}
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className={quotationStyles.emptyGrid}>
                  {loading ? "Loading…" : " "}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
