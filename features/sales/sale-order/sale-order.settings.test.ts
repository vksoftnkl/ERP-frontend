import { describe, expect, it } from "vitest";
import type { EffectiveSetting } from "@/features/settings/app-settings/types";
import {
  DEFAULT_SALE_ORDER_SETTINGS,
  newOrderStatusFor,
  parseSaleOrderSettings,
  tenderRouteApplies,
  toEnginePolicy,
} from "./sale-order.settings";

function row(key: string, value: string | null, defaultValue: string | null = null): EffectiveSetting {
  return {
    asdId: key,
    asdKey: key,
    asdModule: key.split(".")[0] ?? "",
    asdGroup: "",
    asdLabel: key,
    asdDescription: null,
    asdDataType: "TEXT",
    asdDefaultValue: defaultValue,
    asdAllowedValues: null,
    asdMinValue: null,
    asdMaxValue: null,
    asdMaxScope: "COMPANY",
    asdSortOrder: 0,
    asdNeedsRelogin: false,
    source: "DEFAULT",
    value,
    override: null,
  } as EffectiveSetting;
}

describe("parseSaleOrderSettings", () => {
  it("is the catalog's defaults when nothing has arrived", () => {
    expect(parseSaleOrderSettings(undefined)).toEqual(DEFAULT_SALE_ORDER_SETTINGS);
    expect(parseSaleOrderSettings([])).toEqual(DEFAULT_SALE_ORDER_SETTINGS);
  });

  it("reads every type the way app_setting_values stores it — as text", () => {
    const settings = parseSaleOrderSettings([
      row("sales.default_price_level", "3"),
      row("sales.disc_alter_base_rate", "true"),
      row("sales.round_off_step", "0.50"),
      row("sales.freight_calc_type", "manual"),
      row("sales.loading_calc_type", "AUTO"),
      row("sales.default_delivery_mode", "home_delivery"),
      row("sales.default_validity_days", "30"),
      row("system.company_state_code", "24"),
      row("system.regional", "yes"),
      row("sales.salesman_mandatory", "1"),
      row("sales.auto_pop_qty", "on"),
      row("sales.allow_duplicate_item", "false"),
      row("sales.duplicate_default_yes", "true"),
      row("sales.free_item_tax", "true"),
      row("inventory.edit_price", "false"),
      row("inventory.skip_mrp", "true"),
      row("inventory.price_level_count", "2"),
      row("sales.tender_type", "cash_bills"),
      row("sales.tender_print_only", "true"),
      row("sales.allow_excess_tender", "true"),
      row("sales.auto_post", "false"),
      row("sales.allow_customer_change_on_import", "true"),
      row("sales.clear_delivery_on_clear", "true"),
    ]);
    expect(settings).toEqual({
      defaultPriceLevel: 3,
      discAlterBaseRate: true,
      roundOffStep: 0.5,
      freightCalcType: "manual",
      loadingCalcType: "auto",
      defaultDeliveryMode: "HOME_DELIVERY",
      defaultValidityDays: 30,
      companyStateCode: "24",
      regional: true,
      salesmanMandatory: true,
      autoPopQty: true,
      allowDuplicateItem: false,
      duplicateDefaultYes: true,
      freeItemTax: true,
      editPrice: false,
      skipMrp: true,
      priceLevelCount: 2,
      tenderType: "cash_bills",
      tenderPrintOnly: true,
      allowExcessTender: true,
      autoPost: false,
      allowCustomerChangeOnImport: true,
      clearDeliveryOnClear: true,
    });
  });

  it("falls back to the row's own default when the value is null, and to the catalog on nonsense", () => {
    const settings = parseSaleOrderSettings([
      row("sales.tender_type", null, "none"),
      row("sales.default_delivery_mode", "BY_DRONE"),
      row("inventory.price_level_count", "99"),
      row("sales.round_off_step", "abc"),
      row("system.regional", ""),
    ]);
    expect(settings.tenderType).toBe("none");
    expect(settings.defaultDeliveryMode).toBe("STORE_PICKUP");
    expect(settings.priceLevelCount).toBe(7);
    expect(settings.roundOffStep).toBe(1);
    expect(settings.regional).toBeNull();
  });
});

describe("the derived rules", () => {
  it("routes F5 to the tender dialog per sales.tender_type", () => {
    expect(tenderRouteApplies("all_bills", "CREDIT")).toBe(true);
    expect(tenderRouteApplies("cash_bills", "CASH")).toBe(true);
    expect(tenderRouteApplies("cash_bills", "CREDIT")).toBe(false);
    expect(tenderRouteApplies("none", "CASH")).toBe(false);
  });

  it("saves a new order CONFIRMED only when sales.auto_post is on", () => {
    expect(newOrderStatusFor({ autoPost: true })).toBe("CONFIRMED");
    expect(newOrderStatusFor({ autoPost: false })).toBe("DRAFT");
  });

  it("hands the engine its upper-case calc types and the rounding step", () => {
    expect(toEnginePolicy({ ...DEFAULT_SALE_ORDER_SETTINGS, roundOffStep: 5 })).toEqual({
      freightCalcType: "ITEM_BASIS",
      loadingCalcType: "ITEM_BASIS",
      discountAlterBaseRate: false,
      roundOffStep: 5,
    });
  });
});
