"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDataRefresh } from "@/lib/data-freshness";
import type { LookupDefinition, MasterOption } from "./types";
import { buildLookupOptions } from "./normalizers";
type LookupLoader = (query?: Record<string, string>) => Promise<unknown>;
type UseMasterOptionsArgs = {
  definition: LookupDefinition;
  load: LookupLoader;
  autoLoad?: boolean;
};
function serializeLookupDefinition(definition: LookupDefinition): string {
  return JSON.stringify({
    arrayKeys: definition.arrayKeys ?? null,
    defaultOption: definition.defaultOption,
    idKeys: definition.idKeys ?? null,
    labelKeys: definition.labelKeys ?? null,
    query: definition.query ?? null,
  });
}
export function useMasterOptions({
  definition,
  load,
  autoLoad = true,
}: UseMasterOptionsArgs) {
  const definitionRef = useRef(definition);
  const requestIdRef = useRef(0);
  const definitionKey = useMemo(
    () => serializeLookupDefinition(definition),
    [definition],
  );
  const fallbackOptions = useMemo<MasterOption[]>(
    () => [definition.defaultOption],
    [definitionKey],
  );
  const [options, setOptions] = useState<MasterOption[]>(fallbackOptions);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    definitionRef.current = definition;
  }, [definition]);
  useEffect(() => {
    requestIdRef.current += 1;
    setLoading(false);
    setOptions(fallbackOptions);
  }, [definitionKey, fallbackOptions]);
  const refresh = useCallback(async () => {
    const currentDefinition = definitionRef.current;
    const fallback = [currentDefinition.defaultOption];
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const payload = await load(currentDefinition.query);
      const nextOptions = buildLookupOptions(
        payload,
        currentDefinition.defaultOption,
        currentDefinition,
      );
      if (requestIdRef.current === requestId) {
        setOptions(nextOptions);
      }
      return nextOptions;
    } catch {
      if (requestIdRef.current === requestId) {
        setOptions(fallback);
      }
      return fallback;
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [load]);
  useEffect(() => {
    if (!autoLoad) {
      return;
    }
    void refresh();
  }, [autoLoad, definitionKey, refresh]);
  // Options are master data: they change in the database while the form that shows
  // them stays open. Reload them on the app-wide freshness signals.
  useDataRefresh(
    () => {
      void refresh();
    },
    { enabled: autoLoad },
  );
  return {
    loading,
    options,
    refresh,
    setOptions,
  };
}
