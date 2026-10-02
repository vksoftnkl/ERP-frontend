"use client";

/**
 * "Price below cost" (Qt `BelowCostDialog`) — the common path: the seeded
 * `inventory.below_cost_price` is "warning", so a below-cost save round-trips
 * once — the server answers needsConfirm, this popup asks, Save anyway
 * re-posts confirmed. Go back is where focus starts; there is no default.
 */
import { useEffect, useRef } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import qs from "@/features/sales/quotation/page.module.scss";
import { belowCostSummary, type BelowCostLine } from "../selling-price.payload";
import { moneyText } from "../selling-price.display";
import styles from "../page.module.scss";

export type BelowCostDialogProps = {
  lines: readonly BelowCostLine[];
  policy: string;
  onBack: () => void;
  onSaveAnyway: () => void;
};

/** Mounted only while the server is asking. */
export function BelowCostDialog({ lines, policy, onBack, onSaveAnyway }: BelowCostDialogProps) {
  const backRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => backRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <ModalShell
      title="Price below cost"
      isOpen
      onClose={onBack}
      footer={
        <div className={styles.dialogButtons}>
          <span className={styles.dialogButtonsSpacer} />
          <button ref={backRef} type="button" className={qs.button} onClick={onBack}>
            Go back
          </button>
          <button type="button" className={`${qs.button} ${qs.buttonPrimary}`} onClick={onSaveAnyway}>
            Save anyway
          </button>
        </div>
      }
    >
      <p className={styles.belowCostTitle}>Price below cost</p>
      <p className={styles.dlgMuted}>{belowCostSummary(lines.length, policy)}</p>
      <div className={styles.dlgViewport}>
        <table className={`${styles.dlgTable} ${styles.dlgTableStatic}`}>
          <thead>
            <tr>
              <th scope="col">Row</th>
              <th scope="col">Item</th>
              <th scope="col">Bucket</th>
              <th scope="col">Level</th>
              <th scope="col">Price</th>
              <th scope="col">Cost</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={`${line.row}-${line.level}-${index}`}>
                <td style={{ textAlign: "center" }}>{line.row}</td>
                <td style={{ width: "100%" }}>{line.item}</td>
                <td>{line.bucket}</td>
                <td>{line.level}</td>
                <td style={{ textAlign: "right" }}>{moneyText(line.price)}</td>
                <td style={{ textAlign: "right" }}>{moneyText(line.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.dlgMuted}>Enter moves between the buttons; there is no default button.</p>
    </ModalShell>
  );
}
