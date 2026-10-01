import { baseApi } from "@/store/api/baseApi";
import type { EffectiveAppTheme } from "@/lib/app-theme";
import type { ApiSuccessResponse } from "@/utils/types";

const EFFECTIVE_ENDPOINT = "/app-themes/effective";

/**
 * The theme a company is painted in: its own (Company master, "Stylesheet"),
 * or the default theme when it has none or a retired one.
 *
 * The server answers with an ETag and `Cache-Control: private, max-age=0`, so
 * the browser revalidates every read and a theme that has not changed costs a
 * bodiless 304 — nothing here has to manage that.
 */
export const appThemeApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getEffectiveAppTheme: builder.query<EffectiveAppTheme | null, string>({
      query: (companyId) => ({ url: EFFECTIVE_ENDPOINT, params: { companyId } }),
      transformResponse: (payload: ApiSuccessResponse<EffectiveAppTheme>) =>
        payload?.data && typeof payload.data.tokens === "object" ? payload.data : null,
      keepUnusedDataFor: 300,
    }),
  }),
});

export const { useGetEffectiveAppThemeQuery } = appThemeApi;
