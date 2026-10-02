"use client";

/**
 * The Qt `AppMessage::showWarning(title, text)` / `showInfo` pair, on the app's
 * message popup: a bold title over the text, line breaks kept.
 */
import { toast } from "@/lib/notify";

export type NotifyLevel = "info" | "warn" | "error" | "success";

export function notify(level: NotifyLevel, title: string, text: string): void {
  const content = (
    <div>
      <strong>{title}</strong>
      <div style={{ whiteSpace: "pre-line", marginTop: "0.35em" }}>{text}</div>
    </div>
  );
  // The text is the de-duplication key: the same refusal raised twice is one popup.
  const options = { toastId: `stock-adjustment:${level}:${title}:${text}` };
  if (level === "warn") {
    toast.warn(content, options);
  } else if (level === "error") {
    toast.error(content, options);
  } else if (level === "success") {
    toast.success(content, options);
  } else {
    toast.info(content, options);
  }
}
