/**
 * Round-trip and contract tests for the two pure translations, and for every
 * gate in `validate`.
 *
 * These are the tests that catch a save the API will reject: a boolean sent as
 * `null`, a lower-case status, a charge row claiming both `cdTaxApl` and
 * `cdBeforeTax`, a stray property, a server-owned field sent back.
 */
import { describe, expect, it } from "vitest";
import { recalcDocument } from "@/domain/pricing";
import { QUOTATION_STATUSES } from "./quotation.constants";
import { buildSavePayload, parseLoadedDocument } from "./quotation.payload";
import type { SaveActor } from "./quotation.payload";
import {
  draftReplaced,
  headerFieldSet,
  lineFieldSet,
  modeSet,
  quotationReducer,
  saveResponseApplied,
} from "@/store/slices/quotationSlice";
import {
  applySaveResponse,
  chargeRowFromMaster,
  createDraft,
  createDraftChargeRow,
  createDraftLine,
} from "./quotation.state";
import type {
  ChargeMasterRow,
  QuotationDraft,
  QuotationItemPayload,
  QuotationPayload,
  SaveQuotationDto,
} from "./quotation.types";
import { rateWarning, validateSaveInputs } from "./quotation.validate";
import { accountingYearOf, todayIso } from "./quotation.utils";

const ACTOR: SaveActor = {
  userId: "019c6f6c-be87-7a11-8905-36092c46fe05",
  userName: "vijay",
  sessionId: "3f1c9d3e-6b1e-4c8f-9a55-2c3d4e5f6a7b",
  deviceId: "device-abc",
  deviceType: "WEB",
};

const COMPANY_ID = "019c6f6c-be87-7a11-8905-36092c46fe02";
const BRANCH_ID = "019c6f6c-be87-7a11-8905-36092c46fe03";
const ITEM_ID = "019f7e83-2511-711b-9aa5-60fc1b3c0a1c";
const IUC_ID = "019f7e83-2534-7c88-8262-b25efc0f93f3";
const QUOTE_DATE = todayIso();
const ACC_YEAR = accountingYearOf(QUOTE_DATE);

function baseDraft(): QuotationDraft {
  const draft = createDraft({
    companyId: COMPANY_ID,
    branchId: BRANCH_ID,
    accYear: ACC_YEAR,
    companyStateCode: "33",
    quoteDate: QUOTE_DATE,
  });
  return {
    ...draft,
    customer: {
      ...draft.customer,
      custId: "019f659c-1111-7000-8000-000000000001",
      name: "Acme",
      // Mandatory, so a draft without it is not a complete one.
      phone: "9876543210",
    },
    lines: [
      createDraftLine({
        itemId: ITEM_ID,
        itemUnitId: IUC_ID,
        itemName: "New Claw",
        billQty: 10,
        toBaseFactor: 1,
        rate: 100,
        gstPerc: 18,
        cgstPerc: 9,
        sgstPerc: 9,
        igstPerc: 18,
      }),
    ],
  };
}

function pricingOf(draft: QuotationDraft) {
  return recalcDocument(draft.lines, draft.charges, draft.policy, {
    isLocalSale: draft.isLocalSale,
    hasFreight: draft.header.hasFreight,
    hasLoad: draft.header.hasLoad,
    hasUnload: draft.header.hasUnload,
  });
}

function payloadOf(draft: QuotationDraft): SaveQuotationDto {
  return buildSavePayload(draft, pricingOf(draft), ACTOR);
}

/** Exactly the keys `SaveQuotationDto` declares. Anything else is a 400. */
/**
 * Every property `SaveQuotationItemDto` declares. The item DTO is validated
 * with `forbidNonWhitelisted`, so one property it does not know 400s the whole
 * save — which is exactly what a stray `sqiItemSize` did until the size column
 * was moved onto the real `sqiSize` field.
 */
