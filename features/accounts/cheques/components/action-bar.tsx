"use client";

/**
 * The verbs, and the one line under them that says what is selected — or,
 * in amber, why the bar is dead. Seven greyed buttons are not a message.
 *
 * The button words and their keys come from `keys.ts`, the same table the
 * key map is built from.
 */
import type { BarLine, ChequeVerb } from "../domain/stateMachine";
import type { ChequeVocabulary } from "../domain/vocabulary";
import { buttonText, KEY_TABLE } from "../keys";
import styles from "../cheques.module.scss";

export type ActionBarProps = {
  words: ChequeVocabulary;
  enabled: (verb: ChequeVerb) => boolean;
  onAction: (verb: ChequeVerb) => void;
  line: BarLine;
  onClose: () => void;
  onReload: () => void;
};

export function ActionBar({ words, enabled, onAction, line, onClose, onReload }: ActionBarProps) {
  return (
    <footer className={styles.actionBar}>
      <div className={styles.actionButtons}>
        {KEY_TABLE.map((binding) => (
          <button
            key={binding.verb}
            type="button"
            className={styles.button}
            disabled={!enabled(binding.verb)}
            onClick={() => onAction(binding.verb)}
          >
            {buttonText(binding, words)}
          </button>
        ))}
        <span className={styles.actionSpacer} />
        <button type="button" className={styles.secondaryButton} onClick={onReload}>
          Reload
        </button>
        <button type="button" className={styles.secondaryButton} onClick={onClose}>
          Close - Esc
        </button>
      </div>
      <div className={`${styles.whyLine} ${line.tone === "reason" ? styles.whyReason : ""}`}>
        {line.text}
      </div>
      <div className={styles.keyHints}>
        Enter opens the receipt the cheque came in on · Space ticks a row · a tick survives
        paging and is cleared when the filters change
      </div>
    </footer>
  );
}
