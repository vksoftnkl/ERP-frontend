/**
 * Sale Bill Entry — the save and load translations (§15, §16).
 *
 * Every test here is a trap in the wire contract that would otherwise be found
 * by a 400 at the counter, or — worse — by a bill that saved and posted wrong.
 */
import { describe, expect, it } from "vitest";
import { recalcDocument, type DocumentPricing } from "@/domain/pricing";
import type { SaveActor } from "@/features/sales/quotation/quotation.payload";
import { createDraftChargeRow } from "@/features/sales/quotation/quotation.state";
import {
  adjustmentsForWire,
  applyBillSaveResponse,
  billKeyOf,
  buildAmendBody,
  buildPostBody,
  buildSavePayload,
  buildValidateBody,
  parseLoadedBill,
} from "@/features/sales/testbill/payload";
import {
  AMEND_BILL_DTO_KEYS,
  POST_BILL_DTO_KEYS,
  SAVE_BILL_ADJUSTMENT_DTO_KEYS,
  SAVE_BILL_DTO_KEYS,
  SAVE_BILL_ITEM_DTO_KEYS,
  SAVE_CHARGE_DETAIL_DTO_KEYS,
  VALIDATE_BILL_DTO_KEYS,
  keysOutside,
} from "@/features/sales/testbill/payload/dto-keys";
import { createBillDraft, createBillDraftLine } from "@/features/sales/testbill/state/factories";
import { stockGateOf } from "@/features/sales/testbill/domain/validate";
import type {
  BillItemPayload,
  BillPayload,
  SaleBillDraft,
  SaleBillDraftLine,
} from "@/features/sales/testbill/types";

const CONTEXT = {
  companyId: "11111111-1111-1111-1111-111111111111",
  branchId: "22222222-2222-2222-2222-222222222222",
  accYear: "2026-2027",
  companyStateCode: "33",
  companyStateName: "Tamil Nadu",
  billDate: "2026-09-12",
  billDatetime: "2026-09-12T09:30:00",
};

const ACTOR: SaveActor = {
  userId: "33333333-3333-3333-3333-333333333333",
  userName: "counter1",
  sessionId: "44444444-4444-4444-4444-444444444444",
  deviceId: "browser-abc",
  deviceMasterId: "55555555-5555-5555-5555-555555555555",
  deviceType: "WEB",
};

function line(overrides: Partial<SaleBillDraftLine> = {}): SaleBillDraftLine {
  return createBillDraftLine({
    itemId: "i1",
    itemName: "TEAK PLANK",
    itemUnitId: "u1",
    godownId: "g1",
    billQty: 4,
    rate: 250,
    gstPerc: 18,
    cgstPerc: 9,
    sgstPerc: 9,
    igstPerc: 18,
    stockQty: 100,
    stockGateResolved: true,
    ...overrides,
  });
}

function draftWith(overrides: Partial<SaleBillDraft> = {}): SaleBillDraft {
  const base = createBillDraft(CONTEXT);
  return {
    ...base,
    customer: { ...base.customer, custId: "cust-1", name: "ACME" },
    lines: [line()],
    ...overrides,
  };
}

function priceOf(draft: SaleBillDraft): DocumentPricing {
  return recalcDocument(draft.lines, draft.charges, draft.policy, {
    isLocalSale: draft.isLocalSale,
    hasFreight: draft.header.hasFreight,
    hasLoad: draft.header.hasLoad,
    hasUnload: draft.header.hasUnload,
  });
}

function build(draft: SaleBillDraft) {
  return buildSavePayload(draft, priceOf(draft), ACTOR);
}

// ---------------------------------------------------------------------------
// What is never sent
// ---------------------------------------------------------------------------

describe("the bill number is the SERVER's, both halves", () => {
  it("sends neither the serial nor the refno", () => {
    // The plan's §15 says the refno is the client's. It is not: both are
    // allocated from the bill voucher sequence (type 22) inside the create
    // transaction, and whatever a client sends is ignored.
    const payload = build(draftWith()) as Record<string, unknown>;
    expect("sbBillSlno" in payload).toBe(false);
    expect("sbBillRefno" in payload).toBe(false);
  });

  it("sends sbId only on an update", () => {
    expect(build(draftWith()).sbId).toBeUndefined();
    expect(build(draftWith({ docId: "sb-1" })).sbId).toBe("sb-1");
  });
});

describe("a save is always a DRAFT", () => {
  it("never sends a status or a version — both are server-owned (§18.1)", () => {
    // A save is a draft until `/bills/post`; the server ignores whatever status
    // it is sent, and the Qt habit of sending the label's text is not ported.
    expect(build(draftWith())).not.toHaveProperty("sbStatus");
    expect(build(draftWith({ docId: "sb-1", status: "POSTED" }))).not.toHaveProperty("sbStatus");
    expect(build(draftWith({ docId: "sb-1" }))).not.toHaveProperty("sbVersionNo");
  });

  it("sends the bill mode from the menu, never a combo (§3.4)", () => {
    expect(build(draftWith()).sbBillMode).toBe("WHOLESALE");
  });

  it("stamps created-by on a new bill and modified-by on a loaded one", () => {
    const created = build(draftWith());
    expect(created.sbCreatedBy).toBe("counter1");
    expect(created).not.toHaveProperty("sbModifiedBy");
    const updated = build(draftWith({ docId: "sb-1" }));
    expect(updated.sbModifiedBy).toBe("counter1");
    expect(updated).not.toHaveProperty("sbCreatedBy");
  });
});

