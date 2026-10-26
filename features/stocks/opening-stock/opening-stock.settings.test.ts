import { describe, expect, it } from "vitest";
import type { EffectiveSetting } from "@/features/settings/app-settings/types";
import { DEFAULT_OPENING_STOCK_SETTINGS, parseOpeningStockSettings } from "./opening-stock.settings";

function row(key: string, value: string | null, defaultValue: string | null = "false"): EffectiveSetting {
  return {
    asdId: key,
    asdKey: key,
    asdModule: "STOCK",
    asdGroup: "Batches",
    asdLabel: key,
    asdDescription: null,
    asdDataType: "BOOL",
    asdDefaultValue: defaultValue,
    asdAllowedValues: null,
    asdMinValue: null,
    asdMaxValue: null,
    asdMaxScope: "BRANCH",
    asdSortOrder: 0,
    asdNeedsRelogin: false,
    source: value === null ? "DEFAULT" : "OVERRIDE",
    value,
    override: null,
  };
}

describe("parseOpeningStockSettings", () => {
  it("defaults to the list first and batches keyed by hand", () => {
    expect(parseOpeningStockSettings(undefined)).toEqual(DEFAULT_OPENING_STOCK_SETTINGS);
    expect(parseOpeningStockSettings([])).toEqual({ txnEntryFirst: false, autoBatchNo: false });
  });

  it("reads stock.auto_batch_no as a boolean (AppSession autoBatchNo)", () => {
    expect(parseOpeningStockSettings([row("stock.auto_batch_no", "true")]).autoBatchNo).toBe(true);
    expect(parseOpeningStockSettings([row("stock.auto_batch_no", " Yes ")]).autoBatchNo).toBe(true);
    expect(parseOpeningStockSettings([row("stock.auto_batch_no", "0")]).autoBatchNo).toBe(false);
    // No override: the catalog's own default answers.
    expect(parseOpeningStockSettings([row("stock.auto_batch_no", null, "true")]).autoBatchNo).toBe(true);
    // Something that is not a boolean keeps the default rather than guessing.
    expect(parseOpeningStockSettings([row("stock.auto_batch_no", "maybe")]).autoBatchNo).toBe(false);
  });

  it("keeps the two settings apart", () => {
    const parsed = parseOpeningStockSettings([
      row("system.txn_entry_first", "true"),
      row("stock.auto_batch_no", "false"),
    ]);
    expect(parsed).toEqual({ txnEntryFirst: true, autoBatchNo: false });
  });
});
