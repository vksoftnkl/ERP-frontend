"use client";

/**
 * The charge carry strip (§12.4): one row per charge carried from an order —
 * name · order amount · carried so far · proposed · the basis menu (PRORATA ·
 * FULL · MANUAL · NONE). Sits under the charge grid, because the grid is the
 * quotation's shared component and a carried row is the bill's own idea.
 */
import { formatCurrency } from "@/domain/pricing";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { carriedRows, fullCarryAmount } from "@/features/sales/testbill/domain/carry";
import type { BillChargeRow, ChargeCarryBasis } from "@/features/sales/testbill/types";
import styles from "@/features/sales/testbill/page.module.scss";

const BASES: ReadonlyArray<{ value: ChargeCarryBasis; label: string }> = [
  { value: "PRORATA", label: "Pro rata" },
  { value: "FULL", label: "Full (balance)" },
  { value: "MANUAL", label: "Manual" },
  { value: "NONE", label: "None (0)" },
];

export type CarryStripProps = {
  rows: BillChargeRow[];
  editable: boolean;
  onSetBasis: (key: string, basis: ChargeCarryBasis) => void;
};

export function CarryStrip({ rows, editable, onSetBasis }: CarryStripProps) {
  const carried = carriedRows(rows);
  if (carried.length === 0) {
    return null;
  }
  return (
    <div className={styles.carryStrip} aria-label="Charges carried from the order">
      <span className={styles.carryTitle}>Carried from the order</span>
      {carried.map((row) => {
        const carry = row.carry!;
        return (
          <span key={row.key} className={styles.carryRow} title="How much of the order's charge this bill takes. The server proposes a pro-rata share on validate.">
            <span className={styles.carryName}>{row.chgName}</span>
            <span className={styles.carryFigures}>
              order {formatCurrency(carry.orderAmount)} · so far {formatCurrency(carry.carriedSoFar)} · proposed{" "}
              {formatCurrency(carry.proposed)} · full {formatCurrency(fullCarryAmount(carry))}
              {carry.isFinalBill ? " · final bill" : ""}
            </span>
            <select
              className={quotationStyles.select}
              value={carry.basis}
              disabled={!editable}
              aria-label={`Carry basis for ${row.chgName}`}
              onChange={(event) => onSetBasis(row.key, event.target.value as ChargeCarryBasis)}
            >
              {BASES.map((basis) => (
                <option key={basis.value} value={basis.value}>
                  {basis.label}
                </option>
              ))}
            </select>
          </span>
        );
      })}
    </div>
  );
}
