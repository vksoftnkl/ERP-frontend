/**
 * The app settings the Stock Adjustment screen obeys, parsed once from
 * `GET /app-setting-values/effective`. Pure; `use-stock-adjustment-settings.ts`
 * fetches.
 *
 *  - `system.txn_entry_first` — the Qt `TxnMainView::openForMenu` switch:
 *    false (the default, the legacy TXN_POPUP's) lands on the document list,
 *    true opens the voucher ready to key with the list behind F8.
 *  - `stock.expiry_writeoff_grace_days` — decision D-A2: a lot may be written
 *    off as expired up to this many days after the document date. The server
 *    applies it at save; the pick dialog uses it so the lots it offers for an
 *    expiry write-off are the ones the server will take. Default 0.
 */
import type { EffectiveSetting } from "@/features/settings/app-settings/types";

export const STOCK_ADJUSTMENT_SETTING_KEYS = {
  txnEntryFirst: "system.txn_entry_first",
  expiryGraceDays: "stock.expiry_writeoff_grace_days",
} as const;

export type StockAdjustmentSettings = {
  txnEntryFirst: boolean;
  expiryGraceDays: number;
};

export const DEFAULT_STOCK_ADJUSTMENT_SETTINGS: StockAdjustmentSettings = {
  txnEntryFirst: false,
  expiryGraceDays: 0,
};

/** `app_setting_values` stores every value as raw TEXT, whatever its type. */
function valueOf(rows: readonly EffectiveSetting[], key: string): string | null {
  const row = rows.find((candidate) => candidate.asdKey === key);
  if (!row) {
    return null;
  }
  return row.value ?? row.asdDefaultValue ?? null;
}

/** The Qt `settingBool`: true / 1 / yes / Y, case-blind; anything else is the fallback. */
function asBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null) {
    return fallback;
  }
  const text = value.trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(text)) {
    return true;
  }
  if (["false", "0", "no", "n", "off"].includes(text)) {
    return false;
  }
  return fallback;
}

/** The server's `expiryGraceDays`: an integer above 0, else 0. */
function asGraceDays(value: string | null): number {
  const days = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(days) && days > 0 ? days : 0;
}

export function parseStockAdjustmentSettings(
  rows: readonly EffectiveSetting[] | undefined,
): StockAdjustmentSettings {
  if (!rows) {
    return DEFAULT_STOCK_ADJUSTMENT_SETTINGS;
  }
  const K = STOCK_ADJUSTMENT_SETTING_KEYS;
  return {
    txnEntryFirst: asBoolean(valueOf(rows, K.txnEntryFirst), DEFAULT_STOCK_ADJUSTMENT_SETTINGS.txnEntryFirst),
    expiryGraceDays: asGraceDays(valueOf(rows, K.expiryGraceDays)),
  };
}
