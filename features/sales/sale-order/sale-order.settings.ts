/**
 * The app settings the Sale Order screen obeys — the same keys the Qt screen
 * reads (`AppSession`'s binding table), parsed once from
 * `GET /app-setting-values/effective` into a typed object the draft, the hook
 * and the view read without caring where a value came from.
 *
 * Every entry has a DEFAULT, and each default is the catalog's own
 * (`public.app_setting_def.asd_default_value`), so a value that never arrives
 * behaves exactly as an untouched installation does. Pure: the hook in
 * `use-sale-order-settings.ts` fetches, this file decides.
 */
import type { EffectiveSetting } from "@/features/settings/app-settings/types";
import { DELIVERY_MODES, type DeliveryMode } from "./sale-order.constants";

export const SALE_ORDER_SETTING_KEYS = {
  defaultPriceLevel: "sales.default_price_level",
  discAlterBaseRate: "sales.disc_alter_base_rate",
  roundOffStep: "sales.round_off_step",
  freightCalcType: "sales.freight_calc_type",
  loadingCalcType: "sales.loading_calc_type",
  defaultDeliveryMode: "sales.default_delivery_mode",
  defaultValidityDays: "sales.default_validity_days",
  companyStateCode: "system.company_state_code",
  regional: "system.regional",
  salesmanMandatory: "sales.salesman_mandatory",
  autoPopQty: "sales.auto_pop_qty",
  allowDuplicateItem: "sales.allow_duplicate_item",
  duplicateDefaultYes: "sales.duplicate_default_yes",
  freeItemTax: "sales.free_item_tax",
  editPrice: "inventory.edit_price",
  skipMrp: "inventory.skip_mrp",
  priceLevelCount: "inventory.price_level_count",
  tenderType: "sales.tender_type",
  tenderPrintOnly: "sales.tender_print_only",
  allowExcessTender: "sales.allow_excess_tender",
  autoPost: "sales.auto_post",
  allowCustomerChangeOnImport: "sales.allow_customer_change_on_import",
  clearDeliveryOnClear: "sales.clear_delivery_on_clear",
} as const;

/** `sales.tender_type` — which F5 the operator gets (the Qt route). */
export type TenderRoute = "none" | "cash_bills" | "all_bills";
export const TENDER_ROUTES: readonly TenderRoute[] = ["none", "cash_bills", "all_bills"];

/** `sales.freight_calc_type` / `sales.loading_calc_type`, as the catalog spells them. */
export const CALC_TYPES = ["manual", "auto", "item_basis"] as const;
export type CalcType = (typeof CALC_TYPES)[number];

export type SaleOrderSettings = {
  defaultPriceLevel: number;
  discAlterBaseRate: boolean;
  roundOffStep: number;
  freightCalcType: CalcType;
  loadingCalcType: CalcType;
  defaultDeliveryMode: DeliveryMode;
  defaultValidityDays: number;
  /** '' when the installation never set one — the caller falls back to the company master. */
  companyStateCode: string;
  /** null when unset — the caller falls back to the user's language. */
  regional: boolean | null;
  salesmanMandatory: boolean;
  autoPopQty: boolean;
  allowDuplicateItem: boolean;
  duplicateDefaultYes: boolean;
  freeItemTax: boolean;
  editPrice: boolean;
  skipMrp: boolean;
  /** 1..7 — how many Ctrl+N shortcuts, and the stepping range. */
  priceLevelCount: number;
  tenderType: TenderRoute;
  tenderPrintOnly: boolean;
  allowExcessTender: boolean;
  autoPost: boolean;
  allowCustomerChangeOnImport: boolean;
  clearDeliveryOnClear: boolean;
};

/** The catalog's defaults (2026-10-02), so an unread setting behaves as an untouched installation. */
export const DEFAULT_SALE_ORDER_SETTINGS: SaleOrderSettings = {
  defaultPriceLevel: 1,
  discAlterBaseRate: false,
  roundOffStep: 1,
  freightCalcType: "item_basis",
  loadingCalcType: "item_basis",
  defaultDeliveryMode: "STORE_PICKUP",
  defaultValidityDays: 7,
  companyStateCode: "",
  regional: null,
  salesmanMandatory: false,
  autoPopQty: false,
  allowDuplicateItem: true,
  duplicateDefaultYes: false,
  freeItemTax: false,
  editPrice: true,
  skipMrp: false,
  priceLevelCount: 4,
  tenderType: "all_bills",
  tenderPrintOnly: false,
  allowExcessTender: false,
  autoPost: true,
  allowCustomerChangeOnImport: false,
  clearDeliveryOnClear: false,
};

const MIN_PRICE_LEVEL_COUNT = 1;
const MAX_PRICE_LEVEL_COUNT = 7;

