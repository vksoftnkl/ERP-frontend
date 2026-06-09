"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  pageChanged,
  pageSizeChanged,
  searchChanged,
  selectMasterModule,
  totalEntriesUpdated,
} from "@/store/slices/mastersSlice";
import {
  useLazyMasterGetByIdQuery,
  useLazyMasterListQuery,
  useMasterDeleteMutation,
  useMasterSaveMutation,
} from "@/store/api/mastersApi";
import { normalizeListResponse } from "@/features/masters/shared/normalizers";
import type { CrudMasterApiEndpoints } from "@/components/master/crud-master-page";
type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type UseMasterModuleArgs = {
  apiEndpoints: CrudMasterApiEndpoints;
  listArrayKeys?: readonly string[];
  getByIdMethod?: ApiMethod;
  buildListQuery?: (params: {
    searchTerm: string;
    currentPage: number;
    pageSize: number;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }) => Record<string, string>;
  debounceMs?: number;
  defaultPage?: number;
  defaultPageSize?: number;
};
/** Derives a stable module key from the create endpoint URL. */
function deriveModuleKey(createUrl: string): string {
  return createUrl.replace(/\/create$/, "").replace(/^\//, "");
}
/**
 * Drop-in replacement for `useMasterCrud` that uses RTK Query for HTTP
 * operations and persists pagination/search state in Redux so they survive
 * navigation between pages.
 *
 * Return type is identical to `useMasterCrud` so `CrudMasterPage` requires
 * only a single import-line change.
 */
export function useMasterModule({
  apiEndpoints,
  listArrayKeys,
  getByIdMethod = "GET",
  buildListQuery,
  debounceMs = 300,
  defaultPage = 1,
  defaultPageSize = 20,
}: UseMasterModuleArgs) {
  const dispatch = useAppDispatch();
  const moduleKey = deriveModuleKey(apiEndpoints.create);
  const moduleState = useAppSelector((s) => selectMasterModule(s, moduleKey));
  const currentPage = moduleState.currentPage;
  const pageSize = moduleState.pageSize;
  const searchTerm = moduleState.searchTerm;
  const totalEntries = moduleState.totalEntries;
  // RTK Query hooks
  const [fetchList, listResult] = useLazyMasterListQuery();
  const [fetchById, detailResult] = useLazyMasterGetByIdQuery();
  const [saveMutation, saveResult] = useMasterSaveMutation();
  const [deleteMutation, deleteResult] = useMasterDeleteMutation();
  // Track whether an initial load has happened to avoid duplicate fetches
  const initialLoadRef = useRef(false);
  const sortByRef = useRef<string | undefined>(undefined);
  const sortDirRef = useRef<"asc" | "desc" | undefined>(undefined);
  // ── List loading ──────────────────────────────────────────────────────────
  const loadRecords = useCallback(
    async (term: string, page: number, limit: number) => {
      const normalizedTerm = term.trim();
      const safePage = Math.max(1, page);
      const safeLimit = Math.max(1, limit);
      const sortBy = sortByRef.current;
      const sortDir = sortDirRef.current;
      const query =
        buildListQuery?.({
          searchTerm: normalizedTerm,
          currentPage: safePage,
          pageSize: safeLimit,
          sortBy,
          sortDir,
        }) ?? {
          page: String(safePage),
          limit: String(safeLimit),
          ...(normalizedTerm ? { search: normalizedTerm } : {}),
          ...(sortBy ? { sort_by: sortBy } : {}),
          ...(sortBy && sortDir ? { sort_dir: sortDir } : {}),
        };
      let payload: unknown;
      try {
        payload = await fetchList({
          url: apiEndpoints.list,
          params: query,
        }).unwrap();
      } catch {
        return undefined;
      }
      const normalized = normalizeListResponse(payload, listArrayKeys);
      dispatch(
        totalEntriesUpdated({
          moduleKey,
          total: normalized.totalEntries,
          page: normalized.currentPage ?? undefined,
          pageSize: normalized.pageSize ?? undefined,
        }),
      );
      return payload;
    },
    [
      apiEndpoints.list,
      buildListQuery,
      dispatch,
      fetchList,
      listArrayKeys,
      moduleKey,
    ],
  );
  const reload = useCallback(
    () => loadRecords(searchTerm, currentPage, pageSize),
    [currentPage, loadRecords, pageSize, searchTerm],
  );
  // Debounced auto-load whenever pagination/search state changes
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      initialLoadRef.current = true;
      void loadRecords(searchTerm, currentPage, pageSize);
    }, initialLoadRef.current ? debounceMs : 0);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [currentPage, debounceMs, loadRecords, pageSize, searchTerm]);
  // ── Error helpers ─────────────────────────────────────────────────────────
  const [detailLocalError, setDetailLocalError] = useState<string | null>(null);
  const [saveLocalError, setSaveLocalError] = useState<string | null>(null);
  const [deleteLocalError, setDeleteLocalError] = useState<string | null>(null);
  function extractMsg(err: unknown): string {
    if (err && typeof err === "object" && "message" in err) {
      const m = (err as { message?: unknown }).message;
      if (typeof m === "string" && m.trim()) return m.trim();
    }
    return "Request failed.";
  }
  // ── Return interface (identical to useMasterCrud) ─────────────────────────
  return {
    list: {
      currentPage,
      data: listResult.data ?? null,
      error: listResult.isError ? extractMsg(listResult.error) : null,
      loadRecords,
      loading: listResult.isLoading || listResult.isFetching,
      pageSize,
      reload,
      searchTerm,
      setCurrentPage: (page: number) => dispatch(pageChanged({ moduleKey, page })),
      setPageSize: (size: number) => dispatch(pageSizeChanged({ moduleKey, size })),
      setSearchTerm: (term: string) =>
        dispatch(searchChanged({ moduleKey, term })),
      setSort: (by: string | undefined, dir?: "asc" | "desc") => {
        sortByRef.current = by;
        sortDirRef.current = dir;
        void loadRecords(searchTerm, currentPage, pageSize);
      },
      totalEntries,
    },
    details: {
      error: detailResult.isError ? extractMsg(detailResult.error) : detailLocalError,
      loading: detailResult.isLoading || detailResult.isFetching,
      reset: () => {
        setDetailLocalError(null);
      },
      run: async (override?: {
        body?: Record<string, unknown>;
        query?: Record<string, string>;
        url?: string;
      }) => {
        setDetailLocalError(null);
        try {
          return await fetchById({
            url: override?.url ?? apiEndpoints.getById,
            params: override?.query,
          }).unwrap();
        } catch (e) {
          setDetailLocalError(extractMsg(e));
          throw e;
        }
      },
    },
    remove: {
      error: deleteResult.isError ? extractMsg(deleteResult.error) : deleteLocalError,
      loading: deleteResult.isLoading,
      run: async (override?: {
        body?: unknown;
        query?: Record<string, string>;
        url?: string;
      }) => {
        setDeleteLocalError(null);
        try {
          return await deleteMutation({
            url: override?.url ?? apiEndpoints.delete,
            params: override?.query,
            listUrl: apiEndpoints.list,
            moduleKey,
          }).unwrap();
        } catch (e) {
          setDeleteLocalError(extractMsg(e));
          throw e;
        }
      },
    },
    save: {
      error: saveResult.isError ? extractMsg(saveResult.error) : saveLocalError,
      loading: saveResult.isLoading,
      reset: () => {
        saveResult.reset();
        setSaveLocalError(null);
      },
      run: async (override?: {
        body?: Record<string, unknown>;
        query?: Record<string, string>;
        url?: string;
      }) => {
        setSaveLocalError(null);
        try {
          return await saveMutation({
            url: override?.url ?? apiEndpoints.create,
            body: override?.body ?? {},
            listUrl: apiEndpoints.list,
            moduleKey,
          }).unwrap();
        } catch (e) {
          setSaveLocalError(extractMsg(e));
          throw e;
        }
      },
    },
  };
}