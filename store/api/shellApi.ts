import type { ErpHeaderItem } from "@/components/layout/types";
import {
  MENU_MASTERS_USERMENU_ENDPOINT,
  buildPrimaryMenu,
  extractMenuMasterItems,
} from "@/components/layout/constants";
import { baseApi } from "@/store/api/baseApi";
export const shellApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getPrimaryMenu: builder.query<ErpHeaderItem[], string>({
      // userId is only the RTK Query cache key here; the server resolves the
      // current user's menu assignments from the Bearer token.
      query: () => ({
        url: MENU_MASTERS_USERMENU_ENDPOINT,
      }),
      transformResponse: (payload: unknown) =>
        buildPrimaryMenu(extractMenuMasterItems(payload)),
      providesTags: ["MenuMasters"],
      keepUnusedDataFor: 300,
    }),
  }),
});
export const { useGetPrimaryMenuQuery } = shellApi;
