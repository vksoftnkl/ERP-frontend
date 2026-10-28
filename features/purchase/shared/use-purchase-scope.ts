"use client";

/**
 * The session's tenant for the purchase screens, and the one setting the route
 * reads before it chooses a view.
 */
import { useMemo } from "react";
import { useBusinessContext } from "@/components/layout/business-context";
import { accountingYearOf, todayIso } from "@/features/sales/quotation/quotation.utils";
import type { EffectiveSetting } from "@/features/settings/app-settings/types";
import { getUserInfo } from "@/lib/auth/session";
import type { ScreenScope } from "@/lib/screen-memory";
import { useGetEffectiveSettingsQuery } from "@/store/api/appSettingsApi";
import type { PurchaseScope } from "./purchase.types";

/** What a NEW document is raised under. */
export function usePurchaseScope(): PurchaseScope {
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim() || accountingYearOf(todayIso());
  const deviceId = getUserInfo()?.deviceId ?? "";
  return useMemo(() => ({ companyId, branchId, accYear, deviceId }), [accYear, branchId, companyId, deviceId]);
}

/** The tenant without the device — what screen memory is keyed by. */
export function usePurchaseMemoryScope(): ScreenScope {
  const { companyId, branchId, accYear } = usePurchaseScope();
  return useMemo(() => ({ companyId, branchId, accYear }), [accYear, branchId, companyId]);
}

export const TXN_ENTRY_FIRST_SETTING_KEY = "system.txn_entry_first";

/** `app_setting_values` stores TEXT; the Qt `settingBool` words are on, anything else off. */
export function parseTxnEntryFirst(
  rows: readonly Pick<EffectiveSetting, "asdKey" | "value" | "asdDefaultValue">[] | undefined,
): boolean {
  const row = rows?.find((candidate) => candidate.asdKey === TXN_ENTRY_FIRST_SETTING_KEY);
  const value = String(row?.value ?? row?.asdDefaultValue ?? "").trim().toLowerCase();
  return ["true", "1", "yes", "y", "on"].includes(value);
}

/**
 * `system.txn_entry_first` — the Qt `TxnMainView::openForMenu` switch: false
 * (the default) lands on the list, true opens the document ready to key.
 * `settled` says the answer (or the failure) is in.
 */
export function useTxnEntryFirst(companyId: string, branchId: string): { entryFirst: boolean; settled: boolean } {
  const { data, isSuccess, isError } = useGetEffectiveSettingsQuery({ companyId, branchId }, { skip: !companyId });
  return useMemo(() => ({ entryFirst: parseTxnEntryFirst(data), settled: isSuccess || isError }), [data, isError, isSuccess]);
}