const ALLOWED_ITEM_KEYS = new Set<string>([
  "sqiAccYear",
  "sqiAcessAmt",
  "sqiAcessPerc",
  "sqiAcessPerUnit",
  "sqiActPrice",
  "sqiAddlDisc1Amt",
  "sqiAddlDisc1Perc",
  "sqiAddlDisc2Amt",
  "sqiAddlDisc2Perc",
  "sqiAvailableStock",
  "sqiBatchDate",
  "sqiBatchNo",
  "sqiBillQty",
  "sqiBillSchAmt",
  "sqiBillSchPerc",
  "sqiBillSchQty",
  "sqiBranchId",
  "sqiCaseQty",
  "sqiCashDiscAmt",
  "sqiCashDiscPerc",
  "sqiCessAmt",
  "sqiCessPerc",
  "sqiCessPerUnit",
  "sqiCgstAmt",
  "sqiCgstPerc",
  "sqiChrgAfterTax",
  "sqiChrgBeforeTax",
  "sqiCompanyId",
  "sqiCostPreTax",
  "sqiCostPrice",
  "sqiCreatedBy",
  "sqiEanCode",
  "sqiExpiryDate",
  "sqiFreeType",
  "sqiFreightAmt",
  "sqiFreightQty",
  "sqiGrossAmt",
  "sqiHasFreight",
  "sqiHsnCode",
  "sqiId",
  "sqiIgstAmt",
  "sqiIgstPerc",
  "sqiIsFree",
  "sqiIsPromo",
  "sqiIsService",
  "sqiIsTaxIncl",
  "sqiItemDiscAmt",
  "sqiItemDiscPerc",
  "sqiItemDiscQty",
  "sqiItemId",
  "sqiItemProfit",
  "sqiItemUnitId",
  "sqiLengthQty",
  "sqiLineNo",
  "sqiLoadAmt",
  "sqiLoadQty",
  "sqiMaxPrice",
  "sqiMinPrice",
  "sqiModifiedBy",
  "sqiMrpSavings",
  "sqiMrpSavingsPerc",
  "sqiNetAmt",
  "sqiNetGross",
  "sqiNetQty",
  "sqiPriceLevel",
  "sqiProfitPreTax",
  "sqiQuoteId",
  "sqiQuotePreTax",
  "sqiQuotePrice",
  "sqiRate",
  "sqiRateDiff",
  "sqiRatePreTax",
  "sqiRemarks",
  "sqiRoundOff",
  "sqiSchDiscAmt",
  "sqiSchDiscPerc",
  "sqiSchDiscQty",
  "sqiSchemeId",
  "sqiSchemeName",
  "sqiSgstAmt",
  "sqiSgstPerc",
  "sqiSize",
  "sqiSizeUom",
  "sqiSplDiscAmt",
  "sqiSplDiscPerc",
  "sqiSplDiscQty",
  "sqiSrcDocRefno",
  "sqiSrcDocType",
  "sqiSrcItemId",
  "sqiSrcItemQty",
  "sqiSrcUnitId",
  "sqiTaxableAmt",
  "sqiTaxAmt",
  "sqiTaxPerc",
  "sqiTenantId",
  "sqiToBaseFactor",
  "sqiUnloadAmt",
  "sqiUnloadQty",
  "sqiWeightQty",
]);
const ALLOWED_HEADER_KEYS = new Set<string>([
  "sqId",
  "sqCompanyId",
  "sqBranchId",
  "sqAccYear",
  "sqPriceLevel",
  "sqCustName",
  "sqUserId",
  "sqCreatedBy",
  "sqModifiedBy",
  "sqDocType",
  "sqUsrRefno",
  "sqQuoteDate",
  "sqValidUntil",
  "sqValidityDays",
  "sqRevisionNo",
  "sqSessionId",
  "sqCustId",
  "sqCustAreaId",
  "sqCustAddr",
  "sqCustPlace",
  "sqCustPhone",
  "sqCustEmail",
  "sqCustGstin",
  "sqCustGstType",
  "sqCustStcd",
  "sqPosStcd",
  "sqStateName",
  "sqContactPerson",
  "sqContactPhone",
  "sqHasLoad",
  "sqHasUnload",
  "sqHasFreight",
  "sqHasPromo",
  "sqSalesmanId",
  "sqAgentId",
  "sqTotItems",
  "sqTotWeight",
  "sqTotBags",
  "sqGrossAmt",
  "sqItemDisc",
  "sqSplDisc",
  "sqSchDisc",
  "sqBillSchDisc",
  "sqTaxableAmt",
  "sqCgstAmt",
  "sqSgstAmt",
  "sqIgstAmt",
  "sqCessAmt",
  "sqTaxAmt",
  "sqFreightAmt",
  "sqLoadAmt",
  "sqUnloadAmt",
  "sqOtherAmt1",
  "sqOtherAmt2",
  "sqRoundOff",
  "sqQuoteAmt",
  "sqTotalCost",
  "sqMarginAmt",
  "sqMarginPerc",
  "sqMrpSavings",
  "sqMrpSavingsPerc",
  "sqPaymentTerms",
  "sqDeliveryTerms",
  "sqTermsConditions",
  "sqStatus",
  "sqRemarks",
  "sqDeviceType",
  "sqDeviceId",
  "sqPrintCount",
  "sqFreightCalcType",
  "sqLoadingCalcType",
  "sqDiscAlterBase",
  "items",
  "charges",
]);

const BOOLEAN_HEADER_KEYS = ["sqHasLoad", "sqHasUnload", "sqHasFreight", "sqHasPromo"] as const;

