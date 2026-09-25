/**
 * Promotions (§11): the graph read leniently, the scope resolved the way the
 * server's `/eligibility` does, and the pass that writes the scheme tier and
 * the free lines from INPUTS only.
 */
import { describe, expect, it } from "vitest";
import { defaultPolicy } from "@/domain/pricing";
import { createBillDraftLine } from "../salebill.state";
import type { SaleBillDraftLine } from "../salebill.types";
import { evaluatePromotions, promotionHint, reconcileFreeLines, repeatsFor, slabFor } from "./evaluate";
import { branchQualifies, itemRuleFor, partyQualifies, schemeCovers, schemeIsLive, type PromotionContext } from "./match";
import { parsePromotionSchemes, type PromotionScheme } from "./rules";

const RAW_SCHEME = {
  prm_id: "prm-1",
  prm_comp_id: "c1",
  prm_branch_id: null,
  prm_code: "DIWALI25",
  prm_name: "Diwali 10% off own brand",
  prm_status: "APPROVED",
  prm_apply_on: "ITEM_AMOUNT",
  prm_benefit: "DISC_PERC",
  prm_priority: "5",
  prm_stack_mode: "EXCLUSIVE",
  prm_auto_apply: true,
  prm_allow_with_manual_disc: true,
  prm_bill_type: "ALL",
  prm_min_bill_amount: "0",
  prm_min_qty: 0,
  prm_branch_scope: "ALL",
  prm_cust_scope: "LIST",
  prm_item_scope: "LIST",
  prm_price_level_id: null,
  prm_max_benefit_per_bill: 0,
  prm_start_date: "2026-09-01",
  prm_end_date: "2026-09-30",
  prm_valid_from_time: null,
  prm_valid_to_time: null,
  prm_valid_weekdays: null,
  prm_is_active: true,
  prm_is_deleted: false,
  branches: [],
  parties: [
    { prp_id: "p1", prp_kind: "AREA", prp_scope_id: "area-1", prp_is_exclude: false, prp_match_priority: 3, prp_is_active: true },
    { prp_id: "p2", prp_kind: "CUSTOMER", prp_scope_id: "cust-x", prp_is_exclude: true, prp_match_priority: 4, prp_is_active: true },
  ],
  items: [
    { pri_id: "i1", pri_kind: "ITEM_BRAND", pri_scope_id: "brand-1", pri_is_exclude: false, pri_match_priority: 3, pri_disc_perc: 0, pri_is_active: true },
  ],
  slabs: [
    { prs_id: "s1", prs_slno: 1, prs_exceeds: "1000", prs_upto: "4999", prs_disc_perc: "5", prs_each: 0, prs_is_repeat: false, prs_max_repeats: 0, prs_free_qty: 0, prs_disc_qty: 0, prs_disc_amt: 0, prs_fixed_price: null, prs_max_benefit_amt: 0, prs_is_active: true },
    { prs_id: "s2", prs_slno: 2, prs_exceeds: "5000", prs_upto: null, prs_disc_perc: "10", prs_each: 0, prs_is_repeat: false, prs_max_repeats: 0, prs_free_qty: 0, prs_disc_qty: 0, prs_disc_amt: 0, prs_fixed_price: null, prs_max_benefit_amt: 0, prs_is_active: true },
  ],
};

const CONTEXT: PromotionContext = {
  compId: "c1",
  branchId: "b1",
  docDate: "2026-09-25",
  docTime: "11:30",
  custId: "cust-1",
  areaId: "area-1",
  priceLevelId: 1,
  billType: "CASH",
  promotionsEnabled: true,
};

function line(overrides: Partial<SaleBillDraftLine>): SaleBillDraftLine {
  return createBillDraftLine({
    itemId: "item-1",
    itemUnitId: "iuc-1",
    itemName: "PAINT 4L",
    brandId: "brand-1",
    billQty: 10,
    rate: 600,
    schemeFlag: true,
    ...overrides,
  });
}

const policy = defaultPolicy();

describe("parsePromotionSchemes", () => {
  it("reads the graph with quoted numerics, and drops what it cannot name", () => {
    const [scheme] = parsePromotionSchemes({ data: [RAW_SCHEME, { prm_code: "no id" }] });
    expect(scheme.priority).toBe(5);
    expect(scheme.slabs[0]).toMatchObject({ exceeds: 1000, upto: 4999, discPerc: 5 });
    expect(scheme.parties[1].isExclude).toBe(true);
    expect(parsePromotionSchemes({ data: [RAW_SCHEME, { prm_code: "no id" }] })).toHaveLength(1);
  });
});

