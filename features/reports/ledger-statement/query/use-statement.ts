"use client";
/**
 * `StatementLoader` as a hook: one load per URL change, pages on demand, and
 * the dev-only consistency check of plan §8.3.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { LedgerStatementClient } from "../api/ledger-statement";
import { sameBal } from "../wire/money";
import { isLastPageLoaded, lastRow } from "./pages";
import type { Filters, Session } from "./params";
import { INITIAL_STATE, StatementLoader, type StatementState } from "./statement-loader";

export function useStatement(client: LedgerStatementClient, session: Session, filters: Filters) {
  const [state, setState] = useState<StatementState>(INITIAL_STATE);
  const loaderRef = useRef<StatementLoader | null>(null);

  useEffect(() => {
    const loader = new StatementLoader(client, setState);
    loaderRef.current = loader;
    return () => {
      loader.dispose();
      loaderRef.current = null;
    };
  }, [client]);

  // One load per distinct request. Object identity changes on every render,
  // so the effect keys on the serialised request instead.
  const requestKey = JSON.stringify([session, filters]);
  useEffect(() => {
    const [s, f] = JSON.parse(requestKey) as [Session, Filters];
    loaderRef.current?.load({ session: s, filters: f });
  }, [requestKey, client]);

  const ensureRows = useCallback((first: number, last: number) => {
    loaderRef.current?.ensureRows(first, last);
  }, []);
  const reload = useCallback(() => loaderRef.current?.reload(), []);
  const retryPages = useCallback(() => loaderRef.current?.retryPages(), []);

  useConsistencyCheck(state, filters);

  return { state, ensureRows, reload, retryPages };
}

/**
 * Dev builds only: page 1's b/f must equal the period's opening, and the last
 * row's balance its closing. A mismatch is a SERVER bug to report, so it is
 * logged with the filters and never patched over here.
 */
function useConsistencyCheck(state: StatementState, filters: Filters) {
  const reported = useRef(new Set<string>());
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const { header, pages } = state;
    if (!header || !pages || header.key !== pages.key) return;
    const period = header.data.period;
    const first = pages.pages.get(1);
    const complain = (what: string, server: unknown, expected: unknown) => {
      const id = `${pages.key}|${what}`;
      if (reported.current.has(id)) return;
      reported.current.add(id);
      console.error(`[ledger-statement] ${what} disagrees with header.period`, {
        server,
        expected,
        filters,
      });
    };
    if (first && !sameBal(first.broughtForward, period.opening)) {
      complain("page 1 broughtForward", first.broughtForward, period.opening);
    }
    if (pages.totalRows > 0 && isLastPageLoaded(pages)) {
      const last = lastRow(pages);
      if (last && !sameBal(last.balance, period.closing)) {
        complain("last row balance", last.balance, period.closing);
      }
    }
  }, [state, filters]);
}
