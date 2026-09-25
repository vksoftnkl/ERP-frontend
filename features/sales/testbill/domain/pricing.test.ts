/**
 * Sale Bill Entry — the engine is IMPORTED, and the reducer's two own rules.
 *
 * The first block here is the most valuable test in the sales module and the
 * reason `domain/pricing` exists as a separate thing: **the same cart priced as
 * a quotation, as an order and as a bill must agree to the paisa.** A quotation
 * that promises 11,800 and a bill that charges 11,802 is the defect the shared
 * engine is there to prevent, and it would be found by a customer, not by a
 * developer.
 *
 * The bill adds exactly two rules of its own and neither is arithmetic: the
 * negative-stock gate (§7.2) and the order-quantity cap (§7.3). Only the second
 * is enforceable in phase 1 — the first needs the save gate — and it is tested
 * through the reducer, where it lives.
 */
import { describe, expect, it } from "vitest";
import { recalcDocument, reconcile, type ChargeRow, type Line } from "@/domain/pricing";
import {
  createDraftChargeRow,
  createDraftLine as createQuotationDraftLine,
  chargeRowFromMaster,
} from "@/features/sales/quotation/quotation.state";
import type { ChargeMasterRow } from "@/features/sales/quotation/quotation.types";
import { createOrderDraftLine } from "@/features/sales/sale-order/sale-order.state";
import { createBillDraftLine } from "@/features/sales/testbill/state/factories";
import {
  autoChargesSeeded,
  chargeAdded,
  customerApplied,
  draftReplaced,
  headerFieldSet,
  lineFieldSet,
  posSet,
  saleBillReducer,
  settlementSet,
  walkInCustomerSeeded,
  type SaleBillState,
} from "@/features/sales/testbill/state/draft";
import { createBillDraft } from "@/features/sales/testbill/state/factories";
import type { CustomerDetailPayload } from "@/features/sales/quotation/quotation.types";

// ---------------------------------------------------------------------------
// The golden document
// ---------------------------------------------------------------------------

/**
 * One cart, described once, in the engine's own vocabulary. Three lines chosen
 * to exercise the parts of the pipeline that most easily drift apart:
 *
 *  - a plain taxed line with a percentage discount;
 *  - a TAX-INCLUSIVE line, so the rate has to be un-taxed before anything else;
 *  - a line carrying cess per unit AND a per-quantity discount.
 */
const CART: ReadonlyArray<Partial<Line>> = [
  {
    itemId: "plank",
    billQty: 7,
    rate: 249.5,
    discPerc: 12.5,
    gstPerc: 18,
    cgstPerc: 9,
    sgstPerc: 9,
    igstPerc: 18,
    mrp: 320,
    minPrice: 180,
    actualPrice: 260,
    costPrice: 150,
    costBeforeTax: 127.12,
    weight: 3.4,
  },
  {
    itemId: "veneer",
    billQty: 3,
    caseQty: 2,
    toBaseFactor: 12,
    rate: 1180,
    isInclusiveTax: true,
    splDiscPerQty: 25,
    gstPerc: 18,
    cgstPerc: 9,
    sgstPerc: 9,
    igstPerc: 18,
    mrp: 1400,
    actualPrice: 1180,
    costPrice: 800,
    costBeforeTax: 677.97,
    weight: 1.2,
  },
  {
    itemId: "polish",
    billQty: 11,
    rate: 96,
    discPerQty: 4,
    schPerc: 2,
    gstPerc: 28,
    cgstPerc: 14,
    sgstPerc: 14,
    igstPerc: 28,
    cessPerc: 12,
    cessPerUnit: 1.5,
    mrp: 130,
    actualPrice: 99,
    costPrice: 61,
    costBeforeTax: 47.66,
    weight: 0.8,
  },
];