describe("identity", () => {
  it("carries the whole tenant scope, the device and the session", () => {
    // Every txn table is partitioned by the accounting year and the counters are
    // offline-first, so all of this is part of the bill's identity rather than
    // metadata.
    const payload = build(draftWith());
    expect(payload.sbCompanyId).toBe(CONTEXT.companyId);
    expect(payload.sbAccYear).toBe("2026-2027");
    // The REGISTERED device the login returned, never the browser's fingerprint:
    // the stock voucher the post writes has a foreign key to device_master (§3.3).
    expect(payload.sbDeviceId).toBe(ACTOR.deviceMasterId);
    expect(payload.sbDeviceType).toBe("WEB");
    expect(payload.sbSessionId).toBe(ACTOR.sessionId);
    expect(payload).not.toHaveProperty("sbCounterId");
  });

  it("falls back to the browser id only so a DRAFT can still be saved", () => {
    const payload = buildSavePayload(draftWith(), priceOf(draftWith()), { ...ACTOR, deviceMasterId: null });
    expect(payload.sbDeviceId).toBe("browser-abc");
  });

  it("sends the counter's clock, to the second", () => {
    expect(build(draftWith()).sbBillDatetime).toBe("2026-09-12T09:30:00");
  });

  it("bills a walk-in with a null customer id, never a blank one", () => {
    // sb_cust_id is a nullable uuid. "" is not an absent uuid to it, it is a
    // malformed one, and it comes back as a 400 naming the field.
    const draft = draftWith();
    draft.customer = { ...draft.customer, custId: null, name: "WALK IN" };
    const payload = build(draft);
    expect(payload.sbCustId).toBeNull();
    expect(payload.sbCustName).toBe("WALK IN");
  });
});

describe("the uuid[] people columns", () => {
  it("sends an EMPTY ARRAY for nobody, never null", () => {
    // Prisma's scalar list has no nullable form: `null` fails to match the
    // unchecked create input, Prisma falls back to the checked variant, and the
    // save dies on a misleading "Argument `customer` is missing".
    const payload = build(draftWith());
    expect(payload.sbSalesmanId).toEqual([]);
    expect(payload.sbLoadmanId).toEqual([]);
    expect(payload.sbPackedId).toEqual([]);
  });

  it("wraps the one id the form keys", () => {
    const draft = draftWith();
    draft.header = {
      ...draft.header,
      people: { ...draft.header.people, salesmanId: "emp-1", packedId: "emp-2" },
    };
    const payload = build(draft);
    expect(payload.sbSalesmanId).toEqual(["emp-1"]);
    expect(payload.sbPackedId).toEqual(["emp-2"]);
    // A single-valued role stays a plain column.
    expect(payload.sbAgentId).toBeNull();
  });
});

describe("the credit term", () => {
  it("sends the due period only for a CREDIT bill", () => {
    const cash = build(draftWith());
    expect(cash.sbDueDays).toBeNull();
    expect(cash.sbDueDate).toBeNull();

    const draft = draftWith();
    draft.header = { ...draft.header, billType: "CREDIT", dueDays: 30, dueDate: "2026-10-12" };
    const credit = build(draft);
    expect(credit.sbDueDays).toBe(30);
    expect(credit.sbDueDate).toBe("2026-10-12");
  });
});

describe("place of supply — two facts, two columns (§5)", () => {
  it("sends the customer's own state and the POS separately", () => {
    const draft = draftWith();
    draft.customer = { ...draft.customer, stateCode: "33" };
    draft.header = { ...draft.header, posStateCode: "29", posStateName: "Karnataka" };
    const payload = build(draft);
    expect(payload.sbCustStcd).toBe("33");
    expect(payload.sbPosStcd).toBe("29");
    expect(payload.sbStateName).toBe("Karnataka");
  });
});

