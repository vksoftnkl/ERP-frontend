import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse, ListMeta } from "@/utils/types";

const ITEM_QTY_PRICE_LIST_ENDPOINT = "/item-qty-prices/get";
const ITEM_QTY_PRICE_SAVE_ENDPOINT = "/item-qty-prices/create";
const ITEM_QTY_PRICE_DELETE_ENDPOINT = "/item-qty-prices/delete";
const UI_TABLE_MASTERS_ENDPOINT = "/ui-table-masters/get";

// fixed.ui_tables row provisioned for this page's grid ("Item Qty Wise Price web").
export const ITEM_QTY_PRICE_UI_TABLE_ID = "20";

export type ItemQtyPriceMode = "P" | "R" | "F";

export type SaveItemQtyPriceDto = {
  iqp_id?: string;
  iqp_company_id?: string | null;
  iqp_branch_id?: string | null;
  iqp_party_id?: string | null;
  iqp_price_level?: number | null;
  iqp_item_id: string;
  iqp_item_unit_id: string;
  iqp_from_qty?: number;
  iqp_to_qty?: number | null;
  iqp_price_mode?: ItemQtyPriceMode;
  iqp_disc_pct?: number | null;
  iqp_flat_off?: number | null;
  iqp_price?: number | null;
  iqp_is_tax_incl?: boolean;
  iqp_effective_from: string;
  iqp_effective_to?: string | null;
  iqp_is_active?: boolean;
};

export type ItemQtyPricePayload = SaveItemQtyPriceDto & {
  iqp_id: string;
  iqp_from_qty: number;
  iqp_to_qty: number | null;
  iqp_price_mode: ItemQtyPriceMode;
  iqp_is_tax_incl: boolean;
  iqp_is_active: boolean;
  iqp_is_deleted: boolean;
  iqp_created_on: string;
  iqp_created_by: string | null;
  iqp_modified_on: string;
  iqp_modified_by: string | null;
  iqp_item_name: string | null;
  iqp_unit_name: string | null;
  iqp_company_name: string | null;
  iqp_branch_name: string | null;
  iqp_price_level_name: string | null;
  iqp_party_name: string | null;
};

export type ItemQtyPriceListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  iqp_item_id?: string;
  iqp_is_active?: boolean;
};

export type ItemQtyPriceDeleteResult = {
  iqp_id: string;
  deleted: boolean;
};

export type UiTableColumnConfigRow = {
  uiTblClmName: string;
  uiTblClmColumnPosition: number;
  uiTblClmColumnVisibility: boolean;
  uiTblClmColumnWidth: number | null;
};

type UiTableConfigResponse = {
  success: boolean;
  message: string;
  data: Array<{
    uiTblId: string;
    columns: UiTableColumnConfigRow[];
  }>;
};

export const itemQtyPriceApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    listItemQtyPrices: builder.query<
      ApiSuccessResponse<ItemQtyPricePayload[], ListMeta>,
      ItemQtyPriceListQuery | void
    >({
      query: (params) => ({ url: ITEM_QTY_PRICE_LIST_ENDPOINT, params: params ?? undefined }),
      providesTags: ["ItemQtyPrice"],
    }),

    saveItemQtyPrices: builder.mutation<
      ApiSuccessResponse<ItemQtyPricePayload[]>,
      SaveItemQtyPriceDto[]
    >({
      query: (body) => ({ url: ITEM_QTY_PRICE_SAVE_ENDPOINT, method: "POST", body }),
      invalidatesTags: ["ItemQtyPrice"],
    }),

    deleteItemQtyPrice: builder.mutation<
      ApiSuccessResponse<ItemQtyPriceDeleteResult>,
      string
    >({
      query: (iqpId) => ({
        url: ITEM_QTY_PRICE_DELETE_ENDPOINT,
        method: "DELETE",
        params: { iqp_id: iqpId },
      }),
      invalidatesTags: ["ItemQtyPrice"],
    }),

    getItemQtyPriceColumnConfig: builder.query<UiTableColumnConfigRow[], { uiTableId: string }>({
      query: (params) => ({ url: UI_TABLE_MASTERS_ENDPOINT, params }),
      transformResponse: (payload: UiTableConfigResponse, _meta, arg) => {
        const table =
          payload.data?.find((row) => row.uiTblId === arg.uiTableId) ?? payload.data?.[0];
        return table?.columns ?? [];
      },
      providesTags: ["ItemQtyPrice"],
      keepUnusedDataFor: 300,
    }),
  }),
});

export const {
  useListItemQtyPricesQuery,
  useLazyListItemQtyPricesQuery,
  useSaveItemQtyPricesMutation,
  useDeleteItemQtyPriceMutation,
  useGetItemQtyPriceColumnConfigQuery,
} = itemQtyPriceApi;
