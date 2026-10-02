"use client";

/**
 * The count screen's settings, read once per company + branch + user + device
 * (`system.txn_entry_first` is a USER-scope setting). Until the rows arrive
 * the catalog defaults apply; `settled` says when the answer — or a failure —
 * is in, so the route can choose its first view exactly once.
 */
import { useMemo } from "react";
import { getAuthUserId, getUserInfo } from "@/lib/auth/session";
import { useGetEffectiveSettingsQuery } from "@/store/api/appSettingsApi";
import {
  DEFAULT_PHYSICAL_STOCK_SETTINGS,
  parsePhysicalStockSettings,
  type PhysicalStockSettings,
} from "./physical-stock.settings";

export function usePhysicalStockSettings(
  companyId: string,
  branchId: string,
): { settings: PhysicalStockSettings; settled: boolean } {
  const userId = getAuthUserId() ?? "";
  const deviceId = getUserInfo()?.deviceId ?? "";
  const { data, isSuccess, isError } = useGetEffectiveSettingsQuery(
    {
      companyId,
      branchId,
      ...(userId ? { userId } : {}),
      ...(deviceId ? { deviceId } : {}),
    },
    { skip: !companyId },
  );
  return useMemo(
    () => ({
      settings: data ? parsePhysicalStockSettings(data) : DEFAULT_PHYSICAL_STOCK_SETTINGS,
      settled: isSuccess || isError,
    }),
    [data, isError, isSuccess],
  );
}
