"use client";
/**
 * The two small dialogs' frame (group ledgers, check detail). Esc closes,
 * caught at the capture phase so the screen's own Esc (Close) never sees it.
 *
 * The overlay is the house three-part one (ModalPortal, an isolated overlay
 * with no background, its own backdrop, a pre-promoted panel), so the
 * report behind it cannot ghost through.
 */
import { useEffect, type ReactNode } from "react";
import ModalPortal from "@/components/ui/modal-portal";
import { Z_MODAL } from "@/lib/z-index";
import styles from "../page.module.scss";

type Props = {
  title: string;
  sub?: string | null;
  hint?: string;
  onClose: () => void;
  children: ReactNode;
};

export function DialogShell({ title, sub, hint, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <ModalPortal>
      <div className={styles.overlay} style={{ zIndex: Z_MODAL }}>
        <button type="button" className={styles.backdrop} aria-label="Close" tabIndex={-1} onMouseDown={onClose} />
        <div className={styles.dialog} role="dialog" aria-modal="true" aria-label={title}>
          <div className={styles.dialogHead}>
            <span>{title}</span>
            {sub ? <span className={styles.dialogSub}>{sub}</span> : null}
          </div>
          <div className={styles.dialogBody}>{children}</div>
          <div className={styles.dialogFoot}>
            {hint ? <span className={styles.dialogFootHint}>{hint}</span> : null}
            <button type="button" className={styles.button} onClick={onClose}>
              Close<span className={styles.key}>Esc</span>
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
