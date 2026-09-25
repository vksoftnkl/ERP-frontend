/**
 * Sale Bill Entry — the draft's own rules.
 *
 * Everything the quotation already states once is tested there; what is here is
 * what the BILL adds: the credit-term pair, the customer lock, the batch/source
 * fields on a line, and the timestamp a counter stamps its bills with.
 */
import { describe, expect, it } from "vitest";
import { emptyCustomer } from "@/features/sales/quotation/quotation.state";
import type { ItemPriceLookupPayload } from "@/features/sales/quotation/quotation.types";
import { DEFAULT_BILL_STATUS, DEFAULT_BILL_TYPE } from "./salebill.constants";
import {
  applyBillHeaderField,
  applyBillItemPrice,
  clearCustomerBoundState,
  copyBillDraftAsNew,
  createBillDraft,
  createBillDraftLine,
  customerChangeCosts,
  duplicateBillDraftLine,
  emptyBillHeader,
  lastFilledLineBefore,
  nowStamp,
  resolveWalkInCustomerId,
  seedCreditPeriod,
  shouldSeedWalkInCustomer,
} from "./salebill.state";
import type { SaleBillDraft, SaleBillDraftLine } from "./salebill.types";
import {
  draftReplaced,
  lineDuplicated,
  modeSet,
  saleBillReducer,
  type SaleBillState,
} from "@/store/slices/saleBillSlice";

const CONTEXT = {
  companyId: "c1",
  branchId: "b1",
  accYear: "2026-2027",
  companyStateCode: "33",
  companyStateName: "Tamil Nadu",
  billDate: "2026-09-12",
};

function header(overrides: Partial<ReturnType<typeof emptyBillHeader>> = {}) {
  return { ...emptyBillHeader("2026-09-12", "2026-09-12T09:30:00"), ...overrides };
}

// ---------------------------------------------------------------------------
// The timestamp
// ---------------------------------------------------------------------------

describe("nowStamp", () => {
  it("stamps the counter's LOCAL clock, not UTC", () => {
    // A bill carries a time as well as a date because two bills on one counter
    // on one day have to be orderable. `toISOString()` would record a 09:30
    // sale as 04:00Z in India, which moves it across the day boundary for
    // anyone reading it back by date.
    const at = new Date(2026, 8, 12, 9, 30, 5);
    expect(nowStamp(at)).toBe("2026-09-12T09:30:05");
  });

  it("pads every field to two digits", () => {
    expect(nowStamp(new Date(2026, 0, 2, 3, 4, 5))).toBe("2026-01-02T03:04:05");
  });
});

// ---------------------------------------------------------------------------
// Place of supply (§5)
// ---------------------------------------------------------------------------

describe("createBillDraft", () => {
  it("defaults the place of supply to the COMPANY's state, not a hard-coded 33", () => {
    const draft = createBillDraft({ ...CONTEXT, companyStateCode: "29", companyStateName: "Karnataka" });
    expect(draft.header.posStateCode).toBe("29");
    expect(draft.header.posStateName).toBe("Karnataka");
    // Same state either side, so the document opens local.
    expect(draft.isLocalSale).toBe(true);
  });

  it("opens local when the company state is not known yet", () => {
    // The overwhelming majority of counter sales are local, and an IGST default
    // would mis-tax every one of them in the gap before the company resolves.
    const draft = createBillDraft({ ...CONTEXT, companyStateCode: "", companyStateName: "" });
    expect(draft.isLocalSale).toBe(true);
  });

  it("opens on CASH terms, POSTED status and no due period", () => {
    const draft = createBillDraft(CONTEXT);
    expect(draft.header.billType).toBe(DEFAULT_BILL_TYPE);
    expect(draft.status).toBe(DEFAULT_BILL_STATUS);
    expect(draft.header.dueDays).toBe(0);
    expect(draft.header.dueDate).toBe("");
  });

  it("never seeds a bill number — both halves are the server's", () => {
    const draft = createBillDraft(CONTEXT);
    expect(draft.billSlno).toBe("");
    expect(draft.billRefno).toBe("");
  });
});

