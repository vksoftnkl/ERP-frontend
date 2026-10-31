/**
 * Promotion Schemes (menu 247) — the vocabularies, the kind → picker table and
 * the column rules of Qt `promotion_scheme_entity.h` (NexERP), as data.
 *
 * Backs sales.promotion_scheme + _branch + _party + _item + _slab. Every rule
 * here is one of the schema's CHECKs (named beside it), so the screen refuses
 * what the database would refuse, in words, before the save.
 *
 * The enum unions themselves are the ones the Sale Bill's promotion engine
 * already reads (`features/sales/salebill/promotions/rules.ts`) — one spelling
 * of the vocabulary for the screen that writes a scheme and the one that
 * applies it.
 */
import type {
  PromotionApplyOn,
  PromotionBenefit,
  PromotionItemKind,
  PromotionPartyKind,
  PromotionScope,
  PromotionStackMode,
} from "@/features/sales/salebill/promotions/rules";

export type {
  PromotionApplyOn,
  PromotionBenefit,
  PromotionItemKind,
  PromotionPartyKind,
  PromotionScope,
  PromotionStackMode,
};

export type PromotionStatus = "DRAFT" | "APPROVED" | "SUSPENDED" | "CLOSED";
export type PromotionCalcOn = "GROSS_AMOUNT" | "NET_AMOUNT" | "TAXABLE_AMOUNT";
export type PromotionBillType = "ALL" | "CASH" | "CREDIT";

/** A coded choice: what goes on the wire, and what the operator reads. */
export type Choice<T extends string = string> = { code: T; label: string };

/** prm_status — ck_prm_status. */
export const STATUS_CHOICES: readonly Choice<PromotionStatus>[] = [
  { code: "DRAFT", label: "DRAFT — not live yet" },
  { code: "APPROVED", label: "APPROVED — running" },
  { code: "SUSPENDED", label: "SUSPENDED — paused" },
  { code: "CLOSED", label: "CLOSED — finished" },
];

/** prm_apply_on — ck_prm_apply_on. What TRIGGERS the offer. */
export const APPLY_ON_CHOICES: readonly Choice<PromotionApplyOn>[] = [
  { code: "BILL_AMOUNT", label: "BILL_AMOUNT — value of the whole bill" },
  { code: "BILL_QTY", label: "BILL_QTY — quantity on the whole bill" },
  { code: "ITEM_AMOUNT", label: "ITEM_AMOUNT — value of an item" },
  { code: "ITEM_QTY", label: "ITEM_QTY — quantity of an item" },
];

/** prm_benefit — ck_prm_benefit. What the offer GIVES. */
export const BENEFIT_CHOICES: readonly Choice<PromotionBenefit>[] = [
  { code: "FREE_ITEM", label: "FREE_ITEM — give stock away" },
  { code: "DISC_PERC", label: "DISC_PERC — a percentage off" },
  { code: "DISC_AMT", label: "DISC_AMT — rupees off" },
  { code: "FIXED_PRICE", label: "FIXED_PRICE — sell it at this price" },
  { code: "DISC_PER_ITEM", label: "DISC_PER_ITEM — a rate on each item row" },
];

export const STACK_MODE_CHOICES: readonly Choice<PromotionStackMode>[] = [
  { code: "EXCLUSIVE", label: "EXCLUSIVE — nothing else on that line" },
  { code: "STACKABLE", label: "STACKABLE — may combine with others" },
];

export const CALC_ON_CHOICES: readonly Choice<PromotionCalcOn>[] = [
  { code: "GROSS_AMOUNT", label: "GROSS_AMOUNT" },
  { code: "NET_AMOUNT", label: "NET_AMOUNT" },
  { code: "TAXABLE_AMOUNT", label: "TAXABLE_AMOUNT" },
];

export const BILL_TYPE_CHOICES: readonly Choice<PromotionBillType>[] = [
  { code: "ALL", label: "ALL bills" },
  { code: "CASH", label: "CASH only" },
  { code: "CREDIT", label: "CREDIT only" },
];

/** prm_branch_scope / _cust_scope / _item_scope. */
export const SCOPE_CHOICES: readonly Choice<PromotionScope>[] = [
  { code: "ALL", label: "ALL — no list needed" },
  { code: "LIST", label: "LIST — see the tab" },
];

/** prm_valid_weekdays is a CSV of these, in this order — ck_prm_weekdays. */
export const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const WEEKDAY_LABELS: Record<Weekday, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

// ── The list's state filter (Qt PromotionSchemeList) ──────────────────────

/** Menu 247 (Sales › Offers › Promotion Schemes) — what governs Add / Edit / Delete. */
export const PROMOTION_SCHEMES_MENU_ID = 247;

/** What the toolbar's radio group sends as `iprm_state`. RUNNING is the default. */
export type PromotionListState = "RUNNING" | "INACTIVE" | "EXPIRED" | "DELETED";
export const LIST_STATE_FILTERS: readonly { state: PromotionListState; label: string }[] = [
  { state: "RUNNING", label: "Show Running" },
  { state: "INACTIVE", label: "Show Inactive" },
  { state: "EXPIRED", label: "Show Only Expired" },
  { state: "DELETED", label: "Show Only Deleted" },
];

