import { describe, expect, it } from "vitest";
import type { TenderContext } from "../api/bills";
import { createBillDraft } from "../state/factories";
import type { BillTenderRow } from "../types";
import {
  buildRetenderBody,
  liveTenderRows,
  replacementTenderAllowed,
  retenderBlocker,
  retenderFigures,
  retenderRefusal,
  tenderRowNote,
} from "./retender-payload";

const context: TenderContext = {
  sbBillRefno: "bil00042",
  sbBillDate: "2026-09-25",
  sbCustName: "ACME",
  sbBillAmt: 1000,
  sbPaidAmt: 1000,
  sbBalanceAmt: 0,
  sbStatus: "POSTED",
  canRetender: true,
  reason: null,
  tenders: [
    { tdId: "t1", tenderName: "UPI", tdTenderId: "m-upi", tdTenderTypeId: 3, tdAmount: 600, tdIsPdc: false, pdcMoved: false, isLoyalty: false, isTempCredit: false, isVoided: false, replacesId: null },
    { tdId: "t2", tenderName: "Cash", tdTenderId: "m-cash", tdTenderTypeId: 1, tdAmount: 400, tdIsPdc: false, pdcMoved: false, isLoyalty: false, isTempCredit: false, isVoided: false, replacesId: null },
    { tdId: "t0", tenderName: "Card", tdTenderId: "m-card", tdTenderTypeId: 2, tdAmount: 100, tdIsPdc: false, pdcMoved: false, isLoyalty: false, isTempCredit: false, isVoided: true, replacesId: null },
  ],
};

function cashRow(keyed: number): BillTenderRow {
  return {
    key: "r-cash",
    tdId: null,
    tenderId: "m-cash",
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
    keyed,
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
  };
}

const actor = { userId: "u1", userName: "vk", sessionId: "s1", deviceId: "d-local", deviceMasterId: "d-reg", deviceType: "WEB" };

describe("re-tender (§22)", () => {
  it("skips voided rows in the 'as it was tendered' table", () => {
    expect(liveTenderRows(context).map((row) => row.tdId)).toEqual(["t1", "t2"]);
  });

  it("names the refusal: day closed gets the day-book wording", () => {
    expect(retenderRefusal(context)).toBeNull();
    expect(retenderRefusal({ ...context, canRetender: false, reason: "day closed" })).toMatch(/day-book correction/);
    expect(retenderRefusal({ ...context, canRetender: false, reason: "bill cancelled" })).toMatch(/bill cancelled/);
  });

  it("row notes: pdcMoved is red, loyalty / temp credit / PDC are grey", () => {
    expect(tenderRowNote({ ...context.tenders[0], pdcMoved: true })?.tone).toBe("red");
    expect(tenderRowNote({ ...context.tenders[0], isLoyalty: true })?.text).toMatch(/points/);
    expect(tenderRowNote({ ...context.tenders[0], isTempCredit: true })?.text).toMatch(/temp-credit/);
    expect(tenderRowNote({ ...context.tenders[0], tdIsPdc: true })?.text).toMatch(/post-dated/);
    expect(tenderRowNote(context.tenders[0])).toBeNull();
  });

  it("'what really happened' excludes ADJUST, LOYALTY, CREDIT and TEMP_CR", () => {
    expect(replacementTenderAllowed("CASH", 1)).toBe(true);
    expect(replacementTenderAllowed("RRN", 7)).toBe(false);
    expect(replacementTenderAllowed("TEMP_CR", 8)).toBe(false);
    expect(replacementTenderAllowed("CREDIT", 9)).toBe(false);
    expect(replacementTenderAllowed("LOYALTY", 10)).toBe(false);
  });

  it("the footer matches voided against new", () => {
    const voids = [{ tdId: "t1", reason: "UPI_FAILED" as const }];
    expect(retenderFigures(context, voids, [cashRow(600)])).toEqual({ voided: 600, replaced: 600, matched: true });
    expect(retenderFigures(context, voids, [cashRow(500)]).matched).toBe(false);
  });

  it("OK needs a tick, matching figures, a remark and canRetender", () => {
    const voids = [{ tdId: "t1", reason: "UPI_FAILED" as const }];
    expect(retenderBlocker(context, [], [cashRow(600)], "x")).toMatch(/Tick at least one/);
    expect(retenderBlocker(context, voids, [cashRow(500)], "x")).toMatch(/must equal/);
    expect(retenderBlocker(context, voids, [cashRow(600)], "  ")).toMatch(/remark/);
    expect(retenderBlocker({ ...context, canRetender: false, reason: "day closed" }, voids, [cashRow(600)], "x")).toMatch(/day is closed/);
    expect(retenderBlocker(context, voids, [cashRow(600)], "UPI failed at counter")).toBeNull();
  });

  it("numbers new rows after ALL existing rows, voided included, and sends the OTHER reason", () => {
    const draft = createBillDraft({ companyId: "c", branchId: "b", accYear: "2026-2027", companyStateCode: "33", billDate: "2026-09-25" });
    const body = buildRetenderBody(
      { sbId: "sb", sbCompanyId: "c", sbBranchId: "b", sbAccYear: "2026-2027" },
      context,
      [{ tdId: "t1", reason: "OTHER" }],
      [cashRow(600)],
      "  paid cash instead  ",
      draft,
      actor,
    );
    expect(body.voids).toEqual([{ tdId: "t1", reason: "OTHER" }]);
    expect(body.remark).toBe("paid cash instead");
    expect(body.tenders).toHaveLength(1);
    const row = body.tenders[0] as Record<string, unknown>;
    // three rows exist (one voided) → the replacement is row 4
    expect(row.tdRowNo).toBe(4);
    expect(row.tdAmount).toBe(600);
    expect(row.tdTotalAmt).toBe(600);
    expect(row.tdDeviceId).toBe("d-reg");
    expect(row.tdUserId).toBe("u1");
    expect(row.tdIsPdc).toBe(false);
    expect(row.tdId).toBeUndefined();
    expect(row.tdCreatedBy).toBeTruthy();
    expect(row.tdModifiedBy).toBeUndefined();
  });
});