// ---------------------------------------------------------------------------
// The credit term
// ---------------------------------------------------------------------------

describe("applyBillHeaderField — the due pair", () => {
  it("re-derives the due date from the days", () => {
    const next = applyBillHeaderField(header({ billType: "CREDIT" }), "dueDays", 30);
    expect(next.dueDays).toBe(30);
    expect(next.dueDate).toBe("2026-10-12");
  });

  it("re-derives the days from the date", () => {
    const next = applyBillHeaderField(header({ billType: "CREDIT" }), "dueDate", "2026-09-26");
    expect(next.dueDays).toBe(14);
  });

  it("drags the due date along when the bill date moves", () => {
    const credit = applyBillHeaderField(header({ billType: "CREDIT" }), "dueDays", 10);
    const moved = applyBillHeaderField(credit, "billDate", "2026-09-20");
    expect(moved.dueDate).toBe("2026-09-30");
  });

  it("leaves a due date BEFORE the bill date standing, floored at zero days", () => {
    // Silently "correcting" the operator's date is worse than telling them; the
    // save refuses it instead.
    const next = applyBillHeaderField(header({ billType: "CREDIT" }), "dueDate", "2026-09-01");
    expect(next.dueDate).toBe("2026-09-01");
    expect(next.dueDays).toBe(0);
  });

  it("does not invent a due date for a bill with no credit period", () => {
    const next = applyBillHeaderField(header(), "billDate", "2026-09-20");
    expect(next.dueDate).toBe("");
  });
});

describe("applyBillHeaderField — the term", () => {
  it("clears the due period when the term goes back to CASH", () => {
    // The payload sends due days / due date only for CREDIT, so a period left
    // standing on a cash bill is a thing on screen nothing downstream agrees
    // exists — and it would print.
    const credit = applyBillHeaderField(header({ billType: "CREDIT" }), "dueDays", 30);
    const cash = applyBillHeaderField(credit, "billType", "CASH");
    expect(cash.dueDays).toBe(0);
    expect(cash.dueDate).toBe("");
  });
});

describe("seedCreditPeriod", () => {
  const customer = { ...emptyCustomer(), debitAllowed: true, debitDays: 45 };

  it("takes the customer's credit days onto a credit bill", () => {
    const next = seedCreditPeriod(header({ billType: "CREDIT" }), customer);
    expect(next.dueDays).toBe(45);
    expect(next.dueDate).toBe("2026-10-27");
  });

  it("leaves a cash bill alone", () => {
    expect(seedCreditPeriod(header(), customer).dueDays).toBe(0);
  });

  it("does not overwrite a period the operator already keyed", () => {
    const keyed = applyBillHeaderField(header({ billType: "CREDIT" }), "dueDays", 7);
    expect(seedCreditPeriod(keyed, customer).dueDays).toBe(7);
  });

  it("treats zero credit days as 'no stated period', not 'due today'", () => {
    const noPeriod = { ...emptyCustomer(), debitAllowed: true, debitDays: 0 };
    expect(seedCreditPeriod(header({ billType: "CREDIT" }), noPeriod).dueDate).toBe("");
  });
});

// ---------------------------------------------------------------------------
// The customer lock (§4.3)
// ---------------------------------------------------------------------------

/**
 * A tender row with money keyed on it. Only the three fields the cost check
 * reads are meaningful; the rest is the shape `TenderDraftRow` requires.
 */
