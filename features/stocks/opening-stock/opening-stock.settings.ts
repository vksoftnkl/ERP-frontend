/**
 * The app settings the Opening Stock screen obeys.
 *
 * The Qt screen reads exactly one, and not itself: menu 44 is opened through
 * `TxnMainView::openForMenu()`, which reads `AppSession::txnEntryFirst()`
 * (`system.txn_entry_first`) every time the menu is clicked — the LIST first
 * (the default, as the legacy TXN_POPUP was), or the voucher screen ready to
 * key with the list one key (F8) away. Everything else the screen needs is the
 * session's scope, which comes from the business context.
 *
 * Pure: `use-opening-stock-settings.ts` fetches, this file decides.
 */
import type { EffectiveSetting } from "@/features/settings/app-settings/types";

export const OPENING_STOCK_SETTING_KEYS = {
  txnEntryFirst: "system.txn_entry_first",
} as const;

export type OpeningStockSettings = {
  /** Open on the voucher screen instead of the list. */
  txnEntryFirst: boolean;
};

/** The catalog's default (`app_setting_def`): list first. */
export const DEFAULT_OPENING_STOCK_SETTINGS: OpeningStockSettings = {
  txnEntryFirst: false,
};

function valueOf(rows: readonly EffectiveSetting[], key: string): string | null {
  const row = rows.find((candidate) => candidate.asdKey === key);
  if (!row) {
    return null;
  }
  return row.value ?? row.asdDefaultValue ?? null;
}

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

export function parseOpeningStockSettings(
  rows: readonly EffectiveSetting[] | undefined,
): OpeningStockSettings {
  if (!rows) {
    return DEFAULT_OPENING_STOCK_SETTINGS;
  }
  return {
    txnEntryFirst: asBoolean(
      valueOf(rows, OPENING_STOCK_SETTING_KEYS.txnEntryFirst),
      DEFAULT_OPENING_STOCK_SETTINGS.txnEntryFirst,
    ),
  };
}
