import { describe, expect, it } from "vitest";
import { recalcDocument } from "@/domain/pricing";
import { buildDcPayload, dcDateTime, dcTotalWeight, draftFromPayload, loadedLocalSale } from "./dc.payload";
import { createDcDraft, createDcLine, withTrailingBlank } from "./dc.state";
import type { DcDraft } from "./dc.types";
import { validateDc } from "./dc.validate";

const actor = {
  userId: "user-1",
  userName: "VKPOS",
  sessionId: null,
  deviceId: "browser-1",
  deviceMasterId: "dev-1",
  deviceType: "Web",
};

function priced(draft: DcDraft) {
  return recalcDocument(
    draft.lines.map((line) => (line.isFree ? { ...line, rate: 0 } : line)),
    [],
    draft.policy,
    { isLocalSale: draft.isLocalSale, hasFreight: false, hasLoad: false, hasUnload: false },
  );
}

function sampleDraft(): DcDraft {
  const base = createDcDraft({ companyId: "co", branchId: "br", accYear: "2026-2027", dcDate: "2026-10-31", companyStateCode: "33" });
  return {
    ...base,
    customer: { ...base.customer, custId: "cust-1", name: "ZT-CUST-CASH", masterName: "ZT-CUST-CASH", gstin: "33abcde1234f1z5" },
    header: { ...base.header, salesmanId: "emp-1", loadmanId: null, vehicleNo: "tn 38 ab 1234" },
    lines: withTrailingBlank([
      createDcLine({
        itemId: "item-1",
        itemUnitId: "iuc-1",
        godownId: "gd-1",
        billQty: 2,
        rate: 100,
        discPerc: 5,
        gstPerc: 18,
        cgstPerc: 9,
        sgstPerc: 9,
        igstPerc: 18,
        costPrice: 60,
        weight: 0.5,
        mrp: 0,
      }),
    ]),
  };
}

