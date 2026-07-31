"use client";

/**
 * CTRL+1..4 asks which lines to reprice, exactly as the Qt screen does: the
 * selected row, or the whole document. Only "Apply to all" commits the
 * document's own price level.
 */
import { PRICE_LEVEL_OPTIONS } from "../quotation.constants";
import { ModalShell } from "./modal-shell";
import styles from "../page.module.scss";

export type PriceLevelPromptProps = {
  /** `null` while the prompt is closed. */
  priceLevel: number | null;
  hasSelection: boolean;
  onClose: () => void;
  onApply: (scope: "selected" | "all") => void;
};

export function PriceLevelPrompt({
  priceLevel,
  hasSelection,
  onClose,
  onApply,
}: PriceLevelPromptProps) {
  const label =
    PRICE_LEVEL_OPTIONS.find((option) => option.value === String(priceLevel))?.label ??
    String(priceLevel ?? "");

  return (
    <ModalShell title={`Apply price level ${label}`} isOpen={priceLevel !== null} narrow onClose={onClose}>
      <div className={styles.promptOptions}>
        <button
          type="button"
          className={styles.promptOption}
          disabled={!hasSelection}
          onClick={() => onApply("selected")}
        >
          Apply to the selected line
          <br />
          <span className={styles.modalNote}>
            Reprices that line only and leaves the document&apos;s level alone.
          </span>
        </button>
        <button type="button" className={styles.promptOption} onClick={() => onApply("all")}>
          Apply to all lines
          <br />
          <span className={styles.modalNote}>
            Reprices every line and makes {label} the document&apos;s price level.
          </span>
        </button>
      </div>
    </ModalShell>
  );
}
