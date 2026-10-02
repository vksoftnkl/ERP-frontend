"use client";

/**
 * The Stock Adjustment screen's settings, read once per company + branch (the
 * Sale Order's `use-sale-order-settings.ts` read). Until the rows arrive the
 * catalog defaults apply; `settled` says the answer — or the failure — is in,
 * which is what the route waits on before choosing list-first or entry-first.
 */
import { useMemo } from "react";
import { useGetEffectiveSettingsQuery } from "@/store/api/appSettingsApi";
import {
  DEFAULT_STOCK_ADJUSTMENT_SETTINGS,
  parseStockAdjustmentSettings,
  type StockAdjustmentSettings,
} from "./stock-adjustment.settings";

export function useStockAdjustmentSettings(
  companyId: string,
  branchId: string,
): { settings: StockAdjustmentSettings; settled: boolean } {
  const { data, isSuccess, isError } = useGetEffectiveSettingsQuery(
    { companyId, branchId },
    { skip: !companyId },
  );
  return useMemo(
    () => ({
      settings: data ? parseStockAdjustmentSettings(data) : DEFAULT_STOCK_ADJUSTMENT_SETTINGS,
      settled: isSuccess || isError,
    }),
    [data, isError, isSuccess],
  );
}
