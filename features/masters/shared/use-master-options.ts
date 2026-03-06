"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LookupDefinition, MasterOption } from "./types";
import { buildLookupOptions } from "./normalizers";

type LookupLoader = (query?: Record<string, string>) => Promise<unknown>;

type UseMasterOptionsArgs = {
  definition: LookupDefinition;
  load: LookupLoader;
  autoLoad?: boolean;
};

export function useMasterOptions({
  definition,
  load,
  autoLoad = true,
}: UseMasterOptionsArgs) {
  const fallbackOptions = useMemo<MasterOption[]>(
    () => [definition.defaultOption],
    [definition.defaultOption],
  );
  const [options, setOptions] = useState<MasterOption[]>(fallbackOptions);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setOptions(fallbackOptions);
  }, [fallbackOptions]);

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      const payload = await load(definition.query);
      const nextOptions = buildLookupOptions(payload, definition.defaultOption, definition);
      setOptions(nextOptions);
      return nextOptions;
    } catch {
      setOptions(fallbackOptions);
      return fallbackOptions;
    } finally {
      setLoading(false);
    }
  }, [definition, fallbackOptions, load]);

  useEffect(() => {
    if (!autoLoad) {
      return;
    }

    void refresh();
  }, [autoLoad, refresh]);

  return {
    loading,
    options,
    refresh,
    setOptions,
  };
}
