"use client";

/**
 * Loading the report — Qt `refresh()` / `loadDays()` / `loadPage()`.
 *
 * One refresh = `/days` (the strip and the header counts) and `/list` page by
 * page, 500 at a time, up to 20 pages: a grouped-by-day report cannot show half
 * a day. Every refresh starts a GENERATION; a reply from an older one is
 * dropped (and its requests aborted), so a newer filter always wins.
 *
 * The previous rows stay on screen, dimmed, until the new ones are in.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/lib/notify";
import { useGetPriceLogDaysMutation, useListPriceLogMutation } from "../api/price-log-api";
import { isNoAccessError } from "../view/errors";
import { MAX_PAGES } from "../view/report";
import { PRICE_LOG_PAGE_LIMIT, type PriceLogDay, type PriceLogFilters, type PriceLogRow } from "../wire/types";

export type PriceLogReport = {
  rows: PriceLogRow[];
  /** `/days`; null until it answers (or when it failed — the grid counts for itself). */
  days: PriceLogDay[] | null;
  /** `/list`'s meta.total — more than rows.length when the range ran past 20 pages. */
  total: number;
  loading: boolean;
  /** At least one refresh has completed. */
  loaded: boolean;
  denied: boolean;
  /** The last refresh failed (the message was shown). */
  failed: boolean;
  /** Bumped when a refresh's rows land, so the screen can pick its first row. */
  version: number;
};

const INITIAL: PriceLogReport = {
  rows: [],
  days: null,
  total: 0,
  loading: false,
  loaded: false,
  denied: false,
  failed: false,
  version: 0,
};

type Abortable = { abort: () => void };

export function usePriceLogReport() {
  const [listPage] = useListPriceLogMutation();
  const [getDays] = useGetPriceLogDaysMutation();
  const [report, setReport] = useState<PriceLogReport>(INITIAL);
  const generation = useRef(0);
  const inFlight = useRef<Abortable[]>([]);

  const abortAll = useCallback(() => {
    for (const request of inFlight.current) {
      request.abort();
    }
    inFlight.current = [];
  }, []);

  useEffect(
    () => () => {
      generation.current += 1;
      abortAll();
    },
    [abortAll],
  );

  const refresh = useCallback(
    (filters: PriceLogFilters) => {
      generation.current += 1;
      const gen = generation.current;
      abortAll();
      const current = () => gen === generation.current;
      setReport((r) => ({ ...r, loading: true, failed: false, days: null }));

      const daysRequest = getDays(filters);
      inFlight.current.push(daysRequest);
      daysRequest
        .unwrap()
        .then((days) => {
          if (current()) setReport((r) => ({ ...r, days }));
        })
        .catch(() => {
          // The strip is a convenience: the grid still answers without it.
        });

      void (async () => {
        let rows: PriceLogRow[] = [];
        let total = 0;
        try {
          for (let page = 1; page <= MAX_PAGES; page += 1) {
            const request = listPage({ ...filters, page, limit: PRICE_LOG_PAGE_LIMIT });
            inFlight.current.push(request);
            const answer = await request.unwrap();
            if (!current()) return;
            rows = rows.concat(answer.items);
            total = answer.meta.total;
            if (rows.length >= total || answer.items.length === 0) break;
          }
        } catch (error) {
          if (!current()) return;
          const denied = isNoAccessError(error);
          if (!denied) {
            toast.apiError(error, { fallback: "The price change log could not be read." });
          }
          // As Qt: a refresh that failed shows nothing rather than the last range's rows.
          setReport((r) => ({ ...r, rows: [], total: 0, loading: false, failed: true, denied: r.denied || denied }));
          return;
        }
        if (!current()) return;
        inFlight.current = [];
        setReport((r) => ({
          ...r,
          rows,
          total,
          loading: false,
          loaded: true,
          failed: false,
          version: r.version + 1,
        }));
      })();
    },
    [abortAll, getDays, listPage],
  );

  return { report, refresh };
}
