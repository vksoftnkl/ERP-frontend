"use client";

/** The `?` sheet, rendered straight from the shortcut table. */

import ModalPortal from "@/components/ui/modal-portal";
import { SHORTCUTS } from "@/features/print-designer/lib/shortcuts";
import styles from "@/features/print-designer/components/designer.module.scss";

export function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) {
    return null;
  }

  const groups = ["Editing", "Selection", "View", "File"] as const;

  return (
    <ModalPortal>
      <div className={`${styles.overlayTokens} ${styles.backdrop}`} onClick={onClose} />
      <div className={`${styles.overlayTokens} ${styles.dialogLayer}`}>
        <div className={`${styles.dialog} ${styles.dialogMedium}`}>
          <header className={styles.dialogHead}>
            <span>Keyboard shortcuts</span>
            <span className={styles.spacer} />
            <button type="button" className={styles.button} onClick={onClose}>
              Close
            </button>
          </header>
          <div className={styles.dialogBody}>
            {groups.map((group) => (
              <div key={group}>
                <span className={styles.fieldLabel}>{group}</span>
                <div className={styles.helpGrid}>
                  {SHORTCUTS.filter((entry) => entry.group === group).map((entry) => (
                    <div key={entry.keys} style={{ display: "contents" }}>
                      <span className={styles.helpKey}>{entry.keys}</span>
                      <span>{entry.action}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

export default ShortcutSheet;
