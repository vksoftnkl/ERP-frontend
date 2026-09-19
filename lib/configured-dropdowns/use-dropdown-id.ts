"use client";
import { useMemo } from "react";
import { useGetDropdownDirectoryQuery } from "@/store/api/metadataApi";
import { resolveDropdownId, type ConfiguredDropdownKey } from "./dropdown-registry";
/**
 * The `fixed.dropdown_details.dropdown_id` a configured dropdown lives under,
 * read from Dropdown Master's Desktop rows by name.
 *
 * One small cached request shared by every caller. Until it arrives the
 * registry's fallback id is returned, so a field opens immediately; where the id
 * has moved, the next fetch is keyed by the real one.
 */
export function useDropdownId(key: ConfiguredDropdownKey | null | undefined): string {
  const { data } = useGetDropdownDirectoryQuery();
  // A field that names no dropdown still calls this, so the hook order never changes.
  return useMemo(() => (key ? resolveDropdownId(key, data) : ""), [data, key]);
}
