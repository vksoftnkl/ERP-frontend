/**
 * Application confirmations — the one API a screen asks a yes/no question
 * through, and the store the dialog that shows them reads from.
 *
 * This replaces `window.confirm`. The native dialog is wrong here for the same
 * reasons the native `alert` was wrong for messages: it looks nothing like the
 * rest of the app, it cannot be styled, keyboard-tested or screenshotted, and
 * it BLOCKS the render loop of the screen underneath it while it is up — so a
 * reply that lands mid-question is applied to a page that cannot repaint.
 *
 * Deliberately framework-free, and deliberately NOT a React context. Two of the
 * callers are outside React's render scope entirely: the print designer's
 * unsaved-changes guard asks from inside a capture-phase DOM listener, and the
 * designer hook asks from a plain callback. A provider + `useConfirm()` would
 * serve neither. A module-level queue with subscribers serves both, and is the
 * same shape `lib/notify.ts` already uses for messages — one pattern, not two.
 *
 * ## The contract
 *
 *     if (await confirm({ title: "Discard?", message: "…" })) { … }
 *
 * The promise resolves `true` for the confirm button and `false` for cancel,
 * for Esc, for the close button and for a backdrop click. It never rejects: a
 * question that throws would make every call site wrap it, and "no" is always
 * the safe reading of "the operator did not say yes".
 *
 * ## The queue
 *
 * Questions are asked one at a time, oldest first — two screens asking at once
 * do not stack dialogs, and neither is dropped. A question is never replaced
 * the way a message with a `messageKey` is: every one has a caller waiting on
 * its answer.
 */

export type ConfirmRequest = {
  title: string;
  message: string;
  /** A second line under the message, for the consequence. */
  note?: string;
  /** Defaults to "Confirm". */
  confirmLabel?: string;
  /** Defaults to "Cancel". */
  cancelLabel?: string;
  /** `delete` is the bin; `replace` suits a job that discards without deleting. */
  iconVariant?: "delete" | "replace";
};

export type PendingConfirmation = ConfirmRequest & {
  id: string;
  /** Called once, by the dialog, with the operator's answer. */
  settle: (answer: boolean) => void;
};

const EMPTY: PendingConfirmation[] = [];

let queue: PendingConfirmation[] = [];
let nextId = 0;
const listeners = new Set<() => void>();

function publish(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Ask, and wait for the answer.
 *
 * On the server there is no dialog and nobody to answer, so this resolves
 * `false` rather than hanging a render forever.
 */
export function confirm(request: ConfirmRequest): Promise<boolean> {
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    const id = `confirm-${(nextId += 1)}`;
    let settled = false;
    queue = [
      ...queue,
      {
        ...request,
        id,
        settle: (answer: boolean) => {
          // The dialog can be dismissed more than once in a frame — Esc while
          // a click is already in flight — and a promise resolved twice would
          // silently keep the first answer. Dropping the second is the same
          // outcome, stated.
          if (settled) {
            return;
          }
          settled = true;
          queue = queue.filter((entry) => entry.id !== id);
          publish();
          resolve(answer);
        },
      },
    ];
    publish();
  });
}

/** The queue as it stands. Stable between changes, so React may compare it. */
export function getConfirmations(): PendingConfirmation[] {
  return queue;
}

export function getServerConfirmations(): PendingConfirmation[] {
  return EMPTY;
}

export function subscribeToConfirmations(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Answer everything outstanding with `false`. For a test, and for a hard
 * navigation that leaves the asking screen behind — a caller still awaiting an
 * answer that can never come would hold its closure alive.
 */
export function cancelAllConfirmations(): void {
  const outstanding = queue;
  queue = [];
  for (const entry of outstanding) {
    entry.settle(false);
  }
  publish();
}