describe("the /create body (Qt buildSavePayload)", () => {
  it("prices like the order without charges and names only DTO keys", () => {
    const draft = sampleDraft();
    const body = buildDcPayload(draft, priced(draft), actor, new Date(2026, 9, 31, 16, 5, 9));
    expect(body).toMatchObject({
      sdcCompanyId: "co",
      sdcBranchId: "br",
      sdcAccYear: "2026-2027",
      sdcDeviceId: "dev-1",
      sdcCounterId: "dev-1",
      sdcUserId: "user-1",
      sdcDocType: "DELIVERY_CHALLAN",
      sdcPurpose: "SUPPLY",
      sdcDcDate: "2026-10-31",
      sdcDcDatetime: "2026-10-31T16:05:09",
      sdcCustGstin: "33ABCDE1234F1Z5",
      sdcSalesmanId: ["emp-1"],
      sdcLoadmanId: [],
      sdcPackedId: [],
      sdcVehicleNo: "TN 38 AB 1234",
      sdcTotItems: 1,
      sdcTotBags: 2,
      sdcTotWeight: 1,
      sdcGrossAmt: 200,
      sdcItemDisc: 10,
      sdcDiscAmt: 10,
      sdcTaxableAmt: 190,
      sdcCgstAmt: 17.1,
      sdcSgstAmt: 17.1,
      sdcIgstAmt: 0,
      sdcTaxAmt: 34.2,
      // Floor-to-step on the line total (the default step is 1): 224.20 → 224.
      sdcDcAmt: 224,
      sdcRoundOff: -0.2,
      sdcTotalCost: 120,
      sdcCreatedBy: "VKPOS",
      charges: [],
    });
    expect(body).not.toHaveProperty("sdcId");
    expect(body).not.toHaveProperty("transport");
    expect(body).not.toHaveProperty("sdcStatus");
    const items = body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      sdiLineNo: 1,
      sdiItemId: "item-1",
      sdiItemUnitId: "iuc-1",
      sdiGodownId: "gd-1",
      sdiBucket: "SALEABLE",
      sdiDcQty: 2,
      sdiNetQty: 2,
      sdiRate: 100,
      sdiMaxPrice: null,
      sdiDiscAmt: 10,
      sdiTaxableAmt: 190,
      sdiTaxAmt: 34.2,
      sdiNetAmt: 224.2,
      sdiSrcDocType: null,
      sdiSrcItemId: null,
      sdiCreatedBy: "VKPOS",
    });
    expect(items[0]).not.toHaveProperty("sdiBilledQty");
    expect(items[0]).not.toHaveProperty("sdiLineStatus");
  });

  it("sends the weight to the column's three places, and the discount and tax as Decimal sums", () => {
    const base = sampleDraft();
    const draft: DcDraft = {
      ...base,
      lines: withTrailingBlank([
        // 0.3333 × 3 = 0.9999 and 0.1235 × 1 = 0.1235: 1.1234 → 1.123 (a 2-place figure would say 1.12).
        createDcLine({ itemId: "a", itemUnitId: "u", billQty: 3, rate: 10.1, discPerc: 3.3, gstPerc: 18, cgstPerc: 9, sgstPerc: 9, igstPerc: 18, weight: 0.3333 }),
        createDcLine({ itemId: "b", itemUnitId: "u", billQty: 1, rate: 20.2, discPerc: 7.7, gstPerc: 5, cgstPerc: 2.5, sgstPerc: 2.5, igstPerc: 5, cessPerc: 1, weight: 0.1235 }),
      ]),
    };
    const pricing = priced(draft);
    const body = buildDcPayload(draft, pricing, actor);
    expect(body.sdcTotWeight).toBe(1.123);
    expect(dcTotalWeight(draft.lines)).toBe(1.123);
    const t = pricing.totals;
    expect(body.sdcTaxAmt).toBe(t.lineTax);
    const cents = (n: number) => Math.round(n * 100);
    expect(cents(body.sdcDiscAmt as number)).toBe(cents(t.itemDisc) + cents(t.splDisc) + cents(t.schDisc));
    expect(cents(body.sdcTaxAmt as number)).toBe(cents(t.lineCgst) + cents(t.lineSgst) + cents(t.lineIgst) + cents(t.lineCess));
    // Exactly two places — never a float tail like 2.0300000000000002.
    expect(String(body.sdcDiscAmt)).toMatch(/^\d+(\.\d{1,2})?$/);
    expect(String(body.sdcTaxAmt)).toMatch(/^\d+(\.\d{1,2})?$/);
  });

  it("weighs only the lines that name an item", () => {
    expect(dcTotalWeight([{ itemId: "", weight: 5, billQty: 5 }, { itemId: "x", weight: 0.0005, billQty: 1 }])).toBe(0.001);
    expect(dcTotalWeight([])).toBe(0);
  });

  it("an order line carries its trail; a saved challan carries its id and modified-by", () => {
    const base = sampleDraft();
    const draft: DcDraft = {
      ...base,
      docId: "dc-1",
      sourceRefnos: { "so-1": "SO-7" },
      source: { docType: "SALES_ORDER", docId: "so-1", accYear: "2026-2027", refno: "SO-7", date: "2026-10-01" },
      lines: base.lines.map((line) =>
        line.itemId ? { ...line, sdiId: "sdi-1", srcDocId: "so-1", srcLineId: "soi-1", srcDocYear: "2026-2027", orderQty: 5 } : line,
      ),
    };
    const body = buildDcPayload(draft, priced(draft), actor);
    expect(body).toMatchObject({ sdcId: "dc-1", sdcSrcDocId: "so-1", sdcSrcDocRefno: "SO-7", sdcSrcDocDate: "2026-10-01", sdcModifiedBy: "VKPOS" });
    const item = (body.items as Array<Record<string, unknown>>)[0];
    expect(item).toMatchObject({
      sdiId: "sdi-1",
      sdiSrcDocType: "SALES_ORDER",
      sdiSrcDocId: "so-1",
      sdiSrcDocRefno: "SO-7",
      sdiSrcItemId: "soi-1",
      sdiModifiedBy: "VKPOS",
    });
  });

  it("dcDateTime is the challan date with the clock time, no zone", () => {
    expect(dcDateTime("2026-01-02", new Date(2026, 0, 5, 9, 3, 7))).toBe("2026-01-02T09:03:07");
  });
});

