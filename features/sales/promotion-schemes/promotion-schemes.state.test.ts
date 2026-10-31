import { describe, expect, it } from "vitest";
import {
  acceptNumberText,
  blankSlabRow,
  buildSavePayload,
  newSchemeForm,
  parseTime12,
  realRowCount,
  schemeFormFromPayload,
  schemeReducer,
  slabIsBlank,
  timeWindowText,
  triggerRefused,
  validateScheme,
  type SchemeAction,
  type SchemeForm,
} from "./promotion-schemes.state";
import {
  benefitNeedsItemTrigger,
  benefitUsesBands,
  itemRateAllowed,
  slabColumnAllowed,
} from "./promotion-schemes.vocab";

const COMPANY = "019c8ea6-19e9-78a8-b15f-749e1cde7292";

function fresh(): SchemeForm {
  return newSchemeForm({ today: new Date(2026, 9, 31), companyId: COMPANY, companyName: "Acme Foods" });
}

function run(form: SchemeForm, ...actions: SchemeAction[]): SchemeForm {
  return actions.reduce(schemeReducer, form);
}

/** A valid DISC_PERC scheme with one band — the smallest thing that saves. */
function valid(): SchemeForm {
  return run(
    fresh(),
    { type: "header", patch: { code: "ZT-PS1", name: "ZT- test" } },
    { type: "slabEdit", index: 0, field: "discPerc", value: "10" },
  );
}

/** The live answer of GET /promotion-scheme/get for FRRE (2026-10-31), trimmed. */
const FRRE = {
  prm_id: "01a033aa-545b-735a-8cf8-674b84d8be6f",
  prm_comp_id: COMPANY,
  prm_comp_name: "Amazon Retail India Private Limited",
  prm_code: "FRRE",
  prm_name: "FREE ON ITEMS",
  prm_status: "APPROVED",
  prm_apply_on: "ITEM_QTY",
  prm_benefit: "FREE_ITEM",
  prm_priority: 2,
  prm_stack_mode: "EXCLUSIVE",
  prm_auto_apply: true,
  prm_allow_with_manual_disc: false,
  prm_calc_on_amount_type: "NET_AMOUNT",
  prm_include_tax: false,
  prm_bill_type: "ALL",
  prm_min_bill_amount: 0,
  prm_min_qty: 0,
  prm_branch_scope: "ALL",
  prm_cust_scope: "ALL",
  prm_item_scope: "LIST",
  prm_price_level_id: null,
  prm_max_benefit_per_bill: 0,
  prm_max_uses_total: 0,
  prm_max_uses_per_cust: 0,
  prm_budget_amount: 0,
  prm_coupon_batch_id: null,
  prm_start_date: "2026-08-24",
  prm_end_date: "2027-08-24",
  prm_valid_from_time: null,
  prm_valid_to_time: null,
  prm_valid_weekdays: null,
  prm_remarks: null,
  prm_approved_on: "2026-08-29T07:21:08.000Z",
  prm_approved_by: "019e441b-6e48-7918-b246-b857ffb35db1",
  branches: [],
  parties: [],
  items: [
    {
      pri_id: "01a033aa-5462-7766-9cfd-3e74952ec301",
      pri_slno: 1,
      pri_kind: "ITEM",
      pri_scope_id: "01a033a7-6670-7bc5-879b-ec8c6fadf556",
      pri_unit_id: "01a033a7-668d-7fee-bdc3-7822b044e0d8",
      pri_scope_name: "BILL ITEM",
      pri_unit_name: "BOX",
      pri_is_exclude: false,
      pri_disc_perc: 0,
      pri_disc_qty: 0,
      pri_disc_amt: 0,
      pri_min_qty: 0,
      pri_factor: 1,
      pri_max_benefit: 0,
      pri_match_priority: 4,
      pri_notes: null,
    },
  ],
  slabs: [
    {
      prs_id: "01a033aa-5468-743a-90eb-10a41d148590",
      prs_slno: 1,
      prs_benefit: "FREE_ITEM",
      prs_exceeds: 5,
      prs_upto: 10,
      prs_each: 1,
      prs_is_repeat: false,
      prs_max_repeats: 0,
      prs_free_item_id: "01a033a8-55fd-7b93-9066-20a9fa5b933b",
      prs_free_unit_id: "01a033a8-5615-70ed-a462-33309803582b",
      prs_free_item_name: "OFFER ITEM",
      prs_free_unit_name: "PCS",
      prs_free_qty: 1,
      prs_free_stock_check: true,
      prs_disc_perc: 0,
      prs_disc_qty: 0,
      prs_disc_amt: 0,
      prs_fixed_price: null,
      prs_max_benefit_amt: 0,
      prs_notes: null,
    },
  ],
};

