/**
 * Promotions — does a scheme cover THIS bill, and does it cover THIS line
 * (§11)? Pure.
 *
 * The party scope is resolved the way the server's `/eligibility` does it:
 * highest `match_priority` wins, and at equal priority an EXCLUDE beats an
 * INCLUDE. `CUSTOMER_GROUP` and `CITY` rules never match here — customer-detail
 * carries neither id (§27 PROMO-KEYS) — so a scheme scoped to a list those
 * alone reach is simply not applied.
 */
import type {
  PromotionItemRule,
  PromotionPartyRule,
  PromotionScheme,
} from "./rules";

/** The bill's facts the engine matches against. `docDate` is the BILL date, never today. */
export type PromotionContext = {
  compId: string;
  /** The DOCUMENT's branch. */
  branchId: string;
  /** `yyyy-mm-dd`. */
  docDate: string;
  /** `HH:mm`, now. */
  docTime: string;
  custId: string | null;
  areaId: string | null;
  priceLevelId: number;
  /** The term, or `ALL` when the bill has none yet. */
  billType: "CASH" | "CREDIT" | "ALL";
  /** The Promo tick. Off → nothing applies, and the hint says so. */
  promotionsEnabled: boolean;
};

/** The line's facts the item scope matches against. */
export type PromotionLineKeys = {
  itemId: string;
  unitId: string | null;
  groupId: string | null;
  categoryId: string | null;
  brandId: string | null;
  sectionId: string | null;
};

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function weekdayOf(isoDate: string): string | null {
  const parsed = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : WEEKDAYS[parsed.getDay()];
}

/** `HH:mm` inside a window that may cross midnight. */
function inTimeWindow(time: string, from: string | null, to: string | null): boolean {
  if (!from || !to) {
    return true;
  }
  if (from <= to) {
    return time >= from && time <= to;
  }
  // 22:00 → 02:00 crosses midnight.
  return time >= from || time <= to;
}

/** Whether the scheme runs at all: live, in date, in time, on this weekday. */
export function schemeIsLive(scheme: PromotionScheme, context: PromotionContext): boolean {
  if (!scheme.isActive || scheme.status !== "APPROVED") {
    return false;
  }
  if (scheme.companyId && scheme.companyId !== context.compId) {
    return false;
  }
  if (scheme.startDate && context.docDate < scheme.startDate) {
    return false;
  }
  if (scheme.endDate && context.docDate > scheme.endDate) {
    return false;
  }
  if (scheme.validWeekdays && scheme.validWeekdays.length > 0) {
    const day = weekdayOf(context.docDate);
    if (!day || !scheme.validWeekdays.includes(day)) {
      return false;
    }
  }
  return inTimeWindow(context.docTime, scheme.validFromTime, scheme.validToTime);
}

/** Whether this branch runs the scheme. */
export function branchQualifies(scheme: PromotionScheme, branchId: string): boolean {
  if (scheme.branchScope === "ALL") {
    return !scheme.branchId || scheme.branchId === branchId;
  }
  const rows = scheme.branches.filter((row) => row.branchId === branchId);
  if (rows.length === 0) {
    return false;
  }
  return !rows.some((row) => row.isExclude);
}

function decide<T extends { isExclude: boolean; priority: number }>(rows: T[]): boolean | null {
  if (rows.length === 0) {
    return null;
  }
  const top = Math.max(...rows.map((row) => row.priority));
  const winners = rows.filter((row) => row.priority === top);
  // At equal priority an EXCLUDE beats an INCLUDE.
  return !winners.some((row) => row.isExclude);
}

/** Whether this customer qualifies. Group and city rules never reach (§27). */
export function partyQualifies(scheme: PromotionScheme, context: PromotionContext): boolean {
  if (scheme.custScope === "ALL") {
    return true;
  }
  const reaching = scheme.parties.filter((rule: PromotionPartyRule) => {
    if (rule.kind === "CUSTOMER") {
      return Boolean(context.custId) && rule.scopeId === context.custId;
    }
    if (rule.kind === "AREA") {
      return Boolean(context.areaId) && rule.scopeId === context.areaId;
    }
    return false;
  });
  return decide(reaching) === true;
}

/** The bill-level facts: term, price level, the Promo tick. */
export function billQualifies(scheme: PromotionScheme, context: PromotionContext): boolean {
  if (!context.promotionsEnabled || !scheme.autoApply) {
    return false;
  }
  if (scheme.billType !== "ALL" && context.billType !== "ALL" && scheme.billType !== context.billType) {
    return false;
  }
  if (scheme.priceLevelId !== null && scheme.priceLevelId !== context.priceLevelId) {
    return false;
  }
  return true;
}

/** Everything but the lines: live · branch · party · bill. */
export function schemeCovers(scheme: PromotionScheme, context: PromotionContext): boolean {
  return (
    schemeIsLive(scheme, context) &&
    branchQualifies(scheme, context.branchId) &&
    partyQualifies(scheme, context) &&
    billQualifies(scheme, context)
  );
}

/**
 * The item rule that decides this line, or `undefined` when the scheme covers
 * every item, or `null` when it does not cover this one.
 */
export function itemRuleFor(
  scheme: PromotionScheme,
  line: PromotionLineKeys,
): PromotionItemRule | null | undefined {
  if (scheme.itemScope === "ALL") {
    return undefined;
  }
  const reaching = scheme.items.filter((rule) => {
    switch (rule.kind) {
      case "ITEM":
        return rule.scopeId === line.itemId && (!rule.unitId || !line.unitId || rule.unitId === line.unitId);
      case "ITEM_GROUP":
        return Boolean(line.groupId) && rule.scopeId === line.groupId;
      case "ITEM_CATEGORY":
        return Boolean(line.categoryId) && rule.scopeId === line.categoryId;
      case "ITEM_BRAND":
        return Boolean(line.brandId) && rule.scopeId === line.brandId;
      case "ITEM_SECTION":
        return Boolean(line.sectionId) && rule.scopeId === line.sectionId;
      default:
        return false;
    }
  });
  if (decide(reaching) !== true) {
    return null;
  }
  const top = Math.max(...reaching.map((rule) => rule.priority));
  return reaching.find((rule) => rule.priority === top && !rule.isExclude) ?? null;
}
