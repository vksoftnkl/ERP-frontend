/**
 * Party-wise Outstanding — the nine GETs (plan §4.1), one function each.
 *
 * EVERY call goes to `/reports/party-outstanding/*`. Not
 * `master-lookups/party-credit`, not `/receipts/open-items`, not the grid
 * runner, not a dropdown id, even though each would answer something similar
 * today (the user's rule, 2026-09-25: separate URLs, because the old ones will
 * change). A missing field is a server ask, not a call to an old route.
 *
 * The requests ride `baseApi` for the bearer token and its refresh-on-401.
 * The endpoint is a MUTATION that sends a GET, for the reason the Ledger
 * Statement found (its `api/ledger-statement.ts`): a query endpoint hands a
 * second request for a pending key the FIRST one's promise, so an aborted
 * generation would starve the next. A mutation starts a request per call and
 * caches nothing. The screen owns its state.
 *
 * Every function returns PARSED data. A parse failure throws
 * `OutstandingParseError`; a refusal throws the RTK error (`{ status, data }`).
 * `wire/errors.ts` turns either into a sentence.
 */
import { useMemo } from "react";
import { baseApi } from "@/store/api/baseApi";
import { useAppDispatch } from "@/store/hooks";
import type { AppDispatch } from "@/store";
import { AbortedError } from "@/features/reports/shared/api/abort";
import type {
  BillHistoryQuery,
  BillWiseQuery,
  CalendarQuery,
  ExportQuery,
  OptionsQuery,
  PartiesQuery,
  PartyQuery,
  SummaryQuery,
} from "../query/params";
import {
  parseBillHistory,
  parseBills,
  parseBillWise,
  parseDueCalendar,
  parseExport,
  parseOptions,
  parseParties,
  parseParty,
  parseSummary,
} from "../wire/parse";
import type {
  BillHistoryPayload,
  BillsPayload,
  BillWisePayload,
  DueCalendarPayload,
  ExportPayload,
  OptionsPayload,
  PartiesPayload,
  PartyCardPayload,
  SummaryPayload,
} from "../wire/types";

const BASE = "/reports/party-outstanding";

type Params = Record<string, string | number | boolean | undefined>;
type RouteArgs = { route: string; params: Params };

export const partyOutstandingApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    partyOutstandingGet: builder.mutation<unknown, RouteArgs>({
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
  const request = dispatch(partyOutstandingApi.endpoints.partyOutstandingGet.initiate({ route, params }));
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

export type PartyOutstandingClient = {
  getOptions: (q: OptionsQuery, signal?: AbortSignal) => Promise<OptionsPayload>;
  getParties: (q: PartiesQuery, signal?: AbortSignal) => Promise<PartiesPayload>;
  getParty: (q: PartyQuery, signal?: AbortSignal) => Promise<PartyCardPayload>;
  getBills: (q: PartyQuery, signal?: AbortSignal) => Promise<BillsPayload>;
  getBillWise: (q: BillWiseQuery, signal?: AbortSignal) => Promise<BillWisePayload>;
  getBillHistory: (q: BillHistoryQuery, signal?: AbortSignal) => Promise<BillHistoryPayload>;
  getSummary: (q: SummaryQuery, signal?: AbortSignal) => Promise<SummaryPayload>;
  getDueCalendar: (q: CalendarQuery, signal?: AbortSignal) => Promise<DueCalendarPayload>;
  getExport: (q: ExportQuery, signal?: AbortSignal) => Promise<ExportPayload>;
};

export function createPartyOutstandingClient(dispatch: AppDispatch): PartyOutstandingClient {
  return {
    getOptions: (q, s) => get(dispatch, "options", q, parseOptions, s),
    getParties: (q, s) => get(dispatch, "parties", q, parseParties, s),
    getParty: (q, s) => get(dispatch, "party", q, parseParty, s),
    getBills: (q, s) => get(dispatch, "bills", q, parseBills, s),
    getBillWise: (q, s) => get(dispatch, "bill-wise", q, parseBillWise, s),
    getBillHistory: (q, s) => get(dispatch, "bill-history", q, parseBillHistory, s),
    getSummary: (q, s) => get(dispatch, "summary", q, parseSummary, s),
    getDueCalendar: (q, s) => get(dispatch, "due-calendar", q, parseDueCalendar, s),
    getExport: (q, s) => get(dispatch, "export", q, parseExport, s),
  };
}

export function usePartyOutstandingClient(): PartyOutstandingClient {
  const dispatch = useAppDispatch();
  return useMemo(() => createPartyOutstandingClient(dispatch), [dispatch]);
}
