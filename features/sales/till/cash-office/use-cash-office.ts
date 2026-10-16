"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { ApiRefusal } from "@/lib/api/error-text";
import { useGridId } from "@/lib/configured-grids";
import { toast } from "@/lib/notify";
import { useTillSessionClient } from "../shared/api/till-session-api";
import { toDenominations, type Denomination } from "../shared/denom";
import { tillErrorOf } from "../shared/errors";
import { todayIso } from "../shared/format";
import { reasonGridParams, toReasons, type TillReason } from "../shared/reasons";
import type { GridRow, TillSafeBalance } from "../shared/wire/types";
import {
  listedSafes,
  newestFirst,
  pickSafeId,
  remittanceGridParams,
  safeBookGridParams,
  safeById,
  type CashOfficeScope,
} from "./cash-office";

/** A grid's rows on screen: `loading` while the read asked for is out, `error` when it failed. */
export type RowsState = { rows: readonly GridRow[]; loading: boolean; error: string };

/** The safe book's row key, added here (grid 158 has no id column). */
export const BOOK_ROW_KEY = "cash_office_row";

const NO_ROWS: readonly GridRow[] = [];

/** One grid's last answer, by the request it answered (`key`) and what it was read for (`of`). */
type GridAnswer = { key: string; of: string; rows: readonly GridRow[]; error: string };

const NO_ANSWER: GridAnswer = { key: "", of: "", rows: NO_ROWS, error: "" };

/**
 * The state behind the Cash Office — the Qt `reload / showBalance / showSafe /
 * loadReasons` — over one route and three grids:
 *
 *   GET /till/safes/balance     the safes and the CIT remittances in transit
 *   grid 157 TILL REMITTANCES   the branch's remittances of the last 90 days
 *   grid 158 TILL SAFE BOOK     the picked safe's book since its last count
 *   grid 134 TILL REASONS       every reason (the void and decide popups pick theirs)
 *   /till/denominations/list    the notes and coins of the count
 *
 * One scope (company · branch) per mount: the screen is keyed by it, so a
 * header change remounts it and nothing of the old branch survives.
 *
 * Each read is asked for by a key — what it reads, plus a tick F5 bumps — and
 * goes out from an effect on that key; "loading" is simply "the last answer is
 * for another key", and an answer for a key since moved (F5 twice, another
 * status, another safe) is dropped by the effect's cleanup. The book follows
 * the picked safe (Qt `showSafe`); a balance read keeps the safe picked while
 * it is still listed, else takes the default one.
 *
 * A quiet read (the app's focus revalidation) answers under the current key,
 * keeps what is on screen and says nothing when it fails.
 */
