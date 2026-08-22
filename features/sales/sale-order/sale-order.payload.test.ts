/**
 * Sale Order — payload builder tests: the §12 round-trip guarantees, the
 * server-owned omissions, and the settlement roll-ups on the wire.
 */
import { describe, expect, it } from "vitest";
import { recalcDocument } from "@/domain/pricing";
import type { SaveActor } from "@/features/sales/quotation/quotation.payload";
import {
  SALES_ITEM_COLUMN_COUNT,
  SALES_ITEM_COLUMN_MEANINGS,
} from "./sale-order.constants";
import {
  buildSavePayload,
  buildTenderPayload,
  importQuotationAsOrder,
  parseLoadedDocument,
  tenderRowFromPayload,
  toArithRow,
} from "./sale-order.payload";
import {
  createOrderDraft,
  createOrderDraftLine,
  copyOrderDraftAsNew,
  isCustomerLocked,
} from "./sale-order.state";
import type {
  SaleOrderDraft,
  SaleOrderTenderPayload,
  TenderDraftRow,
} from "./sale-order.types";
import { validateSaveInputs } from "./sale-order.validate";
import { computeTenders } from "./tender/arithmetic";

const ACTOR: SaveActor = {
  userId: "user-1",
  userName: "Test User",
  sessionId: "session-1",
  deviceId: "device-1",
  deviceType: "WEB",
};

function draftWithLine(): SaleOrderDraft {
  const draft = createOrderDraft({
    companyId: "company-1",
    branchId: "branch-1",
    accYear: "2026-2027",
    companyStateCode: "33",
  });
  draft.customer = { ...draft.customer, custId: "cust-1", name: "ACME TRADERS" };
  draft.header = { ...draft.header, orderDate: "2026-08-11", validUntil: "2026-09-10" };
  draft.lines = [
    createOrderDraftLine({
      itemId: "item-1",
      itemUnitId: "iuc-1",
      itemName: "Widget",
      billQty: 10,
      rate: 150,
      gstPerc: 0,
    }),
  ];
  return draft;
}

function pricingOf(draft: SaleOrderDraft) {
  return recalcDocument(draft.lines, draft.charges, draft.policy, {
    isLocalSale: draft.isLocalSale,
    hasFreight: draft.header.hasFreight,
    hasLoad: draft.header.hasLoad,
    hasUnload: draft.header.hasUnload,
  });
}

function tenderRow(overrides: Partial<TenderDraftRow> = {}): TenderDraftRow {
  return {
    key: "t-1",
    tdId: null,
    tenderId: "tnd-cash",
    tenderTypeId: 1,
    typeCode: "CASH",
    tenderName: "Cash",
    tenderLedgerId: "led-cash",
    settleLedgerId: null,
    surchargeLedgerId: null,
    surchargePerc: 0,
    surchargeFlat: 0,
    settlementDays: 0,
    minAmount: 0,
    maxAmount: null,
    conversionRate: 1,
    editSurcharge: false,
    allowChange: true,
    needsRef: false,
    hotkey: "A",
    keyed: 0,
    settleStatus: "NA",
    refNo: null,
    authCode: null,
    bankName: null,
    cardDigits: null,
    instrumentDate: null,
    notes: null,
    ...overrides,
  };
}

describe("grid 24 column map", () => {
  it("declares exactly 96 columns, fulfilment quartet last", () => {
    expect(SALES_ITEM_COLUMN_MEANINGS).toHaveLength(SALES_ITEM_COLUMN_COUNT);
    const lastFour = SALES_ITEM_COLUMN_MEANINGS.slice(-4).map((column) => column.token);
    expect(lastFour).toEqual(["DeliveredQty", "CancelledQty", "PendingQty", "LineStatus"]);
    // Display-only and server-owned: none of the four may carry a write target.
    for (const column of SALES_ITEM_COLUMN_MEANINGS.slice(-4)) {
      expect(column.write).toBeUndefined();
    }
  });
});