/** A freight charge spread by value, and an after-tax handling charge of its own. */
const CHARGES: ReadonlyArray<Partial<ChargeRow>> = [
  {
    key: "c-freight",
    chgId: "chg-freight",
    role: "FREIGHT",
    method: "FIXED",
    type: "ADD",
    applyOn: "VALUE",
    beforeTax: true,
    rate: 450,
  },
  {
    key: "c-handling",
    chgId: "chg-handling",
    role: "OTHERS",
    method: "PERCENT",
    type: "ADD",
    applyOn: "VALUE",
    taxApl: true,
    rate: 1.5,
    taxPerc: 18,
    cgstPerc: 9,
    sgstPerc: 9,
    igstPerc: 18,
  },
];

const POLICY = {
  freightCalcType: "manual",
  loadingCalcType: "manual",
  discountAlterBaseRate: false,
  roundOffStep: 1,
};

const FLAGS = { isLocalSale: true, hasFreight: false, hasLoad: false, hasUnload: false };

function chargesFor(): ChargeRow[] {
  return CHARGES.map((row) => ({ ...createDraftChargeRow(), ...row }) as ChargeRow);
}

describe("the golden document — one cart, three screens, one answer", () => {
  const asQuotation = recalcDocument(
    CART.map((line) => createQuotationDraftLine(line)),
    chargesFor(),
    POLICY,
    FLAGS,
  );
  const asOrder = recalcDocument(
    CART.map((line) => createOrderDraftLine(line)),
    chargesFor(),
    POLICY,
    FLAGS,
  );
  const asBill = recalcDocument(
    CART.map((line) => createBillDraftLine(line)),
    chargesFor(),
    POLICY,
    FLAGS,
  );

  it("prices the same cart identically as a quotation, an order and a bill", () => {
    // Deep equality on the WHOLE totals object, not just the bill amount: a
    // divergence in the taxable base or the tax split is just as wrong as one in
    // the total, and far easier to ship unnoticed.
    expect(asBill.totals).toEqual(asQuotation.totals);
    expect(asBill.totals).toEqual(asOrder.totals);
  });

  it("prices every LINE identically, field for field", () => {
    // The bill's draft line carries fields the quotation's does not (the batch
    // allocation, the source trail). None of them may be engine-visible — this
    // is what fails if one ever becomes so.
    //
    // `key` is excluded because it is the one field that is SUPPOSED to differ:
    // a client-side row id, minted per row so the grid, the focus tracking and
    // the reducer can address rows without using an index.
    //
    // Iterated over the QUOTATION line's runtime keys, which are a subset of the
    // bill line's — the engine spreads the whole draft line into its output, so
    // these objects carry more than `PricedLine` declares, and the comparison is
    // by runtime key rather than by the static type.
    for (const [index, priced] of asBill.lines.entries()) {
      const billRow = priced as unknown as Record<string, unknown>;
      const quoteRow = asQuotation.lines[index] as unknown as Record<string, unknown>;
      for (const field of Object.keys(quoteRow)) {
        if (field === "key") {
          continue;
        }
        expect({ [field]: billRow[field] }).toEqual({ [field]: quoteRow[field] });
      }
    }
  });

  it("reconciles: what the lines add up to is what the tax summary adds up to", () => {
    // `amount + freeScheme === docTaxable + docTax + afterTaxNonTaxable`. An
    // after-tax taxable charge reaches the bill through its line shares and its
    // tax through `chargeOwnTax`, so counting its amount twice is the classic
    // way to break this.
    const { fromLines, fromTaxSummary } = reconcile(asBill.totals);
    expect(fromLines).toBe(fromTaxSummary);
  });

  it("actually exercises discounts, inclusive tax, cess and both charge kinds", () => {
    // A golden test that silently priced nothing would pass forever. These are
    // the guards on the FIXTURE, not on the engine.
    expect(asBill.totals.itemDisc).toBeGreaterThan(0);
    expect(asBill.totals.splDisc).toBeGreaterThan(0);
    expect(asBill.totals.schDisc).toBeGreaterThan(0);
    expect(asBill.totals.docCess).toBeGreaterThan(0);
    expect(asBill.totals.freightAmt).toBeGreaterThan(0);
    expect(asBill.totals.chargeOwnTax).toBeGreaterThan(0);
    expect(asBill.totals.bill).toBeGreaterThan(0);
  });

  it("splits GST locally and switches the whole document to IGST across a state line", () => {
    const interState = recalcDocument(
      CART.map((line) => createBillDraftLine(line)),
      chargesFor(),
      POLICY,
      { ...FLAGS, isLocalSale: false },
    );
    expect(asBill.totals.docIgst).toBe(0);
    expect(asBill.totals.docCgst).toBeGreaterThan(0);
    expect(interState.totals.docCgst).toBe(0);
    expect(interState.totals.docSgst).toBe(0);
    expect(interState.totals.docIgst).toBeGreaterThan(0);

    // The taxable base is identical — the place of supply moves which HEADS the
    // tax sits under, never what is taxed.
    expect(interState.totals.docTaxable).toBe(asBill.totals.docTaxable);

    // The tax itself can differ by a paisa, and that is arithmetic rather than a
    // defect: a local sale rounds CGST and SGST separately (9% and 9%, each to
    // two places) while an inter-state one rounds IGST once (18%), so the two
    // halves can round up where the whole does not. This assertion pins the
    // tolerance deliberately — if it ever grows past a paisa, something has
    // changed in the engine and the golden totals above are no longer safe.
    // Compared in PAISE, as integers: the difference is a two-decimal money
    // figure, and asserting `<= 0.01` on IEEE doubles fails on 0.010000000000218.
    const paiseApart = Math.round(
      Math.abs(interState.totals.docTax - asBill.totals.docTax) * 100,
    );
    expect(paiseApart).toBeLessThanOrEqual(1);
    // The bill rounds to the whole rupee, so the paisa never reaches the customer.
    expect(interState.totals.bill).toBe(asBill.totals.bill);
  });
});

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

