"use client";
import { useMemo } from "react";
import { useGetGridDirectoryQuery } from "@/store/api/metadataApi";
import { resolveGridId, type ConfiguredGridKey } from "./grid-registry";
/**
 * The `fixed.grid_details.grid_id` a list is configured under, read from Grid
 * Master's Desktop rows by name.
 *
 * One small cached request shared by every caller. Until it arrives the
 * registry's fallback id is returned, so a list paints immediately; where the id
 * has moved, the list re-runs once the real id lands.
 */
export function useGridId(key: ConfiguredGridKey | null | undefined): string {
  const { data } = useGetGridDirectoryQuery();
  // A screen that names no grid still calls this, so the hook order never changes.
  return useMemo(() => (key ? resolveGridId(key, data) : ""), [data, key]);
}