describe("buildSavePayload", () => {
  it("omits every server-owned field and never sends the fulfilment quartet", () => {
    const draft = draftWithLine();
    const payload = buildSavePayload(draft, pricingOf(draft), ACTOR) as Record<string, unknown>;
    for (const key of [
      "soAdvanceRecdAmt",
      "soAdvanceBalanceAmt",
      "soAdvancePolicy",
      "soAdvanceStatus",
      "soFulfilStatus",
      "soBilledAmt",
      "soPendingAmt",
      "soCancelledAmt",
      "soOrderSlno",
      "soOrderRefno",
      "advances",
    ]) {
      expect(payload, key).not.toHaveProperty(key);
    }
    const item = (payload.items as Record<string, unknown>[])[0];
    for (const key of ["soiDeliveredQty", "soiCancelledQty", "soiPendingQty", "soiLineStatus"]) {
      expect(item, key).not.toHaveProperty(key);
    }
  });

  it("sends the size column as the dimensions were typed, never as the CFT", () => {
    // Same as the quotation grid: the dimensions travel verbatim and the CFT
    // they work out to travels as soiBillQty.
    const draft = draftWithLine();
    draft.lines = [{ ...draft.lines[0], itemSize: "45*2*2*6" }];
    const item = buildSavePayload(draft, pricingOf(draft), ACTOR).items?.[0];
    expect(item?.soiSize).toBe("45*2*2*6");
    expect(item?.soiSizeUom).toBe("CFT");
  });

  it("sends no size at all rather than the blank ck_soi_size rejects", () => {
    const draft = draftWithLine();
    draft.lines = [{ ...draft.lines[0], itemSize: "   " }];
    const item = buildSavePayload(draft, pricingOf(draft), ACTOR).items?.[0];
    expect(item?.soiSize).toBeNull();
    expect(item?.soiSizeUom).toBeNull();
  });

  it("sends the two uuid[] people columns as lists, never null", () => {
    const draft = draftWithLine();
    draft.header = {
      ...draft.header,
      salesmanId: "emp-1",
      packedId: "emp-2",
      hasLoyalty: true,
    };
    const payload = buildSavePayload(draft, pricingOf(draft), ACTOR);
    expect(payload.soSalesmanId).toEqual(["emp-1"]);
    expect(payload.soPackedId).toEqual(["emp-2"]);
    expect(payload.soHasLoyalty).toBe(true);
    // A Prisma scalar list has no nullable form: unset means [], not null.
    const blank = buildSavePayload(draftWithLine(), pricingOf(draftWithLine()), ACTOR);
    expect(blank.soSalesmanId).toEqual([]);
    expect(blank.soPackedId).toEqual([]);
  });

  it("sends the source trail as nulls when there is no source", () => {
    const draft = draftWithLine();
    const payload = buildSavePayload(draft, pricingOf(draft), ACTOR);
    expect(payload.soSrcDocId).toBeNull();
    expect(payload.soSrcDocType).toBeNull();
    expect(payload.tenders).toBeUndefined();
  });

  it("decides soPayStatus by the NET (order 1,500, 100+1,400 with a 14 fee → PAID)", () => {
    const draft = draftWithLine();
    draft.tenders = [
      tenderRow({ key: "t-cash", keyed: 100 }),
      tenderRow({
        key: "t-upi",
        tenderId: "tnd-upi",
        tenderTypeId: 3,
        typeCode: "UPI",
        tenderName: "UPI",
        allowChange: false,
        surchargePerc: 1,
        keyed: 1400,
        refNo: "UTR123",
        needsRef: true,
      }),
    ];
    const payload = buildSavePayload(draft, pricingOf(draft), ACTOR);
    expect(payload.soTenderAmt).toBe(1514);
    expect(payload.soSurchargeAmt).toBe(14);
    expect(payload.soPayStatus).toBe("PAID");
    const tenders = payload.tenders ?? [];
    expect(tenders).toHaveLength(2);
    // ck_td_total_amt on every row: total = amount + surcharge.
    for (const tender of tenders) {
      expect(tender.tdTotalAmt).toBe((tender.tdAmount ?? 0) + (tender.tdSurchargeAmt ?? 0));
    }
    expect(tenders[1].tdAmount).toBe(1400);
    expect(tenders[1].tdSurchargeAmt).toBe(14);
  });

  it("a partial advance saves as PARTIAL with no coverage gate (order 1,500, advance 500)", () => {
    const draft = draftWithLine();
    draft.tenders = [tenderRow({ keyed: 500 })];
    const pricing = pricingOf(draft);
    expect(validateSaveInputs(draft, pricing)).toBeNull();
    const payload = buildSavePayload(draft, pricing, ACTOR);
    expect(payload.soPayStatus).toBe("PARTIAL");
    expect(payload.soTenderAmt).toBe(500);
  });
});

