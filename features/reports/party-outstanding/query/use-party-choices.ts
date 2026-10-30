"use client";
/**
 * The Party combo's list, fetched when the combo is first opened (or focused)
 * rather than on every strip edit: each ask is a whole `/parties` run on the
 * server. Kept per filter set for the visit; a filter change makes the next
 * open ask again, and an error is retried on the next open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { isAborted } from "@/features/reports/shared/api/abort";
import type { PartyOutstandingClient } from "../api/party-outstanding";
import { toOutstandingError } from "../wire/errors";
import { loadPartyChoices, partyChoicesKey, type PartyChoice } from "./party-choices";
import type { ReportFilters, Session } from "./params";

type Entry = {
  key: string;
  choices: PartyChoice[] | null;
  truncated: boolean;
  error: string | null;
};

export function usePartyChoices(client: PartyOutstandingClient, session: Session, filters: ReportFilters) {
  const key = partyChoicesKey(session, filters);
  const [entry, setEntry] = useState<Entry | null>(null);
  const inFlight = useRef<{ key: string; controller: AbortController } | null>(null);
  const latest = useRef({ client, session, filters, key });
  useEffect(() => {
    latest.current = { client, session, filters, key };
  });

  useEffect(
    () => () => {
      inFlight.current?.controller.abort();
    },
    [],
  );

  const request = useCallback(() => {
    const { client: c, session: s, filters: f, key: k } = latest.current;
    if (!s.companyId) return;
    if (inFlight.current?.key === k) return;
    if (entry?.key === k && entry.choices) return;
    inFlight.current?.controller.abort();
    const controller = new AbortController();
    inFlight.current = { key: k, controller };
    setEntry({ key: k, choices: null, truncated: false, error: null });
    loadPartyChoices(c, s, f, controller.signal)
      .then(({ choices, truncated }) => setEntry({ key: k, choices, truncated, error: null }))
      .catch((error: unknown) => {
        if (isAborted(error, controller.signal)) return;
        setEntry({ key: k, choices: null, truncated: false, error: toOutstandingError(error).message });
      })
      .finally(() => {
        if (inFlight.current?.controller === controller) inFlight.current = null;
      });
  }, [entry]);

  const current = entry?.key === key ? entry : null;
  return {
    choices: current?.choices ?? null,
    truncated: current?.truncated ?? false,
    error: current?.error ?? null,
    loading: current !== null && current.choices === null && current.error === null,
    request,
  };
}
