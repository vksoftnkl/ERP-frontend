/**
 * `/item-price-log/*` — the Price Change Log's five routes (Qt
 * `ApiEndpoints::ItemPriceLog`).
 *
 * Every one is a GET MUTATION: the log grows all day and the server caches
 * none of it (`@CacheTTL(0)` — the HTTP cache key carries no user, and View on
 * menu 290 decides what a caller may read), and the report fetches its range
 * page by page under a generation guard, which a deduped, cached query would
 * defeat.
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import type {
  PriceLogDay,
  PriceLogDetail,
  PriceLogFilters,
  PriceLogGaps,
  PriceLogHistoryQuery,
  PriceLogListPage,
  PriceLogRow,
} from "../wire/types";

export const PRICE_LOG_ENDPOINTS = {
  list: "/item-price-log/list",
  get: "/item-price-log/get",
  days: "/item-price-log/days",
  itemHistory: "/item-price-log/item-history",
  gaps: "/item-price-log/gaps",
} as const;

/** The filters as query params — a blank one is NOT sent (Qt `filterQuery`). */
export function priceLogFilterParams(filters: PriceLogFilters): Record<string, string> {
  const params: Record<string, string> = {};
  const add = (key: string, value: string | undefined) => {
    const trimmed = (value ?? "").trim();
    if (trimmed) {
      params[key] = trimmed;
    }
  };
  add("companyId", filters.companyId);
  add("branchId", filters.branchId);
  add("fromDate", filters.fromDate);
  add("toDate", filters.toDate);
  // BOTH is the server's default, so it need not travel — but it is valid, and
  // the Qt client sends it, so it is sent as chosen.
  add("priceTable", filters.priceTable);
  add("itemId", filters.itemId);
  add("userId", filters.userId);
  add("deviceId", filters.deviceId);
  add("field", filters.field);
  add("source", filters.source);
  add("action", filters.action);
  add("search", filters.search);
  return params;
}

const EMPTY_PAGE: PriceLogListPage = { items: [], meta: { page: 1, limit: 0, total: 0 } };

export const priceLogApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    /** Newest first; `limit` ≤ 500. */
    listPriceLog: builder.mutation<PriceLogListPage, PriceLogFilters & { page: number; limit: number }>({
      query: ({ page, limit, ...filters }) => ({
        url: PRICE_LOG_ENDPOINTS.list,
        method: "GET",
        params: { ...priceLogFilterParams(filters), page, limit },
      }),
      transformResponse: (payload: ApiSuccessResponse<PriceLogListPage>) => {
        const data = payload?.data;
        if (!data || !Array.isArray(data.items)) {
          return EMPTY_PAGE;
        }
        return {
          items: data.items,
          meta: {
            page: Number(data.meta?.page) || 1,
            limit: Number(data.meta?.limit) || 0,
            total: Number(data.meta?.total) || 0,
          },
        };
      },
    }),
    /** Per day: changes, priceChanges, slabChanges, items, users, saves. */
    getPriceLogDays: builder.mutation<PriceLogDay[], PriceLogFilters>({
      query: (filters) => ({ url: PRICE_LOG_ENDPOINTS.days, method: "GET", params: priceLogFilterParams(filters) }),
      transformResponse: (payload: ApiSuccessResponse<PriceLogDay[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
    }),
    /** One change with before / after and fields[]. 404 IPCL_NOT_FOUND. */
    getPriceLogChange: builder.mutation<PriceLogDetail, string>({
      query: (ipclId) => ({ url: PRICE_LOG_ENDPOINTS.get, method: "GET", params: { ipclId } }),
      transformResponse: (payload: ApiSuccessResponse<PriceLogDetail>) => payload.data,
    }),
    /** One item's price changes, newest first (the server's order). */
    getPriceLogItemHistory: builder.mutation<PriceLogRow[], PriceLogHistoryQuery>({
      query: ({ itemId, companyId, branchId, priceTable, limit }) => ({
        url: PRICE_LOG_ENDPOINTS.itemHistory,
        method: "GET",
        params: {
          itemId,
          ...(companyId ? { companyId } : {}),
          ...(branchId ? { branchId } : {}),
          ...(priceTable ? { priceTable } : {}),
          ...(limit ? { limit } : {}),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<PriceLogRow[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
    }),
    /** Price rows changed outside the log since it began — 0 is healthy. */
    getPriceLogGaps: builder.mutation<PriceLogGaps, { companyId?: string }>({
      query: ({ companyId }) => ({
        url: PRICE_LOG_ENDPOINTS.gaps,
        method: "GET",
        params: companyId ? { companyId } : {},
      }),
      transformResponse: (payload: ApiSuccessResponse<PriceLogGaps>) => ({
        since: payload?.data?.since ?? null,
        total: Number(payload?.data?.total) || 0,
        priceRows: Number(payload?.data?.priceRows) || 0,
        slabRows: Number(payload?.data?.slabRows) || 0,
        sample: Array.isArray(payload?.data?.sample) ? payload.data.sample : [],
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useListPriceLogMutation,
  useGetPriceLogDaysMutation,
  useGetPriceLogChangeMutation,
  useGetPriceLogItemHistoryMutation,
  useGetPriceLogGapsMutation,
} = priceLogApi;
