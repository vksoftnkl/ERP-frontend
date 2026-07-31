"use client";

/**
 * The overlay every dialog on this screen sits in.
 *
 * Wrapped in `ModalPortal` deliberately: without it, a sticky-header scroll
 * container (both grids have one) composites over a `position: fixed` overlay in
 * Chromium and the dialog bleeds through — raising the z-index does not fix it.
 */
import { useEffect, useRef, type ReactNode } from "react";
import ModalPortal from "@/components/ui/modal-portal";
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";

export type ModalShellProps = {
  title: string;
  isOpen: boolean;
  narrow?: boolean;
  footer?: ReactNode;
  children: ReactNode;
  onClose: () => void;
};

export function ModalShell({ title, isOpen, narrow, footer, children, onClose }: ModalShellProps) {
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    // Capture, so Escape closes the dialog rather than reaching the screen's own
    // shortcut handler underneath it.
    document.addEventListener("keydown", onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <ModalPortal>
      <div className={styles.modalOverlay} onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}>
        <section
          ref={panelRef}
          className={cx(styles.modalPanel, narrow && styles.modalPanelNarrow)}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <header className={styles.modalHeader}>
            <h2 className={styles.modalTitle}>{title}</h2>
            <button type="button" className={styles.modalClose} aria-label="Close" onClick={onClose}>
              ×
            </button>
          </header>
          <div className={styles.modalBody}>{children}</div>
          {footer ? <footer className={styles.modalFooter}>{footer}</footer> : null}
        </section>
      </div>
    </ModalPortal>
  );
}