describe("the lines", () => {
  it("numbers them from one, skipping the trailing blank row", () => {
    const draft = draftWith({ lines: [line(), createBillDraftLine()] });
    const payload = build(draft);
    expect(payload.items).toHaveLength(1);
    expect(payload.items?.[0].sbiLineNo).toBe(1);
  });

  it("sends the godown, which is REQUIRED", () => {
    expect(build(draftWith()).items?.[0].sbiGodownId).toBe("g1");
  });

  it("sends what the ORDER ordered, not what is pending", () => {
    // `orderQty` on an imported line holds what is still PENDING; sending that
    // as `sbiSrcItemQty` would let the order's own arithmetic be re-derived
    // against the wrong denominator.
    const draft = draftWith({
      lines: [
        line({
          srcItemQty: 10,
          orderQty: 4,
          orderQtyLocked: true,
          srcDocType: "SALES_ORDER",
          srcDocId: "so-1",
          srcItemId: "soi-1",
          srcDocLineNo: 3,
        }),
      ],
    });
    const item = build(draft).items?.[0];
    expect(item?.sbiSrcItemQty).toBe(10);
    // The trail is per line (§13.5): the DOCUMENT, then the LINE the server
    // keys its guards and draw-down on, and the line number that was once
    // always null (billed orders stayed CONFIRMED).
    expect(item?.sbiSrcDocId).toBe("so-1");
    expect(item?.sbiSrcItemId).toBe("soi-1");
    expect(item?.sbiSrcDocLineNo).toBe(3);
  });

  it("never sends a null bucket — an explicit null is a bare 500 (§18.2)", () => {
    expect(build(draftWith()).items?.[0].sbiBucket).toBe("SALEABLE");
  });

  it("sends a hand-keyed line's trail as nulls, never the header's", () => {
    const draft = draftWith({
      source: { docType: "SALES_ORDER", docId: "so-1", accYear: "2026-2027", refno: "SO1", date: null },
    });
    const item = build(draft).items?.[0];
    expect(item?.sbiSrcDocId).toBeNull();
    expect(item?.sbiSrcItemId).toBeNull();
  });

  it("zeroes the discount ladders the engine does not model", () => {
    // Adding them is a change to the SHARED engine with a golden case (§3), not
    // a field guessed at here.
    const item = build(draftWith()).items?.[0];
    expect(item?.sbiAddlDisc1Amt).toBe(0);
    expect(item?.sbiAddlDisc2Amt).toBe(0);
    expect(item?.sbiAcessAmt).toBe(0);
  });

  it("keeps the round-off on the DOCUMENT, not per line", () => {
    // A per-line share of it would not add back up.
    expect(build(draftWith()).items?.[0].sbiRoundOff).toBe(0);
  });

  it("sends the keyed dimensions verbatim, with CFT as their unit (§7.4)", () => {
    // `sbi_size` stores what the operator keyed, not what it works out to — a
    // reprint has to show the size the customer was billed for. The CFT itself
    // is the Bill Qty the line is priced on, which the grid writes as the cell
    // is committed. The unit follows from there being a size at all.
    const item = build(draftWith({ lines: [line({ itemSize: "45*2*2*6" })] })).items?.[0];
    expect(item?.sbiSize).toBe("45*2*2*6");
    expect(item?.sbiSizeUom).toBe("CFT");
  });

  it("sends no unit for a line with no size — `ck_sbi_size` rejects a blank", () => {
    for (const itemSize of [null, "", "   "]) {
      const item = build(draftWith({ lines: [line({ itemSize })] })).items?.[0];
      expect(item?.sbiSize).toBeNull();
      expect(item?.sbiSizeUom).toBeNull();
    }
  });

  it("only ever sends a free type the CHECK constraint allows", () => {
    const draft = draftWith({ lines: [line({ isFree: true, freeType: "NONSENSE" })] });
    expect(build(draft).items?.[0].sbiFreeType).toBe("SCHEME");
    const sample = draftWith({ lines: [line({ isFree: true, freeType: "SAMPLE" })] });
    expect(build(sample).items?.[0].sbiFreeType).toBe("SAMPLE");
  });
});

describe("the money", () => {
  it("reports the discounts, which are already netted inside the taxable value", () => {
    // §15/§17: they are REPORTED, not re-applied. The server does not subtract
    // them a second time.
    const draft = draftWith({ lines: [line({ discPerc: 10 })] });
    const pricing = priceOf(draft);
    const payload = build(draft);
    expect(payload.sbItemDisc).toBe(pricing.totals.itemDisc);
    expect(payload.sbTaxableAmt).toBe(pricing.totals.docTaxable);
    expect(payload.sbBillAmt).toBe(pricing.totals.bill);
  });

  it("sends every amount POSITIVE — direction is the server's dr_cr flag", () => {
    const payload = build(draftWith()) as unknown as Record<string, number | undefined>;
    for (const field of ["sbGrossAmt", "sbTaxableAmt", "sbTaxAmt", "sbBillAmt", "sbCashDisc"]) {
      expect(payload[field]).toBeGreaterThanOrEqual(0);
    }
  });

  it("reports a CREDIT tender apart, because it posts no accounting leg", () => {
    const draft = draftWith({
      tenders: [
        {
          key: "t1",
          tdId: null,
          tenderId: "tnd-9",
          tenderTypeId: 9,
          typeCode: "CREDIT",
          tenderName: "Credit",
          tenderLedgerId: null,
          settleLedgerId: null,
          surchargeLedgerId: null,
          surchargePerc: 0,
          surchargeFlat: 0,
          settlementDays: 0,
          minAmount: 0,
          maxAmount: null,
          conversionRate: 1,
          editSurcharge: false,
          allowChange: false,
          needsRef: false,
          hotkey: null,
          keyed: 500,
          settleStatus: "NA",
          refNo: null,
          authCode: null,
          bankName: null,
          cardDigits: null,
          instrumentDate: null,
          notes: null,
          tempCredit: null,
          cheque: null,
          loyaltyPoints: 0,
          loyaltyRate: 0,
        },
      ],
    });
    const payload = build(draft);
    expect(payload.sbCreditAmt).toBe(500);
    expect(payload.sbPayMode).toBe("CREDIT");
    expect(payload.tenders).toHaveLength(1);
  });
});

