/**
 * Application messages — the one API every screen raises a success, an error or
 * a warning through, and the store the popup that shows them reads from.
 *
 * This replaces `react-toastify`. The screens' calls are unchanged (`toast.error
 * ("Add at least one item before saving the bill.")`) because the export below
 * is shaped like the one they were written against; what changed is where the
 * message lands. A toast in the top-right corner was the wrong instrument for a
 * counter screen: it covers the header pickers, it can be missed entirely by an
 * operator watching the grid, and it cannot be answered. A message now opens a
 * popup in the middle of the screen, over everything, dismissed with Enter or
 * Esc like every other dialog here.
 *
 * Deliberately framework-free: the sagas and `useApi` raise messages from
 * outside React, so the store is a module-level queue with subscribers and the
 * component is only a reader.
 *
 * ## The queue
 *
 * Messages are shown one at a time, oldest first — a burst (a failed save that
 * also invalidates a field, say) does not stack popups on top of each other, and
 * nothing is dropped. `messageKey` (`toastId` at the call sites that pass one)
 * replaces an identical message already waiting instead of queueing a second
 * copy of it.
 */
import type { ReactNode } from "react";
import { apiRefusalOf, refusalMessage } from "@/lib/api/error-text";

export type MessageKind = "success" | "error" | "warn" | "info";

export type MessageOptions = {
  /**
   * A de-duplication handle. A message raised under a key that is already in the
   * queue replaces it rather than queueing behind it — which is what the screens
   * passing `toastId` have always meant by it.
   */
  toastId?: string;
  /**
   * Milliseconds before the popup closes itself, or `false` to make it wait for
   * the operator. Defaults per kind: a success closes itself, everything else
   * waits — an error the operator did not read is an error they will hit again.
   */
  autoClose?: number | false;
  /** The popup's title, in place of the kind's ("Done", "Cannot continue" …). */
  title?: string;
  /**
   * Small grey text under the message — the server's status · code · field and
   * its own sentence under a refusal's plain words, for support.
   */
  detail?: string;
};

/** `toast.apiError`'s options. */
export type ApiErrorMessageOptions = MessageOptions & {
  /**
   * The screen's "Bill not lost." line: a refusal saved nothing and the work
   * is still on the screen (Qt's `nexKeptLine`). Added to a 4xx only.
   */
  kept?: string;
  /** The sentence when the thrown value carries none. */
  fallback?: string;
  /**
   * The title of an unworded 400/409/422 when the call was not a save —
   * "Cannot delete", "Cannot restore" (default "Cannot save").
   */
  refusedTitle?: string;
};

export type AppMessage = {
  id: string;
  kind: MessageKind;
  content: ReactNode;
  autoClose: number | false;
  /** When it was raised, so a repeat of the same message still reads as new. */
  raisedAt: number;
  title?: string;
  detail?: string;
};

/** How long a success stays up before it closes itself. */
export const SUCCESS_AUTO_CLOSE_MS = 2000;

let queue: AppMessage[] = [];
let nextId = 0;
const listeners = new Set<() => void>();

function publish(): void {
  for (const listener of listeners) {
    listener();
  }
}

function defaultAutoClose(kind: MessageKind): number | false {
  return kind === "success" ? SUCCESS_AUTO_CLOSE_MS : false;
}

function push(kind: MessageKind, content: ReactNode, options: MessageOptions = {}): string {
  // An empty message is not worth a popup — a caller that has nothing to say
  // (an error with no message text) should not stop the operator.
  if (content === null || content === undefined || content === "") {
    return "";
  }
  // Without an explicit key, the message text is the key. A dead network fails
  // every dropdown on the screen at once and each failure raises the same
  // sentence; queueing five identical popups would make the operator dismiss
  // the same news five times.
  const id =
    options.toastId ??
    (typeof content === "string" ? `${kind}:${content}` : `msg-${(nextId += 1)}`);
  const message: AppMessage = {
    id,
    kind,
    content,
    autoClose: options.autoClose ?? defaultAutoClose(kind),
    raisedAt: Date.now(),
    ...(options.title ? { title: options.title } : {}),
    ...(options.detail ? { detail: options.detail } : {}),
  };
  const existing = queue.findIndex((entry) => entry.id === id);
  queue = existing >= 0
    ? queue.map((entry, index) => (index === existing ? message : entry))
    : [...queue, message];
  publish();
  return id;
}

/** Close one message by id, or the whole queue when given nothing. */
export function dismissMessage(id?: string): void {
  queue = id === undefined ? [] : queue.filter((entry) => entry.id !== id);
  publish();
}

/** The queue as it stands. Stable between changes, so React may compare it. */
export function getMessages(): AppMessage[] {
  return queue;
}

export function subscribeToMessages(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * A refused or failed request, in plain words (Qt `ApiClient::handleError`,
 * ec9d92d): a known refusal gets a short title, one line and a "Do:" step, with
 * the server's status · code · field and sentence small and grey underneath;
 * an unworded one keeps the server's sentence under a title by its status
 * ("Cannot save", "Not allowed" …), never "409". See `@/lib/api/error-text`.
 */
function pushApiError(error: unknown, options: ApiErrorMessageOptions = {}): string {
  const { kept, fallback, refusedTitle, ...rest } = options;
  const message = refusalMessage(apiRefusalOf(error, fallback), kept, refusedTitle);
  return push(message.kind, message.body, {
    ...rest,
    title: rest.title ?? message.title,
    detail: rest.detail ?? (message.detail || undefined),
  });
}

/**
 * The call sites' API, shaped like the toast library's so that raising a message
 * is the same line of code it has always been.
 *
 * `warning` is an alias for `warn`: both spellings are in use, and both are what
 * the caller means.
 */
export const toast = Object.assign(
  (content: ReactNode, options?: MessageOptions) => push("info", content, options),
  {
    success: (content: ReactNode, options?: MessageOptions) => push("success", content, options),
    error: (content: ReactNode, options?: MessageOptions) => push("error", content, options),
    warn: (content: ReactNode, options?: MessageOptions) => push("warn", content, options),
    warning: (content: ReactNode, options?: MessageOptions) => push("warn", content, options),
    info: (content: ReactNode, options?: MessageOptions) => push("info", content, options),
    /** A thrown request error in plain words — see `pushApiError`. */
    apiError: (error: unknown, options?: ApiErrorMessageOptions) => pushApiError(error, options),
    dismiss: (id?: string) => dismissMessage(id),
  },
);
