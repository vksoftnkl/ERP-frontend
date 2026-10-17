"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useGridId } from "@/lib/configured-grids";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/notify";
import { useLiveCash } from "../shared/use-live-cash";
import { useBusinessDayClient } from "./api/business-day-api";
import { isTodaysDay, type CashBooks, type SafeBook } from "./domain/books";
import { CLOSE_CONFIRM_NOTE, closeQuestion, closedText, isCloseBlocked } from "./domain/day-close";
import type { RowsState } from "./domain/day-reading";
import {
  businessDateAt,
  dayKeyOf,
  dayQuery,
  daysGridParams,
  errorStatus,
  firstErrorOf,
  isoDateOfLocal,
  safesGridParams,
  sessionGridParams,
  tillDayErrorText,
  type GridRow,
  type TillCloseCheck,
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

/**
 * The server's close-check of one day (Qt `m_closeCheck` / `m_closeCheckError`):
 * `check` null = not read — yet, or `error` says why not.
 */
export type CloseCheckState = { tbdId: string; check: TillCloseCheck | null; error: string };

/**
 * What the books say now (Qt 425fa80 `m_cashBooks` / `m_safeBooks`, notes
 * 126): the branch's, not one day's — `null` = not read (yet, or the read
 * failed and nothing was held).
 */
export type BooksState = { cash: CashBooks | null; safes: readonly SafeBook[] | null };

type Options = {
  companyId: string;
  branchId: string;
  /** The effective `till.day_cutoff`, for the "not opened" title's date. */
  cutoff: string | null;
  /** A day the URL names (back from a cockpit); read once per scope. */
  initialPick: DayPick;
  canCreate: boolean;
  /** Business Day (274) EDIT: Close day, Close with exception, Reopen day. */
  canEdit: boolean;
};

type Load = { quiet?: boolean };

const EMPTY_ROWS: readonly GridRow[] = [];
const LOADING: RowsState = { status: "loading", rows: EMPTY_ROWS };
const NO_CHECK: CloseCheckState = { tbdId: "", check: null, error: "" };
const NO_BOOKS: BooksState = { cash: null, safes: null };

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
 *
 * The server's close-check (Qt c77f3f1 `fetchCloseCheck`, notes 117) is read
 * each time a day is shown — after Day Open, a close, a reopen, and on the way
 * back from a cockpit (the screen remounts) — and an answer for a day no
 * longer shown is dropped. A failure is not a popup: the screen falls back to
 * its own reading and says why on a grey row.
 *
 * The books (Qt 425fa80 `fetchBooks`, notes 126) are read with it, each time a
 * day is shown: the safes' ledgers against their safe books, and — on today's
 * day only — the CASH tender's ledger as on today. They are the branch's, so
 * a figure held stays until a newer answer replaces it, and a failed read
 * leaves the row out, as Qt does.
 */
export function useBusinessDay({ companyId, branchId, cutoff, initialPick, canCreate, canEdit }: Options) {
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
  const [closeCheck, setCloseCheck] = useState<CloseCheckState>(NO_CHECK);
  const [closing, setClosing] = useState(false);
  const [books, setBooks] = useState<BooksState>(NO_BOOKS);

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
    closeCheck,
    closing,
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
      closeCheck,
      closing,
    };
  });

  const gens = useRef({ day: 0, sessions: 0, safes: 0, days: 0, closeCheck: 0, safeBooks: 0, cashBooks: 0 });
  /**
   * The day on screen, set the moment it is put there (`latest` only follows
   * a render later): what a close-check answer is matched against.
   */
  const shownTbdId = useRef("");

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

  /**
   * The server's close-check of `day` (Qt `fetchCloseCheck`). An answer for a
   * day no longer shown is dropped; a failure falls back to the screen's own
   * reading and says why — unless it was a quiet read and a check of this day
   * is already on screen, which then stays.
   */
  const fetchCloseCheck = useCallback(
    async (day: TillDay, { quiet }: Load = {}) => {
      const gen = ++gens.current.closeCheck;
      const { companyId: company, branchId: branch } = latest.current;
      try {
        const check = await client.closeCheck(dayKeyOf(day, { companyId: company, branchId: branch }));
        if (gen !== gens.current.closeCheck || shownTbdId.current !== day.tbdId) return;
        // An answer for a day no longer shown (or another day's) is not this day's check.
        if (check.tbdId !== day.tbdId) return;
        setCloseCheck({ tbdId: day.tbdId, check, error: "" });
      } catch (error) {
        if (gen !== gens.current.closeCheck || shownTbdId.current !== day.tbdId) return;
        const held = latest.current.closeCheck;
        if (quiet && held.tbdId === day.tbdId && held.check) return;
        setCloseCheck({
          tbdId: day.tbdId,
          check: null,
          error: firstErrorOf(error, "the server did not answer").message,
        });
      }
    },
    [client],
  );

  /**
   * Books = drawers / safe (Qt `fetchBooks`): `/till/safes/balance`, and on
   * today's day the CASH tender's ledger as on today, on the day's own year —
   * the year today falls in (Qt takes the login's year, which may be another
   * one being looked at). Errors are swallowed, as Qt swallows them.
   */
  const fetchBooks = useCallback(
    async (day: TillDay) => {
      const { companyId: company, branchId: branch } = latest.current;
      const safesGen = ++gens.current.safeBooks;
      const reads: Promise<void>[] = [
        client
          .safeBooks({ companyId: company, branchId: branch })
          .then((safes) => {
            if (safesGen === gens.current.safeBooks) setBooks((current) => ({ ...current, safes }));
          })
          .catch(() => undefined),
      ];
      const now = new Date();
      if (isTodaysDay(day, now)) {
        const cashGen = ++gens.current.cashBooks;
        reads.push(
          client
            .cashBooks({ companyId: company, branchId: branch, accYear: day.tbdAccYear, asOn: isoDateOfLocal(now) })
            .then((cash) => {
              if (cashGen === gens.current.cashBooks) setBooks((current) => ({ ...current, cash }));
            })
            .catch(() => undefined),
        );
      }
      await Promise.all(reads);
    },
    [client],
  );

  /** Put a day on screen, read its sessions, its close-check and the books. */
  const showDay = useCallback(
    (day: TillDay, picked: DayPick, load: Load = {}) => {
      shownTbdId.current = day.tbdId;
      setDayState({ kind: "day", day });
      setPick(picked);
      // Another day: its own check (Qt clears it; this day's stays until the new answer).
      setCloseCheck((current) => (current.tbdId === day.tbdId ? current : { ...NO_CHECK, tbdId: day.tbdId }));
      void loadSessions(day.tbdBusinessDate, load);
      void fetchCloseCheck(day, load);
      void fetchBooks(day);
    },
    [fetchBooks, fetchCloseCheck, loadSessions],
  );

  /** No day on screen: no check either, and any answer still on the wire is disowned. */
  const forgetDay = useCallback(() => {
    shownTbdId.current = "";
    gens.current.closeCheck += 1;
    setCloseCheck(NO_CHECK);
  }, []);

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
              forgetDay();
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
            if (shown === "loading") {
              forgetDay();
              setDayState({ kind: "unknown" });
            }
            return;
          }
        }
      } finally {
        if (gen === gens.current.day) setDayBusy(false);
      }
    },
    [client, forgetDay, loadSessions, showDay],
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

  /**
   * The day on screen again, and the List — after a close, a close with
   * exception or a reopen (Qt `loadDay(tbdId, accYear)` + `m_days->reload()`).
   * The same pick: today stays "today" in the URL.
   */
  const reloadShown = useCallback(() => {
    const state = latest.current;
    if (!state.companyId || !state.branchId) return;
    void fetchDay(state.pick);
    void loadDays();
  }, [fetchDay, loadDays]);

  /**
   * F10 Close day (Qt `closeDay`), after the question. The answer's store Z is
   * `zNo`, else the day's `tbdZNo` (`parseCloseResult`). Every refusal is the
   * popup in plain words (Qt bec3f98 `ApiClient::handleError`); one because
   * something turned red since the check (TILL_DAY_CLOSE_BLOCKED, any 409)
   * also reads the check again.
   */
  const closeDay = useCallback(async () => {
    const state = latest.current;
    if (!canEdit || state.closing || state.dayState.kind !== "day") return;
    const day = state.dayState.day;
    const yes = await confirm({
      title: "Close day",
      message: closeQuestion(day),
      note: CLOSE_CONFIRM_NOTE,
      confirmLabel: "Close day",
    });
    if (!yes || latest.current.closing) return;
    setClosing(true);
    try {
      const result = await client.closeDay(
        dayKeyOf(day, { companyId: latest.current.companyId, branchId: latest.current.branchId }),
      );
      toast.success(closedText(day, result.zNo), { autoClose: false });
      reloadShown();
    } catch (error) {
      toast.apiError(error, { fallback: "The business day could not be closed." });
      // Something changed since the check: read it again.
      if (isCloseBlocked(firstErrorOf(error, "")) && shownTbdId.current === day.tbdId) void fetchCloseCheck(day);
    } finally {
      setClosing(false);
    }
  }, [canEdit, client, fetchCloseCheck, reloadShown]);

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
    setCloseCheck(NO_CHECK);
    setBooks(NO_BOOKS);
  }
  useLayoutEffect(() => {
    gens.current.day += 1;
    gens.current.sessions += 1;
    gens.current.safes += 1;
    gens.current.days += 1;
    gens.current.closeCheck += 1;
    gens.current.safeBooks += 1;
    gens.current.cashBooks += 1;
    shownTbdId.current = "";
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
    closeCheck,
    closing,
    books,
    scopeReady,
    loadToday,
    loadDay,
    refresh,
    retrySessions,
    revalidate,
    openDay,
    closeDay,
    reloadShown,
    reloadDays: loadDays,
  };
}

export type BusinessDayModel = ReturnType<typeof useBusinessDay>;
