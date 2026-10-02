"use client";

/**
 * `AppMessage::showWarning(title, text)` / `showInfo(...)` through the app's
 * one message popup. The popup titles itself by kind, so the Qt dialog's own
 * title leads the body; the text keeps its line breaks, because several of the
 * screen's messages are lists of lines.
 */
import { toast } from "@/lib/notify";
import styles from "../page.module.scss";

export type SayKind = "success" | "info" | "warn" | "error";

export function say(kind: SayKind, title: string, text: string): void {
  const content = (
    <div className={styles.message}>
      {title ? <strong className={styles.messageTitle}>{title}</strong> : null}
      <span className={styles.messageText}>{text}</span>
    </div>
  );
  switch (kind) {
    case "success":
      toast.success(content);
      return;
    case "info":
      toast.info(content);
      return;
    case "warn":
      toast.warn(content);
      return;
    default:
      toast.error(content);
  }
}