const CONTEXT = {
  companyId: "c1",
  branchId: "b1",
  accYear: "2026-2027",
  companyStateCode: "33",
  companyStateName: "Tamil Nadu",
  billDate: "2026-09-12",
};

function freshState(): SaleBillState {
  return saleBillReducer(undefined, draftReplaced(createBillDraft(CONTEXT)));
}

/**
 * One customer master answer, shared by every block below that needs one: the
 * lock, the walk-in seed and the replacement that follows it. Each overrides
 * only the fields its own case is about.
 */
const BASE_CUSTOMER_DETAIL = {
  cust_id: "cust-2",
  cust_name: "SECOND CUSTOMER",
  cust_address: null,
  cust_place: null,
  cust_ename: null,
  cust_eadd1: null,
  cust_eadd2: null,
  cust_eadd3: null,
  cust_pin: null,
  ecommerce_gstin: null,
  gst_no: null,
  gst_type: null,
  state_code: "33",
  state_name: "Tamil Nadu",
  area_id: "a1",
  area_name: null,
  distance_km: null,
  cust_phone1: null,
  debit_days: 0,
  debit_limit: 0,
  debit_allowed: false,
  freight_charge: false,
  cooly: false,
  unloading_charge: false,
  allow_promotion: false,
  allow_loyalty: false,
  allow_discount: true,
  overdue_billing: false,
  price_level: 1,
  cust_disc_perc: 0,
  salesman_id: null,
  salesman_name: null,
  tcs_company: false,
  tcs_customer: false,
  cust_pan: false,
  local_sales: true,
  cust_points: null,
  billed_date: null,
} satisfies CustomerDetailPayload;

const AUTO_CHARGE_MASTER = {
  chgId: "chg-1",
  chgName: "FREIGHT",
  chgCode: null,
  chgModule: "S",
  chgRole: "FREIGHT",
  chgMethod: "FIXED",
  chgType: "ADD",
  chgApplyOn: "VALUE",
  chgDefaultRate: 250,
  chgLandingCost: false,
  chgCostAlloc: null,
  chgLedgerCode: "led-1",
  chgLedgerName: "Freight Outward",
  ledHsnSac: null,
  ledGstRate: 18,
  ledTaxability: null,
  chgTaxApl: true,
  chgBeforeTax: false,
  chgSepPost: false,
  chgManParty: false,
  chgDispOrder: 1,
  chgAutoApply: true,
  chgIsActive: true,
} satisfies ChargeMasterRow;


