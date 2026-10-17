"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useTillSessionClient } from "../shared/api/till-session-api";
import type { InboxScope } from "./approval-inbox";

export type ApprovalCount = {
  /** How many wait at the scope; `null` until read, or when the read failed (Qt's -1). */
  count: number | null;
  /** Read again, superseding any read on the wire. */
  refresh: () => void;
  /** Read again unless a read is already on the wire (the list's own reload asks every page). */
  refreshUnlessLoading: () => void;
};

/**
 * The "Waiting for approval (n)" caption's count (Qt
 * `TillApprovalInboxDialog::countWaiting`, 425fa80) for the header company ·
 * branch. Like the live line (`../shared/use-live-cash.ts`) it does not read
 * by itself: Till Sessions asks on each load of its list and when the inbox
 * closes. The read is the QUIET one — a query, so a list reload never
 * announces a data change that reloads the list again.
 *
 * Each read has a generation: an answer for a read since superseded — a newer
 * refresh, or the header moving to another branch — is dropped.
 */
export function useApprovalCount({ companyId, branchId }: InboxScope): ApprovalCount {
  const client = useTillSessionClient();
  const [count, setCount] = useState<number | null>(null);
  const scope = useRef<InboxScope>({ companyId, branchId });
  const generation = useRef(0);
  const loading = useRef(false);

  // Another branch: forget the old one's count while rendering, and disown
  // its read before the browser can deliver it (a layout effect).
  const scopeKey = `${companyId}|${branchId}`;
  const [shownScope, setShownScope] = useState(scopeKey);
  if (shownScope !== scopeKey) {
    setShownScope(scopeKey);
    setCount(null);
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
      return;
    }
    loading.current = true;
    const isCurrent = () => mine === generation.current;
    client
      .approvalPendingQuiet(asked)
      .then((payload) => {
        if (isCurrent()) setCount(payload.items.length);
      })
      .catch(() => {
        if (isCurrent()) setCount(null);
      })
      .finally(() => {
        if (isCurrent()) loading.current = false;
      });
  }, [client]);

  const refreshUnlessLoading = useCallback(() => {
    if (!loading.current) refresh();
  }, [refresh]);

  return { count, refresh, refreshUnlessLoading };
}
