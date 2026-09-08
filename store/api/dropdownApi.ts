/**
 * The two configured-dropdown endpoints, as RTK Query.
 *
 * Read `components/design-system/dropdown/` alongside this: the query builders and
 * the config normalizer live there (pure and unit-tested), this file only wires
 * them to the cache.
 */
import {
  buildDropdownConfigQuery,
  buildDropdownRunQuery,
  dropdownParamsKey,
  DROPDOWN_CONFIG_ENDPOINT,
  DROPDOWN_PAGE_SIZE,
  DROPDOWN_RUN_ENDPOINT,
} from "@/components/design-system/dropdown/api";
import { normalizeDropdownConfig } from "@/components/design-system/dropdown/config";
import type {
  DropdownConfig,
  DropdownParams,
  DropdownRowsPage,
} from "@/components/design-system/dropdown/types";
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";

export type DropdownRowsArgs = {
  dropdownId: string;
  search?: string;
  page?: number;
  params?: DropdownParams;
};

const EMPTY_PAGE: DropdownRowsPage = { items: [], meta: { page: 1, limit: 0, total: 0 } };

export const dropdownApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * A dropdown's definition, cached by id for the life of the app.
     *
     * The Qt widget refetches this once per *instance*, so a screen with six
     * dropdowns makes six calls and a grid popup makes one per cell. Keyed by id
     * here, a definition is fetched once however many fields use it.
     *
     * Deliberately untagged: a definition only changes from the Dropdown Designer,
     * and the store's "something was written" handler invalidates every tag it
     * knows (see store.ts), which would drag this back over the wire on every save
     * in the app. The designer invalidates it explicitly instead.
     */
    getDropdownConfig: builder.query<DropdownConfig | null, string>({
      query: (dropdownId) => ({
        url: DROPDOWN_CONFIG_ENDPOINT,
        params: buildDropdownConfigQuery(dropdownId),
      }),
      transformResponse: (payload: ApiSuccessResponse<unknown>) =>
        normalizeDropdownConfig(payload),
      keepUnusedDataFor: 3600,
    }),
    /**
     * A page of rows. Accumulated across pages so the popup can scroll past the
     * first `DROPDOWN_PAGE_SIZE` matches instead of dead-ending there.
     *
     * `serializeQueryArgs` leaves `page` out, so one cache entry holds the whole
     * result set for a given (dropdown, search, params) and a new search starts a
     * fresh one — which is also what makes this last-wins: a slow response for an
     * abandoned search lands in that search's entry, not this one's.
     */
    getDropdownRows: builder.query<DropdownRowsPage, DropdownRowsArgs>({
      query: ({ dropdownId, search, page, params }) => ({
        url: DROPDOWN_RUN_ENDPOINT,
        params: buildDropdownRunQuery({
          dropdownId,
          search,
          page,
          limit: DROPDOWN_PAGE_SIZE,
          params,
        }),
      }),
      transformResponse: (payload: ApiSuccessResponse<DropdownRowsPage>) =>
        payload.data ?? EMPTY_PAGE,
      serializeQueryArgs: ({ endpointName, queryArgs }) =>
        `${endpointName}(${queryArgs.dropdownId}|${queryArgs.search?.trim() ?? ""}|${dropdownParamsKey(queryArgs.params)})`,
      merge: (current, incoming, { arg }) => {
        // Page 1 replaces: it is also what a refetch (freshness signal, reconnect)
        // asks for, and appending there would double every row on screen.
        if ((arg.page ?? 1) <= 1) {
          return incoming;
        }
        current.items.push(...incoming.items);
        current.meta = incoming.meta;
        return current;
      },
      forceRefetch: ({ currentArg, previousArg }) =>
        (currentArg?.page ?? 1) !== (previousArg?.page ?? 1),
      providesTags: ["DropdownRows"],
      keepUnusedDataFor: 60,
    }),
  }),
});

export const {
  useGetDropdownConfigQuery,
  useGetDropdownRowsQuery,
  useLazyGetDropdownRowsQuery,
} = dropdownApi;
