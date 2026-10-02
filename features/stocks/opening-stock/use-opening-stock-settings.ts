"use client";

/**
 * The Opening Stock screen's settings, read once per company + branch, parsed
 * by `opening-stock.settings.ts`. Until the rows arrive the catalog defaults
 * apply; `loaded` says when the answer is in.
 */
import { useMemo } from "react";
import { useGetEffectiveSettingsQuery } from "@/store/api/appSettingsApi";
import {
  DEFAULT_OPENING_STOCK_SETTINGS,
  parseOpeningStockSettings,
  type OpeningStockSettings,
} from "./opening-stock.settings";

export function useOpeningStockSettings(
  companyId: string,
  branchId: string,
): { settings: OpeningStockSettings; loaded: boolean } {
  const { data, isSuccess, isError } = useGetEffectiveSettingsQuery(
    { companyId, branchId },
    { skip: !companyId },
  );
  return useMemo(
    () => ({
      settings: data ? parseOpeningStockSettings(data) : DEFAULT_OPENING_STOCK_SETTINGS,
      // A failed read is "loaded" too: the defaults are the answer then.
      loaded: isSuccess || isError,
    }),
    [data, isError, isSuccess],
  );
}
