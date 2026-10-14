/**
 * The two till approval screens — Till Approval Rules (276) and Till Approval
 * Authority (285) — against the server's `till-masters.controller`.
 *
 *   GET    /configured-grid-sql/run  grid "TILL APPROVAL RULES" (151)   the rules (shipped + this company's)
 *   GET    /configured-grid-sql/run  grid "TILL APPROVAL GRANTS" (152)  the grants ('iinactive' = ended too)
 *   POST   /till/approval-rules/create          create, or update by tarId presence
 *   DELETE /till/approval-rules/delete?id&companyId
 *   POST   /till/approval-authorities/create    grant, or change by taaId presence
 *
 * A grant is never deleted (Active off is a save), so
 * `approval-authorities/delete` is not wired; nor are the two `/get` routes —
 * every field the screens need is on the grid rows.
 *
 * Every endpoint is a MUTATION (the grid reads send a GET): one request per
 * call, abortable, nothing cached — the screen owns its state, and a query's
 * pending-key dedupe would hand an aborted read to the next one (see the
 * Ledger Statement's api).
 */
import { useMemo } from "react";
import { getGridId, type ConfiguredGridKey } from "@/lib/configured-grids";
import { baseApi } from "@/store/api/baseApi";
import { useAppDispatch } from "@/store/hooks";
import type { AppDispatch } from "@/store";
import type { GrantBody, GridRow, RuleBody } from "../domain/approval-setup";

const GRID_RUN = "/configured-grid-sql/run";
/** The runner caps `limit` at 100. */
const GRID_PAGE_LIMIT = 100;
/** A guard, not a business limit. */
const GRID_MAX_PAGES = 20;

export type ApprovalGridArgs = { grid: ConfiguredGridKey; params: Record<string, string> };
export type ApprovalSaved = Record<string, unknown>;

type GridRunPayload = { data?: { items?: unknown; meta?: { total?: unknown } } };

export const tillApprovalApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /** Every row of one grid, every page of it. */
    tillApprovalGridRows: builder.mutation<GridRow[], ApprovalGridArgs>({
      async queryFn({ grid, params }, _api, _extra, baseQuery) {
        const rows: GridRow[] = [];
        for (let page = 1; page <= GRID_MAX_PAGES; page += 1) {
          const result = await baseQuery({
            url: GRID_RUN,
            method: "GET",
            params: { grid_id: getGridId(grid), page, limit: GRID_PAGE_LIMIT, grid_param: JSON.stringify(params) },
          });
          if (result.error) return { error: result.error };
          const data = (result.data as GridRunPayload | undefined)?.data;
          const items = Array.isArray(data?.items) ? (data.items as GridRow[]) : [];
          rows.push(...items);
          const total = Number(data?.meta?.total ?? rows.length);
          if (items.length < GRID_PAGE_LIMIT || rows.length >= total) break;
        }
        return { data: rows };
      },
    }),

    tillApprovalSaveRule: builder.mutation<ApprovalSaved, RuleBody>({
      query: (body) => ({ url: "/till/approval-rules/create", method: "POST", body }),
      transformResponse: (payload: { data?: ApprovalSaved; message?: string }) => ({
        ...(payload?.data ?? {}),
        message: payload?.message ?? "",
      }),
    }),

    tillApprovalDeleteRule: builder.mutation<ApprovalSaved, { id: string; companyId: string }>({
      query: ({ id, companyId }) => ({ url: "/till/approval-rules/delete", method: "DELETE", params: { id, companyId } }),
      transformResponse: (payload: { data?: ApprovalSaved; message?: string }) => ({
        ...(payload?.data ?? {}),
        message: payload?.message ?? "",
      }),
    }),

    tillApprovalSaveAuthority: builder.mutation<ApprovalSaved, GrantBody>({
      query: (body) => ({ url: "/till/approval-authorities/create", method: "POST", body }),
      transformResponse: (payload: { data?: ApprovalSaved; message?: string }) => ({
        ...(payload?.data ?? {}),
        message: payload?.message ?? "",
      }),
    }),
  }),
});

export type TillApprovalClient = {
  gridRows: (args: ApprovalGridArgs, signal?: AbortSignal) => Promise<GridRow[]>;
  saveRule: (body: RuleBody) => Promise<ApprovalSaved>;
  deleteRule: (id: string, companyId: string) => Promise<ApprovalSaved>;
  saveAuthority: (body: GrantBody) => Promise<ApprovalSaved>;
};

/** A thrown abort, recognised by name. */
export class ApprovalAbortedError extends Error {
  constructor() {
    super("aborted");
    this.name = "AbortError";
  }
}

export function isApprovalAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

/** What a mutation's `initiate` hands back: a promise with abort and reset. */
type MutationHandle<T> = { unwrap: () => Promise<T>; abort: () => void; reset: () => void };

async function run<T>(handle: MutationHandle<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) {
    handle.abort();
    handle.reset();
    throw new ApprovalAbortedError();
  }
  const onAbort = () => handle.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const result = await handle.unwrap();
    if (signal?.aborted) throw new ApprovalAbortedError();
    return result;
  } catch (error) {
    if (signal?.aborted) throw new ApprovalAbortedError();
    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    // Nothing stays in the store: the screen keeps what it needs.
    handle.reset();
  }
}

export function createTillApprovalClient(dispatch: AppDispatch): TillApprovalClient {
  const endpoints = tillApprovalApi.endpoints;
  return {
    gridRows: (args, signal) => run(dispatch(endpoints.tillApprovalGridRows.initiate(args)), signal),
    saveRule: (body) => run(dispatch(endpoints.tillApprovalSaveRule.initiate(body))),
    deleteRule: (id, companyId) => run(dispatch(endpoints.tillApprovalDeleteRule.initiate({ id, companyId }))),
    saveAuthority: (body) => run(dispatch(endpoints.tillApprovalSaveAuthority.initiate(body))),
  };
}

export function useTillApprovalClient(): TillApprovalClient {
  const dispatch = useAppDispatch();
  return useMemo(() => createTillApprovalClient(dispatch), [dispatch]);
}
