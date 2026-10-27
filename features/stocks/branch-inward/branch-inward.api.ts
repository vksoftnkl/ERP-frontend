/**
 * Branch Inward — server endpoints, injected into the shared `baseApi` (paths
 * WITHOUT `/api/v1`). Names are prefixed `branchInward…`: injected endpoints
 * share one namespace.
 *
 * Nothing here is cached. What is still owed is read from stock_transit and a
 * receipt posted a minute ago has already moved it, so the prefill, the load
 * and the worklist are sent as GET mutations (never deduped onto an earlier
 * pending read, never served stale).
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import {
  BRANCH_INWARD_POST_ENDPOINT,
  BRANCH_INWARD_PREFILL_ENDPOINT,
  BRANCH_INWARD_RECEIVE_ENDPOINT,
  CONFIGURED_GRID_RUN_ENDPOINT,
} from "./branch-inward.constants";
import type { ReceivePostDto, ReceiveSaveDto } from "./branch-inward.payload";
import type {
  BranchInwardDocKey,
  InboundPage,
  PostResult,
  PrefillPayload,
  ReceiptPayload,
  SaveResult,
} from "./branch-inward.types";

function refParams(key: BranchInwardDocKey) {
  return { svhId: key.svhId, accYear: key.accYear, companyId: key.companyId, branchId: key.branchId };
}

export type PrefillArgs = {
  companyId: string;
  branchId: string;
  outVoucherId: string;
  /** The DESPATCH's year, not the receipt's. */
  accYear: string;
};

export const branchInwardApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /** Grid 186 — one row per despatch still on its way to this branch. */
    branchInwardInbound: builder.mutation<InboundPage, { gridId: string; companyId: string; branchId: string }>({
      query: ({ gridId, companyId, branchId }) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        method: "GET",
        params: {
          grid_id: gridId,
          page: 1,
          limit: 100,
          grid_param: JSON.stringify({ icompany_id: companyId, ibranch_id: branchId }),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<InboundPage>) => ({
        items: Array.isArray(payload?.data?.items) ? payload.data.items : [],
        meta: payload?.data?.meta,
      }),
    }),
    /** The despatch's transit rows at the REMAINDER. */
    branchInwardPrefill: builder.mutation<PrefillPayload, PrefillArgs>({
      query: (params) => ({ url: BRANCH_INWARD_PREFILL_ENDPOINT, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<PrefillPayload>) => payload.data,
    }),
    /** GET — a saved receipt (header + lines). */
    branchInwardLoad: builder.mutation<ReceiptPayload, BranchInwardDocKey>({
      query: (key) => ({ url: BRANCH_INWARD_RECEIVE_ENDPOINT, method: "GET", params: refParams(key) }),
      transformResponse: (payload: ApiSuccessResponse<ReceiptPayload>) => payload.data,
    }),
    /** POST — create or update a DRAFT receipt. Brings nothing in. */
    branchInwardSave: builder.mutation<SaveResult, ReceiveSaveDto>({
      query: (body) => ({ url: BRANCH_INWARD_RECEIVE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<SaveResult>) => payload.data,
    }),
    /** POST — post a saved draft: the stock comes in, the unloading charge posts. */
    branchInwardPost: builder.mutation<
      { data: PostResult; message: string },
      ReceivePostDto
    >({
      query: (body) => ({ url: BRANCH_INWARD_POST_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<PostResult>) => ({
        data: payload.data,
        message: payload.message ?? "",
      }),
    }),
    /** DELETE — soft delete a DRAFT. A receipt is never cancelled. */
    branchInwardDelete: builder.mutation<unknown, BranchInwardDocKey>({
      query: (key) => ({ url: BRANCH_INWARD_RECEIVE_ENDPOINT, method: "DELETE", params: refParams(key) }),
      transformResponse: (payload: ApiSuccessResponse<unknown>) => payload.data,
    }),
  }),
});

export const {
  useBranchInwardInboundMutation,
  useBranchInwardPrefillMutation,
  useBranchInwardLoadMutation,
  useBranchInwardSaveMutation,
  useBranchInwardPostMutation,
  useBranchInwardDeleteMutation,
} = branchInwardApi;
