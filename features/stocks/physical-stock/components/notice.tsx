"use client";

/**
 * The screen's AppMessage — a titled message through the app's popup queue
 * (`@/lib/notify`), and a Yes/No question through `@/lib/confirm`. The Qt
 * screen speaks in title + paragraphs; the popup keeps the line breaks.
 */
import { getMessages, subscribeToMessages, toast } from "@/lib/notify";
import { confirm } from "@/lib/confirm";
import styles from "../page.module.scss";

function Notice({ title, message }: { title: string; message: string }) {
  return (
    <div className={styles.notice}>
      <strong className={styles.noticeTitle}>{title}</strong>
      <p className={styles.noticeBody}>{message}</p>
    </div>
  );
}

/** Each returns the message's id, for `afterMessage`. */
export const say = {
  info: (title: string, message: string): string =>
    toast.info(<Notice title={title} message={message} />),
  warn: (title: string, message: string): string =>
    toast.warn(<Notice title={title} message={message} />),
  error: (message: string): string =>
    toast.error(<p className={styles.noticeBody}>{message}</p>),
  success: (title: string, message: string): string =>
    toast.success(<Notice title={title} message={message} />),
};

/**
 * Runs `then` once the message `id` has been answered. Qt's AppMessage is
 * modal and returns only when it closes — "the message box has just closed;
 * the keyboard goes back to this window" — so a screen moves the cursor AFTER
 * it. The web popup takes the focus while it is up (its OK button) and hands
 * it to nobody when it goes, so a focus moved before it closes is lost.
 */
export function afterMessage(id: string, then: () => void): void {
  let done = false;
  let unsubscribe: () => void = () => undefined;
  const check = () => {
    if (done || getMessages().some((message) => message.id === id)) {
      return;
    }
    done = true;
    unsubscribe();
    // One tick on: the popup is unmounted by then, its button with it.
    window.setTimeout(then, 0);
  };
  unsubscribe = subscribeToMessages(check);
  check();
}

/**
 * AppMessage::showConfirm. The first paragraph is the question; anything after
 * a blank line is the consequence, shown as the dialog's note.
 */
export function askYesNo(
  title: string,
  message: string,
  options: { destructive?: boolean } = {},
): Promise<boolean> {
  const [head, ...rest] = message.split("\n\n");
  const note = rest.join("\n\n").trim();
  return confirm({
    title,
    message: head,
    ...(note ? { note } : {}),
    confirmLabel: "Yes",
    cancelLabel: "No",
    iconVariant: options.destructive ? "delete" : "replace",
  });
}

/** Whether a dialog owns the keyboard — the screen's F-keys stand down while one is up. */
export function anyDialogOpen(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return document.querySelector('[aria-modal="true"]') !== null;
}
