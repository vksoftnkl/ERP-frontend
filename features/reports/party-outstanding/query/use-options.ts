"use client";
/**
 * `/options` for the filter combos, per company and side (plan §6.2). Fetched
 * on mount and whenever the DRAFT side changes, so the combos follow the Side
 * combo before Show. Cached for the visit: the lists are masters, and a stale
 * one costs a re-open, not a wrong figure.
 */
import { useEffect, useState } from "react";
import { isAborted } from "@/features/reports/shared/api/abort";
import type { PartyOutstandingClient } from "../api/party-outstanding";
import { toOutstandingError } from "../wire/errors";
import type { OptionsPayload, OutstandingSide } from "../wire/types";

type Entry = { key: string; data: OptionsPayload | null; error: string | null };

export function useOptions(client: PartyOutstandingClient, companyId: string, side: OutstandingSide) {
  const key = `${companyId}|${side}`;
  const [cache, setCache] = useState<Record<string, Entry>>({});

  useEffect(() => {
    if (!companyId || cache[key]?.data) return;
    const controller = new AbortController();
    client
      .getOptions({ companyId, side }, controller.signal)
      .then((data) => setCache((c) => ({ ...c, [key]: { key, data, error: null } })))
      .catch((error: unknown) => {
        if (isAborted(error, controller.signal)) return;
        setCache((c) => ({ ...c, [key]: { key, data: null, error: toOutstandingError(error).message } }));
      });
    return () => controller.abort();
    // `cache` is read, not watched: a fetched entry must not refetch itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, companyId, key, side]);

  const entry = cache[key];
  return { options: entry?.data ?? null, error: entry?.error ?? null, loading: !entry };
}
