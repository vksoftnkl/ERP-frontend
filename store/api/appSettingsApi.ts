import { baseApi } from "@/store/api/baseApi";
import type {
  AppSettingResetResult,
  AppSettingValuePayload,
  EffectiveSetting,
  ResolveScopeQuery,
  SaveAppSettingValueDto,
} from "@/features/settings/app-settings/types";
import { extractRows } from "@/features/masters/shared/normalizers";
import type { ApiSuccessResponse } from "@/utils/types";

const EFFECTIVE_ENDPOINT = "/app-setting-values/effective";
const SAVE_ENDPOINT = "/app-setting-values/create";
const RESET_ENDPOINT = "/app-setting-values/delete";
const COUNTER_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-masters";

/** One till. The lookup already falls back to the device uid when the name is blank. */
export type CounterOption = { id: string; name: string };

function toCounterOption(raw: Record<string, unknown>): CounterOption | null {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  return id ? { id, name: name || id } : null;
}

/**
 * The setting catalog, as it stands for one caller.
 *
 * There is no list of settings in this client and there must never be one:
 * every row — its label, its control, its permitted values, how deep it may be
 * overridden — comes from `app_setting_def` through this one read. Adding a
 * setting is an INSERT and a binding, not a front-end release.
 *
 * Reads are unpaged (the catalog is small and a settings screen wants all of
 * it) and are cached per scope target, so moving the bar back to a layer
 * already looked at does not re-read it.
 */
export const appSettingsApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getEffectiveSettings: builder.query<EffectiveSetting[], ResolveScopeQuery>({
      query: (scope) => ({
        url: EFFECTIVE_ENDPOINT,
        // Only the ids actually present are sent: a layer whose id is absent
        // never matches, which is how a COMPANY read is kept clear of the
        // branch and counter overrides underneath it.
        params: {
          ...(scope.companyId ? { companyId: scope.companyId } : {}),
          ...(scope.branchId ? { branchId: scope.branchId } : {}),
          ...(scope.deviceId ? { deviceId: scope.deviceId } : {}),
          ...(scope.userId ? { userId: scope.userId } : {}),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<EffectiveSetting[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
      providesTags: ["AppSettings"],
      keepUnusedDataFor: 30,
    }),

    /**
     * A page of boxes in one transaction: if any entry is refused none of them
     * are written, so the screen can never be left guessing which half took.
     */
    saveAppSettings: builder.mutation<AppSettingValuePayload[], SaveAppSettingValueDto[]>({
      query: (data) => ({
        url: SAVE_ENDPOINT,
        method: "POST",
        body: { data },
      }),
      transformResponse: (payload: ApiSuccessResponse<AppSettingValuePayload[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
      invalidatesTags: ["AppSettings"],
    }),

    /**
     * The counters an override may be pinned to.
     *
     * NOT company-scoped, and it cannot be: the lookup takes no company
     * parameter, and adding one makes it answer with NOTHING rather than
     * filtering. So this lists every till on the installation, and picking one
     * belonging to another company would write that company's device an
     * override. `/device-list-masters/list` does filter on `devCompanyId` and is
     * the right source — it needs its grid configured first
     * (`grids/device_list_grid.sql`); switch to it when that lands.
     */
    getCounterOptions: builder.query<CounterOption[], void>({
      query: () => ({
        url: COUNTER_LOOKUP_ENDPOINT,
        params: { module: "devices" },
      }),
      transformResponse: (payload: unknown) =>
        extractRows<Record<string, unknown>>(payload)
          .map(toCounterOption)
          .filter((option): option is CounterOption => option !== null),
      keepUnusedDataFor: 300,
    }),

    /**
     * Reset — the override goes away and the layer above takes over again.
     * Never a write of the default value, which would freeze today's default
     * into a permanent override that stops tracking it.
     */
    resetAppSetting: builder.mutation<AppSettingResetResult, string>({
      query: (asvId) => ({
        url: RESET_ENDPOINT,
        method: "DELETE",
        params: { asvId },
      }),
      transformResponse: (payload: ApiSuccessResponse<AppSettingResetResult>) => payload.data,
      invalidatesTags: ["AppSettings"],
    }),
  }),
});

export const {
  useGetEffectiveSettingsQuery,
  useLazyGetEffectiveSettingsQuery,
  useGetCounterOptionsQuery,
  useSaveAppSettingsMutation,
  useResetAppSettingMutation,
} = appSettingsApi;
