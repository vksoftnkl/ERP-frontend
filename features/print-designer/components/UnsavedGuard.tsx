"use client";

/**
 * The unsaved-work guard.
 *
 * Two exits to cover, and only one of them is standard. `beforeunload` catches
 * a closed tab or a typed URL. An in-app navigation is a client-side route
 * change that fires no such event, so anchor clicks are intercepted in the
 * capture phase — the App Router gives no navigation-blocking hook, and letting
 * the route change and then apologising would already have unmounted the state.
 *
 * Nothing is autosaved to storage: the designer holds the draft in memory only
 * (the plan's A10), which makes this guard the whole protection.
 */

import { useEffect } from "react";

export type UnsavedGuardProps = {
  when: boolean;
  message?: string;
};

const DEFAULT_MESSAGE =
  "This template has unsaved changes. Leave the designer and lose them?";

export function UnsavedGuard({ when, message = DEFAULT_MESSAGE }: UnsavedGuardProps) {
  useEffect(() => {
    if (!when) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Browsers ignore custom text now and show their own prompt; assigning
      // returnValue is still what triggers it.
      event.returnValue = "";
    };

    const handleClickCapture = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) {
        return;
      }
      const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) {
        return;
      }
      if (destination.pathname === window.location.pathname) {
        return;
      }
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClickCapture, true);
    };
  }, [message, when]);

  return null;
}

export default UnsavedGuard;
