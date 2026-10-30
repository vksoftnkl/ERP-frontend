/**
 * The purchase masters' writes the CrudMasterPage shell does not make itself:
 * Active on / off for Agents (`/purchase/agents/active`, menu 28) and the
 * Supplier–Item Map (`/purchase/supplier-items/active`, menu 295). Endpoint
 * names carry the `purchaseMasters` prefix (one injected namespace).
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";

export const purchaseMastersApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    purchaseMastersSend: builder.mutation<{ message: string }, { route: string; body: Record<string, unknown> }>({
      query: ({ route, body }) => ({ url: route, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<unknown> & { message?: string }) => ({
        message: typeof payload?.message === "string" ? payload.message : "",
      }),
    }),
  }),
});

export const { usePurchaseMastersSendMutation } = purchaseMastersApi;