describe("vocabulary rules", () => {
  it("closes the bands only for DISC_PER_ITEM", () => {
    expect(benefitUsesBands("DISC_PER_ITEM")).toBe(false);
    expect(benefitUsesBands("FREE_ITEM")).toBe(true);
  });

  it("needs an item trigger for FIXED_PRICE and DISC_PER_ITEM, never FREE_ITEM", () => {
    expect(benefitNeedsItemTrigger("FIXED_PRICE")).toBe(true);
    expect(benefitNeedsItemTrigger("DISC_PER_ITEM")).toBe(true);
    expect(benefitNeedsItemTrigger("FREE_ITEM")).toBe(false);
    expect(triggerRefused("FIXED_PRICE", "BILL_AMOUNT")).toBe(true);
    expect(triggerRefused("FIXED_PRICE", "ITEM_AMOUNT")).toBe(false);
  });

  it("encodes ck_prs_benefit_columns once", () => {
    expect(slabColumnAllowed("FREE_ITEM", "freeQty")).toBe(true);
    expect(slabColumnAllowed("FREE_ITEM", "discPerc")).toBe(false);
    expect(slabColumnAllowed("DISC_AMT", "discQty")).toBe(true);
    expect(slabColumnAllowed("DISC_AMT", "discAmt")).toBe(true);
    expect(slabColumnAllowed("DISC_AMT", "fixedPrice")).toBe(false);
    expect(slabColumnAllowed("FIXED_PRICE", "fixedPrice")).toBe(true);
    expect(slabColumnAllowed("DISC_PER_ITEM", "discPerc")).toBe(false);
  });

  it("lets an item row state only the benefit's own kind of rate", () => {
    expect(itemRateAllowed("DISC_PERC", "discPerc")).toBe(true);
    expect(itemRateAllowed("DISC_PERC", "discAmt")).toBe(false);
    expect(itemRateAllowed("DISC_AMT", "discQty")).toBe(true);
    expect(itemRateAllowed("FREE_ITEM", "discPerc")).toBe(false);
    expect(itemRateAllowed("DISC_PER_ITEM", "discAmt")).toBe(true);
  });
});

describe("new scheme defaults (Qt seedDefaults)", () => {
  it("opens DRAFT, ITEM_QTY × DISC_PERC, everything ALL, today to today", () => {
    const form = fresh();
    expect(form.schemeId).toBeNull();
    expect(form.header).toMatchObject({
      status: "DRAFT",
      applyOn: "ITEM_QTY",
      benefit: "DISC_PERC",
      stackMode: "EXCLUSIVE",
      calcOn: "NET_AMOUNT",
      billType: "ALL",
      branchScope: "ALL",
      custScope: "ALL",
      itemScope: "ALL",
      priority: 1,
      autoApply: true,
      startDate: "2026-10-31",
      endDate: "2026-10-31",
      companyId: COMPANY,
    });
    // One trailing blank row per grid; the band is seeded Each 1, stock check Y.
    expect(form.slabs).toHaveLength(1);
    expect(form.slabs[0]).toMatchObject({ benefit: "DISC_PERC", each: "1", isRepeat: false, freeStockCheck: true });
    expect(form.dirty).toBe(false);
  });
});

