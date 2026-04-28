import { type SerializedError } from "@reduxjs/toolkit";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type {
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from "@reduxjs/toolkit/query";
import { API_BASE, extractApiErrorMessage, getAuthHeaderValue, isLoginEndpoint } from "@/lib/api/client";
import { clearAuthSession, getAuthSession } from "@/lib/auth/session";
import { authSessionChanged } from "@/store/slices/authSlice";
export type ApiError = {
  status?: number;
  data?: unknown;
  message: string;
};
const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE || undefined,
  prepareHeaders: (headers, { arg, getState }) => {
    if (headers.has("authorization")) {
      return headers;
    }
    const requestUrl = typeof arg === "string" ? arg : arg.url;
    if (isLoginEndpoint(requestUrl)) {
      return headers;
    }
    const state = getState() as { auth?: { token?: string | null } };
    const token = state.auth?.token ?? getAuthSession();
    const authHeaderValue = getAuthHeaderValue(token);
    if (authHeaderValue) {
      headers.set("Authorization", authHeaderValue);
    }
    return headers;
  },
});
const baseQueryWithAuthHandling: BaseQueryFn<string | FetchArgs, unknown, ApiError> = async (
  args,
  api,
  extraOptions,
) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if ("error" in result) {
    const error = result.error as FetchBaseQueryError;
    const status = typeof error.status === "number" ? error.status : undefined;
    const data = "data" in error ? error.data : undefined;
    const message =
      status === undefined && "error" in error && typeof error.error === "string"
        ? error.error
        : extractApiErrorMessage(data, "Request failed.");
    if (status === 401) {
      clearAuthSession();
      api.dispatch(authSessionChanged({ token: null, userId: null }));
    }
    return {
      error: {
        status,
        data,
        message,
      },
    };
  }
  return { data: result.data };
};
export function getApiErrorMessage(error?: ApiError | SerializedError | null): string | null {
  if (!error) {
    return null;
  }
  if ("message" in error && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  return "Request failed.";
}
export const baseApi = createApi({
  reducerPath: "baseApi",
  baseQuery: baseQueryWithAuthHandling,
  tagTypes: [
    "Auth",
    "GridColumns",
    "ItemLookup",
    "GodownLookup",
    "MenuMasters",
  ],
  endpoints: () => ({}),
});
