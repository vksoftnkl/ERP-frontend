/**
 * Stock Reasons writes the shell does not make itself: Active on / off
 * (`/stock/reasons/deactivate`) and the shared-reason inactive copy
 * (`/stock/reasons`). Endpoint names carry the `stockReasons` prefix.
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";

export const stockReasonsApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    stockReasonsSend: builder.mutation<
      { message: string },
      { route: string; body: Record<string, unknown> }
    >({
      query: ({ route, body }) => ({ url: route, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<unknown> & { message?: string }) => ({
        message: typeof payload?.message === "string" ? payload.message : "",
      }),
    }),
  }),
});

export const { useStockReasonsSendMutation } = stockReasonsApi;
