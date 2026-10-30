"use client";

/**
 * The supplier chips under Purchase Entry's header (Qt NexERP 8f2a1f4,
 * `PurchaseSupplierChips`): what `/purchase/lookup/supplier-context` says about
 * the supplier on the bill. Hidden while there is no supplier, or no answer —
 * the bill can still be keyed without them.
 */
import { cx } from "@/components/design-system/cx";
import type { SupplierContext } from "../invoice-header.types";
import { supplierChips, type ChipTone } from "../supplier-context";
import styles from "./invoice-side.module.scss";

const TONE_CLASS: Record<ChipTone, string> = {
  neutral: styles.toneNeutral,
  info: styles.toneInfo,
  success: styles.toneSuccess,
  warning: styles.toneWarning,
  danger: styles.toneDanger,
};

export function SupplierChips({ context }: { context: SupplierContext | null }) {
  const chips = supplierChips(context);
  if (chips.length === 0) {
    return null;
  }
  return (
    <div className={styles.chips} aria-label="About the supplier">
      {chips.map((chip, index) => (
        <span key={`${index}-${chip.text}`} className={cx(styles.chip, TONE_CLASS[chip.tone])} title={chip.tip}>
          {chip.text}
        </span>
      ))}
    </div>
  );
}
