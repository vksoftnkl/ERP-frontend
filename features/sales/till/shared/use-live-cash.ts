"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLiveCashReader } from "./api/live-cash-api";
import { liveCashByTss, readLiveCash, type LiveScope, type LiveSession } from "./live-cash";

export type LiveCash = {
  /** Every live session of the scope and its cash; `null` until the first read of the scope answers. */
  sessions: readonly LiveSession[] | null;
  /** tss_id → expected cash (paise), the sessions whose cash the server showed. */
  cashByTss: ReadonlyMap<string, number>;
  /** Read again, superseding any read on the wire. */
  refresh: () => void;
  /** Read again unless a read is already on the wire — Qt's `if (!m_live->loading()) m_live->refresh()`. */
  refreshUnlessLoading: () => void;
};

const NO_CASH: ReadonlyMap<string, number> = new Map();

/**
 * The live line's state (Qt `TillLiveCash::refresh / fetchCash / render`),
 * for the header company · branch. It does not read by itself: the screen
 * asks on each load of its own list (Qt connects `dataLoaded`), so the
 * figures move with the list.
 *
 * Each read has a generation. An answer for a read since superseded — a
 * newer refresh, or the header moving to another branch — is dropped, so a
 * slow read of the old branch can never land on the new one.
 */
export function useLiveCash({ companyId, branchId }: LiveScope): LiveCash {
  const client = useLiveCashReader();
  const [sessions, setSessions] = useState<readonly LiveSession[] | null>(null);
  const scope = useRef<LiveScope>({ companyId, branchId });
  const generation = useRef(0);
  const loading = useRef(false);

  // Another branch: forget the old one's drawers while rendering (React's
  // "adjust state on a prop change"), and disown its read before the browser
  // can deliver it (a layout effect).
  const scopeKey = `${companyId}|${branchId}`;
  const [shownScope, setShownScope] = useState(scopeKey);
  if (shownScope !== scopeKey) {
    setShownScope(scopeKey);
    setSessions(null);
  }
  useLayoutEffect(() => {
    scope.current = { companyId, branchId };
    generation.current += 1;
    loading.current = false;
  }, [companyId, branchId]);

  const refresh = useCallback(() => {
    const asked = scope.current;
    const mine = ++generation.current;
    if (!asked.companyId || !asked.branchId) {
      loading.current = false;
      setSessions(null);
      return;
    }
    loading.current = true;
    const isCurrent = () => mine === generation.current;
    readLiveCash(client, asked, isCurrent)
      .then((found) => {
        if (found === null || !isCurrent()) return;
        setSessions(found);
      })
      .catch(() => undefined)
      .finally(() => {
        if (isCurrent()) loading.current = false;
      });
  }, [client]);

  const refreshUnlessLoading = useCallback(() => {
    if (!loading.current) refresh();
  }, [refresh]);

  const cashByTss = useMemo(() => (sessions ? liveCashByTss(sessions) : NO_CASH), [sessions]);

  return { sessions, cashByTss, refresh, refreshUnlessLoading };
}
