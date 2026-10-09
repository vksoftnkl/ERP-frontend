"use client";
/**
 * `OutstandingLoader` as a hook: one load per URL change (the focused party
 * excluded), pages on demand.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { PartyOutstandingClient } from "../api/party-outstanding";
import { INITIAL_STATE, loadKey, OutstandingLoader, type OutstandingState } from "./outstanding-loader";
import type { Filters, Session } from "./params";

export function useOutstanding(client: PartyOutstandingClient, session: Session, filters: Filters, enabled: boolean) {
  const [state, setState] = useState<OutstandingState>(INITIAL_STATE);
  const loaderRef = useRef<OutstandingLoader | null>(null);

  useEffect(() => {
    const loader = new OutstandingLoader(client, setState);
    loaderRef.current = loader;
    return () => {
      loader.dispose();
      loaderRef.current = null;
    };
  }, [client]);

  // One load per distinct request. Object identity changes on every render,
  // so the effect keys on the serialised request instead.
  const requestKey = enabled ? loadKey(session, filters) : "";
  useEffect(() => {
    if (!requestKey) return;
    const [companyId, f] = JSON.parse(requestKey) as [string, Filters];
    const scope: Session = { companyId, branchId: null, yearBegin: null, yearEnd: null };
    loaderRef.current?.load({ session: scope, filters: f });
  }, [requestKey, client]);

  const ensureParties = useCallback((first: number, last: number) => {
    loaderRef.current?.ensureRows("parties", first, last);
  }, []);
  const ensureBillWise = useCallback((first: number, last: number) => {
    loaderRef.current?.ensureRows("billWise", first, last);
  }, []);
  const reload = useCallback(() => loaderRef.current?.reload(), []);
  const retryPages = useCallback(() => loaderRef.current?.retryPages(), []);

  return { state, ensureParties, ensureBillWise, reload, retryPages };
}
