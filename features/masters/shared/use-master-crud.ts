"use client";
import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/hooks/useApi";
import { useDataRefresh } from "@/lib/data-freshness";
import type { CrudMasterApiEndpoints } from "@/components/master/crud-master-page";
import { normalizeListResponse } from "./normalizers";
type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type UseMasterCrudArgs = {
  apiEndpoints: CrudMasterApiEndpoints;
  listArrayKeys?: readonly string[];
  getByIdMethod?: ApiMethod;
  buildListQuery?: (params: {
    searchTerm: string;
    currentPage: number;
    pageSize: number;
  }) => Record<string, string>;
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
  buildListQuery,
  debounceMs = 300,
  defaultPage = 1,
  defaultPageSize = 20,
}: UseMasterCrudArgs) {
  // Background refreshing is driven by hand below rather than through `autoRefresh`:
  // the rows and the paging metadata under them have to be applied together.
  const {
    data,
    error,
    loading,
    getAll,
    refresh: refreshList,
  } = useApi<unknown>(apiEndpoints.list);
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
  const applyListMeta = useCallback(
    (payload: unknown) => {
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
    },
    [defaultPage, defaultPageSize, listArrayKeys],
  );
  const loadRecords = useCallback(
    async (term: string, page: number, limit: number) => {
      const normalizedTerm = term.trim();
      const safePage = Math.max(1, page);
      const safeLimit = Math.max(1, limit);
      const query =
        buildListQuery?.({
          searchTerm: normalizedTerm,
          currentPage: safePage,
          pageSize: safeLimit,
        }) ?? {
          page: String(safePage),
          limit: String(safeLimit),
          ...(normalizedTerm ? { search: normalizedTerm } : {}),
        };
      const payload = await getAll(query);
      applyListMeta(payload);
      return payload;
    },
    [applyListMeta, buildListQuery, getAll],
  );
  const reload = useCallback(() => loadRecords(searchTerm, currentPage, pageSize), [
    currentPage,
    loadRecords,
    pageSize,
    searchTerm,
  ]);
  // Re-read the page currently on screen whenever the app says the data behind it
  // may have moved (tab refocused, network back, a save here or in another tab).
  // It goes through the quiet path: no spinner, no toast, rows swap in place.
  useDataRefresh(() => {
    void (async () => {
      const payload = await refreshList();
      if (payload !== undefined) {
        applyListMeta(payload);
      }
    })();
  });
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