describe("buildTenderPayload — instrument block", () => {
  it("a cheque carries its number, bank, date and PDC flag — and a null card number", () => {
    const cheque = tenderRow({
      tenderId: "tnd-cheque",
      tenderTypeId: 5,
      typeCode: "CHEQUE",
      tenderName: "Cheque",
      allowChange: false,
      keyed: 4500,
      refNo: "774411",
      bankName: "SBI",
      instrumentDate: "2026-09-01",
      cardDigits: "4242",
      settlementDays: 3,
    });
    const computation = computeTenders([toArithRow(cheque)], 4500);
    const dto = buildTenderPayload(cheque, computation.rows[0], 0, "2026-08-11", ACTOR);
    expect(dto.tdRefNo).toBe("774411");
    expect(dto.tdBankName).toBe("SBI");
    expect(dto.tdInstrumentDate).toBe("2026-09-01");
    expect(dto.tdIsPdc).toBe(true);
    // A cheque has no card number even when digits were typed into the row.
    expect(dto.tdCardLast4).toBeNull();
    expect(dto.tdTenderTypeId).toBe(5);
    expect(dto.tdSettleStatus).toBe("NA");
    expect(dto.tdExpectedSettleOn).toBe("2026-08-14");
  });

  it("a card keeps its last four and its expiry never flags PDC", () => {
    const card = tenderRow({
      tenderId: "tnd-card",
      tenderTypeId: 2,
      typeCode: "CARD",
      tenderName: "Card",
      allowChange: false,
      keyed: 1000,
      cardDigits: "4111 1111 1111 4242",
      instrumentDate: "2027-05-01",
      refNo: "SLIP01",
    });
    const computation = computeTenders([toArithRow(card)], 1000);
    const dto = buildTenderPayload(card, computation.rows[0], 0, "2026-08-11", ACTOR);
    expect(dto.tdCardLast4).toBe("4242");
    expect(dto.tdIsPdc).toBe(false);
  });
});

