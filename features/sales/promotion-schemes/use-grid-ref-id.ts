"use client";

/**
 * A configured grid's id, resolved by its Grid Master NAME from the Desktop
 * rows — the same lookup `lib/configured-grids` does for its registry keys,
 * kept here so this screen's grids (the list and the nine POPUP pickers) need
 * no entries in that shared registry. The fallback id is what a list uses
 * until Grid Master's directory has arrived, or if the name is not there.
 */
import { useCallback, useMemo } from "react";
import { findGridIdByName, type GridDirectoryRow } from "@/lib/configured-grids";
import { useGetGridDirectoryQuery } from "@/store/api/metadataApi";
import type { GridRef } from "./promotion-schemes.vocab";

export function resolveGridRef(ref: GridRef, rows: readonly GridDirectoryRow[] | undefined): string {
  return (rows ? findGridIdByName(ref.name, rows) : null) ?? ref.fallbackId;
}

export function useGridRefResolver(): (ref: GridRef) => string {
  const { data } = useGetGridDirectoryQuery();
  return useCallback((ref: GridRef) => resolveGridRef(ref, data), [data]);
}

export function useGridRefId(ref: GridRef): string {
  const { data } = useGetGridDirectoryQuery();
  return useMemo(() => resolveGridRef(ref, data), [data, ref]);
}
