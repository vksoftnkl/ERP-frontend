/**
 * User Administration — the user master's wire (§3 of the port plan).
 *
 *   GET    /user-administration/get?usrId=     one user, menus[] included
 *   POST   /user-administration/create         create (no usrId) or update
 *   DELETE /user-administration/delete?usrId=  the user and every menu row
 *   GET    /menu-masters/get?visibleOnly=true  the menu tree
 *   GET    /configured-grid-sql/run grid 62     the list, for the copy-rights picker
 *
 * The two reads the dialog makes on open are declared as GET mutations, not
 * queries: a query fired from a mount effect shares its cache key with the
 * StrictMode double mount, and an abort of the first leaves the second with
 * nothing (see the RTK notes in memory). A mutation is its own request every
 * time, which is what a dialog opening wants.
 *
 * The save invalidates the list (`MasterList`) and the user lookups. It does
 * NOT invalidate `MenuMasters` (the signed-in user's own rights) — the screen
 * does that itself, and only when the user saved is the user signed in (§8).
 */
import { baseApi } from "@/store/api/baseApi";
import { getGridId } from "@/lib/configured-grids";
import { MENU_MASTERS_GET_ENDPOINT } from "@/components/layout/constants";
import type { ApiSuccessResponse } from "@/utils/types";
import type { ConfiguredGridPage } from "@/store/api/quotationApi";
import type {
  MenuTreeNodePayload,
  SaveUserAdministrationDto,
  UserAdminPayload,
} from "@/features/masters/settings/user-administration/domain/wire";

export const USER_ADMIN_GET_ENDPOINT = "/user-administration/get";
export const USER_ADMIN_SAVE_ENDPOINT = "/user-administration/create";
export const USER_ADMIN_DELETE_ENDPOINT = "/user-administration/delete";
const CONFIGURED_GRID_RUN_ENDPOINT = "/configured-grid-sql/run";

/** One row of grid 62, "MAIN LIST - COMPUTER USERS", as the runner aliases it. */
export type UserListRow = {
  usr_id?: string;
  usr_login_name?: string;
  usr_display_name?: string;
  usr_full_name?: string | null;
  usr_type?: string | null;
  usr_is_active?: boolean | string | null;
  [key: string]: unknown;
};

export type UserListQuery = { search: string; page: number; limit: number };

export const userAdminApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    loadUserAdmin: builder.mutation<UserAdminPayload, string>({
      query: (usrId) => ({ url: USER_ADMIN_GET_ENDPOINT, method: "GET", params: { usrId } }),
      transformResponse: (payload: ApiSuccessResponse<UserAdminPayload>) => payload.data,
    }),
    loadMenuTree: builder.mutation<MenuTreeNodePayload[], void>({
      query: () => ({
        url: MENU_MASTERS_GET_ENDPOINT,
        method: "GET",
        params: { visibleOnly: "true" },
      }),
      transformResponse: (payload: ApiSuccessResponse<MenuTreeNodePayload[]>) =>
        Array.isArray(payload.data) ? payload.data : [],
    }),
    saveUserAdmin: builder.mutation<UserAdminPayload, SaveUserAdministrationDto>({
      query: (body) => ({ url: USER_ADMIN_SAVE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<UserAdminPayload>) => payload.data,
      invalidatesTags: ["MasterList", "UserLookup"],
    }),
    deleteUserAdmin: builder.mutation<{ usrId: string; deleted: true }, string>({
      query: (usrId) => ({ url: USER_ADMIN_DELETE_ENDPOINT, method: "DELETE", params: { usrId } }),
      transformResponse: (payload: ApiSuccessResponse<{ usrId: string; deleted: true }>) =>
        payload.data,
      invalidatesTags: ["MasterList", "UserLookup"],
    }),
    /** The copy-rights picker's list: the same grid the page lists, searched server-side. */
    searchUsers: builder.query<ConfiguredGridPage<UserListRow>, UserListQuery>({
      query: ({ search, page, limit }) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        params: {
          grid_id: getGridId("userList"),
          page,
          limit,
          ...(search ? { search } : {}),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<ConfiguredGridPage<UserListRow>>) =>
        payload.data,
      providesTags: ["MasterList"],
      keepUnusedDataFor: 30,
    }),
  }),
});

export const {
  useLoadUserAdminMutation,
  useLoadMenuTreeMutation,
  useSaveUserAdminMutation,
  useDeleteUserAdminMutation,
  useSearchUsersQuery,
} = userAdminApi;
