"use client";

/**
 * The screen's AppMessage — a titled message through the app's popup queue
 * (`@/lib/notify`), and a Yes/No question through `@/lib/confirm`. The Qt
 * screen speaks in title + paragraphs; the popup keeps the line breaks.
 */
import { toast } from "@/lib/notify";
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

export const say = {
  info: (title: string, message: string) => toast.info(<Notice title={title} message={message} />),
  warn: (title: string, message: string) => toast.warn(<Notice title={title} message={message} />),
  error: (message: string) => toast.error(<p className={styles.noticeBody}>{message}</p>),
  success: (title: string, message: string) =>
    toast.success(<Notice title={title} message={message} />),
};

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
