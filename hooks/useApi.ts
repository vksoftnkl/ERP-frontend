import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { clearAuthSession, getAuthSession } from "@/lib/auth/session";
import { useAppDispatch } from "@/store/hooks";
import { authSessionChanged } from "@/store/slices/authSlice";
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
};
type UseApiRunOverride<TBody> = {
  body?: TBody;
  query?: Record<string, string>;
  url?: string;
};
const DEFAULT_API_PORT = "3010";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const API_INVALIDATION_EVENT = "erp:api-data-invalidated";
const COLLECTION_ACTION_SEGMENTS = new Set([
  "list",
  "get",
  "create",
  "update",
  "delete",
  "save",
  "remove",
  "edit",
  "upsert",
  "bulk-create",
  "bulk-update",
  "bulk-delete",
]);

type ApiInvalidationEventDetail = {
  scope: string;
  sourcePath: string;
};
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
function normalizePathnameForMatching(requestUrl: string): string {
  const normalized = getPathname(requestUrl).trim().toLowerCase().replace(/\/+$/g, "");
  return normalized || "/";
}
function splitPathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}
function isCollectionListRequest(requestUrl: string): boolean {
  const segments = splitPathSegments(normalizePathnameForMatching(requestUrl));
  if (segments.length === 0) {
    return false;
  }
  return segments[segments.length - 1] === "list";
}
function resolveInvalidationScope(requestUrl: string): string {
  const segments = splitPathSegments(normalizePathnameForMatching(requestUrl));
  if (segments.length === 0) {
    return "/";
  }
  const lastSegment = segments[segments.length - 1];
  if (COLLECTION_ACTION_SEGMENTS.has(lastSegment)) {
    segments.pop();
  }
  if (segments.length === 0) {
    return "/";
  }
  return `/${segments.join("/")}`;
}
function scopesMatch(listenerScope: string, changedScope: string): boolean {
  return listenerScope === changedScope;
}
function emitApiInvalidation(requestUrl: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const detail: ApiInvalidationEventDetail = {
    scope: resolveInvalidationScope(requestUrl),
    sourcePath: normalizePathnameForMatching(requestUrl),
  };
  window.dispatchEvent(
    new CustomEvent<ApiInvalidationEventDetail>(API_INVALIDATION_EVENT, { detail })
  );
}
function isLoginEndpoint(requestUrl: string): boolean {
  const pathname = getPathname(requestUrl);
  return pathname === "/auth/login" || pathname.endsWith("/auth/login");
}
function redirectToLogin(): void {
  if (typeof window === "undefined") {
    return;
  }
  const currentRoute = `${window.location.pathname}${window.location.search}`;
  if (window.location.pathname === "/login") {
    return;
  }
  window.location.replace(`/login?next=${encodeURIComponent(currentRoute)}`);
}
function buildHeaders(
  requestUrl: string,
  providedHeaders?: Record<string, string>
): Record<string, string> {
  const nextHeaders = { ...(providedHeaders ?? {}) };
  const hasAuthorization = Object.keys(nextHeaders).some(
    (headerName) => headerName.toLowerCase() === "authorization"
  );
  if (hasAuthorization || isLoginEndpoint(requestUrl)) {
    return nextHeaders;
  }
  const token = getAuthSession()?.trim();
  if (!token) {
    return nextHeaders;
  }
  nextHeaders.Authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  return nextHeaders;
}
export function useApi<TResp = unknown, TBody = unknown>(
  url: string,
  options: UseApiOptions<TBody> = {}
) {
  const dispatch = useAppDispatch();
  const { method = "GET", headers, body: defaultBody, toast: toastOptions } = options;
  const [data, setData] = useState<TResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastRunOverrideRef = useRef<UseApiRunOverride<TBody> | undefined>(undefined);
  const headersRef = useRef(headers);
  const defaultBodyRef = useRef(defaultBody);
  const toastOptionsRef = useRef(toastOptions);
  headersRef.current = headers;
  defaultBodyRef.current = defaultBody;
  toastOptionsRef.current = toastOptions;
  const run = useCallback(
    async (override?: UseApiRunOverride<TBody>) => {
      // cancel previous request (optional)
      abortRef.current?.abort();
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
      const requestHeaders = buildHeaders(requestUrl, headersRef.current);
      const hasAuthorization = Object.keys(requestHeaders).some(
        (headerName) => headerName.toLowerCase() === "authorization"
      );
      const activeToastOptions = toastOptionsRef.current;
      const shouldToastSuccess =
        (activeToastOptions?.success ?? isMutationMethod(method)) && !loginRequest;
      const shouldToastError = activeToastOptions?.error ?? true;
      const successMessage =
        activeToastOptions?.successMessage ?? defaultSuccessMessage(method);
      if (!loginRequest && !hasAuthorization) {
        const message = "Session expired. Please login again.";
        clearAuthSession();
        dispatch(authSessionChanged({ isAuthenticated: false }));
        setError(message);
        if (shouldToastError) {
          showErrorToast(activeToastOptions?.errorMessage ?? message);
        }
        redirectToLogin();
        throw new Error(message);
      }
      setLoading(true);
      setError(null);
      try {
        const resp = await axios.request<TResp>({
          url: requestUrl,
          method,
          baseURL: API_BASE || undefined,
          headers: requestHeaders,
          params: requestOverride?.query,
          data:
            method === "GET"
              ? undefined
              : requestOverride?.body ?? defaultBodyRef.current ?? {},
          signal: controller.signal,
        });
        const json = resp.data as TResp;
        setData(json);
        if (!loginRequest && isMutationMethod(method)) {
          emitApiInvalidation(requestUrl);
        }
        if (shouldToastSuccess) {
          showSuccessToast(successMessage);
        }
        return json;
      } catch (e: any) {
        if (e?.name === "AbortError" || e?.name === "CanceledError") return; // ignore cancels
        if (axios.isAxiosError(e)) {
          const statusCode = e.response?.status;
          if (!loginRequest && statusCode === 401) {
            clearAuthSession();
            dispatch(authSessionChanged({ isAuthenticated: false }));
            redirectToLogin();
          }
          const responseData = e.response?.data as unknown;
          let message = normalizeMessage(
            responseData,
            normalizeMessage(e.message, "Something went wrong")
          );
          if (!statusCode && e.code === "ERR_NETWORK") {
            const currentOrigin =
              typeof window === "undefined" ? "the current origin" : window.location.origin;
            message =
              `Network error while connecting to API (${API_BASE}). Verify backend is running, CORS allows ${currentOrigin}, and HTTPS cert is trusted in Chrome.`;
          }
          setError(message);
          if (shouldToastError) {
            showErrorToast(activeToastOptions?.errorMessage ?? message);
          }
          throw e;
        }
        const message = normalizeMessage(e, "Something went wrong");
        setError(message);
        if (shouldToastError) {
          showErrorToast(activeToastOptions?.errorMessage ?? message);
        }
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [dispatch, url, method]
  );
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (method !== "GET" || !isCollectionListRequest(url)) {
      return;
    }
    const listenerScope = resolveInvalidationScope(url);
    const handleInvalidation = (event: Event) => {
      const customEvent = event as CustomEvent<ApiInvalidationEventDetail>;
      const changedScope = customEvent.detail?.scope;
      if (!changedScope || !scopesMatch(listenerScope, changedScope)) {
        return;
            }
      void run(lastRunOverrideRef.current);
    };
    window.addEventListener(API_INVALIDATION_EVENT, handleInvalidation as EventListener);
    return () => {
      window.removeEventListener(API_INVALIDATION_EVENT, handleInvalidation as EventListener);
    };
  }, [method, run, url]);
  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);
  const getAll = useCallback(
    async (query?: Record<string, string>) => run({ query }),
    [run]
  );
  return { data, loading, error, run, getAll, reset };
}