describe("buildSavePayload", () => {
  it("sends the six always-required fields, on create and on update alike", () => {
    const create = payloadOf(baseDraft());
    expect(create.sqCompanyId).toBe(COMPANY_ID);
    expect(create.sqBranchId).toBe(BRANCH_ID);
    expect(create.sqAccYear).toBe(ACC_YEAR);
    expect(create.sqPriceLevel).toBe(1);
    expect(create.sqCustName).toBe("Acme");
    expect(create.sqUserId).toBe(ACTOR.userId);
    expect(create.sqId).toBeUndefined();

    const update = payloadOf({ ...baseDraft(), docId: "019f0000-0000-7000-8000-000000000009" });
    expect(update.sqId).toBe("019f0000-0000-7000-8000-000000000009");
    for (const key of ["sqCompanyId", "sqBranchId", "sqAccYear", "sqPriceLevel", "sqCustName", "sqUserId"] as const) {
      expect(update[key]).toBeDefined();
    }
  });

  it("names the actor in the free-text audit columns and keeps the uuid in sqUserId", () => {
    const payload = payloadOf(baseDraft());
    expect(payload.sqUserId).toBe(ACTOR.userId);
    expect(payload.sqCreatedBy).toBe("vijay");
    expect(payload.sqModifiedBy).toBe("vijay");

    // A session with no name still has to identify itself somehow.
    const anonymous = buildSavePayload(baseDraft(), pricingOf(baseDraft()), {
      ...ACTOR,
      userName: "  ",
    });
    expect(anonymous.sqCreatedBy).toBe(ACTOR.userId);
    expect(anonymous.sqModifiedBy).toBe(ACTOR.userId);
  });

  it("never sends the server-owned voucher number or refno", () => {
    const payload = payloadOf(baseDraft()) as Record<string, unknown>;
    expect("sqQuoteSlno" in payload).toBe(false);
    expect("sqQuoteRefno" in payload).toBe(false);
  });

  it("declares no property the DTO would reject", () => {
    const payload = payloadOf(baseDraft()) as Record<string, unknown>;
    const stray = Object.keys(payload).filter((key) => !ALLOWED_HEADER_KEYS.has(key));
    expect(stray).toEqual([]);
  });

  it("declares no LINE property the DTO would reject", () => {
    // The header had this guard; the lines did not, and `sqiItemSize` — a field
    // no DTO has ever carried — rode along on every save until it did.
    const line = (payloadOf(baseDraft()).items?.[0] ?? {}) as Record<string, unknown>;
    expect(Object.keys(line).length).toBeGreaterThan(0);
    expect(Object.keys(line).filter((key) => !ALLOWED_ITEM_KEYS.has(key))).toEqual([]);
  });

  it("sends the size column as the CFT the typed dimensions work out to", () => {
    const draft = baseDraft();
    const payload = payloadOf({
      ...draft,
      lines: [{ ...draft.lines[0], itemSize: "45*2*2*6" }],
    });
    expect(payload.items?.[0].sqiSize).toBe("7.5");
    expect(payload.items?.[0].sqiSizeUom).toBe("CFT");

    // An empty cell sends null, not "" — `ck_sqi_size` rejects a blank — and no
    // unit either, since a unit with nothing to measure says nothing.
    expect(payloadOf(draft).items?.[0].sqiSize).toBeNull();
    expect(payloadOf(draft).items?.[0].sqiSizeUom).toBeNull();
  });

  it("never sends null for a boolean — it reaches a NOT NULL column as a 500", () => {
    const payload = payloadOf(baseDraft());
    for (const key of BOOLEAN_HEADER_KEYS) {
      expect(typeof payload[key]).toBe("boolean");
    }
    const line = payload.items?.[0];
    for (const value of [line?.sqiIsTaxIncl, line?.sqiIsPromo, line?.sqiIsFree, line?.sqiIsService]) {
      expect(typeof value).toBe("boolean");
    }
  });

  it("keeps the status inside the CHECK constraint's upper-case set", () => {
    const payload = payloadOf({ ...baseDraft(), status: "draft" });
    expect(payload.sqStatus).toBe("DRAFT");
    expect(QUOTATION_STATUSES).toContain(payload.sqStatus as never);
  });

  it("sends the calc types lower case — the DTO does not normalise them", () => {
    const draft = baseDraft();
    const payload = payloadOf({
      ...draft,
      policy: { ...draft.policy, freightCalcType: "ITEM_BASIS", loadingCalcType: "Auto" },
    });
    expect(payload.sqFreightCalcType).toBe("item_basis");
    expect(payload.sqLoadingCalcType).toBe("auto");
  });

  it("numbers the lines from 1 and skips a row with no item", () => {
    const draft = baseDraft();
    const payload = payloadOf({
      ...draft,
      lines: [createDraftLine(), ...draft.lines, createDraftLine()],
    });
    expect(payload.items).toHaveLength(1);
    expect(payload.items?.[0].sqiLineNo).toBe(1);
    expect(payload.items?.[0].sqiItemId).toBe(ITEM_ID);
    expect(payload.items?.[0].sqiItemUnitId).toBe(IUC_ID);
  });

  it("carries the engine's figures onto the line, not the keyed ones", () => {
    const draft = baseDraft();
    const withDiscount: QuotationDraft = {
      ...draft,
      lines: [{ ...draft.lines[0], discPerc: 10 }],
    };
    const pricing = pricingOf(withDiscount);
    const payload = buildSavePayload(withDiscount, pricing, ACTOR);
    const line = payload.items?.[0];
    expect(line?.sqiItemDiscPerc).toBe(10);
    expect(line?.sqiItemDiscAmt).toBe(pricing.lines[0].discAmt);
    expect(line?.sqiNetAmt).toBe(pricing.lines[0].total);
    expect(line?.sqiNetGross).toBe(pricing.lines[0].netGross);
    expect(payload.sqQuoteAmt).toBe(pricing.totals.bill);
    expect(payload.sqTaxableAmt).toBe(pricing.totals.docTaxable);
  });

  it("only sends a free-type the CHECK constraint allows", () => {
    const draft = baseDraft();
    const paid = payloadOf(draft);
    expect(paid.items?.[0].sqiFreeType).toBeNull();

    const free = payloadOf({ ...draft, lines: [{ ...draft.lines[0], isFree: true }] });
    expect(free.items?.[0].sqiFreeType).toBe("SCHEME");

    const sample = payloadOf({
      ...draft,
      lines: [{ ...draft.lines[0], isFree: true, freeType: "SAMPLE" }],
    });
    expect(sample.items?.[0].sqiFreeType).toBe("SAMPLE");

    const nonsense = payloadOf({
      ...draft,
      lines: [{ ...draft.lines[0], isFree: true, freeType: "WHATEVER" }],
    });
    expect(nonsense.items?.[0].sqiFreeType).toBe("SCHEME");
  });

  it("never sends a charge row with both cdTaxApl and cdBeforeTax", () => {
    const draft = baseDraft();
    const conflicted = createDraftChargeRow({
      chgId: "chg-1",
      ledgerCode: "019fa1e9-5cda-7c66-b03a-74d8d3081515",
      chgName: "Freight",
      role: "FREIGHT",
      beforeTax: true,
      taxApl: true,
      rate: 100,
    });
    const payload = payloadOf({ ...draft, charges: [conflicted] });
    const charge = payload.charges?.[0];
    expect(charge?.cdBeforeTax).toBe(true);
    expect(charge?.cdTaxApl).toBe(false);
  });

  it("drops a charge row with no charge or no posting ledger", () => {
    const draft = baseDraft();
    const payload = payloadOf({
      ...draft,
      charges: [
        createDraftChargeRow(),
        createDraftChargeRow({ chgId: "chg-1", ledgerCode: "" }),
        createDraftChargeRow({ chgId: "chg-2", ledgerCode: "led-1", chgName: "Ok" }),
      ],
    });
    expect(payload.charges).toHaveLength(1);
    expect(payload.charges?.[0].cdChgName).toBe("Ok");
    expect(payload.charges?.[0].cdSlno).toBe(1);
  });
});

