import {
  normalizeGridColumnsPayload,
  type GridColumnConfig,
} from "@/store/slices/gridColumnsSlice";
import { baseApi } from "@/store/api/baseApi";
export type GridColumnsQueryArg = {
  gridId: number;
};
export const metadataApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getGridColumns: builder.query<GridColumnConfig[], GridColumnsQueryArg>({
      query: ({ gridId }) => ({
        url: "/configured-grid-sql/columns",
        params: {
          grid_id: gridId,
        },
      }),
      transformResponse: (payload: unknown) => normalizeGridColumnsPayload(payload),
      providesTags: (_result, _error, arg) => [{ type: "GridColumns", id: arg.gridId }],
      keepUnusedDataFor: 300,
    }),
  }),
});
export const { useGetGridColumnsQuery } = metadataApi;
