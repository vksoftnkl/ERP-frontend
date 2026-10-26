/**
 * The app settings this screen obeys. The Qt count screen reads two:
 *
 *   system.txn_entry_first   menu 45 lands on the LIST (false, the catalog
 *                            default) or on the count screen itself (true),
 *                            whose Ctrl+O then reaches the same list — read
 *                            through the shared list (`TxnMainView::openForMenu`).
 *   stock.auto_batch_no      the company numbers its own batches (textile), so
 *                            a scanned code that is no item's barcode may be a
 *                            batch LABEL (AppSession `autoBatchNo()`, Qt 74b755c).
 *
 * `system.txn_entry_first`'s max scope is USER, so the settings are read with
 * the user and device ids as well as the company and branch. Pure:
 * `use-physical-stock-settings.ts` fetches.
 */
import type { EffectiveSetting } from "@/features/settings/app-settings/types";
import { AUTO_BATCH_NO_SETTING_KEY } from "@/features/stocks/shared/batch-detail";

export const PHYSICAL_STOCK_SETTING_KEYS = {
  txnEntryFirst: "system.txn_entry_first",
  autoBatchNo: AUTO_BATCH_NO_SETTING_KEY,
} as const;

export type PhysicalStockSettings = {
  txnEntryFirst: boolean;
  autoBatchNo: boolean;
};

/** The catalog's default — an unread setting behaves as an untouched installation. */
export const DEFAULT_PHYSICAL_STOCK_SETTINGS: PhysicalStockSettings = {
  txnEntryFirst: false,
  autoBatchNo: false,
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
    autoBatchNo: asBoolean(
      valueOf(rows, PHYSICAL_STOCK_SETTING_KEYS.autoBatchNo),
      DEFAULT_PHYSICAL_STOCK_SETTINGS.autoBatchNo,
    ),
  };
}