describe("match — the scope resolved like the server's /eligibility", () => {
  const [scheme] = parsePromotionSchemes([RAW_SCHEME]);

  it("is live only APPROVED, in date, on the bill date — never today's", () => {
    expect(schemeIsLive(scheme, CONTEXT)).toBe(true);
    expect(schemeIsLive(scheme, { ...CONTEXT, docDate: "2026-10-01" })).toBe(false);
    expect(schemeIsLive({ ...scheme, status: "DRAFT" }, CONTEXT)).toBe(false);
    expect(schemeIsLive({ ...scheme, validWeekdays: ["SUN"] }, CONTEXT)).toBe(false);
    expect(schemeIsLive({ ...scheme, validFromTime: "22:00", validToTime: "02:00" }, { ...CONTEXT, docTime: "23:15" })).toBe(true);
    expect(schemeIsLive({ ...scheme, validFromTime: "22:00", validToTime: "02:00" }, CONTEXT)).toBe(false);
  });

  it("branch scope: ALL, or a LIST that names the branch without excluding it", () => {
    expect(branchQualifies(scheme, "b1")).toBe(true);
    const listed: PromotionScheme = { ...scheme, branchScope: "LIST", branches: [{ branchId: "b2", isExclude: false }] };
    expect(branchQualifies(listed, "b1")).toBe(false);
    expect(branchQualifies(listed, "b2")).toBe(true);
  });

  it("party scope: highest priority wins, EXCLUDE beats INCLUDE at equal priority, group/city never reach", () => {
    expect(partyQualifies(scheme, CONTEXT)).toBe(true);
    // The excluded customer sits above the area rule.
    expect(partyQualifies(scheme, { ...CONTEXT, custId: "cust-x" })).toBe(false);
    expect(partyQualifies(scheme, { ...CONTEXT, custId: "cust-2", areaId: "area-9" })).toBe(false);
    const groupOnly: PromotionScheme = { ...scheme, parties: [{ kind: "CUSTOMER_GROUP", scopeId: "grp-1", isExclude: false, priority: 1 }] };
    expect(partyQualifies(groupOnly, CONTEXT)).toBe(false);
    const tie: PromotionScheme = {
      ...scheme,
      parties: [
        { kind: "CUSTOMER", scopeId: "cust-1", isExclude: false, priority: 4 },
        { kind: "CUSTOMER", scopeId: "cust-1", isExclude: true, priority: 4 },
      ],
    };
    expect(partyQualifies(tie, CONTEXT)).toBe(false);
  });

  it("bill scope: the Promo tick, the term, the price level", () => {
    expect(schemeCovers(scheme, { ...CONTEXT, promotionsEnabled: false })).toBe(false);
    expect(schemeCovers({ ...scheme, billType: "CREDIT" }, CONTEXT)).toBe(false);
    expect(schemeCovers({ ...scheme, priceLevelId: 2 }, CONTEXT)).toBe(false);
    expect(schemeCovers({ ...scheme, priceLevelId: 1 }, CONTEXT)).toBe(true);
  });

  it("item scope: the rule that decides the line, undefined for ALL, null for not covered", () => {
    const keys = { itemId: "item-1", unitId: "iuc-1", groupId: null, categoryId: null, brandId: "brand-1", sectionId: null };
    expect(itemRuleFor(scheme, keys)?.kind).toBe("ITEM_BRAND");
    expect(itemRuleFor(scheme, { ...keys, brandId: "other" })).toBeNull();
    expect(itemRuleFor({ ...scheme, itemScope: "ALL" }, keys)).toBeUndefined();
  });
});

