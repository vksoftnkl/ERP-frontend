/**
 * Account Day Summary — the seven GETs (plan §4.1), one function each.
 *
 * EVERY call goes to `/reports/day-summary/*`. The Type combo does not use
 * the dropdown runner, the business-day status does not come from `/till/*`,
 * and Enter on a ledger NAVIGATES to the Ledger Statement instead of calling
 * its routes. If a field seems to be missing, the fix is a server ask, not a
 * call to an old route.
 *
 * The requests ride `baseApi` (the house bearer token and its refresh-on-401)
 * as a MUTATION that sends a GET, for the ledger statement's reason: a query
 * endpoint dedupes on its cache key and hands a second caller the first's
 * promise, aborted or not. A mutation starts a request per call and caches
 * nothing; `reset()` drops the result once read. The screen owns its state.
 *
 * Every function returns PARSED data. A parse failure throws
 * `DaySummaryParseError`, a refusal throws the RTK error (`{ status, data }`),
 * and `wire/errors.ts` turns either into a sentence.
 */
import { useMemo } from "react";
import { baseApi } from "@/store/api/baseApi";
import { useAppDispatch } from "@/store/hooks";
import type { AppDispatch } from "@/store";
import { AbortedError } from "@/features/reports/shared/api/abort";
import type {
  CheckDetailQuery,
  DailyQuery,
  ExportQuery,
  GroupLedgersQuery,
  SummaryQuery,
  VouchersQuery,
} from "../query/params";
import {
  parseCheckDetail,
  parseDaily,
  parseExport,
  parseGroupLedgers,
  parseSummary,
  parseVouchers,
  parseVoucherTypes,
} from "../wire/parse";
import type {
  CheckDetailPayload,
  DailyPayload,
  ExportPayload,
  GroupLedgersPayload,
  SummaryPayload,
  VoucherPage,
  VoucherTypeOption,
} from "../wire/types";

const BASE = "/reports/day-summary";

type Params = Record<string, string | number | boolean | undefined>;
type RouteArgs = { route: string; params: Params };

export const daySummaryApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    daySummaryGet: builder.mutation<unknown, RouteArgs>({
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
  const request = dispatch(daySummaryApi.endpoints.daySummaryGet.initiate({ route, params }));
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

export type DaySummaryClient = {
  /** No query keys: the types are global, and the handler declares no DTO. */
  getVoucherTypes: (signal?: AbortSignal) => Promise<VoucherTypeOption[]>;
  getSummary: (q: SummaryQuery, signal?: AbortSignal) => Promise<SummaryPayload>;
  getVouchers: (q: VouchersQuery, signal?: AbortSignal) => Promise<VoucherPage>;
  getDaily: (q: DailyQuery, signal?: AbortSignal) => Promise<DailyPayload>;
  getGroupLedgers: (q: GroupLedgersQuery, signal?: AbortSignal) => Promise<GroupLedgersPayload>;
  getCheckDetail: (q: CheckDetailQuery, signal?: AbortSignal) => Promise<CheckDetailPayload>;
  getExport: (q: ExportQuery, signal?: AbortSignal) => Promise<ExportPayload>;
};

export function createDaySummaryClient(dispatch: AppDispatch): DaySummaryClient {
  return {
    getVoucherTypes: (signal) => get(dispatch, "voucher-types", {}, parseVoucherTypes, signal),
    getSummary: (q, signal) => get(dispatch, "summary", q, parseSummary, signal),
    getVouchers: (q, signal) =>
      get(dispatch, "vouchers", q, (raw) => parseVouchers(raw, q.draftsOnly === true), signal),
    getDaily: (q, signal) => get(dispatch, "daily", q, parseDaily, signal),
    getGroupLedgers: (q, signal) => get(dispatch, "group-ledgers", q, parseGroupLedgers, signal),
    getCheckDetail: (q, signal) => get(dispatch, "checks/detail", q, (raw) => parseCheckDetail(raw, q.code), signal),
    getExport: (q, signal) => get(dispatch, "export", q, parseExport, signal),
  };
}

export function useDaySummaryClient(): DaySummaryClient {
  const dispatch = useAppDispatch();
  return useMemo(() => createDaySummaryClient(dispatch), [dispatch]);
}
