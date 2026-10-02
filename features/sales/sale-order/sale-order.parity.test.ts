/**
 * The Qt-parity behaviours (plan/sale-order-qt-parity.md): the settings-driven
 * defaults, the quick edits, the duplicate rule, the role gate, the credit
 * gate's `overdue_billing` exemption, and the payload's `soStatus` /
 * `soPayMode` / `soCustPin`.
 */
import { describe, expect, it } from "vitest";
import { recalcDocument } from "@/domain/pricing";
import type { SaveActor } from "@/features/sales/quotation/quotation.payload";
import { createDraftChargeRow } from "@/features/sales/quotation/quotation.state";
import { buildSavePayload, dominantTenderType } from "./sale-order.payload";
import {
  applyDiscountPercToLines,
  copyOrderDraftAsNew,
  createOrderDraft,
  createOrderDraftLine,
  deliveryDefaultsToKeep,
  emptyOrderHeader,
  findDuplicateLine,
  scaleLineRates,
} from "./sale-order.state";
import type { PartyCreditSummary, SaleOrderDraft, TenderDraftRow } from "./sale-order.types";
import { chargeRoleGate, creditGate, validateSaveInputs } from "./sale-order.validate";

const ACTOR: SaveActor = {
  userId: "user-1",
  userName: "Test User",
  sessionId: "session-1",
  deviceId: "device-1",
  deviceType: "WEB",
};