describe("load (GET /promotion-scheme/get)", () => {
  it("reads the live FRRE payload into the form, zeros as blank cells", () => {
    const form = schemeFormFromPayload(FRRE);
    expect(form.schemeId).toBe(FRRE.prm_id);
    expect(form.header).toMatchObject({
      code: "FRRE",
      status: "APPROVED",
      benefit: "FREE_ITEM",
      priority: 2,
      itemScope: "LIST",
      priceLevelId: "",
      timeWindow: false,
      approvedBy: FRRE.prm_approved_by,
      // The payload carries no prm_approved_by_name.
      approvedByLabel: "—",
    });
    expect(form.items).toHaveLength(2);
    expect(form.items[0]).toMatchObject({ kind: "ITEM", unitId: FRRE.items[0].pri_unit_id, discPerc: "", factor: "1", priority: "4" });
    expect(form.slabs[0]).toMatchObject({ exceeds: "5", upto: "10", freeQty: "1", fixedPrice: "", freeStockCheck: true });
    expect(form.slabs[1]).toMatchObject({ benefit: "FREE_ITEM", each: "1" });
  });

  it("keeps a fixed price of 0 apart from no fixed price, and an open ceiling blank", () => {
    const form = schemeFormFromPayload({
      ...FRRE,
      prm_benefit: "FIXED_PRICE",
      slabs: [{ ...FRRE.slabs[0], prs_benefit: "FIXED_PRICE", prs_fixed_price: 0, prs_upto: null }],
    });
    expect(form.slabs[0].fixedPrice).toBe("0");
    expect(form.slabs[0].upto).toBe("");
  });

  it("reads a time window and weekdays", () => {
    const form = schemeFormFromPayload({
      ...FRRE,
      prm_valid_from_time: "22:00:00",
      prm_valid_to_time: "04:00:00",
      prm_valid_weekdays: "SUN,FRI,SAT",
    });
    expect(form.header).toMatchObject({ timeWindow: true, fromTime: "22:00", toTime: "04:00", weekdays: ["FRI", "SAT", "SUN"] });
  });
});

describe("save payload (POST /promotion-scheme/create)", () => {
  it("round-trips the loaded scheme with the same keys Qt sends", () => {
    const body = buildSavePayload(schemeFormFromPayload(FRRE), { userName: "VKPOS" });
    expect(body).toMatchObject({
      prm_id: FRRE.prm_id,
      prm_comp_id: COMPANY,
      prm_code: "FRRE",
      prm_status: "APPROVED",
      prm_benefit: "FREE_ITEM",
      prm_priority: 2,
      prm_min_qty: 0,
      prm_max_uses_total: 0,
      prm_coupon_batch_id: null,
      prm_valid_from_time: null,
      prm_valid_to_time: null,
      prm_valid_weekdays: null,
      prm_is_active: true,
      prm_modified_by: "VKPOS",
      prm_approved_by: FRRE.prm_approved_by,
      branches: [],
      parties: [],
    });
    expect(body).not.toHaveProperty("prm_created_by");
    // "(every price level)" sends no key at all, as Qt.
    expect(body).not.toHaveProperty("prm_price_level_id");
    expect(body.items).toEqual([
      {
        pri_id: FRRE.items[0].pri_id,
        pri_slno: 1,
        pri_kind: "ITEM",
        pri_scope_id: FRRE.items[0].pri_scope_id,
        pri_unit_id: FRRE.items[0].pri_unit_id,
        pri_is_exclude: false,
        pri_disc_perc: 0,
        pri_disc_qty: 0,
        pri_disc_amt: 0,
        pri_min_qty: 0,
        pri_factor: 1,
        pri_max_benefit: 0,
        pri_match_priority: 4,
        pri_notes: "",
        pri_is_active: true,
        pri_modified_by: "VKPOS",
      },
    ]);
    expect(body.slabs).toEqual([
      expect.objectContaining({
        prs_id: FRRE.slabs[0].prs_id,
        prs_slno: 1,
        prs_benefit: "FREE_ITEM",
        prs_exceeds: 5,
        prs_upto: 10,
        prs_each: 1,
        prs_is_repeat: false,
        prs_max_repeats: 0,
        prs_free_item_id: FRRE.slabs[0].prs_free_item_id,
        prs_free_unit_id: FRRE.slabs[0].prs_free_unit_id,
        prs_free_qty: 1,
        prs_free_stock_check: true,
        prs_fixed_price: null,
        prs_modified_by: "VKPOS",
      }),
    ]);
  });

  it("sends [] for a scope of ALL and for DISC_PER_ITEM bands, and stamps created_by on new", () => {
    const form = run(valid(), { type: "header", patch: { timeWindow: true, fromTime: "22:00", toTime: "04:00", weekdays: ["SAT", "FRI"] } });
    const body = buildSavePayload(form, { userName: "VKPOS" });
    expect(body).not.toHaveProperty("prm_id");
    expect(body.prm_created_by).toBe("VKPOS");
    expect(body.prm_valid_from_time).toBe("22:00:00");
    expect(body.prm_valid_to_time).toBe("04:00:00");
    expect(body.prm_valid_weekdays).toBe("FRI,SAT");
    expect(body.items).toEqual([]);
    expect(body.slabs).toEqual([expect.objectContaining({ prs_disc_perc: 10, prs_upto: null, prs_created_by: "VKPOS" })]);

    const perItem = run(form, { type: "benefit", benefit: "DISC_PER_ITEM" });
    expect(buildSavePayload(perItem, { userName: "VKPOS" }).slabs).toEqual([]);
  });

  it("keeps a DISC_AMT band that is only Rs/Qty from 0 (Qt's skip test drops it)", () => {
    const form = run(
      fresh(),
      { type: "benefit", benefit: "DISC_AMT" },
      { type: "slabEdit", index: 0, field: "discQty", value: "3" },
    );
    expect(slabIsBlank(form.slabs[0])).toBe(false);
    expect(buildSavePayload(form, { userName: "u" }).slabs).toEqual([expect.objectContaining({ prs_disc_qty: 3, prs_disc_amt: 0, prs_exceeds: 0 })]);
  });

  it("sends the price level as a number when one is chosen", () => {
    const body = buildSavePayload(run(valid(), { type: "header", patch: { priceLevelId: "3" } }), { userName: "u" });
    expect(body.prm_price_level_id).toBe(3);
  });
});

