"use client";

/**
 * The Sale Order screen's settings, read once per company + branch — the same
 * read the receipt screen makes (`use-receipt-settings.ts`), parsed by
 * `sale-order.settings.ts`. Until the rows arrive the catalog defaults apply,
 * so the screen is usable at once and merely re-seeds its defaults when the
 * answer lands (the hook re-creates a clean draft on that change).
 */
import { useMemo } from "react";
import { useGetEffectiveSettingsQuery } from "@/store/api/appSettingsApi";
import {
  DEFAULT_SALE_ORDER_SETTINGS,
  parseSaleOrderSettings,
  type SaleOrderSettings,
} from "./sale-order.settings";

export function useSaleOrderSettings(
  companyId: string,
  branchId: string,
): { settings: SaleOrderSettings; loaded: boolean } {
  const { data, isSuccess } = useGetEffectiveSettingsQuery(
    { companyId, branchId },
    { skip: !companyId },
  );
  return useMemo(
    () => ({
      settings: data ? parseSaleOrderSettings(data) : DEFAULT_SALE_ORDER_SETTINGS,
      loaded: isSuccess,
    }),
    [data, isSuccess],
  );
}
