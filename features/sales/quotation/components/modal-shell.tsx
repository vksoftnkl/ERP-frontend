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
  /** Wider panel for dialogs with more columns than the default fits — e.g. the quote-list picker's toolbar + filter row + 9-column table. */
  wide?: boolean;
  /**
   * Hold one height for the life of the dialog instead of sizing to whatever
   * the body currently holds. Every picker sets it: rows arrive after the panel
   * opens, and a content-sized panel grows and shrinks under the pointer as a
   * search resolves — the footer's pager walking away between two clicks.
   */
  fixedHeight?: boolean;
  footer?: ReactNode;
  children: ReactNode;
  onClose: () => void;
};

export function ModalShell({ title, isOpen, narrow, wide, fixedHeight, footer, children, onClose }: ModalShellProps) {
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
      <div className={styles.modalOverlay}>
        <button
          type="button"
          className={styles.modalBackdrop}
          aria-label="Close dialog"
          onMouseDown={onClose}
          tabIndex={-1}
        />
        <section
          ref={panelRef}
          className={cx(
            styles.modalPanel,
            narrow && styles.modalPanelNarrow,
            wide && styles.modalPanelWide,
            fixedHeight && styles.modalPanelFixed,
          )}
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