describe("validation (Qt validateAll order and words)", () => {
  const noUnits = () => undefined;

  it("passes the smallest valid scheme", () => {
    expect(validateScheme(valid(), noUnits)).toBeNull();
  });

  it("refuses a code with a space", () => {
    const problem = validateScheme(run(valid(), { type: "header", patch: { code: "ZT PS" } }), noUnits);
    expect(problem).toMatchObject({ tab: "scheme", field: "code", title: "Code" });
  });

  it("refuses an end before the start", () => {
    const problem = validateScheme(run(valid(), { type: "header", patch: { endDate: "2026-10-30" } }), noUnits);
    expect(problem?.message).toBe("The end date cannot be before the start date.");
  });

  it("refuses a LIST scope with no rows", () => {
    const problem = validateScheme(run(valid(), { type: "header", patch: { custScope: "LIST" } }), noUnits);
    expect(problem).toMatchObject({ tab: "parties", message: "Customer scope is LIST, so name at least one target." });
  });

  it("needs a unit on an ITEM row, and refuses one on a BRAND row", () => {
    let form = run(
      valid(),
      { type: "header", patch: { itemScope: "LIST" } },
      { type: "itemKind", index: 0, kind: "ITEM" },
      { type: "itemPicked", index: 0, scopeId: "item-1", name: "Coffee", unitId: "", unitName: "" },
    );
    expect(validateScheme(form, noUnits)).toMatchObject({ tab: "items", row: 0, column: "unit" });
    form = run(form, { type: "itemUnit", index: 0, unitId: "iuc-9", unitName: "PKT" });
    expect(validateScheme(form, () => [{ id: "iuc-1", name: "BOX" }])?.message).toBe("Row 1's unit does not belong to that item.");
    expect(validateScheme(form, () => [{ id: "iuc-9", name: "PKT" }])).toBeNull();
  });

  it("checks the band geometry and the DISC_AMT xor", () => {
    let form = run(valid(), { type: "slabEdit", index: 0, field: "exceeds", value: "10" }, { type: "slabEdit", index: 0, field: "upto", value: "5" });
    expect(validateScheme(form, noUnits)?.message).toBe("Band 1's ceiling must be above its floor.");
    form = run(fresh(), { type: "header", patch: { code: "ZT-A", name: "a" } }, { type: "benefit", benefit: "DISC_AMT" }, { type: "slabEdit", index: 0, field: "exceeds", value: "1" });
    expect(validateScheme(form, noUnits)?.message).toMatch(/exactly one of Disc Amt or Rs\/Qty/);
  });

  it("needs a rate and a Min Qty on a DISC_PER_ITEM scheme", () => {
    let form = run(
      valid(),
      { type: "benefit", benefit: "DISC_PER_ITEM" },
      { type: "header", patch: { itemScope: "LIST" } },
      { type: "itemKind", index: 0, kind: "ITEM_BRAND" },
      { type: "itemPicked", index: 0, scopeId: "brand-1", name: "Nex Fresh", unitId: "", unitName: "" },
    );
    expect(validateScheme(form, noUnits)?.message).toMatch(/none of them carries one/);
    form = run(form, { type: "itemEdit", index: 0, field: "discPerc", value: "5" });
    expect(validateScheme(form, noUnits)).toMatchObject({ field: "minQty", title: "Min Qty" });
    form = run(form, { type: "header", patch: { minQty: "2" } });
    expect(validateScheme(form, noUnits)).toMatchObject({ tab: "items", column: "minQty" });
    form = run(form, { type: "itemEdit", index: 0, field: "minQty", value: "2" });
    expect(validateScheme(form, noUnits)).toBeNull();
  });

  it("needs an approver on an APPROVED scheme", () => {
    const form = run(valid(), { type: "header", patch: { status: "APPROVED" } });
    expect(validateScheme(form, noUnits)?.title).toBe("Approval");
  });
});