describe("place of supply, and the flag the Qt screen leaves behind", () => {
  it("goes inter-state when the POS leaves the company's state", () => {
    const state = saleBillReducer(freshState(), posSet({ stateCode: "29", stateName: "Karnataka" }));
    expect(state.isLocalSale).toBe(false);
  });

  it("comes back to CGST+SGST on the next bill after an inter-state one", () => {
    // The Qt bug this must not reproduce: `ChargeGridController::clear()` drops
    // the rows but KEEPS the inter-state flag, so a reset after an inter-state
    // bill left the next bill's own-GST charge rows on IGST — a tax head wrong
    // on a document that has already been handed to a customer.
    //
    // Here the flag is not stored on the rows at all: it is handed to
    // `recalcDocument` on every pass. This test prices a charge row through both
    // documents to prove it.
    const interState = saleBillReducer(
      freshState(),
      posSet({ stateCode: "29", stateName: "Karnataka" }),
    );
    const withCharge = saleBillReducer(
      interState,
      chargeAdded({
        ...createDraftChargeRow({ key: "c1" }),
        chgId: "chg-handling",
        ledgerCode: "led-1",
        method: "FIXED",
        applyOn: "FLAT",
        taxApl: true,
        rate: 1000,
        taxPerc: 18,
        cgstPerc: 9,
        sgstPerc: 9,
        igstPerc: 18,
      }),
    );
    const lined = {
      ...withCharge,
      lines: [createBillDraftLine({ itemId: "i1", billQty: 1, rate: 100, gstPerc: 18, cgstPerc: 9, sgstPerc: 9, igstPerc: 18 })],
    };

    // By id, not by index: the grids always keep a blank row waiting at the
    // bottom, and on a fresh document it is the row BEFORE the one just added.
    const handling = (rows: ReturnType<typeof recalcDocument>["charges"]) => {
      const row = rows.find((candidate) => candidate.chgId === "chg-handling");
      expect(row).toBeDefined();
      return row!;
    };

    const interStatePricing = recalcDocument(lined.lines, lined.charges, lined.policy, {
      isLocalSale: lined.isLocalSale,
      hasFreight: lined.header.hasFreight,
      hasLoad: lined.header.hasLoad,
      hasUnload: lined.header.hasUnload,
    });
    expect(handling(interStatePricing.charges).igstAmt).toBeGreaterThan(0);
    expect(handling(interStatePricing.charges).cgstAmt).toBe(0);

    // Now reset the screen, exactly as Clear does, and price the same charge.
    const next = saleBillReducer(lined, draftReplaced(createBillDraft(CONTEXT)));
    const nextWithCharge = {
      ...next,
      charges: lined.charges,
      lines: lined.lines,
    };
    const localPricing = recalcDocument(
      nextWithCharge.lines,
      nextWithCharge.charges,
      nextWithCharge.policy,
      {
        isLocalSale: nextWithCharge.isLocalSale,
        hasFreight: false,
        hasLoad: false,
        hasUnload: false,
      },
    );
    expect(handling(localPricing.charges).cgstAmt).toBeGreaterThan(0);
    expect(handling(localPricing.charges).sgstAmt).toBeGreaterThan(0);
    expect(handling(localPricing.charges).igstAmt).toBe(0);
  });
});

