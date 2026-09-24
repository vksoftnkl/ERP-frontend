"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDataRefresh } from "@/lib/data-freshness";
import { getApiErrorMessage } from "@/store/api/baseApi";
import { useGetDropdownConfigQuery, useGetDropdownRowsQuery } from "@/store/api/dropdownApi";
import { dropdownParamsKey, DROPDOWN_SEARCH_DEBOUNCE_MS } from "./api";
import { visibleDropdownColumns } from "./config";
import type { DropdownColumn, DropdownConfig, DropdownParams, DropdownRow } from "./types";

export type UseDropdownSearchArgs = {
  dropdownId: string;
  /** Whether the popup is open. Nothing is fetched until it is. */
  open: boolean;
  /** What the operator has typed. Debounced before it reaches the server. */
  search: string;
  params?: DropdownParams;
  /**
   * Placeholders whose SQL GUARDS them (`NULLIF('itoken','') IS NULL OR …`),
   * so a blank value means "no filter" and must still be sent. Leaving one out
   * fails the whole run — see `usableParams`.
   */
  keepEmptyParams?: readonly string[];
};

export type UseDropdownSearchResult = {
  config: DropdownConfig | null;
  configLoading: boolean;
  /** The columns to draw for the rows currently loaded. */
  columns: DropdownColumn[];
  rows: DropdownRow[];
  /** True while any request for this dropdown is in flight. */
  loading: boolean;
  /** A message to show in place of the list, or null. */
  errorMessage: string | null;
  /** More rows exist on the server than are loaded. */
  hasMore: boolean;
  total: number;
  loadMore: () => void;
  retry: () => void;
};

/**
 * Debounce the search text, except when the popup opens.
 *
 * A click on the chevron must not wait a quarter second for a list it could have
 * started fetching immediately, so opening flushes the current text through; only
 * subsequent typing is debounced.
 */
function useDebouncedSearch(search: string, open: boolean): string {
  const [debounced, setDebounced] = useState(search);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;
    if (debounced === search) {
      return;
    }
    const timer = window.setTimeout(
      () => setDebounced(search),
      justOpened ? 0 : DROPDOWN_SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [debounced, open, search]);

  return debounced;
}

const NO_ROWS: DropdownRow[] = [];

/**
 * The data half of a configured dropdown: its definition, and the rows for what is
 * typed into it.
 *
 * The two are dependent queries — rows are skipped until the definition resolves —
 * which is what makes "the config had not arrived yet" a state rather than a
 * dropped request. The Qt widget returns early from `requestData()` when the config
 * is missing and only retries from the config callback, and only if the popup
 * happens to be visible, so keystrokes in that window vanish.
 */
export function useDropdownSearch({
  dropdownId,
  open,
  search,
  params,
  keepEmptyParams,
}: UseDropdownSearchArgs): UseDropdownSearchResult {
  const id = String(dropdownId ?? "").trim();
  const paramsKey = dropdownParamsKey(params, keepEmptyParams);
  const debouncedSearch = useDebouncedSearch(search, open);
  /**
   * Which page of the current result set is loaded, keyed by that result set.
   *
   * Held together rather than reset from an effect: a new search or a new filter
   * is a different result set, and reading the page back as 1 the moment the key
   * changes avoids a render that asks for page 4 of a list that no longer exists.
   */
  const [pageState, setPageState] = useState({ key: "", page: 1 });

  const configQuery = useGetDropdownConfigQuery(id, { skip: !id });
  const config = configQuery.data ?? null;

  const resultSetKey = `${id}|${debouncedSearch}|${paramsKey}`;
  const page = pageState.key === resultSetKey ? pageState.page : 1;

  const rowsQuery = useGetDropdownRowsQuery(
    { dropdownId: id, search: debouncedSearch, page, params, keepEmptyParams },
    { skip: !open || !id || !config },
  );

  const rows = rowsQuery.data?.items ?? NO_ROWS;
  const total = rowsQuery.data?.meta?.total ?? 0;
  const columns = useMemo(() => visibleDropdownColumns(config, rows), [config, rows]);

  const loadMore = useCallback(() => {
    if (rowsQuery.isFetching || rows.length === 0 || rows.length >= total) {
      return;
    }
    setPageState({ key: resultSetKey, page: page + 1 });
  }, [page, resultSetKey, rows.length, rowsQuery.isFetching, total]);

  const retry = useCallback(() => {
    if (configQuery.isError) {
      void configQuery.refetch();
    }
    if (config) {
      void rowsQuery.refetch();
    }
  }, [config, configQuery, rowsQuery]);

  // Options that were fetched imperatively go stale silently: the list a popup
  // shows is a snapshot of whenever it was last opened. Rejoin the app-wide
  // freshness signal so a save in another screen or tab is reflected here too.
  useDataRefresh(
    () => {
      if (open && config) {
        void rowsQuery.refetch();
      }
    },
    { enabled: open },
  );

  const errorMessage =
    getApiErrorMessage(configQuery.error as Parameters<typeof getApiErrorMessage>[0]) ??
    getApiErrorMessage(rowsQuery.error as Parameters<typeof getApiErrorMessage>[0]);

  return {
    config,
    configLoading: configQuery.isLoading,
    columns,
    rows,
    loading: configQuery.isLoading || rowsQuery.isFetching,
    errorMessage,
    hasMore: rows.length > 0 && rows.length < total,
    total,
    loadMore,
    retry,
  };
}