describe("tender round trip", () => {
  it("every td* field survives parse(build(row)), flat surcharge included", () => {
    const original = tenderRow({
      tenderId: "tnd-upi",
      tenderTypeId: 3,
      typeCode: "UPI",
      tenderName: "UPI",
      allowChange: false,
      surchargePerc: 1,
      keyed: 1400,
      refNo: "UTR999",
      needsRef: true,
    });
    const computation = computeTenders([toArithRow(original)], 1400);
    const dto = buildTenderPayload(original, computation.rows[0], 0, "2026-08-11", ACTOR);
    const wire: SaleOrderTenderPayload = {
      tdId: "td-1",
      tdRowNo: dto.tdRowNo ?? 1,
      tdTenderId: dto.tdTenderId,
      tdTenderTypeId: String(dto.tdTenderTypeId),
      tdTenderLedgerId: dto.tdTenderLedgerId ?? null,
      tdPartyLedgerId: null,
      tdAmount: dto.tdAmount ?? 0,
      tdSurchargePerc: dto.tdSurchargePerc ?? 0,
      tdSurchargeAmt: dto.tdSurchargeAmt ?? 0,
      tdSurchargeLedgerId: dto.tdSurchargeLedgerId ?? null,
      tdTotalAmt: dto.tdTotalAmt ?? 0,
      tdReceivedAmt: dto.tdReceivedAmt ?? 0,
      tdChangeAmt: dto.tdChangeAmt ?? 0,
      tdRefNo: dto.tdRefNo ?? null,
      tdAuthCode: dto.tdAuthCode ?? null,
      tdCardLast4: dto.tdCardLast4 ?? null,
      tdBankName: dto.tdBankName ?? null,
      tdPayerVpa: null,
      tdInstrumentDate: dto.tdInstrumentDate ?? null,
      tdIsPdc: dto.tdIsPdc ?? false,
      tdSettleStatus: dto.tdSettleStatus ?? "NA",
      tdSettleLedgerId: dto.tdSettleLedgerId ?? null,
      tdExpectedSettleOn: dto.tdExpectedSettleOn ?? null,
      tdSettledOn: null,
      tdVoucherId: null,
      tdDocDate: "2026-08-11",
      tdNotes: dto.tdNotes ?? null,
    };
    const reloaded = tenderRowFromPayload(wire);
    // The reloaded row keys the same money and reproduces the same figures.
    const recomputed = computeTenders([toArithRow(reloaded)], 1400);
    expect(recomputed.rows[0].base).toBe(1400);
    expect(recomputed.rows[0].surchargeAmt).toBe(14);
    expect(recomputed.rows[0].amount).toBe(1414);
    expect(reloaded.refNo).toBe("UTR999");
    expect(reloaded.typeCode).toBe("UPI");
    expect(reloaded.tdId).toBe("td-1");
  });

  it("reconstructs a pure-flat surcharge on load (perc 0, stored fee 14)", () => {
    const wire = {
      tdId: "td-2",
      tdRowNo: 1,
      tdTenderId: "tnd-card",
      tdTenderTypeId: "2",
      tdTenderLedgerId: null,
      tdPartyLedgerId: null,
      tdAmount: 1000,
      tdSurchargePerc: 0,
      tdSurchargeAmt: 14,
      tdSurchargeLedgerId: null,
      tdTotalAmt: 1014,
      tdReceivedAmt: 1014,
      tdChangeAmt: 0,
      tdRefNo: null,
      tdAuthCode: null,
      tdCardLast4: "4242",
      tdBankName: null,
      tdPayerVpa: null,
      tdInstrumentDate: null,
      tdIsPdc: false,
      tdSettleStatus: "NA",
      tdSettleLedgerId: null,
      tdExpectedSettleOn: null,
      tdSettledOn: null,
      tdVoucherId: null,
      tdDocDate: null,
      tdNotes: null,
    } satisfies SaleOrderTenderPayload;
    const reloaded = tenderRowFromPayload(wire);
    const recomputed = computeTenders([toArithRow(reloaded)], 1000);
    expect(recomputed.rows[0].surchargeAmt).toBe(14);
    expect(recomputed.rows[0].amount).toBe(1014);
  });
});