describe("the order-quantity cap (§7.3)", () => {
  it("refuses an edit to OrderQty on a line billed from an order", () => {
    // Unlike the negative-stock gate — a condition an operator may knowingly
    // accept — over-billing an order line is not something the counter may wave
    // through. A cap the operator can raise by hand is no cap at all.
    const state: SaleBillState = {
      ...freshState(),
      lines: [createBillDraftLine({ key: "L1", itemId: "i1", orderQty: 2, orderQtyLocked: true })],
    };
    const next = saleBillReducer(
      state,
      lineFieldSet({ key: "L1", field: "orderQty", value: 10 }),
    );
    expect(next.lines[0].orderQty).toBe(2);
  });

  it("lets a hand-keyed line set its own OrderQty — there is nothing to cap", () => {
    const state: SaleBillState = {
      ...freshState(),
      lines: [createBillDraftLine({ key: "L1", itemId: "i1", orderQty: 0 })],
    };
    const next = saleBillReducer(state, lineFieldSet({ key: "L1", field: "orderQty", value: 10 }));
    expect(next.lines[0].orderQty).toBe(10);
  });

  it("still lets the BILLED quantity be keyed on a capped line", () => {
    // The cap is on what was ordered, not on what is being billed now.
    const state: SaleBillState = {
      ...freshState(),
      lines: [createBillDraftLine({ key: "L1", itemId: "i1", orderQty: 2, orderQtyLocked: true })],
    };
    const next = saleBillReducer(state, lineFieldSet({ key: "L1", field: "billQty", value: 2 }));
    expect(next.lines[0].billQty).toBe(2);
  });
});

describe("the discount one-of-three rule", () => {
  it("clears the sibling inputs when a percentage is keyed", () => {
    const state: SaleBillState = {
      ...freshState(),
      lines: [createBillDraftLine({ key: "L1", itemId: "i1", discPerQty: 5, discAmt: 40 })],
    };
    const next = saleBillReducer(state, lineFieldSet({ key: "L1", field: "discPerc", value: 10 }));
    expect(next.lines[0].discPerc).toBe(10);
    expect(next.lines[0].discPerQty).toBe(0);
    expect(next.lines[0].discAmt).toBe(0);
  });

  it("clears nothing when a member is zeroed", () => {
    // "No percentage" is not a statement about the per-qty rate, and treating it
    // as one lets a stray 0 wipe the discount actually in force.
    const state: SaleBillState = {
      ...freshState(),
      lines: [createBillDraftLine({ key: "L1", itemId: "i1", discPerQty: 5 })],
    };
    const next = saleBillReducer(state, lineFieldSet({ key: "L1", field: "discPerc", value: 0 }));
    expect(next.lines[0].discPerQty).toBe(5);
  });
});

describe("the customer lock (§4.3)", () => {
  const detail = BASE_CUSTOMER_DETAIL;

  it("applies a customer freely while the bill has taken nothing", () => {
    const next = saleBillReducer(freshState(), customerApplied({ detail: detail, forceTerm: true }));
    expect(next.customer.custId).toBe("cust-2");
  });

  it("refuses to swap the customer under a settled bill", () => {
    // The screen has to ask FIRST. A reducer that quietly applied the change
    // would leave the operator learning about the loss afterwards, which is the
    // whole thing §4.3 is about.
    // Money on the ROWS, which is what the guard reads — the settlement strip is
    // only a display figure and a restored cart carries rows before anything has
    // recomputed it.
    const base = freshState();
    const settled: SaleBillState = {
      ...base,
      tenders: [
        {
          ...base.tenders[0],
          key: "t1",
          tdId: null,
          tenderId: "tnd-1",
          tenderTypeId: 1,
          typeCode: "CASH",
          tenderName: "Cash",
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
          allowChange: true,
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
        },
      ],
    };
    const next = saleBillReducer(settled, customerApplied({ detail: detail, forceTerm: true }));
    expect(next.customer.custId).toBeNull();
  });

  it("takes the customer's term: credit-allowed bills CREDIT, otherwise CASH", () => {
    const cash = saleBillReducer(freshState(), customerApplied({ detail: detail, forceTerm: true }));
    expect(cash.header.billType).toBe("CASH");
    const credit = saleBillReducer(
      freshState(),
      customerApplied({ detail: { ...detail, debit_allowed: true, debit_days: 30 }, forceTerm: true }),
    );
    expect(credit.header.billType).toBe("CREDIT");
    expect(credit.header.dueDays).toBe(30);
  });
});

