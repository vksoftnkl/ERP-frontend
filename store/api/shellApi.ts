import type { ErpHeaderItem } from "@/components/layout/types";
import {
  DEFAULT_PRIMARY_MENU,
  MENU_MASTERS_GET_ENDPOINT,
  applyMenuMasterLabels,
  extractMenuMasterItems,
} from "@/components/layout/constants";
import { baseApi } from "@/store/api/baseApi";
const MENU_MASTERS_QUERY = {
  includeChildren: "true",
  activeOnly: "true",
  visibleOnly: "true",
} as const;
export const shellApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getPrimaryMenu: builder.query<ErpHeaderItem[], void>({
      query: () => ({
        url: MENU_MASTERS_GET_ENDPOINT,
        params: MENU_MASTERS_QUERY,
      }),
      transformResponse: (payload: unknown) =>
        applyMenuMasterLabels(DEFAULT_PRIMARY_MENU, extractMenuMasterItems(payload)),
      providesTags: ["MenuMasters"],
      keepUnusedDataFor: 300,
    }),
  }),
});
export const { useGetPrimaryMenuQuery } = shellApi;
