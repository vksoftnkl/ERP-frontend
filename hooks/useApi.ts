import axios, { type AxiosResponse } from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import {
  clearAuthSession,
  extractAuthToken,
  extractAuthUserId,
  extractRefreshToken,
  getAuthSession,
  getRefreshToken,
  extractUserInfo,
  setAuthSession,
} from "@/lib/auth/session";
import { notifyDataChanged, useDataRefresh } from "@/lib/data-freshness";
import { notifyGlobalNavigationStart } from "@/lib/navigation/global-loader";
import { useAppDispatch } from "@/store/hooks";
import { authSessionChanged } from "@/store/slices/authSlice";
import {
  globalLoaderFinished,
  globalLoaderStarted,
} from "@/store/slices/globalLoaderSlice";
type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type UseApiToastOptions = {
  success?: boolean;
  error?: boolean;
  successMessage?: string;
  errorMessage?: string;
};
type UseApiOptions<TBody> = {
  method?: ApiMethod;
  headers?: Record<string, string>;
  body?: TBody; // optional default body
  toast?: UseApiToastOptions;
  // Set true on a GET hook whose `data` is what the screen renders: the hook then
  // repeats its last request in the background whenever the app decides on-screen
  // data may be stale (tab refocused, network back, something saved here or in
  // another tab), so what is rendered follows the database without a reload.
  // Off by default because most callers here read the payload from the returned
  // promise instead - those refresh through useDataRefresh/useDataRefreshToken,
  // which re-runs the loader that owns the state.
  autoRefresh?: boolean;
};
type UseApiRunOverride<TBody> = {
  body?: TBody;
  query?: Record<string, string>;
  url?: string;
};
const DEFAULT_API_PORT = "3010";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, "");
}