describe("the walk-in customer a new bill opens on (§4.1)", () => {
  const walkIn = {
    ...BASE_CUSTOMER_DETAIL,
    cust_id: "cust-walkin",
    cust_name: "WALK IN CUSTOMER",
    cust_phone1: "0000000000",
  } satisfies CustomerDetailPayload;
  const real = {
    ...BASE_CUSTOMER_DETAIL,
    cust_id: "cust-7",
    cust_name: "REAL CUSTOMER",
    cust_phone1: "9876543210",
    debit_allowed: true,
    debit_days: 30,
    price_level: 2,
  } satisfies CustomerDetailPayload;

  it("seeds a bill that has only just been opened", () => {
    const next = saleBillReducer(freshState(), walkInCustomerSeeded(walkIn));
    expect(next.customer.custId).toBe("cust-walkin");
  });

  it("does not dirty the bill it seeded", () => {
    // The same rule as the auto-apply charges, and it matters for the same two
    // reasons: F7 must not prompt about work nobody did, and `autoChargesSeeded`
    // declines on a dirty draft — a dirtying seed would cost every bill its
    // standing charges.
    const next = saleBillReducer(freshState(), walkInCustomerSeeded(walkIn));
    expect(next.isDirty).toBe(false);
    const withCharges = saleBillReducer(
      next,
      autoChargesSeeded([AUTO_CHARGE_MASTER]),
    );
    expect(withCharges.charges.filter((row) => row.chgId)).toHaveLength(1);
  });

  it("never seeds over a customer somebody already chose", () => {
    const picked = saleBillReducer(freshState(), customerApplied({ detail: real, forceTerm: true }));
    const next = saleBillReducer(picked, walkInCustomerSeeded(walkIn));
    expect(next.customer.custId).toBe("cust-7");
  });

  it("never seeds onto a loaded bill", () => {
    const loaded: SaleBillState = {
      ...freshState(),
      docId: "sb-1",
      isNewEntry: false,
    };
    const next = saleBillReducer(loaded, walkInCustomerSeeded(walkIn));
    expect(next.customer.custId).toBeNull();
  });

  it("is replaced outright by the customer the operator then picks", () => {
    // The whole point of the default: it is where the bill starts, not what it
    // is stuck with. Everything the walk-in brought with it — the term, the
    // price level, the contact — has to follow the new party.
    const seeded = saleBillReducer(freshState(), walkInCustomerSeeded(walkIn));
    expect(seeded.header.contactPerson).toBe("WALK IN CUSTOMER");
    const next = saleBillReducer(seeded, customerApplied({ detail: real, forceTerm: true }));
    expect(next.customer.custId).toBe("cust-7");
    expect(next.customer.name).toBe("REAL CUSTOMER");
    expect(next.header.contactPerson).toBe("REAL CUSTOMER");
    expect(next.header.contactNo).toBe("9876543210");
    expect(next.header.priceLevel).toBe(2);
    expect(next.header.billType).toBe("CREDIT");
    expect(next.isDirty).toBe(true);
  });

  it("keeps a contact the operator keyed themselves", () => {
    // A contact that is only the outgoing customer's name echoed in belongs to
    // the party being replaced; one somebody typed is theirs and survives the
    // change.
    const seeded = saleBillReducer(freshState(), walkInCustomerSeeded(walkIn));
    const keyed = saleBillReducer(
      seeded,
      headerFieldSet({ field: "contactPerson", value: "SITE ENGINEER" }),
    );
    const next = saleBillReducer(keyed, customerApplied({ detail: real, forceTerm: true }));
    expect(next.header.contactPerson).toBe("SITE ENGINEER");
  });
});

