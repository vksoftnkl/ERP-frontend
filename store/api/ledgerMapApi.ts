/**
 * Posting Ledger Map (menu 250) — server endpoints.
 *
 * Three routes under `/ledger-map`, all wired, plus the role-filtered ledger
 * picker (grid 105).
 *
 * ── ONE CALL LOADS THE WHOLE SCREEN ─────────────────────────────────────────
 * `GET /roles` is the role CATALOGUE joined to the mappings — a role with no
 * mapping comes back with `ledgerId: null`, which is exactly the row the screen
 * exists to show, and which a grid over `acc_ledger_map` could never return.
 * Grid 106 ("SETUP - POSTING LEDGER MAP") is registered over the same tables
 * and deliberately unused: it carries neither `expectedLedgerType`, `usedBy`
 * nor the label.
 *
 * No paging, no search, no filter — that is the invariant, not laziness: the
 * header's count of roles that will not post is only true while every role is
 * on screen.
 *
 * It is a GET-shaped MUTATION rather than a query. The screen holds an edited
 * copy of these rows, and a cached query refetched on window focus would hand
 * it a fresh answer in the middle of an edit; a reload must also return the
 * server's rows even when nothing changed, which structural sharing would turn
 * into "the same object, so nothing to seed". Each call here is its own request.
 */
import { baseApi } from "@/store/api/baseApi";
import { getGridId } from "@/lib/configured-grids";
import type { ApiSuccessResponse } from "@/utils/types";
import type { ConfiguredGridPage } from "@/store/api/quotationApi";
import type {
  LedgerMapDeletePayload,
  LedgerMapRolePayload,
  RoleLedgerPickerRow,
  SaveLedgerMapBody,
} from "@/features/accounts/ledger-map/ledger-map.types";

const ROLES_ENDPOINT = "/ledger-map/roles";
const CREATE_ENDPOINT = "/ledger-map/create";
const DELETE_ENDPOINT = "/ledger-map/delete";
const CONFIGURED_GRID_RUN_ENDPOINT = "/configured-grid-sql/run";

/**
 * The picker's role parameter. It is BARE in grid 105's SQL —
 * `JOIN accounts.acc_ledger_role r ON r.alr_role = itrl_role` — so it is
 * spelled exactly, and it is ALWAYS sent: a placeholder the parameters do not
 * answer stays in the SQL as a word and fails the whole query.
 */
export const LEDGER_PICKER_ROLE_PARAM = "itrl_role";

export type RoleLedgerSearch = {
  role: string;
  search?: string;
  page?: number;
  limit?: number;
};

export const ledgerMapApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    loadLedgerMapRoles: builder.mutation<LedgerMapRolePayload[], void>({
      query: () => ({ url: ROLES_ENDPOINT, method: "GET" }),
      transformResponse: (payload: ApiSuccessResponse<LedgerMapRolePayload[]>) =>
        Array.isArray(payload.data) ? payload.data : [],
    }),

    /**
     * Create-or-update; the presence of `almId` selects. One call per TOUCHED
     * row: a create-or-update over every role would make each audit row say
     * everything changed on a day one thing did.
     */
    saveLedgerMap: builder.mutation<LedgerMapRolePayload, SaveLedgerMapBody>({
      query: (body) => ({ url: CREATE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<LedgerMapRolePayload>) => payload.data,
    }),

    /**
     * Soft delete — refused while a deployed engine posts the role, with the
     * documents named. A later create issues a NEW `almId`, so the screen
     * re-reads `/roles` after this rather than trusting the ids it holds.
     */
    deleteLedgerMap: builder.mutation<LedgerMapDeletePayload, string>({
      query: (almId) => ({ url: DELETE_ENDPOINT, method: "DELETE", params: { almId } }),
      transformResponse: (payload: ApiSuccessResponse<LedgerMapDeletePayload>) => payload.data,
    }),

    /**
     * Grid 105, "POPUP - LEDGERS FOR ROLE". Its SQL joins `acc_ledger_role` on the
     * role it is given and applies that role's wanted type, duty head and group
     * nature — so DISCOUNT_ALLOWED offers a couple of ledgers and OUTPUT_CGST a
     * handful, and only live, global ones. Offering every ledger and letting the
     * server refuse would be a worse screen than offering only the ones that can
     * be right.
     */
    searchRoleLedgers: builder.query<ConfiguredGridPage<RoleLedgerPickerRow>, RoleLedgerSearch>({
      query: ({ role, search, page = 1, limit = 20 }) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        params: {
          grid_id: getGridId("ledgerForRolePopup"),
          page,
          limit,
          grid_param: JSON.stringify({ [LEDGER_PICKER_ROLE_PARAM]: role ?? "" }),
          ...(search?.trim() ? { search: search.trim() } : {}),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<ConfiguredGridPage<RoleLedgerPickerRow>>) =>
        payload.data,
      keepUnusedDataFor: 30,
    }),
  }),
});

export const {
  useLoadLedgerMapRolesMutation,
  useSaveLedgerMapMutation,
  useDeleteLedgerMapMutation,
  useSearchRoleLedgersQuery,
} = ledgerMapApi;
