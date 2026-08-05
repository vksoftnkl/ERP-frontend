/**
 * Quotation Entry — draft factories and state transitions that
 * `quotation.payload.test.ts` does not already exercise (that file covers
 * `chargeRowFromMaster`, `createDraftLine`/`createDraftChargeRow` and
 * `applySaveResponse` through the reducer). This file is the validity-date
 * sync rule, the wire-to-snapshot mappers, and the price-level clamp they all
 * share.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_POS_STATE_CODE, DEFAULT_QUOTATION_STATUS } from "./quotation.constants";
import {
  applyHeaderField,
  applyItemPrice,
  clampPriceLevel,
  copyDraftAsNew,
  createDraft,
  createDraftChargeRow,
  createDraftLine,
  customerFromDetail,
  emptyHeader,
  MAX_PRICE_LEVEL,
  MIN_PRICE_LEVEL,
  resolveLocalSale,
} from "./quotation.state";
import type {
  CustomerDetailPayload,
  ItemPriceLookupPayload,
  QuotationHeader,
} from "./quotation.types";
import { todayIso } from "./quotation.utils";

describe("clampPriceLevel", () => {
  it("passes an in-range level through unchanged", () => {
    expect(clampPriceLevel(3)).toBe(3);
  });

  it("floors zero, negative and non-finite levels to the minimum", () => {
    expect(clampPriceLevel(0)).toBe(MIN_PRICE_LEVEL);
    expect(clampPriceLevel(-5)).toBe(MIN_PRICE_LEVEL);
    expect(clampPriceLevel(Number.NaN)).toBe(MIN_PRICE_LEVEL);
  });

  it("ceils a level past the maximum", () => {
    expect(clampPriceLevel(99)).toBe(MAX_PRICE_LEVEL);
  });

  it("truncates a fractional level rather than rounding it up", () => {
    expect(clampPriceLevel(2.9)).toBe(2);
  });
});

describe("resolveLocalSale", () => {
  it("is local when the place of supply matches the company's own state", () => {
    expect(resolveLocalSale("33", "33", false)).toBe(true);
  });

  it("is inter-state when they differ", () => {
    expect(resolveLocalSale("29", "33", true)).toBe(false);
  });

  it("falls back when either side is blank — clearing the dropdown is not a request to re-tax the document", () => {
    expect(resolveLocalSale("", "33", true)).toBe(true);
    expect(resolveLocalSale("33", "", false)).toBe(false);
    expect(resolveLocalSale("   ", "33", true)).toBe(true);
  });
});

describe("createDraft", () => {
  it("seeds a fresh, clean entry document from the session context", () => {
    const draft = createDraft({
      companyId: "co-1",
      branchId: "br-1",
      accYear: "2026-2027",
      companyStateCode: "33",
      quoteDate: "2026-07-30",
    });
    expect(draft.mode).toBe("entry");
    expect(draft.isDirty).toBe(false);
    expect(draft.isNewEntry).toBe(true);
    expect(draft.docId).toBeNull();
    expect(draft.lines).toEqual([]);
    expect(draft.charges).toEqual([]);
    expect(draft.header.quoteDate).toBe("2026-07-30");
    // The calc types are sent lower-case; the server does not normalise them.
    // Nothing on the entry screen sets these any more — the seed IS the policy,
    // so this assertion is the only thing holding it.
    expect(draft.policy.freightCalcType).toBe("manual");
    expect(draft.policy.loadingCalcType).toBe("manual");
    expect(draft.policy.discountAlterBaseRate).toBe(false);
  });

  it("defaults the quote date to today when the caller gives none", () => {
    const draft = createDraft({
      companyId: "co-1",
      branchId: "br-1",
      accYear: "2026-2027",
      companyStateCode: "33",
    });
    expect(draft.header.quoteDate).toBe(todayIso());
  });

  it("is local when the company sits in the default POS state, and inter-state otherwise", () => {
    expect(
      createDraft({
        companyId: "co-1",
        branchId: "br-1",
        accYear: "2026-2027",
        companyStateCode: DEFAULT_POS_STATE_CODE,
      }).isLocalSale,
    ).toBe(true);
    expect(
      createDraft({
        companyId: "co-1",
        branchId: "br-1",
        accYear: "2026-2027",
        companyStateCode: "29",
      }).isLocalSale,
    ).toBe(false);
  });
});

describe("applyHeaderField — the validity date/day pair", () => {
  const header = (): QuotationHeader => emptyHeader("2026-07-30");

  it("keying the validity days derives the expiry date", () => {
    const next = applyHeaderField(header(), "validityDays", 15);
    expect(next.validityDays).toBe(15);
    expect(next.validUntil).toBe("2026-08-14");
  });

  it("zeroing the validity days clears the expiry date rather than leaving it stale", () => {
    const withValidity = applyHeaderField(header(), "validityDays", 15);
    const cleared = applyHeaderField(withValidity, "validityDays", 0);
    expect(cleared.validUntil).toBe("");
  });

  it("moving the quote date re-derives the expiry date when a validity period is in force", () => {
    const withValidity = applyHeaderField(header(), "validityDays", 15);
    const moved = applyHeaderField(withValidity, "quoteDate", "2026-08-01");
    expect(moved.validUntil).toBe("2026-08-16");
  });

  it("moving the quote date leaves a manually keyed expiry date alone when no validity period is set", () => {
    // Explicitly no period: a new header seeds one (DEFAULT_VALIDITY_DAYS).
    const withExpiry: QuotationHeader = {
      ...header(),
      validityDays: 0,
      validUntil: "2026-09-01",
    };
    const moved = applyHeaderField(withExpiry, "quoteDate", "2026-08-01");
    expect(moved.validUntil).toBe("2026-09-01");
  });

  it("keying the expiry date directly derives the validity day count", () => {
    const next = applyHeaderField(header(), "validUntil", "2026-08-14");
    expect(next.validityDays).toBe(15);
  });

  it("clearing the expiry date resets the validity day count to zero", () => {
    const withValidity = applyHeaderField(header(), "validityDays", 15);
    const cleared = applyHeaderField(withValidity, "validUntil", "");
    expect(cleared.validityDays).toBe(0);
  });

  it("clamps the price level like every other entry point", () => {
    expect(applyHeaderField(header(), "priceLevel", 99).priceLevel).toBe(MAX_PRICE_LEVEL);
  });

  it("passes any other field straight through untouched", () => {
    const before = header();
    const next = applyHeaderField(before, "contactPerson", "Ravi");
    expect(next.contactPerson).toBe("Ravi");
    expect(next.validUntil).toBe(before.validUntil);
    expect(next.validityDays).toBe(before.validityDays);
  });

  it("opens a new header on the standard validity window", () => {
    expect(header().validityDays).toBe(7);
    expect(header().validUntil).toBe("2026-08-06");
  });
});

describe("customerFromDetail", () => {
  const detail: CustomerDetailPayload = {
    cust_id: "cust-1",
    cust_name: "Acme Traders",
    cust_address: "12 MG Road",
    cust_place: "Chennai",
    cust_ename: "Acme Traders (EN)",
    cust_eadd1: null,
    cust_eadd2: null,
    cust_eadd3: null,
    cust_pin: null,
    ecommerce_gstin: null,
    gst_no: "33ABCDE1234F1Z5",
    gst_type: "Regular",
    state_code: "33",
    state_name: "Tamil Nadu",
    area_id: "area-1",
    area_name: "T Nagar",
    distance_km: 12,
    cust_phone1: "9840012345",
    debit_days: 30,
    debit_limit: 50000,
    debit_allowed: true,
    freight_charge: false,
    cooly: false,
    unloading_charge: false,
    allow_promotion: true,
    allow_loyalty: true,
    allow_discount: true,
    overdue_billing: false,
    price_level: 2,
    cust_disc_perc: 5,
    salesman_id: null,
    salesman_name: null,
    tcs_company: false,
    tcs_customer: false,
    cust_pan: false,
    local_sales: true,
    cust_points: 100,
    billed_date: "2026-06-01",
  };

  it("maps the snake_case lookup onto the draft's customer snapshot", () => {
    const snapshot = customerFromDetail(detail);
    expect(snapshot.custId).toBe("cust-1");
    expect(snapshot.name).toBe("Acme Traders");
    expect(snapshot.gstin).toBe("33ABCDE1234F1Z5");
    expect(snapshot.stateCode).toBe("33");
    expect(snapshot.priceLevel).toBe(2);
    expect(snapshot.discPerc).toBe(5);
    expect(snapshot.points).toBe(100);
  });

  it("falls back to the e-commerce GSTIN when the customer carries none of their own", () => {
    const snapshot = customerFromDetail({
      ...detail,
      gst_no: null,
      ecommerce_gstin: "33ZZZZZ0000Z1Z5",
    });
    expect(snapshot.gstin).toBe("33ZZZZZ0000Z1Z5");
  });

  it("clamps an out-of-range price level rather than handing it straight to the picker", () => {
    expect(customerFromDetail({ ...detail, price_level: 0 }).priceLevel).toBe(MIN_PRICE_LEVEL);
    expect(customerFromDetail({ ...detail, price_level: 12 }).priceLevel).toBe(MAX_PRICE_LEVEL);
  });

  it("treats a blank area id as absent rather than an empty string", () => {
    expect(customerFromDetail({ ...detail, area_id: "" }).areaId).toBeNull();
  });
});

describe("applyItemPrice", () => {
  const lookup: ItemPriceLookupPayload = {
    item_id: "item-1",
    item_uc_id: "iuc-1",
    godown_id: "god-1",
    godown_name: "Main Store",
    item_code: "IT-001",
    item_name: "New Claw",
    item_com_code: null,
    barcode: "8901234500012",
    allow_promo: true,
    add_freight: true,
    item_group_id: "grp-1",
    item_category_id: "cat-1",
    item_brand_id: "brand-1",
    item_section_id: "sec-1",
    weigh_scale: false,
    batch_config: 0,
    service_item: "N",
    allow_negative_stock: false,
    price_level: 2,
    sales_price: 120,
    cost_price: 90,
    cost_wot: 85,
    min_price: 100,
    max_price: 150,
    disc_perc: 5,
    disc_qty: 0,
    sch_discount: null,
    addl_cess: 0,
    unit_name: "PCS",
    base_unit_id: "unit-base-1",
    base_factor: 12,
    iuc_uom_weight: 0.5,
    decimal_count: 2,
    loading_charge: null,
    resolved_weight: null,
    freight_charge: null,
    loyalty_pv: 1.5,
    stock: 40,
    reorder_qty: 10,
    item_incl_tax: false,
    gst_rate: 18,
    cess_perc: 0,
    cess_unit: 0,
    sgst_perc: 9,
    cgst_perc: 9,
    igst_perc: 18,
  };

  it("fills a line from the item-price lookup, keying the rate to actualPrice too", () => {
    const line = applyItemPrice(createDraftLine(), lookup);
    expect(line.itemId).toBe("item-1");
    // The line stores the unit-conversion id — sent on save as sqiItemUnitId.
    expect(line.itemUnitId).toBe("iuc-1");
    expect(line.unitName).toBe("PCS");
    expect(line.rate).toBe(120);
    expect(line.actualPrice).toBe(120);
    expect(line.mrp).toBe(150);
    expect(line.minPrice).toBe(100);
    expect(line.toBaseFactor).toBe(12);
    expect(line.toBaseFactorKnown).toBe(true);
    expect(line.priceLevel).toBe(2);
  });

  it("defaults a null freight/loading charge to zero, distinct from the hasFreight flag", () => {
    const line = applyItemPrice(createDraftLine(), lookup);
    expect(line.hasFreight).toBe(true);
    expect(line.freightPerQty).toBe(0);
    expect(line.loadingPerQty).toBe(0);
  });

  it("falls back to 1 for the base factor when the lookup carries none", () => {
    const line = applyItemPrice(createDraftLine(), { ...lookup, base_factor: 0 });
    expect(line.toBaseFactor).toBe(1);
  });

  it("clamps the resolved price level like every other entry point", () => {
    expect(applyItemPrice(createDraftLine(), { ...lookup, price_level: 0 }).priceLevel).toBe(
      MIN_PRICE_LEVEL,
    );
  });

  it("prefers the caller's own unit name/id over the lookup's when both are given", () => {
    const line = applyItemPrice(createDraftLine(), lookup, {
      unitName: "BOX",
      unitId: "unit-box-1",
    });
    expect(line.unitName).toBe("BOX");
    expect(line.unitId).toBe("unit-box-1");
  });

  it("leaves hsnCode, unitId and aliasName alone — this lookup carries none of them", () => {
    const seeded = createDraftLine({ hsnCode: "1102", unitId: "unit-x", aliasName: "Alias" });
    const line = applyItemPrice(seeded, lookup);
    expect(line.hsnCode).toBe("1102");
    expect(line.unitId).toBe("unit-x");
    expect(line.aliasName).toBe("Alias");
  });
});

describe("copyDraftAsNew", () => {
  function savedDraft() {
    const draft = createDraft({
      companyId: "co-1",
      branchId: "br-1",
      accYear: "2025-2026",
      companyStateCode: "33",
      quoteDate: "2026-07-01",
    });
    return {
      ...draft,
      mode: "browse" as const,
      pricing: "stored" as const,
      isDirty: false,
      docId: "doc-1",
      quoteSlno: "10",
      quoteRefno: "QT/0010",
      revisionNo: 2,
      status: "ACCEPTED",
      isNewEntry: false,
      header: { ...draft.header, validityDays: 7, validUntil: "2026-07-08" },
      lines: [{ ...createDraftLine(), sqiId: "line-1" }],
      charges: [createDraftChargeRow({ cdId: "charge-1", chgId: "chg-1", ledgerCode: "led-1" })],
      storedPricing: {} as never,
    };
  }

  it("strips the server-owned identity so the next save creates a new document", () => {
    const next = copyDraftAsNew(savedDraft(), "2026-08-01");
    expect(next.docId).toBeNull();
    expect(next.quoteSlno).toBe("");
    expect(next.quoteRefno).toBe("");
    expect(next.revisionNo).toBe(0);
    expect(next.isNewEntry).toBe(true);
    expect(next.status).toBe(DEFAULT_QUOTATION_STATUS);
    expect(next.mode).toBe("entry");
    expect(next.pricing).toBe("live");
    expect(next.isDirty).toBe(true);
    expect(next.storedPricing).toBeNull();
  });

  it("clears each line's and charge's own saved id, keeping everything else", () => {
    const source = savedDraft();
    const next = copyDraftAsNew(source, "2026-08-01");
    expect(next.lines[0].sqiId).toBeNull();
    expect(next.lines[0].key).toBe(source.lines[0].key);
    expect(next.charges[0].cdId).toBeNull();
    expect(next.charges[0].chgId).toBe("chg-1");
  });

  it("resets the quote date and re-derives valid-until from the existing validity days", () => {
    const next = copyDraftAsNew(savedDraft(), "2026-08-01");
    expect(next.header.quoteDate).toBe("2026-08-01");
    expect(next.header.validityDays).toBe(7);
    expect(next.header.validUntil).toBe("2026-08-08");
  });

  it("clears the soft-delete flag — this is the way out of a deleted quotation", () => {
    const next = copyDraftAsNew({ ...savedDraft(), isDeleted: true }, "2026-08-01");
    expect(next.isDeleted).toBe(false);
    expect(next.mode).toBe("entry");
    expect(next.lines[0].itemId).toBe(savedDraft().lines[0].itemId);
  });
});