describe("evaluatePromotions — the tier written from inputs, one scheme per line", () => {
  const [scheme] = parsePromotionSchemes([RAW_SCHEME]);

  it("writes schPerc from the slab the line's own amount falls in, and stamps the scheme", () => {
    const result = evaluatePromotions([scheme], CONTEXT, [line({})], policy);
    // 10 × 600 = 6,000 → the 10% band.
    expect(result.lines[0].schPerc).toBe(10);
    expect(result.lines[0].schemeId).toBe("prm-1");
    expect(result.lines[0].isPromo).toBe(true);
    expect(result.applied).toHaveLength(1);
    expect(result.changed).toBe(true);
  });

  it("slabFor / repeatsFor: exceeds ≤ basis < upto; a repeating band earns per `each`, capped", () => {
    expect(slabFor(scheme.slabs, 999)).toBeNull();
    expect(slabFor(scheme.slabs, 1000)?.discPerc).toBe(5);
    expect(slabFor(scheme.slabs, 4999)?.discPerc).toBe(5);
    expect(slabFor(scheme.slabs, 5000)?.discPerc).toBe(10);
    const band = { ...scheme.slabs[0], isRepeat: true, each: 500, maxRepeats: 3 };
    expect(repeatsFor(band, 1000)).toBe(1);
    expect(repeatsFor(band, 2100)).toBe(3);
    expect(repeatsFor(band, 9000)).toBe(3);
  });

  it("clears the tier it wrote when the line no longer qualifies, and never touches an operator's free line", () => {
    const stamped = line({ schPerc: 10, schemeId: "prm-1", schemeName: "old", isPromo: true, brandId: "other" });
    const free = line({ key: "free-op", isFree: true, schemeId: null, rate: 0 });
    const result = evaluatePromotions([scheme], CONTEXT, [stamped, free], policy);
    expect(result.lines[0].schPerc).toBe(0);
    expect(result.lines[0].schemeId).toBeNull();
    expect(result.lines[1]).toBe(free);
  });

  it("skips a line whose Sch tick is off, and everything when promotions are off for the bill", () => {
    expect(evaluatePromotions([scheme], CONTEXT, [line({ schemeFlag: false })], policy).lines[0].schPerc).toBe(0);
    const off = evaluatePromotions([scheme], { ...CONTEXT, promotionsEnabled: false }, [line({ schPerc: 10, schemeId: "prm-1" })], policy);
    expect(off.lines[0].schPerc).toBe(0);
    expect(promotionHint(false, [], [])).toBe("Promotions are switched off for this bill.");
  });

  it("a bill-level scheme writes the bill scheme PERCENT onto the lines it measured", () => {
    const billLevel: PromotionScheme = {
      ...scheme,
      applyOn: "BILL_AMOUNT",
      benefit: "DISC_AMT",
      slabs: [{ ...scheme.slabs[1], discPerc: 0, discAmt: 600 }],
    };
    const result = evaluatePromotions([billLevel], CONTEXT, [line({}), line({ key: "l2", itemId: "item-2", rate: 400 })], policy);
    // 6,000 + 4,000 = 10,000 → 600 is 6% of the measured basis, on both lines.
    expect(result.lines[0].billSchDiscPerc).toBe(6);
    expect(result.lines[1].billSchDiscPerc).toBe(6);
    expect(result.lines[0].schPerc).toBe(0);
  });

  it("a FREE_ITEM scheme asks for a free line keyed scheme|item|unit, below the last stamped line", () => {
    const freeScheme: PromotionScheme = {
      ...scheme,
      benefit: "FREE_ITEM",
      applyOn: "ITEM_QTY",
      slabs: [{ ...scheme.slabs[0], exceeds: 10, upto: null, discPerc: 0, freeItemId: "gift-1", freeUnitId: "iuc-g", freeItemName: "BRUSH", freeQty: 1, isRepeat: true, each: 10, maxRepeats: 0 }],
    };
    const result = evaluatePromotions([freeScheme], CONTEXT, [line({ billQty: 25 })], policy);
    expect(result.freeLines).toEqual([
      { key: "prm-1|gift-1|iuc-g", schemeId: "prm-1", schemeName: freeScheme.name, itemId: "gift-1", unitId: "iuc-g", itemName: "BRUSH", qty: 2, afterLineKey: result.lines[0].key },
    ]);
    // Reconcile: nothing on the bill yet → one to insert; then an in-place qty update; then a removal.
    const first = reconcileFreeLines(result.lines, result.freeLines);
    expect(first.toInsert).toHaveLength(1);
    const placed = createBillDraftLine({ key: "free-1", itemId: "gift-1", itemUnitId: "iuc-g", isFree: true, schemeId: "prm-1", billQty: 1 });
    const updated = reconcileFreeLines([result.lines[0], placed], result.freeLines);
    expect(updated.toInsert).toHaveLength(0);
    expect(updated.lines[1].billQty).toBe(2);
    const removed = reconcileFreeLines([result.lines[0], placed], []);
    expect(removed.lines).toHaveLength(1);
    expect(removed.changed).toBe(true);
  });

  it("the highest-priority scheme wins a line; the other is 'not applied'", () => {
    const second: PromotionScheme = { ...scheme, id: "prm-2", code: "SECOND", name: "Second", priority: 1, slabs: [{ ...scheme.slabs[0], exceeds: 0, upto: null, discPerc: 2 }] };
    const result = evaluatePromotions([second, scheme], CONTEXT, [line({})], policy);
    expect(result.lines[0].schemeId).toBe("prm-1");
    expect(result.notApplied.map((note) => note.schemeId)).toContain("prm-2");
  });

  it("caps the scheme's benefit per bill by falling back to an amount tier", () => {
    const capped: PromotionScheme = { ...scheme, maxBenefitPerBill: 100 };
    const result = evaluatePromotions([capped], CONTEXT, [line({}), line({ key: "l2" })], policy);
    // Line 1 would take 600 at 10% > 100 → schAmt 100; line 2 has no room left.
    expect(result.lines[0].schAmt).toBe(100);
    expect(result.lines[0].schPerc).toBe(0);
    expect(result.lines[1].schemeId).toBeNull();
  });
});
