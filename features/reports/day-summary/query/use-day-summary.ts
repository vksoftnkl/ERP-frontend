"use client";
/**
 * `DaySummaryLoader` as a hook: one load per URL change, pages on demand, and
 * the dev-only consistency check of the Summary snapshot.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DaySummaryClient } from "../api/day-summary";
import { DaySummaryLoader, INITIAL_STATE, type LoaderState } from "./day-summary-loader";
import type { Filters, Session } from "./params";

export function useDaySummary(client: DaySummaryClient, session: Session, filters: Filters) {
  const [state, setState] = useState<LoaderState>(INITIAL_STATE);
  const loaderRef = useRef<DaySummaryLoader | null>(null);

  useEffect(() => {
    const loader = new DaySummaryLoader(client, setState);
    loaderRef.current = loader;
    return () => {
      loader.dispose();
      loaderRef.current = null;
    };
  }, [client]);

  // One load per distinct request. Object identity changes every render, so
  // the effect keys on the serialised request instead.
  const requestKey = JSON.stringify([session, filters]);
  useEffect(() => {
    const [s, f] = JSON.parse(requestKey) as [Session, Filters];
    loaderRef.current?.load({ session: s, filters: f });
  }, [requestKey, client]);

  const ensureRows = useCallback((first: number, last: number) => loaderRef.current?.ensureRows(first, last), []);
  const reload = useCallback(() => loaderRef.current?.reload(), []);
  const retryPages = useCallback(() => loaderRef.current?.retryPages(), []);

  useConsistencyCheck(state);

  return { state, ensureRows, reload, retryPages };
}

/**
 * Dev builds only: the Summary snapshot must say it covers the dates it was
 * asked for. A mismatch is a SERVER bug to report, so it is logged and never
 * patched over. (Money ties are the server's own AMOUNT_TIES check.)
 */
function useConsistencyCheck(state: LoaderState) {
  const reported = useRef(new Set<string>());
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const part = state.summary;
    if (!part) return;
    const { scope } = part.data;
    if (scope.fromDate === part.filters.fromDate && scope.toDate === part.filters.toDate) return;
    if (reported.current.has(part.key)) return;
    reported.current.add(part.key);
    console.error("[day-summary] summary.scope does not match the dates asked", {
      asked: { fromDate: part.filters.fromDate, toDate: part.filters.toDate },
      scope,
    });
  }, [state.summary]);
}
