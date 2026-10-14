"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useGridId } from "@/lib/configured-grids";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/notify";
import { useLiveCash } from "../shared/use-live-cash";
import { useBusinessDayClient } from "./api/business-day-api";
import type { RowsState } from "./domain/day-reading";
import {
  businessDateAt,
  dayQuery,
  daysGridParams,
  errorStatus,
  isoDateOfLocal,
  safesGridParams,
  sessionGridParams,
  tillDayErrorText,
  type GridRow,
  type TillDay,
} from "./domain/wire";

/** Which day the screen is looking at: `null` is TODAY's business day. */
export type DayPick = { tbdId: string; accYear: string } | null;

export type DayState =
  /** The first read of this scope is on the wire. */
  | { kind: "loading" }
  /** Nobody has opened today yet (`/till/days/get` answered 404). */
  | { kind: "none"; businessDate: string }
  | { kind: "day"; day: TillDay }
  /** The read failed and there is nothing to show (the message has been raised). */
  | { kind: "unknown" };

type Options = {
  companyId: string;
  branchId: string;
  /** The effective `till.day_cutoff`, for the "not opened" title's date. */
  cutoff: string | null;
  /** A day the URL names (back from a cockpit); read once per scope. */
  initialPick: DayPick;
  canCreate: boolean;
};

type Load = { quiet?: boolean };

const EMPTY_ROWS: readonly GridRow[] = [];
const LOADING: RowsState = { status: "loading", rows: EMPTY_ROWS };

/**
 * The state behind the Business Day screen — the Qt `fetchDay / showDay /
 * showNoDay / loadSafes / openDay` — over three requests and three grids.
 *
 * Each resource has its own generation: an answer for a day, a session list or
 * a safe list that is no longer the one asked for is dropped, so F5 pressed
 * while a past day is loading cannot land that day on screen afterwards.
 *
 * A `quiet` load (the app's focus revalidation) keeps what is on screen until
 * the new rows arrive and says nothing when it fails; an asked-for load clears
 * and says.
 *
 * The live sessions (Qt a449b8c `TillLiveCash`: every drawer still out, any
 * date) are read again each time the day's sessions arrive — unless a read is
 * still on the wire — as Qt does on the sessions grid's `dataLoaded`.
 */
