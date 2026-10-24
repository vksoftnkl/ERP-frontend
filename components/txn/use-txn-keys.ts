"use client";

/**
 * The shared transaction keys (`lib/txn-keys.ts`) bound on one screen — Qt
 * `TxnKeys::bind()` / `bindKey()` / `installHelp()`.
 *
 * A key runs its handler only when the screen GAVE one: an action left out
 * (or passed `null` / `undefined`, for a button that is disabled right now)
 * is not intercepted at all, so a key can never do what its button would
 * refuse, and the browser keeps the chord for itself (Ctrl+P, Ctrl+F).
 *
 * Before a handler runs, a grid cell still being typed in is BLURRED: the
 * cells commit on blur, so the action reads the value the operator just keyed
 * (Qt `commitOpenEditor()`).
 *
 * A dialog over the screen owns the keyboard: while any `aria-modal` surface
 * is up, the screen's keys are quiet — unless `scopeRef` is given, which makes
 * this the dialog's OWN key set, live for events from inside it only.
 */
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { isHelpKey, txnKeyOf, type TxnKeyAction } from "@/lib/txn-keys";

export type TxnKeyHandlers = Partial<Record<TxnKeyAction, (() => void) | null | undefined>>;

export type UseTxnKeysOptions = {
  /** False turns every key off (a screen still loading, say). Default true. */
  enabled?: boolean;
  /** F1 — open the key sheet. */
  onHelp?: () => void;
  /**
   * A dialog's own key set: live only for keystrokes inside this element,
   * whatever else is open around it.
   */
  scopeRef?: RefObject<HTMLElement | null>;
};

/** The grid cells' marker attribute (`GRID_FIELD_ATTR`). */
const GRID_CELL_SELECTOR = "[data-quotation-field]";

function commitOpenEditor(): void {
  const active = document.activeElement as HTMLElement | null;
  if (active && active !== document.body && active.matches?.(GRID_CELL_SELECTOR)) {
    active.blur();
  }
}

export function useTxnKeys(handlers: TxnKeyHandlers, options: UseTxnKeysOptions = {}): void {
  const latest = useRef({ handlers, options });
  useLayoutEffect(() => {
    latest.current = { handlers, options };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { handlers: current, options: opts } = latest.current;
      if (opts.enabled === false || event.defaultPrevented) {
        return;
      }
      const scope = opts.scopeRef?.current ?? null;
      if (opts.scopeRef) {
        if (!scope || !(event.target instanceof Node) || !scope.contains(event.target)) {
          return;
        }
      } else if (document.querySelector('[aria-modal="true"]')) {
        return;
      }
      if (isHelpKey(event)) {
        // Always taken: the browser's own F1 opens a help tab over the screen.
        event.preventDefault();
        if (!event.repeat) {
          opts.onHelp?.();
        }
        return;
      }
      const action = txnKeyOf(event);
      if (!action) {
        return;
      }
      const handler = current[action];
      if (!handler) {
        return;
      }
      event.preventDefault();
      if (event.repeat) {
        return;
      }
      commitOpenEditor();
      handler();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
