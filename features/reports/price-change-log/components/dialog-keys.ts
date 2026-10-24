"use client";

/**
 * The keys of one Price Change Log dialog sitting on `ModalShell` — Escape
 * above all, and the dialog's own keys (F3 on the detail).
 *
 * WHY NOT ModalShell's OWN ESCAPE ALONE. The report stacks three surfaces —
 * the detail over the item history over the screen — and every ModalShell
 * listens for Escape on `document` in the capture phase. `stopPropagation()`
 * does not stop OTHER listeners on the same node, so one Escape would reach
 * both shells and close the whole stack; and React can commit the upper
 * dialog's close between the two listeners, so no state read can tell the
 * lower one to stay (memory: nested dialog Escape race).
 *
 * So each open dialog listens on `window`, capture — ahead of every
 * `document` listener — and decides per EVENT from the DOM: only the dialog
 * that is the topmost `aria-modal` surface takes the key, and stops it there
 * (`stopImmediatePropagation`), so no ModalShell listener sees that Escape.
 * When something else is on top (the message popup, which owns the keyboard
 * itself), the dialogs below leave the key alone, and the close ModalShell
 * would run anyway is swallowed for that one dispatch.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/** Put on an element inside the dialog's body: marks the surface as one of ours. */
export const PRICE_LOG_DIALOG_ATTR = "data-price-log-dialog";

const MODAL_SELECTOR = '[aria-modal="true"]';

/** The surface painted last: modals portal to the end of <body> in the order they open. */
function topmostModal(): Element | null {
  const all = document.querySelectorAll(MODAL_SELECTOR);
  return all.length ? all[all.length - 1] : null;
}

/** True while one keydown dispatch is being kept from the dialogs under a foreign surface. */
let swallowing = false;

function swallowThisDispatch(): void {
  swallowing = true;
  // The rest of this keydown's listeners run in the same task; the flag ends with it.
  window.setTimeout(() => {
    swallowing = false;
  }, 0);
}

export type DialogKeyHandlers = Partial<Record<string, (() => void) | null | undefined>>;

/**
 * `markerRef` is an element inside this dialog's body (its surface is found
 * from it). Returns the close to hand to ModalShell's `onClose` (backdrop,
 * ×, and the Escape that ModalShell would otherwise act on).
 */
export function useDialogKeys(
  markerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  keys: DialogKeyHandlers = {},
): () => void {
  const latest = useRef({ onClose, keys });
  useLayoutEffect(() => {
    latest.current = { onClose, keys };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mine = markerRef.current?.closest(MODAL_SELECTOR) ?? null;
      if (!mine) {
        return;
      }
      const top = topmostModal();
      if (top !== mine) {
        if (event.key === "Escape" && top && !top.querySelector(`[${PRICE_LOG_DIALOG_ATTR}]`)) {
          // A foreign surface above us takes this Escape; ModalShell must not close us too.
          swallowThisDispatch();
        }
        return;
      }
      if (event.key === "Escape") {
        if (event.defaultPrevented) {
          // A control inside the dialog (an open list) already used it.
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        latest.current.onClose();
        return;
      }
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
        return;
      }
      const handler = latest.current.keys[event.key];
      if (handler) {
        event.preventDefault();
        if (!event.repeat) {
          handler();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [markerRef]);

  return useCallback(() => {
    if (!swallowing) {
      latest.current.onClose();
    }
  }, []);
}
