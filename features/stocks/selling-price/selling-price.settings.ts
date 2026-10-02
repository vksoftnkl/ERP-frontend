/**
 * The app settings Change Selling Price obeys — the one the Qt screen reads
 * through `AppSession::belowCostPriceSetting()` (`inventory.below_cost_price`).
 *
 * It only paints: a below-cost price is red under `restrict` and amber
 * otherwise. The SERVER resolves the same key for every save and is the rule;
 * this copy decides which colour the operator sees before pressing Save.
 *
 * Pure: `use-selling-price-settings.ts` fetches, this file decides.
 */
import type { EffectiveSetting } from "@/features/settings/app-settings/types";
import type { BelowCostPolicy } from "./selling-price.types";

export const SELLING_PRICE_SETTING_KEYS = {
  belowCostPrice: "inventory.below_cost_price",
} as const;

export const BELOW_COST_POLICIES: readonly BelowCostPolicy[] = ["restrict", "warning", "allow"];

export type SellingPriceSettings = {
  belowCostPrice: BelowCostPolicy;
};

/**
 * The catalog's default: `warning`, so a below-cost save normally asks — the
 * confirm round trip is the common path.
 */
export const DEFAULT_SELLING_PRICE_SETTINGS: SellingPriceSettings = {
  belowCostPrice: "warning",
};

function valueOf(rows: readonly EffectiveSetting[] | undefined, key: string): string | null {
  const row = rows?.find((candidate) => candidate.asdKey === key);
  if (!row) {
    return null;
  }
  return row.value ?? row.asdDefaultValue ?? null;
}

/**
 * A blank value or a token outside the catalog's three falls back to the
 * seeded default — the same reading the server's `resolveBelowCostPolicy`
 * makes, so the two never disagree about what is allowed.
 */
export function parseBelowCostPolicy(value: string | null | undefined): BelowCostPolicy {
  const text = (value ?? "").trim().toLowerCase();
  return (BELOW_COST_POLICIES as readonly string[]).includes(text)
    ? (text as BelowCostPolicy)
    : DEFAULT_SELLING_PRICE_SETTINGS.belowCostPrice;
}

export function parseSellingPriceSettings(
  rows: readonly EffectiveSetting[] | undefined,
): SellingPriceSettings {
  if (!rows) {
    return DEFAULT_SELLING_PRICE_SETTINGS;
  }
  return {
    belowCostPrice: parseBelowCostPolicy(valueOf(rows, SELLING_PRICE_SETTING_KEYS.belowCostPrice)),
  };
}