export function useCashOffice({ companyId, branchId }: CashOfficeScope) {
  const client = useTillSessionClient();
  const scope = useMemo(() => ({ companyId, branchId }), [companyId, branchId]);
  // Grid Master's directory can answer after the first runs went out on the
  // registry's fallback ids: a moved id is another key, so its grid re-runs.
  const remitsGridId = useGridId("tillRemittances");
  const bookGridId = useGridId("tillSafeBook");

  const [ticks, setTicks] = useState({ balance: 0, remits: 0, book: 0 });
  const [balance, setBalance] = useState<TillSafeBalance | null>(null);
  const [balanceDone, setBalanceDone] = useState(-1);
  /** The last asked-for balance read failed (Qt `lblError`); cleared by the next answer. */
  const [balanceError, setBalanceError] = useState<ApiRefusal | null>(null);
  const [safeId, setSafeId] = useState("");
  const [reasons, setReasons] = useState<TillReason[]>([]);
  const [denominations, setDenominations] = useState<Denomination[]>([]);
  const [denomsLoading, setDenomsLoading] = useState(true);
  const [remitStatus, setRemitStatus] = useState("");
  const [remitsAnswer, setRemitsAnswer] = useState<GridAnswer>(NO_ANSWER);
  const [bookAnswer, setBookAnswer] = useState<GridAnswer>(NO_ANSWER);

  const remitsKey = `${remitStatus}|${remitsGridId}|${ticks.remits}`;
  const bookKey = `${safeId}|${bookGridId}|${ticks.book}`;
  const balanceLoading = balanceDone !== ticks.balance;

  /** The keys now asked for: a quiet answer lands only while its key still is. */
  const current = useRef({ balanceTick: ticks.balance, remitsKey, bookKey });
  useLayoutEffect(() => {
    current.current = { balanceTick: ticks.balance, remitsKey, bookKey };
  });

  // ── The reads: data only; who shows the answer decides ────────────────
  const readRemits = useCallback(
    async (status: string) =>
      newestFirst(
        await client.gridRows("tillRemittances", remittanceGridParams(scope, todayIso(), status)),
        "tcm_created_on",
      ),
    [client, scope],
  );

  const readBook = useCallback(
    async (id: string) =>
      // No id column: a movement and its void are two rows of one document, so a row's place is its key.
      newestFirst(await client.gridRows("tillSafeBook", safeBookGridParams(scope, id)), "sb_at").map((row, index) => ({
        ...row,
        [BOOK_ROW_KEY]: String(index),
      })),
    [client, scope],
  );

  const showBalance = useCallback((data: TillSafeBalance) => {
    setBalance(data);
    setBalanceError(null);
    setSafeId((picked) => pickSafeId(listedSafes(data), picked));
  }, []);

  // ── Once per mount: the reasons (every one, inactive too — Qt `iinactive`
  //    true) and the denominations ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    client
      .gridRows("tillReasonList", reasonGridParams(scope.companyId, true))
      .then((rows) => {
        if (!cancelled) setReasons(toReasons(rows));
      })
      .catch(() => undefined);
    client
      .denominations(scope.companyId)
      .then((rows) => {
        if (!cancelled) setDenominations(toDenominations(rows));
      })
      .catch((failure) => {
        if (!cancelled) toast.apiError(failure, { fallback: "The denominations could not be read." });
      })
      .finally(() => {
        if (!cancelled) setDenomsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, scope.companyId]);

  // ── Each read goes out when its key moves: the first mount, F5, the
  //    status filter, the safe picked, a grid id the directory moved ────
  useEffect(() => {
    let cancelled = false;
    const tick = ticks.balance;
    client
      .safeBalance(scope)
      .then((data) => {
        if (!cancelled) showBalance(data);
      })
      .catch((error) => {
        if (!cancelled) setBalanceError(tillErrorOf(error, "The safe could not be read.").refusal);
      })
      .finally(() => {
        if (!cancelled) setBalanceDone(tick);
      });
    return () => {
      cancelled = true;
    };
  }, [client, scope, showBalance, ticks.balance]);

  useEffect(() => {
    let cancelled = false;
    const key = remitsKey;
    const status = remitStatus;
    readRemits(status)
      .then((rows) => {
        if (!cancelled) setRemitsAnswer({ key, of: status, rows, error: "" });
      })
      .catch((error) => {
        if (cancelled) return;
        setRemitsAnswer({ key, of: status, rows: NO_ROWS, error: tillErrorOf(error, "The remittances could not be read.").text });
      });
    return () => {
      cancelled = true;
    };
  }, [readRemits, remitStatus, remitsKey]);

  useEffect(() => {
    if (!safeId) return;
    let cancelled = false;
    const key = bookKey;
    const id = safeId;
    readBook(id)
      .then((rows) => {
        if (!cancelled) setBookAnswer({ key, of: id, rows, error: "" });
      })
      .catch((error) => {
        if (cancelled) return;
        setBookAnswer({ key, of: id, rows: NO_ROWS, error: tillErrorOf(error, "The safe book could not be read.").text });
      });
    return () => {
      cancelled = true;
    };
  }, [bookKey, readBook, safeId]);

  /** F5 (Qt `reload`): the balance, the book and the remittances. */
  const reload = useCallback(() => {
    setTicks((now) => ({ balance: now.balance + 1, remits: now.remits + 1, book: now.book + 1 }));
  }, []);

  /**
   * The app's focus revalidation: the same reads under the same keys, quietly.
   * A read still on the wire for its key is the fresher answer and is left alone.
   */
  const revalidate = useCallback(() => {
    if (!balanceLoading) {
      const tick = ticks.balance;
      client
        .safeBalance(scope)
        .then((data) => {
          if (current.current.balanceTick === tick) showBalance(data);
        })
        .catch(() => undefined);
    }
    if (remitsAnswer.key === remitsKey) {
      const key = remitsKey;
      const status = remitStatus;
      readRemits(status)
        .then((rows) => {
          if (current.current.remitsKey === key) setRemitsAnswer({ key, of: status, rows, error: "" });
        })
        .catch(() => undefined);
    }
    if (safeId && bookAnswer.key === bookKey) {
      const key = bookKey;
      const id = safeId;
      readBook(id)
        .then((rows) => {
          if (current.current.bookKey === key) setBookAnswer({ key, of: id, rows, error: "" });
        })
        .catch(() => undefined);
    }
  }, [
    balanceLoading,
    bookAnswer.key,
    bookKey,
    client,
    readBook,
    readRemits,
    remitStatus,
    remitsAnswer.key,
    remitsKey,
    safeId,
    scope,
    showBalance,
    ticks.balance,
  ]);

  const safes = useMemo(() => listedSafes(balance), [balance]);
  const safe = safeById(safes, safeId);

  // Rows read for another status or another safe are not shown while the new ones come.
  const remits: RowsState = {
    rows: remitsAnswer.of === remitStatus ? remitsAnswer.rows : NO_ROWS,
    loading: remitsAnswer.key !== remitsKey,
    error: remitsAnswer.key === remitsKey ? remitsAnswer.error : "",
  };
  const book: RowsState = safeId
    ? {
        rows: bookAnswer.of === safeId ? bookAnswer.rows : NO_ROWS,
        loading: bookAnswer.key !== bookKey,
        error: bookAnswer.key === bookKey ? bookAnswer.error : "",
      }
    : { rows: NO_ROWS, loading: false, error: "" };

  return {
    balance,
    balanceLoading,
    balanceError,
    safes,
    safe,
    safeId,
    setSafeId,
    reasons,
    denominations,
    denomsLoading,
    remitStatus,
    setRemitStatus,
    remits,
    book,
    reload,
    revalidate,
  };
}

export type CashOfficeModel = ReturnType<typeof useCashOffice>;
