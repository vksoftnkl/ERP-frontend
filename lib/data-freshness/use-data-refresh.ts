"use client";
import { useEffect, useRef, useState } from "react";
import {
  subscribeDataRefresh,
  type DataRefreshEvent,
  type DataRefreshReason,
} from "./refresh-bus";

export type UseDataRefreshOptions = {
  // Set false to unsubscribe (e.g. while a screen is inactive or a popup is closed).
  enabled?: boolean;
  // Floor between two runs of this handler. Guards against a burst of tab-focus
  // signals turning into a burst of requests. Saves bypass it.
  minIntervalMs?: number;
  // Only react to these signals. Defaults to all of them.
  reasons?: readonly DataRefreshReason[];
};

// Reasons that mean "data actually changed" rather than "we might be stale".
// They skip the throttle so a save shows up immediately. "manual" is not one of
// them on purpose: it fires from things a user can repeat quickly, such as
// opening a modal, and those should stay behind the throttle.
const IMMEDIATE_REASONS: readonly DataRefreshReason[] = ["mutation", "remote-mutation"];

const DEFAULT_MIN_INTERVAL_MS = 3_000;

// Re-run `handler` whenever the app decides on-screen data may be stale: the tab
// regained focus, the network came back, or something was saved here or in another
// tab. Use it for anything loaded imperatively (popup lists, dropdown options,
// grid/widget config); RTK Query queries revalidate on their own.
//
// `handler` is read through a ref, so it does not need to be memoised.
export function useDataRefresh(
  handler: (event: DataRefreshEvent) => void,
  { enabled = true, minIntervalMs = DEFAULT_MIN_INTERVAL_MS, reasons }: UseDataRefreshOptions = {},
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const lastRunAtRef = useRef(0);
  const reasonsKey = reasons ? reasons.join(",") : "";

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const allowedReasons = reasonsKey ? new Set(reasonsKey.split(",")) : null;
    return subscribeDataRefresh((event) => {
      if (allowedReasons && !allowedReasons.has(event.reason)) {
        return;
      }
      // A hidden tab has nothing on screen worth refetching; the `visible` signal
      // it gets when the user comes back covers whatever it missed.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      const immediate = IMMEDIATE_REASONS.includes(event.reason);
      if (!immediate && event.at - lastRunAtRef.current < minIntervalMs) {
        return;
      }
      lastRunAtRef.current = event.at;
      handlerRef.current(event);
    });
  }, [enabled, minIntervalMs, reasonsKey]);
}

// A counter that ticks on every refresh signal. Add it to the dependency list of an
// effect that loads data once on mount and that effect runs again - body, guards and
// cleanup unchanged - whenever the app decides its data may be stale. Use this for
// existing load-on-mount effects; use useDataRefresh above when you just want to call
// a loader.
export function useDataRefreshToken(options?: UseDataRefreshOptions): number {
  const [token, setToken] = useState(0);
  useDataRefresh(() => {
    setToken((current) => current + 1);
  }, options);
  return token;
}
