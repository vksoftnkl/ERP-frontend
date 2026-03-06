"use client";

import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/hooks/useApi";
import type { CrudMasterApiEndpoints } from "@/components/master/crud-master-page";
import { normalizeListResponse } from "./normalizers";

type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type UseMasterCrudArgs = {
  apiEndpoints: CrudMasterApiEndpoints;
  listArrayKeys?: readonly string[];
  getByIdMethod?: ApiMethod;
  debounceMs?: number;
  defaultPage?: number;
  defaultPageSize?: number;
};

function toSafePageNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function toSafePageSize(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function useMasterCrud({
  apiEndpoints,
  listArrayKeys,
  getByIdMethod = "GET",
  debounceMs = 300,
  defaultPage = 1,
  defaultPageSize = 20,
}: UseMasterCrudArgs) {
  const { data, error, loading, getAll } = useApi<unknown>(apiEndpoints.list);
  const {
    run: getById,
    loading: detailsLoading,
    error: detailsError,
    reset: resetDetailsState,
  } = useApi<unknown, Record<string, unknown>>(apiEndpoints.getById, {
    method: getByIdMethod,
    toast: {
      success: false,
    },
  });
  const {
    run: upsertRecord,
    loading: saveLoading,
    error: saveError,
    reset: resetSaveState,
  } = useApi<unknown, Record<string, unknown>>(apiEndpoints.create, {
    method: "POST",
  });
  const {
    run: deleteRecord,
    loading: deleteLoading,
    error: deleteError,
  } = useApi<unknown>(apiEndpoints.delete, { method: "DELETE" });

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(defaultPage);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [totalEntries, setTotalEntries] = useState(0);

  const loadRecords = useCallback(
    async (term: string, page: number, limit: number) => {
      const normalizedTerm = term.trim();
      const query: Record<string, string> = {
        page: String(Math.max(1, page)),
        limit: String(Math.max(1, limit)),
      };

      if (normalizedTerm) {
        query.search = normalizedTerm;
      }

      const payload = await getAll(query);
      const normalized = normalizeListResponse(payload, listArrayKeys);

      setTotalEntries(normalized.totalEntries);

      if (normalized.currentPage !== null) {
        const nextPage = normalized.currentPage;
        setCurrentPage((existing) =>
          existing === nextPage
            ? existing
            : toSafePageNumber(nextPage, defaultPage),
        );
      }

      if (normalized.pageSize !== null) {
        const nextPageSize = normalized.pageSize;
        setPageSize((existing) =>
          existing === nextPageSize
            ? existing
            : toSafePageSize(nextPageSize, defaultPageSize),
        );
      }

      return payload;
    },
    [defaultPage, defaultPageSize, getAll, listArrayKeys],
  );

  const reload = useCallback(() => loadRecords(searchTerm, currentPage, pageSize), [
    currentPage,
    loadRecords,
    pageSize,
    searchTerm,
  ]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadRecords(searchTerm, currentPage, pageSize);
    }, debounceMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentPage, debounceMs, loadRecords, pageSize, searchTerm]);

  return {
    list: {
      currentPage,
      data,
      error,
      loadRecords,
      loading,
      pageSize,
      reload,
      searchTerm,
      setCurrentPage,
      setPageSize,
      setSearchTerm,
      totalEntries,
    },
    details: {
      error: detailsError,
      loading: detailsLoading,
      reset: resetDetailsState,
      run: getById,
    },
    remove: {
      error: deleteError,
      loading: deleteLoading,
      run: deleteRecord,
    },
    save: {
      error: saveError,
      loading: saveLoading,
      reset: resetSaveState,
      run: upsertRecord,
    },
  };
}
