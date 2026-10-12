/**
 * The till session's routes — `/till/sessions/*`, `/till/movements/create`,
 * `/till/denominations/list` — and the configured grids the session screens
 * read (144–148, 134), one typed function each.
 *
 * The requests ride `baseApi` for the bearer token and its refresh-on-401.
 * Both endpoints are MUTATIONS: a read is a mutation that sends a GET (the
 * Ledger Statement's finding — a query endpoint hands a second request for a
 * pending key the first one's promise, so an aborted read starves the next),
 * and every call is its own request with nothing cached. The screens own
 * their state, and a session's state is exactly what must not be served
 * stale (the server marks every till GET `@CacheTTL(0)` for the same reason).
 *
 * Every function returns the envelope's `data`. A refusal throws the RTK error
 * (`{ status, data }`); `../errors.ts#tillErrorOf` reads it.
 */
import { useMemo } from "react";
import { baseApi } from "@/store/api/baseApi";
import { useAppDispatch } from "@/store/hooks";
import type { AppDispatch } from "@/store/store";
import { getGridId, type ConfiguredGridKey } from "@/lib/configured-grids";
import type {
  GridRow,
  TillCountLine,
  TillCountResult,
  TillDenominationRow,
  TillMovementDetail,
  TillOpenCheck,
  TillSessionKey,
  TillSessionPayload,
  TillSlipCheckPayload,
  TillSlipCheckResult,
} from "../wire/types";

type Params = Record<string, string | number | boolean | undefined>;

export const tillSessionApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    tillSessionScreenRead: builder.mutation<unknown, { url: string; params: Params }>({
      query: ({ url, params }) => ({ url, method: "GET", params }),
    }),
    tillSessionScreenWrite: builder.mutation<unknown, { url: string; body: Record<string, unknown> }>({
      query: ({ url, body }) => ({ url, method: "POST", body }),
    }),
  }),
});

const GRID_RUN = "/configured-grid-sql/run";
/** The runner caps `limit` at 100. */
const GRID_PAGE_LIMIT = 100;
/** A guard, not a business limit: 2,000 documents in one shift is already absurd. */
const GRID_MAX_PAGES = 20;

function dataOf<T>(raw: unknown): T {
  return (raw as { data?: T } | null)?.data as T;
}

async function read<T>(dispatch: AppDispatch, url: string, params: Params): Promise<T> {
  const request = dispatch(tillSessionApi.endpoints.tillSessionScreenRead.initiate({ url, params }));
  try {
    return dataOf<T>(await request.unwrap());
  } finally {
    request.reset();
  }
}

async function write<T>(dispatch: AppDispatch, url: string, body: Record<string, unknown>): Promise<T> {
  const request = dispatch(tillSessionApi.endpoints.tillSessionScreenWrite.initiate({ url, body }));
  try {
    return dataOf<T>(await request.unwrap());
  } finally {
    request.reset();
  }
}

function keyParams(key: TillSessionKey): Params {
  return { companyId: key.companyId, branchId: key.branchId, accYear: key.accYear, tssId: key.tssId };
}

export type TillOpenBody = {
  companyId: string;
  branchId: string;
  counterId?: string;
  floatMode: "ISSUED" | "CARRIED";
  floatIssued?: number;
  prevSessionId?: string;
  lines: TillCountLine[];
  reasonId?: string;
  notes?: string;
};

export type TillCountBody = TillSessionKey & { lines: TillCountLine[] };

export type TillCloseBody = TillSessionKey & { floatLeft: number | null };

export type TillSlipCheckBody = TillSessionKey & {
  tenderId: string;
  ticked: number;
  noSlip: string[];
  amountDiffers: string[];
  slipsWithoutRow: { amount: number; authCode: string | null; cardLast4: string | null }[];
  notes: string | null;
};

export type TillMovementBody = TillSessionKey & {
  kind: "DROP" | "PAID_IN" | "PICKUP" | "TOP_UP";
  amount?: number;
  lines?: TillCountLine[];
  reasonId?: string;
  refNo?: string | null;
  ledgerId?: string;
  partyName?: string | null;
  bagNo?: string | null;
  sealNo?: string | null;
  notes: string | null;
};