function resolveLoopbackHostname(hostname: string): string {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized === "::1" || normalized === "[::1]") {
    return "127.0.0.1";
  }
  return hostname;
}
function resolveDefaultApiBase(): string {
  if (typeof window === "undefined") {
    return `https://localhost:${DEFAULT_API_PORT}/api/v1`;
  }
  const protocol = window.location.protocol === "http:" ? "http:" : "https:";
  const apiHostname = resolveLoopbackHostname(window.location.hostname);
  return `${protocol}//${apiHostname}:${DEFAULT_API_PORT}/api/v1`;
}
function resolveApiBase(): string {
  const configuredApiBase = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (!configuredApiBase) {
    return resolveDefaultApiBase();
  }
  if (typeof window === "undefined") {
    return trimTrailingSlash(configuredApiBase);
  }
  try {
    const resolvedUrl = new URL(configuredApiBase);
    const currentHostname = window.location.hostname;
    const resolvedHostname = resolvedUrl.hostname.toLowerCase();
    const resolvedIsLocal = LOCAL_HOSTNAMES.has(resolvedHostname);
    const currentIsLocal = LOCAL_HOSTNAMES.has(currentHostname.toLowerCase());
    // Keep local-host defaults convenient while still working from LAN-hosted frontend URLs.
    if (resolvedIsLocal && !currentIsLocal) {
      resolvedUrl.hostname = currentHostname;
    }
    // Same loopback normalisation the default base gets, so a configured
    // localhost URL resolves to the one host name the dev certificate covers.
    resolvedUrl.hostname = resolveLoopbackHostname(resolvedUrl.hostname);
    // Avoid forcing HTTPS API calls when the app itself is served over plain HTTP.
    if (window.location.protocol === "http:" && resolvedUrl.protocol === "https:") {
      resolvedUrl.protocol = "http:";
    }
    return trimTrailingSlash(resolvedUrl.toString());
  } catch {
    return trimTrailingSlash(configuredApiBase);
  }
}
const API_BASE = resolveApiBase();
function isMutationMethod(method: ApiMethod): boolean {
  return method !== "GET";
}
function defaultSuccessMessage(method: ApiMethod): string {
  if (method === "DELETE") {
    return "Deleted successfully.";
  }
  if (method === "POST") {
    return "Saved successfully.";
  }
  if (method === "PUT" || method === "PATCH") {
    return "Updated successfully.";
  }
  return "Request completed successfully.";
}
function extractMessage(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const combined = value
      .map((entry) => extractMessage(entry))
      .filter((entry) => entry.length > 0)
      .join(", ");
    return combined.trim();
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferredKeys = ["message", "error", "detail", "title", "errors"] as const;
    for (const key of preferredKeys) {
      const nested = extractMessage(record[key]);
      if (nested) {
        return nested;
      }
    }
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return "";
}
function normalizeMessage(value: unknown, fallback: string): string {
  const extracted = extractMessage(value);
  return extracted || fallback;
}
function isCanceledRequestError(error: unknown): boolean {
  if (axios.isCancel(error)) {
    return true;
  }
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as { code?: unknown; name?: unknown; message?: unknown };
  return (
    record.code === "ERR_CANCELED" ||
    record.name === "AbortError" ||
    record.name === "CanceledError" ||
    record.message === "canceled"
  );
}
function showErrorToast(message: unknown): void {
  const normalizedMessage = normalizeMessage(message, "Something went wrong");
  toast.error(normalizedMessage, { toastId: `api-error:${normalizedMessage}` });
}
function showSuccessToast(message: unknown): void {
  const normalizedMessage = normalizeMessage(message, "Success");
  toast.success(normalizedMessage);
}
function getPathname(requestUrl: string): string {
  const trimmedUrl = requestUrl.trim();
  if (!trimmedUrl) {
    return "";
  }
  try {
    return new URL(trimmedUrl, "http://localhost").pathname.toLowerCase();
  } catch {
    return trimmedUrl.toLowerCase().split("?")[0];
  }
}
// The only routes the API marks @Public(); everything else this hook can reach
// needs a bearer token, so a missing one is worth a refresh before giving up.
const PUBLIC_AUTH_PATHS = ["/auth/login", "/auth/refresh"] as const;
const SESSION_EXPIRED_MESSAGE = "Session expired. Please login again.";
// Thrown when there is no usable token to send: it takes the same logout path as
// a 401 from the server without pretending a request was ever made.
class SessionExpiredError extends Error {
  constructor() {
    super(SESSION_EXPIRED_MESSAGE);
    this.name = "SessionExpiredError";
  }
}
function matchesPath(requestUrl: string, path: string): boolean {
  const pathname = getPathname(requestUrl);
  return pathname === path || pathname.endsWith(path);
}
function isLoginEndpoint(requestUrl: string): boolean {
  return matchesPath(requestUrl, "/auth/login");
}
function isPublicEndpoint(requestUrl: string): boolean {
  return PUBLIC_AUTH_PATHS.some((path) => matchesPath(requestUrl, path));
}
function hasAuthorizationHeader(headers: Record<string, string>): boolean {
  return Object.keys(headers).some(
    (headerName) => headerName.toLowerCase() === "authorization"
  );
}
// Worth retrying once behind a token refresh: a protected request the server
// rejected as unauthorised.
function isRetriable401(error: unknown, publicRequest: boolean): boolean {
  return !publicRequest && axios.isAxiosError(error) && error.response?.status === 401;
}
function redirectToLogin(): void {
  if (typeof window === "undefined") {
    return;
  }
  const currentRoute = `${window.location.pathname}${window.location.search}`;
  if (window.location.pathname === "/login") {
    return;
  }
  notifyGlobalNavigationStart();
  window.location.replace(`/login?next=${encodeURIComponent(currentRoute)}`);
}
function buildHeaders(
  requestUrl: string,
  providedHeaders?: Record<string, string>
): Record<string, string> {
  const nextHeaders = { ...(providedHeaders ?? {}) };
  if (hasAuthorizationHeader(nextHeaders) || isPublicEndpoint(requestUrl)) {
    return nextHeaders;
  }
  const token = getAuthSession()?.trim();
  if (!token) {
    return nextHeaders;
  }
  nextHeaders.Authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  return nextHeaders;
}
let refreshRequest: Promise<boolean> | null = null;
async function refreshAuthSession(dispatch: ReturnType<typeof useAppDispatch>): Promise<boolean> {
  if (refreshRequest) {
    return refreshRequest;
  }
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return false;
  }
  refreshRequest = axios
    .post<unknown>(
      "/auth/refresh",
      { refresh_token: refreshToken },
      { baseURL: API_BASE || undefined },
    )
    .then((response) => {
      const token = extractAuthToken(response.data);
      if (!token) {
        return false;
      }
      const nextRefreshToken = extractRefreshToken(response.data) ?? refreshToken;
      const userId = extractAuthUserId(response.data);
      // The refresh response reports the user block too; passing it keeps the
      // stored one current instead of leaving setAuthSession to preserve it.
      const userInfo = extractUserInfo(response.data);
      setAuthSession(token, userId, nextRefreshToken, userInfo);
      dispatch(
        authSessionChanged({
          token,
          refreshToken: nextRefreshToken,
          userId,
          ...(userInfo ? { userInfo } : {}),
        }),
      );
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshRequest = null;
    });
  return refreshRequest;
}

