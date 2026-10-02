"use client";

/**
 * The Change Selling Price settings, read once per company + branch (and the
 * counter and user, the layers the server resolves the same key through on
 * every save). Until the rows arrive the catalog default applies.
 */
import { useMemo } from "react";
import { useGetEffectiveSettingsQuery } from "@/store/api/appSettingsApi";
import { useAppSelector } from "@/store/hooks";
import { selectAuthUserId, selectUserInfo } from "@/store/slices/authSlice";
import {
  DEFAULT_SELLING_PRICE_SETTINGS,
  parseSellingPriceSettings,
  type SellingPriceSettings,
} from "./selling-price.settings";

export function useSellingPriceSettings(
  companyId: string,
  branchId: string,
): { settings: SellingPriceSettings; loaded: boolean } {
  const userInfo = useAppSelector(selectUserInfo);
  const userId = useAppSelector(selectAuthUserId);
  const { data, isSuccess } = useGetEffectiveSettingsQuery(
    {
      companyId,
      branchId,
      deviceId: userInfo?.deviceId ?? null,
      userId: userId ?? null,
    },
    { skip: !companyId },
  );
  return useMemo(
    () => ({
      settings: data ? parseSellingPriceSettings(data) : DEFAULT_SELLING_PRICE_SETTINGS,
      loaded: isSuccess,
    }),
    [data, isSuccess],
  );
}
