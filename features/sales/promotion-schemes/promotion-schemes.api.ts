/**
 * Promotion Schemes (menu 247) — the server routes this screen calls, the
 * same three Qt `ApiEndpoints::PromotionScheme` names:
 *
 *   GET    /promotion-scheme/get?prm_id=…                    one scheme, whole
 *   POST   /promotion-scheme/create                          create (no prm_id) or update
 *   DELETE /promotion-scheme/delete?prm_id=…&prm_modified_by= soft delete, records who
 *
 * The list is the configured grid "MAIN LIST - PROMOTION SCHEMES" (there is no
 * /list route for this screen; `/promotion-scheme/list` is the till's read and
 * stays the Sale Bill's).
 *
 * The scheme read is a GET MUTATION: it is a one-shot read per opening, and a
 * query endpoint would hand a second opening of the same scheme the first
 * one's pending promise (memory: RTK pending-query dedupe).
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";

export const PROMOTION_SCHEME_GET_ENDPOINT = "/promotion-scheme/get";
export const PROMOTION_SCHEME_CREATE_ENDPOINT = "/promotion-scheme/create";
export const PROMOTION_SCHEME_DELETE_ENDPOINT = "/promotion-scheme/delete";

export type PromotionSchemeDeleteArgs = { prmId: string; modifiedBy: string };

export const promotionSchemesApi = baseApi.injectEndpoints({
  overrideExisting: false,
  endpoints: (builder) => ({
    readPromotionScheme: builder.mutation<Record<string, unknown>, string>({
      query: (prmId) => ({ url: PROMOTION_SCHEME_GET_ENDPOINT, method: "GET", params: { prm_id: prmId } }),
      transformResponse: (payload: ApiSuccessResponse<Record<string, unknown>>) => payload.data ?? {},
    }),
    savePromotionScheme: builder.mutation<Record<string, unknown>, Record<string, unknown>>({
      query: (body) => ({ url: PROMOTION_SCHEME_CREATE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<Record<string, unknown>>) => payload.data ?? {},
    }),
    deletePromotionScheme: builder.mutation<unknown, PromotionSchemeDeleteArgs>({
      query: ({ prmId, modifiedBy }) => ({
        url: PROMOTION_SCHEME_DELETE_ENDPOINT,
        method: "DELETE",
        params: { prm_id: prmId, ...(modifiedBy ? { prm_modified_by: modifiedBy } : {}) },
      }),
    }),
  }),
});

export const {
  useReadPromotionSchemeMutation,
  useSavePromotionSchemeMutation,
  useDeletePromotionSchemeMutation,
} = promotionSchemesApi;