function tenderRow(keyed: number, typeCode = "CASH"): SaleBillDraft["tenders"][number] {
  return {
    key: `t-${typeCode}-${keyed}`,
    tdId: null,
    tenderId: "tnd-1",
    tenderTypeId: typeCode === "CREDIT" ? 9 : 1,
    typeCode: typeCode as SaleBillDraft["tenders"][number]["typeCode"],
    tenderName: typeCode,
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
    allowChange: typeCode === "CASH",
    needsRef: false,
    hotkey: null,
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

function adjustmentRow(amount: number): SaleBillDraft["adjustments"][number] {
  return {
    key: `adj-${amount}`,
    amount,
    credit: {
      billId: "abl-1",
      billAccYear: "2026-2027",
      billType: "ADVANCE",
      drCr: "CR",
      docRefno: "SO-2201",
      docDate: "2026-03-30",
      billAmount: amount,
      pendingAmount: amount,
      status: "OPEN",
      srcModule: "SALES",
      srcDocType: "SALES_ORDER",
      srcDocId: "so-1",
      srcAccYear: "2026-2027",
      narration: null,
      adjType: "ADVANCE_ADJUST",
      settlementMode: "ADVANCE",
    },
  };
}

describe("customerChangeCosts", () => {
  it("is free on a bill that has taken nothing", () => {
    expect(customerChangeCosts(createBillDraft(CONTEXT)).blocked).toBe(false);
  });

  it("blocks once money has been tendered", () => {
    const draft = { ...createBillDraft(CONTEXT), tenders: [tenderRow(500)] };
    const cost = customerChangeCosts(draft);
    expect(cost.blocked).toBe(true);
    expect(cost.tendered).toBe(500);
  });

  it("blocks on an adjustment alone — an adjustment is not a tender", () => {
    // Credits the customer already holds are different rows in different tables
    // and post differently (§10), but they are just as much this party's money:
    // changing the customer has to clear them too.
    const draft = { ...createBillDraft(CONTEXT), adjustments: [adjustmentRow(250)] };
    const cost = customerChangeCosts(draft);
    expect(cost.blocked).toBe(true);
    expect(cost.adjusted).toBe(250);
  });

  it("counts a CREDIT tender as settled money", () => {
    // Tender type 9 posts no accounting leg — the party debit stays open — but
    // it is still a settlement decision made for THIS customer.
    const draft = { ...createBillDraft(CONTEXT), tenders: [tenderRow(100, "CREDIT")] };
    expect(customerChangeCosts(draft).blocked).toBe(true);
  });

  it("reads the ROWS, not the settlement roll-ups", () => {
    // The strip is a display figure written by `updateSettlementDisplay`; a
    // draft restored from a hold or an autosave carries its rows before anything
    // has recomputed it. Judging the cost off the strip would let a restored
    // cart lose its settlement without a word.
    const draft: SaleBillDraft = {
      ...createBillDraft(CONTEXT),
      tenders: [tenderRow(500)],
      settlement: { ...createBillDraft(CONTEXT).settlement, tenderAmt: 0 },
    };
    expect(customerChangeCosts(draft).blocked).toBe(true);
  });
});

describe("resolveWalkInCustomerId", () => {
  it("answers the configured id when the seed is on", () => {
    expect(resolveWalkInCustomerId(true, " cus-1 ")).toBe("cus-1");
  });

  it("answers nothing when the seed is off, however the id is set", () => {
    // The two settings are independent: a counter that turns the seed off keeps
    // its walk-in id on file for when it turns it back on.
    expect(resolveWalkInCustomerId(false, "cus-1")).toBeNull();
  });

  it("answers nothing when no id is on file", () => {
    expect(resolveWalkInCustomerId(true, "   ")).toBeNull();
    expect(resolveWalkInCustomerId(true, null)).toBeNull();
    expect(resolveWalkInCustomerId(true, undefined)).toBeNull();
  });
});

describe("shouldSeedWalkInCustomer", () => {
  it("seeds a bill that has only just been opened", () => {
    expect(shouldSeedWalkInCustomer(createBillDraft(CONTEXT))).toBe(true);
  });

  it("waits for the company and branch — the lookup is scoped by them", () => {
    const draft = createBillDraft({ ...CONTEXT, companyId: "", branchId: "" });
    expect(shouldSeedWalkInCustomer(draft)).toBe(false);
  });

  it("leaves a customer somebody already chose alone", () => {
    const draft: SaleBillDraft = {
      ...createBillDraft(CONTEXT),
      customer: { ...emptyCustomer(), custId: "cus-9", name: "REAL CUSTOMER" },
    };
    expect(shouldSeedWalkInCustomer(draft)).toBe(false);
  });

  it("leaves a hand-keyed walk-in name alone, master or no master", () => {
    // `sbCustId` is nullable: a bill may be raised to a name alone. Somebody who
    // has typed one has already said who this bill is for.
    const draft: SaleBillDraft = {
      ...createBillDraft(CONTEXT),
      customer: { ...emptyCustomer(), name: "SITE DELIVERY" },
    };
    expect(shouldSeedWalkInCustomer(draft)).toBe(false);
  });

  it("does not touch a bill the operator has started working on", () => {
    expect(
      shouldSeedWalkInCustomer({ ...createBillDraft(CONTEXT), isDirty: true }),
    ).toBe(false);
  });

  it("does not touch a loaded bill, a resumed cart or browse mode", () => {
    const fresh = createBillDraft(CONTEXT);
    expect(
      shouldSeedWalkInCustomer({ ...fresh, docId: "sb-1", isNewEntry: false }),
    ).toBe(false);
    expect(shouldSeedWalkInCustomer({ ...fresh, holdId: "txh-1" })).toBe(false);
    expect(shouldSeedWalkInCustomer({ ...fresh, mode: "browse" })).toBe(false);
  });
});

describe("clearCustomerBoundState", () => {
  it("drops the settlement, the credit standing and the freight bands together", () => {
    const base = createBillDraft(CONTEXT);
    const dirty: SaleBillDraft = {
      ...base,
      tenders: [tenderRow(500)],
      adjustments: [adjustmentRow(250)],
      adjustmentsTouched: true,
      openCredits: [adjustmentRow(250).credit],
      settlement: { ...base.settlement, tenderAmt: 500, adjustedAmt: 250, refundAmt: 10 },
      freightBands: [{ id: "f1", fromKm: 0, toKm: 10, freightCharge: 50, fromWeight: null, toWeight: null }],
    };
    const cleared = clearCustomerBoundState(dirty);
    expect(cleared.tenders).toEqual([]);
    expect(cleared.adjustments).toEqual([]);
    expect(cleared.settlement.tenderAmt).toBe(0);
    expect(cleared.settlement.adjustedAmt).toBe(0);
    expect(cleared.settlement.refundAmt).toBe(0);
    expect(cleared.party).toBeNull();
    expect(cleared.freightBands).toEqual([]);
    // The offered list goes too: it was an answer about the party being
    // replaced, and leaving it would let the panel adjust another customer's
    // credit against this bill.
    expect(cleared.openCredits).toEqual([]);
    expect(cleared.adjustmentsTouched).toBe(false);
  });

  it("leaves the lines and charges alone — they are the goods, not the party's money", () => {
    const withLines: SaleBillDraft = {
      ...createBillDraft(CONTEXT),
      tenders: [tenderRow(500)],
      lines: [createBillDraftLine({ itemId: "i1", billQty: 2 })],
    };
    expect(clearCustomerBoundState(withLines).lines).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

describe("createBillDraftLine", () => {
  it("starts with the stock gate UNRESOLVED", () => {
    // Nothing has been looked up, so there is no flag and no stock figure to
    // judge against. The gate reports itself unavailable rather than inventing
    // an answer in either direction (§7.2).
    expect(createBillDraftLine().stockGateResolved).toBe(false);
  });

  it("starts with no order cap and no source trail", () => {
    const line = createBillDraftLine();
    expect(line.orderQtyLocked).toBe(false);
    expect(line.srcDocId).toBeNull();
    expect(line.srcItemQty).toBeNull();
  });
});

describe("applyBillItemPrice", () => {
  const lookup = {
    item_id: "i1",
    item_uc_id: "u1",
    godown_id: "g1",
    godown_name: "MAIN",
    item_code: "IT-1",
    item_name: "TEAK PLANK",
    item_com_code: null,
    barcode: null,
    allow_promo: false,
    add_freight: false,
    item_group_id: "grp",
    item_category_id: null,
    item_brand_id: null,
    item_section_id: null,
    weigh_scale: false,
    batch_config: 0,
    service_item: "N",
    allow_negative_stock: false,
    price_level: 1,
    sales_price: 100,
    cost_price: 70,
    cost_wot: 60,
    min_price: 80,
    max_price: 150,
    disc_perc: 0,
    disc_qty: 0,
    sch_discount: null,
    addl_cess: 0,
    unit_name: "NOS",
    base_unit_id: "bu",
    base_factor: 1,
    iuc_uom_weight: 0,
    decimal_count: 2,
    loading_charge: null,
    resolved_weight: null,
    freight_charge: null,
    loyalty_pv: 0,
    stock: 4,
    reorder_qty: null,
    item_incl_tax: false,
    gst_rate: 18,
    cess_perc: 0,
    cess_unit: 0,
    sgst_perc: 9,
    cgst_perc: 9,
    igst_perc: 18,
  } satisfies ItemPriceLookupPayload;

  it("resolves the stock gate, because the lookup is what carries both halves of it", () => {
    const line = applyBillItemPrice(createBillDraftLine(), lookup);
    expect(line.stockGateResolved).toBe(true);
    expect(line.allowNegative).toBe(false);
    expect(line.stockQty).toBe(4);
  });

  it("fills the line exactly as the quotation's mapper does", () => {
    const line = applyBillItemPrice(createBillDraftLine(), lookup);
    expect(line.itemId).toBe("i1");
    expect(line.itemUnitId).toBe("u1");
    expect(line.rate).toBe(100);
    expect(line.minPrice).toBe(80);
    expect(line.godownId).toBe("g1");
  });

  it("keeps the bill-only fields it was handed", () => {
    const line = applyBillItemPrice(
      createBillDraftLine({ srcDocId: "so-line-1", orderQtyLocked: true, orderQty: 6 }),
      lookup,
    );
    expect(line.srcDocId).toBe("so-line-1");
    expect(line.orderQtyLocked).toBe(true);
    expect(line.orderQty).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Copy as new
// ---------------------------------------------------------------------------

describe("copyBillDraftAsNew", () => {
  function saved(): SaleBillDraft {
    const draft = createBillDraft(CONTEXT);
    return {
      ...draft,
      docId: "sb1",
      billSlno: "41",
      billRefno: "bil00041",
      status: "POSTED",
      isNewEntry: false,
      holdId: "h1",
      holdNo: "H-7",
      source: { docType: "SALES_ORDER", docId: "so1", accYear: "2026-2027", refno: "SO0042", date: "2026-09-01" },
      settlement: { ...draft.settlement, tenderAmt: 500, adjustedAmt: 250, payStatus: "PAID" },
      lines: [
        createBillDraftLine({
          itemId: "i1",
          sbiId: "sbi1",
          billQty: 3,
          srcDocId: "soi1",
          srcDocType: "SALES_ORDER",
          srcItemQty: 10,
          orderQtyLocked: true,
          source: { pendingQty: 7, lineStatus: "PARTIAL" },
        }),
      ],
      charges: [],
    };
  }

  it("strips the server identity and the number", () => {
    const copy = copyBillDraftAsNew(saved(), "2026-09-20", "2026-09-20T10:00:00");
    expect(copy.docId).toBeNull();
    expect(copy.billSlno).toBe("");
    expect(copy.billRefno).toBe("");
    expect(copy.isNewEntry).toBe(true);
    expect(copy.status).toBe(DEFAULT_BILL_STATUS);
  });

  it("strips the source trail, header and line alike", () => {
    // Kept, one order would look billed twice, and the copy would open with a
    // locked customer it never had.
    const copy = copyBillDraftAsNew(saved(), "2026-09-20");
    expect(copy.source).toBeNull();
    expect(copy.lines[0].srcDocId).toBeNull();
    expect(copy.lines[0].srcDocType).toBeNull();
    expect(copy.lines[0].orderQtyLocked).toBe(false);
    expect(copy.lines[0].source).toBeUndefined();
  });

  it("claims no money the copy has not taken", () => {
    const copy = copyBillDraftAsNew(saved(), "2026-09-20");
    expect(copy.settlement.tenderAmt).toBe(0);
    expect(copy.settlement.adjustedAmt).toBe(0);
    expect(copy.settlement.payStatus).toBe("UNPAID");
  });

  it("drops the hold link, so holding the copy parks a second cart", () => {
    const copy = copyBillDraftAsNew(saved(), "2026-09-20");
    expect(copy.holdId).toBeNull();
    expect(copy.holdNo).toBe("");
  });

  it("keeps the goods and re-dates the document", () => {
    const copy = copyBillDraftAsNew(saved(), "2026-09-20", "2026-09-20T10:00:00");
    expect(copy.lines).toHaveLength(1);
    expect(copy.lines[0].billQty).toBe(3);
    expect(copy.lines[0].sbiId).toBeNull();
    expect(copy.header.billDate).toBe("2026-09-20");
    expect(copy.header.billDatetime).toBe("2026-09-20T10:00:00");
  });
});

describe("duplicateBillDraftLine", () => {
  const source = () =>
    createBillDraftLine({
      sbiId: "sbi-1",
      stockId: "stk-1",
      serialNo: "3",
      itemId: "item-1",
      itemName: "TEAK PLANK",
      billQty: 3,
      rate: 250,
      batchNo: "B-77",
      stockQty: 12,
      stockGateResolved: true,
      srcDocType: "SALES_ORDER",
      srcDocId: "soi-1",
      srcDocYear: "2026-2027",
      srcDocRefno: "SO/1",
      srcDocLineNo: 1,
      srcItemQty: 10,
      orderQtyLocked: true,
    });

  it("carries the goods across and takes a key of its own", () => {
    const original = source();
    const copy = duplicateBillDraftLine(original);
    expect(copy.itemId).toBe("item-1");
    expect(copy.billQty).toBe(3);
    expect(copy.rate).toBe(250);
    expect(copy.batchNo).toBe("B-77");
    expect(copy.key).not.toBe(original.key);
  });

  it("drops the saved line id, so the next save INSERTS the copy", () => {
    expect(duplicateBillDraftLine(source()).sbiId).toBeNull();
  });

  it("drops the whole source trail — one order line cannot be billed twice", () => {
    const copy = duplicateBillDraftLine(source());
    expect(copy.srcDocId).toBeNull();
    expect(copy.srcDocType).toBeNull();
    expect(copy.srcDocYear).toBeNull();
    expect(copy.srcDocRefno).toBeNull();
    expect(copy.srcDocLineNo).toBeNull();
    expect(copy.srcItemQty).toBeNull();
  });

  it("unlocks the order quantity, which no order is holding on the copy", () => {
    expect(duplicateBillDraftLine(source()).orderQtyLocked).toBe(false);
  });

  it("keeps the stock gate's verdict — same item, same figure, same moment", () => {
    const copy = duplicateBillDraftLine(source());
    expect(copy.stockGateResolved).toBe(true);
    expect(copy.stockQty).toBe(12);
  });

  it("leaves the row it copied untouched", () => {
    const original = source();
    duplicateBillDraftLine(original);
    expect(original.sbiId).toBe("sbi-1");
    expect(original.orderQtyLocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Alt+R from where the cursor actually is
// ---------------------------------------------------------------------------

describe("lastFilledLineBefore", () => {
  const lines = (...items: string[]) =>
    items.map((itemId, i) => createBillDraftLine({ key: `L${i}`, itemId }));

  it("finds the row above the blank one the cursor lands in", () => {
    const rows = lines("IT1", "");
    expect(lastFilledLineBefore(rows, 1)?.itemId).toBe("IT1");
  });

  it("skips a run of blank rows rather than copying emptiness", () => {
    // Ctrl++ pressed twice, then Alt+R on the last of them.
    const rows = lines("IT1", "", "");
    expect(lastFilledLineBefore(rows, 2)?.itemId).toBe("IT1");
  });

  it("takes the NEAREST filled row, not the first one", () => {
    const rows = lines("IT1", "IT2", "");
    expect(lastFilledLineBefore(rows, 2)?.itemId).toBe("IT2");
  });

  it("looks only above — a filled row below is not what Alt+R copies", () => {
    const rows = lines("", "IT2");
    expect(lastFilledLineBefore(rows, 0)).toBeNull();
  });

  it("answers null on a bill whose only row is the blank one", () => {
    expect(lastFilledLineBefore(lines(""), 0)).toBeNull();
  });
});

describe("lineDuplicated — the two shapes of Alt+R", () => {
  const filled = () =>
    createBillDraftLine({
      key: "L1",
      itemId: "IT1",
      itemName: "ITEM-A",
      itemSize: "10x12",
      unitName: "NOS",
      itemUnitId: "U1",
      billQty: 2,
      rate: 100,
      discPerc: 5,
    });

  /** A draft in entry mode, so the trailing-blank-row invariant is live. */
  const draftWith = (...lines: SaleBillDraftLine[]): SaleBillState => {
    const base = saleBillReducer(
      undefined,
      draftReplaced({ ...createBillDraft(CONTEXT), lines }),
    );
    return saleBillReducer(base, modeSet("entry"));
  };

  it("inserts the copy under a FILLED row", () => {
    const next = saleBillReducer(draftWith(filled()), lineDuplicated("L1"));
    expect(next.lines[1].itemId).toBe("IT1");
    expect(next.lines[1].billQty).toBe(2);
    expect(next.lines[1].rate).toBe(100);
    // Its own row, not the one it came from.
    expect(next.lines[1].key).not.toBe("L1");
  });

  it("FILLS the trailing blank row the cursor lands in, rather than declining", () => {
    // The press the operator actually makes: an item was picked on row 1, the
    // blank row opened beneath it, and Alt+R is pressed there.
    const state = draftWith(filled());
    const blankKey = state.lines[1].key;
    const next = saleBillReducer(state, lineDuplicated(blankKey));

    expect(next.lines[1].itemId).toBe("IT1");
    expect(next.lines[1].billQty).toBe(2);
    expect(next.lines[1].rate).toBe(100);
    expect(next.lines[1].discPerc).toBe(5);
  });

  it("fills that row IN PLACE, so the cursor keeps the row it is standing in", () => {
    const state = draftWith(filled());
    const blankKey = state.lines[1].key;
    const next = saleBillReducer(state, lineDuplicated(blankKey));
    expect(next.lines[1].key).toBe(blankKey);
  });

  it("opens a fresh blank row under the one it filled", () => {
    const state = draftWith(filled());
    const next = saleBillReducer(state, lineDuplicated(state.lines[1].key));
    expect(next.lines).toHaveLength(3);
    expect(next.lines[2].itemId).toBe("");
  });

  it("sheds the ids and the order trail, the same as any copy", () => {
    const imported = createBillDraftLine({
      key: "L1",
      itemId: "IT1",
      sbiId: "sbi-1",
      srcDocRefno: "SO-9",
      orderQtyLocked: true,
    });
    const state = draftWith(imported);
    const next = saleBillReducer(state, lineDuplicated(state.lines[1].key));
    expect(next.lines[1].sbiId).toBeNull();
    expect(next.lines[1].srcDocRefno).toBeNull();
    expect(next.lines[1].orderQtyLocked).toBe(false);
  });

  it("leaves a pristine draft CLEAN when there is nothing above to copy", () => {
    // Alt+R on the blank row of an untouched bill: nothing happens, and nothing
    // may prompt about work nobody did when the screen is closed.
    const state = draftWith();
    const next = saleBillReducer(state, lineDuplicated(state.lines[0].key));
    expect(next.lines[0].itemId).toBe("");
    expect(next.isDirty).toBe(false);
  });

  it("ignores a row key that is not on the bill", () => {
    const state = draftWith(filled());
    expect(saleBillReducer(state, lineDuplicated("nope"))).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// Phase 2 additions: Clear keeps the crew, the quick-strip transforms, and
// what party-context is allowed to write (§7.1, §7.9, §6.2, §17.11)
// ---------------------------------------------------------------------------

describe("resetBillDraft — Clear (F7) in every state", () => {
  it("keeps the crew but never the agent when the setting says so, else drops everything", async () => {
    const { resetBillDraft } = await import("./salebill.state");
    const base = createBillDraft(CONTEXT);
    const worked: SaleBillDraft = {
      ...base,
      isDirty: true,
      customer: { ...base.customer, custId: "cust-1", name: "ACME" },
      header: {
        ...base.header,
        people: { ...base.header.people, salesmanId: "emp-1", salesmanName: "RAVI", driverId: "emp-2", driverName: "MANI", agentId: "ag-1", agentName: "AGENT", vehicleNo: "TN01AB1234" },
      },
    };
    const kept = resetBillDraft(worked, CONTEXT, { keepCrew: true });
    expect(kept.customer.custId).toBeNull();
    expect(kept.header.people.salesmanId).toBe("emp-1");
    expect(kept.header.people.driverName).toBe("MANI");
    expect(kept.header.people.vehicleNo).toBe("TN01AB1234");
    expect(kept.header.people.agentId).toBeNull();
    expect(kept.isDirty).toBe(false);
    const dropped = resetBillDraft(worked, CONTEXT, { keepCrew: false });
    expect(dropped.header.people.salesmanId).toBeNull();
  });
});

describe("Disc % All and ± Price (§6.2)", () => {
  it("Disc % All clears the per-qty and amount tiers on every non-free line", async () => {
    const { applyDiscountToAllLines } = await import("./salebill.state");
    const lines = applyDiscountToAllLines(
      [
        createBillDraftLine({ itemId: "i1", discPerQty: 5, discAmt: 20 }),
        createBillDraftLine({ itemId: "i2", isFree: true, discPerc: 3 }),
        createBillDraftLine(),
      ],
      12.345,
    );
    expect(lines[0]).toMatchObject({ discPerc: 12.35, discPerQty: 0, discAmt: 0 });
    expect(lines[1].discPerc).toBe(3);
    expect(lines[2].discPerc).toBe(0);
  });

  it("± Price scales the rate on non-free lines; 0 is a no-op", async () => {
    const { adjustLinePrices } = await import("./salebill.state");
    const lines = [createBillDraftLine({ itemId: "i1", rate: 100 }), createBillDraftLine({ itemId: "i2", isFree: true, rate: 0 })];
    expect(adjustLinePrices(lines, 10)[0].rate).toBe(110);
    expect(adjustLinePrices(lines, -10)[0].rate).toBe(90);
    expect(adjustLinePrices(lines, 10)[1].rate).toBe(0);
    expect(adjustLinePrices(lines, 0)[0].rate).toBe(100);
  });
});

describe("applyPartyContext — one writer per field (§7.1)", () => {
  it("writes the standing, `creditAllowed` and the loyalty member, and only falls back on the rest", async () => {
    const { applyPartyContext } = await import("./salebill.state");
    const { parsePartyContext } = await import("./salebill.party");
    const base = createBillDraft(CONTEXT);
    const draft: SaleBillDraft = {
      ...base,
      customer: { ...base.customer, custId: "cust-1", name: "ACME", debitAllowed: false, areaId: "area-keyed" },
    };
    const context = parsePartyContext(
      { data: { party: { ledId: "cust-1", creditAllowed: true, areaId: "area-ctx", pin: "600001" }, credit: { mode: "WARN" }, loyalty: { memberId: "mem-1" } } },
      "cust-1",
      "2026-09-12",
    );
    const next = applyPartyContext(draft, context);
    expect(next.party?.credit.mode).toBe("WARN");
    expect(next.customer.debitAllowed).toBe(true);
    expect(next.customer.areaId).toBe("area-keyed");
    expect(next.header.loyaltyMemberId).toBe("mem-1");
    expect(next.header.custPin).toBe("600001");
    // Customer-detail's own fields are untouched.
    expect(next.customer.name).toBe("ACME");
  });
});
