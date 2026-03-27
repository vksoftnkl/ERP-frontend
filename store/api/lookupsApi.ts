import type { ERPDynamicSelectOption } from "@/components/library/ui";
import { buildLookupOptions, DEFAULT_LOOKUP_ARRAY_KEYS } from "@/features/masters/shared/normalizers";
import { baseApi } from "@/store/api/baseApi";

const ITEM_LIST_ENDPOINT = "/items/list";
const MASTER_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";

const ITEM_LOOKUP_QUERY = {
  limit: "50",
} as const;

const GODOWN_LOOKUP_QUERY = {
  module: "godownLocations",
  limit: "100",
} as const;

const DEFAULT_ITEM_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Clear selection",
};

const DEFAULT_GODOWN_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Clear selection",
};

const ITEM_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "item_masters", "items"],
  idKeys: ["item_id", "itemId", "id", "_id", "value"],
  labelKeys: ["item_name_en", "itemNameEn", "name", "label"],
} as const;

const GODOWN_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "godowns", "godown_locations"],
  idKeys: [
    "gdl_id",
    "gdlId",
    "gdl_location_id",
    "godown_id",
    "godownId",
    "id",
    "_id",
    "value",
  ],
  labelKeys: [
    "gdl_name",
    "gdlName",
    "godown_name",
    "godownName",
    "name",
    "label",
  ],
} as const;

export type LookupSearchArg = {
  search?: string;
};

export const lookupsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getItemOptions: builder.query<ERPDynamicSelectOption[], LookupSearchArg | void>({
      query: (arg) => ({
        url: ITEM_LIST_ENDPOINT,
        params: arg?.search ? { ...ITEM_LOOKUP_QUERY, search: arg.search.trim() } : ITEM_LOOKUP_QUERY,
      }),
      transformResponse: (payload: unknown) =>
        buildLookupOptions(payload, DEFAULT_ITEM_OPTION, ITEM_LOOKUP_KEYS),
      providesTags: (_result, _error, arg) => [{ type: "ItemLookup", id: arg?.search?.trim() || "default" }],
      keepUnusedDataFor: 300,
    }),
    getGodownOptions: builder.query<ERPDynamicSelectOption[], LookupSearchArg | void>({
      query: (arg) => ({
        url: MASTER_LOOKUP_ENDPOINT,
        params: arg?.search
          ? { ...GODOWN_LOOKUP_QUERY, search: arg.search.trim() }
          : GODOWN_LOOKUP_QUERY,
      }),
      transformResponse: (payload: unknown) =>
        buildLookupOptions(payload, DEFAULT_GODOWN_OPTION, GODOWN_LOOKUP_KEYS),
      providesTags: (_result, _error, arg) => [
        { type: "GodownLookup", id: arg?.search?.trim() || "default" },
      ],
      keepUnusedDataFor: 300,
    }),
  }),
});

export const {
  useLazyGetGodownOptionsQuery,
  useLazyGetItemOptionsQuery,
} = lookupsApi;
