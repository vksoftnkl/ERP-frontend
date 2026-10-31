"use client";
/**
 * The screen's loads — Qt's `m_*Seq` counters, as hooks.
 *
 * Every load starts a generation; the previous one's requests are aborted and
 * an answer from an older generation is dropped (aborting alone is not
 * enough: a response can already be in the parser). A failed load keeps what
 * is on screen, as Qt does, and reports through `onError`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { isAborted } from "@/features/reports/shared/api/abort";
import { fetchAllPages } from "./fetch-all";
import type { Query } from "./params";
import type { ListPage } from "../wire/types";

/** What an RTK mutation trigger hands back. */
export type Pending<R> = { unwrap: () => Promise<R>; abort: () => void };
export type Trigger<R> = (query: Query) => Pending<R>;

export type ListState<T, S> = {
  items: T[];
  total: number;
  summary: S | null;
  loading: boolean;
  loaded: boolean;
  failed: boolean;
  /** Bumped when a load's rows land, so the screen can place its cursor. */
  version: number;
};

function initialList<T, S>(): ListState<T, S> {
  return { items: [], total: 0, summary: null, loading: false, loaded: false, failed: false, version: 0 };
}

function useGenerations() {
  const gen = useRef(0);
  const inFlight = useRef<Array<{ abort: () => void }>>([]);
  const begin = useCallback(() => {
    gen.current += 1;
    for (const request of inFlight.current) request.abort();
    inFlight.current = [];
    return gen.current;
  }, []);
  const isCurrent = useCallback((g: number) => g === gen.current, []);
  const track = useCallback(<R,>(pending: Pending<R>) => {
    inFlight.current.push(pending);
    return pending;
  }, []);
  useEffect(
    () => () => {
      gen.current += 1;
      for (const request of inFlight.current) request.abort();
      inFlight.current = [];
    },
    [],
  );
  return { begin, isCurrent, track };
}

/** A paged list route, walked to the end (≤ 20,000 rows). */
export function usePagedList<T, S>(trigger: Trigger<ListPage<T, S>>, onError: (error: unknown) => void) {
  const [state, setState] = useState<ListState<T, S>>(initialList);
  const { begin, isCurrent, track } = useGenerations();
  const errorRef = useRef(onError);
  useEffect(() => {
    errorRef.current = onError;
  });

  const load = useCallback(
    (query: Query) => {
      const g = begin();
      setState((s) => ({ ...s, loading: true, failed: false }));
      fetchAllPages<T, S>(
        (page, limit) => track(trigger({ ...query, page: String(page), limit: String(limit) })).unwrap(),
        { stillWanted: () => isCurrent(g) },
      )
        .then((all) => {
          if (!isCurrent(g)) return;
          setState((s) => ({
            items: all.items,
            total: all.total,
            summary: all.summary,
            loading: false,
            loaded: true,
            failed: false,
            version: s.version + 1,
          }));
        })
        .catch((error: unknown) => {
          if (!isCurrent(g) || isAborted(error)) return;
          setState((s) => ({ ...s, loading: false, failed: true }));
          errorRef.current(error);
        });
    },
    [begin, isCurrent, track, trigger],
  );

  return { state, load };
}

export type OneState<R> = { data: R | null; loading: boolean; version: number };

/** A single read. `clear()` forgets the answer and drops a load in flight. */
export function useOneShot<R>(trigger: Trigger<R>, onError: (error: unknown) => void) {
  const [state, setState] = useState<OneState<R>>({ data: null, loading: false, version: 0 });
  const { begin, isCurrent, track } = useGenerations();
  const errorRef = useRef(onError);
  useEffect(() => {
    errorRef.current = onError;
  });

  const load = useCallback(
    (query: Query) => {
      const g = begin();
      setState((s) => ({ ...s, loading: true }));
      track(trigger(query))
        .unwrap()
        .then((data) => {
          if (!isCurrent(g)) return;
          setState((s) => ({ data, loading: false, version: s.version + 1 }));
        })
        .catch((error: unknown) => {
          if (!isCurrent(g) || isAborted(error)) return;
          setState((s) => ({ ...s, loading: false }));
          errorRef.current(error);
        });
    },
    [begin, isCurrent, track, trigger],
  );

  const clear = useCallback(() => {
    begin();
    setState((s) => ({ data: null, loading: false, version: s.version + 1 }));
  }, [begin]);

  return { state, load, clear };
}