describe("chargeRowFromMaster", () => {
  const master: ChargeMasterRow = {
    chgId: "chg-1",
    chgName: "FREIGHT CHARGE",
    chgCode: "FR",
    chgModule: "S",
    chgRole: "FREIGHT",
    chgMethod: "FIXED",
    chgType: "ADD",
    chgApplyOn: "FLAT",
    chgDefaultRate: 250,
    chgLandingCost: true,
    chgCostAlloc: "QTY",
    chgLedgerCode: "led-1",
    chgLedgerName: "SALES FREIGHT COLLECTION",
    ledHsnSac: "11021",
    ledGstRate: 18,
    ledTaxability: "Taxable",
    chgTaxApl: true,
    chgBeforeTax: false,
    chgSepPost: true,
    chgManParty: true,
    chgDispOrder: 0,
    chgAutoApply: true,
    chgIsActive: true,
  };

  it("snapshots the master and seeds the rate and its own GST", () => {
    const row = chargeRowFromMaster(master);
    expect(row.chgId).toBe("chg-1");
    expect(row.ledgerCode).toBe("led-1");
    expect(row.role).toBe("FREIGHT");
    expect(row.method).toBe("FIXED");
    expect(row.applyOn).toBe("FLAT");
    expect(row.rate).toBe(250);
    expect(row.taxApl).toBe(true);
    expect(row.taxPerc).toBe(18);
    expect(row.cgstPerc).toBe(9);
    expect(row.igstPerc).toBe(18);
    expect(row.hsn).toBe("11021");
  });

  it("lets before-tax win when the master claims both — the save would 400", () => {
    const row = chargeRowFromMaster({ ...master, chgBeforeTax: true, chgTaxApl: true });
    expect(row.beforeTax).toBe(true);
    expect(row.taxApl).toBe(false);
    // The whole tax block goes with it: a before-tax charge is taxed at the
    // item's rate, so carrying a percentage of its own would double count.
    expect(row.taxPerc).toBe(0);
  });

  it("falls back to NONE / FIXED / ADD / FLAT on an unrecognised value", () => {
    const row = chargeRowFromMaster({
      ...master,
      chgRole: "SOMETHING",
      chgMethod: "???",
      chgType: "",
      chgApplyOn: "nope",
      chgCostAlloc: null,
    });
    expect(row.role).toBe("NONE");
    expect(row.method).toBe("FIXED");
    expect(row.type).toBe("ADD");
    expect(row.applyOn).toBe("FLAT");
    expect(row.costAlloc).toBeNull();
  });
});

// ---------------------------------------------------------------------------

function loadedPayload(overrides: Partial<QuotationPayload> = {}): QuotationPayload {
  return {
    sqId: "019f0000-0000-7000-8000-000000000009",
    sqCompanyId: "019caaaa-0000-7000-8000-000000000001",
    sqBranchId: "019cbbbb-0000-7000-8000-000000000002",
    sqAccYear: "2025-2026",
    sqPriceLevel: 2,
    sqDocType: "QUOTATION",
    // A non-numeric series has to survive the round trip untouched.
    sqQuoteSlno: "QT/0001",
    sqQuoteRefno: "quo00042",
    sqUsrRefno: "PO-99",
    sqQuoteDate: "2025-06-10T00:00:00.000Z",
    sqValidUntil: "2025-06-25T00:00:00.000Z",
    sqValidityDays: 15,
    sqRevisionNo: 3,
    sqCustId: "019f659c-1111-7000-8000-000000000001",
    sqCustAreaId: null,
    sqCustName: "Loaded Customer",
    sqCustAddr: "1 Road",
    sqCustPlace: "Musiri",
    sqCustPhone: "999",
    sqCustEmail: null,
    sqCustGstin: "33ABCDE1234F1Z5",
    sqCustGstType: "Regular",
    sqCustStcd: "33",
    sqPosStcd: "33",
    sqStateName: "Tamil Nadu",
    sqContactPerson: "Ravi",
    sqContactPhone: "888",
    sqHasLoad: true,
    sqHasUnload: false,
    sqHasFreight: true,
    sqHasPromo: false,
    sqUserId: ACTOR.userId,
    sqSalesmanId: null,
    sqAgentId: null,
    sqTotItems: 1,
    sqTotWeight: "20",
    sqTotBags: "10",
    sqGrossAmt: "1000",
    sqItemDisc: "0",
    sqSplDisc: "0",
    sqSchDisc: "0",
    sqBillSchDisc: "0",
    sqTaxableAmt: "1000",
    sqCgstAmt: "90",
    sqSgstAmt: "90",
    sqIgstAmt: "0",
    sqCessAmt: "0",
    sqTaxAmt: "180",
    sqFreightAmt: "0",
    sqLoadAmt: "0",
    sqUnloadAmt: "0",
    sqOtherAmt1: "0",
    sqOtherAmt2: "0",
    sqRoundOff: "0",
    sqQuoteAmt: "1180",
    sqTotalCost: "800",
    sqMarginAmt: "200",
    sqMarginPerc: "20",
    sqMrpSavings: "320",
    sqMrpSavingsPerc: "21.33",
    sqPaymentTerms: "30 days",
    sqDeliveryTerms: "Ex works",
    sqTermsConditions: "Standard",
    sqStatus: "SENT",
    sqRemarks: "note",
    sqPrintCount: 1,
    sqIsDeleted: false,
    sqCreatedOn: "2025-06-10T05:00:00.000Z",
    sqCreatedBy: ACTOR.userId,
    sqModifiedOn: null,
    sqModifiedBy: null,
    sqFreightCalcType: "item_basis",
    sqLoadingCalcType: "manual",
    sqDiscAlterBase: true,
    items: [
      {
        sqiId: "019f1111-0000-7000-8000-000000000001",
        sqiLineNo: 1,
        sqiItemId: ITEM_ID,
        sqiItemUnitId: IUC_ID,
        sqiPriceLevel: 2,
        sqiHsnCode: "1102",
        sqiEanCode: null,
        sqiBatchNo: null,
        sqiBatchDate: null,
        sqiExpiryDate: null,
        sqiIsTaxIncl: false,
        sqiIsPromo: false,
        sqiIsFree: false,
        sqiFreeType: null,
        sqiIsService: false,
        sqiIsDeleted: false,
        sqiCaseQty: "0",
        sqiBillQty: "10",
        sqiLengthQty: "0",
        sqiNetQty: "10",
        sqiWeightQty: "20",
        sqiAvailableStock: "100",
        sqiRate: "100",
        sqiRatePreTax: "100",
        sqiItemDiscPerc: "0",
        sqiItemDiscQty: "0",
        sqiItemDiscAmt: "0",
        sqiSplDiscPerc: "0",
        sqiSplDiscQty: "0",
        sqiSplDiscAmt: "0",
        sqiSchDiscPerc: "0",
        sqiSchDiscQty: "0",
        sqiSchDiscAmt: "0",
        sqiBillSchPerc: "0",
        sqiBillSchQty: "0",
        sqiBillSchAmt: "0",
        sqiCashDiscPerc: "0",
        sqiCashDiscAmt: "0",
        sqiGrossAmt: "1000",
        sqiTaxableAmt: "1000",
        sqiTaxPerc: "18",
        sqiTaxAmt: "180",
        sqiCgstPerc: "9",
        sqiCgstAmt: "90",
        sqiSgstPerc: "9",
        sqiSgstAmt: "90",
        sqiIgstPerc: "18",
        sqiIgstAmt: "0",
        sqiCessPerc: "0",
        sqiCessPerUnit: "0",
        sqiCessAmt: "0",
        sqiFreightQty: "0",
        sqiFreightAmt: "0",
        sqiLoadQty: "0",
        sqiLoadAmt: "0",
        sqiUnloadQty: "0",
        sqiUnloadAmt: "0",
        sqiNetAmt: "1180",
        sqiCostPrice: "80",
        sqiMaxPrice: "150",
        sqiMinPrice: "90",
        sqiActPrice: "100",
        sqiQuotePrice: "118",
        sqiItemProfit: "38",
        sqiCostPreTax: "80",
        sqiQuotePreTax: "100",
        sqiProfitPreTax: "20",
        sqiMrpSavings: "320",
        sqiMrpSavingsPerc: "21.33",
        sqiNetGross: "1000",
        sqiChrgBeforeTax: "0",
        sqiChrgAfterTax: "0",
        sqiSchemeId: null,
        sqiSchemeName: null,
        sqiRemarks: null,
        sqiItemName: "New Claw",
        sqiUnitName: "Box",
      },
      {
        // A soft-deleted line must never reach the draft.
        sqiId: "019f1111-0000-7000-8000-000000000002",
        sqiLineNo: 2,
        sqiItemId: ITEM_ID,
        sqiItemUnitId: IUC_ID,
        sqiIsDeleted: true,
      } as QuotationItemPayload,
    ],
    charges: [],
    ...overrides,
  } as QuotationPayload;
}

