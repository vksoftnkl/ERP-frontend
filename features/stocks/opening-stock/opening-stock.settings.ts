/**
 * The app settings the Opening Stock screen obeys.
 *
 * Two, neither read by the screen itself in Qt — both are `AppSession`'s:
 *
 *  - `system.txn_entry_first`: menu 44 is opened through
 *    `TxnMainView::openForMenu()`, which reads `txnEntryFirst()` every time the
 *    menu is clicked — the LIST first (the default, as the legacy TXN_POPUP
 *    was), or the voucher screen ready to key with the list one key (F8) away.
 *  - `stock.auto_batch_no` (`autoBatchNo()`, Qt 74b755c): the company numbers
 *    its own batches. A batch-tracked line may then leave Batch No blank — the
 *    server gives it the next number on save — and carries a size, colour and
 *    model against that number (`features/stocks/shared/batch-detail`).
 *
 * Everything else the screen needs is the session's scope, which comes from the
 * business context.
 *
 * Pure: `use-opening-stock-settings.ts` fetches, this file decides.
 */
import type { EffectiveSetting } from "@/features/settings/app-settings/types";
import { AUTO_BATCH_NO_SETTING_KEY } from "@/features/stocks/shared/batch-detail";

export const OPENING_STOCK_SETTING_KEYS = {
  txnEntryFirst: "system.txn_entry_first",
  autoBatchNo: AUTO_BATCH_NO_SETTING_KEY,
} as const;

export type OpeningStockSettings = {
  /** Open on the voucher screen instead of the list. */
  txnEntryFirst: boolean;
  /** The server numbers blank batches on save; Size / Colour / Model show. */
  autoBatchNo: boolean;
};

/** The catalog's defaults (`app_setting_def`): list first, batches keyed by hand. */
export const DEFAULT_OPENING_STOCK_SETTINGS: OpeningStockSettings = {
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
    autoBatchNo: asBoolean(
      valueOf(rows, OPENING_STOCK_SETTING_KEYS.autoBatchNo),
      DEFAULT_OPENING_STOCK_SETTINGS.autoBatchNo,
    ),
  };
}
