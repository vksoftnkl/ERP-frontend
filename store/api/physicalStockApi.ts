import { baseApi } from "@/store/api/baseApi";
import type {
  PhysicalStockListMeta,
  PhysicalStockSaveRequest,
} from "@/features/stocks/physical-stock/physical-stock.types";

const PHYSICAL_STOCK_SAVE_ENDPOINT = "/physical-stock";
const PHYSICAL_STOCK_LIST_ENDPOINT = "/physical-stock/list";
const PHYSICAL_STOCK_GET_ENDPOINT = "/physical-stock/get";
const PHYSICAL_STOCK_DELETE_ENDPOINT = "/physical-stock/delete";

export type PhysicalStockListQuery = {
  page?: string;
  limit?: string;
  company_id?: string;
  branch_id?: string;
  acc_year?: string;
};

export const physicalStockApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    listPhysicalStockDocs: builder.query<PhysicalStockListMeta[], PhysicalStockListQuery>({
      query: (params) => ({ url: PHYSICAL_STOCK_LIST_ENDPOINT, params }),
      providesTags: ["PhysicalStock"],
      keepUnusedDataFor: 60,
    }),

    getPhysicalStockDoc: builder.query<unknown, string>({
      query: (id) => ({ url: PHYSICAL_STOCK_GET_ENDPOINT, params: { id } }),
      providesTags: (_, __, id) => [{ type: "PhysicalStock", id }],
      keepUnusedDataFor: 0,
    }),

    savePhysicalStockDoc: builder.mutation<unknown, PhysicalStockSaveRequest>({
      query: (body) => ({ url: PHYSICAL_STOCK_SAVE_ENDPOINT, method: "POST", body }),
      invalidatesTags: ["PhysicalStock"],
    }),

    deletePhysicalStockDoc: builder.mutation<void, string>({
      query: (id) => ({
        url: PHYSICAL_STOCK_DELETE_ENDPOINT,
        method: "DELETE",
        params: { id },
      }),
      invalidatesTags: ["PhysicalStock"],
    }),
  }),
});

export const {
  useListPhysicalStockDocsQuery,
  useLazyListPhysicalStockDocsQuery,
  useLazyGetPhysicalStockDocQuery,
  useSavePhysicalStockDocMutation,
  useDeletePhysicalStockDocMutation,
} = physicalStockApi;