describe("parseLoadedDocument", () => {
  it("opens read-only and paints the stored figures without repricing", () => {
    const draft = parseLoadedDocument(loadedPayload(), "33");
    expect(draft.mode).toBe("browse");
    expect(draft.pricing).toBe("stored");
    expect(draft.isDirty).toBe(false);
    expect(draft.storedPricing?.totals.bill).toBe(1180);
    expect(draft.storedPricing?.lines[0].total).toBe(1180);
    expect(draft.storedPricing?.lines[0].netPrice).toBe(118);
  });

  it("takes the tenant context from the voucher, not the session", () => {
    const draft = parseLoadedDocument(loadedPayload(), "33");
    expect(draft.companyId).toBe("019caaaa-0000-7000-8000-000000000001");
    expect(draft.branchId).toBe("019cbbbb-0000-7000-8000-000000000002");
    expect(draft.accYear).toBe("2025-2026");
  });

  it("keeps the server-owned identity verbatim, including a non-numeric series", () => {
    const draft = parseLoadedDocument(loadedPayload(), "33");
    expect(draft.quoteSlno).toBe("QT/0001");
    expect(draft.quoteRefno).toBe("quo00042");
    expect(draft.revisionNo).toBe(3);
    expect(draft.docType).toBe("QUOTATION");
  });

  it("takes the policy off the document, never from the session default", () => {
    const draft = parseLoadedDocument(loadedPayload(), "33");
    expect(draft.policy.freightCalcType).toBe("item_basis");
    expect(draft.policy.loadingCalcType).toBe("manual");
    expect(draft.policy.discountAlterBaseRate).toBe(true);

    const legacy = parseLoadedDocument(
      loadedPayload({ sqFreightCalcType: null, sqLoadingCalcType: null, sqDiscAlterBase: null }),
      "33",
    );
    expect(legacy.policy.freightCalcType).toBe("manual");
    expect(legacy.policy.discountAlterBaseRate).toBe(false);
  });

  it("drops soft-deleted lines", () => {
    const draft = parseLoadedDocument(loadedPayload(), "33");
    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0].sqiId).toBe("019f1111-0000-7000-8000-000000000001");
  });

  it("carries the document's own soft-delete flag onto the draft", () => {
    expect(parseLoadedDocument(loadedPayload(), "33").isDeleted).toBe(false);
    const deleted = parseLoadedDocument(loadedPayload({ sqIsDeleted: true }), "33");
    expect(deleted.isDeleted).toBe(true);
    // Still fully readable — only the write side is closed off.
    expect(deleted.lines).toHaveLength(1);
    expect(deleted.storedPricing?.totals.bill).toBe(1180);
  });

  it("reads the tax split off the document's own stored amounts", () => {
    expect(parseLoadedDocument(loadedPayload(), "33").isLocalSale).toBe(true);

    const interState = parseLoadedDocument(
      loadedPayload({ sqCgstAmt: "0", sqSgstAmt: "0", sqIgstAmt: "180" }),
      "33",
    );
    expect(interState.isLocalSale).toBe(false);

    // A zero-tax document has nothing to read, so and only then does the place
    // of supply decide.
    const zeroTax = parseLoadedDocument(
      loadedPayload({ sqCgstAmt: "0", sqSgstAmt: "0", sqIgstAmt: "0", sqPosStcd: "29" }),
      "33",
    );
    expect(zeroTax.isLocalSale).toBe(false);
  });

  it("round-trips every field the payload carries", () => {
    const loaded = parseLoadedDocument(loadedPayload(), "33");
    // The first edit flips the document to live pricing; the payload built from
    // it must still carry the same identity and header.
    const edited = quotationReducer(
      loaded,
      headerFieldSet({ field: "contactPerson", value: "Ravi" }),
    );
    const payload = buildSavePayload(edited, pricingOf(edited), ACTOR);

    expect(payload.sqId).toBe("019f0000-0000-7000-8000-000000000009");
    expect(payload.sqCompanyId).toBe("019caaaa-0000-7000-8000-000000000001");
    expect(payload.sqAccYear).toBe("2025-2026");
    expect(payload.sqRevisionNo).toBe(3);
    expect(payload.sqUsrRefno).toBe("PO-99");
    expect(payload.sqQuoteDate).toBe("2025-06-10");
    expect(payload.sqValidUntil).toBe("2025-06-25");
    expect(payload.sqValidityDays).toBe(15);
    expect(payload.sqCustGstin).toBe("33ABCDE1234F1Z5");
    expect(payload.sqPosStcd).toBe("33");
    expect(payload.sqStatus).toBe("SENT");
    expect(payload.sqPaymentTerms).toBe("30 days");
    expect(payload.sqTermsConditions).toBe("Standard");
    expect(payload.sqFreightCalcType).toBe("item_basis");
    expect(payload.sqDiscAlterBase).toBe(true);
    // The existing line is updated, not duplicated.
    expect(payload.items?.[0].sqiId).toBe("019f1111-0000-7000-8000-000000000001");
    expect(payload.items?.[0].sqiPriceLevel).toBe(2);
  });

  it("flips to live pricing on the first edit and reprices under the document's policy", () => {
    const loaded = parseLoadedDocument(loadedPayload(), "33");
    expect(loaded.pricing).toBe("stored");
    const edited = quotationReducer(
      loaded,
      lineFieldSet({ key: loaded.lines[0].key, field: "billQty", value: 20 }),
    );
    expect(edited.pricing).toBe("live");
    expect(edited.isDirty).toBe(true);
    expect(pricingOf(edited).totals.bill).toBe(2360);
  });

  it("back-derives the base factor from the stored quantities", () => {
    const withCases = parseLoadedDocument(
      loadedPayload({
        items: [
          {
            ...loadedPayload().items![0],
            sqiCaseQty: "2",
            sqiBillQty: "3",
            sqiLengthQty: "0",
            sqiNetQty: "27",
          },
        ],
      }),
      "33",
    );
    // 27 = 2 × 12 + 3 × 1
    expect(withCases.lines[0].toBaseFactor).toBe(12);
  });
});

