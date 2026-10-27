/**
 * Ageing Slabs — server endpoints (notes 159 §3), injected into the shared API.
 * Nothing is kept once read: the ladder is edited whole and the screen must
 * open on what the database holds now.
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import type { AgeingLadder } from "./ageing-slab";

const AGEING_SLABS_ENDPOINT = "/stock/ageing-slabs";

type SaveBody = {
  companyId: string;
  slabs: Array<{ slabNo: number; label: string; fromDays: number; toDays: number | null }>;
};

const ladderOf = (payload: ApiSuccessResponse<AgeingLadder>): AgeingLadder => ({
  usingOwn: Boolean(payload?.data?.usingOwn),
  slabs: Array.isArray(payload?.data?.slabs) ? payload.data.slabs : [],
});

export const ageingSlabApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getAgeingSlabs: builder.query<AgeingLadder, { companyId: string }>({
      query: ({ companyId }) => ({ url: AGEING_SLABS_ENDPOINT, params: { companyId } }),
      transformResponse: ladderOf,
      keepUnusedDataFor: 0,
    }),
    /** Replaces the company's own ladder as a set; answers the ladder now in force. */
    saveAgeingSlabs: builder.mutation<AgeingLadder, SaveBody>({
      query: (body) => ({ url: `${AGEING_SLABS_ENDPOINT}/save`, method: "POST", body }),
      transformResponse: ladderOf,
    }),
    /** Drops the company's own ladder; the shared default applies again. */
    revertAgeingSlabs: builder.mutation<AgeingLadder, { companyId: string }>({
      query: (body) => ({ url: `${AGEING_SLABS_ENDPOINT}/revert`, method: "POST", body }),
      transformResponse: ladderOf,
    }),
  }),
});

export const {
  useGetAgeingSlabsQuery,
  useSaveAgeingSlabsMutation,
  useRevertAgeingSlabsMutation,
} = ageingSlabApi;