describe("source trail and the customer lock", () => {
  const quotation = {
    sqId: "sq-1",
    sqCompanyId: "company-1",
    sqBranchId: "branch-1",
    sqAccYear: "2026-2027",
    sqPriceLevel: 1,
    sqDocType: "QUOTATION",
    sqQuoteSlno: "123",
    sqQuoteRefno: "SQ-000123",
    sqUsrRefno: null,
    sqQuoteDate: "2026-08-04T00:00:00.000Z",
    sqValidUntil: null,
    sqValidityDays: 7,
    sqRevisionNo: 0,
    sqCustId: "cust-1",
    sqCustAreaId: null,
    sqCustName: "ACME TRADERS",
    sqCustAddr: null,
    sqCustPlace: null,
    sqCustPhone: "9000000000",
    sqCustEmail: null,
    sqCustGstin: null,
    sqCustGstType: null,
    sqCustStcd: "33",
    sqPosStcd: "33",
    sqStateName: "Tamil Nadu",
    sqContactPerson: null,
    sqContactPhone: null,
    sqHasLoad: false,
    sqHasUnload: false,
    sqHasFreight: false,
    sqHasPromo: false,
    sqUserId: "user-1",
    sqSalesmanId: null,
    sqAgentId: null,
    sqTotItems: 1,
    sqTotWeight: "0",
    sqTotBags: "10",
    sqGrossAmt: "1500",
    sqItemDisc: "0",
    sqSplDisc: "0",
    sqSchDisc: "0",
    sqBillSchDisc: "0",
    sqTaxableAmt: "1500",
    sqCgstAmt: "0",
    sqSgstAmt: "0",
    sqIgstAmt: "0",
    sqCessAmt: "0",
    sqTaxAmt: "0",
    sqFreightAmt: "0",
    sqLoadAmt: "0",
    sqUnloadAmt: "0",
    sqOtherAmt1: "0",
    sqOtherAmt2: "0",
    sqRoundOff: "0",
    sqQuoteAmt: "1500",
    sqTotalCost: null,
    sqMarginAmt: null,
    sqMarginPerc: null,
    sqMrpSavings: null,
    sqMrpSavingsPerc: null,
    sqPaymentTerms: null,
    sqDeliveryTerms: null,
    sqTermsConditions: null,
    sqStatus: "SENT",
    sqRemarks: null,
    sqPrintCount: 0,
    sqIsDeleted: false,
    sqCreatedOn: null,
    sqCreatedBy: null,
    sqModifiedOn: null,
    sqModifiedBy: null,
    sqFreightCalcType: "manual",
    sqLoadingCalcType: "manual",
    sqDiscAlterBase: false,
    items: [
      {
        sqiId: "sqi-1",
        sqiLineNo: 1,
        sqiItemId: "item-1",
        sqiItemUnitId: "iuc-1",
        sqiPriceLevel: 1,
        sqiHsnCode: null,
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
        sqiWeightQty: "0",
        sqiAvailableStock: "0",
        sqiRate: "150",
        sqiRatePreTax: "150",
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
        sqiGrossAmt: "1500",
        sqiTaxableAmt: "1500",
        sqiTaxPerc: "0",
        sqiTaxAmt: "0",
        sqiCgstPerc: "0",
        sqiCgstAmt: "0",
        sqiSgstPerc: "0",
        sqiSgstAmt: "0",
        sqiIgstPerc: "0",
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
        sqiNetAmt: "1500",
        sqiCostPrice: "0",
        sqiMaxPrice: "0",
        sqiMinPrice: "0",
        sqiActPrice: "150",
        sqiQuotePrice: "150",
        sqiItemProfit: "0",
        sqiCostPreTax: "0",
        sqiQuotePreTax: "150",
        sqiProfitPreTax: "0",
        sqiMrpSavings: null,
        sqiMrpSavingsPerc: null,
        sqiNetGross: "1500",
        sqiChrgBeforeTax: "0",
        sqiChrgAfterTax: "0",
        sqiSchemeId: null,
        sqiSchemeName: null,
        sqiRemarks: null,
        sqiSize: null,
        sqiSizeUom: null,
        sqiItemName: "Widget",
        sqiUnitName: "NOS",
      },
    ],
    charges: [],
  };

  it("Ctrl+F3 stamps the trail on the draft and per line, and locks the customer", () => {
    const draft = importQuotationAsOrder(quotation, "33", "2026-08-11");
    expect(draft.source).toEqual({
      docType: "QUOTATION",
      docId: "sq-1",
      accYear: "2026-2027",
      refno: "SQ-000123",
      date: "2026-08-04",
    });
    expect(isCustomerLocked(draft.source)).toBe(true);
    const line = draft.lines[0];
    expect(line.srcDocType).toBe("QUOTATION");
    expect(line.srcDocId).toBe("sq-1");
    expect(line.srcDocRefno).toBe("SQ-000123");
    expect(line.srcLineNo).toBe(1);
    expect(line.soiId).toBeNull();
    expect(line.sqiId).toBeNull();
    // The imported prices are the quoted ones.
    expect(line.rate).toBe(150);
    expect(line.billQty).toBe(10);

    const payload = buildSavePayload(draft, pricingOf(draft), ACTOR);
    expect(payload.soSrcDocId).toBe("sq-1");
    expect(payload.soSrcDocRefno).toBe("SQ-000123");
    expect(payload.items?.[0].soiSrcDocId).toBe("sq-1");
    expect(payload.items?.[0].soiSrcLineNo).toBe(1);
  });

  it("Copy as new clears the trail on the draft AND every line", () => {
    const imported = importQuotationAsOrder(quotation, "33", "2026-08-11");
    const copy = copyOrderDraftAsNew(
      { ...imported, docId: "so-1", orderRefno: "sor00001" },
      "2026-08-12",
    );
    expect(copy.source).toBeNull();
    expect(isCustomerLocked(copy.source)).toBe(false);
    expect(copy.docId).toBeNull();
    for (const line of copy.lines) {
      expect(line.srcDocId).toBeNull();
      expect(line.srcDocRefno).toBeNull();
      expect(line.soiId).toBeNull();
      expect(line.fulfilment).toBeUndefined();
    }
    expect(copy.tenders).toEqual([]);
    expect(copy.settlement.tenderAmt).toBe(0);
  });
});

