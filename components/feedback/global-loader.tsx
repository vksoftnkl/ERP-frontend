"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ERP_GLOBAL_NAVIGATION_START_EVENT } from "@/lib/navigation/global-loader";
import { baseApi } from "@/store/api/baseApi";
import { useAppSelector } from "@/store/hooks";
import type { RootState } from "@/store/store";
import { selectAuthInitialized } from "@/store/slices/authSlice";
import { selectGlobalLoaderPendingRequests } from "@/store/slices/globalLoaderSlice";

const SHOW_DELAY_MS = 120;
const MIN_VISIBLE_MS = 360;
const ROUTE_LOADING_TIMEOUT_MS = 8000;

type RequestEntry = {
  status?: string;
};

function countPendingEntries(entries: Record<string, RequestEntry | undefined>): number {
  return Object.values(entries).filter((entry) => entry?.status === "pending").length;
}

function selectRtkPendingRequests(state: RootState): number {
  const apiState = state[baseApi.reducerPath];
  return (
    countPendingEntries(apiState.queries) +
    countPendingEntries(apiState.mutations)
  );
}

function selectGridColumnPendingRequests(state: RootState): number {
  return Object.values(state.gridColumns.byGridId).filter((entry) => entry.loading).length;
}

function shouldTrackAnchorClick(event: MouseEvent): boolean {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }

  const anchor = target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) {
    return false;
  }

  if (anchor.target && anchor.target !== "_self") {
    return false;
  }

  if (anchor.hasAttribute("download")) {
    return false;
  }

  const currentUrl = new URL(window.location.href);
  const nextUrl = new URL(anchor.href, currentUrl);
  return nextUrl.origin === currentUrl.origin && nextUrl.href !== currentUrl.href;
}

export default function GlobalLoader() {
  const pathname = usePathname();
  const authInitialized = useAppSelector(selectAuthInitialized);
  const customPendingRequests = useAppSelector(selectGlobalLoaderPendingRequests);
  const rtkPendingRequests = useAppSelector(selectRtkPendingRequests);
  const gridColumnPendingRequests = useAppSelector(selectGridColumnPendingRequests);
  const [routeLoading, setRouteLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const visibleSinceRef = useRef(0);
  const routeTimeoutRef = useRef<number | null>(null);

  const pending = useMemo(
    () => customPendingRequests + rtkPendingRequests + gridColumnPendingRequests,
    [customPendingRequests, gridColumnPendingRequests, rtkPendingRequests],
  );

  const active = !authInitialized || pending > 0 || routeLoading;

  const clearRouteTimeout = useCallback(() => {
    if (routeTimeoutRef.current !== null) {
      window.clearTimeout(routeTimeoutRef.current);
      routeTimeoutRef.current = null;
    }
  }, []);

  const startRouteLoading = useCallback(() => {
    setRouteLoading(true);
    clearRouteTimeout();
    routeTimeoutRef.current = window.setTimeout(() => {
      routeTimeoutRef.current = null;
      setRouteLoading(false);
    }, ROUTE_LOADING_TIMEOUT_MS);
  }, [clearRouteTimeout]);

  useEffect(() => {
    const handleNavigationStart = () => {
      startRouteLoading();
    };
    const handleDocumentClick = (event: MouseEvent) => {
      if (shouldTrackAnchorClick(event)) {
        startRouteLoading();
      }
    };

    window.addEventListener(ERP_GLOBAL_NAVIGATION_START_EVENT, handleNavigationStart);
    window.addEventListener("popstate", handleNavigationStart);
    window.addEventListener("beforeunload", handleNavigationStart);
    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      window.removeEventListener(ERP_GLOBAL_NAVIGATION_START_EVENT, handleNavigationStart);
      window.removeEventListener("popstate", handleNavigationStart);
      window.removeEventListener("beforeunload", handleNavigationStart);
      document.removeEventListener("click", handleDocumentClick, true);
      clearRouteTimeout();
    };
  }, [clearRouteTimeout, startRouteLoading]);

  useEffect(() => {
    if (!routeLoading) {
      return;
    }

    const finishTimer = window.setTimeout(() => {
      clearRouteTimeout();
      setRouteLoading(false);
    }, 160);

    return () => window.clearTimeout(finishTimer);
  }, [clearRouteTimeout, pathname, routeLoading]);

  useEffect(() => {
    if (active) {
      const showTimer = window.setTimeout(() => {
        visibleSinceRef.current = Date.now();
        setVisible(true);
      }, SHOW_DELAY_MS);

      return () => window.clearTimeout(showTimer);
    }

    if (!visible) {
      return;
    }

    const elapsed = Date.now() - visibleSinceRef.current;
    const hideDelay = Math.max(MIN_VISIBLE_MS - elapsed, 0);
    const hideTimer = window.setTimeout(() => {
      setVisible(false);
    }, hideDelay);

    return () => window.clearTimeout(hideTimer);
  }, [active, visible]);

  return (
    <div
      aria-hidden={!visible}
      aria-live="polite"
      className={`erp-global-loader${visible ? " erp-global-loader--visible" : ""}`}
      role="status"
    >
      <div className="erp-global-loader__bar" />
      <span className="erp-sr-only">Loading</span>
    </div>
  );
}
