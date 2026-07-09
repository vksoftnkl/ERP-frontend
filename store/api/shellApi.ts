import type { ErpHeaderItem } from "@/components/layout/types";
import {
  DEFAULT_PRIMARY_MENU,
  MENU_MASTERS_USERMENU_ENDPOINT,
  applyMenuMasterLabels,
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
        applyMenuMasterLabels(DEFAULT_PRIMARY_MENU, extractMenuMasterItems(payload)),
      providesTags: ["MenuMasters"],
      keepUnusedDataFor: 300,
    }),
  }),
});
export const { useGetPrimaryMenuQuery } = shellApi;
