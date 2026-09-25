/**
 * Promotions — the scheme graph as the client evaluates it (§11). Pure.
 *
 * `GET /promotion-scheme/list?company=<company>` answers every LIVE scheme of
 * the company whole: the header plus its `branches`, `parties`, `items` and
 * `slabs`. **Never pass a branch**: the list matches `prm_branch_id` literally
 * and drops company-wide (NULL-branch) schemes. Branch scope is resolved HERE,
 * from the branch grid, the way the till resolves it.
 *
 * Numerics arrive quoted; every figure is read leniently. Rows the reader
 * cannot name are dropped rather than mis-evaluated.
 */

export type PromotionApplyOn = "BILL_AMOUNT" | "BILL_QTY" | "ITEM_AMOUNT" | "ITEM_QTY";
export type PromotionBenefit = "FREE_ITEM" | "DISC_PERC" | "DISC_AMT" | "FIXED_PRICE" | "DISC_PER_ITEM";
export type PromotionScope = "ALL" | "LIST";
export type PromotionStackMode = "EXCLUSIVE" | "STACKABLE";
export type PromotionPartyKind = "CUSTOMER" | "CUSTOMER_GROUP" | "AREA" | "CITY";
export type PromotionItemKind = "ITEM" | "ITEM_GROUP" | "ITEM_CATEGORY" | "ITEM_BRAND" | "ITEM_SECTION";

export type PromotionBranchRule = { branchId: string; isExclude: boolean };

export type PromotionPartyRule = {
  kind: PromotionPartyKind;
  scopeId: string;
  isExclude: boolean;
  priority: number;
};

export type PromotionItemRule = {
  kind: PromotionItemKind;
  scopeId: string;
  /** Only an ITEM rule names a unit; a match on another kind ignores the unit. */
  unitId: string | null;
  isExclude: boolean;
  priority: number;
  discPerc: number;
  discQty: number;
  discAmt: number;
  minQty: number;
  factor: number;
  maxBenefit: number;
};

export type PromotionSlab = {
  slno: number;
  exceeds: number;
  upto: number | null;
  each: number;
  isRepeat: boolean;
  maxRepeats: number;
  freeItemId: string | null;
  freeUnitId: string | null;
  freeItemName: string | null;
  freeQty: number;
  discPerc: number;
  discQty: number;
  discAmt: number;
  fixedPrice: number | null;
  maxBenefitAmt: number;
};

export type PromotionScheme = {
  id: string;
  code: string;
  name: string;
  status: string;
  isActive: boolean;
  companyId: string;
  branchId: string | null;
  applyOn: PromotionApplyOn;
  benefit: PromotionBenefit;
  priority: number;
  stackMode: PromotionStackMode;
  autoApply: boolean;
  allowWithManualDisc: boolean;
  billType: "ALL" | "CASH" | "CREDIT";
  minBillAmount: number;
  minQty: number;
  branchScope: PromotionScope;
  custScope: PromotionScope;
  itemScope: PromotionScope;
  priceLevelId: number | null;
  maxBenefitPerBill: number;
  startDate: string;
  endDate: string;
  validFromTime: string | null;
  validToTime: string | null;
  /** `MON,TUE,…` or null for every day. */
  validWeekdays: string[] | null;
  branches: PromotionBranchRule[];
  parties: PromotionPartyRule[];
  items: PromotionItemRule[];
  slabs: PromotionSlab[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = num(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function bool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "true" || lowered === "1") {
      return true;
    }
    if (lowered === "false" || lowered === "0") {
      return false;
    }
  }
  return fallback;
}

function enumOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const raw = (text(value) ?? "").toUpperCase();
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

const APPLY_ON: PromotionApplyOn[] = ["BILL_AMOUNT", "BILL_QTY", "ITEM_AMOUNT", "ITEM_QTY"];
const BENEFITS: PromotionBenefit[] = ["FREE_ITEM", "DISC_PERC", "DISC_AMT", "FIXED_PRICE", "DISC_PER_ITEM"];
const PARTY_KINDS: PromotionPartyKind[] = ["CUSTOMER", "CUSTOMER_GROUP", "AREA", "CITY"];
const ITEM_KINDS: PromotionItemKind[] = ["ITEM", "ITEM_GROUP", "ITEM_CATEGORY", "ITEM_BRAND", "ITEM_SECTION"];

/** Narrowest first — the server's own seed, used when a row carries no priority. */
const PARTY_DEFAULT_PRIORITY: Record<PromotionPartyKind, number> = {
  CUSTOMER: 4,
  AREA: 3,
  CITY: 2,
  CUSTOMER_GROUP: 1,
};
const ITEM_DEFAULT_PRIORITY: Record<PromotionItemKind, number> = {
  ITEM: 4,
  ITEM_BRAND: 3,
  ITEM_CATEGORY: 2,
  ITEM_SECTION: 1,
  ITEM_GROUP: 0,
};

function live(row: Record<string, unknown>, prefix: string): boolean {
  return bool(row[`${prefix}_is_active`], true) && !bool(row[`${prefix}_is_deleted`], false);
}

