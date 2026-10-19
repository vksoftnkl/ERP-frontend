"use client";

/**
 * The reads behind Cash Position — the Qt `refresh` + `fetchTillCash` — as
 * keyed reads: grids 170 / 172 / 173 for the as-on day, grid 171 (the live
 * sessions) for today only, and for each live session the server's
 * /till/sessions/expected, whose cash tender is the figure Till Sessions
 * shows. A session the user may not see (403, or `expected` null) is counted
 * as hidden, never as nothing.
 *
 * Every grid read is `useGridRead` (one answer per key; an older key's answer
 * is dropped by its effect's cleanup). The till figures are keyed to the live
 * grid's answer: a refresh that lands while the expected reads of the last
 * one are still out cancels them — their answers are never summed into the
 * new figures (Qt's generation counter).
 *
 * `gridRows` and `expected` are GET-mutations, announced as data changes by
 * the store; a minute's auto-refresh re-announces, which is accepted here —
 * Qt simply refreshes too.
 */
import { useEffect, useState } from "react";

import { useTillSessionClient } from "../shared/api/till-session-api";
import { textOf } from "../shared/format";
import { useGridRead, type GridRead } from "../reports/use-till-reports";
import { NO_TILL_CASH, cashExpectedOf, orderEvents, positionParams, type TillCash } from "./cash-position";

export type CashPositionInput = {
  companyId: string;
  /** `""` = every branch. */
  branchId: string;
  /** The as-on day read, `yyyy-MM-dd`. */
  day: string;
  isToday: boolean;
  tick: number;
};

type TillCashState = {
  /** The live grid's answer these figures belong to. */
  key: string;
  cash: Map<string, number>;
  hidden: Map<string, number>;
  answered: number;
};

const NO_STATE: TillCashState = { key: "", cash: new Map(), hidden: new Map(), answered: 0 };

function bump(map: Map<string, number>, key: string, by: number) {
  map.set(key, (map.get(key) ?? 0) + by);
}

/** Each live session's expected cash, summed per branch; the hidden count beside it. */
export function useTillCash(companyId: string, live: GridRead): { value: TillCash; loading: boolean } {
  const client = useTillSessionClient();
  const [state, setState] = useState<TillCashState>(NO_STATE);

  useEffect(() => {
    const key = live.answerKey;
    if (!key || live.loading || live.rows.length === 0) return;
    let cancelled = false;
    const cash = new Map<string, number>();
    const hidden = new Map<string, number>();
    let answered = 0;
    const publish = () => {
      if (!cancelled) setState({ key, cash: new Map(cash), hidden: new Map(hidden), answered });
    };
    for (const row of live.rows) {
      const branch = textOf(row, "tss_branch_id");
      client
        .expected({
          companyId,
          branchId: branch,
          accYear: textOf(row, "tss_acc_year"),
          tssId: textOf(row, "tss_id"),
        })
        .then((payload) => {
          const paise = cashExpectedOf(payload);
          if (paise === null) bump(hidden, branch, 1);
          else bump(cash, branch, paise);
        })
        .catch(() => {
          bump(hidden, branch, 1); // 403: not this user's to see
        })
        .finally(() => {
          answered += 1;
          publish();
        });
    }
    return () => {
      cancelled = true;
    };
  }, [client, companyId, live.answerKey, live.loading, live.rows]);

  // Qt clears the figures on every refresh: while the live grid is re-read
  // there are none, then each session's answer adds its share.
  const current = !live.loading && live.answerKey !== "" && state.key === live.answerKey;
  const pending = live.loading || live.answerKey === "" ? 0 : live.rows.length - (current ? state.answered : 0);
  return {
    value: current ? { cash: state.cash, hidden: state.hidden } : NO_TILL_CASH,
    loading: pending > 0,
  };
}

/** Every grid of the page, and the till figures; `loading` while any read is out (the foot's "Loading…"). */
export function useCashPosition({ companyId, branchId, day, isToday, tick }: CashPositionInput) {
  const params = positionParams(companyId, branchId, day);
  const stores = useGridRead("tillCashPosition", params, tick, "The stores could not be read.");
  const live = useGridRead("tillCashPositionLive", isToday ? params : null, tick, "The live sessions could not be read.");
  const events = useGridRead(
    "tillCashPositionEvents",
    params,
    tick,
    "The day's exceptions could not be read.",
    orderEvents,
  );
  const cashiers = useGridRead("tillCashPositionCashiers", params, tick, "The cashiers could not be read.");
  const tillCash = useTillCash(companyId, live);
  const loading = stores.loading || live.loading || events.loading || cashiers.loading || tillCash.loading;
  return { stores, live, events, cashiers, tillCash: tillCash.value, loading };
}

export type CashPositionModel = ReturnType<typeof useCashPosition>;
