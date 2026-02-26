import axios from "axios";
import { useCallback, useRef, useState } from "react";
import { toast } from "react-toastify";
import { clearAuthSession, getAuthSession } from "@/lib/auth/session";

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

function resolveDefaultApiBase(): string {
  if (typeof window === "undefined") {
    return `https://localhost:${DEFAULT_API_PORT}/api/v1`;
  }

  return `https://${window.location.hostname}:${DEFAULT_API_PORT}/api/v1`;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? resolveDefaultApiBase();

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
  const { method = "GET", headers, body: defaultBody, toast: toastOptions } = options;

  const [data, setData] = useState<TResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (override?: UseApiRunOverride<TBody>) => {
      // cancel previous request (optional)
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestUrl = override?.url ?? url;
      const loginRequest = isLoginEndpoint(requestUrl);
      const requestHeaders = buildHeaders(requestUrl, headers);
      const hasAuthorization = Object.keys(requestHeaders).some(
        (headerName) => headerName.toLowerCase() === "authorization"
      );
      const shouldToastSuccess =
        (toastOptions?.success ?? isMutationMethod(method)) && !loginRequest;
      const shouldToastError = toastOptions?.error ?? true;
      const successMessage = toastOptions?.successMessage ?? defaultSuccessMessage(method);

      if (!loginRequest && !hasAuthorization) {
        const message = "Session expired. Please login again.";
        clearAuthSession();
        setError(message);
        if (shouldToastError) {
          showErrorToast(toastOptions?.errorMessage ?? message);
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
          params: override?.query,
          data:
            method === "GET" || method === "DELETE"
              ? undefined
              : override?.body ?? defaultBody ?? {},
          signal: controller.signal,
        });

        const json = resp.data as TResp;
        setData(json);
        if (shouldToastSuccess) {
          showSuccessToast(successMessage);
        }
        return json;
      } catch (e: any) {
        if (e?.name === "AbortError" || e?.name === "CanceledError") return; // ignore cancels

        if (axios.isAxiosError(e)) {
          const statusCode = e.response?.status;
          if (!loginRequest && (statusCode === 401 || statusCode === 403)) {
            clearAuthSession();
            redirectToLogin();
          }

          const responseData = e.response?.data as unknown;
          const message = normalizeMessage(
            responseData,
            normalizeMessage(e.message, "Something went wrong")
          );
          setError(message);
          if (shouldToastError) {
            showErrorToast(toastOptions?.errorMessage ?? message);
          }
          throw e;
        }

        const message = normalizeMessage(e, "Something went wrong");
        setError(message);
        if (shouldToastError) {
          showErrorToast(toastOptions?.errorMessage ?? message);
        }
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [url, method, headers, defaultBody, toastOptions]
  );

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