function parseScheme(raw: unknown): PromotionScheme | null {
  if (!isRecord(raw)) {
    return null;
  }
  const id = text(raw.prm_id);
  if (!id) {
    return null;
  }
  const weekdays = text(raw.prm_valid_weekdays);
  return {
    id,
    code: text(raw.prm_code) ?? "",
    name: text(raw.prm_name) ?? text(raw.prm_code) ?? "",
    status: (text(raw.prm_status) ?? "").toUpperCase(),
    isActive: bool(raw.prm_is_active, true) && !bool(raw.prm_is_deleted, false),
    companyId: text(raw.prm_comp_id) ?? "",
    branchId: text(raw.prm_branch_id),
    applyOn: enumOf(raw.prm_apply_on, APPLY_ON, "ITEM_QTY"),
    benefit: enumOf(raw.prm_benefit, BENEFITS, "DISC_PERC"),
    priority: num(raw.prm_priority, 1),
    stackMode: enumOf(raw.prm_stack_mode, ["EXCLUSIVE", "STACKABLE"] as const, "EXCLUSIVE"),
    autoApply: bool(raw.prm_auto_apply, true),
    allowWithManualDisc: bool(raw.prm_allow_with_manual_disc, true),
    billType: enumOf(raw.prm_bill_type, ["ALL", "CASH", "CREDIT"] as const, "ALL"),
    minBillAmount: num(raw.prm_min_bill_amount),
    minQty: num(raw.prm_min_qty),
    branchScope: enumOf(raw.prm_branch_scope, ["ALL", "LIST"] as const, "ALL"),
    custScope: enumOf(raw.prm_cust_scope, ["ALL", "LIST"] as const, "ALL"),
    itemScope: enumOf(raw.prm_item_scope, ["ALL", "LIST"] as const, "ALL"),
    priceLevelId: nullableNum(raw.prm_price_level_id),
    maxBenefitPerBill: num(raw.prm_max_benefit_per_bill),
    startDate: (text(raw.prm_start_date) ?? "").slice(0, 10),
    endDate: (text(raw.prm_end_date) ?? "").slice(0, 10),
    validFromTime: text(raw.prm_valid_from_time)?.slice(0, 5) ?? null,
    validToTime: text(raw.prm_valid_to_time)?.slice(0, 5) ?? null,
    validWeekdays: weekdays
      ? weekdays
          .split(",")
          .map((day) => day.trim().toUpperCase())
          .filter(Boolean)
      : null,
    branches: (Array.isArray(raw.branches) ? raw.branches : [])
      .filter(isRecord)
      .filter((row) => live(row, "prb"))
      .map((row) => ({ branchId: text(row.prb_branch_id) ?? "", isExclude: bool(row.prb_is_exclude) }))
      .filter((row) => row.branchId),
    parties: (Array.isArray(raw.parties) ? raw.parties : [])
      .filter(isRecord)
      .filter((row) => live(row, "prp"))
      .map((row) => {
        const kind = enumOf(row.prp_kind, PARTY_KINDS, "CUSTOMER");
        return {
          kind,
          scopeId: text(row.prp_scope_id) ?? "",
          isExclude: bool(row.prp_is_exclude),
          priority: num(row.prp_match_priority, PARTY_DEFAULT_PRIORITY[kind]),
        };
      })
      .filter((row) => row.scopeId),
    items: (Array.isArray(raw.items) ? raw.items : [])
      .filter(isRecord)
      .filter((row) => live(row, "pri"))
      .map((row) => {
        const kind = enumOf(row.pri_kind, ITEM_KINDS, "ITEM");
        return {
          kind,
          scopeId: text(row.pri_scope_id) ?? "",
          unitId: text(row.pri_unit_id),
          isExclude: bool(row.pri_is_exclude),
          priority: num(row.pri_match_priority, ITEM_DEFAULT_PRIORITY[kind]),
          discPerc: num(row.pri_disc_perc),
          discQty: num(row.pri_disc_qty),
          discAmt: num(row.pri_disc_amt),
          minQty: num(row.pri_min_qty),
          factor: num(row.pri_factor, 1) || 1,
          maxBenefit: num(row.pri_max_benefit),
        };
      })
      .filter((row) => row.scopeId),
    slabs: (Array.isArray(raw.slabs) ? raw.slabs : [])
      .filter(isRecord)
      .filter((row) => live(row, "prs"))
      .map((row) => ({
        slno: num(row.prs_slno),
        exceeds: num(row.prs_exceeds),
        upto: nullableNum(row.prs_upto),
        each: num(row.prs_each),
        isRepeat: bool(row.prs_is_repeat),
        maxRepeats: num(row.prs_max_repeats),
        freeItemId: text(row.prs_free_item_id),
        freeUnitId: text(row.prs_free_unit_id),
        freeItemName: text(row.prs_free_item_name),
        freeQty: num(row.prs_free_qty),
        discPerc: num(row.prs_disc_perc),
        discQty: num(row.prs_disc_qty),
        discAmt: num(row.prs_disc_amt),
        fixedPrice: nullableNum(row.prs_fixed_price),
        maxBenefitAmt: num(row.prs_max_benefit_amt),
      }))
      .sort((left, right) => left.exceeds - right.exceeds || left.slno - right.slno),
  };
}

/** The list body (`data[]` or a bare array), parsed. Unreadable rows are dropped. */
export function parsePromotionSchemes(raw: unknown): PromotionScheme[] {
  const rows = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.data)
      ? raw.data
      : [];
  return rows.map(parseScheme).filter((scheme): scheme is PromotionScheme => scheme !== null);
}