describe("validate — the order's own gates", () => {
  it("requires a customer RECORD, not just a name", () => {
    const draft = draftWithLine();
    draft.customer = { ...draft.customer, custId: null };
    expect(validateSaveInputs(draft, pricingOf(draft))?.field).toBe("customer");
  });

  it("URGENT priority demands remarks", () => {
    const draft = draftWithLine();
    draft.header = { ...draft.header, priority: "URGENT" };
    expect(validateSaveInputs(draft, pricingOf(draft))?.field).toBe("remarks");
    draft.terms = { ...draft.terms, remarks: "Customer waiting at counter" };
    expect(validateSaveInputs(draft, pricingOf(draft))).toBeNull();
  });

  it("delivery date may not precede the order date", () => {
    const draft = draftWithLine();
    draft.header = { ...draft.header, deliveryDate: "2026-08-01" };
    expect(validateSaveInputs(draft, pricingOf(draft))?.field).toBe("deliveryDate");
  });

  it("has no stock gate: a back-order passes", () => {
    const draft = draftWithLine();
    draft.lines[0] = { ...draft.lines[0], stockQty: 0, billQty: 100 };
    expect(validateSaveInputs(draft, pricingOf(draft))).toBeNull();
  });

  it("credit gate CONFIRMS on a breached limit and is silenced by the override", () => {
    const draft = draftWithLine();
    draft.partyCredit = {
      partyId: "cust-1",
      partyName: "ACME TRADERS",
      accYear: null,
      asOnDate: "2026-08-11",
      pendingAmount: 60000,
      pendingBillCount: 4,
      overdueAmount: 0,
      overdueBillCount: 0,
      oldestOverdueDueDate: null,
      maxOverdueDays: 0,
      creditAmtLimit: 50000,
      creditBillLimit: 10,
      availableCreditAmount: -10000,
      availableBillCount: 6,
      isAmtLimitExceeded: true,
      isBillLimitExceeded: false,
      isCreditCheckEnabled: true,
    };
    const violation = validateSaveInputs(draft, pricingOf(draft));
    expect(violation?.confirm).toBe(true);
    draft.creditOverride = true;
    expect(validateSaveInputs(draft, pricingOf(draft))).toBeNull();
  });

  it("credit check off means NO gate, whatever the figures say", () => {
    const draft = draftWithLine();
    draft.partyCredit = {
      partyId: "cust-1",
      partyName: "ACME TRADERS",
      accYear: null,
      asOnDate: "2026-08-11",
      pendingAmount: 999999,
      pendingBillCount: 99,
      overdueAmount: 999999,
      overdueBillCount: 99,
      oldestOverdueDueDate: "2020-01-01",
      maxOverdueDays: 2000,
      creditAmtLimit: 0,
      creditBillLimit: 0,
      availableCreditAmount: null,
      availableBillCount: null,
      isAmtLimitExceeded: false,
      isBillLimitExceeded: false,
      isCreditCheckEnabled: false,
    };
    expect(validateSaveInputs(draft, pricingOf(draft))).toBeNull();
  });

  it("a cheque without its number, bank or date is refused by name", () => {
    const draft = draftWithLine();
    draft.tenders = [
      tenderRow({
        tenderId: "tnd-cheque",
        tenderTypeId: 5,
        typeCode: "CHEQUE",
        tenderName: "Cheque",
        allowChange: false,
        keyed: 500,
      }),
    ];
    expect(validateSaveInputs(draft, pricingOf(draft))?.message).toContain("cheque number");
  });
});