export function useBusinessDay({ companyId, branchId, cutoff, initialPick, canCreate }: Options) {
  const client = useBusinessDayClient();
  const { sessions: liveSessions, refreshUnlessLoading: refreshLive } = useLiveCash({ companyId, branchId });
  const sessionsGridId = useGridId("tillDaySessions");
  const daysGridId = useGridId("tillBusinessDayList");
  const safesGridId = useGridId("tillSafeList");

  const [dayState, setDayState] = useState<DayState>({ kind: "loading" });
  const [pick, setPick] = useState<DayPick>(null);
  const [sessions, setSessions] = useState<RowsState>(LOADING);
  const [safes, setSafes] = useState<RowsState>(LOADING);
  const [days, setDays] = useState<RowsState>(LOADING);
  const [dayBusy, setDayBusy] = useState(false);
  const [opening, setOpening] = useState(false);

  const scopeReady = Boolean(companyId && branchId);
  const latest = useRef({
    companyId,
    branchId,
    cutoff,
    sessionsGridId,
    daysGridId,
    safesGridId,
    dayState,
    pick,
    dayBusy,
    opening,
  });
  useLayoutEffect(() => {
    latest.current = {
      companyId,
      branchId,
      cutoff,
      sessionsGridId,
      daysGridId,
      safesGridId,
      dayState,
      pick,
      dayBusy,
      opening,
    };
  });

  const gens = useRef({ day: 0, sessions: 0, safes: 0, days: 0 });

  // The day the URL names (back from a cockpit) is read on the FIRST read of
  // the first scope only — kept in a ref, not consumed by the effect, so a
  // StrictMode double run still reads it — and forgotten the moment the
  // operator asks for another day or the header moves to another branch.
  const initialPickRef = useRef(initialPick);
  const pickScopeRef = useRef<string | null>(null);

  const loadSessions = useCallback(
    async (businessDate: string | null, { quiet }: Load = {}) => {
      const gen = ++gens.current.sessions;
      const { companyId: company, branchId: branch, sessionsGridId: gridId } = latest.current;
      if (!businessDate) {
        setSessions({ status: "ready", rows: EMPTY_ROWS });
        refreshLive();
        return;
      }
      if (!quiet) setSessions(LOADING);
      try {
        const rows = await client.gridRows(
          "tillDaySessions",
          gridId,
          sessionGridParams({ companyId: company, branchId: branch }, businessDate),
        );
        if (gen === gens.current.sessions) {
          setSessions({ status: "ready", rows });
          refreshLive();
        }
      } catch {
        if (gen !== gens.current.sessions || quiet) return;
        setSessions({ status: "error", rows: EMPTY_ROWS });
      }
    },
    [client, refreshLive],
  );

  const loadSafes = useCallback(
    async ({ quiet }: Load = {}) => {
      const gen = ++gens.current.safes;
      const { companyId: company, branchId: branch, safesGridId: gridId } = latest.current;
      if (!quiet) setSafes(LOADING);
      try {
        const rows = await client.gridRows(
          "tillSafeList",
          gridId,
          safesGridParams({ companyId: company, branchId: branch }),
        );
        if (gen === gens.current.safes) setSafes({ status: "ready", rows });
      } catch {
        // Qt swallowed this; the remittance row says it instead of a false green.
        if (gen !== gens.current.safes || quiet) return;
        setSafes({ status: "error", rows: EMPTY_ROWS });
      }
    },
    [client],
  );

  const loadDays = useCallback(
    async ({ quiet }: Load = {}) => {
      const gen = ++gens.current.days;
      const { companyId: company, branchId: branch, daysGridId: gridId } = latest.current;
      if (!quiet) setDays((current) => ({ status: "loading", rows: current.rows }));
      try {
        const rows = await client.gridRows(
          "tillBusinessDayList",
          gridId,
          daysGridParams({ companyId: company, branchId: branch }, isoDateOfLocal(new Date())),
        );
        if (gen === gens.current.days) setDays({ status: "ready", rows });
      } catch {
        if (gen !== gens.current.days || quiet) return;
        setDays({ status: "error", rows: EMPTY_ROWS });
      }
    },
    [client],
  );

  /** Put a day on screen and read its sessions. */
  const showDay = useCallback(
    (day: TillDay, picked: DayPick, load: Load = {}) => {
      setDayState({ kind: "day", day });
      setPick(picked);
      void loadSessions(day.tbdBusinessDate, load);
    },
    [loadSessions],
  );

  const fetchDay = useCallback(
    async (picked: DayPick, { quiet }: Load = {}) => {
      const gen = ++gens.current.day;
      const { companyId: company, branchId: branch } = latest.current;
      if (!quiet) setDayBusy(true);
      let target = picked;
      try {
        for (;;) {
          try {
            const day = await client.getDay(dayQuery({ companyId: company, branchId: branch }, target));
            if (gen === gens.current.day) showDay(day, target, { quiet });
            return;
          } catch (error) {
            if (gen !== gens.current.day) return;
            if (!target && errorStatus(error) === 404) {
              // Nobody has opened today yet.
              setDayState({ kind: "none", businessDate: businessDateAt(new Date(), latest.current.cutoff) });
              setPick(null);
              void loadSessions(null);
              return;
            }
            if (quiet) return;
            toast.error(tillDayErrorText(error, "The business day could not be read."));
            const shown = latest.current.dayState.kind;
            if (target && (shown === "loading" || shown === "unknown")) {
              // A day the URL named is gone (another branch, deleted): today instead.
              initialPickRef.current = null;
              target = null;
              continue;
            }
            if (shown === "loading") setDayState({ kind: "unknown" });
            return;
          }
        }
      } finally {
        if (gen === gens.current.day) setDayBusy(false);
      }
    },
    [client, loadSessions, showDay],
  );

  /** Today's business day (Qt `loadToday`). */
  const loadToday = useCallback(() => {
    initialPickRef.current = null;
    return fetchDay(null);
  }, [fetchDay]);

  /** A day from the List tab (Qt `loadDay`). */
  const loadDay = useCallback(
    (picked: { tbdId: string; accYear: string }) => {
      initialPickRef.current = null;
      return fetchDay(picked);
    },
    [fetchDay],
  );

  /** F5 "Refresh checks" — always TODAY, as Qt: a past day is a look from the List tab. */
  const refresh = useCallback(() => {
    if (!latest.current.companyId || !latest.current.branchId) return;
    initialPickRef.current = null;
    void fetchDay(null);
    void loadDays();
    // Qt read the safes once, at open; a refresh that leaves the remittance
    // row on stale balances would not be a refresh.
    void loadSafes();
  }, [fetchDay, loadDays, loadSafes]);

  /** The sessions grid's "Try again": the shown day's sessions, not today's. */
  const retrySessions = useCallback(() => {
    const shown = latest.current.dayState;
    if (shown.kind === "day") void loadSessions(shown.day.tbdBusinessDate);
  }, [loadSessions]);

  /** The app's focus / save revalidation: the same day, quietly. */
  const revalidate = useCallback(() => {
    const state = latest.current;
    if (!state.companyId || !state.branchId) return;
    if (state.dayState.kind === "loading") return;
    // An asked-for read (F5, a day from the List) is on the wire: it is the
    // fresher answer, and a quiet one must not supersede it.
    if (!state.dayBusy && !state.opening) void fetchDay(state.pick, { quiet: true });
    void loadDays({ quiet: true });
    void loadSafes({ quiet: true });
  }, [fetchDay, loadDays, loadSafes]);

  /** Day Open (Qt `openDay`), after the same question. */
  const openDay = useCallback(async () => {
    const state = latest.current;
    if (!canCreate || opening || state.dayState.kind !== "none") return;
    const yes = await confirm({
      title: "Day Open",
      message: "Open today's business day for this branch? Sessions may then open on it.",
      confirmLabel: "Day Open",
    });
    if (!yes) return;
    initialPickRef.current = null;
    setOpening(true);
    // Whatever read was on the wire answers a question this one supersedes.
    const gen = ++gens.current.day;
    try {
      const day = await client.openDay({ companyId: state.companyId, branchId: state.branchId });
      if (gen !== gens.current.day) return;
      showDay(day, null);
      void loadDays();
    } catch (error) {
      toast.error(tillDayErrorText(error, "The business day could not be opened."));
    } finally {
      setOpening(false);
    }
  }, [canCreate, client, loadDays, opening, showDay]);

  // A scope (company · branch from the header) reads everything afresh. The
  // screen is cleared while rendering (React's "adjust state on a prop
  // change"), every answer still on the wire is disowned before the browser
  // can deliver one (a layout effect), and then the reads go out.
  const scopeKey = `${companyId}|${branchId}`;
  const [shownScope, setShownScope] = useState(scopeKey);
  if (shownScope !== scopeKey) {
    setShownScope(scopeKey);
    setDayState({ kind: "loading" });
    setPick(null);
    setSessions(LOADING);
    setSafes(LOADING);
    setDays(LOADING);
  }
  useLayoutEffect(() => {
    gens.current.day += 1;
    gens.current.sessions += 1;
    gens.current.safes += 1;
    gens.current.days += 1;
  }, [scopeKey]);
  useEffect(() => {
    if (!scopeReady) return;
    pickScopeRef.current ??= scopeKey;
    if (pickScopeRef.current !== scopeKey) initialPickRef.current = null;
    void fetchDay(initialPickRef.current);
    void loadSafes();
    void loadDays();
  }, [scopeKey, scopeReady, fetchDay, loadSafes, loadDays]);

  // Grid Master's directory can answer after the first runs went out on the
  // registry's fallback ids; where an id moved, the lists re-run on the real one.
  const gridIdsKey = `${sessionsGridId}|${daysGridId}|${safesGridId}`;
  const gridIdsRef = useRef(gridIdsKey);
  useEffect(() => {
    if (gridIdsRef.current === gridIdsKey) return;
    gridIdsRef.current = gridIdsKey;
    const state = latest.current;
    if (!state.companyId || !state.branchId) return;
    void loadSafes({ quiet: true });
    void loadDays({ quiet: true });
    if (state.dayState.kind === "day") void loadSessions(state.dayState.day.tbdBusinessDate, { quiet: true });
  }, [gridIdsKey, loadDays, loadSafes, loadSessions]);

  return {
    dayState,
    pick,
    sessions,
    liveSessions,
    safes,
    days,
    dayBusy,
    opening,
    scopeReady,
    loadToday,
    loadDay,
    refresh,
    retrySessions,
    revalidate,
    openDay,
    reloadDays: loadDays,
  };
}

export type BusinessDayModel = ReturnType<typeof useBusinessDay>;
