"use client";
import { useMemo } from "react";
import { useGetUiTableDirectoryQuery } from "@/store/api/metadataApi";
import { resolveUiTableId, type UiTableKey } from "./ui-table-registry";
/**
 * The `fixed.ui_tables` id a grid's layout lives under, read from UI Table
 * Master's Desktop rows by name.
 *
 * The list is one small cached request shared by every caller, so a screen that
 * needs two grids (items + charges) calls this twice rather than threading ids
 * around. Until it arrives the registry's fallback id is returned, so a grid
 * paints immediately; on a deployment where the id has moved, the layout query
 * keyed by this value simply re-runs once the real id lands.
 */
export function useUiTableId(key: UiTableKey | null | undefined): string {
  const { data } = useGetUiTableDirectoryQuery();
  // A screen that names no table (a master page laying its grid out from a
  // configured grid instead) still calls this, so the hook order never changes.
  return useMemo(() => (key ? resolveUiTableId(key, data) : ""), [data, key]);
}
