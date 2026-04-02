import {
  normalizeGridColumnsPayload,
  type GridColumnConfig,
} from "@/store/slices/gridColumnsSlice";
import { baseApi } from "@/store/api/baseApi";
export type GridColumnsQueryArg = {
  gridId: number;
  page?: number;
  limit?: number;
};
export const metadataApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getGridColumns: builder.query<GridColumnConfig[], GridColumnsQueryArg>({
      query: ({ gridId, page = 1, limit = 20 }) => ({
        url: "/grid-columns/list",
        params: {
          grid_id: gridId,
          page,
          limit,
        },
      }),
      transformResponse: (payload: unknown) => normalizeGridColumnsPayload(payload),
      providesTags: (_result, _error, arg) => [{ type: "GridColumns", id: arg.gridId }],
      keepUnusedDataFor: 300,
    }),
  }),
});
export const { useGetGridColumnsQuery } = metadataApi;
