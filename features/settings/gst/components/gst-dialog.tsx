"use client";

/**
 * The dialog every GST form sits in — the provider, its child rows, a field
 * map inside an endpoint, the credential. They STACK (provider → endpoint →
 * field map), so the keyboard belongs to the one on top:
 *
 *  * Escape and the dialog's own keys (F5 save, F7 verify) are read from a
 *    bubble-phase `document` listener that acts only when this panel is the
 *    LAST `[data-gst-dialog]` in the DOM — portaled in mount order, so the
 *    topmost — and only when nothing nearer the target took the key first
 *    (`defaultPrevented`: an open dropdown list closes on its own Escape).
 *    Deciding per event, from the DOM, is what keeps one Escape from closing
 *    two stacked dialogs (see the User Administration dialog's history).
 *  * The app's message and confirm popups swallow keys at `window` capture,
 *    so nothing here fires behind them.
 *  * Enter walks to the next field, as every popup here does.
 */
import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import ModalPortal from "@/components/ui/modal-portal";
import { cx } from "@/components/design-system/cx";
import styles from "../gst.module.scss";

const DIALOG_ATTR = "data-gst-dialog";

export type GstDialogKey = {
  key: string;
  ctrl?: boolean;
  run: () => void;
};

export type GstDialogProps = {
  title: string;
  subtitle?: ReactNode;
  /** Right of the title: the row's state. */
  badge?: ReactNode;
  /** Panel width in the screen's units (`--gst-u`). */
  width: number;
  /** Hold one height — for a dialog with lists that load after it opens. */
  tall?: boolean;
  /** The body does not scroll; its panes do. */
  fixedBody?: boolean;
  footer: ReactNode;
  keys?: readonly GstDialogKey[];
  onClose: () => void;
  children: ReactNode;
};

function isTopmost(panel: HTMLElement | null): boolean {
  if (!panel) {
    return false;
  }
  const all = document.querySelectorAll(`[${DIALOG_ATTR}]`);
  return all.length > 0 && all[all.length - 1] === panel;
}

const FIELD_SELECTOR =
  'input:not([type="hidden"]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])';

/**
 * Enter on a field moves to the next one. Not from a textarea (Enter is a
 * line there), a button (Enter presses it) or a list (Enter edits the row),
 * and not when the field already used the key — a dropdown picking its row.
 */
export function advanceOnEnter(event: ReactKeyboardEvent<HTMLElement>): void {
  if (
    event.key !== "Enter" ||
    event.defaultPrevented ||
    event.shiftKey ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  ) {
    return;
  }
  const target = event.target as HTMLElement;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
    return;
  }
  if (target.getAttribute("aria-expanded") === "true" || target.dataset.gstEnter === "own") {
    return;
  }
  const fields = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FIELD_SELECTOR));
  const index = fields.indexOf(target);
  const next = index >= 0 ? fields[index + 1] : undefined;
  if (next) {
    event.preventDefault();
    next.focus();
    if (next instanceof HTMLInputElement && next.type !== "checkbox") {
      next.select();
    }
  }
}

export function GstDialog({
  title,
  subtitle,
  badge,
  width,
  tall,
  fixedBody,
  footer,
  keys,
  onClose,
  children,
}: GstDialogProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  // Read at event time, so the listener is registered once — at mount, which
  // is also the order the dialogs stack in.
  const onCloseRef = useRef(onClose);
  const keysRef = useRef(keys);
  useEffect(() => {
    onCloseRef.current = onClose;
    keysRef.current = keys;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || !isTopmost(panelRef.current)) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      const ctrl = event.ctrlKey || event.metaKey;
      for (const binding of keysRef.current ?? []) {
        if (event.key === binding.key && Boolean(binding.ctrl) === ctrl && !event.shiftKey) {
          event.preventDefault();
          binding.run();
          return;
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const onBodyKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    advanceOnEnter(event);
  }, []);

  return (
    <ModalPortal>
      <div className={styles.overlay}>
        {/* No close on a backdrop click: these forms hold typed secrets. */}
        <div className={styles.backdrop} aria-hidden="true" />
        <section
          ref={panelRef}
          className={cx(styles.panel, tall && styles.panelTall)}
          style={{ "--gst-w": width } as CSSProperties}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          {...{ [DIALOG_ATTR]: "" }}
        >
          <header className={styles.header}>
            <h2 className={styles.title}>{title}</h2>
            <div className={styles.subtitle}>{subtitle}</div>
            {badge}
            <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
              ×
            </button>
          </header>
          <div className={cx(styles.body, fixedBody && styles.bodyFixed)} onKeyDown={onBodyKeyDown}>
            {children}
          </div>
          <footer className={styles.footer}>{footer}</footer>
        </section>
      </div>
    </ModalPortal>
  );
}