describe("auto-apply charges (§6)", () => {
  const master = AUTO_CHARGE_MASTER;

  it("seeds a pristine new bill", () => {
    const next = saleBillReducer(freshState(), autoChargesSeeded([master]));
    expect(next.charges.filter((row) => row.chgId)).toHaveLength(1);
    expect(next.charges[0].rate).toBe(250);
  });

  it("does not dirty the bill it seeded", () => {
    // Seeding is the screen opening, not the operator typing. A bill dirtied
    // here would pop the discard guard on the very first F7.
    const next = saleBillReducer(freshState(), autoChargesSeeded([master]));
    expect(next.isDirty).toBe(false);
  });

  it("never seeds twice", () => {
    const once = saleBillReducer(freshState(), autoChargesSeeded([master]));
    const twice = saleBillReducer(once, autoChargesSeeded([master]));
    expect(twice.charges.filter((row) => row.chgId)).toHaveLength(1);
  });

  it("never seeds onto a loaded document — including one with no charges at all", () => {
    // The case that is easy to get wrong: a saved bill that legitimately has no
    // charge rows looks exactly like a blank one to a naive "is the grid empty?"
    // check, and gets the standing charges injected under the operator.
    const loaded: SaleBillState = {
      ...freshState(),
      docId: "sb-1",
      isNewEntry: false,
      charges: [],
    };
    const next = saleBillReducer(loaded, autoChargesSeeded([master]));
    expect(next.charges.filter((row) => row.chgId)).toHaveLength(0);
  });

  it("never seeds onto a bill the operator has already worked on", () => {
    // One draft, and the key taken from it: a key minted by a second
    // `freshState()` names no row in this one, so the edit would be a no-op and
    // the bill would still be pristine — the test would pass for the wrong
    // reason.
    const state = freshState();
    const worked = saleBillReducer(
      state,
      lineFieldSet({ key: state.lines[0].key, field: "billQty", value: 1 }),
    );
    expect(worked.isDirty).toBe(true);
    const next = saleBillReducer(worked, autoChargesSeeded([master]));
    expect(next.charges.filter((row) => row.chgId)).toHaveLength(0);
  });

  it("resolves before-tax over taxApl, which charge_master does not guard", () => {
    // `charge_master` has no CHECK against both being set and renders two
    // independent checkboxes, while the save rejects the combination with a 400.
    // Before-tax wins: a charge folded into the goods' taxable value is taxed at
    // the item's rate and cannot also carry its own GST.
    const row = chargeRowFromMaster({ ...master, chgBeforeTax: true, chgTaxApl: true });
    expect(row.beforeTax).toBe(true);
    expect(row.taxApl).toBe(false);
    expect(row.taxPerc).toBe(0);
  });
});

describe("the trailing blank row", () => {
  it("keeps one empty line and one empty charge row waiting", () => {
    const state = freshState();
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0].itemId).toBe("");
    expect(state.charges).toHaveLength(1);
  });

  it("opens the next row as soon as the last one names an item", () => {
    const state = freshState();
    const next = saleBillReducer(
      state,
      lineFieldSet({ key: state.lines[0].key, field: "itemId", value: "i1" }),
    );
    expect(next.lines).toHaveLength(2);
    expect(next.lines[1].itemId).toBe("");
  });

  it("does not let the blank row take a share of a lump-sum charge", () => {
    // `LineBasis.chargeable` is false for a row that names no item. Without it a
    // FLAT lump is divided by the blank row too, and every priced row above it
    // changes the instant the operator opens a new one.
    const lump: ChargeRow = {
      ...createDraftChargeRow({ key: "c1" }),
      chgId: "chg-1",
      method: "FIXED",
      applyOn: "FLAT",
      rate: 300,
    };
    const oneLine = recalcDocument(
      [createBillDraftLine({ itemId: "i1", billQty: 1, rate: 100 })],
      [lump],
      POLICY,
      FLAGS,
    );
    const oneLinePlusBlank = recalcDocument(
      [createBillDraftLine({ itemId: "i1", billQty: 1, rate: 100 }), createBillDraftLine()],
      [lump],
      POLICY,
      FLAGS,
    );
    expect(oneLinePlusBlank.totals.bill).toBe(oneLine.totals.bill);
    expect(oneLinePlusBlank.lines[0].chrgAfterTax).toBe(oneLine.lines[0].chrgAfterTax);
  });
});