describe("a /get answer → the draft (Qt applyLoaded*)", () => {
  // The shape :3011 answered on 2026-10-31 for a ZT draft (trimmed).
  const answer = {
    sdcId: "dc-1",
    sdcCompanyId: "co",
    sdcBranchId: "br",
    sdcAccYear: "2026-2027",
    sdcStatus: "DRAFT",
    sdcDcRefno: "dc00001",
    sdcRevisionNo: 1,
    sdcFulfilStatus: "OPEN",
    sdcDcDate: "2026-10-31T00:00:00.000Z",
    sdcPurpose: "JOB_WORK",
    sdcCustId: "cust-1",
    sdcCustName: "ZT-CUST-CASH",
    sdcPosStcd: "33",
    sdcStateName: "Tamil Nadu",
    sdcSalesmanId: ["emp-1"],
    sdcLoadmanId: [],
    sdcCgstAmt: 17.1,
    sdcSgstAmt: 17.1,
    sdcIgstAmt: 0,
    sdcTaxableAmt: 190,
    sdcTaxAmt: 34.2,
    sdcDcAmt: 224.2,
    sdcTotItems: 1,
    sdcTotBags: 2,
    sdcCreatedBy: "VKPOS",
    sdcCreatedOn: "2026-10-31T10:56:31.152Z",
    transport: null,
    posting: { cogsAmt: 0, ewb: { status: "NA" } },
    locks: { ewbLive: false, editable: { document: true, transportBand: true, purpose: false } },
    rights: { post: false, cancel: false, amend: false, override: false },
    items: [
      { sdiId: "sdi-1", sdiItemId: "item-1", sdiItemUnitId: "iuc-1", sdiDcQty: 2, sdiNetQty: 2, sdiRate: 100, sdiItemDiscPerc: 5, sdiTaxPerc: 18, sdiCgstPerc: 9, sdiSgstPerc: 9, sdiIgstPerc: 18, sdiOpenQty: 2, sdiBilledQty: 0, sdiLineStatus: "OPEN", sdiBucket: "SALEABLE", sdiItemName: null, sdiIsDeleted: false },
      { sdiId: "sdi-x", sdiItemId: "item-2", sdiIsDeleted: true },
    ],
  };
  const context = {
    companyStateCode: "33",
    policy: { freightCalcType: "manual", loadingCalcType: "manual", discountAlterBaseRate: false, roundOffStep: 0 },
    openForEdit: true,
  };

  it("keeps the stored figures, the literal date and the purpose label", () => {
    const draft = draftFromPayload(answer, context);
    expect(draft).toMatchObject({ docId: "dc-1", status: "DRAFT", refno: "dc00001", mode: "entry", isLocalSale: true });
    expect(draft.header).toMatchObject({ dcDate: "2026-10-31", purpose: "JOB_WORK", purposeLabel: "Job work", salesmanId: "emp-1", loadmanId: null });
    expect(draft.storedTotals).toEqual({ totItems: 1, totQty: 2, totWeight: 0, taxable: 190, tax: 34.2, total: 224.2 });
    expect(draft.lines).toHaveLength(2);
    expect(draft.lines[0]).toMatchObject({ sdiId: "sdi-1", billQty: 2, discPerc: 5, openQty: 2, lineStatus: "OPEN", itemName: "" });
    expect(draft.lines[1].itemId).toBe("");
  });

  it("re-prices to the stored figures", () => {
    const draft = draftFromPayload(answer, context);
    const t = priced(draft).totals;
    expect([t.lineTaxable, t.lineCgst + t.lineSgst, t.bill]).toEqual([190, 34.2, 224.2]);
  });

  it("opens read-only when not asked to edit, or when the server says the document is locked", () => {
    expect(draftFromPayload(answer, { ...context, openForEdit: false }).mode).toBe("browse");
    const locked = { ...answer, locks: { editable: { document: false } } };
    expect(draftFromPayload(locked, context).mode).toBe("browse");
  });

  it("derives intra/inter from the stored tax, else the place of supply", () => {
    expect(loadedLocalSale({ sdcCgstAmt: 0, sdcSgstAmt: 0, sdcIgstAmt: 5 }, "33")).toBe(false);
    expect(loadedLocalSale({ sdcPosStcd: "29" }, "33")).toBe(false);
    expect(loadedLocalSale({ sdcPosStcd: "33" }, "33")).toBe(true);
  });
});

describe("the client's gates (Qt validateSaveInputs)", () => {
  const options = { salesmanMandatory: false, dcRequiresOrder: false, freeItemTax: false };

  it("asks for the customer, a date, a purpose, a salesman when mandatory", () => {
    const draft = sampleDraft();
    expect(validateDc({ ...draft, customer: { ...draft.customer, custId: null } }, options)?.message).toBe("Select a customer.");
    expect(validateDc({ ...draft, header: { ...draft.header, dcDate: "" } }, options)?.message).toBe("Enter a valid challan date.");
    expect(validateDc({ ...draft, header: { ...draft.header, purpose: "" } }, options)?.message).toBe("Pick the purpose of this challan.");
    expect(validateDc({ ...draft, header: { ...draft.header, salesmanId: null } }, { ...options, salesmanMandatory: true })?.message).toBe("Select a salesman.");
    expect(validateDc(draft, options)).toBeNull();
  });

  it("refuses a date outside the accounting year, in dd/MM/yyyy", () => {
    const draft = sampleDraft();
    const error = validateDc(draft, { ...options, yearStart: "2025-04-01", yearEnd: "2026-03-31" });
    expect(error?.message).toBe("Challan date 31/10/2026 is outside the accounting year (01/04/2025 – 31/03/2026).");
  });

  it("checks every line: quantity, the order cap, dc_requires_order, a zero rate", () => {
    const draft = sampleDraft();
    const withLine = (patch: Record<string, unknown>) => ({
      ...draft,
      lines: draft.lines.map((line) => (line.itemId ? { ...line, ...patch } : line)),
    });
    expect(validateDc(withLine({ billQty: 0 }), options)?.message).toBe("Quantity cannot be zero.");
    expect(validateDc(withLine({ orderQty: 1 }), options)?.message).toBe("Line 1 exceeds the order's open quantity (1).");
    expect(validateDc(draft, { ...options, dcRequiresOrder: true })?.message).toMatch(/against an ORDER only/);
    expect(validateDc(withLine({ rate: 0 }), options)?.message).toBe("Rate cannot be zero.");
    expect(validateDc(withLine({ rate: 0 }), { ...options, freeItemTax: true })).toBeNull();
    expect(validateDc({ ...draft, lines: [createDcLine()] }, options)?.message).toBe("Add at least one item.");
  });
});
