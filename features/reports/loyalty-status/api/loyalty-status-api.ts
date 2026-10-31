/**
 * Loyalty Status — the routes, Qt `ApiEndpoints::LoyaltyStatus`.
 *
 *   reads    GET /reports/loyalty-status/{members, statement, member, expiring,
 *            expiring/calendar, schemes, schemes/monthly, schemes/gifts, export}
 *            GET /loyalty/members/history
 *   writes   POST /loyalty/members/status, POST /loyalty/members/adjust
 *
 * Every read is a GET MUTATION: the server caches none of it (`@CacheTTL(0)`,
 * a wallet is read to check a bill posted a moment ago), the screen guards
 * each load with a sequence number, and a superseded load is aborted — a
 * deduped, cached query would hand a second load the first one's promise
 * (memory: RTK pending-query dedupe + abort).
 *
 * The query is built by the screen (`query/params.ts`); an absent filter is
 * simply not sent, so the server's defaults hold.
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import type {
  CalendarPayload,
  ExpiringItem,
  ExpiringSummary,
  ExportPayload,
  GiftsPayload,
  HistoryPayload,
  ListPage,
  MemberAdjustBody,
  MemberItem,
  MemberPayload,
  MembersSummary,
  MemberStatusBody,
  MonthlyPayload,
  SchemesPayload,
  StatementPayload,
} from "../wire/types";

export const LOYALTY_STATUS_ENDPOINTS = {
  members: "/reports/loyalty-status/members",
  statement: "/reports/loyalty-status/statement",
  member: "/reports/loyalty-status/member",
  expiring: "/reports/loyalty-status/expiring",
  calendar: "/reports/loyalty-status/expiring/calendar",
  schemes: "/reports/loyalty-status/schemes",
  monthly: "/reports/loyalty-status/schemes/monthly",
  gifts: "/reports/loyalty-status/schemes/gifts",
  export: "/reports/loyalty-status/export",
  setStatus: "/loyalty/members/status",
  adjust: "/loyalty/members/adjust",
  history: "/loyalty/members/history",
} as const;

export type Params = Record<string, string>;

function dataOf<T>(payload: ApiSuccessResponse<T>): T {
  return payload.data;
}

export const loyaltyStatusApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getLoyaltyMembers: builder.mutation<ListPage<MemberItem, MembersSummary>, Params>({
      query: (params) => ({ url: LOYALTY_STATUS_ENDPOINTS.members, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<ListPage<MemberItem, MembersSummary>>) => dataOf(payload),
    }),
    getLoyaltyStatement: builder.mutation<StatementPayload, Params>({
      query: (params) => ({ url: LOYALTY_STATUS_ENDPOINTS.statement, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<StatementPayload>) => dataOf(payload),
    }),
    getLoyaltyMember: builder.mutation<MemberPayload, Params>({
      query: (params) => ({ url: LOYALTY_STATUS_ENDPOINTS.member, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<MemberPayload>) => dataOf(payload),
    }),
    getLoyaltyExpiring: builder.mutation<ListPage<ExpiringItem, ExpiringSummary>, Params>({
      query: (params) => ({ url: LOYALTY_STATUS_ENDPOINTS.expiring, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<ListPage<ExpiringItem, ExpiringSummary>>) => dataOf(payload),
    }),
    getLoyaltyCalendar: builder.mutation<CalendarPayload, Params>({
      query: (params) => ({ url: LOYALTY_STATUS_ENDPOINTS.calendar, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<CalendarPayload>) => dataOf(payload),
    }),
    getLoyaltySchemes: builder.mutation<SchemesPayload, Params>({
      query: (params) => ({ url: LOYALTY_STATUS_ENDPOINTS.schemes, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<SchemesPayload>) => dataOf(payload),
    }),
    getLoyaltyMonthly: builder.mutation<MonthlyPayload, Params>({
      query: (params) => ({ url: LOYALTY_STATUS_ENDPOINTS.monthly, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<MonthlyPayload>) => dataOf(payload),
    }),
    getLoyaltyGifts: builder.mutation<GiftsPayload, Params>({
      query: (params) => ({ url: LOYALTY_STATUS_ENDPOINTS.gifts, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<GiftsPayload>) => dataOf(payload),
    }),
    getLoyaltyExport: builder.mutation<ExportPayload, Params>({
      query: (params) => ({ url: LOYALTY_STATUS_ENDPOINTS.export, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<ExportPayload>) => dataOf(payload),
    }),
    getLoyaltyMemberHistory: builder.mutation<HistoryPayload, Params>({
      query: (params) => ({ url: LOYALTY_STATUS_ENDPOINTS.history, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<HistoryPayload>) => dataOf(payload),
    }),
    /** Suspend, reactivate or close a wallet — edit on 79 (delete too for a forced close). */
    setLoyaltyMemberStatus: builder.mutation<unknown, MemberStatusBody>({
      query: (body) => ({ url: LOYALTY_STATUS_ENDPOINTS.setStatus, method: "POST", body }),
    }),
    /** One adjustment document with the signed-in user as approver — edit on 79. */
    adjustLoyaltyMemberPoints: builder.mutation<unknown, MemberAdjustBody>({
      query: (body) => ({ url: LOYALTY_STATUS_ENDPOINTS.adjust, method: "POST", body }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetLoyaltyMembersMutation,
  useGetLoyaltyStatementMutation,
  useGetLoyaltyMemberMutation,
  useGetLoyaltyExpiringMutation,
  useGetLoyaltyCalendarMutation,
  useGetLoyaltySchemesMutation,
  useGetLoyaltyMonthlyMutation,
  useGetLoyaltyGiftsMutation,
  useGetLoyaltyExportMutation,
  useGetLoyaltyMemberHistoryMutation,
  useSetLoyaltyMemberStatusMutation,
  useAdjustLoyaltyMemberPointsMutation,
} = loyaltyStatusApi;