// ── The rules between header and grids ────────────────────────────────────

/**
 * DISC_PER_ITEM states its rate on the item row and has no bands at all. The
 * database refuses a band on it (ck_prs_benefit_columns has no branch for it).
 */
export function benefitUsesBands(benefit: string): boolean {
  return benefit !== "DISC_PER_ITEM";
}

/**
 * ck_prm_fixed_price_scope — FIXED_PRICE (and DISC_PER_ITEM) re-price an
 * existing line, so they need an item-level trigger. FREE_ITEM is deliberately
 * not gated: it ADDS a line, so "spend 5,000, take a mug" is legal.
 */
export function benefitNeedsItemTrigger(benefit: string): boolean {
  return benefit === "FIXED_PRICE" || benefit === "DISC_PER_ITEM";
}

export function applyOnIsItemLevel(applyOn: string): boolean {
  return applyOn === "ITEM_QTY" || applyOn === "ITEM_AMOUNT";
}

/** The three rate columns an item row and a band share. */
export type RateColumn = "discPerc" | "discQty" | "discAmt";
export const RATE_COLUMNS: readonly RateColumn[] = ["discPerc", "discQty", "discAmt"];

/**
 * Which rate columns an ITEM row may state under this benefit (no CHECK behind
 * it — a percentage simply means nothing on a scheme that gives stock away).
 * Under DISC_PER_ITEM the row's rate IS the offer, so all three are open and
 * ck_pri_one_rate keeps it to one.
 */
export function itemRateAllowed(benefit: string, column: RateColumn): boolean {
  if (benefit === "DISC_PER_ITEM") return true;
  if (column === "discPerc") return benefit === "DISC_PERC";
  return benefit === "DISC_AMT";
}

/** The benefit-specific columns of a band. Geometry and bookkeeping are always legal. */
export type SlabBenefitColumn =
  | "freeItem"
  | "freeUnit"
  | "freeQty"
  | "freeStockCheck"
  | "discPerc"
  | "discQty"
  | "discAmt"
  | "fixedPrice";

/** ck_prs_benefit_columns, encoded once: may this band column carry a value at all? */
export function slabColumnAllowed(benefit: string, column: SlabBenefitColumn): boolean {
  switch (benefit) {
    case "FREE_ITEM":
      return column === "freeItem" || column === "freeUnit" || column === "freeQty" || column === "freeStockCheck";
    case "DISC_PERC":
      return column === "discPerc";
    case "DISC_AMT":
      return column === "discAmt" || column === "discQty";
    case "FIXED_PRICE":
      return column === "fixedPrice";
    default:
      return false;
  }
}

// ── Pickers (configured POPUP grids, resolved by name) ────────────────────

export type GridRef = { name: string; fallbackId: string };

/** The list behind menu 247 ("MAIN LIST - PROMOTION SCHEMES", 24 columns). */
export const LIST_GRID: GridRef = { name: "MAIN LIST - PROMOTION SCHEMES", fallbackId: "95" };

export type PickerSpec = GridRef & { idKey: string; nameKey: string };

/** Branch master picker. Its row keys are br_id / br_name. */
export const BRANCH_PICKER: PickerSpec = { name: "POPUP - BRANCH", fallbackId: "70", idKey: "br_id", nameKey: "br_name" };

/** Item master picker (the free item, and the ITEM kind). */
export const ITEM_PICKER: PickerSpec = {
  name: "POPUP - ITEMS",
  fallbackId: "71",
  idKey: "item_id",
  nameKey: "item_name_en",
};

/**
 * The item picker also returns the item's default unit, and `item_uom_id` IS
 * an iuc_id — what pri_unit_id / prs_free_unit_id reference. So picking an
 * item fills the unit in the same gesture and ck_pri_unit is satisfied.
 */
export const ITEM_UNIT_ID_KEY = "item_uom_id";
export const ITEM_UNIT_NAME_KEY = "unit_name";

/** One row of the kind → picker table. `defaultPriority` seeds the match priority. */
export type PromoScope<K extends string = string> = PickerSpec & {
  code: K;
  label: string;
  defaultPriority: number;
};

/** prp_kind — ck_prp_kind. CUSTOMER 4, AREA 3, CITY 2, CUSTOMER_GROUP 1. */
export const PARTY_SCOPES: readonly PromoScope<PromotionPartyKind>[] = [
  { code: "CUSTOMER", label: "Customer", name: "POPUP - CUSTOMERS", fallbackId: "79", idKey: "cus_id", nameKey: "cus_name", defaultPriority: 4 },
  { code: "AREA", label: "Area", name: "POPUP - CUST AREAS", fallbackId: "88", idKey: "arm_id", nameKey: "arm_name", defaultPriority: 3 },
  { code: "CITY", label: "City", name: "POPUP - CUST CITIES", fallbackId: "89", idKey: "ctm_id", nameKey: "ctm_name", defaultPriority: 2 },
  {
    code: "CUSTOMER_GROUP",
    label: "Customer group",
    name: "POPUP - CUST GROUPS",
    fallbackId: "94",
    idKey: "cgr_id",
    nameKey: "cgr_name",
    defaultPriority: 1,
  },
];

