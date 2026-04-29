import { baseApi } from "@/store/api/baseApi";
import {
  extractAuthToken,
  extractAuthUserId,
  setAuthSession,
} from "@/lib/auth/session";
import { authSessionChanged } from "@/store/slices/authSlice";
export type LoginRequest = {
  user_name: string;
  user_password: string;
  device_id?: string;
  app_version?: string;
};
export type LoginResponse = {
  authenticated: boolean;
};
export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, LoginRequest>({
      queryFn: async (body, api, _extraOptions, baseQuery) => {
        const result = await baseQuery({
          url: "/auth/login",
          method: "POST",
          body,
        });
        if (result.error) {
          return { error: result.error };
        }
        const token = extractAuthToken(result.data);
        const userId = extractAuthUserId(result.data);
        const authenticated = setAuthSession(token, userId);
        if (!authenticated) {
          return {
            error: {
              message: "Token missing in login response.",
            },
          };
        }
        api.dispatch(authSessionChanged({ token, userId }));
        return { data: { authenticated } };
      },
      invalidatesTags: ["Auth"],
    }),
  }),
});
export const { useLoginMutation } = authApi;