export type TillSessionClient = {
  openCheck: (scope: { companyId: string; branchId: string; counterId?: string }) => Promise<TillOpenCheck>;
  open: (body: TillOpenBody) => Promise<TillSessionPayload>;
  get: (key: TillSessionKey) => Promise<TillSessionPayload>;
  /** 273 OVERRIDE: every expected figure; refused to the session's own cashier until it closes. */
  expected: (key: TillSessionKey) => Promise<TillSessionPayload>;
  resume: (key: TillSessionKey) => Promise<TillSessionPayload>;
  suspend: (key: TillSessionKey) => Promise<TillSessionPayload>;
  endBilling: (key: TillSessionKey) => Promise<TillSessionPayload>;
  count: (body: TillCountBody) => Promise<TillCountResult>;
  close: (body: TillCloseBody) => Promise<TillSessionPayload>;
  slipCheckRows: (key: TillSessionKey, tenderId: string) => Promise<TillSlipCheckPayload>;
  slipCheckRecord: (body: TillSlipCheckBody) => Promise<TillSlipCheckResult>;
  createMovement: (body: TillMovementBody) => Promise<TillMovementDetail>;
  denominations: (companyId: string) => Promise<TillDenominationRow[]>;
  /** Every row of a configured grid, every page of it. */
  gridRows: (grid: ConfiguredGridKey, params: Record<string, string>) => Promise<GridRow[]>;
};

export function createTillSessionClient(dispatch: AppDispatch): TillSessionClient {
  return {
    openCheck: ({ companyId, branchId, counterId }) =>
      read(dispatch, "/till/sessions/open-check", { companyId, branchId, ...(counterId ? { counterId } : {}) }),
    open: (body) => write(dispatch, "/till/sessions/open", body),
    get: (key) => read(dispatch, "/till/sessions/get", keyParams(key)),
    expected: (key) => read(dispatch, "/till/sessions/expected", keyParams(key)),
    resume: (key) => write(dispatch, "/till/sessions/resume", { ...key }),
    suspend: (key) => write(dispatch, "/till/sessions/suspend", { ...key }),
    // This client keeps nothing offline yet (Qt sends the same 0).
    endBilling: (key) => write(dispatch, "/till/sessions/end-billing", { ...key, outboxCount: 0 }),
    count: (body) => write(dispatch, "/till/sessions/count", body),
    close: (body) => write(dispatch, "/till/sessions/close", body),
    slipCheckRows: (key, tenderId) => read(dispatch, "/till/sessions/slip-check", { ...keyParams(key), tenderId }),
    slipCheckRecord: (body) => write(dispatch, "/till/sessions/slip-check", body),
    createMovement: (body) => write(dispatch, "/till/movements/create", body),
    denominations: async (companyId) => {
      const data = await read<TillDenominationRow[] | { items?: TillDenominationRow[] }>(
        dispatch,
        "/till/denominations/list",
        { companyId },
      );
      if (Array.isArray(data)) return data;
      return Array.isArray(data?.items) ? data.items : [];
    },
    gridRows: async (grid, params) => {
      const rows: GridRow[] = [];
      for (let page = 1; page <= GRID_MAX_PAGES; page += 1) {
        const data = await read<{ items?: GridRow[]; meta?: { total?: number | string } }>(dispatch, GRID_RUN, {
          grid_id: getGridId(grid),
          page,
          limit: GRID_PAGE_LIMIT,
          grid_param: JSON.stringify(params),
        });
        const items = Array.isArray(data?.items) ? data.items : [];
        rows.push(...items);
        const total = Number(data?.meta?.total ?? rows.length);
        if (items.length < GRID_PAGE_LIMIT || rows.length >= total) break;
      }
      return rows;
    },
  };
}

export function useTillSessionClient(): TillSessionClient {
  const dispatch = useAppDispatch();
  return useMemo(() => createTillSessionClient(dispatch), [dispatch]);
}
