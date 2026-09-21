"use client";
/**
 * The popup every application message is shown in — the replacement for the
 * toast stack that used to sit in the top-right corner.
 *
 * Mounted once, in the root layout, and it reads the queue in `@/lib/notify`;
 * nothing renders it directly and no screen has to hold state for it.
 *
 * Three things it has to get right, all of them learned from the screens it
 * serves:
 *
 *  - **It must be answerable from the keyboard.** The counter screens are keyed,
 *    not clicked: Enter and Esc close the message, and the OK button takes focus
 *    on open so a keyed Enter lands here rather than on the grid behind.
 *  - **It must not leak its keystrokes.** The entry screens bind Enter, Esc and
 *    the function keys on `window`, so this listens in the CAPTURE phase and
 *    stops the event there. Without that, the Enter that dismisses a "cannot
 *    save" message would also be the Enter that moves the grid cursor.
 *  - **A success must not cost a keystroke.** It closes itself; an error waits,
 *    because an error nobody read is one the operator hits again.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import ModalPortal from "@/components/ui/modal-portal";
import {
  dismissMessage,
  getMessages,
  subscribeToMessages,
  type MessageKind,
} from "@/lib/notify";
import styles from "./message-popup.module.scss";

const TITLES: Record<MessageKind, string> = {
  success: "Done",
  error: "Cannot continue",
  warn: "Please note",
  info: "Information",
};

function MessageIcon({ kind }: { kind: MessageKind }) {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "success" ? (
        <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
      ) : kind === "error" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5v5.5M12 16.5h.01" />
        </>
      ) : kind === "warn" ? (
        <>
          <path d="M10.3 4.3 2.6 17.6A2 2 0 0 0 4.3 20.6h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9.5v4M12 17h.01" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5.5M12 7.5h.01" />
        </>
      )}
    </svg>
  );
}

export default function MessagePopup() {
  // The queue is a module-level array replaced on every change, so identity is
  // the comparison React needs. `null` on the server: nothing is queued before
  // the app runs, and the popup has nothing to render into during SSR.
  const messages = useSyncExternalStore(subscribeToMessages, getMessages, () => EMPTY);
  const current = messages[0];
  const queued = messages.length - 1;
  const id = current?.id;
  const autoClose = current?.autoClose ?? false;

  const close = useCallback(() => {
    if (id !== undefined) {
      dismissMessage(id);
    }
  }, [id]);

  // A success closes itself. The timer is keyed on the message id, so a second
  // message arriving behind this one gets its own full run rather than
  // inheriting what is left of this one's.
  useEffect(() => {
    if (id === undefined || autoClose === false) {
      return;
    }
    const timer = window.setTimeout(() => dismissMessage(id), autoClose);
    return () => window.clearTimeout(timer);
  }, [autoClose, id]);

  // While a message is up the keyboard belongs to it, and the CAPTURE phase is
  // where that is settled: the screens underneath bind Enter, Esc and the
  // function keys on `window`, so an F6 keyed at an unread "cannot save" would
  // otherwise re-fire the very save it is complaining about, and the Enter that
  // dismisses the message would also move the grid cursor.
  //
  // Enter, Esc and Space answer it; Tab is left alone so the panel can still be
  // walked with the keyboard; everything else is swallowed.
  useEffect(() => {
    if (id === undefined) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (event.key === "Enter" || event.key === "Escape" || event.key === " ") {
        dismissMessage(id);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [id]);

  if (!current) {
    return null;
  }

  return (
    <ModalPortal>
      <div
        className={`${styles.overlay} ${styles[current.kind]}`}
        role="alertdialog"
        aria-modal="true"
        aria-label={TITLES[current.kind]}
      >
        <button
          type="button"
          className={styles.backdrop}
          onClick={close}
          aria-label="Close message"
        />
        <div className={styles.panel}>
          <div className={styles.head}>
            <span className={styles.iconWrap} aria-hidden="true">
              <MessageIcon kind={current.kind} />
            </span>
            <h3 className={styles.title}>{TITLES[current.kind]}</h3>
            <button type="button" className={styles.close} onClick={close} aria-label="Close message">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <path d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className={styles.message}>{current.content}</div>

          {autoClose === false ? null : (
            <div className={styles.timerTrack} aria-hidden="true">
              <div
                className={styles.timerFill}
                style={{ animationDuration: `${autoClose}ms` }}
              />
            </div>
          )}

          <div className={styles.footerRow}>
            <span className={styles.hint}>
              <kbd>Enter</kbd> or <kbd>Esc</kbd> to close
            </span>
            {queued > 0 ? (
              <span className={styles.queued}>{`${queued} more message${queued > 1 ? "s" : ""}`}</span>
            ) : null}
            <button
              type="button"
              className={styles.okButton}
              onClick={close}
              // The counter keys rather than clicks: focus lands here on open so
              // Enter answers the message instead of the screen behind it.
              autoFocus
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/** A stable empty queue for the server render, so the store is never read there. */
const EMPTY: ReturnType<typeof getMessages> = [];
