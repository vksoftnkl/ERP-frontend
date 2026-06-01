import { baseApi } from "@/store/api/baseApi";
/**
 * Generic RTK Query endpoints for all 37 master CRUD modules.
 *
 * Each module passes its own URL + params at call-time so a single endpoint
 * definition serves every module without per-module boilerplate.  Tag-based
 * invalidation is keyed by the module's list URL so that a save/delete on
 * module X only invalidates that module's list cache, not every master list.
 */
export type MasterListArgs = {
  url: string;
  params?: Record<string, string>;
};
export type MasterGetByIdArgs = {
  url: string;
  params?: Record<string, string>;
};
export type MasterSaveArgs = {
  url: string;
  body: Record<string, unknown>;
  /** The list endpoint URL used as the cache-invalidation key. */
  listUrl: string;
  /** Human-readable key used by the saga to dispatch post-save side effects. */
  moduleKey: string;
};
export type MasterDeleteArgs = {
  url: string;
  params?: Record<string, string>;
  /** The list endpoint URL used as the cache-invalidation key. */
  listUrl: string;
  /** Human-readable key used by the saga to dispatch post-delete side effects. */
  moduleKey: string;
};
export const mastersApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    masterList: builder.query<unknown, MasterListArgs>({
      query: ({ url, params }) => ({ url, params }),
      providesTags: (_, __, { url }) => [{ type: "MasterList", id: url }],
      keepUnusedDataFor: 30,
    }),
    masterGetById: builder.query<unknown, MasterGetByIdArgs>({
      query: ({ url, params }) => ({ url, params }),
      keepUnusedDataFor: 0,
    }),
    masterSave: builder.mutation<unknown, MasterSaveArgs>({
      query: ({ url, body }) => ({ url, method: "POST", body }),
      // Automatically re-fetches the list for this module after a successful save
      invalidatesTags: (_, __, { listUrl }) => [{ type: "MasterList", id: listUrl }],
    }),
    masterDelete: builder.mutation<unknown, MasterDeleteArgs>({
      query: ({ url, params }) => ({ url, method: "DELETE", params }),
      // Automatically re-fetches the list for this module after a successful delete
      invalidatesTags: (_, __, { listUrl }) => [{ type: "MasterList", id: listUrl }],
    }),
  }),
});
export const {
  useMasterListQuery,
  useLazyMasterListQuery,
  useLazyMasterGetByIdQuery,
  useMasterSaveMutation,
  useMasterDeleteMutation,
} = mastersApi;