describe("load round trip", () => {
  it("paints fulfilment into the readonly branch and keeps stored figures verbatim", () => {
    const draft = draftWithLine();
    draft.tenders = [tenderRow({ keyed: 500 })];
    const pricing = pricingOf(draft);
    const saved = buildSavePayload(draft, pricing, ACTOR);
    // Simulate the GET: header/item decimals as strings, fulfilment quartet
    // server-derived (a fresh line starts fully pending).
    const wire = {
      ...(saved as unknown as Record<string, unknown>),
      soId: "so-1",
      soOrderSlno: "101",
      soOrderRefno: "sor00101",
      soVersionNo: 0,
      soIsDeleted: false,
      soPrintCount: 0,
      soDeliveredItems: 0,
      soAdvancePolicy: null,
      soAdvancePerc: "0",
      soAdvanceRequired: "0",
      soAdvanceDueDate: null,
      soIsAdvanceMandatory: false,
      soAdvanceLedgerId: null,
      soAdvanceRecdAmt: "500",
      soAdvanceAdjustedAmt: "0",
      soAdvanceRefundAmt: "0",
      soAdvanceForfeitAmt: "0",
      soAdvanceBalanceAmt: "500",
      soAdvanceStatus: "RECEIVED",
      soAdvanceRecdOn: null,
      soPayMode: null,
      soBilledAmt: "0",
      soCancelledAmt: "0",
      soPendingAmt: "1500",
      soFulfilStatus: "PENDING",
      soLastBilledOn: null,
      soCompletedOn: null,
      soCreatedOn: null,
      soCreatedBy: "Test User",
      soModifiedOn: null,
      soModifiedBy: null,
      items: (saved.items ?? []).map((item, index) => ({
        ...item,
        soiId: `soi-${index + 1}`,
        soiIsDeleted: false,
        soiDeliveredQty: "0",
        soiCancelledQty: "0",
        soiPendingQty: String(item.soiOrderQty ?? 0),
        soiLineStatus: "PENDING",
        soiItemName: "Widget",
        soiUnitName: "NOS",
        soiGodownName: null,
        soiDecimalCount: 2,
        soiGroupId: null,
        soiBrandId: null,
        soiSectionId: null,
        soiCategoryId: null,
        soiSoldPrice: String(item.soiSoldPrice ?? 0),
        soiSoldPreTax: String(item.soiSoldPreTax ?? 0),
      })),
      charges: [],
      tenders: (saved.tenders ?? []).map((tender, index) => ({
        ...tender,
        tdId: `td-${index + 1}`,
        tdPartyLedgerId: "cust-1",
        tdPayerVpa: null,
        tdSettledOn: null,
        tdVoucherId: "avh-1",
        tdDocDate: "2026-08-11",
        tdTenderTypeId: String(tender.tdTenderTypeId ?? 1),
      })),
    };
    const loaded = parseLoadedDocument(wire as never, "33");
    expect(loaded.pricing).toBe("stored");
    expect(loaded.storedPricing?.totals.bill).toBe(1500);
    expect(loaded.settlement.tenderAmt).toBe(500);
    expect(loaded.settlement.payStatus).toBe("PARTIAL");
    expect(loaded.advance.recdAmt).toBe(500);
    expect(loaded.advance.balanceAmt).toBe(500);
    const line = loaded.lines[0];
    expect(line.billQty).toBe(10);
    expect(line.rate).toBe(150);
    expect(line.fulfilment).toEqual({
      deliveredQty: 0,
      cancelledQty: 0,
      pendingQty: 10,
      lineStatus: "PENDING",
    });
    // The reloaded tender keys the same 500 and keeps its id for the update.
    expect(loaded.tenders[0].tdId).toBe("td-1");
    expect(loaded.tenders[0].keyed).toBe(500);
    // Save-unchanged sends identical settlement figures.
    const resaved = buildSavePayload(
      { ...loaded, mode: "entry" },
      loaded.storedPricing ?? pricing,
      ACTOR,
    );
    expect(resaved.soTenderAmt).toBe(500);
    expect(resaved.soSurchargeAmt).toBe(0);
    expect(resaved.soPayStatus).toBe("PARTIAL");
    expect(resaved.tenders?.[0].tdId).toBe("td-1");
    expect(resaved.tenders?.[0].tdAmount).toBe(500);
  });
});
