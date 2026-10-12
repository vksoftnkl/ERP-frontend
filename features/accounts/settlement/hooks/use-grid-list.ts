"use client";

/**
 * One configured list — every page of it — and a `reload()`.
 *
 *  - Its tokens go as given: these grids bind every token they name, and an
 *    unsent one stays in the SQL as a literal word and fails the run.
 *  - A newer load wins: an answer that arrives after a later request started
 *    is dropped (generation counter), so a slow first page cannot overwrite a
 *    reload.
 *  - The runner caches an identical request for a second (@CacheTTL(1)), so a
 *    reload straight after a write could answer the old rows: a reload within
 *    that second of the last request is put off until it has turned over.
 *  - The columns are the grid's own config (Grid Master), with the screen's
 *    specs saying how each formats (`domain/grid-columns.ts`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGridId, type ConfiguredGridKey } from "@/lib/configured-grids";
import { useGetGridColumnsQuery } from "@/store/api/metadataApi";
import type { SettlementClient } from "../api/settlement-api";
import { settlementErrorMessage } from "../domain/errors";
import { mergeColumns, type ColumnAlign, type GridColumn } from "../domain/grid-columns";
import type { GridRow } from "../domain/types";

const RUNNER_CACHE_MS = 1100;

export type GridList = {
  rows: GridRow[];
  loading: boolean;
  error: string;
  loaded: boolean;
  reload: () => void;
};

export function useGridList(
  client: SettlementClient,
  grid: ConfiguredGridKey,
  params: Record<string, string> | null,
): GridList {
  const [rows, setRows] = useState<GridRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const generation = useRef(0);
  const lastStart = useRef(0);
  const timer = useRef<number | null>(null);
  const paramsKey = params ? JSON.stringify(params) : "";

  const load = useCallback(async () => {
    if (!paramsKey) return;
    const mine = (generation.current += 1);
    lastStart.current = Date.now();
    setLoading(true);
    try {
      const next = await client.gridRows(grid, JSON.parse(paramsKey) as Record<string, string>);
      if (mine !== generation.current) return;
      setRows(next);
      setError("");
      setLoaded(true);
    } catch (failure) {
      if (mine !== generation.current) return;
      setError(settlementErrorMessage(failure));
    } finally {
      if (mine === generation.current) setLoading(false);
    }
  }, [client, grid, paramsKey]);

  // Started a task later: React's dev double-mount cancels the first, so one
  // request goes out, and the effect itself sets no state.
  useEffect(() => {
    const handle = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(handle);
  }, [load]);

  useEffect(
    () => () => {
      generation.current += 1;
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const reload = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    const wait = RUNNER_CACHE_MS - (Date.now() - lastStart.current);
    if (wait <= 0) {
      timer.current = null;
      void load();
      return;
    }
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void load();
    }, wait);
  }, [load]);

  return { rows, loading, error, loaded, reload };
}

/** The grid's configured columns over the screen's specs. */
export function useGridColumns(grid: ConfiguredGridKey, fallback: readonly GridColumn[]): GridColumn[] {
  const gridId = Number.parseInt(useGridId(grid), 10);
  const { data } = useGetGridColumnsQuery({ gridId }, { skip: !Number.isFinite(gridId) });
  return useMemo(
    () =>
      mergeColumns(
        fallback,
        (data ?? []).map((column) => ({
          field: column.sqlFieldName || column.accessorKey || column.key,
          header: column.header || column.columnName || "",
          visible: column.visible !== false,
          order: column.position ?? column.order,
          align: column.align as ColumnAlign | undefined,
        })),
      ),
    [data, fallback],
  );
}
