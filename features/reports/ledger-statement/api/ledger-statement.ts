/**
 * Ledger Statement — the seven GETs (plan §4.1), one function each.
 *
 * EVERY call goes to `/reports/ledger-statement/*`. The user's rule
 * (2026-09-25): "separate urls, don't use any old urls because it's gonna
 * change". So the ledger picker does not use dropdown 39 or the grid runner,
 * and the ledger's facts do not come from `/account-ledger-masters/get`, even
 * though both would answer today. If a field seems to be missing, the fix is
 * on the server, not a call to an old route.
 *
 * The requests ride `baseApi` so they get the house bearer token and its
 * refresh-on-401. The endpoint is declared as a MUTATION although it sends a
 * GET, and that is deliberate: a query endpoint dedupes on its cache key, and
 * RTK refuses to start a query whose key is already pending, even with
 * `forceRefetch`. So under StrictMode's double mount, or a PgDn back to the
 * ledger just left, the new request was handed the ABORTED one's promise and
 * the grid never loaded (seen in the browser, 2026-09-25). A mutation starts
 * a request per call, aborts on its own, and caches nothing: `reset()` drops
 * the result from the store as soon as it is read. The screen owns its state;
 * a report that is cached is a report that is stale.
 *
 * Every function returns PARSED data. A parse failure throws
 * `LedgerParseError`, and a refusal throws the RTK error (`{ status, data }`);
 * `wire/errors.ts` turns either into a sentence.
 */
import { useMemo } from "react";
import { baseApi } from "@/store/api/baseApi";
import { useAppDispatch } from "@/store/hooks";
import type { AppDispatch } from "@/store";
import { AbortedError } from "./abort";
import type {
  ExportQuery,
  LedgersQuery,
  RangeQuery,
  ScopeQuery,
  VoucherLegsQuery,
  VouchersQuery,
} from "../query/params";
import {
  parseDaily,
  parseExport,
  parseHeader,
  parseLedgers,
  parseMonthly,
  parseVoucherLegs,
  parseVouchers,
} from "../wire/parse";
import type {
  DailyPayload,
  ExportPayload,
  HeaderPayload,
  LedgerPickPayload,
  MonthlyPayload,
  VoucherLegsPayload,
  VoucherPage,
} from "../wire/types";

const BASE = "/reports/ledger-statement";

type Params = Record<string, string | number | boolean | undefined>;
type RouteArgs = { route: string; params: Params };

export const ledgerStatementApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    ledgerStatementGet: builder.mutation<unknown, RouteArgs>({
      query: ({ route, params }) => ({ url: `${BASE}/${route}`, method: "GET", params }),
    }),
  }),
});

async function get<T>(
  dispatch: AppDispatch,
  route: string,
  params: Params,
  parse: (raw: unknown) => T,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw new AbortedError();
  const request = dispatch(ledgerStatementApi.endpoints.ledgerStatementGet.initiate({ route, params }));
  const onAbort = () => request.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const raw = await request.unwrap();
    if (signal?.aborted) throw new AbortedError();
    return parse(raw);
  } catch (error) {
    if (signal?.aborted) throw new AbortedError();
    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    request.reset();
  }
}

export type LedgerStatementClient = {
  searchLedgers: (q: LedgersQuery, signal?: AbortSignal) => Promise<LedgerPickPayload>;
  getHeader: (q: RangeQuery, signal?: AbortSignal) => Promise<HeaderPayload>;
  getVouchers: (q: VouchersQuery, signal?: AbortSignal) => Promise<VoucherPage>;
  getVoucherLegs: (q: VoucherLegsQuery, signal?: AbortSignal) => Promise<VoucherLegsPayload>;
  getDaily: (q: RangeQuery, signal?: AbortSignal) => Promise<DailyPayload>;
  getMonthly: (q: ScopeQuery, signal?: AbortSignal) => Promise<MonthlyPayload>;
  getExport: (q: ExportQuery, signal?: AbortSignal) => Promise<ExportPayload>;
};

export function createLedgerStatementClient(dispatch: AppDispatch): LedgerStatementClient {
  return {
    searchLedgers: (q, signal) => get(dispatch, "ledgers", q, parseLedgers, signal),
    getHeader: (q, signal) => get(dispatch, "header", q, parseHeader, signal),
    getVouchers: (q, signal) => get(dispatch, "vouchers", q, parseVouchers, signal),
    getVoucherLegs: (q, signal) => get(dispatch, "voucher-legs", q, parseVoucherLegs, signal),
    getDaily: (q, signal) => get(dispatch, "daily", q, parseDaily, signal),
    getMonthly: (q, signal) => get(dispatch, "monthly", q, parseMonthly, signal),
    getExport: (q, signal) => get(dispatch, "export", q, parseExport, signal),
  };
}

export function useLedgerStatementClient(): LedgerStatementClient {
  const dispatch = useAppDispatch();
  return useMemo(() => createLedgerStatementClient(dispatch), [dispatch]);
}
