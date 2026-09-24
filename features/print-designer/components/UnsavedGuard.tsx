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
 *
 * ## Why the click is always cancelled
 *
 * This used to call `window.confirm` inside the listener and cancel the click
 * only on "no", which worked because the native dialog BLOCKS: the answer was
 * in hand before the handler returned. The app's own dialog does not block —
 * nothing in a browser can, short of the native one — so a listener cannot wait
 * for it and still decide whether to let the click through.
 *
 * So the click is cancelled unconditionally, the question is asked, and a "yes"
 * navigates to the destination the anchor named. From the operator's side
 * nothing changes; what changes is that the guard now does the navigating.
 *
 * `beforeunload` stays native, because it has to: browsers ignore custom text
 * and will not let a page put its own UI in front of a real unload.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/lib/confirm";

export type UnsavedGuardProps = {
  when: boolean;
  message?: string;
};

const DEFAULT_MESSAGE =
  "This template has unsaved changes, and leaving the designer discards them.";

export function UnsavedGuard({ when, message = DEFAULT_MESSAGE }: UnsavedGuardProps) {
  const router = useRouter();
  /**
   * One question at a time. The dialog is not modal to the DOM the way the
   * native one was, so a second click while it is up would otherwise queue a
   * second copy of the same question behind it.
   */
  const asking = useRef(false);

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

      // Always: the answer cannot arrive before this handler has to return.
      event.preventDefault();
      event.stopPropagation();

      if (asking.current) {
        return;
      }
      asking.current = true;
      void confirm({
        title: "Leave the designer?",
        message,
        confirmLabel: "Leave",
        iconVariant: "replace",
      })
        .then((leave) => {
          if (leave) {
            router.push(`${destination.pathname}${destination.search}${destination.hash}`);
          }
        })
        .finally(() => {
          asking.current = false;
        });
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClickCapture, true);
    };
  }, [message, router, when]);

  return null;
}

export default UnsavedGuard;