/** `app_setting_values` stores every value as raw TEXT, whatever its type. */
function valueOf(rows: readonly EffectiveSetting[] | undefined, key: string): string | null {
  const row = rows?.find((candidate) => candidate.asdKey === key);
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

function asNullableBoolean(value: string | null): boolean | null {
  if (value === null || !value.trim()) {
    return null;
  }
  return asBoolean(value, false);
}

function asNumber(value: string | null, fallback: number): number {
  const parsed = Number.parseFloat((value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asInteger(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function asOneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  const text = (value ?? "").trim().toLowerCase();
  const match = allowed.find((candidate) => candidate.toLowerCase() === text);
  return match ?? fallback;
}

/**
 * The typed settings from the effective rows. Missing rows take the catalog
 * default; a value outside its vocabulary takes the default too, never a guess.
 */
export function parseSaleOrderSettings(
  rows: readonly EffectiveSetting[] | undefined,
): SaleOrderSettings {
  const K = SALE_ORDER_SETTING_KEYS;
  const D = DEFAULT_SALE_ORDER_SETTINGS;
  if (!rows) {
    return D;
  }
  return {
    defaultPriceLevel: asInteger(valueOf(rows, K.defaultPriceLevel), D.defaultPriceLevel, 1, 7),
    discAlterBaseRate: asBoolean(valueOf(rows, K.discAlterBaseRate), D.discAlterBaseRate),
    // A zero or negative step means "do not round" to the engine; the catalog
    // does not go below 0, so only a bad parse falls back.
    roundOffStep: Math.max(0, asNumber(valueOf(rows, K.roundOffStep), D.roundOffStep)),
    freightCalcType: asOneOf(valueOf(rows, K.freightCalcType), CALC_TYPES, D.freightCalcType),
    loadingCalcType: asOneOf(valueOf(rows, K.loadingCalcType), CALC_TYPES, D.loadingCalcType),
    defaultDeliveryMode: asOneOf(
      valueOf(rows, K.defaultDeliveryMode)?.toUpperCase() ?? null,
      DELIVERY_MODES,
      D.defaultDeliveryMode,
    ),
    defaultValidityDays: asInteger(
      valueOf(rows, K.defaultValidityDays),
      D.defaultValidityDays,
      0,
      3650,
    ),
    companyStateCode: (valueOf(rows, K.companyStateCode) ?? "").trim(),
    regional: asNullableBoolean(valueOf(rows, K.regional)),
    salesmanMandatory: asBoolean(valueOf(rows, K.salesmanMandatory), D.salesmanMandatory),
    autoPopQty: asBoolean(valueOf(rows, K.autoPopQty), D.autoPopQty),
    allowDuplicateItem: asBoolean(valueOf(rows, K.allowDuplicateItem), D.allowDuplicateItem),
    duplicateDefaultYes: asBoolean(valueOf(rows, K.duplicateDefaultYes), D.duplicateDefaultYes),
    freeItemTax: asBoolean(valueOf(rows, K.freeItemTax), D.freeItemTax),
    editPrice: asBoolean(valueOf(rows, K.editPrice), D.editPrice),
    skipMrp: asBoolean(valueOf(rows, K.skipMrp), D.skipMrp),
    priceLevelCount: asInteger(
      valueOf(rows, K.priceLevelCount),
      D.priceLevelCount,
      MIN_PRICE_LEVEL_COUNT,
      MAX_PRICE_LEVEL_COUNT,
    ),
    tenderType: asOneOf(valueOf(rows, K.tenderType), TENDER_ROUTES, D.tenderType),
    tenderPrintOnly: asBoolean(valueOf(rows, K.tenderPrintOnly), D.tenderPrintOnly),
    allowExcessTender: asBoolean(valueOf(rows, K.allowExcessTender), D.allowExcessTender),
    autoPost: asBoolean(valueOf(rows, K.autoPost), D.autoPost),
    allowCustomerChangeOnImport: asBoolean(
      valueOf(rows, K.allowCustomerChangeOnImport),
      D.allowCustomerChangeOnImport,
    ),
    clearDeliveryOnClear: asBoolean(valueOf(rows, K.clearDeliveryOnClear), D.clearDeliveryOnClear),
  };
}

/**
 * Which F5 the operator gets (the Qt screen's `sales.tender_type` route):
 * `all_bills` → the advance dialog always; `cash_bills` → only on a Cash
 * order; `none` → a plain save.
 */
export function tenderRouteApplies(tenderType: TenderRoute, orderType: string): boolean {
  if (tenderType === "all_bills") {
    return true;
  }
  if (tenderType === "cash_bills") {
    return orderType.trim().toUpperCase() === "CASH";
  }
  return false;
}

/** The status a NEW order is saved with: confirmed at once, or left as a draft. */
export function newOrderStatusFor(settings: Pick<SaleOrderSettings, "autoPost">): string {
  return settings.autoPost ? "CONFIRMED" : "DRAFT";
}

/** The engine spells calc types in upper case (`MANUAL` disables the role override). */
export function toEnginePolicy(settings: SaleOrderSettings): {
  freightCalcType: string;
  loadingCalcType: string;
  discountAlterBaseRate: boolean;
  roundOffStep: number;
} {
  return {
    freightCalcType: settings.freightCalcType.toUpperCase(),
    loadingCalcType: settings.loadingCalcType.toUpperCase(),
    discountAlterBaseRate: settings.discAlterBaseRate,
    roundOffStep: settings.roundOffStep,
  };
}