/** pri_kind — ck_pri_kind. ITEM 4, ITEM_BRAND 3, ITEM_CATEGORY 2, ITEM_SECTION 1, ITEM_GROUP 0. */
export const ITEM_SCOPES: readonly PromoScope<PromotionItemKind>[] = [
  { code: "ITEM", label: "Item", ...ITEM_PICKER, defaultPriority: 4 },
  { code: "ITEM_BRAND", label: "Brand", name: "POPUP - ITEM BRANDS", fallbackId: "91", idKey: "brand_id", nameKey: "brand_name", defaultPriority: 3 },
  {
    code: "ITEM_CATEGORY",
    label: "Category",
    name: "POPUP - ITEM CATEGORY",
    fallbackId: "92",
    idKey: "category_id",
    nameKey: "category_name",
    defaultPriority: 2,
  },
  { code: "ITEM_SECTION", label: "Section", name: "POPUP - ITEM SECTIONS", fallbackId: "93", idKey: "sec_id", nameKey: "sec_name", defaultPriority: 1 },
  { code: "ITEM_GROUP", label: "Group", name: "POPUP - ITEM GROUPS", fallbackId: "90", idKey: "itg_id", nameKey: "itg_name", defaultPriority: 0 },
];

export function findScope<K extends string>(table: readonly PromoScope<K>[], code: string): PromoScope<K> | null {
  return table.find((scope) => scope.code === code) ?? null;
}

// ── Hover hints (Qt setupHints — the wording follows 15_promotion_scheme.sql) ─

export const APPLY_ON_HINT =
  "What triggers the offer: the value or quantity of the whole bill, or of a single item line.";
export const BENEFIT_HINT =
  "What the offer gives: free stock, a percentage off, rupees off, or a fixed selling price.\n" +
  "Trigger × Benefit together replace 3.0's five scheme types.";
export const STACK_MODE_HINT =
  "EXCLUSIVE — nothing else applies to that line.\nSTACKABLE — may combine with other schemes.";
export const CALC_ON_HINT = "Which figure the offer is measured against: gross, net or taxable amount.";
export const SCOPE_HINT = "ALL — applies everywhere, no list needed.\nLIST — only what the matching tab names.";

export const FIELD_HINTS = {
  code: "Short unique key for this scheme. Letters, digits, hyphen and underscore only.",
  name: "What the scheme is called wherever it is listed, and what is stamped on the bill line it discounts.",
  status: "Only an APPROVED scheme runs at the till — a cashier must never apply one somebody is still drafting.",
  priority:
    "Which scheme wins when several match the same bill. Several matching at once is normal in a chain, so this decides it.",
  stackMode: STACK_MODE_HINT,
  approvedBy: "Who approved this scheme. Approving is done from the list, not here.",
  remarks: "Free note about this scheme. Not shown to the customer.",
  benefit: BENEFIT_HINT,
  applyOn: APPLY_ON_HINT,
  calcOn: CALC_ON_HINT,
  pairChip:
    "The apply-on and benefit pair this scheme is built from. It decides which columns the bands and item rows will accept.",
  minQty: "A bill or line below this quantity gets nothing. 0 means no floor.",
  minBillAmount: "A bill below this amount gets nothing. 0 means no floor.",
  maxBenefitPerBill: "The largest benefit one bill may take, in rupees. 0 means uncapped.",
  budget:
    "Total the whole campaign may give away before it stops. 0 means no budget. Counted across branches, so an offline bill still spends it.",
  maxUsesTotal: "How many times the scheme may be used at all. 0 means unlimited.",
  maxUsesPerCust: "How many times one customer may use it. 0 means unlimited.",
  company: "The company this scheme belongs to. A scheme never crosses companies.",
  branchScope: SCOPE_HINT,
  custScope: SCOPE_HINT,
  itemScope: SCOPE_HINT,
  priceLevel: "Restrict the scheme to bills sold at one price level. Blank means every price level.",
  billType: "Restrict the scheme to cash or credit bills. ALL runs on both.",
  couponBatch:
    "Gate the scheme behind a coupon batch, so it applies only when a coupon is presented. Blank means it applies automatically.",
  startDate: "First day the scheme runs.",
  endDate: "Last day the scheme runs. Cannot fall before the start date.",
  timeWindow: "Tick to limit the scheme to part of the day — a happy hour. Left clear it runs all day.",
  fromTime: "Time of day the scheme starts, when a time window is in use.",
  toTime: "Time of day the scheme stops, when a time window is in use.",
  weekdays: "Limit the scheme to certain days. Leave every box clear to run on all of them.",
} as const;
