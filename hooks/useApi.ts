"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ApiError = {
  message: string;
  status?: number;
  details?: unknown;
};

export type QueryValue = string | number | boolean | undefined | null;

type BaseOptions = {
  headers?: HeadersInit;
  query?: Record<string, QueryValue>;
};

type GetOptions = BaseOptions & {
  skip?: boolean;
};

type MutateOptions<TBody> = BaseOptions & {
  body?: TBody;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const url = new URL(path, API_BASE || window.location.origin);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const error: ApiError = {
      message: (payload as any)?.message ?? response.statusText,
      status: response.status,
      details: payload,
    };
    throw error;
  }

  return (payload as T) ?? (undefined as T);
}

export function useGet<T>(path: string, options: GetOptions = {}) {
  const { headers, query, skip } = options;
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const url = useMemo(() => buildUrl(path, query), [path, JSON.stringify(query)]);

  const refetch = useCallback(async () => {
    if (skip) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });
      const payload = await handleResponse<T>(response);
      setData(payload);
    } catch (err) {
      if ((err as any)?.name === "AbortError") return;
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
  }, [headers, skip, url]);

  useEffect(() => {
    refetch();
    return () => controllerRef.current?.abort();
  }, [refetch]);

  return { data, error, loading, refetch } as const;
}

export function useMutation<TResponse, TBody = unknown>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
) {
  const [data, setData] = useState<TResponse | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const mutate = useCallback(
    async (options: MutateOptions<TBody> = {}) => {
      const { headers, query, body } = options;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(buildUrl(path, query), {
          method,
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
        const payload = await handleResponse<TResponse>(response);
        setData(payload);
        return payload;
      } catch (err) {
        if ((err as any)?.name === "AbortError") return undefined;
        setError(err as ApiError);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [method, path],
  );

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { mutate, data, error, loading } as const;
}

export function usePost<TResponse, TBody = unknown>(path: string) {
  return useMutation<TResponse, TBody>(path, "POST");
}

export function usePut<TResponse, TBody = unknown>(path: string) {
  return useMutation<TResponse, TBody>(path, "PUT");
}

export function usePatch<TResponse, TBody = unknown>(path: string) {
  return useMutation<TResponse, TBody>(path, "PATCH");
}

export function useDelete<TResponse = void>(path: string) {
  return useMutation<TResponse, undefined>(path, "DELETE");
}