describe("the trailing blank row", () => {
  it("opens a row on a fresh draft and another one as soon as the last gets an item", () => {
    const fresh = quotationReducer(
      undefined as never,
      draftReplaced(
        createDraft({
          companyId: COMPANY_ID,
          branchId: BRANCH_ID,
          accYear: ACC_YEAR,
          companyStateCode: "33",
          quoteDate: QUOTE_DATE,
        }),
      ),
    );
    expect(fresh.lines).toHaveLength(1);
    expect(fresh.lines[0].itemId).toBe("");
    // Opening it is not an edit.
    expect(fresh.isDirty).toBe(false);

    const picked = quotationReducer(
      fresh,
      lineFieldSet({ key: fresh.lines[0].key, field: "itemId", value: ITEM_ID }),
    );
    expect(picked.lines).toHaveLength(2);
    expect(picked.lines[1].itemId).toBe("");
    expect(picked.isDirty).toBe(true);
  });

  it("keeps the blank row out of the payload and out of the item count", () => {
    const draft = baseDraft();
    const withBlank = quotationReducer(
      draft,
      lineFieldSet({ key: draft.lines[0].key, field: "billQty", value: 10 }),
    );
    expect(withBlank.lines).toHaveLength(2);

    const pricing = pricingOf(withBlank);
    expect(pricing.totals.totItems).toBe(1);
    expect(validateSaveInputs(withBlank, pricing)).toBeNull();
    expect(buildSavePayload(withBlank, pricing, ACTOR).items).toHaveLength(1);
  });

  it("opens a blank charge row too, and keeps it out of the payload", () => {
    const draft = baseDraft();
    const withBlanks = quotationReducer(
      draft,
      lineFieldSet({ key: draft.lines[0].key, field: "billQty", value: 10 }),
    );
    expect(withBlanks.charges).toHaveLength(1);
    expect(withBlanks.charges[0].chgId).toBe("");
    expect(
      buildSavePayload(withBlanks, pricingOf(withBlanks), ACTOR).charges,
    ).toHaveLength(0);
  });

  it("leaves a read-only document alone", () => {
    const loaded = parseLoadedDocument(loadedPayload(), "33");
    const browsing = quotationReducer({ ...loaded, mode: "browse" }, modeSet("browse"));
    expect(browsing.lines).toHaveLength(1);
    expect(browsing.lines[0].itemId).toBeTruthy();
  });
});