describe("interlocks (reducer)", () => {
  it("grows a grid by one when its trailing row is edited", () => {
    const form = run(fresh(), { type: "branchPicked", index: 0, branchId: "b1", branchName: "Coimbatore" });
    expect(form.branches).toHaveLength(2);
    expect(realRowCount(form.branches)).toBe(1);
    expect(form.dirty).toBe(true);
  });

  it("clears the target and reseeds an untouched priority on a kind change", () => {
    let form = run(
      fresh(),
      { type: "partyKind", index: 0, kind: "CITY" },
      { type: "partyPicked", index: 0, scopeId: "c1", name: "Coimbatore" },
    );
    expect(form.parties[0]).toMatchObject({ kind: "CITY", priority: "2", scopeId: "c1" });
    form = run(form, { type: "partyKind", index: 0, kind: "AREA" });
    expect(form.parties[0]).toMatchObject({ kind: "AREA", priority: "3", scopeId: "", targetName: "" });
    // A typed priority survives.
    form = run(form, { type: "partyEdit", index: 0, patch: { priority: "7" } }, { type: "partyKind", index: 0, kind: "CUSTOMER" });
    expect(form.parties[0].priority).toBe("7");
  });

  it("drops the unit when an item row leaves ITEM", () => {
    const form = run(
      fresh(),
      { type: "itemKind", index: 0, kind: "ITEM" },
      { type: "itemPicked", index: 0, scopeId: "i1", name: "Coffee", unitId: "u1", unitName: "PKT" },
      { type: "itemKind", index: 0, kind: "ITEM_BRAND" },
    );
    expect(form.items[0]).toMatchObject({ kind: "ITEM_BRAND", unitId: "", unitName: "", scopeId: "" });
  });

  it("keeps one rate per item row and lets an exclusion give nothing", () => {
    let form = run(
      fresh(),
      { type: "itemEdit", index: 0, field: "discPerc", value: "5" },
      { type: "itemEdit", index: 0, field: "discAmt", value: "20" },
    );
    expect(form.items[0]).toMatchObject({ discPerc: "", discAmt: "20" });
    form = run(form, { type: "itemEdit", index: 0, field: "exclude", value: true });
    expect(form.items[0]).toMatchObject({ exclude: true, discAmt: "", factor: "1" });
  });

  it("keeps the DISC_AMT xor on a band and clears max repeats off a non-repeating band", () => {
    let form = run(fresh(), { type: "benefit", benefit: "DISC_AMT" });
    form = run(form, { type: "slabEdit", index: 0, field: "discAmt", value: "10" }, { type: "slabEdit", index: 0, field: "discQty", value: "2" });
    expect(form.slabs[0]).toMatchObject({ discAmt: "", discQty: "2", benefit: "DISC_AMT" });
    form = run(form, { type: "slabEdit", index: 0, field: "isRepeat", value: true }, { type: "slabEdit", index: 0, field: "maxRepeats", value: "3" });
    form = run(form, { type: "slabEdit", index: 0, field: "isRepeat", value: false });
    expect(form.slabs[0].maxRepeats).toBe("");
  });

  it("clears the bands on a benefit change and moves a refused trigger to ITEM_QTY", () => {
    let form = run(valid(), { type: "applyOn", applyOn: "BILL_AMOUNT" });
    expect(realRowCount(form.slabs)).toBe(1);
    form = run(form, { type: "benefit", benefit: "FIXED_PRICE" });
    expect(form.slabs).toHaveLength(1);
    expect(form.slabs[0]).toMatchObject({ benefit: "FIXED_PRICE", fixedPrice: "" });
    expect(form.header.applyOn).toBe("ITEM_QTY");
    // And the trigger cannot be put back on the bill while the benefit needs a line.
    form = run(form, { type: "applyOn", applyOn: "BILL_QTY" });
    expect(form.header.applyOn).toBe("ITEM_QTY");
  });

  it("stamps the approver on APPROVED and clears it off", () => {
    const approver = { userId: "u-1", userName: "VKPOS", nowIso: "2026-10-31T06:00:00.000Z", todayLabel: "31/10/2026" };
    let form = run(fresh(), { type: "status", status: "APPROVED", approver });
    expect(form.header).toMatchObject({ status: "APPROVED", approvedBy: "u-1", approvedByLabel: "VKPOS · 31/10/2026" });
    form = run(form, { type: "status", status: "SUSPENDED", approver: null });
    expect(form.header).toMatchObject({ status: "SUSPENDED", approvedBy: "", approvedByLabel: "—" });
    // No signed-in user: back to DRAFT.
    expect(run(fresh(), { type: "status", status: "APPROVED", approver: null }).header.status).toBe("DRAFT");
  });

  it("never removes the trailing blank row", () => {
    let form = run(fresh(), { type: "branchPicked", index: 0, branchId: "b1", branchName: "A" });
    expect(run(form, { type: "removeRow", grid: "branches", index: 1 }).branches).toHaveLength(2);
    form = run(form, { type: "removeRow", grid: "branches", index: 0 });
    expect(form.branches).toHaveLength(1);
    expect(form.branches[0].branchId).toBe("");
  });

  it("seeds a new band from the header benefit", () => {
    expect(blankSlabRow("FREE_ITEM")).toMatchObject({ benefit: "FREE_ITEM", each: "1", freeStockCheck: true });
  });
});

