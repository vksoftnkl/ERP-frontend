/**
 * The app settings this screen obeys. The Qt count screen reads exactly one,
 * and reads it through the shared list (`TxnMainView::openForMenu`):
 *
 *   system.txn_entry_first   menu 45 lands on the LIST (false, the catalog
 *                            default) or on the count screen itself (true),
 *                            whose F8 then reaches the same list.
 *
 * Its max scope is USER, so it is read with the user and device ids as well as
 * the company and branch. Pure: `use-physical-stock-settings.ts` fetches.
 */
import type { EffectiveSetting } from "@/features/settings/app-settings/types";

export const PHYSICAL_STOCK_SETTING_KEYS = {
  txnEntryFirst: "system.txn_entry_first",
} as const;

export type PhysicalStockSettings = {
  txnEntryFirst: boolean;
};

/** The catalog's default — an unread setting behaves as an untouched installation. */
export const DEFAULT_PHYSICAL_STOCK_SETTINGS: PhysicalStockSettings = {
  txnEntryFirst: false,
};

function valueOf(rows: readonly EffectiveSetting[], key: string): string | null {
  const row = rows.find((candidate) => candidate.asdKey === key);
  if (!row) {
    return null;
  }
  return row.value ?? row.asdDefaultValue ?? null;
}

/** AppSession's settingBool: true / 1 / yes / Y, case-insensitive; anything else is false. */
function asBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null) {
    return fallback;
  }
  const text = value.trim().toLowerCase();
  return text === "true" || text === "1" || text === "yes" || text === "y";
}

export function parsePhysicalStockSettings(
  rows: readonly EffectiveSetting[] | undefined,
): PhysicalStockSettings {
  if (!rows) {
    return DEFAULT_PHYSICAL_STOCK_SETTINGS;
  }
  return {
    txnEntryFirst: asBoolean(
      valueOf(rows, PHYSICAL_STOCK_SETTING_KEYS.txnEntryFirst),
      DEFAULT_PHYSICAL_STOCK_SETTINGS.txnEntryFirst,
    ),
  };
}
