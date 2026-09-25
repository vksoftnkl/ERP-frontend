/**
 * Sale Bill Entry — importing a quotation or an order (§13).
 *
 * These are the cases §19 names, and every one of them is a way to bill goods
 * twice or to bill the wrong quantity. The module is pure, so they run without a
 * server — which is the whole reason the translating was kept apart from the
 * fetching.
 */
import { describe, expect, it } from "vitest";
import type {
  QuotationListRow,
  QuotationPayload,
} from "@/features/sales/quotation/quotation.types";
import type {
  SaleOrderItemPayload,
  SaleOrderPayload,
} from "@/features/sales/sale-order/sale-order.types";
import {
  creditsRaisedBy,
  importOrder,
  importQuotation,
  orderImportRefusal,
  quotationImportRefusal,
  sizeCrossesOn,
} from "@/features/sales/testbill/domain/import";
import { createBillDraft } from "@/features/sales/testbill/state/factories";
import { stockGateOf } from "@/features/sales/testbill/domain/validate";
import type { AdjustableCredit } from "@/features/sales/testbill/types";

const CONTEXT = {
  companyId: "c1",
  branchId: "b1",
  accYear: "2026-2027",
  companyStateCode: "33",
  companyStateName: "Tamil Nadu",
  billDate: "2026-09-12",
};

// ---------------------------------------------------------------------------
// The already-billed guard — the fix §13 asks for
// ---------------------------------------------------------------------------

function listRow(overrides: Partial<QuotationListRow> = {}): QuotationListRow {
  return {
    sq_id: "q1",
    sq_company_id: "c1",
    sq_branch_id: "b1",
    sq_acc_year: "2026-2027",
    sq_quote_date: "2026-09-01",
    sq_quote_refno: "QT0007",
    sq_usr_refno: null,
    sq_cust_name: "ACME",
    sq_cust_place: null,
    sq_cust_gstin: null,
    sq_cust_phone: null,
    sq_valid_until: null,
    sq_tot_items: 2,
    sq_tot_bags: "3",
    sq_quote_amt: "11800",
    sq_status: "SENT",
    sq_created_by: "op",
    sq_is_deleted: false,
    sq_converted_doc_id: null,
    sq_cancelled_on: null,
    ...overrides,
  };
}

