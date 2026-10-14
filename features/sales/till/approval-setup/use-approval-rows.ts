"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "@/lib/notify";
import { isApprovalAbort, type TillApprovalClient } from "./api/till-approval-api";
import { approvalErrorText, type GridRow } from "./domain/approval-setup";

export type LoadState = "idle" | "loading" | "ready" | "error";

/** `company` keys the slot: rows read for another company are never shown. */
type Slot = { company: string; rows: GridRow[]; state: LoadState; loaded: boolean };

const EMPTY: Slot = { company: "", rows: [], state: "idle", loaded: false };

export type ApprovalRows = {
  rules: GridRow[];
  grants: GridRow[];
  rulesState: LoadState;
  grantsState: LoadState;
  /** A read has landed for this company (a re-read in flight keeps the last rows). */
  rulesLoaded: boolean;
  grantsLoaded: boolean;
  /** The fresh rows, or null when the read failed, was superseded or the company changed. */
  loadRules: (delayMs?: number) => Promise<GridRow[] | null>;
  loadGrants: (delayMs?: number) => Promise<GridRow[] | null>;
};

function wait(ms: number, signal: AbortSignal): Promise<boolean> {
  if (ms <= 0) return Promise.resolve(!signal.aborted);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(!signal.aborted), ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        resolve(false);
      },
      { once: true },
    );
  });
}

/**
 * Grid 151 (rules: the shipped rows and this company's) and grid 152 (grants:
 * this company's and the every-company ones), both bound by a QUOTED
 * `'icompany_id'`; 152 also by a quoted `'iinactive'`, sent as 'true' — ended
 * and switched-off grants too, as Qt reads them (a449b8c). Here the grants only
 * feed the rule form's "can anybody approve this?" warning; they are edited on
 * Till Approval Authority (285). One read at a time per grid: a new read aborts
 * the last.
 */
export function useApprovalRows(client: TillApprovalClient, companyId: string): ApprovalRows {
  const [rulesSlot, setRules] = useState<Slot>(EMPTY);
  const [grantsSlot, setGrants] = useState<Slot>(EMPTY);
  const rules = rulesSlot.company === companyId ? rulesSlot : EMPTY;
  const grants = grantsSlot.company === companyId ? grantsSlot : EMPTY;
  const controllers = useRef<{ rules: AbortController | null; grants: AbortController | null }>({
    rules: null,
    grants: null,
  });

  const load = useCallback(
    async (which: "rules" | "grants", delayMs = 0): Promise<GridRow[] | null> => {
      if (!companyId) return null;
      controllers.current[which]?.abort();
      const controller = new AbortController();
      controllers.current[which] = controller;
      const set = which === "rules" ? setRules : setGrants;
      set((slot) => (slot.company === companyId ? { ...slot, state: "loading" } : { company: companyId, rows: [], state: "loading", loaded: false }));
      if (!(await wait(delayMs, controller.signal))) return null;
      try {
        const rows = await client.gridRows(
          which === "rules"
            ? { grid: "tillApprovalRules", params: { icompany_id: companyId } }
            : // Every token of 152, always: one left out stays a literal word in the SQL.
              { grid: "tillApprovalGrants", params: { icompany_id: companyId, iinactive: "true" } },
          controller.signal,
        );
        if (controller.signal.aborted) return null;
        set({ company: companyId, rows, state: "ready", loaded: true });
        return rows;
      } catch (error) {
        if (controller.signal.aborted || isApprovalAbort(error)) return null;
        set((slot) => ({ ...slot, company: companyId, state: "error" }));
        toast.error(
          approvalErrorText(error, which === "rules" ? "The approval rules could not be read." : "The grants could not be read."),
          { toastId: `till-approval-${which}` },
        );
        return null;
      } finally {
        if (controllers.current[which] === controller) controllers.current[which] = null;
      }
    },
    [client, companyId],
  );

  // A company change (or leaving the screen) drops the reads in flight.
  useEffect(() => {
    const current = controllers.current;
    return () => {
      current.rules?.abort();
      current.grants?.abort();
    };
  }, [companyId]);

  const loadRules = useCallback((delayMs?: number) => load("rules", delayMs), [load]);
  const loadGrants = useCallback((delayMs?: number) => load("grants", delayMs), [load]);

  return {
    rules: rules.rows,
    grants: grants.rows,
    rulesState: rules.state,
    grantsState: grants.state,
    rulesLoaded: rules.loaded,
    grantsLoaded: grants.loaded,
    loadRules,
    loadGrants,
  };
}