describe("applySaveResponse", () => {
  it("clears the dirty flag through the reducer, and keeps it when an edit raced the save", () => {
    const draft = baseDraft();
    const dirty = quotationReducer(
      draft,
      lineFieldSet({ key: draft.lines[0].key, field: "billQty", value: 4 }),
    );
    expect(dirty.isDirty).toBe(true);

    const response = { ...loadedPayload(), items: [], charges: [] };

    // The state the response merges into IS the one that was sent → saved clean.
    const saved = quotationReducer(
      dirty,
      saveResponseApplied({ payload: response, sentDraft: dirty }),
    );
    expect(saved.isDirty).toBe(false);
    expect(saved.docId).toBe(response.sqId);
    expect(saved.isNewEntry).toBe(false);

    // The operator committed another cell while the POST was in flight → the
    // later edit is still unsaved and must stay flagged.
    const raced = quotationReducer(
      dirty,
      lineFieldSet({ key: dirty.lines[0].key, field: "rate", value: 150 }),
    );
    const savedWithRace = quotationReducer(
      raced,
      saveResponseApplied({ payload: response, sentDraft: dirty }),
    );
    expect(savedWithRace.isDirty).toBe(true);
    expect(savedWithRace.lines[0].rate).toBe(150);
  });

  it("takes the server ids without blanking the names the response omits", () => {
    const draft = baseDraft();
    const saved = applySaveResponse(draft, {
      ...loadedPayload(),
      items: [
        {
          ...loadedPayload().items![0],
          sqiId: "019f2222-0000-7000-8000-000000000001",
          // The save path performs no joins, so both names come back null.
          sqiItemName: null,
          sqiUnitName: null,
        },
      ],
      charges: [],
    });

    expect(saved.docId).toBe("019f0000-0000-7000-8000-000000000009");
    expect(saved.quoteSlno).toBe("QT/0001");
    expect(saved.quoteRefno).toBe("quo00042");
    expect(saved.isNewEntry).toBe(false);
    expect(saved.isDirty).toBe(false);
    expect(saved.lines[0].sqiId).toBe("019f2222-0000-7000-8000-000000000001");
    expect(saved.lines[0].itemName).toBe("New Claw");
  });
});

// ---------------------------------------------------------------------------

