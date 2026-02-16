import axios from "axios";
import { useCallback, useRef, useState } from "react";

type UseApiOptions<TBody> = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: TBody; // optional default body
};

type UseApiRunOverride<TBody> = {
  body?: TBody;
  query?: Record<string, string>;
  url?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://localhost:3010/api/v1";

export function useApi<TResp = unknown, TBody = unknown>(
  url: string,
  options: UseApiOptions<TBody> = {}
) {
  const { method = "GET", headers, body: defaultBody } = options;

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

      setLoading(true);
      setError(null);

      try {
        const resp = await axios.request<TResp>({
          url: requestUrl,
          method,
          baseURL: API_BASE || undefined,
          headers: {
            ...(headers ?? {}),
          },
          params: override?.query,
          data:
            method === "GET" || method === "DELETE"
              ? undefined
              : override?.body ?? defaultBody ?? {},
          signal: controller.signal,
        });

        const json = resp.data as TResp;
        setData(json);
        return json;
      } catch (e: any) {
        if (e?.name === "AbortError" || e?.name === "CanceledError") return; // ignore cancels

        if (axios.isAxiosError(e)) {
          const responseData = e.response?.data as
            | { message?: string }
            | string
            | undefined;

          const message =
            (typeof responseData === "object" ? responseData?.message : responseData) ??
            e.message ??
            "Something went wrong";
          setError(message);
          throw e;
        }

        setError(e?.message ?? "Something went wrong");
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [url, method, headers, defaultBody]
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
