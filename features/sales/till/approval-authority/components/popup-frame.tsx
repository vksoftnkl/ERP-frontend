"use client";

/**
 * The frame of this screen's three popups (the grant, Copy grants, Who can
 * approve?) — the till masters' popup chrome, borrowed as it is so the grant
 * popup looks like every other till master's: a title and a subtitle, the
 * body, and a footer of buttons.
 *
 * Keys, as Qt's NexDialog: Esc closes, Ctrl+Enter submits, and Enter goes to
 * `onEnter` (the grant popup's field walk). An open dropdown list takes Enter
 * and Esc first — it prevents them, and the frame checks. The list under the
 * popup listens on the window for its own keys; none of them belongs to it
 * while a popup is up.
 *
 * Portaled with the house three-part overlay (isolated overlay, separate
 * backdrop, pre-promoted panel) so the grid underneath cannot ghost through.
 */
import { useEffect, useId, type KeyboardEvent, type ReactNode, type RefObject } from "react";

import ModalPortal from "@/components/ui/modal-portal";
import { getConfirmations } from "@/lib/confirm";
import styles from "@/features/sales/till-masters/page.module.scss";

export { styles as popupStyles };

export function PopupFrame({
  icon,
  title,
  subtitle,
  width,
  panelRef,
  onClose,
  onSubmit,
  onEnter,
  footer,
  children,
}: {
  /** Qt's `iconText`: two letters. */
  icon: string;
  title: string;
  subtitle: string;
  /** Wider than the till masters' 760px. */
  width?: number;
  panelRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** Ctrl+Enter. */
  onSubmit?: () => void;
  /** Plain Enter; true when the key was handled. */
  onEnter?: (target: EventTarget) => boolean;
  footer: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();

  // The page underneath does not scroll while the popup is up.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // An open dropdown list, or a question over this popup, already answered it.
    if (event.nativeEvent.defaultPrevented || getConfirmations().length > 0) return;
    const { key } = event;
    const modified = event.ctrlKey || event.altKey || event.metaKey || event.shiftKey;
    if (key === "Escape" && !modified) {
      event.preventDefault();
      onClose();
      return;
    }
    if (key === "Enter" && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
      if (!onSubmit) return;
      event.preventDefault();
      onSubmit();
      return;
    }
    if (key === "Enter" && !modified) {
      if (onEnter?.(event.target)) event.preventDefault();
      return;
    }
    // F1 / F2 / F3 / F5 / F7, Alt+C / Alt+A and Ctrl+D are the list's.
    const listKey =
      /^F\d{1,2}$/.test(key) ||
      (event.altKey && !event.ctrlKey && /^[ac]$/i.test(key)) ||
      ((event.ctrlKey || event.metaKey) && key.toLowerCase() === "d");
    if (listKey) event.preventDefault();
  };

  return (
    <ModalPortal>
      <div className={styles.overlay}>
        <button
          type="button"
          className={styles.backdrop}
          aria-label="Close"
          tabIndex={-1}
          onMouseDown={onClose}
        />
        <section
          ref={panelRef}
          className={styles.panel}
          style={width ? { width: `min(${width}px, 100%)` } : undefined}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          // Clicks inside land focus on the panel, so Esc still reaches it.
          tabIndex={-1}
          onKeyDown={onKeyDown}
        >
          <header className={styles.panelHeader}>
            <span className={styles.panelIcon} aria-hidden="true">
              {icon}
            </span>
            <div className={styles.panelHeading}>
              <h2 id={titleId} className={styles.panelTitle}>
                {title}
              </h2>
              <p className={styles.panelSubtitle}>{subtitle}</p>
            </div>
            <button type="button" className={styles.panelClose} aria-label="Close" tabIndex={-1} onClick={onClose}>
              ×
            </button>
          </header>
          {children}
          <footer className={styles.panelFooter}>{footer}</footer>
        </section>
      </div>
    </ModalPortal>
  );
}
