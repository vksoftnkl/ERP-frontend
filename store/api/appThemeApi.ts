import { baseApi } from "@/store/api/baseApi";
import type { EffectiveAppTheme, ThemeTokens } from "@/lib/app-theme";
import { getGridId } from "@/lib/configured-grids";
import type { ConfiguredGridPage } from "@/store/api/quotationApi";
import type { ApiSuccessResponse } from "@/utils/types";

const EFFECTIVE_ENDPOINT = "/app-themes/effective";
const GET_ENDPOINT = "/app-themes/get";
const SAVE_ENDPOINT = "/app-themes/save";
const DELETE_ENDPOINT = "/app-themes/delete";
const RESTORE_ENDPOINT = "/app-themes/restore";
const TEMPLATE_ENDPOINT = "/app-themes/template";
const TEMPLATE_SAVE_ENDPOINT = "/app-themes/template/save";
const CONFIGURED_GRID_RUN_ENDPOINT = "/configured-grid-sql/run";

/** The tag id `/effective` answers under, so a theme write repaints the company. */
const EFFECTIVE_TAG = { type: "AppTheme", id: "EFFECTIVE" } as const;

/** `/app-themes/get` and `/save` — one theme row, deleted ones included. */
export type AppTheme = {
  thmId: number;
  thmName: string;
  thmBase: string;
  thmIsDefault: boolean;
  thmIsActive: boolean;
  thmIsDeleted: boolean;
  thmRemarks: string | null;
  tokens: ThemeTokens;
  /** Live companies whose comp_stylesheet_id is this theme. */
  usedByCount: number;
  thmModifiedOn: string | null;
};

/** `/save`: no `thmId` creates. `tokens` REPLACES the stored object. */
export type SaveAppThemeBody = {
  thmId?: number;
  thmName: string;
  thmBase: string;
  thmIsDefault?: boolean;
  thmIsActive?: boolean;
  thmRemarks: string | null;
  tokens: Record<string, string>;
};

/** `/template` — the one set of QSS rules every company's palette fills. */
export type AppThemeTemplate = {
  tplId: number;
  tplName: string;
  /** QSS with {{key}} placeholders. */
  tplQss: string;
  tplRemarks: string | null;
  /** Echo it on /template/save: a stale value is a 409. */
  tplModifiedOn: string;
  placeholders: string[];
};

export type SaveAppThemeTemplateBody = {
  tplId: number;
  tplQss: string;
  tplRemarks: string | null;
  tplModifiedOn: string;
};

/**
 * The theme a company is painted in: its own (Company master, "Stylesheet"),
 * or the default theme when it has none or a retired one — and, for the App
 * Themes screen (menu 266), the theme master's own routes.
 *
 * The server answers `/effective` with an ETag and `Cache-Control: private,
 * max-age=0`, so the browser revalidates every read and a theme that has not
 * changed costs a bodiless 304 — nothing here has to manage that.
 */
export const appThemeApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getEffectiveAppTheme: builder.query<EffectiveAppTheme | null, string>({
      query: (companyId) => ({ url: EFFECTIVE_ENDPOINT, params: { companyId } }),
      transformResponse: (payload: ApiSuccessResponse<EffectiveAppTheme>) =>
        payload?.data && typeof payload.data.tokens === "object" ? payload.data : null,
      providesTags: [EFFECTIVE_TAG],
      keepUnusedDataFor: 300,
    }),

    /**
     * Grid "MAIN LIST - APP THEMES". Untagged on purpose: the server caches a
     * grid run for about a second, so a refetch straight after a write can
     * answer the old rows. The screen patches the list where it knows the
     * change and re-reads once the cache has turned over.
     */
    getAppThemeList: builder.query<ConfiguredGridPage<Record<string, unknown>>, void>({
      query: () => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        // The route caps limit at 100.
        params: { grid_id: getGridId("appThemeList"), page: 1, limit: 100 },
      }),
      transformResponse: (payload: ApiSuccessResponse<ConfiguredGridPage<Record<string, unknown>>>) =>
        payload.data,
      keepUnusedDataFor: 0,
    }),

    getAppTheme: builder.query<AppTheme, number>({
      query: (thmId) => ({ url: GET_ENDPOINT, params: { thmId } }),
      transformResponse: (payload: ApiSuccessResponse<AppTheme>) => payload.data,
      providesTags: (_result, _error, thmId) => [{ type: "AppTheme", id: thmId }],
    }),

    saveAppTheme: builder.mutation<AppTheme, SaveAppThemeBody>({
      query: (body) => ({ url: SAVE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<AppTheme>) => payload.data,
      invalidatesTags: (result, _error, body) => [
        { type: "AppTheme", id: result?.thmId ?? body.thmId ?? "NEW" },
        EFFECTIVE_TAG,
      ],
    }),

    deleteAppTheme: builder.mutation<{ thmId: number; deleted: boolean }, number>({
      query: (thmId) => ({ url: DELETE_ENDPOINT, method: "POST", params: { thmId } }),
      transformResponse: (payload: ApiSuccessResponse<{ thmId: number; deleted: boolean }>) => payload.data,
      invalidatesTags: (_result, _error, thmId) => [{ type: "AppTheme", id: thmId }, EFFECTIVE_TAG],
    }),

    restoreAppTheme: builder.mutation<{ thmId: number; deleted: boolean }, number>({
      query: (thmId) => ({ url: RESTORE_ENDPOINT, method: "POST", params: { thmId } }),
      transformResponse: (payload: ApiSuccessResponse<{ thmId: number; deleted: boolean }>) => payload.data,
      invalidatesTags: (_result, _error, thmId) => [{ type: "AppTheme", id: thmId }, EFFECTIVE_TAG],
    }),

    getAppThemeTemplate: builder.query<AppThemeTemplate, void>({
      query: () => ({ url: TEMPLATE_ENDPOINT }),
      transformResponse: (payload: ApiSuccessResponse<AppThemeTemplate>) => payload.data,
      providesTags: ["AppThemeTemplate"],
    }),

    saveAppThemeTemplate: builder.mutation<AppThemeTemplate, SaveAppThemeTemplateBody>({
      query: (body) => ({ url: TEMPLATE_SAVE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<AppThemeTemplate>) => payload.data,
      invalidatesTags: ["AppThemeTemplate", EFFECTIVE_TAG],
    }),
  }),
});

export const {
  useGetEffectiveAppThemeQuery,
  useGetAppThemeListQuery,
  useGetAppThemeQuery,
  useSaveAppThemeMutation,
  useDeleteAppThemeMutation,
  useRestoreAppThemeMutation,
  useGetAppThemeTemplateQuery,
  useSaveAppThemeTemplateMutation,
} = appThemeApi;
