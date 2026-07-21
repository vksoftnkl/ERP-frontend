import { type SerializedError } from "@reduxjs/toolkit";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type {
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from "@reduxjs/toolkit/query";
import { API_BASE, extractApiErrorMessage, getAuthHeaderValue, isLoginEndpoint } from "@/lib/api/client";
import {
  clearAuthSession,
  extractAuthToken,
  extractAuthUserId,
  extractRefreshToken,
  getAuthSession,
  getRefreshToken,
  setAuthSession,
} from "@/lib/auth/session";
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
    const authHeaderValue = getAuthHeaderValue(state.auth?.token ?? getAuthSession());
    if (authHeaderValue) {
      headers.set("Authorization", authHeaderValue);
    }
    return headers;
  },
});

let refreshRequest: Promise<{ token: string; refreshToken: string | null; userId: string | null } | null> | null = null;

function isAuthRefreshEndpoint(args: string | FetchArgs): boolean {
  const requestUrl = typeof args === "string" ? args : args.url;
  return requestUrl === "/auth/refresh" || requestUrl.endsWith("/auth/refresh");
}

async function refreshAuthSession(
  api: Parameters<BaseQueryFn<string | FetchArgs, unknown, ApiError>>[1],
  extraOptions: Parameters<BaseQueryFn<string | FetchArgs, unknown, ApiError>>[2],
): Promise<{ token: string; refreshToken: string | null; userId: string | null } | null> {
  if (refreshRequest) {
    return refreshRequest;
  }

  const state = api.getState() as { auth?: { refreshToken?: string | null } };
  const currentRefreshToken = state.auth?.refreshToken ?? getRefreshToken();
  if (!currentRefreshToken) {
    return null;
  }

  refreshRequest = (async () => {
    const result = await rawBaseQuery(
      {
        url: "/auth/refresh",
        method: "POST",
        body: { refresh_token: currentRefreshToken },
      },
      api,
      extraOptions,
    );

    if ("error" in result) {
      return null;
    }

    const token = extractAuthToken(result.data);
    if (!token) {
      return null;
    }
    const refreshedRefreshToken = extractRefreshToken(result.data) ?? currentRefreshToken;
    const userId = extractAuthUserId(result.data);
    setAuthSession(token, userId, refreshedRefreshToken);
    api.dispatch(authSessionChanged({ token, refreshToken: refreshedRefreshToken, userId }));
    return { token, refreshToken: refreshedRefreshToken, userId };
  })().finally(() => {
    refreshRequest = null;
  });

  return refreshRequest;
}

const baseQueryWithAuthHandling: BaseQueryFn<string | FetchArgs, unknown, ApiError> = async (
  args,
  api,
  extraOptions,
) => {
  let result = await rawBaseQuery(args, api, extraOptions);
  if ("error" in result) {
    let error = result.error as FetchBaseQueryError;
    let status = typeof error.status === "number" ? error.status : undefined;
    const requestUrl = typeof args === "string" ? args : args.url;
    if (status === 401 && !isLoginEndpoint(requestUrl) && !isAuthRefreshEndpoint(args)) {
      const refreshedSession = await refreshAuthSession(api, extraOptions);
      if (refreshedSession) {
        result = await rawBaseQuery(args, api, extraOptions);
        if (!("error" in result)) {
          return { data: result.data };
        }
        error = result.error as FetchBaseQueryError;
        status = typeof error.status === "number" ? error.status : undefined;
      }
    }
    const data = "data" in error ? error.data : undefined;
    const message =
      status === undefined && "error" in error && typeof error.error === "string"
        ? error.error
        : extractApiErrorMessage(data, "Request failed.");
    if (status === 401) {
      clearAuthSession();
      api.dispatch(authSessionChanged({ isAuthenticated: false }));
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
    // Existing
    "Auth",
    "GridColumns",
    "ItemLookup",
    "GodownLookup",
    "MenuMasters",
    // Business context
    "CompanyList",
    "BranchList",
    "FiscalYearList",
    // Generic master list (keyed by list URL)
    "MasterList",
    // Per-module lookup caches (invalidated by masters saga on save)
    "UnitLookup",
    "TaxLookup",
    "BranchLookup",
    "CompanyLookup",
    "UserLookup",
    // Stock modules
    "OpeningStock",
    "PhysicalStock",
  ],
  endpoints: () => ({}),
});
