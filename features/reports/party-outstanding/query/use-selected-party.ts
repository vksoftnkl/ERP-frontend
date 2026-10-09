"use client";
/** `SelectedPartyLoader` as a hook: the focused party's card + bills. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { PartyOutstandingClient } from "../api/party-outstanding";
import type { ReportFilters, Session } from "./params";
import { INITIAL_SELECTED, SelectedPartyLoader, type SelectedState } from "./selected-party-loader";

export function useSelectedParty(
  client: PartyOutstandingClient,
  session: Session,
  filters: ReportFilters,
  partyId: string | null,
) {
  const [state, setState] = useState<SelectedState>(INITIAL_SELECTED);
  const loaderRef = useRef<SelectedPartyLoader | null>(null);

  useEffect(() => {
    const loader = new SelectedPartyLoader(client, setState);
    loaderRef.current = loader;
    return () => {
      loader.dispose();
      loaderRef.current = null;
    };
  }, [client]);

  // The company alone scopes the request; the session's year and branch only seed defaults.
  const requestKey = JSON.stringify([session.companyId, filters, partyId]);
  useEffect(() => {
    const [companyId, f, p] = JSON.parse(requestKey) as [string, ReportFilters, string | null];
    const scope: Session = { companyId, branchId: null, yearBegin: null, yearEnd: null };
    loaderRef.current?.select({ session: scope, filters: f, partyId: p });
  }, [requestKey, client]);

  const reload = useCallback(() => loaderRef.current?.reload(), []);
  return { state, reload };
}