describe("adjustments — the one array where absent is not empty", () => {
  it("OMITS the key entirely until the panel has been used", () => {
    // A bill loaded for edit knows nothing about what was set off against it
    // (`GET /bills/get` returns no adjustments), so it must send nothing.
    // Sending `[]` would reverse a settlement the screen never saw.
    const payload = build(draftWith()) as Record<string, unknown>;
    expect("adjustments" in payload).toBe(false);
  });

  it("sends an EMPTY array once the panel has been cleared — that is a reversal", () => {
    const payload = build(draftWith({ adjustmentsTouched: true, adjustments: [] }));
    expect(payload.adjustments).toEqual([]);
  });

  it("posts the credit's OWN accounting year, never the bill's", () => {
    // `acc_bill_balance` is partitioned by it and keyed on the pair, so a March
    // advance settling an April invoice needs March here or the reference does
    // not resolve.
    const draft = draftWith({
      adjustmentsTouched: true,
      adjustments: [
        {
          key: "a1",
          amount: 500,
          credit: {
            billId: "abl-1",
            billAccYear: "2025-2026",
            billType: "ADVANCE",
            drCr: "CR",
            docRefno: "SO-2201",
            docDate: "2026-03-30",
            billAmount: 500,
            pendingAmount: 500,
            status: "OPEN",
            srcModule: "SALES",
            srcDocType: "SALES_ORDER",
            srcDocId: "so-1",
            srcAccYear: "2025-2026",
            narration: null,
            adjType: "ADVANCE_ADJUST",
            settlementMode: "ADVANCE",
          },
        },
      ],
    });
    const payload = build(draft);
    expect(payload.sbAccYear).toBe("2026-2027");
    expect(payload.adjustments?.[0].againstBillAccYear).toBe("2025-2026");
    expect(payload.adjustments?.[0].againstBillId).toBe("abl-1");
    // Two figures, never one total (§14.5): advances feed the order's advance
    // ledger, credit notes are their own, and the server refuses a single sum.
    expect(payload.sbAdvanceAmt).toBe(500);
    expect(payload.sbNoteAdjAmt).toBe(0);
  });

  it("puts a credit note under sbNoteAdjAmt, not sbAdvanceAmt", () => {
    const draft = draftWith({
      adjustmentsTouched: true,
      adjustments: [
        {
          key: "adj-1",
          amount: 120,
          credit: {
            billId: "abl-2",
            billAccYear: "2026-2027",
            billType: "SALES_RETURN",
            drCr: "CR",
            docRefno: "SR-7",
            docDate: "2026-09-01",
            billAmount: 120,
            pendingAmount: 120,
            status: "OPEN",
            srcModule: "SALES",
            srcDocType: "SALE_RETURN",
            srcDocId: null,
            srcAccYear: null,
            narration: null,
            adjType: "NOTE_ADJUST",
            settlementMode: "CREDIT_NOTE",
          },
        },
      ],
    });
    const payload = build(draft);
    expect(payload.sbAdvanceAmt).toBe(0);
    expect(payload.sbNoteAdjAmt).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// The whitelist (§4.4, §29): no key outside the server's DTOs, at any level
// ---------------------------------------------------------------------------

describe("every body stays inside the server's whitelist", () => {
  const draft = draftWith({
    docId: "sb-1",
    adjustmentsTouched: true,
    charges: [
      {
        ...createDraftChargeRow(),
        chgId: "chg-1",
        chgName: "Freight",
        ledgerCode: "led-1",
        role: "FREIGHT",
        method: "FIXED",
        type: "ADD",
        applyOn: "FLAT",
        rate: 50,
      },
    ],
  });
  const payload = build(draft);

  it("the save body, its items and its charges", () => {
    expect(keysOutside(payload as Record<string, unknown>, SAVE_BILL_DTO_KEYS)).toEqual([]);
    for (const item of payload.items ?? []) {
      expect(keysOutside(item as Record<string, unknown>, SAVE_BILL_ITEM_DTO_KEYS)).toEqual([]);
    }
    expect(payload.charges?.length).toBe(1);
    for (const row of payload.charges ?? []) {
      expect(keysOutside(row as Record<string, unknown>, SAVE_CHARGE_DETAIL_DTO_KEYS)).toEqual([]);
    }
  });

  it("the validate, post and amend bodies", () => {
    const validate = buildValidateBody(payload, ["SALES_RATE_BELOW_MIN", "SALES_RATE_BELOW_MIN"]);
    expect(keysOutside(validate as Record<string, unknown>, VALIDATE_BILL_DTO_KEYS)).toEqual([]);
    expect(validate.overrides).toEqual(["SALES_RATE_BELOW_MIN"]);

    const key = billKeyOf(draft);
    expect(key).not.toBeNull();
    const post = buildPostBody(key as NonNullable<typeof key>, {
      overrides: [],
      adjustments: adjustmentsForWire(draft),
      printAfter: true,
    });
    expect(keysOutside(post as Record<string, unknown>, POST_BILL_DTO_KEYS)).toEqual([]);
    expect(post).not.toHaveProperty("overrides");
    expect(post.adjustments).toEqual([]);
    for (const row of post.adjustments ?? []) {
      expect(keysOutside(row as Record<string, unknown>, SAVE_BILL_ADJUSTMENT_DTO_KEYS)).toEqual([]);
    }

    const amend = buildAmendBody(payload, {
      sbId: "sb-1",
      baseRevision: 2,
      editRemark: "  quantity of line 2 corrected  ",
      overrides: ["A", "A", "B"],
    });
    expect(keysOutside(amend as Record<string, unknown>, AMEND_BILL_DTO_KEYS)).toEqual([]);
    expect(amend.baseRevision).toBe(2);
    expect(amend.editRemark).toBe("quantity of line 2 corrected");
    expect(amend.overrides).toEqual(["A", "B"]);
  });

  it("omits `adjustments` entirely when the screen never handled them (§14.4)", () => {
    expect(adjustmentsForWire(draftWith({ adjustmentsTouched: false }))).toBeUndefined();
    const post = buildPostBody({ sbId: "sb-1", sbCompanyId: "c", sbBranchId: "b", sbAccYear: "2026-2027" }, {
      adjustments: adjustmentsForWire(draftWith({ adjustmentsTouched: false })),
    });
    expect(post).not.toHaveProperty("adjustments");
  });

  it("never sends a null sbDiscAlterBase", () => {
    expect(typeof payload.sbDiscAlterBase).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

function itemPayload(overrides: Partial<BillItemPayload> = {}): BillItemPayload {
  return {
    sbiId: "sbi-1",
    sbiLineNo: 1,
    sbiSplitNo: 1,
    sbiSrcDocType: null,
    sbiSrcDocId: null,
    sbiSrcDocYear: null,
    sbiSrcDocRefno: null,
    sbiSrcDocLineNo: null,
    sbiSrcItemQty: null,
    sbiSrcFreeQty: null,
    sbiItemId: "i1",
    sbiItemUnitId: "u1",
    sbiToBaseFactor: "12",
    sbiHsnCode: "4407",
    sbiPriceLevel: 1,
    sbiEanCode: null,
    sbiSize: null,
    sbiSizeUom: null,
    sbiGodownId: "g1",
    sbiStockId: null,
    sbiBatchNo: null,
    sbiBatchDate: null,
    sbiExpiryDate: null,
    sbiSerialNo: null,
    sbiIsTaxIncl: false,
    sbiIsPromo: false,
    sbiIsFree: false,
    sbiFreeType: null,
    sbiIsService: false,
    sbiHasFreight: false,
    sbiIsDeleted: false,
    sbiCaseQty: "0",
    sbiBillQty: "4",
    sbiLengthQty: "0",
    sbiNetQty: "4",
    sbiWeightQty: "0",
    sbiAvailableStock: "100",
    sbiReturnQty: "0",
    sbiRate: "250",
    sbiRatePreTax: "250",
    sbiRateDiff: "0",
    sbiActPrice: "250",
    sbiMaxPrice: "320",
    sbiMinPrice: "180",
    sbiCostPrice: "150",
    sbiCostPreTax: "127",
    sbiItemDiscPerc: "0",
    sbiItemDiscQty: "0",
    sbiItemDiscAmt: "0",
    sbiSplDiscPerc: "0",
    sbiSplDiscQty: "0",
    sbiSplDiscAmt: "0",
    sbiSchDiscPerc: "0",
    sbiSchDiscQty: "0",
    sbiSchDiscAmt: "0",
    sbiBillSchPerc: "0",
    sbiBillSchQty: "0",
    sbiBillSchAmt: "0",
    sbiCashDiscPerc: "0",
    sbiCashDiscAmt: "0",
    sbiGrossAmt: "1000",
    sbiNetGross: "1000",
    sbiChrgBeforeTax: "0",
    sbiChrgAfterTax: "0",
    sbiTaxableAmt: "1000",
    sbiTaxPerc: "18",
    sbiTaxAmt: "180",
    sbiCgstPerc: "9",
    sbiCgstAmt: "90",
    sbiSgstPerc: "9",
    sbiSgstAmt: "90",
    sbiIgstPerc: "18",
    sbiIgstAmt: "0",
    sbiCessPerc: "0",
    sbiCessPerUnit: "0",
    sbiCessAmt: "0",
    sbiBatchConfig: 0,
    sbiFreightQty: "0",
    sbiFreightAmt: "0",
    sbiLoadQty: "0",
    sbiLoadAmt: "0",
    sbiUnloadQty: "0",
    sbiUnloadAmt: "0",
    sbiNetAmt: "1180",
    sbiSoldPrice: "295",
    sbiSoldPreTax: "250",
    sbiItemProfit: "145",
    sbiProfitPreTax: "123",
    sbiMrpSavings: "100",
    sbiMrpSavingsPerc: "7",
    sbiSalesmanId: null,
    sbiSchemeId: null,
    sbiSchemeName: null,
    sbiRemarks: null,
    sbiItemName: "TEAK PLANK",
    sbiUnitName: "NOS",
    sbiGodownName: "MAIN",
    ...overrides,
  };
}

function billPayload(overrides: Partial<BillPayload> = {}): BillPayload {
  return {
    sbId: "sb-1",
    sbCompanyId: CONTEXT.companyId,
    sbBranchId: CONTEXT.branchId,
    sbAccYear: "2026-2027",
    sbSessionId: null,
    sbCounterId: null,
    sbDeviceType: "WEB",
    sbDeviceId: "browser-abc",
    sbDocType: "TAX_INVOICE",
    sbBillType: "CASH",
    sbCategoryId: null,
    sbPriceLevel: 1,
    sbBillSlno: "41",
    sbBillRefno: "bil00041",
    sbUsrRefno: null,
    sbBillDate: "2026-09-12",
    sbDueDays: null,
    sbDueDate: null,
    sbSrcDocType: null,
    sbSrcDocId: null,
    sbSrcDocRefno: null,
    sbSrcDocDate: null,
    sbSrcDocYear: null,
    sbCustId: "cust-1",
    sbCustName: "ACME",
    sbCustAddr: null,
    sbCustPlace: null,
    sbCustPin: null,
    sbCustPhone: null,
    sbCustGstin: null,
    sbCustGstType: null,
    sbCustStcd: "33",
    sbPosStcd: "33",
    sbStateName: "Tamil Nadu",
    sbHasLoad: false,
    sbHasUnload: false,
    sbHasFreight: false,
    sbHasPromo: false,
    sbHasComm: false,
    sbHasLoyalty: false,
    sbUserId: ACTOR.userId,
    sbSalesmanId: [],
    sbAgentId: null,
    sbDriverId: null,
    sbLoadmanId: [],
    sbPackedId: [],
    sbSupervisorId: null,
    sbVehicleId: null,
    sbVehicleNo: null,
    sbTotItems: 1,
    sbTotWeight: "0",
    sbTotBags: "4",
    sbGrossAmt: "1000",
    sbItemDisc: "0",
    sbSplDisc: "0",
    sbSchDisc: "0",
    sbBillSchDisc: "0",
    sbAddlDisc1: "0",
    sbAddlDisc2: "0",
    sbCashDisc: "0",
    sbTaxableAmt: "1000",
    sbCgstAmt: "90",
    sbSgstAmt: "90",
    sbIgstAmt: "0",
    sbCessAmt: "0",
    sbTaxAmt: "180",
    sbFreightAmt: "0",
    sbLoadAmt: "0",
    sbUnloadAmt: "0",
    sbOtherAmt1: "0",
    sbOtherAmt2: "0",
    sbRoundOff: "0",
    sbBillAmt: "1180",
    sbTotalCost: "600",
    sbMarginAmt: "580",
    sbMarginAmtWot: "492",
    sbMarginPerc: "49",
    sbMrpSavings: "100",
    sbMrpSavingsPerc: "7",
    sbPayMode: "CASH",
    sbCreditAmt: "0",
    sbSurchargeAmt: "0",
    sbTenderAmt: "1180",
    sbRefundAmt: "0",
    sbAdvanceAmt: "0",
    sbPaidAmt: "1180",
    sbBalanceAmt: "0",
    sbPayStatus: "PAID",
    sbReturnedAmt: "0",
    sbReturnStatus: null,
    sbPaymentTerms: null,
    sbDeliveryTerms: null,
    sbTermsConditions: null,
    sbRemarks: null,
    sbFreightCalcType: "manual",
    sbLoadingCalcType: "manual",
    sbDiscAlterBase: false,
    sbRoundOffStep: "1",
    sbStatus: "POSTED",
    sbCancelledOn: null,
    sbCancelReason: null,
    sbVersionNo: 1,
    sbPrintCount: 0,
    sbIsDeleted: false,
    sbCreatedBy: "counter1",
    sbModifiedBy: null,
    items: [itemPayload()],
    ...overrides,
  };
}

describe("parseLoadedBill", () => {
  const loaded = parseLoadedBill(billPayload(), {
    companyStateCode: "33",
    companyStateName: "Tamil Nadu",
  });

  it("opens read-only, painting the figures it was SAVED with", () => {
    // Nothing is repriced until the operator's first edit. Qt needs `m_loading`
    // for this because it paints cell by cell; here it is a state field, and the
    // draft is built whole and derived once (§16).
    expect(loaded.mode).toBe("browse");
    expect(loaded.pricing).toBe("stored");
    expect(loaded.isDirty).toBe(false);
  });

  it("keeps the bill number as a STRING", () => {
    // `sb_bill_slno` is a bigint, and a non-numeric series has to survive.
    expect(loaded.billSlno).toBe("41");
    expect(loaded.billRefno).toBe("bil00041");
  });

  it("prices under the DOCUMENT's own policy snapshot", () => {
    expect(loaded.policy.freightCalcType).toBe("manual");
    expect(loaded.policy.roundOffStep).toBe(1);
  });

  it("leaves the stock gate UNRESOLVED on every loaded line", () => {
    // `sbiAvailableStock` is the stock as it was when the bill was raised, so a
    // quantity is never judged against it. Qt hard-codes the flag to "Y" here
    // and silently turns the gate OFF for every reopened line (§7.2).
    expect(loaded.lines[0].stockGateResolved).toBe(false);
  });

  it("takes the negative-stock FLAG from the GET, which resolves it live", () => {
    // Not a stored column: the GET answers the same three-way rule
    // `/master-lookups/item-price` answers with, off today's godown, company and
    // item rows. That makes it as current as a re-lookup, so a reopened line
    // that may go negative says so — and passes the gate without one.
    const allowed = parseLoadedBill(
      billPayload({ items: [itemPayload({ sbiAllowNegativeStock: true })] }),
      CONTEXT,
    );
    expect(allowed.lines[0].allowNegative).toBe(true);
    expect(stockGateOf(allowed.lines[0])).toBe("pass");
  });

  it("reads a MISSING flag as a no, not as a licence", () => {
    // `null` means the item join was not made — an absence of an answer. An
    // unresolved line with no flag stays unjudgeable rather than passing.
    for (const value of [null, undefined]) {
      const line = parseLoadedBill(
        billPayload({ items: [itemPayload({ sbiAllowNegativeStock: value })] }),
        CONTEXT,
      ).lines[0];
      expect(line.allowNegative).toBe(false);
      expect(stockGateOf(line)).toBe("unavailable");
    }
  });

  it("recovers the persisted unit factor rather than back-deriving it", () => {
    // Unlike the quotation, `sbi_to_base_factor` IS persisted here.
    expect(loaded.lines[0].toBaseFactor).toBe(12);
    expect(loaded.lines[0].toBaseFactorKnown).toBe(true);
  });

  it("is authoritative on adjustments when nothing was set off (§14.4) — `[]` reverses nothing", () => {
    expect(loaded.adjustments).toEqual([]);
    expect(loaded.adjustmentsTouched).toBe(true);
  });

  it("OMITS adjustments when the bill was settled with credit the server did not return", () => {
    const settledWithCredit = parseLoadedBill(
      { ...billPayload(), sbAdvanceAmt: "300", adjustments: [] },
      { companyStateCode: "33", companyStateName: "Tamil Nadu" },
    );
    expect(settledWithCredit.adjustmentsTouched).toBe(false);
    const payload = buildSavePayload(settledWithCredit, priceOf(settledWithCredit), ACTOR) as Record<string, unknown>;
    expect("adjustments" in payload).toBe(false);
  });

  it("rebuilds a POSTED bill's live set-offs as panel rows, so an amend re-sends them", () => {
    const posted = parseLoadedBill(
      {
        ...billPayload(),
        sbStatus: "POSTED",
        sbAdvanceAmt: "300",
        adjustments: [{ againstBillId: "abl-9", againstBillAccYear: "2025-2026", refno: "ADV-9", amount: 300, adjType: "ADVANCE_ADJUST" }],
      },
      { companyStateCode: "33", companyStateName: "Tamil Nadu" },
    );
    expect(posted.adjustmentsTouched).toBe(true);
    expect(posted.adjustments).toHaveLength(1);
    expect(posted.adjustments[0].amount).toBe(300);
    expect(posted.adjustments[0].credit.billAccYear).toBe("2025-2026");
    // The stored paid figure INCLUDES the set-off; the strip's counter part is what crossed the counter.
    expect(posted.settlement.adjustedAmt).toBe(300);
  });

  it("falls back between the two state columns on a pre-split record", () => {
    // Records written before the customer-state / POS split (§5) carry only one
    // of the two.
    const legacy = parseLoadedBill(billPayload({ sbCustStcd: null, sbPosStcd: "29" }), {
      companyStateCode: "33",
      companyStateName: "Tamil Nadu",
    });
    expect(legacy.customer.stateCode).toBe("29");
    expect(legacy.isLocalSale).toBe(false);
  });

  it("treats a cancelled bill as read-only forever", () => {
    const cancelled = parseLoadedBill(
      billPayload({ sbStatus: "CANCELLED", sbCancelledOn: "2026-09-13T10:00:00Z" }),
      { companyStateCode: "33", companyStateName: "Tamil Nadu" },
    );
    expect(cancelled.isDeleted).toBe(true);
  });

  it("caps a loaded line that came from an order", () => {
    const fromOrder = parseLoadedBill(
      billPayload({
        items: [
          itemPayload({
            sbiSrcDocType: "SALES_ORDER",
            sbiSrcDocId: "soi-1",
            sbiSrcDocYear: "2026-2027",
            sbiSrcItemQty: "10",
          }),
        ],
      }),
      { companyStateCode: "33", companyStateName: "Tamil Nadu" },
    );
    expect(fromOrder.lines[0].orderQtyLocked).toBe(true);
    expect(fromOrder.lines[0].srcDocId).toBe("soi-1");
  });

  it("reads rights, locks, posting and the revision — never computes them (§17.2)", () => {
    const posted = parseLoadedBill(
      billPayload({
        sbStatus: "POSTED",
        sbRevisionNo: 3,
        rights: { post: true, cancel: false, amend: true, override: false, retender: true },
        locks: {
          returns: 1,
          allocations: 0,
          dayClosed: false,
          irnLive: false,
          ewbLive: true,
          irnCancelWindowUntil: null,
          ewbValidUpto: "2026-09-30",
          editable: { document: false, transportBand: false },
        },
        posting: {
          voucherId: "v-1",
          voucherRefno: "SV0001",
          postedOn: "2026-09-25T10:00:00Z",
          registerId: null,
          cogsAmt: 700,
          loyaltyEarned: 0,
          loyaltyRedeemed: 0,
          irn: { status: "NA", number: null, ackNo: null, ackOn: null, message: null },
          ewb: { status: "GENERATED", number: "EWB1", generatedOn: null, validUpto: "2026-09-30", message: null, vehicleNo: "TN01AB1234" },
        },
        sources: [{ kind: "ORDER", docId: "so-1", accYear: "2026-2027", refno: "SO1", date: "2026-09-20T00:00:00.000Z", lines: 2, takenQty: 5, openQtyAfter: 0 }],
        adjustments: [{ againstBillId: "abl-1", againstBillAccYear: "2025-2026", refno: "ADV1", amount: 300, adjType: "ADVANCE_ADJUST" }],
      }),
      { companyStateCode: "33", companyStateName: "Tamil Nadu" },
    );
    expect(posted.revisionNo).toBe(3);
    expect(posted.rights).toEqual({ post: true, cancel: false, amend: true, override: false, retender: true });
    expect(posted.locks?.ewbLive).toBe(true);
    expect(posted.locks?.editable.document).toBe(false);
    expect(posted.posting?.voucherRefno).toBe("SV0001");
    expect(posted.posting?.ewb.vehicleNo).toBe("TN01AB1234");
    expect(posted.sources[0]).toMatchObject({ kind: "ORDER", refno: "SO1", date: "2026-09-20" });
    expect(posted.heldAdjustments[0]).toMatchObject({ refno: "ADV1", amount: 300 });
    expect(posted.amending).toBe(false);
    expect(posted.notes).toEqual([]);
  });

  it("holds no set-offs for a DRAFT, whose adjustments are never stored (§14.4)", () => {
    const draft = parseLoadedBill(
      billPayload({ sbStatus: "DRAFT", adjustments: [{ againstBillId: "x", againstBillAccYear: "y", refno: null, amount: 1, adjType: "" }] }),
      { companyStateCode: "33", companyStateName: "Tamil Nadu" },
    );
    expect(draft.heldAdjustments).toEqual([]);
  });

  it("a save response without the blocks leaves the draft's rights alone", () => {
    const loaded = parseLoadedBill(billPayload(), { companyStateCode: "33", companyStateName: "Tamil Nadu" });
    expect(loaded.rights).toBeNull();
    expect(loaded.locks).toBeNull();
  });
});

describe("applyBillSaveResponse", () => {
  it("takes only the server-owned identities", () => {
    // Re-parsing the response would blank every item name on screen: the save
    // path performs no joins, so `sbiItemName` comes back null.
    const draft = draftWith();
    const merged = applyBillSaveResponse(draft, billPayload(), draft);
    expect(merged.docId).toBe("sb-1");
    expect(merged.billRefno).toBe("bil00041");
    expect(merged.lines[0].sbiId).toBe("sbi-1");
    expect(merged.lines[0].itemName).toBe("TEAK PLANK");
    expect(merged.isDirty).toBe(false);
  });

  it("keeps the draft dirty when the operator edited while the POST was in flight", () => {
    const sent = draftWith();
    const current = { ...sent, lines: [line({ billQty: 9 })] };
    const merged = applyBillSaveResponse(current, billPayload(), sent);
    expect(merged.isDirty).toBe(true);
  });
});