function baseDraft(): SaleOrderDraft {
  const draft = createOrderDraft({
    companyId: "company-1",
    branchId: "branch-1",
    accYear: "2026-2027",
    companyStateCode: "33",
  });
  draft.customer = { ...draft.customer, custId: "cust-1", name: "ACME TRADERS", pin: "600001" };
  draft.header = {
    ...draft.header,
    orderDate: "2026-08-11",
    deliveryDate: "2026-08-11",
    validUntil: "2026-09-10",
  };
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

const CREDIT_EXCEEDED: PartyCreditSummary = {
  partyId: "cust-1",
  partyName: "ACME TRADERS",
  accYear: "2026-2027",
  asOnDate: "2026-08-11",
  pendingAmount: 50000,
  pendingBillCount: 3,
  overdueAmount: 0,
  overdueBillCount: 0,
  oldestOverdueDueDate: null,
  maxOverdueDays: 0,
  creditAmtLimit: 20000,
  creditBillLimit: 5,
  availableCreditAmount: 0,
  availableBillCount: 2,
  isAmtLimitExceeded: true,
  isBillLimitExceeded: false,
  isCreditCheckEnabled: true,
};

describe("header defaults from the settings", () => {
  it("seeds the delivery date with the order date and the rest from the defaults", () => {
    const header = emptyOrderHeader("2026-08-11", {
      priceLevel: 3,
      deliveryMode: "HOME_DELIVERY",
      validityDays: 7,
      posStateCode: "24",
      salesmanId: "emp-1",
      salesmanName: "RAJA",
    });
    expect(header.deliveryDate).toBe("2026-08-11");
    expect(header.validUntil).toBe("2026-08-18");
    expect(header.priceLevel).toBe(3);
    expect(header.deliveryMode).toBe("HOME_DELIVERY");
    expect(header.posStateCode).toBe("24");
    expect(header.posStateName).toBe("");
    expect(header.salesmanId).toBe("emp-1");
    expect(header.salesmanName).toBe("RAJA");
  });

  it("keeps the constants when nothing is stated, and Tamil Nadu's name for 33", () => {
    const header = emptyOrderHeader("2026-08-11");
    expect(header.validUntil).toBe("2026-09-10");
    expect(header.priceLevel).toBe(1);
    expect(header.deliveryMode).toBe("STORE_PICKUP");
    expect(header.posStateCode).toBe("33");
    expect(header.posStateName).toBe("Tamil Nadu");
  });

  it("starts a draft on the company's state, so a fresh order is a local sale", () => {
    const draft = createOrderDraft({
      companyId: "c",
      branchId: "b",
      accYear: "2026-2027",
      companyStateCode: "24",
    });
    expect(draft.header.posStateCode).toBe("24");
    expect(draft.isLocalSale).toBe(true);
    expect(draft.audit).toBeNull();
  });

  it("keeps the salesman and packer across a Clear unless the setting says otherwise", () => {
    const header = emptyOrderHeader("2026-08-11", {
      salesmanId: "emp-1",
      salesmanName: "RAJA",
      packedId: "emp-2",
      packedName: "MANI",
    });
    expect(deliveryDefaultsToKeep(header, false)).toEqual({
      salesmanId: "emp-1",
      salesmanName: "RAJA",
      packedId: "emp-2",
      packedName: "MANI",
    });
    expect(deliveryDefaultsToKeep(header, true)).toEqual({});
  });

  it("copy-as-new takes the configured validity", () => {
    const copied = copyOrderDraftAsNew({ ...baseDraft(), docId: "so-1" }, "2026-08-20", 7);
    expect(copied.header.validUntil).toBe("2026-08-27");
    expect(copied.audit).toBeNull();
  });
});

describe("the quick edits", () => {
  const lines = [
    createOrderDraftLine({ itemId: "a", rate: 100, discPerQty: 5, discAmt: 3 }),
    createOrderDraftLine({ itemId: "b", rate: 50, isFree: true }),
    createOrderDraftLine({ itemId: "", rate: 0 }),
  ];

  it("Alt+D puts one discount percent on every priced, non-free line and clears its alternates", () => {
    const next = applyDiscountPercToLines(lines, 12.5);
    expect(next[0]).toMatchObject({ discPerc: 12.5, discPerQty: 0, discAmt: 0 });
    expect(next[1].discPerc).toBe(0);
    expect(next[2].discPerc).toBe(0);
    expect(applyDiscountPercToLines(lines, 150)[0].discPerc).toBe(100);
  });

  it("± Price scales every priced, non-free rate", () => {
    const next = scaleLineRates(lines, 10);
    expect(next[0].rate).toBe(110);
    expect(next[1].rate).toBe(50);
    expect(scaleLineRates(lines, -25)[0].rate).toBe(75);
  });

  it("finds the row a repeated item already sits on, skipping free rows", () => {
    expect(findDuplicateLine(lines, "a", "other")?.rowNo).toBe(1);
    expect(findDuplicateLine(lines, "b", "other")).toBeNull();
    expect(findDuplicateLine(lines, "a", lines[0].key)).toBeNull();
  });
});

describe("the role gate", () => {
  function freightDraft(): SaleOrderDraft {
    const draft = baseDraft();
    draft.header = { ...draft.header, hasFreight: true };
    draft.policy = { ...draft.policy, freightCalcType: "ITEM_BASIS" };
    draft.lines = [
      createOrderDraftLine({
        itemId: "item-1",
        itemUnitId: "iuc-1",
        itemName: "Widget",
        billQty: 2,
        rate: 100,
        hasFreight: true,
        freightPerQty: 10,
      }),
    ];
    return draft;
  }

  it("refuses freight worked out on the items with no FREIGHT charge row", () => {
    const draft = freightDraft();
    const violation = chargeRoleGate(draft, pricingOf(draft));
    expect(violation?.message).toMatch(/^Freight of 20 is calculated on the items/);
    expect(validateSaveInputs(draft, pricingOf(draft))?.field).toBe("charges");
  });

  it("passes once a FREIGHT row carries it, when the box is off, or when freight is manual", () => {
    const withRow = freightDraft();
    withRow.charges = [
      createDraftChargeRow({
        chgId: "chg-f",
        chgName: "Freight",
        ledgerCode: "L-FR",
        role: "FREIGHT",
      }),
    ];
    expect(chargeRoleGate(withRow, pricingOf(withRow))).toBeNull();

    const boxOff = freightDraft();
    boxOff.header = { ...boxOff.header, hasFreight: false };
    expect(chargeRoleGate(boxOff, pricingOf(boxOff))).toBeNull();

    const manual = freightDraft();
    manual.policy = { ...manual.policy, freightCalcType: "MANUAL" };
    expect(chargeRoleGate(manual, pricingOf(manual))).toBeNull();
  });
});

describe("validation switches from the settings", () => {
  it("sales.free_item_tax lets a zero rate through on a line that is not marked free", () => {
    const draft = baseDraft();
    draft.lines[0] = { ...draft.lines[0], rate: 0, billQty: 1 };
    expect(validateSaveInputs(draft, pricingOf(draft))?.message).toMatch(/has no rate/);
    // The total is still zero, so the next gate speaks — but not the rate one.
    expect(validateSaveInputs(draft, pricingOf(draft), { freeItemTax: true })?.message).not.toMatch(
      /has no rate/,
    );
  });

  it("the credit gate never asks for a customer the master lets bill while overdue", () => {
    const draft = baseDraft();
    draft.partyCredit = CREDIT_EXCEEDED;
    expect(creditGate(draft)?.confirm).toBe(true);
    draft.customer = { ...draft.customer, overdueBilling: true };
    expect(creditGate(draft)).toBeNull();
  });
});

describe("payload: status, pay mode, pin", () => {
  it("writes a NEW order with the auto-post status and leaves a loaded status alone", () => {
    const fresh = baseDraft();
    expect(buildSavePayload(fresh, pricingOf(fresh), ACTOR, { newOrderStatus: "CONFIRMED" }).soStatus).toBe(
      "CONFIRMED",
    );
    expect(buildSavePayload(fresh, pricingOf(fresh), ACTOR).soStatus).toBe("DRAFT");
    const loaded = { ...baseDraft(), docId: "so-1", status: "PARTIAL" };
    expect(buildSavePayload(loaded, pricingOf(loaded), ACTOR, { newOrderStatus: "CONFIRMED" }).soStatus).toBe(
      "PARTIAL",
    );
  });

  it("names the largest tender's type as the pay mode, and sends the customer's pin", () => {
    const draft = baseDraft();
    draft.tenders = [
      tenderRow({ key: "t-1", keyed: 200 }),
      tenderRow({ key: "t-2", tenderId: "tnd-card", typeCode: "CARD", tenderTypeId: 2, keyed: 500 }),
    ];
    const payload = buildSavePayload(draft, pricingOf(draft), ACTOR);
    expect(payload.soPayMode).toBe("CARD");
    expect(payload.soCustPin).toBe("600001");
    expect(dominantTenderType([])).toBeNull();
  });
});
