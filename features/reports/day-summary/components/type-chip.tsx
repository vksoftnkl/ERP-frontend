/**
 * A voucher-type chip, coloured by NATURE (plan §7.2). Presentation only;
 * the text and tone are decided in `view/cells.ts`.
 */
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import type { Chip } from "../view/cells";

export function TypeChip({ chip, reversal = false }: { chip: Chip; reversal?: boolean }) {
  return (
    <span className={cx(styles.chip, reversal ? styles.chipReversal : styles[`chip-${chip.tone}`])} title={chip.title}>
      {chip.text}
    </span>
  );
}
