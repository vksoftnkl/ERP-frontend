import { describe, expect, it } from "vitest";
import type { EffectiveSetting } from "@/features/settings/app-settings/types";
import {
  DEFAULT_PHYSICAL_STOCK_SETTINGS,
  parsePhysicalStockSettings,
} from "./physical-stock.settings";

function setting(asdKey: string, value: string | null, asdDefaultValue: string | null = "false"): EffectiveSetting {
  return {
    asdId: asdKey,
    asdKey,
    asdModule: "SYSTEM",
    asdGroup: "",
    asdLabel: asdKey,
    asdDescription: null,
    asdDataType: "BOOL",
    asdDefaultValue,
    asdAllowedValues: null,
    asdMinValue: null,
    asdMaxValue: null,
    asdMaxScope: "USER",
    asdSortOrder: 0,
    asdNeedsRelogin: false,
    source: "DEFAULT",
    value,
    override: null,
  } as EffectiveSetting;
}

describe("parsePhysicalStockSettings", () => {
  it("defaults to list-first", () => {
    expect(parsePhysicalStockSettings(undefined)).toEqual(DEFAULT_PHYSICAL_STOCK_SETTINGS);
    expect(parsePhysicalStockSettings([])).toEqual({ txnEntryFirst: false });
  });

  it("reads system.txn_entry_first the way AppSession's settingBool does", () => {
    for (const truthy of ["true", "TRUE", "1", "yes", "Y"]) {
      expect(parsePhysicalStockSettings([setting("system.txn_entry_first", truthy)]).txnEntryFirst).toBe(true);
    }
    for (const falsy of ["false", "0", "no", "maybe"]) {
      expect(parsePhysicalStockSettings([setting("system.txn_entry_first", falsy)]).txnEntryFirst).toBe(false);
    }
  });

  it("falls back to the catalog default when the value is unset", () => {
    expect(
      parsePhysicalStockSettings([setting("system.txn_entry_first", null, "true")]).txnEntryFirst,
    ).toBe(true);
  });
});
