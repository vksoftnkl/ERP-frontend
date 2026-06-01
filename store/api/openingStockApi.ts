import { baseApi } from "@/store/api/baseApi";
import type {
  OpeningStockDocumentPayload,
  OpeningStockListMeta,
  OpeningStockSaveRequest,
  OpeningStockSuccessResponse,
} from "@/features/stocks/opening-stock/opening-stock.types";
const OPENING_STOCK_SAVE_ENDPOINT = "/opening-stocks";
const OPENING_STOCK_LIST_ENDPOINT = "/opening-stocks/list";
const OPENING_STOCK_GET_ENDPOINT = "/opening-stocks/get";
const OPENING_STOCK_DELETE_ENDPOINT = "/opening-stocks/delete";
export type OpeningStockListQuery = {
  page?: string;
  limit?: string;
  company_id?: string;
  branch_id?: string;
  acc_year?: string;
};
export const openingStockApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    listOpeningStockDocs: builder.query<OpeningStockListMeta[], OpeningStockListQuery>({
      query: (params) => ({ url: OPENING_STOCK_LIST_ENDPOINT, params }),
      providesTags: ["OpeningStock"],
      keepUnusedDataFor: 60,
    }),

    getOpeningStockDoc: builder.query<OpeningStockDocumentPayload, string>({
      query: (id) => ({ url: OPENING_STOCK_GET_ENDPOINT, params: { id } }),
      providesTags: (_, __, id) => [{ type: "OpeningStock", id }],
      keepUnusedDataFor: 0,
    }),

    saveOpeningStockDoc: builder.mutation<
      OpeningStockSuccessResponse<unknown>,
      OpeningStockSaveRequest
    >({
      query: (body) => ({ url: OPENING_STOCK_SAVE_ENDPOINT, method: "POST", body }),
      invalidatesTags: ["OpeningStock"],
    }),

    deleteOpeningStockDoc: builder.mutation<void, string>({
      query: (id) => ({
        url: OPENING_STOCK_DELETE_ENDPOINT,
        method: "DELETE",
        params: { id },
      }),
      invalidatesTags: ["OpeningStock"],
    }),
  }),
});
export const {
  useListOpeningStockDocsQuery,
  useLazyListOpeningStockDocsQuery,
  useLazyGetOpeningStockDocQuery,
  useSaveOpeningStockDocMutation,
  useDeleteOpeningStockDocMutation,
} = openingStockApi;
