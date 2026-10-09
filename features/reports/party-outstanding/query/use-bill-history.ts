"use client";
/**
 * What settled a bill, for the Alt+F1 popover (plan §9.3). Fetched on first
 * use and cached for the visit, keyed by bill AND As on, because `effective`
 * depends on the date asked.
 */
import { useCallback, useRef, useState } from "react";
import { isAborted } from "@/features/reports/shared/api/abort";
import type { PartyOutstandingClient } from "../api/party-outstanding";
import { toOutstandingError } from "../wire/errors";
import type { BillHistoryPayload } from "../wire/types";
import { billHistoryQuery, type Session } from "./params";

export type HistoryState =
  | { status: "loading" }
  | { status: "ready"; data: BillHistoryPayload }
  | { status: "error"; message: string };

type BillRef = { billId: string; accYear: string };

export function useBillHistory(client: PartyOutstandingClient, session: Session, asOn: string) {
  const cache = useRef(new Map<string, HistoryState>());
  const [version, setVersion] = useState(0);

  const keyOf = useCallback(
    (bill: BillRef) => `${session.companyId}|${bill.accYear}|${bill.billId}|${asOn}`,
    [asOn, session.companyId],
  );

  const historyOf = useCallback(
    (bill: BillRef): HistoryState | undefined => cache.current.get(keyOf(bill)),
    // `version` is what makes a fetched result visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keyOf, version],
  );

  const request = useCallback(
    (bill: BillRef) => {
      if (!session.companyId) return;
      const key = keyOf(bill);
      const held = cache.current.get(key);
      if (held && held.status !== "error") return;
      cache.current.set(key, { status: "loading" });
      setVersion((v) => v + 1);
      client
        .getBillHistory(billHistoryQuery(session, bill, asOn))
        .then((data) => cache.current.set(key, { status: "ready", data }))
        .catch((error: unknown) => {
          if (isAborted(error)) cache.current.delete(key);
          else cache.current.set(key, { status: "error", message: toOutstandingError(error, { asOn }).message });
        })
        .finally(() => setVersion((v) => v + 1));
    },
    [asOn, client, keyOf, session],
  );

  return { historyOf, request };
}
