"use client";

import { toast } from "@/lib/notify";

export type NotifyLevel = "info" | "warn" | "error" | "success";

/** One central message popup: a bold title over the text. The text is the de-duplication key. */
export function notify(level: NotifyLevel, title: string, text: string): void {
  const content = (
    <div>
      <strong>{title}</strong>
      <div style={{ whiteSpace: "pre-line", marginTop: "0.35em" }}>{text}</div>
    </div>
  );
  const options = { toastId: `stock-transfer:${level}:${title}:${text}` };
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
