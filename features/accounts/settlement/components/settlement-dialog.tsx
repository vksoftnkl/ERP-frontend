"use client";

/**
 * The dialog every popup of this screen sits in.
 *
 *  - ModalPortal, with the full three-part structure (memory: erp-modal-portal-
 *    compositing-bleed): an isolated, promoted overlay with NO scrim of its own,
 *    a separate backdrop that owns the scrim and the outside click, and a
 *    pre-promoted panel.
 *  - Escape closes the TOP dialog only, decided per event off the stack in
 *    `domain/dialog-stack.ts` (memory: erp-nested-dialog-escape-race). The
 *    house message popup and confirm dialog swallow keys on `window` in the
 *    capture phase, so while one of those is up this never sees the key.
 *  - Focus: callers put `autoFocus` on the control that should own it — the
 *    portal mounts a commit late, so a focus() a frame later can miss (memory:
 *    erp-modal-portal-focus-race).
 */
import { useEffect, useId, useRef, type ReactNode } from "react";
import ModalPortal from "@/components/ui/modal-portal";
import { cx } from "@/components/design-system/cx";
import { closeDialog, isTopDialog, openDialog } from "../domain/dialog-stack";
import styles from "../page.module.scss";

export type SettlementDialogProps = {
  title: string;
  subtitle?: ReactNode;
  size?: "narrow" | "normal" | "wide";
  tall?: boolean;
  footer?: ReactNode;
  children: ReactNode;
  /** Escape, the × and a backdrop click. Leave it a no-op while a request is out. */
  onClose: () => void;
  /** Code-like content inside: keep the app's capitalisation off it. */
  rawText?: boolean;
};

export function SettlementDialog({
  title,
  subtitle,
  size = "normal",
  tall,
  footer,
  children,
  onClose,
  rawText,
}: SettlementDialogProps) {
  const id = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    openDialog(id);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || !isTopDialog(id)) return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      closeDialog(id);
    };
  }, [id]);

  return (
    <ModalPortal>
      <div className={styles.overlay}>
        <button
          type="button"
          className={styles.backdrop}
          aria-label="Close dialog"
          tabIndex={-1}
          onMouseDown={() => {
            if (isTopDialog(id)) onCloseRef.current();
          }}
        />
        <section
          className={cx(
            styles.dialog,
            size === "wide" && styles.dialogWide,
            size === "narrow" && styles.dialogNarrow,
            tall && styles.dialogTall,
          )}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          data-uppercase={rawText ? "off" : undefined}
        >
          <header className={styles.dialogHead}>
            <div>
              <h2 className={styles.dialogTitle}>{title}</h2>
              {subtitle ? <p className={styles.dialogSub}>{subtitle}</p> : null}
            </div>
            <button type="button" className={styles.dialogClose} aria-label="Close" onClick={() => onCloseRef.current()}>
              ×
            </button>
          </header>
          <div className={styles.dialogBody}>{children}</div>
          {footer ? <footer className={styles.dialogFoot}>{footer}</footer> : null}
        </section>
      </div>
    </ModalPortal>
  );
}