describe("quotationImportRefusal — an already-billed quotation is REFUSED", () => {
  it("lets a live quotation through", () => {
    expect(quotationImportRefusal(listRow())).toBeNull();
  });

  it("refuses one that has already been converted", () => {
    // The Qt picker has no such check and no status filter, so the same
    // quotation can be billed twice — selling the same goods twice, to the same
    // customer, on two invoices. This is the behaviour §13 says to FIX rather
    // than carry over, and this test is the fix.
    const refusal = quotationImportRefusal(listRow({ sq_converted_doc_id: "sb-9" }));
    expect(refusal).not.toBeNull();
    expect(refusal?.reason).toContain("already been converted");
  });

  it("refuses a cancelled one", () => {
    expect(quotationImportRefusal(listRow({ sq_cancelled_on: "2026-09-05" }))).not.toBeNull();
  });

  it("refuses a deleted one, whether the flag is a boolean or the string", () => {
    // The configured grid projects `sq_is_deleted` as whatever the SQL returns.
    expect(quotationImportRefusal(listRow({ sq_is_deleted: true }))).not.toBeNull();
    expect(quotationImportRefusal(listRow({ sq_is_deleted: "true" }))).not.toBeNull();
  });

  it("refuses one whose status says the promise is closed", () => {
    for (const status of ["CONVERTED", "CANCELLED", "EXPIRED"]) {
      expect(quotationImportRefusal(listRow({ sq_status: status }))).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// The order import
// ---------------------------------------------------------------------------

function orderItem(overrides: Partial<SaleOrderItemPayload> = {}): SaleOrderItemPayload {
  return {
    soiId: "soi-1",
    soiLineNo: 1,
    soiItemId: "i1",
    soiItemUnitId: "u1",
    soiPriceLevel: 1,
    soiSrcDocType: null,
    soiSrcDocId: null,
    soiSrcDocAccYear: null,
    soiSrcDocRefno: null,
    soiSrcLineNo: null,
    soiToBaseFactor: "1",
    soiHsnCode: "4407",
    soiEanCode: null,
    soiSize: "12*6*2*10",
    soiSizeUom: "CFT",
    soiGodownId: "g1",
    soiIsTaxIncl: false,
    soiIsPromo: false,
    soiIsFree: false,
    soiFreeType: null,
    soiIsService: false,
    soiHasFreight: false,
    soiIsDeleted: false,
    soiOrderQty: "10",
    soiDeliveredQty: "0",
    soiCancelledQty: "0",
    soiPendingQty: "10",
    soiLengthQty: "0",
    soiNetQty: "10",
    soiWeightQty: "34",
    soiRate: "250",
    soiActPrice: "260",
    soiMaxPrice: "320",
    soiMinPrice: "180",
    soiCostPrice: "150",
    soiCostPreTax: "127.12",
    soiItemDiscPerc: "0",
    soiItemDiscQty: "0",
    soiSplDiscPerc: "0",
    soiSplDiscQty: "0",
    soiSchDiscPerc: "0",
    soiSchDiscQty: "0",
    soiBillSchPerc: "0",
    soiTaxPerc: "18",
    soiCgstPerc: "9",
    soiSgstPerc: "9",
    soiIgstPerc: "18",
    soiCessPerc: "0",
    soiCessPerUnit: "0",
    soiFreightQty: "0",
    soiLoadQty: "0",
    soiSalesmanId: null,
    soiSchemeId: null,
    soiSchemeName: null,
    soiRemarks: null,
    soiLineStatus: "PENDING",
    soiItemName: "TEAK PLANK",
    soiUnitName: "NOS",
    soiGodownName: "MAIN",
    ...overrides,
  } as SaleOrderItemPayload;
}

function orderPayload(items: SaleOrderItemPayload[], overrides: Partial<SaleOrderPayload> = {}) {
  return {
    soId: "so-1",
    soCompanyId: "c1",
    soBranchId: "b1",
    soAccYear: "2026-2027",
    soOrderRefno: "SO0042",
    soOrderDate: "2026-09-01",
    soStatus: "CONFIRMED",
    soIsDeleted: false,
    soCustId: "cust-1",
    soCustName: "ACME",
    soCustAddr: null,
    soCustPlace: null,
    soCustPhone: null,
    soCustGstin: null,
    soCustGstType: null,
    soCustStcd: "33",
    soPosStcd: "33",
    soStateName: "Tamil Nadu",
    soPriceLevel: 1,
    soHasFreight: false,
    soHasLoad: false,
    soHasUnload: false,
    soHasPromo: false,
    soRemarks: null,
    soPaymentTerms: null,
    soDeliveryTerms: null,
    soTermsConditions: null,
    soFreightCalcType: "manual",
    soLoadingCalcType: "manual",
    soDiscAlterBase: false,
    items,
    ...overrides,
  } as unknown as SaleOrderPayload;
}

describe("importOrder", () => {
  it("imports the PENDING quantity, not the ordered one, and caps the line there", () => {
    // §19's case, verbatim: 10 ordered, 8 delivered, so 2 is what is left.
    // Importing 10 would bill eight boards the customer already has.
    const outcome = importOrder(
      createBillDraft(CONTEXT),
      orderPayload([
        orderItem({ soiOrderQty: "10", soiDeliveredQty: "8", soiPendingQty: "2" }),
      ]),
    );
    expect(outcome.imported).toBe(1);
    const line = outcome.draft.lines[0];
    expect(line.billQty).toBe(2);
    expect(line.orderQty).toBe(2);
    expect(line.orderQtyLocked).toBe(true);
    // What the order actually ORDERED goes back as `sbiSrcItemQty`, so the
    // server can re-derive the order's own arithmetic against the right
    // denominator.
    expect(line.srcItemQty).toBe(10);
    expect(line.source?.pendingQty).toBe(2);
  });

  it("skips a line with nothing left, and says how many", () => {
    const outcome = importOrder(
      createBillDraft(CONTEXT),
      orderPayload([
        orderItem({ soiId: "soi-1", soiPendingQty: "4" }),
        orderItem({ soiId: "soi-2", soiPendingQty: "0", soiDeliveredQty: "10" }),
        orderItem({ soiId: "soi-3", soiPendingQty: "0", soiCancelledQty: "10" }),
      ]),
    );
    expect(outcome.imported).toBe(1);
    expect(outcome.skipped).toBe(2);
    expect(outcome.note).toContain("2 lines");
  });

  it("names the ORDER on the document trail and the ORDER LINE on the line trail", () => {
    // §13.5: `srcDocId` is the document, `srcItemId` the line — `soi_id` is
    // what "Cancel on Order" addresses and what the server draws fulfilment
    // down by. The Qt model once held the line id in `SrcDocId`; not ported.
    const outcome = importOrder(createBillDraft(CONTEXT), orderPayload([orderItem()]));
    expect(outcome.draft.lines[0].srcDocId).toBe("so-1");
    expect(outcome.draft.lines[0].srcItemId).toBe("soi-1");
    expect(outcome.draft.source?.docId).toBe("so-1");
    expect(outcome.draft.source?.docType).toBe("SALES_ORDER");
    // The SOURCE's own accounting year — every txn table is partitioned by it.
    expect(outcome.draft.source?.accYear).toBe("2026-2027");
  });

  it("leaves the stock gate unresolved on every imported line", () => {
    // Qt hard-codes AllowNegative to "Y" on this path, turning the gate silently
    // OFF (§7.2). Unlike the quotation's, the order payload carries no flag at
    // all, so neither half is known until the item lookup is re-run.
    const outcome = importOrder(createBillDraft(CONTEXT), orderPayload([orderItem()]));
    expect(outcome.draft.lines[0].stockGateResolved).toBe(false);
  });

  it("clears the charge grid, so the standing charges re-seed", () => {
    const outcome = importOrder(createBillDraft(CONTEXT), orderPayload([orderItem()]));
    expect(outcome.draft.charges).toEqual([]);
  });

  it("takes no settlement from the source — that money is the ORDER's", () => {
    const outcome = importOrder(createBillDraft(CONTEXT), orderPayload([orderItem()]));
    expect(outcome.draft.tenders).toEqual([]);
    expect(outcome.draft.adjustments).toEqual([]);
  });
});

describe("sizeCrossesOn — the dimensions only cross on a whole first delivery", () => {
  it("crosses when nothing has been delivered or cancelled", () => {
    expect(sizeCrossesOn(orderItem())).toBe(true);
    const outcome = importOrder(createBillDraft(CONTEXT), orderPayload([orderItem()]));
    expect(outcome.draft.lines[0].itemSize).toBe("12*6*2*10");
  });

  it("does NOT cross on a part delivery", () => {
    // `"12*6*2*10"` describes all TEN boards. Carried onto a part delivery it
    // would print dimensions for ten against a quantity of six — and the
    // dimensions are what the customer measures the timber against.
    const part = orderItem({ soiOrderQty: "10", soiDeliveredQty: "4", soiPendingQty: "6" });
    expect(sizeCrossesOn(part)).toBe(false);
    const outcome = importOrder(createBillDraft(CONTEXT), orderPayload([part]));
    expect(outcome.draft.lines[0].itemSize).toBeNull();
  });

  it("does NOT cross when something was cancelled either", () => {
    const partial = orderItem({ soiOrderQty: "10", soiCancelledQty: "3", soiPendingQty: "7" });
    expect(sizeCrossesOn(partial)).toBe(false);
  });
});

describe("orderImportRefusal", () => {
  it("lets a confirmed order with pending lines through", () => {
    expect(orderImportRefusal(orderPayload([orderItem()]))).toBeNull();
  });

  it("refuses a cancelled order", () => {
    expect(orderImportRefusal(orderPayload([orderItem()], { soStatus: "CANCELLED" }))).not.toBeNull();
  });

  it("refuses a completed one", () => {
    expect(orderImportRefusal(orderPayload([orderItem()], { soStatus: "COMPLETED" }))).not.toBeNull();
  });

  it("refuses one with nothing left to bill, rather than importing zero lines", () => {
    const refusal = orderImportRefusal(
      orderPayload([orderItem({ soiPendingQty: "0", soiDeliveredQty: "10" })]),
    );
    expect(refusal?.reason).toContain("nothing left to bill");
  });
});

// ---------------------------------------------------------------------------
// The quotation import
// ---------------------------------------------------------------------------

function quotationPayload(): QuotationPayload {
  return {
    sqId: "q1",
    sqCompanyId: "c1",
    sqBranchId: "b1",
    sqAccYear: "2026-2027",
    sqPriceLevel: 2,
    sqQuoteRefno: "QT0007",
    sqQuoteDate: "2026-09-01",
    sqCustId: "cust-1",
    sqCustName: "ACME",
    sqCustAddr: "1 High Street",
    sqCustPlace: "Coimbatore",
    sqCustPhone: "99999",
    sqCustGstin: null,
    sqCustGstType: null,
    sqCustStcd: "33",
    sqPosStcd: "29",
    sqStateName: "Karnataka",
    sqHasFreight: true,
    sqHasLoad: false,
    sqHasUnload: false,
    sqHasPromo: false,
    sqRemarks: "quoted on the phone",
    sqPaymentTerms: null,
    sqDeliveryTerms: null,
    sqTermsConditions: null,
    sqFreightCalcType: "manual",
    sqLoadingCalcType: "manual",
    sqDiscAlterBase: false,
    items: [
      {
        sqiId: "sqi-1",
        sqiLineNo: 1,
        sqiItemId: "i1",
        sqiItemUnitId: "u1",
        sqiPriceLevel: 2,
        sqiIsDeleted: false,
        sqiBillQty: "7",
        sqiCaseQty: "0",
        sqiLengthQty: "0",
        sqiRate: "249.5",
        sqiItemDiscPerc: "12.5",
        sqiTaxPerc: "18",
        sqiCgstPerc: "9",
        sqiSgstPerc: "9",
        sqiIgstPerc: "18",
        sqiMaxPrice: "320",
        sqiMinPrice: "180",
        sqiActPrice: "260",
        sqiWeightQty: "23.8",
        sqiItemName: "TEAK PLANK",
        sqiUnitName: "NOS",
        // Not a stored column — `GET /quotations/get` stamps every line with the
        // quotation branch's default godown.
        sqiGodownId: "019c9935-79f4-772b-8666-2b46b9fc82cc",
        sqiGodownName: "namakkal",
        // Not a stored column either — the GET resolves it off today's godown,
        // company and item rows.
        sqiAllowNegativeStock: true,
      },
    ],
  } as unknown as QuotationPayload;
}

describe("importQuotation", () => {
  it("keeps the QUOTED figures — a quotation is a promise", () => {
    const outcome = importQuotation(createBillDraft(CONTEXT), quotationPayload());
    const line = outcome.draft.lines[0];
    expect(line.billQty).toBe(7);
    expect(line.rate).toBe(249.5);
    expect(line.discPerc).toBe(12.5);
    expect(line.gstPerc).toBe(18);
  });

  it("names the customer in the NAME field and leaves the picker empty", () => {
    // The Existing Customer box is the picker for linking a master record, not
    // a read-back of the one already linked: it opens ready to search, exactly
    // as it does on the quotation screen. The link itself rides on `custId`.
    const { draft } = importQuotation(createBillDraft(CONTEXT), quotationPayload());
    expect(draft.customer.custId).toBe("cust-1");
    expect(draft.customer.name).toBe("ACME");
    expect(draft.customer.masterName).toBe("");
  });

  it("carries the POS the source was priced under, overridable", () => {
    // The quotation was quoted at IGST for a ship-to across a state line.
    // Silently re-taxing it on import would change the money the customer was
    // promised.
    const outcome = importQuotation(createBillDraft(CONTEXT), quotationPayload());
    expect(outcome.draft.header.posStateCode).toBe("29");
    expect(outcome.draft.isLocalSale).toBe(false);
    // The customer's own state is a different fact and is kept as such (§5).
    expect(outcome.draft.customer.stateCode).toBe("33");
  });

  it("caps nothing — a quotation promises no quantity", () => {
    const outcome = importQuotation(createBillDraft(CONTEXT), quotationPayload());
    expect(outcome.draft.lines[0].orderQtyLocked).toBe(false);
  });

  it("brings the godown across, though the source stores no such column", () => {
    // `sale_quotation_item` has no godown column, but the GET stamps every line
    // with the quotation branch's default one — and `sbiGodownId` is REQUIRED on
    // a bill line, so that is the value the import needs.
    const outcome = importQuotation(createBillDraft(CONTEXT), quotationPayload());
    expect(outcome.draft.lines[0].godownId).toBe("019c9935-79f4-772b-8666-2b46b9fc82cc");
    expect(outcome.draft.lines[0].godownName).toBe("namakkal");
    // Nothing left to re-pick, so the note does not ask for it.
    expect(outcome.note).not.toContain("godown");
  });

  it("asks for a re-pick only for the lines that arrived without one", () => {
    // A quotation raised on a branch with no default godown, or one pointing at
    // a deleted location, answers null — and `validate.ts` refuses the line in
    // as many words rather than letting the server answer 400.
    const payload = quotationPayload();
    const items = payload.items ?? [];
    items[0] = { ...items[0], sqiGodownId: null, sqiGodownName: null };
    const outcome = importQuotation(createBillDraft(CONTEXT), payload);
    expect(outcome.draft.lines[0].godownId).toBeNull();
    expect(outcome.note).toContain("the line that has");
    expect(outcome.note).toContain("no godown");
  });

  it("carries the negative-stock FLAG across — the GET resolves it live", () => {
    // The one half of the gate that does NOT age: `sqiAllowNegativeStock` is
    // derived from today's godown, company and item rows by the same rule
    // `/master-lookups/item-price` answers with, so it crosses like the godown
    // does. `sqiAvailableStock` is a snapshot and does not, which is why the
    // line still arrives unresolved — it may pass on the flag, never fail on a
    // month-old figure.
    const outcome = importQuotation(createBillDraft(CONTEXT), quotationPayload());
    expect(outcome.draft.lines[0].allowNegative).toBe(true);
    expect(outcome.draft.lines[0].stockGateResolved).toBe(false);
    expect(stockGateOf(outcome.draft.lines[0])).toBe("pass");
  });

  it("reads a missing flag as a no, not as a licence", () => {
    // `null` is the absence of an answer (no item join), and Qt's own quotation
    // import leaves the cell empty; neither is permission to go below zero.
    const payload = quotationPayload();
    const items = payload.items ?? [];
    items[0] = { ...items[0], sqiAllowNegativeStock: null };
    const outcome = importQuotation(createBillDraft(CONTEXT), payload);
    expect(outcome.draft.lines[0].allowNegative).toBe(false);
    expect(stockGateOf(outcome.draft.lines[0])).toBe("unavailable");
  });

  it("names the quotation on the document trail and its line on the line trail", () => {
    const outcome = importQuotation(createBillDraft(CONTEXT), quotationPayload());
    expect(outcome.draft.lines[0].srcDocId).toBe("q1");
    expect(outcome.draft.lines[0].srcItemId).toBe("sqi-1");
    expect(outcome.draft.source?.docType).toBe("QUOTATION");
    expect(outcome.draft.source?.docId).toBe("q1");
  });
});

// ---------------------------------------------------------------------------
// The credits an imported order raised
// ---------------------------------------------------------------------------

function credit(overrides: Partial<AdjustableCredit> = {}): AdjustableCredit {
  return {
    billId: "abl-1",
    billAccYear: "2025-2026",
    billType: "ADVANCE",
    drCr: "CR",
    docRefno: "SO-2201",
    docDate: "2026-03-30",
    billAmount: 5000,
    pendingAmount: 5000,
    status: "OPEN",
    srcModule: "SALES",
    srcDocType: "SALES_ORDER",
    srcDocId: "so-1",
    srcAccYear: "2025-2026",
    narration: null,
    adjType: "ADVANCE_ADJUST",
    settlementMode: "ADVANCE",
    ...overrides,
  };
}

describe("creditsRaisedBy", () => {
  it("pre-fills the advance THIS order raised, at its full pending amount", () => {
    const rows = creditsRaisedBy([credit()], "so-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(5000);
  });

  it("reads across accounting years — a March advance settles an April invoice", () => {
    // The open-credits endpoint takes no year at all, and that is why: credits
    // are never carried forward, so filtering by the entry screen's year would
    // hide the customer's own money.
    const rows = creditsRaisedBy([credit({ billAccYear: "2025-2026" })], "so-1");
    expect(rows[0].credit.billAccYear).toBe("2025-2026");
  });

  it("ignores credits another document raised", () => {
    expect(creditsRaisedBy([credit({ srcDocId: "so-99" })], "so-1")).toHaveLength(0);
  });

  it("ignores a credit with nothing left on it", () => {
    expect(creditsRaisedBy([credit({ pendingAmount: 0 })], "so-1")).toHaveLength(0);
  });
});