describe("validateSaveInputs", () => {
  const check = (draft: QuotationDraft) => validateSaveInputs(draft, pricingOf(draft));

  it("passes a complete draft", () => {
    expect(check(baseDraft())).toBeNull();
  });

  it("refuses to save a read-only document", () => {
    const violation = check({ ...baseDraft(), mode: "browse" });
    expect(violation?.field).toBe("mode");
  });

  it("refuses to save a deleted document, even one somehow left in entry mode", () => {
    const violation = check({ ...baseDraft(), mode: "entry", isDeleted: true });
    expect(violation?.field).toBe("mode");
    expect(violation?.message).toContain("deleted");
    // ...and says something the operator can act on, unlike "press Edit".
    expect(violation?.message).toContain("Copy as new");
  });

  it("requires a customer name, but not a master record behind it", () => {
    const draft = baseDraft();
    const violation = check({ ...draft, customer: { ...draft.customer, name: "  " } });
    expect(violation?.field).toBe("customer");
    // A walk-in keyed by hand has no `custId`; the server's `sqCustId` is optional.
    expect(check({ ...draft, customer: { ...draft.customer, custId: null } })).toBeNull();
  });

  it("requires a customer phone", () => {
    const draft = baseDraft();
    // Both "never keyed" and "keyed as blanks" are the same missing number.
    expect(check({ ...draft, customer: { ...draft.customer, phone: null } })?.field).toBe(
      "customerPhone",
    );
    expect(check({ ...draft, customer: { ...draft.customer, phone: "   " } })?.field).toBe(
      "customerPhone",
    );
    // Not format-checked: landlines, extensions and country codes all pass.
    expect(check({ ...draft, customer: { ...draft.customer, phone: "+91 44 2841-0000" } })).toBeNull();
  });

  it("does not require a phone the deployment has taken off the form", () => {
    // Visible Settings (menu 14) can hide the field. Blocking the save over one
    // the operator cannot see would leave the screen with no way forward.
    const draft = { ...baseDraft(), customer: { ...baseDraft().customer, phone: null } };
    expect(
      validateSaveInputs(draft, pricingOf(draft), { phoneOnForm: false }),
    ).toBeNull();
    expect(validateSaveInputs(draft, pricingOf(draft), { phoneOnForm: true })?.field).toBe(
      "customerPhone",
    );
  });

  it("requires a real quotation date", () => {
    const draft = baseDraft();
    const violation = check({ ...draft, header: { ...draft.header, quoteDate: "2026-02-31" } });
    expect(violation?.field).toBe("quoteDate");
  });

  it("refuses a quote date outside the document's accounting year", () => {
    const draft = baseDraft();
    const violation = check({
      ...draft,
      accYear: "2020-2021",
      header: { ...draft.header, quoteDate: QUOTE_DATE },
    });
    expect(violation?.field).toBe("quoteDate");
    expect(violation?.message).toContain("2020-2021");
  });

  it("rejects a validity date before the quotation date, as keyed", () => {
    const draft = baseDraft();
    const violation = check({
      ...draft,
      header: { ...draft.header, quoteDate: "2026-07-30", validUntil: "2026-07-01" },
    });
    expect(violation?.field).toBe("validUntil");
  });

  it("checks quantity, rate, minimum price and MRP per line", () => {
    const draft = baseDraft();
    const line = draft.lines[0];

    expect(check({ ...draft, lines: [{ ...line, billQty: 0 }] })?.field).toBe("billQty");
    expect(check({ ...draft, lines: [{ ...line, rate: 0 }] })?.field).toBe("rate");
    // A free line is allowed to have no rate.
    expect(check({ ...draft, lines: [{ ...line, rate: 0, isFree: true }] })).toBeNull();
    expect(check({ ...draft, lines: [{ ...line, minPrice: 120 }] })?.message).toContain("minimum");
    expect(check({ ...draft, lines: [{ ...line, mrp: 90 }] })?.message).toContain("MRP");
    expect(
      validateSaveInputs({ ...draft, lines: [{ ...line, mrp: 90 }] }, pricingOf(draft), {
        skipMrp: true,
      }),
    ).toBeNull();
  });

  it("requires at least one item", () => {
    const draft = baseDraft();
    expect(check({ ...draft, lines: [] })?.field).toBe("items");
    expect(check({ ...draft, lines: [createDraftLine()] })?.field).toBe("items");
  });

  it("requires a posting ledger on every populated charge row", () => {
    const draft = baseDraft();
    const violation = check({
      ...draft,
      charges: [createDraftChargeRow({ chgId: "chg-1", chgName: "Freight", ledgerCode: "" })],
    });
    expect(violation?.field).toBe("charges");
    expect(violation?.message).toContain("posting ledger");
  });

  it("gates the freight role: an override with no charge row is dropped on the floor", () => {
    const draft = baseDraft();
    const withFreight: QuotationDraft = {
      ...draft,
      policy: { ...draft.policy, freightCalcType: "item_basis" },
      header: { ...draft.header, hasFreight: true },
      lines: [{ ...draft.lines[0], hasFreight: true, freightPerQty: 5 }],
    };
    const violation = check(withFreight);
    expect(violation?.field).toBe("charges");
    expect(violation?.message).toContain("FREIGHT");

    // Add the row and the gate opens.
    expect(
      check({
        ...withFreight,
        charges: [
          createDraftChargeRow({
            chgId: "chg-1",
            ledgerCode: "led-1",
            chgName: "Freight",
            role: "FREIGHT",
            beforeTax: true,
          }),
        ],
      }),
    ).toBeNull();

    // So does turning the checkbox off...
    expect(check({ ...withFreight, header: { ...withFreight.header, hasFreight: false } })).toBeNull();
    // ...or a manual policy, where the operator keys the charge themselves.
    expect(
      check({ ...withFreight, policy: { ...withFreight.policy, freightCalcType: "manual" } }),
    ).toBeNull();
  });

  it("keeps a DEDUCT charge's keyed amount a magnitude across a reload", () => {
    // `cd_amount` is stored SIGNED (the engine's row total) while the keyed amount
    // is a magnitude and `cd_type` owns the sign. Reading the signed value back
    // into the keyed field would negate the row a second time on the next edit,
    // turning a discount into a surcharge.
    const loaded = parseLoadedDocument(
      loadedPayload({
        charges: [
          {
            cdId: "019f3333-0000-7000-8000-000000000001",
            cdSlno: 1,
            cdChgId: "chg-cd",
            cdChgName: "CD - AFTER TAX",
            cdLedgerCode: "019fa1e9-5cda-7c66-b03a-74d8d3081515",
            cdRole: "NONE",
            cdMethod: "PERCENT",
            cdType: "DEDUCT",
            cdApplyOn: "VALUE",
            cdCostAlloc: null,
            cdLandingCost: false,
            cdBeforeTax: false,
            cdTaxApl: false,
            cdSepPost: false,
            cdIsActive: true,
            cdIsDeleted: false,
            cdUnit: null,
            cdQtyVal: "10",
            cdWeight: "0",
            // priced by total: rate 0, amount stored as the signed row total
            cdRate: "0",
            cdAmount: "-100",
            cdHsn: null,
            cdTaxCode: null,
            cdTaxPerc: "0",
            cdTaxAmt: "0",
            cdSgstPerc: "0",
            cdSgstAmt: "0",
            cdCgstPerc: "0",
            cdCgstAmt: "0",
            cdIgstPerc: "0",
            cdIgstAmt: "0",
            cdCessPerc: "0",
            cdCessAmt: "0",
            cdNetAmt: "-100",
            cdRemarks: null,
          },
        ],
      }),
      "33",
    );

    expect(loaded.charges[0].type).toBe("DEDUCT");
    expect(loaded.charges[0].amount).toBe(100);

    // Repriced, the engine negates the magnitude exactly once.
    const edited = quotationReducer(
      loaded,
      lineFieldSet({ key: loaded.lines[0].key, field: "billQty", value: 10 }),
    );
    expect(pricingOf(edited).charges[0].amountValue).toBe(-100);
  });

  it("clears the alternates only when a discount member is actually set", () => {
    const draft = baseDraft();
    const key = draft.lines[0].key;
    const withPerQty = quotationReducer(
      draft,
      lineFieldSet({ key, field: "discPerQty", value: 5 }),
    );
    expect(withPerQty.lines[0].discPerQty).toBe(5);

    // Keying a percentage takes over from the per-qty rate.
    const withPerc = quotationReducer(
      withPerQty,
      lineFieldSet({ key, field: "discPerc", value: 10 }),
    );
    expect(withPerc.lines[0].discPerc).toBe(10);
    expect(withPerc.lines[0].discPerQty).toBe(0);
    expect(withPerc.lines[0].discAmt).toBe(0);

    // But writing a ZERO must not wipe the sibling that is in force — the grid
    // moves focus across the sibling cells and a stray 0 would otherwise undo
    // the discount just keyed.
    const zeroed = quotationReducer(
      withPerc,
      lineFieldSet({ key, field: "discPerQty", value: 0 }),
    );
    expect(zeroed.lines[0].discPerc).toBe(10);
    expect(zeroed.lines[0].discPerQty).toBe(0);
  });

  it("warns live on a rate below the minimum, and says nothing when there is no minimum", () => {
    // The grid reverts the cell when this returns a below-minimum warning, so an
    // item with no configured minimum (min_price 0 is the common case) must not
    // produce one — otherwise every rate keyed on such an item is rejected.
    expect(rateWarning(50, 0, 0)).toBeNull();
    expect(rateWarning(50, 0, 100)).toBeNull();
    expect(rateWarning(50, 90, 0)).toContain("minimum");
    expect(rateWarning(50, 50, 0)).toBeNull();
    // A blank cell is not yet a violation — the operator is still typing.
    expect(rateWarning(0, 90, 0)).toBeNull();
    // Above MRP warns but does not revert; skipMrp silences it.
    expect(rateWarning(150, 0, 100)).toContain("MRP");
    expect(rateWarning(150, 0, 100, true)).toBeNull();
  });

  it("gates the loading role the same way", () => {
    const draft = baseDraft();
    const violation = check({
      ...draft,
      policy: { ...draft.policy, loadingCalcType: "item_basis" },
      header: { ...draft.header, hasLoad: true },
      lines: [{ ...draft.lines[0], loadingPerQty: 2 }],
    });
    expect(violation?.message).toContain("LOADING");
  });
});