export function useApi<TResp = unknown, TBody = unknown>(
  url: string,
  options: UseApiOptions<TBody> = {}
) {
  const dispatch = useAppDispatch();
  const {
    method = "GET",
    headers,
    body: defaultBody,
    toast: toastOptions,
    autoRefresh = false,
  } = options;
  const [data, setData] = useState<TResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Background revalidation only makes sense for a read that has already run once:
  // it repeats that exact request and refreshes `data` in place.
  const canAutoRefresh = autoRefresh && !isMutationMethod(method);
  const hasLoadedRef = useRef(false);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const lastRunOverrideRef = useRef<UseApiRunOverride<TBody> | undefined>(undefined);
  const headersRef = useRef(headers);
  const defaultBodyRef = useRef(defaultBody);
  const toastOptionsRef = useRef(toastOptions);
  headersRef.current = headers;
  defaultBodyRef.current = defaultBody;
  toastOptionsRef.current = toastOptions;
  const run = useCallback(
    async (override?: UseApiRunOverride<TBody>): Promise<TResp | undefined> => {
      abortRef.current?.abort();
      // Drop any background revalidation already in flight: it reads the previous
      // query and would otherwise land after this one and overwrite `data` with it.
      refreshAbortRef.current?.abort();
      refreshAbortRef.current = null;
      const controller = new AbortController();
      abortRef.current = controller;
      const requestOverride = override
        ? {
            ...override,
            query: override.query ? { ...override.query } : undefined,
          }
        : undefined;
      lastRunOverrideRef.current = requestOverride;
      const requestUrl = requestOverride?.url ?? url;
      const loginRequest = isLoginEndpoint(requestUrl);
      const publicRequest = isPublicEndpoint(requestUrl);
      const activeToastOptions = toastOptionsRef.current;
      const shouldToastSuccess =
        (activeToastOptions?.success ?? isMutationMethod(method)) && !loginRequest;
      const shouldToastError = activeToastOptions?.error ?? true;
      const successMessage =
        activeToastOptions?.successMessage ?? defaultSuccessMessage(method);
      // Rebuilt per attempt rather than replayed from the failed response's config:
      // axios has already serialised the body by then, and handing the string back
      // without the JSON content type posts it as text/plain (an empty body to Nest).
      const execute = (requestHeaders: Record<string, string>) =>
        axios.request<TResp>({
          url: requestUrl,
          method,
          baseURL: API_BASE || undefined,
          headers: requestHeaders,
          params: requestOverride?.query,
          data:
            method === "GET"
              ? undefined
              : requestOverride?.body ?? defaultBodyRef.current,
          signal: controller.signal,
        });
      setLoading(true);
      dispatch(globalLoaderStarted());
      setError(null);
      try {
        let requestHeaders = buildHeaders(requestUrl, headersRef.current);
        if (!publicRequest && !hasAuthorizationHeader(requestHeaders)) {
          // The access token is gone, but the refresh token may still be good:
          // renew quietly instead of throwing the user out mid-action.
          const refreshed = await refreshAuthSession(dispatch);
          requestHeaders = refreshed
            ? buildHeaders(requestUrl, headersRef.current)
            : requestHeaders;
          if (!hasAuthorizationHeader(requestHeaders)) {
            throw new SessionExpiredError();
          }
        }
        let resp: AxiosResponse<TResp>;
        try {
          resp = await execute(requestHeaders);
        } catch (e: unknown) {
          if (!isRetriable401(e, publicRequest)) {
            throw e;
          }
          const refreshed = await refreshAuthSession(dispatch);
          if (!refreshed) {
            // Leave the original 401 to the error path below, which logs out.
            throw e;
          }
          resp = await execute(buildHeaders(requestUrl, headersRef.current));
        }
        const json = resp.data as TResp;
        setData(json);
        hasLoadedRef.current = true;
        if (isMutationMethod(method)) {
          // Tell the rest of this tab - and every other open tab - to re-read, so a
          // save here shows up in lists, modals and dropdowns that are already open.
          notifyDataChanged(getPathname(requestUrl));
        }
        if (shouldToastSuccess) {
          showSuccessToast(successMessage);
        }
        return json;
      } catch (e: unknown) {
        if (isCanceledRequestError(e)) {
          return undefined;
        }
        const axiosError = axios.isAxiosError(e) ? e : null;
        const sessionExpired =
          e instanceof SessionExpiredError || isRetriable401(e, publicRequest);
        let message: string;
        if (sessionExpired) {
          // Whatever the server called it, this only ever means one thing to the
          // user - and they are about to land on the login page.
          message = SESSION_EXPIRED_MESSAGE;
          clearAuthSession();
          dispatch(authSessionChanged({ isAuthenticated: false }));
          redirectToLogin();
        } else if (axiosError && !axiosError.response && axiosError.code === "ERR_NETWORK") {
          const currentOrigin =
            typeof window === "undefined" ? "the current origin" : window.location.origin;
          message =
            `Network error while connecting to API (${API_BASE}). Verify backend is running, CORS allows ${currentOrigin}, and HTTPS cert is trusted in Chrome.`;
        } else if (axiosError) {
          message = normalizeMessage(
            axiosError.response?.data as unknown,
            normalizeMessage(axiosError.message, "Something went wrong")
          );
        } else {
          message = normalizeMessage(e, "Something went wrong");
        }
        setError(message);
        if (shouldToastError) {
          showErrorToast(activeToastOptions?.errorMessage ?? message);
        }
        throw e;
      } finally {
        dispatch(globalLoaderFinished());
        if (abortRef.current === controller) {
          abortRef.current = null;
          setLoading(false);
        }
      }
    },
    [dispatch, url, method]
  );
  // Repeat the last read in the background and swap `data` for what the server
  // returns now. Deliberately quiet: no global loader, no toast, and a failure
  // leaves whatever is already on screen untouched.
  const refreshInBackground = useCallback(async (): Promise<TResp | undefined> => {
    // Callable by hand even when the automatic subscription is off (autoRefresh: false),
    // so a screen can post-process the payload itself.
    if (isMutationMethod(method) || !hasLoadedRef.current || abortRef.current) {
      return undefined;
    }
    const lastOverride = lastRunOverrideRef.current;
    const requestUrl = lastOverride?.url ?? url;
    const requestHeaders = buildHeaders(requestUrl, headersRef.current);
    if (!hasAuthorizationHeader(requestHeaders)) {
      // No session to refresh with - the next user action reports that properly.
      return undefined;
    }
    refreshAbortRef.current?.abort();
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    try {
      const response = await axios.request<TResp>({
        url: requestUrl,
        method,
        baseURL: API_BASE || undefined,
        headers: requestHeaders,
        params: lastOverride?.query,
        signal: controller.signal,
      });
      // A user-triggered run started meanwhile: that one owns the state.
      if (abortRef.current) {
        return undefined;
      }
      const json = response.data as TResp;
      setData(json);
      return json;
    } catch {
      // Keep the currently rendered data; this refresh was never asked for.
      return undefined;
    } finally {
      if (refreshAbortRef.current === controller) {
        refreshAbortRef.current = null;
      }
    }
  }, [method, url]);
  useDataRefresh(
    () => {
      void refreshInBackground();
    },
    { enabled: canAutoRefresh },
  );
  useEffect(() => {
    return () => {
      // Nothing this hook started outlives the screen that owns it: a reply landing
      // after unmount only toasts over the next page and updates state nobody reads.
      abortRef.current?.abort();
      abortRef.current = null;
      refreshAbortRef.current?.abort();
      refreshAbortRef.current = null;
    };
  }, []);
  const reset = useCallback(() => {
    refreshAbortRef.current?.abort();
    refreshAbortRef.current = null;
    hasLoadedRef.current = false;
    setData(null);
    setError(null);
    setLoading(false);
  }, []);
  const getAll = useCallback(
    async (query?: Record<string, string>) => run({ query }),
    [run]
  );
  return { data, loading, error, run, getAll, reset, refresh: refreshInBackground };
}