describe("formats", () => {
  it("reads typed 12-hour and 24-hour times", () => {
    expect(parseTime12("10:30 PM")).toBe("22:30");
    expect(parseTime12("10.30pm")).toBe("22:30");
    expect(parseTime12("1030p")).toBe("22:30");
    expect(parseTime12("12:00 AM")).toBe("00:00");
    expect(parseTime12("12 pm")).toBe("12:00");
    expect(parseTime12("22:30")).toBe("22:30");
    expect(parseTime12("0930")).toBe("09:30");
    expect(parseTime12("13 pm")).toBeNull();
    expect(parseTime12("25:00")).toBeNull();
    expect(parseTime12("10:75")).toBeNull();
    expect(parseTime12("")).toBeNull();
  });

  it("shows the list's time window on the 12-hour clock", () => {
    expect(timeWindowText("22:00 - 04:00")).toBe("10:00 PM - 04:00 AM");
    expect(timeWindowText(null)).toBe("");
  });

  it("accepts number text the way a QDoubleValidator does", () => {
    expect(acceptNumberText("", 2)).toBe(true);
    expect(acceptNumberText("12.5", 2)).toBe(true);
    expect(acceptNumberText("12.555", 2)).toBe(false);
    expect(acceptNumberText("1.", 4)).toBe(true);
    expect(acceptNumberText("1.5", 0)).toBe(false);
    expect(acceptNumberText("-1", 2)).toBe(false);
    expect(acceptNumberText("100", 4, 100)).toBe(true);
    expect(acceptNumberText("100.5", 4, 100)).toBe(false);
    expect(acceptNumberText("10", 0, 9)).toBe(false);
  });
});
