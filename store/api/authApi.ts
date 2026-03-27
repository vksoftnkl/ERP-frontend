import { baseApi } from "@/store/api/baseApi";

export type LoginRequest = {
  user_name: string;
  user_password: string;
};

export type LoginResponse = Record<string, unknown>;

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (body) => ({
        url: "/auth/login",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Auth"],
    }),
  }),
});

export const { useLoginMutation } = authApi;
