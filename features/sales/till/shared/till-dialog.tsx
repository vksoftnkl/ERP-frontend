"use client";

/**
 * The dialog every till session surface sits in (Cash Movement, End Shift,
 * Slip check, the journal).
 *
 * The house three-part structure (memory: modal-portal-compositing-bleed):
 * portaled to `document.body`; the overlay is an isolated composited layer
 * with NO background; a separate backdrop owns the scrim; the panel is
 * pre-promoted (`will-change`). The backdrop does not close on a click — these
 * dialogs hold a count, and a stray click must not throw one away (Qt's
 * dialogs do not close on an outside click either).
 *
 * Escape closes only the TOPMOST surface: a dialog opened over another (End
 * Shift over the cockpit, the confirm over End Shift) takes it, decided per
 * event — never from a ref — so a nested close committing between two
 * listeners cannot close the one beneath (memory: nested-dialog-escape-race).
 * The house confirm and message popups own their own Escape, so while either
 * is up this one ignores it.
 */
import { useEffect, useId, useRef, type ReactNode } from "react";
import ModalPortal from "@/components/ui/modal-portal";
import { cx } from "@/components/design-system/cx";
import { getConfirmations } from "@/lib/confirm";
import { getMessages } from "@/lib/notify";
import styles from "./till.module.scss";

/** Open till dialogs, oldest first: only the last one answers Escape. */
const openStack: string[] = [];

/** A confirmation, a message, or another modal of the app is up over the page. */
export function overlayOpen(): boolean {
  if (getConfirmations().length > 0 || getMessages().length > 0) return true;
  return typeof document !== "undefined" && document.querySelector('[aria-modal="true"]') !== null;
}

export type TillDialogProps = {
  title: ReactNode;
  /** A muted line under the title (whose session …). */
  subtitle?: ReactNode;
  /** Shown beside the title — a pill, a status. */
  headExtra?: ReactNode;
  open: boolean;
  size?: "narrow" | "normal" | "wide";
  footer?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  /** Escape is refused (a request in flight): the dialog stays. */
  busy?: boolean;
  /**
   * The dialog's own keys (Ctrl+Enter post …), called only while it is the topmost
   * surface and no confirmation or message is up. Escape is the shell's.
   */
  onKey?: (event: KeyboardEvent) => void;
};

export function TillDialog({ title, subtitle, headExtra, open, size = "normal", footer, children, onClose, busy, onKey }: TillDialogProps) {
  const id = useId();
  const latest = useRef({ onClose, busy, onKey });
  useEffect(() => {
    latest.current = { onClose, busy, onKey };
  });

  useEffect(() => {
    if (!open) return;
    openStack.push(id);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (openStack[openStack.length - 1] !== id) return;
      if (getConfirmations().length > 0 || getMessages().length > 0) return;
      if (event.key !== "Escape") {
        latest.current.onKey?.(event);
        return;
      }
      event.preventDefault();
      if (!latest.current.busy) latest.current.onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      const at = openStack.lastIndexOf(id);
      if (at >= 0) openStack.splice(at, 1);
    };
  }, [id, open]);

  if (!open) return null;

  return (
    <ModalPortal>
      <div className={styles.overlay}>
        <div className={styles.backdrop} aria-hidden="true" />
        <section
          className={cx(styles.panel, size === "narrow" && styles.panelNarrow, size === "wide" && styles.panelWide)}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${id}-title`}
        >
          <header className={styles.panelHead}>
            {subtitle ? (
              <div className={styles.panelTitleBlock}>
                <h2 id={`${id}-title`} className={styles.panelTitle}>
                  {title}
                </h2>
                <p className={styles.muted}>{subtitle}</p>
              </div>
            ) : (
              <h2 id={`${id}-title`} className={styles.panelTitle}>
                {title}
              </h2>
            )}
            {headExtra}
            <button
              type="button"
              className={styles.panelClose}
              aria-label="Close"
              tabIndex={-1}
              disabled={busy}
              onClick={onClose}
            >
              ×
            </button>
          </header>
          <div className={styles.panelBody}>{children}</div>
          {footer ? <footer className={styles.panelFoot}>{footer}</footer> : null}
        </section>
      </div>
    </ModalPortal>
  );
}

/** A pill in one of the house tones. */
export function TonePill({ tone, children, title }: { tone: "green" | "amber" | "red" | "blue" | "grey"; children: ReactNode; title?: string }) {
  return (
    <span
      className={cx(
        styles.pill,
        tone === "green" && styles.pillGreen,
        tone === "amber" && styles.pillAmber,
        tone === "red" && styles.pillRed,
        tone === "blue" && styles.pillBlue,
      )}
      title={title}
    >
      {children}
    </span>
  );
}
